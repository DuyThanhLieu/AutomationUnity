/**
 * US-900 — Xuất file Excel TEST LOGIC + TEST CASE cho TOÀN BỘ 19 endpoint
 * của task (không chỉ phần điều tra bug). Đây là tài liệu test tổng thể:
 * với MỖI endpoint, mô tả rõ phương pháp verify phù hợp với đặc thù dữ liệu
 * của nó, và case test cụ thể để tự tay tái hiện.
 *
 * Nguồn danh sách endpoint: 00-endpoints-registry.ts (19 dòng, đúng bảng
 * "Consolidated endpoint list" Jira UTD-900).
 * Kết quả thực tế: tổng hợp từ 01-04, 06 (baseline + đối chiếu Go vs NestJS).
 *
 * KHÔNG phải test verify — chỉ generate tài liệu Excel.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/08-export-full-task-logic-and-cases.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';
import { ENDPOINTS, ALIAS_ROUTES, SAMPLE_PLAYER_ID, SAMPLE_TOURNAMENT_ID, SAMPLE_SEASON_ID } from './00-endpoints-registry';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-900-player-honor-service';

const params = { playerId: SAMPLE_PLAYER_ID, tournamentId: SAMPLE_TOURNAMENT_ID, seasonId: SAMPLE_SEASON_ID };

/** Test Logic riêng cho từng nhóm endpoint — phương pháp verify phù hợp với đặc thù dữ liệu. */
type LogicRow = { nhom: string; dacDiemDuLieu: string; phuongPhap: string; lyDoChonCachNay: string };

const TEST_LOGIC_ROWS: LogicRow[] = [
  {
    nhom: 'Nhóm A — Thông tin tĩnh (info, summary, characteristics)',
    dacDiemDuLieu: 'Dữ liệu profile cầu thủ, gần như không đổi giữa các lần gọi (tên, đội, vị trí, chiều cao...)',
    phuongPhap: 'So sánh field "data" giữa Go và NestJS bằng stableStringify (so JSON không phụ thuộc thứ tự key) — kỳ vọng khớp 100% tuyệt đối.',
    lyDoChonCachNay: 'Vì dữ liệu tĩnh, không có lý do hợp lệ để 2 service trả khác nhau. Bất kỳ sai lệch nào ở nhóm này đều là bug thật, không cần retry.',
  },
  {
    nhom: 'Nhóm B — Danh hiệu/giải thưởng (honors, team-honors, individual-awards)',
    dacDiemDuLieu: 'Dữ liệu lịch sử (đã xảy ra), ít thay đổi nhưng có thể là mảng RỖNG với cầu thủ chưa có danh hiệu.',
    phuongPhap: '1. So sánh data giữa 2 service.\n2. Với route có HEAD twin: verify quy tắc HEAD=200 khi GET có data, HEAD=204 khi GET rỗng (data=null hoặc code=2) — verify chéo bằng 2 player khác nhau (1 có data, 1 không) để chứng minh quy tắc đúng cả 2 chiều.',
    lyDoChonCachNay: 'Nếu chỉ test 1 player luôn có data, sẽ không phát hiện được bug "HEAD luôn trả 200 bất kể GET rỗng hay không" — cần ít nhất 1 mẫu rỗng để bài test có ý nghĩa.',
  },
  {
    nhom: 'Nhóm C — Thống kê theo mùa giải (statistics/overall, overall-v2, stats/page, national/statistics)',
    dacDiemDuLieu: 'Dữ liệu tổng hợp nhiều field số (matches, goals, xG...), có 2 convention đặt tên song song (camelCase và snake_case).',
    phuongPhap: '1. So sánh TỪNG FIELD một, không chỉ so tổng thể — vì thiếu 1-2 field trong hàng chục field sẽ không lộ ra nếu chỉ check "response có OK không".\n2. Đối chiếu chéo giữa camelCase và snake_case (overall vs overall-v2) để xác nhận 2 endpoint cùng nguồn dữ liệu.\n3. Khi phát hiện field thiếu, truy vấn trực tiếp DB nguồn (Postgres) để phân biệt "thiếu do chưa có dữ liệu" hay "thiếu do lỗi code chưa map field".',
    lyDoChonCachNay: 'Endpoint nhiều field nhất, dễ xảy ra kiểu bug "thiếu sót 1 vài field" nhất — nếu chỉ assert "toHaveProperty(\'data\')" sẽ bỏ lọt hoàn toàn loại bug này (đã tự gặp: BUG-2 xgOverall/goalsPrevented).',
  },
  {
    nhom: 'Nhóm D — Trận đấu/sự kiện (events/last)',
    dacDiemDuLieu: 'Dữ liệu tham chiếu tới thực thể khác (giải đấu, đội bóng) qua ID — không chỉ số liệu đơn thuần.',
    phuongPhap: '1. So sánh field data giữa 2 service.\n2. Khi phát hiện 1 field-ID lệch nhau (vd tournament.id), KHÔNG dừng ở "khác nhau" — phải xác minh ĐỘC LẬP bằng cách đem từng ID đi resolve qua 1 endpoint khác (unique-tournament/{id}) để biết ID nào đúng, ID nào sai.',
    lyDoChonCachNay: 'Nếu chỉ dừng ở "2 service khác nhau" mà không xác minh ai đúng, sẽ không biết nên sửa domain nào — có thể vô tình đề xuất sửa nhầm domain ĐANG ĐÚNG (đã tự gặp: BUG-1, domain cũ mới là bên sai).',
  },
  {
    nhom: 'Nhóm E — Danh sách/phân trang (transfer-market, career-history dạng bảng)',
    dacDiemDuLieu: 'Dữ liệu dạng mảng/danh sách, có thể có tham số page/period/sort.',
    phuongPhap: 'Verify route trả đúng shape (mảng hoặc object chứa mảng), HTTP 200, có field "data". So sánh giữa 2 service với cùng tham số truyền vào.',
    lyDoChonCachNay: 'Với endpoint liệt kê, rủi ro chính là sai cấu trúc phân trang (thiếu "total", "page" không đúng) hơn là sai giá trị — nên ưu tiên verify shape trước, verify giá trị chi tiết sau nếu cần.',
  },
  {
    nhom: 'Nhóm F — Route legacy alias (không có "football/")',
    dacDiemDuLieu: '4 route trùng ý nghĩa với route canonical nhưng khác path, có traffic thật.',
    phuongPhap: 'Verify route alias trả CÙNG data với route canonical tương ứng, trên CÙNG 1 domain — không so giữa 2 domain ở bước này (mục đích khác: kiểm tra alias có hoạt động, không phải so Go vs NestJS).',
    lyDoChonCachNay: 'Alias route có thể chưa được implement ở domain mới (đúng theo thứ tự công việc Jira) — cần phân biệt rõ "alias chưa build" (không phải bug) với "alias build sai" (là bug) bằng cách kiểm tra status code trước khi so data.',
  },
];

test.describe('[US-900] Export Test Logic + Test Case cho TOÀN BỘ 19 endpoint', () => {
  test('Xuất TESTLOGIC_US900_FullTask.xlsx', async () => {
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
          { k: 'Player mẫu chính', v: 'Corentin Tolisso (player_id=q69zrnleeejrah5), Lyon, Ligue 1, mùa 2025-2026' },
          { k: 'Tổng số endpoint trong scope', v: '19 (theo bảng "Consolidated endpoint list", Jira UTD-900)' },
          { k: 'Tổng số alias route', v: '4 (route không có segment "football/", có traffic thật)' },
          { k: 'Mục đích file này', v: 'Tài liệu TEST LOGIC (phương pháp verify theo từng nhóm đặc thù dữ liệu) + TEST CASE (bước cụ thể cho từng endpoint trong scope) cho TOÀN BỘ task, không giới hạn ở phần điều tra bug.' },
        ],
        wrapText: true,
      },
      {
        name: 'Test Logic (theo nhóm)',
        columns: [
          { header: 'Nhóm endpoint', key: 'nhom', width: 45 },
          { header: 'Đặc điểm dữ liệu', key: 'dacDiemDuLieu', width: 55 },
          { header: 'Phương pháp verify (Test Logic)', key: 'phuongPhap', width: 75 },
          { header: 'Vì sao chọn cách này', key: 'lyDoChonCachNay', width: 65 },
        ],
        rows: TEST_LOGIC_ROWS,
        wrapText: true,
      },
      {
        name: 'Test Case — 19 endpoint',
        columns: [
          { header: '#', key: 'row', width: 6 },
          { header: 'req/24h', key: 'reqPerDay', width: 10 },
          { header: 'Method', key: 'method', width: 12 },
          { header: 'Endpoint', key: 'endpoint', width: 55 },
          { header: 'Task Jira', key: 'task', width: 16 },
          { header: 'Bước test (Test Case)', key: 'buoc', width: 60 },
          { header: 'Kết quả mong đợi', key: 'ketQuaMongDoi', width: 45 },
          { header: 'Kết quả thực tế (retest 28/08/2026, sau khi dev fix BUG-2)', key: 'ketQuaThucTe', width: 55 },
          { header: 'Ghi chú', key: 'ghiChu', width: 40 },
        ],
        rows: ENDPOINTS.map((ep) => {
          const path = ep.path(params);
          const headStep = ep.method === 'GET+HEAD' ? '\n3. Gọi HEAD cùng path, verify: GET có data → HEAD 200; GET rỗng → HEAD 204' : '';
          let ketQuaThucTe = 'PASS — 200, data khớp giữa Go staging và NestJS legacy';
          let ghiChu = ep.note ?? '';
          if (ep.row === 2) {
            ketQuaThucTe = 'FAIL (không cần sửa) — tournament.id khác nhau giữa 2 domain (xem BUG-1, sheet "2 Bug đã xác nhận")';
            ghiChu = 'Domain CŨ sai, domain MỚI đúng — không cần dev sửa, bug tự hết khi cutover';
          }
          if (ep.row === 12 || ep.row === 16) {
            ketQuaThucTe = '✅ PASS — đã fix (trước đó FAIL do thiếu xgOverall/goalsPrevented, xem BUG-2)';
            ghiChu = (ghiChu ? ghiChu + ' | ' : '') + 'Dev đã bổ sung map field, retest PASS 28/08/2026';
          }
          return {
            row: ep.row,
            reqPerDay: ep.reqPerDay,
            method: ep.method,
            endpoint: `GET ${path.split('?')[0]}`,
            task: ep.task,
            buoc: `1. Gọi GET https://staging-player-svc.uniscore.vn/api/v2/football${path}\n2. Gọi GET https://opta-api.uniscore.vn/api/v2/football${path} (baseline)\n3. So sánh field "data" giữa 2 response${headStep}`,
            ketQuaMongDoi: 'HTTP 200 ở cả 2 domain, field "data" khớp nhau (đối chiếu từng field con nếu là object nhiều field)',
            ketQuaThucTe,
            ghiChu,
          };
        }),
        wrapText: true,
      },
      {
        name: 'Test Case — 4 Alias route',
        columns: [
          { header: 'req/24h', key: 'reqPerDay', width: 10 },
          { header: 'Alias route', key: 'endpoint', width: 55 },
          { header: 'Canonical tương ứng (#)', key: 'canonicalRow', width: 20 },
          { header: 'Bước test', key: 'buoc', width: 60 },
          { header: 'Kết quả mong đợi', key: 'ketQuaMongDoi', width: 50 },
          { header: 'Kết quả thực tế', key: 'ketQuaThucTe', width: 45 },
        ],
        rows: ALIAS_ROUTES.map((alias) => ({
          reqPerDay: alias.reqPerDay,
          endpoint: `GET /api/v2${alias.path(params).split('?')[0]}`,
          canonicalRow: alias.canonicalRow,
          buoc: `1. Gọi GET https://staging-player-svc.uniscore.vn/api/v2${alias.path(params)}\n2. So sánh với endpoint canonical #${alias.canonicalRow} (có "football/") trên CÙNG domain`,
          ketQuaMongDoi: '200 + data khớp với canonical (khi alias layer đã được build)',
          ketQuaThucTe: 'HTTP 404 trên domain Go staging — CHƯA implement, đúng thứ tự công việc theo UTD-900 (alias build ở bước 5, sau P1-P3). KHÔNG PHẢI bug.',
        })),
        wrapText: true,
      },
      {
        name: '2 Bug đã xác nhận',
        columns: [
          { header: 'Bug', key: 'bug', width: 10 },
          { header: 'Trạng thái', key: 'trangThai', width: 20 },
          { header: 'Endpoint', key: 'endpoint', width: 40 },
          { header: 'Mô tả ngắn', key: 'moTa', width: 60 },
          { header: 'Ai sai', key: 'aiSai', width: 20 },
          { header: 'Hành động', key: 'hanhDong', width: 45 },
        ],
        rows: [
          {
            bug: 'BUG-1',
            trangThai: 'ĐÃ ĐÓNG — không sửa',
            endpoint: 'GET /player/:id/events/last/:page',
            moTa: 'tournament.id khác hệ ID hoàn toàn giữa 2 domain cho cùng 1 trận. Verify bằng /unique-tournament/{id}: ID domain cũ không resolve được (code=2), ID domain mới resolve đúng (code=3). Đã lặp lại ở 2 mẫu (Ligue 1 + World Cup Qualification).',
            aiSai: 'Domain CŨ (NestJS)',
            hanhDong: 'Không cần sửa code — đã báo dev OK. Cutover sang Go tự động sửa, domain cũ không cần đụng tới.',
          },
          {
            bug: 'BUG-2',
            trangThai: '✅ ĐÃ FIX — retest PASS 28/08/2026',
            endpoint: 'GET .../statistics/overall (+ -v2)',
            moTa: 'Domain mới thiếu field xgOverall/goalsPrevented (và bản snake_case). Đã tra Postgres bảng xg_seasonal_player_stats — dữ liệu có sẵn, đúng, khớp domain cũ. Đã lặp lại ở 3 mẫu (Tolisso, Barcola, thủ môn Chevalier với goalsPrevented=0.4281 — số có ý nghĩa, không phải 0 mặc định). Dev đã bổ sung map field, retest xác nhận cả 3 mẫu đều khớp 100%.',
            aiSai: 'Domain MỚI (Go) — đã sửa',
            hanhDong: 'Không còn hành động cần làm. Đã retest bằng npx playwright test 06-known-bugs.spec.ts — PASS 4/4 case liên quan BUG-2.',
          },
        ],
        wrapText: true,
      },
    ];

    await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTLOGIC_US900_FullTask.xlsx', sheets);
  });
});
