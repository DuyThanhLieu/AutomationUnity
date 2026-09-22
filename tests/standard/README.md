# Bộ khung test chuẩn — dùng cho BẤT KỲ giải đấu nào

Tham số hoá theo `competitionId` — không cần sửa code khi muốn test 1 giải khác. Production DB (<DB_STAGING_HOST>:6432), production web (uniscore.com).

## Cách chạy

```bash
# Chạy toàn bộ 10 hạng mục cho 1 giải, gắn với 1 đợt kiểm tra (mùa giải)
TEST_BATCH=<đợt-kiểm-tra> TEST_COMPETITION_ID=<competition_id> npx playwright test tests/standard/ --project=chrome

# Chạy 1 hạng mục cụ thể
TEST_BATCH=<đợt-kiểm-tra> TEST_COMPETITION_ID=<competition_id> npx playwright test tests/standard/02-bxh-ranking.spec.ts --project=chrome

# Thêm slug nếu muốn verify trang frontend (tuỳ chọn, chỉ 02-bxh-ranking.spec.ts dùng)
TEST_BATCH=<đợt-kiểm-tra> TEST_COMPETITION_ID=<competition_id> TEST_COMPETITION_SLUG=<slug> npx playwright test tests/standard/02-bxh-ranking.spec.ts --project=chrome
```

`competition_id` lấy từ cột `competitions.id` trong DB (vd Premier League = `jednm9whz0ryox8`).

`TEST_BATCH` là tên đợt kiểm tra/mùa giải (vd `2026-Q3` khớp task US-3462 "Checklist tiền mùa giải quý 3/2026") — quyết định thư mục kết quả sẽ nằm ở đâu. Nếu bỏ qua, kết quả rơi vào `results/_unbatched/` (rõ ràng, không silent default).

## Kết quả được tổ chức theo mùa giải

```
tests/standard/results/
  {TEST_BATCH}/                 (vd "2026-Q3")
    {competitionId}/             (vd "jednm9whz0ryox8" = Premier League)
      competition-info.json
      bxh.json
      lich-thi-dau.json
      ...
    {competitionId khác}/
      ...
  {TEST_BATCH khác}/             (vd "2026-Q4", mùa/đợt kiểm tra sau)
    ...
```

Chạy lại cùng 1 giải ở 1 đợt khác (`TEST_BATCH` khác) sẽ tạo thư mục riêng, không ghi đè lên kết quả đợt cũ — giữ được lịch sử qua các mùa giải.

## Report — mỗi mùa giải 1 file riêng biệt

```bash
python3 build_season_report.py <batch>
# vd: python3 build_season_report.py 2026-Q3   ->  REPORT_2026-Q3.xlsx
```

Mỗi lần chạy chỉ tạo/ghi đè report của ĐÚNG 1 batch được truyền vào — không đụng tới report của các mùa khác. Không truyền batch hoặc batch chưa có dữ liệu sẽ báo lỗi rõ ràng kèm gợi ý cách chạy test trước, thay vì tạo report rỗng.

File xuất ra: `REPORT_{batch}.xlsx` (đặt tại thư mục gốc `AutomationUnity/`), gồm:
- Sheet **"Tổng quan"** — 1 dòng/giải trong batch đó, hiển thị mùa giải Opta thật, có BXH hay không, tổng đội/trận.
- 1 sheet riêng/giải (tên sheet = tên giải) — chi tiết từng chỉ số của 10 hạng mục, tô màu theo tỷ lệ đạt (xanh ≥90%, cam ≥50%, đỏ <50%).

Report **không hard-code số liệu** — chạy lại script bất kỳ lúc nào sau khi có thêm kết quả test mới sẽ tự cập nhật. Muốn có report cho mùa khác (vd `2026-Q4`), chạy test với `TEST_BATCH=2026-Q4` trước, rồi `python3 build_season_report.py 2026-Q4` — sẽ ra file `REPORT_2026-Q4.xlsx` riêng, không ảnh hưởng `REPORT_2026-Q3.xlsx`.

Đã verify chạy PASS 100% (0 fail) trên 6 giải khác nhau: Premier League (club, mùa dài), ASEAN Championship (national team, cup vòng bảng), FA Community Shield & UEFA Super Cup (cup 1 trận), UEFA Nations League (cup nhiều giai đoạn), và Israel U17 National League (giải trẻ, mẫu rất nhỏ — dùng để stress-test threshold).

## Cấu trúc file

| File | Hạng mục checklist | Bảng DB chính |
|---|---|---|
| `00-context-verify.spec.ts` | (core, không phải hạng mục) | `mp_competition`, `opta_seasons` |
| `01-competition-info.spec.ts` | #1 Giải đấu | `competitions` |
| `02-bxh-ranking.spec.ts` | #4 BXH, #5 Thăng/xuống hạng | `opta_standings` (qua mapping Opta) |
| `03-lich-thi-dau.spec.ts` | #2 Lịch thi đấu | `sport_events`, `stages` |
| `04-h2h.spec.ts` | #6 H2H | `sport_events` |
| `05-team-info.spec.ts` | #7 Đội bóng | `ts_teams` (qua `sport_events`) |
| `06-lineup-players.spec.ts` | #8 Cầu thủ, #13 Đội hình | `match_lineups`, `transfers`, `team_injury` |
| `07-match-events.spec.ts` | #16 Sự kiện trận đấu | `opta_match_event` (qua `mp_match`) |
| `08-match-statistics.spec.ts` | #19 Thống kê | `match_statistics_teams`, `xg_match_stats` |
| `09-search.spec.ts` | #9 Tìm kiếm | API `search/all` |
| `10-multilanguage.spec.ts` | #11/#20 Đa ngôn ngữ | `team_locale`, `competition_locale`, `opta_match_commentary_translation` |

## 2 tầng multi-ID-scheme QUAN TRỌNG — đọc trước khi sửa bất kỳ file nào

DB có nhiều bộ ID song song cho cùng 1 thực thể. Toàn bộ bộ khung này đã tự động xử lý qua `lib/competition-context.ts`, nhưng nếu viết thêm hạng mục mới, PHẢI biết:

1. **Tầng 1 — "thesport" ID vs "Opta" ID**: `competitions`, `ts_teams`, `sport_events`, `match_lineups`, `match_statistics_teams`, `xg_match_stats` dùng chung 1 hệ ID ("thesport"). Còn `opta_standings`, `opta_seasons`, `opta_match_event`, `opta_match_commentary*` dùng ID Opta gốc, khác hoàn toàn. Cầu nối: `mp_competition` (competition), `mp_match` (match), `mp_team`/`mp_coach`/`mp_player` (team/coach/player).
2. **`mp_match` chỉ cover trận có Opta feed** — thường là trận gần đây/coverage cao, KHÔNG cover toàn bộ lịch sử. Việc 1 giải/mùa cũ không map được là bình thường, không phải bug.
3. **Frontend API (`api.uni-score.com`) dùng hệ ID thứ 3, riêng biệt**, không map được với 2 tầng trên qua bất kỳ bảng nào đã tìm thấy. KHÔNG cố đối chiếu DB↔frontend-API theo ID — nếu cần, chỉ verify độc lập từng nguồn.
4. **`ts_teams.competition_id` chỉ đúng cho club**, đội tuyển quốc gia (`national=1`) có `competition_id=''`. Lấy danh sách đội của 1 giải PHẢI qua `sport_events.home_team_id`/`away_team_id` distinct, không qua `ts_teams.competition_id`.

## Ngưỡng mẫu tối thiểu trước khi assert %

Giải nhỏ/trẻ có chất lượng dữ liệu thấp hơn hệ thống (không phải bug riêng lẻ). Các test đã thêm ngưỡng mẫu tối thiểu (thường 20 dòng, hoặc `competitions.is_top_league` cho phần bắt buộc chặt hơn) — dưới ngưỡng thì chỉ log cảnh báo, không fail. Khi viết thêm test mới, giữ nguyên tắc này.

## Bug data thật đã biết (không phải lỗi test, không tự fail bộ khung)

- `match_statistics_teams.passes_accuracy` thường xuyên vượt quá 100 (có giải chỉ 1% sample hợp lệ) — xem `08-match-statistics.spec.ts`, chỉ log cảnh báo.
- `player_honor` không đồng bộ với API `/player/{id}/honors` — xem `tests/player-honors-api-vs-db.spec.ts` (ngoài bộ khung này).

## Hạng mục KHÔNG có trong bộ khung này (không thể tự động hoá theo giải)

Odd (#3/#14), Push notification (#15), 2D/3D (#17), Trang Admin (#12), Away Goal/Hiệp phụ/Penalty/Cuptree trong Logic giải (#5) — lý do chi tiết xem sheet "⛔ Cần Manual" trong `REPORT_Checklist_3462_Tong_Hop.xlsx`.
