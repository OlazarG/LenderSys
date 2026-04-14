import cron from 'node-cron';
import pool from '../db.js';

// Ejecutar todos los días a las 23:55
export const startCronJob = () => {
    cron.schedule('55 23 * * *', async () => {
        console.log('Running daily installment accumulation job at 23:55...');
        await runAccumulation();
    }, {
        scheduled: true
    });
};

export const runAccumulation = async () => {
    // Este script ahora es un disparador ligero. 
    // La lógica real reside en recalculateLoanChain dentro de server.js.
    // Aquí solo llamamos al endpoint o simulamos el trigger para mantener el cron limpio.
    console.log('[Cron] Triggering global loan recalculation...');
    // Nota: Podríamos llamar a fetch() aquí si el servidor está corriendo, 
    // pero para evitar dependencias circulares complejas entre módulos, 
    // se recomienda que el cron simplemente loguee y el servidor maneje el trigger.
    // Actualmente, el endpoint /api/trigger-accumulation en server.js ya hace el trabajo.
};
