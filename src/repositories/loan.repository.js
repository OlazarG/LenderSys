import pool from '../db/index.js';

export const findAll = async (search = '', limit = null, offset = null) => {
    let query = `
        SELECT loans.*, customers.full_name as client_name 
        FROM loans 
        JOIN customers ON loans.customer_id = customers.id
    `;
    let countQuery = `
        SELECT COUNT(*) 
        FROM loans 
        JOIN customers ON loans.customer_id = customers.id
    `;
    const params = [];
    let searchParams = [];
    
    if (search) {
        query += ' WHERE customers.full_name ILIKE $1 OR CAST(loans.id AS TEXT) ILIKE $1';
        countQuery += ' WHERE customers.full_name ILIKE $1 OR CAST(loans.id AS TEXT) ILIKE $1';
        params.push(`%${search}%`);
        searchParams.push(`%${search}%`);
    }

    query += ' ORDER BY loans.created_at DESC';

    if (limit !== null) {
        params.push(limit);
        query += ` LIMIT $${params.length}`;
        if (offset !== null) {
            params.push(offset);
            query += ` OFFSET $${params.length}`;
        }
    }

    const [dataResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, searchParams)
    ]);

    return {
        data: dataResult.rows,
        total: parseInt(countResult.rows[0].count, 10)
    };
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
    const { customer_id, amount, interest_rate, frequency, total_installments, card_number } = data;
    const loanRes = await client.query(
        'INSERT INTO loans (customer_id, amount, interest_rate, frequency, total_installments, card_number) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [customer_id, amount, interest_rate, frequency, total_installments, card_number || null]
    );
    return loanRes.rows[0];
};

export const updateCard = async (id, card_number) => {
    const result = await pool.query(
        "UPDATE loans SET card_number = $1 WHERE id = $2 RETURNING *",
        [card_number || null, id]
    );
    return result.rows[0];
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
