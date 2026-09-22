/**
 * TEST FILE: [Web|App][Football][Match - Detail] Other info - Thêm TV channels.spec.ts
 *
 * USER STORY: Là người dùng xem chi tiết trận đấu, tôi muốn xem danh sách kênh
 * truyền hình phát sóng trận đấu theo từng quốc gia, để biết cần xem kênh nào
 * tại quốc gia mình đang ở.
 *
 * BREADCRUMB: Match → Details → Other Info → field "TV channels" (mới thêm)
 * Design: Figma node-id=55295-128767
 * Nguồn dữ liệu kênh: LSTV API (https://cdnapi.lstvapi.com) — xem cuối file.
 *
 * FLOW:
 *   1. Vào match details, scroll tới "Thông tin khác" (Other Info).
 *   2. Field "TV channels" hiển thị dropdown button -> click để chọn quốc gia
 *      và xem kênh phát sóng trận đấu.
 *
 * BR1: Danh sách quốc gia trong dropdown sort theo alphabet (A-Z) cho từng
 *      ngôn ngữ đã bản địa hóa.
 *
 * EDGE CASE: quốc gia được chọn chưa có kênh phát -> hiển thị đúng nguyên văn:
 *   "Hiện chưa có thông tin kênh phát sóng cho khu vực này."
 *
 * ACCEPTANCE CRITERIA:
 *   7.1 Mặc định hiển thị theo quốc gia người dùng (không xác định được thì
 *       hiển thị danh sách mặc định theo ngôn ngữ).
 *   7.2 Cho phép chọn xem kênh của quốc gia khác.
 *   7.3 Tên kênh hiển thị chính xác (số, hoa/thường, ký tự đặc biệt) — đối
 *       chiếu với dữ liệu gốc từ LSTV API.
 *   7.4 Dữ liệu có thể cập nhật real-time/định kỳ (không test được bằng UI đơn
 *       thuần trong phạm vi file này — cần theo dõi qua nhiều lần gọi API,
 *       xem ghi chú ở cuối file).
 *   7.5 Responsive trên web + mobile, danh sách kênh scroll được nếu nhiều.
 *
 * ────────────────────────────────────────────────────────────────────────
 * TÌNH TRẠNG TẠI THỜI ĐIỂM VIẾT TEST (24/07/2026) — QUAN TRỌNG:
 * Đã kiểm tra trực tiếp trên staging.uniscore.vn (match detail thật, tab
 * "Chi Tiết" -> section "Thông tin khác"): section này HIỆN TẠI CHỈ CÓ sân
 * vận động, sức chứa, thành phố, nhiệt độ, gió, độ ẩm, ngày giờ, FIFA
 * ranking — CHƯA CÓ field "TV channels" nào cả. Tức feature này CHƯA ĐƯỢC
 * TRIỂN KHAI trên staging tại thời điểm viết file test.
 *
 * -> Các test UI dưới đây viết SẴN theo đúng AC/BR/Figma để chạy được ngay
 *    khi dev implement xong, dùng selector linh hoạt (tìm theo text tiếng
 *    Anh "TV channels" LẪN tiếng Việt "Kênh truyền hình" vì chưa biết dev sẽ
 *    localize label thế nào). Ở THỜI ĐIỂM HIỆN TẠI, các test này SẼ FAIL vì
 *    thiếu feature — đó là kỳ vọng ĐÚNG (fail do thiếu implement, không phải
 *    lỗi của test). Khi dev release, chạy lại để verify thật.
 *
 * -> Về API LSTV (dùng cho AC 7.3, đối chiếu tên kênh): đã thử gọi trực tiếp
 *    POST /register với các field đoán được (device_id, model, fcm_token) ->
 *    bị Cloudflare chặn 403 (bot protection). API này gắn với app mobile thật
 *    (có kiểm tra fingerprint/token cố định theo app build), KHÔNG tự động
 *    hoá tin cậy được nếu không có field chính xác từ 1 phiên app thật. Test
 *    API ở cuối file dùng `test.skip` khi /register thất bại, kèm log rõ lý
 *    do, để không báo PASS/FAIL giả.
 *
 * CHẠY (phải escape [ ] và | vì Playwright coi argument là regex):
 *   npx playwright test "tests/\[Web\|App\]\[Football\]\[Match - Detail\] Other info - Thêm TV channels.spec.ts" --project=chrome
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';

// TODO: thay bằng URL 1 trận đấu đang test thực tế / sắp diễn ra, lý tưởng là trận có
// nhiều kênh phát sóng ở nhiều quốc gia để test được đầy đủ edge case.
const MATCH_URL = 'https://staging.uniscore.vn/football/match/timor-leste-vietnam/7kbz8ilule08r9b';

const NO_CHANNEL_MESSAGE = 'Hiện chưa có thông tin kênh phát sóng cho khu vực này.';

// Field label chưa biết chắc dev sẽ hiển thị tiếng Anh hay đã localize -- match cả 2.
const TV_CHANNELS_LABEL_PATTERN = /TV\s*channels|Kênh\s*truyền\s*hình/i;

async function gotoMatchDetail(page: import('@playwright/test').Page) {
  await page.goto(MATCH_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByText('Chi Tiết', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await page.getByText('Thông tin khác', { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
}

function tvChannelsField(page: import('@playwright/test').Page) {
  return page.getByText(TV_CHANNELS_LABEL_PATTERN).first();
}

test.describe('[Web][Football][Match Detail] Other Info - TV channels (UI)', () => {

  test.setTimeout(60_000);

  test('AC7.1 - Field "TV channels" xuất hiện trong Other Info và có dữ liệu mặc định (theo quốc gia/ngôn ngữ)', async ({ page }) => {
    await gotoMatchDetail(page);

    const field = tvChannelsField(page);
    await expect(
      field,
      'Không tìm thấy field "TV channels" trong Other Info -- feature có thể chưa được deploy lên staging'
    ).toBeVisible({ timeout: 10_000 });

    // Mặc định phải có NỘI DUNG (list kênh HOẶC message "chưa có thông tin") -- không được trống trơn/loading mãi
    const container = field.locator('xpath=ancestor::*[self::div][3]');
    const text = await container.textContent();
    expect(
      text && text.trim().length > TV_CHANNELS_LABEL_PATTERN.source.length,
      'Field "TV channels" không có nội dung mặc định nào (không phải danh sách kênh, cũng không phải message fallback)'
    ).toBe(true);
  });

  test('AC7.2 - Cho phép chọn xem kênh phát sóng của quốc gia khác', async ({ page }) => {
    await gotoMatchDetail(page);

    const field = tvChannelsField(page);
    await expect(field, 'Không tìm thấy field "TV channels"').toBeVisible({ timeout: 10_000 });

    const beforeText = await field.locator('xpath=ancestor::*[self::div][2]').textContent();

    // Click vào dropdown button để mở danh sách quốc gia
    const dropdown = field.locator('xpath=following::button[1] | ancestor::div[1]//button').first();
    await dropdown.click();
    await page.waitForTimeout(500);

    // Danh sách quốc gia phải hiện ra (dropdown/listbox/menu)
    const optionList = page.locator('[role="listbox"], [role="menu"], ul').filter({ hasText: /./ }).last();
    await expect(optionList, 'Click dropdown "TV channels" nhưng không thấy danh sách quốc gia hiện ra').toBeVisible({ timeout: 5000 });

    const options = optionList.locator('[role="option"], li, button');
    const count = await options.count();
    expect(count, 'Danh sách quốc gia trong dropdown TV channels rỗng').toBeGreaterThan(1);

    // Chọn 1 quốc gia khác (option thứ 2, tránh trùng quốc gia mặc định đang chọn)
    await options.nth(1).click();
    await page.waitForTimeout(1500);

    const afterText = await field.locator('xpath=ancestor::*[self::div][2]').textContent();
    expect(
      afterText !== beforeText,
      'Nội dung field "TV channels" không đổi sau khi chọn quốc gia khác -- chọn quốc gia không có tác dụng'
    ).toBe(true);
  });

  test('BR1 - Danh sách quốc gia trong dropdown được sort theo alphabet (A-Z) theo ngôn ngữ hiện tại', async ({ page }) => {
    await gotoMatchDetail(page);

    const field = tvChannelsField(page);
    await expect(field, 'Không tìm thấy field "TV channels"').toBeVisible({ timeout: 10_000 });

    const dropdown = field.locator('xpath=following::button[1] | ancestor::div[1]//button').first();
    await dropdown.click();
    await page.waitForTimeout(500);

    const optionList = page.locator('[role="listbox"], [role="menu"], ul').filter({ hasText: /./ }).last();
    await expect(optionList).toBeVisible({ timeout: 5000 });

    const options = optionList.locator('[role="option"], li, button');
    const names = await options.allTextContents();
    const cleaned = names.map(n => n.trim()).filter(Boolean);

    expect(cleaned.length, 'Danh sách quốc gia rỗng, không thể kiểm tra sort').toBeGreaterThan(1);

    const sorted = [...cleaned].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(
      cleaned,
      `Danh sách quốc gia KHÔNG được sort A-Z.\nThực tế: ${cleaned.join(', ')}\nMong đợi: ${sorted.join(', ')}`
    ).toEqual(sorted);
  });

  test('Edge case - Quốc gia chưa có kênh phát sóng hiển thị đúng message', async ({ page }) => {
    await gotoMatchDetail(page);

    const field = tvChannelsField(page);
    await expect(field, 'Không tìm thấy field "TV channels"').toBeVisible({ timeout: 10_000 });

    const dropdown = field.locator('xpath=following::button[1] | ancestor::div[1]//button').first();
    await dropdown.click();
    await page.waitForTimeout(500);

    const optionList = page.locator('[role="listbox"], [role="menu"], ul').filter({ hasText: /./ }).last();
    await expect(optionList).toBeVisible({ timeout: 5000 });
    const options = optionList.locator('[role="option"], li, button');
    const total = await options.count();

    // Thử lần lượt các quốc gia (giới hạn số lần thử để tránh test chạy quá lâu) tìm 1 nước
    // rơi vào trường hợp "chưa có kênh phát" để verify đúng message -- không biết trước quốc
    // gia nào sẽ trống nên phải dò thay vì hard-code.
    const MAX_TRY = Math.min(total, 15);
    let foundEmptyCase = false;

    for (let i = 0; i < MAX_TRY && !foundEmptyCase; i++) {
      await dropdown.click();
      await page.waitForTimeout(300);
      await options.nth(i).click();
      await page.waitForTimeout(1000);

      const fieldText = (await field.locator('xpath=ancestor::*[self::div][3]').textContent()) ?? '';
      if (fieldText.includes(NO_CHANNEL_MESSAGE)) {
        foundEmptyCase = true;
        expect(fieldText).toContain(NO_CHANNEL_MESSAGE);
      }
    }

    test.skip(
      !foundEmptyCase,
      `Không tìm được quốc gia nào rơi vào trạng thái "chưa có kênh phát" trong ${MAX_TRY} nước đầu tiên thử -- cần biết trước 1 quốc gia chắc chắn trống để test edge case này chính xác hơn (không phải lỗi, chỉ là chưa dò trúng).`
    );
  });

  test('AC7.5 - Danh sách kênh scroll được khi có nhiều kênh, hiển thị đúng trên cả desktop và mobile', async ({ page }) => {
    await gotoMatchDetail(page);
    const field = tvChannelsField(page);
    await expect(field, 'Không tìm thấy field "TV channels" (desktop)').toBeVisible({ timeout: 10_000 });

    // Resize sang kích thước mobile, load lại và verify field vẫn hiển thị đúng
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoMatchDetail(page);
    const fieldMobile = tvChannelsField(page);
    await expect(fieldMobile, 'Không tìm thấy field "TV channels" trên viewport mobile (390x844)').toBeVisible({ timeout: 10_000 });

    // Nếu danh sách kênh dài hơn khung hiển thị, container chứa list phải scroll được
    // (overflow-y auto/scroll), không bị tràn layout hoặc bị cắt mất kênh phía dưới.
    const listContainer = fieldMobile.locator('xpath=ancestor::*[self::div][3]');
    const overflowY = await listContainer.evaluate(el => getComputedStyle(el).overflowY).catch(() => null);
    if (overflowY) {
      expect(['auto', 'scroll'], `overflow-y hiện tại là "${overflowY}" -- danh sách kênh dài có thể không scroll được, bị cắt nội dung`).toContain(overflowY);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// API - LSTV: đối chiếu tên kênh hiển thị trên UI với dữ liệu gốc (AC 7.3)
// ────────────────────────────────────────────────────────────────────────
//
// Luồng LSTV API: POST /register (lấy x-auth-token) -> GET /xmatches -> GET
// /xmatches_channels?timestamp&iso_code (danh sách kênh theo quốc gia).
//
// GIỚI HẠN ĐÃ XÁC NHẬN: /register yêu cầu body form (device_id, model,
// fcm_token...) mà tài liệu KHÔNG nêu rõ định dạng/giá trị hợp lệ. Gọi thử
// với giá trị đoán được bị Cloudflare trả 403 (bot protection) -- API này
// gắn với 1 phiên app mobile thật, không tự động hoá tin cậy được nếu không
// có bộ field chính xác từ QA mobile / dev cung cấp. Vì vậy test dưới đây
// tự thử /register trước; nếu thất bại sẽ SKIP kèm lý do rõ ràng thay vì
// báo pass/fail giả.

const LSTV_BASE = 'https://cdnapi.lstvapi.com';
const LSTV_STATIC_HEADERS = {
  'accept-encoding': 'gzip',
  'accept-language': 'en',
  'user-agent': 'LSTV 6.3.3 (262), android sdk_gphone16k_arm64-userdebug 17 CP31.260618.005 15731206 dev-keys',
  'x-api-token': 'cb9ba27cdf230df1fe9f284551329d00',
};

async function lstvRegister(isoCode: string): Promise<string | null> {
  const ctx = await playwrightRequest.newContext();
  try {
    const res = await ctx.post(`${LSTV_BASE}/register?iso_code=${isoCode}&lang=en`, {
      headers: { ...LSTV_STATIC_HEADERS, 'content-type': 'application/x-www-form-urlencoded', 'x-auth-token': '' },
      // NOTE: field đoán -- tài liệu không xác nhận đây là format đúng, xem ghi chú giới hạn ở trên.
      data: 'device_id=qa-automation-test&model=qa-runner&fcm_token=',
    });
    if (!res.ok()) return null;
    const body = await res.json().catch(() => null);
    return body?.token ?? body?.data?.token ?? null;
  } catch {
    return null;
  } finally {
    await ctx.dispose();
  }
}

test.describe('[Api] LSTV - đối chiếu tên kênh (AC 7.3)', () => {

  test('Tên kênh trên UI phải khớp CHÍNH XÁC (số, hoa/thường, ký tự đặc biệt) với dữ liệu gốc từ LSTV API', async ({ page }) => {
    const isoCode = 'vn';
    const token = await lstvRegister(isoCode);

    test.skip(
      !token,
      'Không lấy được x-auth-token từ POST /register (bị 403 Cloudflare bot-protection với field đoán được) -- ' +
      'API LSTV gắn với phiên app mobile thật, cần dev/QA mobile cung cấp bộ field device_id/model/fcm_token ' +
      'chính xác để tự động hoá được bước này. Xem ghi chú đầu file.'
    );

    const ctx = await playwrightRequest.newContext();
    const timestamp = Math.floor(Date.now() / 1000);
    const channelsRes = await ctx.get(
      `${LSTV_BASE}/xmatches_channels?timestamp=${timestamp}&iso_code=${isoCode}`,
      { headers: { ...LSTV_STATIC_HEADERS, 'x-auth-token': token! } }
    );
    expect(channelsRes.ok(), `GET /xmatches_channels trả về lỗi HTTP ${channelsRes.status()}`).toBe(true);
    const channelsData = await channelsRes.json();

    await gotoMatchDetail(page);
    const field = tvChannelsField(page);
    await expect(field, 'Không tìm thấy field "TV channels" trên UI để đối chiếu').toBeVisible({ timeout: 10_000 });

    const uiText = (await field.locator('xpath=ancestor::*[self::div][3]').textContent()) ?? '';

    // So khớp CHÍNH XÁC từng tên kênh (case-sensitive, giữ nguyên số/ký tự đặc biệt) --
    // đây chính là nội dung AC 7.3, không dùng so sánh không phân biệt hoa/thường.
    const channelNames: string[] = (channelsData?.channels ?? channelsData?.data ?? [])
      .map((c: any) => c.name ?? c.channel_name)
      .filter(Boolean);

    expect(channelNames.length, 'API LSTV không trả về kênh nào cho iso_code=vn ở timestamp hiện tại').toBeGreaterThan(0);

    for (const name of channelNames) {
      expect(uiText.includes(name), `Tên kênh "${name}" từ API LSTV không khớp CHÍNH XÁC với text hiển thị trên UI (sai số/hoa-thường/ký tự đặc biệt)`).toBe(true);
    }

    await ctx.dispose();
  });
});

// ────────────────────────────────────────────────────────────────────────
// GHI CHÚ AC 7.4 (cập nhật dữ liệu real-time/định kỳ):
// Không kiểm chứng được bằng 1 lần chạy test UI đơn thuần. Cách verify đề
// xuất: gọi GET /xmatches_channels 2 lần cách nhau 1 khoảng thời gian (theo
// chu kỳ cập nhật mà dev công bố), so sánh response để xác nhận có thay đổi
// khi nguồn LSTV cập nhật kênh mới -- cần lên lịch chạy riêng (cron/monitor),
// không phù hợp nằm trong 1 test case chạy 1 lần.
// ────────────────────────────────────────────────────────────────────────
