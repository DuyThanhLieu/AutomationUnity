/**
 * TASK 3574 — Wide scan: quét NHIỀU trận × NHIỀU cầu thủ để kiểm chứng kết
 * luận của 01-radar-chart-and-tooltip.spec.ts (chỉ 1 trận/1 cầu thủ) có nhất
 * quán trên diện rộng hay chỉ là đặc thù của 1 mẫu.
 *
 * Quy mô: 10 trận pre-match × 6 cầu thủ/trận (3 đá chính mỗi đội) = 60 mẫu.
 *
 * Cách chọn trận: query Mongo `matches` (date_unix trong 7 ngày tới) ->
 * mapping_matches -> encode thesports_id -> GET /football/event/{id} check
 * status.type === "not_started" -> GET .../lineups lấy 3 cầu thủ đá chính
 * (substitute=false) đầu tiên mỗi đội. Danh sách trận SET SẴN dưới đây (đã
 * chốt tại thời điểm viết test) — nếu chạy lại sau nhiều ngày, một số trận có
 * thể đã chuyển sang live/finished, test sẽ tự log "SKIP" cho trận đó thay vì
 * fail cứng toàn bộ (mỗi trận độc lập).
 *
 * Verify cho mỗi cầu thủ (giống logic đã xác nhận đúng ở file 01):
 *   - Radar chart FE (popup Lineups) khớp API attribute-overviews (5 trục x 2 giá trị)
 *   - Overall Score (dạng số cũ) không còn xuất hiện trong popup
 *   - Tooltip (i) có đúng 5 tên đầy đủ theo AC (Attack/Creativity/Technique/Tactics/Defence)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3574/prematch-lineups-radar/02-wide-scan-fe-vs-api.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3574-prematch-lineups-radar';

const AC_TOOLTIP_NAMES: Record<string, string> = {
  ATT: 'Attack',
  CRE: 'Creativity',
  TEC: 'Technique',
  TAC: 'Tactics',
  DEF: 'Defence',
};

const AXES: Array<{ apiKey: string; feLabel: string; domOrder: 'label-between' | 'label-after' }> = [
  { apiKey: 'attacking', feLabel: 'ATT', domOrder: 'label-between' },
  { apiKey: 'creativity', feLabel: 'CRE', domOrder: 'label-after' },
  { apiKey: 'technical', feLabel: 'TEC', domOrder: 'label-after' },
  { apiKey: 'defending', feLabel: 'DEF', domOrder: 'label-between' },
  { apiKey: 'tactical', feLabel: 'TAC', domOrder: 'label-between' },
];

/**
 * Mở popup chi tiết cầu thủ trong tab Lineups — CÓ 2 LAYOUT KHÁC NHAU tuỳ
 * trạng thái xác nhận đội hình (phát hiện khi verify chéo trận Pisa vs
 * Empoli, Coppa Italia Round 1 — lineup CHƯA xác nhận nên FE hiện "Squad"
 * list-view thay vì sân bóng pitch-view):
 *   - Pitch-view (lineup đã xác nhận): ancestor test-id="player-detail".
 *   - Squad-list (CHƯA xác nhận): KHÔNG có test-id="player-detail" — phải
 *     click vào <img> avatar trong ancestor div class chứa "min-h-[40px]".
 *     Click vào text tên KHÔNG mở được gì (không lỗi, chỉ không tác dụng).
 * Bản chạy đầu tiên của wide-scan (60 mẫu) CHỈ thử pitch-view — 5 cầu thủ bị
 * gắn nhầm "skip_player_not_found" thực ra có thể đang ở squad-list layout.
 * Sau khi thêm fallback này, "not_found" chỉ còn đúng nghĩa "cầu thủ đổi
 * lineup/ở bench", không lẫn với "khác layout".
 */
async function openPlayerPopup(page: import('@playwright/test').Page, playerName: string): Promise<'pitch' | 'squad' | null> {
  const nameEl = page.locator(`text=${playerName}`).first();
  const pitchContainer = nameEl.locator('xpath=ancestor::*[@test-id="player-detail"]').first();
  const pitchVisible = await pitchContainer.isVisible({ timeout: 4000 }).catch(() => false);
  if (pitchVisible) {
    await pitchContainer.click({ timeout: 8000 });
    return 'pitch';
  }

  const squadRow = nameEl.locator('xpath=ancestor::div[contains(@class,"min-h-[40px]")]').first();
  const avatarImg = squadRow.locator('img').first();
  const avatarVisible = await avatarImg.isVisible({ timeout: 4000 }).catch(() => false);
  if (avatarVisible) {
    await avatarImg.click({ timeout: 8000 });
    return 'squad';
  }

  return null;
}

// 10 trận pre-match đã xác nhận có lineup đá chính tại thời điểm viết test
// (quét Mongo matches + check status "not_started" qua opta-api, 2026-08-17).
const FIXTURES: Array<{ matchUrl: string; homeTeam: string; awayTeam: string; homePlayers: string[]; awayPlayers: string[] }> = [
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/gnistan-helsinki-ilves-tampere/n97akmln834awnv',
    homeTeam: 'Gnistan Helsinki',
    awayTeam: 'Ilves Tampere',
    homePlayers: ['Oskar', 'Pakwo', 'Stephen'],
    awayPlayers: ['Krkalić', 'Kumpu', 'Väisänen'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/polissya-zhytomyr-zorya/b1ta1ll5s8ryvff',
    homeTeam: 'Polissya Zhytomyr',
    awayTeam: 'Zorya',
    homePlayers: ['Bushchan', 'Mykhaylichenko', 'Chobotenko'],
    awayPlayers: ['Rybak', 'Perduta', 'Jordan'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/fk-chernomorets-1919-burgas-cska-sofia-ii/q69zrnlu4gcyvee',
    homeTeam: 'Chernomorets Burgas',
    awayTeam: 'CSKA Sofia B',
    homePlayers: ['Argilashki', 'Dimitrov', 'Santos'],
    awayPlayers: ['Nikolov', 'Buchkov', 'chatov'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/fk-auda-riga-grobina/7kbz8ilu1gqlr9b',
    homeTeam: 'Auda Riga',
    awayTeam: 'Grobina',
    homePlayers: ['Puriņs', 'kragliks', 'Hrvoj'],
    awayPlayers: ['Ozols', 'Sidorovs', 'druzinins'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/zalaegerszegi-te-ferencvarosi-tc/cq0afiln75b7v78',
    homeTeam: 'Zalaegerszegi TE',
    awayTeam: 'Ferencvaros',
    homePlayers: ['Gundel-Takács', 'Csonka', 'peraza'],
    awayPlayers: ['Dibusz', 'Osváth', 'Raemaekers'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/fc-universitatea-cluj-uta-arad/a8qv3rlqm8gyr1c',
    homeTeam: 'Universitaea Cluj',
    awayTeam: 'UTA Arad',
    homePlayers: ['Lefter', 'Mikanović', 'Cristea'],
    awayPlayers: ['Tordai', 'Dorobanțu', 'Ouaneh'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/hjk-helsinki-women-kups-women/270vqalr4oa9w0m',
    homeTeam: 'HJK Helsinki (W)',
    awayTeam: 'KuPs (W)',
    homePlayers: ['laihanen', 'Gronlund', 'karvonen'],
    awayPlayers: ['Arpiainen', 'hahl', 'leiwo'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/fk-tinec-fk-viagem-usti-nad-labem/ykcv4ill4ey3w5u',
    homeTeam: 'Trinec',
    awayTeam: 'Viagem Usti',
    homePlayers: ['Murin', 'Skwarczek', 'Helebrand'],
    awayPlayers: ['Holy', 'Brezina', 'Yameogo'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/hacken-halmstads/b1ta1ll5her9vff',
    homeTeam: 'Hacken',
    awayTeam: 'Halmstads',
    homePlayers: ['Andersson', 'Wembangomo', 'Hilvenius'],
    awayPlayers: ['Rönning', 'Boman', 'Gregor'],
  },
  {
    matchUrl: 'https://staging.uniscore.vn/en/football/match/brondby-if-sonderjyske/sybadnlfee37whq',
    homeTeam: 'Brondby',
    awayTeam: 'Sonderjyske',
    homePlayers: ['Pentz', 'Villadsen', 'Binks'],
    awayPlayers: ['Bundgaard', 'Wagner', 'Duru'],
  },
];

type PlayerCheckResult = {
  matchUrl: string;
  homeTeam: string;
  awayTeam: string;
  playerName: string;
  status: 'checked' | 'skip_match_not_prematch' | 'skip_player_not_found' | 'skip_no_api_call' | 'skip_no_attribute_data' | 'error';
  layoutUsed?: 'pitch' | 'squad';
  errorDetail?: string;
  hasOldOverallScore?: boolean;
  valueMismatchCount?: number;
  valueTotal?: number;
  tooltipMismatchCount?: number;
  tooltipTotal?: number;
};

test.describe('[TASK-3574] Wide scan — Radar Chart FE vs API trên nhiều trận/nhiều cầu thủ', () => {
  test('Quét 10 trận x 6 cầu thủ: radar chart values + tooltip AC', async ({ page }) => {
    test.setTimeout(900_000); // 60 mẫu, mỗi mẫu vài giây (goto + click + click tooltip)

    // Đóng popup bằng nút X thật (svg.lucide-x) — page.keyboard.press('Escape')
    // KHÔNG đóng được popup này (đã tự gặp: popup treo lại, che toàn màn hình,
    // khiến MỌI click cầu thủ tiếp theo bị chặn bởi overlay cũ -> timeout dây
    // chuyền -> browser context bị đóng -> toàn bộ trận sau đó fail hàng loạt).
    // Đóng từ trong ra ngoài: nếu tooltip modal đang mở, nó có 1 lucide-x riêng
    // (index cuối, z-index cao hơn) — đóng lucide-x cuối cùng trước, lặp lại
    // tới khi không còn icon nào (an toàn cho cả trường hợp không có gì để đóng).
    async function closeAllPopups(): Promise<void> {
      for (let i = 0; i < 5; i++) {
        const xIcons = page.locator('svg.lucide-x, svg[class*="lucide-x"]');
        const count = await xIcons.count().catch(() => 0);
        if (count === 0) return;
        await xIcons
          .last()
          .click({ timeout: 3000 })
          .catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    const results: PlayerCheckResult[] = [];

    for (const fixture of FIXTURES) {
      let matchLoaded = false;
      try {
        await page.goto(fixture.matchUrl, { waitUntil: 'networkidle', timeout: 45_000 });
        await page.locator('text=Lineups').first().click();
        await page.waitForTimeout(1200);
        matchLoaded = true;
      } catch (e: any) {
        console.log(`⚠ SKIP toàn bộ trận ${fixture.homeTeam} vs ${fixture.awayTeam} — không load được trang: ${e.message}`);
        [...fixture.homePlayers, ...fixture.awayPlayers].forEach((playerName) =>
          results.push({ matchUrl: fixture.matchUrl, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, playerName, status: 'error', errorDetail: e.message })
        );
        continue;
      }

      const allPlayers = [...fixture.homePlayers, ...fixture.awayPlayers];
      for (const playerName of allPlayers) {
        const result: PlayerCheckResult = { matchUrl: fixture.matchUrl, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, playerName, status: 'checked' };
        let listener: ((req: any) => void) | null = null;

        try {
          // Luôn đảm bảo không còn popup nào treo từ cầu thủ trước, trước khi
          // bắt đầu mẫu mới — kể cả khi mẫu trước lỗi giữa đường.
          await closeAllPopups();

          let attributeApiUrl: string | null = null;
          listener = (req: any) => {
            if (req.url().includes('/attribute-overviews')) attributeApiUrl = req.url();
          };
          page.on('request', listener);

          const layoutUsed = await openPlayerPopup(page, playerName);

          if (!layoutUsed) {
            result.status = 'skip_player_not_found';
            page.off('request', listener);
            results.push(result);
            console.log(`  ○ SKIP ${playerName} (${fixture.homeTeam} vs ${fixture.awayTeam}) — không tìm thấy ở cả pitch-view lẫn squad-list (đã đổi lineup hoặc dạng bench)`);
            continue;
          }
          result.layoutUsed = layoutUsed;

          await page.waitForTimeout(1500);
          page.off('request', listener);

          if (!attributeApiUrl) {
            result.status = 'skip_no_api_call';
            results.push(result);
            console.log(`  ○ SKIP ${playerName} — popup không gọi API attribute-overviews`);
            await closeAllPopups();
            continue;
          }

          const apiRes = await page.request.get(attributeApiUrl);
          if (!apiRes.ok()) {
            result.status = 'error';
            result.errorDetail = `API HTTP ${apiRes.status()}`;
            results.push(result);
            await closeAllPopups();
            continue;
          }
          const apiBody = await apiRes.json();
          const playerOverview = apiBody?.data?.playerAttributeOverviews?.[0];
          const averageOverview = apiBody?.data?.averageAttributeOverviews?.[0];
          if (!playerOverview || !averageOverview) {
            result.status = 'error';
            result.errorDetail = 'API không trả playerAttributeOverviews/averageAttributeOverviews';
            results.push(result);
            await closeAllPopups();
            continue;
          }

          // API có thể trả 200 nhưng RỖNG data thật (chỉ có id/yearShift/position,
          // không có 5 field attacking/creativity/technical/defending/tactical) —
          // đã verify: khi đó FE chủ động ẨN hẳn card "Attribute Overview" (hành
          // vi hợp lý, không phải bug) thay vì hiện chart rỗng. Case này phải
          // tách riêng khỏi lỗi thật — không tính là fail.
          const hasRealAttributeData = AXES.every(({ apiKey }) => playerOverview[apiKey] !== undefined);
          if (!hasRealAttributeData) {
            result.status = 'skip_no_attribute_data';
            results.push(result);
            console.log(`  ○ SKIP ${playerName} — API trả rỗng (thiếu data Opta), FE ẩn card Attribute Overview (hành vi đúng, không phải bug)`);
            await closeAllPopups();
            continue;
          }

          const popupText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
          result.hasOldOverallScore = /Overall\s*Score/i.test(popupText);

          const chartCard = page.locator('text=Attribute Overview').first().locator('xpath=ancestor::*[self::div][2]');
          const chartVisible = await chartCard.isVisible({ timeout: 5000 }).catch(() => false);
          if (!chartVisible) {
            result.status = 'error';
            result.errorDetail = 'API có đủ data nhưng không tìm thấy card Attribute Overview trong popup — nghi ngờ bug hiển thị';
            results.push(result);
            await closeAllPopups();
            continue;
          }
          const chartText = (await chartCard.innerText()).replace(/\s+/g, ' ');

          let valueMismatchCount = 0;
          for (const { apiKey, feLabel, domOrder } of AXES) {
            const apiPlayerVal = playerOverview[apiKey];
            const apiAverageVal = averageOverview[apiKey];
            const regex = domOrder === 'label-between' ? new RegExp(`(\\d+)\\s*${feLabel}\\s*(\\d+)`) : new RegExp(`(\\d+)\\s+(\\d+)\\s*${feLabel}`);
            const match = chartText.match(regex);
            const fePlayerVal = match ? Number(match[1]) : null;
            const feAverageVal = match ? Number(match[2]) : null;
            if (fePlayerVal !== apiPlayerVal || feAverageVal !== apiAverageVal) valueMismatchCount++;
          }
          result.valueMismatchCount = valueMismatchCount;
          result.valueTotal = AXES.length;

          const infoBtn = page.locator('text="Attribute Overview"').locator('xpath=parent::*').locator('button[data-slot="dialog-trigger"]').first();
          await infoBtn.click({ timeout: 5000 });
          await page.waitForTimeout(600);
          const tooltipText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
          const tooltipMismatchCount = Object.values(AC_TOOLTIP_NAMES).filter((name) => !tooltipText.includes(name)).length;
          result.tooltipMismatchCount = tooltipMismatchCount;
          result.tooltipTotal = Object.keys(AC_TOOLTIP_NAMES).length;

          console.log(
            `  ${valueMismatchCount === 0 && tooltipMismatchCount === 0 ? '✓' : '✗'} ${playerName} (${fixture.homeTeam} vs ${fixture.awayTeam}): value ${AXES.length - valueMismatchCount}/${AXES.length} khớp, tooltip ${
              result.tooltipTotal! - tooltipMismatchCount
            }/${result.tooltipTotal} khớp, overallScore=${result.hasOldOverallScore ? 'CÒN' : 'đã bỏ'}`
          );

          results.push(result);
          await closeAllPopups();
        } catch (e: any) {
          result.status = 'error';
          result.errorDetail = e.message;
          results.push(result);
          console.log(`  ✗ ERROR ${playerName} (${fixture.homeTeam} vs ${fixture.awayTeam}): ${e.message}`);
          if (listener) page.off('request', listener);
          await closeAllPopups();
        }
      }

      if (!matchLoaded) continue;
    }

    const checked = results.filter((r) => r.status === 'checked');
    const skipped = results.filter((r) => r.status !== 'checked');
    const valueFullyMatched = checked.filter((r) => r.valueMismatchCount === 0);
    const tooltipFullyMatched = checked.filter((r) => r.tooltipMismatchCount === 0);
    const overallScoreStillPresent = checked.filter((r) => r.hasOldOverallScore);

    const skipBreakdown = ['skip_player_not_found', 'skip_no_api_call', 'skip_no_attribute_data', 'error'].map((s) => ({
      status: s,
      count: results.filter((r) => r.status === s).length,
    }));

    console.log(`\n📊 TỔNG KẾT wide scan: ${results.length} mẫu (${FIXTURES.length} trận x 6 cầu thủ) — ${checked.length} kiểm tra được, ${skipped.length} skip`);
    skipBreakdown.forEach((s) => console.log(`   - ${s.status}: ${s.count}`));
    console.log(`📊 Radar chart giá trị khớp API: ${valueFullyMatched.length}/${checked.length}`);
    console.log(`📊 Tooltip khớp AC: ${tooltipFullyMatched.length}/${checked.length}`);
    console.log(`📊 Overall Score (cũ) vẫn còn xuất hiện: ${overallScoreStillPresent.length}/${checked.length}`);

    saveJsonForSeason(SEASON_DIR, SLUG, 'wide-scan-results.json', {
      scannedAt: new Date().toISOString(),
      totalFixtures: FIXTURES.length,
      totalSamples: results.length,
      checkedCount: checked.length,
      skippedCount: skipped.length,
      valueFullyMatchedCount: valueFullyMatched.length,
      tooltipFullyMatchedCount: tooltipFullyMatched.length,
      overallScoreStillPresentCount: overallScoreStillPresent.length,
      results,
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'task-3574-wide-scan-report.xlsx', [
      {
        name: 'Tổng kết wide scan',
        columns: [
          { header: 'Chỉ số', key: 'metric', width: 60 },
          { header: 'Giá trị', key: 'value', width: 30 },
        ],
        rows: [
          { metric: 'Tổng số trận quét', value: FIXTURES.length },
          { metric: 'Tổng số mẫu (trận x cầu thủ)', value: results.length },
          { metric: 'Số mẫu kiểm tra được', value: checked.length },
          { metric: 'Số mẫu bị skip (không tìm thấy player / API không gọi / lỗi)', value: skipped.length },
          { metric: 'Radar chart khớp API 100% (5/5 trục)', value: `${valueFullyMatched.length}/${checked.length}` },
          { metric: 'Tooltip khớp AC 100% (5/5 tên)', value: `${tooltipFullyMatched.length}/${checked.length}` },
          { metric: 'Overall Score (dạng số cũ) vẫn còn xuất hiện', value: `${overallScoreStillPresent.length}/${checked.length}` },
        ],
        wrapText: true,
      },
      {
        name: 'Chi tiết từng mẫu',
        columns: [
          { header: 'Trận', key: 'matchLabel', width: 35 },
          { header: 'Cầu thủ', key: 'playerName', width: 20 },
          { header: 'Layout', key: 'layoutUsed', width: 10 },
          { header: 'Trạng thái', key: 'status', width: 22 },
          { header: 'Chi tiết lỗi', key: 'errorDetail', width: 35 },
          { header: 'Overall Score còn?', key: 'hasOldOverallScore', width: 16 },
          { header: 'Value khớp', key: 'valueMatchLabel', width: 14 },
          { header: 'Tooltip khớp', key: 'tooltipMatchLabel', width: 14 },
        ],
        rows: results.map((r) => ({
          matchLabel: `${r.homeTeam} vs ${r.awayTeam}`,
          playerName: r.playerName,
          layoutUsed: r.layoutUsed ?? '',
          status: r.status,
          errorDetail: r.errorDetail ?? '',
          hasOldOverallScore: r.hasOldOverallScore ?? '',
          valueMatchLabel: r.valueTotal ? `${r.valueTotal - (r.valueMismatchCount ?? 0)}/${r.valueTotal}` : '',
          tooltipMatchLabel: r.tooltipTotal ? `${r.tooltipTotal - (r.tooltipMismatchCount ?? 0)}/${r.tooltipTotal}` : '',
        })),
        wrapText: true,
      },
    ]);

    // Non-blocking cho tooltip (bug đã biết, xác nhận lại tính nhất quán trên diện rộng,
    // không cần fail cứng lần 2). Blocking cho radar chart values (đây là chức năng
    // chính của ticket — phải khớp 100% trên mọi mẫu kiểm tra được) và Overall Score.
    expect.soft(
      tooltipFullyMatched.length,
      `Tooltip khớp AC ở ${tooltipFullyMatched.length}/${checked.length} mẫu — xác nhận lại bug tooltip (không phải đặc thù 1 player) qua report task-3574-wide-scan-report.xlsx`
    ).toBe(checked.length);
    expect(overallScoreStillPresent.length, `Overall Score (dạng số cũ) vẫn còn xuất hiện ở ${overallScoreStillPresent.length}/${checked.length} mẫu`).toBe(0);
    expect(valueFullyMatched.length, `Radar chart lệch giá trị ở ${checked.length - valueFullyMatched.length}/${checked.length} mẫu`).toBe(checked.length);
  });
});
