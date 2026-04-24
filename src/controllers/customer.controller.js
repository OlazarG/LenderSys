import * as customerRepository from '../repositories/customer.repository.js';
import * as loanRepository from '../repositories/loan.repository.js';
import pool from '../db/index.js';

export const getAllCustomers = async (req, res) => {
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

        const result = await customerRepository.findAll(search, limit, offset);
        
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

export const createCustomer = async (req, res) => {
    try {
        const { full_name, phone } = req.body;
        const customer = await customerRepository.create(full_name, phone);
        res.status(201).json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updateCustomer = async (req, res) => {
    const { id } = req.params;
    const { full_name, phone } = req.body;
    try {
        const customer = await customerRepository.update(id, full_name, phone);
        if (!customer) return res.status(404).json({ error: 'Client not found' });
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteCustomer = async (req, res) => {
    const { id } = req.params;
    try {
        const customer = await customerRepository.deleteCustomer(id);
        if (!customer) return res.status(404).json({ error: 'Client not found' });
        res.json({ message: 'Client deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getExpediente = async (req, res) => {
    const { id } = req.params;
    try {
        const customer = await customerRepository.findById(id);
        if (!customer) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const loans = await loanRepository.findByCustomerId(id);
        
        const installmentsResult = await pool.query(`
            SELECT i.* 
            FROM installments i
            JOIN loans l ON i.loan_id = l.id
            WHERE l.customer_id = $1
            ORDER BY i.due_date ASC
        `, [id]);
        
        const is_moroso = loans.some(l => parseInt(l.partial_payments_count) >= 3);

        res.json({
            customer: customer,
            loans: loans,
            installments: installmentsResult.rows,
            is_moroso
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
