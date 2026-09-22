/**
 * US-900 — Xuất file Excel mô tả TEST LOGIC (phương pháp/cách suy luận đã
 * dùng để kết luận ai đúng ai sai) và TEST CASE (bước cụ thể để tự tay tái
 * hiện) cho 2 bug đã xác nhận ở 06-known-bugs.spec.ts.
 *
 * KHÔNG phải test verify — chỉ generate tài liệu Excel.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/07-export-test-logic-and-cases.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-900-player-honor-service';

test.describe('[US-900] Export Test Logic + Test Case (Excel)', () => {
  test('Xuất TESTLOGIC_US900_2Bugs.xlsx', async () => {
    const sheets: ExcelSheetSpec[] = [
      {
        name: 'Tổng quan',
        columns: [
          { header: 'Thông tin', key: 'k', width: 26 },
          { header: 'Nội dung', key: 'v', width: 90 },
        ],
        rows: [
          { k: 'Task', v: 'US-900 (Jira UTD-900) — [API][Football] Tách Player + Honor thành service riêng' },
          { k: 'Domain CŨ (NestJS legacy)', v: 'https://opta-api.uniscore.vn/' },
          { k: 'Domain MỚI (Go, đang test)', v: 'https://staging-player-svc.uniscore.vn/' },
          { k: 'Player mẫu', v: 'Corentin Tolisso (player_id=q69zrnleeejrah5), Lyon, Ligue 1, mùa 2025-2026' },
          { k: 'File test tương ứng', v: 'tests/standard/2026-Q3-task-900-player-honor-service/06-known-bugs.spec.ts' },
          {
            k: '⚠ TRẠNG THÁI MỚI NHẤT (retest 28/08/2026)',
            v: 'BUG-2 (xgOverall/goalsPrevented) ĐÃ ĐƯỢC DEV FIX — retest PASS 4/4 (Tolisso, Barcola, Chevalier, bản overall-v2). BUG-1 (tournament.id) KHÔNG cần sửa — lỗi ở domain CŨ, tự hết khi cutover sang Go. Các sheet dưới đây mô tả kết quả TẠI THỜI ĐIỂM PHÁT HIỆN BAN ĐẦU — dùng để hiểu phương pháp điều tra, không phản ánh trạng thái hiện tại của BUG-2.',
          },
          { k: 'Mục đích file này', v: 'Giải thích PHƯƠNG PHÁP suy luận (test logic) đã dùng để kết luận ai đúng/ai sai, và liệt kê CASE TEST cụ thể để người khác tự tay tái hiện, không chỉ đọc kết quả.' },
        ],
        wrapText: true,
      },
      {
        name: 'Test Logic',
        columns: [
          { header: 'Bug', key: 'bug', width: 12 },
          { header: 'Câu hỏi cần trả lời', key: 'cauHoi', width: 45 },
          { header: 'Phương pháp suy luận (Test Logic)', key: 'phuongPhap', width: 75 },
          { header: 'Vì sao phương pháp này đáng tin (không phải đoán)', key: 'lyDo', width: 75 },
          { header: 'Kết luận', key: 'ketLuan', width: 40 },
        ],
        rows: [
          {
            bug: 'BUG-1',
            cauHoi: 'Domain cũ và domain mới trả 2 tournament.id khác nhau cho CÙNG 1 trận đấu. Bên nào đúng?',
            phuongPhap:
              '1. Không tự suy đoán "cái nào trông hợp lý hơn".\n2. Lấy CẢ 2 ID, đem tra ĐỘC LẬP qua 1 endpoint thứ 3 chuyên dùng để resolve giải đấu: GET /unique-tournament/{id}.\n3. ID nào resolve ra được thông tin giải đấu đầy đủ (tên, quốc gia...) = ID đúng. ID nào trả về rỗng = ID sai/hỏng.',
            lyDo:
              'Đây là cách kiểm chứng bằng TRỌNG TÀI THỨ 3 độc lập, không dựa vào "domain nào tôi tin tưởng hơn". Endpoint /unique-tournament là nguồn sự thật khách quan duy nhất có thể xác nhận 1 ID giải đấu có tồn tại hợp lệ hay không, không thiên vị domain nào.',
            ketLuan: 'ID của domain MỚI (Go) resolve được → ĐÚNG.\nID của domain CŨ (NestJS) không resolve được → SAI (bug có sẵn từ trước ở domain cũ).',
          },
          {
            bug: 'BUG-2',
            cauHoi: 'Domain mới thiếu 2 field (xgOverall, goalsPrevented) so với domain cũ. Đây là do domain mới CHƯA CÓ dữ liệu (phải chờ), hay do LỖI CODE (bỏ sót, sửa nhanh được)?',
            phuongPhap:
              '1. Lấy giá trị domain cũ trả về (xgOverall=9.7174) làm "manh mối".\n2. Không đoán mò — truy vấn TRỰC TIẾP vào Postgres DB, tìm bảng chứa cột "xg"/"goals_prevented" theo player_id + season.\n3. Tìm thấy bảng xg_seasonal_player_stats, giá trị "xg" cho đúng player này = 9.7174 — khớp CHÍNH XÁC với giá trị domain cũ.',
            lyDo:
              'Nếu dữ liệu không tồn tại trong DB nguồn, sẽ không thể tìm thấy con số khớp chính xác đến 4 chữ số thập phân (9.7174) một cách ngẫu nhiên. Việc khớp tuyệt đối này chứng minh: dữ liệu ĐÃ SẴN SÀNG trong hệ thống, vấn đề chỉ nằm ở tầng code Go chưa đọc/map field đó ra response — không phải vấn đề "chưa có dữ liệu, phải chờ".',
            ketLuan: 'Dữ liệu có sẵn, đúng, trong DB. Domain mới (Go) chỉ thiếu bước lấy field này khi trả response. → Cần dev sửa code, KHÔNG cần chờ backfill/schema.',
          },
        ],
        wrapText: true,
      },
      {
        name: 'Test Case',
        columns: [
          { header: 'Case ID', key: 'caseId', width: 12 },
          { header: 'Tên case', key: 'ten', width: 40 },
          { header: 'Bước thực hiện', key: 'buoc', width: 75 },
          { header: 'Kết quả mong đợi', key: 'ketQuaMongDoi', width: 55 },
          { header: 'Kết quả thực tế', key: 'ketQuaThucTe', width: 55 },
          { header: 'Pass/Fail (theo test hiện tại)', key: 'passFail', width: 22 },
        ],
        rows: [
          {
            caseId: 'TC-01',
            ten: 'So sánh tournament.id giữa 2 domain cho cùng 1 trận',
            buoc:
              '1. Gọi GET https://opta-api.uniscore.vn/api/v2/football/player/q69zrnleeejrah5/events/last/1?language=en\n2. Gọi GET https://staging-player-svc.uniscore.vn/api/v2/football/player/q69zrnleeejrah5/events/last/1?language=en\n3. So sánh field data.events[0].tournament.id giữa 2 response',
            ketQuaMongDoi: 'tournament.id phải GIỐNG NHAU ở cả 2 domain (cùng 1 trận đấu thật)',
            ketQuaThucTe: 'Domain cũ trả "en5wdkxvdzx0u8a", domain mới trả "bm0nxitovzu9p9u" — KHÁC NHAU',
            passFail: 'FAIL (bug xác nhận)',
          },
          {
            caseId: 'TC-02',
            ten: 'Xác minh ID nào đúng bằng trọng tài độc lập (endpoint unique-tournament)',
            buoc:
              '1. Gọi GET https://opta-api.uniscore.vn/api/v2/football/unique-tournament/en5wdkxvdzx0u8a?language=en (ID của domain cũ)\n2. Gọi GET https://opta-api.uniscore.vn/api/v2/football/unique-tournament/bm0nxitovzu9p9u?language=en (ID của domain mới)',
            ketQuaMongDoi: 'Cả 2 đều phải resolve ra thông tin giải đấu hợp lệ (code=3, có tên giải)',
            ketQuaThucTe:
              'ID của domain cũ ("en5wdkxvdzx0u8a") → code=2, data rỗng (KHÔNG resolve được).\nID của domain mới ("bm0nxitovzu9p9u") → code=3, name="Ligue 1" (resolve đúng).',
            passFail: 'FAIL cho domain cũ / PASS cho domain mới',
          },
          {
            caseId: 'TC-03',
            ten: 'So sánh field xgOverall/goalsPrevented giữa 2 domain (statistics/overall)',
            buoc:
              '1. Gọi GET https://opta-api.uniscore.vn/api/v2/football/player/q69zrnleeejrah5/unique-tournament/bm0nxitovzu9p9u/season/2es0s3ko448ntnv/statistics/overall?language=en\n2. Gọi GET https://staging-player-svc.uniscore.vn/api/v2/football/player/q69zrnleeejrah5/unique-tournament/bm0nxitovzu9p9u/season/2es0s3ko448ntnv/statistics/overall?language=en\n3. So sánh field data.statistics.xgOverall và data.statistics.goalsPrevented',
            ketQuaMongDoi: 'Cả 2 field phải xuất hiện và có giá trị giống nhau ở cả 2 domain',
            ketQuaThucTe: 'Domain cũ: xgOverall=9.7174, goalsPrevented=0.\nDomain mới: xgOverall=undefined, goalsPrevented=undefined (THIẾU HẲN field).',
            passFail: 'FAIL (bug xác nhận)',
          },
          {
            caseId: 'TC-04',
            ten: 'Xác minh dữ liệu xG có tồn tại sẵn trong DB hay không (loại trừ khả năng "chưa có dữ liệu")',
            buoc:
              '1. Kết nối Postgres staging (<DB_STAGING_HOST>:5432, database "football", user readonly)\n2. Chạy: SELECT xg, goals_prevented FROM xg_seasonal_player_stats WHERE player_id=\'n54qllhxwegqvy9\' AND season_id=\'9dn1m1gh645moep\'',
            ketQuaMongDoi: 'Nếu domain mới thiếu field do "chưa có dữ liệu" → query này sẽ trả rỗng hoặc NULL',
            ketQuaThucTe: 'Query trả về xg=9.7174, goals_prevented=0.0000 — khớp CHÍNH XÁC với giá trị domain cũ. Dữ liệu CÓ SẴN.',
            passFail: 'Xác nhận: đây là lỗi CODE, không phải lỗi DATA',
          },
          {
            caseId: 'TC-05',
            ten: 'So sánh field xg_overall/goals_prevented giữa 2 domain (statistics/overall-v2, bản snake_case)',
            buoc:
              '1. Gọi GET .../statistics/overall-v2?language=en trên cả 2 domain (thay "overall" bằng "overall-v2" trong URL TC-03)\n2. So sánh field data.statistics.xg_overall và data.statistics.goals_prevented',
            ketQuaMongDoi: 'Cả 2 field phải xuất hiện và giống nhau ở cả 2 domain',
            ketQuaThucTe: 'Domain cũ: xg_overall=9.7174, goals_prevented=0.\nDomain mới: xg_overall=undefined, goals_prevented=undefined.',
            passFail: 'FAIL (cùng bug với TC-03, khác naming convention)',
          },
          {
            caseId: 'TC-06',
            ten: 'Mở rộng BUG-2 sang player KHÁC ĐỘI (Bradley Barcola, PSG) — kiểm tra bug có phải hệ thống không, hay chỉ riêng Tolisso',
            buoc:
              '1. Gọi GET .../player/5z3v0bln4dbhvu6/unique-tournament/bm0nxitovzu9p9u/season/2es0s3ko448ntnv/statistics/overall?language=en trên cả 2 domain\n2. So sánh xgOverall, goalsPrevented',
            ketQuaMongDoi: 'Nếu bug chỉ do dữ liệu riêng của Tolisso, Barcola phải KHÔNG bị lỗi',
            ketQuaThucTe: 'Domain cũ: xgOverall=11.3104, goalsPrevented=0.\nDomain mới: xgOverall=undefined, goalsPrevented=undefined — LẶP LẠI Y HỆT bug ở Tolisso.',
            passFail: 'FAIL — xác nhận bug mang tính HỆ THỐNG (lỗi ở code Go handler, không phải dữ liệu riêng của 1 player)',
          },
          {
            caseId: 'TC-07',
            ten: 'Case biên — thủ môn có goalsPrevented khác 0 (Lucas Chevalier, PSG) — loại trừ khả năng "0 mặc định che giấu bug"',
            buoc:
              '1. Gọi GET .../player/1ztvu6l91jswv9p/unique-tournament/bm0nxitovzu9p9u/season/2es0s3ko448ntnv/statistics/overall?language=en trên cả 2 domain\n2. So sánh xgOverall, goalsPrevented, goalsConceded (field liên quan để đối chiếu)',
            ketQuaMongDoi: 'goalsPrevented phải xuất hiện với giá trị số thập phân có ý nghĩa (không phải 0 mặc định)',
            ketQuaThucTe:
              'Domain cũ: xgOverall=0, goalsPrevented=0.4281 (số thập phân thật, không phải 0), goalsConceded=13.\nDomain mới: xgOverall=undefined, goalsPrevented=undefined, goalsConceded=13 (field KHÔNG liên quan xG vẫn đúng).',
            passFail: 'FAIL — bằng chứng MẠNH: goalsPrevented=0.4281 là số thật có ý nghĩa, chứng minh field bị THIẾU HẲN chứ không phải "trùng giá trị mặc định 0"',
          },
          {
            caseId: 'TC-08',
            ten: 'Mở rộng BUG-1 sang trận khác, giải khác (WC Qualification UEFA, Bradley Barcola)',
            buoc:
              '1. Gọi GET .../player/5z3v0bln4dbhvu6/events/last/1?language=en trên cả 2 domain\n2. Lấy tournament.id, thử resolve qua GET /unique-tournament/{id} như TC-02',
            ketQuaMongDoi: 'Nếu BUG-1 chỉ xảy ra ở Ligue 1 (giải của Tolisso), giải khác (World Cup Qualification) phải KHÔNG bị lỗi',
            ketQuaThucTe:
              'Domain cũ trả tournament.id="01fbjq6uxgx8yvs" → resolve ra RỖNG (code=2).\nDomain mới trả tournament.id="70asdo2npgu7tmm_4" → resolve ra ĐÚNG "WC qualification UEFA" (code=3, sau khi bỏ suffix "_4").\nCùng pattern lỗi như TC-01/TC-02, xảy ra ở giải HOÀN TOÀN KHÁC.',
            passFail: 'FAIL cho domain cũ / PASS cho domain mới — xác nhận BUG-1 cũng mang tính HỆ THỐNG, không riêng giải Ligue 1',
          },
        ],
        wrapText: true,
      },
      {
        name: 'Mẫu mở rộng (nhiều player)',
        columns: [
          { header: 'Player', key: 'player', width: 22 },
          { header: 'Đội', key: 'doi', width: 14 },
          { header: 'Bug kiểm tra', key: 'bug', width: 12 },
          { header: 'Domain CŨ', key: 'domainCu', width: 45 },
          { header: 'Domain MỚI', key: 'domainMoi', width: 45 },
          { header: 'Kết luận', key: 'ketLuan', width: 30 },
        ],
        rows: [
          { player: 'Corentin Tolisso', doi: 'Lyon', bug: 'BUG-1', domainCu: 'tournament.id="en5wdkxvdzx0u8a" (SAI, không resolve)', domainMoi: 'tournament.id="bm0nxitovzu9p9u" (ĐÚNG, resolve ra Ligue 1)', ketLuan: 'Lặp lại bug' },
          { player: 'Bradley Barcola', doi: 'PSG', bug: 'BUG-1', domainCu: 'tournament.id="01fbjq6uxgx8yvs" (SAI, không resolve)', domainMoi: 'tournament.id="70asdo2npgu7tmm_4" (ĐÚNG, resolve ra WC qualification UEFA)', ketLuan: 'Lặp lại bug — xác nhận mang tính hệ thống, không riêng 1 giải' },
          { player: 'Corentin Tolisso', doi: 'Lyon', bug: 'BUG-2', domainCu: 'xgOverall=9.7174, goalsPrevented=0', domainMoi: 'xgOverall=undefined, goalsPrevented=undefined', ketLuan: 'Lặp lại bug' },
          { player: 'Bradley Barcola', doi: 'PSG', bug: 'BUG-2', domainCu: 'xgOverall=11.3104, goalsPrevented=0', domainMoi: 'xgOverall=undefined, goalsPrevented=undefined', ketLuan: 'Lặp lại bug — xác nhận mang tính hệ thống, không riêng 1 player' },
          { player: 'Lucas Chevalier (thủ môn)', doi: 'PSG', bug: 'BUG-2', domainCu: 'xgOverall=0, goalsPrevented=0.4281 (số có ý nghĩa)', domainMoi: 'xgOverall=undefined, goalsPrevented=undefined', ketLuan: 'Bằng chứng mạnh nhất: 0.4281 chứng minh field bị THIẾU thật, không phải trùng giá trị mặc định 0' },
        ],
        wrapText: true,
      },
    ];

    await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTLOGIC_US900_2Bugs.xlsx', sheets);
  });
});
