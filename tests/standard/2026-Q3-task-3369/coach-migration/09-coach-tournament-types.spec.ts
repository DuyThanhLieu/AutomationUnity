/**
 * TASK 3369 — Case tổng quát: coach lấy mẫu theo NHIỀU LOẠI GIẢI ĐẤU khác
 * nhau (World Cup, Champions League, giải Việt Nam, cúp quốc gia, giải nữ,
 * giải trẻ, giải quốc nội lớn) — không chỉ giải ngẫu nhiên như các file
 * trước, đảm bảo migrate đúng ở mọi CẤP ĐỘ/LOẠI giải, không riêng giải club
 * thông thường.
 *
 * LƯU Ý: khác với "mùa giải" (season, đã test ở 08-coach-multi-season.spec.ts)
 * — đây là "loại giải đấu" (tournament type) theo yêu cầu người dùng (ví dụ
 * cụ thể: World Cup, Champions League, V-League Việt Nam).
 *
 * Cách chọn mẫu: quét 8000 trận (cửa sổ ±90/60 ngày) qua GET
 * /football/event/{id} lấy tournament.name + tournament.category.name, lọc
 * theo từ khoá từng loại giải, lấy 2 coach/loại có data /lineups. Kết quả:
 * ĐỦ 2/2 mẫu cho CẢ 7/7 loại giải mục tiêu — không thiếu loại nào.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/09-coach-tournament-types.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';
import { TOURNAMENT_TYPE_COACHES } from './tournament-type-samples';

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

test.describe('[TASK-3369] Coach — nhiều loại giải đấu (World Cup, Champions League, Việt Nam, cúp QG, nữ, trẻ, quốc nội lớn)', () => {
  test('Coach từ 7 loại giải đấu khác nhau — data khớp giữa 2 service (retry 2 lần)', async ({ request }) => {
    test.setTimeout(300_000);
    const rows: Array<{
      tournamentType: string;
      coach: string;
      refId: string;
      matchLabel: string;
      tournamentName: string;
      categoryName: string;
      endpoint: string;
      oldUrl: string;
      newUrl: string;
      dataEqual: boolean;
      diffSummary: string;
    }> = [];

    for (const coach of TOURNAMENT_TYPE_COACHES) {
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
          tournamentType: coach.tournamentType,
          coach: coach.coachName,
          refId: coach.refId,
          matchLabel: coach.matchLabel,
          tournamentName: coach.tournamentName,
          categoryName: coach.categoryName,
          endpoint: ep.key,
          oldUrl,
          newUrl,
          dataEqual: result.equal,
          diffSummary: result.equal ? '' : `old.data=${JSON.stringify(result.oldData).slice(0, 200)} | new.data=${JSON.stringify(result.newData).slice(0, 200)}`,
        });
      }
    }

    const mismatches = rows.filter((r) => !r.dataEqual);
    const typeList = [...new Set(TOURNAMENT_TYPE_COACHES.map((c) => c.tournamentType))];
    const byType = typeList.map((t) => {
      const inType = rows.filter((r) => r.tournamentType === t);
      const matched = inType.filter((r) => r.dataEqual);
      const coachCount = new Set(inType.map((r) => r.refId)).size;
      return { tournamentType: t, soCoach: coachCount, soMauKiemTra: inType.length, soKhop: matched.length };
    });

    console.log(`\n📊 Coach nhiều loại giải: ${rows.length - mismatches.length}/${rows.length} khớp field "data"`);
    byType.forEach((t) => console.log(`   ${t.soKhop === t.soMauKiemTra ? '✓' : '✗'} ${t.tournamentType}: ${t.soCoach} coach, ${t.soKhop}/${t.soMauKiemTra} khớp`));
    mismatches.forEach((r) => console.log(`   ✗ ${r.coach} (${r.tournamentType} — ${r.tournamentName}/${r.categoryName}) — ${r.endpoint}: ${r.diffSummary}`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'case9-tournament-types-check.json', {
      checkedAt: new Date().toISOString(),
      tournamentTypesCovered: typeList,
      totalChecked: rows.length,
      mismatchCount: mismatches.length,
      byType,
      rows,
      note: 'Coach lấy 2 mẫu/loại giải, phủ ĐỦ 7/7 loại giải mục tiêu (World Cup, Champions League, Việt Nam, Cúp quốc gia, giải nữ, giải trẻ, giải quốc nội lớn).',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'case9-tournament-types-report.xlsx', [
      {
        name: 'Tong quan theo loai giai',
        columns: [
          { header: 'Loại giải đấu', key: 'tournamentType', width: 50 },
          { header: 'Số coach', key: 'soCoach', width: 12 },
          { header: 'Số mẫu kiểm tra', key: 'soMauKiemTra', width: 16 },
          { header: 'Số khớp', key: 'soKhop', width: 12 },
        ],
        rows: byType,
        wrapText: true,
      },
      {
        name: 'Chi tiet tung mau',
        columns: [
          { header: 'Loại giải', key: 'tournamentType', width: 40 },
          { header: 'Coach', key: 'coach', width: 22 },
          { header: 'ref_id', key: 'refId', width: 18 },
          { header: 'Trận', key: 'matchLabel', width: 34 },
          { header: 'Tên giải', key: 'tournamentName', width: 26 },
          { header: 'Quốc gia/khu vực', key: 'categoryName', width: 18 },
          { header: 'Endpoint', key: 'endpoint', width: 30 },
          { header: 'data khớp?', key: 'dataEqual', width: 12 },
          { header: 'Khác biệt', key: 'diffSummary', width: 80 },
        ],
        rows,
        wrapText: true,
      },
    ]);

    expect(mismatches, `${mismatches.length}/${rows.length} mẫu lệch data giữa old/new qua nhiều loại giải — xem case9-tournament-types-report.xlsx`).toEqual([]);
  });
});
