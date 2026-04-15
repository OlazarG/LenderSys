import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import { startCronJob, runAccumulation } from './cron/accumulation.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'usurero_secret_key_123';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Servir frontend

// Iniciar Cron Job
startCronJob();

// Endpoint para probar el cron job manualmente (Para testing)
app.post('/api/trigger-accumulation', async (req, res) => {
    try {
        console.log('[Recalculate Global] Triggered manual global recalculation...');
        const { rows: loans } = await pool.query("SELECT id FROM loans WHERE status = 'ACTIVO' OR status = 'MOROSO'");
        
        for (const loan of loans) {
            const client = await pool.connect();
            try {
                // Obtenemos la primera cuota pendiente para refrescarla
                const firstRes = await client.query(
                    "SELECT id FROM installments WHERE loan_id = $1 AND status != 'PAGADO' ORDER BY installment_number ASC LIMIT 1",
                    [loan.id]
                );
                if (firstRes.rows.length > 0) {
                    await client.query('BEGIN');
                    await updateInstallmentStep(client, loan.id, firstRes.rows[0].id);
                    await client.query('COMMIT');
                }
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[Recalculate Global] Error on Loan ${loan.id}:`, err.message);
            } finally {
                client.release();
            }
        }
        res.json({ message: `Recalculated ${loans.length} active loans successfully.` });
    } catch (error) {
        console.error('[Recalculate Global] Fatal error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint de Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Middleware de Autenticación
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: 'No token provided' });
    
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'No token provided' });
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized' });
        req.userId = decoded.id;
        next();
    });
};

app.use('/api', (req, res, next) => {
    if (req.path === '/login' || req.path === '/trigger-accumulation') return next();
    verifyToken(req, res, next);
});

// Endpoint de Cambio de Contraseña
app.post('/api/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.userId;

    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = result.rows[0];
        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);

        res.json({ message: 'Contraseña actualizada exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/customers
app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM customers ORDER BY full_name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/customers
app.post('/api/customers', async (req, res) => {
    try {
        const { full_name, phone } = req.body;
        const result = await pool.query(
            'INSERT INTO customers (full_name, phone) VALUES ($1, $2) RETURNING *',
            [full_name, phone]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/customers/:id
app.put('/api/customers/:id', async (req, res) => {
    const { id } = req.params;
    const { full_name, phone } = req.body;
    try {
        const result = await pool.query(
            'UPDATE customers SET full_name = $1, phone = $2 WHERE id = $3 RETURNING *',
            [full_name, phone, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/customers/:id
app.delete('/api/customers/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
        res.json({ message: 'Client deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/loans
app.get('/api/loans', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM loans');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/loans
app.post('/api/loans', async (req, res) => {
     const client = await pool.connect();
     try {
         await client.query('BEGIN');
         const { customer_id, amount, interest_rate, frequency, total_installments, start_date } = req.body;
         
         const loanRes = await client.query(
             'INSERT INTO loans (customer_id, amount, interest_rate, frequency, total_installments) VALUES ($1, $2, $3, $4, $5) RETURNING *',
             [customer_id, amount, interest_rate, frequency, total_installments]
         );
         
         const loan = loanRes.rows[0];
         
         // Generar cuotas
         const parsedAmount = parseFloat(amount);
         const parsedInterestRate = parseFloat(interest_rate);
         const amountPlusInterest = parsedAmount + (parsedAmount * (parsedInterestRate / 100));
         const installmentAmount = amountPlusInterest / total_installments;
         
         let currentDate = new Date(start_date || new Date());
         
         for (let i = 1; i <= total_installments; i++) {
             // Adaptar frecuencia
             if(frequency === 'MENSUAL') {
                 currentDate.setMonth(currentDate.getMonth() + 1);
             } else if (frequency === 'QUINCENAL') {
                 currentDate.setDate(currentDate.getDate() + 15);
             } else if (frequency === 'SEMANAL') {
                 currentDate.setDate(currentDate.getDate() + 7);
             }

             await client.query(
                 'INSERT INTO installments (loan_id, installment_number, due_date, original_amount) VALUES ($1, $2, $3, $4)',
                 [loan.id, i, currentDate.toISOString(), installmentAmount]
             );
         }

         await client.query('COMMIT');
         res.status(201).json(loan);
     } catch (err) {
         await client.query('ROLLBACK');
         res.status(500).json({ error: err.message });
     } finally {
         client.release();
     }
});

// GET /api/installments (Listado para calendario y tablas)
app.get('/api/installments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                i.*, 
                l.amount as monto_prestamo, 
                l.frequency as frecuencia,
                c.id as customer_id,
                c.full_name as client_name
            FROM installments i
            JOIN loans l ON i.loan_id = l.id
            JOIN customers c ON l.customer_id = c.id
            ORDER BY i.due_date ASC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/installments/id/:id
app.get('/api/installments/id/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT 
                i.*, 
                c.full_name as client_name
            FROM installments i
            JOIN loans l ON i.loan_id = l.id
            JOIN customers c ON l.customer_id = c.id
            WHERE i.id = $1
        `, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Installment not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Función de actualización de cuota: Procesa cascada de pagos SIN crear nuevas cuotas
async function updateInstallmentStep(client, loanId, installmentId) {
    console.log(`[ChainUpdate] Recalculating loan ${loanId} starting from ${installmentId}...`);
    const startTime = Date.now();

    // 0. Obtener total_installments del préstamo para identificar cuotas extendidas
    const loanRes = await client.query("SELECT total_installments FROM loans WHERE id = $1", [loanId]);
    const totalInstallments = loanRes.rows[0]?.total_installments || 0;
    
    // 1. Obtener todas las cuotas del préstamo ordenadas
    const instRes = await client.query(
        "SELECT * FROM installments WHERE loan_id = $1 ORDER BY installment_number ASC",
        [loanId]
    );
    const installments = instRes.rows;
    const startIndex = installments.findIndex(i => i.id === installmentId);
    
    if (startIndex === -1) return;

    // Resetear carried_over_amount a 0 para todas las cuotas regulares (no extendidas) antes de recalcular
    // Esto evita que valores antiguos se propaguen
    await client.query(
        "UPDATE installments SET carried_over_amount = 0 WHERE loan_id = $1 AND installment_number <= $2",
        [loanId, totalInstallments]
    );

    let currentDebtForward = 0;
    let currentBalanceForward = 0;

    // 2. Procesar en CASCADA desde la cuota afectada hasta el final
    for (let i = startIndex; i < installments.length; i++) {
        const inst = installments[i];
        
        // Determinar qué llega a esta cuota
        let arrivingDebt = 0;      // Deuda que viene de anterior
        let arrivingBalance = 0;   // Exceso que viene de anterior
        
        // NUNCA heredar de la primera cuota de la cascada - empieza limpia
        if (i > startIndex) {
            // Solo las SIGUIENTES heredan de la iteración anterior
            arrivingDebt = currentDebtForward;
            arrivingBalance = currentBalanceForward;
        }

        const originalAmount = parseFloat(inst.original_amount);
        const manualPayment = parseFloat(inst.direct_payment || 0);
        const totalDue = originalAmount + arrivingDebt;
        const availableMoney = manualPayment + arrivingBalance;
        
        let paidAmount = 0;
        let nextBalanceForward = 0;
        let nextDebtForward = 0;

        if (availableMoney >= totalDue) {
            // Pago completo: hay saldo para pasar a la siguiente
            paidAmount = totalDue;
            nextBalanceForward = availableMoney - totalDue;
        } else {
            // Pago incompleto: falta deuda para la siguiente
            paidAmount = availableMoney;
            nextDebtForward = totalDue - availableMoney;
        }

        // Umbral de 1 Gs para evitar decimales molestos o basura flotante
        if (nextBalanceForward < 1) nextBalanceForward = 0;
        if (nextDebtForward < 1) nextDebtForward = 0;

        const isPaid = (totalDue > 0 && (totalDue - paidAmount) < 1) || (totalDue === 0 && availableMoney >= 1);
        const status = isPaid ? 'PAGADO' : 'PENDIENTE';

        // LOG: Ver qué está pasando
        console.log(`[Cascade] #${inst.installment_number}: original=${originalAmount}, arriving=${arrivingDebt}, manualPay=${manualPayment}, totalDue=${totalDue}, availableM=${availableMoney}, nextDebt=${nextDebtForward}, status=${status}`);

        // IMPORTANTE: Solo propagar deuda HEREDADA, no deuda original no pagada
        // Si esta cuota NO heredó deuda (arrivingDebt=0) pero no pagó su original,
        // eso NO se propaga - cada cuota es responsable de su deuda original
        const propagatedDebt = arrivingDebt > 0 ? nextDebtForward : 0;

        // Guardar lo que ESTA CUOTA PROPAGA a la siguiente
        await client.query(`
            UPDATE installments 
            SET carried_over_amount = $1,
                paid_amount = $2,
                overpaid_amount = $3,
                status = $4
            WHERE id = $5
        `, [propagatedDebt, paidAmount, nextBalanceForward, status, inst.id]);

        // Guardar para la siguiente iteración
        currentDebtForward = propagatedDebt;
        currentBalanceForward = nextBalanceForward;
    }

    // 3. Si hay deuda residual en la última cuota, eliminar cuotas extendidas previas y crear una nueva
    if (currentDebtForward > 0) {
        console.log(`[ChainUpdate] Residual debt of ${currentDebtForward} Gs detected. Cleaning old extended installments...`);
        
        // Eliminar todas las cuotas extendidas previas (aquellas con installment_number > total_installments)
        await client.query(
            "DELETE FROM installments WHERE loan_id = $1 AND installment_number > $2",
            [loanId, totalInstallments]
        );
        console.log(`[ChainUpdate] Old extended installments removed`);
        
        // Obtener información del préstamo para determinar la nueva frecuencia
        const updatedLoanRes = await client.query("SELECT frequency FROM loans WHERE id = $1", [loanId]);
        const frequency = updatedLoanRes.rows[0]?.frequency || 'MENSUAL';
        
        // Obtener la última cuota NON-EXTENDED para calcular la fecha de la nueva cuota
        const lastRegularInstallment = installments.filter(i => i.installment_number <= totalInstallments).pop();
        if (!lastRegularInstallment) return console.log('[ChainUpdate] No regular installments found');
        
        let newDueDate = new Date(lastRegularInstallment.due_date);
        
        // Agregar tiempo según la frecuencia
        if (frequency === 'MENSUAL') {
            newDueDate.setMonth(newDueDate.getMonth() + 1);
        } else if (frequency === 'QUINCENAL') {
            newDueDate.setDate(newDueDate.getDate() + 15);
        } else if (frequency === 'SEMANAL') {
            newDueDate.setDate(newDueDate.getDate() + 7);
        }
        
        const nextInstallmentNumber = totalInstallments + 1;
        
        // Crear la nueva cuota extendida
        await client.query(
            'INSERT INTO installments (loan_id, installment_number, due_date, original_amount, carried_over_amount) VALUES ($1, $2, $3, $4, $5)',
            [loanId, nextInstallmentNumber, newDueDate.toISOString(), 0, currentDebtForward]
        );
        
        console.log(`[ChainUpdate] Extended installment created: #${nextInstallmentNumber} for ${currentDebtForward} Gs due ${newDueDate.toISOString()}`);
    }

    // 4. Actualizar Estado Global del Préstamo (FINALIZADO / MOROSO / ACTIVO)
    const allInstsRes = await client.query("SELECT status, due_date FROM installments WHERE loan_id = $1", [loanId]);
    const allInsts = allInstsRes.rows;
    
    const pending = allInsts.filter(i => i.status !== 'PAGADO');
    
    let loanStatus = 'ACTIVO';
    if (pending.length === 0) {
        loanStatus = 'FINALIZADO';
    } else {
        const today = new Date().toISOString().split('T')[0];
        const hasMora = pending.some(i => i.due_date < today);
        if (hasMora) loanStatus = 'MOROSO';
    }

    await client.query("UPDATE loans SET status = $1 WHERE id = $2", [loanStatus, loanId]);

    console.log(`[ChainUpdate] Completed in ${Date.now() - startTime}ms`);
}



// PUT /api/installments/:id (Corregir/editar pago de cuota)
// Recibe: { paid_amount: number, due_date?: string }
// paid_amount REEMPLAZA el direct_payment actual (es una corrección, no un agregado)
app.put('/api/installments/:id', async (req, res) => {
    const { id } = req.params;
    const { paid_amount, due_date } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Verificar que la cuota existe y obtener loan_id
        const instRes = await client.query(
            'SELECT id, loan_id FROM installments WHERE id = $1',
            [id]
        );
        if (instRes.rows.length === 0) throw new Error('Cuota no encontrada');
        const loan_id = instRes.rows[0].loan_id;

        // Construir update dinámico según qué campos vienen en el body
        const updates = [];
        const values = [];
        let idx = 1;

        if (paid_amount !== undefined && paid_amount !== null) {
            updates.push(`direct_payment = $${idx++}`);
            values.push(parseFloat(paid_amount) || 0);
        }
        if (due_date !== undefined && due_date !== null) {
            updates.push(`due_date = $${idx++}`);
            values.push(due_date);
        }

        if (updates.length === 0) throw new Error('No hay campos válidos para actualizar');

        values.push(id);
        await client.query(
            `UPDATE installments SET ${updates.join(', ')} WHERE id = $${idx}`,
            values
        );

        // Recalcular estado de esta cuota y la siguiente
        await updateInstallmentStep(client, loan_id, id);

        await client.query('COMMIT');
        res.json({ message: 'Cuota corregida exitosamente' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[PUT /installments] Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// POST /api/payments (Registrar pago de cuota — ACUMULA al pago existente)
// Recibe: { installment_id: string, amount: number }
app.post('/api/payments', async (req, res) => {
    const { installment_id, amount } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const received = parseFloat(amount) || 0;

        if (received <= 0) throw new Error('El monto del pago debe ser mayor a cero');

        const instRes = await client.query(
            'SELECT loan_id FROM installments WHERE id = $1',
            [installment_id]
        );
        if (instRes.rows.length === 0) throw new Error('Cuota no encontrada');
        const loan_id = instRes.rows[0].loan_id;

        // ACUMULAR: sumar al pago ya registrado
        await client.query(
            'UPDATE installments SET direct_payment = direct_payment + $1 WHERE id = $2',
            [received, installment_id]
        );

        await updateInstallmentStep(client, loan_id, installment_id);

        await client.query('COMMIT');
        res.json({ message: 'Pago registrado exitosamente' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[POST /payments] Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});


// GET /api/dashboard (Estadísticas)
app.get('/api/dashboard', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COALESCE(SUM(amount), 0) as total_prestado,
                COALESCE(SUM(amount * (interest_rate / 100)), 0) as total_intereses,
                (SELECT COALESCE(SUM(COALESCE(paid_amount, 0) + COALESCE(overpaid_amount, 0)), 0) FROM installments) as total_recuperado,
                (SELECT COALESCE(SUM(total_due - paid_amount), 0) FROM installments WHERE (status = 'ATRASADO' OR (due_date < CURRENT_DATE AND status = 'PENDIENTE')) AND (total_due - paid_amount) >= 1) as total_mora,
                (SELECT COALESCE(SUM(original_amount) - SUM(paid_amount), 0) FROM installments) as total_a_recuperar
            FROM loans
        `);
        res.json(stats.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/debts (Vista de deudas actuales por cliente)
app.get('/api/debts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM current_debts');
        res.json(result.rows);
    } catch (err) {
         res.status(500).json({ error: err.message });
    }
});

// GET /api/customers/:id/expediente
app.get('/api/customers/:id/expediente', async (req, res) => {
    const { id } = req.params;
    try {
        const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
        if (customerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        const customer = customerResult.rows[0];

        const loans = await pool.query(`
            SELECT l.*, 
                (SELECT COUNT(*) FROM installments i WHERE i.loan_id = l.id AND i.paid_amount < i.total_due AND i.status = 'PAGADO') as partial_payments_count
            FROM loans l 
            WHERE customer_id = $1 
            ORDER BY created_at DESC
        `, [id]);
        
        const installments = await pool.query(`
            SELECT i.* 
            FROM installments i
            JOIN loans l ON i.loan_id = l.id
            WHERE l.customer_id = $1
            ORDER BY i.due_date ASC
        `, [id]);

        // Determinar morosidad en el expediente (si tiene algún préstamo con > 3 pagos parciales)
        const is_moroso = loans.rows.some(l => parseInt(l.partial_payments_count) >= 3);

        res.json({
            customer: customer,
            loans: loans.rows,
            installments: installments.rows,
            is_moroso
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/export/:type
app.get('/api/export/:type', async (req, res) => {
    const { type } = req.params;
    try {
        let result;
        if (type === 'clientes') {
            result = await pool.query('SELECT * FROM customers');
        } else if (type === 'prestamos') {
            result = await pool.query('SELECT * FROM loans');
        } else {
            return res.status(400).json({ error: 'Invalid export type' });
        }
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Auto-migración al arrancar: garantiza que las columnas nuevas existan
async function runMigrations() {
    try {
        await pool.query("ALTER TABLE installments ADD COLUMN IF NOT EXISTS surplus_applied DECIMAL(12,2) DEFAULT 0.00;");
        await pool.query("ALTER TABLE installments ADD COLUMN IF NOT EXISTS overpaid_amount DECIMAL(12,2) DEFAULT 0.00;");
        await pool.query("ALTER TABLE installments ADD COLUMN IF NOT EXISTS direct_payment DECIMAL(12,2) DEFAULT 0.00;");
        
        // Inicializar direct_payment con los pagos manuales existentes contemplando excedentes
        await pool.query("UPDATE installments SET direct_payment = (COALESCE(paid_amount, 0) - COALESCE(surplus_applied, 0) + COALESCE(overpaid_amount, 0)) WHERE direct_payment = 0;");

        console.log('[Migration] Columns OK');
    } catch (err) {
        console.error('[Migration] Error:', err.message);
    }
}

runMigrations().then(() => {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
});
