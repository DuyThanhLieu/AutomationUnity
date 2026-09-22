/**
 * Xuất báo cáo TỔNG HỢP (Excel) cho US-4064 [API][Football][Match Detail -
 * Datalytics] Bổ sung dữ liệu — song song với bản text
 * results/REPORT_US4064_Datalytics_TongHop.md.
 *
 * KHÔNG phải test verify — chỉ generate tài liệu Excel tổng hợp kết quả đã
 * chạy ở 01-datalytics-api-formulas.spec.ts (92 trận, 1017 test) và
 * 00-export-test-cases.spec.ts (54 test case QA) để gửi báo cáo.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-4064-datalytics-data/02-export-summary-report.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-4064-datalytics-data';

const TOURNAMENTS: Array<{ region: string; tournament: string }> = [
  { region: 'Anh', tournament: 'Premier League' },
  { region: 'Anh', tournament: 'Championship' },
  { region: 'Anh', tournament: 'Carabao Cup' },
  { region: 'Tây Ban Nha', tournament: 'La Liga' },
  { region: 'Tây Ban Nha', tournament: 'La Liga 2' },
  { region: 'Ý', tournament: 'Serie A' },
  { region: 'Ý', tournament: 'Coppa Italia' },
  { region: 'Đức', tournament: 'Bundesliga' },
  { region: 'Đức', tournament: 'Bundesliga 2' },
  { region: 'Đức', tournament: 'DFB Pokal' },
  { region: 'Pháp', tournament: 'Ligue 1' },
  { region: 'Bỉ', tournament: 'Pro League' },
  { region: 'Hà Lan', tournament: 'Eredivisie' },
  { region: 'Đan Mạch', tournament: 'Superliga' },
  { region: 'Ba Lan', tournament: 'Ekstraklasa' },
  { region: 'Bồ Đào Nha', tournament: 'Primeira Liga' },
  { region: 'Ả Rập Xê Út', tournament: 'Saudi Professional League' },
  { region: 'Châu Âu (cup xuyên quốc gia)', tournament: 'UEFA Champions League' },
  { region: 'Châu Âu (cup xuyên quốc gia)', tournament: 'UEFA Super Cup' },
  { region: 'Mỹ', tournament: 'Major League Soccer' },
  { region: 'Argentina', tournament: 'Division 1' },
  { region: 'Colombia', tournament: 'Primera A' },
  { region: 'Ecuador', tournament: 'LigaPro A' },
  { region: 'Nam Mỹ (cup xuyên quốc gia)', tournament: 'Copa Libertadores' },
  { region: 'Nam Mỹ (cup xuyên quốc gia)', tournament: 'Copa Sudamericana' },
  { region: 'Hàn Quốc', tournament: 'K League 1' },
  { region: 'Châu Á (giải trẻ)', tournament: 'AFC U20 Asian Cup' },
  { region: 'Châu Á (giải trẻ)', tournament: 'AFC U20 Asian Cup Qualification' },
];

const REQUIREMENTS_RESULTS = [
  {
    id: 'YC1',
    title: 'Yêu cầu 1 — % "Đội ghi bàn trước" cho cả 2 đội',
    result: 'PASS 100% trên 92 trận',
    detail:
      'Field who_will_score_first.firstGoalScoredPercentage khớp đúng công thức x/seasonMatchesPlayed*100%, làm tròn số nguyên, tồn tại độc lập cho cả home và away.',
    status: 'Done',
  },
  {
    id: 'YC2a',
    title: 'Yêu cầu 2 — Công thức Bàn thắng (who_will_score_more)',
    result: 'PASS 100% trên 92 trận',
    detail:
      'Công thức (max-min)/min — khớp kể cả case cực đoan (220%, 775% ở giải trẻ chênh lệch phong độ lớn) và case 2 đội bằng nhau (better_side=null).',
    status: 'Done',
  },
  {
    id: 'YC2b',
    title: 'Yêu cầu 2 — Công thức Thủng lưới (who_will_concede_goals)',
    result: 'PASS 100% trên 92 trận — CẦN BA XÁC NHẬN',
    detail:
      'Công thức (max-min)/home_conceded_per_match — khớp đúng ảnh design gốc, KHÔNG phải bug. Nhưng % phụ thuộc vào ai đá sân nhà (đổi sân → % đổi dù phong độ không đổi). Xem OQ-01.',
    status: 'Cần BA xác nhận',
  },
  {
    id: 'YC2c',
    title: 'Yêu cầu 2 — Case % vượt 100%',
    result: 'Phát hiện qua API, CHƯA test tay UI',
    detail: 'better_percentage có thể vượt 100% ở case cực đoan. Đã thêm case DLY-50/51 để QA verify UI (progress bar) không vỡ layout.',
    status: 'Cần test tay UI',
  },
  {
    id: 'YC3',
    title: 'Yêu cầu 3 — Công thức làm tròn Average (mục 16.2 US-3585)',
    result: 'PASS 100%',
    detail: 'Rule ".5 luôn làm tròn LÊN", format tối đa 2 chữ số thập phân, case cộng ra số nguyên không hiển thị ".00".',
    status: 'Done',
  },
  {
    id: 'FS',
    title: 'Đối chiếu FootyStats.org (nguồn dữ liệu gốc)',
    result: 'Khớp 100% hầu hết field, lệch 1 điểm % ở Thủng lưới',
    detail: 'Trận Newcastle vs Bournemouth: Bàn thắng 59%=59% khớp; Thủng lưới UniScore=13% vs FootyStats=12% (rơi đúng mốc rounding 12.5%). Xem OQ-09.',
    status: 'Cần BA xác nhận',
  },
];

const OPEN_ITEMS = [
  {
    stt: 'OQ-01',
    noiDung: 'BA xác nhận công thức Thủng lưới (max-min)/home_conceded_per_match có phải chủ đích thiết kế (ưu tiên góc nhìn sân nhà) hay chưa lường tới khi vẽ ví dụ minh hoạ trong spec.',
    thamChieu: 'results/BUG_US4064_ThungLuoi_CongThuc_HomeAway.md',
    answer: '',
  },
  {
    stt: 'OQ-09',
    noiDung: 'BA xác nhận FootyStats.org có phải nguồn dữ liệu bắt buộc khớp 100%, hay chỉ là input thô để UniScore tự áp rule làm tròn riêng (không cần khớp tuyệt đối).',
    thamChieu: 'results/footystats-diff-newcastle-bournemouth.json',
    answer: '',
  },
  {
    stt: 'TODO-1',
    noiDung: 'Test tay UI thật trên staging cho case better_percentage vượt 100% — verify progress bar/câu nhận định không vỡ layout, không hiện NaN/Infinity.',
    thamChieu: 'DLY-50, DLY-51 trong TESTCASE_US4064_Datalytics_Data.xlsx',
    answer: '',
  },
  {
    stt: 'TODO-2',
    noiDung: 'Verify UI thật hiển thị đúng % "Đội ghi bàn trước" và câu nhận định Bàn thắng/Thủng lưới trên staging (hiện mới verify tầng API).',
    thamChieu: '—',
    answer: '',
  },
];

test.describe('[TASK-4064] Export báo cáo tổng hợp (Excel)', () => {
  test('Xuất REPORT_US4064_Datalytics_TongHop.xlsx', async () => {
    const overviewSheet: ExcelSheetSpec = {
      name: 'Tổng quan',
      columns: [
        { header: 'Mục', key: 'field', width: 32 },
        { header: 'Nội dung', key: 'value', width: 95 },
      ],
      rows: [
        { field: 'Task', value: 'US-4064 [API][Football][Match Detail - Datalytics] Bổ sung dữ liệu' },
        { field: 'Jira status', value: 'READY TO TEST' },
        { field: 'Endpoint test', value: 'GET https://opta-api.uniscore.vn/api/v2/football/datalytics/:matchId' },
        { field: 'Ngày báo cáo', value: '04/09/2026' },
        { field: 'Tổng số trận đã test', value: '92 trận' },
        { field: 'Tổng số test case tự động', value: '1017 test' },
        { field: 'Kết quả', value: '1017/1017 PASS' },
        { field: 'Số giải đấu khác nhau', value: `${TOURNAMENTS.length} giải` },
        { field: 'Số châu lục/khu vực phủ', value: '6 (Âu, Á, Bắc Mỹ, Nam Mỹ, Trung Đông, Đại Dương*)' },
        { field: 'Test case Excel (QA test tay)', value: '54 case' },
        { field: 'Câu hỏi mở còn treo', value: '2 (OQ-01, OQ-09)' },
        {
          field: 'Giới hạn cứng của API',
          value:
            'datalytics CHỈ trả data cho trận trong cửa sổ ~0-7 ngày tới. Trận quá khứ (đã thử 20 trận status_id=8) hoặc quá xa (>7 ngày, thử 417 trận chỉ 2/417 có data) đều trả null. 92 trận hiện tại đã gần chạm mức bao phủ tối đa khả thi trong tuần.',
        },
        { field: 'Trận nổi bật đã test', value: 'PSG vs Monaco, Inter Milan vs Napoli, Real Madrid vs Betis/Inter Milan, Man City, AS Roma vs Atalanta, Newcastle vs Bournemouth' },
      ],
      wrapText: true,
    };

    const tournamentsSheet: ExcelSheetSpec = {
      name: 'Danh sách giải đấu',
      columns: [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Khu vực', key: 'region', width: 32 },
        { header: 'Giải đấu', key: 'tournament', width: 40 },
      ],
      rows: TOURNAMENTS.map((t, i) => ({ stt: i + 1, region: t.region, tournament: t.tournament })),
    };

    const resultsSheet: ExcelSheetSpec = {
      name: 'Kết quả theo yêu cầu',
      columns: [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Yêu cầu', key: 'title', width: 45 },
        { header: 'Kết quả', key: 'result', width: 40 },
        { header: 'Chi tiết', key: 'detail', width: 75 },
        { header: 'Trạng thái', key: 'status', width: 20 },
      ],
      rows: REQUIREMENTS_RESULTS,
      wrapText: true,
    };

    const openItemsSheet: ExcelSheetSpec = {
      name: 'Việc còn tồn đọng',
      columns: [
        { header: 'STT', key: 'stt', width: 10 },
        { header: 'Nội dung cần xác nhận/xử lý', key: 'noiDung', width: 90 },
        { header: 'Tham chiếu', key: 'thamChieu', width: 50 },
        { header: 'Câu trả lời', key: 'answer', width: 40 },
      ],
      rows: OPEN_ITEMS,
      wrapText: true,
    };

    await saveExcelForSeason(SEASON_DIR, SLUG, 'REPORT_US4064_Datalytics_TongHop.xlsx', [
      overviewSheet,
      tournamentsSheet,
      resultsSheet,
      openItemsSheet,
    ]);
  });
});
