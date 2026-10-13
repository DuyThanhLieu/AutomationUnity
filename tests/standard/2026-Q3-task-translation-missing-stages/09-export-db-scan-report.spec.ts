/**
 * Export danh sách 107 stage name "nghi vấn chưa dịch" (quét toàn bộ 2236
 * stage.name distinct trong DB production football, 10.96.0.5) để gửi dev.
 *
 * QUAN TRỌNG — đọc trước khi gửi dev:
 *   Danh sách này CHƯA ĐƯỢC VERIFY trên hệ thống live. Lý do: DB Postgres
 *   dùng để quét không phải nguồn dữ liệu mà API production/ES đang đọc —
 *   mọi event_id lấy từ DB này đều trả "Event not found" khi gọi API thật,
 *   nên QA không có cách nào map ngược case DB sang 1 trận cụ thể để xem
 *   UI thật có lộ raw key hay không.
 *
 *   Thêm nữa, rule suy luận name -> nameKey (dùng để lọc 107 case này)
 *   không khớp 100% với rule thật của hệ thống — dictionary /locale/en có
 *   nhiều key dùng tổ hợp hoàn toàn khác tên gốc (vd key "14" dịch thành
 *   "Quarter-Final", key "groups_c-group_a" ghép từ 2 phần riêng). Vì vậy
 *   số lượng case thật sự thiếu dịch có thể NHỎ HƠN NHIỀU so với 107, hoặc
 *   ngược lại có case khác không nằm trong danh sách này.
 *
 *   Khuyến nghị: dev tự kiểm tra trực tiếp trong code logic build key, vì
 *   đây là cách duy nhất xác nhận chắc chắn — QA không verify thêm được.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-translation-missing-stages/09-export-db-scan-report.spec.ts --project=chrome
 */
import { test } from '@playwright/test';
import { readFileSync } from 'fs';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-translation-missing-stages';

test.describe('[Export] Danh sách nghi vấn chưa dịch — quét toàn bộ DB', () => {
  test('Xuất TESTREPORT_DBScanSuspiciousStageNames.xlsx', async () => {
    const suspicious = JSON.parse(
      readFileSync(
        'tests/standard/2026-Q3-task-translation-missing-stages/08-full-db-scan-suspicious.json',
        'utf8'
      )
    ) as { stageName: string; triedKeys: string[] }[];

    const sheets: ExcelSheetSpec[] = [
      {
        name: 'Tổng quan',
        columns: [
          { header: 'Mục', key: 'k', width: 32 },
          { header: 'Nội dung', key: 'v', width: 112 },
        ],
        rows: [
          { k: 'Phạm vi quét', v: `Toàn bộ 2236 giá trị DISTINCT trong cột stages.name, DB production football (10.96.0.5). Đối chiếu với dictionary /api/v2/locale/en (7115 key).` },
          { k: 'Kết quả', v: `${suspicious.length} stage name không match được bất kỳ rule suy luận key nào trong dictionary.` },
          { k: '⚠️ CHƯA VERIFY TRÊN LIVE', v: 'DB Postgres dùng để quét KHÔNG phải nguồn dữ liệu mà API production/ES đang đọc — event_id lấy từ DB này đều "Event not found" khi gọi API thật. QA không map được case nào sang 1 trận cụ thể để tự kiểm tra UI.' },
          { k: '⚠️ RULE SUY LUẬN KHÔNG ĐÁNG TIN 100%', v: 'Dictionary có nhiều key dùng tổ hợp khác hẳn tên gốc (vd key "14" -> "Quarter-Final", "groups_c-group_a" -> ghép 2 phần riêng). Số liệu 107 case CÓ THỂ gồm false positive, và cũng CÓ THỂ bỏ sót case thật.' },
          { k: 'Case đã verify CHẮC CHẮN (tham khảo)', v: 'Trận Bury vs Harrogate Town (FA Cup, event 54cvbmlfd186vp4): badge từng hiển thị raw key "fourth_qualifying_round" dù key này CÓ bản dịch sẵn ("Fourth Qualifying Round") — xác nhận bug KHÔNG do thiếu dữ liệu, mà do FE đôi khi không áp dụng bản dịch (lỗi logic, có tính KHÔNG ỔN ĐỊNH — lúc đúng lúc sai, chưa rõ nguyên nhân chính xác).' },
          { k: 'Đề xuất dev', v: 'Không dùng danh sách 107 case này làm căn cứ sửa trực tiếp. Thay vào đó: (1) dev tự rà trong code nguồn build key để xác nhận rule thật, (2) điều tra riêng case "fourth_qualifying_round" (đã verify thật) để tìm nguyên nhân race condition/cache khiến badge thỉnh thoảng không áp dụng bản dịch.' },
        ],
        wrapText: true,
      },
      {
        name: '107 case nghi vấn (chưa verify)',
        columns: [
          { header: '#', key: 'idx', width: 6 },
          { header: 'Stage name (DB)', key: 'stageName', width: 50 },
          { header: 'Key thử (rule suy luận, có thể sai)', key: 'triedKeys', width: 70 },
        ],
        rows: suspicious.map((s, i) => ({
          idx: i + 1,
          stageName: s.stageName,
          triedKeys: s.triedKeys.join(' | '),
        })),
        wrapText: true,
      },
    ];

    await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTREPORT_DBScanSuspiciousStageNames.xlsx', sheets);
  });
});
