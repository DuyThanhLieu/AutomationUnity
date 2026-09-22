/**
 * REDIS CONFIG cho bộ test injury time (ticket TheSport injuryTime).
 *
 * ⚠️ PLACEHOLDER — chưa có thông tin kết nối thật (host/port/password Redis
 * staging). Điền vào REDIS_CONFIG dưới đây rồi mọi test dùng withRedis() sẽ
 * chạy được ngay, không cần sửa gì thêm ở file test.
 *
 * Field cần verify theo ticket: hget event:<matchId> current_injury_time
 * (đơn vị PHÚT ở Redis, đơn vị GIÂY ở API/socket — xem contract trong
 * injury-time.spec.ts).
 */

import Redis from 'ioredis';

export const REDIS_CONFIG = {
  host: 'TODO_REDIS_HOST', // TODO: điền host Redis staging thật
  port: 6379, // TODO: xác nhận port thật (6379 là mặc định, ticket chưa nêu port khác)
  password: undefined as string | undefined, // TODO: điền password nếu Redis có bật auth
  db: 0,
  connectTimeout: 10_000,
  lazyConnect: true,
};

export function isRedisConfigured(): boolean {
  return REDIS_CONFIG.host !== 'TODO_REDIS_HOST';
}

export async function withRedis<T>(fn: (client: Redis) => Promise<T>): Promise<T> {
  const client = new Redis(REDIS_CONFIG);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    client.disconnect();
  }
}
