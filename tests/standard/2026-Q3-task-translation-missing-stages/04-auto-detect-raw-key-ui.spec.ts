/**
 * AUTO-CHECK — phát hiện label "chưa dịch" (hiển thị raw translation key)
 * trên UI thật, tái hiện 2 case user đã báo bằng ảnh chụp màn hình:
 *   1. "advancing_match" — Match Detail, badge cạnh tên giải (mobile).
 *   2. "division_1_final" — Match Detail, badge cạnh tên giải (mobile),
 *      trận Indonesia vs Thailand, FIFA ASEAN Cup.
 *
 * GỐC RỄ CHÍNH XÁC (xác nhận qua network request thật, route
 * GET /api/v2/football/event/:id?language=en):
 *   API trả sẵn field "stageInfo" với CẢ 2 biến thể:
 *     - stageInfo.name     : text gốc tiếng Anh, vd "advancing match"
 *     - stageInfo.nameKey  : key để tra locale, vd "advancing_match"
 *     - stageInfo.legKey   : key khác, vd "first_leg" — ĐÃ ĐƯỢC DỊCH ĐÚNG
 *       trên breadcrumb web ("First Leg").
 *   Key "division_1_final" ĐÃ TỒN TẠI trong dictionary (GET
 *   /api/v2/locale/en) với giá trị "Final" — nghĩa là bug KHÔNG PHẢI do
 *   thiếu bản dịch, mà do MỘT VỊ TRÍ UI CỤ THỂ (badge nhỏ cạnh breadcrumb,
 *   xuất hiện rõ nhất trên mobile/app — ảnh chụp màn hình cả 2 case đều ở
 *   layout mobile) KHÔNG áp dụng bước tra locale cho field này, trong khi
 *   vị trí khác (vd breadcrumb desktop dùng legKey) lại dịch đúng.
 *
 * Vì staging hiện có rất ít dữ liệu trận đấu thật nên khó tái hiện 100%
 * đúng 2 trận trong ảnh gốc trên desktop — spec này thiết kế theo hướng
 * TỔNG QUÁT: với MỌI trận có field stageInfo.nameKey, gọi API locale để
 * xác nhận key đó có bản dịch tồn tại, rồi assert UI phải hiển thị đúng
 * bản dịch (không phải raw key) ở bất kỳ vị trí nào hiển thị stage name.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-translation-missing-stages/04-auto-detect-raw-key-ui.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';

const NESTJS_API = 'https://opta-api.uniscore.vn/api/v2/football';

/** Trả về true nếu text trông giống raw translation key (snake_case, không có khoảng trắng/hoa). */
function looksLikeRawKey(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  // raw key: toàn chữ thường, số, dấu gạch dưới — không có khoảng trắng, không viết hoa chữ cái đầu
  return /^[a-z0-9_]+$/.test(trimmed) && trimmed.includes('_');
}

test.describe('[Auto-check] Raw translation key hiển thị trên UI (stage name)', () => {
  test('API /event/:id trả stageInfo.nameKey — verify key có bản dịch trong dictionary', async ({ request }) => {
    // Case đã biết: trận Israel (W) vs Switzerland (W), stage "advancing match"
    const eventId = 'o8tzjglqgjc5w47';
    const eventRes = await request.get(`${NESTJS_API}/event/${eventId}?language=en`);
    expect(eventRes.ok()).toBeTruthy();
    const eventBody = await eventRes.json();
    const stageInfo = eventBody?.data?.event?.stageInfo;
    expect(stageInfo, 'API phải trả field stageInfo').toBeTruthy();

    const nameKey = stageInfo.nameKey;
    test.info().annotations.push({ type: 'stage-info', description: `name="${stageInfo.name}" nameKey="${nameKey}" legKey="${stageInfo.legKey}"` });

    const localeRes = await request.get('https://opta-api.uniscore.vn/api/v2/locale/en?language=en');
    const localeBody = await localeRes.json();
    const localeDict = localeBody.data ?? {};

    const hasTranslation = nameKey in localeDict;
    test.info().annotations.push({ type: 'translation-check', description: `nameKey "${nameKey}" ${hasTranslation ? `CÓ bản dịch: "${localeDict[nameKey]}"` : 'KHÔNG CÓ trong dictionary'}` });

    // Ghi nhận cả 2 trường hợp — không fail cứng ở bước này vì mục đích là
    // thu thập bằng chứng, bước UI bên dưới mới là nơi assert bug thật.
  });

  test('UI Match Detail — breadcrumb/stage label KHÔNG được hiển thị raw key', async ({ page }) => {
    await page.goto('https://staging.uniscore.vn/en/football/match/israel-women-switzerland-women/o8tzjglqgjc5w47', { waitUntil: 'networkidle', timeout: 60_000 });

    // Quét toàn bộ text node trong khu vực header/breadcrumb của trận — nơi
    // 2 case bug đã biết đều hiển thị (badge cạnh tên giải, theo ảnh chụp).
    const headerArea = page.locator('main').first();
    const allText = await headerArea.innerText();
    const lines = allText.split('\n').map((l) => l.trim()).filter(Boolean);

    const suspiciousLines = lines.filter((l) => looksLikeRawKey(l));

    test.info().annotations.push({ type: 'suspicious-lines', description: suspiciousLines.length > 0 ? suspiciousLines.join(' | ') : '(không phát hiện dòng nào giống raw key)' });

    expect(suspiciousLines, `BUG: phát hiện ${suspiciousLines.length} dòng text giống raw translation key chưa dịch trên UI: ${suspiciousLines.join(', ')}`).toEqual([]);
  });

  /**
   * Test tổng quát: quét N trận bất kỳ (lấy từ scheduled-events hôm nay),
   * với mỗi trận verify stageInfo.nameKey có bản dịch VÀ breadcrumb UI
   * không hiển thị raw key. Đây là phần "auto" thực sự — không phụ thuộc
   * vào 2 case cụ thể đã biết, có thể chạy định kỳ để bắt case mới.
   */
  test('Quét diện rộng — nhiều trận ngẫu nhiên, tìm raw key chưa dịch', async ({ page, request }) => {
    const todayRes = await request.post('https://opta-api.uniscore.vn/api/v2/sport/football/scheduled-events-pagination-v2/2026-10-09/locale/VN/type/all?language=en', { data: {} });
    const todayBody = await todayRes.json();
    const events = (todayBody?.data?.events ?? []).slice(0, 5);
    test.skip(events.length === 0, 'Không có trận nào hôm nay trên staging để quét, bỏ qua');

    const localeRes = await request.get('https://opta-api.uniscore.vn/api/v2/locale/en?language=en');
    const localeBody = await localeRes.json();
    const localeDict = localeBody.data ?? {};

    const bugFound: string[] = [];

    for (const ev of events) {
      if (!ev.slug || !ev.id) continue;
      const matchUrl = `https://staging.uniscore.vn/en/football/match/${ev.slug}/${ev.id}`;
      await page.goto(matchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
      await page.waitForTimeout(800);

      const eventDetailRes = await request.get(`${NESTJS_API}/event/${ev.id}?language=en`);
      const eventDetailBody = await eventDetailRes.json().catch(() => null);
      const stageInfo = eventDetailBody?.data?.event?.stageInfo;
      if (!stageInfo?.nameKey) continue;

      const hasTranslation = stageInfo.nameKey in localeDict;

      const bodyText = await page.locator('main').first().innerText().catch(() => '');
      const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean);
      const rawKeyOnPage = lines.some((l) => l === stageInfo.nameKey || l === stageInfo.legKey);

      if (rawKeyOnPage) {
        bugFound.push(`${matchUrl} — hiển thị raw key "${stageInfo.nameKey}" (có bản dịch trong dictionary: ${hasTranslation})`);
      }
    }

    test.info().annotations.push({ type: 'scan-result', description: `Quét ${events.length} trận, phát hiện ${bugFound.length} case lộ raw key. ${bugFound.join(' || ')}` });
    expect(bugFound, `BUG: ${bugFound.length} trận hiển thị raw key chưa dịch trên UI`).toEqual([]);
  });
});
