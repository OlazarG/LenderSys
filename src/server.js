import app from './app.js';
import pool from './db/index.js';
import { startCronJob } from './cron/accumulation.js';
import dotenv from 'dotenv';
dotenv.config();

const port = process.env.PORT || 3000;

// Auto-migración al arrancar
async function runMigrations() {
    try {
        await pool.query("ALTER TABLE installments ADD COLUMN IF NOT EXISTS surplus_applied DECIMAL(12,2) DEFAULT 0.00;");
        await pool.query("ALTER TABLE installments ADD COLUMN IF NOT EXISTS overpaid_amount DECIMAL(12,2) DEFAULT 0.00;");
        await pool.query("ALTER TABLE installments ADD COLUMN IF NOT EXISTS direct_payment DECIMAL(12,2) DEFAULT 0.00;");
        await pool.query("ALTER TABLE loans ADD COLUMN IF NOT EXISTS surplus_balance DECIMAL(12,2) DEFAULT 0.00;");
        
        // Inicializar direct_payment con los pagos manuales existentes contemplando excedentes
        await pool.query("UPDATE installments SET direct_payment = (COALESCE(paid_amount, 0) - COALESCE(surplus_applied, 0) + COALESCE(overpaid_amount, 0)) WHERE direct_payment = 0;");

        console.log('[Migration] Columns OK');
    } catch (err) {
        console.error('[Migration] Error:', err.message);
    }
}

runMigrations().then(() => {
    startCronJob();
    app.listen(port, () => {
        console.log(`Server running on port ${port} (SOLID Architecture)`);
    });
});
