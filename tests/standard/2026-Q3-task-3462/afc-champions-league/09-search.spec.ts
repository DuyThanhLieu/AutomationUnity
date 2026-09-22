/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3537)
 * Hạng mục #9: Tìm kiếm (Giải đấu, Đội bóng, Cầu thủ)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/09-search.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';
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

  test('Đội tìm được qua search phải đúng quốc gia thật của đội (giải quốc tế — nhiều quốc gia khác nhau)', async ({ request }) => {
    // KHÁC Eredivisie (1 quốc gia cố định "Netherlands"): AFC Champions
    // League là giải quốc tế, đội đến từ nhiều quốc gia châu Á khác nhau
    // (Saudi Arabia, Nhật, Hàn, Trung Quốc, Qatar, UAE, Iran, Iraq...) — nên
    // phải lấy quốc gia THẬT của TỪNG đội từ DB (ts_teams.country_id ->
    // ts_countries.name) rồi so khớp với kết quả search của chính đội đó,
    // không dùng 1 quốc gia cố định.
    const teams = await withClient(async (client) => {
      const res = await client.query(
        `SELECT t.name, c.name as country_name FROM (
           SELECT t.id, t.name, t.country_id
           FROM (
             SELECT DISTINCT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
             UNION
             SELECT DISTINCT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
           ) x
           JOIN ts_teams t ON t.id = x.team_id
           WHERE t.name IS NOT NULL AND t.name != ''
         ) t
         LEFT JOIN ts_countries c ON c.id = t.country_id
         ORDER BY random() LIMIT 8`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (teams.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không lấy được tên đội nào để search.`);
      test.skip(true, 'Không có team name');
      return;
    }

    const results: any[] = [];
    for (const team of teams) {
      const r = await searchApi(request, team.name);
      const teamHits = r.results.filter((x) => x.type === 'competitor');
      const correctCountryHit = team.country_name ? teamHits.find((x) => x.entity?.country?.name === team.country_name) : null;
      results.push({
        query: team.name,
        expectedCountry: team.country_name,
        totalCompetitorHits: teamHits.length,
        hasCorrectCountryMatch: !!correctCountryHit,
        matchedName: correctCountryHit?.entity?.name ?? null,
      });
      console.log(`  "${team.name}" (kỳ vọng ${team.country_name}): ${teamHits.length} competitor hits, khớp đúng quốc gia=${!!correctCountryHit}${correctCountryHit ? ` (${correctCountryHit.entity.name})` : ''}`);
    }

    saveJsonForSeason(SEASON_DIR, SLUG, `search-teams-country-check.json`, results);

    const withExpectedCountry = results.filter((r) => r.expectedCountry);
    const correctCountryCount = withExpectedCountry.filter((r) => r.hasCorrectCountryMatch).length;
    expect.soft(correctCountryCount, `Chỉ ${correctCountryCount}/${withExpectedCountry.length} đội search ra có kết quả đúng quốc gia thật của đội`).toBeGreaterThan(withExpectedCountry.length * 0.5);
  });
});
