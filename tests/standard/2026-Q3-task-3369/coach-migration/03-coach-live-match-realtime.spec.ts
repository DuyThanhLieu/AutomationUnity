/**
 * TASK 3369 — Case quan trọng: coach có trận ĐANG LIVE — so sánh dữ liệu
 * real-time giữa opta-api (cũ) và staging-player-svc (mới, Go).
 *
 * Đây là case rủi ro cao nhất trong toàn bộ migrate: các endpoint tổng hợp
 * theo thời gian thực (`performance`, `stats`, `last-matches` — có thể gồm
 * cả trận đang diễn ra) có khả năng bị 2 service tính lại KHÔNG đồng bộ
 * tuyệt đối, y hệt hiện tượng "transient mismatch" đã xác nhận ở
 * 01-coach-endpoints-old-vs-new.spec.ts (test với 116 coach finished/
 * not_started/postponed — retry 1 lần thì hết lệch). Với coach có trận LIVE,
 * dữ liệu thay đổi NHANH HƠN (mỗi phút, mỗi pha bóng), nên khả năng "lệch
 * đúng lúc gọi" cao hơn nhiều — cần retry NHIỀU LẦN hơn và khoảng cách retry
 * xa hơn để phân biệt "lệch do timing" (retry sẽ hết) với "lệch do bug thật"
 * (retry vẫn còn, không tự hồi phục).
 *
 * Coach mẫu: lấy từ trận đang có status.type là "inprogress" tại đúng thời
 * điểm quét Mongo + gọi opta-api xác nhận trạng thái — quét lúc viết test
 * (múi giờ quét: UTC, xem checkedAt trong report JSON).
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/03-coach-live-match-realtime.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3369-coach-migration';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';

// Endpoint có khả năng chứa dữ liệu real-time của trận đang live — ưu tiên
// kiểm tra kỹ hơn info/career-history (tương đối tĩnh, ít khả năng lệch).
const REALTIME_ENDPOINTS = ['performance', 'stats', 'last-matches'];
const STATIC_ENDPOINTS = ['info', 'career-history', 'career-history-seasons-detail'];

type LiveCoach = { name: string; refId: string; matchLabel: string; encodedMatchId: string };

// Coach ref_id lấy từ trận đang "inprogress" tại thời điểm quét (2026-08-25
// ~02:50 UTC) — quét Mongo matches (cửa sổ ±24h quanh giờ chạy test thật,
// KHÔNG dùng ngày cố định trong data cũ) qua mapping_matches -> encode ->
// GET /football/event/{id} check status.type -> GET .../lineups. Đã xác
// nhận lại ngay trước khi chạy test chính: 2/3 trận vẫn "inprogress"
// (halftime, 2nd_half), 1 trận đã chuyển "finished" trong lúc quét — ĐÚNG
// NHƯ DỰ KIẾN vì trận live chuyển trạng thái rất nhanh. Nếu chạy lại sau khi
// cả 2 trận này cũng đã kết thúc, phải quét lại theo hướng dẫn ở
// tests/_debug-find-live-coaches.spec.ts (đã xoá sau khi dùng — tạo lại nếu
// cần: quét matches trong cửa sổ ±24h quanh Date.now() thật, lọc
// status.type === "inprogress", lấy home.coach/away.coach.id từ /lineups).
const LIVE_COACHES: LiveCoach[] = [
  { name: 'Paulo Nagamura', refId: 'jqcfxzpo81gsdt6', matchLabel: 'Tacoma Defiance vs Sporting KC (R)', encodedMatchId: 'sybadnlf42n0whq' },
  { name: 'Lee Tschantret', refId: 'a8qv3rl51kon7fj', matchLabel: 'Tacoma Defiance vs Sporting KC (R)', encodedMatchId: 'sybadnlf42n0whq' },
  { name: 'Roberto Gerardo Medina Arellano', refId: '4m9appl3s95n2ed', matchLabel: 'Atlas (W) vs Tijuana (W)', encodedMatchId: 'n97akmlnsdblwnv' },
  { name: 'Fernando Samayoa', refId: '5z3v0bl0h6nrq93', matchLabel: 'Atlas (W) vs Tijuana (W)', encodedMatchId: 'n97akmlnsdblwnv' },
];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function fetchBoth(refId: string, endpoint: string, request: import('@playwright/test').APIRequestContext) {
  const oldUrl = `${OLD_BASE}/${refId}/${endpoint}?language=en`;
  const newUrl = `${NEW_BASE}/${refId}/${endpoint}?language=en`;
  const [oldRes, newRes] = await Promise.all([request.get(oldUrl), request.get(newUrl)]);
  const oldBody = oldRes.ok() ? await oldRes.json() : null;
  const newBody = newRes.ok() ? await newRes.json() : null;
  const equal = stableStringify(oldBody?.data) === stableStringify(newBody?.data);
  return { oldUrl, newUrl, oldStatus: oldRes.status(), newStatus: newRes.status(), oldData: oldBody?.data, newData: newBody?.data, equal };
}

test.describe('[TASK-3369] Coach — trận LIVE, so sánh dữ liệu real-time', () => {
  test.skip(LIVE_COACHES.length === 0, 'Chưa có mẫu coach từ trận đang live tại thời điểm chạy — xem comment đầu file để tìm mẫu mới.');

  test('Coach có trận đang live — data real-time khớp giữa 2 service (retry nhiều lần, cách xa nhau)', async ({ request }) => {
    test.setTimeout(180_000);
    const rows: Array<{
      coach: string;
      refId: string;
      matchLabel: string;
      endpoint: string;
      category: 'realtime' | 'static';
      attempt1Equal: boolean;
      attempt2Equal: boolean | null;
      attempt3Equal: boolean | null;
      finalVerdict: 'khop' | 'khop_sau_retry' | 'LECH_THAT';
      lastDiff: string;
    }> = [];

    const allEndpoints = [...REALTIME_ENDPOINTS.map((e) => ({ key: e, category: 'realtime' as const })), ...STATIC_ENDPOINTS.map((e) => ({ key: e, category: 'static' as const }))];

    for (const coach of LIVE_COACHES) {
      for (const ep of allEndpoints) {
        const r1 = await fetchBoth(coach.refId, ep.key, request);
        let r2: Awaited<ReturnType<typeof fetchBoth>> | null = null;
        let r3: Awaited<ReturnType<typeof fetchBoth>> | null = null;

        if (!r1.equal) {
          await new Promise((res) => setTimeout(res, 5000)); // cách 5s — đủ để 1 lần re-aggregate chạy lại
          r2 = await fetchBoth(coach.refId, ep.key, request);
          if (!r2.equal) {
            await new Promise((res) => setTimeout(res, 10000)); // cách 10s nữa — tổng ~15s từ lần gọi đầu
            r3 = await fetchBoth(coach.refId, ep.key, request);
          }
        }

        const finalResult = r3 ?? r2 ?? r1;
        const verdict: 'khop' | 'khop_sau_retry' | 'LECH_THAT' = r1.equal ? 'khop' : finalResult.equal ? 'khop_sau_retry' : 'LECH_THAT';

        rows.push({
          coach: coach.name,
          refId: coach.refId,
          matchLabel: coach.matchLabel,
          endpoint: ep.key,
          category: ep.category,
          attempt1Equal: r1.equal,
          attempt2Equal: r2?.equal ?? null,
          attempt3Equal: r3?.equal ?? null,
          finalVerdict: verdict,
          lastDiff: verdict === 'LECH_THAT' ? `old=${JSON.stringify(finalResult.oldData).slice(0, 300)} | new=${JSON.stringify(finalResult.newData).slice(0, 300)}` : '',
        });
      }
    }

    const realBugs = rows.filter((r) => r.finalVerdict === 'LECH_THAT');
    const transientCount = rows.filter((r) => r.finalVerdict === 'khop_sau_retry').length;

    console.log(`\n📊 Coach trận live: ${rows.length - realBugs.length}/${rows.length} khớp (${transientCount} khớp sau retry — do timing, không phải bug)`);
    rows.forEach((r) =>
      console.log(`   ${r.finalVerdict === 'LECH_THAT' ? '✗' : r.finalVerdict === 'khop_sau_retry' ? '~' : '✓'} ${r.coach} — ${r.endpoint} (${r.category}): ${r.finalVerdict}`)
    );
    realBugs.forEach((r) => console.log(`   ⚠️ LỆCH THẬT: ${r.coach} — ${r.endpoint}: ${r.lastDiff}`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'case3-live-match-realtime-check.json', {
      checkedAt: new Date().toISOString(),
      liveCoaches: LIVE_COACHES,
      totalChecked: rows.length,
      transientCount,
      realBugCount: realBugs.length,
      rows,
      note: 'So sánh data real-time cho coach có trận đang live. attempt1/2/3 cách nhau 0s/5s/15s để phân biệt lệch do timing (tự hồi phục) với lệch thật (không tự hồi phục sau nhiều lần retry).',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'case3-live-realtime-report.xlsx', [
      {
        name: 'Coach tran live - chi tiet',
        columns: [
          { header: 'Coach', key: 'coach', width: 20 },
          { header: 'ref_id', key: 'refId', width: 18 },
          { header: 'Trận', key: 'matchLabel', width: 30 },
          { header: 'Endpoint', key: 'endpoint', width: 20 },
          { header: 'Loại', key: 'category', width: 12 },
          { header: 'Lần 1 khớp?', key: 'attempt1Equal', width: 12 },
          { header: 'Lần 2 khớp? (retry +5s)', key: 'attempt2Equal', width: 20 },
          { header: 'Lần 3 khớp? (retry +15s)', key: 'attempt3Equal', width: 22 },
          { header: 'Kết luận', key: 'finalVerdict', width: 16 },
          { header: 'Khác biệt (nếu lệch thật)', key: 'lastDiff', width: 80 },
        ],
        rows,
        wrapText: true,
      },
    ]);

    expect(realBugs, `${realBugs.length}/${rows.length} mẫu LỆCH THẬT (không tự hồi phục sau 3 lần retry, cách nhau tới 15s) — xem case3-live-realtime-report.xlsx`).toEqual([]);
  });
});
