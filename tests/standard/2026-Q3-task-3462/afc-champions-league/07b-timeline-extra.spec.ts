/**
 * MÙA 2026-Q3 — GIẢI: AFC Champions League (US-3537)
 * Hạng mục #18: Chi tiết trận đấu (2) — MỞ RỘNG (Timeline)
 *
 * Port từ Eredivisie — verify timeline event xếp đúng thứ tự thời gian
 * (period_id tăng dần, time_stamp tăng dần trong cùng period).
 *
 * GIỚI HẠN ĐÃ XÁC NHẬN (giống Eredivisie): timeline UI hiển thị trên web
 * dùng ID nội bộ frontend (api.uni-score.com) — hệ ID thứ 3, không map được
 * với Opta match ID qua bất kỳ bảng nào tìm thấy trong DB. Chỉ verify được
 * TÍNH ĐÚNG ĐẮN DỮ LIỆU timeline ở tầng DB.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/07b-timeline-extra.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason, discoverFrontendEventId } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';

// Period thi đấu thật (hiệp 1, hiệp 2, hiệp phụ 1/2, penalty) — AFC CL đã
// xác nhận CÓ trận đá tới period 5 (luân lưu, khác Eredivisie phần lớn chỉ
// tới period 2) do có knockout stage — giữ đủ 1-5 để không bỏ sót trận cúp.
const PLAYING_PERIODS = [1, 2, 3, 4, 5];

test.describe(`[${SEASON_DIR}] [Chuẩn #18] Timeline trận đấu — ${NAME}`, () => {
  test('Timeline event xếp đúng thứ tự thời gian (period tăng dần, time_stamp tăng dần trong period)', async () => {
    const matches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, mm.opta_id
         FROM sport_events sp
         JOIN mp_match mm ON mm.thesport_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY sp.start_timestamp DESC LIMIT 10`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (matches.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào map được Opta ID.`);
      test.skip(true, 'Không có trận nào map được Opta ID');
      return;
    }

    const results: any[] = [];
    for (const m of matches) {
      const events = await withClient(async (client) => {
        const res = await client.query(
          `SELECT period_id, time_min, time_sec, time_stamp FROM opta_match_event
           WHERE match_id = $1 AND period_id = ANY($2)
           ORDER BY time_stamp ASC`,
          [m.opta_id, PLAYING_PERIODS]
        );
        return res.rows;
      });

      if (events.length === 0) {
        results.push({ matchId: m.id, totalEvents: 0, checked: false });
        continue;
      }

      let periodOutOfOrder = 0;
      let timestampOutOfOrder = 0;
      for (let i = 1; i < events.length; i++) {
        if (events[i].period_id < events[i - 1].period_id) periodOutOfOrder++;
        if (new Date(events[i].time_stamp) < new Date(events[i - 1].time_stamp)) timestampOutOfOrder++;
      }

      results.push({
        matchId: m.id,
        totalEvents: events.length,
        checked: true,
        periodOutOfOrder,
        timestampOutOfOrder,
        valid: periodOutOfOrder === 0 && timestampOutOfOrder === 0,
      });
    }

    const checked = results.filter((r) => r.checked);
    const validCount = checked.filter((r) => r.valid).length;

    console.log(`\n📊 Timeline ${NAME}: ${checked.length} trận kiểm tra được, ${validCount}/${checked.length} có timeline đúng thứ tự`);
    checked.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ ${r.matchId}: periodOutOfOrder=${r.periodOutOfOrder}, timestampOutOfOrder=${r.timestampOutOfOrder}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `timeline.json`, { totalMatchesChecked: checked.length, validCount, results });

    expect(checked.length, 'Không có trận nào đủ dữ liệu timeline để kiểm tra').toBeGreaterThan(0);
    expect(validCount, `${checked.length - validCount} trận có timeline sai thứ tự (period hoặc timestamp bị đảo)`).toBe(checked.length);
  });

  test('Frontend API thật (graph) — timeline/momentum trận đấu trả về đúng cấu trúc và tự nhất quán', async ({ page, request }) => {
    // Cùng giới hạn tầng ID đã ghi ở đầu file — chỉ verify được khi frontend
    // đang index ít nhất 1 trận thật của giải (bỏ qua nếu off-season/không
    // được index — đã xác nhận AFC CL hiện không được frontend index qua
    // các case tương tự ở 07/08).
    const eventId = await discoverFrontendEventId(page, SLUG);

    if (!eventId) {
      console.warn(`⚠ SKIP: "${NAME}" hiện không có trận nào được frontend index — không có URL trận thật để gọi API.`);
      test.skip(true, 'Không tìm được link trận thật trên frontend');
      return;
    }

    const r = await request.get(`https://api.uni-score.com/api/v2/football/event/${eventId}/graph`);
    console.log(`\n📊 Frontend API graph (timeline) cho eventId=${eventId}: status=${r.status()}`);

    expect(r.status(), `API graph trả về lỗi cho eventId=${eventId}`).toBe(200);
    const body = await r.json();
    expect(body, 'Response JSON phải có field data').toHaveProperty('data');

    const data = body.data;
    const graphPoints = Array.isArray(data?.graphPoints) ? data.graphPoints : [];
    const expectedMinPoints = (data?.periodCount ?? 0) * (data?.periodTime ?? 0);

    console.log(`  periodCount=${data?.periodCount}, periodTime=${data?.periodTime}, graphPoints.length=${graphPoints.length}, kỳ vọng >= ${expectedMinPoints}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `timeline-frontend-api.json`, {
      eventId,
      status: r.status(),
      periodCount: data?.periodCount,
      periodTime: data?.periodTime,
      graphPointsCount: graphPoints.length,
      expectedMinPoints,
    });

    if (expectedMinPoints > 0) {
      expect(graphPoints.length, `graphPoints chỉ có ${graphPoints.length} điểm, thấp hơn kỳ vọng ${expectedMinPoints} (periodCount*periodTime) — dữ liệu momentum có thể bị cắt cụt`).toBeGreaterThanOrEqual(expectedMinPoints);
    }
  });
});
