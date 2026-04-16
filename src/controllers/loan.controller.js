import * as loanRepository from '../repositories/loan.repository.js';
import * as loanService from '../services/loan.service.js';
import pool from '../db/index.js';

export const getAllLoans = async (req, res) => {
    try {
        const loans = await loanRepository.findAll();
        res.json(loans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const createLoan = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const loan = await loanService.createLoanWithInstallments(client, req.body);
        await client.query('COMMIT');
        res.status(201).json(loan);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
