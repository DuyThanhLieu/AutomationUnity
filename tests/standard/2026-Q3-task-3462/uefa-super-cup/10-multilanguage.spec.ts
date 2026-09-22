/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3538)
 * Hạng mục #11/#20: Đa ngôn ngữ (Tên đội/giải, Bình luận trận đấu)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/10-multilanguage.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'uefa-super-cup';
const COMPETITION_ID = 'p3glrw7h1wqdyjv';
const NAME = 'UEFA Super Cup';

test.describe(`[${SEASON_DIR}] [Chuẩn #11/#20] Đa ngôn ngữ — ${NAME}`, () => {
  test('Tên đội của giải có bản dịch vi/th', async () => {
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT tl.id, tl.name_en, tl.name_vi, tl.name_th
         FROM (
           SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
           UNION
           SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
         ) x
         JOIN team_locale tl ON tl.id = x.team_id`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có đội nào trong team_locale.`);
      test.skip(true, 'Không có team_locale data');
      return;
    }

    const withVi = rows.filter((r) => !!r.name_vi).length;
    const withTh = rows.filter((r) => !!r.name_th).length;

    console.log(`\n📊 Đa ngôn ngữ tên đội ${NAME} (${rows.length} đội):`);
    console.log(`  Có tên tiếng Việt: ${withVi}/${rows.length}`);
    console.log(`  Có tên tiếng Thái: ${withTh}/${rows.length}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `multilang-teams.json`, { totalTeams: rows.length, withVi, withTh });

    const viPct = (withVi / rows.length) * 100;
    expect.soft(viPct, `Chỉ ${viPct.toFixed(1)}% đội có tên tiếng Việt`).toBeGreaterThan(70);
  });

  test('Tên giải có bản dịch vi/th', async () => {
    const row = await withClient(async (client) => {
      const res = await client.query(`SELECT id, name_en, name_vi, name_th FROM competition_locale WHERE id = $1`, [COMPETITION_ID]);
      return res.rows[0];
    });

    if (!row) {
      console.warn(`⚠ SKIP: "${NAME}" không có trong competition_locale.`);
      test.skip(true, 'Không có competition_locale data');
      return;
    }

    console.log(`\n📊 Đa ngôn ngữ tên giải: vi="${row.name_vi}" th="${row.name_th}"`);
    saveJsonForSeason(SEASON_DIR, SLUG, `multilang-competition.json`, row);

    expect.soft(!!row.name_vi, 'Thiếu tên giải tiếng Việt').toBe(true);
    expect.soft(!!row.name_th, 'Thiếu tên giải tiếng Thái').toBe(true);
  });

  test('Bình luận trận đấu (commentary) có nội dung theo locale', async () => {
    const matches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT mm.opta_id
         FROM sport_events sp
         JOIN mp_match mm ON mm.thesport_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY sp.start_timestamp DESC LIMIT 20`,
        [COMPETITION_ID]
      );
      return res.rows.map((r) => r.opta_id);
    });

    if (matches.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào map được Opta ID.`);
      test.skip(true, 'Không có Opta mapping');
      return;
    }

    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT match_id, locale, msg FROM opta_match_commentary_translation WHERE match_id = ANY($1) AND locale IN ('vi-vn', 'th-th')`,
        [matches]
      );
      return res.rows;
    });

    const viCount = rows.filter((r) => r.locale === 'vi-vn' && r.msg).length;
    const thCount = rows.filter((r) => r.locale === 'th-th' && r.msg).length;

    console.log(`\n📊 Commentary ${NAME} (${matches.length} trận có Opta mapping): vi-vn=${viCount}, th-th=${thCount}`);
    saveJsonForSeason(SEASON_DIR, SLUG, `multilang-commentary.json`, { totalMatchesChecked: matches.length, viCount, thCount });
  });
});
