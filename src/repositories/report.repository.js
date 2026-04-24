import pool from '../db/index.js';

export const getCardCollectionsReport = async (startDate, endDate) => {
    // If dates are not provided, default to current date
    let dateFilterClause = '';
    const params = [];
    
    if (startDate && endDate) {
        dateFilterClause = 'AND i.payment_date::date BETWEEN $1 AND $2';
        params.push(startDate, endDate);
    } else if (startDate) {
        dateFilterClause = 'AND i.payment_date::date >= $1';
        params.push(startDate);
    } else {
        // default today
        dateFilterClause = 'AND i.payment_date::date = CURRENT_DATE';
    }

    const query = `
        SELECT 
            i.payment_date::date as collection_date,
            i.payment_date as timestamp,
            c.full_name as client_name,
            l.id as loan_id,
            l.card_number,
            i.installment_number,
            i.paid_amount + COALESCE(i.overpaid_amount, 0) as amount_collected
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id
        WHERE l.card_number IS NOT NULL 
          AND i.status = 'PAGADO' 
          AND i.payment_date IS NOT NULL
          ${dateFilterClause}
        ORDER BY i.payment_date DESC;
    `;

    const result = await pool.query(query, params);
    return result.rows;
};
