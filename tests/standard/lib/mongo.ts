/**
 * MONGO CONFIG — dùng cho test cache Datalytics/FootyStats (ticket US-3508).
 *
 * DB "footystats" chứa:
 *   - mapping_matches: { footystats_id, thesports_id } — map ID FootyStats
 *     sang thesports_id dùng trong URL app/API (đúng bảng ticket mô tả ở
 *     mappingMatches.consumer.ts).
 *   - footy_stat_historical: { id: thesports_id, stats: {...raw FS fields} }
 *     — cache raw data crawl từ FootyStats, dùng làm nguồn tính API
 *     datalytics. Không có field timestamp riêng (updatedAt/cachedAt) —
 *     dùng _id (ObjectId) để suy ra thời điểm document được TẠO
 *     (ObjectId.getTimestamp()) làm proxy cho tuổi cache, vì $setOnInsert
 *     (theo mô tả bug gốc) chỉ set field khi insert lần đầu, không update
 *     lại — nên "ngày tạo" gần đúng bằng "ngày cache lần cuối được ghi".
 */

import { MongoClient } from 'mongodb';

export const MONGO_CONFIG = {
  host: process.env.MONGO_HOST || '',
  user: process.env.MONGO_USER || 'readonly',
  password: process.env.MONGO_PASSWORD || '',
  authSource: 'admin',
  db: 'footystats',
};

function buildUri(): string {
  const user = encodeURIComponent(MONGO_CONFIG.user);
  const pass = encodeURIComponent(MONGO_CONFIG.password);
  return `mongodb://${user}:${pass}@${MONGO_CONFIG.host}/?authSource=${MONGO_CONFIG.authSource}`;
}

export async function withMongo<T>(fn: (db: import('mongodb').Db) => Promise<T>): Promise<T> {
  const client = new MongoClient(buildUri(), { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    return await fn(client.db(MONGO_CONFIG.db));
  } finally {
    await client.close();
  }
}
