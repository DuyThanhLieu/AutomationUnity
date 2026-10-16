// Build file Excel tổng hợp các nghi vấn bug trang Home (US-4795) kèm link
// UI/API thật để QA tự tay confirm. Dữ liệu mẫu trong file ghi rõ NGÀY THẬT
// lúc verify (không phải ngày chạy script) — vì lịch đấu thay đổi mỗi ngày,
// 1 locale có thể pass/fail tùy hôm đó có trận rơi đúng vùng biên giờ hay
// không. TODAY dùng để tạo link UI "xem hôm nay" khi người đọc mở file sau.
import ExcelJS from 'exceljs';

const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
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
    title: '[ĐÃ GỠ BỎ KHỎI PHẠM VI — không còn là bug] VT9 fallback (bù đủ 10 giải)',
    severity: 'Không áp dụng',
    endpoint: 'scheduled-v2',
    symptom:
      'Trước đó nghi ngờ: khi otherCompetitions còn nhiều giải/trận khác chưa hiện, danh sách events chính không bù đủ 10 khối như cam kết trong doc gốc. Đã điều tra kỹ (đối chiếu UI thật, sửa lại cách đếm theo group, verify nhiều locale) — nhưng XÁC NHẬN TỪ BẠN (2026-10-15): logic "kéo đủ 10 giải hiển thị trang Home" ĐÃ ĐƯỢC CHỦ ĐÍCH GỠ BỎ khỏi sản phẩm, không còn là hành vi mong muốn nữa. Vậy toàn bộ các case "thiếu khối" trước đây không phải bug — chỉ là test đang kiểm tra đúng 1 hành vi đã không còn tồn tại trong sản phẩm.',
    uiLink: `${SITE}?date=${TODAY}`,
    apiLink: 'Không cần test lại — đã xác nhận logic này không còn áp dụng.',
    sample: 'Test tự động tương ứng ("bù đủ 10 giải khi còn giải khác (VT 9 fallback)") đã được XÓA KHỎI file 01-scheduled-v2.spec.ts theo đúng xác nhận này.',
    qaStatus: 'ĐÃ ĐÓNG — không cần confirm, không cần theo dõi thêm.',
    confirm: 'Không phải bug - logic đã bị gỡ bỏ',
    note: 'Lưu ý: bug locale VN/vn khác số trận (xem dòng bên dưới) từng được nghi ngờ "cùng gốc rễ" với case này — giờ VT9 fallback không còn là bug, nhưng bug locale VN/vn VẪN CÒN HIỆU LỰC RIÊNG (lệch số trận thật giữa 2 cách viết locale, không liên quan gì đến việc có đủ 10 khối hay không).',
  },
  {
    no: 2,
    title: '[KHÔNG BÁO — API có lỗi nhưng không UI nào dùng] competitionId (số ít) trả rỗng trên live-v1',
    severity: 'Không áp dụng',
    endpoint: 'live-v1 (/events/live)',
    symptom:
      'Ở tầng API thuần: gửi competitionId (số ít) luôn trả 0 trận trong khi competitionIds (số nhiều, cùng 1 giải) trả đúng — lỗi "giải mã 2 lần" có thật ở code. NHƯNG đã kiểm tra lại theo đúng nguyên tắc "API có bug nhưng UI không dùng thì không báo": bắt network request THẬT của UI web (page.on("request") khi bấm tab Live trên uniscore.com) — UI web KHÔNG HỀ gọi endpoint live-v1 này, mà dùng GET /events/live-v2 (route khác), và không có bất kỳ tham số competitionId/competitionIds nào trong request đó. Đồng thời chính doc gốc (3-5-live-v1.md, câu hỏi mở #1) ghi rõ: "Client dùng competitionIds. Server có thể bỏ lần giải mã thứ hai nếu không còn client nào phụ thuộc vào hành vi cũ" — tức dev đã biết trước không còn ai dùng field số ít này.',
    uiLink: `${SITE}`,
    apiLink: 'Không cần test lại — đã xác nhận rõ không có UI nào sử dụng field này.',
    sample:
      'Bằng chứng network request thật khi bấm tab Live trên UI:\n' +
      'GET https://api.uni-score.com/api/v2/sport/football/events/live-v2/locale/VN?sortByMatchTime=false&page=1&language=en\n' +
      '(route live-v2, không phải live-v1; không có tham số competitionId nào)',
    qaStatus: 'ĐÃ QUYẾT ĐỊNH BỎ QUA theo yêu cầu: lỗi có thật ở tầng API (đã verify ổn định trên 2 giải khác nhau) nhưng không có UI/client nào trong hệ thống hiện tại sử dụng field này — báo dev sẽ vô nghĩa vì không ảnh hưởng ai.',
    confirm: 'Không cần - đã quyết định bỏ qua',
    note: 'Giữ lại 1 test tự động dạng ghi nhận hành vi (không hard-fail) trong bộ test — chỉ để biết ngay nếu sau này có client mới bắt đầu dùng lại field này thì cần xem lại quyết định bỏ qua.',
  },
  {
    no: 3,
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
    no: 4,
    title: 'locale="VN" (hoa) và locale="vn" (thường) trả SỐ TRẬN KHÁC NHAU — đã xác nhận ổn định',
    severity: 'Cao',
    endpoint: 'scheduled-v2',
    symptom:
      'Cùng 1 ngày, cùng ý nghĩa locale (Việt Nam), chỉ khác cách viết hoa/thường, nhưng trả về SỐ TRẬN KHÁC NHAU trong danh sách chính (events). ĐÀO SÂU THÊM (theo yêu cầu): verify lặp lại 3 NGÀY LIÊN TIẾP (14, 15, 16/10) đều lệch ổn định (27 vs 24, 54 vs 29, 21 vs 19) — không phải trùng hợp ngẫu nhiên 1 lần. Phân tích chi tiết ngày 15/10: locale=vn (thường) THIẾU ĐÚNG 6 khối so với locale=VN (hoa) — thiếu toàn bộ "AFC Champions League 2" (4 group) + "Major League Soccer" + "Professional League". QUAN TRỌNG: otherCompetitions (sidebar) giữa 2 trường hợp cũng KHÁC NHAU (67 vs 68 nhóm) — tức bug này ảnh hưởng toàn bộ pipeline xử lý locale, không chỉ riêng 1 bước nhỏ.',
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
    qaStatus: 'Verify ổn định qua 3 ngày liên tiếp khác nhau — độ tin cậy cao nhất (ổn định, tái hiện được ngay lập tức bất cứ lúc nào, không phụ thuộc lịch đấu như bug date-boundary ở dòng dưới).',
    confirm: '',
    note: 'Rủi ro thật: nhiều hệ thống/client (web, app, đối tác) có thể gửi locale với format hoa/thường khác nhau tùy chỗ — không phải trường hợp lý thuyết hiếm gặp.',
  },
  {
    no: 5,
    title: '[ĐÃ CÓ CÁCH KHẮC PHỤC PHÍA CLIENT] UI mặc định (không gửi offset) xếp sai ngày cho gần như toàn bộ locale châu Âu (+ EG/IL/UA) vào giờ cao điểm — client tự gửi offset đúng dấu thì hết lỗi',
    severity: 'Cao',
    endpoint: 'scheduled-v2 (ảnh hưởng cả tab "Tất cả" và "Kết thúc")',
    symptom:
      'NGUYÊN NHÂN GỐC RỄ: mỗi locale có 1 giá trị `utc` cố định trong config server, và CHỈ 11 locale có thêm mảng `allowedOffsets` cho phép client override (US, CA, MX, BR, CL, AU, NZ, ES, PT, ID, RU). Với locale KHÔNG có allowedOffsets (GB, IE, MA và hầu hết châu Âu lục địa), nếu client KHÔNG gửi offset, server dùng utc cố định — sai vào mùa hè (DST) vì không tự cộng thêm giờ mùa hè.\n' +
      'PHẠM VI: chạy test tự động trên CI vào giờ cao điểm châu Âu (19h-23h UTC, lúc nhiều trận châu Âu rơi đúng vùng biên giờ địa phương khi đang DST) phát hiện 22/60 locale fail KHI KHÔNG GỬI OFFSET: AT, BE, CH, CZ, DE, DK, EG, ES, FI, FR, GB, GR, HU, IE, IL, IT, NL, NO, PL, PT, SE, UA. Local chạy giờ khác chỉ thấy 4/60 — vì bug chỉ lộ khi có trận thật rơi đúng vùng biên UTC 22h-23h, không phải lỗi test.\n' +
      '*** SỬA LẠI KẾT LUẬN TRƯỚC ĐÂY (XIN LỖI VÌ BÁO SAI) ***: báo cáo trước nói "client tự gửi offset lên KHÔNG giải quyết được" — ĐÂY LÀ KẾT LUẬN SAI do QA dùng SAI DẤU offset (gửi offset=+60 thay vì -60) và có 1 lần verify chỉ check trang 1 của phân trang nên bỏ sót trận nằm ở trang sau. Verify lại đầy đủ (đúng dấu offset theo quy ước getTimezoneOffset của JS: UTC+1 → offset=-60, phân trang đầy đủ tới hasNextPage=false): GỬI offset=-60 SỬA ĐÚNG NGÀY CHO CẢ GB, IE, PT, MA — xác nhận qua toàn bộ 7 trận mẫu GB (Toronto vs Orlando và 6 trận khác), đều chuyển đúng sang ngày 15/10 khi gửi offset=-60, biến mất khỏi ngày 14/10.\n' +
      'KẾT LUẬN ĐÚNG: cách fix "client tự gửi offset" của Allan là ĐÚNG HƯỚNG và ĐÃ HOẠT ĐỘNG — vấn đề còn lại chỉ là: (1) client (web/app) hiện có đang thực sự gửi offset đúng dấu cho mọi locale chưa, hay chỉ gửi cho 11 locale có allowedOffsets?; (2) GB/IE/MA và các locale châu Âu khác CHƯA nằm trong allowedOffsets — cần xác nhận server có chấp nhận offset client gửi cho các locale này không (dù không có trong whitelist công bố, thực tế gửi offset=-60 vẫn sửa được, nên có thể whitelist chỉ áp dụng cho field body offsetTimezone, không áp dụng cho query offset — cần Allan xác nhận lại logic chính xác).',
    uiLink: `${SITE}?date=${TODAY}  (fake IP sang bất kỳ nước châu Âu nào, mở Home vào giờ cao điểm châu Âu ~19h-23h UTC — dễ bắt được nhất nếu UI chưa gửi đúng offset)`,
    apiLink:
      `POST /scheduled-events-pagination-v2/2026-10-14/locale/GB/type/all?offset=-60  body: {"sortByMatchTime": true}\n` +
      `POST /scheduled-events-pagination-v2/2026-10-15/locale/GB/type/all?offset=-60  body: {"sortByMatchTime": true}\n` +
      'So sánh: trận startTimestamp ~23:40 UTC ngày 14/10 (Toronto vs Orlando, id 54cvbml3824mvp4) phải nằm ở data.events ngày 15/10 khi gửi offset=-60 (đã verify ĐÚNG). KHÔNG gửi offset thì vẫn sai (nằm ở ngày 14/10) — đây là hành vi "mặc định sai, cần client chủ động gửi offset đúng".',
    sample:
      'Locale GB, KHÔNG gửi offset: 7/60 trận mẫu bị xác nhận sai ngày — Toronto vs Orlando (54cvbml3824mvp4), Inter Miami vs NY City, DC United vs NY Red Bulls, Montreal vs Atlanta, Cincinnati vs New England Rev, Columbus vs Charlotte, Rhode Island vs Loudoun Utd — tất cả UTC 23:00-23:40 ngày 14/10.\n' +
      'CÙNG 7 trận này, GỬI offset=-60: TẤT CẢ chuyển đúng sang ngày 15/10, biến mất khỏi ngày 14/10 — đã verify bằng phân trang đầy đủ (không chỉ trang 1).\n' +
      'PT và IE: cùng verify với offset=-60, cũng fix đúng.\n' +
      'MA: offset=-60 và offset=60 đều fix đúng (DST Morocco hiện tại không lệch dấu).\n' +
      'Danh sách đầy đủ 22 locale fail KHI KHÔNG GỬI OFFSET (phát hiện qua CI giờ cao điểm châu Âu): AT, BE, CH, CZ, DE, DK, EG, ES, FI, FR, GB, GR, HU, IE, IL, IT, NL, NO, PL, PT, SE, UA.\n' +
      `CẬP NHẬT lần verify gần nhất (${TODAY}, 15:10 giờ VN, quét toàn bộ 59 locale, cả tab All và Finish): CHỈ còn GB, IE, PT fail — đúng theo tính dao động đã ghi ở dưới (không có đủ mẫu trận biên giới cho các locale khác vào thời điểm này, KHÔNG có nghĩa các locale đó đã hết bug).\n` +
      `CẬP NHẬT lần chạy full suite gửi Telegram thật (${TODAY}, 16:14 và 16:18 giờ VN, cách nhau 4 phút, tab All): CẢ 2 LẦN đều fail đúng và CHỈ 3 locale GB, IE, PT — 22 locale châu Âu còn lại (AT, BE, CH, CZ, DE, DK, EG, ES, FI, FR, GR, HU, IL, IT, NL, NO, PL, SE, UA) đều pass ở thời điểm này. Xem ma trận đầy đủ theo từng lần chạy ở sheet "Bug #5 - ma trận nhiều lần chạy" (đã thêm 2 cột mới nhất).`,
    qaStatus: 'BUG XẢY RA KHI CLIENT KHÔNG GỬI OFFSET (hành vi mặc định của UI nếu UI không chủ động tính và gửi offset). CÓ CÁCH KHẮC PHỤC xác nhận hoạt động: gửi đúng offset=-60 (hoặc offset tương ứng locale khác). Cần xác nhận với Allan: UI web/app hiện tại CÓ đang gửi offset đúng cho các locale châu Âu không, hay chỉ áp dụng cho 11 locale allowedOffsets.\n' +
      'LƯU Ý QUAN TRỌNG CHO DAILY REPORT: kết quả test tự động cho bug này DAO ĐỘNG THEO LỊCH ĐẤU THẬT MỖI NGÀY — bug chỉ lộ ra khi có trận thật rơi đúng vùng biên giờ UTC 19h-23h (giờ cao điểm châu Âu) tại thời điểm chạy. Daily chạy ngày không có đủ mẫu trận ở vùng biên sẽ PASS dù bug CHƯA ĐƯỢC FIX — không được coi "1 ngày pass" là bằng chứng bug đã hết. Chỉ kết luận "đã fix" khi verify trực tiếp bằng API với trận mẫu cụ thể đang ở vùng biên tại thời điểm đó.',
    confirm: '',
    note: 'QA đã báo sai trong 2 lần trước do lỗi test (sai dấu offset, thiếu phân trang khi verify) — bản ghi nhận cuối cùng này là kết luận ĐÚNG, đã verify kỹ bằng phân trang đầy đủ. Đề xuất hành động: (1) kiểm tra UI web/app có đang tự tính và gửi offset=getTimezoneOffset() cho MỌI locale hay chỉ 11 locale allowedOffsets; (2) nếu UI chưa gửi, đây là việc cần sửa ở FE, không phải BE; (3) nếu UI đã gửi đúng nhưng vẫn thấy sai trên app thật, cần kiểm tra lại giá trị thực tế app gửi lên.\n' +
      'BẰNG CHỨNG CHI TIẾT ĐẦY ĐỦ (23 locale, nhiều lần chạy, từng lệnh curl): xem 3 sheet "Bug #5 - ..." ở cuối file Excel này.',
  },
  {
    no: 6,
    title: '[CẦN ĐIỀU TRA THÊM] Trận quen thuộc "biến mất" khỏi UI khi quay lại đúng ngày cũ',
    severity: 'Trung bình',
    endpoint: 'scheduled-v2 (qua UI web)',
    symptom:
      'Test so sánh baseline UI đã ghi nhận trước đó (trận nào từng thấy, ngày nào) với UI thật khi quay lại xem đúng ngày đó sau một khoảng thời gian — phát hiện 20/38 trận "biến mất" khỏi UI dù vẫn đúng ngày baseline đã ghi. Toàn bộ 20 trận đều là baseline ghi CÙNG 1 THỜI ĐIỂM (02:27:58 UTC ngày 16/10, tức lần chạy test gần nhất trong buổi sáng) — nghi ngờ nguyên nhân: trang Home chỉ hiển thị top ~10 giải nổi bật + giải yêu thích (theo đúng thiết kế "VT9 fallback" cũ), và danh sách "nổi bật" này có thể thay đổi theo thời điểm trong ngày/số trận đang diễn ra, khiến trận từng thấy buổi sáng không còn nằm trong top hiển thị buổi khác — ĐÂY CÓ THỂ LÀ HÀNH VI ĐÚNG THEO THIẾT KẾ (không phải bug), cần xác nhận lại với bạn trước khi kết luận.',
    uiLink: `${SITE}?date=${TODAY}  (so sánh với ảnh chụp UI đã lưu trong .baseline/ui-matches.json — tìm key theo id trận mẫu bên dưới)`,
    apiLink:
      `Bước 1 — xem UI hiện trận chưa: mở ${SITE}?date=${TODAY}, Ctrl+F tìm tên 1 trong các đội mẫu bên dưới.\n` +
      `Bước 2 — xác nhận trận vẫn tồn tại trong hệ thống (chỉ rớt khỏi top, không mất hẳn): POST /scheduled-events-pagination-v2/${TODAY}/locale/VN/type/all  body: {"sortByMatchTime": true}  rồi tìm id trận mẫu trong data.events (luồng này trả toàn bộ, không giới hạn top).\n` +
      'Nếu KHÔNG thấy ở cả 2 bước → trận mất hẳn khỏi hệ thống, bug thật. Nếu CÓ ở bước 2 nhưng KHÔNG ở bước 1 → đúng là do giới hạn top giải nổi bật, cần xác nhận với bạn có phải hành vi đúng thiết kế không.',
    sample:
      'Mẫu trận biến mất (baseline ghi lúc 02:27:58 UTC 16/10): Lyon vs Crystal Palace (id 1ztvu6l8en3yv9p), U. Craiova vs Getafe (id 1ztvu6l8en7zv9p), Egnatia vs Midtjylland (id 4m9appl66v8zr6b), Gent vs AGF, Hajduk vs Ajax, RB Salzburg vs Milan... (20 trận, đa số thuộc Europa League/Conference League/giải nhỏ châu Âu — không thuộc nhóm giải nổi bật mặc định).',
    qaStatus: 'CHƯA XÁC ĐỊNH RÕ LÀ BUG — cần bạn xác nhận: đây có phải hành vi "top giải nổi bật thay đổi theo thời điểm" đã biết, hay là lỗi thật khiến trận hợp lệ bị rớt khỏi danh sách.',
    confirm: '',
    note: 'Nếu xác nhận là hành vi đúng theo thiết kế, sẽ nới ngưỡng test hoặc đổi cách baseline để không báo nhầm nữa.',
  },
  {
    no: 7,
    title: 'Tab Live: "Admin top match" tính sai ngày mới cho GB/IE/MA — client không điều khiển được hiển thị top-match đúng ngày',
    severity: 'Cao',
    endpoint: 'live-v1 (nghi ngờ ảnh hưởng cả live-v2, dùng chung cơ chế)',
    symptom:
      'BUG RIÊNG, KHÁC HẲN bug date-boundary ở scheduled-v2 (bug #2 phía trên — đó là trận bị gán SAI NGÀY, còn đây là Admin top match tính sai THỜI ĐIỂM "sang ngày mới"). Theo doc gốc (3-5-live-v1.md mục 03 bước 10): server đọc Redis `top-match:<ngày VN>:<locale>` và CHỈ ghim thêm top-match của "ngày mai" nếu `now − offset` (giờ hiện tại của client) đã sang ngày mới. Đã xác nhận qua file config timezone_by_locale.json: GB và IE hoàn toàn KHÔNG có mảng `allowedOffsets` (chỉ có utc cố định), MA cũng vậy — nên offset gửi lên BỊ SERVER BỎ QUA HOÀN TOÀN với 3 locale này. Hậu quả: thời điểm "sang ngày mới" của GB/IE/MA luôn bị tính theo UTC+0 cố định thay vì giờ mùa hè thật (BST/IST/giờ Morocco) — nghĩa là admin top-match của "ngày mai" sẽ xuất hiện SAI GIỜ (sớm hoặc muộn hơn 1 tiếng so với đúng) trong khung giờ 23h-00h59 UTC mỗi ngày.',
    uiLink: `${SITE}  (fake IP sang Anh/Ireland, xem tab Live đúng khung giờ 23h-00h59 UTC — lúc GB/IE đã sang ngày mới theo giờ mùa hè nhưng server vẫn tính theo UTC)`,
    apiLink:
      `POST https://api.uni-score.com/api/v2/sport/football/events/live/locale/GB?language=en&offset=0  body: {}\n` +
      `POST https://api.uni-score.com/api/v2/sport/football/events/live/locale/GB?language=en&offset=60  body: {}\n` +
      'So sánh danh sách id trận trả về giữa 2 lệnh (chỉ khác offset=0 vs offset=60/BST) — CHỈ CÓ Ý NGHĨA khi gọi đúng khung giờ 23h-00h59 UTC. Nếu offset được xử lý đúng, 2 kết quả phải KHÁC NHAU (GB cần thấy top-match ngày mai sớm hơn 1 tiếng). Giống hệt nhau trong khung giờ này là bằng chứng bug.',
    sample:
      'Test tự động (17-date-boundary-all-tabs.spec.ts) gọi 2 request offset=0 và offset=60 cho GB, so sánh danh sách id trận — chỉ hard-fail khi đang đúng khung giờ nhạy cảm 23h-00h59 UTC (ngoài khung giờ này không kỳ vọng thấy khác biệt, ghi annotation để theo dõi qua nhiều lần chạy).\n' +
      'Do khung giờ nhạy cảm chỉ kéo dài 2 tiếng/ngày, daily chạy ngoài khung giờ này sẽ PASS dù bug CHƯA ĐƯỢC FIX — cùng tính dao động như bug #2, không được coi "pass" là đã hết bug.',
    qaStatus: 'PHÁT HIỆN QUA RÀ SOÁT DOC + CONFIG, CHƯA GỬI DEV — đề xuất gộp chung hướng fix với bug #2 (cả 2 đều do thiếu allowedOffsets cho GB/IE/MA và các locale châu Âu có DST), vì cùng nguyên nhân gốc rễ.',
    confirm: '',
    note: 'Nếu dev fix bằng cách thêm allowedOffsets cho GB/IE/MA/các locale châu Âu (đề xuất ở bug #2), bug này nhiều khả năng cũng tự hết vì dùng chung config timezone_by_locale.json — nên fix 1 lần cho cả 2 bug.',
  },
  {
    no: 8,
    title: '[THEO DÕI] Đội futsal/bãi biển (youth_type trống) có thể biến mất hoàn toàn khỏi cả events lẫn otherCompetitions',
    severity: 'Trung bình',
    endpoint: 'scheduled-v2',
    symptom:
      'Edge case đã ghi trong doc gốc (1-5-scheduled-v2.md mục 14): "Đội có youth_type trống (futsal, bãi biển…) không vào nhóm nào và cũng bị loại khỏi Giải đấu khác, nên có thể không hiện ở đâu". Đây là mất dữ liệu hiển thị nếu xảy ra thật — nghiêm trọng hơn bug date-boundary (trận chỉ sai ngày, vẫn tồn tại ở nơi khác). Test tự động (18-scheduled-v2-deep-invariants.spec.ts) chỉ kiểm tra TỶ LỆ LỆCH TỔNG THỂ giữa pagination.total và (events + otherCompetitions), ngưỡng chấp nhận 15% — CHƯA xác nhận được danh tính trận cụ thể nào bị mất, chỉ là cơ chế giám sát chạy mỗi ngày.',
    uiLink: `${SITE}?date=${TODAY}`,
    apiLink:
      `Lệnh check tỷ lệ lệch (chạy lại chính test tự động): npx playwright test tests/standard/2026-Q3-task-4795-home-matches/18-scheduled-v2-deep-invariants.spec.ts -g "futsal" --project=chrome --reporter=list\n` +
      `Hoặc tự tính tay: POST /scheduled-events-pagination-v2/${TODAY}/locale/VN/type/all  body: {} → lấy data.pagination.total, cộng data.events.length + tổng match_count của mọi phần tử trong data.otherCompetitions — nếu lệch >15% so với total là dấu hiệu có trận bị mất.`,
    sample: 'Chưa ghi nhận được lần lệch >15% nào qua các lần chạy test tự động tính đến nay — nhưng đây là annotation luôn chạy, cần xem log nhiều ngày để biết có từng xảy ra chưa.',
    qaStatus: 'ĐANG GIÁM SÁT TỰ ĐỘNG — chưa có bằng chứng cụ thể trận nào bị mất, nhưng risk đã được xác nhận tồn tại trong doc gốc, nên giữ theo dõi thay vì bỏ qua hẳn.',
    confirm: '',
    note: 'Nếu test báo lệch >15% ở lần chạy nào đó trong tương lai, cần điều tra ngay danh tính trận cụ thể trước khi báo dev — hiện tại mới là cảnh báo sớm, chưa đủ bằng chứng.',
  },
  {
    no: 9,
    title: '[KHÁC DOC — cần dev xác nhận] competitionId không giải mã được: doc ghi trả rỗng, thực tế trả nguyên trang chủ',
    severity: 'Thấp',
    endpoint: 'scheduled-v1',
    symptom:
      'Doc gốc (2-5-scheduled-v1.md mục 07) ghi rõ: "Nếu id không giải mã được, server trả response rỗng: events: [], pagination toàn số 0". Quan sát thật (2026-10-16): server trả NGUYÊN TRANG CHỦ MẶC ĐỊNH (giống hệt như không gửi competitionId), không hề rỗng. Có thể hành vi server đã đổi sau khi viết doc, hoặc doc mô tả sai từ đầu.',
    uiLink: 'Không áp dụng (hành vi tầng API thuần, không qua UI)',
    apiLink:
      `POST /scheduled-events-pagination/${TODAY}/locale/VN/type/all  body: {"competitionId": "id-khong-hop-le-xyz"}\n` +
      'So sánh response này với response không gửi competitionId — hiện tại 2 cái giống hệt nhau, khác doc.',
    sample: 'Test tự động (20-scheduled-v1-full-coverage.spec.ts) xác nhận: response trả events giống hệt trang chủ mặc định, không phải mảng rỗng như doc mô tả.',
    qaStatus: 'CHƯA GỬI DEV — mức độ thấp vì không gây lỗi hiển thị, nhưng nên xác nhận lại để cập nhật doc hoặc sửa code cho khớp 1 trong 2.',
    confirm: '',
    note: 'Không ảnh hưởng UI thật (V1 chỉ còn ~1.200 request/ngày từ client cũ) — ưu tiên thấp hơn các bug khác, nhưng vẫn nên báo để dev biết doc đang sai.',
  },
  {
    no: 10,
    title: '[KHÁC DOC — cần dev xác nhận] Response mở 1 giải (scheduled-v1) thiếu hẳn field topMatches mà doc khẳng định 2 lần',
    severity: 'Trung bình',
    endpoint: 'scheduled-v1',
    symptom:
      'Doc gốc (2-5-scheduled-v1.md) khẳng định 2 LẦN (mục 02 và mục 07) rằng response của luồng mở 1 giải (gửi competitionId) có field `topMatches: []`. Quan sát thật (2026-10-16): response CHỈ CÓ 3 field events/otherCompetitions/pagination — topMatches hoàn toàn KHÔNG TỒN TẠI (undefined, không phải mảng rỗng). Rủi ro: nếu có client nào đang code dựa theo doc và đọc field này, sẽ gặp lỗi khi field undefined thay vì mảng rỗng.',
    uiLink: 'Không áp dụng (hành vi tầng API thuần)',
    apiLink:
      `POST /scheduled-events-pagination/${TODAY}/locale/VN/type/all  body: {"competitionId": "<1 competition_id lấy từ otherCompetitions>"}\n` +
      'Kiểm tra Object.keys(response.data) — hiện tại chỉ có events, otherCompetitions, pagination.',
    sample: 'Test tự động (20-scheduled-v1-full-coverage.spec.ts) xác nhận lặp lại nhiều lần: field topMatches không xuất hiện trong response thật.',
    qaStatus: 'CHƯA GỬI DEV — cần xác nhận: field bị gỡ có chủ đích (doc lỗi thời) hay bị mất do lỗi code.',
    confirm: '',
    note: 'Mức độ trung bình vì có rủi ro thật cho client cũ còn đọc field này — khác bug #9 (chỉ là hành vi lạ, không có field bị thiếu).',
  },
  {
    no: 11,
    title: 'page vượt quá tổng số trang: trả code=-1 thay vì code=1 với events rỗng (không theo chuẩn phân trang REST thông thường)',
    severity: 'Thấp',
    endpoint: 'scheduled-v2, scheduled-v1',
    symptom:
      'Khi gửi `page` vượt quá tổng số trang thật (vd page=9999, trong khi tổng chỉ có 3-4 trang), API trả `code=-1, data={}` — khác hẳn hành vi phân trang REST thông thường (lẽ ra nên trả `code=1` với `events=[]` rỗng, báo "hết trang" một cách bình thường). Rủi ro cho client: nếu FE coi `code=-1` là LỖI CHUNG CHUNG (giống lỗi ngày sai định dạng), sẽ hiện thông báo lỗi sai cho user thay vì hiểu đúng là "đã xem hết các trang".',
    uiLink: 'Không áp dụng trực tiếp (UI web thường không tự ý nhảy quá số trang có thật, nhưng app/client tự chủ động phân trang có thể gặp)',
    apiLink:
      `POST /scheduled-events-pagination-v2/${TODAY}/locale/VN/type/all  body: {"sortByMatchTime": true, "page": 9999}\n` +
      `POST /scheduled-events-pagination/${TODAY}/locale/VN/type/all  body: {"sortByMatchTime": true, "page": 9999}\n` +
      'So sánh với page=1 (trả code=1 bình thường) — page vượt quá luôn trả code=-1, data={} ở cả 2 version.',
    sample: 'Test tự động (07-data-integrity.spec.ts và 20-scheduled-v1-full-coverage.spec.ts) xác nhận ổn định: mọi lần gọi page=9999 đều trả HTTP 200, code=-1, data={} — không phải lỗi ngẫu nhiên.',
    qaStatus: 'CHƯA GỬI DEV — mức độ thấp vì không gây crash, nhưng nên xác nhận với dev đây có phải hành vi cố ý hay cần sửa để nhất quán với chuẩn phân trang.',
    confirm: '',
    note: 'Phát hiện qua rà soát lần 2 (16/10/2026) khi kiểm tra lại độ đầy đủ của báo cáo — xảy ra giống hệt nhau ở cả scheduled-v1 và scheduled-v2, cho thấy đây là hành vi CHUNG của pipeline, không phải lỗi riêng 1 version.',
  },
  {
    no: 12,
    title: '[CHƯA VERIFY ĐƯỢC — THIẾU ĐIỀU KIỆN DỮ LIỆU] 3 trong 5 bug cũ cần xác nhận lại theo yêu cầu gốc của task chưa có dữ liệu thật để test',
    severity: 'Trung bình',
    endpoint: 'live-v2 (ENCODE_ID World Cup); scheduled-v2 (World Cup rạng sáng, 2 bảng xen kẽ, hasBracket)',
    symptom:
      'Theo yêu cầu gốc của task US-4795 (comment Jira "5 bug trước đó đã fix cần verify riêng"), có 1 mục CHƯA VERIFY ĐƯỢC: "live-v2: pass World Cup không chạy do ENCODE_ID" — đã viết test tự động (08-live-and-rare-cases.spec.ts, mục "case hiếm World Cup") nhưng test này TỰ ĐỘNG SKIP vì hiện tại không có World Cup/giải đấu lớn nào đang diễn ra để kiểm tra (test tự dò qua tên giải chứa "World Cup" trong mọi lần chạy — sẽ tự chạy thật ngay khi có kỳ World Cup tới mà không cần sửa code). Tương tự, 3 case minh hoạ ở scheduled-v1 (World Cup, 2 bảng xen kẽ, hasBracket) trong estimate gốc cũng phụ thuộc data thật hiếm gặp — hasBracket ĐÃ verify được (file 20), nhưng World Cup/2-bảng-xen-kẽ vẫn đang chờ đúng thời điểm có data.',
    uiLink: `${SITE}  (chỉ có ý nghĩa khi đang có World Cup/giải đấu quốc tế lớn thật sự diễn ra)`,
    apiLink:
      'Lệnh check tự động (sẽ PASS/SKIP tuỳ có World Cup hay không, không cần sửa code khi World Cup diễn ra): npx playwright test tests/standard/2026-Q3-task-4795-home-matches/08-live-and-rare-cases.spec.ts -g "World Cup" --project=chrome --reporter=list\n' +
      'Nếu test này báo "skipped" tức là CHƯA có data để verify (bình thường) — nếu báo "failed" khi đang có World Cup thật thì mới là bug thật cần báo dev ngay.',
    sample: 'Lần chạy gần nhất (16/10/2026): test skip vì không có World Cup nào đang diễn ra tại thời điểm đó — đúng dự kiến trong estimate gốc ("không chủ động tạo được, chỉ verify được khi trùng đúng thời điểm có data phù hợp").',
    qaStatus: 'ĐANG CHỜ ĐÚNG THỜI ĐIỂM CÓ DATA — không phải đã bỏ qua, test đã sẵn sàng chạy tự động ngay khi điều kiện xuất hiện (daily chạy mỗi ngày sẽ tự bắt được).',
    confirm: '',
    note: 'Đây là rủi ro đã được chính estimate gốc của task cảnh báo trước ("có thể cần dời sang đợt sau nếu không gặp") — không phải sai sót trong quá trình test, nhưng cần ghi nhận rõ ràng là "chưa verify được" chứ không phải "đã verify và pass", để tránh hiểu nhầm khi đóng task.',
  },
  {
    no: 13,
    title: '[KHÔNG PHẢI BUG] 2 loại fail phát sinh khi chạy full suite gửi Telegram thật — đã điều tra, đều không phải lỗi sản phẩm',
    severity: 'Không áp dụng',
    endpoint: 'scheduled-v1 (competitionIds); db-cross-check (file 15, 19)',
    symptom:
      '(1) "gửi nhầm competitionIds (số nhiều, của V2) lên V1" thỉnh thoảng FAIL với lệch tới 2000% (ngưỡng cho phép 50%) — NHƯNG gọi trực tiếp API 5/5 lần liên tiếp (không qua Playwright) đều cho kết quả events GIỐNG HỆT NHAU (0 sai khác) giữa có/không gửi field này. Kết luận: field competitionIds ĐÚNG như doc, bị bỏ qua hoàn toàn trên V1 — lần fail là NHIỄU TIMING thật (2 request tuần tự rơi vào 2 chu kỳ refresher cache 250ms khác nhau, đúng như cảnh báo có sẵn trong comment code test), không phải bug.\n' +
      '(2) "db tên đội khớp giữa DB gốc và API" (file 15, 19) fail với lỗi `ECONNREFUSED` khi kết nối `FOOTBALL_DB_HOST` (IP nội bộ 10.96.0.5:6432) — xác nhận bằng `nc -zv` là do máy chạy test KHÔNG nằm trong mạng nội bộ công ty tại thời điểm đó (timeout kết nối TCP), không phải lỗi logic DB/API.',
    uiLink: 'Không áp dụng — cả 2 đều là vấn đề tầng test/hạ tầng, không phải hiện tượng người dùng gặp phải',
    apiLink:
      'Tự verify competitionIds không ảnh hưởng V1: gọi liên tiếp 5 lần POST /scheduled-events-pagination/{date}/locale/VN/type/all với body {} và body {"competitionIds":["abc","def"]}, so sánh tập hợp data.events[].id — phải giống hệt nhau mọi lần nếu field bị bỏ qua đúng như doc.\n' +
      'Tự verify DB: `nc -zv -w 3 <FOOTBALL_DB_HOST> <FOOTBALL_DB_PORT>` — nếu timeout/refused tức máy đang chạy test không có đường kết nối tới DB nội bộ (cần VPN/mạng công ty hoặc chạy trên CI đã cấu hình đúng secret).',
    sample:
      'competitionIds: 5/5 lần gọi trực tiếp ngày 2026-10-16 đều cho wrong.events=20, normal.events=20, onlyInWrong=0, onlyInNormal=0.\n' +
      'DB: `nc -zv -w 3 10.96.0.5 6432` → "Operation timed out" (xác nhận không có đường mạng tới host nội bộ từ máy đang chạy).',
    qaStatus: 'ĐÃ ĐIỀU TRA KỸ — KHÔNG PHẢI BUG. Không cần hành động từ dev. Đề xuất: (1) tăng ngưỡng/số lần thử lại cho test competitionIds để giảm false-positive do nhiễu timing; (2) test DB cross-check chỉ nên chạy trên môi trường có sẵn đường mạng tới DB (CI đã cấu hình), nên tự skip thay vì fail cứng khi không kết nối được, để tránh báo nhầm "lỗi" lên Telegram mỗi khi chạy từ máy ngoài mạng nội bộ.',
    confirm: 'Không cần - đã xác định rõ không phải bug',
    note: 'Phát hiện khi đối chiếu kết quả 2 lần chạy full suite gửi Telegram thật (16/10/2026, 16:14 và 16:18 giờ VN) với báo cáo bug hiện có — ghi lại ở đây để các lần chạy sau không bị hiểu nhầm là bug mới mỗi khi 2 loại fail này xuất hiện lại.',
  },
];

for (const r of rows) {
  const row = sheet.addRow(r);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 110;
  if (r.title.startsWith('[KHÔNG PHẢI BUG]') || r.title.startsWith('[ĐÃ GỠ BỎ KHỎI PHẠM VI') || r.title.startsWith('[KHÔNG BÁO')) {
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
sheet.dataValidations.add('J2:J14', {
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

// Phụ lục: dựng lại 3 sheet bằng chứng chi tiết bug date-boundary (bug #5 ở
// trên) từ dữ liệu tĩnh lib/bug5-date-boundary-evidence.json — nhúng sẵn
// value/màu/note của 3 sheet gốc (trước đây là file Excel riêng, đã gộp
// chung vào đây để chỉ còn 1 file bug report duy nhất, tránh nhầm lẫn nhiều
// bản). Dùng JSON tĩnh thay vì đọc lại 1 file .xlsx khác vì nguồn gốc đã bị
// xoá sau khi gộp — JSON là bản sao độc lập, không phụ thuộc file ngoài.
const evidencePath = new URL('./lib/bug5-date-boundary-evidence.json', import.meta.url).pathname;
const evidence = JSON.parse(await (await import('fs/promises')).readFile(evidencePath, 'utf8'));

function buildSheetFromEvidence(sourceName, newName, tabColorArgb) {
  const data = evidence[sourceName];
  if (!data) return;
  const dest = workbook.addWorksheet(newName, { properties: { tabColor: { argb: tabColorArgb } } });
  data.colWidths.forEach((w, i) => { dest.getColumn(i + 1).width = w; });
  for (const row of data.rows) {
    if (row.h) dest.getRow(row.r).height = row.h;
    for (const cell of row.cells) {
      const d = dest.getCell(row.r, cell.c);
      d.value = cell.v;
      if (cell.fill) d.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cell.fill } };
      if (cell.bold) d.font = { bold: true };
      if (cell.note) d.note = cell.note;
    }
  }
  dest.views = [{ state: 'frozen', ySplit: 1 }];
}

buildSheetFromEvidence('Bug #5 - chi tiết locale', 'Bug #5 - chi tiết locale', 'FFFCE4E4');
buildSheetFromEvidence('Bug #5 - ma trận nhiều lần chạy', 'Bug #5 - ma trận nhiều lần chạy', 'FFFCE4E4');
buildSheetFromEvidence('Bug #5 - bằng chứng curl', 'Bug #5 - bằng chứng curl', 'FFFCE4E4');

// File trung gian NỘI BỘ — không phải report để gửi user. build-summary.mjs
// đọc file này để dựng sheet bug bên trong US-4795-tong-hop.xlsx (file report
// bug + tổng hợp đã được gộp làm 1 theo yêu cầu, không còn xuất 2 file riêng).
const outPath = new URL('./results/.bug-report-internal.xlsx', import.meta.url).pathname;
await workbook.xlsx.writeFile(outPath);
console.log('Đã tạo file trung gian:', outPath);
