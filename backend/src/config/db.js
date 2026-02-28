import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- SSL Certificate ---
// Tries multiple paths to support both local and Vercel environments.
// On Vercel, __dirname resolves to /var/task/src/config so we walk up.
function loadSSLCert() {
    const candidates = [
        path.join(__dirname, '..', 'certs', 'isrgrootx1.pem'),   // local: src/config -> src/certs
        path.join(__dirname, 'certs', 'isrgrootx1.pem'),          // fallback 1
        path.join(process.cwd(), 'src', 'certs', 'isrgrootx1.pem'), // Vercel cwd
        path.join(process.cwd(), 'certs', 'isrgrootx1.pem'),      // fallback 2
    ];

    for (const certPath of candidates) {
        try {
            const cert = fs.readFileSync(certPath);
            console.log(`[DB] SSL cert loaded from: ${certPath}`);
            return cert;
        } catch (_) {}
    }

    // Last resort: use the cert as a base64 env var (set TIDB_SSL_CERT in Vercel dashboard)
    if (process.env.TIDB_SSL_CERT) {
        console.log('[DB] SSL cert loaded from TIDB_SSL_CERT env var');
        return Buffer.from(process.env.TIDB_SSL_CERT, 'base64');
    }

    console.warn('[DB] WARNING: SSL cert not found. Connecting without SSL verification.');
    return null;
}

const sslCert = loadSSLCert();

const dbPool = mysql.createPool({
    host: process.env.VITE_DB_HOST,
    user: process.env.VITE_DB_USER,
    password: process.env.VITE_DB_PASSWORD,
    database: process.env.VITE_DB_NAME,
    port: parseInt(process.env.VITE_DB_PORT || '4000'),
    ssl: sslCert
        ? { ca: sslCert, rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 5,  // lower limit for serverless (Vercel has concurrency limits)
    queueLimit: 0,
    connectTimeout: 10000,
    // Vercel functions can be cold-started — allow reconnection
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
});

// Test connection on startup
dbPool.getConnection()
    .then(conn => {
        console.log('[DB] Connected to TiDB successfully');
        conn.release();
    })
    .catch(err => {
        console.error('[DB] Connection test failed:', err.message);
        // Don't exit — let individual queries fail gracefully
    });

export default dbPool;