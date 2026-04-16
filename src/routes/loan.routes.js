import express from 'express';
import * as loanController from '../controllers/loan.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.get('/', loanController.getAllLoans);
router.post('/', loanController.createLoan);

export default router;
