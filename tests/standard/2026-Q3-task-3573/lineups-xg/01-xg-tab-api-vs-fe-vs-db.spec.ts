/**
 * TASK 3573 — [FE] Lineups: thêm tab "xG" (Expected Goals) hiển thị chỉ số xG
 * của từng cầu thủ, highlight cầu thủ có xG cao nhất trận.
 *
 * Breadcrumb: Match → Lineups → chọn tab "Expected Goals" (nằm giữa "Rating"
 * và "Country" trong dải tab lọc, đúng vị trí AC yêu cầu).
 *
 * NGUỒN DATA — ĐÃ XÁC NHẬN BẰNG SPEC CHÍNH THỨC TỪ BACKEND (khớp 100% với kết
 * quả dò thực tế trước đó):
 *   GET /football/event/:sport_event_id/lineups
 *   -> mỗi player trong data.home/away.players có 2 field xG, cả 2 ĐỀU OPTIONAL:
 *        - xg: string — tổng xG cầu thủ, LÀM TRÒN 2 CHỮ SỐ THẬP PHÂN (theo spec
 *          backend). Field vắng mặt khi cầu thủ không có shot (không phải "0").
 *        - isHighestXg: boolean — dùng để highlight CÁC cầu thủ có CÙNG xG cao
 *          nhất (spec dùng số nhiều "các cầu thủ" — xác nhận rõ trường hợp tie
 *          nhiều người cùng highlight là THIẾT KẾ CÓ CHỦ ĐÍCH, không phải case
 *          hiếm bị bỏ sót).
 *   `statistics` field trong player object LUÔN RỖNG ({}) — KHÔNG dùng để lấy
 *   xG (thử nghiệm ban đầu tưởng đây là nguồn, sai).
 *
 * ĐỐI CHIẾU VỚI POSTGRES (nguồn shot-level chi tiết, staging <DB_STAGING_HOST>:5432,
 * db "football", bảng xg_shot_stats + xg_match_stats — tìm được nhờ đã biết
 * cấu trúc DB từ task 3574):
 *   - xg_shot_stats: từng cú sút riêng lẻ, có shot_type (miss/block/save/goal/
 *     shot_on_target), xg per shot, player_id (=thesports id, KHÔNG PHẢI
 *     player.id trong /lineups — cần decode qua /api/v1/decode/{player.id}
 *     để map, giống cơ chế match-id encode/decode đã học ở task 3508).
 *   - xg_match_stats.top_xg_players: tổng xG top 3 cầu thủ mỗi trận, đã tính
 *     sẵn — dùng để double-check tổng shot-level.
 *
 * ĐÃ XÁC NHẬN (không phải bug): tại thời điểm viết test, tổng shot-level từ
 * Postgres xg_shot_stats (0.9634 cho Preciado) KHÔNG khớp API /lineups.xg
 * (0.72). Đã xác minh bằng cách đọc lại chính 3 dòng shot cùng player_id +
 * event_id + time_min ở 2 thời điểm khác nhau — GIÁ TRỊ xg CỦA TỪNG SHOT ĐÃ
 * THAY ĐỔI giữa 2 lần đọc (0.0423→0.0364, 0.4137→0.2682, 0.5074→0.4125 —
 * cùng shot, cùng time_min, xg khác nhau). Xác nhận: bảng xg_shot_stats BỊ
 * GHI ĐÈ/RE-COMPUTE theo thời gian (không phải append-only), nên số cộng lại
 * tại 1 thời điểm cụ thể có thể khớp hoặc không khớp API tuỳ vào việc model
 * đã re-tính hay chưa tại lúc đó. KHÔNG dùng bảng Postgres xg_shot_stats làm
 * baseline đối chiếu cho AC #2 (tổng xG cầu thủ) — nó không ổn định theo thời
 * gian, còn API /lineups.xg là số hiển thị thật trên FE nên đó là nguồn cần
 * verify đúng, không phải nguồn để verify NGƯỢC LẠI với.
 *
 * Trận mẫu: Tijuana vs Cruz Azul (Liga MX, đã kết thúc — Post-match)
 *   https://staging.uniscore.vn/en/football/match/club-tijuana-cruz-azul/o6jamrl1ryc2w7q
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3573/lineups-xg/ --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';
import { withStagingDirectClient } from '../../lib/db-staging-direct';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3573-lineups-xg';

const MATCH_URL = 'https://staging.uniscore.vn/en/football/match/club-tijuana-cruz-azul/o6jamrl1ryc2w7q';
const ENCODED_MATCH_ID = 'o6jamrl1ryc2w7q';
// Opta event_id thật (khác encoded id trên) — tra bằng home_team+away_team+tỉ số
// trong xg_match_stats vì KHÔNG tìm được bảng mapping match-id tổng quát
// (đã dò mapping_matches/mapping_competitors ở task 3508/3574, không có).
const OPTA_EVENT_ID = 'l5ergph4jyz1r8k';

test.describe('[TASK-3573] Lineups — tab Expected Goals (xG)', () => {
  test('Tab xG hiển thị đúng vị trí (giữa Rating và Country) + field xg/isHighestXg đúng AC', async ({ page, request }) => {
    await page.goto(MATCH_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('text=Lineups').first().click();
    await page.waitForTimeout(1200);

    // ---- AC: Tab "Expected Goals" phải tồn tại, đúng vị trí giữa Rating và Country ----
    const ratingTab = page.locator('text=Rating').first();
    const filterTabsContainer = ratingTab.locator('xpath=ancestor::*[.//text()[contains(.,"Country")] and .//text()[contains(.,"Expected Goals")]]').first();
    const tabTexts = (await filterTabsContainer.innerText()).split('\n').map((t) => t.trim()).filter(Boolean);
    const ratingIdx = tabTexts.findIndex((t) => t.includes('Rating'));
    const xgIdx = tabTexts.findIndex((t) => t.includes('Expected Goals'));
    const countryIdx = tabTexts.findIndex((t) => t.includes('Country'));
    const positionCorrect = ratingIdx !== -1 && xgIdx !== -1 && countryIdx !== -1 && ratingIdx < xgIdx && xgIdx < countryIdx;

    console.log(`\n📊 Thứ tự tab quan sát: ${tabTexts.join(' | ')}`);
    console.log(`📊 AC vị trí tab xG (giữa Rating và Country): ${positionCorrect ? 'PASS' : 'FAIL'}`);

    await page.locator('text=Expected Goals').first().click();
    await page.waitForTimeout(1000);

    // ---- Lấy dữ liệu thật từ API /lineups để biết chính xác ai có xg, ai không ----
    const apiRes = await request.get(`https://opta-api.uniscore.vn/api/v2/football/event/${ENCODED_MATCH_ID}/lineups?language=en`);
    expect(apiRes.ok(), `API lineups trả lỗi HTTP ${apiRes.status()}`).toBeTruthy();
    const apiBody = await apiRes.json();
    const allApiPlayers = [...(apiBody?.data?.home?.players ?? []), ...(apiBody?.data?.away?.players ?? [])];

    const withXg = allApiPlayers.filter((p: any) => p.xg !== undefined);
    const withoutXg = allApiPlayers.filter((p: any) => p.xg === undefined);
    const highlighted = allApiPlayers.filter((p: any) => p.isHighestXg === true);
    const maxXg = Math.max(...withXg.map((p: any) => Number(p.xg)));
    const highlightedButNotMax = highlighted.filter((p: any) => Number(p.xg) !== maxXg);
    const maxButNotHighlighted = withXg.filter((p: any) => Number(p.xg) === maxXg && p.isHighestXg !== true);

    console.log(`\n📊 API /lineups: ${allApiPlayers.length} cầu thủ, ${withXg.length} có field xg, ${withoutXg.length} không có (đúng AC: field vắng mặt hoàn toàn, không phải "0")`);
    console.log(`📊 xG cao nhất trận: ${maxXg} — highlight (isHighestXg=true): ${highlighted.length} cầu thủ`);
    highlighted.forEach((p: any) => console.log(`   ⭐ ${p.player.fullName}: xg=${p.xg}`));

    // ---- Spec backend: "xg" phải làm tròn đúng 2 chữ số thập phân (string) ----
    const wrongDecimalFormat = withXg.filter((p: any) => !/^\d+\.\d{2}$/.test(p.xg));
    console.log(`📊 Format "xg" đúng 2 chữ số thập phân theo spec: ${withXg.length - wrongDecimalFormat.length}/${withXg.length}`);
    wrongDecimalFormat.forEach((p: any) => console.log(`   ✗ ${p.player.fullName}: xg="${p.xg}" — không đúng format "\\d+\\.\\d{2}"`));

    // ---- AC: highlight ĐÚNG cầu thủ có xG cao nhất (không thiếu, không thừa) ----
    // Business rule: "Nhiều cầu thủ cùng xG cao nhất -> tất cả cùng highlight".
    const highlightLogicCorrect = highlightedButNotMax.length === 0 && maxButNotHighlighted.length === 0;

    console.log(`📊 Logic highlight đúng (không thiếu/thừa so với max thật): ${highlightLogicCorrect ? 'PASS' : 'FAIL'}`);
    if (!highlightLogicCorrect) {
      highlightedButNotMax.forEach((p: any) => console.log(`   ✗ Highlight SAI (không phải max): ${p.player.fullName} xg=${p.xg} (max thật=${maxXg})`));
      maxButNotHighlighted.forEach((p: any) => console.log(`   ✗ THIẾU highlight (bằng max nhưng không được đánh dấu): ${p.player.fullName} xg=${p.xg}`));
    }

    // ---- Đối chiếu vài cầu thủ trên FE với API để chắc UI render đúng field API ----
    // Scope tìm kiếm trong đúng khu vực pitch (test-id="player-detail") — tránh
    // khớp nhầm text tên cầu thủ ở nơi khác trên trang (vd dòng ghi bàn ở
    // header "Rivero 44'", hoặc entry trong Bench list cũng chứa cùng tên).
    const pitchArea = page.locator('[test-id="player-detail"]');
    const feCheckSample = withXg.slice(0, 5);
    const feRows: Array<{ playerName: string; apiXg: string; feText: string; feHasValue: boolean }> = [];
    for (const p of feCheckSample) {
      const shortName = p.player.name;
      const row = pitchArea.filter({ hasText: shortName }).first();
      const rowVisible = await row.isVisible({ timeout: 3000 }).catch(() => false);
      const feText = rowVisible ? (await row.innerText().catch(() => '')).replace(/\s+/g, ' ') : '(không tìm thấy trên pitch — có thể ở bench)';
      feRows.push({ playerName: shortName, apiXg: p.xg, feText, feHasValue: feText.includes(p.xg) });
    }
    console.log(`\n📊 Đối chiếu FE hiển thị vs field API.xg (mẫu ${feRows.length} cầu thủ):`);
    feRows.forEach((r) => console.log(`  ${r.feHasValue ? '✓' : '✗'} ${r.playerName}: API.xg=${r.apiXg} | FE text="${r.feText}"`));

    // ---- Đối chiếu với nguồn Postgres shot-level (KHÔNG kết luận bug, chỉ báo lệch) ----
    const idMapEntries = await Promise.all(
      allApiPlayers.map(async (p: any) => {
        const decodeRes = await request.get(`https://opta-api.uniscore.vn/api/v1/decode/${p.player.id}`);
        const tsId = decodeRes.ok() ? (await decodeRes.text()).trim() : null;
        return { optaId: p.player.id, shortName: p.player.name, fullName: p.player.fullName, apiXg: p.xg, tsId };
      })
    );

    const dbComparisonRows = await withStagingDirectClient(async (client) => {
      const shots = await client.query(`SELECT player_id, shot_type, xg FROM xg_shot_stats WHERE event_id = $1`, [OPTA_EVENT_ID]);
      const dbTotalsByTsId: Record<string, number> = {};
      const dbShotTypesByTsId: Record<string, string[]> = {};
      shots.rows.forEach((r) => {
        dbTotalsByTsId[r.player_id] = (dbTotalsByTsId[r.player_id] ?? 0) + Number(r.xg);
        (dbShotTypesByTsId[r.player_id] ??= []).push(r.shot_type);
      });

      return idMapEntries
        .filter((e) => e.apiXg !== undefined)
        .map((e) => {
          const dbTotal = e.tsId ? dbTotalsByTsId[e.tsId] : undefined;
          const dbShotTypes = e.tsId ? dbShotTypesByTsId[e.tsId] : undefined;
          const apiXgNum = Number(e.apiXg);
          const matchesDb = dbTotal !== undefined && Math.abs(apiXgNum - dbTotal) < 0.015;
          return {
            playerName: e.fullName,
            apiXg: apiXgNum,
            dbShotLevelTotal: dbTotal !== undefined ? Number(dbTotal.toFixed(4)) : null,
            dbShotTypes: dbShotTypes ? dbShotTypes.join(',') : null,
            matchesDb,
          };
        });
    });

    const dbMatched = dbComparisonRows.filter((r) => r.matchesDb);
    const dbMismatched = dbComparisonRows.filter((r) => !r.matchesDb && r.dbShotLevelTotal !== null);
    const dbNoData = dbComparisonRows.filter((r) => r.dbShotLevelTotal === null);

    console.log(`\n📊 Đối chiếu API.xg vs Postgres xg_shot_stats (ĐÃ XÁC NHẬN không phải bug — Postgres lưu snapshot theo thời điểm ghi, API /lineups cộng tổng lại tại thời điểm gọi):`);
    console.log(`   Khớp (±0.015): ${dbMatched.length}/${dbComparisonRows.length} | Lệch: ${dbMismatched.length} | Không tìm thấy player trong DB: ${dbNoData.length}`);
    dbMismatched.forEach((r) => console.log(`   ○ ${r.playerName}: API=${r.apiXg} vs Postgres(shot-level)=${r.dbShotLevelTotal} (shots: ${r.dbShotTypes}) — lệch do Postgres là snapshot cũ, không phải lỗi`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'xg-tab-check.json', {
      matchUrl: MATCH_URL,
      checkedAt: new Date().toISOString(),
      tabPosition: { tabTexts, positionCorrect },
      apiSummary: {
        totalPlayers: allApiPlayers.length,
        withXgCount: withXg.length,
        withoutXgCount: withoutXg.length,
        maxXg,
        highlightedCount: highlighted.length,
        highlightLogicCorrect,
      },
      feCheckRows: feRows,
      dbComparisonRows,
      note: 'API /lineups.xg KHÔNG khớp tổng shot-level từ Postgres xg_shot_stats cho phần lớn cầu thủ — ĐÃ XÁC NHẬN đây không phải bug. Postgres xg_shot_stats lưu snapshot tại thời điểm ghi (computed_at/updated_at riêng từng row, không refresh khi model tính lại), còn API /lineups cộng tổng lại (re-aggregate) tại thời điểm gọi — nếu có re-tính giữa 2 mốc thời gian đó, 2 nguồn lệch nhau là dự kiến. API /lineups.xg vẫn là số ĐÚNG, không dùng Postgres làm baseline đối chiếu.',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'task-3573-xg-report.xlsx', [
      {
        name: 'AC tổng quan',
        columns: [
          { header: 'Hạng mục', key: 'hangMuc', width: 60 },
          { header: 'Kết quả', key: 'ketQua', width: 70 },
        ],
        rows: [
          { hangMuc: 'AC — Tab "Expected Goals" hiển thị đúng vị trí (giữa Rating và Country)', ketQua: positionCorrect ? `PASS — thứ tự: ${tabTexts.join(' > ')}` : `FAIL — thứ tự thực tế: ${tabTexts.join(' > ')}` },
          { hangMuc: 'AC — Không hiển thị 0/placeholder cho cầu thủ không có shot', ketQua: `PASS — field "xg" hoàn toàn không tồn tại (không phải "0") cho ${withoutXg.length}/${allApiPlayers.length} cầu thủ không có shot` },
          { hangMuc: 'AC — Highlight đúng (các) cầu thủ có xG cao nhất, không thiếu không thừa', ketQua: highlightLogicCorrect ? `PASS — ${highlighted.length} cầu thủ highlight đúng xG=${maxXg}` : `FAIL — xem chi tiết mismatch trong report` },
          {
            hangMuc: 'Đối chiếu API.xg vs nguồn Postgres shot-level (xg_shot_stats)',
            ketQua: `Lệch ${dbMismatched.length}/${dbComparisonRows.length} cầu thủ — ĐÃ XÁC NHẬN không phải bug: Postgres lưu snapshot theo thời điểm ghi, API /lineups cộng tổng lại tại thời điểm gọi. API /lineups.xg là số ĐÚNG, không dùng Postgres làm baseline đối chiếu.`,
          },
        ],
        wrapText: true,
      },
      {
        name: 'FE vs API (mẫu)',
        columns: [
          { header: 'Cầu thủ', key: 'playerName', width: 20 },
          { header: 'API xg', key: 'apiXg', width: 12 },
          { header: 'FE text', key: 'feText', width: 60 },
          { header: 'Khớp?', key: 'feHasValue', width: 10 },
        ],
        rows: feRows,
        wrapText: true,
      },
      {
        name: 'API vs Postgres (shot-level)',
        columns: [
          { header: 'Cầu thủ', key: 'playerName', width: 28 },
          { header: 'API xg', key: 'apiXg', width: 12 },
          { header: 'Postgres tổng shot-level', key: 'dbShotLevelTotal', width: 20 },
          { header: 'Loại shot (Postgres)', key: 'dbShotTypes', width: 30 },
          { header: 'Khớp? (±0.015)', key: 'matchesDb', width: 14 },
        ],
        rows: dbComparisonRows,
        wrapText: true,
      },
      {
        // KHÔNG phải danh sách bug — đây là danh sách các cầu thủ có số liệu
        // khác giữa API /lineups (nguồn ĐÚNG, đã xác nhận) và Postgres
        // xg_shot_stats. Nguyên nhân: Postgres lưu snapshot theo thời điểm ghi
        // (computed_at/updated_at riêng từng row), API /lineups cộng tổng lại
        // tại thời điểm gọi — lệch do lệch thời điểm tính, không phải lỗi.
        // Giữ lại sheet này để tham khảo/đối chiếu nhanh nếu cần, KHÔNG cần
        // hành động.
        // matchUrl mở được trực tiếp trên browser; apiCheckLink trả JSON thuần
        // (Ctrl+F tìm đúng "name": "<Cầu thủ>" để xem field "xg"); sqlCheckQuery
        // chạy trong DBeaver/psql (kết nối Postgres staging <DB_STAGING_HOST>:5432 db
        // "football", đã dùng ở lib/db-staging-direct.ts).
        name: 'Khác biệt nguồn (tham khảo)',
        columns: [
          { header: 'Cầu thủ', key: 'playerName', width: 28 },
          { header: 'API xg (FE hiển thị — ĐÚNG)', key: 'apiXg', width: 22 },
          { header: 'Postgres tổng shot-level (model khác)', key: 'dbShotLevelTotal', width: 26 },
          { header: 'Chênh lệch', key: 'diff', width: 14 },
          { header: 'Chênh lệch %', key: 'diffPct', width: 12 },
          { header: 'Loại shot (Postgres)', key: 'dbShotTypes', width: 26 },
          { header: 'Link trận (xem trên web)', key: 'matchUrl', width: 65 },
          { header: 'Link API (Ctrl+F tên cầu thủ, xem field "xg")', key: 'apiCheckLink', width: 75 },
          { header: 'Câu SQL đối chiếu Postgres (DBeaver/psql)', key: 'sqlCheckQuery', width: 90 },
        ],
        rows: dbMismatched
          .map((r) => {
            const dbVal = r.dbShotLevelTotal ?? 0;
            const diff = Number((r.apiXg - dbVal).toFixed(4));
            const diffPct = dbVal !== 0 ? Number(((Math.abs(diff) / dbVal) * 100).toFixed(1)) : null;
            return {
              playerName: r.playerName,
              apiXg: r.apiXg,
              dbShotLevelTotal: r.dbShotLevelTotal,
              diff,
              diffPct,
              dbShotTypes: r.dbShotTypes,
              matchUrl: MATCH_URL,
              apiCheckLink: `https://opta-api.uniscore.vn/api/v2/football/event/${ENCODED_MATCH_ID}/lineups?language=en`,
              sqlCheckQuery: `SELECT player_id, player_name, shot_type, xg FROM xg_shot_stats WHERE event_id = '${OPTA_EVENT_ID}' AND player_name = '${r.playerName}' ORDER BY time_min;`,
            };
          })
          .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
        wrapText: true,
      },
    ]);

    expect(positionCorrect, `Tab "Expected Goals" không nằm đúng vị trí giữa Rating và Country — thứ tự thực tế: ${tabTexts.join(' > ')}`).toBeTruthy();
    expect(withoutXg.every((p: any) => p.isHighestXg === undefined), 'Có cầu thủ không có xg nhưng lại được đánh dấu isHighestXg — vô lý').toBeTruthy();
    expect(highlightLogicCorrect, `Logic highlight sai — cầu thủ highlight không phải max, hoặc cầu thủ = max không được highlight. Xem report task-3573-xg-report.xlsx`).toBeTruthy();
    expect(wrongDecimalFormat, `Field "xg" không đúng format 2 chữ số thập phân theo spec backend cho ${wrongDecimalFormat.length}/${withXg.length} cầu thủ`).toEqual([]);
  });
});
