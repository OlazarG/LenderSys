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
