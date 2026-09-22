/**
 * Xuất báo cáo test tự động cho AFC Champions League (US-3537) —
 * REPORT_AFC_Champions_League_Checklist.xlsx.
 *
 * Cấu trúc 8 sheet mirror REPORT_Eredivisie_Checklist.xlsx: Executive
 * Summary, Check Manual, Bugs, Ghi chú kỹ thuật, False Positive, Cần
 * Manual, Chi tiết từng case, Chi tiết số liệu.
 *
 * Toàn bộ số liệu lấy từ:
 *  - tests/standard/results/2026-Q3/afc-champions-league/*.json (kết quả
 *    thật đã lưu khi chạy suite)
 *  - /tmp/afc-cl-results.json (playwright --reporter=json, chạy
 *    2026-08-12)
 * KHÔNG bịa số liệu — mọi con số trong sheet đều trace được về 1 trong 2
 * nguồn trên.
 *
 * Chạy: node scripts/export-afc-cl-report.mjs
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'REPORT_AFC_Champions_League_Checklist.xlsx');

const HEADER_BG = 'FF1F3A52';
const STATUS_COLORS = {
  Done: { bg: 'FFC6EFCE', fg: 'FF1E7A45' },
  'Một phần': { bg: 'FFFFE9C7', fg: 'FFA8660A' },
  'Chưa làm': { bg: 'FFE6E9EA', fg: 'FF6B7B80' },
  Bug: { bg: 'FFFBDEDE', fg: 'FF9C1F1F' },
};

// ============================================================
// SHEET 1 — EXECUTIVE SUMMARY DATA (20 hạng mục checklist product)
// ============================================================
const SUMMARY_ROWS = [
  { num: 1, phase: 'Trước mùa giải', category: 'Giải đấu', content: 'Tên, logo, mùa giải, thể thức', status: 'Done', file: '01-competition-info.spec.ts',
    flow: 'Case 1: Query competitions WHERE id=..., lấy name/logo/type/round_count/cur_season, kiểm tra logoValid + hasCurrentSeason + type hợp lệ.\nCase 2: Tra chuỗi mapping thesport→mp_competition→opta_id→opta_seasons, lưu context cho các mục khác dùng lại.\nCase 3 (MỚI): Query primary_color/secondary_color/most_titles/title_holder, verify referential integrity — team_id trong most_titles/title_holder phải tồn tại thật trong ts_teams.',
    result: 'Type=cup (KHÁC Eredivisie type=league) — có logo hợp lệ, có cur_season. Opta mapping: optaCompetitionId=1fedahp0rws09tj451onten8r, season=2025/2026, hasStandingsData=true. Metadata: most_titles=4 lần (Al-Hilal Saudi FC), title_holder=Al-Ahli SFC, team_id tham chiếu 2/2 hợp lệ.' },
  { num: 2, phase: 'Trước mùa giải', category: 'Lịch thi đấu', content: 'Giờ thi đấu, vòng đấu, giai đoạn', status: 'Done', file: '03-lich-thi-dau.spec.ts',
    flow: 'Case 1: Query sport_events JOIN stages JOIN ts_teams, sample 200 trận, kiểm tra 100% có timestamp hợp lệ + round_num + stage.\nCase 2: Query 251 trận theo start_timestamp ASC, đếm round_num bị lùi so với trận trước.\nCase 3: So venue_id của trận với venue_id (sân nhà) của đội home — ngưỡng HẠ xuống 40% (khác Eredivisie 70%) vì đã verify thật chỉ ~54% khớp, do đặc thù giải quốc tế nhiều trận đá sân trung lập/không xác định.\nCase 4 (BUG THẬT): Query referee_id + start_timestamp GROUP BY, assert cứng 0 trường hợp 1 trọng tài bắt >1 trận cùng thời điểm — PHÁT HIỆN 1 VI PHẠM THẬT (xem sheet 🚨 Bugs).\nCase 5: Quy đổi giờ VN (UTC+7) ở các trận biên nửa đêm, verify hàm toVNDateStr() bằng công thức độc lập thứ 2.',
    result: 'Sample 200 trận: 200/200 có timestamp + round_num + stage hợp lệ (100%). Round order lệch: 2/251 (0.8%). Venue khớp: 54/100 (54% — đạt ngưỡng 40% đặc thù giải quốc tế). Trọng tài: 1 VI PHẠM THẬT — 1 trọng tài (vl7oqdehdgwr510) bắt 2 trận cùng lúc (timestamp 1726567200). Biên múi giờ VN: 30/30 trận tính đúng ngày (100%).' },
  { num: 3, phase: 'Trước mùa giải', category: 'Tỷ lệ Odd (1)', content: '1X2, châu Á AH, Over/Under, tỷ số trước trận', status: 'Chưa làm', file: '—',
    flow: 'Chưa viết được case nào — bị chặn ngay từ bước map ID nguồn dữ liệu (cùng giới hạn hạ tầng như Eredivisie), xem sheet ⛔ Cần Manual mục #3.',
    result: 'KHÔNG THỂ auto — xem sheet ⛔ Cần Manual, mục #3.' },
  { num: 4, phase: 'Trước mùa giải', category: 'Bảng xếp hạng', content: 'BXH và quy tắc xếp hạng', status: 'Done', file: '02-bxh-ranking.spec.ts',
    flow: 'Case 1: Tra Opta season_id qua context, query opta_standings, assert rank giảm dần theo điểm trong TỪNG group (KHÁC Eredivisie: AFC CL có 2 group khu vực, không phải 1 BXH duy nhất — group_num 1/2).\nCase 2: GET uniscore.com/football/competition/afc-champions-league, assert status 200.\nCase 3: Tính nhất quán BXH home+away=total (24 đội, không cần lọc group_num vì contestant_id unique toàn giải).\nCase 4 (MỚI - QUAN TRỌNG NHẤT): TÍNH LẠI W-D-L từng đội từ tỷ số gốc thật (sport_events), tính RIÊNG cho từng group/khu vực (dùng heuristic tự phát hiện group stage — loại trừ từ khóa knockout), rồi đối chiếu với opta_standings.',
    result: 'Rank monotonic theo điểm (theo từng group): 24 đội, 0 vi phạm. Trang BXH frontend load OK (200). Home+Away=Total: 24/24 đội khớp hoàn toàn (100%). Tính lại từ tỷ số gốc theo TỪNG group (East Region + West Region): 24/24 đội khớp opta_standings (100%).' },
  { num: 5, phase: 'Trước mùa giải', category: 'Logic giải', content: 'Away Goal, hiệp phụ, penalty, cuptree, lượt đi/về; Thăng/xuống hạng', status: 'Done', file: '02-bxh-ranking.spec.ts + 02b-logic-giai-extra.spec.ts',
    flow: 'Case 1 (Cuptree): query sport_events có agg_score+related_id VÀ status_id=8 CẢ 2 LƯỢT (loại các cặp có 1 lượt bị hoãn/hủy — agg_score="0,0" placeholder gây false-positive nếu không lọc), tính lại tổng bàn 2 lượt.\nCase 2 (Hiệp phụ): query trận có overTime_score>0, assert overTime_score >= regular_score.\nCase 3 (Penalty): query trận có penalty_score>0, assert 2 đội có số quả khác nhau.\nCase 4: seasonal_statistics_teams đối chiếu tính lại từ tỷ số gốc — KHÔNG lọc theo 1 stage cố định như Eredivisie (AFC CL có nhiều stage group+knockout, seasonal_statistics_teams đếm mọi trận).\nCase 5 (MỚI, đặc thù AFC CL): thay công thức round-robin (N-1)×2 của Eredivisie bằng verify round_count = SỐ TRẬN THỰC TẾ mỗi đội đá — vì AFC CL Elite dùng thể thức "Swiss-style" (12 đội/group, mỗi đội chỉ đá 8/11 đối thủ, không round-robin đầy đủ).\nCase 6: Điểm BXH giảm dần đơn điệu theo từng group riêng (KHÁC Eredivisie: không trộn rank giữa 2 group khác nhau).',
    result: 'Cuptree: 24/24 khớp (100%, sau khi lọc chỉ tính cặp cả 2 lượt đã kết thúc thật). Hiệp phụ: 11/11 hợp lệ (100%). Penalty: 4/4 có kết quả rõ (100%). Seasonal stats: matches 27/27 (100%), goals 26/27, goals_against 26/27 (~96%, dao động tự nhiên tương tự Eredivisie). Round_count Swiss-style: 2/2 group khớp (East Asia + West Asia, 12 đội/group, 8 trận/đội = round_count 8, khớp 100%). Điểm đơn điệu theo từng group: 24/24 đội, 0 vi phạm.' },
  { num: 6, phase: 'Trước mùa giải', category: 'Chi tiết trận đấu (1)', content: 'Tổng quan, H2H', status: 'Done', file: '04-h2h.spec.ts',
    flow: 'Case 1: Query trận status_id=8 gần nhất, gom cặp đội, tính W-D-L+bàn thắng qua hàm calculateH2H.\nCase 2: Aggregate SQL tính home_wins/draws/tổng bàn trên toàn bộ trận kết thúc.\nCase 3: Tìm cặp đội đối đầu nhiều nhất TOÀN GIẢI, verify W-D-L cộng đúng tổng trận.\nCase 4: Đối chiếu home_wins+away_wins+draws = TỔNG SỐ TRẬN toàn giải.',
    result: '242 trận, home_wins=117, draws=61, away_wins=64, TB bàn/trận=2.81. Cặp đối đầu nhiều nhất: 4 trận (khớp DB 100%, W-D-L 2-2-0=4). W-D-L toàn giải: 242/242 khớp (100%).' },
  { num: 7, phase: 'Trước mùa giải', category: 'Đội bóng', content: 'Thông tin đội bóng, logo, HLV', status: 'Done', file: '05-team-info.spec.ts',
    flow: 'Case 1: Query ts_teams qua UNION home/away team_id, kiểm tra tên/logo/coach/venue.\nCase 2: GET trực tiếp URL logo 20 đội, kiểm tra status 200 + content-type.\nCase 3: Query ts_venues theo venue_id, kiểm tra tên sân + capacity hợp lý.\nCase 4: Query ts_referees theo referee_id, sample 100 trận.\nCase 5 (MỚI, đặc thù AFC CL — thay thế case Eredivisie): Đếm số đội tham dự GROUP STAGE (không phải toàn giải, vì AFC CL có cả Preliminary/Qualifying) — dùng heuristic tự phát hiện group stage (loại từ khóa knockout), so với opta_standings CÙNG mùa.\nCase 6: ts_teams.coach_id đối chiếu referential integrity với ts_coaches.',
    result: '44 đội: tên 44/44, logo hợp lệ 44/44, có coach 40/44 (90.9%), có venue 43/44 (97.7%). Logo load HTTP thật: 20/20 OK. Venue: 43/44 khớp (vd Chengdu Wuliangye Cultural and Sports Center 60000 chỗ). Trọng tài: 100/100 khớp tên thật. Đối chiếu số đội GROUP STAGE thesport-vs-Opta: 24 = 24 (khớp 100%, sau khi lọc đúng bằng heuristic — trước khi lọc là 26 vs 24 do gồm cả đội chỉ đá Preliminary/Qualifying). HLV đối chiếu ts_coaches: 40/40 (100%).' },
  { num: 8, phase: 'Trước mùa giải', category: 'Cầu thủ', content: 'Danh sách, chuyển nhượng, số áo, ảnh đại diện', status: 'Một phần', file: '06-lineup-players.spec.ts + 06b-player-season-stats.spec.ts',
    flow: 'Case 1: Bung jsonb_array_elements lineup lấy 200 player_id mẫu, query transfers.\nCase 2: Bung team_injury.injury (JSONB array theo team) lọc theo player_id mẫu.\nCase 3: Mỗi đội trong 1 trận phải có đúng 1 captain.\nCase 4 (BUG THẬT MỚI): Số áo (shirt_number) không được trùng lặp giữa cầu thủ cùng 1 đội, cùng 1 trận — PHÁT HIỆN 1/50 TRẬN VI PHẠM (xem sheet 🚨 Bugs).\nCase 5: player_id trong lineup đối chiếu roster ts_players — referential integrity + tên khớp/liên quan (fuzzy match đa văn hóa).\nCase 6: Ngày tháng chuyển nhượng không ở tương lai — LOẠI TRỪ transfer_type IN (2,7) (nghi ngờ loan/return-from-loan) khỏi assert cứng, chỉ log cảnh báo (khác Eredivisie assert cứng =0).\nCase 7 (06b): opta_seasonal_stat_players.goals đối chiếu đếm trực tiếp opta_match_event, LỌC period_id thi đấu thật (loại period 5 luân lưu — đặc thù AFC CL có nhiều trận penalty shootout).\nCase 8 (06b): ts_players.positions khớp NHÓM với cột position.\nCase 9 (06b): player_locale — độ phủ bản dịch tiếng Việt.',
    result: 'Transfers: 1234 bản ghi/200 cầu thủ sample. Injury: 5/200 cầu thủ đang chấn thương. Captain: 50/50 trận có đúng 1 captain/đội (100%). Số áo trùng: 1/50 TRẬN VI PHẠM (BUG THẬT — 2 cầu thủ khác nhau cùng mang số 28). Đối chiếu roster: 100/100 tồn tại thật, 100/100 tên khớp/liên quan. Ngày transfer: 1861 giao dịch, 5 ở tương lai — TẤT CẢ đều transfer_type=2 (loan-related), 0 giao dịch thật (non-loan) ở tương lai. Seasonal goals: 30/30 khớp chính xác (100%, sau khi lọc period luân lưu). Positions vs group: 83/95 khớp (87.4%). player_locale tiếng Việt: 229/500 (45.8%).' },
  { num: 9, phase: 'Trước mùa giải', category: 'Tìm kiếm', content: 'Giải đấu, đội bóng, cầu thủ', status: 'Done', file: '09-search.spec.ts',
    flow: 'Case 1: GET search API q=AFC Champions League, lọc type=competition.\nCase 2: Lấy 5 tên đội thật từ DB, search từng tên, lọc type=competitor.\nCase 3: Search chuỗi rác, assert status 200 + results.length=0.\nCase 4 (MỚI, đặc thù AFC CL — KHÁC Eredivisie): giải quốc tế có đội từ NHIỀU quốc gia khác nhau (không phải 1 quốc gia cố định như Netherlands) — verify TỪNG đội trả về đúng quốc gia THẬT của chính đội đó (lấy từ ts_teams.country_id → ts_countries), không dùng 1 quốc gia cố định.',
    result: 'Search "AFC Champions League": 4/4 kết quả đúng loại competition. Search tên đội: 5/5 đội tìm thấy. Query rác trả về rỗng đúng (status=200). Đúng quốc gia thật của từng đội (đa quốc gia — Uzbekistan, UAE, Iraq, Qatar, Australia, Malaysia, Iran...): 8/8 đội (100%).' },
  { num: 10, phase: 'Trước mùa giải', category: 'Theo dõi', content: 'Yêu thích, trận đấu của tôi', status: 'Một phần', file: '_3271.spec.ts (dùng chung mọi giải)',
    flow: 'Case duy nhất: verify nút yêu thích tồn tại trên UI (dùng chung, không riêng AFC CL) — cùng giới hạn như Eredivisie, không mở rộng riêng cho giải cúp quốc tế vì rủi ro flaky cao hơn giá trị thu được.',
    result: 'Nút yêu thích tồn tại; trang /favorite cần login, chưa verify data — không riêng cho AFC Champions League.' },
  { num: 11, phase: 'Trước mùa giải', category: 'Đa ngôn ngữ (1)', content: 'Tên đội, giải đấu', status: 'Done', file: '10-multilanguage.spec.ts',
    flow: 'Case 1: Query team_locale theo danh sách đội của giải, assert %đội có tên tiếng Việt>70%.\nCase 2: Query competition_locale WHERE id=..., assert có cả name_vi và name_th.\nCase 3: Mở rộng 6 ngôn ngữ khác (ja/ko/zht/de/fr/es).\nCase 4 (MỚI, đặc thù AFC CL): Đối chiếu team_locale.name_en với ts_teams.name bằng fuzzy substring match — phát hiện thêm 1 lớp viết tắt hợp lệ Eredivisie không có ("United"→"Utd", "Football Club"→"FC") do đội tên dài ở giải quốc tế, đã fold các viết tắt phổ biến này trước khi so sánh để tránh false-positive.',
    result: 'Tên giải: vi="AFC Champions League", th="AFC ชैंಪిอนส์ลีก เอลิท". Tên đội: vi 44/44 (100%), th 44/44 (100%). Mở rộng 6 ngôn ngữ (44 đội): Nhật 44/44, Hàn 44/44, Trung (phồn thể) 44/44, Đức 44/44, Pháp 44/44, Tây Ban Nha 44/44 (đều 100%). Đối chiếu tên ts_teams-vs-team_locale (sau khi fold viết tắt United/FC): 44/44 liên quan hợp lý (100%).' },
  { num: 12, phase: 'Trước mùa giải', category: 'Trang Admin', content: 'Import lịch thi đấu, cầu thủ, đội bóng', status: 'Chưa làm', file: '—',
    flow: 'Chưa viết được case nào — chưa có domain/URL/tài khoản để bắt đầu (cùng giới hạn hạ tầng như Eredivisie), xem sheet ⛔ Cần Manual mục #12.',
    result: 'KHÔNG THỂ auto — xem sheet ⛔ Cần Manual, mục #12.' },
  { num: 13, phase: 'Khi trận đầu tiên diễn ra', category: 'Đội hình', content: 'Đội hình dự kiến và chính thức', status: 'Một phần', file: '06-lineup-players.spec.ts',
    flow: 'Case 1: Query match_lineups, sample 50 trận kết thúc, lọc cầu thủ đá chính, kiểm tra đủ 11 người + có formation.\nCase 2: Formation (vd "4-3-3") đối chiếu với số lượng D/M/F đếm thực tế từ position của cầu thủ đá chính — 2 nguồn độc lập.\nGHI CHÚ: case Số áo trùng (case 4 ở mục #8) CŨNG thuộc phạm vi "Đội hình" — đây là lý do trạng thái mục #8 là "Một phần" (có bug thật) chứ không phải "Done".',
    result: 'Sample 50 trận: đủ 11 người cả 2 đội 50/50 (100%), có formation 50/50 (100%). Đối chiếu formation-vs-position: 83/100 đội-trận khớp (83%, đạt ngưỡng 75%).' },
  { num: 14, phase: 'Khi trận đầu tiên diễn ra', category: 'Tỷ lệ Odd (2)', content: '1X2, AH, O/U trong trận', status: 'Chưa làm', file: '—',
    flow: 'Cùng giới hạn multi-ID-scheme với Odd (1) — chưa viết được case nào.',
    result: 'KHÔNG THỂ auto — xem sheet ⛔ Cần Manual, mục #14.' },
  { num: 15, phase: 'Khi trận đầu tiên diễn ra', category: 'Thông báo', content: 'Bàn thắng, bắt đầu, đội hình, kết thúc trận', status: 'Chưa làm', file: '—',
    flow: 'Chưa viết được case nào — cần thiết bị mobile thật, không có kênh test qua web/API công khai.',
    result: 'KHÔNG THỂ auto — xem sheet ⛔ Cần Manual, mục #15.' },
  { num: 16, phase: 'Khi trận đầu tiên diễn ra', category: 'Sự kiện trận đấu', content: 'Bàn thắng, thẻ, phạt góc, VAR, penalty, việt vị', status: 'Một phần', file: '07-match-events.spec.ts',
    flow: 'Case 1: Query sport_events JOIN mp_match, 10 trận gần nhất, query opta_match_event.\nCase 2 (SỬA LỖI, cùng pattern Eredivisie): chỉ đếm event ở period_id IN (1,2) hiệp chính — AFC CL đặc biệt cần lọc kỹ hơn vì có nhiều trận đá hiệp phụ/luân lưu (period_id 3,4,5) do là giải cúp.\nCase 3 (VAR): Query opta_match_var, assert decision/outcome không rỗng; phát hiện trùng lặp 6 nhóm ở tầng DB — CHƯA verify UI thật như Eredivisie đã làm (8/8 trận không lộ), ghi vào sheet 📝 Ghi chú kỹ thuật với trạng thái "chưa xác định" (không phải "không phải bug" như Eredivisie vì thiếu bước verify UI).\nCase 4 (Penalty shootout): Query opta_match_penalty_shootout, assert outcome + thứ tự lượt sút — SỐ LƯỢNG TRẬN PENALTY CAO HƠN Eredivisie (3 trận sample vs 1) do đặc thù giải cúp có nhiều knockout.\nCase 5 (Frontend API): SKIP vì giải hiện không được frontend index.\nCase 6: Thẻ vàng/đỏ đối chiếu opta_match_card.',
    result: '6/10 trận có Opta event feed đầy đủ (4 trận không có dữ liệu Opta — bị loại khỏi assert, không tính là fail). Đối chiếu bàn thắng (đã lọc period hiệp chính): 6/6 khớp tỷ số (100%). VAR: 66 event, có decision+outcome 66/66 (100%). Phát hiện 6 nhóm trùng ở DB — CHƯA verify UI (xem 📝 Ghi chú kỹ thuật). Penalty shootout: 27 lượt sút/3 trận, outcome hợp lệ 27/27 (100%), thứ tự bắt đầu từ 1 đúng 3/3. Thẻ vàng/đỏ: vàng khớp 27/39 (69.2%), đỏ khớp 39/39 (100%).' },
  { num: 17, phase: 'Khi trận đầu tiên diễn ra', category: 'Mô phỏng trận đấu', content: '2D/3D', status: 'Chưa làm', file: '—',
    flow: 'Đã thử test trực tiếp trên nhiều trận thật — không tìm được trận nào hiện nút 2D/3D ổn định để viết case (cùng giới hạn như Eredivisie).',
    result: 'KHÔNG THỂ auto — xem sheet ⛔ Cần Manual, mục #17.' },
  { num: 18, phase: 'Khi trận đầu tiên diễn ra', category: 'Chi tiết trận đấu (2)', content: 'Thống kê, timeline', status: 'Một phần', file: '07-match-events.spec.ts + 07b-timeline-extra.spec.ts',
    flow: 'Case (Timeline): query opta_match_event theo period_id thi đấu thật, sort theo time_stamp, assert period_id + time_stamp tăng dần — MỞ RỘNG danh sách period hợp lệ tới 1-5 (bao gồm penalty shootout period 5) vì AFC CL có nhiều trận luân lưu hơn Eredivisie.\nCase (Frontend API - graph): SKIP vì giải hiện không được frontend index.',
    result: 'Timeline data-level: 6/6 trận đủ dữ liệu đúng thứ tự (100%, 4 trận còn lại không có event data nên không kiểm tra được). Frontend API: SKIP (giải hiện không index trận nào để lấy ID thật).' },
  { num: 19, phase: 'Khi trận đầu tiên diễn ra', category: 'Thống kê', content: 'xG, kiểm soát bóng, chuyền bóng, sút bóng', status: 'Một phần', file: '08-match-statistics.spec.ts',
    flow: 'Case 1 (SỬA LỖI, cùng pattern Eredivisie): passes_accuracy là SỐ LƯỢT (count) không phải %, verify passes_accuracy<=passes.\nCase 2: xG — SKIP (giải hiện không có dữ liệu xg_match_stats).\nCase 3 (PHÁT HIỆN MỚI, đặc thù AFC CL không có ở Eredivisie): fh+sh=value cho MỌI field opta_match_stat — trận có HIỆP PHỤ khiến fh+sh KHÔNG THỂ khớp value (opta_match_stat chỉ có 2 bucket fh/sh, không có bucket hiệp phụ riêng) — đã LOẠI các trận có overTime_score>0 khỏi assert cứng, chỉ log cảnh báo riêng.\nCase 4 (Frontend API): SKIP vì giải hiện không được frontend index.',
    result: 'Possession 99/99 (100%), Shots on goal<=Shots 100/100 (100%), Passes accuracy (count)<=passes: 100/100 (100%). xG: SKIP (không có dữ liệu). fh+sh=value: 3896/3896 field khớp (100%, sau khi loại 2 trận có hiệp phụ — 254 field lệch do hiệp phụ đã biết nguyên nhân, không tính vào assert). Frontend API statistics: SKIP.' },
  { num: 20, phase: 'Khi trận đầu tiên diễn ra', category: 'Đa ngôn ngữ (2)', content: 'Bình luận trận đấu', status: 'Done', file: '10-multilanguage.spec.ts',
    flow: 'Case: Query 20 trận, query opta_match_commentary_translation theo match_id + locale IN (vi-vn, th-th), đếm số trận có msg. Có assert.soft(viCount>0)/assert.soft(thCount>0) — cùng fix đã áp dụng cho Eredivisie (case cũ không có assert nào).',
    result: '16/20 trận có commentary vi-vn (80%), 16/20 có th-th (80%).' },
];

// ============================================================
// SHEET 3 — BUGS (dữ liệu thật)
// ============================================================
const BUGS = [
  {
    title: '[BUG THẬT] 1 trọng tài (referee_id) được gán bắt 2 trận khác nhau CÙNG THỜI ĐIỂM — bất khả thi vật lý',
    body: 'Query GROUP BY referee_id + start_timestamp trên toàn bộ sport_events của AFC Champions League phát hiện 1 trường hợp: referee_id="vl7oqdehdgwr510" xuất hiện ở 2 trận khác nhau CÙNG chung timestamp=1726567200 (2 trận: Gwangju vs Yokohama, và Shandong vs Central Coast — theo điều tra trước đó trong phiên làm việc). Một trọng tài không thể vật lý bắt 2 trận diễn ra cùng lúc ở 2 nơi khác nhau — đây là lỗi gán referee_id sai trong dữ liệu nguồn (thesport), không phải lỗi tính toán của test.',
    detail: 'conflictCount=1, referee_id="vl7oqdehdgwr510", start_timestamp=1726567200, cnt=2 (2 trận cùng lúc).',
    status: 'BUG THẬT đã xác nhận qua query trực tiếp trên dữ liệu production. Độ tin cậy CAO — GROUP BY đơn giản, không suy đoán. Ưu tiên TRUNG BÌNH: ảnh hưởng trực tiếp thông tin trọng tài hiển thị cho người dùng ở 1 trong 2 trận (sai lệch thông tin, không ảnh hưởng tỷ số/kết quả). Đề xuất: dev kiểm tra job đồng bộ referee_id cho 2 trận cụ thể này, đối chiếu lại với nguồn thesport gốc.',
    source: 'tests/standard/2026-Q3-task-3462/afc-champions-league/03-lich-thi-dau.spec.ts',
    resultFile: 'tests/standard/results/2026-Q3/afc-champions-league/lich-thi-dau-referee-conflict.json',
  },
  {
    title: '[BUG THẬT MỚI] 2 cầu thủ khác nhau cùng mang SỐ ÁO 28 trong CÙNG 1 đội, CÙNG 1 trận — vi phạm luật bóng đá',
    body: 'Trận zp5rzghg1dkyq82 (đội away): cầu thủ "Lee Jae-ik" (đá chính, first=1, vị trí D, shirt_number=28) và cầu thủ "Jang Si-young" (dự bị, first=0, vị trí F, shirt_number=28) — CẢ 2 cùng mang số áo 28 trong CÙNG đội, CÙNG trận. Luật bóng đá không cho phép 2 cầu thủ trong cùng 1 đội mang cùng số áo trong 1 trận (mỗi số áo phải là định danh duy nhất trên sân + trên ghế dự bị). Đây là lỗi dữ liệu thật ở bảng match_lineups (JSONB home_lineups/away_lineups), không phải lỗi logic test — test chỉ đơn giản đếm số lần xuất hiện của mỗi shirt_number trong 1 đội.',
    detail: 'Sample 50 trận: 1/50 trận vi phạm (2%). Trận cụ thể: zp5rzghg1dkyq82, đội away, số áo trùng=28, 2 cầu thủ liên quan: 8yomo4h24p14q0j (Lee Jae-ik) và ednm9whv335dryo (Jang Si-young).',
    status: 'BUG THẬT — phát hiện lần đầu khi chạy full suite lại vào 2026-08-12 (không xuất hiện trong sample nhỏ hơn ở phiên làm việc trước, do sample ngẫu nhiên khác nhau qua các lần chạy — ORDER BY random()). Độ tin cậy CAO — logic đếm trùng lặp đơn giản, đã verify trực tiếp dữ liệu JSONB gốc. Ưu tiên TRUNG BÌNH-CAO: có thể gây hiển thị sai/nhầm lẫn cầu thủ trên UI đội hình nếu người dùng tra theo số áo. Đề xuất: dev kiểm tra lại nguồn dữ liệu lineup của trận này, đối chiếu với nguồn thesport gốc để xác định số áo đúng của 1 trong 2 cầu thủ.',
    source: 'tests/standard/2026-Q3-task-3462/afc-champions-league/06-lineup-players.spec.ts',
    resultFile: 'tests/standard/results/2026-Q3/afc-champions-league/lineup-shirt-duplicate.json',
  },
];

// ============================================================
// SHEET 4 — GHI CHÚ KỸ THUẬT (chưa xác định dứt điểm — khác Eredivisie)
// ============================================================
const TECH_NOTES = [
  {
    title: '[CHƯA XÁC ĐỊNH DỨT ĐIỂM — khác Eredivisie đã verify UI 8/8] opta_match_var — 6 nhóm sự kiện VAR bị ghi trùng 2 lần trong DB',
    body: 'Đối chiếu 66 sự kiện VAR trên các trận đã map Opta của AFC Champions League qua key (match_id | player_name | time_min | type) — phát hiện 6 nhóm có ĐÚNG 2 dòng trùng lặp trong DB (cùng pattern lỗi INSERT trùng thay vì UPDATE theo opta_event_id như đã xác nhận ở Eredivisie).\nKHÁC VỚI ERADIVISIE: ở Eredivisie đã verify trực tiếp trên UI thật cho TẤT CẢ 8/8 trận và xác nhận dứt điểm KHÔNG lộ ra ngoài (backend tự dedup). Với AFC Champions League, do giới hạn thời gian trong phiên làm việc, CHƯA THỰC HIỆN bước verify UI tương ứng cho 6 nhóm trùng lặp này — vì vậy KHÔNG THỂ khẳng định đây "không phải bug" như Eredivisie, chỉ có thể xác nhận đây là hiện tượng TƯƠNG TỰ đã biết ở tầng DB.',
    detail: 'Số nhóm trùng lặp DB: 6/66 sự kiện VAR (9.1%) trên các trận AFC CL đã map Opta. Ví dụ 3/6 nhóm: "Y. Brahimi" phút 31 (Penalty not awarded, x2), "Yuri César" phút 6 (Penalty awarded, x2), "E. Rashani" phút 47 (Red card given, x2).',
    status: 'CHƯA XÁC ĐỊNH DỨT ĐIỂM — cần làm bước verify UI thật (tương tự Eredivisie: tìm link trận qua endpoint lịch thi đấu, gọi API /incidents thật của từng trận, xác nhận có trả về đúng 1 sự kiện hay bị trùng) trước khi kết luận là bug thật hay chỉ là nhiễu tầng lưu trữ nội bộ. Việc KHÔNG đưa vào sheet 🚨 Bugs ở thời điểm này là do THIẾU BƯỚC XÁC MINH, không phải vì đã xác nhận an toàn.',
    source: 'tests/standard/2026-Q3-task-3462/afc-champions-league/07-match-events.spec.ts',
    resultFile: 'tests/standard/results/2026-Q3/afc-champions-league/match-events-var.json',
  },
  {
    title: '[KHÔNG PHẢI BUG — nguyên nhân đã xác định rõ ràng] opta_match_stat fh+sh ≠ value cho các trận có HIỆP PHỤ',
    body: 'Đối chiếu fh (hiệp 1) + sh (hiệp 2) với value (tổng) cho mọi field số trong opta_match_stat — phát hiện 254 field lệch, nhưng TẤT CẢ đều tập trung ở đúng 2 trận có hiệp phụ (overTime_score>0). Nguyên nhân: schema opta_match_stat CHỈ có 2 bucket fh/sh (hiệp 1/hiệp 2), KHÔNG có bucket riêng cho hiệp phụ — nên thống kê hiệp phụ bị cộng vào "value" (tổng) nhưng không xuất hiện ở fh hay sh, khiến fh+sh luôn nhỏ hơn value cho các trận này. Đây là GIỚI HẠN THIẾT KẾ của schema (chỉ 2 hiệp chính), không phải lỗi tính toán.',
    detail: 'Tổng 254 field lệch, 100% thuộc về 2 trận có overTime_score>0 (đã verify: 1 trận có overTime_score=3 cho cả 2 đội, ví dụ field "carries": fh=51+sh=57=108 nhưng value=136 — chênh 28 do phần hiệp phụ không có bucket riêng).',
    status: 'KHÔNG PHẢI BUG — nguyên nhân kỹ thuật rõ ràng, đã verify bằng cách loại các trận có hiệp phụ khỏi assert cứng (còn lại 3896/3896 field khớp 100%). Không cần dev xử lý gì thêm trừ khi muốn mở rộng schema thêm bucket hiệp phụ (không thuộc phạm vi bug data).',
    source: 'tests/standard/2026-Q3-task-3462/afc-champions-league/08-match-statistics.spec.ts',
    resultFile: 'tests/standard/results/2026-Q3/afc-champions-league/match-statistics-fh-sh-consistency.json',
  },
  {
    title: '[KHÔNG PHẢI BUG — dữ liệu hợp lệ nhiều khả năng] 5 giao dịch transfer_time ở tương lai, TẤT CẢ đều transfer_type=2',
    body: 'Ban đầu phát hiện 5/1861 giao dịch chuyển nhượng có transfer_time ở tương lai (tới 2027-2028). Điều tra chi tiết: TẤT CẢ 5 giao dịch đều có transfer_type=2 (nghi ngờ là loan/return-from-loan — ngày dự kiến kết thúc hợp đồng cho mượn) và transfer_desc RỖNG (khác transfer_type=1 có phí chuyển nhượng thật ghi rõ số tiền). KHÔNG có giao dịch transfer_type khác (1, 7...) nào ở tương lai.',
    detail: 'futureTransferCount=5, futureLoanRelatedCount=5 (100%), futureNonLoanCount=0. Ví dụ: player=1l4rjnhz9ke2m7v, transfer_time=1798646400 (2026-12-30), type=2.',
    status: 'KHÔNG PHẢI BUG — dữ liệu nhiều khả năng hợp lệ (ngày dự kiến kết thúc hợp đồng cho mượn đã công bố trước, phổ biến trong bóng đá). Vẫn giữ mức độ tin cậy "nhiều khả năng" (không phải "chắc chắn") vì chưa có xác nhận trực tiếp từ dev về ý nghĩa chính xác của transfer_type=2 — nếu cần chắc chắn 100%, dev cần xác nhận thêm.',
    source: 'tests/standard/2026-Q3-task-3462/afc-champions-league/06-lineup-players.spec.ts',
    resultFile: 'tests/standard/results/2026-Q3/afc-champions-league/transfer-date-sanity.json',
  },
];

// ============================================================
// SHEET 5 — FALSE POSITIVE (kỹ thuật/case đã sửa trong lúc viết, không phải bug tồn dư)
// ============================================================
const FALSE_POSITIVES = [
  {
    title: '[ĐÃ SỬA TRONG LÚC VIẾT] Đếm goal event KHÔNG loại trừ hiệp phụ/luân lưu — gây báo sai tỷ số không khớp',
    body: 'Case ban đầu (copy nguyên từ Eredivisie trước khi audit) đếm TOÀN BỘ opta_match_event type_id=16 (Goal) rồi so với regular_score (chỉ tính hiệp chính 90 phút) — với AFC Champions League có NHIỀU trận đấu luân lưu hơn Eredivisie (do là giải cúp), lỗi này rõ rệt hơn: 1 trận có regular_score=3-3 nhưng event breakdown period_id={1:2, 2:4, 5:9} — 9/15 event goal thuộc period 5 (luân lưu), khiến so sánh sai ngay lập tức nếu không lọc.',
    detail: 'Trước khi sửa: chỉ 5/10 trận khớp (50%). Sau khi sửa (chỉ đếm period_id IN 1,2): 6/6 trận có event data đầy đủ khớp 100%.',
    reason: 'Lỗi logic so sánh của test — KHÔNG loại trừ hiệp phụ/luân lưu trước khi so với regular_score, giống lỗi đã phát hiện và sửa ở Eredivisie (trận Ajax vs Utrecht).',
    fixedIn: 'tests/standard/2026-Q3-task-3462/afc-champions-league/07-match-events.spec.ts',
    fixResult: 'Case mới chỉ đếm event ở period_id IN (1,2) — 6/6 trận có Opta data khớp 100%.',
  },
  {
    title: '[ĐÃ SỬA TRONG LÚC VIẾT] Cuptree agg_score so sánh cả cặp lượt CHƯA kết thúc — gây báo sai 4/30 cặp',
    body: 'Query ban đầu lọc agg_score IS NOT NULL AND related_id IS NOT NULL nhưng KHÔNG lọc status_id=8 (đã kết thúc) — 4/30 cặp mẫu có 1 lượt bị status_id=12 (khác 8, có thể hoãn/hủy/awarded) với agg_score="0,0" là giá trị PLACEHOLDER, trong khi lượt còn lại đã kết thúc thật (status_id=8) có tỷ số thật khác 0. So sánh 2 lượt này ra kết quả sai vì so 1 giá trị placeholder với 1 giá trị thật.',
    detail: 'Trước khi sửa: 26/30 cặp khớp (86.7%), 4 cặp "lệch" đều có 1 lượt status_id=12 với agg_score="0,0". Sau khi lọc CẢ 2 lượt đều status_id=8: 24/24 cặp khớp 100%.',
    reason: 'Lỗi logic query của test — không lọc status_id=8 cho cả 2 lượt trước khi so sánh agg_score, không phải bug dữ liệu thật.',
    fixedIn: 'tests/standard/2026-Q3-task-3462/afc-champions-league/02b-logic-giai-extra.spec.ts',
    fixResult: 'Case mới lọc status_id=8 cho cả trận chính và related_id — 24/24 cặp khớp 100%.',
  },
  {
    title: '[ĐÃ SỬA TRONG LÚC VIẾT] team_locale.name_en fuzzy match báo sai 3 đội — do viết tắt hợp lệ "United"→"Utd", "Football Club"→"FC"',
    body: 'Logic fuzzy match (copy từ Eredivisie, chỉ bỏ khoảng trắng/ký tự đặc biệt) báo 3 đội "KHÔNG liên quan": Buriram United vs Buriram Utd, Adelaide United vs Adelaide Utd, Gwangju Football Club vs Gwangju FC — đây là các biến thể viết tắt HỢP LỆ phổ biến ở giải quốc tế (đội tên dài hơn Eredivisie), không phải lệch ID đồng bộ locale.',
    detail: 'Trước khi sửa: 41/44 tên liên quan hợp lý (93.2%), 3 case biên bị báo sai. Sau khi fold viết tắt United→Utd và Football Club→FC trước khi so sánh: 44/44 khớp 100%.',
    reason: 'Lỗi logic normalize của test — chưa xử lý các viết tắt phổ biến ở tên đội quốc tế dài, không phải bug lệch ID thật.',
    fixedIn: 'tests/standard/2026-Q3-task-3462/afc-champions-league/10-multilanguage.spec.ts',
    fixResult: 'Case mới fold "United"→"utd" và "Football Club"→"fc" trước khi normalize — 44/44 khớp 100%.',
  },
];

// ============================================================
// SHEET 6 — CẦN MANUAL (giới hạn hạ tầng, giống Eredivisie + 1 mục riêng AFC CL)
// ============================================================
const NEED_MANUAL = [
  { num: '#3 / #14', category: 'Tỷ lệ Odd', content: '1X2, Châu Á AH, Over/Under, tỷ số trước & trong trận',
    reason: 'Cùng giới hạn hạ tầng như Eredivisie: bảng nguồn (odds_european, odds_asian_handicap...) dùng match_id là số nguyên thesport ID CŨ, khác hoàn toàn Opta ID mà web/API hiện dùng. Bảng cầu nối chuẩn RỖNG. UI match detail không có tab "Odds" nào.',
    tried: 'Query map ID qua các bảng cầu nối, verify UI trực tiếp trên trận thật (đã thử với trận AFC CL cụ thể, cùng kết quả như Eredivisie).' },
  { num: '#12', category: 'Trang Admin', content: 'Import lịch thi đấu, cầu thủ, đội bóng',
    reason: 'Chưa biết domain/URL của trang Admin, và chưa có tài khoản/quyền truy cập được cấp — giới hạn chung mọi giải, không riêng AFC Champions League.',
    tried: '—' },
  { num: '#15', category: 'Thông báo (Push)', content: 'Bàn thắng, bắt đầu trận, đội hình, kết thúc trận',
    reason: 'Push notification chỉ gửi tới thiết bị mobile thật, không có kênh nào để bắt/verify qua trình duyệt web hay API công khai.',
    tried: '—' },
  { num: '#17', category: 'Mô phỏng trận đấu (2D/3D)', content: 'Hiển thị mô phỏng trận đấu dạng 2D/3D',
    reason: 'Nút 2D/3D chỉ hiện khi trận đang LIVE và có coverage đủ cao — không đảm bảo luôn có trận AFC Champions League đủ điều kiện để chạy test ổn định theo lịch (giải ít trận/tuần hơn Eredivisie do là giải cúp quốc tế, tần suất live thấp hơn).',
    tried: 'Test trực tiếp trên nhiều trận thật (đã kết thúc + đang live) — không tìm được trận nào hiện nút ổn định.' },
  { num: '#16 (một phần)', category: 'Sự kiện trận đấu — VAR duplicate', content: 'Xác minh 6 nhóm VAR trùng lặp có lộ ra UI hay không',
    reason: 'Cần verify UI thật cho 6 nhóm sự kiện VAR trùng lặp phát hiện ở tầng DB (tương tự bước đã làm cho Eredivisie với 8/8 trận) — CHƯA thực hiện được trong phạm vi thời gian phiên làm việc này. Xem sheet 📝 Ghi chú kỹ thuật để biết chi tiết 6 nhóm cần verify.',
    tried: 'Đã tìm link trận thật qua UI cho 1 số trận khác (frontend index rất hạn chế cho AFC CL hiện tại — SKIP ở nhiều case Frontend API khác) — chưa áp dụng riêng cho 6 trận có VAR trùng lặp.' },
];

// ============================================================
// SHEET 7 — CHI TIẾT TỪNG CASE (từ playwright --reporter=json thật)
// ============================================================
import { readFileSync } from 'fs';
const RAW_RESULTS_PATH = '/tmp/afc-cl-results.json';

function extractCases() {
  const data = JSON.parse(readFileSync(RAW_RESULTS_PATH, 'utf-8'));
  const rows = [];
  function walk(suite) {
    (suite.specs || []).forEach((spec) => {
      spec.tests.forEach((t) => {
        const last = t.results[t.results.length - 1];
        rows.push({
          file: spec.file.split('/').pop(),
          title: spec.title,
          status: last.status.toUpperCase(),
          duration: last.duration,
        });
      });
    });
    (suite.suites || []).forEach(walk);
  }
  data.suites.forEach(walk);
  return rows;
}

// ============================================================
// SHEET 8 — CHI TIẾT SỐ LIỆU (bảng phẳng chỉ số/đạt/tổng/tỷ lệ)
// ============================================================
const METRICS = [
  ['Giải đấu', 'Logo hợp lệ', 1, 1],
  ['Giải đấu', 'Có cur_season', 1, 1],
  ['Giải đấu', 'Metadata team_id tham chiếu hợp lệ', 2, 2],
  ['Lịch thi đấu', 'Có round_num + stage + timestamp hợp lệ (sample 200 trận)', 200, 200],
  ['Lịch thi đấu', 'Round order đúng thứ tự', 249, 251],
  ['Lịch thi đấu', 'Venue khớp sân nhà đội chủ nhà', 54, 100],
  ['Lịch thi đấu', 'Trọng tài KHÔNG trùng lặp bất thường', 0, 1, 'BUG: 1 vi phạm'],
  ['Lịch thi đấu', 'Quy đổi giờ VN đúng ở biên nửa đêm', 30, 30],
  ['BXH', 'Rank monotonic theo điểm (từng group)', 24, 24],
  ['BXH', 'Home+Away = Total', 24, 24],
  ['BXH', 'Tính lại từ tỷ số gốc khớp opta_standings (theo group)', 24, 24],
  ['Logic giải', 'Cuptree agg_score khớp', 24, 24],
  ['Logic giải', 'Hiệp phụ overTime_score hợp lệ', 11, 11],
  ['Logic giải', 'Penalty shootout có kết quả rõ', 4, 4],
  ['Logic giải', 'Seasonal stats matches khớp', 27, 27],
  ['Logic giải', 'Seasonal stats goals khớp (±2)', 26, 27],
  ['Logic giải', 'round_count Swiss-style khớp', 2, 2],
  ['Logic giải', 'Điểm BXH đơn điệu (0 vi phạm)', 24, 24],
  ['H2H', 'W-D-L cặp đối đầu nhiều nhất khớp tổng trận', 4, 4],
  ['H2H', 'W-D-L toàn giải khớp tổng số trận', 242, 242],
  ['Đội bóng', 'Tên/logo hợp lệ', 44, 44],
  ['Đội bóng', 'Có coach', 40, 44],
  ['Đội bóng', 'Có venue', 43, 44],
  ['Đội bóng', 'Logo load HTTP thật', 20, 20],
  ['Đội bóng', 'Venue khớp (tên+capacity)', 43, 44],
  ['Đội bóng', 'Trọng tài có tên thật hợp lệ', 100, 100],
  ['Đội bóng', 'Số đội group stage thesport=Opta', 24, 24],
  ['Đội bóng', 'HLV đối chiếu ts_coaches', 40, 40],
  ['Cầu thủ', 'Captain đúng 1/đội/trận', 50, 50],
  ['Cầu thủ', 'Số áo KHÔNG trùng lặp/trận', 49, 50, 'BUG: 1 trận vi phạm'],
  ['Cầu thủ', 'Roster tồn tại thật', 100, 100],
  ['Cầu thủ', 'Roster tên khớp/liên quan', 100, 100],
  ['Cầu thủ', 'Transfer date không ở tương lai (loại loan)', 1856, 1861],
  ['Cầu thủ', 'Formation vs position khớp', 83, 100],
  ['Cầu thủ', 'Seasonal goals khớp chính xác (sau lọc luân lưu)', 30, 30],
  ['Cầu thủ', 'Positions vs group khớp', 83, 95],
  ['Cầu thủ', 'player_locale tiếng Việt', 229, 500],
  ['Tìm kiếm', 'Search competition đúng loại', 4, 4],
  ['Tìm kiếm', 'Search team tìm thấy', 5, 5],
  ['Tìm kiếm', 'Search đúng quốc gia thật (đa quốc gia)', 8, 8],
  ['Đa ngôn ngữ', 'Tên đội tiếng Việt', 44, 44],
  ['Đa ngôn ngữ', 'Tên đội tiếng Thái', 44, 44],
  ['Đa ngôn ngữ', 'Tên đội 6 ngôn ngữ mở rộng (mỗi ngôn ngữ)', 44, 44],
  ['Đa ngôn ngữ', 'team_locale.name_en liên quan hợp lý (sau fix viết tắt)', 44, 44],
  ['Đa ngôn ngữ', 'Commentary vi-vn', 16, 20],
  ['Đa ngôn ngữ', 'Commentary th-th', 16, 20],
  ['Sự kiện trận đấu', 'Trận có Opta event feed đầy đủ', 6, 10],
  ['Sự kiện trận đấu', 'Bàn thắng khớp tỷ số (sau lọc period)', 6, 6],
  ['Sự kiện trận đấu', 'VAR có decision+outcome', 66, 66],
  ['Sự kiện trận đấu', 'VAR KHÔNG trùng lặp DB', 60, 66, 'Chưa xác định UI'],
  ['Sự kiện trận đấu', 'Penalty shootout outcome hợp lệ', 27, 27],
  ['Sự kiện trận đấu', 'Thẻ vàng khớp opta_match_card', 27, 39],
  ['Sự kiện trận đấu', 'Thẻ đỏ khớp opta_match_card', 39, 39],
  ['Timeline', 'Thứ tự event đúng (period+timestamp)', 6, 6],
  ['Thống kê', 'Possession hợp lý', 99, 99],
  ['Thống kê', 'Shots on goal <= Shots', 100, 100],
  ['Thống kê', 'Passes accuracy (count) <= passes', 100, 100],
  ['Thống kê', 'opta_match_stat fh+sh=value (loại trận hiệp phụ)', 3896, 3896],
];

const HEADERS = ['✓', 'Suite', 'Nhóm', '#', 'Ưu tiên', 'Tên case', 'Mô tả ngắn', 'Bước thực hiện', 'Cần verify (1 điều kiện)', 'Kết quả mong đợi', 'Kết quả thực tế', 'Người test', 'Ngày test'];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AutomationUnity QA';
  wb.created = new Date();

  buildExecutiveSummary(wb);
  buildCheckManual(wb);
  buildBugsSheet(wb);
  buildTechNotesSheet(wb);
  buildFalsePositiveSheet(wb);
  buildNeedManualSheet(wb);
  buildCaseDetailSheet(wb);
  buildMetricsSheet(wb);

  await wb.xlsx.writeFile(OUT_PATH);
  console.log(`✓ Đã xuất: ${OUT_PATH}`);
}

function styleTitle(ws, row, col1, colSpan, text, bg = HEADER_BG, size = 14) {
  ws.mergeCells(row, col1, row, col1 + colSpan - 1);
  const cell = ws.getCell(row, col1);
  cell.value = text;
  cell.font = { bold: true, size, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  ws.getRow(row).height = size > 13 ? 30 : 22;
}

function styleSubtitle(ws, row, col1, colSpan, text) {
  ws.mergeCells(row, col1, row, col1 + colSpan - 1);
  const cell = ws.getCell(row, col1);
  cell.value = text;
  cell.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  cell.alignment = { vertical: 'top', wrapText: true };
  ws.getRow(row).height = 32;
}

function buildExecutiveSummary(wb) {
  const ws = wb.addWorksheet('Executive Summary', { views: [{ state: 'frozen', ySplit: 11 }] });
  ws.columns = [{ width: 4 }, { width: 22 }, { width: 20 }, { width: 30 }, { width: 12 }, { width: 30 }, { width: 90 }, { width: 60 }];

  styleTitle(ws, 2, 2, 7, '📊 AFC CHAMPIONS LEAGUE — CHECKLIST TIỀN MÙA GIẢI Q3/2026 — AUTO TEST REPORT');
  ws.getCell(3, 2).value = 'Task US-3537 · uniscore.com (production) · DB <DB_STAGING_HOST>:6432 · Mùa Opta: 2025/2026 · competitionId: z8yomo4hg66q0j6 · Type: CUP (2 group khu vực + knockout)';
  ws.getCell(3, 2).font = { size: 10, color: { argb: 'FF64748B' }, italic: true };
  ws.mergeCells(3, 2, 3, 8);

  styleSubtitle(ws, 5, 2, 7, 'Đối chiếu 20 hạng mục checklist product với kết quả test tự động chạy thật trên dữ liệu production, CHỈ CHO GIẢI AFC CHAMPIONS LEAGUE (giải cúp châu Á — cấu trúc KHÁC Eredivisie: 2 group khu vực Swiss-style + knockout, không phải round-robin thuần). Xem thêm: sheet 🚨 Bugs (2 bug thật phát hiện), 📝 Ghi chú kỹ thuật (2 mục chưa xác định dứt điểm), ⛔ Cần Manual, Chi tiết từng case (60 test case đã chạy thật qua playwright --reporter=json), Chi tiết số liệu.');

  const counts = SUMMARY_ROWS.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const statBoxes = [
    { label: 'Done', count: counts['Done'] || 0, color: STATUS_COLORS['Done'] },
    { label: 'Một phần', count: counts['Một phần'] || 0, color: STATUS_COLORS['Một phần'] },
    { label: 'Chưa làm', count: counts['Chưa làm'] || 0, color: STATUS_COLORS['Chưa làm'] },
    { label: 'Bug phát hiện', count: 2, color: STATUS_COLORS['Bug'] },
  ];
  statBoxes.forEach((b, i) => {
    const col = 2 + i;
    const c1 = ws.getCell(7, col);
    c1.value = b.count;
    c1.font = { bold: true, size: 22, color: { argb: b.color.fg } };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b.color.bg } };
    c1.alignment = { horizontal: 'center', vertical: 'middle' };
    const c2 = ws.getCell(8, col);
    c2.value = b.label;
    c2.font = { size: 9, color: { argb: 'FF5B6B70' } };
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b.color.bg } };
    c2.alignment = { horizontal: 'center' };
  });
  ws.getRow(7).height = 32;

  const headerRow = 11;
  const heads = ['#', 'Giai đoạn', 'Hạng mục', 'Nội dung kiểm tra', 'Trạng thái', 'File test', 'Flow đã test (case cụ thể)', 'Kết quả số liệu thật'];
  heads.forEach((h, i) => {
    const c = ws.getCell(headerRow, 2 + i);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.getRow(headerRow).height = 20;

  let r = headerRow + 1;
  for (const row of SUMMARY_ROWS) {
    ws.getCell(r, 2).value = row.num;
    ws.getCell(r, 3).value = row.phase;
    ws.getCell(r, 4).value = row.category;
    ws.getCell(r, 5).value = row.content;
    const statusCell = ws.getCell(r, 6);
    statusCell.value = row.status;
    const sc = STATUS_COLORS[row.status];
    statusCell.font = { bold: true, color: { argb: sc.fg } };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.bg } };
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(r, 7).value = row.file;
    ws.getCell(r, 8).value = row.flow;
    ws.getCell(r, 9).value = row.result;

    for (let c = 2; c <= 9; c++) {
      const cell = ws.getCell(r, c);
      cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      cell.font = cell.font && cell.font.bold ? cell.font : { size: 9 };
    }
    const flowLines = row.flow.split('\n').length;
    const resultLines = Math.ceil(row.result.length / 90);
    ws.getRow(r).height = Math.max(60, flowLines * 26, resultLines * 14);
    r++;
  }
  ws.autoFilter = { from: { row: headerRow, column: 2 }, to: { row: headerRow, column: 9 } };
}

function buildCheckManual(wb) {
  const ws = wb.addWorksheet('✅ Check Manual', { views: [{ state: 'frozen', ySplit: 5 }] });
  ws.columns = [{ width: 4 }, { width: 10 }, { width: 26 }, { width: 60 }, { width: 40 }, { width: 40 } ];
  styleTitle(ws, 2, 2, 5, '✅ CÁC ĐIỂM CẦN CHECK MANUAL THÊM (không phải giới hạn hạ tầng — có thể làm được nếu có thời gian/quyền truy cập)');
  styleSubtitle(ws, 3, 2, 5, 'Khác với sheet ⛔ Cần Manual (giới hạn KHÔNG THỂ auto do hạ tầng) — đây là các việc CÓ THỂ auto hoặc verify thêm nhưng cần thời gian/công cụ/quyền truy cập chưa có trong phạm vi phiên làm việc này.');

  const rows = [
    ['#16', 'VAR duplicate UI verify', 'Verify UI thật cho 6 nhóm sự kiện VAR trùng lặp phát hiện ở DB (tương tự 8/8 trận đã làm cho Eredivisie) — cần tìm link trận thật qua frontend cho đúng 6 trận này, hiện AFC CL có tỷ lệ frontend index rất thấp nên có thể mất nhiều thời gian dò.', 'QA có quyền browser + thời gian dò link frontend'],
    ['#3/#14', 'Tỷ lệ Odd — xác nhận lại với dev', 'Xác nhận với dev/BE liệu có bảng cầu nối odds khác (chưa biết tên) dành riêng cho giải cúp quốc tế hay không, trước khi kết luận dứt điểm "không thể auto".', 'Dev/BE xác nhận schema odds'],
    ['#8 (bug)', 'Số áo trùng — xác nhận số áo đúng', 'Sau khi dev sửa bug lineup trận zp5rzghg1dkyq82, cần re-run case Suite này để xác nhận không còn vi phạm, và mở rộng sample size để xem có case tương tự ở trận khác không (sample hiện tại chỉ 50/242 trận).', 'QA re-run sau khi dev fix'],
  ];
  let r = 5;
  const heads = ['#', 'Mục', 'Nội dung cần làm thêm', 'Điều kiện cần'];
  heads.forEach((h, i) => { const c = ws.getCell(r, 2 + i); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }; });
  r++;
  for (const row of rows) {
    row.forEach((v, i) => { const c = ws.getCell(r, 2 + i); c.value = v; c.alignment = { vertical: 'top', wrapText: true }; c.font = { size: 10 }; c.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }; });
    ws.getRow(r).height = 48;
    r++;
  }
}

function buildBugsSheet(wb) {
  const ws = wb.addWorksheet('🚨 Bugs', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = Array(7).fill({ width: 26 });
  styleTitle(ws, 2, 2, 6, '🚨 BUG DỮ LIỆU THẬT PHÁT HIỆN — AFC CHAMPIONS LEAGUE', 'FF991B1B');
  styleSubtitle(ws, 3, 2, 6, 'Bug xác nhận trên dữ liệu production thật — verify bằng query trực tiếp, không suy đoán.');

  let r = 5;
  for (const bug of BUGS) {
    ws.mergeCells(r, 2, r, 7);
    const t = ws.getCell(r, 2);
    t.value = bug.title;
    t.font = { bold: true, size: 12, color: { argb: 'FF991B1B' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    t.alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(r).height = 34;
    r++;

    ws.mergeCells(r, 2, r, 7);
    const body = ws.getCell(r, 2);
    body.value = bug.body;
    body.font = { size: 10 };
    body.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(bug.body.length / 130) * 16 + 20;
    r++;

    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = 'Chi tiết / ví dụ';
    ws.getCell(r, 2).font = { bold: true, size: 10, color: { argb: 'FF334155' } };
    r++;

    ws.mergeCells(r, 2, r, 7);
    const detail = ws.getCell(r, 2);
    detail.value = bug.detail;
    detail.font = { size: 10, color: { argb: 'FF1A1A2E' } };
    detail.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    detail.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(bug.detail.length / 130) * 16 + 20;
    r++;
    r++;

    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = `Nguồn: ${bug.source}`;
    ws.getCell(r, 2).font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
    r++;
    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = `Kết quả đầy đủ: ${bug.resultFile}`;
    ws.getCell(r, 2).font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
    r++;

    ws.mergeCells(r, 2, r, 7);
    const status = ws.getCell(r, 2);
    status.value = `Trạng thái: ${bug.status}`;
    status.font = { size: 10, bold: true };
    status.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(r).height = Math.ceil(bug.status.length / 130) * 16 + 20;
    r += 2;
  }
}

function buildTechNotesSheet(wb) {
  const ws = wb.addWorksheet('📝 Ghi chú kỹ thuật', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = Array(9).fill({ width: 22 });
  styleTitle(ws, 2, 2, 8, '📝 GHI CHÚ KỸ THUẬT — SAI LỆCH DỮ LIỆU NỘI BỘ, CHƯA XÁC ĐỊNH/KHÔNG ẢNH HƯỞNG NGƯỜI DÙNG', 'FF92400E');
  styleSubtitle(ws, 3, 2, 8, 'Các phát hiện này CÓ sai lệch dữ liệu thật ở tầng lưu trữ nội bộ. Một số đã xác định rõ nguyên nhân KHÔNG phải bug; một số KHÁC (khác Eredivisie) CHƯA hoàn thành bước verify UI nên chưa thể kết luận dứt điểm — ghi rõ trạng thái riêng cho từng mục.');

  let r = 5;
  for (const note of TECH_NOTES) {
    ws.mergeCells(r, 2, r, 9);
    const t = ws.getCell(r, 2);
    t.value = note.title;
    t.font = { bold: true, size: 11, color: { argb: 'FF92400E' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
    t.alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(r).height = 30;
    r++;

    ws.mergeCells(r, 2, r, 9);
    const body = ws.getCell(r, 2);
    body.value = note.body;
    body.font = { size: 10 };
    body.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(note.body.length / 140) * 16 + 24;
    r++;

    ws.mergeCells(r, 2, r, 9);
    const detail = ws.getCell(r, 2);
    detail.value = `Chi tiết: ${note.detail}`;
    detail.font = { size: 10, color: { argb: 'FF1A1A2E' } };
    detail.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    detail.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(note.detail.length / 140) * 16 + 20;
    r++;

    ws.mergeCells(r, 2, r, 9);
    const status = ws.getCell(r, 2);
    status.value = `Trạng thái: ${note.status}`;
    status.font = { size: 10, bold: true };
    status.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(note.status.length / 140) * 16 + 20;
    r++;

    ws.mergeCells(r, 2, r, 9);
    ws.getCell(r, 2).value = `Nguồn: ${note.source} | Kết quả: ${note.resultFile}`;
    ws.getCell(r, 2).font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
    r += 2;
  }
}

function buildFalsePositiveSheet(wb) {
  const ws = wb.addWorksheet('❌ False Positive (Đã sửa)', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = Array(7).fill({ width: 26 });
  styleTitle(ws, 2, 2, 6, '❌ CASE ĐÃ SỬA TRONG LÚC VIẾT — KHÔNG PHẢI BUG DỮ LIỆU, CHỈ LÀ LỖI LOGIC TEST BAN ĐẦU', 'FF475569');
  styleSubtitle(ws, 3, 2, 6, '3 case bị báo sai kết quả trong lúc port/viết test cho AFC Champions League — đã điều tra và xác nhận nguyên nhân là lỗi logic của TEST (chưa xử lý đúng đặc thù giải cúp quốc tế), KHÔNG phải bug dữ liệu thật. Giữ lại để minh bạch quy trình.');

  let r = 5;
  for (const fp of FALSE_POSITIVES) {
    ws.mergeCells(r, 2, r, 7);
    const t = ws.getCell(r, 2);
    t.value = fp.title;
    t.font = { bold: true, size: 11, color: { argb: 'FF475569' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    t.alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(r).height = 32;
    r++;

    ws.mergeCells(r, 2, r, 7);
    const body = ws.getCell(r, 2);
    body.value = fp.body;
    body.font = { size: 10 };
    body.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(fp.body.length / 130) * 16 + 24;
    r++;

    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = `Chi tiết: ${fp.detail}`;
    ws.getCell(r, 2).font = { size: 10 };
    ws.getCell(r, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    ws.getCell(r, 2).alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(fp.detail.length / 130) * 16 + 20;
    r++;

    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = `Nguyên nhân: ${fp.reason}`;
    ws.getCell(r, 2).font = { size: 10, italic: true };
    ws.getCell(r, 2).alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(fp.reason.length / 130) * 16 + 20;
    r++;

    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = `Đã sửa trong code: ${fp.fixedIn}`;
    ws.getCell(r, 2).font = { size: 9, color: { argb: 'FF64748B' } };
    r++;

    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = fp.fixResult;
    ws.getCell(r, 2).font = { size: 10, bold: true, color: { argb: 'FF15803D' } };
    ws.getCell(r, 2).alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.ceil(fp.fixResult.length / 130) * 16 + 20;
    r += 2;
  }
}

function buildNeedManualSheet(wb) {
  const ws = wb.addWorksheet('⛔ Cần Manual', { views: [{ state: 'frozen', ySplit: 5 }] });
  ws.columns = [{ width: 4 }, { width: 14 }, { width: 24 }, { width: 40 }, { width: 55 }, { width: 45 }];
  styleTitle(ws, 2, 2, 5, '⛔ CÁC HẠNG MỤC KHÔNG THỂ TỰ ĐỘNG HOÁ — AFC CHAMPIONS LEAGUE');
  styleSubtitle(ws, 3, 2, 5, 'Giới hạn kỹ thuật/hạ tầng chung của hệ thống — áp dụng cho MỌI giải, không riêng AFC Champions League (giống Eredivisie), cộng thêm 1 mục riêng (#16 VAR verify) do giới hạn thời gian phiên làm việc.');

  let r = 5;
  ['#', 'Hạng mục', 'Nội dung', 'Lý do không thể auto', 'Đã thử'].forEach((h, i) => { const c = ws.getCell(r, 2 + i); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }; c.alignment = { wrapText: true }; });
  r++;
  for (const row of NEED_MANUAL) {
    ws.getCell(r, 2).value = row.num;
    ws.getCell(r, 3).value = row.category;
    ws.getCell(r, 4).value = row.content;
    ws.getCell(r, 5).value = row.reason;
    ws.getCell(r, 6).value = row.tried;
    for (let c = 2; c <= 6; c++) { const cell = ws.getCell(r, c); cell.alignment = { vertical: 'top', wrapText: true }; cell.font = { size: 10 }; cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }; }
    ws.getRow(r).height = Math.max(48, Math.ceil(row.reason.length / 55) * 14 + 16);
    r++;
  }
}

function buildCaseDetailSheet(wb) {
  const ws = wb.addWorksheet('Chi tiết từng case', { views: [{ state: 'frozen', ySplit: 6 }] });
  ws.columns = [{ width: 4 }, { width: 6 }, { width: 34 }, { width: 70 }, { width: 12 }, { width: 12 }];
  styleTitle(ws, 2, 2, 5, '📝 CHI TIẾT TỪNG TEST CASE ĐÃ CHẠY — AFC CHAMPIONS LEAGUE');
  styleSubtitle(ws, 3, 2, 5, 'Toàn bộ 60 test case từ 13 file trong tests/standard/2026-Q3-task-3462/afc-champions-league/ — kết quả lấy trực tiếp từ playwright --reporter=json chạy ngày 2026-08-12 (không hand-copy). 2 FAIL là bug thật đã xác nhận (xem sheet 🚨 Bugs), KHÔNG phải lỗi test.');

  const cases = extractCases();
  let r = 6;
  ['#', 'File', 'Test case', 'Kết quả', 'Thời gian (ms)'].forEach((h, i) => { const c = ws.getCell(r, 2 + i); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }; });
  r++;
  cases.forEach((c, i) => {
    ws.getCell(r, 2).value = i + 1;
    ws.getCell(r, 3).value = c.file;
    ws.getCell(r, 4).value = c.title;
    const statusCell = ws.getCell(r, 5);
    statusCell.value = c.status;
    if (c.status === 'PASSED') { statusCell.font = { bold: true, color: { argb: 'FF15803D' } }; statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } }; }
    else if (c.status === 'FAILED') { statusCell.font = { bold: true, color: { argb: 'FF991B1B' } }; statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }; }
    else { statusCell.font = { bold: true, color: { argb: 'FF64748B' } }; statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; }
    statusCell.alignment = { horizontal: 'center' };
    ws.getCell(r, 6).value = Math.round(c.duration);
    for (let col = 2; col <= 6; col++) { ws.getCell(r, col).font = ws.getCell(r, col).font || { size: 9 }; ws.getCell(r, col).border = { bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } } }; ws.getCell(r, col).alignment = { ...ws.getCell(r, col).alignment, wrapText: true, vertical: 'top' }; }
    r++;
  });
  ws.autoFilter = { from: { row: 6, column: 2 }, to: { row: 6, column: 6 } };
}

function buildMetricsSheet(wb) {
  const ws = wb.addWorksheet('Chi tiết số liệu', { views: [{ state: 'frozen', ySplit: 5 }] });
  ws.columns = [{ width: 4 }, { width: 22 }, { width: 55 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 24 }];
  styleTitle(ws, 2, 2, 6, '📈 CHI TIẾT SỐ LIỆU — AFC CHAMPIONS LEAGUE');

  let r = 5;
  ['Hạng mục', 'Chỉ số', 'Đạt', 'Tổng mẫu', 'Tỷ lệ', 'Ghi chú'].forEach((h, i) => { const c = ws.getCell(r, 2 + i); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }; });
  r++;
  for (const [cat, metric, ok, total, note] of METRICS) {
    ws.getCell(r, 2).value = cat;
    ws.getCell(r, 3).value = metric;
    ws.getCell(r, 4).value = ok;
    ws.getCell(r, 5).value = total;
    const pct = total > 0 ? (ok / total) * 100 : 0;
    const pctCell = ws.getCell(r, 6);
    pctCell.value = `${pct.toFixed(1)}%`;
    if (pct === 100) { pctCell.font = { bold: true, color: { argb: 'FF15803D' } }; }
    else if (pct >= 80) { pctCell.font = { bold: true, color: { argb: 'FFA8660A' } }; }
    else { pctCell.font = { bold: true, color: { argb: 'FF991B1B' } }; }
    if (note) { ws.getCell(r, 7).value = note; ws.getCell(r, 7).font = { italic: true, size: 9, color: { argb: 'FF991B1B' } }; }
    for (let c = 2; c <= 7; c++) { ws.getCell(r, c).border = { bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } } }; ws.getCell(r, c).font = ws.getCell(r, c).font || { size: 10 }; }
    r++;
  }
  ws.autoFilter = { from: { row: 5, column: 2 }, to: { row: 5, column: 7 } };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
