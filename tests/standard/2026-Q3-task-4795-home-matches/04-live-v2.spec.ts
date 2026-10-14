/**
 * US-4795 — live-v2 (doc 4/5 US-4640).
 * POST /events/live-v2/locale/{locale}
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/04-live-v2.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import {
  post, liveV1, liveV2, INPROGRESS_TYPE,
  firstSuggestionViolation, brokenGroups, duplicateIds, isSortedAsc,
} from './lib/home-client';

// Mở rộng từ 2 locale lên 10 locale đa châu lục — cùng lý do với live-v1.
for (const locale of ['VN', 'GB', 'US', 'JP', 'BR', 'TH', 'DE', 'KR', 'ID', 'AU']) {
  test.describe(`live-v2 · ${locale}`, () => {
    let body: any;

    test.beforeAll(async ({ request }) => {
      const res = await post(request, liveV2(locale));
      expect(res.status).toBe(200);
      body = res.body;
    });

    test('response: code 1 chỉ có events + pagination; code 2 thì data rỗng', () => {
      expect([1, 2]).toContain(body.code);
      if (body.code === 1) {
        expect(Object.keys(body.data).sort()).toEqual(['events', 'pagination']);
        expect(body.data.pagination.total).toBe(body.data.events.length);
      } else {
        expect(body.data.events).toEqual([]);
      }
    });

    test('mọi trận inprogress, không trùng, có aggHomeScore/aggAwayScore', () => {
      test.skip(body.code !== 1, 'Không có trận live');
      const evs = body.data.events;
      expect(duplicateIds(evs)).toEqual([]);
      expect(evs.filter((e: any) => e.status.type !== INPROGRESS_TYPE).map((e: any) => e.id)).toEqual([]);
      expect(evs.filter((e: any) => !('aggHomeScore' in e && 'aggAwayScore' in e)).map((e: any) => e.id)).toEqual([]);
    });

    test('khối gợi ý đứng đầu; trận cùng bảng liền nhau (suggestion|group_id)', () => {
      test.skip(body.code !== 1, 'Không có trận live');
      expect(firstSuggestionViolation(body.data.events)).toBe(-1);
      expect(brokenGroups(body.data.events)).toEqual([]);
    });
  });
}

test.describe('live-v2 · đối chiếu live v1 cùng thời điểm', () => {
  test('số trận v2 = events v1 + trận trong otherCompetitions v1; trận v1 đều có trong v2', async ({ request }) => {
    const [a, b] = await Promise.all([post(request, liveV1()), post(request, liveV2())]).then((r) => r.map((x) => x.body));
    test.skip(a.code !== 1 || b.code !== 1, 'Không có trận live');
    const sumOther = a.data.otherCompetitions.reduce((s: number, o: any) => s + o.match_count, 0);
    // 2 request có thể rơi vào 2 pod khác nhau → cho lệch tối đa 2 trận (trận vừa bắt đầu/kết thúc).
    expect(Math.abs(b.data.events.length - (a.data.events.length + sumOther))).toBeLessThanOrEqual(2);
    const ids2 = new Set(b.data.events.map((e: any) => e.id));
    expect(a.data.events.filter((e: any) => !ids2.has(e.id)).length).toBeLessThanOrEqual(2);
  });
});

test.describe('live-v2 · body', () => {
  test('competitionIds bị bỏ qua → vẫn trả danh sách đầy đủ', async ({ request }) => {
    const def = (await post(request, liveV2())).body;
    test.skip(def.code !== 1 || def.data.events.length < 2, 'Cần ít nhất 2 trận live');
    const { body } = await post(request, liveV2(), { competitionIds: [def.data.events[0].tournament.id] });
    expect(Math.abs(body.data.events.length - def.data.events.length)).toBeLessThanOrEqual(2);
  });

  test('sortByMatchTime: tăng dần theo giờ bắt đầu, chỉ có events + pagination, vẫn có aggHomeScore/aggAwayScore', async ({ request }) => {
    const { body } = await post(request, liveV2(), { sortByMatchTime: true });
    test.skip(body.code !== 1, 'Không có trận live');
    expect(isSortedAsc(body.data.events.map((e: any) => e.startTimestamp))).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(['events', 'pagination']);
    // Doc mục 08: sortByMatchTime bỏ otherCompetitions nhưng KHÔNG bỏ field
    // aggHomeScore/aggAwayScore của từng event — verify field vẫn có mặt
    // (không undefined) dù giá trị thường là -1 khi không phải trận lượt về.
    const missingAgg = body.data.events.filter((e: any) => typeof e.aggHomeScore !== 'number' || typeof e.aggAwayScore !== 'number');
    expect(missingAgg.map((e: any) => e.id)).toEqual([]);
  });

  // BUG #3 (pass World Cup gắn gợi ý cho bảng có ĐTQG locale, chạy khi
  // ENCODE_ID bật) — đã có test thật thay cho test.fixme cũ (vốn chết vĩnh
  // viễn, chỉ verify được thủ công khi ai đó nhớ ngày có World Cup), xem
  // 08-live-and-rare-cases.spec.ts › "case hiếm · World Cup / giải đấu quốc tế
  // lớn đang diễn ra" — tự dò qua tên giải chứa "World Cup" trong mọi lần
  // chạy daily, verify suggestion=1, không cần ai bật tay.
});
