/**
 * MÙA 2026-Q3 — GIẢI: AFC Champions League (US-3537)
 * Hạng mục #8: Cầu thủ — MỞ RỘNG (Thống kê mùa giải cầu thủ)
 *
 * Port từ Eredivisie — khai thác bảng opta_seasonal_stat_players (thống kê
 * chi tiết mỗi cầu thủ: goals, shots, passes, tackles, duels...).
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/06b-player-season-stats.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';

test.describe(`[${SEASON_DIR}] [Chuẩn #8] Thống kê mùa giải cầu thủ — ${NAME}`, () => {
  test('opta_seasonal_stat_players.goals đối chiếu chéo với số bàn thắng thật đếm từ opta_match_event', async () => {
    // Compare chéo giữa 2 nguồn Opta độc lập: bảng tổng hợp sẵn theo mùa
    // (opta_seasonal_stat_players, cột "goals" dạng varchar) vs đếm trực
    // tiếp từ event feed chi tiết từng trận (opta_match_event type_id=16).
    // GIỐNG Eredivisie: phải giới hạn opta_match_event theo ĐÚNG các trận
    // AFC CL (qua mp_match) trước khi đếm để tránh đếm sai bàn ở giải khác.
    // KHÁC Eredivisie: AFC CL có trận đá hiệp phụ/luân lưu (đã xác nhận ở
    // 07-match-events.spec.ts) — period_id=5 (luân lưu) KHÔNG tính là bàn
    // thắng thật trong thống kê mùa giải, nên lọc period_id = ANY([1,2,3,4])
    // (loại period 5 luân lưu, giữ hiệp phụ 3/4) khi đếm từ event feed.
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    if (!ctx.optaSeasonId) {
      console.warn(`⚠ SKIP: "${ctx.name}" chưa map được Opta season.`);
      test.skip(true, 'Không có Opta season mapping');
      return;
    }

    const matchOptaIds = await withClient(async (client) => {
      const res = await client.query(
        `SELECT mm.opta_id FROM sport_events sp JOIN mp_match mm ON mm.thesport_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8`,
        [COMPETITION_ID]
      );
      return res.rows.map((r) => r.opta_id);
    });

    if (matchOptaIds.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào map được Opta ID.`);
      test.skip(true, 'Không có trận nào map được Opta ID');
      return;
    }

    const SAMPLE_SIZE = 30;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT player_id, goals::int as goals FROM opta_seasonal_stat_players
         WHERE season_id = $1 AND goals::int > 0
         ORDER BY random() LIMIT $2`,
        [ctx.optaSeasonId, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có dữ liệu opta_seasonal_stat_players cho mùa hiện tại.`);
      test.skip(true, 'Không có dữ liệu opta_seasonal_stat_players');
      return;
    }

    const GOALS_TOLERANCE = 2;
    const results = [];
    for (const r of rows) {
      const eventGoalCount = await withClient(async (client) => {
        const res = await client.query(
          `SELECT count(*) FROM opta_match_event WHERE match_id = ANY($1) AND player_id = $2 AND type_id = 16 AND period_id = ANY($3)`,
          [matchOptaIds, r.player_id, [1, 2, 3, 4]]
        );
        return parseInt(res.rows[0].count, 10);
      });
      results.push({ playerId: r.player_id, seasonalGoals: r.goals, eventGoalCount, exactMatch: eventGoalCount === r.goals, withinTolerance: Math.abs(eventGoalCount - r.goals) <= GOALS_TOLERANCE });
    }

    const exactCount = results.filter((r) => r.exactMatch).length;
    const tolerantCount = results.filter((r) => r.withinTolerance).length;

    console.log(`\n📊 opta_seasonal_stat_players.goals vs opta_match_event ${NAME} (sample ${results.length} cầu thủ): khớp chính xác ${exactCount}/${results.length}, khớp dung sai ±${GOALS_TOLERANCE} ${tolerantCount}/${results.length}`);
    results.filter((r) => !r.withinTolerance).forEach((r) => console.log(`  ✗ player=${r.playerId}: seasonal.goals=${r.seasonalGoals} vs event_count=${r.eventGoalCount}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `player-seasonal-stats-goals-cross-check.json`, { totalSampled: results.length, exactCount, tolerantCount, results });

    const tolerantPct = (tolerantCount / results.length) * 100;
    expect(tolerantPct, `Chỉ ${tolerantPct.toFixed(1)}% cầu thủ khớp số bàn thắng (dung sai ±${GOALS_TOLERANCE}) — lệch diện rộng bất thường`).toBeGreaterThan(90);
  });

  test('ts_players.positions (JSONB đa vị trí) khớp nhóm với cột position (G/D/M/F)', async () => {
    // Compare chéo nội bộ: "positions" là JSONB chi tiết dạng
    // [vị_trí_chính, [vị_trí_phụ]] (vd ["DC", ["DL"]]) — độc lập với cột
    // "position" rút gọn (G/D/M/F). Verify vị trí chính trong positions[0]
    // map đúng nhóm với cột position. Logic giống Eredivisie (đã sửa bug DM).
    const players = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, position, positions FROM (
           SELECT DISTINCT ON (tp.id) tp.id, tp.position, tp.positions
           FROM sport_events sp JOIN match_lineups ml ON ml.sport_event_id = sp.id
           , jsonb_array_elements(ml.home_lineups || ml.away_lineups) elem
           JOIN ts_players tp ON tp.id = (elem ->> 'id')
           WHERE sp.competition_id = $1 AND tp.positions IS NOT NULL
         ) sub ORDER BY random() LIMIT 100`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (players.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có cầu thủ nào có field positions.`);
      test.skip(true, 'Không có dữ liệu positions');
      return;
    }

    const groupOf = (code: string): 'G' | 'D' | 'M' | 'F' | 'UNKNOWN' => {
      const KNOWN_MIDFIELD_CODES = new Set(['DM', 'AM', 'MC', 'ML', 'MR']);
      if (code === 'GK') return 'G';
      if (KNOWN_MIDFIELD_CODES.has(code) || code.startsWith('M')) return 'M';
      if (code.startsWith('D')) return 'D';
      if (code.endsWith('W') || code === 'ST' || code === 'F') return 'F';
      return 'UNKNOWN';
    };

    const results = players.map((p) => {
      const primaryCode = Array.isArray(p.positions) ? p.positions[0] : null;
      const expectedGroup = primaryCode ? groupOf(primaryCode) : 'UNKNOWN';
      const valid = expectedGroup === 'UNKNOWN' ? null : expectedGroup === p.position;
      return { playerId: p.id, position: p.position, primaryCode, expectedGroup, valid };
    });

    const checkable = results.filter((r) => r.valid !== null);
    const validCount = checkable.filter((r) => r.valid).length;

    console.log(`\n📊 ts_players.positions vs position ${NAME} (sample ${players.length} cầu thủ, ${checkable.length} kiểm tra được): ${validCount}/${checkable.length} khớp nhóm`);
    checkable.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ ${r.playerId}: position="${r.position}" nhưng positions[0]="${r.primaryCode}" (kỳ vọng nhóm ${r.expectedGroup})`));

    saveJsonForSeason(SEASON_DIR, SLUG, `player-positions-group-cross-check.json`, { totalSampled: players.length, checkedCount: checkable.length, validCount });

    if (checkable.length === 0) {
      console.warn('⚠ Không có cầu thủ nào đủ dữ liệu positions để so nhóm (toàn bộ mã vị trí không nhận diện được).');
      return;
    }
    const pct = (validCount / checkable.length) * 100;
    expect.soft(pct, `Chỉ ${pct.toFixed(1)}% cầu thủ có positions[0] khớp nhóm với cột position — có thể lệch dữ liệu vị trí`).toBeGreaterThan(80);
  });

  test('player_locale — độ phủ bản dịch tiếng Việt cho cầu thủ trong lineup', async () => {
    // Tương tự case đa ngôn ngữ đội (team_locale) nhưng ở tầng cầu thủ.
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT (elem ->> 'id') as player_id, pl.name_vi
         FROM sport_events sp JOIN match_lineups ml ON ml.sport_event_id = sp.id
         , jsonb_array_elements(ml.home_lineups || ml.away_lineups) elem
         LEFT JOIN player_locale pl ON pl.id = (elem ->> 'id')
         WHERE sp.competition_id = $1
         LIMIT 500`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không lấy được cầu thủ nào từ lineup.`);
      test.skip(true, 'Không có player data');
      return;
    }

    const withVi = rows.filter((r) => !!r.name_vi).length;
    const pct = (withVi / rows.length) * 100;

    console.log(`\n📊 player_locale tiếng Việt ${NAME}: ${withVi}/${rows.length} cầu thủ có bản dịch (${pct.toFixed(1)}%)`);
    saveJsonForSeason(SEASON_DIR, SLUG, `player-locale-coverage.json`, { totalPlayers: rows.length, withVi, pct });

    expect.soft(pct, `Chỉ ${pct.toFixed(1)}% cầu thủ có tên tiếng Việt trong player_locale — thấp bất thường`).toBeGreaterThan(40);
  });
});
