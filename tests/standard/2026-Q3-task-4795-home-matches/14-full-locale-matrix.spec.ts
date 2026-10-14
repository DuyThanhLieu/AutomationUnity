/**
 * US-4795 — mở rộng toàn diện độ phủ LOCALE cho cả 5 endpoint, tập trung vào
 * lỗ hổng cụ thể: file 01 đã có 14 locale nhưng chỉ cho scheduled-v2; các file
 * còn lại (02/03/04/05/13) dùng ít locale hơn hẳn hoặc chỉ test đúng 1 locale
 * (US) cho offsetTimezone dù doc liệt kê đủ 11 locale có allowedOffsets.
 *
 * Doc 5-5-my-matches.md mục 131 xác nhận: hệ thống hỗ trợ "54 locale" (bảng
 * timezone_by_locale), trong đó CHỈ 11 locale có allowedOffsets: US, CA, MX,
 * BR, CL, AU, NZ, ES, PT, ID, RU. Đây là nhóm có RỦI RO BUG RIÊNG (giống BUG
 * #4 đã biết với GB) — nếu offsetTimezone bị áp dụng sai hoặc bị bỏ qua ở bất
 * kỳ locale nào trong 11 locale này, user ở đó sẽ thấy trận "lệch ngày" y hệt
 * bug GB, nhưng chưa từng được verify ngoài US.
 *
 * GHI CHÚ VỀ DB: đã kiểm tra lại DB api_ts (103.109.101.226) trước khi viết
 * file này — dữ liệu mới nhất vẫn dừng ở 2026-01-26 (~9 tháng không cập nhật,
 * không đổi so với lần kiểm tra trước), và enum status_id trong DB (0,1,14,
 * 15,16,17,19,23,99,100,105) KHÔNG khớp với enum status.code thật của API
 * production hiện tại (0,1,7,14,15,60,70,80,90,100,110,120) — xác nhận đây là
 * dữ liệu từ 1 hệ schema cũ khác, không thể dùng để đối chiếu bất kỳ điều gì
 * với hệ thống hiện tại mà không tạo ra kết luận sai. Không có bảng nào khác
 * trong DB này đáng tin cậy hơn. Quyết định: KHÔNG viết test DB — một test DB
 * dựa trên dữ liệu/enum sai sẽ nguy hiểm hơn là không có test, vì nó tạo cảm
 * giác an toàn giả. Toàn bộ nỗ lực dồn vào API + UI thật (product), nơi có
 * thể verify đáng tin cậy.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/14-full-locale-matrix.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2, scheduledV1, liveV1, liveV2, myMatches, SAMPLE_FAVORITES } from './lib/home-client';

const TODAY = vnDate(0);

/** 11 locale có allowedOffsets theo doc (mục 131) — mỗi locale kèm 1 giá trị
 *  offset hợp lệ (quy ước getTimezoneOffset: dương = phía Tây Greenwich),
 *  đã verify thủ công từng giá trị không bị 422 trước khi đưa vào đây. */
const OFFSET_LOCALES: Array<{ locale: string; offset: string; tzHoursFromUtc: number }> = [
  { locale: 'US', offset: '300', tzHoursFromUtc: -5 }, // Eastern
  { locale: 'CA', offset: '300', tzHoursFromUtc: -5 }, // Eastern
  { locale: 'MX', offset: '360', tzHoursFromUtc: -6 },
  { locale: 'BR', offset: '180', tzHoursFromUtc: -3 },
  { locale: 'CL', offset: '180', tzHoursFromUtc: -3 },
  { locale: 'AU', offset: '-600', tzHoursFromUtc: 10 },
  { locale: 'NZ', offset: '-720', tzHoursFromUtc: 12 },
  { locale: 'ES', offset: '-60', tzHoursFromUtc: 1 },
  { locale: 'PT', offset: '0', tzHoursFromUtc: 0 },
  { locale: 'ID', offset: '-420', tzHoursFromUtc: 7 },
  { locale: 'RU', offset: '-180', tzHoursFromUtc: 3 },
];

/** Locale phổ biến KHÔNG nằm trong allowedOffsets — offsetTimezone phải bị bỏ
 *  qua hoàn toàn, giống VN/GB đã biết. */
const NON_OFFSET_LOCALES = ['FR', 'IT', 'NL', 'BE', 'CH', 'SE', 'NO', 'DK', 'PL', 'TR'];

test.describe('offsetTimezone · đầy đủ 11 locale có allowedOffsets (không chỉ US)', () => {
  for (const { locale, offset } of OFFSET_LOCALES) {
    test(`locale ${locale}: offsetTimezone="${offset}" hợp lệ không bị từ chối`, async ({ request }) => {
      const { status, body } = await post(request, myMatches('all', locale), { ...SAMPLE_FAVORITES, startDate: TODAY, offsetTimezone: offset });
      expect(status, `locale ${locale}`).toBe(200);
      expect(body.code).toBe(1);
    });
  }

  test('khi có trận yêu thích đá quanh nửa đêm UTC: offsetTimezone của TỪNG locale trong 11 locale dịch đúng ngày phân loại', async ({ request }) => {
    // QUAN TRỌNG: phải dò trận biên giới UTC bằng chính myMatches(SAMPLE_FAVORITES)
    // (không phải scheduledV2 toàn cục) — nguồn "sự thật" để so sánh phải cùng
    // 1 tập trận với nguồn đang verify, nếu không mọi trận ngẫu nhiên của
    // scheduledV2 (không thuộc đội yêu thích) sẽ luôn "không thấy" trong
    // myMatches, gây fail hàng loạt do sai nguồn dữ liệu chứ không phải bug
    // offset thật (đã tự mắc lỗi này ở lần viết đầu, sửa lại cho đúng).
    const dates = [vnDate(-3), vnDate(-2), vnDate(-1), TODAY, vnDate(1), vnDate(2), vnDate(3)];
    const boundaryByDate = new Map<string, any[]>();
    for (const date of dates) {
      // Gọi myMatches locale=VN (không offset) làm nguồn sự thật trung lập —
      // VN không có allowedOffsets nên luôn tính theo UTC+7 cố định, không bị
      // ảnh hưởng bởi offsetTimezone, phù hợp làm mốc đối chiếu độc lập.
      const { body } = await post(request, myMatches('all', 'VN'), { ...SAMPLE_FAVORITES, startDate: date });
      if (body.code !== 1) continue;
      const boundary = body.data.events.filter((e: any) => {
        const h = new Date(e.startTimestamp * 1000).getUTCHours();
        return h >= 22 || h <= 2;
      });
      if (boundary.length) boundaryByDate.set(date, boundary);
    }
    test.skip(boundaryByDate.size === 0, 'Không có trận yêu thích nào đá quanh nửa đêm UTC trong ±3 ngày tại lần chạy này — sẽ tự bắt khi có');

    const mismatches: string[] = [];
    let verifiedCount = 0;
    for (const { locale, offset, tzHoursFromUtc } of OFFSET_LOCALES) {
      for (const [date, boundary] of boundaryByDate) {
        const { body } = await post(request, myMatches('all', locale), { ...SAMPLE_FAVORITES, startDate: date, offsetTimezone: offset });
        if (body.code !== 1) continue;
        for (const e of boundary) {
          const expectedDate = new Date(e.startTimestamp * 1000 + tzHoursFromUtc * 3600_000).toISOString().slice(0, 10);
          if (expectedDate !== date) continue; // trận này không thuộc đúng ngày local của locale này — không phải test case phù hợp
          verifiedCount++;
          const foundInLocale = body.data.events.some((ev: any) => ev.id === e.id);
          if (!foundInLocale) {
            mismatches.push(`locale ${locale} (offset=${offset}): trận ${e.id} (UTC+${tzHoursFromUtc}h → ngày ${expectedDate}) không xuất hiện khi gọi startDate=${date}`);
          }
        }
      }
    }
    test.skip(verifiedCount === 0, 'Không có trận nào trùng khớp ranh giới ngày cho bất kỳ locale nào trong 11 locale — cần mẫu khác');
    expect(mismatches).toEqual([]);
  });
});

test.describe('offsetTimezone · locale KHÔNG có allowedOffsets phải bị bỏ qua hoàn toàn', () => {
  for (const locale of NON_OFFSET_LOCALES) {
    test(`locale ${locale}: gửi offsetTimezone hợp lệ nhưng vẫn bị bỏ qua (kết quả giống không gửi gì)`, async ({ request }) => {
      const [withOffset, without] = await Promise.all([
        post(request, myMatches('all', locale), { ...SAMPLE_FAVORITES, startDate: TODAY, offsetTimezone: '-300' }),
        post(request, myMatches('all', locale), { ...SAMPLE_FAVORITES, startDate: TODAY }),
      ]);
      test.skip(without.body.code !== 1, `API không trả code 1 cho locale ${locale}`);
      expect(withOffset.body.data.events.map((e: any) => e.id)).toEqual(without.body.data.events.map((e: any) => e.id));
    });
  }
});

// ============================================================================
// Mở rộng locale cho scheduled-v1, live-v1, live-v2 — hiện các file gốc
// (02/03/04) chỉ test 4-10 locale, ít hơn hẳn file 01 (14 locale). Đồng bộ
// cùng mức độ phủ để bug locale-specific không bị bỏ sót chỉ vì nằm ở route
// khác route đã test kỹ.
// ============================================================================

const WIDER_LOCALES = ['VN', 'GB', 'US', 'JP', 'BR', 'TH', 'DE', 'KR', 'ID', 'MX', 'EG', 'AU', 'IN', 'AR', 'FR', 'IT', 'ES', 'CA', 'NL', 'TR'];

test.describe('scheduled-v1 · mở rộng locale (đồng bộ mức phủ với scheduled-v2)', () => {
  for (const locale of WIDER_LOCALES) {
    test(`locale ${locale}: response hợp lệ, V1 events trùng tập với V2`, async ({ request }) => {
      const [v1, v2] = await Promise.all([post(request, scheduledV1(TODAY, locale)), post(request, scheduledV2(TODAY, locale))]);
      test.skip(v1.body.code !== 1 || v2.body.code !== 1, `locale ${locale}: API không trả code 1`);
      const ids1 = new Set(v1.body.data.events.map((e: any) => e.id));
      const ids2 = new Set(v2.body.data.events.map((e: any) => e.id));
      const onlyInV1 = [...ids1].filter((id) => !ids2.has(id));
      const onlyInV2 = [...ids2].filter((id) => !ids1.has(id));
      expect(onlyInV1, `locale ${locale}: trận chỉ có ở V1`).toEqual([]);
      expect(onlyInV2, `locale ${locale}: trận chỉ có ở V2`).toEqual([]);
    });
  }
});

test.describe('live-v1 · mở rộng locale', () => {
  for (const locale of WIDER_LOCALES) {
    test(`locale ${locale}: response hợp lệ (code 1 hoặc 2), tối đa 10 giải`, async ({ request }) => {
      const { status, body } = await post(request, liveV1(locale));
      expect(status, `locale ${locale}`).toBe(200);
      expect([1, 2]).toContain(body.code);
      if (body.code === 1) {
        const comps = new Set(body.data.events.map((e: any) => e.tournament.id));
        expect(comps.size, `locale ${locale}`).toBeLessThanOrEqual(10);
      }
    });
  }
});

test.describe('live-v2 · mở rộng locale', () => {
  for (const locale of WIDER_LOCALES) {
    test(`locale ${locale}: response hợp lệ, mọi trận inprogress`, async ({ request }) => {
      const { status, body } = await post(request, liveV2(locale));
      expect(status, `locale ${locale}`).toBe(200);
      expect([1, 2]).toContain(body.code);
      if (body.code === 1) {
        const bad = body.data.events.filter((e: any) => e.status.type !== 'inprogress');
        expect(bad.map((e: any) => `${e.id}:${e.status.type}`), `locale ${locale}`).toEqual([]);
      }
    });
  }
});

// ============================================================================
// Sanity check cực rộng: toàn bộ 5 endpoint không được trả lỗi 5xx với BẤT KỲ
// locale lạ/không tồn tại nào (chống crash do locale không xác định) — khác
// với các test trên vốn cần locale hợp lệ để assert logic nghiệp vụ.
// ============================================================================

test.describe('sanity · không crash 5xx với locale lạ/không chuẩn trên mọi endpoint', () => {
  const WEIRD_LOCALES = ['xx', 'ZZZZ', '123', '', 'vn-VN', 'en_US'];

  for (const locale of WEIRD_LOCALES) {
    test(`locale lạ "${locale}": scheduled-v2 không trả 5xx`, async ({ request }) => {
      const { status } = await post(request, scheduledV2(TODAY, locale));
      expect(status, `locale "${locale}"`).toBeLessThan(500);
    });

    test(`locale lạ "${locale}": my-matches không trả 5xx`, async ({ request }) => {
      const { status } = await post(request, myMatches('all', locale), { ...SAMPLE_FAVORITES, startDate: TODAY });
      expect(status, `locale "${locale}"`).toBeLessThan(500);
    });

    test(`locale lạ "${locale}": live-v2 không trả 5xx`, async ({ request }) => {
      const { status } = await post(request, liveV2(locale));
      expect(status, `locale "${locale}"`).toBeLessThan(500);
    });
  }
});
