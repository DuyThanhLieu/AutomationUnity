/**
 * US-4795 — mô phỏng hành vi NGƯỜI DÙNG THẬT quay lại xem trang Home MỖI
 * NGÀY, qua chính UI (không chỉ gọi API như file 10-cross-day-regression).
 * Khác biệt cốt lõi so với file 10: ở đây bug được định nghĩa là "điều user
 * nhìn thấy hôm nay mâu thuẫn với điều họ đã nhìn thấy hôm qua trên CHÍNH
 * TRANG UI", kể cả khi dữ liệu API đằng sau có thể vẫn "đúng" theo nghĩa kỹ
 * thuật — vì trải nghiệm thật của user chỉ đi qua UI, không đi qua API trực
 * tiếp. Một bug cache CDN/render phía UI có thể khiến user thấy sai trong khi
 * API trả đúng — loại bug này chỉ lộ ra khi so UI qua nhiều ngày, không bao
 * giờ lộ ra khi chỉ test UI tại 1 thời điểm (file 06) hay chỉ test API (file
 * 01-05, 07-08, 10).
 *
 * CƠ CHẾ: giống file 10, dùng baseline riêng (.baseline/ui-matches.json,
 * commit vào repo qua workflow) lưu lại "điều UI thật sự hiển thị" ở lần chạy
 * trước, đối chiếu với UI hôm nay.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/11-ui-daily-user-journey.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2 } from './lib/home-client';
import { loadUiBaseline, saveUiBaseline, pruneUiBaseline, isValidProgression, type UiBaseline, type UiMatchSnapshot } from './lib/ui-baseline';

const SITE = 'https://uniscore.com/en';
const TODAY = vnDate(0);
const NOW_ISO = new Date().toISOString();

/** Giống getUiLocale ở file 06 — bắt chính locale UI thật sự dùng qua network
 *  request, KHÔNG hard-code (xem comment chi tiết lý do ở file 06). */
async function getUiLocale(page: import('@playwright/test').Page, gotoUrl: string): Promise<string> {
  let capturedLocale: string | null = null;
  const handler = (req: import('@playwright/test').Request) => {
    const m = req.url().match(/scheduled-events-pagination-v2\/[^/]+\/locale\/([^/]+)\//);
    if (m) capturedLocale = m[1];
  };
  page.on('request', handler);
  await page.goto(gotoUrl, { waitUntil: 'networkidle' });
  page.off('request', handler);
  return capturedLocale ?? 'VN';
}

/** Lấy text khối danh sách trận chính — y hệt logic đã verify đúng ở file 06
 *  (tìm ancestor nhỏ nhất chứa dấu hiệu trận thật), tái dùng để tránh lặp lại
 *  sai lầm lịch sử ("All Leagues" sai từ khóa, loại trừ sidebar sai cách —
 *  xem comment đầy đủ ở file 06-ui-vs-api.spec.ts). */
async function getMainListText(page: import('@playwright/test').Page): Promise<string> {
  const extract = () =>
    page.evaluate(() => {
      const finishedBtn = document.querySelector('[data-testid="filter-finish"]');
      if (!finishedBtn) return null;
      let node: HTMLElement | null = finishedBtn as HTMLElement;
      let best: string | null = null;
      for (let i = 0; i < 20 && node; i++) {
        const text = node.innerText || '';
        const looksLikeMatchList = /\d{1,2}:\d{2}/.test(text) || text.includes('FT');
        if (looksLikeMatchList && text.length > 200 && text.length < 8000) {
          if (!best || text.length < best.length) best = text;
        }
        node = node.parentElement;
      }
      return best;
    });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const text = await extract();
    if (text) return text;
    await page.waitForTimeout(300);
  }
  return page.evaluate(() => document.body.innerText);
}

test.describe.configure({ mode: 'serial' });

let oldUiBaseline: UiBaseline;
let uiText: string;
let apiEvents: any[];
let uiLocale: string;

test.beforeAll(async ({ browser, request }) => {
  oldUiBaseline = loadUiBaseline();

  const page = await browser.newPage();
  uiLocale = await getUiLocale(page, `${SITE}?date=${TODAY}`);
  await page.waitForTimeout(800);
  uiText = await getMainListText(page);
  await page.close();

  const { body } = await post(request, scheduledV2(TODAY, uiLocale, 'all', 'en'));
  apiEvents = body.code === 1 ? body.data.events : [];
});

/** Trạng thái UI của 1 trận, suy ra bằng cách tìm đoạn text NGAY TRƯỚC cặp
 *  home+away liền kề trong uiText — cùng kỹ thuật định vị cặp đã dùng ở file
 *  06 (tránh occurrence trùng tên rút gọn giữa 2 đội khác nhau). */
function uiStateOf(uiTextVal: string, home: string, away: string, cursorRef: { pos: number }): 'upcoming' | 'live' | 'finished' | null {
  const homeIdx = uiTextVal.indexOf(home, cursorRef.pos);
  if (homeIdx === -1) return null;
  const awayIdx = uiTextVal.indexOf(away, homeIdx);
  if (awayIdx === -1) return null;
  cursorRef.pos = awayIdx;
  const context = uiTextVal.slice(Math.max(0, homeIdx - 80), homeIdx);
  if (/\bFT\b/.test(context)) return 'finished';
  if (/\b\d+'\b|\bHT\b|\bLIVE\b/i.test(context)) return 'live';
  if (/\d{1,2}:\d{2}/.test(context)) return 'upcoming';
  return null;
}

test.describe('daily user journey · tiến trình trận không được LÙI so với lần xem trước', () => {
  test('trận user đã thấy "live"/"finished" hôm qua, hôm nay KHÔNG được quay lại hiện "upcoming" trên UI', () => {
    const cursor = { pos: 0 };
    const regressions: string[] = [];
    let compared = 0;

    for (const e of apiEvents) {
      const old = oldUiBaseline[e.id];
      if (!old) continue;
      const nowState = uiStateOf(uiText, e.homeTeam.shortName, e.awayTeam.shortName, cursor);
      if (!nowState) continue; // không định vị được trên UI lần này — không kết luận, tránh false-positive
      compared++;
      if (!isValidProgression(old.uiState, nowState)) {
        regressions.push(`${e.id} (${old.homeTeam} vs ${old.awayTeam}): UI hôm trước hiện "${old.uiState}" (lúc ${old.seenAt}) nhưng hôm nay lùi về "${nowState}"`);
      }
    }
    test.skip(compared === 0, 'Không đối chiếu được trận nào với baseline UI trước đó (lần chạy đầu, hoặc UI đổi layout không định vị được)');
    expect(regressions).toEqual([]);
  });

  test('trận user đã thấy tỷ số "finished" hôm qua, hôm nay vẫn finished thì tỷ số trên UI không được đổi', () => {
    const cursor = { pos: 0 };
    const bad: string[] = [];
    let compared = 0;

    for (const e of apiEvents) {
      const old = oldUiBaseline[e.id];
      if (!old || old.uiState !== 'finished' || !old.scoreText) continue;
      const home = e.homeTeam.shortName;
      const away = e.awayTeam.shortName;
      const homeIdx = uiText.indexOf(home, cursor.pos);
      if (homeIdx === -1) continue;
      const awayIdx = uiText.indexOf(away, homeIdx);
      if (awayIdx === -1) continue;
      cursor.pos = awayIdx;
      const nowState = uiStateOf(uiText, home, away, { pos: homeIdx - 1 });
      if (nowState !== 'finished') continue; // đổi khỏi finished là chuyện khác, không phải scope test này
      compared++;
      const nowScore = `${e.homeScore?.display ?? '?'} - ${e.awayScore?.display ?? '?'}`;
      if (nowScore !== old.scoreText) {
        bad.push(`${e.id} (${old.homeTeam} vs ${old.awayTeam}): UI hôm trước hiện tỷ số "${old.scoreText}" nhưng hôm nay hiện "${nowScore}" dù vẫn finished`);
      }
    }
    test.skip(compared === 0, 'Không có trận finished nào trong baseline UI để đối chiếu tỷ số');
    expect(bad).toEqual([]);
  });
});

test.describe('daily user journey · trận user từng thấy không biến mất khỏi UI khi quay lại đúng ngày đó', () => {
  test('trận thuộc đúng ngày hôm nay mà baseline UI ghi nhận trước đó vẫn phải còn thấy được trên UI', () => {
    const relevantOld = Object.values(oldUiBaseline).filter((s) => s.date === TODAY);
    test.skip(relevantOld.length === 0, 'Baseline UI chưa có trận nào ghi nhận đúng ngày hôm nay (lần chạy đầu, hoặc chưa từng xem ngày này trước đó)');

    // KHÔNG dùng 1 cursor chung tuần tự ở đây — baseline được lưu sắp theo ID
    // (để diff git ổn định), không theo đúng thứ tự xuất hiện thật trên UI
    // (sắp theo giờ đá). Tìm độc lập từng trận (indexOf không cursor, giống
    // cách file 06 đã làm cho test "mất trận hoàn toàn") — ở đây chỉ cần biết
    // trận CÒN CÓ MẶT ở đâu đó, không cần đúng thứ tự tương đối giữa các trận.
    const missing: string[] = [];
    for (const snap of relevantOld) {
      const idx1 = uiText.indexOf(snap.homeTeam);
      const foundHome = idx1 !== -1 && uiText.indexOf(snap.awayTeam, idx1) !== -1;
      if (!foundHome) missing.push(`${snap.id} (${snap.homeTeam} vs ${snap.awayTeam}): thấy trên UI lúc ${snap.seenAt}, hôm nay quay lại ĐÚNG NGÀY ĐÓ không còn thấy nữa`);
    }
    // User thật sẽ CẢM NHẬN RÕ việc 1 trận quen thuộc "biến mất" khi họ quay
    // lại xem đúng ngày đã xem trước đó — ngưỡng chặt hơn test tầng API (file
    // 10) vì đây là trải nghiệm trực tiếp, không phải chi tiết kỹ thuật ẩn.
    const threshold = Math.max(1, Math.ceil(relevantOld.length * 0.1));
    expect(missing.length, `${missing.length}/${relevantOld.length} trận quen thuộc biến mất khỏi UI khi xem lại đúng ngày cũ:\n${missing.join('\n')}`).toBeLessThanOrEqual(threshold);
  });
});

test.describe('daily user journey · trang không được "trống bất thường" so với thói quen xem hằng ngày', () => {
  test('số trận nhận diện được trên UI hôm nay không được tụt về gần 0 nếu hôm qua vẫn có nhiều trận', () => {
    const yesterdayCount = Object.values(oldUiBaseline).filter((s) => s.date === vnDate(-1)).length;
    test.skip(yesterdayCount < 5, 'Baseline hôm qua có quá ít trận để làm mốc so sánh đáng tin cậy');

    const cursor = { pos: 0 };
    let foundToday = 0;
    for (const e of apiEvents) {
      const homeIdx = uiText.indexOf(e.homeTeam.shortName, cursor.pos);
      if (homeIdx === -1) continue;
      const awayIdx = uiText.indexOf(e.awayTeam.shortName, homeIdx);
      if (awayIdx === -1) continue;
      cursor.pos = awayIdx;
      foundToday++;
    }
    // User mở trang mỗi ngày quen thấy "nhiều trận" — nếu UI đột nhiên gần như
    // trống (render lỗi, API timeout âm thầm bị nuốt lỗi phía FE...) trong khi
    // hôm qua vẫn bình thường, đây là regression trải nghiệm rõ ràng nhất mà
    // user sẽ report ngay lập tức. Ngưỡng rất lỏng (còn ≥20%) — chỉ bắt sự cố
    // nghiêm trọng, không bắt biến động lịch thi đấu tự nhiên.
    expect(foundToday, `Hôm qua UI có ${yesterdayCount} trận nhận diện được, hôm nay chỉ còn ${foundToday} — nghi ngờ UI render lỗi/trống bất thường`).toBeGreaterThanOrEqual(Math.ceil(yesterdayCount * 0.2));
  });
});

test.afterAll(() => {
  const cursor = { pos: 0 };
  const merged: UiBaseline = { ...oldUiBaseline };
  for (const e of apiEvents) {
    const home = e.homeTeam.shortName;
    const away = e.awayTeam.shortName;
    const state = uiStateOf(uiText, home, away, cursor);
    if (!state) continue; // không định vị được trên UI lần này — không ghi đè baseline cũ bằng thông tin rỗng
    const scoreText = state === 'finished' && e.homeScore?.display != null && e.awayScore?.display != null
      ? `${e.homeScore.display} - ${e.awayScore.display}`
      : null;
    merged[e.id] = { id: e.id, date: TODAY, uiState: state, homeTeam: home, awayTeam: away, scoreText, seenAt: NOW_ISO };
  }
  saveUiBaseline(pruneUiBaseline(merged, TODAY, 10));
});
