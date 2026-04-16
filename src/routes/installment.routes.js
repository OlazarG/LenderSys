import express from 'express';
import * as installmentController from '../controllers/installment.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.get('/installments', installmentController.getAllInstallments);
router.get('/installments/id/:id', installmentController.getInstallmentById);
router.put('/installments/:id', installmentController.updateInstallment);
router.post('/payments', installmentController.createPayment);

export default router;
