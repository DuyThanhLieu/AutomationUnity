/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3536)
 * Hạng mục #11/#20: Đa ngôn ngữ (Tên đội/giải, Bình luận trận đấu)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/eredivisie/10-multilanguage.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'eredivisie';
const COMPETITION_ID = 'vl7oqdeheyr510j';
const NAME = 'Eredivisie';

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

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có dòng opta_match_commentary_translation nào cho ${matches.length} trận đã map Opta.`);
      test.skip(true, 'Không có dữ liệu commentary_translation');
      return;
    }

    const viCount = rows.filter((r) => r.locale === 'vi-vn' && r.msg).length;
    const thCount = rows.filter((r) => r.locale === 'th-th' && r.msg).length;

    console.log(`\n📊 Commentary ${NAME} (${matches.length} trận có Opta mapping): vi-vn=${viCount}, th-th=${thCount}`);
    saveJsonForSeason(SEASON_DIR, SLUG, `multilang-commentary.json`, { totalMatchesChecked: matches.length, viCount, thCount });

    // Trước đây case này chỉ log, KHÔNG có assert nào — PASS vô điều kiện dù
    // dữ liệu rỗng 100% (0 commentary đa ngôn ngữ). Bổ sung assert tối
    // thiểu để test thực sự có khả năng fail khi mất bản dịch commentary
    // diện rộng, thay vì chỉ là smoke test không thể phát hiện lỗi.
    expect.soft(viCount, `0/${rows.length} dòng commentary có bản dịch vi-vn — nghi ngờ mất bản dịch diện rộng`).toBeGreaterThan(0);
    expect.soft(thCount, `0/${rows.length} dòng commentary có bản dịch th-th — nghi ngờ mất bản dịch diện rộng`).toBeGreaterThan(0);
  });

  test('Tên đội có bản dịch đầy đủ 6 ngôn ngữ khác (ja, ko, zht, de, fr, es)', async () => {
    // Mở rộng ra ngoài vi/th đã test — kiểm tra thêm các ngôn ngữ khác mà hệ
    // thống hỗ trợ. QUAN TRỌNG: cột tiếng Trung ĐÚNG là "name_zht" (phồn thể,
    // có dữ liệu đầy đủ ~79k dòng toàn DB) — KHÔNG dùng "name_zh_cn"/
    // "name_zh_CN" (2 cột này gần như rỗng, chỉ 3 dòng toàn DB, có thể là
    // cột legacy/thử nghiệm bị bỏ hoang, không phải nguồn dữ liệu thật).
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT tl.id, tl.name_ja, tl.name_ko, tl.name_zht, tl.name_de, tl.name_fr, tl.name_es
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

    const LANGS = [
      { key: 'name_ja', label: 'Nhật' },
      { key: 'name_ko', label: 'Hàn' },
      { key: 'name_zht', label: 'Trung (phồn thể)' },
      { key: 'name_de', label: 'Đức' },
      { key: 'name_fr', label: 'Pháp' },
      { key: 'name_es', label: 'Tây Ban Nha' },
    ] as const;

    const coverage = LANGS.map(({ key, label }) => {
      const withLang = rows.filter((r) => !!r[key]).length;
      return { key, label, withLang, pct: (withLang / rows.length) * 100 };
    });

    console.log(`\n📊 Đa ngôn ngữ mở rộng ${NAME} (${rows.length} đội):`);
    coverage.forEach((c) => console.log(`  ${c.label} (${c.key}): ${c.withLang}/${rows.length} (${c.pct.toFixed(1)}%)`));

    saveJsonForSeason(SEASON_DIR, SLUG, `multilang-teams-extended.json`, { totalTeams: rows.length, coverage });

    // name_zht là cột dùng thật (đã verify có data đầy đủ toàn DB) — assert
    // riêng nghiêm ngặt hơn các ngôn ngữ khác (chỉ log tham khảo).
    const zhtCoverage = coverage.find((c) => c.key === 'name_zht')!;
    expect.soft(zhtCoverage.pct, `Chỉ ${zhtCoverage.pct.toFixed(1)}% đội có tên tiếng Trung (name_zht) — thấp bất thường so với dữ liệu toàn DB`).toBeGreaterThan(70);
  });

  test('team_locale.name_en đối chiếu chéo với ts_teams.name — cùng 1 đội, không lệch sang đội khác', async () => {
    // Compare chéo giữa 2 nguồn độc lập (ts_teams vs team_locale, join qua
    // cùng team id) — không dùng exact string match vì name_en hợp lệ có
    // thể là tên rút gọn (vd ts_teams="AFC Ajax" nhưng name_en="Ajax", hay
    // "FC Twente Enschede" vs "Twente" — đã verify đây là biến thể tên UI
    // bình thường, KHÔNG phải lỗi). Thay vào đó dùng fuzzy match dạng
    // substring (sau khi chuẩn hoá bỏ khoảng trắng/ký tự đặc biệt) — phát
    // hiện được lỗi thật sự nghiêm trọng hơn: name_en trỏ NHẦM SANG TÊN ĐỘI
    // KHÁC HẲN (vd do lệch ID khi đồng bộ locale).
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT t.id, t.name as ts_name, tl.name_en
         FROM (
           SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
           UNION
           SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
         ) x
         JOIN ts_teams t ON t.id = x.team_id
         LEFT JOIN team_locale tl ON tl.id = t.id`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có đội nào để đối chiếu.`);
      test.skip(true, 'Không có team data');
      return;
    }

    const withLocale = rows.filter((r) => !!r.name_en);
    const related = withLocale.filter((r) => {
      const a = normalize(r.ts_name);
      const b = normalize(r.name_en);
      return a.includes(b) || b.includes(a);
    });
    const unrelated = withLocale.filter((r) => !related.includes(r));

    console.log(`\n📊 Đối chiếu tên đội ts_teams vs team_locale ${NAME}: ${withLocale.length}/${rows.length} có locale, ${related.length}/${withLocale.length} tên liên quan hợp lý`);
    unrelated.forEach((r) => console.log(`  ✗ KHÔNG liên quan: ts_teams="${r.ts_name}" vs team_locale.name_en="${r.name_en}" — nghi ngờ lệch ID`));

    saveJsonForSeason(SEASON_DIR, SLUG, `team-locale-name-cross-check.json`, { totalTeams: rows.length, withLocale: withLocale.length, relatedCount: related.length, unrelated });

    expect(unrelated.length, `${unrelated.length} đội có team_locale.name_en KHÔNG liên quan gì tới tên thật trong ts_teams — nghi ngờ lệch ID đồng bộ locale`).toBe(0);
  });
});
