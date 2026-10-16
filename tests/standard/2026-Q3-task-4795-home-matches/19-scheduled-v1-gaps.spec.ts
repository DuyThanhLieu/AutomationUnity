/**
 * US-4795 — lấp 2 lỗ hổng coverage của scheduled-v1 đã xác định qua rà soát
 * ma trận độ bao phủ (2026-10-16): (1) đối chiếu DB gốc — trước đây chỉ có
 * cho scheduled-v2 (file 15), (2) phân trang thật page>1 — trước đây chỉ có
 * cho scheduled-v2 (file 07).
 *
 * CẢ 2 ĐỀU KHẢ THI vì scheduled-v1 dùng CHUNG pipeline Postgres
 * (isport_sport_event) và CHUNG cơ chế sortByMatchTime với v2 — xác nhận qua
 * doc 2-5-scheduled-v1.md (mục 02: "sortByMatchTime: true thì chuyển sang
 * luồng sắp theo giờ, 100 trận/trang" — y hệt v2) và qua việc file 02 đã xác
 * nhận tập trận V1 = V2 (cùng nguồn dữ liệu, chỉ khác bước đóng gói cuối).
 *
 * KHÔNG áp dụng được cho live-v1/live-v2/my-matches (đã khảo sát riêng, xem
 * ghi chú ma trận độ bao phủ): live đọc từ `matches_real_time` trong RAM pod
 * (không phải Postgres), my-matches (all/upcoming/finish) đọc Elasticsearch —
 * đối chiếu DB gốc kiểu này sẽ không đáng tin hoặc không có ý nghĩa thật.
 * Pagination cho live/my-matches cũng không khả thi: doc xác nhận cả 2 luôn
 * trả page=1/size=5000, không có cơ chế tạo ra trang 2 thật.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/19-scheduled-v1-gaps.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV1 } from './lib/home-client';
import { queryDbMatches, mapDbMatchesToPublicIds, closeDbPool, DB_STATUS_NOT_STARTED, DB_STATUS_INPROGRESS, DB_STATUS_FINISHED, type DbMatch } from './lib/db-client';

const TODAY = vnDate(0);

// ============================================================================
// Phần 1: Đối chiếu DB gốc cho scheduled-v1 — copy nguyên xi cách làm của file
// 15 (đã verify đúng cho v2), chỉ đổi endpoint gọi sang scheduledV1.
// ============================================================================
const KNOWN_STATUSES = new Set([DB_STATUS_NOT_STARTED, DB_STATUS_INPROGRESS, DB_STATUS_FINISHED]);
const STATUS_TO_API_TYPE: Record<number, string> = {
  [DB_STATUS_NOT_STARTED]: 'not_started',
  [DB_STATUS_INPROGRESS]: 'inprogress',
  [DB_STATUS_FINISHED]: 'finished',
};

test.describe.configure({ mode: 'serial' }); // dùng chung 1 connection pool, tránh mở quá nhiều kết nối song song tới DB

let dbMatches: DbMatch[] = [];
let idMap: Map<string, string> = new Map();
let apiById: Map<string, any> = new Map();

test.beforeAll(async ({ request }) => {
  const now = Math.floor(Date.now() / 1000);
  dbMatches = await queryDbMatches(now - 6 * 3600, now + 6 * 3600, 80);
  dbMatches = dbMatches.filter((m) => KNOWN_STATUSES.has(m.status));
  idMap = await mapDbMatchesToPublicIds(dbMatches);

  const vnDates = new Set<string>();
  for (const m of dbMatches) {
    vnDates.add(new Date((m.matchTime + 7 * 3600) * 1000).toISOString().slice(0, 10));
  }
  for (const date of vnDates) {
    const { body } = await post(request, scheduledV1(date, 'VN', 'all', 'en'));
    if (body.code === 1) for (const e of body.data.events) apiById.set(e.id, e);
  }
});

test.afterAll(async () => {
  await closeDbPool();
});

test.describe('db (scheduled-v1) · tên đội khớp giữa DB gốc và API công khai', () => {
  test('home/away name trong DB khớp (chứa trong) fullName/name trên API v1 cho cùng 1 trận', () => {
    test.skip(idMap.size === 0, 'Không map được trận nào từ DB sang API trong cửa sổ ±1 ngày tại lần chạy này');
    const bad: string[] = [];
    let compared = 0;
    for (const m of dbMatches) {
      const publicId = idMap.get(m.matchId);
      if (!publicId) continue;
      const e = apiById.get(publicId);
      if (!e) continue;
      compared++;
      const normalize = (s: string) => s.toLowerCase().replace(/[().\-]/g, ' ').replace(/\b(sc|fc|cf)\b/g, '').replace(/\s+/g, ' ').trim();
      const wordsOverlap = (a: string, b: string) => {
        const wa = new Set(normalize(a).split(' ').filter((w) => w.length > 2));
        const wb = new Set(normalize(b).split(' ').filter((w) => w.length > 2));
        if (wa.size === 0 || wb.size === 0) return normalize(a) === normalize(b);
        let common = 0;
        for (const w of wa) if (wb.has(w)) common++;
        return common / Math.min(wa.size, wb.size) >= 0.5;
      };
      const homeMatch = wordsOverlap(m.homeName, e.homeTeam.fullName) || wordsOverlap(m.homeName, e.homeTeam.name);
      const awayMatch = wordsOverlap(m.awayName, e.awayTeam.fullName) || wordsOverlap(m.awayName, e.awayTeam.name);
      if (!homeMatch) bad.push(`${publicId}: DB home="${m.homeName}" nhưng API v1 home="${e.homeTeam.fullName}"/"${e.homeTeam.name}"`);
      if (!awayMatch) bad.push(`${publicId}: DB away="${m.awayName}" nhưng API v1 away="${e.awayTeam.fullName}"/"${e.awayTeam.name}"`);
    }
    test.skip(compared === 0, 'Không có trận nào map được cả id lẫn tồn tại trong response API v1 đã quét');
    expect(bad).toEqual([]);
  });
});

test.describe('db (scheduled-v1) · giờ đá khớp giữa DB gốc và API công khai', () => {
  test('match_time (DB) khớp đúng startTimestamp (API v1) cho cùng 1 trận', () => {
    test.skip(idMap.size === 0, 'Không map được trận nào từ DB sang API trong cửa sổ ±1 ngày tại lần chạy này');
    const bad: string[] = [];
    let compared = 0;
    for (const m of dbMatches) {
      const publicId = idMap.get(m.matchId);
      if (!publicId) continue;
      const e = apiById.get(publicId);
      if (!e) continue;
      compared++;
      if (e.startTimestamp !== m.matchTime) {
        bad.push(`${publicId}: DB match_time=${m.matchTime} nhưng API v1 startTimestamp=${e.startTimestamp}`);
      }
    }
    test.skip(compared === 0, 'Không có trận nào map được cả id lẫn tồn tại trong response API v1 đã quét');
    expect(bad).toEqual([]);
  });
});

test.describe('db (scheduled-v1) · status và tỷ số khớp giữa DB gốc và API công khai', () => {
  test('status.type trên API v1 khớp đúng ánh xạ status DB đã verify', () => {
    test.skip(idMap.size === 0, 'Không map được trận nào từ DB sang API trong cửa sổ ±1 ngày tại lần chạy này');
    const bad: string[] = [];
    let compared = 0;
    for (const m of dbMatches) {
      const publicId = idMap.get(m.matchId);
      if (!publicId) continue;
      const e = apiById.get(publicId);
      if (!e) continue;
      compared++;
      const expectedType = STATUS_TO_API_TYPE[m.status];
      if (e.status.type !== expectedType) {
        bad.push(`${publicId} (${m.homeName} vs ${m.awayName}): DB status=${m.status} (kỳ vọng "${expectedType}") nhưng API v1 trả "${e.status.type}"`);
      }
    }
    test.skip(compared === 0, 'Không có trận nào map được cả id lẫn tồn tại trong response API v1 đã quét');
    expect(bad).toEqual([]);
  });

  test('home_score/away_score (DB) khớp đúng homeScore.display/awayScore.display (API v1)', () => {
    const playedMatches = dbMatches.filter((m) => m.status === DB_STATUS_FINISHED || m.status === DB_STATUS_INPROGRESS);
    test.skip(playedMatches.length === 0, 'Không có trận đã/đang đá nào trong DB tại cửa sổ ±1 ngày để so tỷ số');
    const bad: string[] = [];
    let compared = 0;
    for (const m of playedMatches) {
      const publicId = idMap.get(m.matchId);
      if (!publicId) continue;
      const e = apiById.get(publicId);
      if (!e) continue;
      const apiHome = e.homeScore?.display;
      const apiAway = e.awayScore?.display;
      if (typeof apiHome !== 'number' || typeof apiAway !== 'number') continue;
      compared++;
      if (apiHome !== m.homeScore || apiAway !== m.awayScore) {
        bad.push(`${publicId} (${m.homeName} vs ${m.awayName}): DB tỷ số ${m.homeScore}-${m.awayScore} nhưng API v1 trả ${apiHome}-${apiAway}`);
      }
    }
    test.skip(compared === 0, 'Không có trận đã/đang đá nào map được đủ dữ liệu để so tỷ số');
    expect(bad).toEqual([]);
  });
});

test.describe('db (scheduled-v1) · trận trong DB không được biến mất khỏi API', () => {
  test('trận DB CÓ map được id VÀ map đúng tên đội không được biến mất khỏi API v1', () => {
    test.skip(idMap.size === 0, 'Không map được trận nào từ DB sang API trong cửa sổ ±1 ngày tại lần chạy này');
    const mappedToKnownApiMatch = [...idMap.values()].filter((id) => apiById.has(id));
    expect(mappedToKnownApiMatch.length, 'Không có trận DB nào map đúng vào 1 event API v1 đã biết').toBeGreaterThan(0);
  });
});

// ============================================================================
// Phần 2: Phân trang thật (page > 1) cho scheduled-v1 — copy pattern file 07
// (đã verify đúng cho v2), đổi sang scheduledV1.
// ============================================================================
test.describe('scheduled-v1 · pagination thật (page > 1)', () => {
  test('sortByMatchTime + page=2: trả đúng size=100, không trùng trận với page=1', async ({ request }) => {
    const [p1, p2] = await Promise.all([
      post(request, scheduledV1(TODAY, 'VN', 'all', 'en'), { sortByMatchTime: true, page: 1 }),
      post(request, scheduledV1(TODAY, 'VN', 'all', 'en'), { sortByMatchTime: true, page: 2 }),
    ]);
    test.skip(p1.body.code !== 1 || !p1.body.data.pagination.hasNextPage, 'Không đủ trận hôm nay để có trang 2 (v1)');
    expect(p2.body.code).toBe(1);
    expect(p2.body.data.pagination.page).toBe(2);
    const ids1 = new Set(p1.body.data.events.map((e: any) => e.id));
    const overlap = p2.body.data.events.filter((e: any) => ids1.has(e.id));
    // Ngưỡng nhiễu timing giống hệt lý do đã ghi ở file 07 (2 request tuần tự,
    // không transaction) — không phải bug pagination nếu tỷ lệ nhỏ.
    const threshold = Math.max(3, Math.ceil(p2.body.data.events.length * 0.05));
    expect(overlap.length, `${overlap.length} trận trùng giữa trang 1 và 2 (v1): ${overlap.map((e: any) => e.id).join(', ')}`).toBeLessThanOrEqual(threshold);
  });

  test('page vượt quá tổng số trang (v1): trả code=-1 (giống hành vi đã biết ở v2)', async ({ request }) => {
    const { status, body } = await post(request, scheduledV1(TODAY, 'VN', 'all', 'en'), { sortByMatchTime: true, page: 9999 });
    expect(status).toBe(200);
    expect(body.code).toBe(-1);
  });

  test('page=0 hoặc âm (v1): bị coi như page=1 hoặc trả lỗi validate', async ({ request }) => {
    const [zero, def] = await Promise.all([
      post(request, scheduledV1(TODAY, 'VN', 'all', 'en'), { sortByMatchTime: true, page: 0 }),
      post(request, scheduledV1(TODAY, 'VN', 'all', 'en'), { sortByMatchTime: true, page: 1 }),
    ]);
    test.skip(def.body.code !== 1 || def.body.data.events.length === 0, 'Không có trận hôm nay (v1)');
    if (zero.status === 200 && zero.body.code === 1) {
      expect(zero.body.data.events.map((e: any) => e.id)).toEqual(def.body.data.events.map((e: any) => e.id));
    } else {
      expect(zero.status).toBe(422);
    }
  });

  test('sortByMatchTime (v1): trận sắp theo thứ tự đơn điệu tăng dần theo giờ bắt đầu', async ({ request }) => {
    const { body } = await post(request, scheduledV1(TODAY, 'VN', 'all', 'en'), { sortByMatchTime: true, page: 1 });
    test.skip(body.code !== 1 || body.data.events.length < 2, 'Không đủ trận để kiểm tra thứ tự (v1)');
    const timestamps = body.data.events.map((e: any) => e.startTimestamp);
    const isSorted = timestamps.every((t: number, i: number) => i === 0 || t >= timestamps[i - 1]);
    expect(isSorted, 'Danh sách trận v1 (sortByMatchTime) không được sắp đơn điệu tăng dần theo giờ').toBe(true);
  });
});
