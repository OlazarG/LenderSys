import * as reportRepository from '../repositories/report.repository.js';

export const getCardReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const data = await reportRepository.getCardCollectionsReport(startDate, endDate);
        
        let totalCards = 0;
        let totalAmount = 0;

        // Since one installment payment might represent one card use,
        // we can count total unique loans collected today, or total payments.
        // Usually, 1 installment = 1 card swipe.
        // If a client pays multiple installments on the same day, is it one swipe or multiple?
        // We'll calculate unique cards and total amount.
        const uniqueLoans = new Set();
        
        data.forEach(row => {
            uniqueLoans.add(row.loan_id);
            totalAmount += parseFloat(row.amount_collected || 0);
        });
        
        totalCards = uniqueLoans.size;

        res.json({
            summary: {
                totalCards,
                totalAmount
            },
            details: data
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
