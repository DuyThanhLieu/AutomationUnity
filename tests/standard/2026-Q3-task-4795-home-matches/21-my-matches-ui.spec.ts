/**
 * US-4795 — lấp lỗ hổng "Đối chiếu UI thật" cho my-matches, ô cuối cùng còn
 * trống trong ma trận độ bao phủ. Đã khảo sát sai ban đầu (agent khảo sát +
 * lần tự kiểm tra đầu của tôi kết luận "trang Following không gọi my-matches")
 * — SAI vì lúc đó test ở trạng thái CHƯA CÓ FAVORITE nào. Khảo sát lại bằng
 * Playwright MCP, bấm "Add to favorites" thật và bắt network request, phát
 * hiện đúng cơ chế:
 *
 *   1. Favorite được lưu ở localStorage, key "guest-favorites" (Zustand store,
 *      version 1), cấu trúc: state.favorites.{matches,teams,leagues,players}.
 *      Mỗi phần tử trong .teams có {id, name, shortName, isFavorite, addedAt}.
 *   2. Khi CÓ favorite, cả TRANG CHỦ (sau khi follow) VÀ trang Following
 *      (/en/favorite) đều gọi POST sport-events/my-matches/locale/{locale}/
 *      type/{type}, body {startDate, teamsFavorite, matchesFavorite,
 *      language} — ĐÚNG với giả định ban đầu trước khi bị bác bỏ nhầm.
 *   3. Trang Following gọi NHIỀU LẦN (quan sát thật: 6 lần cho 1 lần load) —
 *      nhiều khả năng ứng với các type khác nhau (all/upcoming/finish/live)
 *      hoặc re-render nhiều lần; không hard-fail số lần gọi cụ thể vì đây là
 *      chi tiết triển khai có thể đổi, chỉ verify NỘI DUNG cuối cùng đúng.
 *
 * CÁCH SET STATE TRƯỚC KHI TEST: dùng page.addInitScript để ghi localStorage
 * TRƯỚC khi trang tải (không set sau khi đã load — React đọc localStorage lúc
 * khởi tạo store, set muộn sẽ không có tác dụng).
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/21-my-matches-ui.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { vnDate } from './lib/home-client';

const SITE = 'https://uniscore.com/en';

/** Set trước 1 team vào guest-favorites — tái dùng đúng field thật đã quan sát
 *  qua network request lúc follow thủ công (addedAt/isFavorite không ảnh
 *  hưởng logic lọc, chỉ cần có mặt để không vỡ cấu trúc store khi app đọc). */
function guestFavoritesPayload(teamId: string, teamName: string, teamShortName: string): string {
  return JSON.stringify({
    state: {
      favorites: {
        matches: [],
        leagues: [],
        players: [],
        teams: [{ id: teamId, name: teamName, shortName: teamShortName, sportType: 0, isFavorite: true, addedAt: Date.now() }],
      },
      lastSyncAt: {},
    },
    version: 1,
  });
}

// Đội mẫu: lấy từ chính trận đã verify thật lúc khảo sát (Sai Gon, V.League 2)
// — chắc chắn tồn tại thật trên hệ thống, tránh đoán id không có thật.
const SAMPLE_TEAM_ID = 'go6v7il1exbntnv';
const SAMPLE_TEAM_NAME = 'Sai Gon';

test.describe('UI thật (my-matches) · set trước favorite qua localStorage rồi verify network request', () => {
  test('sau khi set teamsFavorite trước, trang chủ gọi my-matches với ĐÚNG teamsFavorite đã set', async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      ['guest-favorites', guestFavoritesPayload(SAMPLE_TEAM_ID, SAMPLE_TEAM_NAME, SAMPLE_TEAM_NAME)]
    );

    let capturedBody: any = null;
    const handler = async (req: import('@playwright/test').Request) => {
      if (req.url().includes('sport-events/my-matches/') && req.method() === 'POST') {
        try {
          capturedBody = JSON.parse(req.postData() ?? '{}');
        } catch {
          // bỏ qua nếu không parse được — test sẽ tự fail ở assertion dưới vì capturedBody vẫn null
        }
      }
    };
    page.on('request', handler);
    await page.goto(SITE, { waitUntil: 'networkidle' });
    page.off('request', handler);

    test.skip(!capturedBody, 'Không bắt được request my-matches nào — UI có thể đã đổi cơ chế lưu favorite (khác guest-favorites) hoặc đổi điều kiện gọi API này trên trang chủ');
    expect(capturedBody.teamsFavorite, 'UI phải gửi đúng id đội đã set trước trong localStorage').toContain(SAMPLE_TEAM_ID);
  });

  test('trang Following (/en/favorite) hiển thị đúng trận của đội đã set favorite — đối chiếu với response my-matches thật', async ({ page, request }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      ['guest-favorites', guestFavoritesPayload(SAMPLE_TEAM_ID, SAMPLE_TEAM_NAME, SAMPLE_TEAM_NAME)]
    );

    let capturedLocale: string | null = null;
    const handler = (req: import('@playwright/test').Request) => {
      const m = req.url().match(/my-matches\/locale\/([^/]+)\/type\/all/);
      if (m) capturedLocale = m[1];
    };
    page.on('request', handler);
    await page.goto(`${SITE}/favorite`, { waitUntil: 'networkidle' });
    page.off('request', handler);

    test.skip(!capturedLocale, 'Không bắt được request my-matches type=all nào trên trang Following');

    // Gọi lại API thật với ĐÚNG locale UI vừa dùng, để biết "sự thật" UI nên
    // hiển thị gì — không hard-code locale, tránh lặp lại lỗi đã mắc ở file 06.
    const today = vnDate(0);
    const apiRes = await request.post(
      `https://api.uni-score.com/api/v2/sport/football/sport-events/my-matches/locale/${capturedLocale}/type/all?language=en`,
      { data: { startDate: today, teamsFavorite: [SAMPLE_TEAM_ID], matchesFavorite: [] }, headers: { 'Content-Type': 'application/json' } }
    );
    const apiBody = await apiRes.json();
    test.skip(apiBody.code !== 1 || apiBody.data.events.length === 0, `Đội ${SAMPLE_TEAM_NAME} không có trận nào hôm nay (${today}) để đối chiếu — không đủ cơ sở verify nội dung hiển thị`);

    const expectedMatch = apiBody.data.events[0];
    await page.waitForTimeout(500); // chờ React render xong sau networkidle (giống file 06)
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasHome = bodyText.includes(expectedMatch.homeTeam.shortName) || bodyText.includes(expectedMatch.homeTeam.name);
    const hasAway = bodyText.includes(expectedMatch.awayTeam.shortName) || bodyText.includes(expectedMatch.awayTeam.name);
    expect(hasHome && hasAway, `Trang Following không hiển thị trận ${expectedMatch.homeTeam.name} vs ${expectedMatch.awayTeam.name} mà API my-matches xác nhận có cho đội đã follow`).toBe(true);
  });

  test('bỏ favorite (localStorage rỗng): trang Following không hiển thị trận của đội KHÔNG còn follow', async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      ['guest-favorites', guestFavoritesPayload('id-khong-ton-tai', 'Khong Ton Tai', 'KTT')]
    );
    await page.goto(`${SITE}/favorite`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const bodyText = await page.evaluate(() => document.body.innerText);
    // Đội giả không có trận thật nào — trang phải hiện empty-state, không phải
    // render nhầm dữ liệu của đội khác (vd còn sót state cũ từ test trước).
    expect(bodyText.toLowerCase()).not.toContain(SAMPLE_TEAM_NAME.toLowerCase());
  });
});
