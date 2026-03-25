import mysql from 'mysql2/promise';
import { ApiError } from './api/http';

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (pool) return pool;
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new ApiError(
      501,
      `Banco MySQL não configurado no ambiente (faltando: ${missing.join(', ')}). Se a arquitetura for “Tudo no Backend (Render/Postgres)”, desative o uso das rotas /api/v1 (Next) e use apenas o backend.`
    );
  }
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
  return pool;
}

export const db = {
  query: (sql: any, values?: any) => getPool().query(sql, values),
  execute: (sql: any, values?: any) => getPool().execute(sql, values),
  getConnection: () => getPool().getConnection(),
} as any;
