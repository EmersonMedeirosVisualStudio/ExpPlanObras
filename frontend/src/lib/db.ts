import mysql from 'mysql2/promise';
import { ApiError } from './api/http';

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (pool) return pool;
  const mysqlUrl = (process.env.MYSQL_URL || process.env.DB_URL || process.env.DATABASE_URL || '').trim();
  if (mysqlUrl) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(mysqlUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || !/^mysql/i.test(parsed.protocol || '')) {
      throw new ApiError(501, 'MYSQL_URL inválida. Use o formato: mysql://usuario:senha@host:3306/banco');
    }
    const database = String(parsed.pathname || '').replace(/^\//, '');
    if (!database) throw new ApiError(501, 'MYSQL_URL inválida (faltando nome do banco no path). Ex.: mysql://.../nome_do_banco');
    pool = mysql.createPool({
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    return pool;
  }
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new ApiError(
      501,
      `Banco MySQL não configurado no ambiente (faltando: ${missing.join(', ')}). Alternativa: configure MYSQL_URL (mysql://usuario:senha@host:3306/banco).`
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
