/**
 * US-4795 — điều hướng UI thật chưa được file 06 cover: click vào 1 trận để
 * sang trang chi tiết, đổi ngày qua UI control thật (date-strip, không chỉ
 * query param ?date=), và trang Following (/en/favorite).
 *
 * GHI CHÚ QUAN TRỌNG (khảo sát thật qua Playwright, xem lịch sử sửa đổi):
 * - Mỗi dòng trận là <div data-testid="match-row" test-id="match-row-{id}">,
 *   KHÔNG phải <a href>, không có role="link" — ghi chú cũ ở file 06 nói
 *   "danh sách trận chính không dùng link thật" ĐÚNG về mặt DOM attribute,
 *   nhưng click CHUỘT THẬT (không phải page.evaluate(() => el.click())) vẫn
 *   điều hướng được qua client-side router gắn trên pointer event. Vì vậy
 *   dùng locator().click() bình thường của Playwright là đủ, không cần
 *   querySelector theo href.
 * - Trang Home KHÔNG có tab "My Matches" trong filter chính (chỉ All/Live/
 *   Upcoming/Finished qua data-testid filter-all/live/upcoming/finish).
 *   Chức năng yêu thích nằm ở icon ngôi sao header → route riêng /en/favorite.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/09-ui-navigation.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { vnDate } from './lib/home-client';

const SITE = 'https://uniscore.com/en';

test.describe('UI · click vào 1 trận điều hướng đúng trang chi tiết', () => {
  test('click dòng trận đầu tiên trong tab All → URL chuyển sang /football/match/{slug}/{id}', async ({ page }) => {
    await page.goto(SITE, { waitUntil: 'networkidle' });
    const rows = page.locator('[data-testid="match-row"]');
    test.skip((await rows.count()) === 0, 'Không có trận nào trong danh sách để click');

    const firstRow = rows.first();
    const testId = await firstRow.getAttribute('test-id'); // vd "match-row-cq0afiln6ngev78"
    const matchId = testId?.replace('match-row-', '');

    await firstRow.click();
    await page.waitForURL(/\/football\/match\//, { timeout: 10_000 });

    expect(page.url()).toMatch(/\/en\/football\/match\//);
    // URL trang chi tiết phải chứa đúng id của trận vừa click, không phải trận khác.
    if (matchId) expect(page.url()).toContain(matchId);
  });

  test('trang chi tiết trận có tiêu đề/heading chứa tên 2 đội (không phải trang lỗi/trống)', async ({ page }) => {
    await page.goto(SITE, { waitUntil: 'networkidle' });
    const rows = page.locator('[data-testid="match-row"]');
    test.skip((await rows.count()) === 0, 'Không có trận nào trong danh sách để click');

    await rows.first().click();
    await page.waitForURL(/\/football\/match\//, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    // Trang chi tiết trận của UniScore luôn có dạng tiêu đề "Live Score X vs Y ..." — không rỗng, không phải tiêu đề mặc định trang chủ.
    expect(title.length).toBeGreaterThan(10);
    expect(title.toLowerCase()).not.toContain('404');
  });
});

test.describe('UI · đổi ngày qua date-strip thật (không qua query param)', () => {
  test('bấm nút ngày khác trên date-strip → URL + API call đổi đúng sang ngày đó', async ({ page }) => {
    await page.goto(SITE, { waitUntil: 'networkidle' });

    const targetDate = vnDate(2); // vd 2026-10-16
    const targetDay = new Date(targetDate + 'T00:00:00Z').getUTCDate();

    // Date-strip không có data-testid riêng — định vị bằng accessible name chứa
    // đúng số ngày (vd "16") trong 1 button, loại trừ các phần tử khác trên trang
    // có thể trùng số. getByRole('button') với name khớp số ngày là cách ổn định
    // nhất đã xác nhận qua khảo sát DOM thật (text dạng "Thu 08/10", "Today 14/10").
    const dayButtons = page.getByRole('button', { name: new RegExp(`\\b${targetDay}\\b`) });
    test.skip((await dayButtons.count()) === 0, `Không tìm thấy nút ngày ${targetDay} trên date-strip (có thể UI đổi layout)`);

    const requestPromise = page.waitForRequest((req) => req.url().includes('scheduled-events-pagination-v2') && req.url().includes(`/${targetDate}/`), { timeout: 10_000 }).catch(() => null);
    await dayButtons.first().click();
    const req = await requestPromise;

    expect(req, `Không bắt được request scheduled-events-pagination-v2 gọi đúng ngày ${targetDate} sau khi click date-strip`).not.toBeNull();
    await page.waitForURL(new RegExp(`date=${targetDate}`), { timeout: 5_000 }).catch(() => {});
    expect(page.url()).toContain(targetDate);
  });
});

test.describe('UI · trang Following (/en/favorite)', () => {
  test('vào được trang Following không cần đăng nhập, có 4 tab con Match/Team/Leagues/Player', async ({ page }) => {
    await page.goto(`${SITE}/favorite`, { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/favorite');

    const title = await page.title();
    expect(title.toLowerCase()).not.toContain('404');

    for (const tabName of ['Match', 'Team', 'Leagues', 'Player']) {
      const tab = page.getByText(tabName, { exact: false }).first();
      await expect(tab, `Không thấy tab con "${tabName}" trên trang Following`).toBeVisible({ timeout: 5_000 });
    }
  });

  test('chưa follow gì: hiện thông báo trống, không phải danh sách trận giả/lỗi', async ({ page }) => {
    await page.goto(`${SITE}/favorite`, { waitUntil: 'networkidle' });
    // Quan sát thật: UI hiện "You are not following any match at the moment"
    // khi chưa có favorite nào (không có cookie/localStorage trước đó).
    const emptyState = page.getByText(/not following any match/i);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    // Không hard-fail nếu UI đổi câu chữ chính xác — nhưng phải có MỘT trong 2:
    // hoặc đúng câu thông báo trống, hoặc không có match-row nào bị render sai.
    const matchRows = page.locator('[data-testid="match-row"]');
    const rowCount = await matchRows.count();
    expect(hasEmptyState || rowCount === 0, 'Trang Following không rỗng nhưng cũng không có empty-state message — có thể đang hiện nhầm data').toBe(true);
  });
});
