/**
 * US-4795 — đối chiếu UI thật (uniscore.com) với API cho 4 tab trang Home:
 * All / Live / Upcoming / Finished.
 *
 * Trang Home không dùng <a href="/football/match/...​"> cho danh sách trận chính
 * (chỉ widget "Featured Live Match" ở đầu trang dùng link thật) — nên không thể
 * querySelector theo href. Thay vào đó đối chiếu theo TEXT nội dung trang: tên
 * đội trong response API phải xuất hiện đúng thứ tự trong innerText của khối
 * danh sách trận.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/06-ui-vs-api.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2, liveV2 } from './lib/home-client';

const TODAY = vnDate(0);
const SITE = 'https://uniscore.com/en';

/** Lấy đúng khối chứa danh sách trận chính (loại bỏ sidebar "All Leagues" bên phải
 *  và widget "Featured Live Match" ở đầu trang — cả hai cũng chứa tên đội/quốc gia
 *  và có thể gây false-positive nếu đối chiếu bằng document.body.innerText thô).
 *  Đi lên từ tab filter "Finished" ([data-testid=filter-finish]) tới ancestor gần
 *  nhất có chứa text thật của trận (nhận diện qua dấu hiệu định dạng giờ "HH:MM"
 *  hoặc "FT") nhưng KHÔNG chứa "All Leagues" (dấu hiệu riêng của sidebar). */
async function getMainListText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const finishedBtn = document.querySelector('[data-testid="filter-finish"]');
    if (!finishedBtn) return document.body.innerText;
    let node: HTMLElement | null = finishedBtn as HTMLElement;
    for (let i = 0; i < 15 && node; i++) {
      const text = node.innerText || '';
      if (!text.includes('All Leagues') && (/\d{1,2}:\d{2}/.test(text) || text.includes('FT')) && text.length > 200) {
        return text;
      }
      node = node.parentElement;
    }
    return document.body.innerText;
  });
}

test.describe('UI vs API — tab All', () => {
  test('danh sách trận trên UI khớp đúng thứ tự + tên đội với API scheduled-v2', async ({ page, request }) => {
    // UI test chạy trên uniscore.com/en (tiếng Anh) nên phải gọi API với
    // language=en — language=vi trả field `name` khác hẳn (short code kiểu
    // "CA.HN" thay vì tên đầy đủ, xem bug UTD-899) và sẽ gây false-positive.
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'));
    test.skip(body.code !== 1 || body.data.events.length === 0, 'Không có trận nào hôm nay để đối chiếu');

    await page.goto(SITE, { waitUntil: 'networkidle' });
    // React có thể vẫn đang hydrate/render match list sau khi network đã idle
    // (networkidle chỉ đảm bảo hết request, không đảm bảo hết re-render) —
    // thiếu chờ này khiến getMainListText đôi khi đọc trúng DOM chưa có data
    // thật, gây false-positive toàn bộ trận "không tìm thấy".
    await page.waitForTimeout(800);
    const uiText = await getMainListText(page);

    // Chỉ kiểm tra N trận đầu (đủ để phát hiện lệch thứ tự/thiếu trận mà không
    // quá nhạy với các trận cuối danh sách có thể bị cắt do phân trang UI).
    const sampleSize = Math.min(5, body.data.events.length);
    const mismatches: string[] = [];
    let cursor = 0;
    for (let i = 0; i < sampleSize; i++) {
      const e = body.data.events[i];
      const home = e.homeTeam.shortName;
      const away = e.awayTeam.shortName;
      const homeIdx = uiText.indexOf(home, cursor);
      if (homeIdx === -1) { mismatches.push(`Trận #${i} "${home}" không tìm thấy trên UI (theo đúng thứ tự)`); continue; }
      const awayIdx = uiText.indexOf(away, homeIdx);
      if (awayIdx === -1) { mismatches.push(`Trận #${i} "${home} vs ${away}": tìm thấy "${home}" nhưng không thấy "${away}" theo sau`); continue; }
      cursor = awayIdx;
    }
    expect(mismatches).toEqual([]);
  });

  test('số trận hiển thị trên UI tab All khớp số lượng events trả về từ API (không quá chênh lệch)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'));
    test.skip(body.code !== 1, 'API không trả code 1');

    await page.goto(SITE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const uiText = await getMainListText(page);
    // Đếm số lần tên đội (shortName) của API xuất hiện trong UI text — ước lượng
    // số trận UI thực sự render (không đếm trùng khối "All Leagues" vì đã cắt ở getMainListText).
    const foundCount = body.data.events.filter((e: any) => uiText.includes(e.homeTeam.shortName) && uiText.includes(e.awayTeam.shortName)).length;
    expect(foundCount, `API trả ${body.data.events.length} trận nhưng UI chỉ thấy ${foundCount} trận`).toBeGreaterThanOrEqual(body.data.events.length - 1);
  });
});

test.describe('UI vs API — tab Live', () => {
  test('trận live hiển thị trên UI (nếu có) khớp với API live-v2', async ({ page, request }) => {
    const { body } = await post(request, liveV2('VN', 'en'));
    test.skip(body.code !== 1 || !body.data.events?.length, 'Không có trận live tại thời điểm chạy');

    await page.goto(SITE, { waitUntil: 'networkidle' });
    // 2 element cùng tên "Live" trên trang (widget Featured Live Match + tab filter
    // thật sự) — dùng data-testid để chọn đúng tab filter, tránh strict mode violation.
    const liveTab = page.getByTestId('filter-live');
    await liveTab.click();
    await page.waitForTimeout(800); // chờ re-render sau khi đổi tab

    const uiText = await getMainListText(page);
    const e = body.data.events[0];
    expect(uiText, `Trận live đầu tiên "${e.homeTeam.shortName} vs ${e.awayTeam.shortName}" không thấy trên UI tab Live`)
      .toContain(e.homeTeam.shortName);
  });
});

test.describe('UI vs API — tab Upcoming', () => {
  test('trận đầu tiên của tab Upcoming trên UI khớp API (status chưa đá)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'upcoming', 'en'));
    test.skip(body.code !== 1 || body.data.events.length === 0, 'Không có trận upcoming hôm nay');

    await page.goto(SITE, { waitUntil: 'networkidle' });
    const upcomingTab = page.getByTestId('filter-upcoming');
    await upcomingTab.click();
    await page.waitForTimeout(800);

    const uiText = await getMainListText(page);
    const e = body.data.events[0];
    expect(uiText).toContain(e.homeTeam.shortName);
  });
});

test.describe('UI vs API — tab Finished', () => {
  test('trận đầu tiên của tab Finished trên UI khớp API (có tỷ số)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'finish', 'en'));
    test.skip(body.code !== 1 || body.data.events.length === 0, 'Không có trận finished hôm nay');

    await page.goto(SITE, { waitUntil: 'networkidle' });
    const finishedTab = page.getByTestId('filter-finish');
    await finishedTab.click();
    await page.waitForTimeout(800);

    const uiText = await getMainListText(page);
    const e = body.data.events[0];
    expect(uiText).toContain(e.homeTeam.shortName);
    // Tỷ số thật phải hiện trên UI, không chỉ "FT" suông.
    if (e.homeScore?.display != null && e.awayScore?.display != null) {
      expect(uiText, 'Thiếu tỷ số home trên UI').toContain(String(e.homeScore.display));
      expect(uiText, 'Thiếu tỷ số away trên UI').toContain(String(e.awayScore.display));
    }
  });
});
