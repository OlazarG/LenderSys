import pool from '../db/index.js';

export const findAll = async () => {
    const result = await pool.query('SELECT * FROM loans');
    return result.rows;
};

export const findById = async (client, id) => {
    const result = await client.query('SELECT * FROM loans WHERE id = $1', [id]);
    return result.rows[0];
};

export const findByCustomerId = async (customerId) => {
    const result = await pool.query(`
        SELECT l.*, 
            (SELECT COUNT(*) FROM installments i WHERE i.loan_id = l.id AND i.paid_amount < i.total_due AND i.status = 'PAGADO') as partial_payments_count
        FROM loans l 
        WHERE customer_id = $1 
        ORDER BY created_at DESC
    `, [customerId]);
    return result.rows;
};

export const getActiveOrMoroso = async () => {
    const { rows } = await pool.query("SELECT id FROM loans WHERE status = 'ACTIVO' OR status = 'MOROSO'");
    return rows;
};

export const create = async (client, data) => {
    const { customer_id, amount, interest_rate, frequency, total_installments } = data;
    const loanRes = await client.query(
        'INSERT INTO loans (customer_id, amount, interest_rate, frequency, total_installments) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [customer_id, amount, interest_rate, frequency, total_installments]
    );
    return loanRes.rows[0];
};

export const updateStatus = async (client, id, status) => {
    await client.query("UPDATE loans SET status = $1 WHERE id = $2", [status, id]);
};

export const addSurplus = async (client, id, amount) => {
    await client.query("UPDATE loans SET surplus_balance = COALESCE(surplus_balance, 0) + $1 WHERE id = $2", [amount, id]);
};

export const getGlobalStats = async () => {
    const stats = await pool.query(`
        SELECT 
            COALESCE(SUM(amount), 0) as total_prestado,
            COALESCE(SUM(amount * (interest_rate / 100)), 0) as total_intereses,
            (SELECT COALESCE(SUM(COALESCE(paid_amount, 0) + COALESCE(overpaid_amount, 0)), 0) FROM installments) as total_recuperado,
            (SELECT COALESCE(SUM(total_due - paid_amount), 0) FROM installments WHERE (status = 'ATRASADO' OR (due_date < CURRENT_DATE AND status = 'PENDIENTE')) AND (total_due - paid_amount) >= 1) as total_mora,
            (SELECT COALESCE(SUM(original_amount) - SUM(paid_amount), 0) FROM installments) as total_a_recuperar
        FROM loans
    `);
    return stats.rows[0];
};
