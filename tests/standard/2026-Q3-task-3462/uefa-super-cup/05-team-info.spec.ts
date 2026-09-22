/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3538)
 * Hạng mục #7: Đội bóng (Thông tin, Logo, HLV)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/05-team-info.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { isValidUrl, isValidImageUrl, saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'uefa-super-cup';
const COMPETITION_ID = 'p3glrw7h1wqdyjv';
const NAME = 'UEFA Super Cup';

test.describe(`[${SEASON_DIR}] [Chuẩn #7] Đội bóng — ${NAME}`, () => {
  test('Danh sách đội của giải — tên, logo, coach, venue', async () => {
    const teams = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT t.id, t.name, t.short_name, t.logo, t.country_id, t.foundation_time,
                t.website, t.coach_id, t.venue_id, t.market_value, t.total_players
         FROM (
           SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
           UNION
           SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
         ) x
         JOIN ts_teams t ON t.id = x.team_id`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    expect(teams.length, `Không có đội nào cho "${NAME}" (qua sport_events)`).toBeGreaterThan(0);

    const details = teams.map((t) => ({
      id: t.id,
      name: t.name,
      logoValid: isValidImageUrl(t.logo),
      hasCountry: !!t.country_id,
      hasCoach: !!t.coach_id,
      hasVenue: !!t.venue_id,
      websiteValid: isValidUrl(t.website),
    }));

    const withName = details.filter((d) => !!d.name).length;
    const withLogo = details.filter((d) => d.logoValid).length;
    const withCoach = details.filter((d) => d.hasCoach).length;
    const withVenue = details.filter((d) => d.hasVenue).length;

    console.log(`\n📊 Đội bóng ${NAME}: ${teams.length} đội`);
    console.log(`  Có tên: ${withName}/${teams.length} | Logo hợp lệ: ${withLogo}/${teams.length} | Coach: ${withCoach}/${teams.length} | Venue: ${withVenue}/${teams.length}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `team-info.json`, { totalTeams: teams.length, withName, withLogo, withCoach, withVenue, sample: details.slice(0, 5) });

    expect.soft(withName, 'Có đội thiếu tên').toBe(teams.length);

    const MIN_SAMPLE_FOR_PCT = 20;
    const logoPct = (withLogo / teams.length) * 100;
    if (teams.length < MIN_SAMPLE_FOR_PCT) {
      console.warn(`⚠ Mẫu chỉ ${teams.length} đội (< ${MIN_SAMPLE_FOR_PCT}) — không assert % logo, chỉ log tham khảo: ${logoPct.toFixed(1)}%`);
      return;
    }
    expect.soft(logoPct, `Chỉ ${logoPct.toFixed(1)}% đội có logo hợp lệ`).toBeGreaterThan(70);
  });

  test('Logo đội thật sự load được qua HTTP (sample tối đa 20 đội)', async ({ request }) => {
    const teams = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT t.id, t.name, t.logo
         FROM (
           SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
           UNION
           SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
         ) x
         JOIN ts_teams t ON t.id = x.team_id
         WHERE t.logo IS NOT NULL AND t.logo != ''
         LIMIT 20`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (teams.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có đội nào có logo để test HTTP load.`);
      test.skip(true, 'Không có logo');
      return;
    }

    const results: any[] = [];
    for (const t of teams) {
      try {
        const res = await request.get(t.logo, { timeout: 10000 });
        const contentType = res.headers()['content-type'] || '';
        results.push({ name: t.name, ok: res.status() === 200 && contentType.startsWith('image/') });
      } catch (e: any) {
        results.push({ name: t.name, ok: false, error: e.message });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    console.log(`\n🖼️ Logo HTTP load ${NAME}: ${okCount}/${results.length} OK`);
    saveJsonForSeason(SEASON_DIR, SLUG, `team-logo-http.json`, { totalChecked: results.length, okCount, results });

    expect.soft(okCount, `${results.length - okCount}/${results.length} logo không load được`).toBe(results.length);
  });
});
