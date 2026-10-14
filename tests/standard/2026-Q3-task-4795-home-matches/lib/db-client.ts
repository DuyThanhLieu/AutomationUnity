/**
 * Kết nối DB "football" (10.96.0.5:6432) — nguồn dữ liệu trận đấu THẬT đứng
 * sau service api-football-home-matches. Khác hẳn DB "api_ts" cũ
 * (103.109.101.226) đã xác nhận là schema chết từ 2026-01, không dùng được.
 *
 * CHUỖI MAP ID (xác nhận thật qua https://opta-api.uniscore.vn/api/v1,
 * verify bằng tay với 3 trận thật trước khi viết file này — xem lịch sử hội
 * thoại, không đoán mò):
 *
 *   isport_sport_event.match_id  (trận đấu gốc, có home_name/away_name/
 *                                  home_score/away_score/status/match_time)
 *        = mapping_matches.encoded_isports_uuid
 *   mapping_matches.thesports_uuid
 *        --[GET /api/v1/encode/{thesports_uuid}]-->  event.id công khai trên
 *                                                      api.uni-score.com
 *
 * Đã verify 3 mốc enum `isport_sport_event.status` ↔ API `status.type`:
 *   0  → not_started   (Toronto FC vs Orlando City, chưa đá)
 *   1  → inprogress    (Vissel Kobe vs Jeonbuk, đang đá hiệp 1)
 *  -1  → finished       (Arsenal 3-0 Lille, đã kết thúc)
 * CÁC GIÁ TRỊ KHÁC (-14,-11,-10,2,3,5...) CHƯA ĐƯỢC XÁC NHẬN — không giả định
 * ý nghĩa của chúng, chỉ dùng 3 mốc đã verify.
 */
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.FOOTBALL_DB_HOST,
      port: Number(process.env.FOOTBALL_DB_PORT ?? 6432),
      user: process.env.FOOTBALL_DB_USER,
      password: process.env.FOOTBALL_DB_PASSWORD,
      database: process.env.FOOTBALL_DB_NAME,
      max: 5,
      connectionTimeoutMillis: 10_000,
      // KHÔNG đặt statement_timeout ở đây — PgBouncer (port 6432) từ chối
      // param này ở bước startup ("unsupported startup parameter"), khác với
      // kết nối Postgres trực tiếp. Query timeout (nếu cần) phải set qua
      // AbortSignal ở tầng gọi, không qua config pool.
    });
  }
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export type DbMatch = {
  matchId: string;
  homeName: string;
  awayName: string;
  status: number;
  homeScore: number;
  awayScore: number;
  homeCorner: number | null;
  awayCorner: number | null;
  homeRed: number | null;
  awayRed: number | null;
  homeYellow: number | null;
  awayYellow: number | null;
  matchTime: number; // unix seconds
};

/** Lấy trận từ isport_sport_event trong 1 khoảng thời gian (unix seconds). */
export async function queryDbMatches(fromTs: number, toTs: number, limit = 500): Promise<DbMatch[]> {
  const { rows } = await getDbPool().query(
    `SELECT match_id, home_name, away_name, status, home_score, away_score,
            home_corner, away_corner, home_red, away_red, home_yellow, away_yellow, match_time
     FROM isport_sport_event
     WHERE match_time BETWEEN $1 AND $2
     ORDER BY match_time
     LIMIT $3`,
    [fromTs, toTs, limit]
  );
  return rows.map((r) => ({
    matchId: r.match_id,
    homeName: r.home_name,
    awayName: r.away_name,
    status: r.status,
    homeScore: r.home_score,
    awayScore: r.away_score,
    homeCorner: r.home_corner,
    awayCorner: r.away_corner,
    homeRed: r.home_red,
    awayRed: r.away_red,
    homeYellow: r.home_yellow,
    awayYellow: r.away_yellow,
    matchTime: Number(r.match_time),
  }));
}

/** Tra ngược match_id (= encoded_isports_uuid) → thesports_uuid, bước trung
 *  gian bắt buộc trước khi gọi API encode. Trả Map để tra nhiều id 1 lần
 *  (tránh N+1 query khi cần map cả trăm trận). */
export async function getThesportsUuids(matchIds: string[]): Promise<Map<string, string>> {
  if (matchIds.length === 0) return new Map();
  const { rows } = await getDbPool().query(
    `SELECT encoded_isports_uuid, thesports_uuid FROM mapping_matches WHERE encoded_isports_uuid = ANY($1)`,
    [matchIds]
  );
  return new Map(rows.map((r) => [r.encoded_isports_uuid, r.thesports_uuid]));
}

const ID_ENCODE_BASE = process.env.ID_ENCODE_BASE || 'https://opta-api.uniscore.vn/api/v1';

/** Gọi API encode thật (opta-api.uniscore.vn) — không tự đoán thuật toán,
 *  luôn gọi qua API này vì đây là nguồn duy nhất đã verify đúng. */
export async function encodeToPublicId(thesportsUuid: string): Promise<string | null> {
  try {
    const res = await fetch(`${ID_ENCODE_BASE}/encode/${thesportsUuid}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const text = (await res.text()).trim().replace(/^"|"$/g, '');
    return text || null;
  } catch {
    return null;
  }
}

/** Map 1 batch match_id (DB) → event.id (API công khai) trong 1 lượt, bỏ qua
 *  âm thầm (trả null) những id không tra được thesports_uuid hoặc encode lỗi
 *  — để caller tự quyết định coi là "không đủ data" hay "lỗi thật". */
export async function mapDbMatchesToPublicIds(matches: DbMatch[]): Promise<Map<string, string>> {
  const uuidMap = await getThesportsUuids(matches.map((m) => m.matchId));
  const result = new Map<string, string>();
  for (const m of matches) {
    const uuid = uuidMap.get(m.matchId);
    if (!uuid) continue;
    const publicId = await encodeToPublicId(uuid);
    if (publicId) result.set(m.matchId, publicId);
  }
  return result;
}

/** 3 mốc status đã verify thật — xem comment đầu file. */
export const DB_STATUS_NOT_STARTED = 0;
export const DB_STATUS_INPROGRESS = 1;
export const DB_STATUS_FINISHED = -1;
