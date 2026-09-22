/**
 * TASK 3369 — Case bổ sung: query param không được tài liệu hoá + response
 * headers khác biệt giữa 2 service.
 *
 * Chưa được cover bởi 11 file trước (01-11) — 2 góc độ mới:
 *   1. Query param lạ (page/limit/sort/offset...) trên endpoint
 *      career-history-seasons-detail — đã verify tay qua Playwright MCP thật
 *      (2026-08-28): CẢ 2 service đều BỎ QUA hoàn toàn các query này (trả y
 *      hệt không truyền), không phải bug — chỉ ghi nhận hành vi nhất quán.
 *   2. Response headers — service mới có "x-service-name:
 *      staging-api-football-players" (khác "staging-opta-api" của cũ) và hỗ
 *      trợ "content-encoding: gzip" — verify không có header nào BỊ THIẾU
 *      mà client cũ đang dựa vào (vd CORS, content-type).
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/12-coach-query-params-and-headers.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';
const COACH_ID = 's5ofw4kosjhn5ek'; // Paulo Fonseca, Lyon

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

test.describe('[TASK-3369] Coach — query param lạ/không tài liệu hoá bị bỏ qua nhất quán giữa 2 service', () => {
  const EXTRA_QUERIES = ['?page=2&limit=5', '?sort=asc', '?offset=100', '?include=all', '?fields=teamName'];

  for (const query of EXTRA_QUERIES) {
    test(`career-history-seasons-detail${query} — data giống hệt không truyền query, ở CẢ 2 service`, async ({ request }) => {
      const baseline = await request.get(`${OLD_BASE}/${COACH_ID}/career-history-seasons-detail?language=en`);
      const [oldWithQuery, newWithQuery] = await Promise.all([
        request.get(`${OLD_BASE}/${COACH_ID}/career-history-seasons-detail?language=en${query}`),
        request.get(`${NEW_BASE}/${COACH_ID}/career-history-seasons-detail?language=en${query}`),
      ]);
      const baselineBody = await baseline.json();
      const oldBody = await oldWithQuery.json();
      const newBody = await newWithQuery.json();

      expect(oldWithQuery.status()).toBe(200);
      expect(newWithQuery.status()).toBe(200);
      expect(stableStringify(oldBody.data), `service CŨ: query "${query}" không được ảnh hưởng tới data`).toBe(stableStringify(baselineBody.data));
      expect(stableStringify(newBody.data), `service MỚI: query "${query}" không được ảnh hưởng tới data`).toBe(stableStringify(baselineBody.data));
    });
  }
});

test.describe('[TASK-3369] Coach — response headers không thiếu field quan trọng client đang phụ thuộc', () => {
  test('CORS headers (access-control-*) phải tồn tại ở cả 2 service — client browser gọi trực tiếp sẽ vỡ nếu thiếu', async ({ request }) => {
    const [oldRes, newRes] = await Promise.all([
      request.get(`${OLD_BASE}/${COACH_ID}/info?language=en`),
      request.get(`${NEW_BASE}/${COACH_ID}/info?language=en`),
    ]);
    const oldHeaders = oldRes.headers();
    const newHeaders = newRes.headers();

    expect(oldHeaders['access-control-allow-origin']).toBeTruthy();
    expect(newHeaders['access-control-allow-origin'], 'service MỚI thiếu access-control-allow-origin — sẽ vỡ CORS cho client browser').toBeTruthy();
    expect(newHeaders['content-type']).toContain('application/json');
  });

  test('x-service-name xác nhận đúng service đang trả lời (dấu vết định danh, không phải bug)', async ({ request }) => {
    const [oldRes, newRes] = await Promise.all([
      request.get(`${OLD_BASE}/${COACH_ID}/info?language=en`),
      request.get(`${NEW_BASE}/${COACH_ID}/info?language=en`),
    ]);
    console.log(`  old x-service-name: ${oldRes.headers()['x-service-name']}`);
    console.log(`  new x-service-name: ${newRes.headers()['x-service-name']}`);
    expect(newRes.headers()['x-service-name']).toBeTruthy();
  });
});

test.describe('[TASK-3369] Coach — concurrent request tới CÙNG 1 coach trên service MỚI (race condition tự thân)', () => {
  test('20 request đồng thời tới cùng ref_id — mọi response phải giống hệt nhau (không có race condition ghi/đọc cache)', async ({ request }) => {
    const CONCURRENT_COUNT = 20;
    const promises = Array.from({ length: CONCURRENT_COUNT }, () => request.get(`${NEW_BASE}/${COACH_ID}/info?language=en`));
    const responses = await Promise.all(promises);

    for (const res of responses) {
      expect(res.status()).toBe(200);
    }

    const bodies = await Promise.all(responses.map((r) => r.json()));
    const stringified = bodies.map((b) => stableStringify(b.data));
    const uniqueResults = new Set(stringified);

    expect(uniqueResults.size, `${CONCURRENT_COUNT} request đồng thời trả về ${uniqueResults.size} kết quả KHÁC NHAU — nghi ngờ race condition trong cache/xử lý concurrent của service mới`).toBe(1);
  });
});
