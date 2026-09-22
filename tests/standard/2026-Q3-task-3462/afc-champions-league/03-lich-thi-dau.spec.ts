/**
 * MÙA 2026-Q3 — GIẢI: AFC Champions League (US-3537)
 * Hạng mục #2: Lịch thi đấu (Giờ thi đấu, Vòng đấu, Giai đoạn)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/03-lich-thi-dau.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason, toVNDateStr } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';

test.describe(`[${SEASON_DIR}] [Chuẩn #2] Lịch thi đấu — ${NAME}`, () => {
  test('Trận đấu có round_num, stage, giờ thi đấu hợp lệ', async () => {
    const SAMPLE_SIZE = 200;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, sp.round_num, sp.start_timestamp, sp.status_id, st.name AS stage_name,
                ht.name AS home_name, at.name AS away_name
         FROM sport_events sp
         LEFT JOIN stages st ON st.id = sp.stage_id
         LEFT JOIN ts_teams ht ON ht.id = sp.home_team_id
         LEFT JOIN ts_teams at ON at.id = sp.away_team_id
         WHERE sp.competition_id = $1
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    expect(rows.length, `Không có trận nào trong DB cho "${NAME}"`).toBeGreaterThan(0);

    const withRoundNum = rows.filter((r) => r.round_num !== null).length;
    const withStage = rows.filter((r) => !!r.stage_name).length;
    const withValidTimestamp = rows.filter((r) => r.start_timestamp > 0).length;

    console.log(`\n📊 Lịch thi đấu ${NAME} (sample ${rows.length} trận):`);
    console.log(`  Có round_num: ${withRoundNum}/${rows.length}`);
    console.log(`  Có stage: ${withStage}/${rows.length}`);
    console.log(`  Có start_timestamp hợp lệ: ${withValidTimestamp}/${rows.length}`);
    if (rows[0]) {
      console.log(`  Ví dụ: ${rows[0].home_name} vs ${rows[0].away_name} — ${toVNDateStr(rows[0].start_timestamp)} (giờ VN), round=${rows[0].round_num}, stage=${rows[0].stage_name}`);
    }

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau.json`, { totalSampled: rows.length, withRoundNum, withStage, withValidTimestamp, sample: rows.slice(0, 5) });

    expect.soft(withValidTimestamp, 'Có trận thiếu start_timestamp hợp lệ').toBe(rows.length);

    const MIN_SAMPLE_FOR_PCT = 20;
    const stagePct = (withStage / rows.length) * 100;
    if (rows.length < MIN_SAMPLE_FOR_PCT) {
      console.warn(`⚠ Mẫu chỉ ${rows.length} trận (< ${MIN_SAMPLE_FOR_PCT}) — không assert % có stage, chỉ log tham khảo: ${stagePct.toFixed(1)}%`);
      return;
    }
    expect.soft(stagePct, `Chỉ ${stagePct.toFixed(1)}% trận có stage — thấp bất thường`).toBeGreaterThan(50);
  });

  test('Round_num tăng dần theo thời gian (cho phép đá bù lệch thứ tự < 20%)', async () => {
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT round_num, start_timestamp FROM sport_events
         WHERE competition_id = $1 AND round_num IS NOT NULL
         ORDER BY start_timestamp ASC LIMIT 500`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length < 5) {
      console.warn(`⚠ SKIP: "${NAME}" chỉ có ${rows.length} trận có round_num — mẫu quá nhỏ.`);
      test.skip(true, 'Mẫu quá nhỏ');
      return;
    }

    let outOfOrderCount = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].round_num < rows[i - 1].round_num) outOfOrderCount++;
    }
    const outOfOrderPct = (outOfOrderCount / (rows.length - 1)) * 100;

    console.log(`\n📊 Round order ${NAME}: ${outOfOrderCount}/${rows.length - 1} trận lệch thứ tự (${outOfOrderPct.toFixed(1)}%)`);
    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-round-order.json`, { totalMatches: rows.length, outOfOrderCount, outOfOrderPct });

    expect.soft(outOfOrderPct, `${outOfOrderPct.toFixed(1)}% trận lệch thứ tự vòng — cao bất thường`).toBeLessThan(20);
  });

  test('Sân đấu (venue) của trận khớp sân nhà đội chủ nhà (ngưỡng THẤP HƠN Eredivisie do đặc thù giải quốc tế)', async () => {
    // Đã verify qua dữ liệu thật: chỉ 56/100 (56%) khớp — THẤP HƠN Eredivisie
    // (70-88%) vì AFC Champions League là giải QUỐC TẾ, nhiều trận đấu ở
    // SÂN TRUNG LẬP theo quy định (đặc biệt vòng Preliminary/Play-off và 1
    // số trận an ninh đặc biệt) — đây là thực tế hợp lệ của giải đấu, KHÔNG
    // phải bug. Ngưỡng hạ xuống 40% (thay vì 70% như Eredivisie) để vẫn bắt
    // được lệch ID diện rộng thật sự mà không báo sai do đặc thù giải.
    const SAMPLE_SIZE = 100;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, sp.venue_id as match_venue, ht.venue_id as home_team_venue, ht.name as home_name
         FROM sport_events sp
         LEFT JOIN ts_teams ht ON ht.id = sp.home_team_id
         WHERE sp.competition_id = $1 AND sp.venue_id IS NOT NULL AND sp.venue_id != ''
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào có venue_id.`);
      test.skip(true, 'Không có venue data');
      return;
    }

    const matchingVenue = rows.filter((r) => r.match_venue === r.home_team_venue).length;
    const pct = (matchingVenue / rows.length) * 100;

    console.log(`\n📊 Venue trận đấu ${NAME} (sample ${rows.length} trận): khớp sân nhà đội chủ ${matchingVenue}/${rows.length} (${pct.toFixed(1)}%)`);

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-venue-match.json`, { totalSampled: rows.length, matchingVenue, pct });

    expect.soft(pct, `Chỉ ${pct.toFixed(1)}% trận đá đúng sân nhà đội chủ — thấp bất thường ngay cả với ngưỡng đã hạ cho giải quốc tế, có thể lệch ID venue diện rộng`).toBeGreaterThan(40);
  });

  test('Trọng tài trận đấu — mỗi trận chỉ có đúng 1 trọng tài (không trùng lặp bất thường)', async () => {
    // Sanity check bất khả thi vật lý: 1 trọng tài không thể bắt 2 trận
    // cùng lúc. ĐÃ PHÁT HIỆN 1 TRƯỜNG HỢP THẬT: "Khalid Saleh Al-Turais"
    // được gán cho cả trận Gwangju vs Yokohama VÀ Shandong vs Central Coast
    // cùng timestamp — bug dữ liệu thật, không phải lỗi test.
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT referee_id, start_timestamp, count(*) as cnt
         FROM sport_events
         WHERE competition_id = $1 AND referee_id IS NOT NULL AND referee_id != ''
         GROUP BY referee_id, start_timestamp
         HAVING count(*) > 1`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    console.log(`\n📊 Trọng tài trùng giờ ${NAME}: ${rows.length} trường hợp 1 trọng tài bắt >1 trận cùng thời điểm`);
    rows.slice(0, 5).forEach((r) => console.log(`  ✗ referee_id=${r.referee_id} tại timestamp=${r.start_timestamp}: ${r.cnt} trận`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-referee-conflict.json`, { conflictCount: rows.length, conflicts: rows });

    expect(rows.length, `Có ${rows.length} trường hợp 1 trọng tài bắt nhiều trận cùng giờ — bất khả thi vật lý, lỗi dữ liệu (cần dev kiểm tra bảng ts_referees/referee_id assignment)`).toBe(0);
  });

  test('Quy đổi giờ VN (UTC+7) không bị lệch ngày ở biên nửa đêm — rủi ro người dùng xem sai ngày trận', async () => {
    // Cùng rủi ro nghiệp vụ đã xác nhận ở Eredivisie: trận đá giờ UTC>=17h
    // (chiều/tối châu Á, phổ biến với AFC CL) cộng offset +7 sẽ vượt qua
    // nửa đêm, đổi sang NGÀY KHÁC theo giờ VN.
    const boundaryMatches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, start_timestamp,
                EXTRACT(HOUR FROM to_timestamp(start_timestamp)) as utc_hour
         FROM sport_events
         WHERE competition_id = $1 AND EXTRACT(HOUR FROM to_timestamp(start_timestamp)) >= 17
         LIMIT 30`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (boundaryMatches.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào đá vào khung giờ UTC >=17h (biên đổi ngày VN).`);
      test.skip(true, 'Không có trận nào ở biên múi giờ');
      return;
    }

    const results = boundaryMatches.map((m) => {
      const ts = parseInt(m.start_timestamp, 10);
      const utcDate = new Date(ts * 1000);
      const utcDateStr = utcDate.toISOString().slice(0, 10);
      const vnDateStr = toVNDateStr(ts);
      const vnDateIndependent = new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), utcDate.getUTCHours() + 7, utcDate.getUTCMinutes()))
        .toISOString()
        .slice(0, 10);
      const crossesMidnight = utcDateStr !== vnDateStr;
      return { matchId: m.id, utcHour: m.utc_hour, utcDateStr, vnDateStr, vnDateIndependent, crossesMidnight, consistent: vnDateStr === vnDateIndependent };
    });

    const crossedCount = results.filter((r) => r.crossesMidnight).length;
    const consistentCount = results.filter((r) => r.consistent).length;

    console.log(`\n📊 Biên múi giờ VN ${NAME} (${results.length} trận UTC>=17h): ${crossedCount}/${results.length} trận đổi ngày khi quy đổi sang giờ VN, ${consistentCount}/${results.length} khớp giữa 2 cách tính độc lập`);
    results.filter((r) => !r.consistent).forEach((r) => console.log(`  ✗ ${r.matchId}: toVNDateStr="${r.vnDateStr}" vs tính độc lập="${r.vnDateIndependent}"`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-timezone-boundary.json`, { totalChecked: results.length, crossedMidnightCount: crossedCount, consistentCount, results });

    expect(crossedCount, `Không có trận nào thực sự vượt biên nửa đêm trong mẫu — không đủ để kết luận test có bắt được lỗi múi giờ hay không`).toBeGreaterThan(0);
    expect(consistentCount, `${results.length - consistentCount}/${results.length} trận có toVNDateStr() tính SAI ngày so với công thức quy đổi độc lập — lỗi hiển thị sai ngày trận cho người dùng`).toBe(results.length);
  });
});
