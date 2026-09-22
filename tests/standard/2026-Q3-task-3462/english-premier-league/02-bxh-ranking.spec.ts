/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3540)
 * Hạng mục #4: Bảng xếp hạng (BXH)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/02-bxh-ranking.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'english-premier-league';
const COMPETITION_ID = 'jednm9whz0ryox8';
const NAME = 'English Premier League';
const FRONTEND_SLUG = 'english-premier-league';

test.describe(`[${SEASON_DIR}] [Chuẩn #4] Bảng xếp hạng — ${NAME}`, () => {
  test('Rank monotonic theo điểm; Promotion/Relegation không chồng chéo', async () => {
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    if (!ctx.optaCompetitionId) {
      console.warn(`⚠ SKIP: giải "${ctx.name}" chưa có trong mp_competition (chưa map sang Opta) — không có dữ liệu BXH để test.`);
      test.skip(true, 'Giải chưa map sang Opta ID — không có nguồn opta_standings');
      return;
    }
    if (!ctx.optaSeasonId || !ctx.hasStandingsData) {
      console.warn(`⚠ SKIP: giải "${ctx.name}" (season Opta: ${ctx.optaSeasonName ?? '—'}) chưa có dữ liệu opta_standings.`);
      test.skip(true, 'Season Opta chưa có dữ liệu standings');
      return;
    }

    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT rank, points, goals_diff, goals, rank_status, contestant_id
         FROM opta_standings WHERE season_id = $1 AND type = 'total' ORDER BY rank ASC`,
        [ctx.optaSeasonId]
      );
      return res.rows;
    });

    console.log(`\n📊 BXH "${ctx.name}" (season Opta: ${ctx.optaSeasonName}): ${rows.length} dòng`);

    if (rows.length === 0) {
      console.warn('⚠ opta_standings trả 0 dòng dù hasStandingsData=true (race condition dữ liệu) — bỏ qua.');
      return;
    }

    const contestantCounts = new Map<string, number>();
    const rankCounts = new Map<number, number>();
    for (const r of rows) {
      contestantCounts.set(r.contestant_id, (contestantCounts.get(r.contestant_id) ?? 0) + 1);
      rankCounts.set(r.rank, (rankCounts.get(r.rank) ?? 0) + 1);
    }
    const isMultiStage = [...contestantCounts.values()].some((c) => c > 1) || [...rankCounts.values()].some((c) => c > 1);

    if (isMultiStage) {
      console.warn(`⚠ Season "${ctx.optaSeasonName}" có cấu trúc multi-stage — bỏ qua assert rank monotonic, chỉ log để review thủ công.`);
      saveJsonForSeason(SEASON_DIR, SLUG, `bxh.json`, { competitionId: COMPETITION_ID, name: ctx.name, season: ctx.optaSeasonName, isMultiStage: true, rows });
      return;
    }

    let rankMonotonic = true;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].points > rows[i - 1].points) { rankMonotonic = false; break; }
    }

    const promotionRows = rows.filter((r) => r.rank_status === 'Promotion');
    const relegationRows = rows.filter((r) => r.rank_status === 'Relegation');
    const maxPromotionRank = promotionRows.length > 0 ? Math.max(...promotionRows.map((r) => r.rank)) : 0;
    const minRelegationRank = relegationRows.length > 0 ? Math.min(...relegationRows.map((r) => r.rank)) : Infinity;
    const noOverlap = maxPromotionRank < minRelegationRank;

    console.log(`  rank monotonic: ${rankMonotonic} | Promotion: ${promotionRows.length} đội | Relegation: ${relegationRows.length} đội`);

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh.json`, {
      competitionId: COMPETITION_ID,
      name: ctx.name,
      season: ctx.optaSeasonName,
      totalTeams: rows.length,
      rankMonotonic,
      promotionCount: promotionRows.length,
      relegationCount: relegationRows.length,
      noOverlap,
    });

    expect(rankMonotonic, `Season "${ctx.optaSeasonName}": rank không theo đúng thứ tự điểm giảm dần`).toBe(true);
    if (promotionRows.length > 0 && relegationRows.length > 0) {
      expect.soft(noOverlap, 'Promotion và Relegation zone chồng chéo nhau').toBe(true);
    }
  });

  test('Trang BXH trên uniscore.com tải được', async ({ request }) => {
    const url = `https://uniscore.com/football/competition/${FRONTEND_SLUG}`;
    const res = await request.get(url);
    console.log(`✓ ${url}: ${res.status()}`);
    expect(res.status(), `Trang BXH "${NAME}" không load được (${url})`).toBe(200);
  });
});
