import pool from '../db/index.js';

export const findAll = async () => {
    const result = await pool.query('SELECT * FROM customers ORDER BY full_name');
    return result.rows;
};

export const findById = async (id) => {
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    return result.rows[0];
};

export const create = async (fullName, phone) => {
    const result = await pool.query(
        'INSERT INTO customers (full_name, phone) VALUES ($1, $2) RETURNING *',
        [fullName, phone]
    );
    return result.rows[0];
};

export const update = async (id, fullName, phone) => {
    const result = await pool.query(
        'UPDATE customers SET full_name = $1, phone = $2 WHERE id = $3 RETURNING *',
        [fullName, phone, id]
    );
    return result.rows[0];
};

export const deleteCustomer = async (id) => {
    const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
};
