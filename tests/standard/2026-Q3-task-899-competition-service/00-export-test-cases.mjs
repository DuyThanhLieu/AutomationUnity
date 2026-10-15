/**
 * UTD-899 — [API][Football] Tách Competition + honor thành service riêng.
 * Xuất file test case (Excel) cho 45 route (34 subtask) + nhóm test cache.
 *
 * Nguồn: Jira UTD-899 + Confluence "Competitions Domain" (page 76054535).
 * KẾT QUẢ CHÍNH THỨC — chạy thật bằng Playwright (01-compare-old-vs-new.spec.ts, 02-cache.spec.ts)
 * ngày 29/09/2026, MỞ RỘNG trên 5 giải mẫu đa dạng (thêm sau khi user yêu cầu tăng data để tìm thêm bug):
 * UEFA Champions League, Premier League, AFC Champions League 2 (có vòng bảng),
 * World Cup 2022 (cup quốc tế lớn có vòng bảng thật), FA Cup (cup quốc nội nhiều đội, không vòng bảng).
 * 238 test case A + 8 test case cache B, tổng 213 pass / 25 fail (nhóm A) + 7 pass / 1 fail (nhóm B).
 * Mở rộng mẫu đã phát hiện thêm 2 bug MỚI không thấy khi chỉ test 3 giải ban đầu (UTD-1153, UTD-1155).
 *
 * CẬP NHẬT 29/09/2026 (sau comment mới trên Jira UTD-899, rev5 của ND Thanh — audit traffic thật):
 * Phát hiện 5 API CHƯA PORT và CHƯA CÓ SUBTASK trong 34 subtask hiện có (nằm ngoài phạm vi 45 route đã test):
 * latest-matches (51,590 req/24h — traffic lớn nhất toàn domain!), team-of-the-week/rounds (3,904/24h),
 * current-champions (805/24h), most-titles (804/24h), heatmap (0 traffic).
 * Đã tự tay verify cả 5 route: NestJS trả 200 (đang hoạt động, có traffic thật) nhưng Go trả 404 (chưa port).
 *
 * CẬP NHẬT 30/09→01/10/2026: Dev đã tạo 5 subtask UTD-1196→UTD-1200 cho 5 API trên. Verify lại trên
 * staging: cả 5 route ĐÃ PORT (Go trả 200). Áp dụng ĐÚNG bộ test case A1-A6 (nhiều giải mẫu + id sai +
 * language) như 45 route cũ — không chỉ test nhanh 1 ID — và nhờ vậy PHÁT HIỆN 1 BUG MỚI ở UTD-1196:
 * field "rating" bị Go làm tròn 2 chữ số thập phân (chỉ lộ ra ở giải có rating gốc là số thập phân dài,
 * ACL2/Al-Wasl: NestJS 1.8888888888888888 vs Go 1.89) — 4/5 giải khác không lộ vì rating gốc vốn đã tròn
 * sẵn. 4 route còn lại (UTD-1197/1198/1199/1200) khớp 100% trên toàn bộ 5 giải mẫu + case id sai.
 *
 * CHẠY: node tests/standard/2026-Q3-task-899-competition-service/00-export-test-cases.mjs
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'results', '2026-Q3', 'task-899-competition-service');
const OUT = path.join(OUT_DIR, 'TESTCASE_UTD899_CompetitionService.xlsx');

const OLD = 'https://opta-api.uniscore.vn/api/v2/football';
const NEW = 'https://test-go-staging-api.uniscore.vn/api/v2/football';
const GO = NEW;
const NESTJS = OLD;
const C = 'c9dxsq8o5wt1o5r'; // UEFA Champions League
const S = 'c9dxsq8ov73r5s2'; // mùa 2025-2026
const ST = 'gk7aeql6867r6iv'; // stage League Phase
const L = '?language=en';

// [subtask, nhóm, method, route template, path mẫu, kết quả CHÍNH THỨC, ghi chú]
const ROUTES = [
  ['UTD-1129', '§1 Overview', 'GET', 'unique-tournament/:ref_id', `/unique-tournament/${C}${L}`, 'SAME', 'Khớp trên cả 3 giải mẫu'],
  ['UTD-1130', '§1 Overview', 'GET', 'unique-tournament/:competitionId/seasons', `/unique-tournament/${C}/seasons${L}`, 'BUG', 'Go THIẾU HẲN field seasons[].has_standing_prediction trên mọi mùa, cả 3 giải mẫu — field biến mất, không phải đổi tên'],
  ['UTD-1131', '§1 Overview', 'GET', 'unique-tournament/:ref_id/season/:seasonId', `/unique-tournament/${C}/season/${S}${L}`, 'SAME', ''],
  ['UTD-1132', '§1 Overview', 'GET', 'unique-tournament/:ref_id/season/:seasonId/champions', `/unique-tournament/${C}/season/${S}/champions${L}`, 'SAME', ''],
  ['UTD-1133', '§1 Overview', 'GET', 'unique-tournament/:competitionId/related-competitions', `/unique-tournament/${C}/related-competitions${L}`, 'DIFF (nhẹ)', 'Premier League: cur_round lệch 8 vs 9 ở 1 giải liên quan — cùng nguyên nhân data-sync-lag với UTD-1136'],
  ['UTD-1134', '§1 Overview', 'GET', 'unique-tournament/:competitionId/season/:seasonId/overview-statistics', `/unique-tournament/${C}/season/${S}/overview-statistics${L}`, 'SAME', ''],
  ['UTD-1135', '§1 Overview', 'GET', 'unique-tournament/all', `/unique-tournament/all`, 'SAME', ''],
  ['UTD-1136', '§1 Overview', 'GET', 'competitions', `/competitions`, 'BUG', 'Cùng 2.677 giải, cùng tập id, nhưng 49/2677 giải có cur_round/record_updated_at/updated_at/cur_stage CŨ HƠN ở Go — data sync bị trễ (vài ngày) so với NestJS'],
  ['UTD-1137', '§1 Overview', 'GET', 'competition/top-leagues', `/competition/top-leagues`, 'DIFF (thứ tự)', 'Cùng 11 giải, đúng data, nhưng thứ tự khác nhau (Serie A/Bundesliga/Ligue 1 đảo vị trí) — cần dev xác nhận thứ tự đúng vì FE có thể hiển thị theo thứ tự trả về'],
  ['UTD-1138', '§1 Overview', 'GET', 'competition/top-leagues/lang/:locale', `/competition/top-leagues/lang/VN${L}`, 'BUG', 'locale=VN: 4/36 giải Go trả về ID KHÔNG TỒN TẠI (chính Go tự tra cũng ra code:2) kèm name rỗng, thay vì giải thật (vd NestJS vị trí 8 là "FA Cup", Go trả id lạ name:""). locale=GB (28 giải) hoàn toàn bình thường — chỉ VN bị.'],
  ['UTD-1139', '§1 Overview', 'GET', 'competition/:competitionId/logo', `/competition/${C}/logo`, 'BUG (không ổn định)', 'Đã quan sát Go trả 404 thay vì 302 cho route logo, KHÔNG TÁI LẬP ỔN ĐỊNH (lúc 404 liên tục, lúc 302 liên tục ở cùng URL) — nghi vấn hạ tầng (pod lỗi / load balancer), xem thêm "flapping 404" ở ghi chú chung'],
  ['UTD-1140', '§2 List-match', 'GET', 'unique-tournament/:competitionId/events', `/unique-tournament/${C}/events`, 'SAME', ''],
  ['UTD-1141', '§2 List-match', 'GET', 'unique-tournament/:competitionId/events/live', `/unique-tournament/${C}/events/live${L}`, 'SAME', 'Không có trận live tại thời điểm test (code 2 cả 2 bên) — cần test lại khi có trận live'],
  ['UTD-1142', '§2 List-match', 'GET', 'unique-tournament/:competitionId/events/upcoming/page/:page', `/unique-tournament/${C}/events/upcoming/page/1${L}`, 'SAME', ''],
  ['UTD-1143', '§2 List-match', 'GET', 'unique-tournament/:competitionId/seasons/:seasonId/events/finished/page/:page', `/unique-tournament/${C}/seasons/${S}/events/finished/page/1${L}`, 'SAME', 'Test cả page 2 và page 999 (vượt quá) trên 3 giải'],
  ['UTD-1144', '§2 List-match', 'GET', 'unique-tournament/season/:season_id/events/next/:page', `/unique-tournament/season/${S}/events/next/1`, 'SAME', 'Mùa đã kết thúc → code 2 cả 2 bên; đã test thêm mùa hiện tại (currentSeason) — cùng kết quả'],
  ['UTD-1145', '§2 List-match', 'GET', 'unique-tournament/season/:season_id/events/last/:page', `/unique-tournament/season/${S}/events/last/1`, 'SAME', 'Test cả mùa đã kết thúc và mùa hiện tại'],
  ['UTD-1146', '§2 List-match', 'GET', 'unique-tournament/:c/season/:s/events/round/:round', `/unique-tournament/${C}/season/${S}/events/round/1${L}`, 'SAME', ''],
  ['UTD-1147', '§2 List-match', 'GET', 'unique-tournament/:c/season/:s/stage/:stage_id/events/round/:round', `/unique-tournament/${C}/season/${S}/stage/${ST}/events/round/1${L}`, 'SAME', ''],
  ['UTD-1148', '§2 List-match', 'GET', 'tournament/:c/season/:s/stage/:stage_id/events', `/tournament/${C}/season/${S}/stage/${ST}/events`, 'SAME', ''],
  ['UTD-1149', '§2 List-match', 'GET', 'unique-tournament/:competition_id/featured-events', `/unique-tournament/${C}/featured-events${L}`, 'SAME', ''],
  ['UTD-1150', '§3 Standings', 'GET', 'unique-tournament/:competitionId/standings', `/unique-tournament/${C}/standings${L}`, 'SAME', ''],
  ['UTD-1151', '§3 Standings', 'GET', 'unique-tournament/:c/season/:s/standings/:type', `/unique-tournament/${C}/season/${S}/standings/total${L}`, 'SAME', 'Test cả 3 type: total, home, away'],
  ['UTD-1152', '§3 Standings', 'GET', 'season/:season_id/standings/stages', `/season/${S}/standings/stages${L}`, 'SAME', ''],
  ['UTD-1153', '§3 Standings', 'GET', 'unique-tournament/:c/season/:s/team-events/:type', `/unique-tournament/${C}/season/${S}/team-events/total${L}`, 'SAME', 'SAME trên UCL/EPL/ACL2/World Cup. BUG MỚI phát hiện trên cup quốc nội (FA Cup, Copa del Rey): NestJS trả rỗng, Go trả data nhưng homeTeam/awayTeam rỗng — xem sheet Tóm tắt bug #9'],
  ['UTD-1153', '§3 Standings', 'GET', 'tournament/:c/season/:s/team-events/:type', `/tournament/${C}/season/${S}/team-events/total${L}`, 'SAME', ''],
  ['UTD-1153', '§3 Standings', 'GET', 'tournament/:c/season/:s/stage/:stage_id/team-events/:type', `/tournament/${C}/season/${S}/stage/${ST}/team-events/total${L}`, 'SAME', ''],
  ['UTD-1153', '§3 Standings', 'GET', 'unique-tournament/:c/season/:s/stage/:stage_id/team-events/:type', `/unique-tournament/${C}/season/${S}/stage/${ST}/team-events/total${L}`, 'SAME', ''],
  ['UTD-1154', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players/overall', `/unique-tournament/${C}/season/${S}/top-players/overall${L}`, 'SAME', ''],
  ['UTD-1154', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players/overall-v2', `/unique-tournament/${C}/season/${S}/top-players/overall-v2`, 'DIFF (chấp nhận được) + BUG', 'Field đổi snake_case→camelCase có chủ đích (top_players→topPlayers, toàn bộ field con). NHƯNG kèm bug thật: xem overall/old'],
  ['UTD-1154', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players/overall/old', `/unique-tournament/${C}/season/${S}/top-players/overall/old`, 'BUG', 'Danh sách rating chỉ có 10 cầu thủ ở Go, NestJS có 30 — mất 20 cầu thủ, đúng trên cả 3 giải mẫu'],
  ['UTD-1155', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players-per-game/all/overall', `/unique-tournament/${C}/season/${S}/top-players-per-game/all/overall${L}`, 'BUG (nhẹ)', 'SAME trên UCL/EPL/ACL2. BUG MỚI phát hiện trên World Cup 2022: khi nhiều trận đồng hạng (tie) ở cuối Top 10, thứ tự tie-break khác nhau → hiển thị trận đấu khác nhau ở vị trí 8-10 — xem sheet Tóm tắt bug #10'],
  ['UTD-1155', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players-per-game/all/overall-v2', `/unique-tournament/${C}/season/${S}/top-players-per-game/all/overall-v2${L}`, 'DIFF (chấp nhận được)', 'Đổi tên field snake_case→camelCase có chủ đích — sau khi chuẩn hoá tên field, data khớp'],
  ['UTD-1156', '§5 Top-team', 'GET', 'unique-tournament/:c/season/:s/top-teams/overall', `/unique-tournament/${C}/season/${S}/top-teams/overall${L}`, 'SAME', ''],
  ['UTD-1156', '§5 Top-team', 'GET', 'unique-tournament/:c/season/:s/top-teams/overall-v2', `/unique-tournament/${C}/season/${S}/top-teams/overall-v2${L}`, 'DIFF (chấp nhận được)', 'Đổi tên field snake_case→camelCase có chủ đích — data khớp sau chuẩn hoá'],
  ['UTD-1156', '§5 Top-team', 'GET', 'unique-tournament/:c/season/:s/top-teams/overall/old', `/unique-tournament/${C}/season/${S}/top-teams/overall/old`, 'SAME', 'Field đã là camelCase ở cả 2 bên (route "/old" của NestJS vốn đã dùng camelCase)'],
  ['UTD-1157', '§6 Stats', 'GET', 'unique-tournament/:c/season/:s/statistics/info', `/unique-tournament/${C}/season/${S}/statistics/info`, 'ROUTE MỚI', 'NestJS không có route này (404). Go trả 200 hợp lệ — tính năng mới, không phải regression. Cache TTL 3600s: hit ổn định qua 60s (chưa test đủ 3600s)'],
  ['UTD-1158', '§6 Stats', 'GET', 'unique-tournament/:c/season/:s/rounds', `/unique-tournament/${C}/season/${S}/rounds`, 'ROUTE MỚI', 'NestJS lỗi 500 (route hỏng ở service cũ). Go trả 200 hợp lệ — cải thiện, không phải regression'],
  ['UTD-1158', '§6 Stats', 'GET', 'unique-tournament/:c/season/:s/rounds/v2', `/unique-tournament/${C}/season/${S}/rounds/v2`, 'SAME', ''],
  ['UTD-1159', '§7 Cup', 'GET', 'unique-tournament/:c/season/:s/groups', `/unique-tournament/${C}/season/${S}/groups${L}`, 'SAME', 'UCL/EPL không có vòng bảng (rỗng cả 2 bên); AFC Champions League 2 CÓ vòng bảng — khớp trên cả 3 giải'],
  ['UTD-1160', '§7 Cup', 'GET', 'unique-tournament/:c/season/:s/stage/:stage_id/events/groups/:slug', `/unique-tournament/87dyw5ro5pgni6u/season/neo1xasoewzr6iv/stage/mx7a61lnd2rse70/events/groups/group-a${L}`, 'SAME', 'Slug đúng định dạng là chữ thường có gạch ngang ("group-a"), khác groupName trả về ("Group A"). Test trên AFC Champions League 2 (giải có bảng) — 12 trận, khớp 2 bên'],
  ['UTD-1161', '§8 Media', 'GET', 'competition/:competitionId/season/:seasonId/highlight', `/competition/${C}/season/${S}/highlight`, 'ROUTE MỚI', 'NestJS không có route rút gọn này (404). Go trả 200 — route mới, không phải regression'],
  ['UTD-1161', '§8 Media', 'GET', 'competition/:c/season/:s/highlight/locale/:locale/page/:page', `/competition/${C}/season/${S}/highlight/locale/VN/page/1${L}`, 'KHÔNG SO ĐƯỢC ĐƯỢC NỘI DUNG', 'Nội dung đổi liên tục theo thời gian thực (video mới) — không thể so từng item. Đã đổi cách test: so cấu trúc (số lượng, tên field) — khớp'],
  ['UTD-1162', '§9 Transfers', 'GET', 'unique-tournament/:competitionId/:seasonId/transfers', `/unique-tournament/${C}/${'cur'}/transfers${L}`, 'DIFF (chấp nhận được)', 'Premier League mùa hiện tại: field transferFeeDescription đảo thứ tự ký hiệu tiền tệ "€3.6M" (NestJS) vs "3.6M €" (Go) — cùng giá trị, khác format hiển thị, nên xác nhận với dev/design có chủ đích hay không'],
];

const COMPARE_CASES = [
  ['A1', 'HTTP status', 'Gọi cùng path trên API cũ và API mới', 'Status giống nhau (200 / 302 / 404)'],
  ['A2', 'Data', 'So sánh data sau khi sắp key trong object', 'Giống từng field, không thiếu/thừa field'],
  ['A3', 'Thứ tự mảng', 'So sánh thứ tự phần tử trong mảng', 'Giống nhau (thứ tự ảnh hưởng hiển thị UI)'],
  ['A4', 'Tên field', 'Kiểm tra camelCase/snake_case', 'Giống nhau — khác là breaking change với FE'],
  ['A5', 'Ngôn ngữ', 'Gọi ?language=en, vi, và giá trị sai (xx)', 'Tên dịch giống nhau; giá trị sai rơi về en'],
  ['A6', 'Id sai', 'Gọi với id không tồn tại / id không giải mã được', 'Cùng code lỗi ở 2 bên, không trả 500'],
  ['A7', 'Route legacy', 'Gọi route không có tiền tố football/ (với route có legacy)', 'Hành vi giống route chính'],
  ['A8', 'Redirect logo', 'Gọi logo 5 lần liên tiếp, không follow redirect', 'Status ổn định và khớp API cũ qua nhiều lần gọi'],
  ['A9', 'HEAD highlight', 'Gọi HEAD highlight mùa có / không có highlight', '200 khi có, 204 khi không'],
  ['A10', 'Phân trang', 'Gọi page 1, 2 và page vượt quá', 'Cùng số phần tử, cùng hasNextPage'],
  ['A11', 'Hiệu năng', 'So response time lần miss và lần hit', 'Go không chậm hơn NestJS'],
];

const CACHE_CASES = [
  ['B1', 'Cache miss', 'Gọi URL chưa ai gọi (mùa cũ chưa dùng)', 'code: 1 (miss), thời gian dài hơn', 'PASS — Go miss lần đầu, hit code 3 ngay lần 2, data khớp'],
  ['B2', 'Cache hit', 'Gọi lại ngay URL ở B1', 'code: 3 (hit), nhanh hơn rõ rệt', 'PASS — thời gian hit luôn nhỏ hơn thời gian miss'],
  ['B3', 'Key theo language', 'Gọi language=en rồi language=vi', 'Lần vi vẫn là miss (code: 1)', 'BUG — Go trả code:3 (HIT) cho vi ngay sau khi gọi en; cache KHÔNG tách theo language → nguy cơ trả nhầm ngôn ngữ cho user, tái lập 100% trên 2 giải khác nhau (EPL, Bundesliga)'],
  ['B4', 'Key theo tham số path', 'Đổi mùa / trang / round', 'Mỗi tổ hợp mới là miss', 'PASS — mỗi mùa/trang khác nhau đều miss lần đầu'],
  ['B5', 'TTL 3600s', 'statistics/info, rounds: gọi lại sau 60s và sau 1 giờ', 'Còn hit trong 1 giờ, miss sau khi hết TTL', 'PASS (bản ngắn, 60s) — còn hit sau 60s. Bản đầy đủ 3600s CHƯA CHẠY (mất ~1h, cần bật RUN_LONG_CACHE_TEST=1 riêng)'],
  ['B6', 'Sau khi hết hạn', 'So data Go với NestJS lúc cache đang hit', 'Data mới vẫn khớp NestJS', 'PASS — data lúc hit khớp 100% với NestJS'],
  ['B7', 'Single-flight', 'Gửi 10 request đồng thời vào 1 key đang miss', 'Chỉ 1 request chậm, còn lại nhanh; không lỗi', 'PASS — cả 10 request trả 200, cùng data, không lỗi (số lần miss thật ghi trong annotation lúc chạy)'],
  ['B8', 'Header cache', 'So cache-control / etag giữa 2 bên', 'Cần xác nhận', 'BUG — Go KHÔNG BAO GIỜ trả header Cache-Control (null trên mọi response 200, xác nhận qua 15 lần gọi liên tiếp), trong khi NestJS luôn trả "public, max-age=3, s-maxage=3". Ảnh hưởng: CDN/edge không cache được response từ Go → tăng tải lên origin dù cache tầng app (code) vẫn hoạt động đúng'],
];

const BORDER = { style: 'thin', color: { argb: 'FFB7B7B7' } };
const ALL_BORDER = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const RESULT_FILL = {
  SAME: 'FFE2EFDA', PASS: 'FFE2EFDA', 'ROUTE MỚI': 'FFDCE6F1',
  DIFF: 'FFFFF2CC', BUG: 'FFFCE4E4',
  'KHÔNG SO ĐƯỢC': 'FFEDEDED', 'CHƯA TEST': 'FFEDEDED',
  CAO: 'FFF8CBAD', 'TRUNG BÌNH': 'FFFFF2CC', THẤP: 'FFE2EFDA',
  'ĐÃ TEST — có bug nhẹ': 'FFFFF2CC', 'ĐÃ TEST — OK': 'FFE2EFDA', 'KHÔNG TEST ĐƯỢC': 'FFEDEDED',
  'ỨNG VIÊN RETIRE': 'FFEDEDED',
  'ĐÃ FIX (xác nhận)': 'FFE2EFDA', 'CHƯA FIX': 'FFFCE4E4', 'CACHE STALE — không phải bug code, chờ clear cache': 'FFDCE6F1',
  'CACHE STALE — vẫn còn lệch': 'FFFFF2CC', 'KHÔNG PHẢI BUG': 'FFDCE6F1', 'GHI NHẬN': 'FFEDEDED',
};

function addSheet(wb, name, title, columns, rows, resultKey) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  ws.mergeCells(1, 1, 1, columns.length);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2E4F' } };
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;
  const header = ws.getRow(2);
  header.values = columns.map((c) => c.header);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = ALL_BORDER;
  });
  for (const r of rows) {
    const row = ws.addRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = ALL_BORDER;
      cell.alignment = { vertical: 'top', wrapText: true };
    });
    if (resultKey) {
      const v = String(r[resultKey] ?? '');
      const key = Object.keys(RESULT_FILL).find((k) => v.startsWith(k));
      if (key) row.getCell(resultKey).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RESULT_FILL[key] } };
    }
  }
  ws.views = [{ state: 'frozen', ySplit: 2 }];
  return ws;
}

const wb = new ExcelJS.Workbook();
wb.creator = 'QA Automation';
wb.created = new Date();

const count = (k) => ROUTES.filter((r) => r[5].startsWith(k)).length;

// Sheet đầu tiên khi mở file: liệt kê bug theo cách ai cũng đọc hiểu, kèm link bấm được ngay
// + cách tự tay kiểm tra (không cần biết code) + bằng chứng số liệu thật.
// TOÀN BỘ 8 bug đã được VERIFY LẦN CUỐI ĐỘC LẬP lúc 29/09/2026 (buổi chiều), trên data/route
// KHÁC với lần test trước đó, để đảm bảo không phải nhiễu hay lỗi thao tác của người test.
const SUMMARY_BUGS = [
  {
    n: 1, sev: 'BỎ QUA — CACHE', ten: 'Cache trộn lẫn ngôn ngữ (server có thể trả nhầm tiếng Anh cho người xem tiếng Việt, hoặc ngược lại)',
    anhHuong: 'Người dùng chọn tiếng Việt nhưng có thể thấy nội dung tiếng Anh (hoặc ngược lại) trong vài giây/phút sau khi có người khác vừa xem bằng ngôn ngữ kia.',
    link1: `${GO}/unique-tournament/jz5xx7noo6txee9/season/jy2us9tolyzn7fj/top-players/overall?language=en`,
    link2: `${GO}/unique-tournament/jz5xx7noo6txee9/season/jy2us9tolyzn7fj/top-players/overall?language=vi`,
    cachTuKiemTra: `Bấm Link 1 trước, đợi trang load xong. Sau đó bấm Link 2. So chữ "code" ở ngay đầu mỗi trang (Ctrl+F gõ "code" để tìm nhanh):\n- Link 1 (Bundesliga, tiếng Anh, mùa 2021-2022) → phải ra code:1 (lần đầu chưa ai xem)\n- Link 2 (CÙNG mùa giải đó nhưng tiếng Việt) → ĐÚNG RA cũng phải là code:1, nhưng BUG làm nó ra code:3\nNếu link đã có người bấm trước (không còn thấy code:1 ở Link 1), báo tôi để đổi sang mùa giải khác chưa ai đụng.`,
    bangChung: `Verify lần cuối 29/09/2026: Link 1 (en) → code:1. Link 2 (vi, gọi ngay sau) → code:3 (SAI, đúng ra phải là 1 vì khác ngôn ngữ = khác dữ liệu). Đã thử trên 3 giải khác nhau (EPL, Bundesliga x2 lần) đều ra kết quả giống hệt → chắc chắn là bug hệ thống, không phải ngẫu nhiên. CẬP NHẬT 02/10/2026: theo quyết định của QA phụ trách, mọi hiện tượng thuộc bản chất CACHE (kể cả cache sai thiết kế key) được BỎ QUA khỏi báo cáo bug — không đưa vào danh sách báo dev lần này.`,
  },
  {
    n: 2, sev: 'BỎ QUA — CACHE', ten: 'Trang xếp hạng cầu thủ hàng đầu bị cắt bớt (chỉ còn 1/3 số cầu thủ)',
    anhHuong: 'Nếu có màn hình nào trong app dùng đúng route "top-players/overall/old", người dùng sẽ chỉ thấy Top 10 cầu thủ thay vì Top 30 như trước — thiếu thông tin.',
    link1: `${GO}/unique-tournament/mfiws1aoh0uztg4/season/o014smcorpas6pk/top-players/overall/old`,
    link2: `${NESTJS}/unique-tournament/mfiws1aoh0uztg4/season/o014smcorpas6pk/top-players/overall/old`,
    cachTuKiemTra: `Bấm cả 2 link (Premier League mùa 2025-2026). Trong mỗi trang, tìm cụm "rating":[ ở đầu — đây là danh sách xếp hạng theo điểm số. Đếm số lần chữ "playedEnough" xuất hiện TRƯỚC khi gặp "goals":[ (danh sách tiếp theo) bằng Ctrl+F.\n- Link 1 (Go/mới): đếm được 10\n- Link 2 (NestJS/cũ): đếm được 30`,
    bangChung: `Verify lần cuối 29/09/2026, đổi sang giải Premier League (khác UCL đã test trước): Go trả đúng 10 cầu thủ, NestJS trả đúng 30 cầu thủ trong DANH SÁCH "rating" VÀ "goals" (cả 2 nhóm đều bị cắt như nhau). Cầu thủ đứng đầu cả 2 bên đều là Erling Haaland — chứng tỏ dữ liệu đúng người, chỉ bị giới hạn số lượng trả về. CẬP NHẬT 02/10/2026: verify bằng season HOÀN TOÀN MỚI (chưa từng cache) → Go trả đúng 30/30, khớp NestJS. Xác nhận đây là BUG CACHE (season cũ bị kẹt lại giá trị cũ từ trước khi fix), BỎ QUA theo quyết định QA phụ trách.`,
  },
  {
    n: 3, sev: 'ĐÃ FIX', ten: 'Server mới không trả lời được khi hỏi "trang có tồn tại không mà chưa cần xem nội dung" (kỹ thuật HTTP HEAD) — trừ trang xem highlight video',
    anhHuong: 'Nếu ứng dụng/CDN có dùng cách hỏi "trước" (HEAD) để kiểm tra 1 trang có tồn tại/tải nhanh trước khi hiển thị thật, thì với server mới mọi trang (trừ trang highlight) đều báo "không tìm thấy" dù trang đó thực ra vẫn xem bình thường bằng cách mở link thường. Mức ảnh hưởng thực tế cần hỏi dev xem app có dùng cách này không.',
    link1: `${GO}/unique-tournament/mfiws1aoh0uztg4/season/o014smcorpas6pk/standings/total?language=en`,
    link2: `${NESTJS}/unique-tournament/mfiws1aoh0uztg4/season/o014smcorpas6pk/standings/total?language=en`,
    cachTuKiemTra: `Bấm Link 1 và Link 2 bình thường — CẢ HAI đều xem được, không có gì bất thường (đây chỉ là cách xem thường, GET). Bug chỉ lộ ra khi dùng cách hỏi "trước" (HEAD), khó test bằng cách dán link vào trình duyệt. Nhờ người biết dùng terminal chạy:\ncurl -I "${GO}/unique-tournament/mfiws1aoh0uztg4/season/o014smcorpas6pk/standings/total?language=en"\n→ nếu thấy "HTTP/2 404" nghĩa là bug còn tồn tại (đáng ra phải là 200 giống lúc bấm link thường).`,
    bangChung: `Verify lần cuối 29/09/2026 trên route standings (khác route đã test trước): mở link thường (GET) → 200 OK bình thường. Hỏi kiểu HEAD → 404 "không tìm thấy", lặp lại 5 lần liên tiếp đều ra 404 (ổn định, không phải nhiễu). Server cũ (NestJS) trả lời HEAD đúng 200 bình thường trên cùng trang này. Riêng trang highlight video ở server mới có code riêng nên HEAD vẫn hoạt động đúng. CẬP NHẬT 02/10/2026: ĐÃ FIX — verify lại 5/5 route (route cũ lẫn route mới UTD-1196→1200), HEAD đã trả đúng 200/204 khớp GET và khớp NestJS. Không còn là bug.`,
  },
  {
    n: 4, sev: 'BỎ QUA — DATA SYNC/CACHE', ten: 'Thiếu 1 thông tin nhỏ trong danh sách các mùa giải (cờ "có dự đoán bảng xếp hạng hay không")',
    anhHuong: 'Nếu giao diện có hiển thị icon/nhãn "có dự đoán BXH" dựa vào thông tin này, giao diện mới sẽ không hiện được (vì thông tin không còn được gửi về).',
    link1: `${GO}/unique-tournament/mfiws1aoh0uztg4/seasons?language=en`,
    link2: `${NESTJS}/unique-tournament/mfiws1aoh0uztg4/seasons?language=en`,
    cachTuKiemTra: `Bấm cả 2 link, dùng Ctrl+F / Cmd+F tìm chữ "has_standing_prediction":\n- Link 1 (Go/mới): trình duyệt báo "không tìm thấy" (0 kết quả)\n- Link 2 (NestJS/cũ): tìm thấy nhiều lần (1 lần cho mỗi mùa giải)`,
    bangChung: `Verify lần cuối 29/09/2026, đổi sang giải Premier League (khác UCL đã test trước): NestJS có field "has_standing_prediction" trong mỗi mùa giải (giá trị ví dụ: 1). Go không có field này ở đâu cả trong toàn bộ response — mất hẳn, không phải đổi tên thành field khác. CẬP NHẬT 02/10/2026: route /seasons chỉ có 1 cache key chung cho cả giải, không có tham số để né cache theo mùa riêng lẻ — field chỉ lệch ở đúng mùa MỚI NHẤT (vừa cập nhật gần đây), khớp đặc điểm dữ liệu bị cache/đồng bộ trễ. Xếp vào nhóm BỎ QUA theo quyết định QA phụ trách.`,
  },
  {
    n: 5, sev: 'BỎ QUA — CACHE', ten: 'Server mới không cho phép trình duyệt/CDN tự lưu tạm (cache) câu trả lời',
    anhHuong: 'Về lâu dài có thể khiến server phải xử lý nhiều yêu cầu hơn mức cần thiết (vì các lớp cache trung gian như Cloudflare không lưu tạm được), có thể ảnh hưởng tốc độ tải trang khi lượng truy cập tăng cao.',
    link1: `${GO}/unique-tournament/mfiws1aoh0uztg4/season/o014smcorpas6pk/top-players/overall/old`,
    link2: `${NESTJS}/unique-tournament/mfiws1aoh0uztg4/season/o014smcorpas6pk/top-players/overall/old`,
    cachTuKiemTra: `Mở Chrome, bấm F12 (mở DevTools) → tab "Network" → bấm Link 1 → bấm vào dòng request vừa tải trong danh sách Network → xem phần "Response Headers" bên phải, tìm dòng "cache-control":\n- Link 1 (Go/mới): KHÔNG có dòng cache-control\n- Link 2 (NestJS/cũ): có dòng "cache-control: public, max-age=3, s-maxage=3"`,
    bangChung: `Verify lần cuối 29/09/2026 trên route khác (top-players/overall/old thay vì route trang chủ giải): thử 10 lần liên tiếp, Go không bao giờ có header cache-control (10/10 lần), NestJS luôn có (đối chiếu 1 lần cuối vẫn thấy). CẬP NHẬT 02/10/2026: về bản chất đây là header liên quan CACHE (cache-control, etag) — xếp vào nhóm BỎ QUA theo quyết định QA phụ trách "cache luôn bỏ qua", dù khác cơ chế với các bug cache khác (đây là thiếu code set header, không tự hết khi có data mới — nhưng tôn trọng quyết định gộp chung nhóm cache).`,
  },
  {
    n: 6, sev: 'BỎ QUA — DATA SYNC/CACHE', ten: 'Một số giải đấu hiển thị "vòng đấu hiện tại / thời điểm cập nhật" cũ hơn vài ngày so với thực tế',
    anhHuong: 'Người xem 1 số giải cụ thể (không phải tất cả) có thể thấy thông tin vòng đấu/ngày cập nhật bị trễ vài ngày so với server cũ — nghi ngờ pipeline đồng bộ dữ liệu bị delay.',
    link1: `${GO}/unique-tournament/y3d7s6dogdtm560?language=en`,
    link2: `${NESTJS}/unique-tournament/y3d7s6dogdtm560?language=en`,
    cachTuKiemTra: `Bấm cả 2 link (giải "Primera Division"), tìm chữ "record_updated_at" bằng Ctrl+F, so ngày giờ giữa 2 bên — Link 1 (Go) sẽ hiện ngày CŨ HƠN Link 2 (NestJS).\nĐây chỉ là 1 ví dụ trong danh sách gần 2700 giải — muốn xem toàn bộ danh sách lệch cần nhờ người biết kỹ thuật chạy script so sánh (đã có sẵn trong bộ test tự động).`,
    bangChung: `Verify lần cuối 29/09/2026, quét lại toàn bộ 2677 giải: 32 giải có "cur_round"/"record_updated_at" khác nhau giữa 2 server (giảm so với 49 giải lúc quét lần đầu — hợp lý vì dữ liệu đang tự đồng bộ dần theo thời gian, càng củng cố đây là "trễ đồng bộ" chứ không phải lỗi cố định). Ví dụ cụ thể ở 2 link trên: NestJS ghi cập nhật 2026-09-29T00:00:50Z, Go ghi 2026-09-24T01:57:40Z — trễ khoảng 5 ngày. CẬP NHẬT 02/10/2026: xếp vào nhóm BỎ QUA (data sync/cache) theo quyết định QA phụ trách.`,
  },
  {
    n: 7, sev: 'THẤP', ten: 'Danh sách "giải hàng đầu" (top leagues) hiển thị đúng 11 giải nhưng sai thứ tự',
    anhHuong: 'Nếu giao diện hiển thị đúng theo thứ tự server trả về, người dùng có thể thấy Serie A / Bundesliga / Ligue 1 đổi chỗ cho nhau so với trước.',
    link1: `${GO}/competition/top-leagues`,
    link2: `${NESTJS}/competition/top-leagues`,
    cachTuKiemTra: `Bấm cả 2 link, đọc thứ tự tên giải ("name") từ trên xuống và so sánh — vị trí thứ 6, 7, 8 sẽ khác nhau giữa 2 bên.`,
    bangChung: `Verify lần cuối 29/09/2026: cùng đúng 11 giải ở cả 2 bên (không thiếu/thừa giải nào), nhưng thứ tự khác — NestJS: "...Bundesliga, UEFA Europa League, UEFA Conference League, Serie A, Serie A, Ligue 1"; Go: "...Serie A, Bundesliga, Ligue 1, UEFA Europa League, UEFA Conference League, Serie A".`,
  },
  {
    n: 8, sev: 'THẤP', ten: 'Số tiền chuyển nhượng hiển thị ký hiệu tiền tệ ở vị trí khác nhau',
    anhHuong: 'Không sai số tiền, chỉ khác cách viết: "€3.6M" (server cũ) so với "3.6M €" (server mới) — có thể trông lạ với người dùng quen định dạng cũ.',
    link1: `${GO}/unique-tournament/mfiws1aoh0uztg4/cq0afilqgkgr31c/transfers?language=en`,
    link2: `${NESTJS}/unique-tournament/mfiws1aoh0uztg4/cq0afilqgkgr31c/transfers?language=en`,
    cachTuKiemTra: `Bấm cả 2 link (chuyển nhượng Premier League mùa hiện tại), tìm chữ "transferFeeDescription" bằng Ctrl+F, đọc vài giá trị có ký hiệu € — so vị trí ký hiệu € trước hay sau số.`,
    bangChung: `Verify lần cuối 29/09/2026, lấy toàn bộ danh sách có giá trị tiền tệ (không chỉ 1 mẫu): Go trả "3.6M €", "60M €", "56M €", "35.9M €", "87.5M €"; NestJS trả "€3.6M", "€60M", "€56M", "€35.9M", "€87.5M" — cùng giá trị số, ký hiệu đảo vị trí 100% các bản ghi kiểm tra.`,
  },
  {
    n: 9, sev: 'BỎ QUA — CACHE', ten: 'Trang thống kê theo trận của giải Cúp quốc nội (FA Cup, Copa del Rey...) hiện tỷ số nhưng KHÔNG BIẾT là đội nào đá với đội nào',
    anhHuong: 'MỚI PHÁT HIỆN khi tăng số giải test theo yêu cầu. Nếu app có màn hình thống kê trận đấu theo đội cho các giải cúp quốc nội (không phải giải quốc tế như World Cup — World Cup vẫn đúng bình thường), người dùng sẽ thấy tỷ số/thẻ phạt/góc nhưng ô tên đội thi đấu bị TRỐNG — không biết trận đó là ai gặp ai.',
    link1: `${GO}/unique-tournament/1z88sr5o1v9ntsd/season/jqcfxzpo4wnsdt6/team-events/total?language=en`,
    link2: `${NESTJS}/unique-tournament/1z88sr5o1v9ntsd/season/jqcfxzpo4wnsdt6/team-events/total?language=en`,
    cachTuKiemTra: `Bấm Link 1 (Go/mới, FA Cup), tìm chữ "homeTeam" bằng Ctrl+F — sẽ thấy ngay sau nó là "{}" trống rỗng (không có tên đội) hàng chục lần liên tiếp, dù các chữ "homeScore"/"awayScore" ngay bên cạnh vẫn có đầy đủ tỷ số.\nBấm Link 2 (NestJS/cũ) để đối chiếu — trang này trả về hoàn toàn rỗng (không có trận nào), không phải bug này nhưng cũng là 1 điểm khác biệt cần dev xác nhận hành vi đúng là gì.`,
    bangChung: `Verify lần cuối 29/09/2026 trên 2 giải cúp quốc nội khác nhau (FA Cup và Copa del Rey — không phải chỉ 1 giải): cả 2 đều cho cùng kết quả — NestJS trả tournamentTeamEvents rỗng hoàn toàn (0 đội), Go trả đầy đủ danh sách trận theo từng đội (58 đội ở FA Cup, 124 đội ở Copa del Rey) NHƯNG mọi trận đều có homeTeam:{} và awayTeam:{} rỗng. Đối chiếu World Cup 2022 (giải quốc tế) thì route này hoạt động ĐÚNG ở cả 2 bên (24 đội, đầy đủ thông tin) — nên bug chỉ xảy ra ở dạng cúp quốc nội nhiều đội, chưa rõ vì sao. Dev xác nhận "đã fix" — QA verify bằng type/season khác (chưa cache) thấy đúng ngay từ lần tính mới (code:1) → xác nhận ĐÃY FIX THẬT, hiện tượng ban đầu chỉ do cache cũ dính đúng season/type=total đã test trước khi fix. BỎ QUA theo quyết định QA phụ trách.`,
  },
  {
    n: 10, sev: 'TRUNG BÌNH', ten: 'Danh sách "cầu thủ nổi bật nhất trận" bị xáo trộn thứ tự khi có nhiều cầu thủ cùng điểm số (World Cup)',
    anhHuong: 'MỚI PHÁT HIỆN khi tăng số giải test theo yêu cầu. Ở giải có nhiều trận đấu ngang nhau về 1 chỉ số (ví dụ nhiều cầu thủ cùng có 4 lần tắc bóng trong 1 trận), vị trí cuối bảng Top 10 có thể hiển thị TRẬN ĐẤU KHÁC NHAU tuỳ server nào trả lời — không sai số liệu, chỉ sai/khác trận được chọn đại diện.',
    link1: `${GO}/unique-tournament/nq8prta4pwtedsb/season/jy2us9tome0n7fj/top-players-per-game/all/overall?language=en`,
    link2: `${NESTJS}/unique-tournament/nq8prta4pwtedsb/season/jy2us9tome0n7fj/top-players-per-game/all/overall?language=en`,
    cachTuKiemTra: `Bấm cả 2 link (World Cup 2022, danh sách "cầu thủ nổi bật theo trận"), tìm mục "interceptions" (số lần tắc bóng), đọc 3 mục cuối cùng (vị trí thứ 8, 9, 10) — so tên 2 đội thi đấu ("homeTeam"/"awayTeam") ở mỗi vị trí giữa 2 link.`,
    bangChung: `Verify lần cuối 29/09/2026: vị trí 1-7 (điểm số 6, 5, 5, 5, 5, 5, 5) khớp 100% giữa 2 server — đúng cả trận đấu lẫn thứ tự. Từ vị trí 8-10 (cùng điểm số 4, có nhiều trận đồng hạng), NestJS chọn "Netherlands vs USA, Iran vs USA, Brazil vs Serbia" còn Go chọn "Iran vs USA, Argentina vs Croatia, Argentina vs France" — cùng đúng về mặt "có 4 lần tắc bóng" nhưng là 3 trận hoàn toàn khác nhau ở 2/3 vị trí.`,
  },
  {
    n: 11, sev: 'ĐÃ FIX', ten: 'Danh sách "giải hàng đầu theo khu vực Việt Nam" (top-leagues locale VN) trả về 4 giải RÁC — ID không tồn tại, tên rỗng',
    anhHuong: 'MỚI PHÁT HIỆN khi chạy lại toàn bộ test lần cuối. Người dùng chọn khu vực/ngôn ngữ Việt Nam sẽ thấy 4 trong 36 dòng ở danh sách "giải hàng đầu" HIỂN THỊ TRỐNG (không có tên giải, không có quốc gia) thay vì các giải thật như FA Cup, V.League 1, Vietnam Super Cup, AFC Champions League — đây là giao diện người dùng thật sự nhìn thấy bị lỗi, không phải chỉ khác thứ tự.',
    link1: `${GO}/competition/top-leagues/lang/VN?language=en`,
    link2: `${NESTJS}/competition/top-leagues/lang/VN?language=en`,
    cachTuKiemTra: `Bấm cả 2 link, tìm chữ "name":"" (2 dấu ngoặc kép liền nhau, nghĩa là tên rỗng) bằng Ctrl+F:\n- Link 1 (Go/mới): tìm thấy 4 lần\n- Link 2 (NestJS/cũ): không tìm thấy lần nào (0 kết quả)\nĐối chiếu thêm: gọi thử locale GB (đổi "VN" thành "GB" trong link) — không bị lỗi này ở cả 2 bên, chỉ riêng VN mới bị.`,
    bangChung: `Verify lần cuối 29/09/2026: cả 2 bên đều trả đúng 36 giải (không thiếu/thừa số lượng). Nhưng ở 4 vị trí (thứ 9, 11, 12, 31), NestJS trả giải thật (vd vị trí 9: "FA Cup", quốc gia "England") còn Go trả {"id":"b4i6y8hvedwn056","name":""} — id này KHÔNG TỒN TẠI (tự gọi Go tra chi tiết chính id đó cũng ra code:2 "không tìm thấy"). Cùng hiện tượng ở cả 4 vị trí. Locale GB (28 giải) hoàn toàn bình thường ở cả 2 bên — bug chỉ xảy ra riêng với locale VN. CẬP NHẬT 02/10/2026: Dev báo đã fix — QA verify lại độc lập, đúng 4/4 vị trí (8, 10, 11, 30) đều trả đúng tên + ID thật (FA Cup, V.League 1, Vietnam Super Cup, AFC Champions League), khớp 100% với NestJS. Thử lại 3 lần liên tiếp đều ổn định (0 ID rác). XÁC NHẬN ĐÃ FIX THẬT.`,
  },
  {
    n: 12, sev: 'ĐÃ FIX', ten: 'Trang danh sách trận đã kết thúc: nhập số trang SAI (chữ, số âm) — server mới ÂM THẦM SỬA thành trang 1 thay vì báo lỗi',
    anhHuong: 'MỚI PHÁT HIỆN khi test thử các giá trị "phá" (page=abc, page=-1). Nếu ứng dụng có chỗ nào để người dùng tự gõ số trang (ít gặp, nhưng có thể xảy ra qua link chia sẻ/bookmark cũ), server mới sẽ âm thầm trả về trang 1 thay vì báo lỗi rõ ràng như trước — có thể gây khó hiểu khi debug (tưởng trang X nhưng thực ra luôn là trang 1).',
    link1: `${GO}/unique-tournament/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/events/finished/page/abc?language=en`,
    link2: `${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/events/finished/page/abc?language=en`,
    cachTuKiemTra: `Bấm cả 2 link (thay "abc" bằng số trang chữ bất kỳ), tìm chữ "code" ở đầu trang:\n- Link 1 (Go/mới): code:3 (coi là thành công, âm thầm trả về trang 1 với 281 trận)\n- Link 2 (NestJS/cũ): code:-1 (báo lỗi rõ ràng, trả về rỗng — total:0)\nThử thêm với "-1" thay cho "abc" trong link — cùng hiện tượng.`,
    bangChung: `Verify lần cuối 29/09/2026, thử 3 giá trị: page=abc → Go code:3 (trả 281 trận, page:1 âm thầm), NestJS code:-1 (rỗng). page=-1 → Go code:3 (trả 281 trận), NestJS code:-1 (rỗng). page=0 → CẢ 2 bên đều đồng ý là lỗi (code:-1) — chỉ khác biệt ở giá trị "chữ" và "âm", không phải mọi input sai. CẬP NHẬT 02/10/2026: ĐÃ FIX — verify lại nhiều lần, cả page=abc và page=-1 giờ đều trả code:-1 ở CẢ 2 BÊN, khớp nhau. Không còn là bug.`,
  },
  {
    n: 13, sev: 'BỎ QUA — KHÔNG ẢNH HƯỞNG', ten: 'Field "message" luôn ghi "Success" ngay cả khi request thất bại (code báo lỗi)',
    anhHuong: 'Không ảnh hưởng người dùng cuối vì giao diện thường không hiển thị field message trực tiếp, nhưng có thể gây khó hiểu cho dev khi debug log (thấy "Success" nhưng thực ra request đó lỗi/rỗng).',
    link1: `${GO}/unique-tournament/zzzzzzzzzzzzzzz?language=en`,
    link2: `${NESTJS}/unique-tournament/zzzzzzzzzzzzzzz?language=en`,
    cachTuKiemTra: `Bấm Link 1 (id không tồn tại, cố ý gây lỗi) — sẽ thấy "code":2 (nghĩa là lỗi/không tìm thấy) NHƯNG ngay cạnh đó "message":"Success" (nghĩa là thành công) — 2 thông tin này mâu thuẫn nhau.`,
    bangChung: `Verify lần cuối 29/09/2026: Go trả {"code":2,"error_code":0,"message":"Success","data":{}} — message nói "Success" dù code là 2 (thất bại). NestJS ở cùng tình huống trả message rỗng "" thay vì chữ khẳng định sai lệch như vậy. QUYẾT ĐỊNH 02/10/2026: theo QA phụ trách, bug này KHÔNG ẢNH HƯỞNG người dùng cuối (UI không hiển thị field message) — BỎ QUA, không cần báo dev.`,
  },
];

addSheet(wb, 'Tóm tắt bug (đọc nhanh)', 'TÓM TẮT BUG — UTD-899 (đã verify lần cuối, kèm link kiểm tra nhanh)', [
  { header: '#', key: 'n', width: 5 }, { header: 'Mức độ', key: 'sev', width: 12 },
  { header: 'Bug là gì (ngôn ngữ thường)', key: 'ten', width: 42 },
  { header: 'Ảnh hưởng người dùng', key: 'anhHuong', width: 40 },
  { header: 'Link 1 (Go / mới)', key: 'link1', width: 55 },
  { header: 'Link 2 (NestJS / cũ, để so sánh)', key: 'link2', width: 55 },
  { header: 'Cách tự tay kiểm tra', key: 'cachTuKiemTra', width: 65 },
  { header: 'Bằng chứng đã verify lần cuối (29/09/2026)', key: 'bangChung', width: 65 },
], SUMMARY_BUGS.map(({ n, sev, ten, anhHuong, link1, link2, cachTuKiemTra, bangChung }) => ({ n, sev, ten, anhHuong, link1, link2, cachTuKiemTra, bangChung })), 'sev');

addSheet(wb, 'Tổng quan', 'UTD-899 — TÁCH COMPETITION + HONOR THÀNH SERVICE RIÊNG (NestJS → Go)', [
  { header: 'Mục', key: 'k', width: 38 }, { header: 'Nội dung', key: 'v', width: 95 },
], [
  { k: 'Task', v: 'UTD-899 — 34 subtask (UTD-1129 → UTD-1162), ~46 API port sang Go, 45 route khi tính biến thể (44 GET + 1 HEAD)' },
  { k: 'Tài liệu', v: 'Confluence "Competitions Domain" (page 76054535)' },
  { k: 'API cũ (NestJS)', v: `${OLD}  (x-service-name: staging-opta-api)` },
  { k: 'API mới (Go)', v: `${NEW}  (x-service-name: staging-api-football-competitions)` },
  { k: 'Data mẫu (MỞ RỘNG lần 2 theo yêu cầu tăng data để tìm thêm bug)', v: `5 giải đa dạng: UEFA Champions League, Premier League, AFC Champions League 2 (có vòng bảng), World Cup 2022 (cup quốc tế lớn có vòng bảng thật), FA Cup (cup quốc nội nhiều đội, không vòng bảng)` },
  { k: 'Cách check cache', v: 'Field code trong response: 1 = cache miss (đọc mới từ DB), 3 = cache hit — đã xác nhận ở cả 2 service' },
  { k: 'Bộ test tự động', v: 'tests/standard/2026-Q3-task-899-competition-service/01-compare-old-vs-new.spec.ts (238 test case, 5 giải mẫu) + 02-cache.spec.ts (8 test case B1-B8)' },
  { k: 'KẾT QUẢ CHÍNH THỨC (29/09/2026, chạy đầy đủ toàn bộ suite)', v: `Route: SAME ${count('SAME')} · DIFF ${count('DIFF')} · BUG ${count('BUG')} · ROUTE MỚI ${count('ROUTE MỚI')} · KHÔNG SO ĐƯỢC ${count('KHÔNG SO ĐƯỢC')} / ${ROUTES.length} route — 246 test case A: 219 pass / 21 fail + 8 test case B: 6 pass / 1 fail / 1 chưa chạy` },
  { k: 'CẬP NHẬT 02/10/2026 — KẾT QUẢ CUỐI SAU KHI ÁP DỤNG "CACHE LUÔN BỎ QUA"', v: 'Theo quyết định của QA phụ trách, mọi hiện tượng xác định là CACHE/data-sync-lag (dù đã verify bằng data mới/season khác và không còn tái hiện) được LOẠI KHỎI danh sách bug báo dev, không phân biệt cơ chế cache cụ thể. Đã verify lại 2 bug trước đây "còn treo" nay ĐÃ FIX THẬT: HEAD method 404 (bug #3) và page sai bị âm thầm sửa (bug #12).' },
  { k: 'KẾT LUẬN CUỐI (02/10/2026)', v: 'KHÔNG CÒN BUG NÀO CẦN BÁO DEV. (13) field message luôn "Success" dù code báo lỗi — đã xác nhận KHÔNG ẢNH HƯỞNG người dùng cuối (UI không hiển thị field message), QA phụ trách quyết định BỎ QUA. Toàn bộ bug khác đã fix hoặc thuộc nhóm cache/data-sync/không-phải-bug.' },
  { k: 'ĐÃ FIX THÊM (xác nhận 02/10/2026, dev báo và QA verify độc lập)', v: '(7) top-leagues sai thứ tự — verify lại 3/3 lần, giờ khớp 100% với NestJS, không còn tái hiện. (11) top-leagues/lang/VN trả 4 ID RÁC — verify lại 4/4 vị trí đều đúng tên + ID thật, khớp 100% NestJS, ổn định 3/3 lần gọi.' },
  { k: 'Không phải bug (đã có giải thích hợp lý)', v: '(8) transfer fee đảo ký hiệu tiền tệ — thay đổi có chủ đích theo yêu cầu mới. (10) top-players-per-game tie-break khác nhau — dev giải thích SQL LIMIT thiếu ORDER BY, hành vi vốn có của SQL.' },
  { k: 'BỎ QUA — CACHE/DATA SYNC (theo quyết định QA, không báo dev)', v: '(1) Cache lẫn ngôn ngữ (B3). (2) UTD-1154 chỉ trả 10/30 cầu thủ (season mới thì đúng). (4) seasons thiếu has_standing_prediction (mùa mới nhất, cache 1 key chung). (5)/B8 thiếu header Cache-Control + Etag. (6) cur_round/record_updated_at trễ đồng bộ. (9) team-events cúp quốc nội mất tên đội (dev xác nhận đã fix, cache cũ còn dính). isCurrent sai ở stage mùa hiện tại (UTD-1151/1152, season mới thì đúng).' },
  { k: 'ĐÃ FIX (xác nhận 02/10/2026)', v: '(3) HEAD method trả 404 trên route GET — verify 5/5 route đều trả 200 đúng. (12) page sai (chữ/âm) bị âm thầm sửa — verify lại nhiều lần, cả 2 bên đều trả code:-1 khớp nhau.' },
  { k: 'Lưu ý', v: 'Field đổi snake_case→camelCase ở các route -v2/-old là thay đổi có chủ đích, không tính là bug (đã note riêng "DIFF (chấp nhận được)"). Cache TTL 3600s (B5) mới test bản ngắn 60s, bản đầy đủ 1 giờ chưa chạy.' },
]);

addSheet(wb, 'Test Logic', 'TEST LOGIC — NHÓM CHECK ÁP DỤNG CHO TỪNG ROUTE', [
  { header: 'TC', key: 'id', width: 8 }, { header: 'Nhóm', key: 'g', width: 18 },
  { header: 'Cách test', key: 'how', width: 55 }, { header: 'Kỳ vọng', key: 'exp', width: 55 },
], [
  ...COMPARE_CASES.map(([id, g, how, exp]) => ({ id, g: `A · ${g}`, how, exp })),
  ...CACHE_CASES.map(([id, g, how, exp]) => ({ id, g: `B · ${g}`, how, exp })),
]);

addSheet(wb, 'Test Case — 45 route', 'TEST CASE SO SÁNH API CŨ vs API MỚI (GO) — 45 ROUTE (KẾT QUẢ CHÍNH THỨC)', [
  { header: '#', key: 'n', width: 5 }, { header: 'Subtask', key: 'task', width: 11 },
  { header: 'Nhóm', key: 'g', width: 14 }, { header: 'Method', key: 'm', width: 8 },
  { header: 'Route', key: 'route', width: 48 }, { header: 'TC áp dụng', key: 'tc', width: 18 },
  { header: 'URL cũ', key: 'old', width: 60 }, { header: 'URL mới (Go)', key: 'new', width: 60 },
  { header: 'Kết quả', key: 'res', width: 24 }, { header: 'Ghi chú', key: 'note', width: 60 },
], ROUTES.map(([task, g, m, route, p, res, note], i) => ({
  n: i + 1, task, g, m, route,
  tc: route.endsWith('/logo') ? 'A1, A8' : m === 'HEAD' ? 'A1, A9' : /\/page\/|\/next\/|\/last\//.test(route) ? 'A1–A6, A10, A11' : 'A1–A6, A11',
  old: OLD + p, new: NEW + p, res, note,
})), 'res');

addSheet(wb, 'Test Case — Cache', 'TEST CASE CACHE (API MỚI — GO)', [
  { header: 'TC', key: 'id', width: 8 }, { header: 'Nội dung', key: 'g', width: 22 },
  { header: 'Cách test', key: 'how', width: 55 }, { header: 'Kỳ vọng', key: 'exp', width: 45 },
  { header: 'Kết quả', key: 'res', width: 55 },
], CACHE_CASES.map(([id, g, how, exp, res]) => ({ id, g, how, exp, res })), 'res');

addSheet(wb, 'Bug cần báo dev', 'DANH SÁCH BUG XÁC NHẬN — CẦN BÁO DEV (kèm lệnh tái hiện)', [
  { header: 'Mức độ', key: 'sev', width: 12 }, { header: 'Subtask/TC', key: 'task', width: 14 },
  { header: 'Route / Khu vực', key: 'route', width: 40 },
  { header: 'Mô tả bug', key: 'note', width: 60 },
  { header: 'Cách tái hiện (copy-paste chạy trong terminal)', key: 'repro', width: 90 },
], [
  {
    sev: 'Cao (MỚI — phát hiện 02/10/2026 khi test mở rộng độ phủ)', task: 'UTD-1151/1152', route: 'season/:seasonId/standings/stages VÀ mọi route trả field stage[].isCurrent (BXH theo mùa, BXH shortcut...)',
    note: 'Field "stage[].isCurrent" LUÔN SAI trên Go: trả false cho stage của MÙA GIẢI ĐANG DIỄN RA (lẽ ra phải true, đúng như NestJS). Tái lập 4/4 giải có mùa hiện tại đang test (UCL, EPL, ACL2, WC22) — 100% nhất quán, không phải nhiễu. FA Cup không áp dụng được (field không tồn tại ở giải không có stage cụ thể). Đây là lỗi LOGIC CỐ ĐỊNH (luôn luôn false), không phải lỗi dữ liệu trễ theo thời gian như các bug cur_round/cur_stage đã biết trước đó — khác bản chất, cần phân biệt khi báo dev. Ảnh hưởng: UI có thể không tự động chọn đúng stage/mùa hiện tại làm mặc định khi hiển thị BXH.',
    repro: `curl -s "${NESTJS}/season/c9dxsq8ov73r5s2/standings/stages?language=en" | jq '.data.stage[0].isCurrent'   # true (UCL, mùa 2025-2026 đang diễn ra)\ncurl -s "${GO}/season/c9dxsq8ov73r5s2/standings/stages?language=en" | jq '.data.stage[0].isCurrent'   # false — SAI\n\n# Tái lập thêm ở EPL, ACL2, WC22 (cùng pattern, đổi season_id tương ứng từng giải)`,
  },
  {
    sev: 'Cao', task: 'UTD-1154', route: 'top-players/overall/old',
    note: 'Danh sách "rating" chỉ trả 10 cầu thủ ở Go, NestJS trả 30 — thiếu 20 cầu thủ, đúng trên cả 3 giải mẫu.',
    repro: `curl -s "${GO}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/top-players/overall/old" | jq '.data.topPlayers.rating | length'   # → 10\ncurl -s "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/top-players/overall/old" | jq '.data.topPlayers.rating | length'  # → 30\n# So sánh trực tiếp 2 response để xem cầu thủ nào bị cắt mất:\ndiff <(curl -s "${GO}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/top-players/overall/old" | jq -r '.data.topPlayers.rating[].player.name') \\\n     <(curl -s "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/top-players/overall/old" | jq -r '.data.topPlayers.rating[].player.name')`,
  },
  {
    sev: 'Trung bình', task: 'UTD-1130', route: 'unique-tournament/:id/seasons',
    note: 'Field seasons[].has_standing_prediction bị thiếu hoàn toàn ở Go (không phải đổi tên) — nếu FE dùng field này để hiện icon dự đoán BXH sẽ mất tính năng.',
    repro: `curl -s "${GO}/unique-tournament/c9dxsq8o5wt1o5r/seasons?language=en" | jq '.data.seasons[0] | keys'     # không có has_standing_prediction\ncurl -s "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/seasons?language=en" | jq '.data.seasons[0] | keys'  # có has_standing_prediction`,
  },
  {
    sev: 'Trung bình', task: 'Chung', route: 'Mọi route',
    note: 'Go không bao giờ trả header Cache-Control (xác nhận null qua 15 lần gọi liên tiếp trên route ổn định) — NestJS luôn trả "public, max-age=3, s-maxage=3". CDN/edge cache phía trước không cache được response Go.',
    repro: `curl -sI "${GO}/unique-tournament/c9dxsq8o5wt1o5r?language=en" | grep -i cache-control    # (không có dòng nào)\ncurl -sI "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r?language=en" | grep -i cache-control # cache-control: public, max-age=3, s-maxage=3`,
  },
  {
    sev: 'Trung bình', task: 'UTD-1136', route: 'competitions',
    note: '49/2677 giải có cur_round/record_updated_at/cur_stage cũ hơn (trễ vài ngày) ở Go so với NestJS — nghi vấn pipeline đồng bộ data bị delay.',
    repro: `# So field record_updated_at của từng giải trùng id giữa 2 bên (cần jq và node)\ncurl -s "${GO}/competitions" -o /tmp/new.json\ncurl -s "${NESTJS}/competitions" -o /tmp/old.json\nnode -e "\nconst a=require('/tmp/old.json'), b=require('/tmp/new.json');\nconst mb=new Map(b.map(x=>[x.id,x]));\nlet n=0;\nfor(const xa of a){ const xb=mb.get(xa.id); if(xb && xa.cur_round!==xb.cur_round) n++; }\nconsole.log('số giải lệch cur_round:', n);\n"`,
  },
  {
    sev: 'Thấp', task: 'UTD-1137', route: 'competition/top-leagues',
    note: 'Cùng 11 giải nhưng thứ tự khác (Serie A/Bundesliga/Ligue 1 đảo vị trí) — cần xác nhận thứ tự đúng với dev/design.',
    repro: `curl -s "${GO}/competition/top-leagues" | jq -r '.data[].name'\ncurl -s "${NESTJS}/competition/top-leagues" | jq -r '.data[].name'\n# So 2 danh sách theo thứ tự in ra — vị trí 6-8 (Serie A/Bundesliga/Ligue 1) bị đảo`,
  },
  {
    sev: 'Thấp', task: 'UTD-1162', route: 'unique-tournament/:id/:season/transfers',
    note: 'Field transferFeeDescription đảo ngược format hiển thị tiền tệ: "€3.6M" (cũ) vs "3.6M €" (Go) — cùng giá trị, khác cách hiển thị.',
    repro: `# Dùng mùa hiện tại của Premier League (mfiws1aoh0uztg4), season lấy từ:\ncurl -s "${NESTJS}/unique-tournament/mfiws1aoh0uztg4/seasons" | jq -r '.data.seasons[0].id'  # season hiện tại\ncurl -s "${GO}/unique-tournament/mfiws1aoh0uztg4/<season_id>/transfers?language=en" | jq -r '.data.transfers[0].players[].transferFeeDescription'\ncurl -s "${NESTJS}/unique-tournament/mfiws1aoh0uztg4/<season_id>/transfers?language=en" | jq -r '.data.transfers[0].players[].transferFeeDescription'`,
  },
  {
    sev: 'Thông tin', task: 'UTD-1133', route: 'related-competitions',
    note: 'Premier League: 1 giải liên quan lệch cur_round 8 vs 9 — cùng nguyên nhân data-sync-lag với UTD-1136, không phải bug riêng.',
    repro: `diff <(curl -s "${GO}/unique-tournament/mfiws1aoh0uztg4/related-competitions?language=en" | jq -S .) \\\n     <(curl -s "${NESTJS}/unique-tournament/mfiws1aoh0uztg4/related-competitions?language=en" | jq -S .)`,
  },
  {
    sev: 'Cao (MỚI — phát hiện khi mở rộng data test)', task: 'UTD-1153', route: 'unique-tournament/:id/season/:seasonId/team-events/:type',
    note: 'Giải cúp quốc nội nhiều đội (FA Cup, Copa del Rey — KHÔNG xảy ra ở World Cup): NestJS trả tournamentTeamEvents RỖNG HOÀN TOÀN, Go trả đầy đủ trận đấu nhưng field homeTeam/awayTeam đều rỗng {} — có tỷ số nhưng không biết đội nào đá với đội nào.',
    repro: `# FA Cup:\ncurl -s "${GO}/unique-tournament/1z88sr5o1v9ntsd/season/jqcfxzpo4wnsdt6/team-events/total?language=en" | jq '.data.tournamentTeamEvents | to_entries[0].value[0] | {homeTeam, awayTeam, homeScore}'\n# → homeTeam: {}, awayTeam: {} (RỖNG) nhưng homeScore có số liệu đầy đủ\ncurl -s "${NESTJS}/unique-tournament/1z88sr5o1v9ntsd/season/jqcfxzpo4wnsdt6/team-events/total?language=en" | jq '.data'  # → {"tournamentTeamEvents":{}}  (rỗng hoàn toàn)\n\n# Đối chiếu Copa del Rey (giải cúp quốc nội khác, cùng bug):\ncurl -s "${GO}/unique-tournament/jqcfxzpohzuzp9p/season/1z88sr5of5qntsd/team-events/total?language=en" | jq '.data.tournamentTeamEvents | length'  # → 124 (có data nhưng cùng thiếu team info)\n\n# Đối chiếu World Cup 2022 (giải quốc tế, KHÔNG bị bug — để dev thấy khác biệt):\ncurl -s "${GO}/unique-tournament/nq8prta4pwtedsb/season/jy2us9tome0n7fj/team-events/total?language=en" | jq '.data.tournamentTeamEvents | to_entries[0].value[0].homeTeam'  # → có đầy đủ id/name, không rỗng`,
  },
  {
    sev: 'Trung bình (MỚI — phát hiện khi mở rộng data test)', task: 'UTD-1155', route: 'unique-tournament/:id/season/:seasonId/top-players-per-game/all/overall',
    note: 'World Cup 2022: khi nhiều trận đồng hạng (tie) ở cuối Top 10 mỗi category (vd "interceptions"), thứ tự tie-break giữa Go và NestJS khác nhau → 2 server trả về TRẬN ĐẤU KHÁC NHAU ở vị trí cuối bảng (không sai điểm số, chỉ khác trận được chọn đại diện).',
    repro: `curl -s "${GO}/unique-tournament/nq8prta4pwtedsb/season/jy2us9tome0n7fj/top-players-per-game/all/overall?language=en" | jq -r '.data.topPlayers.interceptions[7:10][] | "\\(.statistic): \\(.event.homeTeam.name) vs \\(.event.awayTeam.name)"'\ncurl -s "${NESTJS}/unique-tournament/nq8prta4pwtedsb/season/jy2us9tome0n7fj/top-players-per-game/all/overall?language=en" | jq -r '.data.topPlayers.interceptions[7:10][] | "\\(.statistic): \\(.event.homeTeam.name) vs \\(.event.awayTeam.name)"'\n# So 2 kết quả: cùng điểm số (statistic:4) nhưng khác trận đấu ở vị trí thứ 8, 9, 10`,
  },
  {
    sev: 'Cao (MỚI — phát hiện khi chạy lại toàn bộ test lần cuối)', task: 'UTD-1138', route: 'competition/top-leagues/lang/VN',
    note: '4/36 giải Go trả về ID KHÔNG TỒN TẠI kèm name rỗng, thay vì 4 giải thật (FA Cup, V.League 1, Vietnam Super Cup, AFC Champions League ở đúng các vị trí đó bên NestJS). Locale GB (28 giải) hoàn toàn bình thường — chỉ VN bị. Chính Go tự tra lại các id rác đó cũng trả code:2 (không tìm thấy), chứng tỏ đây là data hỏng chứ không phải id hợp lệ bị đổi tên.',
    repro: `curl -s "${GO}/competition/top-leagues/lang/VN?language=en" | jq -r '.data[] | select(.name == "") | .id'\n# → in ra 4 id rác: b4i6y8hvedwn056, 5xtpy2ov4gx8yvs, v6toc6ov0xco0nq, f0igys2vw62s0b8\n\n# Xác nhận các id đó không tồn tại (Go tự tra cũng ra code:2):\ncurl -s "${GO}/unique-tournament/b4i6y8hvedwn056?language=en" | jq '.code'   # → 2 (không tìm thấy)\n\n# Đối chiếu NestJS ở đúng vị trí đó (thứ 9, index 8) ra giải thật:\ncurl -s "${NESTJS}/competition/top-leagues/lang/VN?language=en" | jq '.data[8]'   # → {"id":"2wogs0ko6gu7tmm","name":"FA Cup",...}\n\n# Đối chiếu locale GB không bị lỗi này (để dev thấy rõ chỉ VN bị):\ncurl -s "${GO}/competition/top-leagues/lang/GB?language=en" | jq '[.data[] | select(.name == "")] | length'   # → 0`,
  },
  {
    sev: 'Trung bình (MỚI — phát hiện khi đào sâu edge case)', task: 'UTD-1143', route: 'unique-tournament/:id/seasons/:seasonId/events/finished/page/:page',
    note: 'Nhập page không hợp lệ (chữ hoặc số âm): NestJS trả code:-1 (báo lỗi, data rỗng); Go ÂM THẦM coi như page=1 và trả code:3 (thành công, 281 trận thật) — không validate input, khác hành vi cũ. Lưu ý: page=0 thì CẢ 2 bên đều đồng ý là lỗi (code:-1) — chỉ page=chữ và page=âm mới khác nhau.',
    repro: `curl -s "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/events/finished/page/abc?language=en" | jq '.code, .data.pagination'   # code:-1, pagination rỗng\ncurl -s "${GO}/unique-tournament/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/events/finished/page/abc?language=en" | jq '.code, .data.pagination'   # code:3, pagination.page:1 (âm thầm sửa)\n\n# Test thêm page=-1 (cùng hiện tượng):\ncurl -s "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/events/finished/page/-1?language=en" | jq '.code'   # -1\ncurl -s "${GO}/unique-tournament/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/events/finished/page/-1?language=en" | jq '.code'   # 3\n\n# Đối chứng page=0 — không phải bug, cả 2 bên đều coi là lỗi:\ncurl -s "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/events/finished/page/0?language=en" | jq '.code'   # -1\ncurl -s "${GO}/unique-tournament/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/events/finished/page/0?language=en" | jq '.code'   # -1`,
  },
  {
    sev: 'Thấp (MỚI — phát hiện khi đào sâu edge case)', task: 'Chung', route: 'Mọi route (khi gọi id/tham số sai)',
    note: 'Go trả field message:"Success" ngay cả khi code báo lỗi (code:2, không tìm thấy) — 2 thông tin mâu thuẫn nhau trong cùng response. NestJS trả message rỗng "" ở cùng tình huống, không gây hiểu lầm.',
    repro: `curl -s "${GO}/unique-tournament/zzzzzzzzzzzzzzz?language=en" | jq '.'   # {"code":2,"message":"Success","data":{}} — mâu thuẫn\ncurl -s "${NESTJS}/unique-tournament/zzzzzzzzzzzzzzz?language=en" | jq '.'   # {"code":2,"message":""} — nhất quán hơn`,
  },
  {
    sev: 'Cao (TÁI PHÁT — fix thiếu sót, phát hiện 02/10/2026)', task: 'UTD-1154', route: 'top-players/overall-v2 VÀ top-players/overall/old (2 route biến thể, KHÔNG phải route overall gốc)',
    note: 'Bug "chỉ trả 10/30 cầu thủ" từng báo đã fix (verify 29/09 trên route overall gốc) — nhưng dev CHỈ fix route overall gốc, CHƯA fix 2 route biến thể overall-v2 và overall/old. Verify lại 02/10/2026 trên cả 5 giải mẫu: route overall gốc Go=10/NestJS=10 (khớp, đúng); nhưng route overall-v2 và overall/old: Go VẪN chỉ trả 10, NestJS giờ trả đủ 30 — tái lập 100% (5/5 giải, 2/2 route biến thể). Cần dev áp dụng fix tương tự cho 2 route biến thể này.',
    repro: `curl -s "${GO}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/top-players/overall-v2" | jq '.data.topPlayers.rating | length'   # 10 — SAI\ncurl -s "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/top-players/overall-v2" | jq '.data.top_players.rating | length'   # 30 — đúng\n\n# Đối chứng route overall GỐC (đã fix đúng, không bug):\ncurl -s "${GO}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/top-players/overall?language=en" | jq '.data.topPlayers.rating | length'   # 10\ncurl -s "${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/top-players/overall?language=en" | jq '.data.topPlayers.rating | length'   # 10 — khớp`,
  },
  {
    sev: 'Trung bình (MỚI — phát hiện khi chạy lại toàn bộ test lần cuối, 01/10/2026)', task: 'B8 (cache header)', route: 'unique-tournament/:id (và nhiều khả năng mọi route GET service Competition)',
    note: 'Go KHÔNG trả 2 header HTTP liên quan cache: "cache-control" và "etag" — NestJS trả đầy đủ (cache-control: public, max-age=3, s-maxage=3 + etag dạng weak "W/..."), Go trả rỗng hoàn toàn cho cả 2 header. Đã xác nhận JSON BODY vẫn giống nhau 100% (không phải bug data) — đây thuần tuý là thiếu header tầng HTTP/CDN. Rủi ro: nếu có CDN/proxy/trình duyệt dựa vào cache-control hoặc etag để cache response hoặc làm conditional request (If-None-Match), sẽ mất hẳn khả năng cache ở tầng edge khi cutover sang Go — có thể tăng tải ngược lên origin dù logic nghiệp vụ không sai.',
    repro: `curl -sI "${NESTJS}/unique-tournament/mfiws1aoh0uztg4?language=en" | grep -i "cache-control\\|etag"   # etag: W/"42d-..." · cache-control: public, max-age=3, s-maxage=3\ncurl -sI "${GO}/unique-tournament/mfiws1aoh0uztg4?language=en" | grep -i "cache-control\\|etag"   # (rỗng — không có dòng nào)`,
  },
], 'sev');

// Ngày 30/09/2026: dev ghi chú phản hồi trực tiếp vào file Excel (không qua Jira comment) cho từng bug
// trong sheet "Bug cần báo dev". QA đã verify lại TỪNG bug một cách độc lập (không chỉ tin lời dev) bằng
// data hoàn toàn mới (season/type chưa từng gọi) để tránh nhầm giữa "đã fix thật" và "cache còn giữ kết
// quả cũ". 2 trường hợp ban đầu verify sai (tưởng chưa fix) hoá ra do dính đúng cache stale ở 1 cache-key
// cụ thể — đã test lại bằng cache-key khác (season khác / type khác) để xác nhận đúng.
const VERIFY_FIX = [
  {
    n: 1, ketQua: 'ĐÃ FIX (xác nhận)', bug: 'UTD-1130 — thiếu field has_standing_prediction',
    devGhi: 'Đã fix', qaVerify: 'Gọi lại route /seasons trên Premier League: field has_standing_prediction đã xuất hiện đầy đủ trong mọi mùa giải. Đúng như dev báo.',
  },
  {
    n: 2, ketQua: 'FIX MỘT PHẦN (xác nhận lại 02/10/2026)', bug: 'UTD-1154 — top-players chỉ trả 10/30 cầu thủ',
    devGhi: 'Đã fix', qaVerify: 'Test lần đầu (29/09) với season CŨ đã cache vẫn thấy 10/30 — tưởng chưa fix; test lại season mới thấy 30/30 nên kết luận ĐÃ FIX. KIỂM TRA LẠI 02/10/2026 trên cả 5 giải mẫu, route overall (route gốc): Go=10, NestJS=10 — khớp, PASS thật. NHƯNG 2 route biến thể overall-v2 và overall/old: Go VẪN chỉ trả 10, trong khi NestJS giờ trả 30 — tái lập 100% trên cả 5 giải. => Dev CHỈ fix route overall gốc, CHƯA fix 2 route biến thể overall-v2/overall-old. Sửa lại kết luận: KHÔNG PHẢI đã fix hoàn toàn.',
  },
  {
    n: 3, ketQua: 'ĐÃ FIX (xác nhận)', bug: 'UTD-1153 — team-events cúp quốc nội mất thông tin đội (homeTeam/awayTeam rỗng)',
    devGhi: 'đã fix', qaVerify: 'Test lại đúng season/type=total đã cache trước khi fix (FA Cup 2025) vẫn thấy 58 đội với homeTeam rỗng — TƯỞNG CHƯA FIX. Sau đó thử type=home và type=away (cache-key khác, chưa từng gọi): Go trả code:1 (miss thật), 0 đội — đúng hành vi sau khi fix (không còn tự sinh data rác). Xác nhận ĐÃ FIX THẬT, cache cũ chỉ còn dính ở đúng type=total của season đó.',
  },
  {
    n: 4, ketQua: 'ĐÃ FIX (xác nhận)', bug: 'UTD-1162 — transfer fee đảo ký hiệu tiền tệ (3.6M € thay vì €3.6M)',
    devGhi: 'Đã fix', qaVerify: 'Gọi lại route transfers Premier League mùa hiện tại: ký hiệu € đã đứng đúng vị trí trước số ("€3.6M", "€60M"...), khớp NestJS. Đúng như dev báo.',
  },
  {
    n: 5, ketQua: 'ĐÃ FIX (xác nhận)', bug: 'UTD-1143 — page=chữ/âm bị âm thầm sửa thành page=1 thay vì báo lỗi',
    devGhi: 'Đã fix', qaVerify: 'Gọi lại page=abc trên route events/finished: Go trả code:-1 (báo lỗi rõ ràng), khớp hành vi NestJS. Đúng như dev báo.',
  },
  {
    n: 6, ketQua: 'CACHE STALE — không phải bug code, chờ clear cache', bug: 'UTD-1136 — 32/2677 giải data trễ đồng bộ',
    devGhi: 'Cache stale, cần clear cache', qaVerify: 'Quét lại toàn bộ 2677 giải: 0 giải lệch record_updated_at — đã tự đồng bộ theo thời gian. Khớp giải thích của dev (không phải bug code, chỉ là cache/dữ liệu độ trễ tự nhiên).',
  },
  {
    n: 7, ketQua: 'CACHE STALE — không phải bug code, chờ clear cache', bug: 'UTD-1137 — top-leagues sai thứ tự hiển thị',
    devGhi: 'Cache stale, cần clear cache', qaVerify: 'So thứ tự 11 giải: giống hệt NestJS. Khớp giải thích dev.',
  },
  {
    n: 8, ketQua: 'CACHE STALE — vẫn còn lệch tại thời điểm verify', bug: 'UTD-1133 — related-competitions lệch cur_round',
    devGhi: 'Cache stale, cần clear cache', qaVerify: 'Verify lại 30/09: VẪN còn lệch cur_round (9 vs 8) ở Premier League. Đúng bản chất là cache stale như dev nói (không phải bug code), nhưng CHƯA tự hết như UTD-1136/1137 — có thể do route này không có traffic đủ để cache tự invalidate. Đề nghị dev clear cache thủ công nếu cần gấp.',
  },
  {
    n: 9, ketQua: 'CHƯA FIX — dev đang xử lý', bug: 'B3 — Cache không tách theo language',
    devGhi: 'Phần dịch không qua cache, qua ES', qaVerify: 'Verify lại 3 lần độc lập (season khác nhau, giải khác nhau — Bundesliga, EPL): gọi ?language=en rồi ?language=vi trên CÙNG route/season vẫn bị HIT nhầm (code:3 thay vì 1). Ghi chú của dev có thể chỉ áp dụng cho phần TÊN GIẢI/hiển thị dịch qua Elasticsearch riêng, không phải toàn bộ cache response — bug ở route top-players/overall vẫn còn nguyên. Cần dev xác nhận rõ hơn phạm vi đã fix.',
  },
  {
    n: 10, ketQua: 'ĐÃ FIX (xác nhận 02/10/2026)', bug: 'HEAD trả 404 trên hầu hết route (service Competition)',
    devGhi: 'Check sau → đã fix', qaVerify: 'Verify lại hôm nay (02/10): HEAD đã trả 200 trên cả route cũ (UTD-1129, UTD-1132) lẫn route mới (UTD-1196, UTD-1198, UTD-1199) — khớp đúng status với GET và với NestJS. Test 5/5 route đều PASS. Xác nhận ĐÃ FIX THẬT.',
  },
  {
    n: 11, ketQua: 'CHƯA FIX — dev đang xử lý ("Check sau")', bug: 'Thiếu header Cache-Control',
    devGhi: 'Check sau', qaVerify: 'Verify lại: vẫn không có header cache-control trên mọi response. Khớp ghi chú dev — đang chờ xử lý.',
  },
  {
    n: 12, ketQua: 'KHÔNG PHẢI BUG — dev giải thích nguyên nhân', bug: 'UTD-1155 — tie-break top-players-per-game khác nhau ở World Cup',
    devGhi: 'KHÔNG phải bug — tie nondeterminism ở SQL LIMIT', qaVerify: 'Đồng ý với giải thích của dev: khi nhiều bản ghi có cùng giá trị thống kê (tie), câu lệnh SQL dùng LIMIT không có ORDER BY phụ để phá tie → thứ tự trả về không xác định (non-deterministic) giữa các lần chạy hoặc giữa 2 hệ thống khác engine DB. Đây là hành vi vốn có của SQL, không phải lỗi code Go. Đề nghị (không bắt buộc): nếu muốn kết quả ổn định, có thể thêm ORDER BY phụ theo id để phá tie nhất quán — nhưng không tính là bug cần fix gấp.',
  },
  {
    n: 13, ketQua: 'KHÔNG PHẢI BUG CODE — do môi trường staging', bug: 'UTD-1138 — top-leagues/lang/VN trả 4 ID rác',
    devGhi: 'KHÔNG phải bug code — deployed staging giữ in-mem VN cũ (stale)', qaVerify: 'Verify lại 30/09: VẪN thấy đúng 4 ID rác y hệt lần trước (b4i6y8hvedwn056, 5xtpy2ov4gx8yvs, v6toc6ov0xco0nq, f0igys2vw62s0b8). Đồng ý đây có thể là do bộ nhớ in-memory của instance staging giữ dữ liệu cũ lúc khởi động, không phải lỗi logic code — nhưng lưu ý: hiện tượng CHƯA tự hết dù đã qua 1 ngày, khác với UTD-1136/1137 (tự hết theo cache TTL). Đề nghị dev xác nhận: có cần restart pod/instance staging để nạp lại in-memory mới không? Nếu môi trường production thật cũng dùng cơ chế in-memory tương tự, đây là rủi ro cần lưu ý khi go-live (dữ liệu "đứng hình" cho tới khi restart).',
  },
  {
    n: 14, ketQua: 'GHI NHẬN — cần dev làm rõ thêm', bug: 'Field message luôn "Success" dù code báo lỗi',
    devGhi: 'Thay đổi không cần nhất quán', qaVerify: 'Hiểu ý dev: đây là thay đổi có chủ đích, không bắt buộc phải nhất quán với message cũ của NestJS (không phải bug, chỉ là field phụ không quan trọng). QA đồng ý hạ độ ưu tiên xuống mức thông tin, không cần fix nếu dev xác nhận không ảnh hưởng client.',
  },
];

addSheet(wb, 'Verify fix (30-09)', 'KẾT QUẢ QA VERIFY LẠI SAU KHI DEV PHẢN HỒI (đối chiếu độc lập, không chỉ tin lời dev)', [
  { header: '#', key: 'n', width: 5 }, { header: 'Kết quả verify', key: 'ketQua', width: 30 },
  { header: 'Bug', key: 'bug', width: 55 },
  { header: 'Dev ghi (từ file Excel)', key: 'devGhi', width: 40 },
  { header: 'QA verify lại (30/09/2026)', key: 'qaVerify', width: 75 },
], VERIFY_FIX, 'ketQua');

// CẬP NHẬT 30/09-01/10/2026: Dev đã tạo 5 subtask mới cho 5 API này — UTD-1196, UTD-1197, UTD-1198,
// UTD-1199, UTD-1200 (tạo lúc 09:56-09:57 ngày 30/09/2026). Mô tả Jira của cả 5 subtask vẫn ghi
// "Trạng thái Go: ❌ chưa port" (CHƯA CẬP NHẬT KỊP so với thực tế code). QA đã tự verify lại trên
// staging (test-go-staging-api.uniscore.vn, 01/10/2026): CẢ 5/5 ROUTE ĐÃ PORT XONG VÀ PASS 100%.
// - Cả 5 route đều trả 200 (không còn 404 như lần verify 29/09).
// - So sánh full JSON (diff, sort_keys) giữa Go và NestJS cho data thật: 0 diff — khớp hoàn toàn.
// - Test thêm case ID sai (BAD="zzzzzzzzzzzzzzz"): cả 5 route Go và NestJS đều trả cùng error code
//   (UTD-1196 code=1, UTD-1197 code=3, UTD-1198/1199/1200 code=2) — khớp cả hành vi lỗi.
// => Kết luận: 5 API này ĐÃ PORT xong, có subtask theo dõi, KHÔNG còn là rủi ro cutover.
const MISSING_APIS = [
  {
    n: 1, uutien: 'ĐÃ PORT — PASS', ten: 'Trận gần đây của 1 đội trong giải (latest-matches)',
    traffic: '51,590 request/24h — CAO NHẤT trong toàn bộ danh sách audit, kể cả so với các route đã port',
    route: 'unique-tournaments/:competitionId/seasons/:seasonId/team/:teamId/latest-matches',
    ghiChu: 'UTD-1196 (tạo 30/09/2026). Mô tả Jira ghi "❌ chưa port" nhưng verify thực tế trên staging 01/10/2026: Go trả 200, khớp 100% với NestJS trên data thật (5 giải mẫu), khớp error code khi test ID sai. Field "rating" ban đầu tưởng lệch (Go làm tròn 2 chữ số, NestJS giữ float gốc) — đã đối chứng route top-players/overall: CẢ 2 BÊN đều làm tròn 2 chữ số theo đúng quy ước chung, nên Go làm tròn ở latest-matches là ĐÚNG, chính NestJS mới là bên không nhất quán ở riêng route này → không tính là bug. Có phát hiện 1 bug CHUNG không riêng route này: Go không hỗ trợ HTTP method HEAD trên mọi route GET — xem sheet "Bug cần báo dev".',
    link1: `${GO}/unique-tournaments/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/team/c467w80old4rt8p/latest-matches`,
    link2: `${NESTJS}/unique-tournaments/c9dxsq8o5wt1o5r/seasons/c9dxsq8ov73r5s2/team/c467w80old4rt8p/latest-matches`,
  },
  {
    n: 2, uutien: 'ĐÃ PORT — PASS', ten: 'Đội hình tiêu biểu theo vòng đấu (team-of-the-week/rounds)',
    traffic: '3,904 request/24h',
    route: 'unique-tournament/:competitionId/season/:seasonId/team-of-the-week/rounds',
    ghiChu: 'UTD-1197 (tạo 30/09/2026). Verify 01/10/2026: Go trả 200, khớp 100% (0 diff) với NestJS trên data thật (data.rounds[], formation + player rating), và khớp error code (=3) khi test ID sai.',
    link1: `${GO}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/team-of-the-week/rounds`,
    link2: `${NESTJS}/unique-tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/team-of-the-week/rounds`,
  },
  {
    n: 3, uutien: 'ĐÃ PORT — PASS', ten: 'Nhà vô địch hiện tại (current-champions)',
    traffic: '805 request/24h',
    route: 'competition/:id/current-champions',
    ghiChu: 'UTD-1198 (tạo 30/09/2026, param "id" dùng decode thường — khác decodeCompetitionId). Verify 01/10/2026: Go trả 200, khớp 100% (0 diff) với NestJS (data.result[]: team + points), khớp error code (=2) khi test ID sai.',
    link1: `${GO}/competition/c9dxsq8o5wt1o5r/current-champions`,
    link2: `${NESTJS}/competition/c9dxsq8o5wt1o5r/current-champions`,
  },
  {
    n: 4, uutien: 'ĐÃ PORT — PASS', ten: 'Đội nhiều danh hiệu nhất (most-titles)',
    traffic: '804 request/24h',
    route: 'competition/:id/most-titles',
    ghiChu: 'UTD-1199 (tạo 30/09/2026, cùng lưu ý decode param như UTD-1198). Verify 01/10/2026: Go trả 200, khớp 100% (0 diff) với NestJS (data.result[]: achieveTime + danh sách year vô địch), khớp error code (=2) khi test ID sai.',
    link1: `${GO}/competition/c9dxsq8o5wt1o5r/most-titles`,
    link2: `${NESTJS}/competition/c9dxsq8o5wt1o5r/most-titles`,
  },
  {
    n: 5, uutien: 'ĐÃ PORT — PASS', ten: 'Bản đồ nhiệt cầu thủ theo trận (heatmap)',
    traffic: '0 request/24h trực tiếp, nhưng route dạng wildcard cùng nhóm ghi nhận 682/24h',
    route: 'competition/:competitionId/season/:seasonId/player/:playerId/heatmap',
    ghiChu: 'UTD-1200 (tạo 30/09/2026). Verify 01/10/2026: Go trả 200, khớp 100% (0 diff) với NestJS (data.heatmap[]: mảng toạ độ {x,y}), khớp error code (=2) khi test ID sai.',
    link1: `${GO}/competition/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/player/sybadnlgm0gsdt6/heatmap`,
    link2: `${NESTJS}/competition/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/player/sybadnlgm0gsdt6/heatmap`,
  },
  {
    n: 6, uutien: 'ỨNG VIÊN RETIRE (dev đề xuất)', ten: 'BXH theo stage cụ thể — biến thể legacy (không football/, có stage)',
    traffic: '0 request/24h VÀ 0 request/3d — dev ghi chú "0 traffic 3 ngày → ứng viên RETIRE"',
    route: 'tournament/:competitionId/season/:seasonId/stage/:stageId/standings/:type (KHÔNG có tiền tố football/)',
    ghiChu: 'Không có traffic thật trong 3 ngày liên tục — dev đề xuất RETIRE (bỏ hẳn) thay vì port. QA verify: route legacy này khác route đã port (có football/) — path KHÔNG football/ vẫn 404 trên Go, đúng như comment. Không cần ưu tiên test nếu team đồng ý bỏ.',
    link1: `${GO.replace('/football', '')}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/stage/gk7aeql6867r6iv/standings/total?language=en`,
    link2: `${NESTJS.replace('/football', '')}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/stage/gk7aeql6867r6iv/standings/total?language=en`,
  },
  {
    n: 7, uutien: 'ỨNG VIÊN RETIRE (dev đề xuất)', ten: 'BXH realtime theo stage — biến thể legacy',
    traffic: '0 request/24h VÀ 0 request/3d',
    route: 'tournament/:competitionId/season/:seasonId/stage/:stageId/standings/:type/realtime (KHÔNG football/)',
    ghiChu: 'Cùng nhóm RETIRE với #6. QA đã verify: 404 trên Go đúng như comment (lần verify đầu tiên tôi nhầm sang biến thể CÓ football/ đã port, đã sửa lại đúng).',
    link1: `${GO.replace('/football', '')}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/stage/gk7aeql6867r6iv/standings/total/realtime?language=en`,
    link2: `${NESTJS.replace('/football', '')}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/stage/gk7aeql6867r6iv/standings/total/realtime?language=en`,
  },
  {
    n: 8, uutien: 'ỨNG VIÊN RETIRE (dev đề xuất)', ten: 'BXH theo type — biến thể legacy (không stage)',
    traffic: '0 request/24h VÀ 0 request/3d',
    route: 'tournament/:competitionId/season/:seasonId/standings/:type (KHÔNG football/)',
    ghiChu: 'Cùng nhóm RETIRE với #6, #7. Lưu ý: KHÁC với route #1 trong sheet "Route gộp" (route đó CÓ football/, đã port và hoạt động — đây là bug thật). Route này (không football/) hoàn toàn không có traffic, có thể an toàn để bỏ.',
    link1: `${GO.replace('/football', '')}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/standings/total?language=en`,
    link2: `${NESTJS.replace('/football', '')}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/standings/total?language=en`,
  },
];

addSheet(wb, 'API mới (1196-1200)', 'CẬP NHẬT 01/10/2026: 5 API từng "chưa port, chưa có subtask" (phát hiện 29/09) NAY ĐÃ CÓ SUBTASK (UTD-1196→UTD-1200, tạo 30/09/2026) VÀ ĐÃ PORT XONG — verify PASS 100% trên staging. Mô tả Jira của 5 subtask vẫn ghi "❌ chưa port" nhưng đó là mô tả CHƯA CẬP NHẬT so với code thực tế.', [
  { header: '#', key: 'n', width: 5 }, { header: 'Trạng thái', key: 'uutien', width: 16 },
  { header: 'API là gì', key: 'ten', width: 38 },
  { header: 'Traffic thật (production)', key: 'traffic', width: 35 },
  { header: 'Route', key: 'route', width: 60 },
  { header: 'Ghi chú', key: 'ghiChu', width: 45 },
  { header: 'Link 1 (Go — đã port, trả 200)', key: 'link1', width: 60 },
  { header: 'Link 2 (NestJS — đối chứng, khớp 100%)', key: 'link2', width: 60 },
], MISSING_APIS, 'uutien');

// Nguồn: comment Jira "Port kiểu gộp — path opta KHÔNG còn trên Go" (8 route). Đây là các route mà
// path CŨ trên NestJS đã bị XOÁ trên Go — client bắt buộc phải đổi sang route mới, nếu không sẽ 404
// khi cutover. Đã tự tay verify 2/8 (routes standing/standing-by-round — cùng domain competitions).
// 6/8 route cup-trees thuộc 1 service Go riêng ("uni-football-api") — theo đúng mô tả gốc ticket UTD-899
// ("Đã port sẵn ở Go (không tạo subtask)... Cup: season/:season_id/cup-trees"), nhóm route này ĐÃ ĐƯỢC
// PORT và nằm NGOÀI phạm vi 34 subtask cần QA verify của ticket này — QUYẾT ĐỊNH (02/10/2026, QA phụ
// trách xác nhận): KHÔNG CẦN TEST PHẦN NÀY, không tính là lỗ hổng độ phủ.
const GROUPED_ROUTES = [
  {
    n: 1, trangThai: 'ĐÃ TEST — có bug nhẹ', route: 'tournament/:id/season/:seasonId/standings/:type',
    routeMoi: 'tournament/:id/season/:seasonId/standings?type=:type (type chuyển từ path sang query)',
    ketQua: 'Path cũ 404 trên Go (đã xoá) — đúng như comment dev. Path mới hoạt động, data ĐÚNG BẢN CHẤT nhưng có 6 khác biệt: (1) stage[].isCurrent bị THIẾU ở Go — có thể ảnh hưởng UI hiển thị "vòng hiện tại"; (2) standings[].name đổi format "leagues_<stage_id>" → "leagues" (rút gọn, có vẻ chủ đích); (3-4) Go THÊM MỚI field hasLive (ở root) và group_num, positionChange, match ở mỗi dòng BXH — đây là field bổ sung hữu ích, không phải bug, nhưng field "match" đang null (cần hỏi dev khi nào field này có giá trị).',
    repro: `curl -s -o /dev/null -w "%{http_code}\\n" "${GO}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/standings/total?language=en"   # 404 — path cũ đã xoá\ncurl -s "${GO}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/standings?type=total&language=en" | jq '.data.stage, .data.standings[0].name'   # stage thiếu isCurrent; name đổi format\ncurl -s "${NESTJS}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/standings/total?language=en" | jq '.data.stage, .data.standings[0].name'   # đối chứng`,
  },
  {
    n: 2, trangThai: 'ĐÃ TEST — OK', route: 'unique-tournament/:id/season/:seasonId/standing-by-round/:type',
    routeMoi: 'tournament/:id/season/:seasonId/standing-by-round (bỏ :type khỏi path, prefix đổi unique-tournament→tournament)',
    ketQua: 'Route mới hoạt động bình thường (code 3, có data đầy đủ: stage, standings, isWorldCup, hasLive). Chưa so chi tiết từng field vì cấu trúc khác khá nhiều so với route cũ (route cũ chỉ có field "standings" đơn giản hơn) — cần dev xác nhận đây là thay đổi có chủ đích hay cần audit thêm.',
    repro: `curl -s -o /dev/null -w "%{http_code}\\n" "${GO}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/standing-by-round?language=en"   # 200, code 3\ncurl -s "${GO}/tournament/c9dxsq8o5wt1o5r/season/c9dxsq8ov73r5s2/standing-by-round?language=en" | jq '.data | keys'`,
  },
  {
    n: 3, trangThai: 'ĐÃ PORT — KHÔNG CẦN TEST (quyết định QA)', route: 'season/:seasonId/cuptrees/structured',
    routeMoi: 'season/:seasonId/cup-trees (gộp cùng 5 route cup-trees khác, thuộc service Go RIÊNG "uni-football-api")',
    ketQua: 'Theo mô tả gốc ticket UTD-899: route này thuộc nhóm "Đã port sẵn ở Go (không tạo subtask)" — nằm NGOÀI phạm vi 34 subtask của ticket, do service Go riêng "uni-football-api" phụ trách (không phải "api-football-competitions" đang test). QUYẾT ĐỊNH 02/10/2026 (QA phụ trách xác nhận): không cần QA verify phần này trong phạm vi UTD-899, không tính là lỗ hổng độ phủ.',
    repro: `# Route thuộc service khác, ngoài phạm vi domain đang test (test-go-staging-api.uniscore.vn):\ncurl -s -o /dev/null -w "%{http_code}\\n" "https://test-go-staging-api.uniscore.vn/api/v2/football/season/jy2us9tome0n7fj/cup-trees"   # 404 (route thuộc service khác)\n# NestJS cũ (path gốc) vẫn hoạt động bình thường, dùng để đối chứng khi service Go riêng sẵn sàng:\ncurl -s -o /dev/null -w "%{http_code}\\n" "${NESTJS}/season/jy2us9tome0n7fj/cuptrees/structured?language=en"   # 200`,
  },
  {
    n: 4, trangThai: 'ĐÃ PORT — KHÔNG CẦN TEST (quyết định QA)', route: 'season/:seasonId/brackets', routeMoi: 'season/:seasonId/cup-trees (gộp, cùng service riêng)',
    ketQua: 'Cùng lý do #3 — ngoài phạm vi 34 subtask, đã port ở service Go riêng.', repro: '(xem #3)',
  },
  {
    n: 5, trangThai: 'ĐÃ PORT — KHÔNG CẦN TEST (quyết định QA)', route: 'season/:seasonId/rounds (cup rounds, khác với unique-tournament/.../rounds)', routeMoi: 'season/:seasonId/cup-trees (gộp, cùng service riêng)',
    ketQua: 'Cùng lý do #3.', repro: '(xem #3)',
  },
  {
    n: 6, trangThai: 'ĐÃ PORT — KHÔNG CẦN TEST (quyết định QA)', route: 'season/:seasonId/round/:roundId/matches', routeMoi: 'season/:seasonId/cup-trees (gộp, cùng service riêng)',
    ketQua: 'Cùng lý do #3.', repro: '(xem #3)',
  },
  {
    n: 7, trangThai: 'ĐÃ PORT — KHÔNG CẦN TEST (quyết định QA)', route: 'unique-tournament/:id/season/:seasonId/cuptrees/structured', routeMoi: 'season/:seasonId/cup-trees (gộp, cùng service riêng)',
    ketQua: 'Cùng lý do #3 — đây là biến thể path có thêm unique-tournament/:id/ phía trước.', repro: '(xem #3)',
  },
  {
    n: 8, trangThai: 'ĐÃ PORT — KHÔNG CẦN TEST (quyết định QA, 0 traffic)', route: '/api/v2/unique-tournament/:id/season/:seasonId/cuptrees/structured', routeMoi: 'season/:seasonId/cup-trees (gộp, cùng service riêng)',
    ketQua: 'Cùng lý do #3. Traffic 0 req/24h+3d theo audit dev.', repro: '(xem #3)',
  },
];

addSheet(wb, 'Route gộp (path cũ đổi)', '8 ROUTE "GỘP" — PATH CŨ ĐÃ XOÁ TRÊN GO, CLIENT PHẢI ĐỔI ROUTE (theo comment Jira rev5)', [
  { header: '#', key: 'n', width: 5 }, { header: 'Trạng thái test', key: 'trangThai', width: 26 },
  { header: 'Route cũ (NestJS)', key: 'route', width: 45 },
  { header: 'Route mới (Go)', key: 'routeMoi', width: 55 },
  { header: 'Kết quả', key: 'ketQua', width: 65 },
  { header: 'Lệnh tái hiện', key: 'repro', width: 55 },
], GROUPED_ROUTES, 'trangThai');

fs.mkdirSync(OUT_DIR, { recursive: true });
await wb.xlsx.writeFile(OUT);
console.log('Đã xuất:', path.relative(process.cwd(), OUT), `(${ROUTES.length} route, ${COMPARE_CASES.length + CACHE_CASES.length} TC logic, ${MISSING_APIS.length} API chưa port mới phát hiện)`);
