/**
 * BỘ KHUNG CHUẨN — Hạng mục #2: Lịch thi đấu (Giờ thi đấu, Vòng đấu, Giai đoạn)
 *
 * Dùng thẳng bảng sport_events (đã xác nhận đúng bảng bóng đá thật — KHÔNG
 * nhầm với am_football_sport_events, bảng đó là American Football).
 *
 * CHẠY:
 *   TEST_COMPETITION_ID=jednm9whz0ryox8 npx playwright test tests/standard/03-lich-thi-dau.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from './lib/db';
import { getCompetitionIdFromEnv } from './lib/competition-context';
import { saveJson, toVNDateStr } from './lib/helpers';

test.describe('[Chuẩn #2] Lịch thi đấu — Giờ, Vòng đấu, Giai đoạn', () => {
  const competitionId = getCompetitionIdFromEnv();

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
        [competitionId, SAMPLE_SIZE]
      );
      return res.rows;
    });

    expect(rows.length, `Không có trận nào trong DB cho competitionId "${competitionId}"`).toBeGreaterThan(0);

    const withRoundNum = rows.filter((r) => r.round_num !== null).length;
    const withStage = rows.filter((r) => !!r.stage_name).length;
    const withValidTimestamp = rows.filter((r) => r.start_timestamp > 0).length;

    console.log(`\n📊 Lịch thi đấu (sample ${rows.length} trận):`);
    console.log(`  Có round_num: ${withRoundNum}/${rows.length}`);
    console.log(`  Có stage: ${withStage}/${rows.length}`);
    console.log(`  Có start_timestamp hợp lệ: ${withValidTimestamp}/${rows.length}`);
    if (rows[0]) {
      console.log(`  Ví dụ: ${rows[0].home_name} vs ${rows[0].away_name} — ${toVNDateStr(rows[0].start_timestamp)} (giờ VN), round=${rows[0].round_num}, stage=${rows[0].stage_name}`);
    }

    saveJson(`lich-thi-dau.json`, {
      totalSampled: rows.length,
      withRoundNum,
      withStage,
      withValidTimestamp,
      sample: rows.slice(0, 5),
    });

    expect.soft(withValidTimestamp, 'Có trận thiếu start_timestamp hợp lệ').toBe(rows.length);

    // Mẫu quá nhỏ (giải nhỏ/trẻ — đã verify Israel U17 National League chỉ
    // có 9 trận tổng) khiến % dao động mạnh và vô nghĩa thống kê — chỉ log,
    // không assert %.
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
        [competitionId]
      );
      return res.rows;
    });

    if (rows.length < 5) {
      console.warn(`⚠ SKIP: chỉ có ${rows.length} trận có round_num — mẫu quá nhỏ để đánh giá thứ tự (giải cup 1 trận không có nhiều vòng).`);
      test.skip(true, 'Mẫu quá nhỏ');
      return;
    }

    let outOfOrderCount = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].round_num < rows[i - 1].round_num) outOfOrderCount++;
    }
    const outOfOrderPct = (outOfOrderCount / (rows.length - 1)) * 100;

    console.log(`\n📊 Round order: ${outOfOrderCount}/${rows.length - 1} trận lệch thứ tự (${outOfOrderPct.toFixed(1)}%)`);
    saveJson(`lich-thi-dau-round-order.json`, { totalMatches: rows.length, outOfOrderCount, outOfOrderPct });

    expect.soft(outOfOrderPct, `${outOfOrderPct.toFixed(1)}% trận lệch thứ tự vòng — cao bất thường`).toBeLessThan(20);
  });
});
