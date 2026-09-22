/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3542)
 * Hạng mục #9: Tìm kiếm (Giải đấu, Đội bóng, Cầu thủ)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/09-search.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'uefa-nations-league';
const COMPETITION_ID = 'd23xmvkh43oqg8n';
const NAME = 'UEFA Nations League';
const SEARCH_API = 'https://api.uni-score.com/api/v2/search/all';

async function searchApi(request: any, query: string): Promise<{ status: number; results: any[] }> {
  const url = `${SEARCH_API}?q=${encodeURIComponent(query)}&page=1&sport=football&lang=VN&language=en`;
  const res = await request.get(url);
  const status = res.status();
  if (status !== 200) return { status, results: [] };
  const body = await res.json();
  return { status, results: Array.isArray(body.results) ? body.results : [] };
}

test.describe(`[${SEASON_DIR}] [Chuẩn #9] Tìm kiếm — ${NAME}`, () => {
  test('Search tên giải đấu — trả về đúng loại "competition"', async ({ request }) => {
    const r = await searchApi(request, NAME);
    const competitionHits = r.results.filter((x) => x.type === 'competition');

    console.log(`\n📊 Search "${NAME}": ${r.results.length} kết quả, ${competitionHits.length} là competition`);
    saveJsonForSeason(SEASON_DIR, SLUG, `search-competition.json`, { query: NAME, status: r.status, totalResults: r.results.length, competitionHits: competitionHits.length });

    expect(r.status, 'Search API không trả 200').toBe(200);
    expect.soft(competitionHits.length, `Search "${NAME}" không trả về kết quả loại competition nào`).toBeGreaterThan(0);
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
        [COMPETITION_ID]
      );
      return res.rows.map((r) => r.name);
    });

    if (teams.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không lấy được tên đội nào để search.`);
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

    saveJsonForSeason(SEASON_DIR, SLUG, `search-teams.json`, results);
    const foundCount = results.filter((r) => r.found).length;
    expect.soft(foundCount, `Chỉ ${foundCount}/${teams.length} đội tìm được qua search`).toBeGreaterThan(0);
  });

  test('Query rác — API trả rỗng, không lỗi 500', async ({ request }) => {
    const r = await searchApi(request, 'qqqxxxzzz000nomatch');
    console.log(`\n📊 Query rác: status=${r.status}, results=${r.results.length}`);
    saveJsonForSeason(SEASON_DIR, SLUG, `search-garbage.json`, { status: r.status, resultCount: r.results.length });

    expect(r.status, 'Query rác phải trả HTTP 200').toBe(200);
    expect(r.results.length, 'Query rác không nên trả kết quả nào').toBe(0);
  });
});
