/**
 * Xuất file Excel test case cho feature "Player xG" (Team Details → tab Stats,
 * khối hiển thị thực tế trên UI: "Expected goals (xG)").
 *
 * KHÔNG phải test verify — chỉ generate tài liệu test case (Excel) từ danh
 * sách case đã soạn theo User Story + đối chiếu thực tế trên staging.
 *
 * Mẫu đã verify trên staging (2026-08-27):
 *   FE: https://staging.uniscore.vn/en/football/competitor/lyon/1z88sr5oo8ontsd#stats
 *       (filter Ligue 1, mùa 2026-2027)
 *   API: GET https://opta-api.uniscore.vn/api/v2/football/team/1z88sr5oo8ontsd/
 *        unique-tournaments/bm0nxitovzu9p9u/seasons/o8tzjglug90s006/stats?language=en
 *   Top 3 FE (Boudache 0/0.61, Fofana 1/0.28, Nartey 1/0.11) khớp đúng thứ tự
 *   /Goals/xG (làm tròn 2 chữ số) với API `top_xg_players`.
 *
 * API trả sẵn field `xg_match_coverage` (vd "1/1") cho từng player nhưng FE
 * không hiển thị — đã xác nhận với PO đây KHÔNG tính là bug ở bản hiện tại,
 * ghi nhận làm câu hỏi mở (xem sheet "Câu hỏi mở") thay vì test case FAIL.
 *
 * PHÁT HIỆN (mẫu lớn hơn — Lyon Ligue 1 mùa 2025-2026, season_id=2es0s3ko448ntnv,
 * 34 trận, 29 player, xem PXG-18): tổng xG đội (48.5726) khớp tuyệt đối với
 * tổng cộng dồn xG của 29 player (chênh lệch 0.0) — tính toán nhất quán. NHƯNG
 * mẫu số của xg_match_coverage LUÔN = 34 (tổng trận ĐỘI) cho toàn bộ 29/29
 * player, kể cả player có tử số rất thấp (vd "1/34") — nghi ngờ mẫu số đang
 * lấy nhầm tổng trận đội thay vì tổng trận CẦU THỦ tham gia như AC mô tả
 * ("8/12 trận" với 12 = số trận cầu thủ đó thi đấu). Xem sheet "Player xG
 * sample — 2025-2026 (29 players)" trong Excel để có bằng chứng dữ liệu thô.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-player-xg/team-details-player-xg/00-export-test-cases.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-player-xg-team-details-player-xg';

type TestCaseRow = {
  id: string;
  category: string;
  title: string;
  precondition: string;
  steps: string;
  expected: string;
  priority: 'High' | 'Medium' | 'Low';
};

const TEST_CASES: TestCaseRow[] = [
  // ---- A. Hiển thị khối Player xG (cơ bản) ----
  {
    id: 'PXG-01',
    category: 'A. Hiển thị cơ bản',
    title: 'Khối Player xG (hiển thị tên "Expected goals (xG)") xuất hiện trong tab Stats',
    precondition: 'Đội có ít nhất 1 cầu thủ có dữ liệu xG hợp lệ trong giải/mùa đang chọn',
    steps: '1. Vào Team Details của 1 đội\n2. Chọn tab Stats\n3. Quan sát toàn bộ layout tab',
    expected:
      'Khối "Expected goals (xG)" xuất hiện trong tab Stats. Đã verify thực tế trên staging (Lyon, Ligue 1 2026-2027): khối nằm ở cột phải, dưới "Cards" — layout 2 cột (trái: Summary/Attacking..., phải: Defending/Cards/xG), không phải cuối trang tuyệt đối như câu chữ spec "cuối cùng của tab" gợi ý. Không coi khác biệt tên gọi/vị trí cột này là bug.',
    priority: 'High',
  },
  {
    id: 'PXG-02',
    category: 'A. Hiển thị cơ bản',
    title: 'Top 3 cầu thủ, sắp xếp giảm dần theo xG',
    precondition: 'Đội có ≥ 3 cầu thủ có dữ liệu xG trong giải/mùa đang chọn',
    steps: '1. Xem khối Player xG',
    expected:
      'Hiển thị đúng 3 player item. xG item 1 ≥ xG item 2 ≥ xG item 3 (giảm dần). Đã verify trên staging: Boudache 0.61 ≥ Fofana 0.28 ≥ Nartey 0.11 — khớp API top_xg_players.',
    priority: 'High',
  },
  {
    id: 'PXG-03',
    category: 'A. Hiển thị cơ bản',
    title: 'Nội dung mỗi player item đầy đủ trường',
    precondition: 'Khối Player xG đã hiển thị',
    steps: '1. Xem từng player item trong Top 3',
    expected:
      'Mỗi item có đủ: số thứ tự, avatar, tên cầu thủ, số bàn thắng (Goals), tổng xG. Đã verify thực tế trên staging: UI hiện KHÔNG hiển thị số trận "x/y trận" như câu chữ AC — theo xác nhận, đây KHÔNG tính là bug, chỉ ghi nhận khác biệt so với mô tả spec ban đầu.',
    priority: 'High',
  },
  {
    id: 'PXG-04',
    category: 'A. Hiển thị cơ bản',
    title: 'Avatar default khi cầu thủ chưa có avatar',
    precondition: 'Có cầu thủ lọt Top 3 (hoặc trong View More) chưa có avatar',
    steps: '1. Xem player item của cầu thủ chưa có avatar',
    expected: 'Hiển thị avatar mặc định (placeholder), không vỡ layout, không icon lỗi (broken image)',
    priority: 'Medium',
  },

  // ---- B. Logic tính xG ----
  {
    id: 'PXG-05',
    category: 'B. Logic tính xG',
    title: 'Chỉ tính xG các trận có Opta coverage level 13 hoặc 15',
    precondition: 'Cầu thủ có cả trận coverage 13/15 lẫn trận coverage khác (hoặc không có Opta data) trong cùng giải/mùa',
    steps:
      '1. UI hiện không hiển thị "x/y trận" (xem PXG-03) nên không đối chiếu trực tiếp trên màn hình được\n2. Verify qua API: GET .../stats (Lyon, Ligue 1, mùa 2025-2026, season_id=2es0s3ko448ntnv) trả field xg_match_coverage cho từng player trong top_xg_players — mẫu 34 trận, 29 player, coverage dao động 1/34 → 29/34\n3. Đối chiếu tổng xG hiển thị (data.xg=48.5726) với tổng cộng dồn xg của 29 player (=48.5726, chênh lệch 0.0) — khớp tuyệt đối, xác nhận backend tính nhất quán nội bộ',
    expected: 'Tổng xG đội = tổng xG cộng dồn từng player (đã verify khớp 100%, chênh lệch 0.0). Không verify được trực tiếp "chỉ tính trận coverage 13/15" vì không có nguồn tra coverage level độc lập ngoài field xg_match_coverage của chính API này (xem PXG-18 về nghi vấn ý nghĩa mẫu số)',
    priority: 'High',
  },
  {
    id: 'PXG-18',
    category: 'B. Logic tính xG',
    title: '[✅ CLOSED — không phải bug] Mẫu số xg_match_coverage — QA từng báo sai 2 lần do đối chiếu nhầm bảng nguồn, dev đã fix đúng',
    precondition: 'Lyon + PSG, Ligue 1, mùa 2025-2026 (season_id nội bộ đúng=9dn1m1gh645moep). Xác nhận cuối 27/08/2026 sau khi dev Evan chỉ ra nguồn đối chiếu đúng.',
    steps:
      '1. Gọi API GET /football/team/{teamId}/unique-tournaments/bm0nxitovzu9p9u/seasons/2es0s3ko448ntnv/stats?language=en, lấy xg_match_coverage của toàn bộ player\n2. Query ĐÚNG nguồn: SELECT matches FROM seasonal_statistics_players WHERE player_id=<thesport_id> AND competitor_id=<team_id đúng> AND season_id=\'9dn1m1gh645moep\' — KHÔNG dùng opta_seasonal_stat_players (khác hệ ID/season) hay xg_match_player_stats (chỉ có dòng khi cầu thủ có sút, không đại diện đủ)\n3. Đối chiếu mẫu số API với kết quả query trên',
    expected:
      'Lịch sử: LẦN 1 phát hiện ban đầu — mẫu số hard-code = tổng trận đội (bug thật, đã báo dev). LẦN 2 sau fix — QA tự báo "vẫn sai 18/28" nhưng SAI do dùng nhầm opta_seasonal_stat_players (khác season_id nội bộ với season đang xem). LẦN 3 (cuối cùng) — dùng đúng bảng seasonal_statistics_players do dev chỉ ra: verify LYON 29/29 khớp 100%, verify thêm PSG 24/25 khớp 100% (1 not-found do khác cách viết tên, không phải bug). Tổng 53/54 cầu thủ 2 đội khớp tuyệt đối. KẾT LUẬN: bug đã fix đúng, CLOSED. Ghi nhớ cho lần verify sau: seasonal_statistics_players là nguồn chuẩn (ground truth) cho "số trận cầu thủ đã tham gia", không phải bảng Opta.',
    priority: 'Low',
  },
  {
    id: 'PXG-06',
    category: 'B. Logic tính xG',
    title: 'Trận không có Opta data KHÔNG được tính vào tổng xG',
    precondition: 'Cầu thủ có ít nhất 1 trận không đủ dữ liệu Opta (coverage khác 13/15) trong giải/mùa',
    steps: '1. So sánh tổng xG hiển thị (FE + API field "xg") với tổng xG tính thủ công chỉ từ các trận coverage 13/15 (query DB/API xg_match_stats)',
    expected: 'Tổng xG hiển thị KHÔNG bao gồm đóng góp từ trận thiếu Opta data. Sai lệch = 0 (sai số làm tròn ±0.05)',
    priority: 'High',
  },
  {
    id: 'PXG-07',
    category: 'B. Logic tính xG',
    title: 'Đối chiếu định dạng hiển thị thực tế trên UI',
    precondition: 'Đã có màn hình staging thật (Lyon, Ligue 1 2026-2027)',
    steps: '1. Xem hiển thị xG của từng player item',
    expected:
      'Thực tế trên staging hiển thị dạng: tên cầu thủ, dòng phụ "Goals: N", và số xG riêng biệt bên phải (ví dụ "Kail Boudache — Goals: 0 — 0.61"), KHÔNG theo đúng cú pháp 1 dòng "xG: 4.2 – 8/12 trận" như ví dụ minh hoạ trong spec. Không tính là bug (đã xác nhận với PO) — ghi nhận để cập nhật lại tài liệu spec/example cho khớp UI thật.',
    priority: 'Medium',
  },

  // ---- C. Filter theo giải đấu / mùa giải ----
  {
    id: 'PXG-08',
    category: 'C. Filter',
    title: 'Đổi Tournament filter → Player xG tính lại',
    precondition: 'Đội tham gia ≥ 2 giải đấu khác nhau, có dữ liệu Opta ở cả 2 giải',
    steps: '1. Ghi nhận Top 3 + số liệu ở giải A\n2. Đổi Tournament filter sang giải B\n3. Ghi nhận lại Top 3 + số liệu',
    expected: 'Danh sách Top 3, Goals, xG đều cập nhật đúng theo giải B, không giữ dữ liệu/cache giải A',
    priority: 'High',
  },
  {
    id: 'PXG-09',
    category: 'C. Filter',
    title: 'Đổi Season filter → Player xG tính lại',
    precondition: 'Đội có dữ liệu ở ≥ 2 mùa giải',
    steps: '1. Ghi nhận Top 3 + số liệu ở mùa A\n2. Đổi Season filter sang mùa B\n3. Ghi nhận lại Top 3 + số liệu',
    expected: 'Dữ liệu Player xG cập nhật đúng theo mùa giải mới chọn',
    priority: 'High',
  },
  {
    id: 'PXG-10',
    category: 'C. Filter',
    title: 'Đổi filter sang giải/mùa không có dữ liệu xG',
    precondition: 'Tìm giải/mùa mà đội không có cầu thủ nào đủ điều kiện tính xG (không có trận coverage 13/15)',
    steps: '1. Chọn filter đó',
    expected:
      'Khối Player xG không hiển thị player item giả/rỗng gây hiểu nhầm. [CẦN CONFIRM DEV/PO: ẩn toàn bộ khối hay hiển thị empty state — spec chưa nêu rõ]',
    priority: 'Medium',
  },

  // ---- D. Đội có ít hơn 3 cầu thủ có dữ liệu ----
  {
    id: 'PXG-11',
    category: 'D. Ít hơn 3 cầu thủ',
    title: 'Đội chỉ có 1–2 cầu thủ có dữ liệu xG',
    precondition: 'Tìm đội/giải/mùa mà chỉ có 1 hoặc 2 cầu thủ đủ điều kiện tính xG',
    steps: '1. Xem khối Player xG',
    expected: 'Chỉ hiển thị đúng số cầu thủ có dữ liệu thật (1 hoặc 2 item). KHÔNG tạo player item giả để đủ 3 slot',
    priority: 'High',
  },
  {
    id: 'PXG-12',
    category: 'D. Ít hơn 3 cầu thủ',
    title: 'Đội không có cầu thủ nào có dữ liệu xG',
    precondition: 'Đội/giải/mùa không có bất kỳ cầu thủ nào đủ điều kiện (0 trận coverage 13/15)',
    steps: '1. Xem tab Stats',
    expected: 'Khối Player xG không hiển thị player item nào. [CẦN CONFIRM DEV/PO: hành vi hiển thị khối rỗng]',
    priority: 'Medium',
  },

  // ---- E. Nút View More ----
  {
    id: 'PXG-13',
    category: 'E. View More',
    title: 'Cơ chế "View More" hiển thị khi có > 3 cầu thủ đủ điều kiện',
    precondition: 'Đội có > 3 cầu thủ có dữ liệu xG trong giải/mùa đang chọn',
    steps: '1. Xem khối "Expected goals (xG)"\n2. Quan sát icon chevron ">" ở góc phải tiêu đề khối',
    expected:
      'Đã quan sát trên staging (Lyon): có icon chevron ">" cạnh tiêu đề "Expected goals (xG)" — NGHI NGỜ đây là cơ chế "View More" thay vì nút text riêng như spec mô tả, CẦN xác nhận bằng cách click thật (chưa thực hiện được do thiếu browser tool tại thời điểm viết case này)',
    priority: 'High',
  },
  {
    id: 'PXG-14',
    category: 'E. View More',
    title: 'Nút/chevron View More KHÔNG hiển thị khi ≤ 3 cầu thủ',
    precondition: 'Đội có ≤ 3 cầu thủ có dữ liệu xG',
    steps: '1. Xem khối Player xG',
    expected: 'Không có chevron/nút View More. [CẦN CONFIRM: ẩn hẳn hay disable]',
    priority: 'Medium',
  },
  {
    id: 'PXG-15',
    category: 'E. View More',
    title: 'Click View More → hiển thị đầy đủ danh sách, đúng thứ tự',
    precondition: 'Đội có > 3 cầu thủ đủ điều kiện',
    steps: '1. Click chevron/nút "View More"',
    expected:
      'Hiển thị toàn bộ cầu thủ có dữ liệu xG trong giải/mùa đang filter (không chỉ 3, ví dụ API mẫu Lyon trả 10 player trong top_xg_players). Sắp xếp giảm dần theo xG, nhất quán với Top 3 (item 4 có xG ≤ item 3). Vẫn áp dụng đúng logic tính xG (chỉ tính trận coverage 13/15)',
    priority: 'High',
  },
  {
    id: 'PXG-16',
    category: 'E. View More',
    title: 'Danh sách đầy đủ vẫn tuân theo Tournament/Season filter đang chọn',
    precondition: 'Đã mở View More ở 1 giải/mùa',
    steps: '1. Đóng danh sách đầy đủ (nếu có)\n2. Đổi Tournament/Season filter\n3. Mở lại View More',
    expected: 'Danh sách đầy đủ cập nhật lại theo filter mới, không còn dữ liệu của filter cũ',
    priority: 'Medium',
  },

  // ---- F. Business rule — Backfill ----
  {
    id: 'PXG-17',
    category: 'F. Backfill data',
    title: 'Backfill dữ liệu Opta coverage 13/15 từ 08/2025 đến hiện tại',
    precondition: 'Cần xác nhận với dev/data team phạm vi backfill đã chạy xong',
    steps:
      '1. Query DB các trận từ 08/2025 đến hiện tại có coverage level 13 hoặc 15\n2. Kiểm tra các trận đó đã có dữ liệu xg_match_stats tương ứng chưa (sample nhiều giải)',
    expected: 'Các trận trong khoảng thời gian trên, nếu đủ điều kiện coverage 13/15, phải có dữ liệu xG khả dụng — không bị thiếu do backfill chưa chạy',
    priority: 'High',
  },

  // ---- G. Case mở rộng — dùng mẫu thật đã xác định sẵn để QA test tay ngay ----
  {
    id: 'PXG-19',
    category: 'E. View More',
    title: 'Xác nhận chevron ">" cạnh "Expected goals (xG)" mở đúng danh sách View More (không phải màn hình khác)',
    precondition: 'Vào https://staging.uniscore.vn/en/football/competitor/lyon/1z88sr5oo8ontsd#stats, đổi filter Season sang 2025-2026 (29 cầu thủ đủ điều kiện — chắc chắn > 3, chevron phải xuất hiện)',
    steps: '1. Click vào icon chevron ">" ở góc phải tiêu đề "Expected goals (xG)"\n2. Quan sát điều xảy ra: mở rộng danh sách tại chỗ, mở modal, hay điều hướng sang trang/URL khác',
    expected:
      'Ghi lại chính xác hành vi: (a) nếu mở danh sách đầy đủ tại chỗ hoặc modal — coi là "View More" hợp lệ, tiếp tục verify PXG-15/16/20/21 bên dưới; (b) nếu điều hướng sang trang khác không liên quan (vd trang Player chung của đội) — đây là GAP so với AC (yêu cầu "View More" phải hiển thị đầy đủ danh sách xG, không phải trang khác), cần báo dev.',
    priority: 'High',
  },
  {
    id: 'PXG-20',
    category: 'E. View More',
    title: 'Danh sách View More đầy đủ — đối chiếu đúng 29 cầu thủ với API',
    precondition: 'Đã mở được View More ở PXG-19, filter đang là Lyon/Ligue 1/2025-2026',
    steps:
      '1. Đếm tổng số player item hiển thị trong danh sách View More\n2. So với API: GET https://opta-api.uniscore.vn/api/v2/football/team/1z88sr5oo8ontsd/unique-tournaments/bm0nxitovzu9p9u/seasons/2es0s3ko448ntnv/stats?language=en — đếm số phần tử trong data.top_xg_players (đã biết = 29)',
    expected: 'Số player item trên UI = 29 (khớp API). Nếu UI hiển thị ít hơn 29 (vd chỉ trả top N cố định, không phải toàn đội) — đây là GAP so với AC "hiển thị toàn bộ danh sách cầu thủ của đội".',
    priority: 'High',
  },
  {
    id: 'PXG-21',
    category: 'E. View More',
    title: 'Danh sách View More sắp xếp đúng thứ tự xG giảm dần, khớp thứ tự API',
    precondition: 'Đã mở được View More, filter Lyon/Ligue 1/2025-2026',
    steps: '1. Ghi lại thứ tự tên 5 player đầu và 5 player cuối trong danh sách View More\n2. So với thứ tự API top_xg_players (đã biết: #1 Tolisso 9.7174 → #29 Dominik Greif 0)',
    expected: '5 player đầu UI = Tolisso, Šulc, Endrick, Afonso Moreira, Yaremchuk (đúng thứ tự). 5 player cuối UI = ...Kumbedi, Descamps, Greif (đúng thứ tự). Không bị đảo ngược hay random.',
    priority: 'Medium',
  },
  {
    id: 'PXG-22',
    category: 'D. Ít hơn 3 cầu thủ',
    title: 'Tìm đội/giải thực tế có <3 cầu thủ đủ điều kiện xG để verify PXG-11',
    precondition: 'Cần 1 đội mẫu cụ thể — gợi ý: thử các giải nhỏ/giải trẻ (national U17, giải hạng thấp) nơi ít trận có Opta coverage 13/15. Chưa xác định được mẫu cụ thể tại thời điểm viết case này.',
    steps: '1. Tìm 1 đội ở giải nhỏ trên staging, vào tab Stats\n2. Nếu khối "Expected goals (xG)" xuất hiện với <3 item — dùng làm mẫu chính thức, ghi lại URL để tái sử dụng cho regression sau',
    expected: 'Chỉ hiển thị đúng số cầu thủ có dữ liệu thật (1 hoặc 2 item), không có item giả/placeholder. Ghi lại URL mẫu tìm được vào ghi chú test case này để lần sau không phải tìm lại.',
    priority: 'Medium',
  },
  {
    id: 'PXG-23',
    category: 'D. Ít hơn 3 cầu thủ',
    title: 'Tìm đội/giải thực tế có 0 cầu thủ đủ điều kiện xG để verify PXG-12',
    precondition: 'Tương tự PXG-22 — cần đội/giải mẫu không có trận nào đạt Opta coverage 13/15. Gợi ý thử giải vừa bắt đầu mùa mới (như Lyon Ligue 1 2026-2027 lúc mùa mới khởi tranh, trước khi có trận nào — khác với hiện tại đã có 1 trận).',
    steps: '1. Tìm đội/giải mẫu\n2. Vào tab Stats, quan sát khối "Expected goals (xG)"',
    expected: 'Ghi lại chính xác hành vi thật: ẩn hẳn khối, hay hiện khối với trạng thái rỗng/empty state. Đối chiếu với câu hỏi mở #1 — dùng kết quả thật này để chốt lại câu hỏi đó thay vì để ngỏ.',
    priority: 'Medium',
  },
  {
    id: 'PXG-24',
    category: 'A. Hiển thị cơ bản',
    title: 'Tìm cầu thủ chưa có avatar để verify PXG-04 (avatar default)',
    precondition: 'Trong danh sách 29 cầu thủ Lyon mùa 2025-2026 (View More), rà từng avatar xem có ảnh nào là placeholder/default không',
    steps: '1. Mở View More danh sách đầy đủ (PXG-19/20)\n2. Nhìn từng avatar — nếu phát hiện player nào dùng ảnh mặc định (icon người chung chung, không phải ảnh cầu thủ thật), ghi lại tên player đó',
    expected: 'Avatar default (nếu có) hiển thị rõ ràng, không vỡ layout, không hiện icon lỗi (broken image icon của trình duyệt). Nếu toàn bộ 29 player đều có avatar thật — thử tìm mẫu ở đội khác (đội nhỏ hơn, ít nổi tiếng hơn, khả năng cao có cầu thủ thiếu ảnh).',
    priority: 'Low',
  },
  {
    id: 'PXG-25',
    category: 'C. Filter',
    title: 'Đổi Season filter Lyon: 2026-2027 → 2025-2026, verify Top 3 đổi hoàn toàn',
    precondition: 'Vào https://staging.uniscore.vn/en/football/competitor/lyon/1z88sr5oo8ontsd#stats, đang ở mùa 2026-2027 (Top 3: Boudache/Fofana/Nartey)',
    steps: '1. Ghi lại Top 3 hiện tại (Boudache 0.61, Fofana 0.28, Nartey 0.11)\n2. Đổi dropdown Season sang 2025-2026\n3. Ghi lại Top 3 mới',
    expected: 'Top 3 mới phải là Tolisso (9.7174), Šulc (6.6891), Endrick (6.1056) — khớp API mùa 2025-2026. Nếu Top 3 không đổi hoặc đổi sai — FAIL, báo bug filter không hoạt động.',
    priority: 'High',
  },
  {
    id: 'PXG-26',
    category: 'B. Logic tính xG',
    title: 'Verify coverage_level 13/15 qua bảng opta_match_info — tìm 1 trận Lyon có coverage KHÁC 13/15',
    precondition: 'DB staging (<DB_STAGING_HOST>:5432/football), bảng opta_match_info có cột coverage_level. Cần tìm ít nhất 1 trận Lyon mùa 2025-2026 có coverage_level KHÁC 13 và 15 để làm mẫu đối chứng.',
    steps:
      '1. Query: SELECT id, coverage_level FROM opta_match_info WHERE (home_team_id hoặc away_team_id) = Lyon team_id AND coverage_level NOT IN (\'13\',\'15\')\n2. Nếu tìm được ≥1 trận, đối chiếu event_id đó có xuất hiện trong xg_match_player_stats không (không nên xuất hiện nếu logic lọc đúng)',
    expected: 'Trận có coverage_level khác 13/15 KHÔNG được có dòng tương ứng trong xg_match_player_stats cho cầu thủ Lyon. Đây là cách verify TRỰC TIẾP business rule "chỉ tính xG các trận coverage 13/15" thay vì chỉ suy luận gián tiếp qua tổng số như PXG-05 đã làm.',
    priority: 'High',
  },
  {
    id: 'PXG-27',
    category: 'F. Backfill data',
    title: 'Đếm số trận Lyon có coverage 13/15 nhưng THIẾU dữ liệu xg_match_player_stats (backfill sót)',
    precondition: 'DB staging — đối chiếu opta_match_info (trận đủ điều kiện) với xg_match_player_stats (trận đã có xG data), khoảng thời gian 08/2025 → hiện tại',
    steps:
      '1. Query danh sách event_id của Lyon trong opta_match_info có coverage_level IN (13,15), thời gian 08/2025 → nay\n2. Query danh sách event_id (distinct) đã có trong xg_match_player_stats\n3. So sánh: event_id nào có ở (1) nhưng KHÔNG có ở (2) = trận bị thiếu backfill',
    expected: 'Số lượng trận thiếu = 0 (backfill đã chạy đủ). Nếu > 0, liệt kê event_id cụ thể để báo data team backfill bổ sung — đây là cách verify PXG-17 bằng số liệu thật thay vì chỉ hỏi xác nhận.',
    priority: 'High',
  },
  {
    id: 'PXG-28',
    category: 'B. Logic tính xG',
    title: 'Verify công thức mẫu số ĐÚNG sau khi dev fix PXG-18 — tổng trận cầu thủ có tính cả trận KHÔNG đủ coverage hay không',
    precondition: 'Sau khi PXG-18 được fix — cần hỏi lại dev/PO công thức chính xác trước khi viết assertion tự động',
    steps: '1. Xác nhận với dev: mẫu số "y" sau khi sửa = opta_seasonal_stat_players.matches (tổng trận ra sân, kể cả trận thiếu Opta coverage), hay = COUNT(DISTINCT event_id trong opta_match_lineup có cầu thủ đó xuất hiện, bất kể coverage level)? 2 nguồn này có thể cho số khác nhau.',
    expected: 'Chốt được đúng 1 định nghĩa, viết lại assertion tự động đối chiếu mẫu số API với đúng nguồn đã chốt cho toàn bộ 29 cầu thủ Lyon (không chỉ 7 mẫu đã kiểm thủ công trong BUG_REPORT).',
    priority: 'Medium',
  },
  {
    id: 'PXG-29',
    category: 'C. Filter',
    title: 'Đổi Tournament filter (nếu Lyon có tham gia giải khác ngoài Ligue 1, vd Champions League/Europa League)',
    precondition: 'Kiểm tra dropdown Tournament trên trang Team Details Lyon có giải nào khác Ligue 1 không (từ dữ liệu trước đã thấy Lyon có đá Europa League — event Toulouse/Sparta Praha/Fenerbahce trong bảng xg_match_stats)',
    steps: '1. Mở dropdown Tournament trên trang Stats\n2. Nếu có Europa League (hoặc giải khác) — chọn, ghi lại Top 3 mới\n3. So với API tương ứng (cần đổi cả unique-tournament ID lẫn season ID trong URL API)',
    expected: 'Top 3 đổi đúng theo giải mới chọn, không giữ dữ liệu Ligue 1 cũ. Đây là case QUAN TRỌNG chưa test được (PXG-08 mới chỉ dự kiến, chưa có mẫu Tournament khác Ligue 1 để verify thật).',
    priority: 'High',
  },
  {
    id: 'PXG-30',
    category: 'A. Hiển thị cơ bản',
    title: 'Làm tròn xG hiển thị trên UI — xác nhận quy tắc làm tròn nhất quán cho mọi giá trị',
    precondition: 'Đã biết UI làm tròn 2 chữ số thập phân (API 0.6111 → UI hiện "0.61"). Cần verify với giá trị gần biên làm tròn (vd xG có 3 số thập phân là 5, như 0.615) xem là round hay floor.',
    steps: '1. Tìm trong 29 player mùa 2025-2026 giá trị xG có chữ số thứ 3 là 5 (nếu có) hoặc gần biên .xx5\n2. Đối chiếu UI hiển thị vs giá trị gốc API — xác định là ROUND (làm tròn lên/xuống theo quy tắc chuẩn) hay TRUNCATE (cắt bỏ, luôn làm tròn xuống)',
    expected: 'Xác định rõ quy tắc, ghi vào tài liệu để dùng làm sai số chuẩn khi viết assertion tự động so sánh FE vs API (trả lời luôn câu hỏi mở #3 về sai số làm tròn chấp nhận được).',
    priority: 'Low',
  },
];

const OPEN_QUESTIONS: Array<{ stt: number; cauHoi: string }> = [
  { stt: 1, cauHoi: 'Khi đội không có cầu thủ nào đủ điều kiện xG (PXG-12): ẩn toàn bộ khối Player xG, hay hiển thị khối kèm empty state? Spec hiện chưa nêu rõ.' },
  { stt: 2, cauHoi: 'Khi đội có 0 cầu thủ đủ điều kiện ở 1 giải nhưng có dữ liệu ở giải khác của cùng đội (PXG-10): hành vi UI có giống PXG-12 không?' },
  { stt: 3, cauHoi: 'Sai số làm tròn xG chấp nhận được là bao nhiêu khi đối chiếu FE vs backend (dùng cho PXG-06/PXG-07)?' },
  { stt: 4, cauHoi: 'Icon chevron ">" cạnh "Expected goals (xG)" trên staging có phải là cơ chế "View More" không, hay dẫn tới màn hình khác? Cần xác nhận bằng click thật.' },
  {
    stt: 5,
    cauHoi:
      'Đã verify: API GET /football/team/{teamId}/unique-tournaments/{tid}/seasons/{sid}/stats trả sẵn field "xg_match_coverage" (vd "1/1") cho từng player trong top_xg_players, nhưng UI hiện KHÔNG hiển thị. Đã xác nhận với PO đây KHÔNG phải bug ở bản hiện tại. Vậy AC/spec gốc có cần cập nhật lại để khớp UI thật (bỏ mô tả "x/y trận"), hay đây là roadmap sẽ bổ sung ở bản sau (FE chỉ cần đọc thêm field đã có sẵn, không cần đổi backend)?',
  },
  { stt: 6, cauHoi: 'Format hiển thị số trận "x/y trận" (nếu có bổ sung sau) — chữ "trận" có bị dịch theo ngôn ngữ khi đổi locale (EN/VI...) không?' },
];

// Đối chiếu FE (ảnh chụp staging, Lyon/Ligue 1 2026-2027) vs API thật.
const FE_VS_API_ROWS = [
  { rank: 1, player: 'Kail Boudache', feGoals: 0, apiGoals: 0, feXg: 0.61, apiXg: 0.6111, apiCoverage: '1/1', ketQua: 'PASS' },
  { rank: 2, player: 'Malick Fofana', feGoals: 1, apiGoals: 1, feXg: 0.28, apiXg: 0.276, apiCoverage: '1/1', ketQua: 'PASS' },
  { rank: 3, player: 'Noah Teye Nartey', feGoals: 1, apiGoals: 1, feXg: 0.11, apiXg: 0.1063, apiCoverage: '1/1', ketQua: 'PASS' },
];

// Đối chiếu toàn bộ số liệu tổng quan tab Stats (không chỉ khối xG) — verify
// ngày 2026-08-27 dựa trên ảnh chụp staging đầy đủ (kèm URL bar) do user cung
// cấp, đối chiếu với cùng response API stats ở trên.
const TEAM_SUMMARY_ROWS = [
  { chiSo: 'Matches', feValue: 1, apiValue: 1, apiField: 'data.matches', ketQua: 'PASS' },
  { chiSo: 'Goals scored', feValue: 2, apiValue: 2, apiField: 'data.summary_stat.goals_scored', ketQua: 'PASS' },
  { chiSo: 'Goals conceded', feValue: 0, apiValue: 0, apiField: 'data.summary_stat.goal_conceded', ketQua: 'PASS' },
  { chiSo: 'Assists', feValue: 2, apiValue: 2, apiField: 'data.summary_stat.assists', ketQua: 'PASS' },
  { chiSo: 'Goals (Attacking)', feValue: 2, apiValue: 2, apiField: 'data.attacking_stat.goals', ketQua: 'PASS' },
  { chiSo: 'Scoring frequency', feValue: 45, apiValue: 45, apiField: 'data.attacking_stat.scoring_frequency', ketQua: 'PASS' },
  { chiSo: 'Goals per game', feValue: 2, apiValue: 2, apiField: 'data.attacking_stat.goals_per_game', ketQua: 'PASS' },
  { chiSo: 'Shots per game', feValue: 11, apiValue: 11, apiField: 'data.attacking_stat.shots_per_game', ketQua: 'PASS' },
  { chiSo: 'Shots on target per game', feValue: 3, apiValue: 3, apiField: 'data.attacking_stat.shots_on_target_per_game', ketQua: 'PASS' },
  { chiSo: 'Goal conversion', feValue: 18.2, apiValue: 18.2, apiField: 'data.attacking_stat.goal_conversion', ketQua: 'PASS' },
  { chiSo: 'Penalty goals', feValue: 0, apiValue: 0, apiField: 'data.attacking_stat.penalty_goals', ketQua: 'PASS' },
  { chiSo: 'Interceptions per game', feValue: 14, apiValue: 14, apiField: 'data.defending_stat.interceptions_per_game', ketQua: 'PASS' },
  { chiSo: 'Tackles per game', feValue: 15, apiValue: 15, apiField: 'data.defending_stat.tackles_per_game', ketQua: 'PASS' },
  { chiSo: 'Clearances per game', feValue: 19, apiValue: 19, apiField: 'data.defending_stat.clearances_per_game', ketQua: 'PASS' },
  { chiSo: 'Yellow cards', feValue: 2, apiValue: 2, apiField: 'data.cards_stat.yellow_cards', ketQua: 'PASS' },
  { chiSo: 'Second yellow card', feValue: 0, apiValue: 0, apiField: 'data.cards_stat.yellow2red_cards', ketQua: 'PASS' },
  { chiSo: 'Red cards', feValue: 0, apiValue: 0, apiField: 'data.cards_stat.red_cards', ketQua: 'PASS' },
];

// Dữ liệu thô — Lyon, Ligue 1, mùa 2025-2026 (season_id=2es0s3ko448ntnv), đội
// đá tổng 34 trận. Lấy nguyên trạng từ API top_xg_players (29 player, đã
// verify tổng cộng dồn xG = data.xg đội = 48.5726, chênh lệch 0.0) — dùng làm
// bằng chứng cho PXG-18 (mẫu số xg_match_coverage luôn = 34 cho mọi player,
// kể cả player có tử số rất thấp — confirmed bug, xem cột dbMatches).
// dbMatches = opta_seasonal_stat_players.matches (DB staging <DB_STAGING_HOST>:5432,
// season_id=dbxs75cag7zyip5re0ppsanmc) — số trận THẬT từng cầu thủ đã ra sân,
// verify 2026-08-27. null = không tìm được player khớp tên trong opta_players
// (Abner Vinicius — có thể chính tả khác trong DB, không tự khớp được).
const SEASON_2025_2026_PLAYERS: Array<{ name: string; goals: number; xg: number; coverage: string; dbMatches: number | null }> = [
  { name: 'Corentin Tolisso', goals: 11, xg: 9.7174, coverage: '28/34', dbMatches: 30 },
  { name: 'Pavel Šulc', goals: 10, xg: 6.6891, coverage: '20/34', dbMatches: 27 },
  { name: 'Endrick Felipe Moreira de Sousa', goals: 5, xg: 6.1056, coverage: '15/34', dbMatches: 16 },
  { name: 'Afonso Moreira', goals: 4, xg: 2.8592, coverage: '22/34', dbMatches: 16 },
  { name: 'Roman Yaremchuk', goals: 4, xg: 2.4208, coverage: '9/34', dbMatches: 11 },
  { name: 'Malick Fofana', goals: 2, xg: 2.2114, coverage: '9/34', dbMatches: 12 },
  { name: 'Ainsley Maitland-Niles', goals: 1, xg: 2.2003, coverage: '18/34', dbMatches: 30 },
  { name: 'Martin Satriano', goals: 2, xg: 1.9517, coverage: '9/34', dbMatches: 11 },
  { name: 'Tanner Tessmann', goals: 1, xg: 1.9161, coverage: '14/34', dbMatches: 29 },
  { name: 'Tyler Morton', goals: 2, xg: 1.6869, coverage: '23/34', dbMatches: 29 },
  { name: 'Adam Karabec', goals: 1, xg: 1.5221, coverage: '12/34', dbMatches: 21 },
  { name: 'Abner Vinicius', goals: 3, xg: 1.4996, coverage: '19/34', dbMatches: null },
  { name: 'Georges Mikautadze', goals: 1, xg: 1.3262, coverage: '2/34', dbMatches: 2 },
  { name: 'Khalis Merah', goals: 0, xg: 1.3066, coverage: '11/34', dbMatches: 22 },
  { name: 'Noah Teye Nartey', goals: 2, xg: 1.136, coverage: '6/34', dbMatches: 11 },
  { name: 'Nicolás Tagliafico', goals: 0, xg: 1.0514, coverage: '13/34', dbMatches: 20 },
  { name: 'Remi Himbert', goals: 1, xg: 0.7834, coverage: '2/34', dbMatches: 6 },
  { name: 'Rachid Ghezzal', goals: 0, xg: 0.5088, coverage: '5/34', dbMatches: 10 },
  { name: 'Hans Hateboer', goals: 0, xg: 0.4276, coverage: '6/34', dbMatches: 16 },
  { name: 'Ruben Kluivert', goals: 1, xg: 0.3466, coverage: '4/34', dbMatches: 16 },
  { name: 'Mathys De Carvalho', goals: 0, xg: 0.3311, coverage: '6/34', dbMatches: null },
  { name: 'Orel Mangala', goals: 0, xg: 0.1506, coverage: '6/34', dbMatches: 9 },
  { name: 'Moussa Niakhaté', goals: 0, xg: 0.1363, coverage: '14/34', dbMatches: 32 },
  { name: 'Ernest Nuamah', goals: 0, xg: 0.0999, coverage: '2/34', dbMatches: 3 },
  { name: 'Clinton Mata', goals: 0, xg: 0.0959, coverage: '5/34', dbMatches: 32 },
  { name: 'Adil Hamdani', goals: 0, xg: 0.0821, coverage: '2/34', dbMatches: 4 },
  { name: 'Saël Kumbedi Nseke', goals: 0, xg: 0.0099, coverage: '1/34', dbMatches: 1 },
  { name: 'Rémy Descamps', goals: 0, xg: 0, coverage: '4/34', dbMatches: 5 },
  { name: 'Dominik Greif', goals: 0, xg: 0, coverage: '29/34', dbMatches: 29 },
];

test.describe('[Player xG] Export bộ test case (Excel) — không phải test verify', () => {
  test('Xuất TESTCASE_Player_xG_TeamDetails.xlsx', async () => {
    const sheets: ExcelSheetSpec[] = [
      {
        name: 'Tổng quan',
        columns: [
          { header: 'Thông tin', key: 'k', width: 28 },
          { header: 'Nội dung', key: 'v', width: 90 },
        ],
        rows: [
          { k: 'Feature', v: 'Player xG — Team Details → tab Stats (UI hiển thị tên "Expected goals (xG)")' },
          { k: 'User Story', v: 'Xem danh sách cầu thủ có chỉ số xG cao nhất của đội theo giải đấu/mùa giải' },
          { k: 'Vị trí UI', v: 'Team Details → tab Stats → cột phải, dưới khối "Cards" (đã verify staging)' },
          { k: 'Mẫu FE đã verify (UI)', v: 'Lyon — Ligue 1 2026-2027 (1 trận) — https://staging.uniscore.vn/en/football/competitor/lyon/1z88sr5oo8ontsd#stats — 100% số liệu khớp API' },
          { k: 'Mẫu API mẫu lớn (chỉ verify qua API, chưa đối chiếu UI)', v: 'Lyon — Ligue 1 2025-2026 (season_id=2es0s3ko448ntnv, 34 trận, 29 player) — dùng để phát hiện PXG-18' },
          {
            k: 'BUG CONFIRMED (đã đối chiếu DB staging)',
            v: 'PXG-18: mẫu số xg_match_coverage của API luôn = tổng trận ĐỘI (34), không phải tổng trận CẦU THỦ đã tham gia như AC yêu cầu. Đã query DB staging (opta_seasonal_stat_players.matches) để xác nhận: 27/29 player tìm được trong DB, TẤT CẢ 27/27 đều SAI (mẫu số đúng phải theo từng player, ví dụ Corentin Tolisso đúng phải là "28/30" chứ không phải "28/34", Saël Kumbedi đúng phải là "1/1" chứ không phải "1/34"). Đây là bug thật, không còn là nghi vấn. Xem sheet "Player xG sample 2025-2026" (bảng đối chiếu đầy đủ) và test case PXG-18.',
          },
          { k: 'Tổng số test case', v: String(TEST_CASES.length) },
          { k: 'Số câu hỏi mở cần confirm', v: String(OPEN_QUESTIONS.length) },
        ],
        wrapText: true,
      },
      {
        name: 'Test Cases',
        columns: [
          { header: 'ID', key: 'id', width: 10 },
          { header: 'Category', key: 'category', width: 22 },
          { header: 'Tiêu đề', key: 'title', width: 40 },
          { header: 'Precondition', key: 'precondition', width: 40 },
          { header: 'Steps', key: 'steps', width: 45 },
          { header: 'Expected Result', key: 'expected', width: 55 },
          { header: 'Priority', key: 'priority', width: 12 },
          { header: 'Status', key: 'status', width: 14 },
        ],
        rows: TEST_CASES.map((r) => ({ ...r, status: 'Not run' })),
        wrapText: true,
      },
      {
        name: 'FE vs API check',
        columns: [
          { header: 'Rank', key: 'rank', width: 8 },
          { header: 'Player', key: 'player', width: 22 },
          { header: 'Goals (FE)', key: 'feGoals', width: 12 },
          { header: 'Goals (API)', key: 'apiGoals', width: 12 },
          { header: 'xG (FE)', key: 'feXg', width: 10 },
          { header: 'xG (API)', key: 'apiXg', width: 10 },
          { header: 'xg_match_coverage (API)', key: 'apiCoverage', width: 22 },
          { header: 'Kết quả', key: 'ketQua', width: 10 },
        ],
        rows: FE_VS_API_ROWS,
        wrapText: true,
      },
      {
        name: 'Team Summary FE vs API',
        columns: [
          { header: 'Chỉ số', key: 'chiSo', width: 26 },
          { header: 'FE (staging)', key: 'feValue', width: 14 },
          { header: 'API', key: 'apiValue', width: 14 },
          { header: 'API field', key: 'apiField', width: 36 },
          { header: 'Kết quả', key: 'ketQua', width: 10 },
        ],
        rows: TEAM_SUMMARY_ROWS,
        wrapText: true,
      },
      {
        name: 'Player xG sample 2025-2026',
        columns: [
          { header: 'Player', key: 'name', width: 30 },
          { header: 'Goals', key: 'goals', width: 8 },
          { header: 'xG', key: 'xg', width: 10 },
          { header: 'API coverage (x/y)', key: 'coverage', width: 18 },
          { header: 'DB matches thật (opta_seasonal_stat_players)', key: 'dbMatches', width: 20 },
          { header: 'Mẫu số API đúng?', key: 'denomCorrect', width: 18 },
          { header: 'Mẫu số ĐÚNG phải là', key: 'expectedCoverage', width: 20 },
          { header: 'Ghi chú', key: 'note', width: 60 },
        ],
        rows: SEASON_2025_2026_PLAYERS.map((p) => {
          const [numerStr, denomStr] = p.coverage.split('/');
          const numer = Number(numerStr);
          const denom = Number(denomStr);
          if (p.dbMatches === null) {
            return { ...p, denomCorrect: 'N/A', expectedCoverage: 'N/A', note: 'Không tìm được player khớp tên trong opta_players (Lyon) — bỏ qua verdict cho dòng này.' };
          }
          const isCorrect = denom === p.dbMatches;
          return {
            ...p,
            denomCorrect: isCorrect ? 'ĐÚNG' : 'SAI',
            expectedCoverage: isCorrect ? '(đã đúng)' : `${numer}/${p.dbMatches}`,
            note: isCorrect ? '' : `Mẫu số API=${denom} (=tổng trận ĐỘI, hard-code) nhưng DB.matches=${p.dbMatches} (số trận THẬT player này đã ra sân) — xác nhận backend lấy nhầm mẫu số theo đội thay vì theo từng player.`,
          };
        }),
        wrapText: true,
      },
      {
        name: 'Câu hỏi mở',
        columns: [
          { header: 'STT', key: 'stt', width: 8 },
          { header: 'Câu hỏi cần confirm dev/PO', key: 'cauHoi', width: 100 },
          { header: 'Câu trả lời', key: 'answer', width: 50 },
        ],
        rows: OPEN_QUESTIONS.map((q) => ({ ...q, answer: '' })),
        wrapText: true,
      },
    ];

    await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTCASE_Player_xG_TeamDetails.xlsx', sheets);
  });
});
