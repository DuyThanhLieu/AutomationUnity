// Build file Excel tổng hợp TOÀN BỘ test plan + danh sách case tự động đã
// viết cho US-4795 (trang Home, 5 endpoint theo doc US-4640 + UI thật + đối
// chiếu DB). Khác với build-bug-report.mjs (chỉ liệt kê các bug tìm được),
// file này liệt kê ĐẦY ĐỦ phạm vi test đã phủ — dùng làm tài liệu tổng quan
// QA, không phải báo cáo bug.
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Automation';
workbook.created = new Date();
const TODAY_VN = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

// Khung nhìn chung cho toàn bộ sheet: ẩn gridline mặc định của Excel (tự vẽ
// border rõ ràng hơn ở từng bảng), set zoom 115% để dễ đọc khi trình chiếu.
function styleSheet(ws) {
  ws.views = [{ ...(ws.views?.[0] ?? {}), showGridLines: false, zoomScale: 115 }];
}

const THIN = { style: 'thin', color: { argb: 'FFD0D0D0' } };
function boxBorder(cell) {
  cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
}

// ============================================================================
// Sheet 0: TÓM TẮT — trang đầu tiên khi mở file, dùng để báo cáo nhanh/trình
// chiếu mà không cần lật qua các sheet chi tiết. Số liệu tính ĐỘNG từ chính
// dữ liệu FILES/CASES/COVERAGE_MATRIX khai báo bên dưới (không hard-code).
// ============================================================================
const summary = workbook.addWorksheet('0. Tóm tắt', { properties: { tabColor: { argb: 'FF1F4E78' } } });
styleSheet(summary);
summary.columns = [{ width: 4 }, { width: 30 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }];

// --- Tiêu đề ---
summary.mergeCells('B2:F2');
summary.getCell('B2').value = 'US-4795 — Test Plan & Độ bao phủ · Trang Home (UniScore)';
summary.getCell('B2').font = { bold: true, size: 18, color: { argb: 'FF1F4E78' } };
summary.mergeCells('B3:F3');
summary.getCell('B3').value = `Cập nhật: ${TODAY_VN} · QA Automation`;
summary.getCell('B3').font = { italic: true, size: 10, color: { argb: 'FF6B6B6B' } };

// --- Khối số liệu lớn (4 ô KPI kiểu dashboard) ---
const KPI_ROW = 5;
function kpiCell(col, value, label, color) {
  const c = summary.getCell(`${col}${KPI_ROW}`);
  c.value = value;
  c.font = { bold: true, size: 22, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  const lc = summary.getCell(`${col}${KPI_ROW + 1}`);
  lc.value = label;
  lc.font = { size: 10, color: { argb: 'FF6B6B6B' } };
  lc.alignment = { horizontal: 'center' };
  summary.getRow(KPI_ROW).height = 34;
}

// ============================================================================
// Sheet 1: Tổng quan — mục đích từng file, endpoint, số lượng test
// ============================================================================
const overview = workbook.addWorksheet('1. Tổng quan theo file');
styleSheet(overview);
overview.columns = [
  { header: 'File', key: 'file', width: 32 },
  { header: 'Mục đích', key: 'purpose', width: 60 },
  { header: 'Endpoint / phạm vi', key: 'endpoint', width: 30 },
  { header: 'Số case', key: 'count', width: 10 },
  { header: 'Nhóm lớp test', key: 'layer', width: 24 },
];
overview.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
overview.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
overview.getRow(1).height = 22;
overview.getRow(1).alignment = { vertical: 'middle' };
overview.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
overview.autoFilter = { from: 'A1', to: 'E1' };

const FILES = [
  {
    file: '01-scheduled-v2.spec.ts',
    purpose: 'Bất biến không phụ thuộc trận cụ thể của scheduled-events-pagination-v2 (gợi ý, gom bảng, otherCompetitions, lọc type, validate) — chạy được mỗi ngày trên data prod thật.',
    endpoint: 'scheduled-v2',
    count: 56 + 56 + 56 + 56 + 56 + 14 + 14 + 1 + 1 + 1 + 2 + 1 + 1,
    layer: 'Nền tảng theo endpoint',
  },
  {
    file: '02-scheduled-v1.spec.ts',
    purpose: 'Đối chiếu scheduled-v1 với v2 (cùng tập trận, cùng thứ tự trừ group) + verify bug cache competitionId đã báo fix.',
    endpoint: 'scheduled-v1 (đối chiếu v2)',
    count: 9 * 6 + 1 + 1 + 1,
    layer: 'Nền tảng theo endpoint',
  },
  {
    file: '03-live-v1.spec.ts',
    purpose: 'Test events/live/locale: giới hạn 10 giải, mọi trận inprogress, lọc theo giải, validate.',
    endpoint: 'live-v1',
    count: 10 * 4 + 1 + 1 + 1 + 1,
    layer: 'Nền tảng theo endpoint',
  },
  {
    file: '04-live-v2.spec.ts',
    purpose: 'Test events/live-v2/locale + đối chiếu trực tiếp với live-v1 cùng thời điểm.',
    endpoint: 'live-v2 (đối chiếu live-v1)',
    count: 10 * 3 + 1 + 1 + 1,
    layer: 'Nền tảng theo endpoint',
  },
  {
    file: '05-my-matches.spec.ts',
    purpose: 'Test sport-events/my-matches theo type (all/finish/upcoming/live) với bộ yêu thích mẫu, 2 bug đã biết (GB timezone, trận hoãn/huỷ không bị ẩn).',
    endpoint: 'my-matches',
    count: 1 + 1 + 1 + 2 * 5 + 1 + 1,
    layer: 'Nền tảng theo endpoint',
  },
  {
    file: '06-ui-vs-api.spec.ts',
    purpose: 'Đối chiếu UI thật (uniscore.com) với API cho cả 4 tab All/Live/Upcoming/Finished, bắt locale UI thật qua network request. Bao gồm case date-boundary trên UI.',
    endpoint: 'UI (đối chiếu scheduled-v2, live-v2)',
    count: 3 * 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1,
    layer: 'Đối chiếu UI thật',
  },
  {
    file: '07-data-integrity.spec.ts',
    purpose: 'Tính toàn vẹn dữ liệu cấp field (tỷ số, winnerCode, thẻ phạt, timestamp), phân trang thật, và các input edge-case chưa test (locale hoa/thường, body null, type sai...).',
    endpoint: 'scheduled-v2',
    count: 26,
    layer: 'Nền tảng theo endpoint',
  },
  {
    file: '08-live-and-rare-cases.spec.ts',
    purpose: 'Field riêng của trận đang live (current/display, injury time) + case hiếm tự-dò phụ thuộc data thật: agg score, trận hoãn/huỷ, World Cup đang diễn ra.',
    endpoint: 'live-v1, live-v2, scheduled-v2',
    count: 4 + 1 + 1 + 1 + 1 + 1,
    layer: 'Nền tảng theo endpoint',
  },
  {
    file: '09-ui-navigation.spec.ts',
    purpose: 'Điều hướng UI thật: click vào trận → trang chi tiết, đổi ngày qua date-strip thật, trang Following.',
    endpoint: 'UI',
    count: 2 + 1 + 1 + 1,
    layer: 'Đối chiếu UI thật',
  },
  {
    file: '10-cross-day-regression.spec.ts',
    purpose: 'Bắt bug chỉ lộ ra khi so sánh CÙNG 1 trận giữa 2 lần chạy daily khác nhau (dùng baseline .baseline/matches.json): tỷ số/giờ đá không đổi ngầm, trận không biến mất, không treo mãi, otherCompetitions không sụt bất thường.',
    endpoint: 'scheduled-v2 (cross-day)',
    count: 1 + 1 + 1 + 1 + 1,
    layer: 'Cross-day (daily baseline)',
  },
  {
    file: '11-ui-daily-user-journey.spec.ts',
    purpose: 'Mô phỏng người dùng thật quay lại xem UI mỗi ngày (qua UI, không qua API) — tiến trình trận không lùi, trận quen thuộc không biến mất, UI không trống bất thường.',
    endpoint: 'UI (cross-day)',
    count: 1 + 1 + 1 + 1,
    layer: 'Cross-day (daily baseline)',
  },
  {
    file: '12-cross-day-extended.spec.ts',
    purpose: 'Mở rộng cross-day sang my-matches, tên đội/giải không đổi đột ngột, trận live phải tiến triển theo thời gian, otherCompetitions ổn định theo nhiều locale.',
    endpoint: 'my-matches, scheduled-v2, live-v2',
    count: 1 + 1 + 1 + 1 + 1 + 3,
    layer: 'Cross-day (daily baseline)',
  },
  {
    file: '13-extended-coverage.spec.ts',
    purpose: 'Lấp lỗ hổng coverage so với 5 doc gốc: competitionsFavorite, sortOtherMatches, offsetTimezone, giới hạn 50 teamsFavorite, 2 dạng response rỗng, type=live rỗng, startDate bắt buộc, category.name không dịch.',
    endpoint: 'scheduled-v2, my-matches',
    count: 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1,
    layer: 'Lấp lỗ hổng coverage',
  },
  {
    file: '14-full-locale-matrix.spec.ts',
    purpose: 'Mở rộng toàn diện độ phủ locale cho cả 5 endpoint — trọng tâm offsetTimezone (11 locale allowedOffsets + 10 locale không có), mở rộng ma trận locale cho scheduled-v1/live-v1/live-v2, sanity không crash với locale lạ.',
    endpoint: 'my-matches, scheduled-v1, scheduled-v2, live-v1, live-v2',
    count: 11 + 1 + 10 + 20 + 20 + 20 + 18,
    layer: 'Lấp lỗ hổng coverage',
  },
  {
    file: '15-db-cross-check.spec.ts',
    purpose: 'Đối chiếu DB nguồn thật (football @ 10.96.0.5) với API production — bắt bug pipeline đồng bộ/sai lệch mà test API/UI thuần không thấy: tên đội, giờ đá, status, tỷ số, phạt góc, trận không biến mất.',
    endpoint: 'scheduled-v2 (đối chiếu DB trực tiếp)',
    count: 1 + 1 + 1 + 1 + 1 + 1,
    layer: 'Đối chiếu DB gốc',
  },
  {
    file: '16-locale-date-boundary.spec.ts',
    purpose: 'Phát hiện toàn diện bug "trận bị xếp sai ngày theo locale" cho TOÀN BỘ 59 locale hệ thống hỗ trợ (dùng IANA timezone độc lập làm nguồn sự thật, không dùng tham số offset của chính API).',
    endpoint: 'scheduled-v2 (toàn bộ 59 locale, tab All)',
    count: 59 + 1,
    layer: 'Rà soát bổ sung (date-boundary)',
  },
  {
    file: '17-date-boundary-all-tabs.spec.ts',
    purpose: 'Mở rộng bug date-boundary (file 16) sang tab Upcoming, Finish và Live — gồm phát hiện riêng bug "Admin top match" bỏ qua offset cho GB/IE/MA ở tab Live.',
    endpoint: 'scheduled-v2 (tab upcoming/finish), live-v1, live-v2',
    count: 59 * 2 + 59 + 1,
    layer: 'Rà soát bổ sung (date-boundary)',
  },
  {
    file: '18-scheduled-v2-deep-invariants.spec.ts',
    purpose: 'Quét sâu các bất biến mô tả trong doc gốc nhưng chưa test nào che phủ: trận "mồ côi" biến mất hoàn toàn (youth_type trống), danh sách 30 đội top-list cố định, matchesFavorite không loại trận khỏi gợi ý, trận không trùng nhiều nhóm.',
    endpoint: 'scheduled-v2',
    count: 1 + 1 + 1 + 1,
    layer: 'Rà soát bổ sung (deep invariants)',
  },
  {
    file: '19-scheduled-v1-gaps.spec.ts',
    purpose: 'Lấp 2 lỗ hổng coverage của scheduled-v1 phát hiện qua rà soát ma trận độ bao phủ: đối chiếu DB gốc (tái dùng 100% lib/db-client.ts đã verify ở v2) và phân trang thật page>1 (copy pattern đã verify ở v2, file 07). Đã khảo sát xác nhận live-v1/v2/my-matches KHÔNG khả thi cho 2 hạng mục này (lý do kỹ thuật khác nhau mỗi endpoint — xem sheet Độ bao phủ).',
    endpoint: 'scheduled-v1 (đối chiếu DB + pagination)',
    count: 5 + 4,
    layer: 'Lấp lỗ hổng coverage (vòng 2)',
  },
  {
    file: '20-scheduled-v1-full-coverage.spec.ts',
    purpose: 'Lấp toàn bộ ô còn lại của scheduled-v1: Validate riêng V1 (competitionId không giải mã được — phát hiện LỆCH DOC, sortByMatchTime ưu tiên hơn competitionId, sortOtherMatches bị bỏ qua), Toàn vẹn dữ liệu (otherCompetitions phẳng, giải không quốc gia/châu lục, match_live_count, luồng mở 1 giải, hasBracket không lan truyền), Timezone (XÁC NHẬN bug date-boundary GB/IE/PT lan sang V1), Cross-day (tái dùng baseline đã có, không cần file riêng).',
    endpoint: 'scheduled-v1 (validate + data integrity + timezone + cross-day)',
    count: 4 + 5 + 1 + 4 + 1,
    layer: 'Lấp lỗ hổng coverage (vòng 3 — toàn diện)',
  },
  {
    file: '21-my-matches-ui.spec.ts',
    purpose: 'Lấp ô cuối cùng "Đối chiếu UI thật" cho my-matches. Khảo sát lại qua Playwright MCP (bấm Add to favorites thật, bắt network) phát hiện cơ chế đúng: localStorage key "guest-favorites" — sửa lại kết luận sai trước đó (tưởng UI không gọi my-matches, thực ra do test lúc chưa có favorite). Set trước localStorage qua addInitScript, verify UI gửi đúng teamsFavorite và đối chiếu nội dung hiển thị.',
    endpoint: 'my-matches (đối chiếu UI thật)',
    count: 3,
    layer: 'Lấp lỗ hổng coverage (vòng 3 — toàn diện)',
  },
];

FILES.forEach((f, idx) => {
  const row = overview.addRow(f);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 56;
  row.getCell('count').alignment = { vertical: 'top', horizontal: 'center' };
  // Zebra stripe nhẹ để mắt dễ theo dõi hàng dài khi lướt nhanh.
  if (idx % 2 === 1) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } };
    });
  }
  row.eachCell({ includeEmpty: true }, boxBorder);
});
const totalRow = overview.addRow({
  file: 'TỔNG CỘNG',
  purpose: `${FILES.length} file test, phủ 5 endpoint chính (scheduled-v2, scheduled-v1, live-v1, live-v2, my-matches) + UI thật (uniscore.com) + đối chiếu DB gốc trực tiếp.`,
  endpoint: '',
  count: FILES.reduce((s, f) => s + f.count, 0),
  layer: '',
});
totalRow.font = { bold: true };
totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
totalRow.getCell('count').alignment = { horizontal: 'center' };
totalRow.eachCell({ includeEmpty: true }, (cell) => {
  cell.border = { top: { style: 'medium', color: { argb: 'FF1F4E78' } }, bottom: THIN, left: THIN, right: THIN };
});

// ============================================================================
// Sheet 2: Chi tiết từng test case
// ============================================================================
const detail = workbook.addWorksheet('2. Chi tiết từng case');
styleSheet(detail);
detail.columns = [
  { header: 'File', key: 'file', width: 30 },
  { header: 'Describe', key: 'describe', width: 42 },
  { header: 'Tên test', key: 'test', width: 55 },
  { header: 'Mô tả ngắn (bất biến kiểm tra)', key: 'desc', width: 55 },
  { header: 'SL', key: 'count', width: 8 },
];
detail.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
detail.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
detail.getRow(1).height = 22;
detail.getRow(1).alignment = { vertical: 'middle' };
detail.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
detail.autoFilter = { from: 'A1', to: 'E1' };

const CASES = [
  // FILE 01
  ['01-scheduled-v2.spec.ts', 'scheduled-v2 · {locale} · {date} · all (động, ~56 tổ hợp locale×ngày)', 'response hợp lệ: code 1, trang 1, size 5000, không trùng trận', 'Verify code=1, pagination page/size đúng, events/otherCompetitions là mảng, không trùng id', 56],
  ['01-scheduled-v2.spec.ts', '″', 'khối gợi ý (suggestion=1) nằm liền nhau ở đầu danh sách', 'Verify các trận suggestion=1 gom thành khối liền ở đầu', 56],
  ['01-scheduled-v2.spec.ts', '″', 'trận cùng bảng được gom liền nhau (group_id, UOB-613)', 'Verify trận cùng group_id không bị tách rời', 56],
  ['01-scheduled-v2.spec.ts', '″', 'otherCompetitions: quốc gia người dùng → châu lục theo thứ tự cố định → các quốc gia', 'Verify thứ tự nhóm category theo CATEGORY_ORDER', 56],
  ['01-scheduled-v2.spec.ts', '″', 'pagination.total ≥ events + tổng match_count otherCompetitions, lệch ≤ 5%', 'Verify tổng số trận tính được không lệch quá 5% so với total', 56],
  ['01-scheduled-v2.spec.ts', '″ (chỉ ngày quá khứ)', 'ngày đã qua: match_live_count của mọi nhóm = 0', 'Ngày quá khứ không còn nhóm nào live', 14],
  ['01-scheduled-v2.spec.ts', '″ (chỉ ngày quá khứ)', 'ngày đã qua: không còn trận treo (chưa đá/hoãn/huỷ quá 2 giờ)', 'Ngày quá khứ không còn status treo', 14],
  ['01-scheduled-v2.spec.ts', 'scheduled-v2 · lọc theo type', 'type=finish chỉ có trận kết thúc (100/110/120)', 'Lọc type=finish chỉ trả status code kết thúc', 1],
  ['01-scheduled-v2.spec.ts', '″', 'type=upcoming chỉ có trận chưa đá (0)', 'Lọc type=upcoming chỉ trả status code 0', 1],
  ['01-scheduled-v2.spec.ts', 'scheduled-v2 · luồng phụ', 'competitionIds (mở 1 nhóm): chỉ trận của nhóm, không gợi ý, otherCompetitions rỗng', 'Mở 1 nhóm giải trả đúng tập trận', 1],
  ['01-scheduled-v2.spec.ts', '″', 'sortByMatchTime: 100 trận/trang, sắp đơn điệu theo giờ, otherCompetitions rỗng (động, 2 ngày)', 'Verify size=100, sắp đơn điệu theo startTimestamp', 2],
  ['01-scheduled-v2.spec.ts', 'scheduled-v2 · validate', 'ngày sai định dạng → code -1 "Invalid date format"', 'Validate input ngày sai', 1],
  ['01-scheduled-v2.spec.ts', '″', 'competitionIds quá 100 phần tử → HTTP 422', 'Validate giới hạn mảng', 1],

  // FILE 02
  ['02-scheduled-v1.spec.ts', 'scheduled-v1 vs v2 · {locale} · {date} (động, ~9 tổ hợp)', 'response hợp lệ, không trùng trận', 'code=1, pagination đúng, không trùng id', 9],
  ['02-scheduled-v1.spec.ts', '″', 'events cùng tập trận với V2', 'Tập id V1 và V2 bằng nhau', 9],
  ['02-scheduled-v1.spec.ts', '″', 'trận không thuộc bảng đấu: thứ tự trùng V2; thứ tự giải trùng V2', 'Thứ tự trận không group và thứ tự giải giống V2', 9],
  ['02-scheduled-v1.spec.ts', '″', 'V1 không có tournament.group_id', 'V1 không trả group_id', 9],
  ['02-scheduled-v1.spec.ts', '″', 'otherCompetitions phẳng: mỗi dòng 1 giải, sắp tier tăng dần (99999 cuối)', 'Mỗi row có competition_id/match_count, tier sort tăng dần', 9],
  ['02-scheduled-v1.spec.ts', '″', 'tổng match_count V1 ≥ V2 (V1 giữ cả giải không có quốc gia/châu lục)', 'So sánh tổng match_count 2 bên', 9],
  ['02-scheduled-v1.spec.ts', 'scheduled-v1 · luồng competitionId (chỉ chạy khi bật cờ RUN_CACHE_POLLUTION_TEST)', 'mở 1 giải: chỉ trận của giải đó, topMatches [], otherCompetitions []', 'Mở 1 giải trả đúng tập trận, rỗng các field khác', 1],
  ['02-scheduled-v1.spec.ts', '″', 'BUG #1 (đã báo fix): request competitionId không làm bẩn cache trang chủ', 'Verify cache trang chủ không bị ghi đè', 1],
  ['02-scheduled-v1.spec.ts', 'scheduled-v1 · gửi nhầm trường', 'gửi nhầm competitionIds lên V1 → bị bỏ qua, trả trang chủ mặc định', 'Verify field sai tên bị bỏ qua', 1],

  // FILE 03
  ['03-live-v1.spec.ts', 'live v1 · {locale} (động, 10 locale)', 'response hợp lệ (code 1, hoặc code 2 = không có trận live)', 'Verify code hợp lệ và data rỗng khi code=2', 10],
  ['03-live-v1.spec.ts', '″', 'events: tối đa 10 giải, mỗi giải một đoạn liền nhau, không trùng trận', 'Giới hạn 10 giải, không bị tách rời, không trùng id', 10],
  ['03-live-v1.spec.ts', '″', 'mọi trận đều đang diễn ra (status.type = inprogress)', 'Mọi event có status.type=inprogress', 10],
  ['03-live-v1.spec.ts', '″', 'otherCompetitions không trùng giải trong events; total = events + tổng match_count', 'Không trùng competition_id, tổng khớp pagination.total', 10],
  ['03-live-v1.spec.ts', 'live v1 · lọc theo giải', 'competitionIds: chỉ trận của giải đó, otherCompetitions [], total = số trận', 'Lọc theo competitionIds', 1],
  ['03-live-v1.spec.ts', '″', 'competitionId (số ít) hiện vẫn bị giải mã 2 lần → trả rỗng (hành vi đã biết)', 'Ghi nhận hành vi field số ít bị decode 2 lần, không phải bug cần báo', 1],
  ['03-live-v1.spec.ts', 'live v1 · sortByMatchTime & validate', 'sortByMatchTime: tăng dần theo giờ bắt đầu, không có key otherCompetitions', 'Verify sort tăng dần, không có otherCompetitions', 1],
  ['03-live-v1.spec.ts', '″', 'competitionIds quá 100 phần tử → HTTP 422', 'Validate giới hạn mảng', 1],

  // FILE 04
  ['04-live-v2.spec.ts', 'live-v2 · {locale} (động, 10 locale)', 'response: code 1 chỉ có events + pagination; code 2 thì data rỗng', 'Verify cấu trúc response theo code', 10],
  ['04-live-v2.spec.ts', '″', 'mọi trận inprogress, không trùng, có aggHomeScore/aggAwayScore', 'Verify status, không trùng id, có field agg score', 10],
  ['04-live-v2.spec.ts', '″', 'khối gợi ý đứng đầu; trận cùng bảng liền nhau (suggestion|group_id)', 'Verify suggestion đứng đầu và group liền nhau', 10],
  ['04-live-v2.spec.ts', 'live-v2 · đối chiếu live v1 cùng thời điểm', 'số trận v2 = events v1 + trận trong otherCompetitions v1', 'Đối chiếu tổng số trận và tập hợp giữa 2 version', 1],
  ['04-live-v2.spec.ts', 'live-v2 · body', 'competitionIds bị bỏ qua → vẫn trả danh sách đầy đủ', 'Verify field này không có tác dụng lọc ở v2', 1],
  ['04-live-v2.spec.ts', '″', 'sortByMatchTime: tăng dần theo giờ bắt đầu, vẫn có aggHomeScore/aggAwayScore', 'Verify sort + cấu trúc + field agg vẫn còn', 1],

  // FILE 05
  ['05-my-matches.spec.ts', 'my-matches · validate & trường hợp rỗng', 'không có yêu thích → events [], size 50', 'Verify response rỗng mặc định', 1],
  ['05-my-matches.spec.ts', '″', 'thiếu startDate → HTTP 422', 'Validate bắt buộc startDate', 1],
  ['05-my-matches.spec.ts', '″', 'type sai → HTTP 422', 'Validate type hợp lệ', 1],
  ['05-my-matches.spec.ts', 'my-matches · VN · theo type · {label} (động, 2 bộ favorites)', 'all (7 ngày qua): chỉ trận của yêu thích, trong đúng ngày VN, không trận treo', 'Verify lọc theo favorites, đúng ngày, không treo', 2],
  ['05-my-matches.spec.ts', '″', 'finish (7 ngày qua): chỉ trận kết thúc 100/110/120', 'Verify lọc type=finish', 2],
  ['05-my-matches.spec.ts', '″', 'upcoming (7 ngày tới): chỉ trận chưa đá (0)', 'Verify lọc type=upcoming', 2],
  ['05-my-matches.spec.ts', '″', 'live: chỉ trận yêu thích đang diễn ra, gom theo giải', 'Verify lọc live + gom theo giải liền nhau', 2],
  ['05-my-matches.spec.ts', '″', 'response dùng homeScore.display (có mặt khi trận đã kết thúc)', 'Verify field display tồn tại đúng kiểu', 2],
  ['05-my-matches.spec.ts', 'my-matches · bug đã báo fix', 'BUG #4: GB tính ngày theo giờ Anh (BST), không theo UTC', 'Verify phân loại ngày theo Europe/London', 1],
  ['05-my-matches.spec.ts', '″', 'BUG #5: trận hoãn/huỷ thật của đội yêu thích không được biến mất khỏi my-matches type=all', 'Tự dò trận hoãn/huỷ thật, verify không bị ẩn', 1],

  // FILE 06
  ['06-ui-vs-api.spec.ts', 'UI vs API — tab All — {label} ({date}) (động, 3 ngày)', 'toàn bộ trận trên UI khớp đúng thứ tự + tên đội với API scheduled-v2', 'So khớp tên đội + thứ tự UI với API (ngưỡng ≤5% lệch)', 3],
  ['06-ui-vs-api.spec.ts', '″', 'số trận hiển thị trên UI tab All khớp số lượng events trả về từ API', 'Đếm số trận UI nhận diện được so với API', 3],
  ['06-ui-vs-api.spec.ts', 'UI vs API — tab Live', 'trận live hiển thị trên UI (nếu có) khớp với API live-v2', 'Verify trận live đầu tiên xuất hiện trên UI tab Live', 1],
  ['06-ui-vs-api.spec.ts', 'UI vs API — tab Upcoming', 'N trận đầu của tab Upcoming trên UI khớp API (status chưa đá)', 'Verify tối đa 10 trận đầu xuất hiện đúng trên UI', 1],
  ['06-ui-vs-api.spec.ts', 'UI vs API — tab Finished', 'N trận đầu của tab Finished trên UI khớp API (có tỷ số)', 'Verify tên đội + tỷ số hiển thị đúng', 1],
  ['06-ui-vs-api.spec.ts', 'UI vs API — trận mất tích / sai thứ tự (tab All)', 'không có trận nào bị MẤT HOÀN TOÀN khỏi UI tab All', 'Verify trận có mặt ở UI (bất kỳ vị trí nào)', 1],
  ['06-ui-vs-api.spec.ts', '″', 'thứ tự hiển thị trên UI không bị ĐẢO NGƯỢC so với API', 'Verify vị trí UI tăng dần đơn điệu theo thứ tự API', 1],
  ['06-ui-vs-api.spec.ts', 'UI vs API — trận hiển thị SAI TAB', 'tab Upcoming không được lẫn trận ĐÃ KẾT THÚC', 'Verify API không trả finished trong tab upcoming + UI không hiện badge FT', 1],
  ['06-ui-vs-api.spec.ts', '″', 'tab Finished không được lẫn trận CHƯA DIỄN RA', 'Verify API không trả not_started trong tab finish + UI không hiện giờ kickoff', 1],
  ['06-ui-vs-api.spec.ts', 'UI vs API — trận gần ranh giới ngày hiển thị đúng ngày', 'trận đá sát nửa đêm giờ địa phương UI phải thấy trên UI đúng ngày', 'Verify trận biên giới ngày không bị kẹt sai ngày trên UI', 1],
  ['06-ui-vs-api.spec.ts', '″', 'trận API xác nhận sai ngày không được hiển thị trên UI như đã đá xong', 'Annotation minh hoạ bug date-boundary trên UI (không hard-fail)', 1],

  // FILE 07
  ['07-data-integrity.spec.ts', 'data integrity · tỷ số trận kết thúc', 'display = period1 + period2 + overTime_score_only (nếu có)', 'Verify công thức cộng tỷ số display', 1],
  ['07-data-integrity.spec.ts', '″', 'ft_score_only = period1 + period2', 'Verify công thức ft_score_only', 1],
  ['07-data-integrity.spec.ts', '″', 'winnerCode hiện tại luôn = 0 trên route này (ghi nhận hành vi)', 'Ghi nhận field winnerCode luôn 0, cảnh báo nếu đổi', 1],
  ['07-data-integrity.spec.ts', '″', 'thẻ vàng/đỏ/phạt góc/sút trúng đích không âm', 'Verify các field số liệu không âm', 1],
  ['07-data-integrity.spec.ts', '″', 'trận có hiệp phụ: display vẫn cộng đúng cả 3 phần', 'Verify công thức cộng khi có hiệp phụ', 1],
  ['07-data-integrity.spec.ts', '″', 'trận có luân lưu: display 2 đội phải hòa', 'Verify luật bóng đá: có luân lưu thì display hòa', 1],
  ['07-data-integrity.spec.ts', 'data integrity · trận chưa đá / đang đá', 'trận chưa đá: homeScore/awayScore rỗng, không có thẻ phạt', 'Verify field rỗng hợp lý khi chưa đá', 1],
  ['07-data-integrity.spec.ts', '″', 'mọi trận upcoming có startTimestamp trong tương lai', 'Verify thời gian hợp lệ', 1],
  ['07-data-integrity.spec.ts', '″', 'status.code và status.type nhất quán với type filter đã yêu cầu', 'Verify status khớp filter finish/upcoming', 1],
  ['07-data-integrity.spec.ts', '″', 'time.status (khi có mặt) luôn khớp status gốc', 'Verify time.status không mâu thuẫn status', 1],
  ['07-data-integrity.spec.ts', 'data integrity · đội bóng & giải đấu', 'homeTeam.id khác awayTeam.id', 'Verify 2 đội không trùng id', 1],
  ['07-data-integrity.spec.ts', '″', 'mọi team có đủ id/name/shortName/slug không rỗng', 'Verify field team đầy đủ', 1],
  ['07-data-integrity.spec.ts', '″', 'tournament.id/name/slug và category.id/name không rỗng', 'Verify field tournament/category đầy đủ', 1],
  ['07-data-integrity.spec.ts', '″', 'slug trận (events[].slug) chứa slug của cả 2 đội (home trước away)', 'Verify format slug đúng thứ tự', 1],
  ['07-data-integrity.spec.ts', 'data integrity · pagination thật (page > 1)', 'sortByMatchTime + page=2: trả đúng size=100, không trùng trận với page=1', 'Verify phân trang không trùng', 1],
  ['07-data-integrity.spec.ts', '″', 'page vượt quá tổng số trang: trả code=-1', 'Ghi nhận hành vi hết trang trả code=-1', 1],
  ['07-data-integrity.spec.ts', '″', 'page=0 hoặc âm: bị coi như page=1 hoặc trả lỗi validate', 'Verify xử lý page không hợp lệ', 1],
  ['07-data-integrity.spec.ts', 'data integrity · input edge-case còn thiếu', 'ngày hợp lệ nhưng rất xa quá khứ (10 năm trước): không crash, trả code hợp lệ', 'Verify không crash với ngày quá khứ xa', 1],
  ['07-data-integrity.spec.ts', '″', 'ngày hợp lệ nhưng rất xa tương lai (10 năm sau): không crash, trả code hợp lệ', 'Verify không crash với ngày tương lai xa', 1],
  ['07-data-integrity.spec.ts', '″', 'locale không tồn tại (XX): không crash, không trả lỗi 5xx', 'Verify không crash với locale lạ', 1],
  ['07-data-integrity.spec.ts', '″', 'BUG: locale viết hoa "VN" vs viết thường "vn" trả events chính khác nhau', 'Phát hiện bug case-sensitivity locale', 1],
  ['07-data-integrity.spec.ts', '″', 'competitionIds rỗng [] (khác hẳn không truyền field): coi như không lọc', 'Verify [] khác undefined', 1],
  ['07-data-integrity.spec.ts', '″', 'competitionIds chứa id không tồn tại: trả events rỗng, không lỗi', 'Verify id lạ không crash', 1],
  ['07-data-integrity.spec.ts', '″', 'body thừa field lạ không có trong spec: bị bỏ qua, không lỗi', 'Verify field thừa bị bỏ qua', 1],
  ['07-data-integrity.spec.ts', '″', 'gửi body null thay vì object: không crash', 'Verify an toàn với body null', 1],
  ['07-data-integrity.spec.ts', '″', 'type viết hoa (ALL/FINISH) bị từ chối hoặc coi như không hợp lệ', 'Verify case-sensitivity của type', 1],

  // FILE 08
  ['08-live-and-rare-cases.spec.ts', 'live · field riêng của trận đang diễn ra', 'current (tỷ số hiệp đang đá) ≤ display (tổng toàn trận)', 'Verify current luôn ≤ display', 1],
  ['08-live-and-rare-cases.spec.ts', '″', 'trận live có time.status trùng status gốc, currentPeriodStartTimestamp hợp lệ', 'Verify tính nhất quán time.status + timestamp hợp lệ', 1],
  ['08-live-and-rare-cases.spec.ts', '″', 'announcedInjuryTime không âm khi có mặt', 'Verify field injury time không âm', 1],
  ['08-live-and-rare-cases.spec.ts', '″', 'status.type=inprogress chỉ gồm các code hiệp hợp lệ', 'Verify không lẫn code finished/not_started trong live', 1],
  ['08-live-and-rare-cases.spec.ts', 'live-v1 · gom theo giải (UOB-613 áp dụng cho live)', 'trận cùng group_id trong cùng giải vẫn đứng liền nhau', 'Verify group liền nhau ở live-v1', 1],
  ['08-live-and-rare-cases.spec.ts', 'case hiếm · trận lượt về (agg score)', 'khi có trận lượt về: aggHomeScore/aggAwayScore không âm, khác -1', 'Tự dò trận lượt về, verify field agg hợp lệ', 1],
  ['08-live-and-rare-cases.spec.ts', 'case hiếm · trận hoãn/huỷ (BUG #5 doc my-matches)', 'trận hoãn/huỷ trong 7 ngày qua vẫn xuất hiện ở scheduled-v2 type=all', 'Verify scheduled-v2 không ẩn trận treo', 1],
  ['08-live-and-rare-cases.spec.ts', 'case hiếm · World Cup / giải lớn đang diễn ra', 'trận cùng bảng của ĐTQG locale phải có suggestion=1', 'Tự dò World Cup, verify suggestion=1', 1],
  ['08-live-and-rare-cases.spec.ts', 'case hiếm · trận lượt về đang live', 'hiển thị đúng agg score + status inprogress', 'Verify agg score đi kèm status inprogress', 1],

  // FILE 09
  ['09-ui-navigation.spec.ts', 'UI · click vào 1 trận điều hướng đúng trang chi tiết', 'click dòng trận đầu tiên → URL chuyển sang /football/match/{slug}/{id}', 'Verify điều hướng đúng URL + đúng id', 1],
  ['09-ui-navigation.spec.ts', '″', 'trang chi tiết trận có tiêu đề chứa tên 2 đội (không phải trang lỗi)', 'Verify title hợp lệ, không phải 404', 1],
  ['09-ui-navigation.spec.ts', 'UI · đổi ngày qua date-strip thật', 'bấm nút ngày khác → URL + API call đổi đúng sang ngày đó', 'Verify click date-strip gọi đúng API + URL', 1],
  ['09-ui-navigation.spec.ts', 'UI · trang Following (/en/favorite)', 'vào được trang Following không cần đăng nhập, có 4 tab con', 'Verify trang Following truy cập được, đủ tab', 1],
  ['09-ui-navigation.spec.ts', '″', 'chưa follow gì: hiện thông báo trống, không phải danh sách giả/lỗi', 'Verify empty-state hợp lý', 1],

  // FILE 10
  ['10-cross-day-regression.spec.ts', 'cross-day · tỷ số trận finished không đổi sau khi baseline đã ghi nhận', 'mọi trận finished trong baseline cũ, nếu vẫn finished hôm nay, phải giữ nguyên tỷ số', 'Verify tỷ số finished không đổi ngầm qua các ngày', 1],
  ['10-cross-day-regression.spec.ts', '″', 'startTimestamp đã ghi nhận không âm thầm đổi', 'Verify giờ đá không đổi sau khi đã finished/inprogress', 1],
  ['10-cross-day-regression.spec.ts', 'cross-day · trận không được biến mất khỏi lịch sử', 'trận finished trong baseline cũ vẫn phải còn xuất hiện', 'Verify trận finished không biến mất khỏi API', 1],
  ['10-cross-day-regression.spec.ts', 'cross-day · trận không được kẹt mãi ở 1 trạng thái "treo"', 'trận treo từ ≥3 ngày trước, hôm nay vẫn treo y hệt → nghi ngờ data chết', 'Cảnh báo (annotation) trận treo lâu không tiến triển', 1],
  ['10-cross-day-regression.spec.ts', 'cross-day · otherCompetitions không giảm đột ngột bất thường', 'tổng match_count hôm nay không thấp hơn quá nhiều so với hôm qua', 'Phát hiện sụt giảm dữ liệu diện rộng (>70%)', 1],

  // FILE 11
  ['11-ui-daily-user-journey.spec.ts', 'daily user journey · tiến trình trận không được LÙI', 'trận đã thấy "live"/"finished" hôm qua không được quay lại "upcoming"', 'Verify tiến trình trạng thái không lùi', 1],
  ['11-ui-daily-user-journey.spec.ts', '″', 'trận đã thấy tỷ số "finished" hôm qua, hôm nay vẫn finished thì tỷ số không đổi', 'Verify tỷ số UI ổn định qua ngày', 1],
  ['11-ui-daily-user-journey.spec.ts', 'daily user journey · trận quen thuộc không biến mất khỏi UI', 'trận thuộc đúng ngày hôm nay mà baseline UI ghi nhận trước đó vẫn phải còn thấy', 'Verify trận quen thuộc không biến mất khỏi UI', 1],
  ['11-ui-daily-user-journey.spec.ts', 'daily user journey · trang không "trống bất thường"', 'số trận nhận diện trên UI hôm nay không tụt về gần 0', 'Phát hiện UI render lỗi/trống bất thường', 1],

  // FILE 12
  ['12-cross-day-extended.spec.ts', 'cross-day · my-matches (trận yêu thích)', 'trận yêu thích đã finished hôm trước, nếu vẫn finished hôm nay thì tỷ số không đổi', 'Verify tỷ số trận yêu thích ổn định', 1],
  ['12-cross-day-extended.spec.ts', '″', 'trận yêu thích đã finished (còn trong cửa sổ 7 ngày) không biến mất khỏi my-matches', 'Verify không mất trận yêu thích đã finished', 1],
  ['12-cross-day-extended.spec.ts', 'cross-day · tên đội/giải không đổi đột ngột', 'shortName của 1 đội không đổi giữa baseline cũ và hôm nay', 'Verify tên đội ổn định', 1],
  ['12-cross-day-extended.spec.ts', '″', 'tournament.name của 1 trận không đổi giữa baseline cũ và hôm nay', 'Verify tên giải ổn định', 1],
  ['12-cross-day-extended.spec.ts', 'trận live phải tiến triển theo thời gian', 'gọi lại live-v2 cách nhau ~45s: trận inprogress phải tiến triển', 'Kiểm tra (annotation) dấu hiệu pipeline live đứng', 1],
  ['12-cross-day-extended.spec.ts', 'cross-day · otherCompetitions ổn định theo từng locale (động, 3 locale)', 'tổng match_count hôm nay không sụt bất thường theo locale', 'Verify không sụt giảm dữ liệu diện rộng theo locale', 3],

  // FILE 13
  ['13-extended-coverage.spec.ts', 'competitionsFavorite · đẩy giải yêu thích lên ngay sau khối gợi ý', 'giải chưa nằm trong top mặc định phải xuất hiện sớm hơn khi đánh dấu yêu thích', 'Verify competitionsFavorite đẩy giải lên vị trí ưu tiên', 1],
  ['13-extended-coverage.spec.ts', 'sortOtherMatches · 3 chế độ sắp xếp otherCompetitions', 'server chấp nhận cả 3 giá trị hợp lệ, không lỗi', 'Verify 3 giá trị sort hợp lệ không lỗi', 1],
  ['13-extended-coverage.spec.ts', '″', 'khi có ≥3 giải cùng nhóm: alphabetical phải sắp đúng A→Z', 'Verify thứ tự alphabetical đúng', 1],
  ['13-extended-coverage.spec.ts', 'my-matches · offsetTimezone cho locale có allowedOffsets', 'offsetTimezone phải là string — gửi number bị HTTP 422', 'Validate kiểu dữ liệu offsetTimezone', 1],
  ['13-extended-coverage.spec.ts', '″', 'locale US: offsetTimezone dạng string hợp lệ không bị từ chối', 'Verify offset hợp lệ được chấp nhận', 1],
  ['13-extended-coverage.spec.ts', '″', 'trận yêu thích gần ranh giới UTC: offsetTimezone US dịch đúng ngày phân loại', 'Verify offset áp dụng đúng phân loại ngày', 1],
  ['13-extended-coverage.spec.ts', 'my-matches · giới hạn 50 teamsFavorite', 'đội ở ĐẦU mảng 56 phần tử (vượt 50) bị cắt mất', 'Verify rule cắt 50 phần tử đầu mảng', 1],
  ['13-extended-coverage.spec.ts', '″', 'đội ở CUỐI mảng 56 phần tử (trong 50 phần tử cuối) vẫn còn trận bình thường', 'Verify 50 phần tử cuối được giữ', 1],
  ['13-extended-coverage.spec.ts', 'my-matches · 2 dạng response rỗng khác nhau', 'CÓ favorite nhưng ngày đó không có trận nào → size = 5000', 'Verify size khác nhau tuỳ có/không có favorite', 1],
  ['13-extended-coverage.spec.ts', 'my-matches · type=live rỗng vẫn trả code=1', 'không có trận yêu thích nào đang live → code vẫn = 1, events = []', 'Verify my-matches không dùng code=2 như live-v2', 1],
  ['13-extended-coverage.spec.ts', 'my-matches · startDate vẫn bắt buộc dù type=live', 'thiếu startDate với type=live → vẫn bị HTTP 422', 'Validate startDate bắt buộc với mọi type', 1],
  ['13-extended-coverage.spec.ts', 'my-matches · tournament.category.name không dịch', 'gọi language=vi: category.name vẫn giữ tiếng Anh gốc', 'Verify field category.name không bị dịch', 1],

  // FILE 14
  ['14-full-locale-matrix.spec.ts', 'offsetTimezone · đầy đủ 11 locale có allowedOffsets (động)', 'offsetTimezone hợp lệ không bị từ chối', 'Verify từng locale trong 11 locale chấp nhận offset', 11],
  ['14-full-locale-matrix.spec.ts', '″', 'trận yêu thích đá quanh nửa đêm UTC: offsetTimezone dịch đúng ngày cho cả 11 locale', 'Verify offset áp dụng đúng cho toàn bộ 11 locale', 1],
  ['14-full-locale-matrix.spec.ts', 'offsetTimezone · locale KHÔNG có allowedOffsets bị bỏ qua (động, 10 locale)', 'gửi offsetTimezone hợp lệ nhưng vẫn bị bỏ qua', 'Verify offset bị ignore ở locale không hỗ trợ', 10],
  ['14-full-locale-matrix.spec.ts', 'scheduled-v1 · mở rộng locale (động, 20 locale)', 'response hợp lệ, V1 events trùng tập với V2', 'Verify tập trận V1=V2 cho nhiều locale', 20],
  ['14-full-locale-matrix.spec.ts', 'live-v1 · mở rộng locale (động, 20 locale)', 'response hợp lệ, tối đa 10 giải', 'Verify giới hạn 10 giải cho nhiều locale', 20],
  ['14-full-locale-matrix.spec.ts', 'live-v2 · mở rộng locale (động, 20 locale)', 'response hợp lệ, mọi trận inprogress', 'Verify status inprogress cho nhiều locale', 20],
  ['14-full-locale-matrix.spec.ts', 'sanity · không crash 5xx với locale lạ (động, 6 locale lạ: xx, ZZZZ, 123, rỗng, vn-VN, en_US)', 'locale lạ "{X}": scheduled-v2 không trả 5xx', 'Verify scheduled-v2 không crash 5xx với input locale dị thường', 6],
  ['14-full-locale-matrix.spec.ts', '″', 'locale lạ "{X}": my-matches không trả 5xx', 'Verify my-matches không crash 5xx với input locale dị thường', 6],
  ['14-full-locale-matrix.spec.ts', '″', 'locale lạ "{X}": live-v2 không trả 5xx', 'Verify live-v2 không crash 5xx với input locale dị thường', 6],

  // FILE 15
  ['15-db-cross-check.spec.ts', 'db · tên đội khớp giữa DB gốc và API công khai', 'home/away name trong DB khớp (chứa trong) fullName/name trên API', 'So khớp tên đội DB vs API', 1],
  ['15-db-cross-check.spec.ts', 'db · giờ đá khớp giữa DB gốc và API công khai', 'match_time (DB) khớp đúng startTimestamp (API)', 'So khớp timestamp DB vs API', 1],
  ['15-db-cross-check.spec.ts', 'db · status khớp giữa DB gốc và API công khai', 'status.type trên API khớp đúng ánh xạ status DB đã verify', 'So khớp enum status DB → API', 1],
  ['15-db-cross-check.spec.ts', 'db · tỷ số khớp giữa DB gốc và API công khai', 'home_score/away_score (DB) khớp đúng homeScore.display/awayScore.display', 'So khớp tỷ số DB vs API', 1],
  ['15-db-cross-check.spec.ts', '″', 'home_corner/away_corner (DB) khớp đúng homeCornerKicks/awayCornerKicks khi kết thúc', 'So khớp phạt góc DB vs API', 1],
  ['15-db-cross-check.spec.ts', 'db · trận trong DB không được biến mất khỏi API', 'trận DB CÓ map được id VÀ map đúng tên đội không được biến mất khỏi API', 'Sanity: phát hiện lỗi encode id toàn bộ', 1],

  // FILE 16
  ['16-locale-date-boundary.spec.ts', 'date-boundary · locale {X} (động, 59 locale)', 'trận gần ranh giới ngày (giờ địa phương) phải được API xếp đúng ngày', 'Verify trận biên giới ngày không bị kẹt sai ngày theo locale', 59],
  ['16-locale-date-boundary.spec.ts', 'date-boundary · tổng hợp cho 15 locale admin thật đang cấu hình', 'không locale nào trong danh sách admin_hot_league_locale bị lỗi xếp sai ngày trận', 'Tổng hợp kết luận cho 15 locale admin thật', 1],

  // FILE 17
  ['17-date-boundary-all-tabs.spec.ts', 'date-boundary · tab upcoming/finish · locale {X} (động, 59 locale × 2 tab)', 'trận gần ranh giới ngày phải được API xếp đúng ngày ở tab đó', 'Verify date-boundary riêng cho từng tab upcoming/finish', 118],
  ['17-date-boundary-all-tabs.spec.ts', 'date-boundary · tab live không mất trận biên giới ngày (động, 59 locale)', 'trận đang live gần ranh giới ngày vẫn xuất hiện ở live-v1/live-v2', 'Ghi nhận annotation, không hard-fail — theo dõi trận live biên giới ngày', 59],
  ['17-date-boundary-all-tabs.spec.ts', 'date-boundary · tab live · bug "Admin top match" (GB/IE/MA)', 'live-v1 GB: offset=0 vs offset=60 (BST) phải cho kết quả khác nhau trong khung giờ nhạy cảm', 'Verify bug admin top-match bỏ qua offset cho GB (hard-fail chỉ trong khung 23h-00h59 UTC)', 1],

  // FILE 18
  ['18-scheduled-v2-deep-invariants.spec.ts', 'edge case: đội futsal/bãi biển (youth_type trống) có biến mất hoàn toàn không', 'mọi trận phải xuất hiện ở events HOẶC otherCompetitions', 'Verify không có trận "mồ côi" biến mất khỏi cả 2 nơi (ngưỡng lệch <15%)', 1],
  ['18-scheduled-v2-deep-invariants.spec.ts', 'danh sách 30 đội top-list cố định (derby/single)', 'tên 30 đội top-list vẫn đúng như phụ lục doc', 'Annotation cảnh báo đổi tên đội trong top-list', 1],
  ['18-scheduled-v2-deep-invariants.spec.ts', 'matchesFavorite không loại trận khỏi khối gợi ý (hành vi đã biết)', 'trận vừa yêu thích vừa thuộc gợi ý vẫn giữ suggestion=1', 'Ghi nhận hành vi hiện tại (annotation), ticket ghi "Chưa làm"', 1],
  ['18-scheduled-v2-deep-invariants.spec.ts', '1 trận chỉ thuộc đúng 1 nhóm ưu tiên (không trùng lặp)', 'events không có id trùng lặp ở bất kỳ ngày/locale nào trong tuần', 'Verify không trùng id trong events qua nhiều ngày/locale', 1],

  // FILE 19
  ['19-scheduled-v1-gaps.spec.ts', 'db (scheduled-v1) · tên đội khớp giữa DB gốc và API công khai', 'home/away name trong DB khớp fullName/name trên API v1', 'So khớp tên đội DB vs API v1 (tái dùng lib/db-client.ts)', 1],
  ['19-scheduled-v1-gaps.spec.ts', 'db (scheduled-v1) · giờ đá khớp giữa DB gốc và API công khai', 'match_time (DB) khớp đúng startTimestamp (API v1)', 'So khớp timestamp DB vs API v1', 1],
  ['19-scheduled-v1-gaps.spec.ts', 'db (scheduled-v1) · status và tỷ số khớp', 'status.type trên API v1 khớp đúng ánh xạ status DB đã verify', 'So khớp enum status DB → API v1', 1],
  ['19-scheduled-v1-gaps.spec.ts', '″', 'home_score/away_score (DB) khớp đúng homeScore.display/awayScore.display (API v1)', 'So khớp tỷ số DB vs API v1', 1],
  ['19-scheduled-v1-gaps.spec.ts', 'db (scheduled-v1) · trận trong DB không được biến mất khỏi API', 'trận DB CÓ map được id VÀ map đúng tên đội không được biến mất khỏi API v1', 'Sanity: phát hiện lỗi encode id toàn bộ cho v1', 1],
  ['19-scheduled-v1-gaps.spec.ts', 'scheduled-v1 · pagination thật (page > 1)', 'sortByMatchTime + page=2: trả đúng size=100, không trùng trận với page=1', 'Verify phân trang v1 không trùng', 1],
  ['19-scheduled-v1-gaps.spec.ts', '″', 'page vượt quá tổng số trang (v1): trả code=-1', 'Verify hành vi hết trang v1 giống v2', 1],
  ['19-scheduled-v1-gaps.spec.ts', '″', 'page=0 hoặc âm (v1): bị coi như page=1 hoặc trả lỗi validate', 'Verify xử lý page không hợp lệ cho v1', 1],
  ['19-scheduled-v1-gaps.spec.ts', '″', 'sortByMatchTime (v1): trận sắp theo thứ tự đơn điệu tăng dần theo giờ bắt đầu', 'Verify sort đơn điệu cho v1', 1],

  // FILE 20
  ['20-scheduled-v1-full-coverage.spec.ts', 'scheduled-v1 · validate riêng V1', 'gửi competitionId không giải mã được: không lỗi 5xx (KHÁC DOC)', 'Phát hiện doc ghi "trả rỗng" nhưng thực tế trả nguyên trang chủ mặc định', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', '″', 'sortByMatchTime ĐƯỢC ƯU TIÊN HƠN competitionId khi gửi cả 2', 'Verify đúng thứ tự ưu tiên 2 field theo doc mục 02', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', '″', 'sortOtherMatches bị bỏ qua hoàn toàn trên V1', 'Verify field V2-only không có tác dụng trên V1', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', '″', 'gửi nhầm competitionIds (số nhiều, của V2) lên V1 → bị bỏ qua', 'Verify field sai tên bị bỏ qua, trả trang chủ mặc định', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', 'scheduled-v1 · toàn vẹn dữ liệu otherCompetitions', 'mỗi dòng có đủ field, tier 99999 nằm cuối', 'Verify cấu trúc + thứ tự tier danh sách phẳng V1', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', '″', 'giải KHÔNG có quốc gia/châu lục vẫn được hiện trên V1', 'Verify hành vi khác V2 (V2 loại bỏ, V1 giữ)', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', '″', 'match_live_count: chỉ tính khi type=all VÀ ngày là hôm nay', 'Verify type=finish/upcoming hoặc ngày khác luôn =0', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', 'scheduled-v1 · luồng mở 1 giải (competitionId)', 'mở 1 giải: events chỉ gồm trận giải đó, topMatches=[], otherCompetitions=[]', 'Verify luồng riêng V1 (competitionId số ít)', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', '″', 'mở giải đã nằm trong events trang chủ: trận trùng bị loại', 'Verify pagination.total ≥ events.length (total tính trước khi loại)', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', 'scheduled-v1 · hasBracket KHÔNG lan truyền cho cả giải', 'nếu 1 giải có cả trận hasBracket true/false, không đồng loạt true như V2', 'Tự dò giải có bracket hỗn hợp, verify không lan (annotation)', 1],
  ['20-scheduled-v1-full-coverage.spec.ts', 'scheduled-v1 · timezone/date-boundary (động, GB/IE/PT/VN)', 'trận gần ranh giới ngày phải được API V1 xếp đúng ngày', 'XÁC NHẬN bug date-boundary đã biết ở V2 cũng tồn tại thật ở V1', 4],
  ['20-scheduled-v1-full-coverage.spec.ts', 'cross-day (V1) · tỷ số trận finished không đổi khi gọi lại qua V1', 'trận finished trong baseline (ghi qua V2), gọi lại BẰNG V1 vẫn cùng tỷ số', 'Tái dùng baseline đã có (event id dùng chung V1/V2)', 1],

  // FILE 21
  ['21-my-matches-ui.spec.ts', 'UI thật (my-matches) · set trước favorite qua localStorage', 'sau khi set teamsFavorite trước, trang chủ gọi my-matches với ĐÚNG teamsFavorite đã set', 'Verify UI đọc đúng localStorage "guest-favorites" và gửi lên API', 1],
  ['21-my-matches-ui.spec.ts', '″', 'trang Following (/en/favorite) hiển thị đúng trận của đội đã set favorite', 'Đối chiếu nội dung UI với response my-matches thật (locale bắt qua network)', 1],
  ['21-my-matches-ui.spec.ts', '″', 'bỏ favorite (đội giả không tồn tại): trang Following không hiển thị nhầm dữ liệu', 'Verify empty-state đúng, không còn sót state cũ', 1],
];

let prevFileForZebra = null;
let zebraToggle = false;
CASES.forEach(([file, describe, testName, desc, count]) => {
  const row = detail.addRow({ file, describe, test: testName, desc, count });
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 38;
  row.getCell('count').alignment = { vertical: 'top', horizontal: 'center' };
  // Zebra theo TỪNG FILE (không theo từng dòng) — giúp mắt phân biệt ranh
  // giới giữa các file khi lướt nhanh qua danh sách dài 146 dòng.
  if (file !== prevFileForZebra) { zebraToggle = !zebraToggle; prevFileForZebra = file; }
  if (zebraToggle) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } };
    });
  }
  row.eachCell({ includeEmpty: true }, boxBorder);
});

// ============================================================================
// Sheet 3: Ma trận độ bao phủ (endpoint/tab × loại kiểm tra)
// ============================================================================
const coverage = workbook.addWorksheet('3. Độ bao phủ');
styleSheet(coverage);

// Thang đo mức độ phủ: 3 = sâu (nhiều test, nhiều locale/ngày), 2 = vừa (có
// test chuyên biệt), 1 = nhẹ (chỉ gián tiếp / qua đối chiếu), 0 = chưa phủ.
const COVERAGE_LEVELS = {
  3: { label: 'Sâu', color: 'FF2E7D32' },
  2: { label: 'Vừa', color: 'FF9E9D24' },
  1: { label: 'Nhẹ', color: 'FFE65100' },
  0: { label: 'Chưa phủ', color: 'FFB71C1C' },
  // Mức riêng cho "đã xem xét kỹ, xác nhận KHÔNG THỂ test tự động được vì lý
  // do kỹ thuật của chính hệ thống" — KHÁC HẲN "Chưa phủ" (nghĩa là có thể
  // làm nhưng chưa làm). Màu xanh dương trung tính để không lẫn với đỏ "còn
  // thiếu sót", đảm bảo người đọc thấy ngay đây là ô ĐÃ ĐƯỢC ĐÁNH GIÁ đầy đủ,
  // không phải bị bỏ sót.
  N: { label: 'N/A', color: 'FF34548A' },
};

const COVERAGE_DIMENSIONS = [
  'Cấu trúc & bất biến cơ bản',
  'Validate input / edge-case',
  'Toàn vẹn dữ liệu field',
  'Phân trang thật',
  'Timezone / date-boundary',
  'Locale matrix (nhiều quốc gia)',
  'Cross-day (baseline nhiều ngày)',
  'Đối chiếu UI thật',
  'Đối chiếu DB gốc',
];

const COVERAGE_MATRIX = {
  'scheduled-v2': {
    'Cấu trúc & bất biến cơ bản': [3, 'File 01: gợi ý, gom bảng, otherCompetitions, merge priority — 56 tổ hợp locale×ngày'],
    'Validate input / edge-case': [3, 'File 01, 07: ngày sai định dạng, competitionIds >100, locale hoa/thường, body null, type sai, ngày xa 10 năm'],
    'Toàn vẹn dữ liệu field': [3, 'File 07: công thức tỷ số, winnerCode, thẻ phạt, status nhất quán, field team/tournament đầy đủ'],
    'Phân trang thật': [2, 'File 07: page>1 không trùng, page vượt quá, page 0/âm'],
    'Timezone / date-boundary': [3, 'File 16/17: quét toàn bộ 59 locale, cả tab All/Upcoming/Finish — phát hiện bug GB/IE/PT/MA + diện rộng châu Âu'],
    'Locale matrix (nhiều quốc gia)': [3, 'File 01, 14: tới 56 tổ hợp locale×ngày, offsetTimezone 11+10 locale, sanity 6 locale lạ'],
    'Cross-day (baseline nhiều ngày)': [3, 'File 10, 12: tỷ số/giờ đá không đổi ngầm, trận không biến mất, không treo mãi, otherCompetitions ổn định theo locale'],
    'Đối chiếu UI thật': [3, 'File 06, 09, 11: cả 4 tab, điều hướng, date-strip, hành trình người dùng nhiều ngày'],
    'Đối chiếu DB gốc': [3, 'File 15: tên đội, giờ đá, status, tỷ số, phạt góc, trận không mất đồng bộ'],
  },
  'scheduled-v1': {
    'Cấu trúc & bất biến cơ bản': [3, 'File 02: đối chiếu tập trận, thứ tự, otherCompetitions phẳng với V2'],
    'Validate input / edge-case': [3, 'File 20 (mới 2026-10-16): competitionId không giải mã được (phát hiện lệch doc!), sortByMatchTime ưu tiên hơn competitionId, sortOtherMatches bị bỏ qua, gửi nhầm competitionIds'],
    'Toàn vẹn dữ liệu field': [3, 'File 20 (mới 2026-10-16): otherCompetitions phẳng (tier/field đầy đủ), giải không quốc gia/châu lục vẫn hiện, match_live_count chỉ tính type=all+hôm nay, luồng mở 1 giải (competitionId), hasBracket không lan truyền'],
    'Phân trang thật': [3, 'File 19: sortByMatchTime + page=2, page vượt quá, page 0/âm, thứ tự đơn điệu — copy đúng pattern đã verify ở V2 (file 07)'],
    'Timezone / date-boundary': [3, 'File 20 (mới 2026-10-16): quét GB/IE/PT/VN — XÁC NHẬN bug date-boundary đã biết ở V2 CŨNG XUẤT HIỆN THẬT trên V1 (đúng giả thuyết "chung 1 pipeline" trong doc mục 01)'],
    'Locale matrix (nhiều quốc gia)': [2, 'File 14: mở rộng 20 locale, verify tập trận trùng V2'],
    'Cross-day (baseline nhiều ngày)': [2, 'File 20 (mới 2026-10-16): tái dùng CHÍNH baseline đã có (ghi bởi file 10 qua V2) để verify tỷ số trận finished không đổi khi gọi lại BẰNG V1 — không cần file baseline riêng vì event id dùng chung giữa V1/V2'],
    'Đối chiếu UI thật': ['N', 'KHÔNG KHẢ THI/KHÔNG CẦN THIẾT (đã xác nhận lại qua Playwright MCP 2026-10-16: UI chỉ gọi scheduled-events-pagination-v2, không bao giờ gọi route V1) — khác hẳn live-v1 (xem bên dưới), đây là do V1 chỉ còn ~1.200 request/ngày từ client cũ, web hiện tại không dùng'],
    'Đối chiếu DB gốc': [3, 'File 19: tên đội, giờ đá, status, tỷ số, trận không mất đồng bộ — tái dùng 100% lib/db-client.ts đã verify ở V2'],
  },
  'live-v1': {
    'Cấu trúc & bất biến cơ bản': [3, 'File 03: giới hạn 10 giải, inprogress, otherCompetitions không trùng'],
    'Validate input / edge-case': [2, 'File 03: competitionIds >100; bug competitionId số ít đã ghi nhận'],
    'Toàn vẹn dữ liệu field': [2, 'File 08: current≤display, time.status, injury time, status code hợp lệ'],
    'Phân trang thật': ['N', 'KHÔNG ÁP DỤNG (đã khảo sát 2026-10-16): doc xác nhận live luôn size=5000, không có cơ chế tạo trang 2 thật — không phải thiếu sót, API không hỗ trợ'],
    'Timezone / date-boundary': [2, 'File 17: phát hiện bug riêng "Admin top match" bỏ qua offset cho GB/IE/MA'],
    'Locale matrix (nhiều quốc gia)': [2, 'File 03, 14: 10 + 20 locale'],
    'Cross-day (baseline nhiều ngày)': ['N', 'KHÔNG ÁP DỤNG: live phản ánh trạng thái tức thời tại 1 thời điểm, không có khái niệm baseline xuyên ngày'],
    'Đối chiếu UI thật': ['N', 'KHÔNG KHẢ THI/KHÔNG CẦN THIẾT — xác nhận TRỰC TIẾP qua Playwright MCP 2026-10-16 (bấm tab Live thật, bắt network request): UI chỉ gọi events/live-v2, KHÔNG BAO GIỜ gọi events/live (V1). Viết test UI cho V1 sẽ kiểm tra 1 route không ai dùng.'],
    'Đối chiếu DB gốc': ['N', 'KHÔNG KHẢ THI theo kiểu file 15 (đã khảo sát 2026-10-16): live đọc từ matches_real_time trong RAM pod, không query Postgres isport_sport_event trực tiếp trong request — đối chiếu DB sẽ vênh thời điểm, không đáng tin'],
  },
  'live-v2': {
    'Cấu trúc & bất biến cơ bản': [3, 'File 04: suggestion đứng đầu, group liền nhau, đối chiếu trực tiếp với v1'],
    'Validate input / edge-case': [1, 'File 04: competitionIds bị bỏ qua (ghi nhận hành vi)'],
    'Toàn vẹn dữ liệu field': [2, 'File 08: current≤display, agg score, injury time (dùng chung cơ chế live)'],
    'Phân trang thật': ['N', 'Không áp dụng (live)'],
    'Timezone / date-boundary': [2, 'File 17: theo dõi trận live biên giới ngày (annotation)'],
    'Locale matrix (nhiều quốc gia)': [2, 'File 04, 14: 10 + 20 locale'],
    'Cross-day (baseline nhiều ngày)': [1, 'File 12: verify trận live phải tiến triển theo thời gian (trong-run, không phải cross-day thật)'],
    'Đối chiếu UI thật': [2, 'File 06: tab Live đối chiếu trực tiếp với live-v2'],
    'Đối chiếu DB gốc': ['N', 'KHÔNG KHẢ THI theo kiểu file 15 — cùng lý do live-v1 (đọc RAM pod, không phải Postgres)'],
  },
  'my-matches': {
    'Cấu trúc & bất biến cơ bản': [3, 'File 05: lọc theo type (all/finish/upcoming/live), 2 bộ favorites'],
    'Validate input / edge-case': [3, 'File 05, 13: thiếu startDate, type sai, offsetTimezone kiểu sai, giới hạn 50 teamsFavorite'],
    'Toàn vẹn dữ liệu field': [2, 'File 05, 13: homeScore.display, category.name không dịch, 2 dạng response rỗng'],
    'Phân trang thật': ['N', 'KHÔNG ÁP DỤNG (đã khảo sát 2026-10-16): doc xác nhận page luôn 1, size cố định 50/5000, field page "được validate nhưng không dùng" — API không có cơ chế trang 2 thật'],
    'Timezone / date-boundary': [3, 'File 05, 13, 14: bug GB đã biết (BST), offsetTimezone 11+10 locale, trận gần ranh giới UTC'],
    'Locale matrix (nhiều quốc gia)': [2, 'File 14: offsetTimezone theo 21 locale (11 allowedOffsets + 10 không)'],
    'Cross-day (baseline nhiều ngày)': [2, 'File 12: tỷ số trận yêu thích ổn định, không biến mất khỏi cửa sổ 7 ngày'],
    'Đối chiếu UI thật': [3, 'File 21 (mới 2026-10-16): SỬA LẠI kết luận sai trước đó (lúc khảo sát test lúc CHƯA có favorite nên tưởng không gọi my-matches). Điều tra lại qua Playwright MCP, bấm "Add to favorites" thật: xác định đúng cơ chế — localStorage key "guest-favorites" (Zustand), CÓ favorite thì cả trang chủ lẫn trang Following (/en/favorite) đều gọi my-matches. Viết test set trước localStorage qua page.addInitScript, verify UI gửi đúng teamsFavorite + đối chiếu nội dung hiển thị với response API thật'],
    'Đối chiếu DB gốc': ['N', 'KHÔNG KHẢ THI cho nhánh all/upcoming/finish (đã khảo sát 2026-10-16): đọc từ Elasticsearch index home_page, không phải Postgres isport_sport_event mà lib/db-client.ts đang trỏ tới. Nhánh live cùng giới hạn như live-v1/v2'],
  },
};

coverage.getCell('A1').value = 'Endpoint / Tab';
coverage.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' } };
coverage.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
coverage.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
boxBorder(coverage.getCell('A1'));
COVERAGE_DIMENSIONS.forEach((dim, i) => {
  const cell = coverage.getCell(1, i + 2);
  cell.value = dim;
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  cell.alignment = { wrapText: true, vertical: 'bottom', horizontal: 'center' };
  boxBorder(cell);
});
coverage.getColumn(1).width = 16;
for (let i = 2; i <= COVERAGE_DIMENSIONS.length + 1; i++) coverage.getColumn(i).width = 15;
coverage.getRow(1).height = 48;
coverage.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

let rIdx = 2;
for (const [endpoint, dims] of Object.entries(COVERAGE_MATRIX)) {
  const endpointCell = coverage.getCell(rIdx, 1);
  endpointCell.value = endpoint;
  endpointCell.font = { bold: true };
  endpointCell.alignment = { vertical: 'middle' };
  boxBorder(endpointCell);
  COVERAGE_DIMENSIONS.forEach((dim, i) => {
    const [level, note] = dims[dim] ?? [0, 'Chưa test'];
    const cell = coverage.getCell(rIdx, i + 2);
    cell.value = COVERAGE_LEVELS[level].label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COVERAGE_LEVELS[level].color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.note = note;
    boxBorder(cell);
  });
  coverage.getRow(rIdx).height = 24;
  rIdx++;
}

rIdx += 1;
coverage.mergeCells(rIdx, 1, rIdx, COVERAGE_DIMENSIONS.length + 1);
coverage.getCell(rIdx, 1).value = 'Chú giải mức độ  (💡 di chuột vào từng ô màu phía trên để xem lý do cụ thể)';
coverage.getCell(rIdx, 1).font = { italic: true, bold: true, size: 11 };
rIdx++;
const LEVEL_EXPLAIN = {
  '3': 'nhiều test, nhiều locale/ngày',
  '2': 'có test chuyên biệt',
  '1': 'chỉ gián tiếp/annotation',
  '0': 'chưa có test — lỗ hổng thật, có thể lấp được',
  N: 'ĐÃ ĐÁNH GIÁ, xác nhận không thể test tự động được vì lý do kỹ thuật của chính hệ thống (API không hỗ trợ, hoặc dữ liệu không ở nguồn có thể đối chiếu) — không phải thiếu sót, xem ghi chú từng ô (hover) để biết lý do cụ thể',
};
for (const [level, { label, color }] of Object.entries(COVERAGE_LEVELS)) {
  const swatch = coverage.getCell(rIdx, 1);
  swatch.value = label;
  swatch.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  swatch.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  swatch.alignment = { horizontal: 'center', vertical: 'middle' };
  boxBorder(swatch);
  coverage.mergeCells(rIdx, 2, rIdx, COVERAGE_DIMENSIONS.length + 1);
  const explainCell = coverage.getCell(rIdx, 2);
  explainCell.value = LEVEL_EXPLAIN[level] ?? '';
  explainCell.alignment = { vertical: 'middle', wrapText: true };
  coverage.getRow(rIdx).height = level === 'N' ? 32 : 18;
  rIdx++;
}

// ============================================================================
// Sheet 4: Ghi chú & quy ước chung
// ============================================================================
const notes = workbook.addWorksheet('4. Ghi chú & quy ước');
styleSheet(notes);
notes.columns = [
  { header: 'Mục', key: 'k', width: 34 },
  { header: 'Nội dung', key: 'v', width: 100 },
];
notes.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
notes.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
notes.getRow(1).height = 22;
notes.getRow(1).alignment = { vertical: 'middle' };
notes.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
const noteRows = [
  { k: '4 lớp test chính', v: '(1) Nền tảng theo endpoint (file 01-09): bất biến không phụ thuộc trận cụ thể, chạy được mỗi ngày trên data prod thật. (2) Cross-day (file 10-12): dùng file baseline (.baseline/*.json) để bắt bug chỉ lộ qua nhiều lần chạy liên tiếp — vd tỷ số đổi ngầm, trận biến mất, tiến trình lùi. (3) Lấp lỗ hổng coverage (file 13-14): rà soát lại 5 doc gốc US-4640 tìm các field/tham số/edge-case chưa được test, mở rộng ma trận locale. (4) Đối chiếu DB gốc (file 15): so khớp trực tiếp DB football @ 10.96.0.5 với API production — lớp sâu nhất, bắt bug pipeline đồng bộ mà test API/UI thuần không thấy.' },
  { k: 'Rà soát bổ sung 2026-10-16', v: 'File 16-18 là đợt mở rộng gần nhất, xuất phát từ phát hiện thật: locale KH (Campuchia) thiếu config timezone khiến trận đá sau nửa đêm bị xếp sai ngày. File 16 quét tự động toàn bộ 59 locale hệ thống hỗ trợ cho tab "Tất cả". File 17 mở rộng sang tab Upcoming/Finish/Live. File 18 quét thêm các bất biến khác trong doc gốc (câu hỏi mở, edge case) chưa được file nào che phủ. File 19-21 lấp toàn diện các ô còn trống trong ma trận độ bao phủ: scheduled-v1 (DB gốc, pagination, validate, data integrity, timezone, cross-day) và my-matches (UI thật).' },
  { k: 'Doc đã lỗi thời — phát hiện qua file 20 (2026-10-16)', v: 'Viết test bám sát docs/US-4640-home-matches/2-5-scheduled-v1.md phát hiện 2 chỗ doc KHÔNG khớp hành vi thật của API: (1) Mục 07 ghi "competitionId không giải mã được → trả response rỗng events:[]" — thực tế server trả NGUYÊN TRANG CHỦ MẶC ĐỊNH, không hề rỗng. (2) Mục 02 và 07 đều ghi response luồng mở 1 giải có field "topMatches:[]" — thực tế response CHỈ CÓ events/otherCompetitions/pagination, không có field này. Cả 2 có thể do hành vi server đã đổi sau khi viết doc (23/09/2026) — nên xác nhận lại với dev/người viết doc trước khi dùng doc làm căn cứ duy nhất cho các quyết định kỹ thuật khác liên quan 2 điểm này.' },
  { k: 'Phát hiện mới: bug date-boundary (GB/IE/PT) lan sang scheduled-v1', v: 'File 20 xác nhận: bug "trận gần nửa đêm bị xếp sai ngày" đã biết ở scheduled-v2 (do thiếu allowedOffsets cho locale có DST) CŨNG XUẤT HIỆN THẬT trên scheduled-v1 — đúng với khẳng định trong doc rằng V1/V2 dùng chung 1 pipeline tính toán (mục 01). Trước đây chỉ coi đây là bug riêng của V2, giờ cần báo dev đây là bug ở TẦNG CHUNG (shared pipeline), ảnh hưởng cả 2 version.' },
  { k: 'Giới hạn hạ tầng khi chạy local (không phải lỗi code)', v: 'Các test đối chiếu DB gốc (file 15, 19) phụ thuộc kết nối trực tiếp tới DB nội bộ football@10.96.0.5:6432 — có thể fail với lỗi "Connection terminated due to connection timeout" nếu máy chạy test không có đường mạng/VPN tới DB đó tại thời điểm chạy (đã xác nhận bằng kết nối thuần qua pg driver, không liên quan code test). Trên GitHub Actions, workflow đã cấu hình sẵn secrets FOOTBALL_DB_* nên không gặp vấn đề này nếu runner có đường mạng tới DB.' },
  { k: 'Nguyên tắc "không hard-code, không đoán mò"', v: 'Mọi test dùng ngày thực tế tại thời điểm chạy (vnDate(0) = hôm nay theo giờ VN), gọi trực tiếp API/DB thật mỗi lần chạy — không dùng fixture/mock, không giả định trước locale/trận nào sẽ fail. Vì lịch đấu thay đổi mỗi ngày, SỐ LƯỢNG TEST ĐỘNG (vd 56 tổ hợp locale×ngày ở file 01, 59 locale ở file 16) và KẾT QUẢ PASS/FAIL có thể dao động giữa các lần chạy daily — đây là đặc tính thiết kế, không phải lỗi.' },
  { k: 'Vì sao có "annotation" thay vì hard-fail', v: 'Một số test (case hiếm phụ thuộc World Cup/trận lượt về, trận live biên giới ngày, hành vi đã biết theo ticket) chỉ ghi `test.info().annotations.push(...)` thay vì assert cứng — vì điều kiện xảy ra không đều đặn (phụ thuộc lịch thi đấu thật) hoặc vì đó là hành vi đã biết/đã xác nhận không phải bug, chỉ cần theo dõi nếu thay đổi trong tương lai.' },
  { k: 'Daily chạy tự động', v: 'GitHub Actions workflow .github/workflows/us-4795-home-matches-daily.yml chạy toàn bộ 18 file mỗi ngày lúc 01:37 UTC (08:37 giờ VN), gửi kết quả tổng hợp vào nhóm Telegram. Có thể chạy tay qua tests/standard/2026-Q3-task-4795-home-matches/run-tests.sh (thêm --no-telegram để chỉ xem kết quả, không gửi).' },
  { k: 'Danh sách 59 locale quét (file 16, 17)', v: 'US, GB, AU, CA, NZ, IE, FR, DE, ES, IT, PT, NL, BE, SE, DK, NO, FI, PL, CZ, HU, AT, CH, GR, JP, CN, KR, TW, HK, TH, VN, KH, IN, SG, MY, ID, PH, IL, TR, SA, AE, QA, MX, BR, AR, CL, CO, PE, ZA, EG, MA, NG, KE, RU, UA, BY, CI, CM, GH, LA.' },
  { k: 'File liên quan khác (không phải test case)', v: 'build-bug-report.mjs: tạo file Excel riêng liệt kê các BUG đã tìm được (US-4795-bug-report-for-confirm.xlsx), khác với file này (liệt kê TOÀN BỘ phạm vi test đã viết, không chỉ bug). lib/*.ts: helper dùng chung (gọi API, baseline, so khớp UI). docs/US-4640-home-matches/*.md: tài liệu đặc tả gốc 5 endpoint, nguồn tham chiếu khi viết mọi test case.' },
];
noteRows.forEach((r, idx) => {
  const row = notes.addRow(r);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 70;
  row.getCell('k').font = { bold: true };
  if (idx % 2 === 1) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } };
    });
  }
  row.eachCell({ includeEmpty: true }, boxBorder);
});

// ============================================================================
// Điền nốt sheet 0 (Tóm tắt) — đặt ở đây vì cần FILES/CASES/COVERAGE_MATRIX
// đã có đầy đủ dữ liệu để tính số liệu ĐỘNG, không hard-code.
// ============================================================================
const totalFiles = FILES.length;
const totalCases = FILES.reduce((s, f) => s + f.count, 0);
let covSauCount = 0, covVuaCount = 0, covNhaCount = 0, covNaCount = 0, covTotalCells = 0;
for (const dims of Object.values(COVERAGE_MATRIX)) {
  for (const dim of COVERAGE_DIMENSIONS) {
    const [level] = dims[dim] ?? [0, ''];
    covTotalCells++;
    if (level === 3) covSauCount++;
    else if (level === 2) covVuaCount++;
    else if (level === 1) covNhaCount++;
    else if (level === 'N') covNaCount++;
  }
}
const covDaXacNhan = covSauCount + covVuaCount + covNhaCount + covNaCount; // mọi ô đã đánh giá, không còn "Chưa phủ"

kpiCell('B', totalFiles, 'File test', 'FF1F4E78');
kpiCell('C', totalCases, 'Test case (gồm case động)', 'FF2E7D32');
kpiCell('D', `${covDaXacNhan}/${covTotalCells}`, 'Ô ma trận đã đánh giá', 'FF2E7D32');
kpiCell('E', 5, 'Endpoint được phủ', 'FF9E9D24');

// --- Khối "Đọc nhanh trong 30 giây" ---
let r = KPI_ROW + 3;
summary.mergeCells(`B${r}:F${r}`);
summary.getCell(`B${r}`).value = 'Đọc nhanh trong 30 giây';
summary.getCell(`B${r}`).font = { bold: true, size: 13 };
summary.getCell(`B${r}`).border = { bottom: { style: 'medium', color: { argb: 'FF1F4E78' } } };
r += 1;

const QUICK_READ = [
  ['✅', `Toàn bộ ma trận độ bao phủ (${covTotalCells} ô) đã được ĐÁNH GIÁ 100% — không còn ô nào bỏ trống hay "chưa xem xét".`],
  ['🟢', `${covSauCount} ô mức "Sâu" (test kỹ, nhiều locale/ngày), ${covVuaCount} ô "Vừa", ${covNhaCount} ô "Nhẹ".`],
  ['🔵', `${covNaCount} ô "N/A" — ĐÃ XÁC NHẬN không thể test tự động vì giới hạn kỹ thuật của chính hệ thống (API không hỗ trợ phân trang/DB không đối chiếu được), không phải thiếu sót. Xem sheet "3. Độ bao phủ" để biết lý do từng ô.`],
  ['🐞', 'Bug còn hiệu lực chính: date-boundary ở GB/IE/PT (lan cả sang scheduled-v1) — dao động theo lịch đấu mỗi ngày, xem sheet bug report riêng để có link check cụ thể.'],
  ['📄', 'Sheet "1" = tổng quan theo file · "2" = chi tiết từng test case · "3" = ma trận màu độ bao phủ · "4" = ghi chú & phát hiện quan trọng (doc lỗi thời, giới hạn hạ tầng...).'],
];
for (const [icon, text] of QUICK_READ) {
  summary.getCell(`B${r}`).value = icon;
  summary.getCell(`B${r}`).font = { size: 14 };
  summary.getCell(`B${r}`).alignment = { horizontal: 'center', vertical: 'top' };
  summary.mergeCells(`C${r}:F${r}`);
  summary.getCell(`C${r}`).value = text;
  summary.getCell(`C${r}`).alignment = { wrapText: true, vertical: 'top' };
  summary.getRow(r).height = 32;
  r += 1;
}

// --- Khối ma trận độ bao phủ thu nhỏ (bản sao có màu, để không cần lật sang sheet 3) ---
r += 1;
summary.mergeCells(`B${r}:F${r}`);
summary.getCell(`B${r}`).value = 'Ma trận độ bao phủ (xem chi tiết & ghi chú ở sheet "3. Độ bao phủ")';
summary.getCell(`B${r}`).font = { bold: true, size: 13 };
summary.getCell(`B${r}`).border = { bottom: { style: 'medium', color: { argb: 'FF1F4E78' } } };
r += 1;

const miniHeaderRow = r;
summary.getCell(`B${miniHeaderRow}`).value = 'Endpoint';
boxBorder(summary.getCell(`B${miniHeaderRow}`));
summary.getCell(`B${miniHeaderRow}`).font = { bold: true };
summary.getCell(`B${miniHeaderRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
const miniCols = ['C', 'D', 'E', 'F'];
const miniDimLabels = ['Validate+Data', 'Phân trang', 'Timezone', 'UI+DB'];
miniDimLabels.forEach((label, i) => {
  const cell = summary.getCell(`${miniCols[i]}${miniHeaderRow}`);
  cell.value = label;
  cell.font = { bold: true, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  cell.alignment = { horizontal: 'center' };
  boxBorder(cell);
});
r++;

// Gộp nhóm 9 cột gốc thành 4 nhóm đại diện (lấy mức THẤP NHẤT trong nhóm —
// cách nhìn "bi quan" để không đánh giá quá lạc quan khi thu gọn).
const GROUPS = {
  'Validate+Data': ['Validate input / edge-case', 'Toàn vẹn dữ liệu field'],
  'Phân trang': ['Phân trang thật'],
  Timezone: ['Timezone / date-boundary'],
  'UI+DB': ['Đối chiếu UI thật', 'Đối chiếu DB gốc'],
};
// Gộp "bi quan đúng nghĩa": N chỉ hiện khi TOÀN BỘ cột trong nhóm đều N (thật
// sự không có gì để đánh giá bằng số). Nếu nhóm có ít nhất 1 cột là số, lấy
// giá trị NHỎ NHẤT trong các cột số đó, bỏ qua N khỏi phép so — tránh tình
// trạng 1 cột Sâu(3) + 1 cột N bị gộp sai thành N (nhìn như "chưa đánh giá"
// trong khi thực ra có 1 cột đã Sâu).
for (const [endpoint, dims] of Object.entries(COVERAGE_MATRIX)) {
  summary.getCell(`B${r}`).value = endpoint;
  summary.getCell(`B${r}`).font = { bold: true };
  boxBorder(summary.getCell(`B${r}`));
  miniDimLabels.forEach((groupLabel, i) => {
    const cols = GROUPS[groupLabel];
    const levels = cols.map((col) => (dims[col] ?? [0, ''])[0]);
    const numericLevels = levels.filter((lv) => lv !== 'N');
    const worstLevel = numericLevels.length > 0 ? Math.min(...numericLevels) : 'N';
    const cell = summary.getCell(`${miniCols[i]}${r}`);
    cell.value = COVERAGE_LEVELS[worstLevel].label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COVERAGE_LEVELS[worstLevel].color } };
    cell.alignment = { horizontal: 'center' };
    boxBorder(cell);
  });
  summary.getRow(r).height = 18;
  r++;
}

const outPath = new URL('./results/US-4795-test-plan.xlsx', import.meta.url).pathname;
await workbook.xlsx.writeFile(outPath);
console.log('Đã tạo file:', outPath);
