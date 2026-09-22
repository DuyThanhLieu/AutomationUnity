/**
 * DB CONFIG RIÊNG cho bộ test injury time (US ticket TheSport injury time) —
 * port 5432 (Postgres trực tiếp, KHÔNG qua pgbouncer 6432 như lib/db.ts dùng
 * chung). Chỉ dùng trong các file test injury-time, KHÔNG import vào các
 * file test khác — mọi test khác vẫn dùng lib/db.ts (port 6432) như cũ.
 */

import { Client } from 'pg';

export const DB_STAGING_DIRECT_CONFIG = {
  host: process.env.DB_HOST || '',
  port: Number(process.env.DB_STAGING_DIRECT_PORT) || 5432,
  user: process.env.DB_USER || 'readonly',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'football',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
};

export async function withStagingDirectClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(DB_STAGING_DIRECT_CONFIG);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
