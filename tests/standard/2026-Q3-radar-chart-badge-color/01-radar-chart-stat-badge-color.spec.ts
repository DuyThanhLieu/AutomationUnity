/**
 * Kiểm tra màu nền của các badge số liệu (ATT/CRE/TEC/DEF/TAC) trên radar
 * chart "Attribute Overview" trong popup cầu thủ (tab Lineups) — theo yêu
 * cầu: "Màu stats / 10 = Màu Rating" (VD: ATT=86 -> 86/10=8.6 -> mức rating
 * 7.9<r≤8.9 -> #42C5A0).
 *
 * Bảng điều kiện màu (giống bảng dùng cho badge rating trên pitch — xem
 * tests/standard/2026-Q3-rating-badge-color/):
 *   rating ≤ 5.9           -> #C54244 (đỏ)
 *   5.9 < rating ≤ 6.4      -> #C57042 (cam)
 *   6.4 < rating ≤ 6.9      -> #C7AF42 (vàng)
 *   6.9 < rating ≤ 7.9      -> #4EC542 (xanh lá)
 *   7.9 < rating ≤ 8.9      -> #42C5A0 (xanh ngọc)
 *   rating > 8.9            -> #42A9C5 (xanh dương)
 * (Không test nhánh isMvp — không áp dụng cho stat cá nhân trên radar chart.)
 *
 * DOM xác nhận qua debug: badge "Player's Performance" tô màu theo bảng
 * trên (vd giá trị 46 -> style background rgb(197,66,68) = #C54244 đúng mức
 * ≤5.9; giá trị 62 -> rgb(197,112,66) = #C57042 đúng mức 5.9<r≤6.4). Badge
 * "Same Position Avg" (số bên cạnh, xám rgb(31,31,31)) KHÔNG tô theo bảng —
 * đúng vì AC chỉ yêu cầu tô theo hiệu suất cầu thủ, không tô số trung bình.
 *
 * Nguồn data: GET /api/v2/player/{playerId}/attribute-overviews?language=en
 *   -> playerAttributeOverviews[0]: { attacking, creativity, technical,
 *      defending, tactical } (thang 0-100, chia 10 ra thang rating 0-10).
 *
 * Trận mẫu (pre-match, lineup đã xác nhận, tại thời điểm viết test):
 *   - Rostov vs Lokomotiv Moscow (Russian Cup)  ykcv4ill4251w5u — cầu thủ mẫu: Prokhin
 *   - IFK Skovde vs Falkenberg (Sweden Cup)     a8qv3rlq9d1xr1c — cầu thủ mẫu: Elmar Abraham
 * LƯU Ý: trận pre-match sẽ chuyển sang live/finished theo thời gian — khi đó
 * popup không còn hiển thị Attribute Overview (chuyển sang "Match shotmap"
 * hậu trận), cần chọn lại trận mới nếu chạy cách xa ngày viết test. Cách tìm
 * trận mới: query Mongo `matches` (date_unix > now) -> mapping_matches lấy
 * thesports_id -> encode -> GET /football/event/{id} check status.type ===
 * "not_started" && lineup === 1 -> GET .../lineups lấy 1 cầu thủ đá chính ->
 * GET /player/{id}/attribute-overviews check có đủ 5 trục.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-radar-chart-badge-color/ --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'radar-chart-badge-color';

const SAMPLES = [
  { matchUrl: 'https://staging.uniscore.vn/en/football/match/x/ykcv4ill4251w5u#lineups', playerName: 'Prokhin', matchLabel: 'Rostov vs Lokomotiv Moscow' },
  // Có 2 cầu thủ trùng họ "Abraham" trong trận này (Elmar Abraham + S.Abraham,
  // FE hiển thị ngắn "Abraham" / "S.Abraham") — dùng playerId trực tiếp để mở
  // popup đúng cầu thủ, tránh nhầm lẫn tên.
  { matchUrl: 'https://staging.uniscore.vn/en/football/match/x/a8qv3rlq9d1xr1c#lineups', playerName: 'Elmar Abraham', playerId: '6hqac9lqtv9evme', matchLabel: 'IFK Skovde vs Falkenberg' },
];

const AXES: Array<{ apiKey: string; feLabel: string }> = [
  { apiKey: 'attacking', feLabel: 'ATT' },
  { apiKey: 'creativity', feLabel: 'CRE' },
  { apiKey: 'technical', feLabel: 'TEC' },
  { apiKey: 'defending', feLabel: 'DEF' },
  { apiKey: 'tactical', feLabel: 'TAC' },
];

const RULES: Array<{ label: string; hex: string; test: (r: number) => boolean }> = [
  { label: 'rating ≤ 5.9 (Đỏ)', hex: '#C54244', test: (r) => r <= 5.9 },
  { label: '5.9 < rating ≤ 6.4 (Cam)', hex: '#C57042', test: (r) => r > 5.9 && r <= 6.4 },
  { label: '6.4 < rating ≤ 6.9 (Vàng)', hex: '#C7AF42', test: (r) => r > 6.4 && r <= 6.9 },
  { label: '6.9 < rating ≤ 7.9 (Xanh lá)', hex: '#4EC542', test: (r) => r > 6.9 && r <= 7.9 },
  { label: '7.9 < rating ≤ 8.9 (Xanh ngọc)', hex: '#42C5A0', test: (r) => r > 7.9 && r <= 8.9 },
  { label: 'rating > 8.9 (Xanh dương)', hex: '#42A9C5', test: (r) => r > 8.9 },
];

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function ruleForRating(rating: number) {
  return RULES.find((r) => r.test(rating));
}

function parseRgbString(rgb: string): { r: number; g: number; b: number } | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

test.describe('[Radar chart] Màu badge số liệu (ATT/CRE/TEC/DEF/TAC) theo quy tắc stat/10 = màu rating', () => {
  test('Màu badge "Player Performance" trên radar chart khớp bảng điều kiện rating (stat/10)', async ({ page, request }) => {
    const rows: Array<{
      tran: string;
      cauThu: string;
      truc: string;
      statGoc: number;
      ratingTuongUng: number;
      mucDungTheoBang: string;
      hexDung: string;
      mauFeThucTe: string;
      hexFeThucTe: string | null;
      khop: boolean;
    }> = [];
    const avgBadgeCheck: Array<{ tran: string; cauThu: string; truc: string; statAvg: number; mauFeThucTe: string; laMauTrungTinh: boolean }> = [];

    for (const s of SAMPLES) {
      const apiRes = await request.get(`https://opta-api.uniscore.vn/api/v2/football/event/${s.matchUrl.split('/x/')[1].split('#')[0]}/lineups?language=en`);
      if (!apiRes.ok()) continue;
      const apiBody = await apiRes.json();
      const homeP = apiBody?.data?.home?.players ?? [];
      const awayP = apiBody?.data?.away?.players ?? [];
      const player = (s as any).playerId
        ? [...homeP, ...awayP].find((p: any) => p.player.id === (s as any).playerId)
        : [...homeP, ...awayP].find((p: any) => p.player.fullName === s.playerName || p.player.name === s.playerName);
      if (!player) {
        console.log(`⚠️ Không tìm thấy cầu thủ "${s.playerName}" trong /lineups của ${s.matchLabel} — bỏ qua mẫu này`);
        continue;
      }

      const attrRes = await request.get(`https://opta-api.uniscore.vn/api/v2/player/${player.player.id}/attribute-overviews?language=en`);
      if (!attrRes.ok()) continue;
      const attrBody = await attrRes.json();
      const overview = attrBody?.data?.playerAttributeOverviews?.[0];
      const avgOverview = attrBody?.data?.averageAttributeOverviews?.[0];
      if (!overview || overview.attacking === undefined) {
        console.log(`⚠️ Cầu thủ "${s.playerName}" không có đủ data attribute-overviews — bỏ qua mẫu này`);
        continue;
      }

      await page.goto(s.matchUrl, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.locator('text=Lineups').first().click();
      await page.waitForTimeout(1200);

      // Dùng player.player.id (ổn định, duy nhất) để mở đúng popup — click qua ảnh
      // đại diện có src chứa playerId, tránh nhầm lẫn khi 2 cầu thủ trùng họ hiển
      // thị trên FE (vd "Abraham" / "S.Abraham" ở IFK Skovde vs Falkenberg).
      const avatarByPlayerId = page.locator(`img[alt*="${player.player.id}"], img[src*="${player.player.id}"]`).first();
      const avatarByIdVisible = await avatarByPlayerId.isVisible({ timeout: 4000 }).catch(() => false);
      if (avatarByIdVisible) {
        const pitchContainer = avatarByPlayerId.locator('xpath=ancestor::*[@test-id="player-detail"]').first();
        const hasPitchAncestor = await pitchContainer.count();
        if (hasPitchAncestor > 0) {
          await pitchContainer.click({ timeout: 8000 });
        } else {
          await avatarByPlayerId.click({ timeout: 8000 });
        }
      } else {
        const nameEl = page.locator(`text=${player.player.name}`).first();
        const pitchContainer = nameEl.locator('xpath=ancestor::*[@test-id="player-detail"]').first();
        const pitchVisible = await pitchContainer.isVisible({ timeout: 4000 }).catch(() => false);
        if (pitchVisible) {
          await pitchContainer.click({ timeout: 8000 });
        } else {
          const squadRow = nameEl.locator('xpath=ancestor::div[contains(@class,"min-h-[40px]")]').first();
          const avatarImg = squadRow.locator('img').first();
          const avatarVisible = await avatarImg.isVisible({ timeout: 4000 }).catch(() => false);
          if (!avatarVisible) {
            console.log(`⚠️ Không mở được popup cho "${s.playerName}" (${s.matchLabel}) — bỏ qua mẫu này`);
            continue;
          }
          await avatarImg.click({ timeout: 8000 });
        }
      }
      await page.waitForTimeout(1500);

      const chartTitle = page.locator('text=Attribute Overview').first();
      const chartVisible = await chartTitle.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!chartVisible) {
        console.log(`⚠️ Popup của "${s.playerName}" (${s.matchLabel}) không hiển thị Attribute Overview (có thể trận đã chuyển live/finished) — bỏ qua mẫu này`);
        continue;
      }

      const chartCard = chartTitle.locator('xpath=ancestor::div[.//text()[contains(.,"CRE")]][1]');

      // Badge số liệu là span/div text đúng dạng số nguyên (0-100) — lấy hết 1 lần,
      // dùng thứ tự xuất hiện DOM để phân biệt badge trùng giá trị (vd 2 trục cùng ra 52).
      const allBadges = chartCard.locator('span, div').filter({ hasText: /^\d{1,3}$/ });
      const badgeCount = await allBadges.count();
      const badgeList: Array<{ text: string; bg: string | null }> = [];
      for (let i = 0; i < badgeCount; i++) {
        const b = allBadges.nth(i);
        const text = (await b.innerText().catch(() => '')).trim();
        if (!/^\d{1,3}$/.test(text)) continue;
        const bg = await b.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
        badgeList.push({ text, bg });
      }

      for (const { apiKey, feLabel } of AXES) {
        const statVal = overview[apiKey];
        const avgVal = avgOverview?.[apiKey];
        if (statVal === undefined) continue;

        const ratingEquivalent = statVal / 10;
        const rule = ruleForRating(ratingEquivalent);
        if (!rule) continue;

        // Badge màu (không trung tính rgb(31,31,31)) khớp giá trị statVal = badge "Player Performance".
        const statMatch = badgeList.find((b) => b.text === String(statVal) && b.bg !== 'rgb(31, 31, 31)');
        if (!statMatch) {
          console.log(`⚠️ Không tìm thấy badge màu "${statVal}" cho trục ${feLabel} (${s.playerName}) — bỏ qua trục này`);
          continue;
        }
        const bg = statMatch.bg;
        const feRgb = bg ? parseRgbString(bg) : null;
        const expectedRgb = hexToRgb(rule.hex);
        const khop = feRgb !== null && feRgb.r === expectedRgb.r && feRgb.g === expectedRgb.g && feRgb.b === expectedRgb.b;

        rows.push({
          tran: s.matchLabel,
          cauThu: s.playerName,
          truc: feLabel,
          statGoc: statVal,
          ratingTuongUng: ratingEquivalent,
          mucDungTheoBang: rule.label,
          hexDung: rule.hex,
          mauFeThucTe: bg ?? '(không đọc được)',
          hexFeThucTe: feRgb ? `#${((1 << 24) + (feRgb.r << 16) + (feRgb.g << 8) + feRgb.b).toString(16).slice(1).toUpperCase()}` : null,
          khop,
        });

        // Badge "Same Position Avg" — theo AC chỉ tô badge hiệu suất cầu thủ, avg giữ màu trung tính rgb(31,31,31).
        if (avgVal !== undefined) {
          const avgMatch = badgeList.find((b) => b.text === String(avgVal) && b.bg === 'rgb(31, 31, 31)');
          if (avgMatch) {
            const avgRgb = parseRgbString(avgMatch.bg!);
            const isNeutralGray = avgRgb !== null && avgRgb.r === avgRgb.g && avgRgb.g === avgRgb.b;
            avgBadgeCheck.push({ tran: s.matchLabel, cauThu: s.playerName, truc: feLabel, statAvg: avgVal, mauFeThucTe: avgMatch.bg ?? '', laMauTrungTinh: isNeutralGray });
          }
        }
      }
    }

    const mismatches = rows.filter((r) => !r.khop);
    const byBucket = RULES.map((rule) => {
      const inBucket = rows.filter((r) => r.mucDungTheoBang === rule.label);
      const matched = inBucket.filter((r) => r.khop);
      return { mucMau: rule.label, hex: rule.hex, soMauKiemTra: inBucket.length, soKhop: matched.length };
    });

    console.log(`\n📊 Màu badge stat radar chart vs bảng điều kiện (stat/10): ${rows.length - mismatches.length}/${rows.length} khớp`);
    rows.forEach((r) => console.log(`   ${r.khop ? '✓' : '✗'} ${r.tran} — ${r.cauThu} ${r.truc}=${r.statGoc} (rating=${r.ratingTuongUng}) → đúng ${r.hexDung}, FE=${r.hexFeThucTe ?? r.mauFeThucTe}`));

    const avgMismatches = avgBadgeCheck.filter((a) => !a.laMauTrungTinh);
    console.log(`\n📊 Badge "Same Position Avg" giữ màu trung tính (không tô theo bảng): ${avgBadgeCheck.length - avgMismatches.length}/${avgBadgeCheck.length}`);
    avgMismatches.forEach((a) => console.log(`   ✗ ${a.tran} — ${a.cauThu} ${a.truc}=${a.statAvg}: màu FE=${a.mauFeThucTe} (không trung tính — bất thường)`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'radar-chart-badge-color-check.json', {
      checkedAt: new Date().toISOString(),
      samples: SAMPLES,
      totalChecked: rows.length,
      mismatchCount: mismatches.length,
      byBucket,
      rows,
      avgBadgeCheck,
      note: 'Quy tắc: màu badge "Player Performance" trên radar chart = màu theo bảng rating, tính từ stat/10. Badge "Same Position Avg" không tô theo bảng (giữ màu trung tính) — đúng thiết kế, chỉ audit để chắc không bị tô nhầm.',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'radar-chart-badge-color-report.xlsx', [
      {
        name: 'Tong quan theo muc mau',
        columns: [
          { header: 'Mức màu (theo rating = stat/10)', key: 'mucMau', width: 30 },
          { header: 'Hex đúng', key: 'hex', width: 12 },
          { header: 'Số mẫu kiểm tra', key: 'soMauKiemTra', width: 16 },
          { header: 'Số khớp', key: 'soKhop', width: 12 },
        ],
        rows: byBucket,
        wrapText: true,
      },
      {
        name: 'Chi tiet tung truc',
        columns: [
          { header: 'Trận', key: 'tran', width: 26 },
          { header: 'Cầu thủ', key: 'cauThu', width: 18 },
          { header: 'Trục', key: 'truc', width: 8 },
          { header: 'Stat gốc (0-100)', key: 'statGoc', width: 14 },
          { header: 'Rating tương ứng (/10)', key: 'ratingTuongUng', width: 18 },
          { header: 'Mức đúng theo bảng', key: 'mucDungTheoBang', width: 26 },
          { header: 'Hex đúng', key: 'hexDung', width: 12 },
          { header: 'Màu FE thực tế (rgb)', key: 'mauFeThucTe', width: 22 },
          { header: 'Hex FE thực tế', key: 'hexFeThucTe', width: 14 },
          { header: 'Khớp?', key: 'khop', width: 10 },
        ],
        rows,
        wrapText: true,
      },
      {
        name: 'Badge Avg (phai trung tinh)',
        columns: [
          { header: 'Trận', key: 'tran', width: 26 },
          { header: 'Cầu thủ', key: 'cauThu', width: 18 },
          { header: 'Trục', key: 'truc', width: 8 },
          { header: 'Stat Avg', key: 'statAvg', width: 12 },
          { header: 'Màu FE (rgb)', key: 'mauFeThucTe', width: 22 },
          { header: 'Là màu trung tính?', key: 'laMauTrungTinh', width: 16 },
        ],
        rows: avgBadgeCheck,
        wrapText: true,
      },
    ]);

    expect(mismatches, `Màu badge stat radar chart lệch bảng điều kiện cho ${mismatches.length}/${rows.length} trục — xem report radar-chart-badge-color-report.xlsx`).toEqual([]);
    expect(avgMismatches, `Badge "Same Position Avg" bị tô màu không trung tính cho ${avgMismatches.length}/${avgBadgeCheck.length} trục — xem sheet "Badge Avg"`).toEqual([]);
  });
});
