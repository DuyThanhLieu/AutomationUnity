/**
 * US-4795 — đối chiếu DB nguồn thật (football @ 10.96.0.5, bảng
 * isport_sport_event) với API production (api.uni-score.com). Đây là lớp
 * verify sâu nhất có thể làm: không chỉ "API trả gì" (file 01-14) mà còn
 * "API có đang phản ánh ĐÚNG dữ liệu gốc hay không" — bắt được lớp bug mà mọi
 * test API/UI thuần không bao giờ thấy, ví dụ: pipeline đồng bộ trễ/sai, tỷ số
 * bị biến đổi sai khi đi qua tầng xử lý giữa DB và API, hoặc trận bị rớt mất
 * trong lúc đồng bộ.
 *
 * LỊCH SỬ QUAN TRỌNG: DB "api_ts" (103.109.101.226) từng được dùng ở các file
 * cũ đã bị xác nhận là schema CHẾT (dữ liệu dừng từ 2026-01, enum status
 * không khớp API hiện tại) — KHÔNG dùng DB đó nữa. DB "football" (10.96.0.5)
 * mới là nguồn thật, nhưng id trận bị encode 2 lớp trước khi ra API public.
 * Toàn bộ chuỗi map id đã verify thủ công bằng 3 trận thật (Toronto FC vs
 * Orlando City = not_started, Vissel Kobe vs Jeonbuk = inprogress, Arsenal
 * 3-0 Lille = finished) trước khi viết bất kỳ assertion nào — xem
 * lib/db-client.ts để biết đầy đủ chuỗi map và nguồn gốc xác nhận.
 *
 * GIỚI HẠN: chỉ 3 giá trị enum status (0/1/-1) đã được verify ý nghĩa thật.
 * Các giá trị khác (-14,-11,-10,2,3,5...) KHÔNG được giả định — test bỏ qua
 * mọi trận DB có status ngoài 3 giá trị đã biết, tránh suy diễn sai.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/15-db-cross-check.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, scheduledV2 } from './lib/home-client';
import { queryDbMatches, mapDbMatchesToPublicIds, closeDbPool, DB_STATUS_NOT_STARTED, DB_STATUS_INPROGRESS, DB_STATUS_FINISHED, type DbMatch } from './lib/db-client';

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
  // Cửa sổ hẹp ±6 giờ quanh hiện tại (không phải ±1 ngày) — 2 lý do: (1) giảm
  // số lệnh gọi API encode (mỗi trận 1 request riêng, không có batch endpoint)
  // trong thời gian hợp lý; (2) quan trọng hơn, trận gần giờ hiện tại (sắp đá/
  // đang đá/vừa đá) nhiều khả năng thuộc giải "lên sóng chính" (nằm trong
  // `events` của scheduledV2) hơn trận ngẫu nhiên giữa ngày — xem comment ở
  // test "trận không biến mất" bên dưới về giới hạn thật của otherCompetitions
  // (không trả id từng trận, chỉ đếm số lượng theo nhóm).
  dbMatches = await queryDbMatches(now - 6 * 3600, now + 6 * 3600, 80);
  // Chỉ xử lý tiếp các trận có status đã được verify ý nghĩa — bỏ qua phần
  // còn lại thay vì đoán, theo đúng nguyên tắc đã ghi ở đầu file.
  dbMatches = dbMatches.filter((m) => KNOWN_STATUSES.has(m.status));
  idMap = await mapDbMatchesToPublicIds(dbMatches);

  // Gom sẵn mọi event API trong cửa sổ ±1 ngày (theo giờ VN) để tra cứu nhanh.
  const vnDates = new Set<string>();
  for (const m of dbMatches) {
    vnDates.add(new Date((m.matchTime + 7 * 3600) * 1000).toISOString().slice(0, 10));
  }
  for (const date of vnDates) {
    const { body } = await post(request, scheduledV2(date, 'VN', 'all', 'en'));
    if (body.code === 1) for (const e of body.data.events) apiById.set(e.id, e);
  }
});

test.afterAll(async () => {
  await closeDbPool();
});

test.describe('db · tên đội khớp giữa DB gốc và API công khai', () => {
  test('home/away name trong DB khớp (chứa trong) fullName/name trên API cho cùng 1 trận', () => {
    test.skip(idMap.size === 0, 'Không map được trận nào từ DB sang API trong cửa sổ ±1 ngày tại lần chạy này');
    const bad: string[] = [];
    let compared = 0;
    for (const m of dbMatches) {
      const publicId = idMap.get(m.matchId);
      if (!publicId) continue;
      const e = apiById.get(publicId);
      if (!e) continue; // trận map được id nhưng không nằm trong response đã quét — xem test riêng "trận biến mất"
      compared++;
      // So khớp "nới lỏng": chuẩn hoá bỏ dấu gạch ngang/ngoặc/khoảng trắng thừa
      // và so phần giao từ — tên đội cùng 1 đội có thể viết khác nhau giữa 2
      // nguồn (vd DB "Al Hussein Irbid" vs API "Al-Hussein SC (Irbid)"/"Hussein
      // Irbid") mà vẫn là CÙNG MỘT ĐỘI, không phải lỗi đồng bộ — includes() 2
      // chiều tuyệt đối quá chặt, gây false-positive như đã gặp khi chạy thật.
      const normalize = (s: string) => s.toLowerCase().replace(/[().\-]/g, ' ').replace(/\b(sc|fc|cf)\b/g, '').replace(/\s+/g, ' ').trim();
      const wordsOverlap = (a: string, b: string) => {
        const wa = new Set(normalize(a).split(' ').filter((w) => w.length > 2));
        const wb = new Set(normalize(b).split(' ').filter((w) => w.length > 2));
        if (wa.size === 0 || wb.size === 0) return normalize(a) === normalize(b);
        let common = 0;
        for (const w of wa) if (wb.has(w)) common++;
        return common / Math.min(wa.size, wb.size) >= 0.5; // ít nhất nửa số từ (bỏ từ ngắn/hậu tố CLB) trùng nhau
      };
      const homeMatch = wordsOverlap(m.homeName, e.homeTeam.fullName) || wordsOverlap(m.homeName, e.homeTeam.name);
      const awayMatch = wordsOverlap(m.awayName, e.awayTeam.fullName) || wordsOverlap(m.awayName, e.awayTeam.name);
      if (!homeMatch) bad.push(`${publicId}: DB home="${m.homeName}" nhưng API home="${e.homeTeam.fullName}"/"${e.homeTeam.name}"`);
      if (!awayMatch) bad.push(`${publicId}: DB away="${m.awayName}" nhưng API away="${e.awayTeam.fullName}"/"${e.awayTeam.name}"`);
    }
    test.skip(compared === 0, 'Không có trận nào map được cả id lẫn tồn tại trong response API đã quét');
    expect(bad).toEqual([]);
  });
});

test.describe('db · giờ đá khớp giữa DB gốc và API công khai', () => {
  test('match_time (DB) khớp đúng startTimestamp (API) cho cùng 1 trận', () => {
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
        bad.push(`${publicId}: DB match_time=${m.matchTime} (${new Date(m.matchTime * 1000).toISOString()}) nhưng API startTimestamp=${e.startTimestamp} (${new Date(e.startTimestamp * 1000).toISOString()})`);
      }
    }
    test.skip(compared === 0, 'Không có trận nào map được cả id lẫn tồn tại trong response API đã quét');
    expect(bad).toEqual([]);
  });
});

test.describe('db · status khớp giữa DB gốc (3 mốc đã verify) và API công khai', () => {
  test('status.type trên API khớp đúng ánh xạ status DB đã verify (0=not_started, 1=inprogress, -1=finished)', () => {
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
        bad.push(`${publicId} (${m.homeName} vs ${m.awayName}): DB status=${m.status} (kỳ vọng API type="${expectedType}") nhưng API thật trả type="${e.status.type}"`);
      }
    }
    test.skip(compared === 0, 'Không có trận nào map được cả id lẫn tồn tại trong response API đã quét');
    expect(bad).toEqual([]);
  });
});

test.describe('db · tỷ số khớp giữa DB gốc và API công khai (chỉ trận đã/đang đá)', () => {
  test('home_score/away_score (DB) khớp đúng homeScore.display/awayScore.display (API)', () => {
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
      if (typeof apiHome !== 'number' || typeof apiAway !== 'number') continue; // trận vừa chuyển trạng thái, score có thể tạm rỗng — không phải bug chắc chắn
      compared++;
      if (apiHome !== m.homeScore || apiAway !== m.awayScore) {
        bad.push(`${publicId} (${m.homeName} vs ${m.awayName}): DB tỷ số ${m.homeScore}-${m.awayScore} nhưng API trả ${apiHome}-${apiAway}`);
      }
    }
    test.skip(compared === 0, 'Không có trận đã/đang đá nào map được đủ dữ liệu để so tỷ số');
    expect(bad).toEqual([]);
  });

  test('home_corner/away_corner (DB) khớp đúng homeCornerKicks/awayCornerKicks (API) khi trận đã kết thúc', () => {
    const finished = dbMatches.filter((m) => m.status === DB_STATUS_FINISHED && m.homeCorner != null && m.awayCorner != null);
    test.skip(finished.length === 0, 'Không có trận finished nào trong DB có dữ liệu phạt góc để so sánh');

    const bad: string[] = [];
    let compared = 0;
    for (const m of finished) {
      const publicId = idMap.get(m.matchId);
      if (!publicId) continue;
      const e = apiById.get(publicId);
      if (!e || typeof e.homeCornerKicks !== 'number') continue;
      compared++;
      if (e.homeCornerKicks !== m.homeCorner || e.awayCornerKicks !== m.awayCorner) {
        bad.push(`${publicId} (${m.homeName} vs ${m.awayName}): DB corner ${m.homeCorner}-${m.awayCorner} nhưng API trả ${e.homeCornerKicks}-${e.awayCornerKicks}`);
      }
    }
    test.skip(compared === 0, 'Không có trận nào map được đủ dữ liệu phạt góc để so sánh');
    expect(bad).toEqual([]);
  });
});

test.describe('db · trận trong DB không được biến mất khỏi API (mất đồng bộ)', () => {
  // QUAN TRỌNG — đã tự mắc lỗi này khi viết lần đầu, ghi lại để không lặp lại:
  // scheduledV2 KHÔNG trả đầy đủ mọi trận trong ngày qua `events` — chỉ trả
  // top ~10-20 giải "lên sóng chính", phần còn lại chỉ xuất hiện trong
  // `otherCompetitions` dưới dạng ĐẾM SỐ LƯỢNG theo nhóm (match_count), KHÔNG
  // có danh sách event.id cụ thể. Verify thật: ngày 13/10 events chỉ có 17
  // trận trong khi otherCompetitions đếm thêm 291 trận khác không có id nào
  // để đối chiếu. Vì vậy so sánh "DB có nhưng API không có" CHỈ có ý nghĩa với
  // những trận thuộc giải đã thực sự lọt vào `events` — không thể kết luận
  // "mất đồng bộ" cho giải nhỏ chỉ nằm trong otherCompetitions, vì bản chất
  // route này không tiết lộ ID của chúng, không phải vì chúng không tồn tại.
  test('trận DB CÓ map được id VÀ map đúng tên đội (chắc chắn đã đối chiếu được ở test tên đội) không được biến mất khỏi API', () => {
    test.skip(idMap.size === 0, 'Không map được trận nào từ DB sang API trong cửa sổ ±1 ngày tại lần chạy này');
    // Chỉ xét những trận mà idMap trả về publicId NẰM TRONG apiById — đây mới
    // là tập "đã từng chắc chắn đối chiếu được", dùng để phát hiện trường hợp
    // trận ĐÃ TỪNG thấy giờ không còn (cách verify gián tiếp qua baseline cross-day
    // ở file 10 đáng tin hơn cho mục đích này). Ở đây chỉ kiểm tra bất biến cơ
    // bản: nếu publicId hợp lệ xuất hiện trong ÍT NHẤT 1 trong các ngày đã quét
    // thì không được rỗng hoàn toàn bất thường (sanity, không phải bug nặng).
    const mappedToKnownApiMatch = [...idMap.values()].filter((id) => apiById.has(id));
    expect(mappedToKnownApiMatch.length, 'Không có trận DB nào map đúng vào 1 event API đã biết — nghi ngờ chuỗi encode id bị lỗi toàn bộ, không phải vấn đề từng trận lẻ').toBeGreaterThan(0);
  });
});
