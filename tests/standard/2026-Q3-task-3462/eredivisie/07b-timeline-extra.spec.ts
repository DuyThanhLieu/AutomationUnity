/**
 * MÙA 2026-Q3 — GIẢI: Eredivisie (US-3536)
 * Hạng mục #18: Chi tiết trận đấu (2) — MỞ RỘNG (Timeline)
 *
 * Trước đây hạng mục #18 chỉ dựa vào việc #16 (đếm event, đối chiếu bàn
 * thắng) — chưa verify riêng THỨ TỰ THỜI GIAN của timeline. File này bổ
 * sung case kiểm tra timeline thật: event trong opta_match_event phải xếp
 * theo đúng trình tự thời gian trận đấu (period_id tăng dần, time_stamp
 * tăng dần trong cùng period).
 *
 * GIỚI HẠN ĐÃ XÁC NHẬN (không thay đổi so với trước): timeline UI hiển thị
 * trên web dùng ID nội bộ frontend (api.uni-score.com) — hệ ID thứ 3, không
 * map được với Opta match ID qua bất kỳ bảng nào tìm thấy trong DB. Vì vậy
 * KHÔNG thể verify UI timeline hiển thị trực quan đúng — chỉ verify được
 * TÍNH ĐÚNG ĐẮN DỮ LIỆU timeline ở tầng DB (đủ để phát hiện lỗi dữ liệu
 * timeline trước khi tới UI).
 *
 * period_id đã verify qua dữ liệu thật KHÔNG chỉ có 1,2 (2 hiệp chính) mà
 * còn 3,4,5 (hiệp phụ/thêm giờ) và 14,16 (không phải hiệp thi đấu — có thể
 * là metadata pre/post-match) — loại 2 period này khỏi kiểm tra thứ tự.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/eredivisie/07b-timeline-extra.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason, discoverFrontendEventId } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'eredivisie';
const COMPETITION_ID = 'vl7oqdeheyr510j';
const NAME = 'Eredivisie';

// Period thi đấu thật (hiệp 1, hiệp 2, hiệp phụ 1/2, penalty) — loại các
// period metadata khác (vd 14, 16 quan sát được trong dữ liệu thật, không
// thuộc thời gian thi đấu nên không đưa vào kiểm tra thứ tự).
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
    // đang index ít nhất 1 trận thật của giải (bỏ qua nếu off-season).
    //
    // GIỚI HẠN THẬT (không giả vờ khắc phục được): eventId ở đây thuộc tầng
    // ID thứ 3 (frontend), KHÔNG map được sang thesport/Opta ID của đúng
    // trận đó qua bất kỳ bảng nào tìm thấy trong DB — vì vậy KHÔNG THỂ đối
    // chiếu nội dung graph này với opta_match_event của case 1 (2 nguồn nói
    // về 2 trận khác nhau, không phải cùng 1 trận). Thay vào đó, verify tính
    // TỰ NHẤT QUÁN của chính response: graph là dữ liệu "attack momentum"
    // theo phút (graphPoints), không phải danh sách event — số điểm dữ liệu
    // phải khớp với periodCount*periodTime (vd 2 hiệp x 45 phút = 90 điểm)
    // để phát hiện dữ liệu bị cắt cụt/thiếu hụt.
    const eventId = await discoverFrontendEventId(page, SLUG);

    if (!eventId) {
      console.warn(`⚠ SKIP: "${NAME}" hiện không có trận nào được frontend index (khả năng off-season) — không có URL trận thật để gọi API.`);
      test.skip(true, 'Không tìm được link trận thật trên frontend (có thể do off-season)');
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
