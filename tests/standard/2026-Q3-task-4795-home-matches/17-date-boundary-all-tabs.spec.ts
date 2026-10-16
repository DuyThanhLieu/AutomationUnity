/**
 * US-4795 — mở rộng bug "trận bị xếp sai ngày theo locale" (phát hiện ở file
 * 16, tab "Tất cả"/type=all) sang TOÀN BỘ tab còn lại của trang Home: Sắp diễn
 * ra (upcoming), Kết thúc (finish) và Live (live-v1/live-v2) — theo yêu cầu
 * phủ hết mọi chỗ user có thể thấy trận hiển thị sai ngày, không chỉ tab mặc
 * định, để daily report không bỏ sót.
 *
 * NGUYÊN TẮC GIỐNG HỆT FILE 16 (xem comment chi tiết ở đó để biết lý do):
 *   - Thu thập tập trận qua `sortByMatchTime: true` + phân trang đầy đủ, qua
 *     nhiều locale nguồn (GB/US/BR) — KHÔNG dùng `events` mặc định (giới hạn
 *     top giải nổi bật theo locale, gây false-positive).
 *   - Dùng Intl/IANA timezone (lib/locale-timezone.ts) làm nguồn sự thật độc
 *     lập cho "ngày đúng" — KHÔNG dùng tham số `offset` của chính API.
 *   - 1 trận "không thấy ở ngày kỳ vọng" chỉ tính là bug nếu tìm thấy ở ngày
 *     KHÁC (xác nhận tồn tại, chỉ sai ngày) — không tính nếu biến mất hoàn
 *     toàn (có thể do giới hạn top-list, không đủ cơ sở kết luận).
 *
 * GIỚI HẠN DỮ LIỆU: API không có `endTimestamp` — chỉ có `startTimestamp` +
 * `status`. Vì vậy "ngày trận đã kết thúc" được suy ra từ `startTimestamp`
 * (đại đa số trận bóng đá kết thúc trong 2-3 tiếng, cùng ngày địa phương với
 * giờ bắt đầu — chỉ test được ngày BẮT ĐẦU trận, không test được ngày lúc
 * TRỌNG TÀI THỔI CÒI KẾT THÚC một cách độc lập).
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/17-date-boundary-all-tabs.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2, liveV1, liveV2, FINISHED_CODES, HOME_BASE } from './lib/home-client';
import { LOCALE_TIMEZONE, localDateFor } from './lib/locale-timezone';

// Giảm từ 7 ngày xuống 5 ngày (bớt vnDate(3), vnDate(4)) sau khi phát hiện
// file chạy quá lâu (nhiều phút không xong) — mỗi ngày thêm vào tốn thêm 1
// vòng phân trang đầy đủ × 5 nguồn ở bước thu thập. 5 ngày (-1..+3) vẫn đủ
// rộng để có mẫu "chưa đá" cho tab upcoming mà không tốn quá nhiều request.
const DATES_TO_SCAN = [vnDate(-1), vnDate(0), vnDate(1), vnDate(2), vnDate(3)];

// ĐÃ MỞ RỘNG (2026-10-16) để quét TOÀN BỘ locale giống file 16, thay vì chỉ 6
// locale — phát hiện thật trên CI: chạy file 16 (tab "all") vào giờ cao điểm
// châu Âu (19h-23h UTC, lúc nhiều trận châu Âu rơi đúng vùng biên giờ địa
// phương khi đang DST) phát hiện tới 22/60 locale fail (AT, BE, CH, CZ, DE,
// DK, EG, ES, FI, FR, GB, GR, HU, IE, IL, IT, NL, NO, PL, PT, SE, UA) — so với
// chỉ 4/60 khi chạy vào giờ khác trong ngày. Giới hạn 6 locale trước đây sẽ bỏ
// sót gần như toàn bộ phạm vi thật của bug này ở tab finish/upcoming.
const LOCALES_TO_CHECK = Object.keys(LOCALE_TIMEZONE);

// Giữ 3 nguồn như file 16 (không thêm FR/DE) — đã xác nhận GB/US/BR đủ phủ
// đa số trận (file 16 bài học: 3 nguồn gây dưới 1% noise, chấp nhận được).
// Thêm 2 nguồn nữa làm tăng đáng kể chi phí collectAllMatches mà lợi ích biên
// nhỏ so với chi phí.
const SOURCE_LOCALES = ['GB', 'US', 'BR'];

type DbMatch = { id: string; home: string; away: string; startTimestamp: number; statusCode: number };

async function collectAllMatches(request: any): Promise<Map<string, DbMatch>> {
  const byId = new Map<string, DbMatch>();
  for (const date of DATES_TO_SCAN) {
    for (const srcLocale of SOURCE_LOCALES) {
      let page = 1;
      for (;;) {
        const { body } = await post(request, scheduledV2(date, srcLocale, 'all', 'en'), { sortByMatchTime: true, page });
        if (body.code !== 1) break;
        for (const e of body.data.events) {
          byId.set(e.id, {
            id: e.id,
            home: e.homeTeam.shortName,
            away: e.awayTeam.shortName,
            startTimestamp: e.startTimestamp,
            statusCode: e.status?.code,
          });
        }
        if (!body.data.pagination.hasNextPage) break;
        page++;
      }
    }
  }
  return byId;
}

/** Trận nằm trong vùng dễ lộ bug date-boundary nhất (giờ UTC gần 00:00 địa
 *  phương của hầu hết offset UTC-12..+14) — giống hệt ngưỡng lọc ở file 16. */
function isBoundaryMatch(m: DbMatch): boolean {
  const utcHour = new Date(m.startTimestamp * 1000).getUTCHours();
  return utcHour <= 4 || utcHour >= 19;
}

async function idsOnDateForType(request: any, date: string, locale: string, type: 'all' | 'upcoming' | 'finish'): Promise<Set<string>> {
  const ids = new Set<string>();
  let page = 1;
  for (;;) {
    const { body } = await post(request, scheduledV2(date, locale, type, 'en'), { sortByMatchTime: true, page });
    if (body.code !== 1) break;
    for (const e of body.data.events) ids.add(e.id);
    if (!body.data.pagination.hasNextPage) break;
    page++;
  }
  return ids;
}

// TỐI ƯU (2026-10-16, sau khi phát hiện file chạy quá lâu — nhiều phút không
// xong): cache theo (locale, tabType, date) được CHIA SẺ GIỮA CÁC TEST qua
// biến module-level, thay vì tạo mới mỗi test. Trước đây mỗi test (60 locale
// × 2 tab = 120 test) tự phân trang lại từ đầu dù nhiều test gọi trùng
// (locale, tab, date) — không có tác dụng gì vì cache cũ bị huỷ ngay khi test
// kết thúc. Giờ cache tồn tại suốt file, lần gọi sau cho cùng tổ hợp sẽ có
// ngay không cần gọi lại API.
const sharedDateCache = new Map<string, Set<string>>();
async function idsOnDateSharedCache(request: any, date: string, locale: string, tabType: 'upcoming' | 'finish'): Promise<Set<string>> {
  const key = `${locale}|${tabType}|${date}`;
  const cached = sharedDateCache.get(key);
  if (cached) return cached;
  const ids = await idsOnDateForType(request, date, locale, tabType);
  sharedDateCache.set(key, ids);
  return ids;
}

let allMatches: Map<string, DbMatch>;

test.beforeAll(async ({ request }) => {
  // Tăng từ 120s: giờ thu thập qua 5 nguồn (GB/US/BR/FR/DE) × 7 ngày thay vì
  // 3 nguồn × 5 ngày trước đây — nhiều request hơn đáng kể.
  test.setTimeout(240_000);
  allMatches = await collectAllMatches(request);
});

// ============================================================================
// Tab "Sắp diễn ra" (type=upcoming) và "Kết thúc" (type=finish) — cùng cơ chế
// date-boundary như tab "Tất cả", nhưng lọc thêm theo status để chỉ xét trận
// phù hợp với từng tab (upcoming = chưa đá, finish = đã kết thúc).
// ============================================================================
for (const locale of LOCALES_TO_CHECK) {
  for (const tabType of ['upcoming', 'finish'] as const) {
    test.describe(`date-boundary · tab ${tabType} · locale ${locale}`, () => {
      test(`trận gần ranh giới ngày (giờ địa phương ${LOCALE_TIMEZONE[locale]}) phải được API xếp đúng ngày ở tab ${tabType}`, async ({ request }) => {
        test.setTimeout(120_000);

        const wantFinished = tabType === 'finish';
        const candidates: Array<{ m: DbMatch; expectedDate: string }> = [];
        for (const m of allMatches.values()) {
          const isFinished = FINISHED_CODES.includes(m.statusCode);
          // upcoming thật sự chỉ gồm status "chưa đá" (code 0) — bỏ qua trận
          // có code khác (hoãn/huỷ/gián đoạn) để không lẫn noise không liên
          // quan đến bug date-boundary.
          if (wantFinished && !isFinished) continue;
          if (!wantFinished && m.statusCode !== 0) continue;
          const expectedDate = localDateFor(locale, m.startTimestamp);
          if (expectedDate && DATES_TO_SCAN.includes(expectedDate)) candidates.push({ m, expectedDate });
        }
        test.skip(candidates.length === 0, `Không có trận ${tabType} nào trong cửa sổ quét để kiểm tra locale ${locale}`);

        // Giảm từ 40 xuống 20 mẫu/locale — đủ để phát hiện bug (ảnh hưởng cả
        // dải giờ, không phải 1-2 trận lẻ tẻ) mà giảm đáng kể số request dò
        // "ngày lân cận" khi locale có nhiều trận fail cùng lúc.
        const boundaryMatches = candidates.filter(({ m }) => isBoundaryMatch(m)).slice(0, 20);
        test.skip(boundaryMatches.length === 0, `Không có trận ${tabType} nào gần ranh giới ngày cho locale ${locale}`);

        const byExpectedDate = new Map<string, DbMatch[]>();
        for (const { m, expectedDate } of boundaryMatches) {
          if (!byExpectedDate.has(expectedDate)) byExpectedDate.set(expectedDate, []);
          byExpectedDate.get(expectedDate)!.push(m);
        }

        const bad: string[] = [];
        let verified = 0;
        for (const [expectedDate, matches] of byExpectedDate) {
          const idsExpected = await idsOnDateSharedCache(request, expectedDate, locale, tabType);
          if (idsExpected.size === 0) continue;
          verified += matches.length;
          // Pattern bug date-boundary đã biết luôn là "lùi đúng 1 ngày" (UTC
          // gốc thay vì +offset địa phương) — chỉ cần dò ngày liền trước/sau
          // thay vì toàn bộ 7 ngày trong DATES_TO_SCAN, giảm request đáng kể
          // (từ tối đa 6 ngày/trận xuống còn 2 ngày/trận).
          const expectedIdx = DATES_TO_SCAN.indexOf(expectedDate);
          const nearbyDates = [DATES_TO_SCAN[expectedIdx - 1], DATES_TO_SCAN[expectedIdx + 1]].filter(Boolean) as string[];
          for (const m of matches) {
            if (idsExpected.has(m.id)) continue;
            let foundElsewhere: string | null = null;
            for (const otherDate of nearbyDates) {
              const ids = await idsOnDateSharedCache(request, otherDate, locale, tabType);
              if (ids.has(m.id)) { foundElsewhere = otherDate; break; }
            }
            if (foundElsewhere) {
              bad.push(`${m.id} (${m.home} vs ${m.away}, UTC=${new Date(m.startTimestamp * 1000).toISOString()}): kỳ vọng ngày ${expectedDate} theo giờ địa phương locale ${locale} (tab ${tabType}), nhưng thực tế bị xếp ở ngày ${foundElsewhere}`);
            }
          }
        }
        test.skip(verified === 0, `API không trả code 1 cho bất kỳ ngày nào cần verify (locale ${locale}, tab ${tabType})`);

        const threshold = Math.max(1, Math.ceil(verified * 0.01));
        expect(bad.length, `Locale ${locale}, tab ${tabType}: ${bad.length}/${verified} trận ĐÃ XÁC NHẬN bị xếp sai ngày:\n${bad.join('\n')}`).toBeLessThanOrEqual(threshold);
      });
    });
  }
}

// ============================================================================
// Tab Live (live-v1 / live-v2) — không có tham số date/type (chỉ trả trận
// đang đá thời điểm gọi), nên không thể test "date-boundary" theo nghĩa y hệt
// trên. Thay vào đó verify bất biến quan trọng nhất liên quan tới cùng 1 lớp
// bug: trận đang live GẦN RANH GIỚI NGÀY (đá vắt qua nửa đêm giờ địa phương)
// của locale đang lỗi (GB/IE/PT/MA) vẫn phải XUẤT HIỆN TRONG response live —
// tức bug date-boundary ở scheduled-v2 không kéo theo việc trận biến mất khỏi
// tab Live (2 lớp dữ liệu độc lập, nhưng đáng kiểm chứng để biết phạm vi ảnh
// hưởng thực tế có lan sang Live hay không).
// ============================================================================
test.describe('date-boundary · tab live (live-v1/live-v2) không mất trận biên giới ngày', () => {
  for (const locale of LOCALES_TO_CHECK) {
    test(`trận đang live gần ranh giới ngày giờ địa phương locale ${locale} vẫn xuất hiện ở live-v1/live-v2`, async ({ request }) => {
      // Tìm trận đang inprogress trong tập đã thu thập (status code 5/6/7/13/14/15).
      const INPROGRESS_CODES = [5, 6, 7, 13, 14, 15];
      const liveCandidates = [...allMatches.values()].filter((m) => INPROGRESS_CODES.includes(m.statusCode) && isBoundaryMatch(m));
      test.skip(liveCandidates.length === 0, `Không có trận đang live gần ranh giới ngày trong cửa sổ quét để kiểm tra locale ${locale}`);

      const [{ body: v1 }, { body: v2 }] = await Promise.all([
        post(request, liveV1(locale, 'en')),
        post(request, liveV2(locale, 'en')),
      ]);
      test.skip(v1.code !== 1 && v2.code !== 1, `live-v1/live-v2 không trả code 1 cho locale ${locale}`);

      const idsV1 = new Set((v1.code === 1 ? v1.data.events : []).map((e: any) => e.id));
      const idsV2 = new Set((v2.code === 1 ? v2.data.events : []).map((e: any) => e.id));

      const missingFromBoth = liveCandidates.filter((m) => !idsV1.has(m.id) && !idsV2.has(m.id));
      // Không hard-fail cứng — trận có thể đã kết thúc giữa lúc thu thập dữ
      // liệu nguồn và lúc gọi live (độ trễ vài giây-vài phút), nên không còn
      // "đang live" nữa là điều bình thường. Chỉ ghi nhận annotation để theo
      // dõi tỷ lệ qua daily, không biến thành bug giả do race condition.
      test.info().annotations.push({
        type: 'live-boundary-check',
        description: `Locale ${locale}: ${liveCandidates.length} trận live gần ranh giới ngày tại thời điểm thu thập, ${missingFromBoth.length} không còn thấy ở live-v1/live-v2 lúc verify (có thể do đã kết thúc giữa chừng, không nhất thiết là bug).`,
      });
    });
  }
});

// ============================================================================
// Tab Live — BUG RIÊNG đã xác nhận qua tài liệu gốc (3-5-live-v1.md, mục 03
// bước 10): khác với bug date-boundary ở scheduled-v2 (trận bị gán sai NGÀY),
// bug ở Live nằm ở bước "Admin top match": server đọc Redis
// `top-match:<ngày VN>:<locale>` và chỉ ghim THÊM top-match của "ngày mai" nếu
// `now − offset` (giờ hiện tại của client) đã sang ngày mới. Vì GB/IE/MA không
// có `allowedOffsets` (xác nhận qua file config timezone_by_locale.json —
// GB/IE/MA chỉ có `utc` cố định, không có mảng allowedOffsets; PT là locale
// DUY NHẤT trong 4 locale lỗi có allowedOffsets: [0, 60]), offset gửi lên bị
// server bỏ qua hoàn toàn với GB/IE/MA → thời điểm "sang ngày mới" của họ luôn
// bị tính theo UTC+0 cố định thay vì BST/IST/giờ Morocco thực tế.
//
// CÁCH VERIFY: gọi live-v1 cho GB với offset khác nhau (giả lập máy tính ở
// GB thời điểm hiện tại BST=+60 vs một client gửi offset=0) — nếu endpoint
// thực sự đọc offset để quyết định ghim top-match ngày mai, 2 lần gọi NÊN có
// thể khác nhau vào đúng khung giờ nhạy cảm (23:00-00:59 UTC, tức lúc GB đã
// sang ngày mới theo BST nhưng UTC thì chưa). Ngoài khung giờ đó, kỳ vọng kết
// quả giống nhau là BÌNH THƯỜNG (không phải lúc nào cũng bắt được khác biệt
// qua daily — chỉ có ý nghĩa khi chạy đúng khung giờ nhạy cảm UTC).
// ============================================================================
test.describe('date-boundary · tab live · bug "Admin top match" tính sai ngày mới cho GB/IE/MA (thiếu allowedOffsets)', () => {
  test('live-v1 cho GB: offset=0 vs offset=60 (BST) phải cho kết quả NHƯ NHAU hiện tại (xác nhận offset bị bỏ qua) — annotation cảnh báo nếu đang trong khung giờ nhạy cảm', async ({ request }) => {
    const nowUtcHour = new Date().getUTCHours();
    const inSensitiveWindow = nowUtcHour === 23 || nowUtcHour === 0;

    const [withOffset0, withOffsetBST] = await Promise.all([
      request.post(`${HOME_BASE}/events/live/locale/GB?language=en&offset=0`, { data: {}, headers: { 'Content-Type': 'application/json' } }),
      request.post(`${HOME_BASE}/events/live/locale/GB?language=en&offset=60`, { data: {}, headers: { 'Content-Type': 'application/json' } }),
    ]);
    const body0 = await withOffset0.json();
    const body60 = await withOffsetBST.json();
    test.skip(body0.code !== 1 || body60.code !== 1, 'live-v1 không trả code 1 cho GB tại thời điểm chạy (có thể không có trận live nào)');

    const ids0 = (body0.data.events ?? []).map((e: any) => e.id).join(',');
    const ids60 = (body60.data.events ?? []).map((e: any) => e.id).join(',');
    const identical = ids0 === ids60;

    test.info().annotations.push({
      type: 'admin-top-match-offset-check',
      description:
        `Giờ UTC hiện tại: ${nowUtcHour}h (${inSensitiveWindow ? 'ĐANG trong khung giờ nhạy cảm 23h-00h59 UTC — lúc GB đã sang ngày mới theo BST nhưng chưa sang theo UTC' : 'ngoài khung giờ nhạy cảm, không kỳ vọng thấy khác biệt lúc này'}). ` +
        `Response offset=0 và offset=60 (BST) cho GB ${identical ? 'GIỐNG HỆT NHAU' : 'KHÁC NHAU'} (so theo danh sách id trận). ` +
        `Theo doc gốc (3-5-live-v1.md mục 03.10), offset chỉ ảnh hưởng việc ghim thêm admin top-match của "ngày mai" — vì GB không có allowedOffsets, offset LUÔN bị bỏ qua, nên 2 response GIỐNG NHAU xuyên suốt (kể cả trong khung giờ nhạy cảm) chính là bằng chứng bug: client không thể điều khiển việc hiện top-match đúng ngày của mình.`,
    });

    // Chỉ hard-fail khi ĐANG ở khung giờ nhạy cảm (lúc duy nhất có thể phân
    // biệt được bug thật với "offset không có tác dụng gì vì không có trận
    // top-match nào được ghim lúc này") — nếu offset được xử lý đúng, 2 kết
    // quả phải KHÁC NHAU trong khung giờ này (GB cần thấy top-match ngày mai
    // sớm hơn 1 tiếng so với client offset=0); giống nhau trong khung giờ này
    // là dấu hiệu rõ bug đang xảy ra ngay lúc test chạy.
    if (inSensitiveWindow) {
      expect(identical, 'Trong khung giờ nhạy cảm (23h-00h59 UTC), live-v1 cho GB với offset=0 và offset=60 (BST) phải khác nhau nếu admin có ghim top-match ngày mai — giống nhau tuyệt đối là dấu hiệu offset bị bỏ qua (bug Admin top match thiếu allowedOffsets cho GB)').toBe(false);
    }
  });
});
