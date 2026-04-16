import pool from '../db/index.js';
import * as loanRepository from '../repositories/loan.repository.js';
import { runAccumulation } from '../cron/accumulation.js';

export const getDashboardStats = async (req, res) => {
    try {
        const stats = await loanRepository.getGlobalStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getDebts = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM current_debts');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const triggerAccumulation = async (req, res) => {
    try {
        await runAccumulation();
        res.json({ message: 'Trigger manual de acumulación disparado y completado.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getTodayExpectedBox = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Obtener cuotas para hoy (no pagadas ni transferidas)
        const todayResult = await pool.query(`
            SELECT 
                SUM(total_due) as total_hoy,
                COUNT(*) as count_hoy
            FROM installments 
            WHERE due_date = $1 
            AND status NOT IN ('PAGADO', 'TRANSFERIDO')
        `, [today]);
        
        // Obtener recuento de cuotas pendientes (después de hoy)
        const pendingResult = await pool.query(`
            SELECT COUNT(*) as count_pending
            FROM installments 
            WHERE due_date > $1 
            AND status NOT IN ('PAGADO', 'TRANSFERIDO')
        `, [today]);
        
        // Obtener recuento de cuotas vencidas (antes de hoy)
        const lateResult = await pool.query(`
            SELECT COUNT(*) as count_late
            FROM installments 
            WHERE due_date < $1 
            AND status NOT IN ('PAGADO', 'TRANSFERIDO')
        `, [today]);
        
        const todayData = todayResult.rows[0];
        const pendingData = pendingResult.rows[0];
        const lateData = lateResult.rows[0];
        
        res.json({
            today_amount: parseFloat(todayData.total_hoy || 0),
            today_count: parseInt(todayData.count_hoy || 0),
            pending_count: parseInt(pendingData.count_pending || 0),
            late_count: parseInt(lateData.count_late || 0)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const exportData = async (req, res) => {
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
};
