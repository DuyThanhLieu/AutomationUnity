import ExcelJS from 'exceljs';
import path from 'path';

const OUT = path.join(process.cwd(), 'REPORT_TongHop_ToanBoProject.xlsx');

// ============ DATA (khảo sát toàn bộ 167 file .spec.ts + đọc sâu nội dung test case text) ============
// feature: mảng các chức năng con (mỗi phần tử = 1 gạch đầu dòng trong Excel)
// tests: số test case CODE (test()/it() trong file)
// textCases: số test case dạng TEXT (mảng TEST_CASES/CHECKLIST/AC liệt kê trong file, không phải test() thật) — 0 nếu không có

const rows = [
  // ===================== PHẦN A0 — Script thủ công ngoài tests/ (mới bổ sung) =====================
  { group: 'A0. Script thủ công (scripts/, ngoài tests/)', file: 'scripts/check_mongo_mapping.mjs', task: '2557 (liên quan)', api: 'opta-api.uniscore.vn/api/v1/encode/{id} + api.unik8s.com/api/v2/football/event/{id} + MongoDB mapping_matches', feature: [
    'Đọc Excel "Mapping coverage TheSport vs Footystats.xlsx" để lấy danh sách TheSport ID cần kiểm tra',
    'Đối chiếu MongoDB collection mapping_matches xem đã map đúng chưa',
    'Gọi PROD API kiểm tra field has_advanced_stats (quyết định tab Analytics có hiển thị hay không)',
    '⚠️ Lưu ý bảo mật: MongoDB URI có credential dạng plaintext hard-code trong source (mongodb://readonly:...@<MONGO_HOST>) — nên chuyển sang biến môi trường',
  ], tests: 0, textCases: 0, updated: '(không rõ ngày, chưa từng đưa vào báo cáo trước đây)' },

  { group: 'A0. Script thủ công (scripts/, ngoài tests/)', file: 'tests/test_flow_mqtt.js', task: '(tool debug MQTT)', api: 'MQTT broker (topic fb-live-v1) + tuỳ chọn INGEST_URL', feature: [
    'Tool giám sát/debug thủ công (chạy tay, không có assertion PASS/FAIL) — subscribe MQTT realtime, decode payload nén zlib',
    'Ghi log incidents/score ra file để xem thủ công',
    'KHÁC với check_socket.spec.ts/var_outcome_socket_check.spec.ts (đã có automation) — đây chỉ là tool hỗ trợ, không phải test case chính thức',
  ], tests: 0, textCases: 0, updated: '(tool hỗ trợ, không phải test case)' },

  // ===================== PHẦN A — Top-level tests/*.spec.ts =====================
  { group: 'A. Top-level', file: 'tests/[Api][Football][General] Cập nhật avatar cầu thủ Bundesliga MLS-3594.spec.ts', task: 'US-3594', api: 'img-stag.uniscore.vn/__opta/football/player/{id}/image/{small|medium}', feature: [
    'Verify mỗi player MLS 2026 mới bổ sung có avatar Opta trả về HTTP 200 trên staging',
    'Đối chiếu theo danh sách build report CSV (mls_2026_updated.csv)',
    'Xuất report Excel kết quả kiểm tra avatar',
  ], tests: 2, textCases: 0, updated: '2026-08-13' },

  { group: 'A. Top-level', file: 'tests/[Api][Football][Top League Locale] _3226.spec.ts', task: 'US-3226', api: 'opta-api.uniscore.vn/api/v2/football/competition/top-leagues/lang/{code}', feature: [
    'Giả lập IP (Fake-IP) đổi locale để kiểm tra thứ tự Top League trả về đúng theo quốc gia',
    'Đối chiếu response API với thứ tự Tier trong file Excel gốc',
    'Kiểm tra tính nhất quán dữ liệu giữa các locale',
  ], tests: 3, textCases: 0, updated: '2026-07-29' },

  { group: 'A. Top-level', file: 'tests/[App][Football] Update screenshot trên Android-3521.spec.ts', task: 'US-3521', api: 'Google Play Store (play.google.com/store/apps/details)', feature: [
    'Verify Google Play Store đã cập nhật đúng bộ ảnh screenshot cho locale World',
    'Verify bộ ảnh cho locale Thailand',
    'Verify bộ ảnh cho locale Indonesia',
    'Verify bộ ảnh cho locale Campuchia',
    'Verify bộ ảnh cho locale Brazil',
  ], tests: 4, textCases: 0, updated: '2026-07-30' },

  { group: 'A. Top-level', file: 'tests/[Web|App][Football] Update những vị trí hiển thị AG-AGG-3271.spec.ts', task: 'US-3271', api: 'staging.uniscore.vn/en', feature: [
    '[1] Homepage — hiển thị AGG (Aggregate score) cho trận đấu 2 lượt',
    '[2] Search — xác nhận KHÔNG áp dụng AGG (đúng theo thiết kế, baseline)',
    '[3] League Overview — Featured/Last match có AGG, tab Upcoming không có',
    '[4] List Match (League) — sub-tab Results có AGG, Upcoming không có',
    '[5] H2H (match detail) — header và list trận riêng của từng đội có AGG',
    '[6] Referee — tab Overview và List match có AGG',
    '[7] Relevant matches (Other Info) — có AGG',
    '[8] Bracket — BASELINE xác nhận hiện KHÔNG hiển thị AGG (nghi vấn thiếu sót, cần BA xác nhận)',
    '[9] Favorite — verify nút yêu thích tồn tại (không verify sâu vì cần đăng nhập)',
    'Loại trừ khỏi phạm vi: Match details, Pop-up team, Overview-Upcoming, Overview-Competitions',
  ], tests: 15, textCases: 0, updated: '2026-07-31' },

  { group: 'A. Top-level', file: 'tests/[Web|App][Football][Match-Detail] Other info - TV channels.spec.ts', task: '(TV channels)', api: 'cdnapi.lstvapi.com', feature: [
    'AC7.1/7.2 — Field "TV channels" trong Other Info hiển thị đúng',
    'Dropdown chọn quốc gia hoạt động đúng',
    'Danh sách kênh sort theo alphabet',
    'BR1 — đối chiếu tên kênh với dữ liệu LSTV API',
    'AC7.3/7.5 — case biên khi không có kênh phát sóng',
  ], tests: 8, textCases: 0, updated: '2026-07-24' },

  { group: 'A. Top-level', file: 'tests/api_check_connectdb.spec.ts', task: '(DB check STAGING)', api: 'opta-api.uniscore.vn/api/v1 (encode + incidents)', feature: [
    'Kết nối DB opta_match_info JOIN mp_match',
    'Validate logic added-time (bù giờ) hiệp 2 trên ~11,183 trận',
  ], tests: 2, textCases: 0, updated: '2026-06-17' },

  { group: 'A. Top-level', file: 'tests/api_check_connectdb_prod.spec.ts', task: '(DB check PRODUCTION)', api: 'api.unik8s.com/api/v2', feature: [
    'Bản PRODUCTION của api_check_connectdb — cùng logic added-time hiệp 2 nhưng trên môi trường PROD',
  ], tests: 2, textCases: 0, updated: '2026-06-25' },

  { group: 'A. Top-level', file: 'tests/check_US[1311]_staging.spec.ts', task: 'US-1311', api: 'opta-api.uniscore.vn/api/v2', feature: [
    'Verify team_shirt.team_id đúng qua encode + event API',
    'Verify teamShirtColor API /lineups khớp DB theo rule ưu tiên CDN > Opta kit color',
  ], tests: 2, textCases: 0, updated: '2026-07-17' },

  { group: 'A. Top-level', file: 'tests/check_sidebar_geo_fallback.spec.ts', task: '(bugfix sidebar)', api: 'api.unik8s.com/api/v1/country/alpha2 (mock)', feature: [
    'SIMULATE FAIL — Sidebar "Giải Đấu Nổi Bật" khi geo API trả lỗi',
    'SIMULATE TIMEOUT — Sidebar khi geo API timeout',
    'BASELINE — verify fallback không bị kẹt loading khi API OK',
  ], tests: 3, textCases: 0, updated: '2026-07-24' },

  { group: 'A. Top-level', file: 'tests/check_socket.spec.ts', task: '(MQTT check)', api: 'MQTT broker', feature: [
    'Subscribe topic match qua MQTT',
    'Decode payload nén zlib',
    'Validate thứ tự incident (ordering) nhận được qua socket',
  ], tests: 1, textCases: 0, updated: '2026-06-23' },

  { group: 'A. Top-level', file: 'tests/check_team_shirt_image_vs_cdn.spec.ts', task: '(liên quan US-1311)', api: 'assets.uniscore.com/team-shirt/{id}/{home|away}.webp', feature: [
    'So sánh PIXEL thật giữa ảnh design gốc (Google Drive) và ảnh đang phục vụ trên CDN team-shirt',
  ], tests: 1, textCases: 0, updated: '2026-07-17' },

  { group: 'A. Top-level', file: 'tests/check_us[3226].spec.ts', task: 'US-3226', api: '(file rỗng)', feature: ['File rỗng — không có nội dung test'], tests: 0, textCases: 0, updated: '2026-07-16' },

  { group: 'A. Top-level', file: 'tests/checkapi_vsdbOptasub[1311].spec.ts', task: 'US-1311', api: 'api.unik8s.com/api/v2 (PROD)', feature: [
    'So sánh teamShirtColor API /lineups vs DB opta_match_lineup.kit.colour1 trên môi trường PROD',
  ], tests: 1, textCases: 0, updated: '2026-07-27' },

  { group: 'A. Top-level', file: 'tests/compare-team-event.spec.ts', task: '(Compare Staging/Prod)', api: 'unique-tournament/.../team-events/total', feature: [
    'Compare Standings (bảng xếp hạng) giữa Staging vs Production',
  ], tests: 1, textCases: 0, updated: '2026-06-17' },

  { group: 'A. Top-level', file: 'tests/compare_sheet_vs_prod[2557].spec.ts', task: '2557', api: 'api.unik8s.com/api/v2', feature: [
    'Kiểm tra mapping FootyStats cho tab Analytics',
    'Đối chiếu Excel (TheSport ID) → encode → PROD API → has_advanced_stats',
  ], tests: 2, textCases: 0, updated: '2026-07-07' },

  { group: 'A. Top-level', file: 'tests/db-check.spec.ts', task: '(Health check)', api: 'DB api_ts', feature: [
    'Kết nối được database',
    'Liệt kê danh sách bảng (tables)',
    'Verify các bảng bắt buộc tồn tại',
    'Kiểm tra version DB',
    'Kiểm tra không có bảng trùng lặp',
  ], tests: 6, textCases: 0, updated: '2026-07-02' },

  { group: 'A. Top-level', file: 'tests/detailball.spec.ts', task: '(Compare Staging/Prod)', api: 'tournament/.../team-events/total', feature: [
    'Compare Standings chi tiết đội bóng giữa Staging vs Production',
  ], tests: 1, textCases: 0, updated: '2026-06-11' },

  { group: 'A. Top-level', file: 'tests/incidents_production.spec.ts', task: '(PROD incidents)', api: 'api.unik8s.com/api/v2', feature: [
    'Production incidents API cross-check với DB',
    'Validate logic bù giờ hiệp 2 trên môi trường PROD',
  ], tests: 2, textCases: 0, updated: '2026-06-17' },

  { group: 'A. Top-level', file: 'tests/lineup_order_check.spec.ts', task: '(bug lineup order)', api: '(DB/FE)', feature: [
    'Verify thứ tự cầu thủ trong Match Lineups: cầu thủ "first=1" phải đúng theo formation + tọa độ (x,y)',
    'Thay thế logic cũ (dựa field position/ngưỡng y) bằng logic mới chính xác hơn',
  ], tests: 1, textCases: 0, updated: '2026-07-15' },

  { group: 'A. Top-level', file: 'tests/login_daily_check.spec.ts', task: '(daily smoke)', api: 'uniscore.com', feature: [
    'Đăng nhập uniscore.com bằng Google OAuth — smoke test chạy hàng ngày',
  ], tests: 1, textCases: 0, updated: '2026-06-23' },

  { group: 'A. Top-level', file: 'tests/Mapping_coverage_ThesportvsFootystats.spec.ts', task: '(Mapping coverage)', api: 'tournament/.../standings/total', feature: [
    'Compare One Team Staging vs Production — kiểm tra độ phủ mapping TheSport ↔ FootyStats',
  ], tests: 1, textCases: 0, updated: '2026-06-18' },

  { group: 'A. Top-level', file: 'tests/[API][Football][Club] Cập nhật logo/avatar Opta-3247.spec.ts', task: 'US-3247', api: 'img-stag.uniscore.vn/__opta/football/player/{id}/image/{size}', feature: [
    'Verify avatar cầu thủ nhóm "mapped" có ảnh Opta thật trên staging (200 vs 404)',
    'Đối chiếu theo Excel "Opta Avatar Mapping Report.xlsx" (8,522 dòng, sheet Player Detail)',
  ], tests: 2, textCases: 0, updated: '2026-07-27' },

  { group: 'A. Top-level', file: 'tests/player-detail-api-internalchecknull.spec.ts', task: '(bug Internal API null)', api: 'staging-nginx-internal.uniscore.vn/api/v1/football/player', feature: [
    'Phát hiện bug: Internal API trả data=null (silent-fail, HTTP 200 vẫn trả 200) trong khi Public API có data',
    'Xác định nguyên nhân: cache DTO không khớp giữa 2 tầng API',
    'Đối chiếu Internal vs Public vs Web (FE) trên cùng player',
  ], tests: 3, textCases: 0, updated: '2026-08-04' },

  { group: 'A. Top-level', file: 'tests/player-honors-api-vs-db.spec.ts', task: '(bug honors sync)', api: 'opta-api.uniscore.vn/api/v2/football/player/{id}/honors', feature: [
    'Phát hiện bug: API /player/{id}/honors trả data đầy đủ nhưng DB bảng player_honor thiếu hoàn toàn record',
    'Phát hiện ban đầu qua case Ayase Ueda, mở rộng verify diện rộng 42 player khác',
  ], tests: 1, textCases: 0, updated: '2026-08-05' },

  { group: 'A. Top-level', file: 'tests/uniscore-filter.spec.ts', task: '(smoke filter)', api: 'uniscore.com', feature: [
    'Verify 4 nút Filter: All / Live / Upcoming / Finish hoạt động đúng trên trang chủ',
  ], tests: 8, textCases: 0, updated: '2026-06-11' },

  { group: 'A. Top-level', file: 'tests/uniscore-navigation.spec.ts', task: '(smoke navigation)', api: 'uniscore.com', feature: [
    'Verify Navigation Bar và các Sport Tabs (Bóng đá, Basketball, Tennis, ...) chuyển trang đúng',
  ], tests: 9, textCases: 0, updated: '2026-06-11' },

  { group: 'A. Top-level', file: 'tests/uniscore-page.spec.ts', task: '(smoke page)', api: 'uniscore.com', feature: [
    'Suite 1 — Cấu trúc trang: tiêu đề, HTTP 200, navigation bar, tab Bóng đá, không broken image, không lỗi 404/500',
    'Suite 2 — Filter All: active mặc định, các filter khác không active, danh sách trận hợp lệ (tên đội, tỉ số, đội nhà≠khách)',
    'Suite 3 — Filter Live: badge live và tỉ số live là số nguyên không âm',
    'Suite 4 — Filter Upcoming: định dạng giờ HH:MM, không hiển thị tỉ số, không có trận FT',
    'Suite 5 — Filter Finished: có ít nhất 1 trận, status hợp lệ (FT/HT/AET/PEN/AP)',
    'Suite 6 — Date navigation hôm nay: điều hướng Today, filter All có trận',
    'Suite 7 — Date navigation ngày tương lai: URL đúng, không có trận FT ở tương lai',
    'Suite 8 — Kết hợp Date + Filter: các tổ hợp Hôm nay/Ngày mai × Upcoming/Finished/Live, điều hướng liên tiếp 3 ngày',
  ], tests: 37, textCases: 0, updated: '2026-06-23' },

  { group: 'A. Top-level', file: 'tests/upcoming_fakeip_time.spec.ts', task: '(bug Upcoming chỉ trả 2 trận)', api: 'opta-api.uniscore.vn/api/v2/sport/football/scheduled-events-pagination-v2', feature: [
    'BUG FIX — verify response structure hợp lệ (events + otherCompetitions)',
    '[Bug#1] Data completeness: events + otherCompetitions = total; verify ngày traffic thấp otherCompetitions không rỗng; verify ngày phát hiện bug gốc không còn crash',
    '[Bug#2] Tab Upcoming: tất cả trận trả về đều có status=not_started',
    '[Regression] sortByMatchTime, ngày traffic cao, filter theo competitionIds',
    '[QC] Độ đa dạng của events trả về',
    '[Pagination] Page 2 khác page 1, hasNextPage chính xác',
    'Brazil IP — São Paulo timezone: completeness "Ngày Mai", boundary trận 21:00-23:59 SP, hôm nay+ngày mai đầy đủ',
    'otherCompetitions match_count chỉ đếm not_started — verify khớp DB (±5), tổng sum khớp pagination.total',
    'Date Range Coverage — quét tất cả các ngày: structure/completeness/status hợp lệ, sweep không crash',
    'Multi-Locale Timezone smoke test — nhiều locale, cross-locale không crash',
  ], tests: 26, textCases: 0, updated: '2026-06-22' },

  { group: 'A. Top-level', file: 'tests/upcoming_production.spec.ts', task: '(PROD của upcoming_fakeip_time)', api: 'api.unik8s.com/api/v2/sport/football', feature: [
    'Completeness check trên môi trường PRODUCTION',
    'Đối chiếu DB vs API cho trận NOT_STARTED',
    'Verify locale VN/BR, timezone boundary',
  ], tests: 6, textCases: 0, updated: '2026-06-22' },

  { group: 'A. Top-level', file: 'tests/var_outcome_check.spec.ts', task: '(VAR World Cup 2026)', api: 'opta-api.uniscore.vn/api/v2', feature: [
    'So sánh varOutcome (kết quả VAR) từ API v2 incidents vs DB (opta_match_var)',
    'Chạy trên 51 trận World Cup 2026 đã kết thúc',
  ], tests: 2, textCases: 0, updated: '2026-07-02' },

  { group: 'A. Top-level', file: 'tests/var_outcome_socket_check.spec.ts', task: '(VAR + Socket)', api: 'opta-api.uniscore.vn/api/v2 + MQTT', feature: [
    'So sánh 3 chiều: Socket (MQTT realtime) vs API v2 vs DB cho trận đang LIVE',
  ], tests: 1, textCases: 0, updated: '2026-06-26' },

  // ===================== PHẦN B — Template chuẩn =====================
  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/00-context-verify.spec.ts', task: '(Template)', api: '(competition-context.ts)', feature: [
    '[Core] Verify Context load được và có đủ thông tin cơ bản (mapping competition ID đúng)',
  ], tests: 1, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/01-competition-info.spec.ts', task: '(Template)', api: '(DB)', feature: [
    '[Chuẩn #1] Thông tin cơ bản giải đấu (Tên, Logo, Mùa giải, Thể thức) hợp lệ trong DB',
    'Context Opta mapping — xác nhận có chạy được cho các hạng mục khác không',
  ], tests: 2, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/02-bxh-ranking.spec.ts', task: '(Template)', api: '(DB)', feature: [
    '[Chuẩn #4] Rank monotonic theo điểm (Rank 1 > Rank 2 điểm số)',
    'Promotion/Relegation không chồng chéo',
    'Trang BXH trên uniscore.com tải được',
  ], tests: 5, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/03-lich-thi-dau.spec.ts', task: '(Template)', api: '(DB)', feature: [
    '[Chuẩn #2] Trận có round_num/stage/giờ hợp lệ',
    'Round_num tăng dần theo thời gian (cho phép lệch <20% do đá bù)',
  ], tests: 3, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/04-h2h.spec.ts', task: '(Template)', api: '(DB)', feature: [
    '[Chuẩn #6] Tính H2H (đối đầu) từ các trận đã kết thúc trong DB',
    'Thống kê tổng quan: home win rate, tổng bàn thắng, trung bình bàn/trận',
  ], tests: 2, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/05-team-info.spec.ts', task: '(Template)', api: '(DB)', feature: [
    '[Chuẩn #7] Danh sách đội của giải (tên, logo, coach, venue)',
    'Logo đội load được qua HTTP (sample tối đa 20 đội)',
  ], tests: 3, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/06-lineup-players.spec.ts', task: '(Template)', api: '(DB)', feature: [
    '[Chuẩn #8/#13] Đội hình trận đã kết thúc đủ 11 người, đúng formation, shirt_number hợp lệ',
    'Chuyển nhượng (from/to team, market value)',
    'Chấn thương — bung JSONB array đúng cách theo TEAM',
  ], tests: 6, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/07-match-events.spec.ts', task: '(Template)', api: '(DB)', feature: [
    '[Chuẩn #16] Trận có Opta event feed với thời gian hợp lệ',
    'Bàn thắng trong opta_match_event khớp tỷ số thật (sport_event_status)',
  ], tests: 4, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/08-match-statistics.spec.ts', task: '(Template)', api: '(DB)', feature: [
    '[Chuẩn #19] Possession, Passes accuracy, Shots on goal hợp lệ',
    'xG hợp lệ (≥0, xGOT ≤ xG)',
  ], tests: 4, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/09-search.spec.ts', task: '(Template)', api: 'api.uni-score.com/api/v2/search/all', feature: [
    '[Chuẩn #9] Search tên giải đấu trả đúng loại "competition"',
    'Search tên đội trả đúng loại "competitor"',
    'Query rác trả rỗng, không lỗi 500',
  ], tests: 4, textCases: 0, updated: '2026-08-05' },

  { group: 'B. Template chuẩn (dùng lại cho mọi giải)', file: 'tests/standard/_template/10-multilanguage.spec.ts', task: '(Template)', api: 'uniscore.com/football/competition/{slug}', feature: [
    '[Chuẩn #11/#20] Tên đội có bản dịch tiếng Việt/Thái',
    'Tên giải có bản dịch tiếng Việt/Thái',
    'Bình luận trận đấu (commentary) có nội dung theo locale',
  ], tests: 6, textCases: 0, updated: '2026-08-05' },

  // ===================== PHẦN C — US-3462 (8 giải, áp dụng template) =====================
  { group: 'C. US-3462 — Áp dụng khung chuẩn cho 8 giải', file: 'tests/standard/2026-Q3-task-3462/afc-champions-league/ (13 file: 01-10 + 02b, 06b, 07b)', task: 'US-3537', api: '(DB + FE staging)', feature: [
    '10 hạng mục chuẩn (Giải đấu, BXH, Lịch thi đấu, H2H, Đội bóng, Cầu thủ&Đội hình, Sự kiện, Thống kê, Tìm kiếm, Đa ngôn ngữ)',
    '[Mở rộng #5] Logic giải — agg_score cuptree, overTime_score, penalty shootout, Swiss-style group stage, seasonal_statistics cross-check',
    '[Mở rộng #8] Player Season Stats — goals cross-check opta_match_event, positions JSONB, player_locale coverage',
    '[Mở rộng #18] Timeline trận đấu — period/time_stamp tăng dần, Frontend API graph momentum',
  ], tests: 113, textCases: 0, updated: '2026-08-11' },

  { group: 'C. US-3462 — Áp dụng khung chuẩn cho 8 giải', file: 'tests/standard/2026-Q3-task-3462/eredivisie/ (13 file: 01-10 + 02b, 06b, 07b)', task: 'US-3536', api: '(DB + FE staging)', feature: [
    '10 hạng mục chuẩn (giống AFC Champions League)',
    '[Mở rộng #5] Logic giải — cuptree/hiệp phụ/penalty',
    '[Mở rộng #8] Player Season Stats',
    '[Mở rộng #18] Timeline trận đấu',
  ], tests: 121, textCases: 0, updated: '2026-08-07' },

  { group: 'C. US-3462 — Áp dụng khung chuẩn cho 8 giải', file: 'tests/standard/2026-Q3-task-3462/english-premier-league/ (10 file: 01-10)', task: 'US-3540', api: '(DB + FE staging)', feature: ['10 hạng mục chuẩn: Giải đấu, BXH, Lịch thi đấu, H2H, Đội bóng, Cầu thủ&Đội hình, Sự kiện, Thống kê, Tìm kiếm, Đa ngôn ngữ'], tests: 38, textCases: 0, updated: '2026-08-05' },

  { group: 'C. US-3462 — Áp dụng khung chuẩn cho 8 giải', file: 'tests/standard/2026-Q3-task-3462/english-community-shield/ (10 file: 01-10)', task: 'US-3539', api: '(DB + FE staging)', feature: ['10 hạng mục chuẩn (giống Premier League)'], tests: 38, textCases: 0, updated: '2026-08-05' },

  { group: 'C. US-3462 — Áp dụng khung chuẩn cho 8 giải', file: 'tests/standard/2026-Q3-task-3462/uefa-champions-league/ (10 file: 01-10)', task: 'US-3541', api: '(DB + FE staging)', feature: ['10 hạng mục chuẩn (giống Premier League)'], tests: 38, textCases: 0, updated: '2026-08-05' },

  { group: 'C. US-3462 — Áp dụng khung chuẩn cho 8 giải', file: 'tests/standard/2026-Q3-task-3462/uefa-nations-league/ (10 file: 01-10)', task: 'US-3542', api: '(DB + FE staging)', feature: ['10 hạng mục chuẩn (giống Premier League)'], tests: 38, textCases: 0, updated: '2026-08-05' },

  { group: 'C. US-3462 — Áp dụng khung chuẩn cho 8 giải', file: 'tests/standard/2026-Q3-task-3462/uefa-super-cup/ (10 file: 01-10)', task: 'US-3538', api: '(DB + FE staging)', feature: ['10 hạng mục chuẩn (giống Premier League)'], tests: 38, textCases: 0, updated: '2026-08-05' },

  { group: 'C. US-3462 — Áp dụng khung chuẩn cho 8 giải', file: 'tests/standard/2026-Q3-task-3462/injury-time/injury-time.spec.ts', task: '(TheSport injuryTime)', api: 'api.uni-score.com/api/v2/football/event/{id}/overview + MQTT fb-live-v1', feature: [
    'AC#1-#6 — Verify injury time hiển thị đúng ở phút 44-45 và 89-90',
    'Verify MQTT topic fb-live-v1 realtime',
    'API announcedInjuryTime đơn vị giây chính xác',
    'Extra time không bị leak sang hiệp khác',
  ], tests: 15, textCases: 0, updated: '2026-08-11' },

  // ===================== PHẦN D — US-898 Odds =====================
  { group: 'D. US-898 Odds Service', file: 'tests/standard/2026-Q3-task-898-odds-service/01-nestjs-spec-verify.spec.ts', task: 'US-898', api: 'opta-api.uniscore.vn (NestJS Odds Service)', feature: [
    '11 route trả HTTP 200 + đúng envelope đặc tả (market_all, odds-changes có/không prefix, odds/:provider/all, winning-odds double/single-nest, odd-live-change, date sai format không lỗi)',
    'Param bẫy: sport_event_id uuid thô, [BUG CONFIRMED] half khác 0/1 trả RỖNG khác doc, provider_id không phải số, included_zero=1, offset',
    'market_id (17 loại) hành vi half=1: verify từng market có/không data',
    'market_all — verify code trả về theo nhóm market, [GAP so với doc] doubleChance code không cố định, market lạ → code=-1',
  ], tests: 20, textCases: 0, updated: '2026-08-27' },

  { group: 'D. US-898 Odds Service', file: 'tests/standard/2026-Q3-task-898-odds-service/02-go-vs-nestjs-compare.spec.ts', task: 'US-898', api: 'Go local :8090 vs NestJS opta-api', feature: [
    'So sánh market_all: 15 market × 2 half × 2 trận = 60/60 giống hệt giữa Go và NestJS',
    'So sánh các route khác: odds-changes (2 dạng prefix), odds/:provider/all, odd-live-change — giống hệt',
    '[Cố ý #1] /provider/:id — Go luôn lọc đúng 1 company (NestJS có bug cache)',
    '[Cố ý #2] std1x2 half=1 cột "v" — Go khớp Postgres (NestJS có thể hoán home<->draw)',
    'Tự động SKIP nếu server Go local chưa chạy',
  ], tests: 10, textCases: 0, updated: '2026-08-27' },

  // ===================== PHẦN E — US-900 Player Honor Service =====================
  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/01-p1-endpoints-baseline.spec.ts', task: 'US-900', api: 'PLAYER_BASE.staging', feature: [
    '11 endpoint traffic cao nhất (4k-20k req/24h): transfer-history, summary, characteristics, honors, national/statistics, team-honors (+HEAD), individual-awards (+HEAD), injury, attribute-overviews, statistics/overall-v2, competition/season/stats/page',
    '2 endpoint đã port sang Go nhưng cutover ingress còn PENDING: GET /player/:ref_id, GET /player/:ref_id/events/last/:page',
  ], tests: 13, textCases: 0, updated: '2026-08-27' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/02-p2-p3-endpoints-baseline.spec.ts', task: 'US-900', api: 'PLAYER_BASE.staging', feature: [
    'P2 — 2 endpoint traffic trung bình (700-1.2k req/24h)',
    'P3 — 4 endpoint traffic thấp (<700 req/24h)',
    '3 route HEAD CheckTab',
  ], tests: 7, textCases: 0, updated: '2026-09-16' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/03-legacy-alias-routes.spec.ts', task: 'US-900', api: 'opta-api.uniscore.vn/api/v2/player/... (legacy alias, không có football/)', feature: [
    'Verify 4 route legacy alias có traffic thật phải giữ tương thích ngược',
  ], tests: 8, textCases: 0, updated: '2026-08-27' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/04-go-staging-19-endpoints.spec.ts', task: 'US-900', api: 'staging-player-svc.uniscore.vn (Go) vs opta-api (NestJS legacy)', feature: [
    'Đối chiếu 19 endpoint domain Go mới vs domain NestJS cũ',
  ], tests: 3, textCases: 0, updated: '2026-08-28' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/05-export-bug-report.spec.ts', task: 'US-900', api: '(export báo cáo)', feature: [
    'Export Excel BUG_REPORT_US900_Player.xlsx: 3 lỗi chi tiết (tournament.id sai ở domain cũ, thiếu xgOverall/goalsPrevented, thiếu bản snake_case overall-v2)',
    'Danh sách 16 endpoint đã khớp 100% giữa 2 domain',
  ], tests: 1, textCases: 0, updated: '2026-08-28' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/06-known-bugs.spec.ts', task: 'US-900', api: 'NESTJS_LEGACY vs GO_STAGING', feature: [
    '[BUG-1] tournament.id sai ở domain CŨ (events/last không resolve, domain mới đúng) — mở rộng lặp lại ở giải World Cup Qualification UEFA (case Barcola)',
    '[BUG-2] Domain MỚI thiếu field xG mùa giải: statistics/overall thiếu xgOverall+goalsPrevented, statistics/overall-v2 thiếu bản snake_case',
    'Mở rộng verify bug lặp lại hệ thống qua nhiều player (Barcola)',
    'Case biên thủ môn (Chevalier) — goalsPrevented=0.4281 là bằng chứng mạnh xác nhận bug',
  ], tests: 6, textCases: 8, updated: '2026-08-28' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/07-export-test-logic-and-cases.spec.ts', task: 'US-900', api: '(export báo cáo)', feature: [
    'Export Excel TESTLOGIC_US900_2Bugs.xlsx — 8 test case (TC-01→08): so sánh tournament.id 2 domain, xác minh qua trọng tài độc lập, so sánh xgOverall/goalsPrevented, xác minh DB, so sánh snake_case overall-v2, mở rộng player khác (Barcola), case biên thủ môn (Chevalier), mở rộng BUG-1 sang giải khác',
    '2 dòng Test Logic (phương pháp suy luận cho BUG-1, BUG-2)',
    'Bảng "Mẫu mở rộng nhiều player" (5 dòng)',
  ], tests: 1, textCases: 8, updated: '2026-08-28' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/08-export-full-task-logic-and-cases.spec.ts', task: 'US-900', api: '(export báo cáo, sinh động từ registry 19 endpoint + 4 alias)', feature: [
    'Export Excel TESTLOGIC_US900_FullTask.xlsx — toàn bộ 19 endpoint + 4 alias route',
    '6 nhóm phương pháp verify: A.Thông tin tĩnh, B.Danh hiệu, C.Thống kê mùa giải, D.Trận đấu/sự kiện, E.Danh sách/phân trang, F.Route legacy alias',
    'Bảng "2 Bug đã xác nhận" (BUG-1 đã đóng, BUG-2 đã fix)',
  ], tests: 1, textCases: 19, updated: '2026-08-28' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/09-multi-player-and-edge-cases.spec.ts', task: 'US-900', api: 'PLAYER_BASE', feature: [
    '19 endpoint chạy qua 4 player mới (Barcola, Ramos, Doue, Chevalier)',
    'Edge case: player không tồn tại',
    'Edge case: player ID sai định dạng',
  ], tests: 5, textCases: 0, updated: '2026-08-28' },

  { group: 'E. US-900 Player Honor Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-900-player-honor-service/10-multi-season-tournament-and-http-method.spec.ts', task: 'US-900', api: 'PLAYER_BASE', feature: [
    'Nhiều mùa giải khác nhau (Bayern Munich trước Lyon)',
    'Nhiều giải đấu (Bundesliga, Champions League)',
    'HTTP method không hợp lệ',
    'Query param lạ',
  ], tests: 6, textCases: 0, updated: '2026-08-28' },

  // ===================== PHẦN F — US-3369 Coach Service =====================
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369-coach-service/01-coach-domain-verify.spec.ts', task: 'US-3369', api: 'opta-api.uniscore.vn/api/v2/football/coach', feature: [
    '6 route đều trả 200 + có field error_code (dấu hiệu Go): info, career-history, last-matches, performance, stats, career-history-seasons-detail',
    'Đối chiếu chéo giữa các route: tổng "matches" khớp giữa info/stats/career-history',
    'career-history-seasons-detail tổng totalMatches ≤ tổng matches ở stats',
  ], tests: 8, textCases: 0, updated: '2026-08-27' },

  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/01-coach-endpoints-old-vs-new.spec.ts', task: 'US-3369', api: 'opta-api vs staging-player-svc', feature: ['7 endpoint, so sánh 116 coach giữa Old (NestJS) vs New (Go)'], tests: 1, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/02-coach-invalid-ref-id.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['Verify ref_id đúng format', 'Verify ref_id sai format'], tests: 2, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/03-coach-live-match-realtime.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['Coach đang có trận LIVE — retry nhiều lần để bắt đúng trạng thái realtime'], tests: 2, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/04-coach-multi-locale.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['Nhiều locale (vi/es/pt/ar/xx/123)'], tests: 2, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/05-coach-bulk-2000.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['Quét bulk 2000 coach × 7 endpoint để tìm lỗi hiếm'], tests: 1, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/06-coach-unicode-encoding.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['Tên có ký tự đặc biệt/unicode (romanized)'], tests: 1, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/07-coach-latency-comparison.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['So sánh latency p95 giữa 2 domain, 300 coach × 7 endpoint'], tests: 1, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/08-coach-multi-season.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['7/8 mùa giải khác nhau (2023/2024 → 2027)'], tests: 1, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/09-coach-tournament-types.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['7 loại giải đấu khác nhau (World Cup, Champions League, V-League...)'], tests: 1, textCases: 0, updated: '2026-08-25' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/10-coach-cache-stability.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['Kiểm tra cache drift theo thời gian, sort đệ quy array để so sánh ổn định'], tests: 1, textCases: 0, updated: '2026-08-26' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/11-coach-invalid-http-method.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['HTTP method không hợp lệ — phát hiện HEAD lệch (200 vs 404) giữa 2 domain'], tests: 1, textCases: 0, updated: '2026-08-26' },
  { group: 'F. US-3369 Coach Service (migrate NestJS→Go)', file: 'tests/standard/2026-Q3-task-3369/coach-migration/12-coach-query-params-and-headers.spec.ts', task: 'US-3369', api: '(Coach API)', feature: ['Query param lạ', 'Response headers (CORS, x-service-name)', 'Concurrent request'], tests: 4, textCases: 0, updated: '2026-08-28' },

  // ===================== PHẦN G — US-3508 Datalytics =====================
  { group: 'G. US-3508 Datalytics (field & cache)', file: 'tests/standard/2026-Q3-task-3508/datalytics/01-api-fields.spec.ts', task: 'US-3508', api: 'opta-api.uniscore.vn/api/v1/matches/datalytics', feature: [
    'H2HStats — field bổ sung theo AC phải tồn tại',
    'H2HStats — field CHƯA có trong section h2h (Goal Scored 1H/2H, Goal By Minutes 16-30, Under FH/2H, Team Offsides)',
    'Đối chiếu H2H với FootyStats (verify data không bị đóng băng cache)',
    'Đối chiếu Goals By Minute & Offsides team-level với FootyStats',
    'Quét N trận tương lai xem field h2h path team-level ổn định',
    'Verify field Prediction Stats/Team Corours (đã bỏ) không được xuất hiện lại',
  ], tests: 7, textCases: 0, updated: '2026-08-13' },

  { group: 'G. US-3508 Datalytics (field & cache)', file: 'tests/standard/2026-Q3-task-3508/datalytics/02-cache-mongo.spec.ts', task: 'US-3508', api: 'MongoDB footystats (mapping_matches, footy_stat_historical)', feature: [
    'Audit diện rộng mapping + nguồn stats (season/lastX) cho trận tương lai',
    'Verify cache TTL động (Prematch <8h)',
    'Verify trận Finished giữ snapshot cache 7 ngày',
    'Verify cache invalidate khi có mapping/event mới',
  ], tests: 8, textCases: 0, updated: '2026-08-13' },

  { group: 'G. US-3508 Datalytics (field & cache)', file: 'tests/standard/2026-Q3-task-3508/datalytics/03-summary-report.spec.ts', task: 'US-3508', api: '(export, đọc lại JSON đã lưu)', feature: [
    'Report 2 sheet: field presence + đối chiếu API vs Mongo',
  ], tests: 2, textCases: 0, updated: '2026-09-16' },

  // ===================== PHẦN H, I — xG tab + Radar chart pre-match =====================
  { group: 'H. Task 3573 — Tab xG trong Lineups', file: 'tests/standard/2026-Q3-task-3573/lineups-xg/01-xg-tab-api-vs-fe-vs-db.spec.ts', task: 'Task 3573', api: 'opta-api.uniscore.vn/api/v2/football/event/{id}/lineups', feature: [
    'Thêm tab "Expected Goals" (xG) trong màn Lineups',
    'Verify field xg / isHighestXg trả về đúng',
    'Highlight đúng cầu thủ có xG cao nhất',
  ], tests: 1, textCases: 0, updated: '2026-08-17' },

  { group: 'I. Task 3574 — Radar Chart Pre-match', file: 'tests/standard/2026-Q3-task-3574/prematch-lineups-radar/01-radar-chart-and-tooltip.spec.ts', task: 'Task 3574', api: 'opta-api.uniscore.vn/api/v2/player/{id}/attribute-overviews', feature: [
    'Thay "Overall Score" bằng Radar Chart (Attribute Overview) trong popup player Pre-Match Lineups',
    'Verify tooltip hiển thị đúng khi hover từng trục',
  ], tests: 2, textCases: 0, updated: '2026-08-17' },

  { group: 'I. Task 3574 — Radar Chart Pre-match', file: 'tests/standard/2026-Q3-task-3574/prematch-lineups-radar/02-wide-scan-fe-vs-api.spec.ts', task: 'Task 3574', api: '(FE vs API)', feature: [
    'Wide scan diện rộng: 10 trận × 6 cầu thủ = 60 mẫu để verify kết luận file 01 ở quy mô lớn',
  ], tests: 1, textCases: 0, updated: '2026-08-17' },

  // ===================== PHẦN J — Compare Player/Lineup US-3636 =====================
  { group: 'J. US-3636 Compare Player/Lineup', file: 'tests/standard/2026-Q3-task-3575-compare-player-lineup/00-export-test-cases.spec.ts', task: 'US-3636', api: '(export)', feature: [
    'Export Excel 71 test case (CMP-01→69) + 13 câu hỏi mở, chia theo nhóm:',
    'A. Entry point — breadcrumb, icon compare App/Web',
    'B. Onboarding — 4 bước đúng thứ tự, chỉ hiện 1 lần/step, thoát giữa chừng, đúng ngôn ngữ',
    'C. US-01 Player vs Player — chọn cầu thủ, phạm vi so sánh (cùng trận/dự bị/home-away/không giới hạn vị trí/GK vs FW), nguồn dữ liệu & fallback season, Heat maps/Rating/Goals-xG, thống kê theo vị trí FW/MID/DEF/GK, BR về vị trí tham chiếu và làm tròn',
    'D. US-02 Player vs Team — chọn đối tượng, thành tích đối đầu (appearance>0, tính mọi đội cũ, loại trừ giao hữu, chỉ số GK/non-GK, penalty shootout, shot maps), rating top 5, Heatmap Pending',
    'E. Business Rule sắp xếp thứ tự & dữ liệu thiếu — Confirm Lineup, sort theo Rating/Market Value, "-" vs "0", tân binh, provider thiếu field',
    'F. Edge case chia 0 — Shooting/Pass/Tackle/Duels/Save Success Rate, Clean Sheet Rate',
    'G. Tương tác Business Rule — fallback season ảnh hưởng vị trí tham chiếu và sort Rating',
    'H. UI/UX & thiết bị — vị trí trỏ onboarding, tên dài, đổi cầu thủ liên tiếp (race condition), đóng/mở lại popup',
    'I. Case đặc thù bóng đá — cầu thủ cho mượn, chuyển nhượng giữa mùa, lineup dự kiến, thể thức Cup, đội mới lên hạng, đối đầu nhiều lần',
  ], tests: 1, textCases: 71, updated: '2026-09-04' },

  { group: 'J. US-3636 Compare Player/Lineup', file: 'tests/standard/2026-Q3-task-3575-compare-player-lineup/01-export-api-report.spec.ts', task: 'US-3636', api: 'player-compare (players / player-vs-player / player-vs-team)', feature: [
    'Export Excel báo cáo API player-compare — feature chưa lên staging tại thời điểm test',
  ], tests: 1, textCases: 0, updated: '2026-09-04' },

  { group: 'J. US-3636 Compare Player/Lineup', file: 'tests/standard/2026-Q3-task-3575-compare-player-lineup/02-export-summary-report.spec.ts', task: 'US-3636', api: '(export)', feature: [
    'Export Excel tổng kết ngắn gọn (1 sheet, 7 điểm chính)',
  ], tests: 1, textCases: 0, updated: '2026-09-04' },

  // ===================== PHẦN K — US-4064 Datalytics data =====================
  { group: 'K. US-4064 Datalytics Data (công thức)', file: 'tests/standard/2026-Q3-task-4064-datalytics-data/00-export-test-cases.spec.ts', task: 'US-4064', api: '(export)', feature: [
    'Export Excel 53 test case (DLY-01→53) + 9 câu hỏi mở, chia theo nhóm:',
    '1. % Đội ghi bàn trước — hiển thị 2 đội đồng thời, sync Table/Chart view, làm tròn, case biên đội chưa ghi bàn/mới lên hạng, tooltip, đa ngôn ngữ, API field',
    '2. Công thức nhận định Bàn thắng/Thủng lưới — (max-min)/min, (max-min)/home, case 2 đội bằng nhau, case HOME là MIN (cần BA xác nhận), đảo vai trò Home/Away, case chia 0, UI Collapse/Expand',
    '3. Làm tròn Average — rule .5 làm tròn LÊN, 2 chữ số thập phân, ngoại lệ cộng dồn (Góc/Thẻ), threshold nghi vấn lệch số liệu',
    'J. Tương tác 3 yêu cầu — không xung đột layout, giá trị dùng tính công thức là số thô hay đã làm tròn',
    'K. Case đặc thù bóng đá — giải Cup tính chéo giải, đội mới thăng hạng, penalty shootout, trận giao hữu',
    'L. UI/UX & thiết bị — câu nhận định dài không vỡ layout mobile, Dark/Light mode, loading skeleton',
    'M. Regression & AC tổng thể — vị trí câu nhận định đúng thiết kế, regression domain Player, smoke test end-to-end',
    'N. Case % vượt 100% — phát hiện qua data thật, verify không crash/NaN/Infinity',
    'O. Đối chiếu FootyStats — khớp 100% Goals/Conceded, rounding edge case lệch 1% tại mốc .5%',
  ], tests: 1, textCases: 53, updated: '2026-09-21' },

  { group: 'K. US-4064 Datalytics Data (công thức)', file: 'tests/standard/2026-Q3-task-4064-datalytics-data/01-datalytics-api-formulas.spec.ts', task: 'US-4064', api: 'opta-api.uniscore.vn/api/v2/football/datalytics (+ PRO api.uni-score.com)', feature: [
    'Yêu cầu 1 — % Đội ghi bàn trước cho cả 2 đội: field who_will_score_first tồn tại, firstGoalScoredPercentage khớp công thức, % là số nguyên',
    'Yêu cầu 2 — Công thức Bàn thắng (max-min)/min khớp đúng; Thủng lưới BE dùng (max-min)/home (đúng spec, cần BA xác nhận); ghi nhận case % có thể vượt 100%',
    'Yêu cầu 3 — Công thức làm tròn Average: field *AVG*/*_per_match* tối đa 2 chữ số thập phân, Trung bình=(home+away)/2',
    'Unit test thuần quy tắc làm tròn: rule .5 làm tròn LÊN, số nguyên không hiện ".00"',
    'Đối chiếu FootyStats: Goals/Conceded khớp 100%, Bàn thắng khớp 100%, Thủng lưới lệch 1 điểm % (rounding edge case)',
    'Yêu cầu 3b (mục 16.1) — field giá trị âm: home_team_info.team_shots có sentinel -1, case away_team_info cũng bị sentinel -1',
    'Chạy lặp trên 92 trận thật, ~87 giải/6 châu lục',
  ], tests: 1020, textCases: 0, updated: '2026-09-17' },

  { group: 'K. US-4064 Datalytics Data (công thức)', file: 'tests/standard/2026-Q3-task-4064-datalytics-data/02-export-detail-report.spec.ts', task: 'US-4064', api: '(export, tự gọi API tính PASS/FAIL)', feature: [
    'Export Excel chi tiết từng trận trong 92 trận mẫu, PASS/FAIL theo 3 công thức (Bàn thắng, Thủng lưới, % ghi bàn trước)',
    'Sheet "Case đặc biệt" — case % vượt 100%, 2 đội bằng nhau, case lộ khác biệt /home vs /max',
  ], tests: 1, textCases: 0, updated: '2026-09-15' },

  { group: 'K. US-4064 Datalytics Data (công thức)', file: 'tests/standard/2026-Q3-task-4064-datalytics-data/02-export-summary-report.spec.ts', task: 'US-4064', api: '(export)', feature: [
    'Export Excel tổng hợp: 6 dòng yêu cầu (YC1, YC2a/b/c, YC3, FS)',
    '4 mục open items (OQ-01, OQ-09, TODO-1, TODO-2)',
    'Danh sách 28 giải đấu đã test',
  ], tests: 1, textCases: 0, updated: '2026-09-04' },

  // ===================== PHẦN L — Radar/Rating badge color =====================
  { group: 'L. Radar Chart / Rating Badge Color', file: 'tests/standard/2026-Q3-player-attribute-radar/01-radar-chart-fe-vs-api.spec.ts', task: '(Player detail radar)', api: 'opta-api.uniscore.vn/api/v2/player/{id}/attribute-overviews', feature: [
    'Radar chart "Attribute Overview" trang chi tiết Player: FE vs API — 5 trục ATT/CRE/TEC/DEF/TAC',
  ], tests: 1, textCases: 0, updated: '2026-08-17' },

  { group: 'L. Radar Chart / Rating Badge Color', file: 'tests/standard/2026-Q3-radar-chart-badge-color/01-radar-chart-stat-badge-color.spec.ts', task: '(Badge color radar)', api: '.../event/{id}/lineups, .../player/{id}/attribute-overviews', feature: [
    'Màu badge số liệu (ATT/CRE/TEC/DEF/TAC) trên radar chart popup Lineups theo rule "stat/10 = màu Rating" (6 mức màu)',
  ], tests: 1, textCases: 0, updated: '2026-08-18' },

  { group: 'L. Radar Chart / Rating Badge Color', file: 'tests/standard/2026-Q3-rating-badge-color/01-rating-badge-color-fe-vs-rule.spec.ts', task: '(Badge color rating)', api: '.../event/{id}/lineups', feature: [
    'Màu badge rating cầu thủ trong Lineups theo bảng điều kiện (isMvp, 6 mức rating), test trên 4 trận mẫu',
  ], tests: 1, textCases: 0, updated: '2026-08-18' },

  // ===================== PHẦN M — US-3226 export report =====================
  { group: 'M. US-3226 Top League Locale (export report)', file: 'tests/standard/2026-Q3-task-3226-top-league-locale/01-export-report.spec.ts', task: 'US-3226', api: 'opta-api.uniscore.vn/api/v2/football/competition/top-leagues/lang', feature: [
    'Export Excel 7 test case: Fake-IP sensitivity so baseline GB, API vs Excel Tier ordering, Excel integrity (trùng ID), Duplicate competition ID trong API, verify trận Top Leagues trang Home, kiểm tra giải "vắng trận", khảo sát tần suất giải qua 10 ngày',
    'Bảng kết quả 18 quốc gia, bảng trận đấu Home, bảng giải off-day, bảng tần suất 10 ngày',
  ], tests: 1, textCases: 7, updated: '2026-09-17' },

  // ===================== PHẦN N — Player xG =====================
  { group: 'N. Player xG (Team Details & Compare)', file: 'tests/standard/2026-Q3-task-player-xg/team-details-player-xg/00-export-test-cases.spec.ts', task: '(Player xG — Team Details)', api: '.../team/{id}/unique-tournaments/{c}/seasons/{s}/stats (field top_xg_players)', feature: [
    'Export Excel 30 test case (PXG-01→30):',
    'A. Hiển thị cơ bản — khối xG xuất hiện, Top 3 sắp xếp giảm dần, avatar default',
    'B. Logic tính xG — chỉ tính coverage 13/15, PXG-18 case ĐÃ ĐÓNG (không phải bug) sau 3 lần điều tra, trận không có Opta data không tính',
    'C. Filter — đổi Tournament/Season, filter không có data',
    'D. Ít hơn 3 cầu thủ — case 1-2 cầu thủ, case 0 cầu thủ',
    'E. View More — hiện khi >3, không hiện khi ≤3, tuân filter, đối chiếu 29 cầu thủ với API',
    'F. Backfill data — backfill từ 08/2025, đếm trận thiếu backfill',
  ], tests: 1, textCases: 30, updated: '2026-08-27' },

  { group: 'N. Player xG (Team Details & Compare)', file: 'tests/standard/2026-Q3-task-player-xg-compare/00-export-test-cases.spec.ts', task: '(Player xG — Compare)', api: '(export)', feature: [
    'Export Excel 23 test case (XGC-01→23):',
    'A. Hiển thị cơ bản — vị trí field xG trong Attack, label, định dạng số',
    'B. Logic Competition+Season — tính đúng theo tổ hợp, đổi 1 hoặc cả 2 field cập nhật tất cả',
    'C. Giá trị mặc định — Competition=giải VĐQG, Season=hiện tại',
    'D. Highlight — cầu thủ xG cao nhất, nhiều cầu thủ cùng cao nhất, tất cả "-"',
    'E. Dữ liệu biên — xG=0 hiện "0", không data hiện "-", cầu thủ mới chuyển nhượng',
    'F. Tổng hợp — đủ 3 trạng thái, thêm/bớt cầu thủ, reload trang',
  ], tests: 1, textCases: 23, updated: '2026-08-31' },

  // ===================== PHẦN O — UTD-951/958 App Native =====================
  { group: 'O. UTD-951/958 App Native (checklist thiết bị thật)', file: 'tests/standard/2026-Q3-task-951-958-app-native/01-export-utd951-edge-to-edge.spec.ts', task: 'UTD-951', api: '(checklist, cần thiết bị thật)', feature: [
    'Export Excel: 38 hạng mục checklist (26 Android + 12 iOS) — Status bar, Navigation bar, Home, Match Detail, Modal/Popup, Bottom Menu, WebView, Search, Settings, Notification, Orientation, Backward compat, Foldable/Notch-Dynamic Island, Home Indicator, Older devices, Split View iPad',
    '22 test case (AND-01→12, IOS-01→10): status bar trong suốt, header không bị che, bottom tab bar, modal an toàn, WebView full màn, xoay ngang tính lại inset, hồi quy máy cũ, bàn phím ảo, banner in-app, Dynamic Island, Live Activity, iPad Split View...',
  ], tests: 1, textCases: 60, updated: '2026-09-21' },

  { group: 'O. UTD-951/958 App Native (checklist thiết bị thật)', file: 'tests/standard/2026-Q3-task-951-958-app-native/02-export-utd958-cmp-consent-att.spec.ts', task: 'UTD-958', api: '(checklist, cần thiết bị thật đăng ký Apple)', feature: [
    'Export Excel: 29 hạng mục checklist — Chuẩn bị môi trường (đăng ký device hash, không VPN), iOS/Android EEA/non-EEA, cạnh biên (Reset/Reinstall, đổi vùng, mất mạng, update app)',
    '21 test case (EEA-01→10, NEEA-01→04, AND-EEA/NEEA, EDGE-01→05): CMP form hiện lần đầu, ATT prompt đúng lúc, Allow/Deny ATT, consent lưu sau Accept All, canRequestAds, Reset app, mất mạng, update app từ bản cũ...',
  ], tests: 1, textCases: 50, updated: '2026-09-21' },

  // ===================== PHẦN P — US-4188 Store Screenshot =====================
  { group: 'P. US-4188 Store Screenshot', file: 'tests/standard/2026-Q3-task-4188-store-screenshot/00-export-verify-report.spec.ts', task: 'US-4188', api: 'play.google.com/store/apps/details, apps.apple.com', feature: [
    'Verify Screenshot Google Play — 7 quốc gia (Anh, Đức, TBN, Ý, Pháp, Bồ Đào Nha, Mỹ), cả Phone + Tablet',
    'Verify Screenshot App Store — 7 quốc gia tương tự',
    'Phát hiện: Google Play locale PT bị nội địa hoá nhầm sang Brazil + thiếu bộ ảnh Tablet (ngoại lệ duy nhất trong 7 nước) — đã tự sửa kết luận sau khi verify lại đúng tham số hl=pt_PT',
    '4 câu hỏi mở đã trả lời',
  ], tests: 1, textCases: 14, updated: '2026-09-14' },

  // ===================== PHẦN Q — US-4460 Transfer History (test thủ công, chưa automation) =====================
  { group: 'Q. US-4460 Transfer History (test thủ công — CHƯA có automation)', file: '(chưa viết .spec.ts — test qua script tạm scratchpad)', task: 'US-4460', api: 'opta-api.uniscore.vn/api/v2/football/player/{id}/transfer-history', feature: [
    'Verify hiển thị trạng thái chuyển nhượng theo transfer_type (3=Transfer, 7=Signed)',
    'Bug 1: bóng đá nữ hiển thị "-" thay vì phân biệt "thiếu fee" vs "trường hợp khác" (27/27 case sai)',
    'Bug 2: vị trí ký hiệu € hiển thị sai vị trí',
    'Đang chờ retest theo quy tắc transfer_type=7 mới dev vừa công bố (Free Transfer khi fee=0 & desc rỗng, trừ Unknown→? hoặc fee>0→số tiền)',
    'Trạng thái Jira: IN TESTING, assignee Justin Lieu',
  ], tests: 0, textCases: 0, updated: '2026-09-22' },

  // ===================== PHẦN R — Suggestions bug (điều tra, chưa automation) =====================
  { group: 'R. Sắp xếp trang Home — Suggestions bug (CHƯA có automation)', file: '(chưa viết .spec.ts — điều tra qua API/Playwright thủ công)', task: '(Sắp xếp trang Home — mục Suggestions)', api: 'api.uni-score.com/api/v2/sport/football/scheduled-events-pagination-v2 (field tournament.suggestion / group_num / hasBracket)', feature: [
    'Verify Suggestions chỉ hiện trận liên quan quốc gia đang truy cập (theo IP/locale)',
    'Bug xác nhận: FE kéo thêm trận KHÁC bảng đấu (group_num khác) vào Suggestions chỉ vì cùng tournament.id (cùng giải)',
    'Case cụ thể verify bằng ảnh chụp thật: locale VN 22/09 — South Korea vs Saudi Arabia (Group D) bị lẫn sai vào Suggestions của Vietnam (Group C)',
    'Case tương tự: locale China (CN) 21/09 — Japan vs Chinese Taipei bị lẫn sai',
    'Quét chéo 191 quốc gia xác nhận các locale có 1 bảng đấu active đều đúng, chỉ sai khi có ≥2 bảng đấu cùng active',
  ], tests: 0, textCases: 0, updated: '2026-09-22' },

  // ===================== PHẦN S — Predicted Lineup bug (đang săn tìm) =====================
  { group: 'S. Label "Predicted Lineup" chưa đổi tên (ĐANG điều tra)', file: '(chưa viết .spec.ts — đang săn bằng chứng UI thời gian thực)', task: '(Predicted Lineup → Expected Lineup)', api: 'api.uni-score.com/api/v2/football/event/{id}/lineups (field type/confirmed/formation/players)', feature: [
    'Xác nhận chắc chắn ở tầng code: key predicted_lineup còn tồn tại trong bundle JS staging, chưa có key expected_lineup nào được thêm',
    'Theo dõi liên tục 10+ trận qua nhiều giờ để bắt bằng chứng UI thật hiển thị chữ "Predicted"',
    'Xác nhận pattern thực tế: lineup luôn chuyển Previous → Confirm hoặc Previous → Squad, chưa từng bắt được trạng thái "Predicted" trên UI',
    'Đang tiếp tục theo dõi nền (chưa có kết luận cuối)',
  ], tests: 0, textCases: 0, updated: '2026-09-22' },
];

// ============ MAPPING: Nhóm task → Module chức năng sản phẩm ============
// Góc nhìn theo module UniScore thật (Player, Match Detail, Competition, Odds, Home, App Native...)
// thay vì theo cấu trúc thư mục — để trả lời "module nào đã có automation".

const MODULE_MAP = {
  'A0. Script thủ công (scripts/, ngoài tests/)': 'Tool/Script hỗ trợ (Mongo mapping, MQTT debug)',
  'A. Top-level': 'Đa module (smoke test + bugfix rời rạc)',
  'B. Template chuẩn (dùng lại cho mọi giải)': 'Competition / League (khung chuẩn)',
  'C. US-3462 — Áp dụng khung chuẩn cho 8 giải': 'Competition / League',
  'D. US-898 Odds Service': 'Odds (Kèo cược)',
  'E. US-900 Player Honor Service (migrate NestJS→Go)': 'Player — Player Detail',
  'F. US-3369 Coach Service (migrate NestJS→Go)': 'Coach — Coach Detail',
  'G. US-3508 Datalytics (field & cache)': 'Match Detail — Datalytics/H2H',
  'H. Task 3573 — Tab xG trong Lineups': 'Match Detail — Lineups',
  'I. Task 3574 — Radar Chart Pre-match': 'Match Detail — Lineups (Pre-match)',
  'J. US-3636 Compare Player/Lineup': 'Player — Compare Player/Lineup',
  'K. US-4064 Datalytics Data (công thức)': 'Match Detail — Datalytics/H2H',
  'L. Radar Chart / Rating Badge Color': 'Match Detail — Lineups',
  'M. US-3226 Top League Locale (export report)': 'Home — Top Leagues',
  'N. Player xG (Team Details & Compare)': 'Player / Team — xG Stats',
  'O. UTD-951/958 App Native (checklist thiết bị thật)': 'App Native — UI hệ thống (Safe Area, Consent/ATT)',
  'P. US-4188 Store Screenshot': 'App Store Listing',
  'Q. US-4460 Transfer History (test thủ công — CHƯA có automation)': 'Player — Transfer History',
  'R. Sắp xếp trang Home — Suggestions bug (CHƯA có automation)': 'Home — Suggestions',
  'S. Label "Predicted Lineup" chưa đổi tên (ĐANG điều tra)': 'Match Detail — Lineups',
};

const moduleAgg = {};
for (const r of rows) {
  const mod = MODULE_MAP[r.group] || 'Khác';
  if (!moduleAgg[mod]) moduleAgg[mod] = { files: new Set(), tests: 0, textCases: 0, tasks: new Set(), pending: false };
  moduleAgg[mod].files.add(r.file);
  moduleAgg[mod].tests += r.tests || 0;
  moduleAgg[mod].textCases += r.textCases || 0;
  if (r.task && r.task !== '(Template)') moduleAgg[mod].tasks.add(r.task);
  if (r.group.includes('CHƯA có automation') || r.group.includes('ĐANG điều tra')) moduleAgg[mod].pending = true;
}

// ============ BUILD EXCEL — có màu, title, border đầy đủ ============

const wb = new ExcelJS.Workbook();
wb.creator = 'QA Automation';
wb.created = new Date();

const totalCodeTests = rows.reduce((s, r) => s + (r.tests || 0), 0);
const totalTextCases = rows.reduce((s, r) => s + (r.textCases || 0), 0);
const groups = [...new Set(rows.map(r => r.group))];
const doneGroups = groups.filter(g => !g.includes('CHƯA có automation') && !g.includes('ĐANG điều tra'));
const pendingGroups = groups.filter(g => g.includes('CHƯA có automation') || g.includes('ĐANG điều tra'));

// --- Bảng màu theo chữ cái đầu của nhóm (A, B, C...) — luân phiên 8 màu pastel dễ phân biệt ---
const PALETTE = [
  'FFDDEBF7', // xanh dương nhạt
  'FFE2EFDA', // xanh lá nhạt
  'FFFFF2CC', // vàng nhạt
  'FFFCE4D6', // cam nhạt
  'FFE4DFEC', // tím nhạt
  'FFD9E9F0', // xanh ngọc nhạt
  'FFFDE9D9', // be nhạt
  'FFEAD1DC', // hồng nhạt
];
const groupColor = {};
groups.forEach((g, i) => { groupColor[g] = PALETTE[i % PALETTE.length]; });
const PENDING_COLOR = 'FFFFCC99'; // cam đậm hơn cho việc đang dở/chưa xong

const HEADER_BG = 'FF1F4E78';   // xanh navy đậm
const HEADER_FONT = 'FFFFFFFF'; // trắng
const TITLE_BG = 'FF0B2E4F';    // navy đậm hơn cho dòng title lớn
const BORDER_COLOR = 'FFB7B7B7';
const thinBorder = { style: 'thin', color: { argb: BORDER_COLOR } };
const fullBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

function styleHeaderRow(row, lastColLetter) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = fullBorder;
  });
  row.height = 26;
}

function addTitleRow(ws, text, span) {
  ws.mergeCells(1, 1, 1, span);
  const cell = ws.getCell(1, 1);
  cell.value = text;
  cell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 32;
}

// ============ Sheet 1: Tổng quan (chỉ số + bảng theo nhóm ngay bên dưới) ============
const wsOverview = wb.addWorksheet('📊 Tổng quan', { views: [{ state: 'frozen', ySplit: 2 }] });
wsOverview.columns = [
  { key: 'c1', width: 45 },
  { key: 'c2', width: 16 },
  { key: 'c3', width: 16 },
  { key: 'c4', width: 16 },
  { key: 'c5', width: 14 },
];
addTitleRow(wsOverview, 'BÁO CÁO TỔNG HỢP QA AUTOMATION — PROJECT UNISCORE', 5);

// --- Khối 1: chỉ số tổng (mỗi dòng merge cột 2-5 để chứa giá trị) ---
wsOverview.getRow(2).values = ['Chỉ số', 'Giá trị', '', '', ''];
styleHeaderRow(wsOverview.getRow(2));
wsOverview.mergeCells(2, 2, 2, 5);

const overviewData = [
  ['Tổng số file test (.spec.ts) trong project', 167],
  ['Tổng số test case CODE (test()/it() đã tự động chạy)', totalCodeTests],
  ['Tổng số test case TEXT (checklist/AC liệt kê, dùng cho verify thủ công)', totalTextCases],
  ['TỔNG CỘNG test case (Code + Text)', totalCodeTests + totalTextCases],
  ['Số nhóm Task/Feature chính', groups.length],
  ['Số Task đã có automation hoàn chỉnh', doneGroups.length],
  ['Số Task đang điều tra / test thủ công / chưa đóng gói automation', pendingGroups.length],
  ['Ngày xuất báo cáo', new Date().toISOString().slice(0, 10)],
];
overviewData.forEach(([metric, value], i) => {
  const rowNum = 3 + i;
  wsOverview.getRow(rowNum).values = [metric, value];
  wsOverview.mergeCells(rowNum, 2, rowNum, 5);
  const row = wsOverview.getRow(rowNum);
  const isTotal = metric.startsWith('TỔNG CỘNG');
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = fullBorder;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.font = isTotal ? { bold: true, size: 12, color: { argb: 'FF1F4E78' } } : { size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isTotal ? 'FFDDEBF7' : (i % 2 === 1 ? 'FFF5F5F5' : 'FFFFFFFF') } };
  });
  row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
  row.height = 22;
});

// --- Khối 2: dòng trống ngăn cách ---
const gapRow1 = 3 + overviewData.length;

// --- Khối 3: tiêu đề bảng "Tổng hợp số liệu theo từng nhóm task" ---
const subTitleRowNum = gapRow1 + 1;
wsOverview.mergeCells(subTitleRowNum, 1, subTitleRowNum, 5);
const subTitleCell = wsOverview.getCell(subTitleRowNum, 1);
subTitleCell.value = 'TỔNG HỢP SỐ LIỆU THEO TỪNG NHÓM TASK';
subTitleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
wsOverview.getRow(subTitleRowNum).height = 26;

// --- Khối 4: header bảng theo nhóm ---
const groupHeaderRowNum = subTitleRowNum + 1;
wsOverview.getRow(groupHeaderRowNum).values = ['Nhóm', 'Số file/dòng', 'Test case CODE', 'Test case TEXT', 'Tổng'];
styleHeaderRow(wsOverview.getRow(groupHeaderRowNum));

// --- Khối 5: data bảng theo nhóm (dùng lại grouped, tính sau khi rows đã build ở trên — cần đưa xuống sau khi grouped có sẵn) ---
const groupedForOverview = {};
for (const r of rows) {
  if (!groupedForOverview[r.group]) groupedForOverview[r.group] = { count: 0, tests: 0, textCases: 0 };
  groupedForOverview[r.group].count++;
  groupedForOverview[r.group].tests += r.tests || 0;
  groupedForOverview[r.group].textCases += r.textCases || 0;
}
let curRowNum = groupHeaderRowNum + 1;
for (const [group, v] of Object.entries(groupedForOverview)) {
  const isPending = group.includes('CHƯA có automation') || group.includes('ĐANG điều tra');
  const shortName = group.replace(/^[A-Z0-9]+\.\s*/, ''); // bỏ tiền tố "A. "/"B. " cho gọn giống ảnh mẫu
  const row = wsOverview.getRow(curRowNum);
  row.values = [shortName, v.count, v.tests, v.textCases, v.tests + v.textCases];
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = fullBorder;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPending ? PENDING_COLOR : groupColor[group] } };
    cell.font = { size: 11 };
  });
  [2, 3, 4, 5].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; row.getCell(c).font = { size: 11, bold: true }; });
  row.height = 22;
  curRowNum++;
}
const ovTotalRow = wsOverview.getRow(curRowNum);
ovTotalRow.values = ['TỔNG CỘNG', rows.length, totalCodeTests, totalTextCases, totalCodeTests + totalTextCases];
ovTotalRow.eachCell({ includeEmpty: true }, cell => {
  cell.border = fullBorder;
  cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
});
ovTotalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
ovTotalRow.height = 26;

// ============ Sheet 2: Chi tiết Task & API ============
const ws = wb.addWorksheet('📋 Chi tiết Task & API', { views: [{ state: 'frozen', ySplit: 2 }] });
ws.columns = [
  { key: 'group', width: 40 },
  { key: 'file', width: 62 },
  { key: 'task', width: 16 },
  { key: 'api', width: 50 },
  { key: 'featureText', width: 95 },
  { key: 'tests', width: 14 },
  { key: 'textCases', width: 14 },
  { key: 'totalCases', width: 13 },
  { key: 'updated', width: 14 },
];
addTitleRow(ws, 'CHI TIẾT TOÀN BỘ TASK — API — CHỨC NĂNG TEST', 9);
ws.getRow(2).values = ['Nhóm', 'File / Đường dẫn', 'Task/Ticket', 'API Endpoint', 'Chức năng test (chi tiết)', 'Test case CODE', 'Test case TEXT', 'Tổng test case', 'Cập nhật cuối'];
styleHeaderRow(ws.getRow(2));
ws.autoFilter = { from: 'A2', to: 'I2' };

rows.forEach((r, i) => {
  const featureText = r.feature.map(f => `• ${f}`).join('\n');
  const row = ws.addRow([
    r.group, r.file, r.task, r.api, featureText, r.tests, r.textCases, r.tests + r.textCases, r.updated,
  ]);
  const isPending = r.group.includes('CHƯA có automation') || r.group.includes('ĐANG điều tra');
  const bgColor = isPending ? PENDING_COLOR : groupColor[r.group];

  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = fullBorder;
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.font = { size: 10.5 };
  });
  row.getCell(1).font = { size: 10.5, bold: true };
  row.getCell(3).font = { size: 10.5, bold: true, color: { argb: 'FF1F4E78' } };
  row.getCell(3).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  [6, 7, 8].forEach(c => { row.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' }; row.getCell(c).font = { size: 11, bold: true }; });
  row.getCell(9).alignment = { vertical: 'top', horizontal: 'center' };
  if (isPending) {
    row.getCell(1).font = { size: 10.5, bold: true, color: { argb: 'FFB45F06' } };
  }

  row.height = Math.max(24, r.feature.length * 15);
});

// ============ Sheet 3: Theo nhóm ============
const wsGroup = wb.addWorksheet('📈 Theo nhóm', { views: [{ state: 'frozen', ySplit: 2 }] });
wsGroup.columns = [
  { key: 'group', width: 55 },
  { key: 'count', width: 15 },
  { key: 'tests', width: 16 },
  { key: 'textCases', width: 16 },
  { key: 'total', width: 14 },
];
addTitleRow(wsGroup, 'TỔNG HỢP SỐ LIỆU THEO TỪNG NHÓM TASK', 5);
wsGroup.getRow(2).values = ['Nhóm', 'Số file/dòng', 'Test case CODE', 'Test case TEXT', 'Tổng'];
styleHeaderRow(wsGroup.getRow(2));

const grouped = {};
for (const r of rows) {
  if (!grouped[r.group]) grouped[r.group] = { count: 0, tests: 0, textCases: 0 };
  grouped[r.group].count++;
  grouped[r.group].tests += r.tests || 0;
  grouped[r.group].textCases += r.textCases || 0;
}
for (const [group, v] of Object.entries(grouped)) {
  const isPending = group.includes('CHƯA có automation') || group.includes('ĐANG điều tra');
  const row = wsGroup.addRow([group, v.count, v.tests, v.textCases, v.tests + v.textCases]);
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = fullBorder;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPending ? PENDING_COLOR : groupColor[group] } };
    cell.font = { size: 11 };
  });
  [2, 3, 4, 5].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; row.getCell(c).font = { size: 11, bold: true }; });
  row.height = 22;
}
const totalRow = wsGroup.addRow(['TỔNG CỘNG', rows.length, totalCodeTests, totalTextCases, totalCodeTests + totalTextCases]);
totalRow.eachCell({ includeEmpty: true }, cell => {
  cell.border = fullBorder;
  cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
});
totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
totalRow.height = 26;

// Chú giải màu cuối sheet "Theo nhóm"
wsGroup.addRow([]);
const legendRow = wsGroup.addRow(['Chú giải: ô màu cam đậm = Task đang điều tra/test thủ công, CHƯA có automation hoàn chỉnh']);
legendRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FFB45F06' } };
wsGroup.mergeCells(legendRow.number, 1, legendRow.number, 5);

// ============ Sheet 4: Theo Module chức năng sản phẩm ============
const wsModule = wb.addWorksheet('🧩 Theo Module', { views: [{ state: 'frozen', ySplit: 2 }] });
wsModule.columns = [
  { key: 'module', width: 45 },
  { key: 'status', width: 22 },
  { key: 'tasks', width: 30 },
  { key: 'files', width: 14 },
  { key: 'tests', width: 15 },
  { key: 'textCases', width: 15 },
  { key: 'total', width: 12 },
];
addTitleRow(wsModule, 'MODULE CHỨC NĂNG SẢN PHẨM — MODULE NÀO ĐÃ CÓ AUTOMATION', 7);
wsModule.getRow(2).values = ['Module chức năng', 'Trạng thái', 'Task/Ticket liên quan', 'Số file', 'Test case CODE', 'Test case TEXT', 'Tổng'];
styleHeaderRow(wsModule.getRow(2));

const STATUS_DONE_COLOR = 'FFD9EAD3';   // xanh lá nhạt
const STATUS_PENDING_COLOR = 'FFFFCC99'; // cam đậm

const moduleEntries = Object.entries(moduleAgg).sort((a, b) => (b[1].tests + b[1].textCases) - (a[1].tests + a[1].textCases));
for (const [mod, v] of moduleEntries) {
  const status = v.pending ? '⚠️ Đang điều tra / thủ công' : '✅ Đã có automation';
  const tasksStr = [...v.tasks].join(', ') || '(smoke/bugfix)';
  const row = wsModule.addRow([mod, status, tasksStr, v.files.size, v.tests, v.textCases, v.tests + v.textCases]);
  const bg = v.pending ? STATUS_PENDING_COLOR : STATUS_DONE_COLOR;
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = fullBorder;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    cell.font = { size: 11 };
  });
  row.getCell(1).font = { size: 11, bold: true };
  row.getCell(2).font = { size: 11, bold: true, color: { argb: v.pending ? 'FFB45F06' : 'FF38761D' } };
  row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  [4, 5, 6, 7].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; row.getCell(c).font = { size: 11, bold: true }; });
  row.height = 24;
}

const moduleTotalRow = wsModule.addRow([
  'TỔNG CỘNG', '', '', rows.length,
  moduleEntries.reduce((s, [, v]) => s + v.tests, 0),
  moduleEntries.reduce((s, [, v]) => s + v.textCases, 0),
  moduleEntries.reduce((s, [, v]) => s + v.tests + v.textCases, 0),
]);
moduleTotalRow.eachCell({ includeEmpty: true }, cell => {
  cell.border = fullBorder;
  cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
});
moduleTotalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
moduleTotalRow.height = 26;

wsModule.addRow([]);
const moduleLegend = wsModule.addRow(['Chú giải: ✅ xanh lá = module đã có bộ automation chạy được; ⚠️ cam = module đang điều tra bug hoặc chỉ test thủ công, chưa đóng gói .spec.ts']);
moduleLegend.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF666666' } };
wsModule.mergeCells(moduleLegend.number, 1, moduleLegend.number, 7);

await wb.xlsx.writeFile(OUT);
console.log('Exported:', OUT);
console.log('Total code tests:', totalCodeTests, '| Total text cases:', totalTextCases, '| Grand total:', totalCodeTests + totalTextCases);
