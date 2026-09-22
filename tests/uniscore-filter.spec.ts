import { test, expect } from '@playwright/test';
import { UniScorePage } from '../pages/UniScorePage';

// Tất cả trạng thái hợp lệ của một trận đấu
const SCORE_FORMAT   = /^\d+\s*-\s*\d+$/;    // Đang diễn ra: "1 - 0"
const TIME_FORMAT    = /^\d{1,2}:\d{2}$/;     // Sắp tới:     "18:00"
const MINUTE_FORMAT  = /^\d{1,3}'(\+\d+)?$/;  // Phút:        "45'"
const SPECIAL_STATES = /^(HT|AET|PEN|PST|ABD|Canc\.|WO|FT|AP|-)$/i;

function isLiveOrInProgress(value: string): boolean {
  return SCORE_FORMAT.test(value) || MINUTE_FORMAT.test(value)
    || /^(HT|AET|PEN|AP)$/i.test(value);
}

function isUpcoming(value: string): boolean {
  return TIME_FORMAT.test(value) || value === '';
}

function isFinished(value: string): boolean {
  // Bao gồm "" vì một số trận filter Finish có thể đang render lại score
  return value === '' || SCORE_FORMAT.test(value) || /^(AET|PEN|FT|AP)$/i.test(value);
}

test.describe('Uniscore.com — Filter Buttons', () => {

  let page: UniScorePage;

  test.beforeEach(async ({ page: p }) => {
    page = new UniScorePage(p);
    await page.goto();
    await page.waitForContent();
  });

  // Kiểm tra 4 nút filter đều hiển thị đầy đủ trên trang
  test('all 4 filter buttons are visible', async () => {
    await expect(page.filterAll).toBeVisible();
    await expect(page.filterLive).toBeVisible();
    await expect(page.filterUpcoming).toBeVisible();
    await expect(page.filterFinish).toBeVisible();
  });

  // Kiểm tra nút filter có label đúng — accept cả tiếng Việt lẫn tiếng Anh
  // vì trang tự detect ngôn ngữ theo browser locale
  test('filter buttons have correct labels', async () => {
    await expect(page.filterAll).toHaveText(/Tất cả|All/i);
    await expect(page.filterUpcoming).toHaveText(/Sắp tới|Upcoming/i);
    await expect(page.filterFinish).toHaveText(/Kết thúc|Finish|Finished/i);
  });

  // Kiểm tra filter "Live" hiển thị số đếm trận đang diễn ra (vd: "Live3")
  // Số có thể là 0 khi không có trận nào live — chỉ validate format
  test('live filter badge shows a number', async () => {
    const text = await page.filterLive.textContent() ?? '';
    // Text dạng "Live" hoặc "Live3", "Live12"
    expect(text).toMatch(/^Live\d*$/i);
  });

  // Kiểm tra click "Tất cả" → danh sách trận vẫn hiển thị đầy đủ
  test('filter All shows match list', async () => {
    await page.filterAll.click();
    await page.page.waitForLoadState('networkidle');

    const count = await page.getMatchRowCount();
    expect(count).toBeGreaterThan(0);
  });

  // Kiểm tra click "Live" → chỉ hiển thị trận đang diễn ra hoặc danh sách rỗng
  // Dùng soft assertion vì real-time: trận có thể kết thúc đúng lúc đang test
  test('filter Live shows only live or in-progress matches', async () => {
    await page.filterLive.click();
    await page.page.waitForLoadState('networkidle');

    const matches = await page.getAllMatchData();

    if (matches.length === 0) {
      console.log('Không có trận live — filter hoạt động đúng (danh sách rỗng)');
      return;
    }

    for (const match of matches) {
      expect.soft(
        isLiveOrInProgress(match.timeOrScore) || match.timeOrScore === '',
        `[Live filter] Row ${match.index} "${match.homeTeam} vs ${match.awayTeam}": "${match.timeOrScore}" không phải trạng thái live`
      ).toBe(true);
    }
  });

  // Kiểm tra click "Sắp tới" → chỉ hiển thị trận chưa bắt đầu (có giờ thi đấu)
  test('filter Upcoming shows only scheduled matches', async () => {
    await page.filterUpcoming.click();
    await page.page.waitForLoadState('networkidle');

    const matches = await page.getAllMatchData();

    if (matches.length === 0) {
      console.log('Không có trận sắp tới — filter hoạt động đúng');
      return;
    }

    for (const match of matches) {
      expect.soft(
        isUpcoming(match.timeOrScore),
        `[Upcoming filter] Row ${match.index} "${match.homeTeam} vs ${match.awayTeam}": "${match.timeOrScore}" không phải giờ thi đấu`
      ).toBe(true);
    }
  });

  // Kiểm tra click "Kết thúc" → chỉ hiển thị trận đã kết thúc (có tỉ số)
  test('filter Finish shows only completed matches', async () => {
    await page.filterFinish.click();
    await page.page.waitForLoadState('networkidle');

    const matches = await page.getAllMatchData();

    if (matches.length === 0) {
      console.log('Không có trận kết thúc — filter hoạt động đúng');
      return;
    }

    for (const match of matches) {
      expect.soft(
        isFinished(match.timeOrScore) || SPECIAL_STATES.test(match.timeOrScore),
        `[Finish filter] Row ${match.index} "${match.homeTeam} vs ${match.awayTeam}": "${match.timeOrScore}" không phải trạng thái kết thúc`
      ).toBe(true);
    }
  });

  // Kiểm tra sau khi filter Live → bấm "Tất cả" sẽ khôi phục danh sách đầy đủ
  test('switching from Live back to All restores full list', async () => {
    await page.filterLive.click();
    await page.page.waitForTimeout(500);
    const liveCount = await page.getMatchRowCount();

    await page.filterAll.click();
    await page.page.waitForLoadState('networkidle');
    const allCount = await page.getMatchRowCount();

    // Danh sách "Tất cả" phải >= danh sách "Live"
    expect(allCount).toBeGreaterThanOrEqual(liveCount);
  });

});
// npx playwright test tests/uniscore-filter.spec.ts --project=chrome
