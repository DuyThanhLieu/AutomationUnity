/**
 * TICKET: [API][Football][TheSport] injuryTime hiệp 2 không bao giờ bắn
 * socket, API luôn trả announcedInjuryTime = 0
 *
 * 2 lỗi độc lập:
 *   Lỗi 1 (Consumer, repo consumer-football-incidents): period-end (type 11
 *     HT / 12 FT / 26 / 27) thắng vĩnh viễn trong applyInjuryTimeSideEffects
 *     — khiến current_injury_time không bao giờ được set lại sau khi hiệp 1
 *     kết thúc, injury hiệp 2 (90+X) 0/14 trận bắn được.
 *   Lỗi 2 (API, repo uni-football-api): reader TheSport (GetCurrentInjuryTime)
 *     là dead code — không có caller, không nằm trong port interface nào.
 *     OverrideInjuryTime chỉ đọc Opta live-score, "intentionally no fallback"
 *     — trận TS-only (không map Opta) → announcedInjuryTime luôn = 0.
 *
 * PHẠM VI TEST: đây là bộ test BLACK-BOX (Redis + socket log OpenObserve +
 * API thật) — project này (AutomationUnity/tests/standard) KHÔNG chứa source
 * code Go của 2 repo trên, nên KHÔNG viết unit test cho injuryPeriod()/
 * applyInjuryTimeSideEffects() ở đây. Muốn unit test logic thuần (theo bảng
 * replay 1,859,820 message / 6,294 trận trong ticket), cần làm trong chính
 * repo Go tương ứng (*_test.go), ngoài phạm vi project Playwright này.
 *
 * ĐÃ XÁC NHẬN: dữ liệu incident/injury time (type=19, add_time,
 * current_injury_time) KHÔNG được lưu trong Postgres — đã kiểm tra
 * ts_match_incidents/ts_match_live_history/ts_matches đều 0 dòng ở DB test
 * hiện tại. Dữ liệu chỉ tồn tại trong pipeline live (Kafka → consumer →
 * Redis → socket), đúng như ticket mô tả — vì vậy các case dưới đây bắt buộc
 * phải nối Redis/OpenObserve/API thật, KHÔNG thể dùng Postgres thay thế.
 *
 * ⚠️ TRẠNG THÁI CONFIG (2026-08-11):
 *   - Redis (lib/redis.ts): CHƯA có host/port/password thật — mọi case Redis
 *     sẽ SKIP với log rõ lý do cho tới khi điền REDIS_CONFIG.
 *   - OpenObserve (lib/openobserve.ts): CHƯA có baseUrl/org/apiKey thật —
 *     tương tự, SKIP cho tới khi điền OPENOBSERVE_CONFIG.
 *   - API announcedInjuryTime: CHƯA xác nhận path chính xác (giả định cùng
 *     base api.uni-score.com như các case Frontend API khác trong project,
 *     nhưng path/field cụ thể cần tra lại — xem TODO trong case #4).
 *
 * CHẠY (sau khi điền đủ config):
 *   npx playwright test tests/standard/2026-Q3-task-3462/injury-time/injury-time.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { isRedisConfigured, withRedis } from '../../lib/redis';
import { isOpenObserveConfigured, queryOpenObserve } from '../../lib/openobserve';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'injury-time';

// Match TS-only đang live để verify — KHÔNG có sẵn cách tự động phát hiện
// "trận TS-only đang live" từ Postgres (dữ liệu incident không nằm ở đây).
// Điền match_id thật (lấy từ dashboard nội bộ hoặc Redis SCAN event:*) trước
// khi chạy case #1/#3/#4/#5.
const TS_ONLY_LIVE_MATCH_IDS: string[] = []; // TODO: điền match_id thật đang live, TS-only (không map Opta)

test.describe('[Ticket] TheSport injuryTime — Redis current_injury_time', () => {
  test('AC #1: Trận TS-only đang live — current_injury_time có giá trị ở phút ~44-45 và ~89-90, bị xoá sau tiếng còi', async () => {
    if (!isRedisConfigured()) {
      console.warn('⚠ SKIP: Redis chưa được config (lib/redis.ts REDIS_CONFIG.host = TODO_REDIS_HOST). Điền host/port/password thật để chạy case này.');
      test.skip(true, 'Redis chưa config');
      return;
    }
    if (TS_ONLY_LIVE_MATCH_IDS.length === 0) {
      console.warn('⚠ SKIP: chưa có match_id TS-only đang live nào để kiểm tra (TS_ONLY_LIVE_MATCH_IDS rỗng).');
      test.skip(true, 'Chưa có match_id để test');
      return;
    }

    const results = await withRedis(async (client) => {
      const out: any[] = [];
      for (const matchId of TS_ONLY_LIVE_MATCH_IDS) {
        const value = await client.hget(`event:${matchId}`, 'current_injury_time');
        out.push({ matchId, currentInjuryTimeMinutes: value ? parseInt(value, 10) : null });
      }
      return out;
    });

    console.log(`\n📊 current_injury_time cho ${results.length} trận TS-only đang live:`);
    results.forEach((r) => console.log(`  ${r.matchId}: ${r.currentInjuryTimeMinutes ?? 'RỖNG (nil)'}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `redis-current-injury-time.json`, results);

    // Ticket: injury hiệp 2 (90+X) hiện tại 0/14 trận bắn được — sau fix phải
    // có giá trị khi trận đang ở phút ~89-90 (nếu vendor gửi type 19 cho hiệp 2).
    const withValue = results.filter((r) => r.currentInjuryTimeMinutes !== null);
    expect.soft(withValue.length, `0/${results.length} trận có current_injury_time — nghi ngờ bug Lỗi 1 (period-end thắng vĩnh viễn) chưa được fix, hoặc trận không ở thời điểm injury`).toBeGreaterThan(0);
  });

  test('AC #6: add_time <= 0 và time outlier (vd time=4, time=901) phải bị reject, không set current_injury_time', async () => {
    // Ticket nêu rõ: feed có ~90 doc add_time âm/0, và time outlier (4/901) —
    // đây là input cần verify bị lọc, KHÔNG lan vào current_injury_time.
    // Không có cách xác định trước match_id nào có input outlier tại 1 thời
    // điểm cụ thể (dữ liệu tức thời, không lưu DB) — case này chỉ verify
    // được nếu bắt được đúng lúc 1 trận có input outlier đang live, hoặc qua
    // OpenObserve log tìm message add_time<=0 rồi trace matchId đó.
    if (!isOpenObserveConfigured()) {
      console.warn('⚠ SKIP: OpenObserve chưa được config — không tìm được sample match có add_time<=0 để verify Redis không bị nhiễm giá trị outlier này.');
      test.skip(true, 'OpenObserve chưa config, không có cách khác để tìm sample outlier');
      return;
    }
    // TODO (sau khi có OpenObserve): query stream chứa raw incident log (nếu
    // có), tìm message type=19 với add_time<=0 hoặc time NOT IN [1..90], lấy
    // match_id, rồi hget event:<matchId> current_injury_time — kỳ vọng KHÔNG
    // phản ánh giá trị rác đó.
    test.skip(true, 'TODO: implement sau khi xác nhận OpenObserve stream chứa raw incident (không chỉ socket publish log)');
  });
});

test.describe('[Ticket] TheSport injuryTime — Socket fb-live-v1', () => {
  test('AC #2: Topic fb-live-v1 xuất hiện message source="ts" với score[5] != 0 (hiện tại 12h qua = 0 message)', async () => {
    if (!isOpenObserveConfigured()) {
      console.warn('⚠ SKIP: OpenObserve chưa được config (lib/openobserve.ts OPENOBSERVE_CONFIG.baseUrl = TODO_OPENOBSERVE_URL).');
      test.skip(true, 'OpenObserve chưa config');
      return;
    }

    const nowUs = Date.now() * 1000;
    const twelveHoursUs = 12 * 60 * 60 * 1_000_000;
    // TODO: xác nhận đúng tên field trong log (ticket ghi "score[5] != 0" —
    // giả định log lưu score dạng array, cần biết field JSON path thật để
    // viết SQL đúng, vd score[5] hay tuple thứ 6 tên khác).
    const sql = `SELECT * FROM emqx_events_publish WHERE source = 'ts' AND topic = 'fb-live-v1'`;

    const result = await queryOpenObserve(sql, nowUs - twelveHoursUs, nowUs);
    const withNonZeroInjury = result.hits.filter((h) => Array.isArray(h.score) && h.score[5] !== 0);

    console.log(`\n📊 Socket fb-live-v1, source=ts, 12h qua: ${result.hits.length} message, ${withNonZeroInjury.length} có score[5] != 0`);
    saveJsonForSeason(SEASON_DIR, SLUG, `socket-ts-injury-messages.json`, { totalTsMessages: result.hits.length, withNonZeroInjury: withNonZeroInjury.length });

    expect(withNonZeroInjury.length, `0/${result.hits.length} message source=ts có score[5] != 0 trong 12h qua — Lỗi 1 (Consumer) có thể chưa được fix`).toBeGreaterThan(0);
  });

  test('AC #3: Injury hiệp 2 (90+X) bắn được — hiện tại 0/14 trận (baseline trước fix)', async () => {
    if (!isOpenObserveConfigured()) {
      console.warn('⚠ SKIP: OpenObserve chưa được config.');
      test.skip(true, 'OpenObserve chưa config');
      return;
    }

    const nowUs = Date.now() * 1000;
    const twelveHoursUs = 12 * 60 * 60 * 1_000_000;
    const sql = `SELECT * FROM emqx_events_publish WHERE source = 'ts' AND topic = 'fb-live-v1'`;
    const result = await queryOpenObserve(sql, nowUs - twelveHoursUs, nowUs);

    // Hiệp 2 = time bucket quanh 90 (đã verify feed phân bố 90-102 cho type
    // 12/period-end, và injury hiệp 2 thực tế nằm ngay trước đó ~90-94).
    const secondHalfInjuryMessages = result.hits.filter((h) => Array.isArray(h.score) && h.score[5] > 0 && h.matchTime >= 90 && h.matchTime <= 100);
    const distinctMatches = new Set(secondHalfInjuryMessages.map((h) => h.matchId));

    console.log(`\n📊 Injury hiệp 2 (90+X) trong 12h qua: ${distinctMatches.size} trận có message, ${secondHalfInjuryMessages.length} message tổng`);
    saveJsonForSeason(SEASON_DIR, SLUG, `socket-second-half-injury.json`, { distinctMatches: distinctMatches.size, messageCount: secondHalfInjuryMessages.length });

    expect(distinctMatches.size, `0 trận bắn injury hiệp 2 (90+X) qua socket — đúng bug Lỗi 1 mô tả trong ticket (period-end type 11 thắng vĩnh viễn, chặn re-set current_injury_time sau hiệp 1)`).toBeGreaterThan(0);
  });
});

test.describe('[Ticket] TheSport injuryTime — API announcedInjuryTime', () => {
  test('AC #4: announcedInjuryTime khác 0 trên trận TS-only đang live, đơn vị giây', async ({ request }) => {
    // TODO: xác nhận path API thật chứa field announcedInjuryTime — ticket
    // chỉ nêu tên field, không nêu route. Giả định tạm theo pattern các case
    // Frontend API khác trong project (api.uni-score.com/api/v2/football/...).
    // Cần 1 trong 2: (a) endpoint /overview trả trực tiếp announcedInjuryTime
    // theo eventId, hoặc (b) endpoint khác — SỬA URL dưới đây sau khi xác nhận.
    if (TS_ONLY_LIVE_MATCH_IDS.length === 0) {
      console.warn('⚠ SKIP: chưa có match/event ID TS-only đang live để gọi API.');
      test.skip(true, 'Chưa có match_id để test');
      return;
    }

    const API_PATH_TEMPLATE = 'TODO'; // TODO: điền path thật, vd `https://api.uni-score.com/api/v2/football/event/${eventId}/overview`
    if (API_PATH_TEMPLATE === 'TODO') {
      console.warn('⚠ SKIP: chưa xác nhận path API chứa announcedInjuryTime — cần tra lại trước khi implement case này.');
      test.skip(true, 'Chưa xác nhận API path');
      return;
    }

    const results: any[] = [];
    for (const eventId of TS_ONLY_LIVE_MATCH_IDS) {
      const r = await request.get(`https://api.uni-score.com/api/v2/football/event/${eventId}/overview`);
      const body = await r.json().catch(() => null);
      const announcedInjuryTime = body?.data?.announcedInjuryTime ?? null;
      results.push({ eventId, status: r.status(), announcedInjuryTime });
    }

    console.log(`\n📊 announcedInjuryTime cho ${results.length} trận TS-only:`);
    results.forEach((r) => console.log(`  ${r.eventId}: status=${r.status}, announcedInjuryTime=${r.announcedInjuryTime}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `api-announced-injury-time.json`, results);

    const nonZeroCount = results.filter((r) => r.announcedInjuryTime && r.announcedInjuryTime !== 0).length;
    expect(nonZeroCount, `0/${results.length} trận TS-only có announcedInjuryTime != 0 — đúng bug Lỗi 2 (reader TheSport dead code, OverrideInjuryTime không fallback)`).toBeGreaterThan(0);
  });

  test('AC #5: Trận vào ET (extra time) — injury time trả về 0, không leak giá trị hiệp 2', async ({ request }) => {
    // Ngoài phạm vi fix (ET1/ET2 không làm trong ticket này) — case này verify
    // hành vi AN TOÀN: KHÔNG được leak giá trị injury hiệp 2 cũ sang ET, chứ
    // không verify injury time đúng cho ET (không trong scope).
    console.warn('⚠ TODO: cần 1 trận đang ở ET thật (rất hiếm, phải bắt live) để verify — chưa có match_id mẫu. Case giữ placeholder, không skip cứng để không quên khi có điều kiện chạy.');
    test.skip(true, 'Cần trận ET thật đang live — chưa xác định được match_id mẫu tại thời điểm viết test');
  });
});
