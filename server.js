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
        await runAccumulation();
        res.json({ message: 'Accumulation job triggered successfully' });
    } catch (error) {
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

// POST /api/payments (Registrar pago de cuota con arrastre)
app.post('/api/payments', async (req, res) => {
    const { installment_id, amount } = req.body;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const received = parseFloat(amount) || 0;
        
        // 1. Obtener la cuota actual
        const instRes = await client.query(`
            SELECT i.*, l.frequency 
            FROM installments i 
            JOIN loans l ON i.loan_id = l.id 
            WHERE i.id = $1
        `, [installment_id]);
        
        if (instRes.rows.length === 0) throw new Error('Installment not found');
        const inst = instRes.rows[0];
        const loan_id = inst.loan_id;
        const total_due = parseFloat(inst.total_due);
        const prev_paid = parseFloat(inst.paid_amount || 0);
        const debt_remaining = total_due - prev_paid;
        
        const diff = debt_remaining - received;
        
        if (diff > 0) {
            // Caso: Pagó MENOS de lo debido -> STATUS = PAGADO (porque la deuda salta a la sgte), paid_amount se suma
            await client.query("UPDATE installments SET status = 'PAGADO', paid_amount = $1 WHERE id = $2", [prev_paid + received, inst.id]);
            
            // Arrastrar a la siguiente
            const nextInstRes = await client.query(
                "SELECT * FROM installments WHERE loan_id = $1 AND installment_number = $2",
                [loan_id, inst.installment_number + 1]
            );
            
            if (nextInstRes.rows.length > 0) {
                await client.query(
                    "UPDATE installments SET carried_over_amount = carried_over_amount + $1 WHERE id = $2",
                    [diff, nextInstRes.rows[0].id]
                );
            } else {
                let nextDate = new Date(inst.due_date);
                if(inst.frequency === 'MENSUAL') nextDate.setMonth(nextDate.getMonth() + 1);
                else if (inst.frequency === 'QUINCENAL') nextDate.setDate(nextDate.getDate() + 15);
                else nextDate.setDate(nextDate.getDate() + 7);

                await client.query(
                    "INSERT INTO installments (loan_id, installment_number, due_date, original_amount, carried_over_amount) VALUES ($1, $2, $3, $4, $5)",
                    [loan_id, inst.installment_number + 1, nextDate.toISOString(), 0, diff]
                );
            }
        } else {
            // Pagó EXACTO o MÁS de lo debido (diff <= 0)
            let excess = Math.abs(diff);

            // La cuota actual queda PAGADA al 100%
            await client.query("UPDATE installments SET status = 'PAGADO', paid_amount = $1, overpaid_amount = $2 WHERE id = $3", [total_due, excess, inst.id]);
            
            if (excess > 0) {
                // Hay excedente, aplicarlo a las cuotas posteriores (Adelanto)
                const pendingRes = await client.query(
                    "SELECT * FROM installments WHERE loan_id = $1 AND status != 'PAGADO' AND installment_number > $2 ORDER BY installment_number ASC",
                    [loan_id, inst.installment_number]
                );
                
                for (let target of pendingRes.rows) {
                    if (excess <= 0) break;
                    
                    const target_due = parseFloat(target.total_due);
                    const target_paid = parseFloat(target.paid_amount || 0);
                    const target_remaining = target_due - target_paid;
                    
                    if (excess >= target_remaining) {
                        // Liquida esta cuota por completo
                        await client.query(
                            "UPDATE installments SET status = 'PAGADO', paid_amount = $1 WHERE id = $2",
                            [target_due, target.id]
                        );
                        excess -= target_remaining;
                    } else {
                        // Paga solo una parte de esta cuota, se mantiene PENDIENTE (Adelanto parcial)
                        await client.query(
                            "UPDATE installments SET paid_amount = paid_amount + $1 WHERE id = $2",
                            [excess, target.id]
                        );
                        excess = 0;
                    }
                }
                
                // Si sobra plata incluso después de liquidar todo, se asienta en la actual
                if (excess > 0) {
                     await client.query("UPDATE installments SET paid_amount = paid_amount + $1 WHERE id = $2", [excess, inst.id]);
                }
            }
        }
        
        // 4. Verificar si el préstamo se ha liquidado totalmente
        // Un préstamo se liquida si no hay cuotas PENDIENTES o ATRASADAS con saldo.
        const pendingRes = await client.query(`
            SELECT SUM(total_due - paid_amount) as total_remaining 
            FROM installments 
            WHERE loan_id = $1 AND status != 'PAGADO'
        `, [loan_id]);
        
        // También verificar si la última cuota (que acabamos de pagar) dejó deuda
        const hasMoreWork = diff > 0;
        
        if (!hasMoreWork) {
            // Si no hay nada que arrastrar, verificar si todas las cuotas estan pagas
            const allPaidRes = await client.query(
                "SELECT COUNT(*) FROM installments WHERE loan_id = $1 AND status != 'PAGADO'",
                [loan_id]
            );
            if (parseInt(allPaidRes.rows[0].count) === 0) {
                await client.query("UPDATE loans SET status = 'FINALIZADO' WHERE id = $1", [loan_id]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Pago procesado exitosamente' });
    } catch (err) {
        await client.query('ROLLBACK');
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
                (SELECT COALESCE(SUM(paid_amount + overpaid_amount), 0) FROM installments) as total_recuperado,
                (SELECT COALESCE(SUM(total_due - paid_amount), 0) FROM installments WHERE status = 'ATRASADO' OR (due_date < CURRENT_DATE AND status = 'PENDIENTE')) as total_mora
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
        const customer = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
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
            customer: customer.rows[0],
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
