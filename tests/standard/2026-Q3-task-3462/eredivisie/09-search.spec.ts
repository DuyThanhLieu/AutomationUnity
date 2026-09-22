/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3536)
 * Hạng mục #9: Tìm kiếm (Giải đấu, Đội bóng, Cầu thủ)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/eredivisie/09-search.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'eredivisie';
const COMPETITION_ID = 'vl7oqdeheyr510j';
const NAME = 'Eredivisie';
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

  test('Đội tìm được qua search phải đúng quốc gia Hà Lan (Netherlands)', async ({ request }) => {
    // Verify tính đúng đắn của kết quả search, không chỉ "có tìm thấy" như
    // case trước — search theo tên đội Eredivisie phải trả về entity có
    // country.name = "Netherlands", không lẫn đội trùng tên ở giải/quốc gia
    // khác (rủi ro thật: nhiều đội tên ngắn như "Twente"/"NAC" có thể trùng
    // với đội nghiệp dư/futsal ở nước khác).
    const teams = await withClient(async (client) => {
      const res = await client.query(
        `SELECT name FROM (
           SELECT DISTINCT t.name
           FROM (
             SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
             UNION
             SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
           ) x
           JOIN ts_teams t ON t.id = x.team_id
           WHERE t.name IS NOT NULL AND t.name != ''
         ) sub
         ORDER BY random() LIMIT 8`,
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
      const netherlandsHit = teamHits.find((x) => x.entity?.country?.name === 'Netherlands');
      results.push({
        query: name,
        totalCompetitorHits: teamHits.length,
        hasNetherlandsMatch: !!netherlandsHit,
        matchedName: netherlandsHit?.entity?.name ?? null,
      });
      console.log(`  "${name}": ${teamHits.length} competitor hits, có đội Hà Lan=${!!netherlandsHit}${netherlandsHit ? ` (${netherlandsHit.entity.name})` : ''}`);
    }

    saveJsonForSeason(SEASON_DIR, SLUG, `search-teams-country-check.json`, results);

    const correctCountryCount = results.filter((r) => r.hasNetherlandsMatch).length;
    expect.soft(correctCountryCount, `Chỉ ${correctCountryCount}/${teams.length} đội search ra có kết quả đúng quốc gia Netherlands`).toBeGreaterThan(teams.length * 0.5);
  });
});
