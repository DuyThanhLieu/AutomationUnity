/**
 * Xuất file Excel test case cho feature "So sánh cầu thủ — bổ sung xG"
 * (Player Detail). KHÔNG phải test verify — chỉ generate tài liệu Excel từ
 * danh sách case đã soạn theo User Story, xem bản đầy đủ ở TEST_CASES.md.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-player-xg-compare/00-export-test-cases.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-player-xg-compare';

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
  // ---- A. Hiển thị field xG cơ bản ----
  {
    id: 'XGC-01',
    category: 'A. Hiển thị cơ bản',
    title: 'Field xG xuất hiện đúng vị trí trong component Attack',
    precondition: 'Đang ở tính năng So sánh cầu thủ, đã chọn ít nhất 2 cầu thủ',
    steps: '1. Mở component Attack trong bảng so sánh\n2. Quan sát thứ tự các field',
    expected: 'Field "xG" xuất hiện ngay dưới "Total shots" và ngay trên "Freekicks" — đúng thứ tự đã spec, không bị chèn sai vị trí',
    priority: 'High',
  },
  {
    id: 'XGC-02',
    category: 'A. Hiển thị cơ bản',
    title: 'Label hiển thị đúng "xG"',
    precondition: 'Đã hiển thị field xG',
    steps: '1. Xem tên field hiển thị trên UI',
    expected: 'Label chính xác là "xG" (không phải "Expected Goals" đầy đủ, không viết hoa/thường sai)',
    priority: 'Medium',
  },
  {
    id: 'XGC-03',
    category: 'A. Hiển thị cơ bản',
    title: 'Giá trị xG hiển thị đúng định dạng số',
    precondition: 'Cầu thủ có dữ liệu xG > 0',
    steps: '1. Xem giá trị xG hiển thị',
    expected: 'Hiển thị đúng tổng xG dạng số (xác nhận số chữ số thập phân theo design, ví dụ 2 chữ số như "6.71")',
    priority: 'Medium',
  },

  // ---- B. Logic tính xG theo Competition + Season ----
  {
    id: 'XGC-04',
    category: 'B. Logic Competition+Season',
    title: 'xG tính đúng theo Competition + Season đang chọn',
    precondition: 'Cầu thủ tham gia nhiều giải đấu/mùa giải khác nhau',
    steps: '1. Chọn Competition A + Season A\n2. Ghi nhận giá trị xG hiển thị\n3. Đối chiếu với tổng xG thực tế của cầu thủ trong đúng Competition A + Season A (query API/DB)',
    expected: 'Giá trị xG trên UI khớp chính xác với tổng xG backend cho đúng Competition A + Season A — không lẫn dữ liệu giải/mùa khác',
    priority: 'High',
  },
  {
    id: 'XGC-05',
    category: 'B. Logic Competition+Season',
    title: 'Đổi Competition → xG của TẤT CẢ cầu thủ trong bảng so sánh cập nhật lại',
    precondition: 'Đang so sánh ≥ 2 cầu thủ, đã có giá trị xG cho Competition A',
    steps: '1. Ghi nhận xG của từng cầu thủ ở Competition A\n2. Đổi sang Competition B\n3. Ghi nhận lại xG của từng cầu thủ',
    expected: 'xG của TẤT CẢ cầu thủ trong bảng đều đổi theo đúng Competition B, không có cầu thủ nào bị kẹt giá trị cũ',
    priority: 'High',
  },
  {
    id: 'XGC-06',
    category: 'B. Logic Competition+Season',
    title: 'Đổi Season → xG của tất cả cầu thủ trong bảng so sánh cập nhật lại',
    precondition: 'Tương tự XGC-05 nhưng đổi Season thay vì Competition',
    steps: '1. Ghi nhận xG ở Season A\n2. Đổi sang Season B (cùng Competition)\n3. Ghi nhận lại',
    expected: 'xG cập nhật đúng theo Season B cho mọi cầu thủ',
    priority: 'High',
  },
  {
    id: 'XGC-07',
    category: 'B. Logic Competition+Season',
    title: 'Đổi cả Competition lẫn Season cùng lúc',
    precondition: 'Đang so sánh cầu thủ với Competition A + Season A',
    steps: '1. Đổi đồng thời cả 2 filter, không đổi riêng lẻ',
    expected: 'xG cập nhật đúng theo tổ hợp Competition + Season mới, không bị tính theo tổ hợp cũ (vd giữ Competition cũ + Season mới do cập nhật thiếu đồng bộ)',
    priority: 'Medium',
  },

  // ---- C. Giá trị mặc định ----
  {
    id: 'XGC-08',
    category: 'C. Giá trị mặc định',
    title: 'Mặc định Competition = giải VĐQG cầu thủ đang tham gia',
    precondition: 'Mở tính năng So sánh cầu thủ lần đầu (chưa từng chọn filter)',
    steps: '1. Quan sát Competition filter mặc định',
    expected: 'Competition mặc định đúng là giải vô địch quốc gia (national league) mà cầu thủ hiện đang thi đấu — không phải giải cup, không phải giải quốc tế',
    priority: 'High',
  },
  {
    id: 'XGC-09',
    category: 'C. Giá trị mặc định',
    title: 'Mặc định Season = mùa giải hiện tại',
    precondition: 'Mở tính năng So sánh cầu thủ lần đầu',
    steps: '1. Quan sát Season filter mặc định',
    expected: 'Season mặc định là mùa giải đang diễn ra (current season), không phải mùa cũ',
    priority: 'High',
  },
  {
    id: 'XGC-10',
    category: 'C. Giá trị mặc định',
    title: 'xG mặc định khớp đúng Competition + Season mặc định',
    precondition: 'Vừa mở tính năng so sánh, chưa đổi filter',
    steps: '1. Đối chiếu giá trị xG hiển thị mặc định với tổng xG thực tế của cầu thủ trong đúng giải VĐQG + mùa hiện tại',
    expected: 'Khớp chính xác — không hiển thị dữ liệu rỗng hoặc dữ liệu của giải khác khi vừa mở tính năng',
    priority: 'High',
  },
  {
    id: 'XGC-11',
    category: 'C. Giá trị mặc định',
    title: 'So sánh nhiều cầu thủ có giải VĐQG mặc định KHÁC NHAU',
    precondition: '2 cầu thủ trong bảng so sánh thi đấu ở 2 giải quốc nội khác nhau (vd 1 người Ligue 1, 1 người Premier League)',
    steps: '1. Mở tính năng so sánh 2 cầu thủ này',
    expected: '[CẦN CONFIRM] Competition mặc định áp dụng chung cho cả bảng (theo 1 cầu thủ chính) hay mỗi cầu thủ tự động lấy đúng giải VĐQG riêng? Spec chưa nêu rõ — xem sheet Câu hỏi mở',
    priority: 'Medium',
  },

  // ---- D. Logic so sánh — Highlight ----
  {
    id: 'XGC-12',
    category: 'D. Highlight',
    title: 'Cầu thủ có xG cao nhất được highlight (label xanh dương)',
    precondition: 'So sánh ≥ 2 cầu thủ có xG khác nhau',
    steps: '1. Quan sát field xG trong bảng so sánh',
    expected: 'Cầu thủ có tổng xG cao nhất được highlight đúng theo logic hiện tại của tính năng so sánh (label màu xanh dương)',
    priority: 'High',
  },
  {
    id: 'XGC-13',
    category: 'D. Highlight',
    title: 'Nhiều cầu thủ cùng giá trị xG cao nhất → TẤT CẢ đều được highlight',
    precondition: '≥ 2 cầu thủ có xG bằng nhau và là giá trị cao nhất trong bảng',
    steps: '1. Quan sát highlight',
    expected: 'Toàn bộ các cầu thủ có giá trị bằng nhau (và là cao nhất) đều được highlight, không chỉ 1 cầu thủ đầu tiên',
    priority: 'High',
  },
  {
    id: 'XGC-14',
    category: 'D. Highlight',
    title: 'Chỉ 1 cầu thủ có xG hợp lệ, còn lại "-"',
    precondition: 'So sánh 2 cầu thủ, 1 người có xG > 0, người kia không có dữ liệu ("-")',
    steps: '1. Quan sát highlight',
    expected: 'Cầu thủ có giá trị hợp lệ được highlight; cầu thủ "-" không được highlight và không gây lỗi tính toán so sánh',
    priority: 'Medium',
  },
  {
    id: 'XGC-15',
    category: 'D. Highlight',
    title: 'Tất cả cầu thủ đều "-" (không ai có dữ liệu)',
    precondition: 'So sánh nhóm cầu thủ toàn bộ không có dữ liệu xG',
    steps: '1. Quan sát highlight',
    expected: 'Không có highlight nào được áp dụng (không có gì để so sánh), không hiển thị lỗi',
    priority: 'Medium',
  },

  // ---- E. Xử lý dữ liệu — biên ----
  {
    id: 'XGC-16',
    category: 'E. Dữ liệu biên',
    title: 'Có dữ liệu xG và xG > 0 → hiển thị đúng giá trị',
    precondition: 'Cầu thủ có xG > 0',
    steps: '1. Xem giá trị xG hiển thị',
    expected: 'Hiển thị đúng số, không làm tròn sai, không hiển thị "-" hay "0" nhầm',
    priority: 'High',
  },
  {
    id: 'XGC-17',
    category: 'E. Dữ liệu biên',
    title: 'Có dữ liệu xG và xG = 0 → hiển thị "0", KHÔNG hiển thị "-"',
    precondition: 'Cầu thủ có dữ liệu xG hợp lệ (đã tham gia đủ điều kiện tính toán) nhưng tổng xG thực tế = 0',
    steps: '1. Xem giá trị xG hiển thị',
    expected: 'Hiển thị chính xác "0" — điểm dễ nhầm lẫn nhất, cần phân biệt rõ "0 hợp lệ" và "không có dữ liệu" (xem XGC-18)',
    priority: 'High',
  },
  {
    id: 'XGC-18',
    category: 'E. Dữ liệu biên',
    title: 'Không có dữ liệu xG → hiển thị "-"',
    precondition: 'Cầu thủ không có bất kỳ dữ liệu xG nào cho Competition + Season đang chọn',
    steps: '1. Xem giá trị xG hiển thị',
    expected: 'Hiển thị "-", không hiển thị "0" (tránh gây hiểu nhầm là cầu thủ đã thi đấu nhưng không tạo cơ hội nào)',
    priority: 'High',
  },
  {
    id: 'XGC-19',
    category: 'E. Dữ liệu biên',
    title: 'Một số trận không có dữ liệu xG → KHÔNG tự động tính các trận đó thành 0',
    precondition: 'Cầu thủ có N trận trong mùa giải, chỉ M trận (M<N) có dữ liệu xG đủ điều kiện (Opta coverage level)',
    steps: '1. Đối chiếu tổng xG hiển thị với tổng xG tính thủ công CHỈ từ M trận có dữ liệu, không cộng thêm 0 cho (N-M) trận thiếu',
    expected: 'Tổng xG hiển thị = tổng xG của đúng M trận có dữ liệu thực tế. Ghi chú: cần dùng CHUNG nguồn tính toán với feature "Player xG" (Team Details) đã làm trước đó, không tự viết logic riêng',
    priority: 'High',
  },
  {
    id: 'XGC-20',
    category: 'E. Dữ liệu biên',
    title: 'Cầu thủ mới chuyển nhượng, chưa thi đấu trận nào ở Competition + Season đang chọn',
    precondition: 'Chọn 1 cầu thủ vừa chuyển đến đội mới, giải mới, chưa ra sân trận nào',
    steps: '1. Xem giá trị xG hiển thị',
    expected: 'Hiển thị "-" (không có dữ liệu), không hiển thị "0"',
    priority: 'Medium',
  },

  // ---- F. Case tổng hợp ----
  {
    id: 'XGC-21',
    category: 'F. Tổng hợp',
    title: 'So sánh 3+ cầu thủ với đủ 3 trạng thái: xG > 0, xG = 0, và "-"',
    precondition: 'Bảng so sánh có ít nhất 3 cầu thủ đại diện đủ 3 trường hợp',
    steps: '1. Quan sát đồng thời hiển thị giá trị và highlight',
    expected: 'Hiển thị đúng từng trường hợp (số thật/"0"/"-"), chỉ cầu thủ xG cao nhất trong nhóm CÓ dữ liệu hợp lệ được highlight; "-" không tham gia so sánh và không bị highlight nhầm',
    priority: 'High',
  },
  {
    id: 'XGC-22',
    category: 'F. Tổng hợp',
    title: 'Thêm/bớt cầu thủ trong bảng so sánh sau khi đã có xG',
    precondition: 'Đang so sánh 2 cầu thủ, đã hiển thị xG + highlight đúng',
    steps: '1. Thêm 1 cầu thủ thứ 3 vào bảng so sánh (hoặc bớt đi 1 người)',
    expected: 'xG cầu thủ mới thêm tính đúng theo Competition+Season hiện tại (không phải mặc định riêng); highlight tính lại cho toàn bộ nhóm mới, không giữ highlight cũ sai',
    priority: 'Medium',
  },
  {
    id: 'XGC-23',
    category: 'F. Tổng hợp',
    title: 'Tải lại trang / mở lại tính năng so sánh với cùng danh sách cầu thủ',
    precondition: 'Đã chọn Competition/Season khác mặc định, sau đó tải lại trang',
    steps: '1. Reload trang, mở lại tính năng so sánh',
    expected: '[CẦN CONFIRM PO] Filter có được nhớ lại (persist) hay quay về mặc định mỗi lần mở lại? Spec chưa nêu rõ',
    priority: 'Low',
  },
];

const openQuestions = [
  { stt: 1, cauHoi: 'XGC-11: Khi so sánh nhiều cầu thủ có giải VĐQG mặc định khác nhau, Competition mặc định áp dụng theo cầu thủ nào? 1 filter chung cho cả bảng, hay mỗi cầu thủ tự lấy giải riêng?' },
  { stt: 2, cauHoi: 'XGC-19: Rule loại trừ trận thiếu dữ liệu xG (Opta coverage) có dùng chung công thức/nguồn dữ liệu với feature "Player xG" (Team Details) đã làm trước đó không, hay là luồng tính toán độc lập mới?' },
  { stt: 3, cauHoi: 'XGC-23: Filter Competition/Season có được lưu lại (persist qua session/reload) hay luôn reset về mặc định mỗi lần mở tính năng so sánh?' },
  { stt: 4, cauHoi: 'Số chữ số thập phân hiển thị cho xG là bao nhiêu? Cần đồng bộ với cách hiển thị xG ở các màn hình khác trong hệ thống.' },
  { stt: 5, cauHoi: '"Giải Vô địch quốc gia mặc định" xác định dựa trên nguồn nào nếu cầu thủ đang cho mượn (loan) — đội chủ quản hay đội đang thi đấu?' },
  { stt: 6, cauHoi: 'Case cầu thủ đang thi đấu ở giải trẻ (U19/U21) không có giải "vô địch quốc gia" người lớn tương ứng — mặc định sẽ là gì?' },
];

async function main() {
  const sheets: ExcelSheetSpec[] = [
    {
      name: 'Tổng quan',
      columns: [
        { header: 'Thông tin', key: 'k', width: 28 },
        { header: 'Nội dung', key: 'v', width: 90 },
      ],
      rows: [
        { k: 'Feature', v: 'Bổ sung xG vào tính năng So sánh cầu thủ — Player Detail' },
        { k: 'User Story', v: 'Xem và so sánh chỉ số xG (Expected Goals) giữa các cầu thủ trong cùng Competition + Season' },
        { k: 'Vị trí UI', v: 'Player Detail → So sánh cầu thủ → component Attack → dưới "Total shots", trên "Freekicks"' },
        { k: 'Tổng số test case', v: String(TEST_CASES.length) },
        { k: 'Số câu hỏi mở cần confirm', v: String(openQuestions.length) },
      ],
      wrapText: true,
    },
    {
      name: 'Test Cases',
      columns: [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Category', key: 'category', width: 26 },
        { header: 'Tiêu đề', key: 'title', width: 45 },
        { header: 'Precondition', key: 'precondition', width: 45 },
        { header: 'Steps', key: 'steps', width: 50 },
        { header: 'Expected Result', key: 'expected', width: 60 },
        { header: 'Priority', key: 'priority', width: 12 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: TEST_CASES.map((r) => ({ ...r, status: 'Not run' })),
      wrapText: true,
    },
    {
      name: 'Câu hỏi mở',
      columns: [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Câu hỏi cần confirm dev/PO', key: 'cauHoi', width: 100 },
        { header: 'Câu trả lời', key: 'answer', width: 50 },
      ],
      rows: openQuestions.map((q) => ({ ...q, answer: '' })),
      wrapText: true,
    },
  ];

  await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTCASE_PlayerXG_Compare.xlsx', sheets);
}

test.describe('[Player xG Compare] Export bộ test case (Excel) — không phải test verify', () => {
  test('Xuất TESTCASE_PlayerXG_Compare.xlsx', async () => {
    await main();
  });
});
