/**
 * US-4795 — live v1 (doc 3/5 US-4640).
 * POST /events/live/locale/{locale}
 *
 * Data là trận đang live tại thời điểm chạy → không có trận live thì các test
 * phụ thuộc data tự skip (không tính fail).
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/03-live-v1.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, liveV1, INPROGRESS_TYPE, splitCompetitions, duplicateIds, isSortedAsc } from './lib/home-client';

for (const locale of ['VN', 'GB']) {
  test.describe(`live v1 · ${locale}`, () => {
    let body: any;

    test.beforeAll(async ({ request }) => {
      const res = await post(request, liveV1(locale));
      expect(res.status).toBe(200);
      body = res.body;
    });

    test('response hợp lệ (code 1, hoặc code 2 = không có trận live với data rỗng)', () => {
      expect([1, 2]).toContain(body.code);
      if (body.code === 2) {
        expect(body.data.events).toEqual([]);
        expect(body.data.otherCompetitions).toEqual([]);
        expect(body.data.pagination.total).toBe(0);
      }
    });

    test('events: tối đa 10 giải, mỗi giải một đoạn liền nhau, không trùng trận', () => {
      test.skip(body.code !== 1, 'Không có trận live');
      const comps = new Set(body.data.events.map((e: any) => e.tournament.id));
      expect(comps.size).toBeLessThanOrEqual(10);
      expect(splitCompetitions(body.data.events)).toEqual([]);
      expect(duplicateIds(body.data.events)).toEqual([]);
    });

    test('mọi trận đều đang diễn ra (status.type = inprogress)', () => {
      test.skip(body.code !== 1, 'Không có trận live');
      const bad = body.data.events.filter((e: any) => e.status.type !== INPROGRESS_TYPE);
      expect(bad.map((e: any) => `${e.id}:${e.status.description}`)).toEqual([]);
    });

    test('otherCompetitions không trùng giải trong events; total = events + tổng match_count', () => {
      test.skip(body.code !== 1, 'Không có trận live');
      const comps = new Set(body.data.events.map((e: any) => e.tournament.id));
      const other = body.data.otherCompetitions;
      expect(other.filter((o: any) => comps.has(o.competition_id)).map((o: any) => o.competition_id)).toEqual([]);
      const sum = other.reduce((s: number, o: any) => s + o.match_count, 0);
      expect(body.data.pagination.total).toBe(body.data.events.length + sum);
      if (other.length > 0) expect(comps.size).toBeGreaterThan(0);
    });
  });
}

test.describe('live v1 · lọc theo giải', () => {
  test('competitionIds: chỉ trận của giải đó, otherCompetitions [], total = số trận', async ({ request }) => {
    const home = (await post(request, liveV1())).body;
    test.skip(home.code !== 1 || home.data.events.length === 0, 'Không có trận live');
    const cid = home.data.events[0].tournament.id;
    const { body } = await post(request, liveV1(), { competitionIds: [cid] });
    expect(body.data.events.every((e: any) => e.tournament.id === cid)).toBe(true);
    expect(body.data.otherCompetitions).toEqual([]);
    expect(body.data.pagination.total).toBe(body.data.events.length);
  });

  test('BUG #2 (đã báo fix): competitionId số ít trả cùng kết quả với competitionIds', async ({ request }) => {
    const home = (await post(request, liveV1())).body;
    test.skip(home.code !== 1 || home.data.events.length === 0, 'Không có trận live');
    const cid = home.data.events[0].tournament.id;
    const [many, one] = await Promise.all([
      post(request, liveV1(), { competitionIds: [cid] }),
      post(request, liveV1(), { competitionId: cid }),
    ]);
    expect(many.body.data.events.length).toBeGreaterThan(0);
    expect(one.body.data.events.length, 'competitionId vẫn bị giải mã 2 lần → rỗng').toBe(many.body.data.events.length);
  });
});

test.describe('live v1 · sortByMatchTime & validate', () => {
  test('sortByMatchTime: tăng dần theo giờ bắt đầu, không có key otherCompetitions', async ({ request }) => {
    const { body } = await post(request, liveV1(), { sortByMatchTime: true });
    test.skip(body.code !== 1, 'Không có trận live');
    expect(isSortedAsc(body.data.events.map((e: any) => e.startTimestamp))).toBe(true);
    expect(body.data).not.toHaveProperty('otherCompetitions');
  });

  test('competitionIds quá 100 phần tử → HTTP 422', async ({ request }) => {
    const { status } = await post(request, liveV1(), { competitionIds: Array(101).fill('x') });
    expect(status).toBe(422);
  });
});
