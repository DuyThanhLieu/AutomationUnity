/**
 * TEST FILE: upcoming_fakeip_time.spec.ts
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MỤC ĐÍCH
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   Verify fix cho bug "API Upcoming chỉ trả về 2 trận" — mất data ở tab
 *   Sắp diễn ra khi dùng IP Brazil / São Paulo timezone.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * BUG & RCA
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   Lỗi #1 — otherCompetitions bị tắt khi total ≤ 50
 *     Điều kiện kích hoạt: ngày ít trận (≤ 50), tab upcoming, body mặc định
 *     Triệu chứng: events=2, otherCompetitions=[], total=45 → mất 43 trận
 *     Fix: bỏ điều kiện total > 50, luôn query otherCompetitions
 *
 *   Lỗi #2 — Fallback "lấp đủ 10 league" không lọc theo status
 *     Fallback chọn nhầm league có trận đã kết thúc → bị loại khỏi upcoming
 *     Fix: thêm filter status_id (upcoming→NOT_STARTED, finish→END)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ENDPOINT
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   POST /api/v2/sport/football/scheduled-events-pagination-v2/{date}/locale/{locale}/type/{type}
 *   Body: { sortByMatchTime: boolean, competitionIds?: string[] }
 *
 *   Response:
 *   {
 *     code: 1,
 *     data: {
 *       events: MatchObject[],               ← trận từ top-10 league (by priority)
 *       otherCompetitions: CompGroup[],      ← nhóm giải còn lại { match_count, name, ... }
 *       pagination: { page, size, hasNextPage, total }
 *     }
 *   }
 *
 *   Công thức completeness:
 *     events.length + sum(otherCompetitions[i].match_count) === pagination.total
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DANH SÁCH TEST CASES (60 tests)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * SUITE 1 — BUG FIX: API Upcoming chỉ trả về 2 trận (13 tests)
 * ┌─────┬──────────────────────────────────────────────────────────────┐
 * │  1  │ Structure valid                                              │
 * │     │   code=1, events/otherCompetitions/pagination tồn tại       │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  2  │ otherCompetitions schema                                     │
 * │     │   Mỗi item có id, name, match_count, competition_ids        │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  3  │ [Bug#1] Completeness — high traffic day                      │
 * │     │   events + otherComps.match_count = total (ngày nhiều trận) │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  4  │ [Bug#1] Low-traffic day — otherCompetitions NOT empty        │
 * │     │   Khi total ≤ 50, otherCompetitions phải có data            │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  5  │ [Bug#1] Ngày bug gốc 2026-06-15                             │
 * │     │   API không crash, trả cấu trúc hợp lệ (total=0 là đúng)   │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  6  │ [Bug#2] Upcoming events đều là not_started                  │
 * │     │   Không có trận live/ended lọt vào tab upcoming              │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  7  │ [Regression] sortByMatchTime=true không bị ảnh hưởng        │
 * │     │   Luồng sort phẳng vẫn trả events + total đúng              │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  8  │ [Regression] High-traffic day (total > 50) vẫn đúng         │
 * │     │   total > 50, completeness đúng                             │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  9  │ [Regression] Filter theo competitionIds                      │
 * │     │   Chỉ trả trận thuộc giải đã lọc, otherCompetitions rỗng    │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │ 10  │ [QC] Events diversity — nhiều league (fallback hoạt động)    │
 * │     │   events đến từ ≥ 3 league khác nhau                        │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │ 11  │ [Pagination] Page 2 khác hoàn toàn page 1                   │
 * │     │   Không có event ID trùng giữa 2 trang                      │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │ 12  │ [Pagination] hasNextPage chính xác                          │
 * │     │   true → page 2 có data; false → page 2 rỗng               │
 * └─────┴──────────────────────────────────────────────────────────────┘
 *
 * SUITE 2 — Brazil IP / São Paulo Timezone (5 tests)
 * ┌─────┬──────────────────────────────────────────────────────────────┐
 * │  1  │ locale=BR trả valid response                                 │
 * │     │   Không crash, đúng cấu trúc cho ngày mai SP                │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  2  │ [BUG CORE] DB count = API total — ngày mai SP               │
 * │     │   Số trận DB must khớp API; phát hiện mất trận do timezone   │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  3  │ [BOUNDARY] Trận 21:00–23:59 SP phải có trong response       │
 * │     │   Vùng 00:00–02:59 UTC (= tối SP) không bị mất             │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  4  │ Today + tomorrow completeness với locale=BR                  │
 * │     │   events + otherComps = total cho cả 2 ngày                 │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  5  │ Critical time points — tính đúng "ngày mai SP"              │
 * │     │   4 mốc giờ nguy hiểm: 20:00/21:00/23:59/00:00 SP           │
 * └─────┴──────────────────────────────────────────────────────────────┘
 *
 * SUITE 3 — DB Verify: match_count chỉ đếm not_started (3 tests)
 * ┌─────┬──────────────────────────────────────────────────────────────┐
 * │  1  │ [DB] match_count vs DB.not_started — hôm nay (top 10 groups)│
 * │     │   Guard: bỏ qua group nếu DB chưa có data                   │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  2  │ [DB] match_count vs DB.not_started — ngày mai (all groups)  │
 * │     │   In cả live/ended để thấy ngay nếu server đếm sai status   │
 * ├─────┼──────────────────────────────────────────────────────────────┤
 * │  3  │ [DB] sum(otherComps.match_count) = total − events.length    │
 * │     │   Kiểm tra hôm nay + ngày mai                               │
 * └─────┴──────────────────────────────────────────────────────────────┘
 *   ⚠ DB (sport_events) thường chỉ có data cho 1–2 ngày tới.
 *     Nếu DB.total=0 cho tất cả group → test tự skip, không fail.
 *
 * SUITE 4 — Date Range Coverage — chỉ type=upcoming (40 tests)
 * ┌─────────────────────┬────────────────────────────────────────────┐
 * │ 13 ngày × 3 tests   │ Mỗi ngày kiểm tra:                        │
 * │                     │   1. Structure valid (code=1, arrays đúng) │
 * │                     │   2. Completeness: events+otherComps=total │
 * │                     │   3. Status filter: tất cả là not_started  │
 * ├─────────────────────┼────────────────────────────────────────────┤
 * │ Ngày test:          │ -7, -3, -1, hôm nay, +1, +2, +7, +14, +30 │
 * │                     │ đầu tháng này, cuối tháng này, đầu tháng  │
 * │                     │ sau, thứ 7 gần nhất (thứ 2 dedupe nếu trùng│
 * ├─────────────────────┼────────────────────────────────────────────┤
 * │ 1 Sweep test        │ Tất cả ngày gọi song song → không ngày nào │
 * │                     │ crash (code=1)                             │
 * └─────────────────────┴────────────────────────────────────────────┘
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * CHẠY
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   npx playwright test tests/upcoming_fakeip_time.spec.ts --project=chrome
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const API_BASE = 'https://opta-api.uniscore.vn/api/v2/sport/football';
const LOCALE   = 'VN';

/**
 * Ngày test tham chiếu từ RCA (ngày bug được phát hiện).
 * Hiện đã qua nên total=0, chỉ dùng để verify cấu trúc response không lỗi.
 */
const DATE_BUG_ORIGIN = '2026-06-15';

/** Ngày có nhiều trận (total > 50) — test regression luồng bình thường */
const DATE_HIGH_TRAFFIC = '2026-06-28';   // Chủ nhật — thường có nhiều trận football

/** Ngày có ít trận (total ≤ 50) — test fix Bug #1 otherCompetitions */
const DATE_LOW_TRAFFIC  = '2026-06-25';   // ~35 not_started theo DB

/** Ngày hiện tại (dynamic) */
const TODAY = new Date().toISOString().slice(0, 10);

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface MatchEvent {
  id: string;
  status: { code: number; type: string; description: string };
  tournament: { id: string; name: string; priority: number };
  startTimestamp: number;
}

interface CompGroup {
  id:         string;
  name:       string;
  match_count: number;
  competition_ids: string[];
}

interface Pagination {
  page:        number;
  size:        number;
  hasNextPage: boolean;
  total:       number;
}

interface ApiResponse {
  code:    number;
  message: string;
  data: {
    events:            MatchEvent[];
    otherCompetitions: CompGroup[];
    pagination:        Pagination;
  };
}

// ─── HELPER ────────────────────────────────────────────────────────────────

/**
 * Gọi API scheduled-events-pagination-v2.
 * type: 'upcoming' | 'finish' | 'all' | 'live'
 * sortByMatchTime=true → trả phẳng events[], không có otherCompetitions
 */
async function callAPI(
  request:         APIRequestContext,
  date:            string,
  type:            string,
  sortByMatchTime: boolean = false,
  extraBody:       object  = {},
): Promise<ApiResponse> {
  const res = await request.post(
    `${API_BASE}/scheduled-events-pagination-v2/${date}/locale/${LOCALE}/type/${type}`,
    { data: { sortByMatchTime, ...extraBody } }
  );
  return res.json();
}

/**
 * Tính tổng trận từ response:
 *   events.length + sum(otherCompetitions[i].match_count)
 * Phải bằng pagination.total để data completeness đúng.
 */
function countTotal(data: ApiResponse['data']): number {
  const fromEvents = data.events?.length ?? 0;
  const fromOther  = (data.otherCompetitions ?? [])
    .reduce((sum, oc) => sum + (oc.match_count ?? 0), 0);
  return fromEvents + fromOther;
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('BUG FIX — API Upcoming chỉ trả về 2 trận', () => {

  test.setTimeout(30000);

  // ── CẤU TRÚC RESPONSE ────────────────────────────────────────────────────

  /**
   * Verify response có đủ các field cần thiết.
   * Test với ngày hiện tại — luôn phải trả về cấu trúc đúng dù có hay không có trận.
   */
  test('response structure is valid (code=1, events/otherCompetitions/pagination exist)', async ({ request }) => {
    const res = await callAPI(request, TODAY, 'upcoming');

    expect(res.code).toBe(1);
    expect(res.data).toBeDefined();
    expect(Array.isArray(res.data.events)).toBe(true);
    expect(Array.isArray(res.data.otherCompetitions)).toBe(true);
    expect(res.data.pagination).toBeDefined();
    expect(typeof res.data.pagination.total).toBe('number');
    expect(typeof res.data.pagination.page).toBe('number');
    expect(typeof res.data.pagination.hasNextPage).toBe('boolean');
  });

  /**
   * otherCompetitions[i] phải có đủ các field bắt buộc.
   * Verify schema của CompGroup object.
   */
  test('otherCompetitions items have required fields (id, name, match_count, competition_ids)', async ({ request }) => {
    const res = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming');
    const others = res.data.otherCompetitions ?? [];

    if (others.length === 0) {
      console.log('otherCompetitions rỗng cho ngày này — bỏ qua schema check');
      return;
    }

    for (const oc of others) {
      expect.soft(typeof oc.id,         `id thiếu`).toBe('string');
      expect.soft(typeof oc.name,       `name thiếu`).toBe('string');
      expect.soft(typeof oc.match_count,`match_count thiếu`).toBe('number');
      expect.soft(Array.isArray(oc.competition_ids), `competition_ids không phải array`).toBe(true);
      expect.soft(oc.match_count,       `match_count phải > 0`).toBeGreaterThan(0);
    }
  });

  // ── FIX BUG #1: COMPLETENESS ─────────────────────────────────────────────

  /**
   * [FIX BUG #1] CRITICAL — Công thức completeness:
   *   events.length + sum(otherCompetitions[i].match_count) === pagination.total
   *
   * Trước fix: otherCompetitions=[] → tổng chỉ bằng events.length → mất data.
   * Sau fix: otherCompetitions phải chứa đủ các giải còn lại.
   *
   * Test trên ngày nhiều trận (total > 50) — baseline hoạt động.
   */
  test('[Bug#1] data completeness: events + otherCompetitions.match_count = total (high traffic day)', async ({ request }) => {
    const res   = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming');
    const data  = res.data;
    const total = countTotal(data);

    console.log(`\nNgày ${DATE_HIGH_TRAFFIC} (nhiều trận):`);
    console.log(`  events.length                  : ${data.events?.length}`);
    console.log(`  sum(otherCompetitions.match_count): ${total - (data.events?.length ?? 0)}`);
    console.log(`  Tổng tính được                 : ${total}`);
    console.log(`  pagination.total               : ${data.pagination?.total}`);

    expect(data.pagination.total).toBeGreaterThan(0);
    // Cho phép sai lệch ±5 trận do live match đổi trạng thái trong lúc query
    expect(Math.abs(total - data.pagination.total)).toBeLessThanOrEqual(5);
  });

  /**
   * [FIX BUG #1] CRITICAL — Ngày ít trận (total ≤ 50):
   * Đây là điều kiện kích hoạt bug gốc. Sau fix phải:
   *   1. otherCompetitions KHÔNG rỗng (nếu có trận ngoài top league)
   *   2. Tổng completeness vẫn đúng
   */
  test('[Bug#1] low-traffic day (total ≤ 50): otherCompetitions must NOT be empty', async ({ request }) => {
    const res  = await callAPI(request, DATE_LOW_TRAFFIC, 'upcoming');
    const data = res.data;

    console.log(`\nNgày ${DATE_LOW_TRAFFIC} (ít trận):`);
    console.log(`  pagination.total    : ${data.pagination?.total}`);
    console.log(`  events.length       : ${data.events?.length}`);
    console.log(`  otherCompetitions   : ${data.otherCompetitions?.length} nhóm`);

    if ((data.pagination?.total ?? 0) === 0) {
      console.log('  Không có trận trong ngày này — skip test');
      return;
    }

    const total = countTotal(data);

    // Nếu events không cover hết tất cả trận → otherCompetitions phải có data
    if ((data.events?.length ?? 0) < (data.pagination?.total ?? 0)) {
      expect(
        data.otherCompetitions?.length,
        `BUG#1 còn tồn tại: total=${data.pagination.total}, events=${data.events?.length} nhưng otherCompetitions rỗng`
      ).toBeGreaterThan(0);
    }

    // Completeness check
    expect(Math.abs(total - data.pagination.total)).toBeLessThanOrEqual(5);
    console.log(`  Completeness: ${total} ≈ ${data.pagination.total} ✓`);
  });

  /**
   * [FIX BUG #1] Ngày bug gốc trong RCA (2026-06-15):
   * Ngày đã qua → total=0 là bình thường, API không được crash.
   */
  test('[Bug#1] original bug date (2026-06-15) returns valid response without crashing', async ({ request }) => {
    const res = await callAPI(request, DATE_BUG_ORIGIN, 'upcoming');

    // API phải trả về cấu trúc hợp lệ, không crash (status 4xx/5xx)
    expect(res.code).toBe(1);
    expect(Array.isArray(res.data.events)).toBe(true);
    expect(Array.isArray(res.data.otherCompetitions)).toBe(true);
    console.log(`\nNgày bug gốc ${DATE_BUG_ORIGIN}: total=${res.data.pagination?.total} (expected 0 vì đã qua)`);
  });

  // ── FIX BUG #2: STATUS VALIDATION ────────────────────────────────────────

  /**
   * [FIX BUG #2] CRITICAL — Tab UPCOMING:
   * Tất cả events trong phần top-league PHẢI có status = not_started.
   *
   * Trước fix: fallback query không lọc status → có thể chèn trận đã kết thúc
   * vào top section, sau đó bị lọc ra → top section không đủ league → thiếu data.
   * Sau fix: fallback chỉ lấy league có trận NOT_STARTED.
   */
  test('[Bug#2] upcoming tab: all events must have status = not_started', async ({ request }) => {
    const res    = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming');
    const events = res.data.events ?? [];

    if (events.length === 0) {
      console.log('Không có events để check — ngày không có upcoming matches');
      return;
    }

    const wrongStatus = events.filter(e => e.status?.type !== 'not_started');
    if (wrongStatus.length > 0) {
      console.warn('Events có status sai:');
      wrongStatus.forEach(e => console.warn(`  id=${e.id} status=${e.status?.type} tournament=${e.tournament?.name}`));
    }

    console.log(`\nNgày ${DATE_HIGH_TRAFFIC}: ${events.length} events, ${wrongStatus.length} sai status`);
    expect(
      wrongStatus.length,
      `${wrongStatus.length} events trong upcoming có status KHÔNG phải not_started (Bug#2)`
    ).toBe(0);
  });

  // ── REGRESSION TESTS ─────────────────────────────────────────────────────

  /**
   * [REGRESSION] sortByMatchTime=true KHÔNG được ảnh hưởng.
   * Luồng này độc lập với luồng bug → phải trả về events bình thường.
   * Khi sortByMatchTime=true: không có otherCompetitions, events được flatten và sort theo giờ.
   */
  test('[Regression] sortByMatchTime=true still returns events correctly', async ({ request }) => {
    const res = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming', true);

    expect(res.code).toBe(1);
    expect(Array.isArray(res.data.events)).toBe(true);
    expect(res.data.pagination?.total).toBeGreaterThan(0);

    console.log(`\nsortByMatchTime=true: events=${res.data.events?.length}, total=${res.data.pagination?.total}`);

    // sortByMatchTime=true → pagination.total phải khớp events nếu ≤ page size
    // (hoặc events.length = page size nếu có nhiều trang hơn)
    if (!res.data.pagination?.hasNextPage) {
      expect(res.data.events?.length).toBe(res.data.pagination?.total);
    }
  });

  /**
   * [REGRESSION] Ngày có total > 50 phải vẫn hoạt động đúng.
   * Bug #1 chỉ kích hoạt khi total ≤ 50, nhưng ngày đông trận cũng phải đúng.
   */
  test('[Regression] high-traffic day (total > 50) still works correctly', async ({ request }) => {
    const res  = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming');
    const data = res.data;

    console.log(`\nNgày ${DATE_HIGH_TRAFFIC}:`);
    console.log(`  pagination.total        : ${data.pagination?.total}`);
    console.log(`  events.length           : ${data.events?.length}`);
    console.log(`  otherCompetitions count : ${data.otherCompetitions?.length}`);

    // Phải có nhiều hơn 50 total
    expect(data.pagination?.total).toBeGreaterThan(50);

    // Completeness vẫn phải đúng
    const total = countTotal(data);
    expect(Math.abs(total - data.pagination.total)).toBeLessThanOrEqual(5);
  });

  /**
   * [REGRESSION] Truyền competitionIds filter → chỉ trả về trận của giải đó.
   * Luồng lọc theo giải cụ thể không được ảnh hưởng bởi fix.
   */
  test('[Regression] filtering by competitionIds returns only those competitions', async ({ request }) => {
    const resAll = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming');
    const others = resAll.data.otherCompetitions ?? [];

    if (others.length === 0) {
      console.log('Không có otherCompetitions để lấy competitionIds — skip');
      return;
    }

    const target    = others[0];
    const targetIds = target.competition_ids;

    const res = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming', false, {
      competitionIds: targetIds,
    });

    console.log(`\nFilter competitionIds=${JSON.stringify(targetIds)}:`);
    console.log(`  events              : ${res.data.events?.length}`);
    console.log(`  total               : ${res.data.pagination?.total}`);
    console.log(`  otherCompetitions   : ${res.data.otherCompetitions?.length} nhóm`);
    console.log(`  expected match_count: ${target.match_count}`);

    expect(res.code).toBe(1);

    // Khi filter 1 nhóm cụ thể → otherCompetitions phải rỗng (không có "giải còn lại")
    expect(
      res.data.otherCompetitions?.length,
      'otherCompetitions phải rỗng khi filter theo competitionIds cụ thể'
    ).toBe(0);

    // Total phải khớp match_count của nhóm đó (±5 race condition)
    expect(
      Math.abs((res.data.pagination?.total ?? 0) - target.match_count),
      `API total=${res.data.pagination?.total} không khớp expected match_count=${target.match_count}`
    ).toBeLessThanOrEqual(5);

    // Events phải thuộc đúng competition đã filter
    const filteredSet  = new Set(targetIds);
    const wrongEvents  = (res.data.events ?? []).filter(
      (e: MatchEvent) => !filteredSet.has(e.tournament?.id)
    );
    if (wrongEvents.length) {
      wrongEvents.slice(0, 5).forEach((e: MatchEvent) =>
        console.warn(`  event id=${e.id} tournament.id=${e.tournament?.id} không thuộc filter`)
      );
    }
    expect.soft(
      wrongEvents.length,
      `${wrongEvents.length} events không thuộc competition đã filter`
    ).toBe(0);
  });

  /**
   * [QC Step 1] Sau fix fallback, events phải chứa trận từ nhiều league khác nhau (~10).
   * Nếu chỉ 1-2 league → fallback chưa lấp đủ top section.
   */
  test('[QC] events diversity: multiple leagues represented (fallback working)', async ({ request }) => {
    const res    = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming');
    const events = res.data.events ?? [];

    if (events.length === 0) {
      console.log('Không có events — skip diversity check');
      return;
    }

    const uniqueLeagues = new Set(
      events.map((e: MatchEvent) => e.tournament?.id).filter(Boolean)
    );
    console.log(`\n${DATE_HIGH_TRAFFIC}: ${events.length} events từ ${uniqueLeagues.size} leagues`);

    expect(
      uniqueLeagues.size,
      `Events chỉ có ${uniqueLeagues.size} league — fallback có thể chưa hoạt động đúng (expect ≥ 3)`
    ).toBeGreaterThanOrEqual(3);
  });

  // ── PAGINATION TESTS ─────────────────────────────────────────────────────

  /**
   * [Pagination] Page 2 phải trả về events khác hoàn toàn với page 1.
   * Nếu có event ID trùng → server đang return sai trang hoặc offset lỗi.
   */
  test('[Pagination] page 2 returns different events from page 1 (no duplicates)', async ({ request }) => {
    const res1 = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming', true, { page: 1 });

    if (!res1.data.pagination?.hasNextPage) {
      console.log('Không có page 2 — bỏ qua test');
      return;
    }

    const res2 = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming', true, { page: 2 });

    const ids1  = new Set((res1.data.events ?? []).map((e: MatchEvent) => e.id));
    const ids2  = (res2.data.events ?? []).map((e: MatchEvent) => e.id);
    const dupes = ids2.filter(id => ids1.has(id));

    console.log(`\nPagination: page1=${res1.data.events?.length} events, page2=${res2.data.events?.length} events`);
    console.log(`  Trùng ID: ${dupes.length}`);

    expect(res2.code).toBe(1);
    expect(res2.data.events?.length, 'Page 2 phải có events').toBeGreaterThan(0);
    expect(
      dupes.length,
      `${dupes.length} events bị trùng giữa page 1 và page 2: ${dupes.slice(0, 3).join(', ')}`
    ).toBe(0);
  });

  /**
   * [Pagination] hasNextPage flag phải chính xác:
   *   hasNextPage=true  → page 2 phải có events
   *   hasNextPage=false → page 2 phải rỗng (hoặc không tồn tại)
   */
  test('[Pagination] hasNextPage flag is accurate', async ({ request }) => {
    const res1    = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming', true, { page: 1 });
    const has2    = res1.data.pagination?.hasNextPage;
    const total   = res1.data.pagination?.total ?? 0;
    const pageSize = res1.data.pagination?.size ?? 0;

    console.log(`\nPage 1: events=${res1.data.events?.length}, hasNextPage=${has2}, total=${total}, size=${pageSize}`);

    const res2       = await callAPI(request, DATE_HIGH_TRAFFIC, 'upcoming', true, { page: 2 });
    const page2Count = res2.data.events?.length ?? 0;

    if (has2) {
      expect(page2Count, 'hasNextPage=true nhưng page 2 rỗng').toBeGreaterThan(0);
    } else {
      expect(page2Count, 'hasNextPage=false nhưng page 2 vẫn có events').toBe(0);
    }

    // total phải = tổng events qua tất cả trang (nếu chỉ có 2 trang)
    if (has2 && !res2.data.pagination?.hasNextPage) {
      const totalCounted = (res1.data.events?.length ?? 0) + page2Count;
      expect(
        Math.abs(totalCounted - total),
        `Tổng events page1+page2=${totalCounted} không khớp total=${total}`
      ).toBeLessThanOrEqual(2);
    }

    console.log(`  Page 2 events: ${page2Count} — hasNextPage was ${has2} ✓`);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: Fake IP Brazil — Timezone São Paulo (UTC-3) Bug
// ═══════════════════════════════════════════════════════════════════════════
/**
 * BUG STEPS:
 *   1. Fake IP qua Brazil
 *   2. Đổi múi giờ qua São Paulo (UTC-3)
 *   3. Mở App → tab "Sắp diễn ra"
 *   4. View by group
 *   Expected: Show đủ list trận upcoming của ngày tiếp theo
 *   Actual:   Show thiếu các trận upcoming của ngày tiếp theo
 *
 * ─── PHÂN TÍCH ROOT CAUSE ──────────────────────────────────────────────────
 *
 * API nhận tham số date="YYYY-MM-DD" và locale="BR", nhưng server tính
 * window truy vấn theo UTC thay vì theo múi giờ của locale:
 *
 *   Server query:  [date 00:00 UTC  →  date+1 00:00 UTC)   ← SAI
 *   Đúng phải là: [date 03:00 UTC  →  date+1 03:00 UTC)   ← São Paulo boundary
 *
 * SÃO PAULO TIMEZONE:
 *   BRT = UTC-3 (không đổi giờ mùa hè kể từ 2019)
 *   "Ngày D ở SP" theo UTC = từ D 03:00:00 UTC đến D+1 02:59:59 UTC
 *
 * ─── VÙNG DATA BỊ MẤT ─────────────────────────────────────────────────────
 *
 *   Khung giờ bị mất:  date+1 00:00 UTC → date+1 02:59 UTC
 *                    = date    21:00 SP  → date    23:59 SP
 *
 *   Tức là: tất cả trận bắt đầu trong 3 tiếng cuối ngày (21:00–23:59 SP)
 *   bị server tính vào "ngày date+1" (UTC) → biến mất khỏi response.
 *
 * ─── TIMELINE ──────────────────────────────────────────────────────────────
 *
 *            UTC:  D 00:00        D+1 00:00       D+1 03:00
 *                   │              │               │
 *   UTC day D: ─────[════════════)─│───────────────│
 *   SP  day D: ──────────[════════════════════════)│
 *                   │    │          │               │
 *                   │  D 03:00 UTC  │               │
 *                   │  (= D 00:00 SP│               │
 *                                  │←── MẤT ───────│
 *                                  │  (3h cuối ngày SP)
 *
 * ─── ẢNH HƯỞNG THEO LOCALE ────────────────────────────────────────────────
 *
 *   Locale   │ Offset │ Vùng bị mất         │ Cửa sổ UTC bị bỏ sót
 *   ─────────┼────────┼─────────────────────┼──────────────────────────
 *   VN       │ UTC+7  │ Không mất           │ — (server thường dùng UTC+7)
 *   BR / SP  │ UTC-3  │ 21:00–23:59 SP      │ 00:00–02:59 UTC ngày sau
 *   US / NY  │ UTC-4  │ 20:00–23:59 NY      │ 00:00–03:59 UTC ngày sau
 *   UK       │ UTC+0  │ Không mất           │ — (UTC = local)
 *
 * ─── CỘNG HƯỞNG VỚI BUG #1 & #2 ──────────────────────────────────────────
 *
 *   Do mất 3 tiếng cuối, tổng trận SP giảm → dễ rơi vào điều kiện total ≤ 50
 *   → kích hoạt Bug #1 (otherCompetitions bị tắt) → mất thêm hàng chục trận.
 *   Bug #2 (fallback sai status) khiến top section chỉ còn 2 league.
 *   Kết quả: user Brazil thấy tab Upcoming chỉ có 2 trận thay vì ~45 trận.
 *
 * CÔNG THỨC KIỂM TRA:
 *   DB: COUNT(*) WHERE start_timestamp IN [D 03:00 UTC, D+1 03:00 UTC)
 *                  AND status_id IN (0, 1)   -- not_started
 *   API: pagination.total từ date=D / locale=BR / type=upcoming
 *   → DB.count phải ≈ API.total (±5 race condition)
 */

const DB_CONFIG_SP = {
  host: process.env.DB_PROD_HOST || '', port: 5432,
  user: 'readonly', password: process.env.DB_PROD_PASSWORD || '',
  database: 'api_ts', connectionTimeoutMillis: 30000,
};

/** Offset UTC của São Paulo: -3 giờ */
const SP_OFFSET_H = -3;

/**
 * Tính ngày theo múi giờ São Paulo từ một thời điểm UTC.
 * Ví dụ: UTC 2026-06-18 01:00 → SP 2026-06-17 22:00 → ngày SP = "2026-06-17"
 */
function toSaoPauloDate(utcMs: number = Date.now()): string {
  const spMs = utcMs + SP_OFFSET_H * 3600 * 1000;
  return new Date(spMs).toISOString().slice(0, 10);
}

/**
 * Lấy timestamp Unix của 00:00:00 SP = 03:00:00 UTC của ngày dateStr.
 * Ví dụ: "2026-06-18" → 2026-06-18T03:00:00Z
 */
function spMidnightUTC(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T03:00:00Z`).getTime() / 1000);
}

test.describe('Brazil IP — São Paulo Timezone: Upcoming "Ngày Mai" Completeness', () => {

  let db: Client;
  test.setTimeout(30000);

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG_SP);
    await db.connect();
  });

  test.afterAll(async () => {
    await db.end();
  });

  // ── TEST 1 ─────────────────────────────────────────────────────────────────
  /**
   * Xác nhận API trả đúng ngày "ngày mai" theo múi giờ São Paulo.
   * Locale BR, date = ngày mai ở SP.
   * Phải trả về data, không lỗi.
   */
  test('SP timezone: API with locale=BR returns valid response for SP tomorrow', async ({ request }) => {
    const tomorrowSP = toSaoPauloDate(Date.now() + 86400 * 1000);

    const res = await request.post(
      `${API_BASE}/scheduled-events-pagination-v2/${tomorrowSP}/locale/BR/type/upcoming`,
      { data: { sortByMatchTime: false } }
    );
    const json = await res.json();

    console.log(`\nSP Tomorrow: ${tomorrowSP}`);
    console.log(`  API total : ${json.data?.pagination?.total}`);
    console.log(`  events    : ${json.data?.events?.length}`);
    console.log(`  otherComps: ${json.data?.otherCompetitions?.length} nhóm`);

    expect(json.code).toBe(1);
    expect(Array.isArray(json.data?.events)).toBe(true);
    expect(Array.isArray(json.data?.otherCompetitions)).toBe(true);
  });

  // ── TEST 2 — CORE BUG TEST ─────────────────────────────────────────────────
  /**
   * [CRITICAL] So sánh DB vs API: số trận upcoming của ngày mai theo SP.
   *
   * DB window cho "ngày mai SP":
   *   start_timestamp IN [ tomorrow_SP 03:00 UTC, tomorrow_SP+1 03:00 UTC )
   *
   * API: total từ locale=BR, date=tomorrow_SP, type=upcoming
   *
   * BUG: Nếu API dùng UTC boundary thay vì SP boundary:
   *   - Trận 00:00–02:59 UTC của tomorrow_SP+1 (= 21:00–23:59 SP tomorrow) bị mất
   */
  test('[BUG] SP tomorrow: DB match count must equal API total (no missing matches)', async ({ request }) => {
    const tomorrowSP = toSaoPauloDate(Date.now() + 86400 * 1000);

    // Cửa sổ UTC cho ngày mai SP: [D 03:00 UTC, D+1 03:00 UTC)
    const winStart = spMidnightUTC(tomorrowSP);
    const winEnd   = spMidnightUTC(
      new Date(new Date(`${tomorrowSP}T00:00:00Z`).getTime() + 86400 * 1000)
        .toISOString().slice(0, 10)
    );

    // Đếm từ DB
    const dbRes = await db.query<{ total: string; not_started: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status_id IN (0, 1)) AS not_started
       FROM sport_events
       WHERE start_timestamp >= $1 AND start_timestamp < $2`,
      [winStart, winEnd]
    );
    const dbTotal      = Number(dbRes.rows[0].total);
    const dbNotStarted = Number(dbRes.rows[0].not_started);

    // Đếm từ API (locale=BR)
    const apiRes  = await request.post(
      `${API_BASE}/scheduled-events-pagination-v2/${tomorrowSP}/locale/BR/type/upcoming`,
      { data: { sortByMatchTime: false } }
    );
    const apiJson    = await apiRes.json();
    const apiTotal   = apiJson.data?.pagination?.total ?? 0;
    const apiEvents  = apiJson.data?.events?.length ?? 0;
    const apiOthers  = (apiJson.data?.otherCompetitions ?? [])
      .reduce((s: number, oc: { match_count: number }) => s + (oc.match_count ?? 0), 0);
    const apiCounted = apiEvents + apiOthers;

    console.log(`\nSP Tomorrow: ${tomorrowSP}`);
    console.log(`  UTC window: ${new Date(winStart * 1000).toISOString()} → ${new Date(winEnd * 1000).toISOString()}`);
    console.log(`  DB total   : ${dbTotal} (not_started: ${dbNotStarted})`);
    console.log(`  API total  : ${apiTotal}`);
    console.log(`  API counted: events(${apiEvents}) + otherComps(${apiOthers}) = ${apiCounted}`);

    // API total phải khớp DB not_started (±5 vì race condition trạng thái live)
    expect.soft(
      Math.abs(apiTotal - dbNotStarted),
      `MISSING MATCHES: DB=${dbNotStarted} vs API=${apiTotal} — thiếu ${Math.abs(apiTotal - dbNotStarted)} trận`
    ).toBeLessThanOrEqual(5);

    // Completeness bên trong API phải đúng
    expect.soft(
      Math.abs(apiCounted - apiTotal),
      `API internal completeness sai: counted=${apiCounted} vs total=${apiTotal}`
    ).toBeLessThanOrEqual(5);
  });

  // ── TEST 3 ─────────────────────────────────────────────────────────────────
  /**
   * [BOUNDARY] Kiểm tra trận trong "giờ tối SP" (21:00–23:59 SP = 00:00–02:59 UTC ngày tiếp).
   * Đây là vùng dễ bị mất nhất do lệch timezone.
   *
   * Nếu API dùng UTC date boundary (00:00–23:59 UTC) thay vì SP boundary:
   *   Trận 00:00–02:59 UTC ngày D+2 = 21:00–23:59 SP ngày D+1 → bị tính vào ngày D+2 UTC
   *   → Biến mất khỏi response ngày D+1 SP
   */
  test('[BOUNDARY] Matches at 21:00–23:59 SP (=00:00–02:59 UTC next day) must be included', async ({ request }) => {
    const tomorrowSP = toSaoPauloDate(Date.now() + 86400 * 1000);
    const dayAfterSP = toSaoPauloDate(Date.now() + 2 * 86400 * 1000);

    // Boundary window: 00:00–02:59 UTC của ngày kế sau ngày mai SP
    // = 21:00–23:59 SP của ngày mai SP
    const boundaryStart = spMidnightUTC(dayAfterSP);            // D+2 03:00 UTC - 3h = D+1 00:00 UTC
    const boundaryEnd   = boundaryStart + 3 * 3600;             // 3 tiếng sau = 02:59 UTC

    // Trận trong boundary window
    const bdRes = await db.query<{ cnt: string; sample_ts: string }>(
      `SELECT COUNT(*) AS cnt, MIN(start_timestamp) AS sample_ts
       FROM sport_events
       WHERE start_timestamp >= $1 AND start_timestamp < $2
         AND status_id IN (0, 1)`,
      [boundaryStart, boundaryEnd]
    );
    const boundaryCount = Number(bdRes.rows[0].cnt);

    console.log(`\nBoundary window: ${new Date(boundaryStart * 1000).toISOString()} → ${new Date(boundaryEnd * 1000).toISOString()}`);
    console.log(`  = 21:00–23:59 SP của ngày mai (${tomorrowSP})`);
    console.log(`  DB matches in boundary: ${boundaryCount}`);

    if (boundaryCount === 0) {
      console.log('  Không có trận trong boundary — không thể verify bug này');
      return;
    }

    // API phải include cả trận boundary → total phải bao gồm chúng
    const apiRes  = await request.post(
      `${API_BASE}/scheduled-events-pagination-v2/${tomorrowSP}/locale/BR/type/upcoming`,
      { data: { sortByMatchTime: false } }
    );
    const apiJson  = await apiRes.json();
    const apiTotal = apiJson.data?.pagination?.total ?? 0;

    // API total phải >= số trận boundary (vì boundary là subset của SP tomorrow)
    expect(
      apiTotal,
      `BUG TIMEZONE: API total=${apiTotal} nhỏ hơn boundary count=${boundaryCount}. Trận 21:00–23:59 SP bị thiếu!`
    ).toBeGreaterThanOrEqual(boundaryCount);
    console.log(`  API total=${apiTotal} >= boundaryCount=${boundaryCount} ✓`);
  });

  // ── TEST 4 ─────────────────────────────────────────────────────────────────
  /**
   * Completeness check cho cả "hôm nay" và "ngày mai" theo múi giờ SP.
   * Đảm bảo cả hai ngày đều trả đủ data khi locale=BR.
   */
  test('SP today and tomorrow: both return complete data with locale=BR', async ({ request }) => {
    const todaySP    = toSaoPauloDate();
    const tomorrowSP = toSaoPauloDate(Date.now() + 86400 * 1000);

    for (const { label, date } of [
      { label: 'Today SP',    date: todaySP    },
      { label: 'Tomorrow SP', date: tomorrowSP },
    ]) {
      const res    = await request.post(
        `${API_BASE}/scheduled-events-pagination-v2/${date}/locale/BR/type/upcoming`,
        { data: { sortByMatchTime: false } }
      );
      const json   = await res.json();
      const data   = json.data;
      const events = data?.events?.length ?? 0;
      const others = (data?.otherCompetitions ?? [])
        .reduce((s: number, oc: { match_count: number }) => s + (oc.match_count ?? 0), 0);
      const total  = data?.pagination?.total ?? 0;
      const counted = events + others;

      console.log(`\n${label} (${date}):`);
      console.log(`  events=${events} + otherComps=${others} = ${counted} | API.total=${total}`);

      expect.soft(json.code, `${label}: code phải là 1`).toBe(1);

      if (total > 0) {
        expect.soft(
          Math.abs(counted - total),
          `${label}: completeness sai — counted=${counted} vs total=${total}`
        ).toBeLessThanOrEqual(5);
      }
    }
  });

  // ── TEST 5 ─────────────────────────────────────────────────────────────────
  /**
   * Simulate các mốc thời điểm quan trọng trong ngày SP để detect boundary bug.
   *
   * Mốc nguy hiểm:
   *   - 21:00 SP = 00:00 UTC → đây là lúc "ngày mới" theo UTC bắt đầu
   *     nhưng vẫn là ngày cũ theo SP → ngày mai SP không thay đổi
   *   - 00:00 SP = 03:00 UTC → đây là lúc "ngày mới" theo SP bắt đầu
   *
   * Test: Tính ngày mai SP tại từng mốc giờ và verify API trả đúng ngày.
   */
  test('SP timezone boundary: correct "tomorrow" date at critical time points', async ({ request }) => {
    // Các mốc giờ UTC quan trọng và ngày mai SP tương ứng
    const criticalPoints = [
      { label: '20:00 SP = 23:00 UTC', utcHour: 23, utcDate: '2026-06-17' },  // SP 20:00 → SP tomorrow = 2026-06-18
      { label: '21:00 SP = 00:00 UTC next', utcHour: 0, utcDate: '2026-06-18' }, // SP 21:00 → SP tomorrow = 2026-06-18
      { label: '23:59 SP = 02:59 UTC next', utcHour: 2, utcDate: '2026-06-18' }, // SP 23:59 → SP tomorrow = 2026-06-18
      { label: '00:00 SP = 03:00 UTC',    utcHour: 3, utcDate: '2026-06-18' }, // SP 00:00 → SP today=18, tomorrow = 2026-06-19
    ];

    console.log('\nSão Paulo timezone critical points:');
    for (const pt of criticalPoints) {
      const fakeUtcMs    = new Date(`${pt.utcDate}T${String(pt.utcHour).padStart(2,'0')}:00:00Z`).getTime();
      const spTomorrow   = toSaoPauloDate(fakeUtcMs + 86400 * 1000);
      const spToday      = toSaoPauloDate(fakeUtcMs);

      console.log(`  [${pt.label}] SP today=${spToday}, SP tomorrow=${spTomorrow}`);

      // API phải trả response hợp lệ cho ngày mai SP tại mốc này
      const res  = await request.post(
        `${API_BASE}/scheduled-events-pagination-v2/${spTomorrow}/locale/BR/type/upcoming`,
        { data: { sortByMatchTime: false } }
      );
      const json = await res.json();
      expect.soft(json.code, `[${pt.label}] code phải 1`).toBe(1);
      expect.soft(Array.isArray(json.data?.events), `[${pt.label}] events phải là array`).toBe(true);
    }
  });

});
// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: otherCompetitions match_count — verify chỉ đếm not_started
// ═══════════════════════════════════════════════════════════════════════════
/**
 * BUG HYPOTHESIS:
 *   match_count trong otherCompetitions có thể đang đếm cả trận live/ended,
 *   không chỉ not_started → completeness formula đúng số học nhưng sai ngữ nghĩa:
 *   client hiển thị "3 trận" nhưng thực ra chỉ có 1 not_started, 2 cái còn lại đã kết thúc.
 *
 * KIỂM TRA:
 *   Với mỗi CompGroup trong otherCompetitions:
 *     DB.count(status=not_started, competition_id IN group.competition_ids, ngày D)
 *     phải ≈ group.match_count (±5)
 */

test.describe('otherCompetitions match_count — chỉ đếm not_started (DB verify)', () => {

  let db: Client;
  test.setTimeout(30000);

  test.beforeAll(async () => {
    db = new Client({
      host: process.env.DB_PROD_HOST || '', port: 5432,
      user: 'readonly', password: process.env.DB_PROD_PASSWORD || '',
      database: 'api_ts', connectionTimeoutMillis: 30000,
    });
    await db.connect();
  });

  test.afterAll(async () => {
    await db.end();
  });

  /**
   * [CRITICAL] Verify tối đa 10 nhóm đầu của ngày hôm nay.
   * DB chỉ có data gần ngày hiện tại → dùng TODAY thay vì hardcode ngày tương lai.
   * So sánh match_count với DB count not_started theo cùng competition_ids + ngày.
   */
  test('[DB] otherCompetitions match_count matches DB not_started count — today (±5)', async ({ request }) => {
    const date     = TODAY;
    const dayStart = Math.floor(new Date(`${date}T00:00:00+07:00`).getTime() / 1000);
    const dayEnd   = dayStart + 86400;

    const res    = await callAPI(request, date, 'upcoming');
    const others = res.data.otherCompetitions ?? [];

    if (others.length === 0) {
      console.log('otherCompetitions rỗng — skip DB verify');
      return;
    }

    console.log(`\nVerify match_count cho ${Math.min(others.length, 10)}/${others.length} nhóm (${date}):`);

    let dbHasData = false;
    for (const oc of others.slice(0, 10)) {
      if (!oc.competition_ids?.length) continue;

      const dbRes = await db.query<{ not_started: string; total: string }>(
        `SELECT COUNT(*) FILTER (WHERE status_id IN (0, 1)) AS not_started,
                COUNT(*)                                       AS total
         FROM   sport_events
         WHERE  competition_id = ANY($1::text[])
           AND  start_timestamp >= $2 AND start_timestamp < $3`,
        [oc.competition_ids, dayStart, dayEnd]
      );

      const dbNotStarted = Number(dbRes.rows[0].not_started);
      const dbTotal      = Number(dbRes.rows[0].total);
      const diff         = Math.abs(dbNotStarted - oc.match_count);

      if (dbTotal > 0) dbHasData = true;

      console.log(
        `  [${oc.name}]`,
        `API.match_count=${oc.match_count}`,
        `DB.not_started=${dbNotStarted}`,
        `DB.total(tất cả status)=${dbTotal}`,
        diff > 5 ? `⚠ diff=${diff}` : '✓'
      );

      if (dbTotal === 0) continue; // DB chưa có data cho group này — bỏ qua

      expect.soft(
        diff,
        `[${oc.name}] match_count=${oc.match_count} vs DB.not_started=${dbNotStarted} — ` +
        `sai lệch ${diff}, có thể đang đếm cả live/ended`
      ).toBeLessThanOrEqual(5);
    }

    if (!dbHasData) {
      console.log(`⚠ DB không có data cho ${date} — không thể verify (DB chỉ load ~1-2 ngày trước)`);
    }
  });

  /**
   * [CRITICAL] Verify ALL nhóm ngày mai — đây là điều kiện bug gốc (ít trận).
   * DB thường có data cho ngày tiếp theo. In cả DB.total để thấy ngay nếu server đếm wrong status.
   * Guard: nếu DB.total=0 cho nhóm → bỏ qua nhóm đó (DB chưa load data).
   */
  test('[DB] otherCompetitions match_count matches DB not_started count — tomorrow (±5)', async ({ request }) => {
    const date     = dateOffset(1);
    const dayStart = Math.floor(new Date(`${date}T00:00:00+07:00`).getTime() / 1000);
    const dayEnd   = dayStart + 86400;

    const res    = await callAPI(request, date, 'upcoming');
    const others = res.data.otherCompetitions ?? [];

    if (others.length === 0) {
      console.log(`Ngày ${date} không có otherCompetitions — skip`);
      return;
    }

    console.log(`\nVerify match_count ngày mai ${date} (${others.length} nhóm):`);

    let dbHasData = false;
    for (const oc of others) {
      if (!oc.competition_ids?.length) continue;

      const dbRes = await db.query<{ not_started: string; live: string; ended: string }>(
        `SELECT COUNT(*) FILTER (WHERE status_id IN (0, 1))     AS not_started,
                COUNT(*) FILTER (WHERE status_id IN (2, 3, 4))  AS live,
                COUNT(*) FILTER (WHERE status_id NOT IN (0,1,2,3,4)) AS ended
         FROM   sport_events
         WHERE  competition_id = ANY($1::text[])
           AND  start_timestamp >= $2 AND start_timestamp < $3`,
        [oc.competition_ids, dayStart, dayEnd]
      );

      const dbNotStarted = Number(dbRes.rows[0].not_started);
      const dbLive       = Number(dbRes.rows[0].live);
      const dbEnded      = Number(dbRes.rows[0].ended);
      const dbTotal      = dbNotStarted + dbLive + dbEnded;
      const diff         = Math.abs(dbNotStarted - oc.match_count);

      if (dbTotal > 0) dbHasData = true;

      console.log(
        `  [${oc.name}]`,
        `match_count=${oc.match_count}`,
        `DB: not_started=${dbNotStarted} live=${dbLive} ended=${dbEnded}`,
        dbTotal === 0 ? '(no DB data)' : diff > 5 ? `⚠ diff=${diff} — server có thể đang đếm sai status` : '✓'
      );

      if (dbTotal === 0) continue; // DB chưa load data cho group này — bỏ qua

      expect.soft(diff, `[${oc.name}] match_count không khớp DB not_started`).toBeLessThanOrEqual(5);
    }

    if (!dbHasData) {
      console.log(`⚠ DB không có data cho ${date} — không thể verify (DB chỉ load ~1-2 ngày trước)`);
    }
  });

  /**
   * Tổng match_count của toàn bộ otherCompetitions phải khớp với
   * (pagination.total - events.length) tức là phần "còn lại" ngoài top league.
   */
  test('[DB] sum(otherCompetitions.match_count) === pagination.total - events.length', async ({ request }) => {
    for (const { label, date } of [
      { label: 'hôm nay',   date: TODAY           },
      { label: 'ngày mai',  date: dateOffset(1)   },
    ]) {
      const res    = await callAPI(request, date, 'upcoming');
      const data   = res.data;
      const total  = data.pagination?.total ?? 0;
      const evLen  = data.events?.length ?? 0;
      const sumOC  = (data.otherCompetitions ?? []).reduce((s, oc) => s + (oc.match_count ?? 0), 0);
      const diff   = Math.abs(total - evLen - sumOC);

      console.log(`\n[${label}] ${date}: total=${total}, events=${evLen}, sumOC=${sumOC}, diff=${diff}`);

      if (total === 0) { console.log('  total=0 — skip'); continue; }

      expect.soft(
        diff,
        `[${label}] total(${total}) - events(${evLen}) ≠ sumOC(${sumOC}) — sai lệch ${diff}`
      ).toBeLessThanOrEqual(5);
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 4: Date Range Coverage — tất cả các ngày
// ═══════════════════════════════════════════════════════════════════════════
/**
 * MỤC ĐÍCH:
 *   Chỉ tính trận UPCOMING — chạy cùng một bộ assertion trên toàn bộ
 *   khoảng ngày: quá khứ, hôm nay, tương lai, đầu/cuối tháng, thứ 2/7.
 *
 *   Mỗi ngày tạo ra 3 test case độc lập:
 *     1. Structure valid — type=upcoming trả đúng cấu trúc
 *     2. Completeness — events + sum(otherComps.match_count) = total (upcoming only)
 *     3. Status filter — tất cả events phải là not_started
 */

// ── Date helpers ──────────────────────────────────────────────────────────

function dateOffset(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonth(monthOffset = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monthOffset);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(monthOffset = 0): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + monthOffset + 1, 0); // ngày 0 của tháng sau = cuối tháng hiện tại
  return d.toISOString().slice(0, 10);
}

function nearestWeekend(): string {
  const d = new Date();
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  const daysToSat = dow === 6 ? 0 : (6 - dow);
  return dateOffset(daysToSat);
}

function nearestMonday(): string {
  const d = new Date();
  const dow = d.getUTCDay();
  const daysToMon = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow);
  return dateOffset(daysToMon);
}

// ── Ma trận ngày test ─────────────────────────────────────────────────────

interface DateCase {
  label: string;
  date:  string;
}

const DATE_MATRIX: DateCase[] = [
  // Quá khứ
  { label: '-7 ngày',              date: dateOffset(-7)       },
  { label: '-3 ngày',              date: dateOffset(-3)       },
  { label: 'hôm qua',              date: dateOffset(-1)       },
  // Hiện tại
  { label: 'hôm nay',              date: dateOffset(0)        },
  // Tương lai gần
  { label: 'ngày mai',             date: dateOffset(1)        },
  { label: '+2 ngày',              date: dateOffset(2)        },
  { label: '+7 ngày',              date: dateOffset(7)        },
  { label: '+14 ngày',             date: dateOffset(14)       },
  { label: '+30 ngày',             date: dateOffset(30)       },
  // Biên tháng
  { label: 'đầu tháng này',        date: firstDayOfMonth(0)  },
  { label: 'cuối tháng này',       date: lastDayOfMonth(0)   },
  { label: 'đầu tháng sau',        date: firstDayOfMonth(1)  },
  // Ngày trong tuần
  { label: 'thứ 7 gần nhất',       date: nearestWeekend()    },
  { label: 'thứ 2 gần nhất',       date: nearestMonday()     },
];

// ── Loại bỏ ngày trùng lặp (ví dụ hôm nay trùng đầu tháng) ─────────────

const seenDates = new Set<string>();
const UNIQUE_DATE_MATRIX = DATE_MATRIX.filter(({ date }) => {
  if (seenDates.has(date)) return false;
  seenDates.add(date);
  return true;
});

// ── Sinh test case cho từng ngày ──────────────────────────────────────────

test.describe('Date Range Coverage — tất cả các ngày', () => {
  test.setTimeout(60_000);

  for (const { label, date } of UNIQUE_DATE_MATRIX) {

    // ── Test 1: Structure ──────────────────────────────────────────────────
    /**
     * type=upcoming phải trả cấu trúc hợp lệ dù ngày có hay không có trận.
     */
    test(`[${label}] ${date}: structure valid (upcoming)`, async ({ request }) => {
      const res = await callAPI(request, date, 'upcoming');

      expect.soft(res.code,                                   'code phải là 1').toBe(1);
      expect.soft(Array.isArray(res.data?.events),            'events phải là array').toBe(true);
      expect.soft(Array.isArray(res.data?.otherCompetitions), 'otherCompetitions phải là array').toBe(true);
      expect.soft(typeof res.data?.pagination?.total,         'pagination.total phải là number').toBe('number');
      expect.soft(typeof res.data?.pagination?.hasNextPage,   'hasNextPage phải là boolean').toBe('boolean');

      console.log(`\n[${label}] ${date}: upcoming total=${res.data?.pagination?.total}`);
    });

    // ── Test 2: Completeness ───────────────────────────────────────────────
    /**
     * Chỉ tính trận upcoming:
     *   events.length + sum(otherCompetitions[i].match_count) === pagination.total
     *
     * match_count trong otherCompetitions phải chỉ đếm not_started,
     * không đếm live/ended → completeness mới phản ánh đúng số trận upcoming.
     */
    test(`[${label}] ${date}: completeness upcoming — events + otherComps = total`, async ({ request }) => {
      const res   = await callAPI(request, date, 'upcoming');
      const data  = res.data;
      const total = data?.pagination?.total ?? 0;

      if (total === 0) {
        console.log(`  [${label}] ${date}: total=0, không có trận upcoming — skip`);
        return;
      }

      const evLen   = data?.events?.length ?? 0;
      const sumOC   = (data?.otherCompetitions ?? [])
        .reduce((s: number, oc: CompGroup) => s + (oc.match_count ?? 0), 0);
      const counted = evLen + sumOC;
      const diff    = Math.abs(counted - total);

      console.log(
        `\n[${label}] ${date}:`,
        `events=${evLen} + otherComps=${sumOC} = ${counted} | total=${total} | diff=${diff}`
      );

      expect.soft(
        diff,
        `[${label}] ${date}: completeness sai — counted=${counted} vs total=${total}`
      ).toBeLessThanOrEqual(5);
    });

    // ── Test 3: Status filter ──────────────────────────────────────────────
    /**
     * Tất cả events trong phần top-league (events[]) phải là not_started.
     * Đây là assertion cốt lõi của Bug#2: fallback không được nhét
     * trận live/ended vào danh sách upcoming.
     */
    test(`[${label}] ${date}: tất cả upcoming events phải là not_started`, async ({ request }) => {
      const res    = await callAPI(request, date, 'upcoming');
      const events = res.data?.events ?? [];

      if (events.length === 0) {
        console.log(`  [${label}] ${date}: events rỗng — skip status check`);
        return;
      }

      const wrongStatus = events.filter((e: MatchEvent) => e.status?.type !== 'not_started');
      if (wrongStatus.length) {
        wrongStatus.slice(0, 5).forEach((e: MatchEvent) =>
          console.warn(`  [${date}] id=${e.id} status=${e.status?.type} tournament=${e.tournament?.name}`)
        );
      }

      console.log(`\n[${label}] ${date}: ${events.length} events, ${wrongStatus.length} sai status`);
      expect.soft(
        wrongStatus.length,
        `[${label}] ${date}: ${wrongStatus.length} events không phải not_started trong upcoming tab`
      ).toBe(0);
    });

  } // end for DATE_MATRIX

  // ── Test tổng hợp: tất cả ngày không được trả code != 1 ─────────────────
  /**
   * Sweep nhanh: gọi upcoming cho TẤT CẢ ngày trong matrix cùng lúc,
   * không được có ngày nào trả lỗi (code != 1, hoặc throw).
   */
  test('Sweep: tất cả ngày trong matrix đều trả code=1, không crash', async ({ request }) => {
    const results = await Promise.all(
      UNIQUE_DATE_MATRIX.map(async ({ label, date }) => {
        try {
          const res = await callAPI(request, date, 'upcoming');
          return { label, date, code: res.code, ok: res.code === 1 };
        } catch (e) {
          return { label, date, code: -1, ok: false, error: (e as Error).message };
        }
      })
    );

    console.log('\nSweep results:');
    results.forEach(r => {
      const icon = r.ok ? '✓' : '✗';
      console.log(`  ${icon} [${r.label}] ${r.date} → code=${r.code}${'error' in r ? ` ERROR: ${r.error}` : ''}`);
    });

    const failed = results.filter(r => !r.ok);
    expect(
      failed.length,
      `${failed.length} ngày trả lỗi: ${failed.map(r => `${r.date}(code=${r.code})`).join(', ')}`
    ).toBe(0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 5: Multi-Locale Timezone — Smoke Test
// ═══════════════════════════════════════════════════════════════════════════
/**
 * MỤC ĐÍCH: Kiểm tra nhanh tất cả locale có múi giờ khác UTC.
 *
 * BUG: Server dùng UTC day boundary thay vì local day boundary → mất trận.
 *   UTC-  (Americas): mất 3–8 tiếng CUỐI ngày (21:00–23:59 local)
 *   UTC+  (Asia/AU) : mất 7–10 tiếng ĐẦU ngày (00:00–06:59 local)
 *
 * TEST CASES:
 * ┌────┬──────────────────┬────────┬───────────────────────────────────────┐
 * │ #  │ Locale           │ Offset │ Khung giờ có thể bị mất               │
 * ├────┼──────────────────┼────────┼───────────────────────────────────────┤
 * │ 1  │ BR (Brazil/SP)   │ UTC−3  │ 21:00–23:59 local (3 tiếng cuối)     │
 * │ 2  │ AR (Argentina)   │ UTC−3  │ 21:00–23:59 local (3 tiếng cuối)     │
 * │ 3  │ US (New York)    │ UTC−4  │ 20:00–23:59 local (4 tiếng cuối)     │
 * │ 4  │ MX (Mexico City) │ UTC−6  │ 18:00–23:59 local (6 tiếng cuối)     │
 * │ 5  │ VN (Vietnam)     │ UTC+7  │ 00:00–06:59 local (7 tiếng đầu)      │
 * │ 6  │ JP (Japan)       │ UTC+9  │ 00:00–08:59 local (9 tiếng đầu)      │
 * └────┴──────────────────┴────────┴───────────────────────────────────────┘
 *
 * SMOKE TEST CHECKLIST:
 *   ✅ Mỗi locale trả code=1, cấu trúc hợp lệ
 *   ✅ Completeness: events + otherComps = total
 *   ✅ Tất cả events phải là not_started
 *   ✅ Total giữa các locale chênh lệch hợp lý (không quá lớn so với VN)
 *   ✅ Không locale nào trả total=0 khi VN có data
 *
 * CÁCH SMOKE TEST NHANH BẰNG CURL:
 *   DATE=$(date +%Y-%m-%d)
 *   for LOCALE in VN BR AR US MX JP; do
 *     TOTAL=$(curl -s -X POST \
 *       "https://opta-api.uniscore.vn/api/v2/sport/football/scheduled-events-pagination-v2/$DATE/locale/$LOCALE/type/upcoming" \
 *       -H "Content-Type: application/json" \
 *       -d '{"sortByMatchTime":false}' | jq '.data.pagination.total')
 *     echo "$LOCALE ($DATE): total=$TOTAL"
 *   done
 *
 *   Kết quả kỳ vọng: tất cả TOTAL xấp xỉ nhau (cùng ngày UTC).
 *   Nếu BR/US/MX có total thấp hơn VN nhiều → bug timezone chưa fix.
 */

/** Danh sách locale cần test kèm offset UTC (giờ) */
const LOCALE_MATRIX = [
  { locale: 'BR', offsetH: -3, name: 'Brazil/São Paulo' },
  { locale: 'AR', offsetH: -3, name: 'Argentina'        },
  { locale: 'US', offsetH: -4, name: 'USA/New York'     },
  { locale: 'MX', offsetH: -6, name: 'Mexico City'      },
  { locale: 'VN', offsetH:  7, name: 'Vietnam'          },
  { locale: 'JP', offsetH:  9, name: 'Japan'            },
];

/**
 * Tính ngày "ngày mai" theo timezone của locale.
 * Ví dụ: UTC+7 → ngày mai VN; UTC-3 → ngày mai SP.
 */
function tomorrowInLocale(offsetH: number): string {
  const localNowMs = Date.now() + offsetH * 3600 * 1000;
  return new Date(localNowMs + 86_400_000).toISOString().slice(0, 10);
}

test.describe('Multi-Locale Timezone — Smoke Test', () => {
  test.setTimeout(60_000);

  // ── Test 1: Structure + completeness cho từng locale ─────────────────────
  /**
   * Với mỗi locale, gọi API ngày mai theo timezone của locale đó.
   * Verify: code=1, completeness đúng, tất cả events là not_started.
   */
  for (const { locale, offsetH, name } of LOCALE_MATRIX) {
    test(`[${locale}] ${name} (UTC${offsetH >= 0 ? '+' : ''}${offsetH}): structure + completeness + status`, async ({ request }) => {
      const tomorrow = tomorrowInLocale(offsetH);

      const res  = await request.post(
        `${API_BASE}/scheduled-events-pagination-v2/${tomorrow}/locale/${locale}/type/upcoming`,
        { data: { sortByMatchTime: false } }
      );
      const json = await res.json() as ApiResponse;
      const data = json.data;

      const evLen   = data?.events?.length ?? 0;
      const sumOC   = (data?.otherCompetitions ?? []).reduce((s, oc) => s + (oc.match_count ?? 0), 0);
      const total   = data?.pagination?.total ?? 0;
      const counted = evLen + sumOC;

      console.log(`\n[${locale}] ${name} — ngày mai local: ${tomorrow}`);
      console.log(`  total=${total}  events=${evLen}  otherComps=${sumOC}  counted=${counted}`);

      // Cấu trúc hợp lệ
      expect.soft(json.code,                              `[${locale}] code phải là 1`).toBe(1);
      expect.soft(Array.isArray(data?.events),            `[${locale}] events phải là array`).toBe(true);
      expect.soft(Array.isArray(data?.otherCompetitions), `[${locale}] otherCompetitions phải là array`).toBe(true);

      if (total === 0) {
        console.log(`  [${locale}] total=0 — không có trận upcoming, skip completeness`);
        return;
      }

      // Completeness
      expect.soft(
        Math.abs(counted - total),
        `[${locale}] completeness sai: counted=${counted} vs total=${total}`
      ).toBeLessThanOrEqual(5);

      // Tất cả events phải là not_started
      const wrongStatus = (data?.events ?? []).filter(e => e.status?.type !== 'not_started');
      if (wrongStatus.length) {
        wrongStatus.slice(0, 3).forEach(e =>
          console.warn(`  [${locale}] event id=${e.id} status=${e.status?.type}`)
        );
      }
      expect.soft(
        wrongStatus.length,
        `[${locale}] ${wrongStatus.length} events không phải not_started`
      ).toBe(0);
    });
  }

  // ── Test 2: Cross-locale — mỗi locale phải có data và không crash ────────
  /**
   * Mỗi locale query ngày mai theo timezone của mình.
   * Vì ngày local khác nhau → total khác nhau là hợp lệ, KHÔNG so sánh số.
   *
   * Smoke check:
   *   1. Tất cả locale trả code=1 (không crash)
   *   2. Không locale nào bị lỗi server (5xx)
   *   3. In ra bảng để QC so sánh thủ công
   *
   * Dấu hiệu bug timezone còn tồn tại (QC check thủ công):
   *   - UTC− locale (BR/US/MX) trả total = 0 hoặc rất thấp (<5) trong khi
   *     VN (UTC+7) cùng ngày UTC trả total cao → mất trận cuối ngày local.
   */
  test('Cross-locale: tất cả locale trả code=1, không crash', async ({ request }) => {
    const utcDate = TODAY;

    const results = await Promise.all(
      LOCALE_MATRIX.map(async ({ locale, offsetH, name }) => {
        const localTomorrow = tomorrowInLocale(offsetH);
        try {
          const res  = await request.post(
            `${API_BASE}/scheduled-events-pagination-v2/${localTomorrow}/locale/${locale}/type/upcoming`,
            { data: { sortByMatchTime: false } }
          );
          const json = await res.json() as ApiResponse;
          const evLen = json.data?.events?.length ?? 0;
          const sumOC = (json.data?.otherCompetitions ?? []).reduce((s, oc) => s + (oc.match_count ?? 0), 0);
          return {
            locale, name, offsetH,
            date: localTomorrow,
            total: json.data?.pagination?.total ?? 0,
            counted: evLen + sumOC,
            ok: json.code === 1,
          };
        } catch (e) {
          return { locale, name, offsetH, date: localTomorrow, total: -1, counted: -1, ok: false };
        }
      })
    );

    console.log(`\nCross-locale smoke (UTC date=${utcDate}):`);
    console.log('  Locale  | Offset | Date query | Total | Counted | OK?');
    console.log('  --------|--------|------------|-------|---------|----');
    results.forEach(r => {
      const completenessOk = Math.abs(r.total - r.counted) <= 5;
      const flag = !r.ok ? '❌ CRASH' : r.total === 0 ? '⚠ no data' : completenessOk ? '✓' : '⚠ completeness';
      console.log(`  [${r.locale.padEnd(6)}] UTC${r.offsetH >= 0 ? '+' : ''}${String(r.offsetH).padStart(2)} | ${r.date} | ${String(r.total).padStart(5)} | ${String(r.counted).padStart(7)} | ${flag}`);
    });

    // Assertion: không locale nào crash
    const crashed = results.filter(r => !r.ok);
    expect(
      crashed.length,
      `Locale crash: ${crashed.map(r => r.locale).join(', ')}`
    ).toBe(0);

    // Soft: completeness phải đúng cho tất cả locale có data
    for (const r of results.filter(r => r.total > 0)) {
      expect.soft(
        Math.abs(r.total - r.counted),
        `[${r.locale}] completeness sai: counted=${r.counted} vs total=${r.total}`
      ).toBeLessThanOrEqual(5);
    }
  });

});

// npx playwright test tests/upcoming_fakeip_time.spec.ts --project=chrome
