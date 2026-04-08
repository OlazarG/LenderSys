import cron from 'node-cron';
import pool from '../db.js';

// Ejecutar todos los días a las 23:55
export const startCronJob = () => {
    cron.schedule('55 23 * * *', async () => {
        console.log('Running daily installment accumulation job at 23:55...');
        await runAccumulation();
    }, {
        scheduled: true
    });
};

export const runAccumulation = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Identificar cuotas de hoy pendientes
        const { rows: pendingToday } = await client.query(`
            SELECT id, loan_id, installment_number, total_due, due_date
            FROM installments 
            WHERE due_date <= CURRENT_DATE 
            AND status = 'PENDIENTE'
        `);

        if (pendingToday.length === 0) {
            console.log('No pending installments to accumulate.');
            await client.query('COMMIT');
            return;
        }

        console.log(`Found ${pendingToday.length} pending installments to process.`);

        for (const installment of pendingToday) {
            // 2. Buscar la siguiente cuota
            const nextInstallmentRes = await client.query(`
                SELECT id 
                FROM installments 
                WHERE loan_id = $1 AND installment_number = $2
            `, [installment.loan_id, installment.installment_number + 1]);

            if (nextInstallmentRes.rows.length > 0) {
                const nextInstallmentId = nextInstallmentRes.rows[0].id;
                
                // Mover saldo
                await client.query(`
                    UPDATE installments 
                    SET carried_over_amount = carried_over_amount + $1
                    WHERE id = $2
                `, [installment.total_due, nextInstallmentId]);

                // Marcar actual como 'TRANSFERIDO'
                await client.query(`
                    UPDATE installments 
                    SET status = 'TRANSFERIDO'
                    WHERE id = $1
                `, [installment.id]);
            } else {
                // Si no hay siguiente cuota (es la última), se marca como ATRASADO
                 await client.query(`
                    UPDATE installments 
                    SET status = 'ATRASADO'
                    WHERE id = $1
                `, [installment.id]);
                // También marcar el préstamo como MOROSO
                await client.query(`
                    UPDATE loans
                    SET status = 'MOROSO'
                    WHERE id = $1
                `, [installment.loan_id]);
            }
        }

        await client.query('COMMIT');
        console.log('Accumulation job completed successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error in accumulation job:', e);
    } finally {
        client.release();
    }
};
