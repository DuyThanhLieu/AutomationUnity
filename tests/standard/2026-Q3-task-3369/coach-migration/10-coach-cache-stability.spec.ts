/**
 * TASK 3369 — Case: CACHE MISMATCH giữa 2 service — gọi lặp lại nhiều lần
 * cùng 1 coach, đo mức độ ổn định (drift) của mỗi service theo thời gian.
 *
 * SỬA LẦN 2 — QUAN TRỌNG (theo yêu cầu người dùng: "lệch phải là SAI DATA,
 * không phải sai thứ tự"): bản đầu dùng `stableStringify` chỉ sort key của
 * OBJECT, KHÔNG sort phần tử trong ARRAY — nên khi mảng `participations`
 * (trong career-history-seasons-detail) hoặc thứ tự key trong object
 * `points` (trong performance) chỉ đổi CHỖ (thứ tự) mà giá trị từng phần tử
 * giữ nguyên, bản đầu vẫn báo "khác nhau" — đây là FALSE POSITIVE, đã xác
 * nhận qua kiểm tra tay (xem lịch sử: "Copa Ecuador"/"LigaPro A" chỉ đổi vị
 * trí 0↔1 trong participations, giá trị mỗi bên vẫn đúng nguyên; "points"
 * chỉ đổi thứ tự key, giá trị mỗi matchId vẫn đúng).
 *
 * BẢN NÀY sửa `canonicalize()` để sort ĐỆ QUY cả array con theo nội dung đã
 * serialize (JSON.stringify sau khi đã canonicalize phần tử) — coi 2 mảng
 * là "giống nhau" nếu chứa ĐÚNG CÙNG TẬP PHẦN TỬ, bất kể thứ tự. Nhờ vậy,
 * kết quả so sánh giờ chỉ còn phản ánh SAI DATA THẬT (giá trị 1 field nào
 * đó khác nhau giữa 2 lần gọi), bỏ qua hoàn toàn trường hợp chỉ đổi thứ tự.
 *
 * Cách đo: với mỗi coach + endpoint, gọi N lần liên tiếp (cách nhau
 * CALL_INTERVAL_MS) TỚI CÙNG 1 SERVICE, so sánh giữa các lần gọi:
 *   - Nếu tất cả N lần giống nhau (sau khi canonicalize, bỏ qua thứ tự)
 *     -> service đó ổn định (cache nhất quán).
 *   - Nếu có ít nhất 1 lần khác các lần còn lại VỀ GIÁ TRỊ (không phải chỉ
 *     thứ tự) -> ghi nhận "tự thay đổi DATA THẬT" (self-drift).
 * Sau đó mới so cross-service (old vs new) ở lần gọi ĐẦU TIÊN của mỗi bên,
 * cũng sau khi đã canonicalize (bỏ qua khác biệt thứ tự thuần túy).
 *
 * DÙNG LẶP LẠI ĐƯỢC: sau khi dev xoá cache, chạy lại file này để so sánh
 * before/after.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/10-coach-cache-stability.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';
import { COACHES } from './coach-samples';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3369-coach-migration';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';

// Chỉ 2 endpoint đã biết có nguy cơ tự re-compute — không cần đo toàn bộ 7
// endpoint vì 5 endpoint còn lại (info, career-history, last-matches, stats,
// info/:locale) đã xác nhận tĩnh tuyệt đối qua toàn bộ case trước đó.
const VOLATILE_ENDPOINTS: Array<{ key: string; path: (refId: string) => string }> = [
  { key: 'performance', path: (id) => `${id}/performance?language=en` },
  { key: 'career-history-seasons-detail', path: (id) => `${id}/career-history-seasons-detail?language=en` },
];

// Toàn bộ 116 coach (đúng danh sách đã đưa dev xoá cache) — verify lại sau
// khi xoá cache trên CẢ bộ mẫu, không chỉ 6 coach ban đầu.
const SAMPLE_COACHES = COACHES;
const COACH_CONCURRENCY = 8; // chạy song song theo lô để không mất quá lâu (116 coach tuần tự sẽ ~20+ phút)

const CALLS_PER_ENDPOINT = 5;
const CALL_INTERVAL_MS = 2000;

/**
 * Chuẩn hoá giá trị để so sánh CHỈ DỰA TRÊN DATA, bỏ qua khác biệt THỨ TỰ:
 *   - Object: sort theo key (đã có ở bản cũ).
 *   - Array: canonicalize từng phần tử rồi SORT theo chuỗi đã canonicalize
 *     — nên 2 mảng chứa đúng cùng tập phần tử (dù thứ tự gốc khác nhau) sẽ
 *     luôn cho ra cùng 1 chuỗi kết quả.
 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map(canonicalize).sort();
    return `[${items.join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function callNTimes(request: import('@playwright/test').APIRequestContext, url: string, n: number, intervalMs: number) {
  const snapshots: string[] = [];
  for (let i = 0; i < n; i++) {
    const res = await request.get(url);
    const body = res.ok() ? await res.json() : null;
    snapshots.push(canonicalize(body?.data));
    if (i < n - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return snapshots;
}

test.describe('[TASK-3369] Coach — cache stability / self-drift theo thời gian (mỗi service riêng, CHỈ TÍNH SAI DATA THẬT — đã loại trừ sai thứ tự)', () => {
  test(`${SAMPLE_COACHES.length} coach x ${VOLATILE_ENDPOINTS.length} endpoint x ${CALLS_PER_ENDPOINT} lần gọi (cách ${CALL_INTERVAL_MS}ms) — đo self-drift DATA THẬT của mỗi service`, async ({ request }) => {
    test.setTimeout(600_000);

    const rows: Array<{
      coach: string;
      refId: string;
      endpoint: string;
      oldSelfDrift: boolean;
      oldUniqueSnapshots: number;
      newSelfDrift: boolean;
      newUniqueSnapshots: number;
      crossServiceMismatchAtCall1: boolean;
    }> = [];

    async function checkOneCoach(coach: { name: string; refId: string }) {
      const coachRows: typeof rows = [];
      for (const ep of VOLATILE_ENDPOINTS) {
        const oldUrl = `${OLD_BASE}/${ep.path(coach.refId)}`;
        const newUrl = `${NEW_BASE}/${ep.path(coach.refId)}`;

        const [oldSnapshots, newSnapshots] = await Promise.all([
          callNTimes(request, oldUrl, CALLS_PER_ENDPOINT, CALL_INTERVAL_MS),
          callNTimes(request, newUrl, CALLS_PER_ENDPOINT, CALL_INTERVAL_MS),
        ]);

        const oldUnique = new Set(oldSnapshots).size;
        const newUnique = new Set(newSnapshots).size;

        coachRows.push({
          coach: coach.name,
          refId: coach.refId,
          endpoint: ep.key,
          oldSelfDrift: oldUnique > 1,
          oldUniqueSnapshots: oldUnique,
          newSelfDrift: newUnique > 1,
          newUniqueSnapshots: newUnique,
          crossServiceMismatchAtCall1: oldSnapshots[0] !== newSnapshots[0],
        });
      }
      return coachRows;
    }

    for (let i = 0; i < SAMPLE_COACHES.length; i += COACH_CONCURRENCY) {
      const batch = SAMPLE_COACHES.slice(i, i + COACH_CONCURRENCY);
      const batchResults = await Promise.all(batch.map((c) => checkOneCoach(c)));
      batchResults.forEach((r) => rows.push(...r));
      console.log(`   ... đã kiểm ${Math.min(i + COACH_CONCURRENCY, SAMPLE_COACHES.length)}/${SAMPLE_COACHES.length} coach`);
    }

    const oldDriftCount = rows.filter((r) => r.oldSelfDrift).length;
    const newDriftCount = rows.filter((r) => r.newSelfDrift).length;
    const crossMismatchCount = rows.filter((r) => r.crossServiceMismatchAtCall1).length;

    console.log(`\n📊 Cache stability — CHỈ TÍNH SAI DATA THẬT, đã loại trừ sai thứ tự (${rows.length} tổ hợp coach x endpoint, mỗi tổ hợp gọi ${CALLS_PER_ENDPOINT} lần/service):`);
    console.log(`   Service CŨ (opta-api) tự thay đổi DATA qua ${CALLS_PER_ENDPOINT} lần gọi: ${oldDriftCount}/${rows.length}`);
    console.log(`   Service MỚI (staging-player-svc) tự thay đổi DATA qua ${CALLS_PER_ENDPOINT} lần gọi: ${newDriftCount}/${rows.length}`);
    console.log(`   Lệch DATA cross-service tại lần gọi đầu tiên: ${crossMismatchCount}/${rows.length}`);
    rows.forEach((r) => {
      if (r.oldSelfDrift || r.newSelfDrift || r.crossServiceMismatchAtCall1) {
        console.log(
          `   ${r.coach} — ${r.endpoint}: old self-drift=${r.oldSelfDrift}(${r.oldUniqueSnapshots} bản khác nhau), new self-drift=${r.newSelfDrift}(${r.newUniqueSnapshots} bản khác nhau), cross-mismatch@call1=${r.crossServiceMismatchAtCall1}`
        );
      }
    });

    saveJsonForSeason(SEASON_DIR, SLUG, 'case10-cache-stability-check.json', {
      checkedAt: new Date().toISOString(),
      callsPerEndpoint: CALLS_PER_ENDPOINT,
      callIntervalMs: CALL_INTERVAL_MS,
      totalCombinations: rows.length,
      oldDriftCount,
      newDriftCount,
      crossMismatchCount,
      rows,
      note: 'Bản sửa lần 2: so sánh dùng canonicalize() sort cả phần tử trong array (không chỉ key object) — CHỈ TÍNH LÀ LỆCH khi GIÁ TRỊ DATA thật khác nhau, đã loại trừ hoàn toàn trường hợp chỉ đổi thứ tự phần tử/key (không phải bug data).',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'case10-cache-stability-report.xlsx', [
      {
        name: 'Tong quan',
        columns: [
          { header: 'Chỉ số', key: 'metric', width: 50 },
          { header: 'Giá trị', key: 'value', width: 30 },
        ],
        rows: [
          { metric: 'Tổng tổ hợp coach x endpoint', value: rows.length },
          { metric: `Service CŨ tự thay đổi DATA (đã loại trừ sai thứ tự)`, value: `${oldDriftCount}/${rows.length}` },
          { metric: `Service MỚI tự thay đổi DATA (đã loại trừ sai thứ tự)`, value: `${newDriftCount}/${rows.length}` },
          { metric: 'Lệch DATA cross-service tại lần gọi đầu tiên', value: `${crossMismatchCount}/${rows.length}` },
        ],
        wrapText: true,
      },
      {
        name: 'Chi tiet',
        columns: [
          { header: 'Coach', key: 'coach', width: 22 },
          { header: 'ref_id', key: 'refId', width: 18 },
          { header: 'Endpoint', key: 'endpoint', width: 30 },
          { header: 'Old self-drift (data thật)?', key: 'oldSelfDrift', width: 20 },
          { header: 'Old — số bản khác nhau', key: 'oldUniqueSnapshots', width: 20 },
          { header: 'New self-drift (data thật)?', key: 'newSelfDrift', width: 20 },
          { header: 'New — số bản khác nhau', key: 'newUniqueSnapshots', width: 20 },
          { header: 'Lệch DATA cross-service @ call 1?', key: 'crossServiceMismatchAtCall1', width: 26 },
        ],
        rows,
        wrapText: true,
      },
    ]);

    console.log(oldDriftCount + newDriftCount > 0 ? '\n⚠️ Có self-drift DATA THẬT (đã loại trừ sai thứ tự) — xem report để đưa dev.' : '\n✓ Không phát hiện self-drift DATA thật — trước đó chỉ là sai thứ tự, không phải bug data.');
  });
});
