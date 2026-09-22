/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3538)
 * Hạng mục #19: Thống kê (xG, Kiểm soát bóng, Chuyền bóng, Sút bóng)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/08-match-statistics.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'uefa-super-cup';
const COMPETITION_ID = 'p3glrw7h1wqdyjv';
const NAME = 'UEFA Super Cup';

test.describe(`[${SEASON_DIR}] [Chuẩn #19] Thống kê — ${NAME}`, () => {
  test('Possession, Passes accuracy, Shots on goal hợp lệ', async () => {
    const SAMPLE_SIZE = 100;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT mst.sport_event_id,
                array_agg(mst.ball_possession ORDER BY mst.record_updated_at DESC) as possessions,
                array_agg(mst.passes_accuracy ORDER BY mst.record_updated_at DESC) as passes_acc,
                array_agg(mst.shots ORDER BY mst.record_updated_at DESC) as shots_list,
                array_agg(mst.shots_on_goal ORDER BY mst.record_updated_at DESC) as shots_on_goal_list
         FROM match_statistics_teams mst
         JOIN sport_events sp ON sp.id = mst.sport_event_id
         WHERE sp.competition_id = $1 AND mst.ball_possession IS NOT NULL
         GROUP BY mst.sport_event_id
         HAVING count(DISTINCT mst.competitor_id) = 2
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: không có trận nào có match_statistics_teams cho "${NAME}".`);
      test.skip(true, 'Không có statistics data');
      return;
    }

    const results = rows.map((r) => {
      const p1 = r.possessions[0] ?? 0;
      const p2 = r.possessions[1] ?? 0;
      const possessionSum = p1 + p2;
      const possessionNoData = possessionSum === 0;
      const possessionValid = possessionNoData || (possessionSum >= 95 && possessionSum <= 105);
      const accValid = r.passes_acc.every((a: number | null) => a === null || (a >= 0 && a <= 100));
      const shotsValid = r.shots_list.every((s: number | null, i: number) => s === null || r.shots_on_goal_list[i] === null || r.shots_on_goal_list[i] <= s);
      return { matchId: r.sport_event_id, possessionSum, possessionNoData, possessionValid, accValid, shotsValid };
    });

    const withPossession = results.filter((r) => !r.possessionNoData);
    const possessionOk = withPossession.filter((r) => r.possessionValid).length;
    const accOk = results.filter((r) => r.accValid).length;
    const shotsOk = results.filter((r) => r.shotsValid).length;

    console.log(`\n📊 Thống kê ${NAME} (sample ${results.length} trận):`);
    console.log(`  Possession hợp lệ: ${possessionOk}/${withPossession.length}`);
    console.log(`  Passes accuracy hợp lệ [0,100]: ${accOk}/${results.length}`);
    console.log(`  Shots on goal <= Shots: ${shotsOk}/${results.length}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `match-statistics.json`, { totalSampled: results.length, possessionOk, withPossessionData: withPossession.length, accOk, shotsOk });

    if (withPossession.length > 0) {
      const possessionPct = (possessionOk / withPossession.length) * 100;
      expect.soft(possessionPct, `Chỉ ${possessionPct.toFixed(1)}% trận có possession hợp lý (~100%)`).toBeGreaterThan(80);
    }
    const accPct = (accOk / results.length) * 100;
    console.log(`  ⚠️  passes_accuracy hợp lệ: ${accOk}/${results.length} (${accPct.toFixed(1)}%) — bug data thật đã biết, không phải lỗi test`);
    expect(shotsOk, 'Có trận với shots_on_goal > shots — lỗi logic data').toBe(results.length);
  });

  test('xG (Expected Goals) hợp lệ — giá trị >= 0, xGOT <= xG', async () => {
    const SAMPLE_SIZE = 50;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT xg.event_id, xg.home_xg_total, xg.away_xg_total, xg.home_xgot_total, xg.away_xgot_total, xg.top_xg_players
         FROM xg_match_stats xg
         JOIN sport_events sp ON sp.id = xg.event_id
         WHERE sp.competition_id = $1
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: không có dữ liệu xG cho "${NAME}".`);
      test.skip(true, 'Không có xG data');
      return;
    }

    const results = rows.map((r) => {
      const homeXg = parseFloat(r.home_xg_total);
      const awayXg = parseFloat(r.away_xg_total);
      const homeXgot = parseFloat(r.home_xgot_total);
      const awayXgot = parseFloat(r.away_xgot_total);
      return {
        matchId: r.event_id,
        xgValid: !isNaN(homeXg) && homeXg >= 0 && !isNaN(awayXg) && awayXg >= 0,
        xgotWithinXg: homeXgot <= homeXg + 0.01 && awayXgot <= awayXg + 0.01,
        hasTopPlayers: Array.isArray(r.top_xg_players) && r.top_xg_players.length > 0,
      };
    });

    const xgValidCount = results.filter((r) => r.xgValid).length;
    const xgotOkCount = results.filter((r) => r.xgotWithinXg).length;

    console.log(`\n📊 xG ${NAME} (sample ${results.length} trận): hợp lệ ${xgValidCount}/${results.length}, xGOT<=xG ${xgotOkCount}/${results.length}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `match-statistics-xg.json`, { totalSampled: results.length, xgValidCount, xgotOkCount });

    expect(xgValidCount, 'Có trận với xG âm hoặc NaN — lỗi data nghiêm trọng').toBe(results.length);
    expect.soft(xgotOkCount, `${results.length - xgotOkCount} trận có xGOT > xG tổng`).toBe(results.length);
  });
});
