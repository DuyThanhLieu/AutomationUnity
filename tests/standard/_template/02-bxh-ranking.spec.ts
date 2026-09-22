/**
 * BỘ KHUNG CHUẨN — Hạng mục #4: Bảng xếp hạng (BXH)
 *
 * Dùng competition-context.ts để tự tra Opta season_id đúng từ competitionId
 * (thesport ID) — không cần biết trước season_id của opta_standings.
 *
 * Nếu giải KHÔNG map được sang Opta hoặc chưa có standings (vd giải 1 trận
 * duy nhất — Super Cup, Community Shield), test tự skip có ghi log rõ lý do,
 * KHÔNG coi là fail.
 *
 * CHẠY:
 *   TEST_COMPETITION_ID=jednm9whz0ryox8 npx playwright test tests/standard/02-bxh-ranking.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from './lib/db';
import { getCompetitionIdFromEnv, loadCompetitionContext } from './lib/competition-context';
import { saveJson } from './lib/helpers';

test.describe('[Chuẩn #4] Bảng xếp hạng — Rank monotonic theo quy tắc', () => {
  const competitionId = getCompetitionIdFromEnv();

  test('Rank monotonic theo điểm; Promotion/Relegation không chồng chéo', async () => {
    const ctx = await loadCompetitionContext(competitionId);

    if (!ctx.optaCompetitionId) {
      console.warn(`⚠ SKIP: giải "${ctx.name}" chưa có trong mp_competition (chưa map sang Opta) — không có dữ liệu BXH để test.`);
      test.skip(true, 'Giải chưa map sang Opta ID — không có nguồn opta_standings');
      return;
    }
    if (!ctx.optaSeasonId || !ctx.hasStandingsData) {
      console.warn(`⚠ SKIP: giải "${ctx.name}" (season Opta: ${ctx.optaSeasonName ?? '—'}) chưa có dữ liệu opta_standings — có thể là giải 1 trận (cup single-match) không có bảng xếp hạng.`);
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

    // Loại multi-stage: nếu có contestant trùng lặp hoặc nhiều contestant
    // khác nhau cùng rank, rule rank-monotonic đơn giản sẽ false-positive
    // (xem logic-giai-promotion-relegation-test.spec.ts để biết case thật).
    const contestantCounts = new Map<string, number>();
    const rankCounts = new Map<number, number>();
    for (const r of rows) {
      contestantCounts.set(r.contestant_id, (contestantCounts.get(r.contestant_id) ?? 0) + 1);
      rankCounts.set(r.rank, (rankCounts.get(r.rank) ?? 0) + 1);
    }
    const isMultiStage = [...contestantCounts.values()].some((c) => c > 1) || [...rankCounts.values()].some((c) => c > 1);

    if (isMultiStage) {
      console.warn(`⚠ Season "${ctx.optaSeasonName}" có cấu trúc multi-stage (contestant/rank trùng lặp) — bỏ qua assert rank monotonic, chỉ log để review thủ công.`);
      saveJson(`bxh.json`, { competitionId, name: ctx.name, season: ctx.optaSeasonName, isMultiStage: true, rows });
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

    console.log(`  rank monotonic: ${rankMonotonic} | Promotion: ${promotionRows.length} đội (rank<=${maxPromotionRank}) | Relegation: ${relegationRows.length} đội (rank>=${minRelegationRank === Infinity ? '—' : minRelegationRank})`);

    saveJson(`bxh.json`, {
      competitionId,
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

  test('Trang BXH trên uniscore.com tải được (nếu biết slug)', async ({ request }) => {
    // Bộ khung không có sẵn mapping competitionId -> slug URL (slug không
    // lưu trong DB) — test này chỉ chạy khi slug được truyền qua biến môi
    // trường tuỳ chọn TEST_COMPETITION_SLUG. Nếu không có, skip có log rõ lý
    // do thay vì fail hoặc đoán slug sai.
    const slug = process.env.TEST_COMPETITION_SLUG;
    if (!slug) {
      console.warn('⚠ SKIP: không có TEST_COMPETITION_SLUG — truyền thêm biến này nếu muốn verify trang frontend (vd TEST_COMPETITION_SLUG=english-premier-league)');
      test.skip(true, 'Thiếu TEST_COMPETITION_SLUG');
      return;
    }
    const url = `https://uniscore.com/football/competition/${slug}`;
    const res = await request.get(url);
    console.log(`✓ ${url}: ${res.status()}`);
    expect(res.status(), `Trang BXH không load được (${url})`).toBe(200);
  });
});
