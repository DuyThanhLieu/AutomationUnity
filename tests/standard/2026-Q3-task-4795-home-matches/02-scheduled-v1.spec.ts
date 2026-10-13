/**
 * US-4795 — scheduled-v1 (doc 2/5 US-4640).
 * POST /scheduled-events-pagination/{date}/locale/{locale}/type/{type}
 *
 * Đối chiếu với V2: cùng tập trận, cùng thứ tự trừ phần V2 gom trận cùng bảng.
 * Verify bug cache competitionId (mục 12 doc) đã được fix.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/02-scheduled-v1.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV1, scheduledV2, duplicateIds } from './lib/home-client';

const PAST = vnDate(-3);

test.describe(`scheduled-v1 vs v2 · VN · ${PAST}`, () => {
  let v1: any;
  let v2: any;

  test.beforeAll(async ({ request }) => {
    // V1 cache RAM từng pod, V2 snapshot Redis → có thể lệch vài giây khi dữ liệu vừa đổi.
    // Thử lại tối đa 3 lần cho tới khi 2 bên cùng tổng số trận.
    for (let i = 0; i < 3; i++) {
      [v1, v2] = await Promise.all([post(request, scheduledV1(PAST)), post(request, scheduledV2(PAST))]).then((r) => r.map((x) => x.body));
      if (v1.data.events.length === v2.data.events.length) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
  });

  test('response hợp lệ, không trùng trận', () => {
    expect(v1.code).toBe(1);
    expect(v1.data.pagination).toMatchObject({ page: 1, size: 5000 });
    expect(duplicateIds(v1.data.events)).toEqual([]);
  });

  test('events cùng tập trận với V2', () => {
    const a = new Set(v1.data.events.map((e: any) => e.id));
    const b = new Set(v2.data.events.map((e: any) => e.id));
    expect([...b].filter((id) => !a.has(id))).toEqual([]);
    expect([...a].filter((id) => !b.has(id))).toEqual([]);
  });

  test('trận không thuộc bảng đấu: thứ tự trùng V2; thứ tự giải trùng V2', () => {
    const grouped = new Set(v2.data.events.filter((e: any) => e.tournament.group_id).map((e: any) => e.id));
    const order1 = v1.data.events.filter((e: any) => !grouped.has(e.id)).map((e: any) => e.id);
    const order2 = v2.data.events.filter((e: any) => !grouped.has(e.id)).map((e: any) => e.id);
    expect(order1).toEqual(order2);
    const comps = (evs: any[]) => [...new Set(evs.map((e) => e.tournament.id))];
    expect(comps(v1.data.events)).toEqual(comps(v2.data.events));
  });

  test('V1 không có tournament.group_id', () => {
    expect(v1.data.events.filter((e: any) => e.tournament.group_id).map((e: any) => e.id)).toEqual([]);
  });

  test('otherCompetitions phẳng: mỗi dòng 1 giải, sắp tier tăng dần (99999 cuối)', () => {
    const rows = v1.data.otherCompetitions;
    for (const r of rows) {
      expect(typeof r.competition_id).toBe('string');
      expect(r.match_count).toBeGreaterThan(0);
    }
    const tiers = rows.map((r: any) => r.competition_tier);
    expect(tiers.every((t: number, i: number) => i === 0 || t >= tiers[i - 1])).toBe(true);
    expect(new Set(rows.map((r: any) => r.competition_id)).size).toBe(rows.length);
  });

  test('tổng match_count V1 ≥ V2 (V1 giữ cả giải không có quốc gia/châu lục)', () => {
    const s1 = v1.data.otherCompetitions.reduce((s: number, r: any) => s + r.match_count, 0);
    const s2 = v2.data.otherCompetitions.reduce((s: number, g: any) => s + g.match_count, 0);
    expect(s1).toBeGreaterThanOrEqual(s2);
  });
});

// Mọi request competitionId trên V1 có thể ghi đè cache trang chủ của 1 pod
// (BUG #1) → người dùng thật vào trang chủ ngày đó trên pod đó chỉ thấy vài
// trận trong ~5–60 giây. Chỉ chạy khi chủ động bật cờ.
const RUN_POLLUTION = process.env.RUN_CACHE_POLLUTION_TEST === '1';

test.describe('scheduled-v1 · luồng competitionId (ảnh hưởng cache prod)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!RUN_POLLUTION, 'Có thể làm bẩn cache trang chủ prod — bật RUN_CACHE_POLLUTION_TEST=1 để chạy');

  test('mở 1 giải: chỉ trận của giải đó, topMatches [], otherCompetitions []', async ({ request }) => {
    const home = (await post(request, scheduledV1(PAST))).body;
    const row = home.data.otherCompetitions[0];
    test.skip(!row, 'Không có giải khác trong ngày');
    const { body } = await post(request, scheduledV1(PAST), { competitionId: row.competition_id });
    expect(body.code).toBe(1);
    expect(body.data.events.length).toBeGreaterThan(0);
    expect(body.data.events.every((e: any) => e.tournament.id === row.competition_id)).toBe(true);
    expect(body.data.topMatches).toEqual([]);
    expect(body.data.otherCompetitions).toEqual([]);
  });

  test('BUG #1 (đã báo fix): request competitionId không làm bẩn cache trang chủ', async ({ request }) => {
    const before = (await post(request, scheduledV1(PAST))).body;
    const row = before.data.otherCompetitions[0];
    test.skip(!row, 'Không có giải khác trong ngày');
    // Gọi mở giải nhiều lần để tăng khả năng trúng cùng pod với key trang chủ.
    for (let i = 0; i < 5; i++) await post(request, scheduledV1(PAST), { competitionId: row.competition_id });
    // Refresher có thể build lại key trong 0,3–30 giây → kiểm tra trang chủ nhiều lần.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const after = (await post(request, scheduledV1(PAST))).body;
      expect(after.data.events.length, `lần ${i + 1}: trang chủ bị thay bằng kết quả của giải`).toBe(before.data.events.length);
      expect(after.data.otherCompetitions.length).toBeGreaterThan(0);
    }
  });
});

test.describe('scheduled-v1 · gửi nhầm trường', () => {
  test('gửi nhầm competitionIds lên V1 → bị bỏ qua, trả trang chủ mặc định', async ({ request }) => {
    const home = (await post(request, scheduledV1(PAST))).body;
    const row = home.data.otherCompetitions[0];
    test.skip(!row, 'Không có giải khác trong ngày');
    const { body } = await post(request, scheduledV1(PAST), { competitionIds: [row.competition_id] });
    expect(body.data.events.length).toBe(home.data.events.length);
  });
});
