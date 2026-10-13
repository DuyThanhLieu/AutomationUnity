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

// 3 ngày: hôm qua (finished chắc chắn có), hôm nay, ngày mai (upcoming chắc
// chắn có) — tăng độ phủ thay vì chỉ test đúng hôm nay.
const DAYS_TO_CHECK: Array<{ label: string; date: string }> = [
  { label: 'hôm qua', date: vnDate(-1) },
  { label: 'hôm nay', date: TODAY },
  { label: 'ngày mai', date: vnDate(1) },
];

for (const { label, date } of DAYS_TO_CHECK) {
  test.describe(`UI vs API — tab All — ${label} (${date})`, () => {
    test('toàn bộ trận trên UI khớp đúng thứ tự + tên đội với API scheduled-v2', async ({ page, request }) => {
      // UI test chạy trên uniscore.com/en (tiếng Anh) nên phải gọi API với
      // language=en — language=vi trả field `name` khác hẳn (short code kiểu
      // "CA.HN" thay vì tên đầy đủ, xem bug UTD-899) và sẽ gây false-positive.
      const { body } = await post(request, scheduledV2(date, 'VN', 'all', 'en'));
      test.skip(body.code !== 1 || body.data.events.length === 0, `Không có trận nào ${label} để đối chiếu`);

      // scheduled-v2 không tự chuyển ngày trên UI — dùng query ?date= mà UI
      // hỗ trợ (đã xác nhận qua network request thật khi đổi ngày trên UI).
      await page.goto(`${SITE}?date=${date}`, { waitUntil: 'networkidle' });
      // React có thể vẫn đang hydrate/render match list sau khi network đã idle
      // (networkidle chỉ đảm bảo hết request, không đảm bảo hết re-render) —
      // thiếu chờ này khiến getMainListText đôi khi đọc trúng DOM chưa có data
      // thật, gây false-positive toàn bộ trận "không tìm thấy".
      await page.waitForTimeout(800);
      const uiText = await getMainListText(page);

      // Kiểm tra TOÀN BỘ trận trả về (trước đây chỉ 5 trận đầu) để tăng độ phủ;
      // vẫn cho phép lệch thứ tự cục bộ nhỏ bằng cách tìm kiếm không neo cứng
      // cursor khi 1 trận không tìm thấy (tránh hiệu ứng domino 1 lỗi làm sai
      // toàn bộ các trận phía sau).
      const mismatches: string[] = [];
      let cursor = 0;
      for (let i = 0; i < body.data.events.length; i++) {
        const e = body.data.events[i];
        const home = e.homeTeam.shortName;
        const away = e.awayTeam.shortName;
        const homeIdx = uiText.indexOf(home, cursor);
        if (homeIdx === -1) { mismatches.push(`Trận #${i} "${home}" không tìm thấy trên UI`); continue; }
        const awayIdx = uiText.indexOf(away, homeIdx);
        if (awayIdx === -1) { mismatches.push(`Trận #${i} "${home} vs ${away}": tìm thấy "${home}" nhưng không thấy "${away}" theo sau`); continue; }
        cursor = awayIdx;
      }
      // Cho phép tối đa 5% trận lệch (UI có thể cắt bớt trận cuối do phân trang,
      // hoặc trùng tên rút gọn giữa 2 đội khác nhau) — chặt hơn hẳn so với
      // không kiểm tra gì trước đây, nhưng không quá nhạy gây flaky.
      const threshold = Math.max(2, Math.ceil(body.data.events.length * 0.05));
      expect(mismatches.length, `${mismatches.length}/${body.data.events.length} trận lệch:\n${mismatches.join('\n')}`).toBeLessThanOrEqual(threshold);
    });

    test('số trận hiển thị trên UI tab All khớp số lượng events trả về từ API (không quá chênh lệch)', async ({ page, request }) => {
      const { body } = await post(request, scheduledV2(date, 'VN', 'all', 'en'));
      test.skip(body.code !== 1, 'API không trả code 1');

      await page.goto(`${SITE}?date=${date}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const uiText = await getMainListText(page);
      // Đếm số lần tên đội (shortName) của API xuất hiện trong UI text — ước lượng
      // số trận UI thực sự render (không đếm trùng khối "All Leagues" vì đã cắt ở getMainListText).
      const foundCount = body.data.events.filter((e: any) => uiText.includes(e.homeTeam.shortName) && uiText.includes(e.awayTeam.shortName)).length;
      const threshold = Math.max(1, Math.ceil(body.data.events.length * 0.05));
      expect(foundCount, `API trả ${body.data.events.length} trận nhưng UI chỉ thấy ${foundCount} trận`).toBeGreaterThanOrEqual(body.data.events.length - threshold);
    });
  });
}

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
  test('N trận đầu của tab Upcoming trên UI khớp API (status chưa đá)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'upcoming', 'en'));
    test.skip(body.code !== 1 || body.data.events.length === 0, 'Không có trận upcoming hôm nay');

    await page.goto(SITE, { waitUntil: 'networkidle' });
    const upcomingTab = page.getByTestId('filter-upcoming');
    await upcomingTab.click();
    await page.waitForTimeout(800);

    const uiText = await getMainListText(page);
    // Kiểm tra tối đa 10 trận đầu (thay vì chỉ 1) để tăng độ phủ mà không quá
    // nhạy với phân trang UI ở cuối danh sách.
    const sampleSize = Math.min(10, body.data.events.length);
    const missing: string[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const e = body.data.events[i];
      if (!uiText.includes(e.homeTeam.shortName)) missing.push(`#${i} "${e.homeTeam.shortName}"`);
    }
    expect(missing, `${missing.length}/${sampleSize} trận không thấy trên UI: ${missing.join(', ')}`).toEqual([]);
  });

  // Không có test "locale GB" ở đây: trang uniscore.com/en luôn gọi API với
  // locale=VN bất kể URL — locale trong các route Home là vị trí địa lý dùng
  // để ưu tiên top leagues/giờ hiển thị, không map được sang 1 URL GB riêng
  // để verify UI (đã xác nhận qua network request thật — không có request
  // locale=GB nào khi load trang). Việc đổi locale param khi gọi API mà
  // không đổi được UI tương ứng theo sẽ luôn gây false-positive ở đây; test
  // GB cho route này đã có đủ ở lớp API thuần (file 01/05), không cần lặp ở UI.
});

test.describe('UI vs API — tab Finished', () => {
  test('N trận đầu của tab Finished trên UI khớp API (có tỷ số)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'finish', 'en'));
    test.skip(body.code !== 1 || body.data.events.length === 0, 'Không có trận finished hôm nay');

    await page.goto(SITE, { waitUntil: 'networkidle' });
    const finishedTab = page.getByTestId('filter-finish');
    await finishedTab.click();
    await page.waitForTimeout(800);

    const uiText = await getMainListText(page);
    const sampleSize = Math.min(10, body.data.events.length);
    const issues: string[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const e = body.data.events[i];
      if (!uiText.includes(e.homeTeam.shortName)) {
        issues.push(`#${i} "${e.homeTeam.shortName}" không thấy trên UI`);
        continue;
      }
      // Tỷ số thật phải hiện trên UI, không chỉ "FT" suông.
      if (e.homeScore?.display != null && e.awayScore?.display != null) {
        if (!uiText.includes(String(e.homeScore.display))) issues.push(`#${i} "${e.homeTeam.shortName}": thiếu tỷ số home (${e.homeScore.display})`);
        if (!uiText.includes(String(e.awayScore.display))) issues.push(`#${i} "${e.awayTeam.shortName}": thiếu tỷ số away (${e.awayScore.display})`);
      }
    }
    expect(issues, issues.join('\n')).toEqual([]);
  });
});
