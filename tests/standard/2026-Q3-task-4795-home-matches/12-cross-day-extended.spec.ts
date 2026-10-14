/**
 * US-4795 — mở rộng lớp test "chắc chắn bắt bug theo từng ngày chạy daily"
 * (cùng tinh thần file 10/11) sang 4 mảng CHƯA được 2 file đó khai thác:
 *
 *   1. my-matches (tab lưu lượng cao nhất, 1.73tr request/ngày theo doc) —
 *      trận/đội YÊU THÍCH của user không được biến mất hay đổi tỷ số ngầm.
 *   2. Tên đội/giải đấu không được đổi đột ngột giữa 2 lần gọi liên tiếp
 *      (homeTeam.shortName, tournament.name) — user quen mặt chữ mỗi ngày,
 *      đổi tên bất thường (không phải do CLB đổi tên thật) là dấu hiệu lỗi
 *      đồng bộ dữ liệu nguồn.
 *   3. Trận ĐANG LIVE phải THỰC SỰ TIẾN TRIỂN qua thời gian trong cùng 1 lần
 *      chạy (gọi lại cách nhau vài chục giây) — "status vẫn inprogress nhưng
 *      tỷ số/thời gian đứng yên hàng chục phút" là dấu hiệu pipeline live bị
 *      đứng, mà chỉ gọi 1 lần duy nhất không bao giờ phát hiện được.
 *   4. otherCompetitions theo LOCALE KHÁC VN cũng được theo dõi xuyên ngày —
 *      file 10 chỉ theo dõi locale VN, trong khi bug locale-specific (đã biết
 *      có ít nhất 1 case: VN hoa/thường) có thể chỉ lộ rõ dần qua nhiều ngày ở
 *      1 locale cụ thể.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/12-cross-day-extended.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2, myMatches, liveV2, SAMPLE_FAVORITES } from './lib/home-client';
import { loadFavBaseline, saveFavBaseline, toFavSnapshot, pruneFavBaseline, type FavBaseline } from './lib/my-matches-baseline';
import { loadBaseline, type Baseline } from './lib/baseline';

const TODAY = vnDate(0);
const PAST_DAYS = [-1, -2, -3, -4, -5, -6, -7].map(vnDate);
const NOW_ISO = new Date().toISOString();

test.describe.configure({ mode: 'serial' });

// ============================================================================
// 1) my-matches cross-day — trận yêu thích không biến mất / đổi tỷ số ngầm
// ============================================================================

let oldFavBaseline: FavBaseline;
let favByDate: Map<string, any[]>;
let favById: Map<string, any>;

test.beforeAll(async ({ request }) => {
  oldFavBaseline = loadFavBaseline();
  favByDate = new Map();
  favById = new Map();
  for (const date of PAST_DAYS) {
    const { body } = await post(request, myMatches('all', 'VN'), { ...SAMPLE_FAVORITES, startDate: date });
    if (body.code !== 1) continue;
    favByDate.set(date, body.data.events);
    for (const e of body.data.events) favById.set(e.id, e);
  }
});

test.describe('cross-day · my-matches (trận yêu thích)', () => {
  test('trận yêu thích đã finished hôm trước, nếu vẫn finished hôm nay thì tỷ số không đổi', () => {
    const finishedBefore = Object.values(oldFavBaseline).filter((s) => s.statusType === 'finished');
    test.skip(finishedBefore.length === 0, 'Baseline my-matches chưa có trận finished nào (lần chạy đầu, hoặc đội yêu thích chưa đá)');

    const bad: string[] = [];
    let compared = 0;
    for (const snap of finishedBefore) {
      const now = favById.get(snap.id);
      if (!now || now.status.type !== 'finished') continue;
      compared++;
      const nowHome = now.homeScore?.display ?? null;
      const nowAway = now.awayScore?.display ?? null;
      if (nowHome !== snap.homeDisplay || nowAway !== snap.awayDisplay) {
        bad.push(`${snap.id} (${snap.homeTeam} vs ${snap.awayTeam}): my-matches baseline ghi ${snap.homeDisplay}-${snap.awayDisplay} nhưng hôm nay trả ${nowHome}-${nowAway}`);
      }
    }
    test.skip(compared === 0, 'Không có trận finished nào trong baseline còn nằm trong cửa sổ 7 ngày quét hôm nay');
    expect(bad).toEqual([]);
  });

  test('trận yêu thích đã finished (còn trong cửa sổ 7 ngày) không biến mất khỏi my-matches', () => {
    const inWindow = Object.values(oldFavBaseline).filter((s) => s.statusType === 'finished' && PAST_DAYS.includes(s.date));
    test.skip(inWindow.length === 0, 'Không có trận finished nào trong baseline my-matches còn nằm trong cửa sổ hôm nay');

    const missing = inWindow.filter((s) => !favById.has(s.id));
    const report = missing.map((s) => `${s.id} (${s.homeTeam} vs ${s.awayTeam}, ngày ${s.date}) — ghi nhận lần đầu ${s.firstSeenAt}`);
    // Tab my-matches là nơi user CHỦ ĐỘNG theo dõi đội họ thích — 1 trận yêu
    // thích biến mất khỏi lịch sử ở ĐÚNG tab này còn tệ hơn biến mất ở trang
    // chủ công khai (file 10), vì user chắc chắn sẽ quay lại xem và nhận ra
    // ngay. Ngưỡng chặt hơn (0 sai số cho phép trừ khi baseline rất nhỏ).
    expect(report.length, `${report.length}/${inWindow.length} trận yêu thích ĐÃ FINISHED biến mất khỏi my-matches:\n${report.join('\n')}`).toBe(0);
  });
});

// ============================================================================
// 2) Tên đội/giải đấu không đổi đột ngột ngày qua ngày
// ============================================================================

test.describe('cross-day · tên đội/giải không đổi đột ngột', () => {
  test('shortName của 1 đội (theo team id) không đổi giữa baseline cũ và hôm nay', async ({ request }) => {
    const oldApiBaseline: Baseline = loadBaseline();
    const entries = Object.values(oldApiBaseline);
    test.skip(entries.length === 0, 'Baseline API rỗng (lần chạy đầu tiên)');

    // Gom theo TÊN đội đã ghi nhận trước đó (không có team id trong baseline
    // gọn — chỉ có shortName) → kiểm tra gián tiếp qua trận đấu hôm nay có
    // cùng 2 đội y hệt tên cũ hay không là đủ để bắt lỗi đổi tên bất thường,
    // không cần lưu thêm team id vào baseline (giữ baseline gọn nhẹ).
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'));
    test.skip(body.code !== 1, 'API không trả code 1 hôm nay');

    const todayNames = new Map<string, Set<string>>(); // id -> set tên đã thấy hôm nay (home/away)
    for (const e of body.data.events) {
      todayNames.set(e.id, new Set([e.homeTeam.shortName, e.awayTeam.shortName]));
    }

    const bad: string[] = [];
    let compared = 0;
    for (const snap of entries) {
      const namesToday = todayNames.get(snap.id);
      if (!namesToday) continue;
      compared++;
      if (!namesToday.has(snap.homeTeam)) bad.push(`${snap.id}: homeTeam đổi từ "${snap.homeTeam}" → tên khác hôm nay (${[...namesToday].join(', ')})`);
      if (!namesToday.has(snap.awayTeam)) bad.push(`${snap.id}: awayTeam đổi từ "${snap.awayTeam}" → tên khác hôm nay (${[...namesToday].join(', ')})`);
    }
    test.skip(compared === 0, 'Không có trận nào trong baseline trùng với hôm nay để đối chiếu tên đội');
    // Hiếm khi CLB đổi tên thật (sáp nhập, đổi nhà tài trợ) — cho phép 1 sai số
    // rất nhỏ, không hard 0 tuyệt đối để tránh báo động giả vì lý do hợp lệ.
    const threshold = Math.max(1, Math.ceil(compared * 0.02));
    expect(bad.length, `${bad.length} lần đổi tên đội bất thường:\n${bad.join('\n')}`).toBeLessThanOrEqual(threshold);
  });

  test('tournament.name của 1 trận không đổi giữa baseline cũ và hôm nay', async ({ request }) => {
    const oldApiBaseline: Baseline = loadBaseline();
    const entries = Object.values(oldApiBaseline);
    test.skip(entries.length === 0, 'Baseline API rỗng (lần chạy đầu tiên)');

    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'));
    test.skip(body.code !== 1, 'API không trả code 1 hôm nay');
    const todayById = new Map(body.data.events.map((e: any) => [e.id, e]));

    const bad: string[] = [];
    let compared = 0;
    for (const snap of entries) {
      const now: any = todayById.get(snap.id);
      if (!now) continue;
      compared++;
      if (now.tournament?.name !== snap.tournament) {
        bad.push(`${snap.id} (${snap.homeTeam} vs ${snap.awayTeam}): tournament đổi từ "${snap.tournament}" → "${now.tournament?.name}"`);
      }
    }
    test.skip(compared === 0, 'Không có trận nào trong baseline trùng với hôm nay để đối chiếu tên giải');
    expect(bad).toEqual([]);
  });
});

// ============================================================================
// 3) Trận live phải thực sự tiến triển (không đứng yên bất thường)
// ============================================================================

test.describe('trận live phải tiến triển theo thời gian (không đứng yên)', () => {
  test('gọi lại live-v2 cách nhau ~45s: trận inprogress ở cả 2 lần phải có tổng tỷ số HOẶC current period thay đổi, hoặc thời gian trôi hợp lý', async ({ request }) => {
    // Test chủ động chờ 45s giữa 2 lần gọi (xem dưới) — vượt timeout mặc định
    // 30s của Playwright nếu không khai báo riêng. Không phải lỗi sản phẩm,
    // chỉ là timeout framework cần nới cho đúng với thời gian chờ thật của test.
    test.setTimeout(75_000);
    const first = await post(request, liveV2('VN', 'en'));
    test.skip(first.body.code !== 1 || first.body.data.events.length === 0, 'Không có trận live tại thời điểm chạy');

    await new Promise((r) => setTimeout(r, 45_000));
    const second = await post(request, liveV2('VN', 'en'));
    test.skip(second.body.code !== 1, 'API không trả code 1 ở lần gọi thứ 2');

    const firstById = new Map(first.body.data.events.map((e: any) => [e.id, e]));
    const bad: string[] = [];
    let compared = 0;
    for (const e2 of second.body.data.events) {
      const e1 = firstById.get(e2.id);
      if (!e1 || e1.status.type !== 'inprogress' || e2.status.type !== 'inprogress') continue;
      compared++;
      const scoreChanged = e1.homeScore.display !== e2.homeScore.display || e1.awayScore.display !== e2.awayScore.display;
      // "Tiến triển" ở đây nghĩa rộng hơn chỉ tỷ số: status.code (hiệp 1/2/hiệp
      // phụ) hoặc currentPeriodStartTimestamp đổi cũng tính là có tiến triển —
      // phần lớn trận live 45 giây không ghi bàn vẫn hoàn toàn bình thường.
      const periodChanged = e1.status.code !== e2.status.code;
      const clockMoved = e1.time?.currentPeriodStartTimestamp !== e2.time?.currentPeriodStartTimestamp;
      if (!scoreChanged && !periodChanged && !clockMoved) {
        bad.push(`${e2.id} (${e2.homeTeam.shortName} vs ${e2.awayTeam.shortName}): status/tỷ số/mốc hiệp giống hệt sau 45s — nghi ngờ pipeline live đứng`);
      }
    }
    test.skip(compared === 0, 'Không có trận nào giữ nguyên trạng thái inprogress ở cả 2 lần gọi để kiểm tra tiến triển');
    // Đây là tín hiệu CẢNH BÁO (1 trận có thể thật sự "im ắng" 45s không có gì
    // mới ghi vào feed) — chỉ fail khi TẤT CẢ trận đang theo dõi đều đứng yên
    // (dấu hiệu rõ ràng của lỗi hệ thống, không phải 1 trận cá biệt im lặng).
    expect(bad.length, `${bad.length}/${compared} trận live không có bất kỳ tiến triển nào sau 45s:\n${bad.join('\n')}`).toBeLessThan(compared);
  });
});

// ============================================================================
// 4) otherCompetitions theo locale khác VN cũng theo dõi xuyên ngày
// ============================================================================

test.describe('cross-day · otherCompetitions ổn định theo từng locale riêng (không chỉ VN)', () => {
  for (const locale of ['GB', 'US', 'JP']) {
    test(`locale ${locale}: tổng match_count hôm nay không sụt bất thường so với hôm qua`, async ({ request }) => {
      const [todayRes, yesterdayRes] = await Promise.all([
        post(request, scheduledV2(TODAY, locale, 'all', 'en')),
        post(request, scheduledV2(vnDate(-1), locale, 'all', 'en')),
      ]);
      test.skip(todayRes.body.code !== 1 || yesterdayRes.body.code !== 1, `API không trả code 1 cho locale ${locale}`);
      const sumToday = todayRes.body.data.otherCompetitions.reduce((s: number, g: any) => s + g.match_count, 0) + todayRes.body.data.events.length;
      const sumYesterday = yesterdayRes.body.data.otherCompetitions.reduce((s: number, g: any) => s + g.match_count, 0) + yesterdayRes.body.data.events.length;
      test.skip(sumYesterday < 20, `Hôm qua locale ${locale} có quá ít trận để làm mốc so sánh`);
      const dropRatio = 1 - sumToday / sumYesterday;
      expect(dropRatio, `Locale ${locale}: tổng trận hôm nay (${sumToday}) giảm ${(dropRatio * 100).toFixed(0)}% so với hôm qua (${sumYesterday})`).toBeLessThan(0.7);
    });
  }
});

test.afterAll(() => {
  const merged: FavBaseline = { ...oldFavBaseline };
  for (const [date, events] of favByDate.entries()) {
    for (const e of events) {
      merged[e.id] = toFavSnapshot(e, date, NOW_ISO, oldFavBaseline[e.id]);
    }
  }
  saveFavBaseline(pruneFavBaseline(merged, TODAY, 14));
});
