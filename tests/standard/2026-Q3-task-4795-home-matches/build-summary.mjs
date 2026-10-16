// Build US-4795-tong-hop.xlsx — FILE DUY NHẤT gộp báo cáo bug + tổng hợp test
// (trước đây tách nhiều file/nhiều sheet, đã gộp gọn lại theo yêu cầu, 6
// sheet): Tóm tắt, Thống kê test (theo file), Chi tiết test case (từng case
// cụ thể), Độ bao phủ (ma trận màu theo endpoint×tiêu chí), Bug (DUY NHẤT —
// gộp cả còn hiệu lực lẫn đã đóng, lọc bằng cột Trạng thái thay vì tách
// sheet), Ma trận date-boundary (bug #5 theo locale × lần chạy theo thời gian).
//
// PHẢI chạy `node build-bug-report.mjs` trước file này, vì nó đọc:
//   - US-4795-test-plan.xlsx, sheet "1. Tổng quan theo file" / "3. Độ bao phủ"
//   - results/.bug-report-internal.xlsx (output tạm của build-bug-report.mjs)
// Đọc trực tiếp từ 2 file trên (không chép tay) để không bao giờ lệch số
// liệu giữa báo cáo tóm tắt và báo cáo chi tiết.
import ExcelJS from 'exceljs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results');
const TODAY_VN = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

async function readTestPlanOverview() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(RESULTS_DIR, 'US-4795-test-plan.xlsx'));
  const sheet = wb.getWorksheet('1. Tổng quan theo file');
  const rows = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const file = row.getCell(1).value;
    if (file === 'TỔNG CỘNG') return;
    rows.push({
      file,
      purpose: row.getCell(2).value,
      endpoint: row.getCell(3).value,
      count: Number(row.getCell(4).value) || 0,
      layer: row.getCell(5).value,
    });
  });
  return rows;
}

async function readTestCaseDetails() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(RESULTS_DIR, 'US-4795-test-plan.xlsx'));
  const sheet = wb.getWorksheet('2. Chi tiết từng case');
  const rows = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const file = row.getCell(1).value;
    if (!file) return;
    rows.push({
      file,
      describe: row.getCell(2).value,
      testName: row.getCell(3).value,
      note: row.getCell(4).value,
      count: Number(row.getCell(5).value) || 0,
    });
  });
  return rows;
}

/** Đọc nguyên sheet "3. Độ bao phủ" (đã có sẵn trong US-4795-test-plan.xlsx,
 *  dạng ma trận màu endpoint × tiêu chí) — trả về đủ value + màu fill + note
 *  (comment khi hover) của từng ô để copy y nguyên sang file tổng hợp, không
 *  tính toán lại (tránh lệch số liệu giữa 2 file). */
async function readCoverageMatrix() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(RESULTS_DIR, 'US-4795-test-plan.xlsx'));
  const sheet = wb.getWorksheet('3. Độ bao phủ');
  const cells = []; // { row, col, value, fill, font, note }
  let maxRow = 0;
  let maxCol = 0;
  sheet.eachRow((row, rIdx) => {
    row.eachCell({ includeEmpty: false }, (cell, cIdx) => {
      cells.push({
        row: rIdx,
        col: cIdx,
        value: cell.value,
        fill: cell.fill && cell.fill.type === 'pattern' ? { ...cell.fill } : undefined,
        font: cell.font ? { ...cell.font } : undefined,
        alignment: cell.alignment ? { ...cell.alignment } : undefined,
        note: cell.note,
      });
      maxRow = Math.max(maxRow, rIdx);
      maxCol = Math.max(maxCol, cIdx);
    });
  });
  // Lấy luôn độ rộng cột gốc để giữ layout giống hệt bản nguồn.
  const colWidths = [];
  for (let c = 1; c <= maxCol; c++) colWidths.push(sheet.getColumn(c).width);
  const rowHeights = {};
  sheet.eachRow((row, rIdx) => { rowHeights[rIdx] = row.height; });
  return { cells, maxRow, maxCol, colWidths, rowHeights };
}

async function readBugReport() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(RESULTS_DIR, '.bug-report-internal.xlsx'));
  const sheet = wb.getWorksheet('Tổng hợp bug - US-4795 Home');
  const rows = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    rows.push({
      no: row.getCell(1).value,
      title: String(row.getCell(2).value ?? ''),
      severity: String(row.getCell(3).value ?? ''),
      endpoint: String(row.getCell(4).value ?? ''),
      symptom: String(row.getCell(5).value ?? ''),
      uiLink: String(row.getCell(6).value ?? ''),
      apiLink: String(row.getCell(7).value ?? ''),
      sample: String(row.getCell(8).value ?? ''),
      qaStatus: String(row.getCell(9).value ?? ''),
      note: String(row.getCell(11).value ?? ''),
    });
  });
  return rows;
}

const testRows = await readTestPlanOverview();
const testCaseRows = await readTestCaseDetails();
const bugRows = await readBugReport();
const coverageData = await readCoverageMatrix();

// Phân loại bug: ĐANG CÒN HIỆU LỰC (cần xem) vs ĐÃ ĐÓNG/KHÔNG PHẢI BUG (chỉ tham khảo).
function isClosed(title) {
  return /^\[(KHÔNG PHẢI BUG|ĐÃ GỠ BỎ KHỎI PHẠM VI|KHÔNG BÁO)/.test(title);
}
const openBugs = bugRows.filter((b) => !isClosed(b.title));
const closedBugs = bugRows.filter((b) => isClosed(b.title));

const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Automation';
workbook.created = new Date();

const THIN = { style: 'thin', color: { argb: 'FFD8D8D8' } };
const boxBorder = (cell) => { cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN }; };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

function styleHeaderRow(row) {
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.height = 22;
  row.alignment = { vertical: 'middle' };
}

// ============================================================================
// Sheet 0: TÓM TẮT — mở file là thấy ngay số liệu chính.
// ============================================================================
const summary = workbook.addWorksheet('Tóm tắt', { properties: { tabColor: { argb: 'FF1F4E78' } } });
summary.views = [{ showGridLines: false, zoomScale: 120 }];
summary.columns = [{ width: 4 }, { width: 26 }, { width: 26 }, { width: 26 }, { width: 26 }];

summary.mergeCells('B2:E2');
summary.getCell('B2').value = 'US-4795 — Tổng hợp Test & Bug · Trang Home (UniScore)';
summary.getCell('B2').font = { bold: true, size: 17, color: { argb: 'FF1F4E78' } };
summary.mergeCells('B3:E3');
summary.getCell('B3').value = `Cập nhật: ${TODAY_VN}`;
summary.getCell('B3').font = { italic: true, size: 10, color: { argb: 'FF808080' } };

const totalFiles = testRows.length;
const totalCases = testRows.reduce((s, r) => s + r.count, 0);

const KPI_ROW = 5;
function kpi(col, value, label, color) {
  const c = summary.getCell(`${col}${KPI_ROW}`);
  c.value = value;
  c.font = { bold: true, size: 24, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  const lc = summary.getCell(`${col}${KPI_ROW + 1}`);
  lc.value = label;
  lc.font = { size: 10, color: { argb: 'FF6B6B6B' } };
  lc.alignment = { horizontal: 'center' };
}
summary.getRow(KPI_ROW).height = 38;
kpi('B', totalFiles, 'File test đã viết', 'FF1F4E78');
kpi('C', totalCases, 'Test case (gồm case lặp)', 'FF2E7D32');
kpi('D', openBugs.length, 'Bug còn hiệu lực', 'FFB71C1C');
kpi('E', closedBugs.length, 'Đã xác định không phải bug', 'FF808080');

let r = KPI_ROW + 4;
summary.mergeCells(`B${r}:E${r}`);
summary.getCell(`B${r}`).value = 'Danh sách bug còn hiệu lực (xem chi tiết + link ở sheet "Bug", lọc cột Trạng thái)';
summary.getCell(`B${r}`).font = { bold: true, size: 13 };
summary.getCell(`B${r}`).border = { bottom: { style: 'medium', color: { argb: 'FF1F4E78' } } };
r++;

const SEV_COLOR = { Cao: 'FFB71C1C', 'Trung bình': 'FFB8860B', Thấp: 'FF808080' };
for (const b of openBugs) {
  summary.getCell(`B${r}`).value = `#${b.no}`;
  summary.getCell(`B${r}`).font = { bold: true, color: { argb: 'FF808080' } };
  summary.mergeCells(`C${r}:D${r}`);
  summary.getCell(`C${r}`).value = b.title.replace(/^\[.*?\]\s*/, '');
  summary.getCell(`C${r}`).alignment = { wrapText: true, vertical: 'top' };
  const sevCell = summary.getCell(`E${r}`);
  sevCell.value = b.severity;
  sevCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SEV_COLOR[b.severity] ?? 'FF808080' } };
  sevCell.alignment = { horizontal: 'center' };
  summary.getRow(r).height = 32;
  r++;
}

r += 1;
summary.mergeCells(`B${r}:E${r}`);
summary.getCell(`B${r}`).value = 'Số test theo file (xem chi tiết ở sheet "Thống kê test")';
summary.getCell(`B${r}`).font = { bold: true, size: 13 };
summary.getCell(`B${r}`).border = { bottom: { style: 'medium', color: { argb: 'FF1F4E78' } } };
r++;
// Gộp các layer con (3 vòng "Lấp lỗ hổng coverage") về 1 nhóm chung cho gọn —
// chi tiết từng vòng vẫn xem được ở sheet "Thống kê test"/cột File.
function simplifyLayer(layer) {
  if (/^Lấp lỗ hổng coverage/.test(layer)) return 'Lấp lỗ hổng coverage';
  if (/^Rà soát bổ sung/.test(layer)) return 'Rà soát bổ sung (date-boundary + bất biến sâu)';
  return layer;
}
const byLayer = {};
for (const t of testRows) {
  const key = simplifyLayer(t.layer);
  byLayer[key] = (byLayer[key] ?? 0) + t.count;
}
for (const [layer, count] of Object.entries(byLayer)) {
  summary.getCell(`B${r}`).value = layer;
  summary.mergeCells(`C${r}:D${r}`);
  summary.getCell(`C${r}`).value = '';
  summary.getCell(`E${r}`).value = count;
  summary.getCell(`E${r}`).font = { bold: true };
  summary.getCell(`E${r}`).alignment = { horizontal: 'center' };
  r++;
}

// ============================================================================
// Sheet 1: THỐNG KÊ TEST — đã viết bao nhiêu, ở file nào.
// ============================================================================
const stats = workbook.addWorksheet('Thống kê test');
stats.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
stats.columns = [
  { header: 'File', key: 'file', width: 34 },
  { header: 'Nội dung test', key: 'purpose', width: 62 },
  { header: 'Endpoint', key: 'endpoint', width: 30 },
  { header: 'Nhóm', key: 'layer', width: 24 },
  { header: 'Số case', key: 'count', width: 10 },
];
styleHeaderRow(stats.getRow(1));
stats.autoFilter = { from: 'A1', to: 'E1' };

testRows.forEach((t, idx) => {
  const row = stats.addRow(t);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 50;
  row.getCell('count').alignment = { vertical: 'top', horizontal: 'center' };
  row.getCell('count').font = { bold: true };
  if (idx % 2 === 1) {
    row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } }; });
  }
  row.eachCell({ includeEmpty: true }, boxBorder);
});
const totalRow = stats.addRow({ file: 'TỔNG CỘNG', purpose: `${totalFiles} file`, endpoint: '', layer: '', count: totalCases });
totalRow.font = { bold: true };
totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
totalRow.getCell('count').alignment = { horizontal: 'center' };
totalRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = { top: { style: 'medium', color: { argb: 'FF1F4E78' } }, bottom: THIN, left: THIN, right: THIN }; });

// ============================================================================
// Sheet: CHI TIẾT TEST CASE — từng case cụ thể (không chỉ tổng theo file).
// ============================================================================
const caseSheet = workbook.addWorksheet('Chi tiết test case');
caseSheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
caseSheet.columns = [
  { header: 'File', key: 'file', width: 32 },
  { header: 'Describe (nhóm test)', key: 'describe', width: 45 },
  { header: 'Tên test case', key: 'testName', width: 45 },
  { header: 'Mô tả ngắn (bất biến kiểm tra)', key: 'note', width: 55 },
  { header: 'SL tổ hợp', key: 'count', width: 10 },
];
styleHeaderRow(caseSheet.getRow(1));
caseSheet.autoFilter = { from: 'A1', to: 'E1' };

let lastCaseFile = null;
testCaseRows.forEach((t, idx) => {
  const row = caseSheet.addRow(t);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 40;
  row.getCell('count').alignment = { vertical: 'top', horizontal: 'center' };
  row.getCell('count').font = { bold: true };
  const newFile = t.file !== lastCaseFile;
  lastCaseFile = t.file;
  if (newFile) {
    row.eachCell({ includeEmpty: true }, (cell) => { cell.border = { top: { style: 'medium', color: { argb: 'FF1F4E78' } }, bottom: THIN, left: THIN, right: THIN }; });
  } else {
    row.eachCell({ includeEmpty: true }, boxBorder);
  }
  if (idx % 2 === 1) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } };
    });
  }
});
const totalCaseRow = caseSheet.addRow({ file: 'TỔNG CỘNG', describe: '', testName: '', note: `${testCaseRows.length} dòng mô tả`, count: testCaseRows.reduce((s, t) => s + t.count, 0) });
totalCaseRow.font = { bold: true };
totalCaseRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
totalCaseRow.getCell('count').alignment = { horizontal: 'center' };
totalCaseRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = { top: { style: 'medium', color: { argb: 'FF1F4E78' } }, bottom: THIN, left: THIN, right: THIN }; });

// ============================================================================
// Sheet mới: ĐỘ BAO PHỦ — copy nguyên ma trận màu từ US-4795-test-plan.xlsx
// (sheet "3. Độ bao phủ") để xem được ngay trong file tổng hợp, không cần mở
// thêm file khác. Giữ nguyên value/màu/ghi chú hover của bản gốc.
// ============================================================================
const coverageSheet = workbook.addWorksheet('Độ bao phủ', { properties: { tabColor: { argb: 'FF2E7D32' } } });
coverageSheet.views = [{ showGridLines: false }];
for (let c = 1; c <= coverageData.maxCol; c++) {
  coverageSheet.getColumn(c).width = coverageData.colWidths[c - 1] ?? 15;
}
for (const cellData of coverageData.cells) {
  const cell = coverageSheet.getCell(cellData.row, cellData.col);
  cell.value = cellData.value;
  if (cellData.fill) cell.fill = cellData.fill;
  if (cellData.font) cell.font = cellData.font;
  if (cellData.alignment) cell.alignment = cellData.alignment;
  if (cellData.note) cell.note = cellData.note;
  boxBorder(cell);
}
for (const [rIdx, h] of Object.entries(coverageData.rowHeights)) {
  if (h) coverageSheet.getRow(Number(rIdx)).height = h;
}

// ============================================================================
// Sheet: BUG — DUY NHẤT, gộp cả bug còn hiệu lực lẫn đã đóng (cột "Trạng
// thái" + autoFilter để tự lọc thay vì tách sheet riêng, theo yêu cầu gọn
// lại cho dễ đọc — trước đây tách 2 sheet "Bug còn hiệu lực"/"Đã đóng" +
// thêm 3 sheet bằng chứng date-boundary riêng khiến file có 10 sheet, rối).
// Bằng chứng chi tiết bug date-boundary (23 locale, nhiều lần chạy, curl)
// gộp thẳng vào cột "Hiện tượng"/"Dữ liệu mẫu" của đúng dòng bug đó thay vì
// tách sheet, vẫn đọc được đầy đủ chỉ bằng cách mở rộng dòng.
// ============================================================================
const bugSheet = workbook.addWorksheet('Bug', { properties: { tabColor: { argb: 'FFB71C1C' } } });
bugSheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
bugSheet.columns = [
  { header: '#', key: 'no', width: 5 },
  { header: 'Trạng thái', key: 'status', width: 14 },
  { header: 'Tên bug', key: 'title', width: 42 },
  { header: 'Mức độ', key: 'severity', width: 12 },
  { header: 'Endpoint', key: 'endpoint', width: 20 },
  { header: 'Hiện tượng', key: 'symptom', width: 60 },
  { header: 'Link UI để check', key: 'uiLink', width: 40 },
  { header: 'Link/lệnh API để check', key: 'apiLink', width: 55 },
  { header: 'Dữ liệu mẫu đã verify', key: 'sample', width: 55 },
  { header: 'Ghi chú', key: 'note', width: 40 },
];
styleHeaderRow(bugSheet.getRow(1));
bugSheet.autoFilter = { from: 'A1', to: 'J1' };

for (const b of bugRows) {
  const closed = isClosed(b.title);
  const row = bugSheet.addRow({
    no: b.no,
    status: closed ? 'Đã đóng' : 'Còn hiệu lực',
    title: b.title.replace(/^\[.*?\]\s*/, ''),
    severity: b.severity,
    endpoint: b.endpoint,
    symptom: b.symptom,
    uiLink: b.uiLink,
    apiLink: b.apiLink,
    sample: b.sample,
    note: b.note,
  });
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 90;
  row.getCell('no').alignment = { vertical: 'top', horizontal: 'center' };
  const statusCell = row.getCell('status');
  statusCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: closed ? 'FF808080' : 'FF2E7D32' } };
  statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
  const sevCell = row.getCell('severity');
  sevCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SEV_COLOR[b.severity] ?? 'FF808080' } };
  sevCell.alignment = { horizontal: 'center', vertical: 'middle' };
  row.eachCell({ includeEmpty: true }, boxBorder);
  // Toàn dòng tô nhạt theo trạng thái/mức độ để scan nhanh bằng mắt.
  const rowBg = closed ? 'FFF2F2F2' : b.severity === 'Cao' ? 'FFFCE8E6' : b.severity === 'Trung bình' ? 'FFFFF6E0' : 'FFF2F2F2';
  row.eachCell({ includeEmpty: true }, (cell) => {
    if (cell !== sevCell && cell !== statusCell) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
  });
}

// ============================================================================
// Sheet: MA TRẬN NGÀY X QUỐC GIA (bug date-boundary, bug #5) — mỗi dòng 1
// locale, mỗi cột 1 lần chạy test thật theo thời gian, ô ghi pass/fail. Cho
// thấy bug dao động theo lịch đấu thật, không cố định — dữ liệu tĩnh trong
// lib/bug5-date-boundary-evidence.json (được cập nhật thủ công mỗi khi có
// lần chạy đáng chú ý mới, không tự động theo mỗi lần build).
// ============================================================================
const evidencePath = path.join(__dirname, 'lib', 'bug5-date-boundary-evidence.json');
const evidence = JSON.parse(await (await import('fs/promises')).readFile(evidencePath, 'utf8'));
const matrixData = evidence['Bug #5 - ma trận nhiều lần chạy'];
if (matrixData) {
  const matrixSheet = workbook.addWorksheet('Ma trận date-boundary', { properties: { tabColor: { argb: 'FFC0392B' } } });
  matrixData.colWidths.forEach((w, i) => { matrixSheet.getColumn(i + 1).width = w; });
  for (const row of matrixData.rows) {
    if (row.h) matrixSheet.getRow(row.r).height = row.h;
    for (const cell of row.cells) {
      const d = matrixSheet.getCell(row.r, cell.c);
      d.value = cell.v;
      if (cell.fill) d.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cell.fill } };
      if (cell.bold) d.font = { bold: true };
      boxBorder(d);
    }
  }
  matrixSheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
}

const outPath = path.join(RESULTS_DIR, 'US-4795-tong-hop.xlsx');
await workbook.xlsx.writeFile(outPath);
console.log('Đã tạo file:', outPath);
