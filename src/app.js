import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import loanRoutes from './routes/loan.routes.js';
import installmentRoutes from './routes/installment.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import reportRoutes from './routes/report.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Servir frontend

// Registrar rutas
app.use('/api', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api', installmentRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/reports', reportRoutes);

export default app;
