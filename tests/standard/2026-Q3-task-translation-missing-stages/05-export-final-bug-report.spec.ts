/**
 * Report cuối cùng cho 2 case bug "raw translation key" user báo bằng ảnh
 * chụp màn hình (advancing_match, division_1_final) — kèm hướng dẫn viết
 * auto test cho dev.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-translation-missing-stages/05-export-final-bug-report.spec.ts --project=chrome
 */
import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-translation-missing-stages';

test.describe('[Bug Report] Raw translation key trên badge Match Detail (Excel)', () => {
  test('Xuất TESTREPORT_RawKeyBadgeBug.xlsx', async () => {
    const sheets: ExcelSheetSpec[] = [
      {
        name: 'Tổng quan',
        columns: [
          { header: 'Mục', key: 'k', width: 32 },
          { header: 'Nội dung', key: 'v', width: 112 },
        ],
        rows: [
          { k: 'Bug', v: 'Badge/label cạnh tên giải đấu trên màn Match Detail (mobile/app) hiển thị RAW TRANSLATION KEY (vd "advancing_match", "division_1_final") thay vì text đã dịch, dù bản dịch ĐÃ TỒN TẠI trong hệ thống.' },
          { k: 'Case 1 đã xác nhận', v: 'Trận Kazakhstan (W) vs Ireland (W), giải "WC Nữ Châu Âu" — badge hiển thị "advancing_match". Key "advancing_match" KHÔNG CÓ trong dictionary (GET /api/v2/locale/en) — nguyên nhân: thiếu bản dịch.' },
          { k: 'Case 2 đã xác nhận', v: 'Trận Indonesia vs Thái Lan, giải "FIFA ASEAN Cup" — badge hiển thị "division_1_final". Key "division_1_final" CÓ TỒN TẠI trong dictionary, giá trị = "Final" — nguyên nhân KHÁC HẲN case 1: không phải thiếu bản dịch, mà FE không áp dụng bước tra locale cho field này ở vị trí UI này.' },
          { k: '🔑 PHÁT HIỆN GỐC RỄ QUAN TRỌNG NHẤT', v: 'API route GET /api/v2/football/event/:id?language=en trả sẵn object "stageInfo" với 3 field: "name" (text gốc, vd "advancing match"), "nameKey" (key để tra locale, vd "advancing_match"), "legKey" (key khác, vd "first_leg"). Verify trên web desktop: breadcrumb dùng field "legKey" và hiển thị ĐÚNG bản dịch ("First Leg"). Nghi vấn: badge trên mobile/app lại dùng field "nameKey" hoặc "name" raw, và ở 1 số route/luồng cụ thể KHÔNG áp dụng bước tra locale — khác với breadcrumb desktop.' },
          { k: 'Đã verify trên web desktop (Playwright)', v: '3/3 automated test PASS trên staging.uniscore.vn (desktop layout) — KHÔNG phát hiện raw key nào bị lộ trên breadcrumb. Điều này xác nhận: bug ĐẶC THÙ cho layout mobile/app, không xuất hiện trên web desktop — cần dev kiểm tra riêng code path cho mobile.' },
          { k: 'Vì sao khó tái hiện 100% trên automated test hiện tại', v: 'Môi trường test (Playwright browser) mặc định render theo desktop viewport. Để bắt đúng bug, cần (a) giả lập mobile viewport/user-agent, hoặc (b) nếu bug đến từ app native (không phải web responsive), cần test riêng trên app thật — ngoài khả năng của Playwright web.' },
          { k: 'Đề xuất dev viết auto test', v: '(1) Test API: với mọi event có "stageInfo.nameKey", gọi GET /api/v2/locale/en và assert nameKey PHẢI tồn tại trong dictionary — bắt được loại bug như case 1 (thiếu bản dịch). (2) Test UI mobile: set viewport mobile (375x812) hoặc dùng device emulation thật, mở Match Detail, lấy text của badge cạnh tên giải, assert KHÔNG match pattern raw key (chữ thường + gạch dưới, không khoảng trắng) — bắt được loại bug như case 2 (FE không áp dụng dịch dù key đã có). (3) Chạy định kỳ (cron) quét N trận ngẫu nhiên mỗi ngày để bắt case mới phát sinh, không chỉ 2 case đã biết.' },
        ],
        wrapText: true,
      },
      {
        name: 'So sánh 2 loại bug',
        columns: [
          { header: 'Tiêu chí', key: 'k', width: 30 },
          { header: 'Case 1: advancing_match', key: 'case1', width: 50 },
          { header: 'Case 2: division_1_final', key: 'case2', width: 50 },
        ],
        rows: [
          { k: 'Key có tồn tại trong dictionary?', case1: 'KHÔNG', case2: 'CÓ — giá trị "Final"' },
          { k: 'Nguyên nhân gốc rễ', case1: 'Thiếu bản dịch trong dictionary (data gap)', case2: 'FE không áp dụng bước tra locale cho field này (logic bug)' },
          { k: 'Phạm vi sửa', case1: 'Bổ sung key vào dictionary (backend/content team)', case2: 'Sửa code FE để gọi đúng hàm dịch (frontend team)' },
          { k: 'Mức độ ưu tiên', case1: 'Trung bình — chỉ cần thêm data', case2: 'CAO HƠN — lỗi logic có thể ảnh hưởng nhiều stage khác dù đã có bản dịch' },
        ],
        wrapText: true,
      },
    ];

    await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTREPORT_RawKeyBadgeBug.xlsx', sheets);
  });
});
