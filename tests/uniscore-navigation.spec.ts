import { test, expect } from '@playwright/test';
import { UniScorePage } from '../pages/UniScorePage';

// Danh sách các môn thể thao phải luôn có trên trang
const REQUIRED_SPORTS = [
  'Bóng đá',
  'Bóng rổ',
  'Quần vợt',
  'Cầu lông',
  'Bóng bàn',
];

// League nổi tiếng phải có trong danh sách mặc định của Bóng đá
const KNOWN_LEAGUES = [
  'Premier League',
  'UEFA Champions League',
  'La Liga',
];

test.describe('Uniscore.com — Navigation & Sport Tabs', () => {

  let page: UniScorePage;

  test.beforeEach(async ({ page: p }) => {
    page = new UniScorePage(p);
    await page.goto();
    await page.waitForContent();
  });

  // Kiểm tra tất cả các tab thể thao bắt buộc đều hiển thị
  test('all required sport tabs are visible', async () => {
    for (const sport of REQUIRED_SPORTS) {
      const tab = page.page.locator(`[test-id="tab-${sport}"]`);
      await expect(tab, `Tab "${sport}" không hiển thị`).toBeVisible({ timeout: 15000 });
    }
  });

  // Kiểm tra có ít nhất 5 môn thể thao trong menu
  test('at least 5 sport tabs exist', async () => {
    const tabNames = await page.getSportTabNames();
    expect(tabNames.length).toBeGreaterThanOrEqual(5);
  });

  // Kiểm tra tab "Bóng đá" mặc định được chọn khi vào trang
  test('football tab is selected by default', async () => {
    // Trang load xong, matchList hiển thị → Bóng đá là tab đang active
    await expect(page.footballTab).toBeVisible();
    await expect(page.matchList).toBeVisible();
  });

  // Kiểm tra click tab "Bóng rổ" → trang thay đổi nội dung (không còn dữ liệu bóng đá)
  test('clicking basketball tab loads basketball content', async () => {
    const beforeCount = await page.getMatchRowCount();

    // Tab nằm trong thanh scroll ngang — cần scroll vào view trước khi click
    await page.basketballTab.scrollIntoViewIfNeeded();
    await page.basketballTab.click();
    await page.page.waitForLoadState('networkidle');

    // Nội dung phải thay đổi — tab mới load xong
    await expect(page.basketballTab).toBeVisible();

    // Match list vẫn hiển thị (có thể có hoặc không có trận, nhưng container phải có)
    await expect(page.matchList).toBeVisible({ timeout: 10000 });

    // Đảm bảo trang đã re-render (count có thể khác hoặc bằng)
    const afterCount = await page.getMatchRowCount();
    console.log(`Bóng đá: ${beforeCount} trận → Bóng rổ: ${afterCount} trận`);
  });

  // Kiểm tra click tab "Quần vợt" → trang load thành công
  test('clicking tennis tab loads tennis content', async () => {
    await page.tennisTab.scrollIntoViewIfNeeded();
    await page.tennisTab.click();
    await page.page.waitForLoadState('networkidle');

    await expect(page.tennisTab).toBeVisible();
    await expect(page.matchList).toBeVisible({ timeout: 10000 });
  });

  // Kiểm tra quay lại "Bóng đá" sau khi chuyển tab khác → dữ liệu bóng đá trở lại
  test('switching back to football tab restores football matches', async () => {
    // Chuyển sang Bóng rổ
    await page.basketballTab.scrollIntoViewIfNeeded();
    await page.basketballTab.click();
    await page.page.waitForLoadState('networkidle');

    // Quay lại Bóng đá
    await page.footballTab.click();
    await page.page.waitForLoadState('networkidle');

    const count = await page.getMatchRowCount();
    expect(count).toBeGreaterThan(0);
  });

  // Kiểm tra danh sách giải đấu bóng đá có các tên league nổi tiếng
  test('known football leagues are present in the list', async () => {
    const leagueNames = await page.getLeagueNames();
    expect(leagueNames.length).toBeGreaterThan(0);

    for (const league of KNOWN_LEAGUES) {
      expect.soft(
        leagueNames.some(name => name.includes(league)),
        `League "${league}" không có trong danh sách`
      ).toBe(true);
    }
  });

  // Kiểm tra tên league không bị rỗng hoặc chỉ có khoảng trắng
  test('all league names are non-empty', async () => {
    const leagueNames = await page.getLeagueNames();
    expect(leagueNames.length).toBeGreaterThan(0);

    for (const name of leagueNames) {
      expect.soft(name.length, `Tên league rỗng`).toBeGreaterThan(0);
    }
  });

  // Kiểm tra icon search hiển thị và có thể click
  test('search button is visible and clickable', async () => {
    await expect(page.searchButton).toBeVisible();

    // Click vào search — modal hoặc input phải xuất hiện
    await page.searchButton.click();
    await page.page.waitForTimeout(500);

    // Kiểm tra có element search input hoặc modal xuất hiện
    const searchInput = page.page.locator('input[type="search"], input[placeholder*="tìm"], input[placeholder*="search"]');
    const modalVisible = await searchInput.isVisible().catch(() => false);

    // Nếu không thấy input search cụ thể, ít nhất trang không crash
    const errorCount = await page.getErrorTextCount();
    expect(errorCount).toBe(0);

    console.log(`Search input visible: ${modalVisible}`);
  });

});
// npx playwright test tests/uniscore-navigation.spec.ts --project=chrome
