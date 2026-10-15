/**
 * US-4795 — scheduled-v2 (doc 1/5 US-4640).
 * POST /scheduled-events-pagination-v2/{date}/locale/{locale}/type/{type}
 *
 * Chỉ assert các bất biến không phụ thuộc trận cụ thể trong ngày, để script
 * chạy được mỗi ngày trên data prod thật.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/01-scheduled-v2.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import {
  post, vnDate, scheduledV2, FINISHED_CODES,
  firstSuggestionViolation, brokenGroups, duplicateIds, isSortedAsc,
} from './lib/home-client';

const PAST = vnDate(-3);
const TODAY = vnDate(0);
const CATEGORY_ORDER = ['Quốc tế', 'Châu Âu', 'Châu Mỹ', 'Châu Á', 'Châu Phi', 'Châu Đại Dương'];
// Trạng thái "treo": chưa đá / pending / hoãn / gián đoạn / huỷ / bỏ dở / cut in half — mục 05 doc.
const STALE_CODES = [0, 1, 15, 60, 70, 80, 90];

// Độ phủ ngày: 3 ngày trước + hôm nay + 3 ngày tới (7 ngày liên tục) — tăng từ
// chỉ 2 mốc (PAST/TODAY) trước đây, để bắt được bug chỉ xảy ra ở 1 số ngày cụ
// thể (vd VT9 fallback phụ thuộc số giải đang thi đấu, biến động theo ngày).
const DATES_TO_CHECK = [vnDate(-3), vnDate(-2), vnDate(-1), TODAY, vnDate(1), vnDate(2), vnDate(3)];

// Độ phủ quốc gia: 14 locale trải khắp các châu lục (Á, Âu, Mỹ, Phi, Đại
// Dương) — tăng từ 7 locale trước đây, để bắt bug riêng theo locale (vd
// otherCompetitions ưu tiên sai giải, category order áp dụng nhầm ngôn ngữ,
// hoặc VT9 fallback chỉ lộ ra ở 1 số quốc gia có ít giải "nhà" hơn).
const LOCALES_TO_CHECK = ['VN', 'GB', 'US', 'JP', 'BR', 'TH', 'DE', 'KR', 'ID', 'MX', 'EG', 'AU', 'IN', 'AR'];

// Full matrix (7 ngày × 14 locale = 98 bộ dữ liệu) cho ngày TODAY và PAST với
// TẤT CẢ locale; các ngày còn lại chỉ test với VN để tránh nổ số lượng test
// case quá mức cần thiết (98 describe block × 6 test/block đã là ~600 case).
const CASES: Array<{ locale: string; date: string }> = [];
for (const locale of LOCALES_TO_CHECK) {
  for (const date of DATES_TO_CHECK) {
    // Full coverage ngày × locale chỉ cho 2 mốc quan trọng nhất (hôm qua gần
    // nhất đã có kết quả ổn định, hôm nay đang biến động) — các ngày khác chỉ
    // cần 1 locale đại diện (VN) để vẫn phủ được biến động theo ngày mà không
    // nhân nổ số lượng.
    if (date === PAST || date === TODAY || locale === 'VN') {
      CASES.push({ locale, date });
    }
  }
}

for (const { locale, date } of CASES) {
  test.describe(`scheduled-v2 · ${locale} · ${date} · all`, () => {
    let body: any;

    
    test.beforeAll(async ({ request }) => {
      const res = await post(request, scheduledV2(date, locale));
      expect(res.status).toBe(200);
      body = res.body;
    });

    test('response hợp lệ: code 1, trang 1, size 5000, không trùng trận', () => {
      expect(body.code).toBe(1);
      expect(body.data.pagination).toMatchObject({ page: 1, size: 5000 });
      expect(Array.isArray(body.data.events)).toBe(true);
      expect(Array.isArray(body.data.otherCompetitions)).toBe(true);
      expect(duplicateIds(body.data.events)).toEqual([]);
    });

    test('khối gợi ý (suggestion=1) nằm liền nhau ở đầu danh sách', () => {
      expect(firstSuggestionViolation(body.data.events)).toBe(-1);
    });

    test('bù đủ 10 giải khi còn giải khác (VT 9 fallback)', () => {
      // SỬA QUAN TRỌNG: đếm theo tournament.id là SAI — đã xác nhận qua ảnh UI
      // thật (user chỉ ra) rằng 1 giải có nhiều bảng đấu (vd "AFC Champions
      // League 2" chia Group C/F/G/H...) hiển thị trên UI như NHIỀU KHỐI RIÊNG
      // BIỆT, mỗi group tính là 1 "giải" khi đếm đủ 10, dù chung tournament.id.
      // Đếm theo tournament.id gộp nhầm các group này lại thành 1, làm số đếm
      // thấp hơn thực tế UI hiển thị → gây fail giả hàng loạt trước đây.
      // Đếm đúng phải theo tổ hợp (tournament.id, group_id) — trận không có
      // group_id (giải không chia bảng) vẫn đếm theo tournament.id như cũ.
      const comps = new Set(body.data.events.map((e: any) => `${e.tournament.id}|${e.tournament.group_id ?? ''}`));
      if (body.data.otherCompetitions.length > 0) expect(comps.size).toBeGreaterThanOrEqual(10);
    });

    test('trận cùng bảng được gom liền nhau (group_id, UOB-613)', () => {
      expect(brokenGroups(body.data.events)).toEqual([]);
    });

    test('otherCompetitions: quốc gia người dùng → châu lục theo thứ tự cố định → các quốc gia', () => {
      const groups = body.data.otherCompetitions;
      const cats = groups.filter((g: any) => g.groupType === 'category').map((g: any) => g.name);
      const expectedCats = CATEGORY_ORDER.filter((c) => cats.includes(c));
      if (locale === 'VN') expect(cats).toEqual(expectedCats); // tên châu lục tiếng Việt
      const firstCat = groups.findIndex((g: any) => g.groupType === 'category');
      const lastCat = groups.map((g: any) => g.groupType).lastIndexOf('category');
      if (firstCat >= 0) {
        // trước khối châu lục chỉ được phép có tối đa 1 nhóm: quốc gia của người dùng
        expect(firstCat).toBeLessThanOrEqual(1);
        const countriesAfter = groups.slice(lastCat + 1);
        expect(countriesAfter.every((g: any) => g.groupType === 'country')).toBe(true);
      }
      for (const g of groups) {
        expect(g.match_count).toBeGreaterThan(0);
        expect(g.competition_ids.length).toBeGreaterThan(0);
      }
    });

    test('pagination.total ≥ events + tổng match_count otherCompetitions, lệch ≤ 5%', () => {
      // doc: total là tổng trận cả ngày, "có thể lệch vài trận". Prod 28/09: luôn dư 0–15 trận (≤ ~3%).
      const sum = body.data.otherCompetitions.reduce((s: number, g: any) => s + g.match_count, 0);
      const total = body.data.pagination.total;
      const diff = total - (body.data.events.length + sum);
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThanOrEqual(Math.max(5, Math.ceil(total * 0.05)));
    });

    if (date === PAST) {
      test('ngày đã qua: match_live_count của mọi nhóm = 0', () => {
        const live = body.data.otherCompetitions.filter((g: any) => (g.match_live_count ?? 0) > 0);
        expect(live.map((g: any) => `${g.name}:${g.match_live_count}`)).toEqual([]);
      });

      test('ngày đã qua: không còn trận treo (chưa đá/hoãn/huỷ quá 2 giờ)', () => {
        const stale = body.data.events.filter((e: any) => STALE_CODES.includes(e.status.code));
        expect(stale.map((e: any) => `${e.id}:${e.status.code}`)).toEqual([]);
      });
    }
  });
}

test.describe('scheduled-v2 · lọc theo type', () => {
  test('type=finish chỉ có trận kết thúc (100/110/120)', async ({ request }) => {
    const { body } = await post(request, scheduledV2(PAST, 'VN', 'finish'));
    expect(body.code).toBe(1);
    const bad = body.data.events.filter((e: any) => !FINISHED_CODES.includes(e.status.code));
    expect(bad.map((e: any) => e.status.code)).toEqual([]);
  });

  test('type=upcoming chỉ có trận chưa đá (0)', async ({ request }) => {
    const { body } = await post(request, scheduledV2(vnDate(2), 'VN', 'upcoming'));
    expect(body.code).toBe(1);
    const bad = body.data.events.filter((e: any) => e.status.code !== 0);
    expect(bad.map((e: any) => e.status.code)).toEqual([]);
  });
});

test.describe('scheduled-v2 · luồng phụ', () => {
  test('competitionIds (mở 1 nhóm "Giải đấu khác"): chỉ trận của nhóm, không gợi ý, otherCompetitions rỗng', async ({ request }) => {
    const home = (await post(request, scheduledV2(PAST))).body;
    const group = home.data.otherCompetitions.find((g: any) => g.groupType === 'country');
    test.skip(!group, 'Không có nhóm quốc gia nào trong ngày');
    const { body } = await post(request, scheduledV2(PAST), { competitionIds: group.competition_ids });
    expect(body.code).toBe(1);
    expect(body.data.events.length).toBeGreaterThan(0);
    expect(body.data.events.every((e: any) => group.competition_ids.includes(e.tournament.id))).toBe(true);
    expect(body.data.events.some((e: any) => e.tournament.suggestion === 1)).toBe(false);
    expect(body.data.otherCompetitions).toEqual([]);
    const homeIds = new Set(home.data.events.map((e: any) => e.id));
    expect(body.data.events.filter((e: any) => homeIds.has(e.id))).toEqual([]);
  });

  // Quan sát prod 28/09: ngày đã qua sắp giảm dần, hôm nay/tương lai tăng dần.
  // Doc không ghi chiều sắp → chỉ khẳng định thứ tự đơn điệu, chiều cụ thể là câu hỏi mở cho dev.
  for (const date of [PAST, TODAY]) {
    test(`sortByMatchTime ${date}: 100 trận/trang, sắp đơn điệu theo giờ, otherCompetitions rỗng`, async ({ request }) => {
      const { body } = await post(request, scheduledV2(date), { sortByMatchTime: true });
      expect(body.code).toBe(1);
      expect(body.data.pagination.size).toBe(100);
      expect(body.data.events.length).toBeLessThanOrEqual(100);
      const ts = body.data.events.map((e: any) => e.startTimestamp);
      const asc = isSortedAsc(ts);
      const desc = isSortedAsc([...ts].reverse());
      test.info().annotations.push({ type: 'sort-direction', description: asc ? 'asc' : desc ? 'desc' : 'none' });
      expect(asc || desc).toBe(true);
      expect(body.data.otherCompetitions ?? []).toEqual([]);
    });
  }
});

test.describe('scheduled-v2 · validate', () => {
  test('ngày sai định dạng → code -1 "Invalid date format"', async ({ request }) => {
    const { status, body } = await post(request, scheduledV2('2026-13-45'));
    expect(status).toBe(200);
    expect(body).toMatchObject({ code: -1, message: 'Invalid date format' });
  });

  test('competitionIds quá 100 phần tử → HTTP 422', async ({ request }) => {
    const { status, body } = await post(request, scheduledV2(PAST), { competitionIds: Array(101).fill('x') });
    expect(status).toBe(422);
    expect(body.errors).toHaveProperty('competitionIds');
  });
});
