// Build file Excel tổng hợp các nghi vấn bug trang Home (US-4795) kèm link
// UI/API thật để QA tự tay confirm. Dữ liệu mẫu trong file lấy từ lần verify
// thủ công ngày 2026-10-15 — chạy lại script này để làm mới mẫu khi cần.
import ExcelJS from 'exceljs';

const TODAY = '2026-10-15';
const SITE = 'https://uniscore.com/en';
const API_DOCS_NOTE = 'Gọi bằng Postman/curl: POST https://api.uni-score.com/api/v2/sport/football/<path>';

const workbook = new ExcelJS.Workbook();
workbook.creator = 'QA Automation';
workbook.created = new Date();

const sheet = workbook.addWorksheet('Tổng hợp bug - US-4795 Home');

sheet.columns = [
  { header: '#', key: 'no', width: 5 },
  { header: 'Tên bug', key: 'title', width: 38 },
  { header: 'Mức độ', key: 'severity', width: 10 },
  { header: 'Endpoint', key: 'endpoint', width: 16 },
  { header: 'Hiện tượng', key: 'symptom', width: 55 },
  { header: 'Link UI để check', key: 'uiLink', width: 45 },
  { header: 'Link/lệnh API để check', key: 'apiLink', width: 60 },
  { header: 'Dữ liệu mẫu đã verify', key: 'sample', width: 55 },
  { header: 'Trạng thái QA', key: 'qaStatus', width: 16 },
  { header: 'Kết luận của bạn (Bug / Không phải bug / Cần hỏi dev)', key: 'confirm', width: 30 },
  { header: 'Ghi chú thêm', key: 'note', width: 30 },
];
sheet.getRow(1).font = { bold: true };
sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
sheet.views = [{ state: 'frozen', ySplit: 1 }];

const rows = [
  {
    no: 1,
    title: 'VT9 fallback — không bù đủ 10 giải khi còn giải khác',
    severity: 'Cao',
    endpoint: 'scheduled-v2',
    symptom:
      'Khi otherCompetitions còn nhiều giải/trận khác chưa hiện, danh sách events chính lẽ ra phải luôn đủ 10 KHỐI GIẢI khác nhau (theo cơ chế "bù đủ 10 giải"; 1 giải chia nhiều bảng/group thì mỗi group tính là 1 khối riêng, đã xác nhận qua ảnh UI thật — "AFC Champions League 2" hiện 4 lần cho Group C/F/G/H). Đã sửa lại cách đếm cho đúng (đếm theo tổ hợp giải+bảng thay vì chỉ theo giải) và verify lại toàn bộ — KẾT QUẢ KHÔNG ĐỔI: vẫn thiếu khối nghiêm trọng. Ví dụ rõ nhất: locale AR ngày 15/10, 38 trận trong events nhưng chỉ gói trong 4 giải/khối phân biệt, trong khi otherCompetitions còn tới 53 nhóm giải khác chưa hiện.',
    uiLink: `${SITE}?date=${TODAY}`,
    apiLink: `POST /scheduled-events-pagination-v2/${TODAY}/locale/AR/type/all  body: {}\n${API_DOCS_NOTE}`,
    sample:
      `Ngày ${TODAY}, locale AR (Argentina) — mẫu rõ nhất:\n` +
      'events: 38 trận nhưng chỉ thuộc 4 giải/khối: Copa Libertadores, Division 1, UEFA Europa League, UEFA Conference League\n' +
      'otherCompetitions: 53 nhóm giải khác vẫn chưa hiện\n' +
      '=> Còn rất nhiều dư địa để bù lên ≥10 khối nhưng hệ thống không bù.',
    qaStatus: 'Lặp lại ổn định trên hầu hết ngày/locale đã test (VN, GB, US, JP, BR, TH, DE, KR, ID, MX, EG, AU, IN, AR). Đã kiểm tra lại kỹ sau khi có nghi vấn về cách đếm (do UI hiện nhiều group cùng tên giải) — sửa cách đếm cho đúng và bug vẫn y nguyên, không phải do lỗi đếm.',
    confirm: '',
    note: 'Cách tự check: mở link UI ở cột trước (đổi ?date= sang ngày đang test), đếm số KHỐI GIẢI khác nhau hiển thị trong danh sách trận chính (không tính sidebar "Other matches") — 1 giải chia nhiều bảng thì mỗi bảng tính là 1 khối riêng (như ảnh AFC Champions League 2 chia Group C/F/G/H). Nếu sidebar còn nhiều giải mà danh sách chính chưa đủ 10 khối → đúng hiện tượng.',
  },
  {
    no: 2,
    title: 'Cache lệch tạm thời giữa scheduled-v1 và scheduled-v2 (flaky)',
    severity: 'Thấp',
    endpoint: 'scheduled-v1 / scheduled-v2',
    symptom:
      'Theo cam kết, V1 phải luôn có tổng match_count ≥ V2 (vì V1 giữ cả giải không có quốc gia/châu lục). Thỉnh thoảng (không ổn định) đo được V1 < V2 ở một vài tổ hợp ngày/locale, nhưng khi chạy lại ngay sau đó thì lại khớp bình thường.',
    uiLink: `${SITE}?date=${TODAY}`,
    apiLink:
      `POST /scheduled-events-pagination/${TODAY}/locale/VN/type/all  body: {}\n` +
      `POST /scheduled-events-pagination-v2/${TODAY}/locale/VN/type/all  body: {}\n` +
      'So sánh data.otherCompetitions (V1 là mảng phẳng, V2 là mảng nhóm) — cộng tổng match_count cả 2 bên.',
    sample:
      'Lần chạy test đầu: fail ở locale VN ngày 2026-10-17 và locale BR ngày hôm nay.\n' +
      'Chạy lại ngay sau đó (cùng ngày/locale): PASS bình thường, không lệch.\n' +
      'Nghi ngờ nguyên nhân: V1 dùng cache RAM từng pod, V2 dùng snapshot Redis — có thể lệch vài giây khi data vừa cập nhật.',
    qaStatus: 'KHÔNG ổn định — pass lại khi chạy nhiều lần liên tiếp. Có khả năng đây là flaky bình thường do cache, không phải bug cố định.',
    confirm: '',
    note: 'Không cần confirm gấp — đây là tín hiệu "theo dõi thêm" hơn là bug chắc chắn. Nếu lặp lại thường xuyên trong các lần chạy daily tới mới đáng báo dev.',
  },
  {
    no: 3,
    title: 'competitionId (số ít) vẫn trả rỗng trên live-v1 — bug cũ tái xuất hiện',
    severity: 'Trung bình - Cao',
    endpoint: 'live-v1 (/events/live)',
    symptom:
      'Bug cũ đã từng báo "đã fix": gửi competitionId (số ít, 1 giải) phải trả kết quả giống hệt gửi competitionIds (số nhiều, 1 phần tử). Verify lại hôm nay: competitionIds trả về 1 trận, nhưng competitionId lại trả về 0 trận — bug có vẻ đã tái xuất hiện, hoặc chưa từng được fix triệt để.',
    uiLink: `${SITE}`,
    apiLink:
      `POST /events/live/locale/VN  body: {"competitionIds": ["no03wnpof59rah5"]}   → kỳ vọng 1 trận\n` +
      `POST /events/live/locale/VN  body: {"competitionId": "no03wnpof59rah5"}    → đang trả 0 trận (SAI)`,
    sample:
      'Giải mẫu: United Football League (id: no03wnpof59rah5)\n' +
      'competitionIds:["no03wnpof59rah5"] → 1 trận\n' +
      'competitionId:"no03wnpof59rah5" → 0 trận',
    qaStatus: 'Verify lại hôm nay vẫn tái hiện đúng như mô tả — fail ổn định, không phải flaky.',
    confirm: '',
    note: 'Lưu ý: giải mẫu cụ thể ở trên chỉ đúng tại thời điểm test (phụ thuộc có trận live lúc đó) — nếu giải này hết live khi bạn check lại, tìm 1 giải đang có trận live khác trên UI rồi lấy competition id tương ứng để test lại.',
  },
  {
    no: 4,
    title: '[KHÔNG PHẢI BUG] Slug trận "lệch" so với slug đội — do 2 quy tắc đặt tên khác nhau',
    severity: 'Không áp dụng',
    endpoint: 'scheduled-v2',
    symptom:
      'Ban đầu nghi ngờ event.slug không chứa đúng slug của 2 đội theo thứ tự (vd slug trận "bodo-glimt-borussia-dortmund" nhưng team.slug lại là "bodoglimt"/"dortmund", không có dấu gạch nối ở "bodoglimt"). Sau khi verify kỹ: event.slug dùng TÊN ĐẦY ĐỦ chuẩn hoá có gạch nối (full name: "Bodo Glimt" -> "bodo-glimt"), còn team.slug dùng slug riêng rút gọn không gạch nối ("bodoglimt") — đây là 2 quy tắc đặt tên khác nhau một cách CÓ CHỦ ĐÍCH, không phải lỗi dữ liệu.',
    uiLink: `${SITE}/football/match/bodo-glimt-borussia-dortmund/4m9appl66oolr6b`,
    apiLink: 'Không cần gọi lại — đã xác nhận rõ qua field homeTeam.fullName/slug và awayTeam.fullName/slug trong response scheduled-v2.',
    sample:
      'Trận mẫu: Bodo/Glimt vs Borussia Dortmund\n' +
      'team.slug: "bodoglimt" (không gạch nối) vs "dortmund"\n' +
      'event.slug: "bodo-glimt-borussia-dortmund" (dùng fullName, có gạch nối)\n' +
      '=> Cùng 1 trận, chỉ khác quy tắc tạo slug ở 2 cấp dữ liệu khác nhau.',
    qaStatus: 'ĐÃ XÁC ĐỊNH: không phải bug, là lỗi giả định sai trong cách viết test (test cũ so sánh nhầm 2 slug theo 2 quy tắc khác nhau). Đưa vào đây chỉ để bạn nắm được, KHÔNG cần confirm.',
    confirm: 'Không cần - đã xác định rõ không phải bug',
    note: 'Test tự động sẽ được cập nhật lại để không báo nhầm case này nữa.',
  },
  {
    no: 5,
    title: 'locale="VN" (hoa) và locale="vn" (thường) trả SỐ TRẬN KHÁC NHAU — đã xác nhận ổn định',
    severity: 'Cao',
    endpoint: 'scheduled-v2',
    symptom:
      'Cùng 1 ngày, cùng ý nghĩa locale (Việt Nam), chỉ khác cách viết hoa/thường, nhưng trả về SỐ TRẬN KHÁC NHAU trong danh sách chính (events). Đã verify lặp lại nhiều lần ở các ngày khác nhau, luôn cho kết quả khác nhau ổn định — không phải do data đổi giữa 2 lần gọi.',
    uiLink: `${SITE}?date=${TODAY}`,
    apiLink:
      `POST /scheduled-events-pagination-v2/${TODAY}/locale/VN/type/all  body: {}\n` +
      `POST /scheduled-events-pagination-v2/${TODAY}/locale/vn/type/all  body: {}\n` +
      'So sánh data.events.length giữa 2 lần gọi — chỉ khác chữ hoa/thường ở locale.',
    sample:
      `Ngày ${TODAY}:\n` +
      'locale=VN (hoa): 54 trận\n' +
      'locale=vn (thường): 29 trận\n' +
      'Chênh lệch rất lớn (gần gấp đôi), đã verify lại nhiều lần đều cho kết quả tương tự.',
    qaStatus: 'Verify ổn định qua nhiều lần chạy ở các ngày khác nhau — đây là bug có độ tin cậy cao nhất trong danh sách này.',
    confirm: '',
    note: 'Rủi ro thật: nhiều hệ thống/client (web, app, đối tác) có thể gửi locale với format hoa/thường khác nhau tùy chỗ — không phải trường hợp lý thuyết hiếm gặp.',
  },
  {
    no: 6,
    title: '[THEO DÕI] scheduled-v1 vs v2 locale BR từng lệch, verify lại thì khớp',
    severity: 'Thấp',
    endpoint: 'scheduled-v1 / scheduled-v2',
    symptom:
      'Lần chạy test tự động đầu tiên phát hiện locale BR (Brazil) có tập trận KHÔNG khớp giữa V1 và V2. Verify lại thủ công ngay sau đó (cùng ngày): V1 và V2 khớp hoàn toàn (0 trận lệch cả 2 chiều).',
    uiLink: `${SITE}?date=${TODAY}`,
    apiLink:
      `POST /scheduled-events-pagination/${TODAY}/locale/BR/type/all  body: {}\n` +
      `POST /scheduled-events-pagination-v2/${TODAY}/locale/BR/type/all  body: {}`,
    sample:
      'Lần 1 (test tự động): phát hiện lệch.\n' +
      'Lần 2 (verify thủ công ngay sau): V1 = 38 trận, V2 = 38 trận, khớp hoàn toàn 0 lệch.',
    qaStatus: 'Nhiều khả năng đây là biểu hiện khác của bug #2 (cache lệch tạm thời), không phải lỗi cố định riêng locale BR.',
    confirm: '',
    note: 'Gộp chung hướng theo dõi với bug #2 — không cần confirm riêng, chỉ cần biết nếu bug #2 được xác nhận/fix thì case này cũng nên tự hết.',
  },
];

for (const r of rows) {
  const row = sheet.addRow(r);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 110;
  if (r.title.startsWith('[KHÔNG PHẢI BUG]')) {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    });
  } else if (r.title.startsWith('[THEO DÕI]') || r.severity === 'Thấp') {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    });
  } else if (r.severity === 'Cao') {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } };
    });
  }
}

// Data validation cho cột confirm — dropdown chọn nhanh
sheet.dataValidations.add('J2:J7', {
  type: 'list',
  allowBlank: true,
  formulae: ['"Bug thật - cần báo dev,Không phải bug,Cần hỏi dev thêm,Chưa check"'],
});

// Sheet phụ: hướng dẫn cách check nhanh
const guide = workbook.addWorksheet('Hướng dẫn check');
guide.columns = [
  { header: 'Bước', key: 'step', width: 10 },
  { header: 'Nội dung', key: 'content', width: 90 },
];
guide.getRow(1).font = { bold: true };
const guideRows = [
  { step: '1', content: 'Mở sheet "Tổng hợp bug - US-4795 Home". Mỗi dòng là 1 nghi vấn bug.' },
  { step: '2', content: 'Cột "Link UI để check": bấm vào để mở trang Home thật đúng ngày đang test.' },
  { step: '3', content: 'Cột "Link/lệnh API để check": copy vào Postman hoặc chạy bằng curl để tự gọi API và xem response thật — không cần tin vào số liệu mẫu nếu muốn tự verify lại thời điểm hiện tại.' },
  { step: '4', content: 'Cột "Dữ liệu mẫu đã verify": số liệu/bằng chứng cụ thể đã quan sát được tại thời điểm viết báo cáo (2026-10-15). Nếu bạn check lại và số liệu khác đi nhiều, có thể do data đã đổi theo ngày — vẫn nên chú ý nếu HIỆN TƯỢNG (vd "VT9 fallback vẫn < 10 giải") còn lặp lại.' },
  { step: '5', content: 'Cột "Kết luận của bạn": chọn 1 trong 4 giá trị (dropdown có sẵn): "Bug thật - cần báo dev" / "Không phải bug" / "Cần hỏi dev thêm" / "Chưa check".' },
  { step: '6', content: 'Màu dòng: ĐỎ NHẠT = mức độ cao cần ưu tiên xem; VÀNG = mức độ thấp/đang theo dõi, không gấp; XANH LÁ = đã xác định KHÔNG phải bug, chỉ để tham khảo.' },
  { step: '7', content: 'Sau khi điền xong, gửi lại file này để tiếp tục xử lý: bug thật sẽ viết báo cáo chi tiết gửi dev; không phải bug sẽ cập nhật lại test tự động để không báo nhầm nữa.' },
];
for (const r of guideRows) {
  const row = guide.addRow(r);
  row.alignment = { vertical: 'top', wrapText: true };
}

const outPath = new URL('./results/US-4795-bug-report-for-confirm.xlsx', import.meta.url).pathname;
await workbook.xlsx.writeFile(outPath);
console.log('Đã tạo file:', outPath);
