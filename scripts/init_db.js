import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import bcrypt from 'bcryptjs';

async function initDB() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf-8');
    await pool.query(sql);
    
    const userCount = await pool.query('SELECT count(*) FROM users');
    if (parseInt(userCount.rows[0].count) === 0) {
      // password is 'admin123'
      const passwordHash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
        ['admin', passwordHash]
      );
      console.log('Default admin user created.');
    }
    
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database', err);
  } finally {
    pool.end();
  }
}

initDB();
