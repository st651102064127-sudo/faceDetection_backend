// db.js
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config(); // โหลดค่าจาก .env

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

// ฟังก์ชันช่วย query แบบสั้น ๆ
export const query = (text, params) => pool.query(text, params);

export default pool;
