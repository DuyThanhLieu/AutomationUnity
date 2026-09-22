/**
 * Xuất file Excel test case cho TASK US-4064 [API][Football][Match Detail -
 * Datalytics] Bổ sung dữ liệu.
 *
 * Phạm vi (3 yêu cầu chính từ mô tả US-4064):
 *   1. Bổ sung phần trăm sau mỗi team ở block "Đội ghi bàn trước".
 *   2. Kiểm tra lại công thức tính ở dòng nhận định cho 2 block Bàn thắng /
 *      Thủng lưới.
 *   3. Kiểm tra lại công thức làm tròn ở các dòng Average — theo mục 16
 *      (Handle data) của story cha US-3585, vì US-4064 chỉ ghi "đọc mục 16
 *      của story" mà không nhắc lại nội dung.
 *
 * NGUỒN THAM CHIẾU:
 *   - US-4064 (mục 1, 2): https://unitysportcorp79.atlassian.net/browse/US-4064
 *   - US-3585 mục 16 "Handle data" (16.1 giá trị âm, 16.2 công thức làm
 *     tròn & format): https://unitysportcorp79.atlassian.net/browse/US-3585
 *
 * ❗ [CẦN BA XÁC NHẬN — KHÔNG PHẢI BUG CODE] Đã verify bằng automation trên 4
 * trận thật (03/09/2026, xem 01-datalytics-api-formulas.spec.ts và OQ-01):
 * code đang chạy ĐÚNG CHÍNH XÁC như spec/design US-4064 mục 2 ghi —
 * (max-min)/home_conceded_per_match, chia cho số liệu ĐỘI HOME cụ thể. Đây
 * KHÔNG phải lỗi đánh máy hay lỗi code như 2 lần kết luận trước đó (đã rút
 * lại cả 2). Vấn đề nằm ở CHÍNH THIẾT KẾ công thức: ảnh ví dụ trong spec
 * chọn đúng trường hợp home=đội thủng lưới NHIỀU hơn (max), nên /home và
 * /max cho cùng 1 kết quả — ví dụ không đủ để lộ ra rằng khi home là đội
 * PHÒNG NGỰ TỐT hơn (home=min, xem case Palermo vs Mantova), % nhận định sẽ
 * đổi hẳn nếu 2 đội đổi sân cho nhau dù phong độ không đổi. Cần BA xác nhận
 * đây có phải hành vi MONG MUỐN (cố ý ưu tiên sân nhà) hay chưa lường tới.
 * Xem chi tiết đầy đủ: results/BUG_US4064_ThungLuoi_CongThuc_HomeAway.md
 * và case DLY-13, DLY-14, DLY-14B.
 *
 * KHÔNG phải test verify — chỉ generate tài liệu Excel từ danh sách case đã
 * soạn theo 3 yêu cầu trên. Dùng để QA test tay khi feature deploy lên
 * staging.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-4064-datalytics-data/00-export-test-cases.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-4064-datalytics-data';

type TestCaseRow = {
  id: string;
  category: string;
  title: string;
  precondition: string;
  steps: string;
  expected: string;
  priority: 'High' | 'Medium' | 'Low';
};

const TEST_CASES: TestCaseRow[] = [
  // ==== YÊU CẦU 1: Bổ sung % sau mỗi team ở "Đội ghi bàn trước" ====
  {
    id: 'DLY-01',
    category: '1. Đội ghi bàn trước — % cơ bản',
    title: 'Hiển thị đúng % ngay sau mỗi team ở block "Đội ghi bàn trước"',
    precondition: 'Match Detail → Datalytics → Table View → Page "Bàn thắng" → Section "Đội ghi bàn trước". Đội A ghi bàn trước 6/10 trận gần nhất',
    steps: '1. Mở block "Đội ghi bàn trước"\n2. Quan sát số liệu hiển thị cạnh tên đội A',
    expected: 'Hiển thị đúng công thức x = 6/10 * 100% = 60%, làm tròn số nguyên, không hiện thập phân (theo mẫu trong US-4064 mục 1 và US-3585 mục 9)',
    priority: 'High',
  },
  {
    id: 'DLY-02',
    category: '1. Đội ghi bàn trước — % cơ bản',
    title: '% hiển thị đồng thời cho CẢ HAI đội, không chỉ đội có tỉ lệ cao hơn',
    precondition: 'Đội A ghi bàn trước 6/10 trận, Đội B ghi bàn trước 3/10 trận (10 trận khác nhau của mỗi đội)',
    steps: '1. Mở block "Đội ghi bàn trước"\n2. Kiểm tra số % cạnh cả 2 tên đội',
    expected: 'Đội A hiển thị 60%, Đội B hiển thị 30% — cả 2 team đều có %, tính độc lập theo 10 trận gần nhất của chính đội đó',
    priority: 'High',
  },
  {
    id: 'DLY-03',
    category: '1. Đội ghi bàn trước — % cơ bản',
    title: 'Đồng bộ % giữa Table View và Chart View (US-3585 mục 4.1)',
    precondition: 'Đã xem % ở Table View cho 1 cặp đội cụ thể',
    steps: '1. Ghi nhận % ở Table View → Bàn thắng → Đội ghi bàn trước\n2. Chuyển sang Chart View → Section "Đội ghi bàn trước"\n3. So sánh 2 giá trị %',
    expected: '% khớp tuyệt đối giữa 2 view — vì mục 4.1 nói rõ block chart view "Lấy từ bên table view qua (có bổ sung phần trăm)"',
    priority: 'High',
  },
  {
    id: 'DLY-04',
    category: '1. Đội ghi bàn trước — Làm tròn',
    title: 'Làm tròn % khi kết quả không chia hết (áp dụng rule .5 → làm tròn lên)',
    precondition: 'Đội ghi bàn trước 7/10 trận trong tập dữ liệu có mẫu số khác 10 (vd 3/7 trận)',
    steps: '1. Tính tay x = 3/7*100% = 42.857...%\n2. Đối chiếu số hiển thị trên UI',
    expected: 'UI hiển thị 43% (làm tròn số nguyên gần nhất theo rule chung mục 16.2), không hiển thị 42% hay 42.857%',
    priority: 'High',
  },
  {
    id: 'DLY-05',
    category: '1. Đội ghi bàn trước — Case biên',
    title: 'Case biên: đội chưa ghi bàn trước trận nào trong 10 trận gần nhất (0%)',
    precondition: 'Đội C có 0/10 trận ghi bàn trước',
    steps: '1. Mở block "Đội ghi bàn trước" của đội C',
    expected: 'Hiển thị 0%, KHÔNG hiển thị "N/A" hay để trống — phân biệt với case "không đủ dữ liệu" (xem DLY-06)',
    priority: 'Medium',
  },
  
  {
    id: 'DLY-06',
    category: '1. Đội ghi bàn trước — Case biên',
    title: 'Case biên: đội mới lên hạng/chưa đủ 10 trận gần nhất',
    precondition: 'Đội D mới thi đấu 4 trận trong giải/mùa hiện tại (không đủ 10 trận)',
    steps: '1. Mở block "Đội ghi bàn trước" của đội D',
    expected: '[CẦN CONFIRM] % được tính trên số trận thực tế có (vd x/4) hay hiển thị N/A vì không đủ mẫu 10 trận theo đúng định nghĩa tooltip ("dựa trên 10 trận gần nhất")? Xem câu hỏi mở OQ-02',
    priority: 'Medium',
  },
  {
    id: 'DLY-07',
    category: '1. Đội ghi bàn trước — Tooltip',
    title: 'Tooltip block "Đội ghi bàn trước" hiển thị đúng nội dung đã định nghĩa (US-3585 mục 4.1, 15)',
    precondition: 'Đang xem block "Đội ghi bàn trước" ở Chart View',
    steps: '1. Bấm/hover icon tooltip của block',
    expected: 'Title: "Đội Ghi Bàn Trước". Body: "Tỷ lệ đội ghi bàn thắng đầu tiên trong trận, dựa trên 10 trận gần nhất của mỗi đội." CTA: "Đã hiểu"',
    priority: 'Low',
  },
  {
    id: 'DLY-08',
    category: '1. Đội ghi bàn trước — Đa ngôn ngữ',
    title: '% và tooltip dịch đúng khi đổi ngôn ngữ EN',
    precondition: 'Đổi ngôn ngữ hệ thống sang English',
    steps: '1. Mở block "Đội ghi bàn trước"\n2. Kiểm tra label và tooltip',
    expected: 'Tooltip EN: "Percentage of matches where the team scored the first goal, based on the last 10 matches of each team." / CTA "Got it" — % không đổi format theo ngôn ngữ (vẫn dạng số nguyên có dấu %)',
    priority: 'Low',
  },
  {
    id: 'DLY-09',
    category: '1. Đội ghi bàn trước — API',
    title: 'API trả sẵn field %/tỉ lệ hoặc FE tự tính từ dữ liệu thô',
    precondition: 'Có quyền xem network request của Match Detail Datalytics',
    steps: '1. Mở DevTools Network\n2. Tải lại block "Đội ghi bàn trước"\n3. Xem response API tương ứng',
    expected: '[CẦN CONFIRM] Xác định API đã trả sẵn field % (vd scored_first_percentage) hay chỉ trả số liệu thô (6, 10) và FE tự tính — ảnh hưởng cách viết test tự động (so field trực tiếp hay so công thức)',
    priority: 'Medium',
  },

  // ==== YÊU CẦU 2: Công thức dòng nhận định — Bàn thắng & Thủng lưới ====
  {
    id: 'DLY-10',
    category: '2. Công thức nhận định — Bàn thắng',
    title: 'Công thức Bàn thắng: (max-min)/min, làm tròn số nguyên',
    precondition: 'Đội X trung bình 2.33 bàn/trận, Đội Y trung bình 1.67 bàn/trận (Y = min)',
    steps: '1. Tính tay x = (2.33-1.67)/1.67 = 39.5...% ≈ 40%\n2. Đối chiếu dòng nhận định hiển thị trên UI',
    expected: 'Hiển thị đúng: "[Short Name đội X] có 40% tốt hơn về mặt trung bình số bàn thắng" — khớp ví dụ mẫu trong US-4064/US-3585 mục 9 (x = (2.33-1.67)/1.67 = 40%)',
    priority: 'High',
  },
  {
    id: 'DLY-11',
    category: '2. Công thức nhận định — Bàn thắng',
    title: 'Bàn thắng: đội có trung bình CAO hơn được nêu tên trong câu nhận định',
    precondition: 'Đội X (2.33 bàn/trận) > Đội Y (1.67 bàn/trận)',
    steps: '1. Đọc câu nhận định hiển thị',
    expected: 'Câu nhận định nêu tên đội X (đội có số bàn thắng trung bình cao hơn) là đội "tốt hơn x%", không nêu tên đội Y',
    priority: 'High',
  },
  {
    id: 'DLY-12',
    category: '2. Công thức nhận định — Bàn thắng',
    title: 'Bàn thắng: 2 đội bằng nhau → câu nhận định trung lập',
    precondition: 'Đội X và Đội Y có cùng trung bình bàn thắng/trận (vd cả 2 đều 1.80)',
    steps: '1. Đọc câu nhận định hiển thị khi 2 đội bằng nhau',
    expected: 'Hiển thị đúng câu cố định: "Cả hai đội ngang nhau về mặt trung bình số bàn thắng" — KHÔNG chia cho 0 (vì min=max, mẫu số min ≠ 0 nên không lỗi toán học, nhưng kết quả x=0% nên phải override bằng câu trung lập thay vì hiện "0%")',
    priority: 'High',
  },
  {
    id: 'DLY-13',
    category: '2. Công thức nhận định — Thủng lưới',
    title: 'Công thức Thủng lưới (max-min)/home — verify khớp đúng spec/design khi HOME là đội thủng lưới NHIỀU hơn (=max)',
    precondition:
      'Đã verify bằng automation trên 4 trận thật (03/09/2026, xem 01-datalytics-api-formulas.spec.ts): công thức who_will_concede_goals.better_percentage khớp đúng (max-min)/home_conceded_per_match như spec US-4064 mục 2 ghi. Case này dùng đúng ví dụ trong spec/design: Home=1.0 bàn/trận (=max), Away=0.5 bàn/trận (=min)',
    steps: '1. Tính (max-min)/home = (1-0.5)/1 = 50%\n2. Đối chiếu dòng nhận định hiển thị trên UI',
    expected:
      'Hiển thị "[Short Name đội Away] vượt trội hơn 50% về số bàn thua trung bình" — khớp đúng ví dụ mẫu trong spec/design US-4064 mục 2. LƯU Ý: ở case này home=max nên /home và /max cho cùng kết quả — case này KHÔNG đủ để phân biệt xem công thức có đúng ý đồ thiết kế hay không khi home là đội YẾU hơn (xem DLY-14)',
    priority: 'High',
  },
  {
    id: 'DLY-14',
    category: '2. Công thức nhận định — Thủng lưới',
    title: '❗ [CẦN BA XÁC NHẬN] Case HOME là đội MIN (phòng ngự tốt hơn) — % nhận định phụ thuộc vào ai đá sân nhà',
    precondition:
      'Đảo ngược DLY-13: HOME=0.8 bàn/trận (=min, phòng ngự tốt hơn), AWAY=1.3 bàn/trận (=max, phòng ngự kém hơn). Đây chính là case thật đã verify trên trận Palermo (home) vs Mantova (away) staging 03/09/2026',
    steps:
      '1. Tính (max-min)/home = (1.3-0.8)/0.8 = 62.5% → làm tròn 63%\n2. Tính (max-min)/max = (1.3-0.8)/1.3 = 38.46% → làm tròn 38%\n3. Đối chiếu % thực tế trên UI/API',
    expected:
      'API thực tế trả về 63% — KHỚP ĐÚNG spec/design (công thức /home), không phải lỗi code. Ghi nhận để báo BA: đây là case mà /home cho kết quả khác hẳn /max (63% vs 38%) — ảnh design gốc chỉ minh hoạ case home=max nên chưa lộ ra khác biệt này. QA KHÔNG tự kết luận đúng/sai — pass test này nghĩa là code khớp spec, cần đánh dấu case DLY-14B để BA xác nhận ý đồ thiết kế',
    priority: 'High',
  },
  {
    id: 'DLY-14B',
    category: '2. Công thức nhận định — Thủng lưới',
    title: '❗ [CẦN BA XÁC NHẬN] Đảo vai trò Home/Away của CÙNG 1 cặp đội — % nhận định có được PHÉP đổi theo sân nhà/sân khách không?',
    precondition: 'Cùng 1 cặp đội X (thủng lưới 0.8/trận) và Y (thủng lưới 1.3/trận). Test 2 kịch bản: (a) X là Home, Y là Away; (b) Y là Home, X là Away (hoán đổi sân, vd trận lượt về)',
    steps:
      '1. Kịch bản (a): X=Home=0.8, Y=Away=1.3 → tính theo /home: (1.3-0.8)/0.8=63%\n2. Kịch bản (b): Y=Home=1.3, X=Away=0.8 → tính theo /home: (1.3-0.8)/1.3=38%\n3. So sánh 2 kết quả %, xác nhận với BA đây có phải hành vi mong muốn',
    expected:
      '[CẦN BA XÁC NHẬN — không phải bug code, code đang khớp đúng spec] Với công thức /home hiện tại, % vượt trội của X so với Y sẽ KHÁC NHAU giữa 2 kịch bản (63% vs 38%) dù chênh lệch phong độ giữa X và Y không đổi khi đổi sân. Cần BA xác nhận: đây có phải chủ đích thiết kế (ưu tiên góc nhìn đội sân nhà) hay là điểm chưa lường tới khi vẽ ví dụ minh hoạ (ví dụ gốc chọn đúng case home=max nên không lộ ra sự phụ thuộc này). Nếu BA xác nhận là chưa lường tới, đề xuất đổi mẫu số sang /max để công thức đối xứng, nhất quán với block Bàn thắng (đang dùng /min, đã verify không phụ thuộc home/away ở cả 4 trận)',
    priority: 'High',
  },
  {
    id: 'DLY-15',
    category: '2. Công thức nhận định — Thủng lưới',
    title: 'Thủng lưới: đội có trung bình THẤP hơn (phòng ngự tốt hơn) được nêu tên "vượt trội"',
    precondition: 'Đội A thủng lưới 1.0 bàn/trận, Đội B thủng lưới 0.5 bàn/trận',
    steps: '1. Đọc câu nhận định hiển thị',
    expected: 'Câu nhận định nêu tên đội B (thủng lưới ÍT hơn = phòng ngự tốt hơn) là đội "vượt trội x%", ngược chiều so với Bàn thắng (ở Bàn thắng, đội có số liệu CAO hơn được khen)',
    priority: 'High',
  },
  {
    id: 'DLY-16',
    category: '2. Công thức nhận định — Thủng lưới',
    title: 'Thủng lưới: 2 đội bằng nhau → câu nhận định trung lập',
    precondition: 'Đội A và Đội B có cùng trung bình thủng lưới/trận',
    steps: '1. Đọc câu nhận định khi 2 đội bằng nhau',
    expected: 'Hiển thị đúng: "Cả hai đội ngang nhau về số bàn thua trung bình." — không chia cho 0, không hiện "0%"',
    priority: 'High',
  },
  {
    id: 'DLY-17',
    category: '2. Công thức nhận định — Case biên chung',
    title: '⚠️ Case biên toán học: 1 trong 2 đội có trung bình = 0 (mẫu số min = 0 ở block Bàn thắng)',
    precondition: 'Đội Y có trung bình bàn thắng/trận = 0 (chưa ghi bàn trận nào trong tập dữ liệu tính trung bình)',
    steps: '1. Áp công thức Bàn thắng (max-min)/min với min=0\n2. Quan sát UI thực tế',
    expected: '[CẦN CONFIRM] (max-0)/0 là phép chia cho 0 — không xác định. UI phải xử lý case này (vd hiển thị "N/A" theo rule mục 16.1 giá trị âm/không hợp lệ, hoặc câu nhận định đặc biệt), KHÔNG được crash hoặc hiển thị Infinity/NaN. Xem câu hỏi mở OQ-03',
    priority: 'High',
  },
  {
    id: 'DLY-18',
    category: '2. Công thức nhận định — Case biên chung',
    title: 'Case biên toán học: mẫu số max = 0 ở block Thủng lưới (cả 2 đội đều chưa thủng lưới)',
    precondition: 'Đội A và Đội B đều có trung bình thủng lưới/trận = 0',
    steps: '1. Áp công thức Thủng lưới (max-min)/max với max=0\n2. Quan sát UI thực tế',
    expected: 'max=min=0 nên rơi vào case "2 đội bằng nhau" (DLY-16) trước khi tính chia — câu nhận định phải là "Cả hai đội ngang nhau về số bàn thua trung bình.", không được tính (0-0)/0',
    priority: 'Medium',
  },
  {
    id: 'DLY-19',
    category: '2. Công thức nhận định — UI/Layout',
    title: 'Bàn thắng và Thủng lưới gộp thành 1 Block riêng biệt, có Collapse/Expand (US-3585 mục 9)',
    precondition: 'Table view → Page "Bàn thắng"',
    steps: '1. Quan sát cấu trúc Section "Ghi bàn" và "Thủng lưới"\n2. Thử Collapse/Expand từng block',
    expected: 'Bàn thắng là 1 block riêng, Thủng lưới là 1 block riêng, mỗi block có icon Collapse/Expand hoạt động độc lập. Ads được chuyển xuống dưới Block "Bàn thắng"',
    priority: 'Low',
  },
  {
    id: 'DLY-20',
    category: '2. Công thức nhận định — Đa ngôn ngữ',
    title: 'Câu nhận định dịch đúng 31 ngôn ngữ (US-3585 mục 15)',
    precondition: 'Đổi ngôn ngữ hệ thống sang English',
    steps: '1. Đọc câu nhận định Bàn thắng và Thủng lưới bằng tiếng Anh',
    expected: 'Bàn thắng: "[Team] is 40% better in terms of Goals Scored" / hòa: "Both Teams are equal in terms of Goals Scored". Thủng lưới: "[Team] is 50% better in terms of Goals Conceded" / hòa: "Both Teams are equal in terms of Goals Conceded"',
    priority: 'Low',
  },

  // ==== YÊU CẦU 3: Công thức làm tròn ở các dòng Average (US-3585 mục 16.2) ====
  {
    id: 'DLY-21',
    category: '3. Làm tròn Average — Rule chung',
    title: 'Rule làm tròn .5 → luôn làm tròn LÊN (không theo chuẩn ngân hàng/round-half-even)',
    precondition: 'Một dòng Average bất kỳ cho kết quả thập phân đúng .5 ở vị trí làm tròn (vd 25.5 → phần trăm nguyên)',
    steps: '1. Tạo/tìm dữ liệu cho kết quả 25.5%\n2. Đối chiếu số hiển thị',
    expected: 'Hiển thị 26%, không phải 25% — đúng ví dụ mẫu mục 16.2 ("Ở làm tròn gần nhất, nếu phần thập phân là .5 sẽ được làm tròn lên. VD: 25.5 → 26")',
    priority: 'High',
  },
  {
    id: 'DLY-22',
    category: '3. Làm tròn Average — Số thập phân',
    title: 'Field dạng số thập phân làm tròn đúng 2 chữ số (vd Cú sút/trận, Việt vị/trận)',
    precondition: 'Field "Cú sút/trận" có giá trị thô 4.3149',
    steps: '1. Đối chiếu số hiển thị trên UI',
    expected: 'Hiển thị "4.31" — đúng 2 chữ số thập phân, không làm tròn 1 chữ số hay giữ nguyên số thô',
    priority: 'High',
  },
  {
    id: 'DLY-23',
    category: '3. Làm tròn Average — Số thập phân → số nguyên',
    title: 'Nếu cộng 2 giá trị thập phân ra đúng số nguyên thì hiển thị số nguyên, KHÔNG hiện ".00"',
    precondition: 'Bàn/Trận Home = 1.25, Bàn/Trận Away = 1.75 → Trung bình = (1.25+1.75)/2 = 3 (chẵn tuyệt đối)',
    steps: '1. Đối chiếu dòng "Bàn/Trận" tổng quan',
    expected: 'Hiển thị "3", KHÔNG hiển thị "3.00" — đúng ví dụ mục 16.2 ("Nếu cộng lại ra số nguyên (1.25 + 1.75 = 3) thì show là 3, không phải 3.00")',
    priority: 'High',
  },
  {
    id: 'DLY-24',
    category: '3. Làm tròn Average — Trung bình tổng quát',
    title: 'Công thức Trung bình chung = (Home + Away)/2 áp dụng đúng cho mọi field Average',
    precondition: 'Field bất kỳ có breakdown Home/Away (vd Góc trung bình: Home=5.2, Away=4.8)',
    steps: '1. Tính tay (5.2+4.8)/2 = 5.0\n2. Đối chiếu dòng Trung bình hiển thị',
    expected: 'Hiển thị đúng 5 (số nguyên, vì không có phần thập phân dư) — verify công thức Trung bình = (Home+Away)/2 áp dụng nhất quán, không phải trung bình cộng theo số trận thực tế của mỗi đội (có thể khác nhau)',
    priority: 'High',
  },
  {
    id: 'DLY-25',
    category: '3. Làm tròn Average — Ngoại lệ cộng dồn (Góc, Thẻ)',
    title: 'Field "Góc" và "Thẻ" ở block Tổng quan dùng công thức CỘNG, không phải trung bình cộng/2',
    precondition: 'Góc của Home = 5.2, Góc của Away = 4.8',
    steps: '1. Đối chiếu dòng "Góc" ở block Tổng quan',
    expected: 'Hiển thị 10 (= 5.2+4.8, làm tròn), KHÔNG phải 5 (= (5.2+4.8)/2) — theo đúng mục 16.2: "Góc = Góc của Home + Góc của Away", "Thẻ = Thẻ của Home + Thẻ của Away" (khác công thức Bàn/Trận dùng chia 2)',
    priority: 'High',
  },
  {
    id: 'DLY-26',
    category: '3. Làm tròn Average — Phần trăm',
    title: 'Field dạng %  làm tròn số nguyên, không hiện thập phân (Trên 2.5, Trên 1.5, BTTS...)',
    precondition: 'Field "Trên 2.5" có giá trị thô 84.6%',
    steps: '1. Đối chiếu số hiển thị',
    expected: 'Hiển thị "85%", không hiển thị "84.6%" hay "85.0%"',
    priority: 'High',
  },
  {
    id: 'DLY-27',
    category: '3. Làm tròn Average — Block Cú sút',
    title: 'Block Cú sút: phân loại đúng field nào 2 chữ số thập phân, field nào % nguyên',
    precondition: 'Đã có dữ liệu đủ 9 field của block Cú Sút Thực Hiện (mục 16.2)',
    steps: '1. Đối chiếu format của: Cú sút/trận, Cú sút trúng đích/trận, Cú sút không trúng đích/trận, Cú sút mỗi bàn thắng (nhóm A)\n2. Đối chiếu format của: Tỉ lệ chuyển đổi cú sút, Cú sút đội trên 11.5~15.5, Sút trúng đích trên 3.5~6.5 (nhóm B)',
    expected: 'Nhóm A hiển thị 2 chữ số thập phân (vd 4.31). Nhóm B hiển thị % số nguyên (vd 85%) — không lẫn lộn 2 nhóm',
    priority: 'Medium',
  },
  {
    id: 'DLY-28',
    category: '3. Làm tròn Average — Threshold hiển thị lệch số liệu (⚠️ nghi vấn)',
    title: '⚠️ Verify threshold hiển thị "Tổng sút phạt 20.5+" nhưng field data ghi "25.5+"',
    precondition: 'Mở block "Đá Phạt, Phát Bóng & Ném Biên"',
    steps: '1. Đối chiếu tên field trong bảng mục 16.2 ("Tổng sút phạt 20.5+") với số thực tế hiển thị trên UI mẫu ("→ 25.5+")\n2. Tương tự cho "Tổng phát bóng 8.5+ → 13.5+" và "Tổng ném biên 37.5+ → 44.5+"',
    expected: '[CẦN CONFIRM] Đây có phải lỗi đánh máy trong spec (số liệu ví dụ minh hoạ khác tên field chuẩn), hay UI thực tế ĐÃ đổi ngưỡng threshold so với tên field gốc? Cần QA đối chiếu trực tiếp UI thật + báo dev làm rõ trước khi chốt case PASS/FAIL. Xem câu hỏi mở OQ-04',
    priority: 'Medium',
  },
  {
    id: 'DLY-29',
    category: '3. Làm tròn Average — Threshold hiển thị lệch số liệu (⚠️ nghi vấn)',
    title: '⚠️ Verify threshold "Trên 0.5" (Trên/Dưới Bàn Thắng) hiển thị thực tế "→ 4.5"',
    precondition: 'Mở block "Trên/Dưới Bàn Thắng"',
    steps: '1. Đối chiếu tên field "Trên 0.5" / "1H trên 0.5" / "2H trên 0.5" trong mục 16.2 với số hiển thị thực tế trên UI ("→ 4.5" / "→ 2.5" / "→ 2.5")',
    expected: '[CẦN CONFIRM] Cùng bản chất nghi vấn với DLY-28 — verify đây là lỗi liệt kê tên field trong tài liệu hay UI thật sự đổi threshold. Không tự suy đoán, cần xác nhận dev/BA',
    priority: 'Medium',
  },
  {
    id: 'DLY-30',
    category: '3. Làm tròn Average — Block Tổng phạt góc',
    title: 'Block Tổng phạt góc: phân biệt đúng format giữa "Cả trận" (% nguyên) và "Hiệp 1st/2nd" (thập phân 2 chữ số + % nguyên)',
    precondition: 'Đã có dữ liệu đủ field mục 16.2 phần Tổng phạt góc',
    steps: '1. Đối chiếu "Trên 6 → 13" (cả trận) — kỳ vọng % nguyên\n2. Đối chiếu "1H trung bình", "2H trung bình" — kỳ vọng 2 chữ số thập phân\n3. Đối chiếu "Trên 4 1H" ~ "Trên 6 2H" — kỳ vọng % nguyên',
    expected: 'Đúng phân loại theo mục 16.2, không lẫn lộn giữa 2 subsection Cả trận / Hiệp 1st-2nd', 
    priority: 'Medium',
  },
  {
    id: 'DLY-31',
    category: '3. Làm tròn Average — Block Tổng thẻ',
    title: 'Block Tổng thẻ: "Trên 2.5 → 6.5" (Tổng thẻ) là % nguyên, "Thẻ trung bình" (Thẻ đội) là thập phân 2 chữ số',
    precondition: 'Đã có dữ liệu đủ field mục 16.2 phần Tổng thẻ',
    steps: '1. Đối chiếu format "Trên 2.5" đến "Trên 6.5" (subsection Tổng thẻ)\n2. Đối chiếu format "Thẻ trung bình" và "Trên 0.5 → 3.5 thẻ nhận/thẻ đối thủ" (subsection Thẻ đội)',
    expected: 'Tổng thẻ: % nguyên. Thẻ đội: "Thẻ trung bình" 2 chữ số thập phân, còn lại % nguyên — đúng phân loại mục 16.2',
    priority: 'Medium',
  },
  {
    id: 'DLY-32',
    category: '3. Làm tròn Average — Block Thẻ Hiệp 1st/2nd',
    title: 'Block Thẻ Hiệp 1st/2nd: 4 field trung bình (thập phân 2 chữ số) tách biệt 6 field % (nguyên)',
    precondition: 'Đã có dữ liệu đủ field mục 16.2 phần Thẻ Hiệp 1st/2nd',
    steps: '1. Đối chiếu "Thẻ hiệp 1 trung bình", "Thẻ hiệp 2 trung bình", "Tổng thẻ trung bình hiệp 1", "Tổng thẻ trung bình hiệp 2" — kỳ vọng 2 chữ số thập phân\n2. Đối chiếu "1H dưới 2", "2H dưới 2", "1H từ 2-3 tổng thẻ", "2H từ 2-3 tổng thẻ", "1H trên 3", "2H trên 3" — kỳ vọng % nguyên',
    expected: 'Đúng phân loại theo mục 16.2, không đảo ngược 2 nhóm field',
    priority: 'Medium',
  },
  {
    id: 'DLY-33',
    category: '3. Làm tròn Average — Giá trị âm (mục 16.1, liên quan Average)',
    title: 'Field Average cho giá trị âm (dữ liệu lỗi/thiếu) → xử lý đúng theo View',
    precondition: 'Một field Average bất kỳ trong tab Datalytics (kể cả field tự tính) trả về giá trị âm từ nguồn dữ liệu',
    steps: '1. Xem field đó ở Table View\n2. Xem field tương ứng ở Chart View',
    expected: 'Table View hiển thị "N/A". Chart View đưa về giá trị 0 — áp dụng cho MỌI field thuộc tab Datalytics, kể cả field do FE tự tính (không chỉ field API trả trực tiếp)',
    priority: 'High',
  },
  {
    id: 'DLY-34',
    category: '3. Làm tròn Average — Case biên số liệu',
    title: 'Case biên: Average tính ra số 0 hợp lệ (không phải thiếu dữ liệu) vẫn hiển thị "0", không phải "N/A"',
    precondition: 'Đội chưa từng có phạt góc nào trong tập dữ liệu (Góc trung bình = 0, là giá trị hợp lệ không âm)',
    steps: '1. Đối chiếu field "Góc" hiển thị',
    expected: 'Hiển thị "0" — phân biệt rõ với case giá trị ÂM (DLY-33 → N/A/0), 0 hợp lệ không bị coi là lỗi',
    priority: 'Medium',
  },
  {
    id: 'DLY-35',
    category: '3. Làm tròn Average — Regression',
    title: 'Regression: các field không thuộc danh sách mục 16.2 KHÔNG bị đổi format ngoài ý muốn',
    precondition: 'Trước khi US-4064 deploy, đã ghi lại format hiển thị của các field KHÔNG nằm trong bảng mục 16.2 (vd field ở tab khác ngoài Datalytics)',
    steps: '1. So sánh format các field ngoài phạm vi mục 16.2 trước/sau khi deploy US-4064',
    expected: 'Không có field nào ngoài phạm vi bị thay đổi định dạng làm tròn ngoài ý muốn (regression)',
    priority: 'Medium',
  },

  // ==== NHÓM J: Tương tác giữa 3 yêu cầu (interaction) ====
  {
    id: 'DLY-36',
    category: 'J. Tương tác 3 yêu cầu',
    title: '% "Đội ghi bàn trước" và câu nhận định "Bàn thắng" cùng hiển thị trên 1 màn hình — không xung đột layout',
    precondition: 'Table view → Page "Bàn thắng", cả 3 block Bàn thắng/Thủng lưới/Đội ghi bàn trước đều Expand',
    steps: '1. Scroll qua đủ 3 block liên tiếp\n2. Quan sát vùng hiển thị %, câu nhận định, và số liệu Average trong cùng 1 page',
    expected: 'Không bị chồng lấn UI, mỗi block hiển thị đúng dữ liệu riêng (Average không lẫn vào % Đội ghi bàn trước và ngược lại), thứ tự đúng theo mục 9 (Bàn thắng → Thủng lưới → Trên/Dưới → Đội ghi bàn trước → Bàn thắng theo phút)',
    priority: 'Medium',
  },
  {
    id: 'DLY-37',
    category: 'J. Tương tác 3 yêu cầu',
    title: 'Giá trị Average dùng để tính công thức nhận định Bàn thắng/Thủng lưới phải là giá trị ĐÃ làm tròn hay giá trị THÔ (trước làm tròn)?',
    precondition: 'Đội X có trung bình bàn thắng thô = 2.334, Đội Y = 1.666 (làm tròn hiển thị đều là 2.33 và 1.67 — không đổi kết quả ví dụ mẫu)',
    steps: '1. Tính công thức (max-min)/min bằng số THÔ: (2.334-1.666)/1.666 = 40.1%\n2. Tính lại bằng số ĐÃ làm tròn hiển thị: (2.33-1.67)/1.67 = 39.5% ≈ 40%\n3. Thử với 1 cặp số mà 2 cách tính ra kết quả % nguyên khác nhau (vd chênh lệch sát ngưỡng .5)\n4. Đối chiếu % thực tế trên UI',
    expected: '[CẦN CONFIRM] Xác định rõ pipeline tính: công thức nhận định phải dùng số liệu THÔ (chưa làm tròn) rồi mới làm tròn kết quả cuối, để tránh sai số cộng dồn (double-rounding) — đây là case dễ gây lệch %, cần dev xác nhận thứ tự tính đúng. Xem câu hỏi mở OQ-07',
    priority: 'High',
  },
  {
    id: 'DLY-38',
    category: 'J. Tương tác 3 yêu cầu',
    title: 'Field bị giá trị âm ảnh hưởng đến cả % "Đội ghi bàn trước" lẫn công thức nhận định — verify không lan lỗi chéo',
    precondition: 'Dữ liệu nguồn cho 1 đội bị lỗi trả về số âm ở field trung bình bàn thắng',
    steps: '1. Xem block "Bàn thắng" — công thức nhận định có dùng field âm này làm min/max không\n2. Xem block "Đội ghi bàn trước" của CÙNG đội đó có bị ảnh hưởng không (2 field độc lập)',
    expected: 'Field âm được xử lý N/A/0 riêng theo mục 16.1 tại đúng field đó; KHÔNG lan sang field "Đội ghi bàn trước" (độc lập), và câu nhận định không hiển thị "NaN%" hay dùng số âm để tính (max-min)',
    priority: 'High',
  },

  // ==== NHÓM K: Case đặc thù bóng đá (giải cup, giao hữu, dữ liệu ít) ====
  {
    id: 'DLY-39',
    category: 'K. Case đặc thù bóng đá',
    title: 'Trận đấu ở giải Cup (knock-out) — "10 trận gần nhất" tính chéo nhiều giải đấu hay chỉ trong giải hiện tại?',
    precondition: 'Trận đang xem thuộc UEFA Champions League, đội chỉ mới đá 3 trận CL mùa này nhưng đã đá 20+ trận ở giải quốc nội',
    steps: '1. Mở block "Đội ghi bàn trước" ở trận Champions League\n2. Kiểm tra 10 trận được tính có bao gồm cả trận giải quốc nội hay chỉ tính riêng Champions League',
    expected: '[CẦN CONFIRM] Làm rõ phạm vi "10 trận gần nhất" — cùng giải đấu hiện tại, hay toàn bộ trận gần nhất bất kể giải (giống cách tính Form/H2H đã có)? Ảnh hưởng cả % Đội ghi bàn trước lẫn field Average liên quan. Xem câu hỏi mở OQ-08',
    priority: 'High',
  },
  {
    id: 'DLY-40',
    category: 'K. Case đặc thù bóng đá',
    title: 'Đội mới thăng hạng, chưa từng đối đầu ở giải hiện tại — Average tính trên 0 trận',
    precondition: 'Đội E vừa thăng hạng lên giải hiện tại, đây là mùa đầu tiên, chưa có lịch sử trận nào trong giải này',
    steps: '1. Mở block "Bàn thắng" của đội E cho mùa hiện tại',
    expected: 'Trung bình bàn thắng hiển thị "N/A" (không có dữ liệu để tính trung bình), câu nhận định không được hiển thị dạng x% (không đủ dữ liệu để so sánh) — phải có fallback message rõ ràng, không hiển thị "Infinity%" hoặc "NaN%"',
    priority: 'High',
  },
  {
    id: 'DLY-41',
    category: 'K. Case đặc thù bóng đá',
    title: 'Trận đấu có yếu tố penalty shootout (Cup) — có bị tính vào Average Bàn thắng/Thủng lưới không?',
    precondition: 'Trong 10 trận gần nhất của đội có 1 trận hòa cả trận (90p) nhưng thắng qua loạt sút luân lưu',
    steps: '1. Xác định số bàn thắng dùng để tính Average của trận đó: tính theo tỉ số 90p hay tính thêm bàn luân lưu',
    expected: '[CẦN CONFIRM] Số bàn thắng trung bình chỉ nên tính theo kết quả trong thời gian thi đấu chính thức (90p/120p nếu có hiệp phụ), KHÔNG cộng thêm bàn từ loạt sút luân lưu — cần verify đúng theo rule đã áp dụng ở tính năng tương tự (task 3575 US-02 cũng có rule loại trừ penalty shootout)',
    priority: 'Medium',
  },
  {
    id: 'DLY-42',
    category: 'K. Case đặc thù bóng đá',
    title: 'Trận giao hữu (friendly) trong 10 trận gần nhất — có bị loại trừ khi tính % và Average không?',
    precondition: 'Trong 10 trận gần nhất của 1 đội có xen kẽ 1-2 trận giao hữu quốc tế',
    steps: '1. Kiểm tra danh sách trận được dùng để tính % "Đội ghi bàn trước" và Average Bàn thắng/Thủng lưới',
    expected: '[CẦN CONFIRM] Xác nhận trận giao hữu có được tính vào hay bị loại trừ — cần nhất quán với cách các tính năng thống kê khác của hệ thống đã xử lý (vd H2H đã loại trừ giao hữu ở task 3575)',
    priority: 'Medium',
  },

  // ==== NHÓM L: UI/UX & thiết bị ====
  {
    id: 'DLY-43',
    category: 'L. UI/UX & thiết bị',
    title: 'Câu nhận định dài (tên đội dài) không bị tràn/vỡ layout trên màn hình nhỏ (mobile)',
    precondition: 'Đội có tên đầy đủ dài (short name vẫn dài, vd "Borussia Mönchengladbach"), xem trên viewport mobile',
    steps: '1. Mở block Bàn thắng/Thủng lưới trên mobile viewport (< 400px width)\n2. Quan sát câu nhận định',
    expected: 'Text wrap đúng, không bị cắt chữ hoặc tràn ra ngoài khung block',
    priority: 'Low',
  },
  {
    id: 'DLY-44',
    category: 'L. UI/UX & thiết bị',
    title: '% "Đội ghi bàn trước" hiển thị nhất quán giữa Dark mode và Light mode',
    precondition: 'Đã có % hiển thị đúng ở Dark mode',
    steps: '1. Chuyển sang Light mode\n2. Đối chiếu lại % và màu sắc/độ tương phản',
    expected: 'Số liệu % không đổi, chỉ đổi theme màu — đúng theo US-3585 mục 1 (Light mode reuse layout, chỉ đổi style)',
    priority: 'Low',
  },
  {
    id: 'DLY-45',
    category: 'L. UI/UX & thiết bị',
    title: 'Copy/share hoặc chụp màn hình block "Đội ghi bàn trước" — % không bị cắt do lazy-load chưa tính xong',
    precondition: 'Vừa mở block, dữ liệu đang trong quá trình fetch API',
    steps: '1. Mở block ngay khi vừa load trang (network chậm/throttle)\n2. Quan sát trạng thái loading → hiển thị dữ liệu',
    expected: 'Có trạng thái loading rõ ràng (skeleton/spinner), % chỉ hiển thị sau khi có đủ dữ liệu — không hiển thị "0%" tạm thời rồi nhảy số gây hiểu nhầm là giá trị thật',
    priority: 'Medium',
  },
  {
    id: 'DLY-46',
    category: 'L. UI/UX & thiết bị',
    title: 'Đổi Competition/Season khác trên Match Detail — % và Average cập nhật lại đúng theo bối cảnh mới',
    precondition: 'Đang xem Datalytics của trận thuộc Season A',
    steps: '1. Ghi nhận % "Đội ghi bàn trước" và Average Bàn thắng của trận Season A\n2. Điều hướng sang xem trận khác thuộc Season/Competition B\n3. Đối chiếu lại 2 giá trị trên',
    expected: 'Số liệu cập nhật hoàn toàn theo dữ liệu 10 trận gần nhất TÍNH TẠI THỜI ĐIỂM trận B diễn ra (không giữ lại cache số liệu của trận A)',
    priority: 'Medium',
  },

  // ==== NHÓM M: Regression & Acceptance Criteria tổng thể ====
  {
    id: 'DLY-47',
    category: 'M. Regression & AC tổng thể',
    title: 'Acceptance Criteria: câu nhận định hiển thị đúng ở cả Table View (dòng text) theo đúng vị trí thiết kế',
    precondition: 'Table view → Page Bàn thắng, đã Expand block',
    steps: '1. Đối chiếu vị trí câu nhận định trong block so với ảnh design đính kèm trong US-4064 mục 2',
    expected: 'Câu nhận định nằm đúng vị trí (dưới bảng số liệu hoặc theo đúng khung trong ảnh design), không bị đặt sai chỗ hoặc thiếu hẳn khi màn hình hẹp',
    priority: 'Medium',
  },
  {
    id: 'DLY-48',
    category: 'M. Regression & AC tổng thể',
    title: 'Regression: field "honors"/dữ liệu Player không bị ảnh hưởng bởi thay đổi US-4064 (phạm vi khác domain)',
    precondition: 'US-4064 chỉ thuộc phạm vi Match Detail Datalytics, không liên quan Player service (US-900)',
    steps: '1. Kiểm tra nhanh 1 endpoint Player bất kỳ (vd player summary) sau khi deploy US-4064',
    expected: 'Không có regression chéo — US-4064 không đụng tới domain Player/Honor, dữ liệu Player vẫn nhất quán như trước',
    priority: 'Low',
  },
  {
    id: 'DLY-49',
    category: 'M. Regression & AC tổng thể',
    title: 'Toàn bộ 3 yêu cầu hoạt động đồng thời trên cùng 1 trận đấu thật (smoke test end-to-end)',
    precondition: 'Chọn 1 trận đấu thật trên staging có đủ dữ liệu lịch sử (>= 10 trận gần nhất mỗi đội, có chênh lệch phong độ rõ ràng)',
    steps: '1. Mở Match Detail → Datalytics → Table View → Page Bàn thắng\n2. Verify % Đội ghi bàn trước cho cả 2 đội\n3. Verify câu nhận định Bàn thắng và Thủng lưới\n4. Verify format làm tròn của toàn bộ dòng Average trong page',
    expected: 'Cả 3 yêu cầu hoạt động đúng đồng thời trên cùng 1 bối cảnh dữ liệu thật, không có xung đột hay lỗi hiển thị chồng chéo',
    priority: 'High',
  },

  // ==== NHÓM N: Case % vượt 100% (phát hiện qua automation trên giải trẻ U20, 03/09/2026) ====
  {
    id: 'DLY-50',
    category: 'N. Case % vượt 100%',
    title: '🔴 [PHÁT HIỆN QUA DATA THẬT] Câu nhận định hiển thị % > 100% khi 2 đội chênh lệch phong độ cực lớn',
    precondition:
      'Đã verify bằng automation trên trận thật Iran U20 vs Palestine U20 (AFC U20 Asian Cup Qualification, staging 03/09/2026): home_conceded_per_match=0.2, away_conceded_per_match=1.75 → API trả better_percentage=775%. Tương tự block Bàn thắng cùng trận trả về 220%. Đây là hệ quả toán học tất yếu của công thức hiệu số chia mẫu số nhỏ (không phải tỉ lệ phần trăm tự nhiên bị chặn trong [0,100])',
    steps: '1. Mở trận có chênh lệch phong độ cực lớn giữa 2 đội (thường gặp ở giải trẻ/giải ít trận, đội yếu vs đội mạnh)\n2. Quan sát progress bar (thanh màu xanh/cam theo design) và câu nhận định của block Bàn thắng/Thủng lưới',
    expected:
      '[CẦN QA/DEV XÁC NHẬN] Progress bar không được vỡ layout khi giá trị > 100% (cần biết UI có cap ở 100% khi vẽ thanh hay không). Câu nhận định có hiển thị trực tiếp con số "775%" (có thể gây khó hiểu/mất thẩm mỹ cho người dùng phổ thông) hay được xử lý riêng (cap hiển thị, làm tròn về "100%+", hoặc ẩn %). Đây KHÔNG phải lỗi tính toán — công thức đúng theo spec, chỉ là spec/design chưa đề cập cách hiển thị khi kết quả vượt 100%',
    priority: 'High',
  },
  {
    id: 'DLY-51',
    category: 'N. Case % vượt 100%',
    title: 'Verify % vượt 100% không làm crash hoặc hiển thị NaN/Infinity trên UI',
    precondition: 'Cùng bối cảnh DLY-50 — trận có better_percentage=775%',
    steps: '1. Mở trận thật trên staging\n2. Kiểm tra toàn bộ block Bàn thắng, Thủng lưới, progress bar liên quan không bị lỗi console/crash UI',
    expected: 'UI render bình thường, không throw error, không hiển thị NaN/Infinity/undefined ở bất kỳ đâu liên quan đến % này',
    priority: 'High',
  },

  // ==== NHÓM O: Đối chiếu FootyStats — nguồn dữ liệu gốc (phát hiện 03/09/2026) ====
  {
    id: 'DLY-52',
    category: 'O. Đối chiếu FootyStats',
    title: 'Số liệu Goals/Conceded per match khớp 100% với FootyStats.org (nguồn dữ liệu gốc)',
    precondition:
      'Đã đối chiếu trực tiếp trận thật Newcastle vs Bournemouth (Premier League) trên footystats.org/england/afc-bournemouth-vs-newcastle-united-fc-h2h-stats, 03/09/2026',
    steps: '1. Mở trận trên staging, ghi nhận Goals per match và Conceded per match của cả 2 đội\n2. Mở đúng trận tương ứng trên FootyStats.org, đối chiếu 4 con số này',
    expected: 'Khớp 100% giữa 2 nguồn (đã verify: Newcastle 1.7 Goals/1.6 Conceded, Bournemouth 2.7 Goals/1.4 Conceded — khớp tuyệt đối cả 2 nguồn)',
    priority: 'High',
  },
  {
    id: 'DLY-53',
    category: 'O. Đối chiếu FootyStats',
    title: '❗ [CẦN BA XÁC NHẬN] Rounding edge case: % nhận định lệch 1 điểm % so với FootyStats khi kết quả rơi đúng mốc .5%',
    precondition:
      'Trận Newcastle (conceded 1.6) vs Bournemouth (conceded 1.4): (1.6-1.4)/1.6*100 = 12.5% CHÍNH XÁC — rơi đúng mốc biên rule làm tròn ".5 luôn làm tròn LÊN"',
    steps: '1. Tính tay công thức, xác nhận kết quả = 12.5% chẵn\n2. Đối chiếu % hiển thị trên UniScore (13%, áp rule làm tròn lên theo mục 16.2) với % trên FootyStats (12%)',
    expected:
      '[CẦN BA XÁC NHẬN] UniScore trả 13% (đúng theo rule đã viết trong spec mục 16.2), FootyStats trả 12% (nguồn gốc dữ liệu). Cần xác nhận: FootyStats có phải nguồn PHẢI khớp tuyệt đối 100% không, hay UniScore được phép có rule làm tròn riêng khác nguồn gốc? Nếu bắt buộc khớp FootyStats, cần đổi rule làm tròn (có thể FootyStats dùng round-half-even hoặc giữ nhiều chữ số thập phân hơn trước khi làm tròn cuối)',
    priority: 'Medium',
  },
];

const OPEN_QUESTIONS = [
  {
    stt: 'OQ-01',
    question:
      '❗ [KHÔNG PHẢI BUG CODE — CẦN BA XÁC NHẬN THIẾT KẾ. Đã verify bằng API thật trên 4 trận, 03/09/2026, xem 01-datalytics-api-formulas.spec.ts và results/BUG_US4064_ThungLuoi_CongThuc_HomeAway.md] Xác nhận code đang chạy ĐÚNG CHÍNH XÁC như spec/design US-4064 mục 2 vẽ: công thức Thủng lưới là (max-min)/home_conceded_per_match — chia cho số liệu ĐỘI HOME cụ thể (đã đối chiếu ảnh design gốc, ví dụ Chelsea/Arsenal). Vấn đề: ảnh ví dụ trong spec chọn đúng case home=đội thủng lưới NHIỀU hơn (Chelsea=home=max=1.0), nên /home và /max trùng kết quả (50%) — không đủ để lộ ra hành vi khi home là đội YẾU hơn. Test trên 4 trận thật: 3/4 trận (PSG-Villa, Osnabrück-Bayern, Al Fayha-Al Kholood) đều có home=max nên không lộ vấn đề; CHỈ trận Palermo vs Mantova (home=min) mới cho thấy /home (63%) khác hẳn /max (38%). HỆ QUẢ: nếu 2 đội đổi sân cho nhau (lượt về), % nhận định sẽ đổi dù phong độ 2 đội không đổi. CẦN BA XÁC NHẬN: đây có phải chủ đích thiết kế (ưu tiên góc nhìn sân nhà) hay điểm chưa lường tới khi vẽ ví dụ? Nếu chưa lường tới, đề xuất đổi mẫu số sang /max để đối xứng, nhất quán với Bàn thắng (dùng /min, đã verify đúng ở cả 4 trận). Xem case DLY-13, DLY-14, DLY-14B.',
    answer: 'Đã xác nhận: code KHÔNG có bug, đang chạy đúng spec (max-min)/home. Cần BA xác nhận đây có phải chủ đích thiết kế hay chưa — xem báo cáo results/BUG_US4064_ThungLuoi_CongThuc_HomeAway.md để quyết định giữ nguyên hay đề xuất đổi sang /max.',
  },
  {
    stt: 'OQ-02',
    question:
      'Block "Đội ghi bàn trước": đội chưa đủ 10 trận gần nhất (vd mới lên hạng, mới có 4 trận) thì % tính trên số trận thực tế hiện có, hay hiển thị N/A vì không đủ mẫu 10 trận như tooltip định nghĩa?',
    answer: '',
  },
  {
    stt: 'OQ-03',
    question:
      'Case chia cho 0 ở công thức nhận định: nếu mẫu số (min ở block Bàn thắng, hoặc max ở block Thủng lưới) = 0, hệ thống xử lý thế nào? Hiển thị N/A, ẩn dòng nhận định, hay có câu xử lý riêng?',
    answer: '',
  },
  {
    stt: 'OQ-04',
    question:
      'Bảng mục 16.2 liệt kê tên field kèm ví dụ mũi tên đổi giá trị threshold (vd "Tổng sút phạt 20.5+ → 25.5+", "Trên 0.5 → 4.5"). Đây là lỗi đánh máy trong tài liệu hay UI thật sự có 2 phiên bản threshold khác nhau (cũ/mới)? Ảnh hưởng trực tiếp đến việc xác định field nào là đúng khi viết assertion tự động.',
    answer: '',
  },
  {
    stt: 'OQ-05',
    question:
      'Field "%" của block Đội ghi bàn trước: API trả sẵn field phần trăm hay FE tự tính từ 2 số nguyên (scored_first_count/total_matches)? Cần biết để viết test tự động verify đúng tầng (API hay UI logic).',
    answer: '',
  },
  {
    stt: 'OQ-06',
    question:
      'Rule làm tròn ".5 → luôn làm tròn lên" áp dụng cho SỐ ÂM có đúng theo cùng chiều không (vd -25.5 → -25 hay -26)? Mục 16.2 chỉ có ví dụ số dương.',
    answer: '',
  },
  {
    stt: 'OQ-07',
    question:
      'Công thức nhận định (max-min)/min và (max-min)/max phải dùng số liệu THÔ (trước làm tròn) hay số ĐÃ làm tròn 2 chữ số thập phân đang hiển thị trên UI? Thứ tự tính sai có thể gây double-rounding, lệch % ở các case sát ngưỡng .5.',
    answer: '',
  },
  {
    stt: 'OQ-08',
    question:
      '"10 trận gần nhất" dùng để tính % Đội ghi bàn trước và Average Bàn thắng/Thủng lưới được tính CHỈ trong giải đấu hiện tại (vd chỉ Champions League) hay chéo mọi giải đấu đội đó đã thi đấu gần đây (giống logic Form/H2H)? Ảnh hưởng lớn với đội có traffic thấp ở giải Cup.',
    answer: '',
  },
  {
    stt: 'OQ-09',
    question:
      '[ĐÃ ĐỐI CHIẾU TRỰC TIẾP VỚI FOOTYSTATS.ORG 03/09/2026 — nguồn dữ liệu gốc, xác nhận qua link đính kèm spec US-3585 mục 16.1] Trận Newcastle vs Bournemouth (Premier League): Bàn thắng khớp 100% (59%=59%), nhưng Thủng lưới LỆCH 1 điểm % — UniScore trả 13%, FootyStats trả 12%. Nguyên nhân: (1.6-1.4)/1.6*100 = 12.5% CHÍNH XÁC, rơi đúng mốc biên rule ".5 luôn làm tròn LÊN" (mục 16.2). UniScore áp đúng rule này nên ra 13%; FootyStats có vẻ dùng quy tắc làm tròn khác (round-down hoặc số liệu nội bộ nhiều chữ số thập phân hơn khiến kết quả thật <12.5% trước khi làm tròn). Cần BA/dev xác nhận: FootyStats có phải nguồn PHẢI khớp 100% (thì UniScore cần đổi rule làm tròn để match), hay chỉ là nguồn crawl thô rồi UniScore tự áp rule làm tròn riêng theo spec (thì sai khác này là CHẤP NHẬN ĐƯỢC, không phải bug)? Xem file results/footystats-diff-newcastle-bournemouth.json và test "Đối chiếu với FootyStats" trong 01-datalytics-api-formulas.spec.ts.',
    answer: '',
  },
];

test('Xuất Excel test case cho US-4064 [Datalytics] Bổ sung dữ liệu', async () => {
  const overviewSheet: ExcelSheetSpec = {
    name: 'Tổng quan',
    columns: [
      { header: 'Mục', key: 'field', width: 30 },
      { header: 'Nội dung', key: 'value', width: 90 },
    ],
    rows: [
      { field: 'Task', value: 'US-4064 [API][Football][Match Detail - Datalytics] Bổ sung dữ liệu' },
      { field: 'Story cha', value: 'US-3585 [API][APP][Football][Match Detail - Datalytics] Bổ sung Section Tab, dữ liệu và nâng cấp UI Table View' },
      { field: 'Epic', value: 'US-652 Datalytics' },
      { field: 'Phạm vi', value: '1) % sau mỗi team ở "Đội ghi bàn trước"; 2) Công thức dòng nhận định Bàn thắng/Thủng lưới; 3) Công thức làm tròn các dòng Average (theo mục 16 của US-3585)' },
      { field: 'Tổng số case', value: TEST_CASES.length },
      { field: 'Ngày soạn', value: '03/09/2026' },
      {
        field: '❗ Cần BA xác nhận (không phải bug code)',
        value:
          'Code đúng spec: công thức Thủng lưới là "(max-min)/home" — chia cho số liệu đội HOME cụ thể, đã đối chiếu khớp ảnh design gốc. Verify qua automation trên 4 trận thật: đổi vai trò home/away của cùng 1 cặp đội sẽ cho % nhận định khác nhau dù phong độ không đổi — cần BA xác nhận đây có phải chủ đích thiết kế hay chưa lường tới. Xem DLY-13, DLY-14, DLY-14B, OQ-01 và results/BUG_US4064_ThungLuoi_CongThuc_HomeAway.md.',
      },
      { field: 'Nguồn tài liệu', value: 'Jira US-4064 (mục 1, 2) + Jira US-3585 mục 16 "Handle data" (mục 3, do US-4064 chỉ ghi "đọc mục 16 của story")' },
    ],
  };

  const testCaseSheet: ExcelSheetSpec = {
    name: 'Test Cases',
    columns: [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Category', key: 'category', width: 32 },
      { header: 'Title', key: 'title', width: 45 },
      { header: 'Precondition', key: 'precondition', width: 45 },
      { header: 'Steps', key: 'steps', width: 45 },
      { header: 'Expected', key: 'expected', width: 55 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
    ],
    rows: TEST_CASES.map((tc) => ({ ...tc, status: 'Not Run' })),
    wrapText: true,
  };

  const openQuestionsSheet: ExcelSheetSpec = {
    name: 'Câu hỏi mở',
    columns: [
      { header: 'STT', key: 'stt', width: 10 },
      { header: 'Câu hỏi', key: 'question', width: 90 },
      { header: 'Câu trả lời', key: 'answer', width: 40 },
    ],
    rows: OPEN_QUESTIONS,
    wrapText: true,
  };

  await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTCASE_US4064_Datalytics_Data.xlsx', [
    overviewSheet,
    testCaseSheet,
    openQuestionsSheet,
  ]);

  console.log(`✓ Đã tạo ${TEST_CASES.length} test case cho US-4064`);
});
