// backend/db.js
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the root folder (two levels up from src or one from backend)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbPool = mysql.createPool({
    host: process.env.VITE_DB_HOST,
    user: process.env.VITE_DB_USER,
    password: process.env.VITE_DB_PASSWORD,
    database: process.env.VITE_DB_NAME,
    port: 4000, 
    ssl: {
        // Path adjusted to look for certs/ folder inside /backend/
        ca: fs.readFileSync(path.resolve(__dirname, 'certs', 'isrgrootx1.pem')),
        rejectUnauthorized: true
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export default dbPool;