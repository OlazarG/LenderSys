import * as loanRepository from '../repositories/loan.repository.js';
import * as installmentRepository from '../repositories/installment.repository.js';

export const updateGlobalLoanStatus = async (client, loanId) => {
    const allInsts = await installmentRepository.findByLoanIdOrdered(client, loanId);
    const pending = allInsts.filter(i => i.status !== 'PAGADO');
    
    let loanStatus = 'ACTIVO';
    if (pending.length === 0) {
        loanStatus = 'FINALIZADO';
    } else {
        const today = new Date().toISOString().split('T')[0];
        const hasMora = pending.some(i => i.due_date < today);
        if (hasMora) loanStatus = 'MOROSO';
    }

    await loanRepository.updateStatus(client, loanId, loanStatus);
};

export const updateInstallmentStep = async (client, loanId, installmentId) => {
    console.log(`[ChainUpdate] Recalculating loan ${loanId} starting from ${installmentId}...`);
    const startTime = Date.now();

    const loan = await loanRepository.findById(client, loanId);
    const totalInstallments = loan?.total_installments || 0;
    
    const installments = await installmentRepository.findByLoanIdOrdered(client, loanId);
    const startIndex = 0; // Always recalculate from the beginning to maintain chain integrity
    

    await installmentRepository.clearCarriedOverAmounts(client, loanId, totalInstallments);

    let currentDebtForward = 0;
    let currentBalanceForward = 0;

    for (let i = startIndex; i < installments.length; i++) {
        const inst = installments[i];
        
        let arrivingDebt = 0;
        let arrivingBalance = 0;
        
        if (i > startIndex) {
            arrivingDebt = currentDebtForward;
            arrivingBalance = currentBalanceForward;
        }

        const originalAmount = parseFloat(inst.original_amount);
        const manualPayment = parseFloat(inst.direct_payment || 0);
        const totalDue = originalAmount + arrivingDebt;
        const availableMoney = manualPayment + arrivingBalance;
        
        let paidAmount = 0;
        let nextBalanceForward = 0;
        let nextDebtForward = 0;

        if (availableMoney >= totalDue) {
            paidAmount = totalDue;
            nextBalanceForward = availableMoney - totalDue;
        } else {
            paidAmount = availableMoney;
            nextDebtForward = totalDue - availableMoney;
        }

        if (nextBalanceForward < 1) nextBalanceForward = 0;
        if (nextDebtForward < 1) nextDebtForward = 0;

        const isFullyPaid = (totalDue > 0 && (totalDue - paidAmount) < 1) || (totalDue === 0 && availableMoney >= 1);
        const hasManualPayment = manualPayment > 0;
        
        const status = (hasManualPayment || isFullyPaid) ? 'PAGADO' : 'PENDIENTE';

        console.log(`[Cascade] #${inst.installment_number}: original=${originalAmount}, arriving=${arrivingDebt}, manualPay=${manualPayment}, totalDue=${totalDue}, availableM=${availableMoney}, nextDebt=${nextDebtForward}, status=${status}`);

        const surplusApplied = arrivingBalance > 0 ? arrivingBalance : 0;

        const actualNextDebt = status === 'PAGADO' ? nextDebtForward : 0;
        const actualNextBalance = status === 'PAGADO' ? nextBalanceForward : 0;

        await installmentRepository.updatePropagatedDebt(client, inst.id, arrivingDebt, surplusApplied, paidAmount, actualNextBalance, status);

        currentDebtForward = actualNextDebt;
        currentBalanceForward = actualNextBalance;
    }

    if (currentDebtForward > 0) {
        console.log(`[ChainUpdate] Residual debt of ${currentDebtForward} Gs detected. Cleaning old extended installments...`);
        await installmentRepository.deleteExtendedInstallments(client, loanId, totalInstallments);
        
        const frequency = loan?.frequency || 'MENSUAL';
        const lastRegularInstallment = installments.filter(i => i.installment_number <= totalInstallments).pop();
        if (!lastRegularInstallment) return console.log('[ChainUpdate] No regular installments found');
        
        let newDueDate = new Date(lastRegularInstallment.due_date);
        
        if (frequency === 'MENSUAL') {
            newDueDate.setMonth(newDueDate.getMonth() + 1);
        } else if (frequency === 'QUINCENAL') {
            newDueDate.setDate(newDueDate.getDate() + 15);
        } else if (frequency === 'SEMANAL') {
            newDueDate.setDate(newDueDate.getDate() + 7);
        }
        
        const nextInstallmentNumber = totalInstallments + 1;
        await installmentRepository.create(client, loanId, nextInstallmentNumber, newDueDate.toISOString(), 0, currentDebtForward);
        
        console.log(`[ChainUpdate] Extended installment created: #${nextInstallmentNumber} for ${currentDebtForward} Gs due ${newDueDate.toISOString()}`);
    }

    await updateGlobalLoanStatus(client, loanId);
    console.log(`[ChainUpdate] Completed in ${Date.now() - startTime}ms`);
};

export const processCascadingPayment = async (client, loanId, paymentAmount) => {
    const affectedInstallments = [];
    let remainingPayment = parseFloat(paymentAmount);
    
    if (isNaN(remainingPayment) || remainingPayment <= 0) {
        throw new Error('Monto de pago inválido');
    }
    
    const installments = await installmentRepository.findPendingOrPartialByLoanId(client, loanId);
    
    for (const inst of installments) {
        if (remainingPayment <= 0) break;
        
        const originalAmount = parseFloat(inst.original_amount);
        const paidAmount = parseFloat(inst.paid_amount || 0);
        const pendingBalance = originalAmount - paidAmount;
        
        if (pendingBalance <= 0) continue;
        
        let amountToApply = 0;
        let newStatus = inst.status;
        
        if (remainingPayment >= pendingBalance) {
            amountToApply = pendingBalance;
            newStatus = 'PAGADO';
        } else {
            amountToApply = remainingPayment;
            newStatus = 'PARCIAL';
        }
        
        const newPaidAmount = paidAmount + amountToApply;
        remainingPayment -= amountToApply;
        
        await installmentRepository.updatePaidAmountAndStatus(client, inst.id, newPaidAmount, newStatus);
        
        affectedInstallments.push({
            id: inst.id,
            installment_number: inst.installment_number,
            applied_amount: amountToApply,
            new_paid_amount: newPaidAmount,
            status: newStatus
        });
    }
    
    if (remainingPayment > 0) {
        await loanRepository.addSurplus(client, loanId, remainingPayment);
    }
    
    await updateGlobalLoanStatus(client, loanId);
    
    return {
        affectedInstallments,
        surplusApplied: remainingPayment > 0 ? remainingPayment : 0
    };
};
