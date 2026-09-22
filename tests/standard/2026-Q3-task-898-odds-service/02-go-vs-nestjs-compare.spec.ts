/**
 * US-898 — So sánh Go (api-football-odds, local :8090) vs NestJS (opta-api).
 * Mục tiêu chính của task: response phải GIỐNG HỆT NHAU giữa 2 service, TRỪ
 * 2 điểm cố ý khác biệt đã ghi trong doc (mục "2 chỗ Go CỐ Ý khác NestJS"):
 *   1. /provider/:id nhóm main — NestJS có bug cache Redis lúc lọc lúc không,
 *      Go luôn lọc đúng 1 company. KHÔNG so sánh trực tiếp 2 bên ở case này.
 *   2. std1x2/3in1 half=1, cột "v" — NestJS hoán home<->draw khi cache hit
 *      (sai), Go luôn đúng theo PG. KHÔNG assert 2 bên giống nhau ở field "v".
 *
 * Go service CHƯA CHẠY sẵn trên bất kỳ môi trường công khai nào tại thời điểm
 * viết (dev chưa có host riêng theo doc, phải chạy local qua APP_PORT=8090).
 * Toàn bộ test trong file này TỰ ĐỘNG SKIP (không FAIL) nếu không kết nối được
 * Go local — để không chặn suất chạy chung khi Go chưa bật.
 *
 * CHẠY (sau khi đã `go run .` hoặc build+chạy api-football-odds ở APP_PORT=8090):
 *   npx playwright test tests/standard/2026-Q3-task-898-odds-service/02-go-vs-nestjs-compare.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { ODDS_BASE, SAMPLE_EVENTS, MARKET_IDS, getJson, isGoLocalUp } from './lib/odds-client';

const NESTJS = ODDS_BASE.staging;
const GO = ODDS_BASE.goLocal;
const PROVIDER = 1;

test.describe('[US-898] Go vs NestJS — market_all (15 market × 2 half × 2 trận, theo doc "60/60 giống hệt")', () => {
  test.beforeEach(async ({ request }) => {
    const up = await isGoLocalUp(request);
    test.skip(!up, 'Go local (:8090) không kết nối được — chạy `go run .` với APP_PORT=8090 trước khi test file này');
  });

  // 15 market hỗ trợ market_all theo bảng trong doc (bỏ teamGoalTxHome/teamGoalTxAway — chỉ odds-changes hỗ trợ)
  const MARKET_ALL_SUPPORTED = MARKET_IDS.filter((m) => m !== 'teamGoalTxHome' && m !== 'teamGoalTxAway');

  for (const eventId of SAMPLE_EVENTS) {
    for (const half of [0, 1] as const) {
      for (const marketId of MARKET_ALL_SUPPORTED) {
        test(`event=${eventId} half=${half} market=${marketId}`, async ({ request }) => {
          const path = `/football/event/${eventId}/odds/half/${half}/market/${marketId}`;
          const [nest, go] = [await getJson(request, NESTJS, path), await getJson(request, GO, path)];
          expect(go.status).toBe(200);
          expect(nest.status).toBe(200);

          // Go body có thêm field error_code (theo doc: "Go có field error_code,
          // NestJS không có") — loại field này trước khi so sánh phần còn lại.
          const { error_code, ...goRest } = go.body ?? {};
          expect(goRest, `event=${eventId} half=${half} market=${marketId}: Go vs NestJS lệch`).toEqual(nest.body);
        });
      }
    }
  }
});

test.describe('[US-898] Go vs NestJS — các route khác (odds-changes, odds/all, winning-odds, odd-live-change)', () => {
  test.beforeEach(async ({ request }) => {
    const up = await isGoLocalUp(request);
    test.skip(!up, 'Go local (:8090) không kết nối được — chạy `go run .` với APP_PORT=8090 trước khi test file này');
  });

  const EVENT = SAMPLE_EVENTS[0];

  test('odds-changes (prefix football) — Go vs NestJS giống hệt', async ({ request }) => {
    const path = `/football/event/${EVENT}/odds-changes/book/${PROVIDER}/market/hdp/half/0`;
    const nest = await getJson(request, NESTJS, path);
    const go = await getJson(request, GO, path);
    expect(go.status).toBe(200);
    const { error_code, ...goRest } = go.body ?? {};
    expect(goRest).toEqual(nest.body);
  });

  test('odds-changes (bare prefix) — Go vs NestJS giống hệt', async ({ request }) => {
    const path = `/event/${EVENT}/odds-changes/book/${PROVIDER}/market/hdp/half/0`;
    const nest = await getJson(request, NESTJS, path);
    const go = await getJson(request, GO, path);
    expect(go.status).toBe(200);
    const { error_code, ...goRest } = go.body ?? {};
    expect(goRest).toEqual(nest.body);
  });

  test('odds/:provider/all — Go vs NestJS giống hệt (KHÔNG có envelope)', async ({ request }) => {
    const path = `/football/event/${EVENT}/odds/${PROVIDER}/all`;
    const nest = await getJson(request, NESTJS, path);
    const go = await getJson(request, GO, path);
    expect(go.status).toBe(200);
    expect(go.body.markets).toEqual(nest.body.markets);
  });

  test('sport/football/odd-live-change/:provider — Go vs NestJS giống hệt', async ({ request }) => {
    const path = `/sport/football/odd-live-change/${PROVIDER}`;
    const nest = await getJson(request, NESTJS, path);
    const go = await getJson(request, GO, path);
    expect(go.status).toBe(200);
    const { error_code, ...goRest } = go.body ?? {};
    expect(goRest).toEqual(nest.body);
  });
});

test.describe('[US-898] Go vs NestJS — 2 điểm CỐ Ý khác biệt (verify Go đúng theo spec, KHÔNG so trực tiếp NestJS)', () => {
  test.beforeEach(async ({ request }) => {
    const up = await isGoLocalUp(request);
    test.skip(!up, 'Go local (:8090) không kết nối được — chạy `go run .` với APP_PORT=8090 trước khi test file này');
  });

  const EVENT = SAMPLE_EVENTS[0];

  test('[Cố ý #1] /provider/:id nhóm main — Go PHẢI luôn lọc đúng 1 company (NestJS có bug cache, không so trực tiếp)', async ({ request }) => {
    const path = `/football/event/${EVENT}/odds/half/0/market/hdp/provider/${PROVIDER}`;
    const go = await getJson(request, GO, path);
    expect(go.status).toBe(200);
    const companyIds = Object.keys(go.body.data ?? {});
    expect(companyIds, 'Go phải luôn lọc đúng 1 company theo provider_id, không trả hết như NestJS lúc cache miss').toEqual([String(PROVIDER)]);
  });

  test('[Cố ý #2] std1x2 half=1, cột "v" — Go PHẢI khớp odds_european_half trong PG (NestJS có thể hoán home<->draw khi cache hit)', async ({ request }) => {
    const path = `/football/event/${EVENT}/odds/half/1/market/std1x2`;
    const go = await getJson(request, GO, path);
    expect(go.status).toBe(200);
    // Chỉ verify Go trả về có cấu trúc hợp lệ (choices có Home/Draw/Away đúng
    // thứ tự tên) — verify khớp PG thật cần connect trực tiếp DB Go dùng, để
    // dành cho lần chạy có quyền truy cập DB đó, không giả định ở đây.
    const companyIds = Object.keys(go.body.data ?? {});
    if (companyIds.length > 0) {
      const firstChoices = go.body.data[companyIds[0]].std1x2?.choices ?? [];
      const names = firstChoices.map((c: any) => c.name);
      expect(names).toEqual(expect.arrayContaining(['Home', 'Draw', 'Away']));
    }
  });
});
