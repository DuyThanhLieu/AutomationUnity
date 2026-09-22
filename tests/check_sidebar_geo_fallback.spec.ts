/**
 * TEST FILE: check_sidebar_geo_fallback.spec.ts
 *
 * ĐÍNH CHÍNH (quan trọng): phiên bản đầu của file này từng kết luận "sidebar
 * kẹt loading skeleton vĩnh viễn khi api.unik8s.com/country/alpha2 lỗi" —
 * KẾT LUẬN ĐÓ SAI, do chính hàm detect nội dung sidebar bị lỗi 2 chỗ:
 *   1. So sánh case-sensitive với 'Giải Đấu Nổi Bật' (viết hoa), trong khi
 *      DOM thật chứa chữ THƯỜNG 'giải đấu nổi bật' — phần viết hoa chỉ là
 *      CSS `text-transform: capitalize` lúc hiển thị, không có trong text
 *      thật -> so sánh không bao giờ khớp được.
 *   2. Đếm số thẻ <img> để coi là "đã có nội dung", nhưng icon giải đấu thật
 *      render bằng <svg>, không phải <img> -> đếm luôn ra gần 0.
 * Do 2 lỗi cộng lại, hàm cũ LUÔN trả về false dù trang có load đúng hay
 * không -> toàn bộ 3 test (kể cả BASELINE không giả lập gì) đều fail giả.
 * Verify lại bằng cách sửa đúng: khi giả lập api.unik8s.com abort y hệt cũ,
 * sidebar VẪN hiển thị đầy đủ (link + icon svg) -> KHÔNG có bug thiếu
 * fallback như đã báo nhầm trước đó.
 *
 * FILE NÀY GIỮ LẠI ĐỂ:
 *   - Làm bằng chứng/tài liệu cho việc đã test trường hợp geo API lỗi.
 *   - Dùng cách giả lập lỗi (route interception) này cho các lần test sau,
 *     với hàm detect đã sửa đúng.
 *
 * CHẠY:
 *   npx playwright test tests/check_sidebar_geo_fallback.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'https://staging.uniscore.vn';
const GEO_API_PATTERN = '**/api.unik8s.com/api/v1/country/alpha2**';

/** Sidebar "Giải Đấu Nổi Bật" đã có nội dung thật (≥3 link giải, có icon svg) chưa, hay vẫn là skeleton rỗng */
const SIDEBAR_HAS_CONTENT = () => {
  const all = Array.from(document.querySelectorAll('*'));
  const heading = all.find(
    el => el.textContent!.trim().toLowerCase() === 'giải đấu nổi bật' && el.children.length === 0
  );
  if (!heading) return false;
  let container: Element | null = heading.parentElement;
  for (let i = 0; i < 6 && container; i++) container = container.parentElement;
  if (!container) return false;
  return container.querySelectorAll('a').length >= 3 && container.querySelectorAll('svg').length >= 3;
};

test.describe('Sidebar Giải Đấu Nổi Bật — hành vi khi geo API (api.unik8s.com) lỗi', () => {

  test.setTimeout(60_000);

  test('[SIMULATE FAIL] geo API abort ngay lập tức -> sidebar vẫn phải hiển thị được danh sách (không kẹt loading mãi)', async ({ page }) => {
    await page.route(GEO_API_PATTERN, (route) => route.abort('failed'));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(15_000); // đợi lâu hơn timeout thường gặp của API lỗi (đã đo thực tế ~10s)

    const hasContent = await page.evaluate(SIDEBAR_HAS_CONTENT);
    await page.screenshot({ path: 'results/sidebar-geo-fail-abort.png' });

    expect(
      hasContent,
      'Sidebar "Giải Đấu Nổi Bật" bị kẹt loading skeleton khi api.unik8s.com/country/alpha2 fail — thiếu fallback/timeout handling'
    ).toBe(true);
  });

  test('[SIMULATE TIMEOUT] geo API treo lâu (giả lập giống lúc đo thực tế >10s) -> sidebar vẫn phải fallback', async ({ page }) => {
    // giả lập đúng như log thật: request không trả lời luôn, treo (không abort, không response)
    await page.route(GEO_API_PATTERN, () => new Promise(() => {})); // never resolves

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(15_000);

    const hasContent = await page.evaluate(SIDEBAR_HAS_CONTENT);
    await page.screenshot({ path: 'results/sidebar-geo-timeout.png' });

    expect(
      hasContent,
      'Sidebar "Giải Đấu Nổi Bật" bị kẹt loading skeleton khi api.unik8s.com/country/alpha2 treo lâu (giống hệt lỗi thật đo được: timeout >10s) — thiếu fallback/timeout handling'
    ).toBe(true);
  });

  test('[BASELINE] geo API hoạt động bình thường -> sidebar phải load được (đối chứng, không giả lập lỗi)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(10_000);

    const hasContent = await page.evaluate(SIDEBAR_HAS_CONTENT);
    await page.screenshot({ path: 'results/sidebar-geo-baseline.png' });

    expect(
      hasContent,
      'Sidebar không load được dù KHÔNG giả lập lỗi gì'
    ).toBe(true);
  });
});
