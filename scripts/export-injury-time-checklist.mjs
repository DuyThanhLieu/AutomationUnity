/**
 * Xuất checklist test tay TheSport injuryTime (docs/injury-time-manual-checklist.html)
 * sang Excel — REPORT_InjuryTime_Checklist.xlsx.
 *
 * Dùng exceljs (không phải xlsx/SheetJS community — không hỗ trợ style) để
 * có màu sắc/border/wrap text thật, dễ đọc như bản HTML gốc.
 *
 * Mỗi case chỉ verify 1 điều kiện duy nhất (đã tách từ case gộp) — xem
 * docs/injury-time-manual-checklist.html để đối chiếu HTML gốc.
 *
 * Chạy: node scripts/export-injury-time-checklist.mjs
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'REPORT_InjuryTime_Checklist.xlsx');

// Màu suite — khớp bảng màu suite-title trong bản HTML gốc
const SUITE_COLORS = {
  'Suite 1': 'B91C1C', // đỏ đậm
  'Suite 2': '92400E', // nâu cam
  'Suite 3': '1E40AF', // xanh dương đậm
  'Suite 4': '065F46', // xanh lá đậm
  'Suite 5': '581C87', // tím đậm
  'Suite 6': '475569', // xám xanh
};

const PRIO_COLORS = {
  HIGH: { fg: '991B1B', bg: 'FEE2E2' },
  MED: { fg: '92400E', bg: 'FEF3C7' },
  LOW: { fg: '0369A1', bg: 'E0F2FE' },
};

const S1 = 'Suite 1 — Lỗi 1 (Consumer): period-end thắng vĩnh viễn';
const S2 = 'Suite 2 — Lỗi 1 (Consumer): Extra Time — không leak injury hiệp 2';
const S3 = 'Suite 3 — Lỗi 2 (API): reader TheSport dead code';
const S4 = 'Suite 4 — Socket fb-live-v1 (OpenObserve)';
const S5 = 'Suite 5 — Regression: giữ nguyên hành vi Opta / ScoreDedupeStore';
const S6 = 'Suite 6 — Đối chiếu Replay Rule Mới (theo bảng ticket)';

const ROWS = [
  // ===== SUITE 1 (15 case) =====
  { suite: S1, group: 'A — Injury hiệp 1', num: 1, prio: 'HIGH',
    name: 'Injury hiệp 1 — current_injury_time KHÔNG rỗng dù type 11 đã tới trước',
    desc: 'Baseline cũ: chỉ 3/9 trận TS-only bắn được',
    steps: 'Chọn 1 trận TS-only đang live, đợi qua phút 45+ (đã có type 19 injury hiệp 1 VÀ type 11 còi HT cùng xuất hiện trong feed, bất kể thứ tự tới).\nChạy: redis-cli HGET event:<matchId> current_injury_time',
    verify: 'Giá trị trả về KHÔNG rỗng/nil',
    expected: 'PASS nếu có giá trị (không nil).\nBug cũ: chỉ bắn khi batch type 19 tới TRƯỚC batch type 11' },
  { suite: S1, group: 'A — Injury hiệp 1', num: 2, prio: 'HIGH',
    name: 'Injury hiệp 1 — giá trị nằm trong khoảng hợp lý 1-15 phút',
    desc: 'Tách riêng khỏi case #1: có giá trị chưa chắc giá trị đúng',
    steps: 'Dùng cùng trận/lệnh redis-cli ở case #1, đọc giá trị số cụ thể',
    verify: 'Giá trị nằm trong khoảng 1-15 (phút bù giờ hiệp 1 hợp lý theo luật bóng đá)',
    expected: 'PASS nếu 1 ≤ giá trị ≤ 15' },
  { suite: S1, group: 'B — Injury hiệp 2 (case CHÍNH)', num: 3, prio: 'HIGH',
    name: 'Injury hiệp 2 — current_injury_time KHÔNG rỗng sau khi hiệp 1 đã kết thúc từ lâu',
    desc: 'Baseline cũ: 0/14 trận bắn được — 100% fail',
    steps: 'Chọn 1 trận TS-only đang live, đợi qua phút 90+ (type 11 HT đã xuất hiện từ lâu, type 19 injury hiệp 2 vừa tới).\nChạy: redis-cli HGET event:<matchId> current_injury_time',
    verify: 'Giá trị trả về KHÔNG rỗng/nil',
    expected: 'PASS nếu có giá trị (không nil).\nFAIL = bug CHƯA fix, đúng hiện trạng ticket mô tả', isBugCase: true },
  { suite: S1, group: 'B — Injury hiệp 2 (case CHÍNH)', num: 4, prio: 'HIGH',
    name: 'Injury hiệp 2 — giá trị khớp bù giờ thật (đối chiếu nguồn khác)',
    desc: 'Tách riêng khỏi case #3: có giá trị chưa chắc giá trị đúng',
    steps: 'Dùng cùng trận ở case #3. Đối chiếu giá trị Redis với 1 nguồn độc lập (tường thuật trực tiếp, app đối thủ, hoặc timer trọng tài công bố)',
    verify: 'Giá trị Redis khớp (±1 phút) với nguồn đối chiếu độc lập',
    expected: 'PASS nếu lệch ≤ 1 phút so với nguồn đối chiếu' },
  { suite: S1, group: 'C — Clear đúng lúc còi HT', num: 5, prio: 'HIGH',
    name: 'Ngay TRƯỚC còi HT — current_injury_time vẫn còn giá trị injury hiệp 1',
    desc: 'Xác nhận giá trị tồn tại trước khi kiểm tra bị xoá',
    steps: 'Theo dõi 1 trận ở phút ~45+X, NGAY TRƯỚC khi type 11 (còi HT) xuất hiện trong feed',
    verify: 'current_injury_time = giá trị injury hiệp 1 (không rỗng)',
    expected: 'PASS nếu còn giá trị trước còi' },
  { suite: S1, group: 'C — Clear đúng lúc còi HT', num: 6, prio: 'HIGH',
    name: 'NGAY SAU còi HT — current_injury_time bị xoá (HDel hoặc = 0)',
    desc: 'Không leak giá trị injury hiệp 1 sau khi hiệp đã kết thúc',
    steps: 'Tiếp tục theo dõi trận ở case #5, ngay khi batch chứa type 11 xuất hiện (trong vòng 1 batch, không trễ)',
    verify: 'current_injury_time bị HDel (nil) hoặc publish/set về 0',
    expected: 'PASS nếu về 0/rỗng trong vòng 1 batch sau còi' },
  { suite: S1, group: 'D — Clear đúng lúc còi FT', num: 7, prio: 'HIGH',
    name: 'Ngay TRƯỚC còi FT — current_injury_time vẫn còn giá trị injury hiệp 2',
    desc: 'Xác nhận giá trị tồn tại trước khi kiểm tra bị xoá',
    steps: 'Theo dõi 1 trận ở phút ~90+X, NGAY TRƯỚC khi type 12 (còi FT) xuất hiện trong feed',
    verify: 'current_injury_time = giá trị injury hiệp 2 (không rỗng)',
    expected: 'PASS nếu còn giá trị trước còi' },
  { suite: S1, group: 'D — Clear đúng lúc còi FT', num: 8, prio: 'HIGH',
    name: 'NGAY SAU còi FT — current_injury_time bị xoá (HDel hoặc = 0)',
    desc: 'Không leak giá trị injury hiệp 2 sau khi hiệp đã kết thúc',
    steps: 'Tiếp tục theo dõi trận ở case #7, ngay khi batch chứa type 12 xuất hiện (trong vòng 1 batch, không trễ)',
    verify: 'current_injury_time bị HDel (nil) hoặc publish/set về 0',
    expected: 'PASS nếu về 0/rỗng trong vòng 1 batch sau còi' },
  { suite: S1, group: 'E — Nearest-boundary mapping', num: 9, prio: 'MED',
    name: 'time=46 map về P1, KHÔNG lệch sang P2',
    desc: 'Feed thật có 128 doc ở time=46 theo ticket',
    steps: 'Tìm (qua OpenObserve hoặc log raw feed) 1 message type=19 có time=46',
    verify: 'injuryPeriod(46) trả về periodFirstHalf (P1), KHÔNG trả về P2',
    expected: 'PASS nếu map đúng P1.\nBug liên quan: tsNormalizeInjuryTime (socket.go:285) dùng <= sẽ map sai' },
  { suite: S1, group: 'E — Nearest-boundary mapping', num: 10, prio: 'MED',
    name: 'time=91 map về P2, KHÔNG lệch sang ET1',
    desc: 'Feed thật có 144 doc ở time=91 theo ticket',
    steps: 'Tìm (qua OpenObserve hoặc log raw feed) 1 message type=19 có time=91',
    verify: 'injuryPeriod(91) trả về periodSecondHalf (P2), KHÔNG trả về ET1',
    expected: 'PASS nếu map đúng P2.\nBug liên quan: tsNormalizeInjuryTime (socket.go:285) dùng <= sẽ map sai' },
  { suite: S1, group: 'F — Reject add_time ≤ 0', num: 11, prio: 'MED',
    name: 'add_time = 0 bị reject, không set current_injury_time',
    desc: 'Feed có ~90 doc add_time âm/0 theo ticket',
    steps: 'Tìm 1 message type=19 với add_time = 0 (qua log raw feed hoặc OpenObserve nếu có lưu payload gốc)',
    verify: 'current_injury_time của trận đó KHÔNG bị set/thay đổi theo message này',
    expected: 'PASS nếu giá trị 0 không lan vào Redis' },
  { suite: S1, group: 'F — Reject add_time ≤ 0', num: 12, prio: 'MED',
    name: 'add_time < 0 (âm) bị reject, không set current_injury_time',
    desc: 'Tách riêng khỏi case #11: =0 và <0 là 2 giá trị khác nhau, code có thể chỉ check == 0',
    steps: 'Tìm 1 message type=19 với add_time < 0 (âm — ticket xác nhận feed có tồn tại loại này)',
    verify: 'current_injury_time của trận đó KHÔNG bị set theo giá trị âm này',
    expected: 'PASS nếu giá trị âm không lan vào Redis' },
  { suite: S1, group: 'G — Reject time outlier', num: 13, prio: 'MED',
    name: 'time=4 bị reject — injuryPeriod() không map vào period nào',
    desc: 'Ticket nêu cụ thể giá trị time=4 xuất hiện trong feed thật',
    steps: 'Tìm 1 message type=19 với time=4',
    verify: 'injuryPeriod(4) trả về false/không map period nào',
    expected: 'PASS nếu time=4 bị bỏ qua hoàn toàn' },
  { suite: S1, group: 'G — Reject time outlier', num: 14, prio: 'MED',
    name: 'time=901 bị reject — injuryPeriod() không map vào period nào',
    desc: 'Ticket nêu cụ thể giá trị time=901 xuất hiện trong feed thật',
    steps: 'Tìm 1 message type=19 với time=901',
    verify: 'injuryPeriod(901) trả về false/không map period nào',
    expected: 'PASS nếu time=901 bị bỏ qua hoàn toàn' },
  { suite: S1, group: 'G — Reject time outlier', num: 15, prio: 'LOW',
    name: 'current_injury_time KHÔNG bị set bởi message time=4 hoặc time=901',
    desc: 'Xác nhận tác động thật ở Redis, không chỉ đúng ở tầng logic injuryPeriod()',
    steps: 'Ngay sau khi xác nhận case #13/#14 ở tầng logic, kiểm tra thêm giá trị Redis thật của trận đó tại thời điểm message outlier xuất hiện',
    verify: 'current_injury_time không đổi giá trị (không nhảy theo 4 hoặc 901) tại thời điểm message outlier tới',
    expected: 'PASS nếu Redis không phản ánh giá trị rác' },

  // ===== SUITE 2 (3 case) =====
  { suite: S2, group: '', num: 1, prio: 'HIGH',
    name: 'Trận vào ET — current_injury_time về 0 ngay khi type 12 (FT) xuất hiện',
    desc: 'Vì type 12 đã có trong snapshot ngay khi hết giờ chính thức',
    steps: 'Bắt 1 trận thật đi vào hiệp phụ (hiếm — cần theo dõi live hoặc dùng trận đã biết trước có ET). Theo dõi current_injury_time ngay khi 90 phút chính thức kết thúc (type 12 xuất hiện)',
    verify: 'current_injury_time = 0/rỗng ngay khi type 12 xuất hiện (trong vòng 1 batch)',
    expected: 'PASS nếu về 0 đúng lúc' },
  { suite: S2, group: '', num: 2, prio: 'HIGH',
    name: 'Trận vào ET — KHÔNG còn giữ giá trị injury hiệp 2 cũ (90+X)',
    desc: 'Tách riêng khỏi case #1: về 0 khác với "không còn leak giá trị cũ"',
    steps: 'Dùng cùng trận ở case #1. So sánh giá trị current_injury_time NGAY SAU type 12 với giá trị injury hiệp 2 đã ghi nhận TRƯỚC đó',
    verify: 'Giá trị mới ≠ giá trị injury hiệp 2 cũ (không bị giữ lại/leak)',
    expected: 'PASS nếu giá trị cũ không còn xuất hiện lại' },
  { suite: S2, group: '', num: 3, prio: 'LOW',
    name: 'Trận vào ET — không tự chế injury time giả cho ET1/ET2 trong suốt hiệp phụ',
    desc: 'Xác nhận code KHÔNG cố gắng suy ra injury ET ngoài phạm vi ticket',
    steps: 'Trong lúc trận đang ở ET (phút 91-120), kiểm tra current_injury_time liên tục trong suốt hiệp phụ (nhiều lần đọc, không chỉ 1 lần)',
    verify: 'current_injury_time = 0/rỗng tại MỌI thời điểm kiểm tra trong ET',
    expected: 'PASS nếu luôn 0/rỗng suốt ET, không tự chế' },

  // ===== SUITE 3 (8 case) =====
  { suite: S3, group: 'A — announcedInjuryTime (case CHÍNH, AC #4)', num: 1, prio: 'HIGH',
    name: 'Response có field announcedInjuryTime',
    desc: 'Điều kiện cấu trúc — tách riêng khỏi giá trị/đơn vị',
    steps: 'Chọn 1 trận TS-only đang live, đã xác nhận Redis current_injury_time có giá trị (qua Suite 1 case #3).\nGET /api/v2/football/event/{eventId}/overview (cần tra path chính xác)',
    verify: 'Response JSON có field announcedInjuryTime (không undefined/missing)',
    expected: 'PASS nếu field tồn tại trong response' },
  { suite: S3, group: 'A — announcedInjuryTime (case CHÍNH, AC #4)', num: 2, prio: 'HIGH',
    name: 'announcedInjuryTime khác 0',
    desc: 'Case CHÍNH của ticket — verify riêng khỏi case cấu trúc #1',
    steps: 'Dùng cùng response ở case #1, đọc giá trị field announcedInjuryTime',
    verify: 'Giá trị announcedInjuryTime != 0',
    expected: 'PASS nếu khác 0.\nFAIL = bug CHƯA fix (dead code chưa được wire)', isBugCase: true },
  { suite: S3, group: 'B — Đơn vị chuyển đổi', num: 3, prio: 'HIGH',
    name: 'announcedInjuryTime = current_injury_time (Redis, phút) × 60',
    desc: 'Verify GetCurrentInjuryTime convert đúng contract phút→giây',
    steps: 'Lấy current_injury_time từ Redis (phút) và announcedInjuryTime từ API (giây) CÙNG LÚC cho 1 trận',
    verify: 'API_giây = Redis_phút × 60 (chính xác, sai số 0)',
    expected: 'PASS nếu khớp công thức chính xác' },
  { suite: S3, group: 'C — Regression trận có Opta', num: 4, prio: 'MED',
    name: 'Trận có map Opta — announcedInjuryTime lấy từ Opta, không bị TheSport đè',
    desc: 'Không phá hành vi hiện có cho trận có Opta',
    steps: 'Chọn 1 trận CÓ map Opta đang live, có injury time từ nguồn Opta.\nGET /api/v2/football/event/{eventId}/overview',
    verify: 'announcedInjuryTime khớp giá trị Opta injury time, KHÔNG bị TheSport fallback ghi đè',
    expected: 'PASS nếu hành vi Opta-first không đổi' },
  { suite: S3, group: 'D — Trường hợp rỗng hợp lệ', num: 5, prio: 'LOW',
    name: 'Trận chưa tới injury (phút <40) — HTTP status 200',
    desc: 'Case rỗng hợp lệ — tách điều kiện status khỏi giá trị',
    steps: 'Chọn 1 trận đang ở phút <40 (chưa tới thời điểm injury) hoặc chưa live.\nGET /api/v2/football/event/{eventId}/overview',
    verify: 'HTTP status = 200 (không 500/lỗi)',
    expected: 'PASS nếu 200, không crash' },
  { suite: S3, group: 'D — Trường hợp rỗng hợp lệ', num: 6, prio: 'LOW',
    name: 'Trận chưa tới injury (phút <40) — announcedInjuryTime = 0',
    desc: 'Tách riêng khỏi case #5: status đúng không đồng nghĩa giá trị đúng',
    steps: 'Dùng cùng response ở case #5',
    verify: 'announcedInjuryTime = 0 (hợp lệ vì chưa tới thời điểm injury, không phải bug)',
    expected: 'PASS nếu = 0 đúng ngữ cảnh' },
  { suite: S3, group: 'E — enricher.go score[6]', num: 7, prio: 'LOW',
    name: 'Vendor xác nhận vẫn chỉ gửi 6 phần tử (len(score) == 6)',
    desc: 'Xác nhận tiền đề của bug vẫn đúng — chưa đổi contract vendor',
    steps: 'Kiểm tra field score trong hash matches_real_time (nếu còn quyền truy cập) cho 1 trận TS-only',
    verify: 'len(score) == 6 (vendor không đổi contract, score[6] chắc chắn không tồn tại)',
    expected: 'PASS nếu vẫn đúng 6 phần tử' },
  { suite: S3, group: 'E — enricher.go score[6]', num: 8, prio: 'LOW',
    name: 'enricher.go:554 không còn đọc score[6] làm add_time',
    desc: 'Tách riêng khỏi case #7: xác nhận vendor data khác xác nhận code đã sửa',
    steps: 'Review code enricher.go (dòng ~554) sau khi fix deploy, hoặc kiểm tra AddTime output không còn phụ thuộc score[6] qua log/debug',
    verify: 'Nhánh đọc score[6] đã bị xoá hoặc chuyển sang đọc Redis (current_injury_time)',
    expected: 'PASS nếu không còn đọc field không tồn tại' },

  // ===== SUITE 4 (4 case) =====
  { suite: S4, group: '', num: 1, prio: 'HIGH',
    name: 'Message source="ts" với score[5] != 0 xuất hiện trên fb-live-v1',
    desc: 'Baseline cũ: 0 message trong 12h (345 message chỉ từ opta_ma3dp)',
    steps: "OpenObserve, stream emqx_events_publish, filter 12h gần nhất.\nSQL: SELECT * FROM emqx_events_publish WHERE source='ts' AND topic='fb-live-v1' AND score[5]!=0",
    verify: 'Số message > 0 (baseline cũ = 0)',
    expected: 'PASS nếu > 0 message.\nFAIL = 0 message → bug Consumer chưa fix hoặc chưa deploy', isBugCase: true },
  { suite: S4, group: '', num: 2, prio: 'MED',
    name: 'count(source=ts, score[5]!=0) > 0 trong cùng khung 12h với opta_ma3dp',
    desc: 'Xác nhận nguồn ts thật sự phát sinh song song với nguồn opta, không phải leftover từ case #1',
    steps: 'So sánh count(source=ts, score[5]!=0) với count(source=opta_ma3dp, injuryTime!=0) trong cùng khung 12h — chạy 2 query riêng',
    verify: 'count(source=ts, score[5]!=0) > 0 (không yêu cầu bằng count(opta))',
    expected: 'PASS nếu count(ts) > 0, ghi lại tỷ lệ để theo dõi xu hướng' },
  { suite: S4, group: '', num: 3, prio: 'MED',
    name: 'Có ít nhất 1 trận distinct với message injury hiệp 2 (matchTime 90-100)',
    desc: 'Đối chiếu trực tiếp Acceptance Criteria #3',
    steps: "SQL: SELECT DISTINCT matchId FROM emqx_events_publish WHERE source='ts' AND topic='fb-live-v1' AND score[5]>0 AND matchTime BETWEEN 90 AND 100",
    verify: 'Số trận distinct > 0 (baseline cũ: 0/14 trận)',
    expected: 'PASS nếu > 0 trận có message injury hiệp 2' },
  { suite: S4, group: '', num: 4, prio: 'LOW',
    name: 'Số trận có injury hiệp 2 (case #3) tăng đáng kể so với baseline 0/14',
    desc: 'Tách riêng khỏi case #3: có ít nhất 1 trận khác với cải thiện diện rộng',
    steps: 'Dùng kết quả case #3, so với mẫu 14 trận baseline trong ticket (hoặc mẫu tương đương kích thước)',
    verify: 'Tỷ lệ trận có injury hiệp 2 > 50% trong mẫu theo dõi',
    expected: 'PASS nếu cải thiện diện rộng, không phải may rủi 1 trận' },

  // ===== SUITE 5 (3 case) =====
  { suite: S5, group: '', num: 1, prio: 'HIGH',
    name: 'Trận có Opta — message injury từ opta_ma3dp vẫn xuất hiện bình thường',
    desc: 'Opta-suppression phải còn hoạt động đúng',
    steps: 'Chọn 1 trận có map Opta đang live, theo dõi socket message nguồn opta_ma3dp qua vài phút',
    verify: 'Message injury source=opta_ma3dp xuất hiện đều đặn, không bị gián đoạn',
    expected: 'PASS nếu Opta injury time không đổi hành vi' },
  { suite: S5, group: '', num: 2, prio: 'MED',
    name: 'Không có 2 message publish(0) trùng nhau liên tiếp ngay sau còi hết hiệp',
    desc: 'ScoreDedupeStore vẫn lọc trùng đúng khi closed[period] set qua nhiều batch',
    steps: 'Theo dõi socket log 1 trận qua nhiều batch liên tiếp quanh mốc còi hết hiệp (HT hoặc FT)',
    verify: 'Chỉ có đúng 1 message publish(0) tại thời điểm clear, không có duplicate ở batch sau',
    expected: 'PASS nếu không có duplicate publish bất thường' },
  { suite: S5, group: '', num: 3, prio: 'LOW',
    name: 'Trận thường (không injury) — field score/status không bị ảnh hưởng',
    desc: 'Smoke test diện rộng — không phá vỡ luồng cơ bản',
    steps: 'Chọn ngẫu nhiên 5-10 trận đang live bất kỳ, theo dõi socket/API cơ bản (score, status) không liên quan injury',
    verify: 'Score, status của tất cả trận mẫu vẫn đúng như trước khi fix, không phát sinh lỗi mới',
    expected: 'PASS nếu không phát sinh lỗi ngoài phạm vi injury time' },

  // ===== SUITE 6 (6 case) =====
  { suite: S6, group: '', num: 1, prio: 'MED',
    name: 'Số trận có ≥1 lần bắn injury (rule mới) ≥ 856',
    desc: 'So với baseline code cũ ~685 trận',
    steps: 'Đọc kết quả replay script, lấy metric "trận có ≥1 lần bắn injury"',
    verify: 'Số trận ≥ 856 (cho phép dao động nhỏ do dữ liệu live thay đổi theo thời gian chạy replay)',
    expected: 'PASS nếu ≥ 856 trận' },
  { suite: S6, group: '', num: 2, prio: 'MED',
    name: 'Tổng số lần bắn injury (rule mới) ≥ 1,522',
    desc: 'So với baseline code cũ ~691 lần — tách khỏi case #1 (số TRẬN khác số LẦN BẮN)',
    steps: 'Đọc kết quả replay script, lấy metric "tổng số lần bắn injury"',
    verify: 'Tổng số lần bắn ≥ 1,522',
    expected: 'PASS nếu ≥ 1,522 lần' },
  { suite: S6, group: '', num: 3, prio: 'HIGH',
    name: '0 trận bị MẤT so với code hiện tại (không regression)',
    desc: 'Điều kiện an toàn quan trọng nhất — tiêu chí PASS/FAIL cứng, không phải "tốt hơn thì OK"',
    steps: 'So sánh tập trận có injury (rule mới) với tập trận có injury (code cũ) — kiểm tra tập cũ có phải subset của tập mới',
    verify: 'MỌI trận có injury ở code cũ đều PHẢI có injury ở rule mới (0 trận bị rơi mất)',
    expected: 'PASS nếu 0 trận bị mất.\nFAIL = regression nghiêm trọng, KHÔNG được deploy dù số liệu tổng thể tăng', isBugCase: true },
  { suite: S6, group: '', num: 4, prio: 'LOW',
    name: '+171 trận trước đây không bắn gì, giờ có bắn ≥1 lần',
    desc: 'Xác nhận đúng con số cải thiện cụ thể ticket nêu, tách khỏi case #1 (tổng số khác số MỚI THÊM)',
    steps: 'Tính: (trận có injury rule mới) − (trận có injury code cũ) = số trận MỚI có injury',
    verify: 'Số trận mới ≥ 171',
    expected: 'PASS nếu ≥ 171 trận mới' },
  { suite: S6, group: '', num: 5, prio: 'LOW',
    name: '≥ 614 trận bắn đúng 2 lần (P1 + P2)',
    desc: 'Phân bố phổ biến nhất theo ticket — tách khỏi case #6 (2 lần khác >4-5 lần)',
    steps: 'Từ kết quả replay, đếm số trận có đúng 2 lần bắn injury',
    verify: 'Số trận bắn đúng 2 lần ≥ 614',
    expected: 'PASS nếu ≥ 614 trận' },
  { suite: S6, group: '', num: 6, prio: 'LOW',
    name: '0 trận bắn > 4-5 lần (không có outlier/loop bug mới)',
    desc: 'Dấu hiệu bug mới do thay đổi logic — điều kiện AN TOÀN, không phải điều kiện "tốt hơn"',
    steps: 'Từ kết quả replay, tìm max(số lần bắn/trận) và liệt kê các trận outlier nếu có',
    verify: 'Không có trận nào bắn > 4-5 lần',
    expected: 'PASS nếu không có outlier.\nFAIL = nghi ngờ loop/duplicate bug mới', isBugCase: true },
];

const HEADERS = ['✓', 'Suite', 'Nhóm', '#', 'Ưu tiên', 'Tên case', 'Mô tả ngắn', 'Bước thực hiện', 'Cần verify (1 điều kiện)', 'Kết quả mong đợi', 'Kết quả thực tế', 'Người test', 'Ngày test'];
const COL_WIDTHS = [4, 3, 22, 4, 9, 34, 30, 44, 42, 38, 15, 14, 12];

function suiteKey(suiteFullName) {
  return suiteFullName.split(' —')[0].trim(); // "Suite 1"
}

// ===== FLOW CHECK MANUAL — luồng thực hiện theo thứ tự thật, không phải bảng case =====
const FLOW_STEPS = [
  { phase: 'GIAI ĐOẠN 0 — Điều kiện tiên quyết (BLOCKER nếu thiếu)', color: '991B1B', steps: [
    { title: '1. Xác nhận thứ tự deploy: Consumer TRƯỚC, API SAU', detail: 'Nếu deploy API trước Consumer, API sẽ đọc Redis rỗng (dead code vừa wire vào nhưng chưa có data để đọc) — kết quả test sẽ SAI (fail giả) dù code API đã đúng.', owner: 'Dev/DevOps xác nhận trước khi QA bắt đầu' },
    { title: '2. Xin quyền truy cập Redis staging', detail: 'Cần redis-cli hoặc tool tương đương để chạy HGET event:<matchId> current_injury_time. Không có quyền này → KHÔNG chạy được Suite 1, Suite 2 case #1/#2 (Excel sheet chính).', owner: 'QA xin quyền, có thể mất thời gian chờ' },
    { title: '3. Xin quyền truy cập OpenObserve', detail: 'Cần dashboard hoặc API search cho stream emqx_events_publish. Không có quyền này → KHÔNG chạy được Suite 1 nhóm E/F/G (một phần), Suite 4 toàn bộ.', owner: 'QA xin quyền, có thể mất thời gian chờ' },
    { title: '4. Xác nhận path API chính xác chứa announcedInjuryTime', detail: 'Ticket chỉ nêu tên field, không nêu route cụ thể. Giả định tạm /api/v2/football/event/{eventId}/overview — PHẢI xác nhận lại với dev trước khi chạy Suite 3.', owner: 'QA hỏi dev/BE trước khi chạy Suite 3' },
    { title: '5. Có danh sách match_id TS-only đang live tại thời điểm test', detail: 'KHÔNG có cách tự phát hiện từ Postgres (dữ liệu injury time không lưu DB, chỉ có trong Redis/Kafka) — cần dev/PM cung cấp trước, hoặc tự query Redis SCAN event:* rồi lọc thủ công.', owner: 'Dev/PM cung cấp, hoặc QA tự dò qua Redis' },
  ]},
  { phase: 'GIAI ĐOẠN 1 — Verify tầng Consumer (Redis) trước khi verify API', color: 'B91C1C', steps: [
    { title: '6. Chọn 1 trận TS-only đang live, theo dõi xuyên suốt 90+ phút', detail: 'Cùng 1 trận dùng lại cho nhiều case (Suite 1 case #1-8) — không cần trận mới cho mỗi case, tiết kiệm thời gian theo dõi live.', owner: 'QA' },
    { title: '7. Verify injury hiệp 1 (phút 45+X) — Suite 1 case #1, #2', detail: 'Case CHÍNH: current_injury_time không rỗng + giá trị 1-15 phút.', owner: 'QA — xem Excel sheet chính, Suite 1' },
    { title: '8. Verify clear đúng lúc còi HT — Suite 1 case #5, #6', detail: 'Theo dõi 2 mốc liên tiếp quanh còi HT (trước/sau).', owner: 'QA' },
    { title: '9. Verify injury hiệp 2 (phút 90+X) — Suite 1 case #3, #4 ⚠ CASE CHÍNH CỦA TICKET', detail: 'Đây là bug chính ticket mô tả (0/14 trận baseline cũ) — nếu case này vẫn FAIL, dừng lại, KHÔNG tiếp tục qua Giai đoạn 2 (API chắc chắn cũng sẽ fail theo).', owner: 'QA — quyết định GO/NO-GO cho giai đoạn sau' },
    { title: '10. Verify clear đúng lúc còi FT — Suite 1 case #7, #8', detail: 'Theo dõi 2 mốc liên tiếp quanh còi FT (trước/sau).', owner: 'QA' },
    { title: '11. (Nếu có điều kiện) Verify nearest-boundary + reject input rác', detail: 'Suite 1 nhóm E/F/G (case #9-15) — cần OpenObserve để tìm message mẫu time=46/91/4/901, add_time≤0. Có thể làm SAU nếu chưa có quyền OpenObserve, không block giai đoạn tiếp theo.', owner: 'QA — có thể làm song song/sau' },
  ]},
  { phase: 'GIAI ĐOẠN 2 — Verify tầng Socket (chỉ sau khi Giai đoạn 1 PASS)', color: '065F46', steps: [
    { title: '12. Query OpenObserve 12h gần nhất — Suite 4 case #1 ⚠ CASE CHÍNH', detail: 'Baseline cũ = 0 message. Nếu vẫn 0 sau deploy → bug Consumer chưa fix thật hoặc chưa deploy đúng — quay lại Giai đoạn 1 kiểm tra lại.', owner: 'QA — quyết định GO/NO-GO' },
    { title: '13. Verify tỷ lệ + injury hiệp 2 trên socket — Suite 4 case #2, #3, #4', detail: 'Đối chiếu trực tiếp Acceptance Criteria #3 của ticket.', owner: 'QA' },
  ]},
  { phase: 'GIAI ĐOẠN 3 — Verify tầng API (chỉ sau khi Giai đoạn 1 PASS)', color: '1E40AF', steps: [
    { title: '14. Gọi API cho đúng trận đã verify Redis ở bước 9 — Suite 3 case #1, #2 ⚠ CASE CHÍNH', detail: 'DÙNG LẠI cùng match_id đã xác nhận có current_injury_time ở Suite 1 case #3 — không chọn trận khác, để đảm bảo so sánh 1-1 đúng.', owner: 'QA' },
    { title: '15. Verify đơn vị chuyển đổi phút→giây — Suite 3 case #3', detail: 'Đọc Redis (phút) và API (giây) CÙNG LÚC, không lệch thời điểm quá xa vì injury time có thể đổi giữa 2 lần đọc.', owner: 'QA' },
    { title: '16. Verify regression trận có Opta — Suite 3 case #4', detail: 'Cần 1 trận KHÁC (có map Opta) — không dùng trận TS-only ở trên.', owner: 'QA' },
    { title: '17. Verify case rỗng hợp lệ + enricher.go — Suite 3 case #5-8', detail: 'Có thể làm bất kỳ lúc nào, không phụ thuộc thứ tự — mức độ ưu tiên LOW.', owner: 'QA — có thể làm song song' },
  ]},
  { phase: 'GIAI ĐOẠN 4 — Regression & Đối chiếu số liệu diện rộng', color: '581C87', steps: [
    { title: '18. Smoke test trận thường + Opta-suppression — Suite 5', detail: 'Đảm bảo fix không phá vỡ hành vi cũ (Opta injury time, ScoreDedupeStore).', owner: 'QA' },
    { title: '19. Yêu cầu dev chạy lại replay script — Suite 6', detail: 'QA KHÔNG tự chạy được — cần dev backend chạy script trên topic thesport_football_match_incident (1,859,820 message, 6,294 trận) rồi gửi kết quả cho QA đối chiếu số liệu.', owner: 'Dev backend chạy, QA đối chiếu kết quả' },
    { title: '20. Đối chiếu "0 trận bị mất" TRƯỚC — Suite 6 case #3 ⚠ ĐIỀU KIỆN CHẶN', detail: 'Đây là tiêu chí cứng — nếu có trận bị mất, KHÔNG được duyệt deploy dù các số liệu khác đều tốt hơn.', owner: 'QA — quyết định GO/NO-GO cuối cùng' },
  ]},
  { phase: 'GIỚI HẠN — KHÔNG test trong lần này', color: '475569', steps: [
    { title: 'injuryTime cho ET1/ET2', detail: 'Cần overtime kickoff score[4], tách ticket riêng nếu product cần. Suite 2 trong sheet chính CHỈ verify không leak giá trị cũ (an toàn), KHÔNG verify giá trị ET đúng.', owner: '—' },
  ]},
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AutomationUnity QA';
  wb.created = new Date();

  const ws = wb.addWorksheet('InjuryTime Checklist', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 1 }],
  });

  ws.columns = COL_WIDTHS.map((w) => ({ width: w }));

  // ===== Title row (merged) =====
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'CHECKLIST TEST TAY — TheSport injuryTime (Consumer + API) — [API][Football][TheSport] injuryTime hiệp 2 không bao giờ bắn socket, API luôn trả announcedInjuryTime = 0';
  titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  ws.getRow(1).height = 26;

  // ===== Header row =====
  const headerRow = ws.getRow(2);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF94A3B8' } } };
  });
  headerRow.height = 20;

  let rowIdx = 3;
  let lastSuite = null;

  for (const r of ROWS) {
    // Suite separator row (merged banner) whenever suite changes
    if (r.suite !== lastSuite) {
      lastSuite = r.suite;
      ws.mergeCells(rowIdx, 1, rowIdx, HEADERS.length);
      const bannerCell = ws.getCell(rowIdx, 1);
      bannerCell.value = `  ${r.suite}`;
      bannerCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      bannerCell.alignment = { vertical: 'middle', horizontal: 'left' };
      const key = suiteKey(r.suite);
      bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + SUITE_COLORS[key] } };
      ws.getRow(rowIdx).height = 22;
      rowIdx++;
    }

    const row = ws.getRow(rowIdx);
    const prioColor = PRIO_COLORS[r.prio];

    row.getCell(2).value = r.suite.split('—')[0].trim();
    row.getCell(3).value = r.group || '';
    row.getCell(4).value = r.num;
    row.getCell(5).value = r.prio;
    row.getCell(6).value = r.name;
    row.getCell(7).value = r.desc;
    row.getCell(8).value = r.steps;
    row.getCell(9).value = r.verify;
    row.getCell(10).value = r.expected;
    row.getCell(11).value = '';
    row.getCell(12).value = '';
    row.getCell(13).value = '';

    // Checkbox-style tick cell — data validation dropdown ☑/☐
    const chkCell = row.getCell(1);
    chkCell.value = '☐';
    chkCell.dataValidation = { type: 'list', allowBlank: false, formulae: ['"☐,☑"'] };
    chkCell.alignment = { vertical: 'middle', horizontal: 'center' };
    chkCell.font = { size: 13 };

    // Priority badge coloring
    const prioCell = row.getCell(5);
    prioCell.font = { bold: true, size: 9, color: { argb: 'FF' + prioColor.fg } };
    prioCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + prioColor.bg } };
    prioCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Case name bold
    row.getCell(6).font = { bold: true, size: 10 };
    row.getCell(6).alignment = { vertical: 'top', wrapText: true };

    // Highlight expected-result cell red-ish if it's a "known bug, expect FAIL" case
    const expectedCell = row.getCell(10);
    if (r.isBugCase) {
      expectedCell.font = { size: 10, color: { argb: 'FF991B1B' } };
      expectedCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
    } else {
      expectedCell.font = { size: 10, color: { argb: 'FF15803D' } };
    }

    // Wrap text + top align for all text-heavy columns
    [2, 3, 7, 8, 9, 10].forEach((c) => {
      row.getCell(c).alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
      row.getCell(c).font = row.getCell(c).font || { size: 10 };
    });
    row.getCell(4).alignment = { vertical: 'top', horizontal: 'center' };
    row.getCell(4).font = { size: 10, bold: true, color: { argb: 'FF475569' } };

    // Result / Tester / Date columns — light input-ready background
    [11, 12, 13].forEach((c) => {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
      row.getCell(c).alignment = { vertical: 'top', horizontal: 'left' };
    });

    // Borders on all cells in the row
    for (let c = 1; c <= HEADERS.length; c++) {
      row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    }

    row.height = Math.max(48, r.steps.split('\n').length * 14 + 30, r.expected.split('\n').length * 14 + 24);
    rowIdx++;
  }

  // Auto-filter on header row
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: HEADERS.length } };

  buildFlowSheet(wb);

  await wb.xlsx.writeFile(OUT_PATH);
  console.log(`✓ Đã xuất: ${OUT_PATH} (${ROWS.length} case + 1 sheet Flow Check Manual, có màu/border/wrap rõ ràng)`);
}

function buildFlowSheet(wb) {
  const flow = wb.addWorksheet('Flow Check Manual', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  flow.columns = [{ width: 4 }, { width: 44 }, { width: 62 }, { width: 32 }];

  flow.mergeCells(1, 1, 1, 4);
  const title = flow.getCell(1, 1);
  title.value = 'FLOW CHECK MANUAL — Thứ tự thực hiện thật (không phải bảng case, đọc từ trên xuống)';
  title.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  flow.getRow(1).height = 26;

  let r = 2;
  for (const phase of FLOW_STEPS) {
    flow.mergeCells(r, 1, r, 4);
    const banner = flow.getCell(r, 1);
    banner.value = `  ${phase.phase}`;
    banner.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    banner.alignment = { vertical: 'middle', horizontal: 'left' };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + phase.color } };
    flow.getRow(r).height = 22;
    r++;

    const header = flow.getRow(r);
    ['✓', 'Bước cần làm', 'Chi tiết / Lý do', 'Ai làm'].forEach((h, i) => {
      const c = header.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      c.border = { bottom: { style: 'medium', color: { argb: 'FF94A3B8' } } };
      c.alignment = { vertical: 'middle' };
    });
    header.height = 18;
    r++;

    for (const step of phase.steps) {
      const row = flow.getRow(r);
      const isBlocker = step.title.includes('⚠');

      const chk = row.getCell(1);
      chk.value = '☐';
      chk.dataValidation = { type: 'list', allowBlank: false, formulae: ['"☐,☑"'] };
      chk.alignment = { vertical: 'top', horizontal: 'center' };
      chk.font = { size: 13 };

      const titleCell = row.getCell(2);
      titleCell.value = step.title;
      titleCell.font = { bold: true, size: 10, color: { argb: isBlocker ? 'FF991B1B' : 'FF1A1A2E' } };
      titleCell.alignment = { vertical: 'top', wrapText: true };
      if (isBlocker) {
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
      }

      const detailCell = row.getCell(3);
      detailCell.value = step.detail;
      detailCell.font = { size: 10 };
      detailCell.alignment = { vertical: 'top', wrapText: true };

      const ownerCell = row.getCell(4);
      ownerCell.value = step.owner;
      ownerCell.font = { size: 10, italic: true, color: { argb: 'FF64748B' } };
      ownerCell.alignment = { vertical: 'top', wrapText: true };

      for (let c = 1; c <= 4; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }

      const lines = Math.max(step.title.length / 42, step.detail.length / 55, 1);
      row.height = Math.max(34, Math.ceil(lines) * 14 + 16);
      r++;
    }
    r++; // blank spacer row between phases
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
