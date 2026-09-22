/**
 * DB CONFIG DÙNG CHUNG — bộ khung test chuẩn (tests/standard/).
 *
 * Production DB, port 6432 (pgbouncer) — theo đúng chỉ định: "link test
 * product và db là port 6432".
 */

import { Client } from 'pg';

export const DB_CONFIG = {
  host: process.env.DB_HOST || '',
  port: Number(process.env.DB_PORT) || 6432,
  user: process.env.DB_USER || 'readonly',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'football',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
};

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
