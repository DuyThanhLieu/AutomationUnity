/**
 * Kiểm tra màu nền badge rating của cầu thủ trong Lineups (popup/pitch) có
 * đúng theo bảng điều kiện màu sau (theo rating từ API /lineups):
 *
 *   isMvp === true        -> #427DC5 (ưu tiên cao nhất, bỏ qua rating)
 *   rating ≤ 5.9           -> #C54244 (đỏ)
 *   5.9 < rating ≤ 6.4      -> #C57042 (cam)
 *   6.4 < rating ≤ 6.9      -> #C7AF42 (vàng)
 *   6.9 < rating ≤ 7.9      -> #4EC542 (xanh lá)
 *   7.9 < rating ≤ 8.9      -> #42C5A0 (xanh ngọc)
 *   rating > 8.9            -> #42A9C5 (xanh dương)
 *
 * LƯU Ý: field `isMvp` KHÔNG xuất hiện trên API /lineups ở bất kỳ trận nào đã
 * dò qua (4 trận, ~80 cầu thủ) — có thể chưa deploy trên staging tại thời
 * điểm test. File này CHỈ kiểm tra phần màu theo `rating`, KHÔNG kiểm tra
 * nhánh isMvp qua field API (chưa có dữ liệu để verify field đó tồn tại).
 *
 * Badge màu nằm ở style inline "background" của <span> chứa số rating
 * (test-id gần nhất là "sub-line", span có class "ml-3 inline-flex ...").
 * DOM xác nhận qua debug: rating=7.8 -> style="background: rgb(78, 197, 66)"
 * = #4EC542, đúng mức "6.9 < rating ≤ 7.9".
 *
 * BUG PHÁT HIỆN (FE tự suy ra "MVP" sai, không phải do thiếu field isMvp):
 * Ở cả 3/4 trận đã kiểm, đúng 1 cầu thủ bị FE tô màu XANH DƯƠNG #427DC5
 * (đúng màu nhánh isMvp trong bảng) dù rating của họ KHÔNG phải cao nhất cả
 * trận:
 *   - Tijuana vs Cruz Azul: Gilberto Mora rating=9.0 (cao nhất CẢ TRẬN — đúng
 *     theo nhánh "rating > 8.9", nhưng hex #427DC5 lại là hex của isMvp, KHÔNG
 *     phải #42A9C5 — 2 màu xanh dương khác nhau bị lẫn).
 *   - Gnistan vs Ilves Tampere: Adeleke Akinyemi rating=7.8 (cao nhất CẢ TRẬN,
 *     đúng ra phải #4EC542 — bị tô nhầm #427DC5).
 *   - Pisa vs Empoli: Tommaso Marras rating=7.9 bị tô #427DC5, NHƯNG Edoardo
 *     Saporiti (rating=8.2, đội khách) mới là cao nhất CẢ TRẬN và Saporiti lại
 *     được tô ĐÚNG #42C5A0 theo rating của chính mình. Marras chỉ là cầu thủ
 *     rating cao nhất của ĐỘI NHÀ (home), không phải cả trận.
 * => Quy luật quan sát được: FE tô xanh dương #427DC5 cho "cầu thủ rating cao
 * nhất của ĐỘI NHÀ", không phải cầu thủ rating cao nhất CẢ TRẬN và cũng không
 * dùng đúng hex #42A9C5 của nhánh "rating > 8.9". Đây là BUG thật (không phải
 * thiếu field isMvp) — xem sheet "Bug MVP badge sai" trong report.
 *
 * Trận mẫu (đã kết thúc, nhiều mức rating trải đều các mốc):
 *   - Tijuana vs Cruz Azul     o6jamrl1ryc2w7q
 *   - Gnistan vs Ilves Tampere n97akmln834awnv
 *   - Pisa vs Empoli           4m9appl68xaar6b
 *   - ADO Den Haag vs Groningen o8tzjglnheq3w47
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-rating-badge-color/ --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'rating-badge-color';

const MATCHES = [
  { name: 'Tijuana vs Cruz Azul', id: 'o6jamrl1ryc2w7q', url: 'https://staging.uniscore.vn/en/football/match/club-tijuana-cruz-azul/o6jamrl1ryc2w7q' },
  { name: 'Gnistan vs Ilves Tampere', id: 'n97akmln834awnv', url: 'https://staging.uniscore.vn/en/football/match/gnistan-helsinki-ilves-tampere/n97akmln834awnv' },
  { name: 'Pisa vs Empoli', id: '4m9appl68xaar6b', url: 'https://staging.uniscore.vn/en/football/match/pisa-empoli/4m9appl68xaar6b' },
  { name: 'ADO Den Haag vs Groningen', id: 'o8tzjglnheq3w47', url: 'https://staging.uniscore.vn/en/football/match/ado-den-haag-groningen/o8tzjglnheq3w47' },
];

// Bảng điều kiện màu theo rating (không tính nhánh isMvp — xem ghi chú đầu file).
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

test.describe('[Rating badge] Màu nền badge rating cầu thủ trong Lineups theo bảng điều kiện', () => {
  test('Màu badge rating trên FE khớp đúng mức rating trong bảng điều kiện (bỏ qua nhánh isMvp — chưa có data)', async ({ page, request }) => {
    const rows: Array<{
      tran: string;
      cauThu: string;
      rating: number;
      mucDungTheoBang: string;
      hexDung: string;
      mauFeThucTe: string;
      hexFeThucTe: string | null;
      khop: boolean;
    }> = [];

    const bugRows: Array<{
      tran: string;
      cauThuBiToNham: string;
      ratingBiToNham: number;
      mauFeThucTe: string;
      cauThuCaoNhatCaTran: string;
      ratingCaoNhatCaTran: number;
      giaiThich: string;
    }> = [];

    for (const m of MATCHES) {
      const apiRes = await request.get(`https://opta-api.uniscore.vn/api/v2/football/event/${m.id}/lineups?language=en`);
      if (!apiRes.ok()) continue;
      const apiBody = await apiRes.json();
      const homePlayers = apiBody?.data?.home?.players ?? [];
      const awayPlayers = apiBody?.data?.away?.players ?? [];
      const allPlayers = [...homePlayers, ...awayPlayers];
      // rating="0.0" nghĩa là chưa có rating (chưa đá / không đủ data) — bỏ qua, không map vào bảng màu.
      const ratedPlayers = allPlayers.filter((p: any) => p.rating && Number(p.rating) > 0);
      const ratedHome = homePlayers.filter((p: any) => p.rating && Number(p.rating) > 0);

      const matchMaxRating = ratedPlayers.length ? Math.max(...ratedPlayers.map((p: any) => Number(p.rating))) : null;
      const matchMaxPlayer = ratedPlayers.find((p: any) => Number(p.rating) === matchMaxRating);
      const homeMaxRating = ratedHome.length ? Math.max(...ratedHome.map((p: any) => Number(p.rating))) : null;
      const homeMaxPlayer = ratedHome.find((p: any) => Number(p.rating) === homeMaxRating);

      await page.goto(m.url, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.locator('text=Lineups').first().click();
      await page.waitForTimeout(1200);

      const pitchArea = page.locator('[test-id="player-detail"]');

      // ---- Kiểm tra riêng: cầu thủ rating cao nhất ĐỘI NHÀ có bị tô nhầm màu isMvp (#427DC5) không, dù không phải cao nhất CẢ TRẬN ----
      if (homeMaxPlayer && matchMaxPlayer && homeMaxPlayer.player.id !== matchMaxPlayer.player.id) {
        const shortName = homeMaxPlayer.player.name;
        const row = pitchArea.filter({ hasText: shortName }).first();
        const rowVisible = await row.isVisible({ timeout: 2000 }).catch(() => false);
        if (rowVisible) {
          const badge = row.locator(`text=${homeMaxPlayer.rating}`).first();
          const badgeVisible = await badge.isVisible({ timeout: 2000 }).catch(() => false);
          if (badgeVisible) {
            const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
            const feRgb = bg ? parseRgbString(bg) : null;
            const mvpRgb = hexToRgb('#427DC5');
            const wronglyTintedMvpBlue = feRgb !== null && feRgb.r === mvpRgb.r && feRgb.g === mvpRgb.g && feRgb.b === mvpRgb.b;
            if (wronglyTintedMvpBlue) {
              bugRows.push({
                tran: m.name,
                cauThuBiToNham: homeMaxPlayer.player.fullName,
                ratingBiToNham: Number(homeMaxPlayer.rating),
                mauFeThucTe: bg ?? '',
                cauThuCaoNhatCaTran: matchMaxPlayer.player.fullName,
                ratingCaoNhatCaTran: Number(matchMaxPlayer.rating),
                giaiThich: `"${homeMaxPlayer.player.fullName}" chỉ là rating cao nhất ĐỘI NHÀ (${homeMaxPlayer.rating}), không phải cao nhất cả trận (đó là "${matchMaxPlayer.player.fullName}" với ${matchMaxPlayer.rating}) — nhưng vẫn bị tô #427DC5 (màu isMvp) thay vì màu đúng theo bảng rating.`,
              });
            }
          }
        }
      }

      for (const p of ratedPlayers) {
        const rating = Number(p.rating);
        const rule = ruleForRating(rating);
        if (!rule) continue;

        const shortName = p.player.name;
        const row = pitchArea.filter({ hasText: shortName }).first();
        const rowVisible = await row.isVisible({ timeout: 2000 }).catch(() => false);
        if (!rowVisible) continue;

        const badge = row.locator(`text=${p.rating}`).first();
        const badgeVisible = await badge.isVisible({ timeout: 2000 }).catch(() => false);
        if (!badgeVisible) continue;

        const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
        const feRgb = bg ? parseRgbString(bg) : null;
        const expectedRgb = hexToRgb(rule.hex);
        const khop = feRgb !== null && feRgb.r === expectedRgb.r && feRgb.g === expectedRgb.g && feRgb.b === expectedRgb.b;

        rows.push({
          tran: m.name,
          cauThu: p.player.fullName,
          rating,
          mucDungTheoBang: rule.label,
          hexDung: rule.hex,
          mauFeThucTe: bg ?? '(không đọc được)',
          hexFeThucTe: feRgb ? `#${((1 << 24) + (feRgb.r << 16) + (feRgb.g << 8) + feRgb.b).toString(16).slice(1).toUpperCase()}` : null,
          khop,
        });
      }
    }

    const mismatches = rows.filter((r) => !r.khop);
    const byBucket = RULES.map((rule) => {
      const inBucket = rows.filter((r) => r.mucDungTheoBang === rule.label);
      const matched = inBucket.filter((r) => r.khop);
      return { mucMau: rule.label, hex: rule.hex, soMauKiemTra: inBucket.length, soKhop: matched.length };
    });

    console.log(`\n📊 Màu badge rating FE vs bảng điều kiện: ${rows.length - mismatches.length}/${rows.length} khớp`);
    byBucket.forEach((b) => console.log(`   ${b.soKhop === b.soMauKiemTra && b.soMauKiemTra > 0 ? '✓' : b.soMauKiemTra === 0 ? '○' : '✗'} ${b.mucMau} (${b.hex}): ${b.soKhop}/${b.soMauKiemTra} khớp`));
    mismatches.forEach((r) => console.log(`   ✗ ${r.tran} — ${r.cauThu}: rating=${r.rating} → đúng phải ${r.hexDung}, FE hiện ${r.hexFeThucTe ?? r.mauFeThucTe}`));

    const noSampleBuckets = byBucket.filter((b) => b.soMauKiemTra === 0);
    if (noSampleBuckets.length) {
      console.log(`\n⚠️ Chưa tìm được mẫu thực tế cho mức: ${noSampleBuckets.map((b) => b.mucMau).join(', ')} — cần trận khác có rating trong khoảng này để phủ đủ toàn bảng.`);
    }

    console.log(`\n📊 BUG — cầu thủ rating cao nhất ĐỘI NHÀ bị tô nhầm màu isMvp (#427DC5) dù không phải cao nhất cả trận: ${bugRows.length} trường hợp`);
    bugRows.forEach((b) => console.log(`   ✗ ${b.tran}: ${b.giaiThich}`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'rating-badge-color-check.json', {
      checkedAt: new Date().toISOString(),
      matches: MATCHES,
      totalChecked: rows.length,
      mismatchCount: mismatches.length,
      byBucket,
      rows,
      bugRows,
      note: 'Nhánh isMvp===true (#427DC5, ưu tiên cao nhất) CHƯA verify được qua field API — field isMvp không xuất hiện trên API /lineups ở các trận đã dò trên staging. Tuy nhiên phát hiện FE tự tô màu #427DC5 (đúng hex isMvp trong bảng) cho cầu thủ rating cao nhất ĐỘI NHÀ — không phải cao nhất cả trận — đây LÀ BUG THẬT, xem bugRows.',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'rating-badge-color-report.xlsx', [
      {
        name: 'Tong quan theo muc mau',
        columns: [
          { header: 'Mức màu (theo rating)', key: 'mucMau', width: 30 },
          { header: 'Hex đúng', key: 'hex', width: 12 },
          { header: 'Số mẫu kiểm tra', key: 'soMauKiemTra', width: 16 },
          { header: 'Số khớp', key: 'soKhop', width: 12 },
        ],
        rows: byBucket,
        wrapText: true,
      },
      {
        name: 'Chi tiet tung cau thu',
        columns: [
          { header: 'Trận', key: 'tran', width: 26 },
          { header: 'Cầu thủ', key: 'cauThu', width: 20 },
          { header: 'Rating', key: 'rating', width: 10 },
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
        name: 'Bug MVP badge sai',
        columns: [
          { header: 'Trận', key: 'tran', width: 26 },
          { header: 'Cầu thủ bị tô nhầm', key: 'cauThuBiToNham', width: 22 },
          { header: 'Rating (bị tô nhầm)', key: 'ratingBiToNham', width: 16 },
          { header: 'Màu FE thực tế (rgb, = isMvp #427DC5)', key: 'mauFeThucTe', width: 30 },
          { header: 'Cầu thủ cao nhất CẢ TRẬN (đúng)', key: 'cauThuCaoNhatCaTran', width: 26 },
          { header: 'Rating cao nhất cả trận', key: 'ratingCaoNhatCaTran', width: 18 },
          { header: 'Giải thích', key: 'giaiThich', width: 80 },
        ],
        rows: bugRows,
        wrapText: true,
      },
    ]);

    expect(mismatches, `Màu badge rating lệch bảng điều kiện cho ${mismatches.length}/${rows.length} cầu thủ — xem report rating-badge-color-report.xlsx`).toEqual([]);
    expect(
      bugRows,
      `BUG: ${bugRows.length} trường hợp FE tô màu isMvp (#427DC5) cho cầu thủ rating cao nhất ĐỘI NHÀ dù không phải cao nhất cả trận — xem sheet "Bug MVP badge sai"`
    ).toEqual([]);
  });
});
