import * as loanRepository from '../repositories/loan.repository.js';
import * as loanService from '../services/loan.service.js';
import pool from '../db/index.js';

export const getAllLoans = async (req, res) => {
    try {
        const limitQuery = req.query.limit;
        const pageQuery = parseInt(req.query.page) || 1;
        const search = req.query.search || '';

        let limit = 20;
        let offset = (pageQuery - 1) * limit;

        if (limitQuery === 'all' || limitQuery === '0') {
            limit = null;
            offset = null;
        } else if (limitQuery) {
            limit = parseInt(limitQuery) || 20;
            offset = (pageQuery - 1) * limit;
        }

        const result = await loanRepository.findAll(search, limit, offset);
        
        res.json({
            data: result.data,
            total: result.total,
            page: pageQuery,
            totalPages: limit ? Math.ceil(result.total / limit) : 1
        });
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

export const updateLoanCard = async (req, res) => {
    try {
        const { id } = req.params;
        const { card_number } = req.body;
        const updated = await loanRepository.updateCard(id, card_number);
        if (!updated) {
            return res.status(404).json({ error: 'Loan not found' });
        }
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
