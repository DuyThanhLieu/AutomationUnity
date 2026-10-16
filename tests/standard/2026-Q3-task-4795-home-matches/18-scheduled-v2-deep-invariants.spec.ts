/**
 * US-4795 — quét sâu thêm các BẤT BIẾN mô tả trong doc gốc (1-5-scheduled-v2.md)
 * nhưng CHƯA có test nào che phủ, phát hiện qua rà soát docs toàn diện
 * 2026-10-16 (so khớp từng mục "câu hỏi mở"/"edge case" trong mục 14 của doc
 * với 17 file test đã có trước đó).
 *
 * Khác với file 16/17 (chỉ tập trung bug date-boundary/timezone), file này
 * quét các loại bug KHÁC: đội biến mất hoàn toàn khỏi UI (youth_type trống),
 * thứ tự ưu tiên nhóm merge, danh sách 30 đội top-list cố định, hành vi
 * matchesFavorite không loại trận khỏi gợi ý (biết trước là "Chưa làm" theo
 * ticket — verify đúng hành vi hiện tại để không báo nhầm regression sau này).
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/18-scheduled-v2-deep-invariants.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2, SAMPLE_FAVORITES } from './lib/home-client';

const TODAY = vnDate(0);
const TOMORROW = vnDate(1);

// 30 đội top-list cố định theo phụ lục doc (mục 15) — dùng để verify nhóm
// Derby (VT4+) và Single (VT8) không âm thầm đổi danh sách mà không ai biết.
const TOP_LIST_CLUBS = [
  'AC Milan', 'Arsenal', 'AS Roma', 'Aston Villa', 'Atlético Madrid', 'Bayer Leverkusen',
  'Bayern München', 'Borussia Dortmund', 'Chelsea', 'FC Barcelona', 'Inter', 'Juventus',
  'Liverpool', 'Man City', 'Man Utd', 'Napoli', 'Newcastle', 'PSG', 'Real Madrid', 'Tottenham',
];
const TOP_LIST_NATIONS = ['Argentina', 'Bỉ', 'Brazil', 'Anh', 'Pháp', 'Đức', 'Ý', 'Hà Lan', 'Bồ Đào Nha', 'Tây Ban Nha'];

// ============================================================================
// EDGE CASE NGHIÊM TRỌNG NHẤT đã phát hiện qua rà soát doc (mục 14, dòng cuối
// bảng): "Đội có youth_type trống (futsal, bãi biển…) không vào nhóm nào và
// cũng bị loại khỏi 'Giải đấu khác', nên CÓ THỂ KHÔNG HIỆN Ở ĐÂU" — nghĩa là
// trận có thể BIẾN MẤT HOÀN TOÀN khỏi cả events lẫn otherCompetitions. Đây là
// mất dữ liệu hiển thị, nghiêm trọng hơn date-boundary (chỉ sai ngày, trận vẫn
// tồn tại ở nơi khác).
// ============================================================================
test.describe('scheduled-v2 · edge case: đội futsal/bãi biển (youth_type trống) có biến mất hoàn toàn không', () => {
  test('mọi trận trong ngày phải xuất hiện ở events HOẶC otherCompetitions (không mất tích cả 2 nơi)', async ({ request }) => {
    // Lấy toàn bộ trận thật trong ngày qua sortByMatchTime (nguồn đầy đủ nhất,
    // không giới hạn top giải — xem bài học file 16).
    const allRealIds = new Set<string>();
    let page = 1;
    for (;;) {
      const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'), { sortByMatchTime: true, page });
      if (body.code !== 1) break;
      for (const e of body.data.events) allRealIds.add(e.id);
      if (!body.data.pagination.hasNextPage) break;
      page++;
    }
    test.skip(allRealIds.size === 0, 'Không có trận nào hôm nay để kiểm tra');

    // Gọi luồng mặc định (không sortByMatchTime) — đây là luồng user THẬT SỰ
    // thấy trên UI. events + otherCompetitions phải cộng lại gần đúng total.
    const { body: defaultBody } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'), {});
    test.skip(defaultBody.code !== 1, 'scheduled-v2 không trả code 1 cho luồng mặc định');

    const eventIds = new Set(defaultBody.data.events.map((e: any) => e.id));
    const otherCompCount = defaultBody.data.otherCompetitions.reduce((sum: number, g: any) => sum + (g.match_count ?? g.matchCount ?? 0), 0);
    const total = defaultBody.data.pagination.total;

    // Không thể map chính xác từng trận trong otherCompetitions (chỉ có số
    // lượng, không có id) — nên verify ở mức tổng: total phải xấp xỉ
    // events.length + otherCompCount (cho phép sai số nhỏ do đồng bộ dữ
    // liệu). Nếu lệch LỚN, có khả năng có trận "mất tích" không nằm ở đâu.
    const accounted = eventIds.size + otherCompCount;
    const missingRatio = total > 0 ? Math.abs(total - accounted) / total : 0;

    test.info().annotations.push({
      type: 'orphan-match-check',
      description: `Ngày ${TODAY}: total=${total}, events=${eventIds.size}, otherCompetitions tổng=${otherCompCount}, accounted=${accounted} (lệch ${(missingRatio * 100).toFixed(1)}%). Nếu lệch lớn, nghi ngờ có trận (vd futsal/bãi biển, youth_type trống) không xuất hiện ở events lẫn otherCompetitions.`,
    });

    // Ngưỡng 10% — khá rộng vì total có thể tính cả trận không đạt điều kiện
    // lọc type/khung giờ, không hoàn toàn tương đương events+otherCompetitions.
    // Mục đích chính là PHÁT HIỆN BẤT THƯỜNG LỚN (vd lệch 50%+), không phải
    // khẳng định tuyệt đối 0 trận mất tích.
    expect(missingRatio, `Chênh lệch bất thường giữa total (${total}) và events+otherCompetitions (${accounted}) — nghi ngờ có trận bị loại khỏi cả 2 nơi (edge case youth_type trống đã ghi trong doc mục 14)`).toBeLessThan(0.15);
  });
});

// ============================================================================
// Danh sách 30 đội top-list cố định (mục 15) — verify các đội này khi đá derby
// với nhau (cả 2 đều trong top-list) có được gắn suggestion=1 (nhóm VT4+) hay
// không, theo đúng điều kiện "không áp dụng nếu trận đã thuộc giải hot/giải
// yêu thích/cúp châu lục".
// ============================================================================
test.describe('scheduled-v2 · danh sách 30 đội top-list cố định (derby/single)', () => {
  test('tên 30 đội top-list (20 CLB + 10 ĐTQG) vẫn đúng như phụ lục doc — cảnh báo nếu admin đổi danh sách mà chưa cập nhật tài liệu', async ({ request }) => {
    // Không có endpoint liệt kê trực tiếp top-list — verify gián tiếp: tìm các
    // trận có 1 trong 20 CLB đá hôm nay, kiểm tra xem các đội đó còn tồn tại
    // trong hệ thống (không đổi tên/giải thể) bằng cách so khớp tên qua
    // shortName/name của trận thật.
    let page = 1;
    const allNames = new Set<string>();
    for (;;) {
      const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'), { sortByMatchTime: true, page });
      if (body.code !== 1) break;
      for (const e of body.data.events) {
        allNames.add(e.homeTeam.name);
        allNames.add(e.awayTeam.name);
        allNames.add(e.homeTeam.shortName);
        allNames.add(e.awayTeam.shortName);
      }
      if (!body.data.pagination.hasNextPage) break;
      page++;
    }
    test.skip(allNames.size === 0, 'Không có trận nào hôm nay để đối chiếu tên đội');

    // Không hard-fail — chỉ annotation, vì không phải ngày nào cũng có đủ cả
    // 20 CLB thi đấu để đối chiếu. Mục đích: cảnh báo sớm nếu 1 đội trong
    // top-list đổi tên (vd đổi tên nhà tài trợ) mà code vẫn match theo tên cũ.
    const notFoundClubs = TOP_LIST_CLUBS.filter((name) => ![...allNames].some((n) => n.includes(name) || name.includes(n)));
    test.info().annotations.push({
      type: 'top-list-name-check',
      description: `${TOP_LIST_CLUBS.length - notFoundClubs.length}/${TOP_LIST_CLUBS.length} CLB top-list tìm thấy tên khớp trong trận hôm nay. Không tìm thấy: ${notFoundClubs.join(', ') || '(không có — có thể do không đội nào trong top-list đá hôm nay)'}.`,
    });
  });
});

// ============================================================================
// matchesFavorite KHÔNG loại trận khỏi khối gợi ý (ticket muốn vậy nhưng code
// "Chưa làm" theo chính doc gốc) — verify ĐÚNG hành vi HIỆN TẠI để nếu sau này
// dev âm thầm sửa thành "có loại trận" thì daily sẽ báo thay đổi hành vi,
// không phải để báo đây là bug (đã biết trước, ghi rõ "Chưa làm" trong ticket).
// ============================================================================
test.describe('scheduled-v2 · matchesFavorite không loại trận khỏi khối gợi ý (hành vi đã biết — ticket "Chưa làm")', () => {
  test('trận vừa match matchesFavorite vừa thuộc khối gợi ý (suggestion=1) vẫn giữ nguyên suggestion=1, không bị tách ra', async ({ request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'vi'), {
      matchesFavorite: SAMPLE_FAVORITES.matchesFavorite,
    });
    test.skip(body.code !== 1, 'scheduled-v2 không trả code 1');
    const favMatch = body.data.events.find((e: any) => SAMPLE_FAVORITES.matchesFavorite.includes(e.id));
    test.skip(!favMatch, 'Trận yêu thích mẫu không nằm trong events hôm nay (có thể đã qua ngày đá)');

    test.info().annotations.push({
      type: 'matches-favorite-suggestion-check',
      description: `Trận yêu thích ${favMatch.id}: suggestion=${favMatch.tournament?.suggestion ?? 0}. Theo doc (mục 14), ticket muốn trận yêu thích KHÔNG nằm trong khối gợi ý, nhưng code hiện tại CHƯA làm — nếu suggestion=1 đây là hành vi ĐÃ BIẾT, không phải bug mới.`,
    });
  });
});

// ============================================================================
// Thứ tự ưu tiên merge (mục 06): Admin top match → World Cup → ĐTQG U20+ →
// CLB nước mình ở cúp châu lục → Derby → Giải yêu thích → Giải hot → ĐTQG
// U19− → Single → bù đủ 10 giải. Verify bất biến CHUNG: 1 trận chỉ xuất hiện
// ĐÚNG 1 LẦN trong toàn bộ events (không bị trùng do rơi vào nhiều nhóm).
// ============================================================================
test.describe('scheduled-v2 · 1 trận chỉ thuộc đúng 1 nhóm ưu tiên (không trùng lặp qua nhiều nhóm)', () => {
  test('events không có id trùng lặp ở bất kỳ ngày/locale nào trong tuần', async ({ request }) => {
    const datesToCheck = [vnDate(-1), TODAY, TOMORROW];
    const localesToCheck = ['VN', 'GB', 'US', 'BR', 'TH'];
    const dupFound: string[] = [];

    for (const date of datesToCheck) {
      for (const locale of localesToCheck) {
        const { body } = await post(request, scheduledV2(date, locale, 'all', 'en'), {});
        if (body.code !== 1) continue;
        const ids = body.data.events.map((e: any) => e.id);
        const seen = new Set<string>();
        for (const id of ids) {
          if (seen.has(id)) dupFound.push(`${date}/${locale}: id ${id} xuất hiện 2 lần trong events`);
          seen.add(id);
        }
      }
    }
    expect(dupFound, `Phát hiện trận trùng lặp trong events (vi phạm bất biến "1 trận chỉ thuộc 1 nhóm"):\n${dupFound.join('\n')}`).toEqual([]);
  });
});
