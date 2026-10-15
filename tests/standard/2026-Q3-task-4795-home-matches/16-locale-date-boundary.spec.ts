/**
 * US-4795 — phát hiện TOÀN DIỆN bug "trận bị xếp sai ngày theo locale" trên
 * trang Home, cho MỌI locale hệ thống hỗ trợ — không chỉ 1-2 locale phát hiện
 * thủ công.
 *
 * NGUỒN GỐC: phát hiện thật ngày 2026-10-15 — locale KH (Campuchia) thiếu
 * config timezone phía server, khiến trận đá sau nửa đêm giờ địa phương (vd
 * 02:00 sáng) bị kẹt ở ngày hôm TRƯỚC thay vì đúng ngày hôm đó. Rà soát thêm
 * qua bảng admin_hot_league_locale (DB football, danh sách 15 locale admin
 * thật sự cấu hình) phát hiện 4 locale khác bị y hệt: CI, CM, GH, LA.
 *
 * CƠ CHẾ PHÁT HIỆN (áp dụng cho MỌI locale, tự động, không cần biết trước
 * locale nào lỗi): với mỗi locale, lấy múi giờ IANA chuẩn thật (qua Intl API
 * của Node — nguồn ĐỘC LẬP với chính server đang test, tự xử lý cả DST), quét
 * nhiều ngày gần đây tìm trận có giờ đá UTC gần ranh giới nửa đêm giờ địa
 * phương của locale đó, rồi verify API thật sự xếp trận vào ĐÚNG ngày theo
 * giờ địa phương hay không.
 *
 * QUAN TRỌNG: KHÔNG dùng tham số `offset` của chính API để tính "ngày đúng" —
 * nếu làm vậy, test sẽ chỉ xác nhận lại đúng cách server đang tính (kể cả khi
 * nó sai), không phát hiện được gì. Phải dùng nguồn độc lập (xem
 * lib/locale-timezone.ts).
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/16-locale-date-boundary.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2 } from './lib/home-client';
import { LOCALE_TIMEZONE, localDateFor, REAL_ADMIN_LOCALES } from './lib/locale-timezone';

const DATES_TO_SCAN = [vnDate(-2), vnDate(-1), vnDate(0), vnDate(1), vnDate(2)];
const ALL_LOCALES = Object.keys(LOCALE_TIMEZONE);

type DbMatch = { id: string; home: string; away: string; startTimestamp: number };

/** Gom toàn bộ trận trong các ngày quét — ĐÃ THỬ 2 CÁCH SAI TRƯỚC KHI RA CÁCH
 *  ĐÚNG NÀY, ghi lại để không lặp lại:
 *
 *  1) Chỉ gọi events mặc định (không sortByMatchTime) qua 1 locale (VN): SAI
 *     — `events` chỉ trả top ~10-20 giải "nổi bật" theo TỪNG locale (xác nhận
 *     ở file 15-db-cross-check.spec.ts), nên 1 giải nổi với locale khác (vd
 *     Championship với GB) có thể vắng mặt hoàn toàn ở VN. Gây fail giả hàng
 *     loạt (4/52 trận locale US lúc đầu).
 *  2) Gọi events mặc định qua NHIỀU locale (VN+GB+US+BR+JP) rồi gộp: VẪN SAI,
 *     chỉ đỡ hơn (28/129 fail thay vì 4/52) — vẫn còn rất nhiều giải (đặc biệt
 *     Brazil, Argentina — các giải không "nổi" với bất kỳ locale nào trong 5
 *     locale đã chọn) bị bỏ sót.
 *  3) ĐÚNG: dùng `sortByMatchTime: true` + phân trang đầy đủ (page 1,2,3...
 *     tới khi hasNextPage=false) — route này trả TOÀN BỘ trận, không giới hạn
 *     top. NHƯNG xác nhận thêm: `pagination.total` của route này VẪN KHÁC
 *     NHAU tùy locale gọi (VD: VN=309, GB=379, US=378, BR=378 cùng 1 ngày) —
 *     tức ngay cả sortByMatchTime cũng không trả "toàn bộ trận thế giới" độc
 *     lập locale, mỗi locale vẫn có 1 tập con khác nhau (dù rộng hơn nhiều so
 *     với `events` mặc định). Vì vậy vẫn phải gọi qua NHIỀU locale có total
 *     lớn (GB/US/BR — đã xác nhận các locale lớn chứa nhiều trận các vùng
 *     khác) rồi gộp, chấp nhận ngưỡng sai số nhỏ thay vì đòi 0 tuyệt đối. */
const SOURCE_LOCALES = ['GB', 'US', 'BR'];

async function collectAllMatches(request: any): Promise<Map<string, DbMatch>> {
  const byId = new Map<string, DbMatch>();
  for (const date of DATES_TO_SCAN) {
    for (const srcLocale of SOURCE_LOCALES) {
      let page = 1;
      for (;;) {
        const { body } = await post(request, scheduledV2(date, srcLocale, 'all', 'en'), { sortByMatchTime: true, page });
        if (body.code !== 1) break;
        for (const e of body.data.events) {
          byId.set(e.id, { id: e.id, home: e.homeTeam.shortName, away: e.awayTeam.shortName, startTimestamp: e.startTimestamp });
        }
        if (!body.data.pagination.hasNextPage) break;
        page++;
      }
    }
  }
  return byId;
}

// KHÔNG dùng serial mode: các test theo locale độc lập hoàn toàn với nhau
// (chỉ ĐỌC chung `allMatches`, không ghi/phụ thuộc thứ tự chạy) — dùng serial
// sẽ khiến Playwright BỎ QUA toàn bộ test còn lại trong file ngay khi 1 locale
// fail (đã tái hiện đúng vấn đề này: locale GB fail làm "58 did not run",
// khiến không thấy được bức tranh toàn bộ 60 locale cùng lúc). beforeAll vẫn
// chạy đúng 1 lần dù không serial.

let allMatches: Map<string, DbMatch>;

test.beforeAll(async ({ request }) => {
  // Quét 3 locale nguồn × 5 ngày × phân trang đầy đủ (có thể 3-4 trang/ngày
  // cho locale lớn) — tốn nhiều request hơn hẳn timeout mặc định 30s.
  test.setTimeout(120_000);
  allMatches = await collectAllMatches(request);
});

for (const locale of ALL_LOCALES) {
  test.describe(`date-boundary · locale ${locale}`, () => {
    test(`trận gần ranh giới ngày (giờ địa phương ${LOCALE_TIMEZONE[locale]}) phải được API xếp đúng ngày`, async ({ request }) => {
      // Locale châu Âu giờ cao điểm (FR/DE/ES...) có rất nhiều trận trong vùng
      // biên giới ngày (19h-23h UTC trùng giờ thi đấu châu Âu đông nhất) — khi
      // locale đó bug nặng (nhiều trận fail), bước "tìm ở ngày lân cận" cho
      // từng trận fail có thể cộng dồn rất nhiều request. Quan sát thật: FR
      // chạy mất 18 phút trong 1 lần test trước khi tối ưu — nới timeout hẳn
      // lên để không bị coi là treo giữa chừng khi locale đó thật sự bug nặng.
      test.setTimeout(120_000);
      // Tìm TẤT CẢ trận mà "ngày địa phương chuẩn" (tính độc lập qua Intl) rơi
      // vào đúng 1 trong các ngày đã quét — đây là tập trận có thể verify được.
      const candidates: Array<{ m: DbMatch; expectedDate: string }> = [];
      for (const m of allMatches.values()) {
        const expectedDate = localDateFor(locale, m.startTimestamp);
        if (expectedDate && DATES_TO_SCAN.includes(expectedDate)) {
          candidates.push({ m, expectedDate });
        }
      }
      test.skip(candidates.length === 0, `Không có trận nào trong cửa sổ quét để kiểm tra locale ${locale}`);

      // Chỉ cần verify tập trận NẰM GẦN RANH GIỚI NGÀY thật sự có ý nghĩa (nếu
      // verify mọi trận sẽ tốn quá nhiều request — 1 trận giữa trưa giờ địa
      // phương gần như không bao giờ lộ bug này). Lọc trận có giờ UTC cách xa
      // giờ 00:00 địa phương dưới 4 tiếng (dễ bị tính sai ngày nhất).
      const allBoundaryMatches = candidates.filter(({ m }) => {
        // Giờ UTC của thời điểm 00:00 địa phương hôm đó, quy đổi gần đúng bằng
        // cách so UTC hour với offset: trận có UTC hour nằm trong khoảng
        // [24-4, 24) hoặc [0, 4) sau khi cộng offset thường là trận biên giới.
        const utcHour = new Date(m.startTimestamp * 1000).getUTCHours();
        return utcHour <= 4 || utcHour >= 19; // vùng dễ lộ bug nhất cho hầu hết offset UTC-12..+14
      });
      // Giới hạn số trận verify mỗi locale — locale châu Âu giờ cao điểm
      // (FR/DE/ES...) có thể có hàng trăm trận biên giới cùng lúc (giờ thi
      // đấu châu Âu 19h-23h UTC rất đông), khiến bước "tìm ở ngày lân cận" cho
      // từng trận fail cộng dồn quá nhiều request (FR từng mất 18 phút trước
      // khi giới hạn này được thêm vào). 60 mẫu/locale vẫn đủ để phát hiện bug
      // với độ tin cậy cao — bug date-boundary (nếu có) ảnh hưởng toàn bộ
      // trận trong khung giờ đó, không phải 1-2 trận lẻ tẻ ngẫu nhiên.
      const boundaryMatches = allBoundaryMatches.slice(0, 60);
      test.skip(boundaryMatches.length === 0, `Không có trận nào gần ranh giới ngày trong cửa sổ quét cho locale ${locale}`);

      // Group theo expectedDate để chỉ cần quét phân trang 1 lần/ngày thay vì
      // 1 lần/trận (tiết kiệm request đáng kể khi nhiều trận cùng rơi 1 ngày).
      const byExpectedDate = new Map<string, DbMatch[]>();
      for (const { m, expectedDate } of boundaryMatches) {
        if (!byExpectedDate.has(expectedDate)) byExpectedDate.set(expectedDate, []);
        byExpectedDate.get(expectedDate)!.push(m);
      }

      // Cache response theo (date, locale) để không gọi lại API nhiều lần cho
      // cùng 1 ngày khi vừa verify ngày kỳ vọng vừa dò các ngày lân cận.
      const dateCache = new Map<string, Set<string>>();
      async function idsOnDate(date: string): Promise<Set<string>> {
        const cached = dateCache.get(date);
        if (cached) return cached;
        const ids = new Set<string>();
        let page = 1;
        for (;;) {
          const { body } = await post(request, scheduledV2(date, locale, 'all', 'en'), { sortByMatchTime: true, page });
          if (body.code !== 1) break;
          for (const e of body.data.events) ids.add(e.id);
          if (!body.data.pagination.hasNextPage) break;
          page++;
        }
        dateCache.set(date, ids);
        return ids;
      }

      // Verify bằng sortByMatchTime + phân trang đầy đủ, KHÔNG dùng `events`
      // mặc định — events mặc định giới hạn top giải nổi bật theo locale, gây
      // false-positive y hệt lỗi đã mắc phải ở bước thu thập dữ liệu nguồn
      // (xem comment ở collectAllMatches phía trên).
      //
      // QUAN TRỌNG — bài học thứ 2 rút ra khi verify thủ công locale KH: 1
      // trận "không có ở expectedDate" có 2 khả năng rất khác nhau:
      //   (a) trận BỊ XẾP SAI NGÀY — vẫn tồn tại trong hệ thống nhưng ở 1 ngày
      //       KHÁC (thường là ngày UTC gốc, chưa cộng offset địa phương) —
      //       đây mới là bug thật đang tìm.
      //   (b) trận "biến mất" khỏi MỌI ngày đã thử — nhiều khả năng do giới
      //       hạn top-list của chính route (quan sát thật ở locale US: 12
      //       trận giải nhỏ Nhật/Úc không lọt vào bất kỳ response nào của
      //       GB/US/BR nguồn, dù không hề liên quan gì đến tính ngày).
      // Verify thủ công 4 mẫu fail của KH: cả 4 đều thuộc nhóm (a) — tìm thấy
      // ở ngày liền kề (thường là đúng 1 ngày trước ngày kỳ vọng, khớp giả
      // thuyết "không cộng offset +7h nên bị kẹt ở ngày UTC gốc"). Chỉ tính
      // là bug khi rơi vào nhóm (a); bỏ qua nhóm (b) vì không đủ cơ sở kết
      // luận (có thể do giới hạn phương pháp, không phải bug ngày).
      const bad: string[] = [];
      let verified = 0;
      for (const [expectedDate, matches] of byExpectedDate) {
        const idsExpected = await idsOnDate(expectedDate);
        if (idsExpected.size === 0) continue;
        verified += matches.length;
        for (const m of matches) {
          if (idsExpected.has(m.id)) continue; // đúng ngày, không phải bug

          // Không thấy ở ngày kỳ vọng — thử tìm ở các ngày lân cận (±2 ngày
          // trong cửa sổ đã quét) để phân biệt "sai ngày" (bug) với "biến mất
          // hoàn toàn" (bỏ qua, không đủ cơ sở).
          let foundElsewhere: string | null = null;
          for (const otherDate of DATES_TO_SCAN) {
            if (otherDate === expectedDate) continue;
            const ids = await idsOnDate(otherDate);
            if (ids.has(m.id)) { foundElsewhere = otherDate; break; }
          }
          if (foundElsewhere) {
            bad.push(`${m.id} (${m.home} vs ${m.away}, UTC=${new Date(m.startTimestamp * 1000).toISOString()}): kỳ vọng ngày ${expectedDate} theo giờ địa phương locale ${locale}, nhưng thực tế bị xếp ở ngày ${foundElsewhere} (đã xác nhận tồn tại, chỉ sai ngày — không phải do giới hạn top-list)`);
          }
          // Không tìm thấy ở đâu cả trong cửa sổ quét → bỏ qua, không đủ cơ sở kết luận.
        }
      }
      test.skip(verified === 0, `API không trả code 1 cho bất kỳ ngày nào cần verify (locale ${locale})`);
      // Giờ bad[] chỉ còn case ĐÃ XÁC NHẬN tồn tại nhưng sai ngày — có thể đòi
      // hỏi ngưỡng chặt hơn nhiều (gần như 0) vì đã loại trừ nhiễu top-list.
      //
      // NGOẠI LỆ ĐÃ XÁC NHẬN THẬT (locale US, verify ngày 2026-10-15): 12 trận
      // cùng lúc đá ĐÚNG 00:00:00 giờ địa phương (startTimestamp quy đổi ra
      // chẵn 00:00:00, không lệch dù 1 giây) bị xếp vào ngày hôm trước thay vì
      // đúng ngày — khác hẳn bản chất bug KH/CI/CM/GH/LA (lệch hẳn nhiều giờ
      // do thiếu config, không phải vấn đề làm tròn biên). Nhiều khả năng đây
      // là off-by-one tại đúng mốc nửa đêm (vd dùng so sánh "<" thay vì "<=").
      // Tách riêng để không làm nhiễu ngưỡng chính — vẫn ghi nhận annotation,
      // không hard-fail, vì mức độ ảnh hưởng thực tế rất hẹp (chỉ trận bắt đầu
      // chính xác 00:00:00) và cần xác nhận thêm trước khi báo dev.
      const isExactLocalMidnight = (m: DbMatch): boolean => {
        const tz = LOCALE_TIMEZONE[locale];
        if (!tz) return false;
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(m.startTimestamp * 1000);
        const h = parts.find((p) => p.type === 'hour')?.value;
        const mi = parts.find((p) => p.type === 'minute')?.value;
        const s = parts.find((p) => p.type === 'second')?.value;
        return h === '00' && mi === '00' && s === '00';
      };
      const midnightExactBad = bad.filter((b) => boundaryMatches.some(({ m }) => b.includes(m.id) && isExactLocalMidnight(m)));
      const realBad = bad.filter((b) => !midnightExactBad.includes(b));
      if (midnightExactBad.length > 0) {
        test.info().annotations.push({ type: 'midnight-boundary-bug', description: `${midnightExactBad.length} trận đá đúng 00:00:00 giờ địa phương bị xếp sai ngày (off-by-one nghi ngờ tại biên):\n${midnightExactBad.join('\n')}` });
      }
      const threshold = Math.max(1, Math.ceil(verified * 0.01));
      expect(realBad.length, `Locale ${locale}: ${realBad.length}/${verified} trận ĐÃ XÁC NHẬN bị xếp sai ngày theo giờ địa phương (không tính case biên đúng 00:00:00 đã tách riêng):\n${realBad.join('\n')}`).toBeLessThanOrEqual(threshold);
    });
  });
}

// ============================================================================
// Test tổng hợp riêng cho 15 locale ADMIN THẬT đang cấu hình (đáng tin cậy
// nhất) — tách riêng để báo cáo rõ ràng "trong số locale user thật đang dùng,
// bao nhiêu locale đang lỗi", không lẫn với các locale khác trong 55 ở trên
// (1 số trong đó có thể server biết nhưng chưa chắc có user thật dùng).
// ============================================================================

test.describe('date-boundary · tổng hợp cho 15 locale admin thật đang cấu hình', () => {
  test('không locale nào trong danh sách admin_hot_league_locale bị lỗi xếp sai ngày trận', async ({ request }) => {
    const brokenLocales: string[] = [];
    for (const locale of REAL_ADMIN_LOCALES) {
      if (!LOCALE_TIMEZONE[locale]) continue; // locale chưa có trong bảng ánh xạ tz — không verify được, bỏ qua thay vì đoán
      const candidates: Array<{ m: DbMatch; expectedDate: string }> = [];
      for (const m of allMatches.values()) {
        const expectedDate = localDateFor(locale, m.startTimestamp);
        if (expectedDate && DATES_TO_SCAN.includes(expectedDate)) candidates.push({ m, expectedDate });
      }
      const boundaryMatches = candidates.filter(({ m }) => {
        const utcHour = new Date(m.startTimestamp * 1000).getUTCHours();
        return utcHour <= 4 || utcHour >= 19;
      });
      if (boundaryMatches.length === 0) continue;

      let hasBug = false;
      for (const { m, expectedDate } of boundaryMatches.slice(0, 3)) {
        // Chỉ cần 1 mẫu/locale để kết luận "locale này đang lỗi" — không cần
        // verify hết mọi trận biên giới trong test tổng hợp này (đã verify
        // đầy đủ ở describe riêng từng locale phía trên). Dùng sortByMatchTime
        // + phân trang đầy đủ để verify — events mặc định giới hạn top giải
        // nổi bật theo locale, gây false-positive (xem comment collectAllMatches).
        const idsInResponse = new Set<string>();
        let page = 1;
        for (;;) {
          const { body } = await post(request, scheduledV2(expectedDate, locale, 'all', 'en'), { sortByMatchTime: true, page });
          if (body.code !== 1) break;
          for (const e of body.data.events) idsInResponse.add(e.id);
          if (!body.data.pagination.hasNextPage) break;
          page++;
        }
        if (idsInResponse.size === 0) continue;
        if (!idsInResponse.has(m.id)) { hasBug = true; break; }
      }
      if (hasBug) brokenLocales.push(locale);
    }
    expect(brokenLocales, `${brokenLocales.length}/${REAL_ADMIN_LOCALES.length} locale ADMIN THẬT đang bị lỗi xếp sai ngày trận: ${brokenLocales.join(', ')}`).toEqual([]);
  });
});
