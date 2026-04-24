import express from 'express';
import * as reportController from '../controllers/report.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.get('/cards', reportController.getCardReport);

export default router;
