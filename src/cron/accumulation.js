import cron from 'node-cron';
import pool from '../db/index.js';
import * as loanRepository from '../repositories/loan.repository.js';
import * as installmentService from '../services/installment.service.js';

export const startCronJob = () => {
    cron.schedule('55 23 * * *', async () => {
        console.log('Running daily installment accumulation job at 23:55...');
        await runAccumulation();
    }, {
        scheduled: true
    });
};

export const runAccumulation = async () => {
    console.log('[Cron] Automático: Triggering global loan recalculation...');
    try {
        const loans = await loanRepository.getActiveOrMoroso();
        for (const loan of loans) {
            const client = await pool.connect();
            try {
                const firstRes = await client.query(
                    "SELECT id FROM installments WHERE loan_id = $1 AND status != 'PAGADO' ORDER BY installment_number ASC LIMIT 1",
                    [loan.id]
                );
                if (firstRes.rows.length > 0) {
                    await client.query('BEGIN');
                    await installmentService.updateInstallmentStep(client, loan.id, firstRes.rows[0].id);
                    await client.query('COMMIT');
                }
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[Cron] Error on Loan ${loan.id}:`, err.message);
            } finally {
                client.release();
            }
        }
        console.log(`[Cron] Recalculated ${loans.length} active loans successfully.`);
    } catch (error) {
        console.error('[Cron] Fatal error:', error.message);
    }
};
