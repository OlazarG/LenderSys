import pool from '../db/index.js';

export const findAll = async (search = '', limit = null, offset = null) => {
    let query = 'SELECT * FROM customers';
    let countQuery = 'SELECT COUNT(*) FROM customers';
    const params = [];
    
    if (search) {
        query += ' WHERE full_name ILIKE $1';
        countQuery += ' WHERE full_name ILIKE $1';
        params.push(`%${search}%`);
    }

    query += ' ORDER BY full_name';

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
        pool.query(countQuery, search ? [`%${search}%`] : [])
    ]);

    return {
        data: dataResult.rows,
        total: parseInt(countResult.rows[0].count, 10)
    };
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
