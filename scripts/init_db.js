import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDB() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf-8');
    await pool.query(sql);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database', err);
  } finally {
    pool.end();
  }
}

initDB();
