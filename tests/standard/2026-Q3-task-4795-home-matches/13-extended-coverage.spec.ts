/**
 * US-4795 — lấp các lỗ hổng coverage được rà soát lại toàn diện so với 5 doc
 * gốc US-4640 (xem docs/US-4640-home-matches/*.md): các field/param được doc
 * mô tả chi tiết nhưng chưa file nào (01-12) verify bằng data thật. Mỗi case
 * dưới đây đã được xác minh thủ công trước khi viết (curl tay) để đảm bảo
 * không viết case sai giả định về schema/hành vi — xem comment riêng từng
 * nhóm để biết bằng chứng thực tế đã quan sát.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/13-extended-coverage.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2, myMatches, SAMPLE_FAVORITES } from './lib/home-client';

const TODAY = vnDate(0);

// ============================================================================
// 1) competitionsFavorite — đẩy giải yêu thích lên vị trí ngay sau khối gợi ý
//    (doc 1-5-scheduled-v2.md mục 02). Verify thật bằng curl: giải
//    "mfiws1aos0uztg4" (Nation Friendly Match Women) không nằm trong top
//    events mặc định hôm nay (chỉ xuất hiện ở otherCompetitions), nhưng khi
//    gửi competitionsFavorite thì nhảy lên ngay sau khối suggestion=1.
// ============================================================================

test.describe('competitionsFavorite · đẩy giải yêu thích lên ngay sau khối gợi ý', () => {
  test('giải chưa nằm trong top mặc định, khi đánh dấu yêu thích phải xuất hiện sớm hơn (ngay sau suggestion=1)', async ({ request }) => {
    const def = (await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'))).body;
    test.skip(def.code !== 1, 'API không trả code 1');

    // Tìm 1 giải nằm trong otherCompetitions (chưa vào top) để làm ứng viên —
    // nếu nó đã ở top sẵn thì không thể verify "được đẩy lên" (xem comment trên).
    const topIds = new Set(def.data.events.map((e: any) => e.tournament.id));
    const candidate = def.data.otherCompetitions
      .flatMap((g: any) => g.competition_ids)
      .find((id: string) => !topIds.has(id));
    test.skip(!candidate, 'Không tìm được giải nào trong otherCompetitions để làm ứng viên competitionsFavorite hôm nay');

    const fav = (await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'), { competitionsFavorite: [candidate] })).body;
    expect(fav.code).toBe(1);

    const favFirstIdx = fav.data.events.findIndex((e: any) => e.tournament.id === candidate);
    expect(favFirstIdx, `Giải yêu thích "${candidate}" không xuất hiện trong events sau khi đánh dấu`).toBeGreaterThanOrEqual(0);

    // Quan sát thật: field tournament.suggestion=1 CHỈ gắn cho ĐÚNG 1 phần tử
    // đầu tiên của toàn bộ response (không lặp lại cho mọi event cùng giải
    // trong khối gợi ý) — không thể dùng "mọi event trước đó có suggestion=1"
    // làm điều kiện. Thay vào đó verify bằng SỐ GIẢI KHÁC NHAU đứng trước giải
    // yêu thích: nếu được đẩy lên đúng vị trí ngay sau khối gợi ý, số giải
    // khác đứng trước phải rất ít (tối đa 1 — chính là giải ở khối gợi ý gốc),
    // thay vì đứng sau nhiều giải khác như thứ tự mặc định.
    const distinctTournamentsBefore = new Set(fav.data.events.slice(0, favFirstIdx).map((e: any) => e.tournament.id));
    expect(distinctTournamentsBefore.size, `Có ${distinctTournamentsBefore.size} giải khác đứng trước giải yêu thích "${candidate}" — lẽ ra phải được đẩy lên ngay sau khối gợi ý (tối đa 1 giải đứng trước)`).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// 2) sortOtherMatches — 3 giá trị alphabetical/tournament_ranking/country
//    (doc mục 02). Verify thủ công: với data hôm nay (chỉ 2 giải/nhóm) cả 3
//    giá trị trả y hệt nhau — không đủ data để phân biệt rule sắp xếp khi
//    nhóm chỉ có 1-2 phần tử. Viết dạng tự-dò: chỉ assert khi tìm được 1 nhóm
//    đủ ≥3 giải để phép sắp xếp có ý nghĩa phân biệt được.
// ============================================================================

test.describe('sortOtherMatches · 3 chế độ sắp xếp các giải trong otherCompetitions', () => {
  test('server chấp nhận cả 3 giá trị hợp lệ, không lỗi, cấu trúc otherCompetitions không đổi', async ({ request }) => {
    const results = await Promise.all(
      ['alphabetical', 'tournament_ranking', 'country'].map((sort) => post(request, scheduledV2(TODAY, 'VN', 'all', 'en'), { sortOtherMatches: sort }))
    );
    for (const [i, { body, status }] of results.entries()) {
      expect(status, `sortOtherMatches=${['alphabetical', 'tournament_ranking', 'country'][i]}`).toBe(200);
      expect(body.code).toBe(1);
      expect(Array.isArray(body.data.otherCompetitions)).toBe(true);
    }
  });

  test('khi có ≥3 giải trong cùng 1 nhóm: alphabetical phải sắp đúng A→Z theo tên', async ({ request }) => {
    const { body } = await post(request, scheduledV2(TODAY, 'VN', 'all', 'en'), { sortOtherMatches: 'alphabetical' });
    test.skip(body.code !== 1, 'API không trả code 1');

    // otherCompetitions là nhóm (category/country), không phải danh sách giải
    // phẳng — cần map ngược competition_ids → tên giải qua chính events để biết
    // thứ tự thật, vì group không tự chứa tên từng giải con. Nếu không map
    // được (giải không nằm trong events hôm nay) thì bỏ qua, không đoán mò.
    const nameById = new Map<string, string>();
    for (const e of body.data.events) nameById.set(e.tournament.id, e.tournament.name);

    const richGroup = body.data.otherCompetitions.find((g: any) => g.competition_ids.length >= 3 && g.competition_ids.every((id: string) => nameById.has(id)));
    test.skip(!richGroup, 'Không có nhóm nào đủ ≥3 giải mà tên đều map được qua events hôm nay — không đủ data để verify thứ tự alphabetical');

    const names = richGroup.competition_ids.map((id: string) => nameById.get(id));
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

// ============================================================================
// 3) my-matches: offsetTimezone cho locale có allowedOffsets (US/BR/AU/...)
//    (doc 5-5-my-matches.md mục 02, 04, 12 câu hỏi mở #1). Verify thủ công:
//    offsetTimezone PHẢI là STRING (số phút kiểu getTimezoneOffset, vd "-420"
//    cho UTC+7) — gửi number bị 422 "offsetTimezone must be a string". US
//    chấp nhận offset hợp lệ (300/480/...) không lỗi — xác nhận có
//    allowedOffsets, khác VN/GB (bị bỏ qua hoàn toàn, đã test ở 05-my-matches).
// ============================================================================

test.describe('my-matches · offsetTimezone cho locale có allowedOffsets', () => {
  test('offsetTimezone phải là string — gửi number bị HTTP 422', async ({ request }) => {
    const { status, body } = await post(request, myMatches('all', 'US'), { ...SAMPLE_FAVORITES, startDate: TODAY, offsetTimezone: -300 as any });
    expect(status).toBe(422);
    expect(body.errors).toHaveProperty('offsetTimezone');
  });

  test('locale US (có allowedOffsets): offsetTimezone dạng string hợp lệ không bị từ chối', async ({ request }) => {
    const { status, body } = await post(request, myMatches('all', 'US'), { ...SAMPLE_FAVORITES, startDate: TODAY, offsetTimezone: '-300' });
    expect(status).toBe(200);
    expect(body.code).toBe(1);
  });

  test('khi có trận yêu thích đá gần ranh giới UTC (±1h quanh nửa đêm): offsetTimezone US dịch đúng ngày phân loại', async ({ request }) => {
    // Quét 7 ngày tìm trận của SAMPLE_FAVORITES đá trong khung 22:00-02:00 UTC
    // — đây là lúc offset UTC-5 (Eastern US, "300") có thể đẩy trận sang NGÀY
    // KHÁC so với UTC thuần, đủ để phân biệt offset có thật sự áp dụng hay bị
    // bỏ qua ngầm (giống bug đã biết với GB — BUG #4 ở 05-my-matches.spec.ts).
    let boundaryMatch: { date: string; e: any } | null = null;
    for (const offset of [-3, -2, -1, 0, 1, 2, 3]) {
      const date = vnDate(offset);
      const { body } = await post(request, myMatches('all', 'US'), { ...SAMPLE_FAVORITES, startDate: date, offsetTimezone: '300' });
      if (body.code !== 1) continue;
      const found = body.data.events.find((e: any) => {
        const h = new Date(e.startTimestamp * 1000).getUTCHours();
        return h >= 22 || h <= 2;
      });
      if (found) { boundaryMatch = { date, e: found }; break; }
    }
    test.skip(!boundaryMatch, 'Không tìm được trận yêu thích nào đá quanh ranh giới UTC trong ±3 ngày tại lần chạy này — sẽ tự bắt khi có');

    // Giờ Eastern US (UTC-5, offset="300" theo getTimezoneOffset) của trận này
    // phải khớp với ngày mà offsetTimezone chỉ định — nếu bị bỏ qua, ngày phân
    // loại sẽ rơi về UTC thuần thay vì Eastern.
    const easternDate = new Date(boundaryMatch!.e.startTimestamp * 1000 - 5 * 3600_000).toISOString().slice(0, 10);
    expect(easternDate, `Trận ${boundaryMatch!.e.id} đá UTC giờ ${new Date(boundaryMatch!.e.startTimestamp * 1000).getUTCHours()}h — offsetTimezone=300 (Eastern US) phải xếp vào ngày ${easternDate}, đang test với startDate=${boundaryMatch!.date}`).toBe(boundaryMatch!.date);
  });
});

// ============================================================================
// 4) my-matches: giới hạn 50 teamsFavorite/matchesFavorite — chỉ lấy 50 PHẦN
//    TỬ CUỐI mảng (doc mục 11). Verify thủ công: Arsenal (có trận thật hôm
//    nay, thắng Lille 3-0) đặt Ở ĐẦU mảng 56 phần tử → bị cắt mất, trả []. Đặt
//    Ở CUỐI mảng → vẫn thấy trận đầy đủ. Xác nhận chắc chắn rule "50 cuối".
// ============================================================================

test.describe('my-matches · giới hạn 50 teamsFavorite (chỉ giữ 50 phần tử CUỐI mảng)', () => {
  const ARSENAL_ID = 'c467w80old4rt8p';
  const fakeIds = (n: number) => Array.from({ length: n }, (_, i) => 'fake' + i.toString().padStart(10, '0'));

  test('đội ở ĐẦU mảng 56 phần tử (vượt quá 50) bị cắt mất — trận của đội đó biến mất', async ({ request }) => {
    // Trước tiên xác nhận Arsenal CÓ trận hôm nay khi không bị giới hạn gì —
    // nếu không còn trận thật (lịch thay đổi theo thời gian chạy), skip thay
    // vì hard-fail sai lý do.
    const baseline = await post(request, myMatches('all', 'VN'), { teamsFavorite: [ARSENAL_ID], startDate: TODAY });
    test.skip(baseline.body.code !== 1 || baseline.body.data.events.length === 0, 'Arsenal không có trận hôm nay tại lần chạy này — chọn lại mốc ngày khác khi cần');

    const { body } = await post(request, myMatches('all', 'VN'), { teamsFavorite: [ARSENAL_ID, ...fakeIds(55)], startDate: TODAY });
    expect(body.code).toBe(1);
    expect(body.data.events, 'Arsenal ở đầu mảng 56 phần tử lẽ ra phải bị cắt khỏi 50 phần tử cuối được server dùng').toEqual([]);
  });

  test('đội ở CUỐI mảng 56 phần tử (trong 50 phần tử cuối) vẫn còn trận bình thường', async ({ request }) => {
    const baseline = await post(request, myMatches('all', 'VN'), { teamsFavorite: [ARSENAL_ID], startDate: TODAY });
    test.skip(baseline.body.code !== 1 || baseline.body.data.events.length === 0, 'Arsenal không có trận hôm nay tại lần chạy này');

    const { body } = await post(request, myMatches('all', 'VN'), { teamsFavorite: [...fakeIds(55), ARSENAL_ID], startDate: TODAY });
    expect(body.code).toBe(1);
    expect(body.data.events.map((e: any) => e.id)).toEqual(baseline.body.data.events.map((e: any) => e.id));
  });
});

// ============================================================================
// 5) my-matches: response rỗng case 2 — CÓ favorite nhưng KHÔNG có trận nào
//    → size PHẢI LÀ 5000 (khác hẳn case không gửi favorite nào → size 50, đã
//    test ở 05-my-matches.spec.ts dòng 43). Đây là 2 case rỗng dễ nhầm lẫn
//    nếu chỉ test 1 trong 2 — doc mục 02 ghi rõ đây là "2 case đặc biệt".
// ============================================================================

test.describe('my-matches · 2 dạng response rỗng khác nhau (size 50 vs size 5000)', () => {
  test('CÓ favorite nhưng ngày đó không có trận nào → pagination.size = 5000 (không phải 50)', async ({ request }) => {
    // Dùng team id GIẢ (không khớp đội thật nào) thay vì chọn "ngày xa quá khứ"
    // — verify thủ công cho thấy 2015-01-01 vẫn có data lịch sử thật (Liverpool
    // vs Leicester), nên không đáng tin để coi là "chắc chắn rỗng". Id giả định
    // đảm bảo chắc chắn 0 trận khớp mà không phụ thuộc may rủi lịch sử.
    const { body } = await post(request, myMatches('all', 'VN'), { teamsFavorite: ['fake0000000001'], matchesFavorite: [], startDate: TODAY });
    expect(body.code).toBe(1);
    expect(body.data.events).toEqual([]);
    expect(body.data.pagination.size, 'Có favorite (dù không khớp trận nào) phải trả size=5000, khác case không gửi favorite nào (size=50)').toBe(5000);
  });
});

// ============================================================================
// 6) my-matches: type=live không có trận live → KHÔNG trả code=2 (khác hẳn
//    live-v2, nơi code=2 là "EMPTY_DATA" hợp lệ) — doc mục 02 ghi rõ điểm
//    khác biệt riêng cho my-matches. Dùng team id GIẢ để chắc chắn 0 trận live
//    khớp, không phụ thuộc may rủi lịch thi đấu thật của SAMPLE_FAVORITES.
// ============================================================================

test.describe('my-matches · type=live rỗng vẫn trả code=1 (không giống live-v2 trả code=2)', () => {
  test('không có trận yêu thích nào đang live → code vẫn = 1, events = [] (không phải code 2)', async ({ request }) => {
    const { body } = await post(request, myMatches('live', 'VN'), { teamsFavorite: ['fake0000000002'], matchesFavorite: [], startDate: TODAY });
    expect(body.code, 'my-matches type=live rỗng phải trả code=1, không phải code=2 như live-v2').toBe(1);
    expect(body.data.events).toEqual([]);
  });
});

// ============================================================================
// 7) my-matches: startDate bắt buộc ngay cả với type=live (dù giá trị không
//    thực sự được dùng để lọc) — doc mục 12 câu hỏi mở #7. 05-my-matches chỉ
//    test thiếu startDate với type=all, chưa test riêng type=live.
// ============================================================================

test.describe('my-matches · startDate vẫn bắt buộc dù type=live không dùng để lọc', () => {
  test('thiếu startDate với type=live → vẫn bị HTTP 422 (không phải miễn trừ validate)', async ({ request }) => {
    const { status, body } = await post(request, myMatches('live', 'VN'), SAMPLE_FAVORITES);
    expect(status).toBe(422);
    expect(body.errors).toHaveProperty('startDate');
  });
});

// ============================================================================
// 8) my-matches: category.name KHÔNG được dịch dù gọi language=vi (doc mục
//    09) — field giữ nguyên tiếng Anh gốc ("Vietnam" thay vì "Việt Nam").
// ============================================================================

test.describe('my-matches · tournament.category.name không dịch dù language=vi', () => {
  test('gọi language=vi: category.name vẫn giữ tiếng Anh gốc (không lẫn ký tự có dấu tiếng Việt)', async ({ request }) => {
    const { body } = await post(request, myMatches('all', 'VN'), { ...SAMPLE_FAVORITES, startDate: vnDate(-3) });
    const days = [vnDate(-7), vnDate(-6), vnDate(-5), vnDate(-4), vnDate(-3), vnDate(-2), vnDate(-1)];
    let sample: any = null;
    for (const d of days) {
      const { body: b } = await post(request, myMatches('all', 'VN'), { ...SAMPLE_FAVORITES, startDate: d });
      if (b.code === 1 && b.data.events.length > 0) { sample = b.data.events[0]; break; }
    }
    test.skip(!sample, 'Không có trận yêu thích nào trong 7 ngày qua để kiểm tra category.name');
    const name = sample.tournament?.category?.name ?? '';
    // Ký tự có dấu tiếng Việt phổ biến — nếu category.name chứa bất kỳ ký tự
    // nào trong số này, nghĩa là field ĐÃ bị dịch (ngược với hành vi ghi nhận
    // trong doc), đáng được biết để cập nhật lại test này.
    const hasVietnameseDiacritics = /[ĐđÀÁẢÃẠăâêôơưÈÉẺẼẸÌÍỈĨỊÒÓỎÕỌÙÚỦŨỤỲÝỶỸỴ]/i.test(name);
    expect(hasVietnameseDiacritics, `category.name="${name}" có vẻ đã được dịch sang tiếng Việt — khác với hành vi "không dịch" ghi nhận trong doc, cần xem lại`).toBe(false);
  });
});
