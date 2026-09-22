/**
 * BỘ KHUNG CHUẨN — Hạng mục #9: Tìm kiếm (Giải đấu, Đội bóng, Cầu thủ)
 *
 * Search API thật (xác nhận qua network trace trên uniscore.com):
 *   GET https://api.uni-score.com/api/v2/search/all?q={query}&page=1&sport=football&lang=VN&language={lang}
 *   -> { code, results: [{ type: 'player'|'competitor'|'competition', entity }] }
 *
 * Nhận tên giải/đội qua biến môi trường (không hard-code) — dùng đúng "name"
 * đã tra được từ competition-context.ts để search chính giải đang test.
 *
 * CHẠY:
 *   TEST_COMPETITION_ID=jednm9whz0ryox8 npx playwright test tests/standard/09-search.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { getCompetitionIdFromEnv, loadCompetitionContext } from './lib/competition-context';
import { withClient } from './lib/db';
import { saveJson } from './lib/helpers';

const SEARCH_API = 'https://api.uni-score.com/api/v2/search/all';

async function searchApi(request: any, query: string): Promise<{ status: number; results: any[] }> {
  const url = `${SEARCH_API}?q=${encodeURIComponent(query)}&page=1&sport=football&lang=VN&language=en`;
  const res = await request.get(url);
  const status = res.status();
  if (status !== 200) return { status, results: [] };
  const body = await res.json();
  return { status, results: Array.isArray(body.results) ? body.results : [] };
}

test.describe('[Chuẩn #9] Tìm kiếm', () => {
  const competitionId = getCompetitionIdFromEnv();

  test('Search tên giải đấu — trả về đúng loại "competition"', async ({ request }) => {
    const ctx = await loadCompetitionContext(competitionId);
    const r = await searchApi(request, ctx.name);
    const competitionHits = r.results.filter((x) => x.type === 'competition');

    console.log(`\n📊 Search "${ctx.name}": ${r.results.length} kết quả, ${competitionHits.length} là competition`);
    saveJson(`search-competition.json`, { query: ctx.name, status: r.status, totalResults: r.results.length, competitionHits: competitionHits.length });

    expect(r.status, 'Search API không trả 200').toBe(200);
    expect.soft(competitionHits.length, `Search "${ctx.name}" không trả về kết quả loại competition nào`).toBeGreaterThan(0);
  });

  test('Search tên đội của giải này — trả về đúng loại "competitor"', async ({ request }) => {
    const teams = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT t.name
         FROM (
           SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
           UNION
           SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
         ) x
         JOIN ts_teams t ON t.id = x.team_id
         WHERE t.name IS NOT NULL AND t.name != ''
         LIMIT 5`,
        [competitionId]
      );
      return res.rows.map((r) => r.name);
    });

    if (teams.length === 0) {
      console.warn('⚠ SKIP: không lấy được tên đội nào để search.');
      test.skip(true, 'Không có team name');
      return;
    }

    const results: any[] = [];
    for (const name of teams) {
      const r = await searchApi(request, name);
      const teamHits = r.results.filter((x) => x.type === 'competitor');
      results.push({ query: name, status: r.status, found: teamHits.length > 0 });
      console.log(`  "${name}": ${teamHits.length} competitor hits`);
    }

    saveJson(`search-teams.json`, results);
    const foundCount = results.filter((r) => r.found).length;
    expect.soft(foundCount, `Chỉ ${foundCount}/${teams.length} đội tìm được qua search`).toBeGreaterThan(0);
  });

  test('Query rác — API trả rỗng, không lỗi 500', async ({ request }) => {
    const r = await searchApi(request, 'qqqxxxzzz000nomatch');
    console.log(`\n📊 Query rác: status=${r.status}, results=${r.results.length}`);
    saveJson(`search-garbage.json`, { status: r.status, resultCount: r.results.length });

    expect(r.status, 'Query rác phải trả HTTP 200').toBe(200);
    expect(r.results.length, 'Query rác không nên trả kết quả nào').toBe(0);
  });
});
