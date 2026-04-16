import express from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/trigger-accumulation', dashboardController.triggerAccumulation);

router.use(verifyToken);
router.get('/dashboard', dashboardController.getDashboardStats);
router.get('/debts', dashboardController.getDebts);
router.get('/export/:type', dashboardController.exportData);

export default router;
