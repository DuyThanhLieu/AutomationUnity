/**
 * TASK 3369 — Quét diện CỰC RỘNG: 2000 coach (lấy từ bulk-coach-samples.ts,
 * 3691 coach thu thập từ 19,193 trận trong 90 ngày) — mục tiêu tìm bug hiếm,
 * chỉ xuất hiện ở số ít coach/team/giải cụ thể mà mẫu nhỏ (116 coach ở file
 * 01) không đủ để bắt được.
 *
 * DÙNG LẠI nguyên logic retry đã xác nhận ở 01-coach-endpoints-old-vs-new.spec.ts:
 * retry tối đa 2 lần (300ms/1500ms) để loại nhiễu transient (performance,
 * career-history-seasons-detail là 2 endpoint hay bị lệch tạm thời do 2
 * service re-aggregate không đồng bộ tuyệt đối — đã verify kỹ ở file 01,
 * 100% mismatch ban đầu tự hồi phục khi gọi lại).
 *
 * QUY MÔ: 2000 coach x 7 endpoint = 14,000 cặp request (28,000 request tổng
 * cả 2 service) — CHẠY LÂU (dự kiến nhiều phút). Đặt SAMPLE_SIZE ở đầu file
 * để dễ chỉnh xuống 500-1000 nếu cần chạy nhanh hơn.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/05-coach-bulk-2000.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';
import { BULK_COACHES } from './bulk-coach-samples';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3369-coach-migration';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';

// Chỉnh số này để chạy 1000/1500/2000 coach — lấy N phần tử ĐẦU của
// BULK_COACHES (thứ tự cố định, chạy lại cùng SAMPLE_SIZE sẽ luôn ra đúng
// cùng bộ coach, dễ so sánh kết quả giữa các lần chạy).
const SAMPLE_SIZE = 2000;
const COACHES = BULK_COACHES.slice(0, SAMPLE_SIZE);

const ENDPOINTS: Array<{ key: string; path: (refId: string) => string }> = [
  { key: 'info', path: (id) => `${id}/info?language=en` },
  { key: 'info/:locale', path: (id) => `${id}/info/en` },
  { key: 'career-history', path: (id) => `${id}/career-history?language=en` },
  { key: 'last-matches', path: (id) => `${id}/last-matches?language=en` },
  { key: 'performance', path: (id) => `${id}/performance?language=en` },
  { key: 'stats', path: (id) => `${id}/stats?language=en` },
  { key: 'career-history-seasons-detail', path: (id) => `${id}/career-history-seasons-detail?language=en` },
];

type RowResult = {
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
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function checkOneCoachEndpoint(
  request: import('@playwright/test').APIRequestContext,
  coach: { name: string; refId: string; matchLabel: string },
  ep: { key: string; path: (refId: string) => string }
): Promise<RowResult> {
  const oldUrl = `${OLD_BASE}/${ep.path(coach.refId)}`;
  const newUrl = `${NEW_BASE}/${ep.path(coach.refId)}`;

  async function fetchAndCompare() {
    const [oldRes, newRes] = await Promise.all([request.get(oldUrl), request.get(newUrl)]);
    if (!oldRes.ok() || !newRes.ok()) {
      return { equal: false, oldStatus: oldRes.status(), newStatus: newRes.status(), oldData: undefined, newData: undefined };
    }
    const oldBody = await oldRes.json();
    const newBody = await newRes.json();
    const equal = stableStringify(oldBody.data) === stableStringify(newBody.data);
    return { equal, oldStatus: oldRes.status(), newStatus: newRes.status(), oldData: oldBody.data, newData: newBody.data };
  }

  let result = await fetchAndCompare();
  if (!result.equal) {
    await new Promise((res) => setTimeout(res, 300));
    result = await fetchAndCompare();
  }
  if (!result.equal) {
    await new Promise((res) => setTimeout(res, 1500));
    result = await fetchAndCompare();
  }

  const diffSummary = result.equal
    ? ''
    : `HTTP: old=${result.oldStatus} new=${result.newStatus} | old.data=${JSON.stringify(result.oldData).slice(0, 200)} | new.data=${JSON.stringify(result.newData).slice(0, 200)}`;

  return {
    coach: coach.name,
    refId: coach.refId,
    matchLabel: coach.matchLabel,
    endpoint: ep.key,
    oldUrl,
    newUrl,
    oldHttpStatus: result.oldStatus,
    newHttpStatus: result.newStatus,
    dataEqual: result.equal,
    diffSummary,
  };
}

const CONCURRENCY = 10;

test.describe(`[TASK-3369] Coach — bulk scan ${SAMPLE_SIZE} coach (opta-api vs staging-player-svc)`, () => {
  test(`7 endpoint coach trả field "data" giống nhau giữa 2 service (${SAMPLE_SIZE} coach)`, async ({ request }) => {
    test.setTimeout(1800_000);
    const rows: RowResult[] = [];

    for (let i = 0; i < COACHES.length; i += CONCURRENCY) {
      const batch = COACHES.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.flatMap((coach) => ENDPOINTS.map((ep) => checkOneCoachEndpoint(request, coach, ep))));
      rows.push(...batchResults);
      if ((i + CONCURRENCY) % 200 === 0 || i + CONCURRENCY >= COACHES.length) {
        console.log(`   ... đã kiểm ${Math.min(i + CONCURRENCY, COACHES.length)}/${COACHES.length} coach`);
      }
    }

    const mismatches = rows.filter((r) => !r.dataEqual);
    const byEndpoint = ENDPOINTS.map((ep) => {
      const inEp = rows.filter((r) => r.endpoint === ep.key);
      const matched = inEp.filter((r) => r.dataEqual);
      return { endpoint: ep.key, soMauKiemTra: inEp.length, soKhop: matched.length };
    });

    console.log(`\n📊 Bulk scan ${SAMPLE_SIZE} coach: ${rows.length - mismatches.length}/${rows.length} khớp field "data"`);
    byEndpoint.forEach((e) => console.log(`   ${e.soKhop === e.soMauKiemTra ? '✓' : '✗'} ${e.endpoint}: ${e.soKhop}/${e.soMauKiemTra} khớp`));
    mismatches.forEach((r) => console.log(`   ✗ ${r.coach} (${r.refId}) — ${r.endpoint}: ${r.diffSummary}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `bulk-${SAMPLE_SIZE}-coach-check.json`, {
      checkedAt: new Date().toISOString(),
      sampleSize: SAMPLE_SIZE,
      totalChecked: rows.length,
      mismatchCount: mismatches.length,
      byEndpoint,
      rows,
      note: `Quét ${SAMPLE_SIZE}/3691 coach từ bulk-coach-samples.ts. Đã áp dụng retry 2 lần (300ms/1500ms) để loại nhiễu transient (xem chi tiết ở 01-coach-endpoints-old-vs-new.spec.ts) — mismatch còn lại trong report này là LỆCH THẬT, không tự hồi phục qua 3 lần gọi.`,
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, `bulk-${SAMPLE_SIZE}-coach-report.xlsx`, [
      {
        name: 'Tong quan theo endpoint',
        columns: [
          { header: 'Endpoint', key: 'endpoint', width: 34 },
          { header: 'Số mẫu kiểm tra', key: 'soMauKiemTra', width: 16 },
          { header: 'Số khớp', key: 'soKhop', width: 12 },
        ],
        rows: byEndpoint,
        wrapText: true,
      },
      {
        name: 'Cac mau lech (bug thuc)',
        columns: [
          { header: 'Coach', key: 'coach', width: 20 },
          { header: 'ref_id', key: 'refId', width: 18 },
          { header: 'Trận', key: 'matchLabel', width: 30 },
          { header: 'Endpoint', key: 'endpoint', width: 32 },
          { header: 'Link API cũ', key: 'oldUrl', width: 65 },
          { header: 'Link API mới', key: 'newUrl', width: 65 },
          { header: 'HTTP cũ', key: 'oldHttpStatus', width: 10 },
          { header: 'HTTP mới', key: 'newHttpStatus', width: 10 },
          { header: 'Khác biệt', key: 'diffSummary', width: 90 },
        ],
        rows: mismatches,
        wrapText: true,
      },
    ]);

    expect(mismatches, `${mismatches.length}/${rows.length} mẫu LỆCH THẬT (đã retry 3 lần) — xem report bulk-${SAMPLE_SIZE}-coach-report.xlsx`).toEqual([]);
  });
});
