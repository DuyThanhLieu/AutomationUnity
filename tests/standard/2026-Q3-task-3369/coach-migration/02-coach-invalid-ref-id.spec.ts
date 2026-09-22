/**
 * TASK 3369 — Case tổng quát: ref_id KHÔNG hợp lệ / KHÔNG tồn tại.
 *
 * Tách rõ 2 tình huống dễ nhầm với nhau:
 *   1) ref_id ĐÚNG FORMAT (chỉ gồm [a-zA-Z0-9], khớp route pattern ticket
 *      `/api/v2/football/coach/([a-zA-Z0-9]+)/...`) nhưng KHÔNG CÓ THẬT
 *      trong hệ thống — đây là case "coach không tồn tại" thông thường.
 *   2) ref_id chứa ký tự NGOÀI [a-zA-Z0-9] (dấu gạch ngang, rỗng, ký tự đặc
 *      biệt) — route pattern của ticket vốn đã không match các ký tự này,
 *      nên đây là case "request sai format", không phải "coach không tồn
 *      tại".
 *
 * PHÁT HIỆN (qua curl thủ công trước khi viết test, xem lịch sử trò
 * chuyện): 2 case trên có hành vi KHÁC NHAU rõ rệt giữa 2 service:
 *   - Case 1 (đúng format, không tồn tại): CẢ 2 service trả HTTP 200 với
 *     "data" là null/rỗng tuỳ endpoint (info -> null, career-history ->
 *     {id, careerHistory:[]}, last-matches -> [], performance ->
 *     {events:[],points:{},teamIdsWithCount:[]}, stats -> {}) — HÀNH VI
 *     GIỐNG NHAU, không phải bug.
 *   - Case 2 (sai format): opta-api (cũ) VẪN trả HTTP 200 + data null (route
 *     cũ không siết ký tự); staging-player-svc (mới, Go) trả HTTP 404 HTML
 *     thô ("404 Not Found" từ nginx) NGAY Ở TẦNG ROUTE, request không tới
 *     được handler. ĐÂY LÀ SỰ KHÁC BIỆT HÀNH VI THẬT giữa 2 service — cần
 *     dev xác nhận đây là siết chặt validation có chủ đích hay lỗ hổng route
 *     matching chưa xử lý, KHÔNG mặc định coi là bug hay không-bug.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/02-coach-invalid-ref-id.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';

/** So sánh JSON không phụ thuộc thứ tự key — xem giải thích chi tiết ở file 01-coach-endpoints-old-vs-new.spec.ts. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3369-coach-migration';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';

const ENDPOINTS = ['info', 'career-history', 'last-matches', 'performance', 'stats', 'career-history-seasons-detail'];

// Case 1 — đúng format [a-zA-Z0-9]+, chắc chắn không tồn tại thật.
const VALID_FORMAT_NONEXISTENT = ['abc123xyz999notreal', 'zzzzzzzzzzzzzzz', '00000000000000'];

// Case 2 — sai format, chứa ký tự ngoài [a-zA-Z0-9] hoặc rỗng.
const INVALID_FORMAT_REF_IDS = [
  { label: 'chứa dấu gạch ngang', refId: 'does-not-exist-123' },
  { label: 'rỗng', refId: '' },
  { label: 'ký tự đặc biệt', refId: '!!!invalid!!!' },
  { label: 'chứa khoảng trắng (encoded)', refId: 'abc%20def' },
  { label: 'chứa dấu chấm', refId: 'abc.def' },
];

test.describe('[TASK-3369] Coach — case tổng quát ref_id không hợp lệ / không tồn tại', () => {
  test('Case 1: ref_id đúng format nhưng không tồn tại — 2 service phải xử lý GIỐNG NHAU', async ({ request }) => {
    const rows: Array<{ refId: string; endpoint: string; oldStatus: number; newStatus: number; oldData: unknown; newData: unknown; dataEqual: boolean }> = [];

    for (const refId of VALID_FORMAT_NONEXISTENT) {
      for (const ep of ENDPOINTS) {
        const oldRes = await request.get(`${OLD_BASE}/${refId}/${ep}?language=en`);
        const newRes = await request.get(`${NEW_BASE}/${refId}/${ep}?language=en`);
        const oldBody = oldRes.ok() ? await oldRes.json() : null;
        const newBody = newRes.ok() ? await newRes.json() : null;
        const dataEqual = stableStringify(oldBody?.data ?? null) === stableStringify(newBody?.data ?? null);
        rows.push({ refId, endpoint: ep, oldStatus: oldRes.status(), newStatus: newRes.status(), oldData: oldBody?.data, newData: newBody?.data, dataEqual });
      }
    }

    const mismatches = rows.filter((r) => !r.dataEqual || r.oldStatus !== r.newStatus);
    console.log(`\n📊 Case 1 (đúng format, không tồn tại): ${rows.length - mismatches.length}/${rows.length} khớp hành vi`);
    mismatches.forEach((r) => console.log(`   ✗ refId="${r.refId}" ${r.endpoint}: old(${r.oldStatus})=${JSON.stringify(r.oldData)} vs new(${r.newStatus})=${JSON.stringify(r.newData)}`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'case1-valid-format-nonexistent.json', { checkedAt: new Date().toISOString(), rows, mismatchCount: mismatches.length });

    expect(mismatches, `Case "ref_id đúng format nhưng không tồn tại" lệch hành vi ${mismatches.length}/${rows.length} — xem coach-endpoints-check.json`).toEqual([]);
  });

  test('Case 2: ref_id sai format — SO SÁNH hành vi (không assert cứng — cần dev xác nhận có phải regression)', async ({ request }) => {
    const rows: Array<{
      label: string;
      refId: string;
      oldUrl: string;
      newUrl: string;
      oldStatus: number;
      newStatus: number;
      oldBodyPreview: string;
      newBodyPreview: string;
      behaviorDiffers: boolean;
    }> = [];

    for (const { label, refId } of INVALID_FORMAT_REF_IDS) {
      const oldUrl = `${OLD_BASE}/${refId}/info?language=en`;
      const newUrl = `${NEW_BASE}/${refId}/info?language=en`;
      const oldRes = await request.get(oldUrl);
      const newRes = await request.get(newUrl);
      const oldBodyPreview = (await oldRes.text()).slice(0, 200);
      const newBodyPreview = (await newRes.text()).slice(0, 200);
      const behaviorDiffers = oldRes.status() !== newRes.status();

      rows.push({ label, refId, oldUrl, newUrl, oldStatus: oldRes.status(), newStatus: newRes.status(), oldBodyPreview, newBodyPreview, behaviorDiffers });
    }

    const diffCount = rows.filter((r) => r.behaviorDiffers).length;
    console.log(`\n📊 Case 2 (ref_id sai format): ${diffCount}/${rows.length} trường hợp có HTTP status khác nhau giữa 2 service`);
    rows.forEach((r) =>
      console.log(`   ${r.behaviorDiffers ? '⚠' : '✓'} "${r.label}" (refId="${r.refId}"): old=HTTP ${r.oldStatus} | new=HTTP ${r.newStatus}`)
    );

    saveJsonForSeason(SEASON_DIR, SLUG, 'case2-invalid-format-ref-id.json', {
      checkedAt: new Date().toISOString(),
      rows,
      diffCount,
      note: 'KHÔNG assert cứng — route pattern mới ([a-zA-Z0-9]+) siết chặt hơn route cũ, có thể là chủ đích. Cần dev xác nhận trước khi coi là bug. Nếu ref_id thật của coach luôn là alphanumeric thuần (không có "-"), sự khác biệt này không ảnh hưởng use-case thực tế — chỉ ảnh hưởng khi client gửi input rác/không validate trước khi gọi API.',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'case2-invalid-ref-id-report.xlsx', [
      {
        name: 'Ref_id sai format - old vs new',
        columns: [
          { header: 'Loại ref_id sai format', key: 'label', width: 26 },
          { header: 'ref_id test', key: 'refId', width: 20 },
          { header: 'Link API cũ', key: 'oldUrl', width: 65 },
          { header: 'Link API mới', key: 'newUrl', width: 65 },
          { header: 'HTTP cũ', key: 'oldStatus', width: 10 },
          { header: 'HTTP mới', key: 'newStatus', width: 10 },
          { header: 'Body cũ (preview)', key: 'oldBodyPreview', width: 50 },
          { header: 'Body mới (preview)', key: 'newBodyPreview', width: 50 },
          { header: 'Hành vi khác nhau?', key: 'behaviorDiffers', width: 16 },
        ],
        rows,
        wrapText: true,
      },
    ]);

    // Không expect().toEqual([]) — đây là case cần con người quyết định, không phải lỗi tự động fail.
    console.log(diffCount > 0 ? '\n⚠️ CẦN DEV XÁC NHẬN: service mới trả 404 cho ref_id chứa ký tự ngoài [a-zA-Z0-9], service cũ vẫn trả 200.' : '\n✓ Không phát hiện khác biệt hành vi.');
  });
});
