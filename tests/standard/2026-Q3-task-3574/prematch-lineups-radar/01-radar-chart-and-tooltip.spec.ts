/**
 * TASK 3574 — [FE] Pre-Match Lineups: thay "Overall Score" bằng Radar Chart
 * (Attribute Overview) trong popup chi tiết cầu thủ.
 *
 * Breadcrumb theo ticket: Pre-Match → Details → Lineups → Select any player
 * → Show pop-up player details (pre-match)
 *
 * Trận mẫu: Tijuana vs Cruz Azul (Liga MX, chưa đá — "today"). LƯU Ý: trận
 * mẫu cần chọn LẠI mỗi khi chạy cách xa ngày viết test — id/trận cụ thể sẽ
 * chuyển qua live/finished theo thời gian và không còn ở đúng trạng thái
 * pre-match nữa (đã tự gặp khi trận mẫu ban đầu Seattle Sounders vs Vancouver
 * chuyển sang "1st_half" sau vài ngày). Cách tìm trận mới: query Mongo
 * `matches` (date_unix > now), lấy mapping_matches -> encode thesports_id ->
 * gọi GET /football/event/{encodedId}?language=en, chọn trận có
 * status.type === "not_started".
 *   https://staging.uniscore.vn/en/football/match/club-tijuana-cruz-azul/o6jamrl1ryc2w7q
 * Cầu thủ mẫu: Gilberto Mora (Tijuana, số 10, đá chính — LƯU Ý chọn cầu thủ
 * đang trên sân, không phải bench: bench dùng cấu trúc DOM khác, không có
 * ancestor test-id="player-detail" nên click sẽ timeout).
 *
 * Click vào player trên sân (locator gốc: tên cầu thủ trong lineup, rồi lấy
 * ancestor có test-id="player-detail") mở popup chi tiết — bên trong có card
 * "Attribute Overview" (radar chart), gọi API:
 *   GET https://opta-api.uniscore.vn/api/v2/player/{playerId}/attribute-overviews?language=en
 *   -> data.playerAttributeOverviews[0]   = số cầu thủ (chấm xanh dương)
 *   -> data.averageAttributeOverviews[0]  = trung bình cùng vị trí (chấm vàng)
 *   5 trục: attacking, creativity, technical, defending, tactical
 * Giống hệt API dùng ở trang player profile (/football/player/{slug}/{id}) —
 * cùng 1 nguồn dữ liệu, chỉ khác entry point (popup pre-match vs trang riêng).
 *
 * FE hiển thị 2 số quanh mỗi label trên ngũ giác — layout tuỳ vị trí góc:
 *   - ATT/DEF/TAC: 2 số nằm trái-phải label -> DOM order "<player> LABEL <avg>"
 *   - CRE/TEC: 2 số nằm trên-dưới label -> DOM order "<player> <avg> LABEL"
 * (đã verify bằng screenshot zoom — xem lịch sử task player-attribute-radar).
 *
 * QUAN TRỌNG — tab Lineups có 2 LAYOUT KHÁC NHAU tuỳ trạng thái xác nhận đội
 * hình (đã tự phát hiện khi verify chéo với user trên trận Pisa vs Empoli,
 * Coppa Italia Round 1 — lineup CHƯA xác nhận nên FE hiện "Squad" list-view
 * thay vì sân bóng pitch-view):
 *   - Pitch-view (lineup đã xác nhận): mỗi cầu thủ nằm trong 1 container có
 *     test-id="player-detail" — click ancestor này để mở popup.
 *   - Squad-list (lineup CHƯA xác nhận): danh sách dạng bảng, KHÔNG có
 *     test-id="player-detail" nào cả. Click vào TÊN (text) không mở được gì
 *     (không lỗi, chỉ không có tác dụng) — phải click đúng vào <img> avatar
 *     nằm trong ancestor div có class chứa "min-h-[40px]".
 * Hàm openPlayerPopup() bên dưới thử pitch-view trước, fallback sang
 * squad-list nếu không tìm thấy — dùng chung logic cho cả 2 dạng trận.
 *
 * BUG PHÁT HIỆN khi verify AC "Hiển thị tooltip (i) onClick": icon (i) cạnh
 * "Attribute Overview" trong popup này khi click lại mở modal tiêu đề "Key Top
 * Player Last Match Explain" — nội dung của 1 chart KHÁC (so sánh 2 top player
 * trận gần nhất), không phải bảng chú thích ATT/CRE/TEC/TAC/DEF theo AC ticket
 * 3574 (Attack/Creativity/Technique/Tactics/Defence). Nội dung tooltip sai còn
 * dùng tên khác hẳn AC (vd "TAC (Tactical): Tackling ability." thay vì
 * "Tactics"). Test dưới đây assert đúng theo AC nên sẽ FAIL — xác nhận gap có
 * thật, không phải lỗi test.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3574/prematch-lineups-radar/ --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';
import { withStagingDirectClient } from '../../lib/db-staging-direct';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3574-prematch-lineups-radar';

const MATCH_URL = 'https://staging.uniscore.vn/en/football/match/club-tijuana-cruz-azul/o6jamrl1ryc2w7q';
const PLAYER_NAME_ON_PITCH = 'Mora';

// Bảng tên đầy đủ theo AC ticket — dùng để verify tooltip.
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
 * Mở popup chi tiết cầu thủ trong tab Lineups — thử pitch-view trước
 * (test-id="player-detail"), fallback sang squad-list (click avatar <img>
 * trong ancestor "min-h-[40px]") nếu không tìm thấy. Trả về true nếu mở
 * được popup (đã click thành công vào 1 trong 2 dạng), false nếu cầu thủ
 * không xuất hiện dưới dạng nào cả.
 */
async function openPlayerPopup(page: import('@playwright/test').Page, playerName: string): Promise<boolean> {
  const nameEl = page.locator(`text=${playerName}`).first();
  const pitchContainer = nameEl.locator('xpath=ancestor::*[@test-id="player-detail"]').first();
  const pitchVisible = await pitchContainer.isVisible({ timeout: 4000 }).catch(() => false);
  if (pitchVisible) {
    await pitchContainer.click({ timeout: 8000 });
    return true;
  }

  const squadRow = nameEl.locator('xpath=ancestor::div[contains(@class,"min-h-[40px]")]').first();
  const avatarImg = squadRow.locator('img').first();
  const avatarVisible = await avatarImg.isVisible({ timeout: 4000 }).catch(() => false);
  if (avatarVisible) {
    await avatarImg.click({ timeout: 8000 });
    return true;
  }

  return false;
}

test.describe('[TASK-3574] Pre-Match Lineups — popup player: Radar Chart (Attribute Overview)', () => {
  test('Radar chart trong popup pre-match khớp API attribute-overviews + AC "Overall Score đã bị loại bỏ"', async ({ page }) => {
    let attributeApiUrl: string | null = null;
    page.on('request', (req) => {
      if (req.url().includes('/attribute-overviews')) attributeApiUrl = req.url();
    });

    await page.goto(MATCH_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('text=Lineups').first().click();
    await page.waitForTimeout(1500);

    const opened = await openPlayerPopup(page, PLAYER_NAME_ON_PITCH);
    expect(opened, `Không mở được popup cho "${PLAYER_NAME_ON_PITCH}" ở cả pitch-view lẫn squad-list — kiểm tra lại tên cầu thủ / trạng thái trận`).toBeTruthy();
    await page.waitForTimeout(2000);

    expect(attributeApiUrl, 'Popup không gọi API attribute-overviews — có thể FE đổi nguồn data hoặc chưa render chart').toBeTruthy();

    const apiRes = await page.request.get(attributeApiUrl!);
    expect(apiRes.ok(), `API attribute-overviews trả lỗi HTTP ${apiRes.status()}`).toBeTruthy();
    const apiBody = await apiRes.json();
    const playerOverview = apiBody?.data?.playerAttributeOverviews?.[0];
    const averageOverview = apiBody?.data?.averageAttributeOverviews?.[0];
    expect(playerOverview, 'API không trả playerAttributeOverviews[0]').toBeTruthy();
    expect(averageOverview, 'API không trả averageAttributeOverviews[0]').toBeTruthy();

    // ---- AC: Overall Score (dạng số cũ) phải bị loại bỏ khỏi popup ----
    const popupText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const hasOldOverallScore = /Overall\s*Score/i.test(popupText);

    // ---- AC: giá trị hiển thị trên Radar Chart phải khớp API ----
    const chartCard = page.locator('text=Attribute Overview').first().locator('xpath=ancestor::*[self::div][2]');
    await expect(chartCard).toBeVisible({ timeout: 10_000 });
    const chartText = (await chartCard.innerText()).replace(/\s+/g, ' ');
    console.log(`\n📊 Text vùng chart Attribute Overview (popup pre-match):\n${chartText}`);

    const valueRows = AXES.map(({ apiKey, feLabel, domOrder }) => {
      const apiPlayerVal = playerOverview[apiKey];
      const apiAverageVal = averageOverview[apiKey];
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
    const valueMismatches = valueRows.filter((r) => !r.playerMatch || !r.averageMatch);

    console.log(`📊 Radar chart FE vs API: ${valueRows.length - valueMismatches.length}/${valueRows.length} trục khớp cả 2 giá trị`);
    valueRows.forEach((r) =>
      console.log(`  ${r.playerMatch && r.averageMatch ? '✓' : '✗'} ${r.truc}: player FE=${r.fePlayerVal} API=${r.apiPlayerVal} | avg FE=${r.feAverageVal} API=${r.apiAverageVal}`)
    );

    // ---- AC: tooltip (i) phải hiển thị đúng bảng tên chỉ số ----
    const infoBtn = page.locator('text="Attribute Overview"').locator('xpath=parent::*').locator('button[data-slot="dialog-trigger"]').first();
    await infoBtn.click();
    await page.waitForTimeout(800);
    const tooltipText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

    const tooltipRows = Object.entries(AC_TOOLTIP_NAMES).map(([feLabel, expectedFullName]) => ({
      truc: feLabel,
      expectedFullName,
      foundInTooltip: tooltipText.includes(expectedFullName),
    }));
    const tooltipMismatches = tooltipRows.filter((r) => !r.foundInTooltip);

    console.log(`\n📊 Tooltip (i) — AC yêu cầu hiển thị tên đầy đủ: ${tooltipRows.length - tooltipMismatches.length}/${tooltipRows.length} tên khớp`);
    tooltipRows.forEach((r) => console.log(`  ${r.foundInTooltip ? '✓' : '✗'} ${r.truc} -> "${r.expectedFullName}"`));
    if (tooltipMismatches.length > 0) {
      console.log(`  ⚠ BUG: tooltip hiện tại không chứa đúng tên AC yêu cầu — xem nội dung thật đã capture:\n  "${tooltipText.slice(0, 500)}"`);
    }

    saveJsonForSeason(SEASON_DIR, SLUG, 'radar-chart-and-tooltip-check.json', {
      matchUrl: MATCH_URL,
      playerName: PLAYER_NAME_ON_PITCH,
      attributeApiUrl,
      checkedAt: new Date().toISOString(),
      hasOldOverallScore,
      chartText,
      valueRows,
      tooltipText,
      tooltipRows,
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'task-3574-radar-chart-report.xlsx', [
      {
        name: 'AC tổng quan',
        columns: [
          { header: 'Hạng mục', key: 'hangMuc', width: 60 },
          { header: 'Kết quả', key: 'ketQua', width: 70 },
        ],
        rows: [
          { hangMuc: 'AC — Overall Score (dạng số cũ) đã bị loại bỏ khỏi popup', ketQua: hasOldOverallScore ? 'FAIL — vẫn còn text "Overall Score" trong popup' : 'PASS — không còn "Overall Score"' },
          { hangMuc: 'AC — Radar Chart hiển thị đúng giá trị API (5 trục, cả Player + Same Position Avg)', ketQua: valueMismatches.length === 0 ? `PASS — ${valueRows.length}/${valueRows.length} trục khớp` : `FAIL — lệch ${valueMismatches.length}/${valueRows.length} trục` },
          {
            hangMuc: 'AC — Tooltip (i) hiển thị đúng bảng tên chỉ số (Attack/Creativity/Technique/Tactics/Defence)',
            ketQua:
              tooltipMismatches.length === 0
                ? 'PASS'
                : `FAIL — tooltip thực tế hiện nội dung của chart KHÁC ("Key Top Player Last Match Explain", so sánh 2 top player trận gần nhất), không phải bảng chú thích ATT/CRE/TEC/TAC/DEF theo AC. Thiếu đúng tên: ${tooltipMismatches.map((r) => `${r.truc}="${r.expectedFullName}"`).join(', ')}`,
          },
        ],
        wrapText: true,
      },
      {
        name: 'Giá trị radar chart',
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
        rows: valueRows,
        wrapText: true,
      },
      {
        name: 'Tooltip check',
        columns: [
          { header: 'Trục', key: 'truc', width: 10 },
          { header: 'Tên đầy đủ theo AC', key: 'expectedFullName', width: 20 },
          { header: 'Có trong tooltip?', key: 'foundInTooltip', width: 18 },
        ],
        rows: tooltipRows,
        wrapText: true,
      },
    ]);

    expect(hasOldOverallScore, 'AC yêu cầu loại bỏ "Overall Score" khỏi popup — vẫn còn xuất hiện').toBeFalsy();
    expect(valueMismatches, `Radar chart lệch ${valueMismatches.length}/${valueRows.length} trục giữa FE và API`).toEqual([]);
    expect(
      tooltipMismatches,
      `Tooltip (i) không khớp AC — thiếu ${tooltipMismatches.length}/${tooltipRows.length} tên đầy đủ. Tooltip hiện tại hiển thị nội dung của chart khác ("Key Top Player Last Match Explain") thay vì bảng chú thích ATT/CRE/TEC/TAC/DEF.`
    ).toEqual([]);
  });

  test('Nguồn thô (Postgres opta_seasonal_stat_players) có tồn tại và hợp lý cho player mẫu — KHÔNG đoán công thức ATT/CRE/TEC/TAC/DEF', async () => {
    // API attribute-overviews thuộc namespace "opta" (opta-api.uniscore.vn).
    // Đã dò Mongo `footystats` (task-3508) — KHÔNG có dữ liệu Opta ở đó.
    // Dò tiếp Postgres staging (<DB_STAGING_HOST>:5432, db "football", đã có sẵn
    // tests/standard/lib/db-staging-direct.ts dùng cho bộ test injury-time) —
    // tìm được bảng opta_players + opta_seasonal_stat_players, đúng namespace.
    //
    // KHÔNG tìm được bảng mapping tổng quát nối id ngắn dùng trong URL API
    // (vd b44vv3l2v5n6rxp) với opta_players.id (dạng dài, vd
    // 9pij37xod9240dolmvy6wrvmx) — đã thử: mapping_players (chỉ map
    // thesports_uuid <-> player_id FootyStats), mapping_player (chỉ map
    // thesports <-> sofa_id), mapping_competitors (chỉ map thesports <->
    // simulation), encode/decode API (chỉ áp dụng cho match ID theo task-3508,
    // không khớp 2 chiều cho player ID). Nên KHÔNG match player_id tự động —
    // chỉ khớp thủ công theo tên + team + ngày sinh cho ĐÚNG player mẫu này.
    //
    // Vì không có công thức thật từ backend, test này KHÔNG thử tái tạo
    // ATT/CRE/TEC/TAC/DEF từ field thô (tránh lặp lại bug đoán-công-thức đã
    // gặp ở task-3508, từng báo lệch giả 15/16 trận). Chỉ verify 2 điều chắc
    // chắn được: (a) player mẫu có tồn tại trong nguồn Opta với data thô thật
    // (không rỗng/không phải placeholder), và (b) AC yêu cầu chỉ số "cả sự
    // nghiệp cầu thủ" — ghi nhận có bao nhiêu season data tồn tại để dev/QA
    // đối chiếu xem API có tổng hợp đủ hay chỉ dùng 1 season gần nhất.
    const PLAYER_FULL_NAME = 'Mora';
    const TEAM_NAME = 'Tijuana';

    const { playerRow, statRows } = await withStagingDirectClient(async (client) => {
      const playerRes = await client.query(
        `SELECT op.id, op.first_name, op.last_name, op.position, op.date_of_birth, op.team_id, ot.name as team_name
         FROM opta_players op
         JOIN opta_teams ot ON ot.id = op.team_id
         WHERE op.last_name ILIKE $1 AND ot.name = $2
         LIMIT 1`,
        [`%${PLAYER_FULL_NAME}%`, TEAM_NAME]
      );
      const playerRow = playerRes.rows[0] ?? null;

      let statRows: unknown[] = [];
      if (playerRow) {
        const statsRes = await client.query(`SELECT season_id, competitor_id, matches, minutes_played, touches, passes, tackles, duels_won, duels_lost, goals, last_updated FROM opta_seasonal_stat_players WHERE player_id = $1 ORDER BY last_updated DESC`, [
          playerRow.id,
        ]);
        statRows = statsRes.rows;
      }
      return { playerRow, statRows };
    });

    console.log(`\n📊 Nguồn Opta (Postgres) cho "${PLAYER_FULL_NAME}" (${TEAM_NAME}): ${playerRow ? 'TÌM THẤY' : 'KHÔNG TÌM THẤY'} trong opta_players`);
    if (playerRow) console.log(`  opta_players.id=${playerRow.id}, position=${playerRow.position}, date_of_birth=${playerRow.date_of_birth}`);
    console.log(`📊 Số dòng dữ liệu mùa (season) tìm được trong opta_seasonal_stat_players: ${statRows.length}`);
    statRows.forEach((r: any, i) => console.log(`  [${i}] season_id=${r.season_id} matches=${r.matches} minutes_played=${r.minutes_played} touches=${r.touches} passes=${r.passes} last_updated=${r.last_updated}`));

    const hasRealData = statRows.length > 0 && statRows.some((r: any) => Number(r.matches) > 0 && Number(r.touches) > 0);

    saveJsonForSeason(SEASON_DIR, SLUG, 'attribute-source-raw-check.json', {
      playerFullName: PLAYER_FULL_NAME,
      teamName: TEAM_NAME,
      checkedAt: new Date().toISOString(),
      playerFoundInOptaPlayers: !!playerRow,
      optaPlayerId: playerRow?.id ?? null,
      seasonRowCount: statRows.length,
      hasRealData,
      statRows,
      note: 'KHÔNG map được id ngắn (URL API) <-> opta_players.id một cách tổng quát — đã dò mapping_players/mapping_player/mapping_competitors/encode-decode API, không có bảng nối 2 hệ id cho player. Player mẫu này được khớp thủ công theo tên + team + ngày sinh. KHÔNG thử tái tạo công thức ATT/CRE/TEC/TAC/DEF vì không có công thức thật — chỉ xác nhận nguồn thô tồn tại và hợp lý.',
    });

    expect(playerRow, `Không tìm thấy "${PLAYER_FULL_NAME}" (${TEAM_NAME}) trong opta_players — không thể xác nhận có nguồn Opta thật cho player này`).toBeTruthy();
    expect(hasRealData, `opta_seasonal_stat_players không có dữ liệu hợp lý (matches>0 và touches>0) cho player này — nghi ngờ API attribute-overviews không có nguồn thô thật để tính`).toBeTruthy();
  });
});
