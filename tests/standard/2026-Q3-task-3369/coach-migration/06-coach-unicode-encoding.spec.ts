/**
 * TASK 3369 — Case tổng quát: coach có tên chứa ký tự đặc biệt/unicode —
 * kiểm tra encoding UTF-8 nhất quán giữa opta-api (cũ) và staging-player-svc
 * (mới, Go).
 *
 * PHÁT HIỆN QUAN TRỌNG khi tìm mẫu (trước khi viết test): đã quét ~13,000
 * trận (bulk-coach-samples.ts 3691 coach + quét bổ sung theo giải Đông Á/
 * Trung Đông — Nhật, Hàn, Trung Quốc, Ả Rập Saudi, Iran, Qatar, Việt Nam,
 * Myanmar) nhưng KHÔNG tìm được coach nào có tên giữ nguyên script gốc
 * (CJK/Hangul/Ả Rập/Cyrillic). Toàn bộ coach ở các giải này đều trả tên đã
 * ROMANIZE SẴN (vd "Hajime Moriyasu" — HLV Nhật, "Sang-sik Kim" — HLV Hàn
 * Quốc, "Amir Ghalenoei" — HLV Iran) — không phải API cắt/lỗi script, mà
 * NGUỒN DỮ LIỆU (Opta) chỉ lưu tên latinh hoá cho mọi coach, không phân biệt
 * quốc tịch. Vì vậy file này KHÔNG thể test "coach tên CJK/Ả Rập thật" như
 * dự kiến ban đầu — thay vào đó tập trung vào ký tự CÓ THẬT trong dữ liệu:
 * dấu phụ Latin Extended (á, é, í, ó, ú, ñ, ã, ç, ß, Đ, ř, ş...) xuất hiện
 * rất nhiều ở coach Tây Âu/Mỹ Latinh/Đông Âu, và 1 coach tiếng Việt có dấu
 * đầy đủ (Đoàn Thị Kim Chi).
 *
 * Test verify: tên coach (và tên team/quốc gia liên quan) phải giống nhau
 * CHÍNH XÁC byte-for-byte giữa 2 service — không bị mất dấu, không bị thay
 * bằng "?" hoặc mojibake (lỗi encoding kiểu "Ã©" thay vì "é").
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369/coach-migration/06-coach-unicode-encoding.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { saveJsonForSeason, saveExcelForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3369-coach-migration';

const OLD_BASE = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const NEW_BASE = 'https://staging-player-svc.uniscore.vn/api/v2/football/coach';

// Coach có tên chứa dấu phụ Latin Extended (ký tự thực tế xuất hiện trong dữ
// liệu — không có coach CJK/Ả Rập script gốc, xem giải thích đầu file).
const UNICODE_NAME_COACHES = [
  { name: 'Sebastián Abreu', refId: 'mfiws1aovdasdxd', note: 'dấu sắc (á)' },
  { name: 'Héctor Cárdenas', refId: 'b1ta1llsfk1rbib', note: 'dấu sắc kép (é, á)' },
  { name: 'Đoàn Thị Kim Chi', refId: 'o8tzjgl90n9s006', note: 'tiếng Việt có dấu đầy đủ (Đ, ị)' },
  { name: 'Sang-sik Kim', refId: 'jy2us9tor21n7fj', note: 'tên Hàn đã romanize, có dấu gạch ngang' },
  { name: 'Hajime Moriyasu', refId: 's4luxy1o8w2rihp', note: 'tên Nhật đã romanize (không dấu đặc biệt, kiểm tra baseline)' },
  { name: 'Amir Ghalenoei', refId: '2wogs0kov82s1xj', note: 'tên Iran đã romanize' },
];

function hasEncodingCorruption(s: string): boolean {
  // Dấu hiệu mojibake điển hình: chuỗi UTF-8 bị decode 2 lần ra Latin-1 sẽ
  // xuất hiện các cặp ký tự đặc trưng như "Ã©", "Ã¡", "â€™", hoặc ký tự "?"/"�"
  // (replacement character) thay cho dấu phụ.
  return /Ã[\x80-\xBF]|â€™|â€œ|â€|�/.test(s);
}

test.describe('[TASK-3369] Coach — tên chứa ký tự đặc biệt/unicode, kiểm tra encoding nhất quán', () => {
  test('Tên coach (có dấu/ký tự đặc biệt) khớp byte-for-byte giữa 2 service, không bị mojibake', async ({ request }) => {
    const rows: Array<{
      expectedName: string;
      refId: string;
      note: string;
      oldName: string | null;
      newName: string | null;
      nameMatchesExpected: boolean;
      oldVsNewEqual: boolean;
      oldHasCorruption: boolean;
      newHasCorruption: boolean;
    }> = [];

    for (const coach of UNICODE_NAME_COACHES) {
      const oldRes = await request.get(`${OLD_BASE}/${coach.refId}/info?language=en`);
      const newRes = await request.get(`${NEW_BASE}/${coach.refId}/info?language=en`);
      const oldBody = oldRes.ok() ? await oldRes.json() : null;
      const newBody = newRes.ok() ? await newRes.json() : null;
      const oldName = oldBody?.data?.manager?.name ?? null;
      const newName = newBody?.data?.manager?.name ?? null;

      rows.push({
        expectedName: coach.name,
        refId: coach.refId,
        note: coach.note,
        oldName,
        newName,
        nameMatchesExpected: oldName === coach.name && newName === coach.name,
        oldVsNewEqual: oldName === newName,
        oldHasCorruption: oldName !== null && hasEncodingCorruption(oldName),
        newHasCorruption: newName !== null && hasEncodingCorruption(newName),
      });
    }

    const mismatches = rows.filter((r) => !r.oldVsNewEqual || !r.nameMatchesExpected);
    const corrupted = rows.filter((r) => r.oldHasCorruption || r.newHasCorruption);

    console.log(`\n📊 Tên coach unicode — old vs new khớp: ${rows.length - mismatches.length}/${rows.length}`);
    rows.forEach((r) => console.log(`   ${r.oldVsNewEqual && r.nameMatchesExpected ? '✓' : '✗'} "${r.expectedName}" (${r.note}): old="${r.oldName}" new="${r.newName}"`));
    if (corrupted.length) {
      console.log(`\n⚠️ Phát hiện dấu hiệu mojibake ở ${corrupted.length} mẫu:`);
      corrupted.forEach((r) => console.log(`   ✗ ${r.expectedName}: old="${r.oldName}" new="${r.newName}"`));
    }

    saveJsonForSeason(SEASON_DIR, SLUG, 'case6-unicode-encoding-check.json', {
      checkedAt: new Date().toISOString(),
      rows,
      mismatchCount: mismatches.length,
      corruptedCount: corrupted.length,
      note: 'KHÔNG tìm được coach có tên giữ script gốc CJK/Hangul/Ả Rập thật trong nguồn dữ liệu (đã quét ~13,000 trận qua các giải Nhật/Hàn/Trung/Saudi/Iran/Qatar/Việt Nam/Myanmar) — Opta luôn trả tên coach đã romanize sẵn cho mọi quốc tịch. Test này verify encoding UTF-8 nhất quán cho các ký tự có dấu Latin Extended thực tế có trong data (á, é, Đ, ị...).',
    });

    await saveExcelForSeason(SEASON_DIR, SLUG, 'case6-unicode-encoding-report.xlsx', [
      {
        name: 'Ten coach unicode - old vs new',
        columns: [
          { header: 'Tên kỳ vọng', key: 'expectedName', width: 26 },
          { header: 'ref_id', key: 'refId', width: 18 },
          { header: 'Ghi chú', key: 'note', width: 40 },
          { header: 'Tên trả về (cũ)', key: 'oldName', width: 26 },
          { header: 'Tên trả về (mới)', key: 'newName', width: 26 },
          { header: 'Khớp tên kỳ vọng?', key: 'nameMatchesExpected', width: 16 },
          { header: 'Cũ = mới?', key: 'oldVsNewEqual', width: 12 },
        ],
        rows,
        wrapText: true,
      },
    ]);

    expect(mismatches, `${mismatches.length}/${rows.length} tên coach lệch giữa old/new hoặc không khớp tên kỳ vọng — xem case6-unicode-encoding-report.xlsx`).toEqual([]);
    expect(corrupted, `${corrupted.length} mẫu có dấu hiệu mojibake (lỗi encoding) — xem chi tiết report`).toEqual([]);
  });
});
