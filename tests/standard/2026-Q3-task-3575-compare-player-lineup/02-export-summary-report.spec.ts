/**
 * Xuất báo cáo TỔNG KẾT NGẮN GỌN (Excel, 1 sheet) cho US-3636 [API][Football]
 * [Match - Player Pop up] So sánh cầu thủ trước trận — song song với bản
 * text results/REPORT_US3636_TongKet.md.
 *
 * KHÁC với 01-export-api-report.spec.ts (báo cáo chi tiết 5 sheet): file
 * này chỉ tóm tắt kết luận chính + 7 điểm đã verify bằng data thật, dùng để
 * đọc lướt/gửi nhanh.
 *
 * KHÔNG phải test verify — chỉ generate tài liệu Excel.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3575-compare-player-lineup/02-export-summary-report.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3575-compare-player-lineup';

const VERIFIED_ITEMS = [
  {
    stt: 1,
    noiDung: 'Shooting Accuracy = (SoT/Shots)×100% — Alexander Isak',
    ketQua: '60% — khớp 100%',
    trangThai: 'PASS',
  },
  {
    stt: 2,
    noiDung: 'Shooting Accuracy = (SoT/Shots)×100% — Emersonn',
    ketQua: '66.67% — khớp 100%, đúng làm tròn 2 chữ số (BR01)',
    trangThai: 'PASS',
  },
  {
    stt: 3,
    noiDung: 'Save Success Rate = Saves/(Saves+Conceded)×100% — Alisson Becker',
    ketQua: '50% — khớp 100%',
    trangThai: 'PASS',
  },
  {
    stt: 4,
    noiDung: 'AC "tính H2H qua mọi đội cầu thủ từng khoác áo"',
    ketQua: 'Isak (Liverpool) vs Ipswich: cả 2 trận H2H diễn ra khi Isak còn ở Newcastle — vẫn được tính đúng',
    trangThai: 'PASS',
  },
  {
    stt: 5,
    noiDung: 'AC "chỉ tính trận đã ra sân, loại giao hữu"',
    ketQua: 'Cả 2 trận H2H có minutes_played>0, thuộc Premier League — khớp đúng',
    trangThai: 'PASS',
  },
  {
    stt: 6,
    noiDung: 'AC "top 5 rating đội B, sort cao→thấp"',
    ketQua: 'Trả đúng 5 người, sort giảm dần chính xác: 8.2→7.3→7.1→6.8→6.8',
    trangThai: 'PASS',
  },
  {
    stt: 7,
    noiDung: 'API tự đổi nhóm field theo vị trí (BR02) — FW/DEF/GK',
    ketQua: 'Đúng: attacking_stat (FW), defending_stat (DEF), goalkeeper_stat (GK)',
    trangThai: 'PASS',
  },
];

const OPEN_ITEM = {
  stt: 1,
  noiDung:
    'Cody Gakpo (vị trí MID) trả về attacking_stat (giống FW: shots, shot_accuracy, goals_per_match...), KHÔNG có passing_stat riêng (Total Passes, Pass Accuracy, Key Passes) như bảng spec liệt kê cho nhóm MID.',
  canXacNhan: 'Đây là thiết kế cố ý (chỉ chia 3 nhóm: Attacking cho FW+MID, Defending cho DEF, Goalkeeper cho GK), hay là thiếu sót cần bổ sung nhóm Passing riêng cho MID?',
  answer: '',
};

const REMAINING_TASKS = [
  { stt: 1, viec: 'Verify season.isFallback=true xảy ra đúng khi nào (cần cầu thủ tân binh/mới chuyển nhượng)' },
  { stt: 2, viec: 'Verify lineupSource đổi giá trị gì khi lineup đã confirmed' },
  { stt: 3, viec: 'Verify field tackles_won_rate bằng công thức (chưa thấy field tử số "Successful Tackles" riêng trong response)' },
  { stt: 4, viec: 'Viết automation chính thức (theo mẫu 01-datalytics-api-formulas.spec.ts của US-4064) — đã đủ điều kiện để bắt đầu' },
];

test.describe('[US-3636] Export báo cáo tổng kết ngắn gọn (Excel)', () => {
  test('Xuất REPORT_US3636_TongKet.xlsx', async () => {
    const overviewSheet: ExcelSheetSpec = {
      name: 'Tổng kết',
      columns: [
        { header: 'Mục', key: 'field', width: 30 },
        { header: 'Nội dung', key: 'value', width: 100 },
      ],
      rows: [
        { field: 'Task', value: 'US-3636 [API][Football][Match - Player Pop up] So sánh cầu thủ trước trận' },
        { field: 'Story cha', value: 'US-3575 [App|Web][Football][Lineup - Player Pop up] So sánh cầu thủ trước trận' },
        { field: 'Jira status', value: 'READY TO TEST' },
        { field: 'Ngày', value: '04/09/2026' },
        { field: 'Domain', value: 'opta-api.uniscore.vn/api/v2/football/player-compare' },
        {
          field: 'KẾT LUẬN CHÍNH',
          value:
            'API đã triển khai đầy đủ và đúng theo spec, cho cả US-01 (Player vs Player) và US-02 (Player vs Team). Đã verify bằng cấu trúc response lẫn số học thật trên dữ liệu Premier League — không phát hiện bug về công thức tính. Còn 1 điểm cần dev/BA xác nhận (không chắc là bug): cách phân nhóm chỉ số cho vị trí tiền vệ (MID).',
        },
        {
          field: '⚠️ Lưu ý',
          value:
            'Báo cáo đầu tiên trong ngày từng kết luận "task chưa triển khai" — kết luận đó SAI, do test nhầm domain API cũ. Đã rút lại và test lại đúng domain (/player-compare/event/...), kết quả trong file này là kết luận cuối cùng.',
        },
        {
          field: 'Lưu ý vận hành',
          value: 'Match ID phải đang pre-match thật tại thời điểm gọi — match ID cũ (dù vẫn còn cache ở API khác như datalytics) sẽ trả code:2/null ở cả 3 API player-compare.',
        },
        { field: 'Trận mẫu verify data thật', value: 'Ipswich Town vs Liverpool (5z3v0bl2l9mwvu6), Premier League' },
        { field: 'Số điểm đã verify PASS', value: '7/7' },
      ],
      wrapText: true,
    };

    const verifiedSheet: ExcelSheetSpec = {
      name: 'Đã verify bằng data thật',
      columns: [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Nội dung verify', key: 'noiDung', width: 60 },
        { header: 'Kết quả', key: 'ketQua', width: 75 },
        { header: 'Trạng thái', key: 'trangThai', width: 14 },
      ],
      rows: VERIFIED_ITEMS,
      wrapText: true,
    };

    const openItemSheet: ExcelSheetSpec = {
      name: 'Cần xác nhận',
      columns: [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Nội dung', key: 'noiDung', width: 70 },
        { header: 'Câu hỏi cần dev/BA xác nhận', key: 'canXacNhan', width: 70 },
        { header: 'Câu trả lời', key: 'answer', width: 40 },
      ],
      rows: [OPEN_ITEM],
      wrapText: true,
    };

    const remainingSheet: ExcelSheetSpec = {
      name: 'Việc còn lại',
      columns: [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Việc cần làm', key: 'viec', width: 100 },
      ],
      rows: REMAINING_TASKS,
      wrapText: true,
    };

    await saveExcelForSeason(SEASON_DIR, SLUG, 'REPORT_US3636_TongKet.xlsx', [
      overviewSheet,
      verifiedSheet,
      openItemSheet,
      remainingSheet,
    ]);
  });
});
