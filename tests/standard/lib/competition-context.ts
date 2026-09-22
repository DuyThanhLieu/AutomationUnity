/**
 * COMPETITION CONTEXT — tra cứu 1 lần mọi thông tin cần thiết của 1 giải đấu,
 * dùng chung cho toàn bộ bộ khung test chuẩn (tests/standard/).
 *
 * VẤN ĐỀ ĐÃ PHÁT HIỆN VÀ XỬ LÝ (2026-08-05) — multi-ID-scheme 2 TẦNG:
 *   Tầng 1 (đã biết từ trước): DB có 2 hệ ID song song cho competition/team —
 *     "thesport" ID (dùng trong bảng competitions, ts_teams, sport_events —
 *     đây là ID web/API hiện dùng) và "Opta" ID gốc (dùng trong
 *     opta_standings, opta_seasons — nguồn dữ liệu BXH chi tiết).
 *   Tầng 2 (MỚI phát hiện khi xây bộ khung này): 2 hệ ID trên KHÔNG map trực
 *     tiếp qua bất kỳ cột nào trong opta_seasons/opta_standings — đã verify
 *     opta_seasons.competition_id KHÔNG tồn tại trong bảng competitions.id.
 *     Bảng cầu nối ĐÚNG là mp_competition (thesport_id ↔ opta_id).
 *   Chuỗi tra cứu đầy đủ:
 *     competitions.id (thesport, = input)
 *       → mp_competition.thesport_id → mp_competition.opta_id
 *       → opta_seasons.competition_id (lọc theo opta_id trên)
 *       → chọn season "hiện tại" (xem chọn season bên dưới)
 *       → opta_seasons.id → opta_standings.season_id
 *
 * CHỌN SEASON "HIỆN TẠI" — cột active trong opta_seasons KHÔNG đáng tin cậy:
 *   verify thật (ASEAN Cup, opta_id=8dxsd8xnjm9n1ogo37yomgl3p): season "2026"
 *   (10/2026-01/2027, mùa SẮP diễn ra) có active=false, còn season "2024"
 *   (đã kết thúc từ 01/2025) lại active=true. Suy ra "active" ở bảng này
 *   không có nghĩa "đang diễn ra thật" mà là 1 cờ nội bộ khác (có thể là mùa
 *   mặc định hiển thị). Cách chọn đúng: ưu tiên season có now() nằm trong
 *   [start_date, end_date] (đang diễn ra); nếu không có, chọn season có
 *   start_date gần now() nhất (ưu tiên sắp diễn ra hơn đã qua) — xem SQL
 *   bucket bên dưới, đã verify cho 3 giải khác nhau (EPL, ASEAN Cup, Nations
 *   League) đều ra kết quả hợp lý.
 */

import { withClient } from './db';

export interface CompetitionContext {
  competitionId: string; // thesport ID — dùng cho competitions/ts_teams/sport_events
  name: string;
  type: number | null; // 1=league, 2=cup
  curSeason: string | null; // competitions.cur_season — season_id trong hệ thesport (dùng cho sport_events.season_id)
  optaCompetitionId: string | null; // null nếu giải này KHÔNG có trong mp_competition (chưa map được sang Opta)
  optaSeasonId: string | null; // null nếu không map được hoặc opta_seasons rỗng cho giải này
  optaSeasonName: string | null;
  hasStandingsData: boolean; // true nếu opta_standings có dữ liệu thật cho optaSeasonId này
}

/**
 * Đọc competitionId bắt buộc từ biến môi trường TEST_COMPETITION_ID.
 * KHÔNG có giá trị mặc định ngầm — nếu thiếu, ném lỗi rõ ràng ngay từ đầu để
 * tránh trường hợp test âm thầm chạy nhầm giải hoặc rơi vào giải cũ hard-code.
 *
 * Cách chạy: TEST_COMPETITION_ID=jednm9whz0ryox8 npx playwright test tests/standard/
 */
export function getCompetitionIdFromEnv(): string {
  const id = process.env.TEST_COMPETITION_ID;
  if (!id) {
    throw new Error(
      'Thiếu biến môi trường TEST_COMPETITION_ID. Chạy lại với: ' +
        'TEST_COMPETITION_ID=<competition_id> npx playwright test tests/standard/ ' +
        '(competition_id lấy từ bảng competitions.id, vd Premier League = "jednm9whz0ryox8")'
    );
  }
  return id;
}

export async function loadCompetitionContext(competitionId: string): Promise<CompetitionContext> {
  return withClient(async (client) => {
    const compRes = await client.query(
      `SELECT id, name, type, cur_season FROM competitions WHERE id = $1`,
      [competitionId]
    );
    if (compRes.rows.length === 0) {
      throw new Error(`competitionId "${competitionId}" không tồn tại trong bảng competitions.`);
    }
    const comp = compRes.rows[0];

    const mpRes = await client.query(
      `SELECT opta_id FROM mp_competition WHERE thesport_id = $1`,
      [competitionId]
    );
    const optaCompetitionId: string | null = mpRes.rows[0]?.opta_id ?? null;

    let optaSeasonId: string | null = null;
    let optaSeasonName: string | null = null;
    let hasStandingsData = false;

    if (optaCompetitionId) {
      const seasonRes = await client.query(
        `SELECT id, name,
                CASE
                  WHEN now() BETWEEN start_date AND end_date THEN 0
                  WHEN start_date > now() THEN 1
                  ELSE 2
                END as bucket,
                ABS(EXTRACT(EPOCH FROM (start_date - now()))) as dist
         FROM opta_seasons
         WHERE competition_id = $1
         ORDER BY bucket ASC, dist ASC
         LIMIT 1`,
        [optaCompetitionId]
      );
      if (seasonRes.rows.length > 0) {
        optaSeasonId = seasonRes.rows[0].id;
        optaSeasonName = seasonRes.rows[0].name;

        const standingsRes = await client.query(
          `SELECT count(*) FROM opta_standings WHERE season_id = $1 AND type = 'total'`,
          [optaSeasonId]
        );
        hasStandingsData = parseInt(standingsRes.rows[0].count, 10) > 0;
      }
    }

    return {
      competitionId,
      name: comp.name,
      type: comp.type,
      curSeason: comp.cur_season,
      optaCompetitionId,
      optaSeasonId,
      optaSeasonName,
      hasStandingsData,
    };
  });
}
