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
      'Khi otherCompetitions còn nhiều giải/trận khác chưa hiện, danh sách events chính lẽ ra phải luôn đủ 10 KHỐI khác nhau (1 giải chia nhiều bảng/group thì mỗi group tính là 1 khối riêng — đã xác nhận đúng qua UI thật: locale VN hôm nay hiện "AFC Champions League 2" thành 4 khối Group C/F/G/H, cộng 6 giải khác = ĐÚNG 10 khối, khớp 100% với số liệu API — VN KHÔNG có bug). Tuy nhiên với CÁC LOCALE KHÁC (GB, US, JP, BR...) cùng ngày, số khối thực tế đo được CHỈ 3-4 khối trong khi sidebar vẫn còn 50+ giải khác chưa hiện — tức cơ chế "bù đủ 10" chỉ hoạt động đúng ở 1 số locale, không phải toàn cục.',
    uiLink: `${SITE}?date=${TODAY}`,
    apiLink: `POST /scheduled-events-pagination-v2/${TODAY}/locale/GB/type/all  body: {}\n${API_DOCS_NOTE}`,
    sample:
      `Ngày ${TODAY} — ĐỐI CHIẾU 2 LOCALE CÙNG NGÀY:\n` +
      'locale VN: 10 khối (UEFA CL, UEFA EL, UEFA Conf. League, AFC CL2 ×4 group, Championship, MLS, Professional League) — ĐÚNG, khớp UI thật 100%\n' +
      'locale GB: CHỈ 3 khối (UEFA Europa League, UEFA Conference League, Football League One), trong khi otherCompetitions còn 58 nhóm giải khác chưa hiện — SAI, thiếu nghiêm trọng',
    qaStatus: 'VN: ĐÃ XÁC NHẬN KHÔNG FAIL (đếm đúng theo khối, khớp UI thật). GB/US/JP/BR/TH/DE/KR/ID/MX/EG/AU/IN/AR: vẫn FAIL ổn định qua nhiều lần chạy lại — bug thật, chỉ không xảy ra ở locale VN.',
    confirm: '',
    note:
      'GIỚI HẠN KHI TỰ CHECK UI: trang uniscore.com tự nhận diện locale theo địa chỉ IP của máy đang mở trình duyệt (không đổi được qua URL như /en-gb) — nếu bạn mở link UI từ máy ở Việt Nam, trang LUÔN hiển thị theo locale VN (đang đúng), không thấy được lỗi của GB/US/... Cách tự check locale khác: (1) dùng VPN đổi IP sang đúng quốc gia rồi mở link UI, hoặc (2) tin cậy vào lệnh API ở cột trước (đổi "locale/GB/" thành locale muốn test), chạy bằng Postman và tự đếm số (tournament.id + group_id) phân biệt trong data.events.',
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
      'ĐÀO SÂU THÊM (theo yêu cầu): gọi lại liên tiếp 5 lần cùng locale VN ngày 15/10 — CẢ 5 LẦN đều PASS ổn định (V1=236, V2=232, luôn đúng V1≥V2). Không tái hiện lại được lỗi dù thử nhiều lần ngay sau đó.\n' +
      'Nghi ngờ nguyên nhân: V1 dùng cache RAM từng pod, V2 dùng snapshot Redis — có thể lệch vài giây ĐÚNG THỜI ĐIỂM data vừa cập nhật (cửa sổ lỗi rất hẹp, khó chủ động tái hiện).',
    qaStatus: 'Đã cố gắng điều tra kỹ theo yêu cầu: chạy lại 5 lần liên tiếp đều PASS, không bắt lại được lỗi. Đây là flaky thật (cửa sổ thời gian hẹp), không phải lỗi cố định — khó báo dev vì không có bước tái hiện ổn định để họ debug.',
    confirm: '',
    note: 'Gộp chung với bug #6 (cùng hiện tượng, cùng nghi ngờ nguyên nhân cache). Đề xuất: nếu muốn điều tra tiếp, cần theo dõi qua nhiều lần chạy test daily tự động (đã có sẵn trong hệ thống) để xem tần suất lặp lại thực tế qua thời gian dài, thay vì cố gắng tái hiện thủ công.',
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
      'ĐÀO SÂU THÊM (theo yêu cầu) — test trên 2 GIẢI KHÁC NHAU để loại trừ khả năng "chỉ 1 giải bị lỗi riêng":\n' +
      'Giải 1: United Football League (id: no03wnpof59rah5) → competitionIds: 1 trận | competitionId: 0 trận\n' +
      'Giải 2: Shillong Premier League (id: bm0nxitodvss3t6) → competitionIds: 1 trận | competitionId: 0 trận\n' +
      '=> CẢ 2 GIẢI đều lỗi giống hệt nhau → đây là lỗi xử lý tham số ở tầng code chung (áp dụng cho mọi giải), không phải lỗi riêng của 1 giải cụ thể.',
    qaStatus: 'Verify lại hôm nay vẫn tái hiện đúng như mô tả, đã test thêm trên giải thứ 2 để chắc chắn — fail ổn định 2/2 giải, không phải flaky hay lỗi riêng 1 giải.',
    confirm: '',
    note: 'Giải mẫu cụ thể ở trên chỉ đúng tại thời điểm test (phụ thuộc có trận live lúc đó) — nếu hết live khi bạn check lại, tìm 1 giải đang có trận live khác trên UI, lấy competition id tương ứng rồi test lại bằng công thức: gọi competitionIds:[id] rồi competitionId:id, so sánh events.length — nếu công thức này tái hiện đúng (số nhiều > 0, số ít = 0) ở BẤT KỲ giải nào, bug được xác nhận chắc chắn.',
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
      'Cùng 1 ngày, cùng ý nghĩa locale (Việt Nam), chỉ khác cách viết hoa/thường, nhưng trả về SỐ TRẬN KHÁC NHAU trong danh sách chính (events). ĐÀO SÂU THÊM (theo yêu cầu): verify lặp lại 3 NGÀY LIÊN TIẾP (14, 15, 16/10) đều lệch ổn định (27 vs 24, 54 vs 29, 21 vs 19) — không phải trùng hợp ngẫu nhiên 1 lần. Phân tích chi tiết ngày 15/10: locale=vn (thường) THIẾU ĐÚNG 6 khối so với locale=VN (hoa) — thiếu toàn bộ "AFC Champions League 2" (4 group) + "Major League Soccer" + "Professional League". QUAN TRỌNG: otherCompetitions (sidebar) giữa 2 trường hợp cũng KHÁC NHAU (67 vs 68 nhóm) — tức bug này ảnh hưởng sâu hơn, không chỉ riêng bước chọn "10 khối ưu tiên" mà có vẻ ảnh hưởng toàn bộ pipeline xử lý locale. CÓ KHẢ NĂNG đây cùng gốc rễ với bug #1 (VT9 fallback) — cả 2 đều biểu hiện qua việc 1 số khối/giải bị "rớt" khỏi danh sách khi locale không phải dạng chuẩn.',
    uiLink: `${SITE}?date=${TODAY}`,
    apiLink:
      `POST /scheduled-events-pagination-v2/${TODAY}/locale/VN/type/all  body: {}\n` +
      `POST /scheduled-events-pagination-v2/${TODAY}/locale/vn/type/all  body: {}\n` +
      'So sánh data.events.length VÀ data.otherCompetitions.length giữa 2 lần gọi — chỉ khác chữ hoa/thường ở locale.',
    sample:
      '3 ngày liên tiếp đã verify:\n' +
      '14/10: VN(hoa)=27 trận | vn(thường)=24 trận\n' +
      '15/10: VN(hoa)=54 trận | vn(thường)=29 trận — thiếu đúng 6 khối: AFC Champions League 2 (cả 4 group), Major League Soccer, Professional League\n' +
      '16/10: VN(hoa)=21 trận | vn(thường)=19 trận\n' +
      'otherCompetitions ngày 15/10: VN(hoa)=67 nhóm, vn(thường)=68 nhóm (KHÁC NHAU, không chỉ events mới khác)',
    qaStatus: 'Verify ổn định qua 3 ngày liên tiếp khác nhau — đây là bug có độ tin cậy cao nhất trong danh sách này, và có dấu hiệu liên quan tới bug #1.',
    confirm: '',
    note: 'Rủi ro thật: nhiều hệ thống/client (web, app, đối tác) có thể gửi locale với format hoa/thường khác nhau tùy chỗ — không phải trường hợp lý thuyết hiếm gặp. Đề xuất báo dev kiểm tra CHUNG với bug #1 vì nghi ngờ cùng gốc rễ (xử lý locale không chuẩn hoá trước khi dùng để lọc/chọn giải).',
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
    qaStatus: 'ĐÃ GỘP VỚI BUG #2 THEO YÊU CẦU — xem chi tiết đào sâu (5 lần chạy lại liên tiếp đều pass) ở dòng #2. Đây chỉ là 1 biểu hiện khác của cùng hiện tượng flaky cache, không phải lỗi cố định riêng locale BR.',
    confirm: '',
    note: 'Không cần confirm riêng dòng này — kết luận chung đã gộp vào dòng #2.',
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
