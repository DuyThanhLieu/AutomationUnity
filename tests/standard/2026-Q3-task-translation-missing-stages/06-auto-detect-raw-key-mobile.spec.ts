/**
 * AUTO-CHECK TRÊN MOBILE — tái hiện đúng vị trí bug "raw translation key"
 * mà user báo bằng 2 ảnh chụp màn hình (đều là layout mobile/app):
 *   1. "advancing_match" — badge cạnh tên giải, trận Kazakhstan (W) vs
 *      Ireland (W), giải "WC Nữ Châu Âu".
 *   2. "division_1_final" — badge cạnh tên giải, trận Indonesia vs
 *      Thái Lan, giải "FIFA ASEAN Cup".
 *
 * Spec 04 (desktop) đã chạy PASS 3/3 — không lộ raw key nào trên breadcrumb
 * desktop, vì desktop dùng field "legKey" (dịch đúng). Giả thuyết: bug chỉ
 * lộ ra ở layout MOBILE, nơi UI render badge khác với breadcrumb desktop.
 * Spec này dùng Playwright device emulation (iPhone 13, viewport 390x844,
 * đúng kiểu dáng ảnh chụp màn hình gốc) để tái hiện chính xác.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-translation-missing-stages/06-auto-detect-raw-key-mobile.spec.ts --project=chrome
 *   (spec tự override context thành mobile qua test.use(), không cần đổi playwright.config.ts)
 */
import { test, expect, devices } from '@playwright/test';

// Chỉ lấy viewport/userAgent/isMobile từ profile iPhone 13 — KHÔNG dùng
// defaultBrowserType "webkit" của nó (tránh phải cài thêm browser WebKit
// nặng). Bug liên quan tới responsive breakpoint của FE (mobile layout vs
// desktop layout), không phụ thuộc engine trình duyệt — chạy trên Chromium
// (--project=chrome) với viewport/UA mobile vẫn tái hiện đúng layout.
const iPhone13 = devices['iPhone 13'];
test.use({
  viewport: iPhone13.viewport,
  userAgent: iPhone13.userAgent,
  isMobile: iPhone13.isMobile,
  hasTouch: iPhone13.hasTouch,
  deviceScaleFactor: iPhone13.deviceScaleFactor,
});

const NESTJS_API = 'https://opta-api.uniscore.vn/api/v2/football';

function looksLikeRawKey(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return /^[a-z0-9_]+$/.test(trimmed) && trimmed.includes('_');
}

test.describe('[Auto-check MOBILE] Raw translation key trên badge Match Detail', () => {
  test('Case 1 — trận Israel (W) vs Switzerland (W) — badge không được lộ raw key', async ({ page, request }) => {
    const eventId = 'o8tzjglqgjc5w47';
    const eventRes = await request.get(`${NESTJS_API}/event/${eventId}?language=en`);
    const eventBody = await eventRes.json();
    const stageInfo = eventBody?.data?.event?.stageInfo;
    test.info().annotations.push({ type: 'stage-info', description: JSON.stringify(stageInfo) });

    await page.goto('https://staging.uniscore.vn/en/football/match/israel-women-switzerland-women/o8tzjglqgjc5w47', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1000);

    const bodyText = await page.locator('main').first().innerText();
    const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean);
    const suspiciousLines = lines.filter((l) => looksLikeRawKey(l));

    test.info().annotations.push({ type: 'page-lines-sample', description: lines.slice(0, 20).join(' | ') });
    test.info().annotations.push({ type: 'suspicious', description: suspiciousLines.length ? suspiciousLines.join(', ') : '(none found)' });

    // Chụp screenshot để đối chiếu trực quan với ảnh gốc user gửi.
    await page.screenshot({ path: 'test-results/mobile-case1-israel-switzerland.png', fullPage: false });

    expect(suspiciousLines, `BUG trên MOBILE: phát hiện raw key chưa dịch: ${suspiciousLines.join(', ')}`).toEqual([]);
  });

  test('Case 2 — quét toàn bộ trận trong giải "WC Women qualification(UEFA)" tìm raw key trên mobile', async ({ page, request }) => {
    // Lấy danh sách trận THẬT từ chính trang competition (đã xác nhận hoạt
    // động), thay vì đoán route API list-events (nhiều route đã thử đều 404).
    await page.goto('https://staging.uniscore.vn/en/football/competition/wc-womens-qualificationuefa/jy2us9to80p3bmq#list-match', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.waitForTimeout(1000);

    const matchLinks = await page.locator('a[href*="/football/match/"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
    const uniqueLinks = [...new Set(matchLinks)];
    test.info().annotations.push({ type: 'match-links-found', description: `${uniqueLinks.length} trận tìm thấy trong giải` });
    test.skip(uniqueLinks.length === 0, 'Không tìm thấy link trận nào trong trang competition, bỏ qua');

    const localeRes = await request.get('https://opta-api.uniscore.vn/api/v2/locale/en?language=en');
    const localeBody = await localeRes.json();
    const localeDict = localeBody.data ?? {};

    const bugFound: string[] = [];
    const checkedStages: string[] = [];

    for (const link of uniqueLinks.slice(0, 20)) {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
      await page.waitForTimeout(800);

      const bodyText = await page.locator('main').first().innerText().catch(() => '');
      const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean);
      const suspiciousLines = lines.filter((l) => looksLikeRawKey(l));

      // Dòng ngay trước dòng raw key (nếu có) thường là tên giải — ghi lại
      // để biết chính xác stage nào đang lỗi, phục vụ đối chiếu nhanh.
      const stageLine = lines.find((l) => !looksLikeRawKey(l) && (l.includes('Leg') || l.includes('Final') || l.includes('Group') || l.includes('Round')));
      if (stageLine) checkedStages.push(`${link.split('/').pop()}: "${stageLine}"`);

      if (suspiciousLines.length > 0) {
        bugFound.push(`${link} — raw key: ${suspiciousLines.join(',')}`);
        await page.screenshot({ path: `test-results/mobile-bug-found-${link.split('/').pop()}.png` });
      }
    }

    test.info().annotations.push({ type: 'checked-stages', description: checkedStages.join(' | ') });
    test.info().annotations.push({ type: 'scan-result', description: `Quét ${Math.min(uniqueLinks.length, 20)} trận, phát hiện ${bugFound.length} case lộ raw key. ${bugFound.join(' || ')}` });

    expect(bugFound, `BUG trên MOBILE: ${bugFound.length}/${Math.min(uniqueLinks.length, 20)} trận hiển thị raw key chưa dịch: ${bugFound.join(' | ')}`).toEqual([]);
  });

  /**
   * Quét diện rộng trên MOBILE — tương đương spec 04 nhưng chạy với device
   * emulation mobile, để tìm MỌI trận đang lộ raw key ở layout mobile, không
   * giới hạn 2 case đã biết.
   */
  test('Quét diện rộng MOBILE — nhiều trận ngẫu nhiên, tìm raw key chưa dịch', async ({ page, request }) => {
    // Ngày hôm nay theo giờ VN (UTC+7) — để test tự chạy được mỗi ngày trên cron,
    // không hardcode 1 ngày cố định đã qua.
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const todayRes = await request.post(`https://opta-api.uniscore.vn/api/v2/sport/football/scheduled-events-pagination-v2/${today}/locale/VN/type/all?language=en`, { data: {} });
    const todayBody = await todayRes.json();
    const events = (todayBody?.data?.events ?? []).slice(0, 10);
    test.skip(events.length === 0, 'Không có trận nào hôm nay trên staging để quét, bỏ qua');

    const localeRes = await request.get('https://opta-api.uniscore.vn/api/v2/locale/en?language=en');
    const localeBody = await localeRes.json();
    const localeDict = localeBody.data ?? {};

    const bugFound: string[] = [];

    for (const ev of events) {
      if (!ev.slug || !ev.id) continue;
      const matchUrl = `https://staging.uniscore.vn/en/football/match/${ev.slug}/${ev.id}`;
      await page.goto(matchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
      await page.waitForTimeout(1000);

      const eventDetailRes = await request.get(`${NESTJS_API}/event/${ev.id}?language=en`);
      const eventDetailBody = await eventDetailRes.json().catch(() => null);
      const stageInfo = eventDetailBody?.data?.event?.stageInfo;
      if (!stageInfo?.nameKey) continue;

      const hasTranslation = stageInfo.nameKey in localeDict;

      const bodyText = await page.locator('main').first().innerText().catch(() => '');
      const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean);
      const suspiciousLines = lines.filter((l) => looksLikeRawKey(l));

      if (suspiciousLines.length > 0) {
        bugFound.push(`${matchUrl} — raw key trên MOBILE: ${suspiciousLines.join(',')} (nameKey="${stageInfo.nameKey}", có bản dịch: ${hasTranslation})`);
      }
    }

    test.info().annotations.push({ type: 'scan-result-mobile', description: `Quét ${events.length} trận trên MOBILE, phát hiện ${bugFound.length} case. ${bugFound.join(' || ')}` });
    expect(bugFound, `BUG trên MOBILE: ${bugFound.length} trận hiển thị raw key chưa dịch`).toEqual([]);
  });
});
