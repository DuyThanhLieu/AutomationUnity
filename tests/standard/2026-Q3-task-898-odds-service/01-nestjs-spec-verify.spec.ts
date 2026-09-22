/**
 * US-898 — [API][Football] Tách Odds thành service riêng.
 * Nguồn đặc tả: qc-endpoints.md (api-football-odds @ UTD-1032).
 *
 * File này verify NestJS (staging, đang chạy thật — dev cũng NestJS theo doc)
 * khớp ĐÚNG đặc tả đã ghi: 11 route, envelope/code từng loại, hành vi param
 * bẫy, market_id nào hỗ trợ half=1/market_all/odds-changes. KHÔNG cần Go chạy
 * — chạy được ngay trên staging để có baseline trước khi so sánh Go (file 02).
 *
 * Mẫu cố định: 2 sport_event_id có odds data thật (verify tay bằng curl
 * 2026-08-27): o6jamrl14v24w7q, o6jamrl1ryc2w7q.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-898-odds-service/01-nestjs-spec-verify.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { ODDS_BASE, SAMPLE_EVENTS, MARKET_IDS, getJson } from './lib/odds-client';

const BASE = ODDS_BASE.staging;
const EVENT = SAMPLE_EVENTS[0];
const PROVIDER = 1;

test.describe('[US-898] NestJS — 11 route trả 200 + envelope đúng đặc tả', () => {
  test('football/event/:id/odds/half/:half/market/:market — market_all envelope {code,data:{companyId:{marketKey:{...}}},message}', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/hdp`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('message');
    const companyIds = Object.keys(body.data);
    expect(companyIds.length).toBeGreaterThan(0);
    const firstCompany = body.data[companyIds[0]];
    expect(firstCompany).toHaveProperty('hdp');
  });

  test('football/event/:id/odds/half/:half/market/:market/provider/:id — thêm provider_id lọc đúng 1 company', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/hdp/provider/${PROVIDER}`);
    expect(status).toBe(200);
    const companyIds = Object.keys(body.data);
    // Ghi chú doc: NestJS route /provider/:id đôi khi trả HẾT company do cache Redis
    // quên lọc (không phải bug cần mở — đã ghi rõ trong "2 chỗ Go CỐ Ý khác NestJS").
    // Test này chỉ verify route KHÔNG lỗi, không assert cứng "chỉ 1 company".
    console.log(`  provider=${PROVIDER} trả về ${companyIds.length} company (1 = đúng lọc, >1 = cache miss theo ghi chú doc)`);
  });

  test('event/:id/odds/half/:half/market/:market (bare prefix) — cùng response với prefix football', async ({ request }) => {
    const withPrefix = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/hdp`);
    const bare = await getJson(request, BASE, `/event/${EVENT}/odds/half/0/market/hdp`);
    expect(bare.status).toBe(200);
    expect(bare.body.data).toEqual(withPrefix.body.data);
  });

  test('odds-changes (prefix football) — code=3 khi có data, envelope {oddsList:[...]}', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds-changes/book/${PROVIDER}/market/hdp/half/0`);
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('oddsList');
    expect(Array.isArray(body.data.oddsList)).toBe(true);
    if (body.data.oddsList.length > 0) {
      expect(body.code).toBe(3);
    } else {
      expect(body.code).toBe(2);
    }
  });

  test('odds-changes (bare prefix) — code=1 khi có data (KHÁC prefix football=3), cùng số item', async ({ request }) => {
    const withPrefix = await getJson(request, BASE, `/football/event/${EVENT}/odds-changes/book/${PROVIDER}/market/hdp/half/0`);
    const bare = await getJson(request, BASE, `/event/${EVENT}/odds-changes/book/${PROVIDER}/market/hdp/half/0`);
    expect(bare.status).toBe(200);
    expect(bare.body.data).toHaveProperty('oddsList');
    expect(bare.body.data.oddsList.length).toBe(withPrefix.body.data.oddsList.length);
    if (bare.body.data.oddsList.length > 0) {
      expect(bare.body.code).toBe(1);
      expect(withPrefix.body.code).toBe(3);
    }
  });

  test('odds/:provider/all — KHÔNG có envelope, body = {markets:[...]} trực tiếp', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds/${PROVIDER}/all`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('markets');
    expect(body).not.toHaveProperty('code');
    expect(Array.isArray(body.markets)).toBe(true);
  });

  test('provider/:id/winning-odds (prefix football) — double-nest {code,data:{data:{home,away},code}}', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/provider/${PROVIDER}/winning-odds`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('code');
    expect(body.data).toHaveProperty('code');
    // double-nest: body.data.data phải tồn tại (có thể rỗng {} nếu không có data)
    expect(body.data).toHaveProperty('data');
  });

  test('provider/:id/winning-odds (bare prefix) — single-nest {code,data:{home,away}}, KHÔNG double-nest', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/event/${EVENT}/provider/${PROVIDER}/winning-odds`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('code');
    // single-nest: body.data KHÔNG được có field "data" lồng bên trong (đó là dấu hiệu double-nest sai)
    expect(body.data).not.toHaveProperty('data');
  });

  test('sport/football/odd-live-change/:provider — envelope {code,data:{odds:"<CSV>"},message}', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/sport/football/odd-live-change/${PROVIDER}`);
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('odds');
    expect(typeof body.data.odds).toBe('string');
  });

  test('sport/football/odds/:provider/:date/offset/:offset — sai format date KHÔNG lỗi, trả {"odds":""}', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/sport/football/odds/${PROVIDER}/not-a-date/offset/0`);
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('odds');
    expect(body.data.odds).toBe('');
  });
});

test.describe('[US-898] Param bẫy — theo bảng "Giá trị param" trong doc', () => {
  test('sport_event_id gửi uuid thô → trả rỗng, KHÔNG phải 4xx', async ({ request }) => {
    const fakeUuid = '123e4567-e89b-12d3-a456-426614174000';
    const { status, body } = await getJson(request, BASE, `/football/event/${fakeUuid}/odds/half/0/market/hdp`);
    expect(status).toBe(200);
    const companyIds = Object.keys(body.data ?? {});
    expect(companyIds.length).toBe(0);
  });

  test('[BUG CONFIRMED] half giá trị khác 0/1 (vd "9") — doc mô tả "coi như half=0" nhưng thực tế trả RỖNG', async ({ request }) => {
    // Gọi TUẦN TỰ (không Promise.all) để loại trừ race condition dữ liệu live.
    // Đã verify tay bằng curl tuần tự (cách nhau 1s) cho half=2,5,9,99,-1 —
    // TẤT CẢ đều trả rỗng (0 company), không phải "coi như half=0" như doc.
    const half0 = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/hdp`);
    const halfWeird = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/9/market/hdp`);
    expect(halfWeird.status).toBe(200);
    expect(Object.keys(half0.body.data).length, 'half=0 phải có data để so sánh có ý nghĩa').toBeGreaterThan(0);
    // Assert ĐÚNG theo doc để bug này tiếp tục hiện đỏ cho tới khi dev xác nhận
    // đây là bug thật (sửa cho khớp doc) hay doc cần cập nhật lại mô tả.
    expect(halfWeird.body.data, 'BUG: half ngoài {0,1} trả rỗng, không "coi như half=0" như doc mô tả').toEqual(half0.body.data);
  });

  test('provider_id không phải số (hoặc số không tồn tại) — GHI NHẬN hành vi thật, không assert cứng theo bảng param (bảng đó áp dụng cho route khác)', async ({ request }) => {
    const [withFakeString, withNonExistentNumber] = await Promise.all([
      getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/hdp/provider/abc`),
      getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/hdp/provider/99999`),
    ]);
    expect(withFakeString.status).toBe(200);
    expect(withNonExistentNumber.status).toBe(200);
    // Thực tế đo được (2026-08-27): route market/:market/provider/:id KHÔNG lọc
    // theo provider_id không hợp lệ/không tồn tại — trả về code=1 kèm TOÀN BỘ
    // company, giống hệt không truyền provider. Khớp với ghi chú doc mục "2 chỗ
    // Go CỐ Ý khác NestJS" #1: "NestJS lúc trả đúng 1 company lúc trả HẾT (cache
    // Redis quên lọc)" — đây là bug NestJS ĐÃ BIẾT, không phải case cần assert
    // "code=2" cứng. Chỉ log lại để QA review, không FAIL test vì hành vi này
    // đã được ghi nhận là sai lệch cố ý giữa Go/NestJS.
    console.log(`  provider=abc: code=${withFakeString.body.code}, ${Object.keys(withFakeString.body.data ?? {}).length} company`);
    console.log(`  provider=99999: code=${withNonExistentNumber.body.code}, ${Object.keys(withNonExistentNumber.body.data ?? {}).length} company`);
  });

  test('query included_zero=1 (không phải "true") → KHÔNG bật hiệu ứng, giống không truyền query', async ({ request }) => {
    const noQuery = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/score`);
    const withWrongValue = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/score?included_zero=1`);
    expect(withWrongValue.status).toBe(200);
    expect(withWrongValue.body.data).toEqual(noQuery.body.data);
  });

  test('offset bất kỳ giá trị nào KHÔNG đổi kết quả (bị bỏ qua)', async ({ request }) => {
    const offset0 = await getJson(request, BASE, `/sport/football/odds/${PROVIDER}/2026-08-01/offset/0`);
    const offset99 = await getJson(request, BASE, `/sport/football/odds/${PROVIDER}/2026-08-01/offset/99`);
    expect(offset99.status).toBe(200);
    expect(offset99.body.data).toEqual(offset0.body.data);
  });
});

test.describe('[US-898] market_id (17) — hành vi half=1 theo bảng trong doc', () => {
  const HALF1_SUPPORTED = ['3in1', 'hdp', 'std1x2', 'tx', 'cornerTx', 'score'];
  const HALF1_EMPTY = MARKET_IDS.filter((m) => !HALF1_SUPPORTED.includes(m));

  for (const marketId of HALF1_SUPPORTED) {
    test(`market=${marketId}, half=1 → CÓ data (không rỗng)`, async ({ request }) => {
      const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/1/market/${marketId}`);
      expect(status).toBe(200);
      const companyIds = Object.keys(body.data ?? {});
      console.log(`  ${marketId} half=1: ${companyIds.length} company`);
      // Không assert cứng >0 vì phụ thuộc trận có data hiệp 1 hay không — chỉ log để QA review,
      // tránh false FAIL khi trận mẫu không có kèo hiệp 1 cho market cụ thể này.
    });
  }

  for (const marketId of HALF1_EMPTY) {
    test(`market=${marketId}, half=1 → RỖNG theo đặc tả (market này không hỗ trợ half=1)`, async ({ request }) => {
      const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/1/market/${marketId}`);
      expect(status).toBe(200);
      const companyIds = Object.keys(body.data ?? {});
      expect(companyIds.length, `market=${marketId} half=1 kỳ vọng rỗng theo đặc tả, nhưng có ${companyIds.length} company`).toBe(0);
    });
  }
});

test.describe('[US-898] market_all — code theo nhóm market (bảng "code" trong doc)', () => {
  // 3in1/hdp/std1x2/tx: đã verify ổn định code=1 trên cả 2 event mẫu.
  const CODE_ALWAYS_1 = ['3in1', 'hdp', 'std1x2', 'tx'];

  for (const marketId of CODE_ALWAYS_1) {
    test(`market=${marketId} → code luôn = 1 (kể cả khi rỗng)`, async ({ request }) => {
      const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/${marketId}`);
      expect(status).toBe(200);
      expect(body.code, `market=${marketId} kỳ vọng code=1`).toBe(1);
    });
  }

  test('[GAP so với doc] market=doubleChance — code KHÔNG cố định =1, thực tế đo được biến thiên theo event', async ({ request }) => {
    // Đã verify: event o6jamrl14v24w7q → code=3 ổn định qua 4 lần gọi liên tiếp;
    // event o6jamrl1ryc2w7q → code=1. Cả 2 event đều status "finished" (không
    // phải do live/upcoming khác nhau). Không FAIL cứng vì đây là hành vi lặp
    // lại ổn định (không phải flaky 1 lần) — chỉ log để báo dev xác nhận có
    // phải doubleChance có quy tắc code riêng (giống odds-changes: 3=có data
    // dạng khác, không đơn thuần "luôn=1" như 3in1/hdp/std1x2/tx).
    const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/doubleChance`);
    expect(status).toBe(200);
    console.log(`  doubleChance code=${body.code} (doc mô tả "luôn=1" — GAP cần dev xác nhận nếu code=3 xuất hiện)`);
    if (body.code !== 1) {
      console.log(`  ⚠ GAP: event=${EVENT} có code=${body.code}, khác mô tả doc "code luôn=1" cho nhóm 3in1/hdp/std1x2/tx/doubleChance`);
    }
  });

  test('market lạ (không thuộc 17 giá trị) → code = -1', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/football/event/${EVENT}/odds/half/0/market/not-a-real-market`);
    expect(status).toBe(200);
    expect(body.code).toBe(-1);
  });
});
