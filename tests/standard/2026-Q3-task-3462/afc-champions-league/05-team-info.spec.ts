/**
 * MÙA 2026-Q3 — GIẢI: AFC Champions League (US-3537)
 * Hạng mục #7: Đội bóng (Thông tin, Logo, HLV)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/05-team-info.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { isValidUrl, isValidImageUrl, saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';

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

  test('Sân vận động (venue) — tên, thành phố, sức chứa hợp lý', async () => {
    const teams = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT t.id, t.name, v.id as venue_id, v.name as venue_name, v.city, v.capacity
         FROM (
           SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
           UNION
           SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
         ) x
         JOIN ts_teams t ON t.id = x.team_id
         LEFT JOIN ts_venues v ON v.id = t.venue_id
         WHERE t.venue_id IS NOT NULL AND t.venue_id != ''`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (teams.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có đội nào có venue_id.`);
      test.skip(true, 'Không có venue data');
      return;
    }

    const withVenueName = teams.filter((t) => !!t.venue_name).length;
    const withCity = teams.filter((t) => !!t.city).length;
    const withValidCapacity = teams.filter((t) => t.capacity !== null && t.capacity >= 1000).length;

    console.log(`\n📊 Venue ${NAME}: ${teams.length} đội có venue_id`);
    console.log(`  Có tên sân: ${withVenueName}/${teams.length} | Có thành phố: ${withCity}/${teams.length} | Capacity hợp lý (>=1000): ${withValidCapacity}/${teams.length}`);
    teams.slice(0, 3).forEach((t) => console.log(`  ${t.name}: ${t.venue_name} (${t.city}, ${t.capacity} chỗ)`));

    saveJsonForSeason(SEASON_DIR, SLUG, `team-venue.json`, { totalTeamsWithVenueId: teams.length, withVenueName, withCity, withValidCapacity, sample: teams.slice(0, 5) });

    expect.soft(withVenueName, `${teams.length - withVenueName} đội có venue_id nhưng không join được sang ts_venues — có thể lệch ID`).toBe(teams.length);
    expect.soft(withValidCapacity, `${teams.length - withValidCapacity} đội có capacity bất thường (null hoặc <1000) cho sân thi đấu chuyên nghiệp`).toBeGreaterThan(teams.length * 0.7);
  });

  test('Trọng tài (referee) — trận có tên trọng tài thật hợp lệ', async () => {
    const SAMPLE_SIZE = 100;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, sp.referee_id, tr.name as referee_name
         FROM sport_events sp
         LEFT JOIN ts_referees tr ON tr.id = sp.referee_id
         WHERE sp.competition_id = $1 AND sp.referee_id IS NOT NULL AND sp.referee_id != ''
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào có referee_id.`);
      test.skip(true, 'Không có referee data');
      return;
    }

    const withRefereeName = rows.filter((r) => !!r.referee_name).length;
    console.log(`\n📊 Trọng tài ${NAME} (sample ${rows.length} trận): có tên trọng tài hợp lệ ${withRefereeName}/${rows.length}`);
    rows.slice(0, 3).forEach((r) => console.log(`  ${r.id}: ${r.referee_name}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `team-referee.json`, { totalSampled: rows.length, withRefereeName, sample: rows.slice(0, 5) });

    const pct = (withRefereeName / rows.length) * 100;
    expect.soft(pct, `Chỉ ${pct.toFixed(1)}% trận có referee_id join được sang tên trọng tài thật — có thể lệch ID hoặc thiếu dữ liệu`).toBeGreaterThan(70);
  });

  test('Số đội tham dự group stage — đối chiếu chéo giữa thesport (sport_events) và Opta (opta_standings)', async () => {
    // QUAN TRỌNG (khác Eredivisie): AFC Champions League là cúp có group
    // stage + knockout — KHÔNG dùng ctx.curSeason (đã verify context này
    // trả về season KHÁC HẲN so với season có opta_standings, vì thesport
    // và Opta "hiểu" mùa hiện tại khác nhau khi mùa mới đã bắt đầu vòng loại
    // sớm nhưng mùa cũ vẫn còn hiệu lực bên Opta). Phải tự tìm season có
    // trận đã kết thúc, và lọc đúng GROUP STAGE (loại trừ tên stage chứa từ
    // khóa knockout) trước khi đếm đội — nếu không lọc, đếm dư đội tham gia
        // play-off/vòng loại không thuộc 24 đội group stage chính (đã verify:
    // 26 vs 24 nếu không lọc đúng).
    const KNOCKOUT_STAGE_KEYWORDS = /round of|quarter|semi|final|qualifying|playoff|play-off/i;
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    const seasonToTest = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.season_id, ms.opta_id as opta_season_id, count(*) FILTER (WHERE sp.status_id = 8) as finished
         FROM sport_events sp
         JOIN mp_season ms ON ms.thesport_id = sp.season_id
         WHERE sp.competition_id = $1
         GROUP BY sp.season_id, ms.opta_id
         HAVING count(*) FILTER (WHERE sp.status_id = 8) > 0
         ORDER BY finished DESC LIMIT 1`,
        [COMPETITION_ID]
      );
      return res.rows[0];
    });

    if (!seasonToTest) {
      console.warn(`⚠ SKIP: "${ctx.name}" không có mùa nào vừa map được Opta vừa có trận đã kết thúc.`);
      test.skip(true, 'Không có mùa nào đủ điều kiện đối chiếu');
      return;
    }

    const groupStageNames = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT st.name FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id
         WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8`,
        [COMPETITION_ID, seasonToTest.season_id]
      );
      return res.rows.map((r) => r.name).filter((n) => n && !KNOCKOUT_STAGE_KEYWORDS.test(n));
    });

    if (groupStageNames.length === 0) {
      console.warn(`⚠ SKIP: mùa "${seasonToTest.season_id}" không phát hiện được group stage nào.`);
      test.skip(true, 'Không phát hiện được group stage');
      return;
    }

    const dbTeamCount = await withClient(async (client) => {
      const res = await client.query(
        `SELECT count(DISTINCT team_id) as cnt FROM (
           SELECT sp.home_team_id AS team_id FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id
           WHERE sp.competition_id = $1 AND sp.season_id = $2 AND st.name = ANY($3)
           UNION
           SELECT sp.away_team_id FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id
           WHERE sp.competition_id = $1 AND sp.season_id = $2 AND st.name = ANY($3)
         ) x`,
        [COMPETITION_ID, seasonToTest.season_id, groupStageNames]
      );
      return parseInt(res.rows[0].cnt, 10);
    });

    const standingsCount = await withClient(async (client) => {
      const res = await client.query(`SELECT count(*) FROM opta_standings WHERE season_id = $1 AND type = 'total'`, [seasonToTest.opta_season_id]);
      return parseInt(res.rows[0].count, 10);
    });

    console.log(`\n📊 Đối chiếu số đội ${NAME} (mùa ${seasonToTest.season_id}, group stages: ${groupStageNames.join(', ')}): thesport=${dbTeamCount}, Opta=${standingsCount}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `team-count-cross-check.json`, { season: seasonToTest.season_id, groupStageNames, dbTeamCount, standingsCount, matches: dbTeamCount === standingsCount });

    expect(dbTeamCount, `Số đội lệch giữa 2 nguồn: thesport=${dbTeamCount} vs Opta=${standingsCount} — có thể sai season mapping hoặc lọc group stage chưa đúng`).toBe(standingsCount);
  });
});
