/**
 * MÙA 2026-Q3 — Kiểm tra chart radar "Attribute Overview" trên trang player
 * (staging FE) so với API trả data cho chart.
 *
 * Trang mẫu: José Rivero (Tijuana, Liga MX)
 *   https://staging.uniscore.vn/en/football/player/jos-rivero/9zuz9pld993ni6u
 *
 * API tìm được qua network capture khi load trang (đúng field/tên khớp UI
 * "Player's Performance" vs "Same Position Avg", 5 trục ATT/CRE/TEC/DEF/TAC):
 *   GET https://opta-api.uniscore.vn/api/v2/player/{playerId}/attribute-overviews?language=en
 *   -> data.playerAttributeOverviews[0]   = số của cầu thủ (chấm xanh dương trên chart)
 *   -> data.averageAttributeOverviews[0]  = trung bình cùng vị trí (chấm vàng trên chart)
 *   5 trục: attacking, creativity, technical, defending, tactical
 *
 * FE hiển thị 2 số cho mỗi trục (vd "60 ATT 54" — số trái = player, số phải =
 * average), map với API theo thứ tự: player | average.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-player-attribute-radar/ --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'player-attribute-radar';

const PLAYER_ID = '9zuz9pld993ni6u';
const PLAYER_PAGE_URL = `https://staging.uniscore.vn/en/football/player/jos-rivero/${PLAYER_ID}`;
const ATTRIBUTE_API_URL = `https://opta-api.uniscore.vn/api/v2/player/${PLAYER_ID}/attribute-overviews?language=en`;

// DOM text order phụ thuộc layout 2 số quanh label trên radar (5 cạnh ngũ giác):
//   - ATT/DEF/TAC: 2 số nằm trái-phải label trên cùng 1 hàng -> DOM "<player> LABEL <avg>"
//   - CRE/TEC: 2 số nằm trên-dưới label (số bên cạnh, label rơi xuống dòng dưới)
//     -> DOM "<player> <avg> LABEL" (đã verify bằng screenshot zoom vùng chart)
const AXES: Array<{ apiKey: string; feLabel: string; domOrder: 'label-between' | 'label-after' }> = [
  { apiKey: 'attacking', feLabel: 'ATT', domOrder: 'label-between' },
  { apiKey: 'creativity', feLabel: 'CRE', domOrder: 'label-after' },
  { apiKey: 'technical', feLabel: 'TEC', domOrder: 'label-after' },
  { apiKey: 'defending', feLabel: 'DEF', domOrder: 'label-between' },
  { apiKey: 'tactical', feLabel: 'TAC', domOrder: 'label-between' },
];

test.describe('[2026-Q3] Player Attribute Overview (radar chart) — FE vs API', () => {
  test('José Rivero — số hiển thị trên radar chart phải khớp API attribute-overviews', async ({ page, request }) => {
    const apiRes = await request.get(ATTRIBUTE_API_URL);
    expect(apiRes.ok(), `API attribute-overviews trả lỗi HTTP ${apiRes.status()}`).toBeTruthy();
    const apiBody = await apiRes.json();

    const playerOverview = apiBody?.data?.playerAttributeOverviews?.[0];
    const averageOverview = apiBody?.data?.averageAttributeOverviews?.[0];
    expect(playerOverview, 'API không trả playerAttributeOverviews[0]').toBeTruthy();
    expect(averageOverview, 'API không trả averageAttributeOverviews[0]').toBeTruthy();

    await page.goto(PLAYER_PAGE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    const chartCard = page.locator('text=Attribute Overview').first().locator('xpath=ancestor::*[self::div][3]');
    await expect(chartCard).toBeVisible({ timeout: 15_000 });
    const chartText = (await chartCard.innerText()).replace(/\s+/g, ' ');

    console.log(`\n📊 Text vùng chart Attribute Overview:\n${chartText}`);

    const rows = AXES.map(({ apiKey, feLabel, domOrder }) => {
      const apiPlayerVal = playerOverview[apiKey];
      const apiAverageVal = averageOverview[apiKey];

      // 2 pattern DOM tuỳ vị trí label trên ngũ giác — xem giải thích ở khai báo AXES.
      const regex = domOrder === 'label-between' ? new RegExp(`(\\d+)\\s*${feLabel}\\s*(\\d+)`) : new RegExp(`(\\d+)\\s+(\\d+)\\s*${feLabel}`);
      const match = chartText.match(regex);
      const fePlayerVal = match ? Number(match[1]) : null;
      const feAverageVal = match ? Number(match[2]) : null;

      return {
        truc: feLabel,
        apiKey,
        apiPlayerVal,
        fePlayerVal,
        playerMatch: fePlayerVal === apiPlayerVal,
        apiAverageVal,
        feAverageVal,
        averageMatch: feAverageVal === apiAverageVal,
      };
    });

    const allMatch = rows.every((r) => r.playerMatch && r.averageMatch);
    const mismatches = rows.filter((r) => !r.playerMatch || !r.averageMatch);

    console.log(`\n📊 Radar chart FE vs API: ${rows.length - mismatches.length}/${rows.length} trục khớp cả 2 giá trị (player + average)`);
    rows.forEach((r) =>
      console.log(
        `  ${r.playerMatch && r.averageMatch ? '✓' : '✗'} ${r.truc}: player FE=${r.fePlayerVal} API=${r.apiPlayerVal} | average FE=${r.feAverageVal} API=${r.apiAverageVal}`
      )
    );

    saveJsonForSeason(SEASON_DIR, SLUG, 'radar-chart-fe-vs-api.json', {
      playerId: PLAYER_ID,
      pageUrl: PLAYER_PAGE_URL,
      apiUrl: ATTRIBUTE_API_URL,
      checkedAt: new Date().toISOString(),
      chartText,
      rows,
      allMatch,
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'radar-chart-fe-vs-api-report.xlsx', [
      {
        name: 'Radar chart FE vs API',
        columns: [
          { header: 'Trục', key: 'truc', width: 10 },
          { header: 'API field', key: 'apiKey', width: 16 },
          { header: 'Player — API', key: 'apiPlayerVal', width: 14 },
          { header: 'Player — FE', key: 'fePlayerVal', width: 14 },
          { header: 'Player khớp?', key: 'playerMatch', width: 14 },
          { header: 'Average — API', key: 'apiAverageVal', width: 14 },
          { header: 'Average — FE', key: 'feAverageVal', width: 14 },
          { header: 'Average khớp?', key: 'averageMatch', width: 14 },
        ],
        rows,
        wrapText: true,
      },
    ]);

    expect(mismatches, `Radar chart lệch ${mismatches.length}/${rows.length} trục giữa FE và API — xem report tổng radar-chart-fe-vs-api-report.xlsx`).toEqual([]);
  });
});
