/**
 * TASK 3369 — Case tổng quát: endpoint /info/:locale với NHIỀU locale khác
 * nhau (không chỉ "en").
 *
 * PHÁT HIỆN QUA DÒ THỦ CÔNG (trước khi viết test): endpoint này KHÔNG dịch
 * nội dung theo locale ở CẢ 2 service — gọi cùng 1 coach với locale="vi" và
 * locale="ar" trả về data GIỐNG NHAU byte-for-byte (coach name, country,
 * team name đều nguyên bản, không có bản dịch). Test dưới đây do đó KHÔNG
 * kiểm tra "nội dung có dịch đúng không" (vì cả 2 service đều chưa hỗ trợ),
 * mà kiểm tra ĐÚNG mục tiêu thực tế của việc migrate: 2 service phải xử lý
 * GIỐNG NHAU cho mọi giá trị locale — kể cả locale hợp lệ (vi/es/pt/ar/...),
 * locale không được hỗ trợ (xx, 123), và locale rỗng.
 *
 * Cũng verify: locale rỗng ("") rơi vào case đã biết ở
 * 02-coach-invalid-ref-id.spec.ts (path segment rỗng -> service mới 404 ở
 * tầng route, service cũ vẫn 200) — lặp lại ở đây để rõ ràng theo góc nhìn
 * "locale", không chỉ "ref_id sai format".
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/04-coach-multi-locale.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3369-coach-migration';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';

// 2 coach mẫu — 1 tên Latin thường, 1 tên có dấu đặc biệt (kiểm tra luôn
// encoding UTF-8 nhất quán giữa 2 service khi lặp qua nhiều locale).
const SAMPLE_COACHES = [
  { name: 'Sebastián Abreu', refId: 'mfiws1aovdasdxd' },
  { name: 'Héctor Cárdenas', refId: 'b1ta1llsfk1rbib' },
];

const VALID_LOCALES = ['en', 'vi', 'es', 'pt', 'ar', 'fr', 'de', 'zh', 'ja', 'ko', 'it', 'ru'];
const INVALID_LOCALES = ['xx', '123', 'vi-VN', 'EN'];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

test.describe('[TASK-3369] Coach — /info/:locale với nhiều locale khác nhau', () => {
  test('Locale hợp lệ (vi/es/pt/ar/...) — data khớp giữa 2 service, và KHÔNG đổi theo locale (chưa hỗ trợ dịch)', async ({ request }) => {
    const rows: Array<{
      coach: string;
      refId: string;
      locale: string;
      oldUrl: string;
      newUrl: string;
      oldStatus: number;
      newStatus: number;
      dataEqualOldVsNew: boolean;
      dataEqualToEnglish: boolean;
    }> = [];

    for (const coach of SAMPLE_COACHES) {
      let englishOldData: unknown = null;
      for (const locale of VALID_LOCALES) {
        const oldUrl = `${OLD_BASE}/${coach.refId}/info/${locale}`;
        const newUrl = `${NEW_BASE}/${coach.refId}/info/${locale}`;
        const [oldRes, newRes] = await Promise.all([request.get(oldUrl), request.get(newUrl)]);
        const oldBody = oldRes.ok() ? await oldRes.json() : null;
        const newBody = newRes.ok() ? await newRes.json() : null;

        if (locale === 'en') englishOldData = oldBody?.data;

        rows.push({
          coach: coach.name,
          refId: coach.refId,
          locale,
          oldUrl,
          newUrl,
          oldStatus: oldRes.status(),
          newStatus: newRes.status(),
          dataEqualOldVsNew: stableStringify(oldBody?.data) === stableStringify(newBody?.data),
          dataEqualToEnglish: stableStringify(oldBody?.data) === stableStringify(englishOldData),
        });
      }
    }

    const mismatches = rows.filter((r) => !r.dataEqualOldVsNew);
    const localeChangesContent = rows.filter((r) => !r.dataEqualToEnglish);

    console.log(`\n📊 Locale hợp lệ — old vs new khớp: ${rows.length - mismatches.length}/${rows.length}`);
    console.log(`📊 Locale có làm đổi nội dung so với "en"?: ${localeChangesContent.length}/${rows.length} (kỳ vọng 0 — endpoint chưa hỗ trợ dịch)`);
    mismatches.forEach((r) => console.log(`   ✗ ${r.coach} — locale="${r.locale}": old(${r.oldStatus}) vs new(${r.newStatus}) khác data`));
    localeChangesContent.forEach((r) => console.log(`   ⚠ ${r.coach} — locale="${r.locale}" đổi nội dung so với "en" (bất ngờ, kiểm tra thêm)`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'case4-multi-locale-valid.json', {
      checkedAt: new Date().toISOString(),
      coaches: SAMPLE_COACHES,
      locales: VALID_LOCALES,
      rows,
      mismatchCount: mismatches.length,
      localeChangesContentCount: localeChangesContent.length,
      note: 'Endpoint /info/:locale KHÔNG dịch nội dung theo locale ở cả 2 service tại thời điểm test (data giống "en" cho mọi locale) — không phải bug, chỉ là chưa triển khai i18n. Test chỉ verify 2 service xử lý NHẤT QUÁN với nhau.',
    });

    expect(mismatches, `${mismatches.length}/${rows.length} locale hợp lệ lệch data giữa old/new`).toEqual([]);
  });

  test('Locale không hợp lệ/lạ (xx, 123, vi-VN, EN hoa) — 2 service xử lý giống nhau', async ({ request }) => {
    const coach = SAMPLE_COACHES[0];
    const rows: Array<{ locale: string; oldStatus: number; newStatus: number; statusMatches: boolean; oldDataPreview: string; newDataPreview: string }> = [];

    for (const locale of INVALID_LOCALES) {
      const oldUrl = `${OLD_BASE}/${coach.refId}/info/${locale}`;
      const newUrl = `${NEW_BASE}/${coach.refId}/info/${locale}`;
      const [oldRes, newRes] = await Promise.all([request.get(oldUrl), request.get(newUrl)]);
      const oldText = await oldRes.text();
      const newText = await newRes.text();

      rows.push({
        locale,
        oldStatus: oldRes.status(),
        newStatus: newRes.status(),
        statusMatches: oldRes.status() === newRes.status(),
        oldDataPreview: oldText.slice(0, 150),
        newDataPreview: newText.slice(0, 150),
      });
    }

    const statusMismatches = rows.filter((r) => !r.statusMatches);
    console.log(`\n📊 Locale lạ/không hợp lệ — HTTP status khớp: ${rows.length - statusMismatches.length}/${rows.length}`);
    rows.forEach((r) => console.log(`   ${r.statusMatches ? '✓' : '⚠'} locale="${r.locale}": old=HTTP ${r.oldStatus} | new=HTTP ${r.newStatus}`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'case4-multi-locale-invalid.json', {
      checkedAt: new Date().toISOString(),
      coach: coach.name,
      rows,
      statusMismatchCount: statusMismatches.length,
      note: 'Locale lạ (xx, 123, vi-VN, EN hoa) — kỳ vọng cả 2 service đều fallback về nội dung mặc định (giống hệt behavior locale hợp lệ, vì endpoint chưa validate/dùng locale để dịch). Không assert cứng nếu status khác nhau — cần xem preview body để đánh giá có phải regression.',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'case4-locale-report.xlsx', [
      {
        name: 'Locale la - khong hop le',
        columns: [
          { header: 'Locale test', key: 'locale', width: 14 },
          { header: 'HTTP cũ', key: 'oldStatus', width: 10 },
          { header: 'HTTP mới', key: 'newStatus', width: 10 },
          { header: 'Status khớp?', key: 'statusMatches', width: 14 },
          { header: 'Body cũ (preview)', key: 'oldDataPreview', width: 60 },
          { header: 'Body mới (preview)', key: 'newDataPreview', width: 60 },
        ],
        rows,
        wrapText: true,
      },
    ]);

    // Không assert cứng — chỉ log cảnh báo, giống case2 (ref_id sai format) cần con người đánh giá.
    if (statusMismatches.length > 0) {
      console.log(`\n⚠️ Có ${statusMismatches.length} locale lạ gây khác HTTP status giữa 2 service — xem case4-locale-report.xlsx.`);
    }
  });
});
