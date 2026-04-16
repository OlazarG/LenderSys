import * as loanRepository from '../repositories/loan.repository.js';
import * as installmentRepository from '../repositories/installment.repository.js';

export const createLoanWithInstallments = async (client, data) => {
    const loan = await loanRepository.create(client, data);
    const { amount, interest_rate, frequency, total_installments, start_date } = data;
    
    const parsedAmount = parseFloat(amount);
    const parsedInterestRate = parseFloat(interest_rate);
    const amountPlusInterest = parsedAmount + (parsedAmount * (parsedInterestRate / 100));
    const installmentAmount = amountPlusInterest / total_installments;
    
    let currentDate = new Date(start_date || new Date());
    
    for (let i = 1; i <= total_installments; i++) {
        if(frequency === 'MENSUAL') {
            currentDate.setMonth(currentDate.getMonth() + 1);
        } else if (frequency === 'QUINCENAL') {
            currentDate.setDate(currentDate.getDate() + 15);
        } else if (frequency === 'SEMANAL') {
            currentDate.setDate(currentDate.getDate() + 7);
        }

        await installmentRepository.create(client, loan.id, i, currentDate.toISOString(), installmentAmount);
    }
    return loan;
};
