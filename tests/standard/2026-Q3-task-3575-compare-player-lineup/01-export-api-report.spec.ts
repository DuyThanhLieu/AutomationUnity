/**
 * Xuất báo cáo (Excel) cho US-3636 [API][Football][Match - Player Pop up]
 * So sánh cầu thủ trước trận — song song với bản text
 * results/REPORT_US3636_PlayerCompare_API.md.
 *
 * KHÔNG phải test verify — chỉ generate tài liệu Excel tổng hợp kết quả check
 * 3 API player-compare (players / player vs player / player vs team) đã
 * thực hiện thủ công ngày 04/09/2026.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3575-compare-player-lineup/01-export-api-report.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3575-compare-player-lineup';

const ENDPOINTS = [
  {
    id: 'API-1',
    endpoint: 'GET /player-compare/event/:eventId/players',
    mucDich: 'Lấy danh sách toàn bộ squad 2 đội để chọn Cầu thủ 1/2',
    ketQua: 'code:3 (OK) — trả đủ home/away, total=105/41 players, confirmed=false, lineupSource=squad_only',
    doiChieu:
      'confirmed=false khớp Business Rule "Chưa Confirm Lineup". total=105 xác nhận đúng AC "cho phép chọn toàn bộ squad", không giới hạn XI+dự bị (CMP-10).',
    conThieu: 'Chưa verify thứ tự sắp xếp mảng players có đúng ưu tiên vị trí→rating→market value không (CMP-43→46). Chưa thấy giá trị lineupSource khác "squad_only" (vd khi đã confirm).',
  },
  {
    id: 'API-2',
    endpoint: 'GET /player-compare/event/:eventId/player/:p1/vs/player/:p2',
    mucDich: 'So sánh 2 cầu thủ (US-01 Player vs Player)',
    ketQua: 'code:2 (OK) — mode=pre_match, compareType=player, có season.isFallback, field đã đặt tên đúng spec (shot_accuracy, goals_per_match, goals_outside_box...)',
    doiChieu:
      'season.isFallback chính là field phục vụ BR3 (fallback season). Tên field khớp đúng bảng spec (khác field thô ở API cũ /player/:id/statistics/overall-v2) — xác nhận BE đã build đúng tầng tính riêng cho player-compare.',
    conThieu:
      'Toàn bộ giá trị null ở mẫu test (V.League 1, cầu thủ dự bị) — cần cầu thủ giải lớn có data thật để verify công thức số học. Chưa thấy nhóm field passing_stat (MID)/defending_stat (DEF)/goalkeeping_stat (GK) vì mẫu test đều là FW.',
  },
  {
    id: 'API-3',
    endpoint: 'GET /player-compare/event/:eventId/player/:p/vs/team/:teamId',
    mucDich: 'So sánh cầu thủ với đội (US-02 Player vs Team)',
    ketQua: 'code:2 (OK) — có headToHead{matches,events}, shotMap[], topRatings.opponent[], playerStat, teamStat',
    doiChieu:
      'headToHead khớp AC "Case 1: Thành tích đối đầu". shotMap khớp AC "Shot maps". topRatings.opponent khớp AC "Rating trung bình player A vs top 5 rating đội B". playerStat/teamStat khớp "Case 2: So sánh thống kê mùa hiện tại".',
    conThieu:
      'matches=0 vì thật sự chưa từng đối đầu ở mẫu test — cần cặp có H2H thật để verify (a) chỉ tính trận đã ra sân, (b) loại trừ giao hữu, (c) đủ 7 chỉ số. teamStat.squadSize=0 dù đội có squad thật (41 players ở API 1) — cần xác nhận đây là do thiếu data hợp lệ hay bug.',
  },
];

const IMPORTANT_NOTES = [
  {
    stt: 1,
    noiDung:
      'RÚT LẠI kết luận báo cáo trước (REPORT_CompareLayer_API_Test.md): "task 3575 hầu như chưa triển khai" — SAI, do test nhầm domain API cũ (/player/:id/...) thay vì đúng domain /football/player-compare/event/... Sau khi test đúng domain, xác nhận API ĐÃ triển khai đầy đủ và đúng cấu trúc spec.',
  },
  {
    stt: 2,
    noiDung:
      'Match ID cũ (dùng lại từ task US-4064) đều trả code:2/null cho cả 3 API — vì các match đó không còn resolve được ở tầng match/event (event/relevant-matches và be/matches/attributes cũng trả code:2), dù datalytics vẫn giữ cache cũ. Bài học: PHẢI dùng match ID mới đang pre-match thật tại thời điểm test, không tái sử dụng ID cũ.',
  },
  {
    stt: 3,
    noiDung:
      'Match ID dùng để test thành công: ykcv4illvl21w5u (Dong Nai vs Viettel, V.League 1, pre-match thật ngày 04/09/2026).',
  },
];

const VERIFIED_WITH_REAL_DATA = [
  {
    id: 'V1',
    hangMuc: 'API tự động đổi nhóm field theo vị trí (BR02)',
    cauThuMau: 'Isak(F)→attacking_stat, Van Dijk(D)→defending_stat, Alisson(G)→goalkeeper_stat',
    ketQua: 'Đúng cho FW/DEF/GK. ❗ MID (Cody Gakpo) vẫn trả attacking_stat, KHÔNG có passing_stat riêng — cần dev/BA xác nhận đây là thiết kế hay thiếu sót.',
  },
  {
    id: 'V2',
    hangMuc: 'Công thức Shooting Accuracy = (Shots on Target/Total shots)×100%',
    cauThuMau: 'Alexander Isak: shots=5, sot=3',
    ketQua: 'Tính tay=60.0% | API trả=60 → KHỚP 100%',
  },
  {
    id: 'V3',
    hangMuc: 'Công thức Shooting Accuracy = (Shots on Target/Total shots)×100%',
    cauThuMau: 'Emersonn: shots=3, sot=2',
    ketQua: 'Tính tay=66.67% | API trả=66.67 → KHỚP 100% (đúng BR01 làm tròn 2 chữ số)',
  },
  {
    id: 'V4',
    hangMuc: 'Công thức Save Success Rate = Saves/(Saves+Conceded)×100%',
    cauThuMau: 'Alisson Becker: saves=4, goals_conceded=4',
    ketQua: 'Tính tay=50.0% | API trả=50 → KHỚP 100%',
  },
  {
    id: 'V5',
    hangMuc: 'US-02 AC: "Tính tất cả trận cầu thủ A thi đấu cho BẤT KỲ đội nào gặp đội B"',
    cauThuMau: 'Isak (hiện ở Liverpool) vs Ipswich Town',
    ketQua: 'headToHead.matches=2, CẢ 2 TRẬN diễn ra khi Isak còn ở Newcastle (không phải Liverpool) — vẫn được tính. KHỚP ĐÚNG AC (test case CMP-33), lần đầu verify bằng data thật.',
  },
  {
    id: 'V6',
    hangMuc: 'US-02 AC: "Chỉ tính trận cầu thủ đã ra sân" + "Chỉ tính official matches"',
    cauThuMau: 'Cùng 2 trận Isak vs Ipswich',
    ketQua: 'minutes_played=77 và 73 (đều >0). tournament=Premier League (không phải giao hữu). KHỚP ĐÚNG AC.',
  },
  {
    id: 'V7',
    hangMuc: 'US-02 AC: "Top 5 rating trung bình đội B, sort cao→thấp"',
    cauThuMau: 'topRatings.opponent (Ipswich Town)',
    ketQua: 'Trả đúng 5 cầu thủ, sort giảm dần chính xác: 8.2→7.3→7.1→6.8→6.8. KHỚP 100%.',
  },
];

const NEXT_STEPS = [
  { stt: 1, viec: '❗ Xác nhận với dev/BA: MID có nhóm field passing_stat riêng (Total Passes, Pass Accuracy, Key Passes theo spec) hay dùng chung attacking_stat với FW như đã quan sát ở Cody Gakpo?' },
  { stt: 2, viec: 'Tìm 1 trận có lineup đã confirmed=true để so sánh lineupSource đổi giá trị gì và thứ tự squad có đổi theo lineup thật không' },
  { stt: 3, viec: 'Verify field season.isFallback=true xảy ra đúng khi nào (cần cầu thủ mới chuyển nhượng/tân binh)' },
  { stt: 4, viec: 'Verify shotMap khi có data thật (mẫu Isak vs Ipswich trả rỗng dù headToHead.matches=2 — cần xác nhận vì sao, có phải do 2 trận đó Isak không có cú sút nào không)' },
  { stt: 5, viec: 'Verify field defending_stat.tackles_won_rate bằng công thức Successful Tackles/Total Tackles — cần tìm field "Successful Tackles" trong response (hiện chỉ thấy tackles=2, tackles_won_rate=50, chưa thấy field tử số riêng)' },
  { stt: 6, viec: 'Viết automation chính thức (giống 01-datalytics-api-formulas.spec.ts của US-4064) — đã có đủ mẫu dữ liệu thật và công thức verify được để bắt đầu' },
];

test.describe('[US-3636] Export báo cáo test API (Excel)', () => {
  test('Xuất REPORT_US3636_PlayerCompare_API.xlsx', async () => {
    const overviewSheet: ExcelSheetSpec = {
      name: 'Tổng quan',
      columns: [
        { header: 'Mục', key: 'field', width: 30 },
        { header: 'Nội dung', key: 'value', width: 95 },
      ],
      rows: [
        { field: 'Task', value: 'US-3636 [API][Football][Match - Player Pop up] So sánh cầu thủ trước trận' },
        { field: 'Story cha', value: 'US-3575 [App|Web][Football][Lineup - Player Pop up] So sánh cầu thủ trước trận' },
        { field: 'Jira status', value: 'READY TO TEST' },
        { field: 'Ngày test', value: '04/09/2026' },
        { field: 'Domain API đúng', value: 'https://opta-api.uniscore.vn/api/v2/football/player-compare/event/...' },
        { field: 'Trận mẫu verify data thật', value: 'Ipswich Town vs Liverpool (5z3v0bl2l9mwvu6), Premier League' },
        {
          field: 'Kết luận',
          value:
            'API đã triển khai đầy đủ và đúng cấu trúc theo spec. Đã VERIFY BẰNG SỐ HỌC THẬT: 3/3 công thức khớp 100% (Shooting Accuracy x2, Save Success Rate). Đã xác nhận đúng AC quan trọng nhất US-02 (tính H2H qua mọi đội đã khoác áo, top-5 rating sort đúng). Còn 1 điểm cần dev/BA làm rõ: nhóm field cho vị trí MID.',
        },
      ],
      wrapText: true,
    };

    const endpointsSheet: ExcelSheetSpec = {
      name: 'Kết quả 3 API',
      columns: [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Endpoint', key: 'endpoint', width: 55 },
        { header: 'Mục đích', key: 'mucDich', width: 40 },
        { header: 'Kết quả', key: 'ketQua', width: 60 },
        { header: 'Đối chiếu spec', key: 'doiChieu', width: 65 },
        { header: 'Còn thiếu / cần verify thêm', key: 'conThieu', width: 65 },
      ],
      rows: ENDPOINTS,
      wrapText: true,
    };

    const notesSheet: ExcelSheetSpec = {
      name: 'Ghi chú quan trọng',
      columns: [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Nội dung', key: 'noiDung', width: 110 },
      ],
      rows: IMPORTANT_NOTES,
      wrapText: true,
    };

    const verifiedSheet: ExcelSheetSpec = {
      name: 'Verify bằng data thật',
      columns: [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Hạng mục', key: 'hangMuc', width: 50 },
        { header: 'Cầu thủ mẫu / dữ liệu', key: 'cauThuMau', width: 45 },
        { header: 'Kết quả', key: 'ketQua', width: 90 },
      ],
      rows: VERIFIED_WITH_REAL_DATA,
      wrapText: true,
    };

    const nextStepsSheet: ExcelSheetSpec = {
      name: 'Việc cần làm tiếp',
      columns: [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Việc cần làm', key: 'viec', width: 100 },
      ],
      rows: NEXT_STEPS,
      wrapText: true,
    };

    await saveExcelForSeason(SEASON_DIR, SLUG, 'REPORT_US3636_PlayerCompare_API.xlsx', [
      overviewSheet,
      endpointsSheet,
      verifiedSheet,
      notesSheet,
      nextStepsSheet,
    ]);
  });
});
