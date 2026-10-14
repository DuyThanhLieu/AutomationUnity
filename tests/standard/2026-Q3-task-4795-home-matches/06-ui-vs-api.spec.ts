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

/** Lấy đúng khối chứa danh sách trận chính (loại bỏ sidebar "Other matches" bên
 *  phải và widget "Featured Live Match" ở đầu trang — cả hai cũng chứa tên
 *  đội/quốc gia và có thể gây false-positive nếu đối chiếu bằng
 *  document.body.innerText thô).
 *
 *  LỊCH SỬ 2 LẦN SỬA SAI TRƯỚC — ghi lại để không lặp lại:
 *  1) Dùng từ khóa loại trừ "All Leagues" — SAI, đó là text ở trang
 *     /competition riêng, route khác hẳn trang Home.
 *  2) Đổi sang "Other matches" (đúng từ khóa) nhưng vẫn dùng logic
 *     "!text.includes(...)" để DỪNG tại ancestor đầu tiên không chứa từ khóa —
 *     SAI vì "Other matches" (sidebar) và danh sách trận chính nằm chung 1
 *     cây DOM lớn hơn: mọi ancestor đủ cao để chứa match list CŨNG chứa luôn
 *     sidebar phía dưới nó. Kết quả: không có ancestor nào thoả "không chứa
 *     Other matches", hàm luôn trả null, rơi vào fallback
 *     document.body.innerText (lẫn lộn mọi thứ) — tái hiện được trên CI dù
 *     "tình cờ" pass nhiều lần trên local (layout/viewport khác nhau khiến
 *     độ dài text tại mỗi độ sâu khác nhau đủ để đôi khi né được).
 *
 *  CÁCH ĐÚNG: không loại trừ theo từ khóa — tìm ancestor NHỎ NHẤT (độ dài text
 *  ngắn nhất) vừa đủ chứa dấu hiệu 1 trận thật ("HH:MM" hoặc "FT") và có độ
 *  dài hợp lý cho 1 danh sách trận (vài trăm đến vài nghìn ký tự) — vì sidebar
 *  + match list cộng lại luôn dài hơn nhiều so với chỉ riêng match list. Giới
 *  hạn trên (maxLen) để không lỡ khớp luôn toàn trang khi match list quá ít
 *  (test.skip lúc đó nếu cần, nhưng tránh false-negative nguy hiểm hơn). */
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
        // Container nhỏ nhất (ít ký tự nhất) thỏa điều kiện luôn là ứng viên
        // tốt nhất — nó bao bọc ít nội dung "thừa" (sidebar, footer) nhất.
        if (looksLikeMatchList && text.length > 200 && text.length < 8000) {
          if (!best || text.length < best.length) best = text;
        }
        node = node.parentElement;
      }
      return best;
    });

  // Máy CI (đặc biệt GitHub Actions ubuntu-latest) có thể chậm hơn nhiều so
  // với máy dev khi hydrate React lần đầu sau networkidle — 1 lần
  // waitForTimeout cố định (800ms) không đủ, từng gây ~25/27 trận
  // "không tìm thấy" hàng loạt trên CI dù local luôn pass. Poll chủ động tới
  // khi có text thật thay vì đoán 1 khoảng chờ cố định.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const text = await extract();
    if (text) return text;
    await page.waitForTimeout(300);
  }
  return page.evaluate(() => document.body.innerText);
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

// ============================================================================
// Nhóm case mới: trận BIẾN MẤT khỏi UI, SẮP SAI THỨ TỰ, và hiển thị SAI TAB
// (trận chưa đến ngày thi đấu lại lọt vào Finished, hoặc ngược lại).
// ============================================================================

/** Trạng thái "chưa diễn ra" theo status.type API (xem STALE_CODES ở file 01). */
const NOT_STARTED_TYPES = new Set(['not_started']);
const FINISHED_TYPES = new Set(['finished']);

test.describe('UI vs API — trận mất tích / sai thứ tự (tab All)', () => {
  test('không có trận nào bị MẤT HOÀN TOÀN khỏi UI tab All (không tìm thấy ở bất kỳ vị trí nào)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'));
    test.skip(body.code !== 1 || body.data.events.length === 0, 'Không có trận nào hôm nay để đối chiếu');

    await page.goto(`${SITE}?date=${TODAY}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const uiText = await getMainListText(page);

    // Khác với test "đúng thứ tự" (cho phép lệch nhỏ do phân trang): đây chỉ
    // kiểm tra trận có MẶT ở bất kỳ đâu trong UI hay không, không quan tâm vị
    // trí — tách riêng để khi fail, biết chắc là "mất trận" chứ không phải
    // "chỉ sai thứ tự" (2 loại bug khác nhau, cần dev xử lý khác nhau).
    const missing = body.data.events.filter((e: any) => !uiText.includes(e.homeTeam.shortName) || !uiText.includes(e.awayTeam.shortName));
    const report = missing.map((e: any) => `"${e.homeTeam.shortName} vs ${e.awayTeam.shortName}" (${e.tournament?.name ?? '?'}, id=${e.id})`);
    const threshold = Math.max(2, Math.ceil(body.data.events.length * 0.05));
    expect(report.length, `${report.length}/${body.data.events.length} trận MẤT KHỎI UI hoàn toàn:\n${report.join('\n')}`).toBeLessThanOrEqual(threshold);
  });

  test('thứ tự hiển thị trên UI không bị ĐẢO NGƯỢC so với API (trận #N không được đứng trước trận #N-1)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'));
    test.skip(body.code !== 1 || body.data.events.length < 2, 'Không đủ trận để kiểm tra thứ tự');

    await page.goto(`${SITE}?date=${TODAY}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const uiText = await getMainListText(page);

    // Lấy vị trí (index trong uiText) của từng trận tìm thấy được, theo đúng
    // thứ tự API trả về. Nếu UI hiển thị đúng thứ tự, dãy vị trí này phải tăng
    // dần đơn điệu — 1 vị trí nhỏ hơn vị trí trước đó nghĩa là 2 trận đã bị
    // ĐẢO CHỖ cho nhau trên UI (khác với "mất trận": ở đây cả 2 đều có mặt,
    // chỉ sai thứ tự tương đối).
    const positions: Array<{ idx: number; home: string; away: string; pos: number }> = [];
    for (let i = 0; i < body.data.events.length; i++) {
      const e = body.data.events[i];
      const pos = uiText.indexOf(e.homeTeam.shortName);
      if (pos !== -1) positions.push({ idx: i, home: e.homeTeam.shortName, away: e.awayTeam.shortName, pos });
    }

    const outOfOrder: string[] = [];
    for (let i = 1; i < positions.length; i++) {
      if (positions[i].pos < positions[i - 1].pos) {
        outOfOrder.push(
          `Trận #${positions[i].idx} "${positions[i].home} vs ${positions[i].away}" (vị trí UI=${positions[i].pos}) ` +
          `đứng TRƯỚC trận #${positions[i - 1].idx} "${positions[i - 1].home} vs ${positions[i - 1].away}" (vị trí UI=${positions[i - 1].pos}), ngược thứ tự API`
        );
      }
    }
    // Cho phép vài cặp lệch do trùng substring tên rút gọn (vd "Sao Paulo" vs
    // "Paulo") gây định vị index sai — chỉ fail khi số lượng đủ lớn để là bug
    // thật, không phải nhiễu do cách so chuỗi.
    const threshold = Math.max(3, Math.ceil(positions.length * 0.05));
    expect(outOfOrder.length, `${outOfOrder.length} cặp trận bị đảo thứ tự:\n${outOfOrder.join('\n')}`).toBeLessThanOrEqual(threshold);
  });
});

test.describe('UI vs API — trận hiển thị SAI TAB (chưa đến ngày / đã xong nhưng lẫn tab)', () => {
  test('tab Upcoming không được lẫn trận ĐÃ KẾT THÚC (status finished)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'upcoming', 'en'));
    test.skip(body.code !== 1, 'API không trả code 1');

    // Case biên quan trọng nhất theo yêu cầu: chính API trả về tab "upcoming"
    // nhưng lại chứa trận có status "finished" — đây là bug backend thật,
    // không phải lỗi hiển thị UI. Kiểm tra ngay ở tầng API trước khi tốn công
    // verify UI (UI không thể "sửa" được dữ liệu sai từ API).
    const wronglyFinished = body.data.events.filter((e: any) => FINISHED_TYPES.has(e.status?.type));
    expect(
      wronglyFinished.map((e: any) => `"${e.homeTeam.shortName} vs ${e.awayTeam.shortName}" status=${e.status?.type}`),
      'API tab Upcoming trả về trận ĐÃ KẾT THÚC'
    ).toEqual([]);

    test.skip(body.data.events.length === 0, 'Không có trận upcoming hôm nay để verify UI');
    await page.goto(SITE, { waitUntil: 'networkidle' });
    const upcomingTab = page.getByTestId('filter-upcoming');
    await upcomingTab.click();
    await page.waitForTimeout(800);
    const uiText = await getMainListText(page);

    // UI không được hiện badge "FT" (kết thúc) cho bất kỳ trận nào đang ở tab
    // Upcoming — nếu có, là bug hiển thị UI (khác bug backend đã check ở trên).
    //
    // QUAN TRỌNG: định vị bằng indexOf(home) ĐƠN LẺ sẽ lấy occurrence ĐẦU TIÊN
    // của tên đội trong toàn bộ uiText — sai nếu đội đó (hoặc 1 đội trùng tên
    // rút gọn, vd "Inter" của cả Inter Milan lẫn Inter Miami) từng xuất hiện ở
    // vị trí khác trước đó trong text. Phải định vị bằng CẶP home+away liền kề
    // (giống cách test "đúng thứ tự" ở trên đã làm đúng) để chắc chắn lấy đúng
    // context của chính trận #i, không phải 1 occurrence trùng tên ngẫu nhiên.
    const sampleSize = Math.min(10, body.data.events.length);
    const wrongBadge: string[] = [];
    let cursor1 = 0;
    for (let i = 0; i < sampleSize; i++) {
      const e = body.data.events[i];
      const home = e.homeTeam.shortName;
      const away = e.awayTeam.shortName;
      const homeIdx = uiText.indexOf(home, cursor1);
      if (homeIdx === -1) continue; // đã báo "mất trận" ở test khác, không lặp lại ở đây
      const awayIdx = uiText.indexOf(away, homeIdx);
      if (awayIdx === -1) continue;
      cursor1 = awayIdx;
      // Lấy đoạn text ngay trước tên đội home — đây là nơi badge trạng thái
      // ("FT", giờ "HH:MM") thường nằm cạnh tên giải, theo đúng layout đã quan
      // sát qua getMainListText.
      const context = uiText.slice(Math.max(0, homeIdx - 80), homeIdx);
      if (/\bFT\b/.test(context)) wrongBadge.push(`#${i} "${home}": thấy badge "FT" ngay trước tên đội dù status API là upcoming`);
    }
    expect(wrongBadge, wrongBadge.join('\n')).toEqual([]);
  });

  test('tab Finished không được lẫn trận CHƯA DIỄN RA (status not_started, chưa đến ngày)', async ({ page, request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'finish', 'en'));
    test.skip(body.code !== 1, 'API không trả code 1');

    // Tương tự trên: check tầng API trước — trận chưa bắt đầu lọt vào tab
    // "finish" là bug backend rõ ràng, không phụ thuộc UI.
    const wronglyNotStarted = body.data.events.filter((e: any) => NOT_STARTED_TYPES.has(e.status?.type));
    expect(
      wronglyNotStarted.map((e: any) => `"${e.homeTeam.shortName} vs ${e.awayTeam.shortName}" status=${e.status?.type}, startTimestamp=${e.startTimestamp}`),
      'API tab Finished trả về trận CHƯA DIỄN RA (chưa đến ngày)'
    ).toEqual([]);

    test.skip(body.data.events.length === 0, 'Không có trận finished hôm nay để verify UI');
    await page.goto(SITE, { waitUntil: 'networkidle' });
    const finishedTab = page.getByTestId('filter-finish');
    await finishedTab.click();
    await page.waitForTimeout(800);
    const uiText = await getMainListText(page);

    // Ngược lại: UI không được hiện giờ thi đấu dạng "HH:MM" (dấu hiệu trận
    // chưa đá) cho trận ở tab Finished — trận đã xong phải hiện "FT", không
    // phải giờ kickoff.
    //
    // Định vị bằng CẶP home+away liền kề (không phải indexOf(home) đơn lẻ) —
    // xem giải thích chi tiết ở test "tab Upcoming" phía trên: tên rút gọn
    // trùng nhau giữa nhiều đội (vd "Inter" = Inter Milan lẫn Inter Miami) có
    // thể khớp nhầm occurrence đầu tiên, gây false-positive.
    const sampleSize = Math.min(10, body.data.events.length);
    const wrongBadge: string[] = [];
    let cursor2 = 0;
    for (let i = 0; i < sampleSize; i++) {
      const e = body.data.events[i];
      const home = e.homeTeam.shortName;
      const away = e.awayTeam.shortName;
      const homeIdx = uiText.indexOf(home, cursor2);
      if (homeIdx === -1) continue;
      const awayIdx = uiText.indexOf(away, homeIdx);
      if (awayIdx === -1) continue;
      cursor2 = awayIdx;
      const context = uiText.slice(Math.max(0, homeIdx - 80), homeIdx);
      if (/\d{1,2}:\d{2}/.test(context) && !context.includes('FT')) {
        wrongBadge.push(`#${i} "${home}": thấy giờ kickoff (chưa đá) ngay trước tên đội dù status API là finished`);
      }
    }
    expect(wrongBadge, wrongBadge.join('\n')).toEqual([]);
  });
});
