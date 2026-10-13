/**
 * UTD-899 — [API][Football] Tách Competition + honor thành service riêng.
 * Xuất file test case (Excel) cho 45 route (34 subtask) + nhóm test cache.
 *
 * Nguồn: Jira UTD-899 + Confluence "Competitions Domain" (page 76054535).
 * KẾT QUẢ CHÍNH THỨC — chạy thật bằng Playwright (01-compare-old-vs-new.spec.ts, 02-cache.spec.ts)
 * ngày 29/09/2026, trên 3 giải mẫu: UEFA Champions League, Premier League, AFC Champions League 2
 * (giải có vòng bảng). 151 test case A + 8 test case cache B, tổng 137 pass / 14 fail (nhóm A)
 * + 7 pass / 1 fail (nhóm B).
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
  ['UTD-1138', '§1 Overview', 'GET', 'competition/top-leagues/lang/:locale', `/competition/top-leagues/lang/VN${L}`, 'SAME', ''],
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
  ['UTD-1153', '§3 Standings', 'GET', 'unique-tournament/:c/season/:s/team-events/:type', `/unique-tournament/${C}/season/${S}/team-events/total${L}`, 'SAME', 'Cả 4 biến thể route (unique-tournament/tournament × có/không stage) khớp'],
  ['UTD-1153', '§3 Standings', 'GET', 'tournament/:c/season/:s/team-events/:type', `/tournament/${C}/season/${S}/team-events/total${L}`, 'SAME', ''],
  ['UTD-1153', '§3 Standings', 'GET', 'tournament/:c/season/:s/stage/:stage_id/team-events/:type', `/tournament/${C}/season/${S}/stage/${ST}/team-events/total${L}`, 'SAME', ''],
  ['UTD-1153', '§3 Standings', 'GET', 'unique-tournament/:c/season/:s/stage/:stage_id/team-events/:type', `/unique-tournament/${C}/season/${S}/stage/${ST}/team-events/total${L}`, 'SAME', ''],
  ['UTD-1154', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players/overall', `/unique-tournament/${C}/season/${S}/top-players/overall${L}`, 'SAME', ''],
  ['UTD-1154', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players/overall-v2', `/unique-tournament/${C}/season/${S}/top-players/overall-v2`, 'DIFF (chấp nhận được) + BUG', 'Field đổi snake_case→camelCase có chủ đích (top_players→topPlayers, toàn bộ field con). NHƯNG kèm bug thật: xem overall/old'],
  ['UTD-1154', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players/overall/old', `/unique-tournament/${C}/season/${S}/top-players/overall/old`, 'BUG', 'Danh sách rating chỉ có 10 cầu thủ ở Go, NestJS có 30 — mất 20 cầu thủ, đúng trên cả 3 giải mẫu'],
  ['UTD-1155', '§4 Top-player', 'GET', 'unique-tournament/:c/season/:s/top-players-per-game/all/overall', `/unique-tournament/${C}/season/${S}/top-players-per-game/all/overall${L}`, 'SAME', ''],
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
addSheet(wb, 'Tổng quan', 'UTD-899 — TÁCH COMPETITION + HONOR THÀNH SERVICE RIÊNG (NestJS → Go)', [
  { header: 'Mục', key: 'k', width: 38 }, { header: 'Nội dung', key: 'v', width: 95 },
], [
  { k: 'Task', v: 'UTD-899 — 34 subtask (UTD-1129 → UTD-1162), ~46 API port sang Go, 45 route khi tính biến thể (44 GET + 1 HEAD)' },
  { k: 'Tài liệu', v: 'Confluence "Competitions Domain" (page 76054535)' },
  { k: 'API cũ (NestJS)', v: `${OLD}  (x-service-name: staging-opta-api)` },
  { k: 'API mới (Go)', v: `${NEW}  (x-service-name: staging-api-football-competitions)` },
  { k: 'Data mẫu', v: `3 giải: UEFA Champions League (${C}), Premier League, AFC Champions League 2 (giải có vòng bảng, thay cho World Cup do id ban đầu lấy nhầm là id khu vực "Quốc tế")` },
  { k: 'Cách check cache', v: 'Field code trong response: 1 = cache miss (đọc mới từ DB), 3 = cache hit — đã xác nhận ở cả 2 service' },
  { k: 'Bộ test tự động', v: 'tests/standard/2026-Q3-task-899-competition-service/01-compare-old-vs-new.spec.ts (151 test case) + 02-cache.spec.ts (8 test case B1-B8)' },
  { k: 'KẾT QUẢ CHÍNH THỨC (29/09/2026)', v: `Route: SAME ${count('SAME')} · DIFF ${count('DIFF')} · BUG ${count('BUG')} · ROUTE MỚI ${count('ROUTE MỚI')} · KHÔNG SO ĐƯỢC ${count('KHÔNG SO ĐƯỢC')} / ${ROUTES.length} route` },
  { k: 'BUG NGHIÊM TRỌNG CẦN BÁO DEV NGAY', v: '(1) Cache KHÔNG tách theo language (B3) — nguy cơ trả sai ngôn ngữ cho user. (2) Flapping 404 ngẫu nhiên trên route cơ bản (logo, unique-tournament base) — nghi vấn hạ tầng/pod. (3) top-players/overall/old chỉ trả 10/30 cầu thủ — thiếu data. (4) seasons thiếu hẳn field has_standing_prediction. (5) Go không set header Cache-Control — CDN/edge không cache được.' },
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

addSheet(wb, 'Bug cần báo dev', 'DANH SÁCH BUG XÁC NHẬN — CẦN BÁO DEV', [
  { header: 'Mức độ', key: 'sev', width: 12 }, { header: 'Subtask/TC', key: 'task', width: 14 },
  { header: 'Route / Khu vực', key: 'route', width: 45 },
  { header: 'Mô tả bug', key: 'note', width: 75 },
], [
  { sev: 'Cao', task: 'B3', route: 'Toàn bộ route có ?language=', note: 'Cache key KHÔNG tách theo language — gọi en rồi vi trả nhầm cache của en (code:3 thay vì 1). Tái lập 100% trên 2 giải test (EPL, Bundesliga). Nguy cơ user thấy sai ngôn ngữ.' },
  { sev: 'Cao', task: 'UTD-1139 / hạ tầng', route: 'competition/:id/logo, unique-tournament/:id (base)', note: 'Flapping 404 ngẫu nhiên không liên quan đến id hay logic — cùng URL lúc trả 302/200 ổn định nhiều lần, lúc trả 404 ổn định nhiều lần khác. Nghi vấn 1 pod/instance bị lỗi hoặc thiếu route, load balancer phân phối ngẫu nhiên. Cần dev kiểm tra health-check từng pod.' },
  { sev: 'Cao', task: 'UTD-1154', route: 'top-players/overall/old', note: 'Danh sách "rating" chỉ trả 10 cầu thủ ở Go, NestJS trả 30 — thiếu 20 cầu thủ, đúng trên cả 3 giải mẫu.' },
  { sev: 'Trung bình', task: 'UTD-1130', route: 'unique-tournament/:id/seasons', note: 'Field seasons[].has_standing_prediction bị thiếu hoàn toàn ở Go (không phải đổi tên) — nếu FE dùng field này để hiện icon dự đoán BXH sẽ mất tính năng.' },
  { sev: 'Trung bình', task: 'Chung', route: 'Mọi route', note: 'Go không bao giờ trả header Cache-Control (xác nhận null qua 15 lần gọi liên tiếp trên route ổn định) — NestJS luôn trả "public, max-age=3, s-maxage=3". CDN/edge cache phía trước không cache được response Go.' },
  { sev: 'Trung bình', task: 'UTD-1136', route: 'competitions', note: '49/2677 giải có cur_round/record_updated_at/cur_stage cũ hơn (trễ vài ngày) ở Go so với NestJS — nghi vấn pipeline đồng bộ data bị delay.' },
  { sev: 'Thấp', task: 'UTD-1137', route: 'competition/top-leagues', note: 'Cùng 11 giải nhưng thứ tự khác (Serie A/Bundesliga/Ligue 1 đảo vị trí) — cần xác nhận thứ tự đúng với dev/design.' },
  { sev: 'Thấp', task: 'UTD-1162', route: 'unique-tournament/:id/:season/transfers', note: 'Field transferFeeDescription đảo ngược format hiển thị tiền tệ: "€3.6M" (cũ) vs "3.6M €" (Go) — cùng giá trị, khác cách hiển thị.' },
  { sev: 'Thông tin', task: 'UTD-1133', route: 'related-competitions', note: 'Premier League: 1 giải liên quan lệch cur_round 8 vs 9 — cùng nguyên nhân data-sync-lag với UTD-1136, không phải bug riêng.' },
], 'sev');

fs.mkdirSync(OUT_DIR, { recursive: true });
await wb.xlsx.writeFile(OUT);
console.log('Đã xuất:', path.relative(process.cwd(), OUT), `(${ROUTES.length} route, ${COMPARE_CASES.length + CACHE_CASES.length} TC logic)`);
