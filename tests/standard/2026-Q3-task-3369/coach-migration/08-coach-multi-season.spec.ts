/**
 * TASK 3369 — Case tổng quát: coach lấy 1-2 trận/mùa giải, phủ NHIỀU MÙA
 * GIẢI khác nhau (không chỉ cửa sổ thời gian ngắn 60-90 ngày như các file
 * trước) — đảm bảo migrate đúng cả với data cũ (mùa 2024) và data tương lai
 * xa (mùa 2027).
 *
 * Cách chọn mẫu: quét Mongo `matches` theo field `season` (dạng string, vd
 * "2024/2025") — hệ thống có 8 giá trị season thật (đã xác nhận qua $sample
 * 50k doc): 2023/2024, 2024, 2024/2025, 2025, 2025/2026, 2026, 2026/2027,
 * 2027. Với mỗi season, lấy ngẫu nhiên 60 trận (đa dạng competition_id) qua
 * mapping_matches -> encode -> GET /lineups, lấy 2 coach đầu tiên có data.
 *
 * KẾT QUẢ QUÉT: 14 coach phủ 7/8 season. Season "2023/2024" quét đủ 6/6
 * mapped candidate nhưng KHÔNG tìm được coach nào có data lineup — khả năng
 * trận quá cũ đã bị dọn dữ liệu chi tiết ở nguồn Opta (không phải lỗi test).
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/08-coach-multi-season.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';
import { MULTI_SEASON_COACHES } from './multi-season-samples';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3369-coach-migration';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';

const ENDPOINTS: Array<{ key: string; path: (refId: string) => string }> = [
  { key: 'info', path: (id) => `${id}/info?language=en` },
  { key: 'info/:locale', path: (id) => `${id}/info/en` },
  { key: 'career-history', path: (id) => `${id}/career-history?language=en` },
  { key: 'last-matches', path: (id) => `${id}/last-matches?language=en` },
  { key: 'performance', path: (id) => `${id}/performance?language=en` },
  { key: 'stats', path: (id) => `${id}/stats?language=en` },
  { key: 'career-history-seasons-detail', path: (id) => `${id}/career-history-seasons-detail?language=en` },
];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function fetchAndCompare(request: import('@playwright/test').APIRequestContext, oldUrl: string, newUrl: string) {
  const [oldRes, newRes] = await Promise.all([request.get(oldUrl), request.get(newUrl)]);
  if (!oldRes.ok() || !newRes.ok()) {
    return { equal: false, oldStatus: oldRes.status(), newStatus: newRes.status(), oldData: undefined, newData: undefined };
  }
  const oldBody = await oldRes.json();
  const newBody = await newRes.json();
  const equal = stableStringify(oldBody.data) === stableStringify(newBody.data);
  return { equal, oldStatus: oldRes.status(), newStatus: newRes.status(), oldData: oldBody.data, newData: newBody.data };
}

test.describe('[TASK-3369] Coach — nhiều mùa giải khác nhau (2024 tới 2027)', () => {
  test('Coach từ 7 mùa giải khác nhau — data khớp giữa 2 service (retry 2 lần để loại nhiễu transient)', async ({ request }) => {
    test.setTimeout(300_000);
    const rows: Array<{
      season: string;
      competitionId: number;
      coach: string;
      refId: string;
      matchLabel: string;
      endpoint: string;
      oldUrl: string;
      newUrl: string;
      oldHttpStatus: number;
      newHttpStatus: number;
      dataEqual: boolean;
      diffSummary: string;
    }> = [];

    for (const coach of MULTI_SEASON_COACHES) {
      for (const ep of ENDPOINTS) {
        const oldUrl = `${OLD_BASE}/${ep.path(coach.refId)}`;
        const newUrl = `${NEW_BASE}/${ep.path(coach.refId)}`;

        let result = await fetchAndCompare(request, oldUrl, newUrl);
        if (!result.equal) {
          await new Promise((res) => setTimeout(res, 300));
          result = await fetchAndCompare(request, oldUrl, newUrl);
        }
        if (!result.equal) {
          await new Promise((res) => setTimeout(res, 1500));
          result = await fetchAndCompare(request, oldUrl, newUrl);
        }

        rows.push({
          season: coach.season,
          competitionId: coach.competitionId,
          coach: coach.coachName,
          refId: coach.refId,
          matchLabel: coach.matchLabel,
          endpoint: ep.key,
          oldUrl,
          newUrl,
          oldHttpStatus: result.oldStatus,
          newHttpStatus: result.newStatus,
          dataEqual: result.equal,
          diffSummary: result.equal ? '' : `old.data=${JSON.stringify(result.oldData).slice(0, 200)} | new.data=${JSON.stringify(result.newData).slice(0, 200)}`,
        });
      }
    }

    const mismatches = rows.filter((r) => !r.dataEqual);
    const bySeasonList = [...new Set(MULTI_SEASON_COACHES.map((c) => c.season))];
    const bySeason = bySeasonList.map((season) => {
      const inSeason = rows.filter((r) => r.season === season);
      const matched = inSeason.filter((r) => r.dataEqual);
      const coachCount = new Set(inSeason.map((r) => r.refId)).size;
      return { season, soCoach: coachCount, soMauKiemTra: inSeason.length, soKhop: matched.length };
    });

    console.log(`\n📊 Coach nhiều mùa giải: ${rows.length - mismatches.length}/${rows.length} khớp field "data"`);
    bySeason.forEach((s) => console.log(`   ${s.soKhop === s.soMauKiemTra ? '✓' : '✗'} Mùa ${s.season}: ${s.soCoach} coach, ${s.soKhop}/${s.soMauKiemTra} khớp`));
    mismatches.forEach((r) => console.log(`   ✗ ${r.coach} (mùa ${r.season}) — ${r.endpoint}: ${r.diffSummary}`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'case8-multi-season-check.json', {
      checkedAt: new Date().toISOString(),
      seasonsCovered: bySeasonList,
      totalChecked: rows.length,
      mismatchCount: mismatches.length,
      bySeason,
      rows,
      note: 'Coach lấy 1-2 trận/mùa giải, phủ 7/8 mùa giải thật trong hệ thống (mùa "2023/2024" không tìm được coach có data lineup khi quét — có thể do dữ liệu quá cũ đã bị dọn ở nguồn Opta).',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'case8-multi-season-report.xlsx', [
      {
        name: 'Tong quan theo mua giai',
        columns: [
          { header: 'Mùa giải', key: 'season', width: 14 },
          { header: 'Số coach', key: 'soCoach', width: 12 },
          { header: 'Số mẫu kiểm tra', key: 'soMauKiemTra', width: 16 },
          { header: 'Số khớp', key: 'soKhop', width: 12 },
        ],
        rows: bySeason,
        wrapText: true,
      },
      {
        name: 'Chi tiet tung mau',
        columns: [
          { header: 'Mùa giải', key: 'season', width: 12 },
          { header: 'competition_id', key: 'competitionId', width: 14 },
          { header: 'Coach', key: 'coach', width: 22 },
          { header: 'ref_id', key: 'refId', width: 18 },
          { header: 'Trận', key: 'matchLabel', width: 32 },
          { header: 'Endpoint', key: 'endpoint', width: 30 },
          { header: 'Link API cũ', key: 'oldUrl', width: 65 },
          { header: 'Link API mới', key: 'newUrl', width: 65 },
          { header: 'data khớp?', key: 'dataEqual', width: 12 },
          { header: 'Khác biệt', key: 'diffSummary', width: 80 },
        ],
        rows,
        wrapText: true,
      },
    ]);

    expect(mismatches, `${mismatches.length}/${rows.length} mẫu lệch data giữa old/new qua nhiều mùa giải — xem case8-multi-season-report.xlsx`).toEqual([]);
  });
});
