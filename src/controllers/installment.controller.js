import * as installmentRepository from '../repositories/installment.repository.js';
import * as installmentService from '../services/installment.service.js';
import pool from '../db/index.js';

export const getAllInstallments = async (req, res) => {
    try {
        const installments = await installmentRepository.findAllWithDetails();
        res.json(installments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getInstallmentById = async (req, res) => {
    const { id } = req.params;
    try {
        const installment = await installmentRepository.findByIdWithDetails(id);
        if (!installment) return res.status(404).json({ error: 'Installment not found' });
        res.json(installment);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updateInstallment = async (req, res) => {
    const { id } = req.params;
    const { paid_amount, due_date } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        
        const instRes = await installmentRepository.findByIdForTx(client, id);
        if (!instRes) throw new Error('Cuota no encontrada');
        
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
        await installmentRepository.executeDynamicUpdate(client, id, updates, values);

        await installmentService.updateInstallmentStep(client, instRes.loan_id, id);

        await client.query('COMMIT');
        res.json({ message: 'Cuota corregida exitosamente' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[PUT /installments] Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

export const createPayment = async (req, res) => {
    const { installment_id, amount } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const received = parseFloat(amount) || 0;

        if (received <= 0) throw new Error('El monto del pago debe ser mayor a cero');

        const instRes = await installmentRepository.findByIdForTx(client, installment_id);
        if (!instRes) throw new Error('Cuota no encontrada');
        
        await installmentRepository.accumulateDirectPayment(client, installment_id, received);
        await installmentService.updateInstallmentStep(client, instRes.loan_id, installment_id);

        await client.query('COMMIT');
        res.json({ message: 'Pago registrado exitosamente' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[POST /payments] Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
