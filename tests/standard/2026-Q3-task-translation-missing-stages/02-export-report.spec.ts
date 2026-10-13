/**
 * Export report cho vòng quét auto-check "stages.name chưa được dịch" —
 * nguồn từ 01-scan-untranslated-stages.mjs. Xem đầu file đó để biết đầy đủ
 * bối cảnh, cơ chế dịch đã xác nhận, và giới hạn của rule đơn giản đang dùng.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-translation-missing-stages/02-export-report.spec.ts --project=chrome
 */
import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';
import missingList from './missing-stage-translations.json';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-translation-missing-stages';

test.describe('[Auto-check] Stage name chưa dịch (Excel)', () => {
  test('Xuất TESTREPORT_UntranslatedStages.xlsx', async () => {
    const sheets: ExcelSheetSpec[] = [
      {
        name: 'Tổng quan',
        columns: [
          { header: 'Mục', key: 'k', width: 30 },
          { header: 'Nội dung', key: 'v', width: 112 },
        ],
        rows: [
          { k: 'Bối cảnh', v: 'User báo lỗi: label "advancing_match" hiển thị raw key chưa dịch trên màn Match Detail > Head to Head (trận Kazakhstan Women vs Ireland Women). Đã xác nhận nguồn: DB bảng "stages" cột "name" = "advancing match", FE build key = lowercase + thay ký tự đặc biệt bằng "_", tra trong GET /api/v2/locale/en — key "advancing_match" KHÔNG tồn tại trong locale, dẫn tới hiển thị raw key.' },
          { k: 'Phạm vi quét auto', v: 'Toàn bộ 2,232 giá trị "stages.name" DISTINCT trong DB, đối chiếu với 7,088 key trong file locale "en" (gọi API thật, không phải file tĩnh).' },
          { k: 'Kết quả', v: '130/2,232 stage name KHÔNG tìm thấy key tương ứng trong locale — nghi vấn cùng loại bug với "advancing_match".' },
          { k: '⚠️ GIỚI HẠN QUAN TRỌNG — rule build key chưa chuẩn 100%', v: 'Khảo sát cho thấy FE xử lý ký tự đặc biệt KHÔNG nhất quán hoàn toàn giữa các entry locale (vd "1/8 Final"→"18_final" bỏ dấu "/", nhưng "Copa Sudamericana 1/16-finals"→giữ nguyên dấu "/" trong key). Script dùng rule đơn giản (lowercase, thay ký tự đặc biệt bằng "_") nên DANH SÁCH 130 CASE CÓ THỂ LẪN FALSE POSITIVE — đây là danh sách NGHI VẤN cần tự rà lại trên UI thật trước khi báo dev, KHÔNG PHẢI kết luận cuối cùng.' },
          { k: 'Case đã verify chắc chắn đúng', v: '"advancing match" → key "advancing_match" — đã xác nhận 100% qua ảnh chụp màn hình UI thật do user cung cấp, chứng minh rule cơ bản đi đúng hướng.' },
          { k: 'Đề xuất bước tiếp theo', v: '(1) Tự rà lại thủ công danh sách 130 case, ưu tiên các stage có khả năng xuất hiện trên UI thật (giải lớn, đang diễn ra) trước các giải nhỏ/hiếm. (2) Với case nghi ngờ rule sai (có dấu "/", số La Mã, ký tự Unicode đặc biệt như （）), cần verify trực tiếp qua UI thay vì tin vào kết quả script. (3) Nếu có quyền truy cập code FE, lấy đúng hàm buildTranslationKey() thật để chạy lại script cho chính xác 100%, loại bỏ hoàn toàn rủi ro false positive.' },
        ],
        wrapText: true,
      },
      {
        name: 'Danh sách nghi vấn (130 case)',
        columns: [
          { header: '#', key: 'stt', width: 6 },
          { header: 'Stage name (DB)', key: 'stageName', width: 45 },
          { header: 'Key dự đoán (rule đơn giản)', key: 'expectedKey', width: 45 },
          { header: 'Độ tin cậy', key: 'confidence', width: 16 },
        ],
        rows: missingList.map((m: { stageName: string; expectedKey: string }, i: number) => ({
          stt: i + 1,
          stageName: m.stageName,
          expectedKey: m.expectedKey,
          confidence: /[\/\\()（）'"]/.test(m.stageName) ? 'THẤP — có ký tự đặc biệt, cần verify tay' : 'Cao',
        })),
        wrapText: true,
      },
    ];

    await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTREPORT_UntranslatedStages.xlsx', sheets);
  });
});
