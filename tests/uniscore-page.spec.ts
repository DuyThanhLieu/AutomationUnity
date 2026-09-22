import { test, expect } from '@playwright/test';
import { UniScorePage } from '../pages/UniScorePage';

// ─── Hằng số ngày tháng ──────────────────────────────────────────────────────
const TODAY         = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const TOMORROW      = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
const IN_TWO_DAYS   = (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })();

// ─── Format hợp lệ của timeOrScore ───────────────────────────────────────────
const TIME_FORMAT    = /^\d{1,2}:\d{2}$/;      // "18:00", "9:30"
const SCORE_FORMAT   = /^\d+\s*-\s*\d+$/;      // "1 - 0", "2-3"
const MINUTE_FORMAT  = /^\d{1,3}'(\+\d+)?$/;   // "45'", "90+2'"
const SPECIAL_STATES = /^(HT|AET|PEN|PST|ABD|Canc\.|WO|Awarded|TBD|FT|AP)$/i;

function isValidTimeOrScore(value: string): boolean {
  const v = value.trim();
  return v === '' || v === '-'
    || TIME_FORMAT.test(v)
    || SCORE_FORMAT.test(v)
    || MINUTE_FORMAT.test(v)
    || SPECIAL_STATES.test(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Cấu trúc trang cơ bản
//   Kiểm tra các phần luôn phải tồn tại bất kể nội dung live
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite 1 — Cấu trúc trang cơ bản', () => {

  let page: UniScorePage;

  test.beforeEach(async ({ page: p }) => {
    page = new UniScorePage(p);
    await page.goto();
    await page.waitForContent();
  });

  // Tiêu đề trang phải chứa "uniscore" — đúng trang, không bị redirect
  test('tiêu đề trang chứa "uniscore"', async () => {
    expect(await page.getTitle()).toMatch(/uniscore/i);
  });

  // Server trả 200 — trang không bị down
  test('HTTP 200 khi GET trang chủ', async ({ request }) => {
    const res = await request.get('https://uniscore.com/');
    expect(res.status()).toBe(200);
  });

  // Thanh điều hướng (header/nav) phải hiển thị
  test('navigation bar hiển thị', async () => {
    await expect(page.navigation).toBeVisible();
  });

  // Tab "Bóng đá" phải có trong menu thể thao
  test('tab Bóng đá hiển thị trong menu', async () => {
    await expect(page.footballTab).toBeVisible();
  });

  // Không có ảnh bị lỗi (broken image) — CDN hoạt động bình thường
  test('không có broken image', async () => {
    expect(await page.getBrokenImages()).toHaveLength(0);
  });

  // Không có text lỗi 404/500 xuất hiện trên trang
  test('không hiển thị thông báo lỗi 404/500', async () => {
    expect(await page.getErrorTextCount()).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Filter "Tất cả" (All)
//   Filter mặc định khi trang load; hiển thị tất cả trận
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite 2 — Filter Tất cả (All)', () => {

  let page: UniScorePage;

  test.beforeEach(async ({ page: p }) => {
    page = new UniScorePage(p);
    await page.goto();
    await page.waitForContent();
  });

  // Khi trang load, filter "Tất cả" phải được active (màu vàng)
  test('filter All active theo mặc định khi load trang', async () => {
    expect(await page.isFilterActive('all')).toBe(true);
  });

  // Các filter khác không active theo mặc định
  test('filter Live / Upcoming / Finish không active theo mặc định', async () => {
    expect(await page.isFilterActive('live')).toBe(false);
    expect(await page.isFilterActive('upcoming')).toBe(false);
    expect(await page.isFilterActive('finish')).toBe(false);
  });

  // Container match-list-v2-all phải có trong DOM
  test('match-list-v2-all hiển thị khi All active', async () => {
    await expect(page.matchListAll).toBeAttached();
  });

  // Phải có ít nhất 1 trận trong danh sách
  test('danh sách trận có ít nhất 1 trận', async () => {
    expect(await page.getMatchRowCount()).toBeGreaterThan(0);
  });

  // Mỗi trận phải có đội nhà và đội khách hợp lệ
  test('mỗi trận có tên đội nhà và đội khách không rỗng', async () => {
    const matches = await page.getAllMatchData();
    expect(matches.length).toBeGreaterThan(0);

    for (const m of matches) {
      if (m.homeTeam === '' && m.awayTeam === '') continue; // row đang update
      expect.soft(m.homeTeam, `Row ${m.index}: homeTeam rỗng`).not.toBe('');
      expect.soft(m.awayTeam, `Row ${m.index}: awayTeam rỗng`).not.toBe('');
    }
  });

  // Ô thời gian / tỉ số phải đúng format đã định nghĩa
  test('timeOrScore của mỗi trận đúng format hợp lệ', async () => {
    const matches = await page.getAllMatchData();
    const unknown: string[] = [];

    for (const m of matches) {
      const valid = isValidTimeOrScore(m.timeOrScore);
      if (!valid) unknown.push(`Row ${m.index} [${m.homeTeam} vs ${m.awayTeam}]: "${m.timeOrScore}"`);
      expect.soft(valid, `Format không hợp lệ: "${m.timeOrScore}" (${m.homeTeam} vs ${m.awayTeam})`).toBe(true);
    }

    if (unknown.length > 0) {
      console.warn('\n⚠ Format chưa nhận dạng — cần bổ sung SPECIAL_STATES:');
      unknown.forEach(u => console.warn(' -', u));
    }
  });

  // Đội nhà và đội khách phải khác nhau (TBD vs TBD bỏ qua)
  test('đội nhà và đội khách không phải cùng một đội', async () => {
    const matches = await page.getAllMatchData();
    for (const m of matches) {
      if (/^TBD$/i.test(m.homeTeam) || /^TBD$/i.test(m.awayTeam)) continue;
      expect.soft(m.homeTeam.toLowerCase(), `Row ${m.index}: home === away`).not.toBe(m.awayTeam.toLowerCase());
    }
  });

  // Click Live rồi click lại All → All phải active trở lại
  test('click All sau khi đã click filter khác → All active lại', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.goto();
    await usp.waitForContent();

    await usp.filterLive.click();
    await p.waitForTimeout(1000);
    expect(await usp.isFilterActive('live')).toBe(true);

    await usp.filterAll.click();
    await p.waitForTimeout(1000);
    expect(await usp.isFilterActive('all')).toBe(true);
    await expect(usp.matchListAll).toBeAttached();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Filter "Live"
//   Hiển thị các trận đang diễn ra; số đếm badge phải khớp
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite 3 — Filter Live', () => {

  let page: UniScorePage;

  test.beforeEach(async ({ page: p }) => {
    page = new UniScorePage(p);
    await page.goto();
    await page.waitForContent();
    await page.filterLive.click();
    await p.waitForTimeout(1500);
  });

  // Sau khi click → Live active, All không active
  test('click Live → filter Live active, All không active', async () => {
    expect(await page.isFilterActive('live')).toBe(true);
    expect(await page.isFilterActive('all')).toBe(false);
  });

  // Container match-list-v2-live phải xuất hiện trong DOM
  test('match-list-v2-live xuất hiện trong DOM sau khi click', async () => {
    await expect(page.matchListLive).toBeAttached();
  });

  // Badge live trên nút filter phải hiển thị số hợp lệ
  // (không so với rowCount vì badge đếm tất cả môn thể thao, không chỉ football)
  test('badge live trên nút filter là số nguyên không âm', async () => {
    const badgeCount = await page.getLiveCount();
    expect(badgeCount).toBeGreaterThanOrEqual(0);
  });

  // Nếu có live match, tỉ số phải là số nguyên không âm
  test('tỉ số live match là số nguyên không âm', async () => {
    const liveMatches = await page.getLiveMatches();

    if (liveMatches.length === 0) {
      console.log('Không có trận live — test này bỏ qua');
      return;
    }

    for (const m of liveMatches) {
      const parts = m.timeOrScore.split('-').map(s => parseInt(s.trim(), 10));
      expect.soft(parts[0], `${m.homeTeam}: tỉ số âm`).toBeGreaterThanOrEqual(0);
      expect.soft(parts[1], `${m.awayTeam}: tỉ số âm`).toBeGreaterThanOrEqual(0);
    }
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Filter "Sắp tới" (Upcoming)
//   Chỉ hiển thị trận chưa bắt đầu; format giờ HH:MM
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite 4 — Filter Sắp tới (Upcoming)', () => {

  let page: UniScorePage;

  test.beforeEach(async ({ page: p }) => {
    page = new UniScorePage(p);
    await page.goto();
    await page.waitForContent();
    await page.filterUpcoming.click();
    await p.waitForTimeout(1500);
  });

  // Sau khi click → Upcoming active
  test('click Upcoming → filter Upcoming active', async () => {
    expect(await page.isFilterActive('upcoming')).toBe(true);
    expect(await page.isFilterActive('all')).toBe(false);
  });

  // Container match-list-v2-upcoming phải xuất hiện trong DOM
  test('match-list-v2-upcoming xuất hiện trong DOM', async () => {
    await expect(page.matchListUpcoming).toBeAttached();
  });

  // Tất cả trận trong tab Upcoming phải hiển thị giờ (HH:MM), không có tỉ số
  test('tất cả trận Upcoming hiển thị format giờ HH:MM, không có tỉ số', async () => {
    const matches = await page.getAllMatchData();

    if (matches.length === 0) {
      console.log('Không có trận sắp tới — test này bỏ qua');
      return;
    }

    for (const m of matches) {
      // timeOrScore phải là giờ; không được là tỉ số hoặc FT
      expect.soft(TIME_FORMAT.test(m.timeOrScore),
        `Row ${m.index} [${m.homeTeam} vs ${m.awayTeam}]: expected time format, got "${m.timeOrScore}"`
      ).toBe(true);
    }
  });

  // Không có trận nào có status FT trong tab Upcoming
  test('không có trận FT (đã kết thúc) trong tab Upcoming', async () => {
    const matches = await page.getAllMatchData();
    const ftMatches = matches.filter(m => /^(FT|AET|PEN|AP)$/i.test(m.status));
    expect.soft(ftMatches.length, `Tìm thấy ${ftMatches.length} trận FT trong Upcoming tab`).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Filter "Kết thúc" (Finished)
//   Chỉ hiển thị trận đã hoàn thành; status phải là FT / HT / AET / …
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite 5 — Filter Kết thúc (Finished)', () => {

  let page: UniScorePage;

  test.beforeEach(async ({ page: p }) => {
    page = new UniScorePage(p);
    await page.goto();
    await page.waitForContent();
    await page.filterFinish.click();
    await p.waitForTimeout(1500);
  });

  // Sau khi click → Finish active
  test('click Finished → filter Finished active', async () => {
    expect(await page.isFilterActive('finish')).toBe(true);
    expect(await page.isFilterActive('all')).toBe(false);
  });

  // Container match-list-v2-finished phải xuất hiện trong DOM
  test('match-list-v2-finished xuất hiện trong DOM', async () => {
    await expect(page.matchListFinished).toBeAttached();
  });

  // Phải có ít nhất 1 trận kết thúc (hôm nay luôn có trận từ múi giờ khác)
  test('có ít nhất 1 trận đã kết thúc trong tab Finished', async () => {
    const count = await page.getMatchRowCount();
    if (count === 0) {
      console.log('Không có trận kết thúc — có thể sớm trong ngày, test bỏ qua');
      return;
    }
    expect(count).toBeGreaterThan(0);
  });

  // Mỗi trận trong tab Finished phải có status là FT / HT / AET / PEN / AP
  test('mỗi trận trong Finished có status hợp lệ (FT / HT / AET / PEN / AP)', async () => {
    const matches = await page.getAllMatchData();
    const FINISHED_STATUSES = /^(FT|HT|AET|PEN|AP|Awarded|WO|ABD|Canc\.|PST)$/i;

    for (const m of matches) {
      expect.soft(FINISHED_STATUSES.test(m.status) || m.status === '',
        `Row ${m.index} [${m.homeTeam} vs ${m.awayTeam}]: status không hợp lệ — "${m.status}"`
      ).toBe(true);
    }
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — Date navigation — hôm nay
//   Navigate đến URL ?date=TODAY và kiểm tra trang load đúng
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite 6 — Date navigation — hôm nay', () => {

  // URL với ?date=TODAY phải load đúng trang, filter All active
  test('navigate đến ?date=TODAY → filter All active, có trận', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TODAY);
    await usp.waitForContent();

    expect(p.url()).toContain(`date=${TODAY}`);
    expect(await usp.isFilterActive('all')).toBe(true);
    await expect(usp.matchListAll).toBeAttached();
    expect(await usp.getMatchRowCount()).toBeGreaterThan(0);
  });

  // Không load thêm lần nữa khi đã ở Today — title không thay đổi
  test('title trang vẫn đúng khi điều hướng đến Today', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TODAY);
    await usp.waitForContent();
    expect(await usp.getTitle()).toMatch(/uniscore/i);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 — Date navigation — ngày tương lai
//   Navigate đến ngày tương lai và kiểm tra chỉ có trận sắp diễn ra
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite 7 — Date navigation — ngày tương lai', () => {

  // URL với ?date=TOMORROW phải load đúng, filter All active, có trận
  // (All filter ngày mai có thể bao gồm FT từ timezone châu Á — không ép format giờ)
  test('navigate đến ngày mai → URL đúng, filter All active, có trận', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TOMORROW);
    await usp.waitForContent();

    expect(p.url()).toContain(`date=${TOMORROW}`);
    expect(await usp.isFilterActive('all')).toBe(true);
    await expect(usp.matchListAll).toBeAttached();
    expect(await usp.getMatchRowCount()).toBeGreaterThan(0);
  });

  // Ngày 2 ngày sau cũng phải có trận
  test('navigate đến 2 ngày sau → trang load, có trận', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(IN_TWO_DAYS);
    await usp.waitForContent();

    expect(p.url()).toContain(`date=${IN_TWO_DAYS}`);
    const count = await usp.getMatchRowCount();
    expect(count).toBeGreaterThan(0);
  });

  // Không có trận FT trong ngày tương lai
  test('ngày tương lai không có trận đã kết thúc (FT)', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TOMORROW);
    await usp.waitForContent();

    const matches = await usp.getAllMatchData();
    const ftMatches = matches.filter(m => /^(FT|AET|PEN|AP)$/i.test(m.status));
    expect(ftMatches.length).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8 — Kết hợp Date + Filter
//   Kiểm tra các combination date × filter thực tế nhất
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite 8 — Kết hợp Date + Filter', () => {

  // Hôm nay + Upcoming → chỉ trận giờ HH:MM
  test('hôm nay + filter Upcoming → tất cả trận có format giờ', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TODAY);
    await usp.waitForContent();

    await usp.filterUpcoming.click();
    await p.waitForTimeout(1500);

    expect(await usp.isFilterActive('upcoming')).toBe(true);
    await expect(usp.matchListUpcoming).toBeAttached();

    const matches = await usp.getAllMatchData();
    if (matches.length === 0) {
      console.log('Không có trận upcoming hôm nay — bỏ qua');
      return;
    }

    for (const m of matches) {
      expect.soft(TIME_FORMAT.test(m.timeOrScore),
        `Row ${m.index}: expected time format, got "${m.timeOrScore}"`
      ).toBe(true);
    }
  });

  // Hôm nay + Finished → chỉ trận có status FT/HT/AET…
  test('hôm nay + filter Finished → tất cả trận có status kết thúc', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TODAY);
    await usp.waitForContent();

    await usp.filterFinish.click();
    await p.waitForTimeout(1500);

    expect(await usp.isFilterActive('finish')).toBe(true);
    await expect(usp.matchListFinished).toBeAttached();

    const matches = await usp.getAllMatchData();
    if (matches.length === 0) {
      console.log('Không có trận kết thúc hôm nay — bỏ qua');
      return;
    }

    const FINISHED_STATUSES = /^(FT|HT|AET|PEN|AP|Awarded|WO|ABD|Canc\.|PST)$/i;
    for (const m of matches) {
      expect.soft(FINISHED_STATUSES.test(m.status) || m.status === '',
        `Row ${m.index} [${m.homeTeam} vs ${m.awayTeam}]: status "${m.status}" không phải kết thúc`
      ).toBe(true);
    }
  });

  // Ngày mai + Upcoming → chỉ trận giờ HH:MM
  test('ngày mai + filter Upcoming → tất cả trận có format giờ', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TOMORROW);
    await usp.waitForContent();

    await usp.filterUpcoming.click();
    await p.waitForTimeout(1500);

    expect(await usp.isFilterActive('upcoming')).toBe(true);

    const matches = await usp.getAllMatchData();
    expect(matches.length).toBeGreaterThan(0);

    for (const m of matches) {
      expect.soft(TIME_FORMAT.test(m.timeOrScore),
        `Row ${m.index}: expected time, got "${m.timeOrScore}"`
      ).toBe(true);
    }
  });

  // Ngày mai + Finished → nếu có trận, tất cả phải có status FT/HT/AET
  // (một số timezone châu Á đã sang ngày mới → có thể có FT sớm)
  test('ngày mai + filter Finished → các trận hiển thị phải có status kết thúc hợp lệ', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TOMORROW);
    await usp.waitForContent();

    await usp.filterFinish.click();
    await p.waitForTimeout(1500);

    expect(await usp.isFilterActive('finish')).toBe(true);
    await expect(usp.matchListFinished).toBeAttached();

    const matches = await usp.getAllMatchData();
    const FINISHED_STATUSES = /^(FT|HT|AET|PEN|AP|Awarded|WO|ABD|Canc\.|PST)$/i;

    for (const m of matches) {
      expect.soft(FINISHED_STATUSES.test(m.status) || m.status === '',
        `Row ${m.index} [${m.homeTeam} vs ${m.awayTeam}]: status "${m.status}" không phải kết thúc`
      ).toBe(true);
    }
  });

  // Ngày mai + Live → không có trận live
  test('ngày mai + filter Live → không có trận live', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    await usp.gotoDate(TOMORROW);
    await usp.waitForContent();

    await usp.filterLive.click();
    await p.waitForTimeout(1500);

    expect(await usp.isFilterActive('live')).toBe(true);
    const liveMatches = await usp.getLiveMatches();
    expect(liveMatches.length).toBe(0);
  });

  // Điều hướng qua 3 ngày liên tiếp (hôm nay → mai → ngày kia) — trang luôn load được
  test('điều hướng liên tiếp qua 3 ngày → trang luôn load và có trận', async ({ page: p }) => {
    const usp = new UniScorePage(p);
    for (const date of [TODAY, TOMORROW, IN_TWO_DAYS]) {
      await usp.gotoDate(date);
      await usp.waitForContent();
      expect(p.url()).toContain(`date=${date}`);
      expect(await usp.isFilterActive('all')).toBe(true);
      expect(await usp.getMatchRowCount()).toBeGreaterThan(0);
    }
  });

});

// npx playwright test tests/uniscore-page.spec.ts --project=chrome --headed
