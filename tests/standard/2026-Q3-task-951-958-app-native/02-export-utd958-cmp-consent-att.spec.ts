/**
 * UTD-958 [App][New Arch] CMP / Consent / ATT (Android – iOS)
 *
 * Xuất file Excel CHECKLIST + TEST CASE đầy đủ, bao quát mọi luồng consent/ATT
 * (EEA, non-EEA, allow/deny, reject, reset, đổi vùng...) để QA test tay trên
 * thiết bị thật — KHÔNG thể tự động hoá vì cần test-device hash đăng ký với
 * Apple và máy thật để verify chính xác vị trí địa lý/ATT.
 *
 * KHÔNG phải test assert PASS/FAIL — chỉ generate tài liệu Excel.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-951-958-app-native/02-export-utd958-cmp-consent-att.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-951-958-app-native';

// sim: '✅ Giả lập được' (Simulator/Emulator đủ tin cậy), '⚠️ Test tạm được, không chắc chắn'
// (chạy được trên Simulator nhưng KHÔNG đảm bảo đúng như thật vì thiếu device hash/IP thật),
// hoặc '❌ BẮT BUỘC máy thật' (Simulator không có UDID/hash thật nên không đăng ký EEA được).
// ============ CHECKLIST — UTD-958 ============
const CHECKLIST_958 = [
  { platform: 'Chuẩn bị', area: 'Môi trường', item: 'Đăng ký device hash máy iOS test vào Apple Developer Console (ép EEA)', note: 'Bắt buộc trước khi test EEA', sim: '❌ BẮT BUỘC máy thật (Simulator không có UDID thật để đăng ký)' },
  { platform: 'Chuẩn bị', area: 'Môi trường', item: 'Xác nhận máy test KHÔNG bật VPN', note: 'VPN phá DNS, sai kết quả', sim: '✅ Áp dụng cho cả 2' },
  { platform: 'Chuẩn bị', area: 'Môi trường', item: 'Có sẵn máy non-EEA (không đăng ký hash) để đối chứng', note: '', sim: '✅ Giả lập được (Simulator bình thường)' },
  { platform: 'Chuẩn bị', area: 'Môi trường', item: 'Xoá data app / cài mới trước mỗi lượt test luồng đầu tiên', note: 'Đảm bảo test đúng first-launch flow', sim: '✅ Giả lập được' },
  { platform: 'iOS - EEA', area: 'CMP', item: 'CMP consent form hiện khi mở app lần đầu', note: '', sim: '❌ BẮT BUỘC máy thật đã đăng ký hash' },
  { platform: 'iOS - EEA', area: 'CMP', item: 'Form hiển thị đủ ngôn ngữ theo locale máy', note: '', sim: '❌ BẮT BUỘC máy thật' },
  { platform: 'iOS - EEA', area: 'CMP', item: 'Có đủ 3 lựa chọn: Accept All / Reject All / Manage options (nếu thiết kế có)', note: '', sim: '❌ BẮT BUỘC máy thật' },
  { platform: 'iOS - EEA', area: 'CMP', item: 'Chọn "Manage options" mở đúng màn tuỳ chỉnh chi tiết', note: '', sim: '❌ BẮT BUỘC máy thật' },
  { platform: 'iOS - EEA', area: 'CMP', item: 'Sau khi chọn Accept All — consent lưu lại, mở lại app không hiện form nữa', note: '', sim: '❌ BẮT BUỘC máy thật' },
  { platform: 'iOS - EEA', area: 'CMP', item: 'Sau khi chọn Reject All — canRequestAds phản ánh đúng (non-personalized)', note: '', sim: '❌ BẮT BUỘC máy thật' },
  { platform: 'iOS - EEA', area: 'ATT', item: 'ATT prompt hiện đúng lúc (thường sau CMP hoặc theo Apple guideline)', note: '', sim: '⚠️ Test tạm được (ATT chạy trên Simulator) nhưng thứ tự với CMP cần máy thật để chắc chắn' },
  { platform: 'iOS - EEA', area: 'ATT', item: 'Chọn Allow — attStatus = authorized', note: '', sim: '✅ Giả lập được (ATT là API hệ thống, Simulator vẫn chạy)' },
  { platform: 'iOS - EEA', area: 'ATT', item: 'Chọn Deny (Ask App Not to Track) — attStatus = denied, app không crash', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS - EEA', area: 'ATT', item: 'Không bấm chọn gì (background app) — attStatus = notDetermined không gây lỗi', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS - EEA', area: 'Ads', item: 'canRequestAds trả true sau khi đồng ý', note: '', sim: '❌ BẮT BUỘC máy thật (phụ thuộc kết quả CMP thật)' },
  { platform: 'iOS - EEA', area: 'Ads', item: 'Ads thực sự load và hiển thị sau khi có canRequestAds=true', note: '', sim: '⚠️ Test tạm được (ads test/demo có thể load trên Simulator) nhưng ads thật cần máy thật' },
  { platform: 'iOS - EEA', area: 'Ads', item: 'gatherConsent gọi API không lỗi mạng/DNS/timeout', note: 'Theo dõi qua network log', sim: '✅ Giả lập được (test network layer không cần vùng thật)' },
  { platform: 'iOS - non-EEA', area: 'CMP', item: 'CMP form KHÔNG hiện khi mở app lần đầu', note: '', sim: '✅ Giả lập được (Simulator mặc định coi như non-EEA)' },
  { platform: 'iOS - non-EEA', area: 'Ads', item: 'Ads vẫn hiển thị bình thường dù không qua CMP', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS - non-EEA', area: 'ATT', item: 'ATT prompt vẫn hiện theo chuẩn Apple (độc lập với vùng EEA)', note: '', sim: '✅ Giả lập được' },
  { platform: 'iOS - non-EEA', area: 'ATT', item: 'Deny ATT ở non-EEA không crash, ads vẫn serve non-personalized', note: '', sim: '✅ Giả lập được' },
  { platform: 'Android - EEA', area: 'CMP', item: 'CMP form hiện khi mở app lần đầu (dùng test-device tương đương)', note: 'Android dùng Consent SDK/UMP tương tự', sim: '❌ BẮT BUỘC máy thật/test-device ID đăng ký với Google AdMob (Emulator không có Advertising ID thật)' },
  { platform: 'Android - EEA', area: 'CMP', item: 'Consent lưu lại sau khi đồng ý, không hiện lại', note: '', sim: '❌ BẮT BUỘC máy thật' },
  { platform: 'Android - EEA', area: 'CMP', item: 'canRequestAds đúng theo lựa chọn consent', note: '', sim: '❌ BẮT BUỘC máy thật' },
  { platform: 'Android - non-EEA', area: 'CMP', item: 'CMP form không hiện, ads vẫn hoạt động', note: '', sim: '✅ Giả lập được (Emulator mặc định)' },
  { platform: 'Cạnh biên', area: 'Reset/Reinstall', item: 'Gỡ app, cài lại — luồng consent chạy lại từ đầu đúng', note: '', sim: '✅ Giả lập được (test luồng, không cần đúng vùng thật)' },
  { platform: 'Cạnh biên', area: 'Đổi vùng', item: 'Đổi vị trí máy từ EEA sang non-EEA (hoặc ngược lại) giữa các lần mở app', note: 'Kiểm tra hệ thống có tự cập nhật lại trạng thái không', sim: '❌ BẮT BUỘC máy thật (cần đổi vị trí GPS/mạng thật)' },
  { platform: 'Cạnh biên', area: 'Mất mạng', item: 'Mở app khi không có mạng — gatherConsent xử lý gracefully, không crash', note: '', sim: '✅ Giả lập được (tắt mạng trên Simulator/Emulator)' },
  { platform: 'Cạnh biên', area: 'Mất mạng', item: 'Có mạng lại sau đó — consent flow tự phục hồi đúng', note: '', sim: '✅ Giả lập được' },
  { platform: 'Cạnh biên', area: 'Update app', item: 'Update app từ bản cũ (không có CMP) lên bản mới — có hiện CMP đúng theo vùng không', note: '', sim: '⚠️ Test được luồng update trên Simulator, nhưng xác nhận "đúng theo vùng" cần máy thật' },
];

// ============ TEST CASE — UTD-958 ============
const TESTCASES_958 = [
  { id: 'EEA-01', platform: 'iOS EEA', title: 'CMP form hiện khi mở app lần đầu', steps: '1. Cài mới app trên máy test-device hash\n2. Mở app', expected: 'CMP consent form xuất hiện trước khi vào app chính', priority: 'High', sim: '❌ BẮT BUỘC máy thật' },
  { id: 'EEA-02', platform: 'iOS EEA', title: 'ATT prompt xuất hiện đúng lúc', steps: '1. Sau khi qua CMP, tiếp tục thao tác trong app', expected: 'Prompt "Allow Tracking" hiện ra đúng thời điểm theo thiết kế', priority: 'High', sim: '❌ BẮT BUỘC máy thật (phụ thuộc luồng CMP thật trước đó)' },
  { id: 'EEA-03', platform: 'iOS EEA', title: 'Bấm Allow trên ATT', steps: '1. Ở ATT prompt, chọn "Allow"', expected: 'attStatus=authorized; app hoạt động bình thường', priority: 'High', sim: '✅ Giả lập được (test riêng ATT, không cần đúng vùng)' },
  { id: 'EEA-04', platform: 'iOS EEA', title: 'Bấm Deny trên ATT', steps: '1. Reset app, lặp lại đến ATT prompt\n2. Chọn "Ask App Not to Track"', expected: 'attStatus=denied; app KHÔNG crash', priority: 'High', sim: '✅ Giả lập được' },
  { id: 'EEA-05', platform: 'iOS EEA', title: 'Consent được lưu sau Accept All', steps: '1. Chọn Accept All ở CMP\n2. Tắt hẳn app, mở lại', expected: 'CMP form KHÔNG hiện lại', priority: 'High', sim: '❌ BẮT BUỘC máy thật' },
  { id: 'EEA-06', platform: 'iOS EEA', title: 'canRequestAds đúng sau consent', steps: '1. Đồng ý CMP\n2. Kiểm tra log giá trị canRequestAds', expected: 'Trả về true', priority: 'High', sim: '❌ BẮT BUỘC máy thật' },
  { id: 'EEA-07', platform: 'iOS EEA', title: 'Ads hiển thị sau khi đồng ý', steps: '1. Vào các màn có quảng cáo', expected: 'Ads load và hiển thị bình thường', priority: 'Medium', sim: '⚠️ Test tạm được với test-ads, ads thật cần máy thật' },
  { id: 'EEA-08', platform: 'iOS EEA', title: 'gatherConsent không lỗi mạng', steps: '1. Theo dõi network log khi gọi API consent', expected: 'Không có lỗi DNS/timeout', priority: 'Medium', sim: '✅ Giả lập được' },
  { id: 'EEA-09', platform: 'iOS EEA', title: 'Reject All ở CMP', steps: '1. Reset app\n2. Ở CMP chọn "Reject All"', expected: 'canRequestAds phản ánh đúng (non-personalized), không crash', priority: 'High', sim: '❌ BẮT BUỘC máy thật' },
  { id: 'EEA-10', platform: 'iOS EEA', title: 'Manage options — tuỳ chỉnh chi tiết', steps: '1. Ở CMP chọn "Manage options"\n2. Bật/tắt từng mục rồi lưu', expected: 'Lựa chọn chi tiết được lưu đúng, canRequestAds phản ánh đúng', priority: 'Medium', sim: '❌ BẮT BUỘC máy thật' },
  { id: 'NEEA-01', platform: 'iOS non-EEA', title: 'CMP form KHÔNG hiện', steps: '1. Cài mới app trên máy thường (không hash)\n2. Mở app', expected: 'Không có CMP form xuất hiện', priority: 'High', sim: '✅ Giả lập được (Simulator mặc định = non-EEA)' },
  { id: 'NEEA-02', platform: 'iOS non-EEA', title: 'Ads vẫn hoạt động không qua CMP', steps: '1. Vào màn có quảng cáo', expected: 'Ads hiển thị bình thường', priority: 'Medium', sim: '✅ Giả lập được' },
  { id: 'NEEA-03', platform: 'iOS non-EEA', title: 'ATT prompt vẫn hiện', steps: '1. Mở app lần đầu', expected: 'ATT prompt hiện theo chuẩn Apple, độc lập vùng EEA', priority: 'High', sim: '✅ Giả lập được' },
  { id: 'NEEA-04', platform: 'iOS non-EEA', title: 'Deny ATT ở non-EEA', steps: '1. Chọn Deny ở ATT prompt', expected: 'Không crash, ads vẫn serve non-personalized', priority: 'Medium', sim: '✅ Giả lập được' },
  { id: 'AND-EEA-01', platform: 'Android EEA', title: 'CMP form hiện đúng ở EEA (Android)', steps: '1. Cài mới app trên thiết bị/emulator giả EEA\n2. Mở app', expected: 'CMP form xuất hiện', priority: 'High', sim: '❌ BẮT BUỘC máy thật (Emulator không có Advertising ID thật)' },
  { id: 'AND-EEA-02', platform: 'Android EEA', title: 'Consent lưu lại (Android)', steps: '1. Đồng ý CMP\n2. Mở lại app', expected: 'Không hiện lại form', priority: 'Medium', sim: '❌ BẮT BUỘC máy thật' },
  { id: 'AND-NEEA-01', platform: 'Android non-EEA', title: 'CMP không hiện ở non-EEA (Android)', steps: '1. Mở app trên thiết bị non-EEA', expected: 'Không có CMP form, ads vẫn hoạt động', priority: 'Medium', sim: '✅ Giả lập được (Emulator mặc định)' },
  { id: 'EDGE-01', platform: 'Cạnh biên', title: 'Reset app — luồng consent chạy lại đúng', steps: '1. Gỡ app\n2. Cài lại, mở app', expected: 'Luồng CMP/ATT chạy lại từ đầu, đúng theo vùng hiện tại', priority: 'Medium', sim: '⚠️ Test được luồng trên Simulator, xác nhận đúng vùng cần máy thật' },
  { id: 'EDGE-02', platform: 'Cạnh biên', title: 'Mất mạng khi mở app', steps: '1. Tắt mạng\n2. Mở app lần đầu', expected: 'gatherConsent xử lý gracefully, app không crash/treo', priority: 'High', sim: '✅ Giả lập được' },
  { id: 'EDGE-03', platform: 'Cạnh biên', title: 'Có mạng lại sau khi mất mạng', steps: '1. Tiếp EDGE-02, bật lại mạng\n2. Thử lại thao tác consent', expected: 'Flow tự phục hồi, hoàn tất được consent', priority: 'Medium', sim: '✅ Giả lập được' },
  { id: 'EDGE-04', platform: 'Cạnh biên', title: 'Update app từ bản cũ không có CMP', steps: '1. Cài bản cũ (không có CMP)\n2. Update lên bản mới\n3. Mở app', expected: 'CMP hiện đúng theo vùng (không bỏ sót người dùng cũ)', priority: 'Medium', sim: '❌ BẮT BUỘC máy thật (cần xác nhận đúng vùng thật)' },
  { id: 'EDGE-05', platform: 'Cạnh biên', title: 'notDetermined ATT (không chọn gì)', steps: '1. Ở ATT prompt, đưa app xuống background mà không chọn', expected: 'attStatus=notDetermined không gây crash/lỗi log', priority: 'Low', sim: '✅ Giả lập được' },
];

test.describe('[UTD-958] Export báo cáo Excel — Checklist + Test case CMP/Consent/ATT', () => {
  test('Xuất REPORT_UTD958_CMP_Consent_ATT.xlsx', async () => {
    const summarySheet: ExcelSheetSpec = {
      name: 'KẾT QUẢ TỔNG QUAN',
      columns: [
        { header: 'Mục', key: 'field', width: 30 },
        { header: 'Nội dung', key: 'value', width: 95 },
      ],
      rows: [
        { field: '📋 TASK', value: 'UTD-958 [App][New Arch] CMP / Consent / ATT (Android – iOS)' },
        { field: '🎯 Mục tiêu', value: 'Luồng đồng ý GDPR (CMP) + ATT đúng, không chặn ads sai' },
        { field: '⚙️ Điều kiện tiên quyết', value: 'Máy iOS đăng ký test-device (device hash) để ép EEA; KHÔNG dùng VPN (phá DNS)' },
        { field: '📊 Độ bao phủ checklist', value: `${CHECKLIST_958.length} hạng mục` },
        { field: '📊 Độ bao phủ test case', value: `${TESTCASES_958.length} test case (EEA, non-EEA, Android, cạnh biên)` },
        { field: '✅ Tiêu chí đạt', value: 'EEA hiện form & lưu consent; non-EEA vẫn có ads; ATT deny không crash; canRequestAds chính xác' },
        { field: '❌ BẮT BUỘC máy thật (phần EEA/CMP)', value: 'Simulator/Emulator KHÔNG có UDID/Advertising ID thật nên không đăng ký được test-device hash với Apple/Google → không ép được vùng EEA đáng tin cậy. Toàn bộ case liên quan CMP form hiện đúng ở EEA, lưu consent, canRequestAds sau EEA đều cần máy thật.' },
        { field: '✅ Giả lập được (ATT cơ bản + non-EEA)', value: 'ATT là API hệ thống nên Simulator/Emulator vẫn chạy được (Allow/Deny/notDetermined). Luồng non-EEA (CMP không hiện, ads vẫn chạy) cũng test được vì Simulator mặc định coi như ngoài EEA.' },
        { field: '📝 Trạng thái', value: 'Chưa test — cần QA thực hiện trên thiết bị thật (đã đăng ký test-device hash), tick kết quả vào sheet Checklist/Test case' },
      ],
      wrapText: true,
    };

    const checklistSheet: ExcelSheetSpec = {
      name: 'Checklist',
      columns: [
        { header: 'STT', key: 'stt', width: 6 },
        { header: 'Nhóm', key: 'platform', width: 16 },
        { header: 'Khu vực', key: 'area', width: 14 },
        { header: 'Hạng mục kiểm tra', key: 'item', width: 60 },
        { header: 'Ghi chú', key: 'note', width: 35 },
        { header: 'Giả lập được?', key: 'sim', width: 45 },
        { header: 'Kết quả (Pass/Fail/N-A)', key: 'result', width: 22 },
      ],
      rows: CHECKLIST_958.map((c, i) => ({ stt: i + 1, ...c, result: '' })),
      wrapText: true,
    };

    const testCaseSheet: ExcelSheetSpec = {
      name: 'Test case',
      columns: [
        { header: 'TC ID', key: 'id', width: 12 },
        { header: 'Nhóm', key: 'platform', width: 14 },
        { header: 'Tên test case', key: 'title', width: 40 },
        { header: 'Các bước thực hiện', key: 'steps', width: 45 },
        { header: 'Kết quả mong đợi', key: 'expected', width: 45 },
        { header: 'Độ ưu tiên', key: 'priority', width: 12 },
        { header: 'Giả lập được?', key: 'sim', width: 45 },
        { header: 'Kết quả thực tế', key: 'actual', width: 30 },
        { header: 'Pass/Fail', key: 'status', width: 12 },
      ],
      rows: TESTCASES_958.map((t) => ({ ...t, actual: '', status: '' })),
      wrapText: true,
    };

    await saveExcelForSeason(SEASON_DIR, SLUG, 'REPORT_UTD958_CMP_Consent_ATT.xlsx', [
      summarySheet,
      checklistSheet,
      testCaseSheet,
    ]);
  });
});
