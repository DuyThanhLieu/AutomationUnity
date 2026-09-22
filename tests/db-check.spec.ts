import { test, expect } from '@playwright/test';
import { Client } from 'pg';

// Cấu hình kết nối database — đọc từ biến môi trường hoặc dùng giá trị mặc định
const DB_CONFIG = {
  host:     process.env.DB_HOST ?? '',
  port:     Number(process.env.DB_PORT ?? 5432),
  user:     process.env.DB_USER     ?? 'readonly',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'api_ts',
  connectionTimeoutMillis: 10000,
};

// Bảng bắt buộc phải tồn tại trong database
const REQUIRED_TABLES = [
  // Thêm tên bảng quan trọng vào đây để assert cứng
  // Ví dụ: 'users', 'orders', 'products'
];

// Helper tạo và dọn dẹp client trong mỗi test
async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test.describe('Database Health Check — api_ts', () => {

  // Kiểm tra kết nối tới database thành công
  test('can connect to database', async () => {
    const client = new Client(DB_CONFIG);
    await client.connect();
    const res = await client.query('SELECT 1 AS ok');
    expect(res.rows[0].ok).toBe(1);
    await client.end();
  });

  // Kiểm tra database có ít nhất 1 bảng — tránh trường hợp DB rỗng
  test('database has at least one table', async () => {
    await withClient(async (client) => {
      const res = await client.query(`
        SELECT COUNT(*) AS total
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
      `);
      const total = Number(res.rows[0].total);
      console.log(`Tổng số bảng trong DB: ${total}`);
      expect(total).toBeGreaterThan(0);
    });
  });

  // Liệt kê toàn bộ bảng — dùng để inspect, không fail
  test('list all tables in database', async () => {
    await withClient(async (client) => {
      const res = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `);
      console.log(`\nFound ${res.rows.length} tables:\n`);
      res.rows.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));

      // Validate mỗi row có đủ schema và table_name
      for (const row of res.rows) {
        expect.soft(row.table_schema, 'table_schema rỗng').toBeTruthy();
        expect.soft(row.table_name,   'table_name rỗng').toBeTruthy();
      }
    });
  });

  // Kiểm tra các bảng bắt buộc tồn tại (nếu REQUIRED_TABLES có khai báo)
  test('required tables exist', async () => {
    if (REQUIRED_TABLES.length === 0) {
      console.log('REQUIRED_TABLES chưa khai báo — bỏ qua test này');
      return;
    }

    await withClient(async (client) => {
      const res = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
      `);
      const existingTables = res.rows.map(r => r.table_name as string);

      for (const required of REQUIRED_TABLES) {
        expect.soft(
          existingTables.includes(required),
          `Bảng bắt buộc "${required}" không tồn tại trong DB`
        ).toBe(true);
      }
    });
  });

  // Kiểm tra server version PostgreSQL
  test('database server is reachable and returns version', async () => {
    await withClient(async (client) => {
      const res = await client.query('SELECT version()');
      const version = res.rows[0].version as string;
      console.log(`PostgreSQL version: ${version}`);
      expect(version).toMatch(/PostgreSQL/i);
    });
  });

  // Kiểm tra không có bảng nào có tên trùng lặp trong cùng schema
  test('no duplicate table names within same schema', async () => {
    await withClient(async (client) => {
      const res = await client.query(`
        SELECT table_schema, table_name, COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        GROUP BY table_schema, table_name
        HAVING COUNT(*) > 1
      `);
      if (res.rows.length > 0) {
        console.warn('Duplicate tables:', res.rows);
      }
      expect(res.rows.length).toBe(0);
    });
  });

});
// npx playwright test tests/db-check.spec.ts --project=chrome
