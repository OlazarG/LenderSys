import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/damian/Documentos/SistemasOlazar/UsureroSystem/.env' });

const pool = new pg.Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'usurero_db',
  password: process.env.DB_PASSWORD || 'Olasar123',
  port: process.env.DB_PORT || 5432,
});

async function run() {
  try {
    await pool.query('ALTER TABLE installments ADD COLUMN overpaid_amount DECIMAL(12,2) DEFAULT 0.00;');
    console.log("Migration successful.");
  } catch (err) {
    console.log("Migration error:", err.message);
  } finally {
    pool.end();
  }
}
run();
