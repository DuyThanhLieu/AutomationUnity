// Build file Excel RIÊNG cho báo cáo bug date-boundary (US-4795), chi tiết
// hơn build-bug-report.mjs: có dẫn chứng link cụ thể cho từng locale/mẫu
// trận, và 1 bảng ma trận THEO NGÀY × QUỐC GIA tổng hợp từ CÁC LẦN CHẠY THẬT
// đã lưu log (không suy đoán, không điền số liệu giả định).
//
// Nguồn dữ liệu ma trận: trích xuất trực tiếp từ log thật của 6 lần chạy
// trong 2 ngày 15-16/10/2026 (file 16/17 lưu trong /tmp lúc chạy, đã grep lại
// danh sách locale fail cho từng lần). Mỗi lần chạy ghi rõ giờ chạy thật —
// không có nghĩa "ngày X thì locale Y luôn fail/pass", chỉ ghi nhận ĐÚNG những
// gì quan sát được tại đúng thời điểm đó.
import ExcelJS from 'exceljs';

const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const SITE = 'https://uniscore.com/en';
const API_BASE = 'https://api.uni-score.com/api/v2/sport/football';

const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Automation';
workbook.created = new Date();

// ============================================================================
// Sheet 1: Bug date-boundary — chi tiết đầy đủ kèm dẫn chứng link
// ============================================================================
const sheet = workbook.addWorksheet('1. Bug date-boundary - chi tiết');
sheet.columns = [
  { header: 'Locale', key: 'locale', width: 10 },
  { header: 'Tên nước', key: 'country', width: 16 },
  { header: 'Múi giờ IANA', key: 'tz', width: 22 },
  { header: 'Tab bị ảnh hưởng', key: 'tabs', width: 18 },
  { header: 'Link UI để check (fake IP)', key: 'uiLink', width: 45 },
  { header: 'Link API curl để check', key: 'apiLink', width: 70 },
  { header: 'Trận mẫu dẫn chứng (id, 2 đội, giờ UTC)', key: 'sample', width: 60 },
  { header: 'Có trong 15 locale admin thật?', key: 'isAdmin', width: 14 },
  { header: 'Trạng thái', key: 'status', width: 40 },
];
sheet.getRow(1).font = { bold: true };
sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
sheet.views = [{ state: 'frozen', ySplit: 1 }];

const ADMIN_LOCALES = new Set(['BR', 'CI', 'CM', 'GB', 'GH', 'ID', 'IT', 'KH', 'LA', 'MY', 'NG', 'PH', 'SG', 'TH', 'VN']);

const SAMPLE_MATCH = {
  id: '54cvbml3824mvp4',
  teams: 'Toronto vs Orlando',
  utc: '2026-10-14T23:40:00Z',
};

// Dữ liệu các locale ĐÃ XÁC NHẬN fail ít nhất 1 lần trong các lần chạy thật
// 15-16/10/2026, kèm tên nước và tab quan sát được bị ảnh hưởng (gộp từ mọi
// lần chạy — xem sheet 2 để biết CHÍNH XÁC lần nào, ngày nào).
const AFFECTED_LOCALES = [
  { locale: 'GB', country: 'Anh', tz: 'Europe/London', tabs: 'All, Finish' },
  { locale: 'IE', country: 'Ireland', tz: 'Europe/Dublin', tabs: 'All, Finish' },
  { locale: 'PT', country: 'Bồ Đào Nha', tz: 'Europe/Lisbon', tabs: 'All, Finish' },
  { locale: 'MA', country: 'Morocco', tz: 'Africa/Casablanca', tabs: 'All (cần theo dõi thêm, lần gần nhất pass)' },
  { locale: 'FR', country: 'Pháp', tz: 'Europe/Paris', tabs: 'Upcoming, Finish (chỉ 1 lần, giờ cao điểm châu Âu)' },
  { locale: 'DE', country: 'Đức', tz: 'Europe/Berlin', tabs: 'Upcoming, Finish (chỉ 1 lần, giờ cao điểm châu Âu)' },
  { locale: 'ES', country: 'Tây Ban Nha', tz: 'Europe/Madrid', tabs: 'Upcoming, Finish (chỉ 1 lần, giờ cao điểm châu Âu)' },
  { locale: 'IT', country: 'Ý', tz: 'Europe/Rome', tabs: 'Upcoming, Finish (chỉ 1 lần, giờ cao điểm châu Âu)' },
  { locale: 'NL', country: 'Hà Lan', tz: 'Europe/Amsterdam', tabs: 'Upcoming, Finish (chỉ 1 lần, giờ cao điểm châu Âu)' },
  { locale: 'BE', country: 'Bỉ', tz: 'Europe/Brussels', tabs: 'Upcoming (chỉ 1 lần, giờ cao điểm châu Âu)' },
  { locale: 'AT', country: 'Áo', tz: 'Europe/Vienna', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'CH', country: 'Thuỵ Sĩ', tz: 'Europe/Zurich', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'CZ', country: 'Séc', tz: 'Europe/Prague', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'DK', country: 'Đan Mạch', tz: 'Europe/Copenhagen', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'FI', country: 'Phần Lan', tz: 'Europe/Helsinki', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'GR', country: 'Hy Lạp', tz: 'Europe/Athens', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'HU', country: 'Hungary', tz: 'Europe/Budapest', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'NO', country: 'Na Uy', tz: 'Europe/Oslo', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'PL', country: 'Ba Lan', tz: 'Europe/Warsaw', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'SE', country: 'Thuỵ Điển', tz: 'Europe/Stockholm', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'EG', country: 'Ai Cập', tz: 'Africa/Cairo', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'IL', country: 'Israel', tz: 'Asia/Jerusalem', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
  { locale: 'UA', country: 'Ukraine', tz: 'Europe/Kyiv', tabs: 'All (chỉ phát hiện qua CI, giờ cao điểm châu Âu)' },
];

for (const l of AFFECTED_LOCALES) {
  const row = sheet.addRow({
    locale: l.locale,
    country: l.country,
    tz: l.tz,
    tabs: l.tabs,
    uiLink: `${SITE}?date=${TODAY}  (fake IP sang ${l.country}, mở Home vào giờ cao điểm châu Âu ~19h-23h UTC)`,
    apiLink:
      `curl -s -X POST '${API_BASE}/scheduled-events-pagination-v2/2026-10-14/locale/${l.locale}/type/all?language=en' -H 'Content-Type: application/json' -d '{"sortByMatchTime": true}'\n` +
      `curl -s -X POST '${API_BASE}/scheduled-events-pagination-v2/2026-10-15/locale/${l.locale}/type/all?language=en' -H 'Content-Type: application/json' -d '{"sortByMatchTime": true}'\n` +
      `# So sánh: id trận ${SAMPLE_MATCH.id} có nằm đúng ngày 15/10 không (nếu KHÔNG gửi offset sẽ sai, ở ngày 14/10)`,
    sample: `${SAMPLE_MATCH.id} (${SAMPLE_MATCH.teams}), UTC=${SAMPLE_MATCH.utc} → đúng ra phải ở ngày 2026-10-15 theo giờ ${l.country}, nhưng khi KHÔNG gửi offset thì bị xếp ở ngày 2026-10-14`,
    isAdmin: ADMIN_LOCALES.has(l.locale) ? 'CÓ — ảnh hưởng user thật' : 'Không (chưa cấu hình thật)',
    status: 'Fail khi client KHÔNG gửi offset. Gửi đúng offset (vd GB/IE/PT/MA = -60) thì fix được — xem sheet 3.',
  });
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 70;
  if (ADMIN_LOCALES.has(l.locale)) {
    row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } }; });
  }
}

// ============================================================================
// Sheet 2: Ma trận THEO NGÀY × QUỐC GIA — dữ liệu THẬT trích từ log các lần
// chạy, không suy đoán. Mỗi cột là 1 lần chạy thật (ghi rõ giờ UTC + giờ VN).
// ============================================================================
const matrix = workbook.addWorksheet('2. Ma trận ngày x quốc gia');

// Dữ liệu trích xuất trực tiếp bằng grep từ log lưu trong /tmp lúc các lần
// chạy ngày 15-16/10/2026 (xem comment đầu file để biết cách trích xuất).
// KHÔNG suy diễn: "không có trong danh sách fail của lần chạy đó" = PASS lần
// đó hoặc KHÔNG CÓ MẪU TRẬN để verify (không phải "chắc chắn không bug").
const RUNS = [
  { label: 'Chạy tay 15/10, 23:20 VN (sau hotfix KH/CI/CM/GH/LA)', time: '2026-10-15 16:20 UTC', scope: 'Tab All, 60 locale', failed: ['GB', 'IE', 'MA', 'PT'] },
  { label: 'Chạy tay 16/10, 09:30 VN', time: '2026-10-16 02:30 UTC', scope: 'Tab All, 60 locale', failed: ['GB', 'IE', 'MA', 'PT'] },
  { label: 'CI daily 16/10, 10:13 VN (giờ cao điểm châu Âu)', time: '2026-10-16 03:13 UTC', scope: 'Tab All, 60 locale', failed: ['AT', 'BE', 'CH', 'CZ', 'DE', 'DK', 'EG', 'ES', 'FI', 'FR', 'GB', 'GR', 'HU', 'IE', 'IL', 'IT', 'NL', 'NO', 'PL', 'PT', 'SE', 'UA'] },
  { label: 'Chạy tay 16/10, 10:00 VN', time: '2026-10-16 03:00 UTC', scope: 'Tab All, 60 locale', failed: ['GB', 'IE', 'PT'] },
  { label: 'Chạy tay 16/10, 10:47 VN (file 17, tab Upcoming/Finish)', time: '2026-10-16 03:47 UTC', scope: 'Tab Upcoming + Finish, 60 locale', failed: ['GB(finish)', 'IE(finish)', 'FR(up+finish)', 'DE(up+finish)', 'ES(up+finish)', 'IT(up+finish)', 'PT(finish)', 'NL(up+finish)', 'BE(up)'] },
  { label: 'Chạy tay 16/10, 10:52 VN (sau tối ưu, tab All)', time: '2026-10-16 03:52 UTC', scope: 'Tab All, 60 locale', failed: ['GB', 'IE', 'PT'] },
];

const ALL_COUNTRIES_SEEN = [...new Set(RUNS.flatMap((r) => r.failed.map((f) => f.split('(')[0])))].sort();

matrix.getCell('A1').value = 'Quốc gia \\ Lần chạy';
matrix.getCell('A1').font = { bold: true };
matrix.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
RUNS.forEach((run, i) => {
  const cell = matrix.getCell(1, i + 2);
  cell.value = `${run.label}\n(${run.time})\n[${run.scope}]`;
  cell.font = { bold: true, size: 9 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  cell.alignment = { wrapText: true, vertical: 'bottom', horizontal: 'center' };
});
matrix.getColumn(1).width = 14;
for (let i = 2; i <= RUNS.length + 1; i++) matrix.getColumn(i).width = 20;
matrix.getRow(1).height = 70;
matrix.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

let mRow = 2;
for (const country of ALL_COUNTRIES_SEEN) {
  matrix.getCell(mRow, 1).value = country;
  matrix.getCell(mRow, 1).font = { bold: true };
  RUNS.forEach((run, i) => {
    const match = run.failed.find((f) => f.startsWith(country));
    const cell = matrix.getCell(mRow, i + 2);
    if (match) {
      const detail = match.includes('(') ? match.match(/\(([^)]+)\)/)[1] : 'fail';
      cell.value = `FAIL\n(${detail})`;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
    } else {
      cell.value = 'pass / không đủ mẫu';
      cell.font = { color: { argb: 'FF2E7D32' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    }
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });
  matrix.getRow(mRow).height = 36;
  mRow++;
}

mRow += 1;
const legendCell = matrix.getCell(mRow, 1);
legendCell.value = 'LƯU Ý QUAN TRỌNG:';
legendCell.font = { bold: true, color: { argb: 'FFB71C1C' } };
mRow++;
const noteLines = [
  '1. "pass / không đủ mẫu" KHÔNG có nghĩa là hết bug — bug chỉ lộ ra khi có trận THẬT rơi đúng vùng biên giờ UTC 19h-23h tại thời điểm gọi API. 1 lần chạy không bắt được mẫu không chứng minh gì.',
  '2. GB/IE/PT là 3 locale lặp lại fail ổn định nhất qua NHIỀU lần chạy khác nhau trong 2 ngày — độ tin cậy cao nhất.',
  '3. Nhóm 18 locale châu Âu khác (AT, BE, CH, CZ, DE, DK, EG, ES, FI, FR, GR, HU, IL, IT, NL, NO, PL, SE, UA) CHỈ xuất hiện fail đúng 1 lần (giờ cao điểm châu Âu 10:13 VN) — cùng nguyên nhân gốc (thiếu allowedOffsets) nhưng số lần quan sát ít hơn, cần theo dõi thêm qua daily để xác nhận tần suất.',
  '4. MA xuất hiện fail 2 lần đầu rồi pass ở các lần sau — KHÔNG kết luận đã hết bug (offset MA tại các thời điểm đó không đổi), nhiều khả năng do thiếu mẫu trận đúng lúc.',
  '5. Bảng này phản ánh ĐÚNG những gì log thật ghi nhận — không nội suy, không giả định cho ô trống.',
];
for (const line of noteLines) {
  matrix.getCell(mRow, 1).value = line;
  matrix.mergeCells(mRow, 1, mRow, RUNS.length + 1);
  matrix.getCell(mRow, 1).alignment = { wrapText: true, vertical: 'top' };
  matrix.getRow(mRow).height = 30;
  mRow++;
}

// ============================================================================
// Sheet 3: Bằng chứng offset fix — curl chi tiết đã verify
// ============================================================================
const proof = workbook.addWorksheet('3. Bằng chứng offset fix');
proof.columns = [
  { header: 'Bước', key: 'step', width: 10 },
  { header: 'Lệnh / hành động', key: 'cmd', width: 85 },
  { header: 'Kết quả quan sát được', key: 'result', width: 55 },
];
proof.getRow(1).font = { bold: true };
proof.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

const PROOF_ROWS = [
  {
    step: '1',
    cmd: `curl -s -X POST '${API_BASE}/scheduled-events-pagination-v2/2026-10-14/locale/GB/type/all?language=en' -H 'Content-Type: application/json' -d '{"sortByMatchTime": true}'`,
    result: `Trận ${SAMPLE_MATCH.id} (${SAMPLE_MATCH.teams}) CÓ mặt — xếp sai ở ngày 14/10 (đúng ra phải 15/10 theo giờ Anh BST)`,
  },
  {
    step: '2',
    cmd: `curl -s -X POST '${API_BASE}/scheduled-events-pagination-v2/2026-10-15/locale/GB/type/all?language=en&offset=-60' -H 'Content-Type: application/json' -d '{"sortByMatchTime": true}'`,
    result: `Trận ${SAMPLE_MATCH.id} CÓ mặt đúng ở ngày 15/10 khi gửi offset=-60 (đúng quy ước getTimezoneOffset: UTC+1 → offset=-60)`,
  },
  {
    step: '3',
    cmd: `curl -s -X POST '${API_BASE}/scheduled-events-pagination-v2/2026-10-14/locale/GB/type/all?language=en&offset=-60' -H 'Content-Type: application/json' -d '{"sortByMatchTime": true}'`,
    result: `Trận ${SAMPLE_MATCH.id} KHÔNG còn ở ngày 14/10 nữa — đã chuyển đúng sang 15/10`,
  },
  {
    step: '4',
    cmd: 'Lặp lại bước 2-3 cho 7 trận mẫu GB khác (Montreal vs Atlanta, DC United vs NY Red Bulls, Inter Miami vs NY City, Cincinnati vs New England Rev, Columbus vs Charlotte, Rhode Island vs Loudoun Utd)',
    result: 'Cả 7/7 trận đều fix đúng khi gửi offset=-60',
  },
  {
    step: '5',
    cmd: 'Lặp lại cho locale PT và IE với offset=-60',
    result: 'Cả 2 locale đều fix đúng tương tự GB',
  },
  {
    step: '6 (quan trọng)',
    cmd: `curl -s -X POST '${API_BASE}/scheduled-events-pagination-v2/2026-10-15/locale/VN/type/all?language=en' -d '{}'  VS  cùng URL thêm &offset=-1860 (offset cực đoan, lệch hơn 1 ngày)`,
    result: 'pagination.total VẪN GIỐNG HỆT NHAU (290) ở cả 2 lệnh — xác nhận offset không có khả năng phá hỏng locale KHÔNG bug (VN luôn đúng, bất kể offset gửi gì)',
  },
];
for (const r of PROOF_ROWS) {
  const row = proof.addRow(r);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 42;
}

proof.addRow({});
const concludeRow = proof.addRow({
  step: '',
  cmd: 'KẾT LUẬN',
  result: '',
});
concludeRow.getCell(2).font = { bold: true };
proof.addRow({
  step: '',
  cmd: 'Nguyên nhân: server dùng offset "utc" cố định trong config cho locale KHÔNG có allowedOffsets (GB, IE, hầu hết châu Âu), nên khi CLIENT KHÔNG chủ động gửi offset, ngày bị tính sai vào mùa hè (DST). Khi client GỬI ĐÚNG offset, server xử lý đúng — tức bug nằm ở việc CLIENT (web/app) có đang tự tính và gửi offset hay không, không phải server tính sai hoàn toàn.',
  result: 'Cần Allan xác nhận: UI web/app hiện tại CÓ đang tự gửi offset cho các locale châu Âu hay chưa.',
}).eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' }; });
proof.getRow(proof.rowCount).height = 60;

const outPath = new URL('./results/US-4795-bug-date-boundary-detailed.xlsx', import.meta.url).pathname;
await workbook.xlsx.writeFile(outPath);
console.log('Đã tạo file:', outPath);
