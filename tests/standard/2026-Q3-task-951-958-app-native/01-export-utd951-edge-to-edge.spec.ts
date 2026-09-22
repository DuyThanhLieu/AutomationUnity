/**
 * UTD-951 [App][New Arch] Edge-to-Edge / Safe Area Insets (Android – iOS)
 *
 * Xuất file Excel CHECKLIST + TEST CASE đầy đủ, bao quát toàn bộ màn hình
 * app (không chỉ Home/match-detail/modal như checklist gốc) để QA dùng khi
 * test tay trên thiết bị thật — KHÔNG thể tự động hoá vì cần thiết bị
 * Android 15+/iPhone Dynamic Island thật.
 *
 * KHÔNG phải test assert PASS/FAIL — chỉ generate tài liệu Excel.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-951-958-app-native/01-export-utd951-edge-to-edge.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-951-958-app-native';

// sim: '✅ Giả lập được' (Android Studio Emulator / Xcode Simulator) hoặc
// '⚠️ Nên máy thật' (giả lập vẫn chạy được nhưng độ tin cậy thấp hơn, ví dụ
// cảm biến xoay/gập vật lý) hoặc '❌ Cần máy thật' (giả lập không tái hiện được).
// ============ CHECKLIST — UTD-951 ============
const CHECKLIST_951 = [
  // Android
  { platform: 'Android', area: 'Status bar', item: 'Status bar trong suốt toàn app', note: 'Icon giờ/pin hệ thống vẫn đọc rõ trên nền app', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Status bar', item: 'Status bar không đổi màu đột ngột khi chuyển màn', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Navigation bar', item: 'Navigation bar (3 nút hoặc gesture) trong suốt', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Navigation bar', item: 'Gesture bar không đè lên nội dung cuối trang', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Home', item: 'Header/logo không bị status bar che', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Home', item: 'Bottom tab bar cách nav bar đúng khoảng inset', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Home', item: 'Danh sách trận đấu cuộn mượt, không bị che ở top/bottom', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Match Detail', item: 'Header tên đội/tỉ số không bị status bar che', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Match Detail', item: 'Tab con (Lineups/Stats/H2H...) không bị che khi sticky', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Match Detail', item: 'Cuộn tới cuối trang — nội dung cuối không bị nav bar che', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Match Detail', item: 'Nút back/share ở header không bị che/khó bấm', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Modal/Popup', item: 'Modal chọn ngôn ngữ không tràn vùng an toàn', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Modal/Popup', item: 'Modal share trận đấu hiển thị đầy đủ nút hành động', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Modal/Popup', item: 'Bottom sheet (nếu có) kéo lên/xuống không bị lỗi inset', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Bottom Menu', item: 'Tab bar 5 mục không bị đè bởi gesture bar', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Bottom Menu', item: 'Badge thông báo trên icon tab hiển thị đúng vị trí', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'WebView', item: 'Trang điều khoản/chính sách không bị che đầu/cuối', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'WebView', item: 'Trang thanh toán/nạp tiền (nếu có) hiển thị đủ nút xác nhận', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Search', item: 'Ô tìm kiếm không bị status bar che khi mở', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Search', item: 'Bàn phím ảo mở lên không che input đang gõ', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Settings', item: 'Màn cài đặt cuộn hết danh sách không bị che cuối', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Notification', item: 'Banner thông báo in-app không đè lên status bar', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android', area: 'Orientation', item: 'Xoay ngang: Home tính lại inset đúng', note: 'Nếu app hỗ trợ xoay màn', sim: '⚠️ Nên máy thật (cảm biến xoay ảo đôi khi không mượt)' },
  { platform: 'Android', area: 'Orientation', item: 'Xoay ngang: Match Detail (video/highlight) không bị che', note: '', sim: '⚠️ Nên máy thật' },
  { platform: 'Android', area: 'Backward compat', item: 'Máy Android < API 35 không bị hồi quy hành vi cũ', note: 'So sánh với bản trước khi có edge-to-edge', sim: '✅ Giả lập được (chọn AVD API thấp hơn)' },
  { platform: 'Android', area: 'Foldable', item: 'Máy màn hình gập (nếu có) — inset đúng khi gập/mở', note: 'Optional nếu có thiết bị', sim: '❌ Cần máy thật (Emulator giả lập gập kém chính xác)' },
  // iOS
  { platform: 'iOS', area: 'Notch/Dynamic Island', item: 'Home: nội dung không bị Dynamic Island che', note: 'Máy 14 Pro trở lên', sim: '✅ Giả lập được (Xcode Simulator iPhone 15/16 Pro)' },
  { platform: 'iOS', area: 'Notch/Dynamic Island', item: 'Live Activity (nếu có) không xung đột với Dynamic Island', note: '', sim: '⚠️ Nên máy thật (Live Activity trên Simulator hạn chế)' },
  { platform: 'iOS', area: 'Notch/Dynamic Island', item: 'Match Detail: header không bị che khi cuộn nhanh', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'Home Indicator', item: 'Nội dung cuối các màn cách home indicator hợp lý', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'Home Indicator', item: 'Vuốt lên từ home indicator không xung đột gesture app', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'Modal/Popup', item: 'Modal không bị cắt bởi notch/home indicator', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'Modal/Popup', item: 'Action sheet (share, options) hiển thị đủ, không tràn viền', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'Bottom Menu', item: 'Tab bar cách home indicator đúng safe-area', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'WebView', item: 'WebView full màn có padding đúng safe-area', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'Search', item: 'Ô tìm kiếm + bàn phím không bị notch che', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'Older devices', item: 'iPhone không notch (SE) — không có khoảng trắng thừa bất thường', note: '', sim: '✅ Giả lập được (chọn Simulator SE)' },
  { platform: 'iOS', area: 'Older devices', item: 'iPhone có notch thường (không Dynamic Island, vd 13) — vẫn đúng', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS', area: 'Orientation', item: 'Xoay ngang: an toàn vùng trái/phải (notch nằm cạnh)', note: '', sim: '⚠️ Nên máy thật' },
  { platform: 'iOS', area: 'Split View / iPad', item: 'Nếu hỗ trợ iPad — Safe area đúng ở chế độ multitasking', note: 'Optional', sim: '✅ Giả lập được (Simulator iPad)' },
];

// ============ TEST CASE — UTD-951 ============
const TESTCASES_951 = [
  { id: 'AND-01', platform: 'Android', title: 'Status bar trong suốt trên Home', steps: '1. Mở app\n2. Vào màn Home\n3. Quan sát status bar', expected: 'Status bar không có nền chắn, icon hệ thống vẫn rõ', priority: 'High', sim: '✅ Emulator' },
  { id: 'AND-02', platform: 'Android', title: 'Header Home không bị status bar che', steps: '1. Vào Home\n2. Quan sát phần trên cùng màn hình', expected: 'Logo/search bar không bị đè', priority: 'High', sim: '✅ Emulator' },
  { id: 'AND-03', platform: 'Android', title: 'Bottom tab bar không bị nav bar che', steps: '1. Vào Home\n2. Quan sát tab bar dưới cùng', expected: 'Tab bar cách nav bar đúng inset', priority: 'High', sim: '✅ Emulator' },
  { id: 'AND-04', platform: 'Android', title: 'Match-detail header không bị che', steps: '1. Vào 1 trận đấu bất kỳ\n2. Quan sát phần đầu trang', expected: 'Tên đội/tỉ số hiển thị đầy đủ', priority: 'High', sim: '✅ Emulator' },
  { id: 'AND-05', platform: 'Android', title: 'Match-detail cuộn tới cuối trang', steps: '1. Vào match-detail\n2. Cuộn xuống hết trang', expected: 'Nội dung cuối không bị nav bar che', priority: 'Medium', sim: '✅ Emulator' },
  { id: 'AND-06', platform: 'Android', title: 'Modal không tràn vùng an toàn', steps: '1. Mở modal bất kỳ (chọn ngôn ngữ, share...)\n2. Quan sát toàn bộ modal', expected: 'Modal nằm gọn, nút hành động bấm được', priority: 'High', sim: '✅ Emulator' },
  { id: 'AND-07', platform: 'Android', title: 'WebView full màn đúng inset', steps: '1. Mở trang điều khoản/chính sách\n2. Cuộn lên/xuống', expected: 'Không bị che ở đầu/cuối trang', priority: 'Medium', sim: '✅ Emulator' },
  { id: 'AND-08', platform: 'Android', title: 'Xoay ngang tính lại inset', steps: '1. Xoay máy sang ngang ở Home/match-detail', expected: 'Inset đúng theo hướng ngang', priority: 'Low', sim: '⚠️ Nên máy thật' },
  { id: 'AND-09', platform: 'Android', title: 'Hồi quy trên máy Android cũ (<API 35)', steps: '1. Lặp lại AND-01→07 trên máy Android cũ', expected: 'Không thay đổi hành vi tiêu cực', priority: 'Medium', sim: '✅ Emulator (chọn AVD API thấp)' },
  { id: 'AND-10', platform: 'Android', title: 'Bàn phím ảo không che input tìm kiếm', steps: '1. Mở ô tìm kiếm\n2. Gõ text', expected: 'Bàn phím không che phần đang gõ', priority: 'Medium', sim: '✅ Emulator' },
  { id: 'AND-11', platform: 'Android', title: 'Banner thông báo in-app không đè status bar', steps: '1. Kích hoạt 1 in-app notification (vd goal alert)', expected: 'Banner hiện dưới status bar, không đè lên', priority: 'Low', sim: '✅ Emulator' },
  { id: 'AND-12', platform: 'Android', title: 'Settings cuộn hết danh sách', steps: '1. Vào Settings\n2. Cuộn xuống hết', expected: 'Item cuối cùng không bị nav bar che', priority: 'Low', sim: '✅ Emulator' },
  { id: 'IOS-01', platform: 'iOS', title: 'Home không bị Dynamic Island che', steps: '1. Mở app trên iPhone 14 Pro+\n2. Vào Home', expected: 'Nội dung đầu trang cách Dynamic Island hợp lý', priority: 'High', sim: '✅ Simulator (iPhone 15/16 Pro)' },
  { id: 'IOS-02', platform: 'iOS', title: 'Match-detail không bị notch che khi cuộn', steps: '1. Vào match-detail\n2. Cuộn lên xuống liên tục', expected: 'Header không bị che dù cuộn nhanh', priority: 'High', sim: '✅ Simulator' },
  { id: 'IOS-03', platform: 'iOS', title: 'Home indicator không che nội dung', steps: '1. Vào màn có nút/text cuối trang', expected: 'Bấm được nút cuối cùng dễ dàng', priority: 'High', sim: '✅ Simulator' },
  { id: 'IOS-04', platform: 'iOS', title: 'Modal không bị cắt bởi notch/home indicator', steps: '1. Mở modal bất kỳ', expected: 'Toàn bộ nội dung modal hiển thị đủ', priority: 'High', sim: '✅ Simulator' },
  { id: 'IOS-05', platform: 'iOS', title: 'WebView đúng safe-area', steps: '1. Mở WebView\n2. Kiểm tra viền trên/dưới', expected: 'Có padding đúng, không tràn vùng notch', priority: 'Medium', sim: '✅ Simulator' },
  { id: 'IOS-06', platform: 'iOS', title: 'iPhone không notch (SE/8) vẫn đúng', steps: '1. Lặp lại IOS-01→05 trên máy không notch', expected: 'Không có khoảng trắng thừa bất thường', priority: 'Medium', sim: '✅ Simulator (chọn model SE)' },
  { id: 'IOS-07', platform: 'iOS', title: 'Action sheet share không tràn viền', steps: '1. Bấm share 1 trận đấu\n2. Quan sát action sheet', expected: 'Hiển thị đủ nút, không bị cắt', priority: 'Medium', sim: '✅ Simulator' },
  { id: 'IOS-08', platform: 'iOS', title: 'Xoay ngang an toàn vùng trái/phải', steps: '1. Xoay ngang ở màn có notch bên cạnh', expected: 'Nội dung không bị notch che theo chiều ngang', priority: 'Low', sim: '⚠️ Nên máy thật' },
  { id: 'IOS-09', platform: 'iOS', title: 'Live Activity không xung đột Dynamic Island', steps: '1. Bật theo dõi 1 trận live\n2. Quan sát Dynamic Island khi có Live Activity', expected: 'Không chồng lấn UI, thông tin hiển thị đúng', priority: 'Low', sim: '⚠️ Nên máy thật (Live Activity Simulator hạn chế)' },
  { id: 'IOS-10', platform: 'iOS', title: 'iPad Split View (nếu hỗ trợ)', steps: '1. Mở app trên iPad ở chế độ Split View', expected: 'Safe area đúng trong multitasking', priority: 'Low', sim: '✅ Simulator (iPad)' },
];

test.describe('[UTD-951] Export báo cáo Excel — Checklist + Test case Edge-to-Edge', () => {
  test('Xuất REPORT_UTD951_EdgeToEdge.xlsx', async () => {
    const summarySheet: ExcelSheetSpec = {
      name: 'KẾT QUẢ TỔNG QUAN',
      columns: [
        { header: 'Mục', key: 'field', width: 30 },
        { header: 'Nội dung', key: 'value', width: 95 },
      ],
      rows: [
        { field: '📋 TASK', value: 'UTD-951 [App][New Arch] Edge-to-Edge / Safe Area Insets (Android – iOS)' },
        { field: '🎯 Mục tiêu', value: 'Verify edge-to-edge bắt buộc (Android API 35+) và xử lý safe-area trên mọi màn' },
        { field: '📊 Độ bao phủ checklist', value: `${CHECKLIST_951.length} hạng mục (${CHECKLIST_951.filter(c=>c.platform==='Android').length} Android + ${CHECKLIST_951.filter(c=>c.platform==='iOS').length} iOS)` },
        { field: '📊 Độ bao phủ test case', value: `${TESTCASES_951.length} test case (${TESTCASES_951.filter(c=>c.platform==='Android').length} Android + ${TESTCASES_951.filter(c=>c.platform==='iOS').length} iOS)` },
        { field: '✅ Tiêu chí đạt', value: 'Không nội dung nào bị che sau thanh hệ thống, không đè/cắt, layout nhất quán 2 nền tảng' },
        { field: '⚠️ Yêu cầu môi trường test', value: 'Cần thiết bị THẬT — Android 15+ (API 35), iPhone có Dynamic Island (14 Pro+), iPhone không notch (SE/8) để đối chứng, iPad (nếu hỗ trợ)' },
        { field: '✅ Giả lập được (khuyến nghị dùng đầu tiên)', value: 'Android Studio Emulator (AVD API 35, chọn model có notch như Pixel 8 Pro) + Xcode iOS Simulator (iPhone 15/16 Pro cho Dynamic Island, iPhone SE để đối chứng). Gần như toàn bộ checklist/test case đều test được bằng cách này.' },
        { field: '⚠️/❌ Nên hoặc cần máy thật', value: 'Chỉ vài case cạnh biên: xoay màn hình vật lý (cảm biến ảo kém mượt hơn), máy màn hình gập (foldable), Live Activity trên Dynamic Island. Xem chi tiết ở cột "Giả lập được?" trong từng sheet.' },
        { field: '📝 Trạng thái', value: 'Chưa test — cần QA thực hiện trên thiết bị thật, tick kết quả vào sheet Checklist/Test case' },
      ],
      wrapText: true,
    };

    const checklistSheet: ExcelSheetSpec = {
      name: 'Checklist',
      columns: [
        { header: 'STT', key: 'stt', width: 6 },
        { header: 'Nền tảng', key: 'platform', width: 12 },
        { header: 'Khu vực', key: 'area', width: 22 },
        { header: 'Hạng mục kiểm tra', key: 'item', width: 55 },
        { header: 'Ghi chú', key: 'note', width: 35 },
        { header: 'Giả lập được?', key: 'sim', width: 30 },
        { header: 'Kết quả (Pass/Fail/N-A)', key: 'result', width: 22 },
      ],
      rows: CHECKLIST_951.map((c, i) => ({ stt: i + 1, ...c, result: '' })),
      wrapText: true,
    };

    const testCaseSheet: ExcelSheetSpec = {
      name: 'Test case',
      columns: [
        { header: 'TC ID', key: 'id', width: 10 },
        { header: 'Nền tảng', key: 'platform', width: 10 },
        { header: 'Tên test case', key: 'title', width: 40 },
        { header: 'Các bước thực hiện', key: 'steps', width: 45 },
        { header: 'Kết quả mong đợi', key: 'expected', width: 45 },
        { header: 'Độ ưu tiên', key: 'priority', width: 12 },
        { header: 'Giả lập được?', key: 'sim', width: 30 },
        { header: 'Kết quả thực tế', key: 'actual', width: 30 },
        { header: 'Pass/Fail', key: 'status', width: 12 },
      ],
      rows: TESTCASES_951.map((t) => ({ ...t, actual: '', status: '' })),
      wrapText: true,
    };

    await saveExcelForSeason(SEASON_DIR, SLUG, 'REPORT_UTD951_EdgeToEdge.xlsx', [
      summarySheet,
      checklistSheet,
      testCaseSheet,
    ]);
  });
});
