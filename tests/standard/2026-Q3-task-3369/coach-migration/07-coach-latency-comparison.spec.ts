/**
 * TASK 3369 — Case tổng quát: SO SÁNH LATENCY giữa opta-api (cũ, NestJS) và
 * staging-player-svc (mới, Go) — đảm bảo migrate không làm chậm hơn đáng kể.
 *
 * Đo thời gian phản hồi (round-trip từ lúc gửi request tới lúc nhận xong
 * response) cho từng endpoint, trên cùng 1 bộ coach (lấy từ bulk-coach-
 * samples.ts để có mẫu đủ lớn tính percentile có ý nghĩa — mặc định 300 coach
 * x 7 endpoint = 2100 mẫu/service).
 *
 * Đo TUẦN TỰ (không dùng Promise.all cho phần đo — chỉ so sánh, phần thu
 * thập mẫu vẫn chạy theo batch để không quá chậm) — đo xen kẽ old/new liền
 * nhau cho từng coach để giảm ảnh hưởng của biến động tải hệ thống theo thời
 * gian (network jitter, giờ cao điểm) tác động không đều lên 2 phía.
 *
 * KHÔNG assert cứng theo 1 ngưỡng tuyệt đối (vì latency phụ thuộc mạng/giờ
 * chạy) — chỉ fail nếu service MỚI chậm hơn service CŨ quá nhiều lần (ngưỡng
 * mặc định: p95 mới > p95 cũ x 3) — con số này đủ rộng để không false-positive
 * do jitter thông thường, nhưng đủ chặt để bắt regression thật (vd N+1 query
 * chưa optimize, thiếu cache, thiếu index).
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/07-coach-latency-comparison.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';
import { BULK_COACHES } from './bulk-coach-samples';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3369-coach-migration';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';

const SAMPLE_SIZE = 300;
const COACHES = BULK_COACHES.slice(0, SAMPLE_SIZE);

const ENDPOINTS: Array<{ key: string; path: (refId: string) => string }> = [
  { key: 'info', path: (id) => `${id}/info?language=en` },
  { key: 'career-history', path: (id) => `${id}/career-history?language=en` },
  { key: 'last-matches', path: (id) => `${id}/last-matches?language=en` },
  { key: 'performance', path: (id) => `${id}/performance?language=en` },
  { key: 'stats', path: (id) => `${id}/stats?language=en` },
  { key: 'career-history-seasons-detail', path: (id) => `${id}/career-history-seasons-detail?language=en` },
];

// Ngưỡng: service mới chỉ được coi là "regression thật" nếu p95 chậm hơn cũ
// quá X lần — đủ rộng để không báo sai do jitter mạng thông thường.
const REGRESSION_THRESHOLD_MULTIPLIER = 3;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function timedRequest(request: import('@playwright/test').APIRequestContext, url: string): Promise<{ ms: number; ok: boolean }> {
  const start = performance.now();
  const res = await request.get(url).catch(() => null);
  const ms = performance.now() - start;
  return { ms, ok: res?.ok() ?? false };
}

test.describe('[TASK-3369] Coach — so sánh latency giữa opta-api (cũ) và staging-player-svc (mới)', () => {
  test(`Latency ${SAMPLE_SIZE} coach x ${ENDPOINTS.length} endpoint — service mới không chậm hơn quá ${REGRESSION_THRESHOLD_MULTIPLIER}x p95 service cũ`, async ({ request }) => {
    test.setTimeout(600_000);

    const samples: Array<{ endpoint: string; oldMs: number; newMs: number; oldOk: boolean; newOk: boolean }> = [];

    let count = 0;
    for (const coach of COACHES) {
      for (const ep of ENDPOINTS) {
        // Đo xen kẽ old/new liền nhau cho cùng 1 coach+endpoint — giảm nhiễu
        // do biến động tải hệ thống theo thời gian tác động không đều.
        const oldResult = await timedRequest(request, `${OLD_BASE}/${ep.path(coach.refId)}`);
        const newResult = await timedRequest(request, `${NEW_BASE}/${ep.path(coach.refId)}`);
        samples.push({ endpoint: ep.key, oldMs: oldResult.ms, newMs: newResult.ms, oldOk: oldResult.ok, newOk: newResult.ok });
        count++;
      }
      if (count % 300 === 0) console.log(`   ... đã đo ${count}/${COACHES.length * ENDPOINTS.length} mẫu`);
    }

    const byEndpoint = ENDPOINTS.map((ep) => {
      const inEp = samples.filter((s) => s.endpoint === ep.key && s.oldOk && s.newOk);
      const oldSorted = inEp.map((s) => s.oldMs).sort((a, b) => a - b);
      const newSorted = inEp.map((s) => s.newMs).sort((a, b) => a - b);
      const oldP50 = percentile(oldSorted, 50);
      const oldP95 = percentile(oldSorted, 95);
      const oldP99 = percentile(oldSorted, 99);
      const newP50 = percentile(newSorted, 50);
      const newP95 = percentile(newSorted, 95);
      const newP99 = percentile(newSorted, 99);
      const regressionRatio = oldP95 > 0 ? newP95 / oldP95 : newP95 > 0 ? Infinity : 1;
      return {
        endpoint: ep.key,
        soMau: inEp.length,
        oldP50Ms: Math.round(oldP50),
        oldP95Ms: Math.round(oldP95),
        oldP99Ms: Math.round(oldP99),
        newP50Ms: Math.round(newP50),
        newP95Ms: Math.round(newP95),
        newP99Ms: Math.round(newP99),
        regressionRatio: Number(regressionRatio.toFixed(2)),
        isRegression: regressionRatio > REGRESSION_THRESHOLD_MULTIPLIER,
      };
    });

    const regressions = byEndpoint.filter((e) => e.isRegression);

    console.log(`\n📊 Latency ${SAMPLE_SIZE} coach — p50/p95/p99 (ms), cũ vs mới:`);
    byEndpoint.forEach((e) =>
      console.log(
        `   ${e.isRegression ? '✗' : '✓'} ${e.endpoint} (n=${e.soMau}): cũ p50=${e.oldP50Ms} p95=${e.oldP95Ms} p99=${e.oldP99Ms} | mới p50=${e.newP50Ms} p95=${e.newP95Ms} p99=${e.newP99Ms} | tỉ lệ p95 mới/cũ=${e.regressionRatio}x`
      )
    );
    if (regressions.length) {
      console.log(`\n⚠️ REGRESSION LATENCY: ${regressions.length} endpoint chậm hơn ${REGRESSION_THRESHOLD_MULTIPLIER}x so với cũ.`);
    }

    saveJsonForSeason(SEASON_DIR, SLUG, 'case7-latency-comparison.json', {
      checkedAt: new Date().toISOString(),
      sampleSize: SAMPLE_SIZE,
      totalSamples: samples.length,
      regressionThresholdMultiplier: REGRESSION_THRESHOLD_MULTIPLIER,
      byEndpoint,
      regressionCount: regressions.length,
      note: 'Đo latency round-trip (network + xử lý server), KHÔNG loại trừ jitter mạng cục bộ máy chạy test. Chỉ coi là regression nếu p95 mới > p95 cũ x 3 — ngưỡng rộng để tránh false positive do biến động tải hệ thống thông thường.',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'case7-latency-report.xlsx', [
      {
        name: 'Latency theo endpoint',
        columns: [
          { header: 'Endpoint', key: 'endpoint', width: 32 },
          { header: 'Số mẫu', key: 'soMau', width: 10 },
          { header: 'Cũ p50 (ms)', key: 'oldP50Ms', width: 14 },
          { header: 'Cũ p95 (ms)', key: 'oldP95Ms', width: 14 },
          { header: 'Cũ p99 (ms)', key: 'oldP99Ms', width: 14 },
          { header: 'Mới p50 (ms)', key: 'newP50Ms', width: 14 },
          { header: 'Mới p95 (ms)', key: 'newP95Ms', width: 14 },
          { header: 'Mới p99 (ms)', key: 'newP99Ms', width: 14 },
          { header: 'Tỉ lệ p95 (mới/cũ)', key: 'regressionRatio', width: 18 },
          { header: 'Regression?', key: 'isRegression', width: 12 },
        ],
        rows: byEndpoint,
        wrapText: true,
      },
    ]);

    expect(regressions, `${regressions.length} endpoint có p95 latency mới chậm hơn cũ quá ${REGRESSION_THRESHOLD_MULTIPLIER}x — xem case7-latency-report.xlsx`).toEqual([]);
  });
});
