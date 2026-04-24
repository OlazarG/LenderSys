import pool from '../db/index.js';

export const findAllWithDetails = async () => {
    const result = await pool.query(`
        SELECT 
            i.*, 
            l.amount as monto_prestamo, 
            l.frequency as frecuencia,
            c.id as customer_id,
            c.full_name as client_name
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id
        ORDER BY i.due_date ASC
    `);
    return result.rows;
};

export const findByIdWithDetails = async (id) => {
    const result = await pool.query(`
        SELECT 
            i.*, 
            c.full_name as client_name
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id
        WHERE i.id = $1
    `, [id]);
    return result.rows[0];
};

export const findByIdForTx = async (client, id) => {
    const result = await client.query('SELECT id, loan_id FROM installments WHERE id = $1', [id]);
    return result.rows[0];
};

export const findByLoanIdOrdered = async (client, loanId) => {
    const result = await client.query(
        "SELECT * FROM installments WHERE loan_id = $1 ORDER BY installment_number ASC",
        [loanId]
    );
    return result.rows;
};

export const findPendingOrPartialByLoanId = async (client, loanId) => {
    const result = await client.query(
        "SELECT * FROM installments WHERE loan_id = $1 AND status IN ('PENDIENTE', 'PARCIAL') ORDER BY due_date ASC",
        [loanId]
    );
    return result.rows;
};

export const getFirstPendingInstallment = async (client, loanId) => {
    const result = await client.query(
        "SELECT id FROM installments WHERE loan_id = $1 AND status != 'PAGADO' ORDER BY installment_number ASC LIMIT 1",
        [loanId]
    );
    return result.rows[0];
};

export const create = async (client, loanId, installmentNumber, dueDate, originalAmount, carriedOverAmount = 0) => {
    await client.query(
        'INSERT INTO installments (loan_id, installment_number, due_date, original_amount, carried_over_amount) VALUES ($1, $2, $3, $4, $5)',
        [loanId, installmentNumber, dueDate, originalAmount, carriedOverAmount]
    );
};

export const deleteExtendedInstallments = async (client, loanId, totalInstallments) => {
    await client.query(
        "DELETE FROM installments WHERE loan_id = $1 AND installment_number > $2",
        [loanId, totalInstallments]
    );
};

export const clearCarriedOverAmounts = async (client, loanId, limitNumber) => {
    await client.query(
        "UPDATE installments SET carried_over_amount = 0, surplus_applied = 0 WHERE loan_id = $1 AND installment_number <= $2",
        [loanId, limitNumber]
    );
};

export const updatePropagatedDebt = async (client, id, carriedOver, surplusApplied, paid, overpaid, status) => {
    const isPagado = status === 'PAGADO';
    await client.query(`
        UPDATE installments 
        SET carried_over_amount = $1,
            surplus_applied = $2,
            paid_amount = $3,
            overpaid_amount = $4,
            status = $5::installment_status,
            payment_date = CASE WHEN $7::boolean THEN CURRENT_DATE ELSE payment_date END
        WHERE id = $6
    `, [carriedOver, surplusApplied, paid, overpaid, status, id, isPagado]);
};

export const updatePaidAmountAndStatus = async (client, id, paidAmount, status) => {
    const isPagado = status === 'PAGADO';
    await client.query(
        "UPDATE installments SET paid_amount = $1, status = $2::installment_status, payment_date = CASE WHEN $4::boolean THEN CURRENT_DATE ELSE payment_date END WHERE id = $3",
        [paidAmount, status, id, isPagado]
    );
};

export const accumulateDirectPayment = async (client, id, amount) => {
    await client.query(
        'UPDATE installments SET direct_payment = direct_payment + $1 WHERE id = $2',
        [amount, id]
    );
};

export const executeDynamicUpdate = async (client, id, updates, values) => {
    await client.query(
        `UPDATE installments SET ${updates.join(', ')} WHERE id = $${values.length}`,
        values
    );
};
