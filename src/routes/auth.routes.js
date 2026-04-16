import express from 'express';
import * as authController from '../controllers/auth.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/login', authController.login);
router.post('/change-password', verifyToken, authController.changePassword);

export default router;
