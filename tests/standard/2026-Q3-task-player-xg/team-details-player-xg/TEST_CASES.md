# Test Case — Player xG block (Team Details → Stats)

Nguồn: User Story "Xem danh sách cầu thủ có chỉ số xG cao nhất của đội theo giải đấu/mùa giải".
Trạng thái tại thời điểm viết (2026-08-27): **feature chưa lên staging** — checklist này dùng để
QA test tay khi feature deploy, và làm cơ sở điền `.spec.ts` (xem `01-player-xg-block.spec.ts` cùng thư mục).

Vị trí: `Team Details → tab Stats → cuối tab`.

## Quy ước

- Mã test case: `PXG-xx`.
- Mỗi case ghi rõ Precondition / Steps / Expected.
- Case liên quan tính toán xG cần đối chiếu số liệu backend (DB/API) — không chỉ nhìn UI.

---

## A. Hiển thị khối Player xG (cơ bản)

**PXG-01 — Khối Player xG hiển thị đúng vị trí**
- Precondition: đội có ít nhất 1 cầu thủ có dữ liệu xG hợp lệ trong giải/mùa đang chọn.
- Steps: vào Team Details của 1 đội → chọn tab Stats → cuộn xuống cuối tab.
- Expected: khối "Player xG" xuất hiện ở vị trí cuối cùng, sau toàn bộ nhóm chỉ số khác của tab Stats.

**PXG-02 — Top 3 cầu thủ, sắp xếp giảm dần theo xG**
- Precondition: đội có ≥ 3 cầu thủ có dữ liệu xG trong giải/mùa đang chọn.
- Steps: xem khối Player xG.
- Expected:
  - Hiển thị đúng 3 player item.
  - xG item 1 ≥ xG item 2 ≥ xG item 3 (giảm dần, không tăng dần / không random).

**PXG-03 — Nội dung mỗi player item**
- Steps: xem từng player item trong Top 3.
- Expected mỗi item có đủ:
  - Số thứ tự (1, 2, 3).
  - Avatar cầu thủ.
  - Tên cầu thủ.
  - Số bàn thắng (Goals) trong giải/mùa đang chọn.
  - Tổng xG (số thập phân, ví dụ `6.7`).
  - Số trận được tính xG / tổng số trận, định dạng `x/y trận` (ví dụ `10/12 trận`).

**PXG-04 — Avatar default khi cầu thủ chưa có avatar**
- Precondition: tìm/tạo được cầu thủ lọt Top 3 (hoặc trong danh sách View More) chưa có avatar.
- Steps: xem player item của cầu thủ đó.
- Expected: hiển thị avatar mặc định (placeholder), không vỡ layout, không icon lỗi (broken image).

---

## B. Logic tính xG

**PXG-05 — Chỉ tính xG các trận có Opta coverage level 13 hoặc 15**
- Precondition: chọn 1 cầu thủ có cả trận coverage 13/15 lẫn trận coverage khác (hoặc không có Opta data) trong cùng giải/mùa.
- Steps: đối chiếu số trận hiển thị `x/y trận` với dữ liệu backend (đếm số trận coverage 13/15 của cầu thủ đó trong giải/mùa).
- Expected: `x` (tử số) = đúng số trận có Opta coverage 13 hoặc 15. `y` (mẫu số) = tổng số trận cầu thủ thi đấu trong giải/mùa đó (kể cả trận không có Opta).

**PXG-06 — Trận không có Opta data KHÔNG được tính vào tổng xG**
- Precondition: cầu thủ có ít nhất 1 trận không đủ dữ liệu Opta (coverage khác 13/15, hoặc không có mp_match) trong giải/mùa.
- Steps: so sánh tổng xG hiển thị với tổng xG tính thủ công chỉ từ các trận coverage 13/15 (query DB/API xg_match_stats hoặc tương đương).
- Expected: tổng xG hiển thị KHÔNG bao gồm đóng góp từ các trận thiếu Opta data. Sai lệch phải bằng 0 (trong sai số làm tròn hợp lý, ví dụ ±0.05).

**PXG-07 — Ví dụ đối chiếu công thức theo spec**
- Given: cầu thủ A, đội B, giải C, mùa 2026/27, tổng 12 trận, 8 trận có Opta data.
- Expected format hiển thị: `xG: 4.2 – 8/12 trận` (đúng cú pháp: tổng xG, dấu gạch ngang, x/y trận).
- Note: đây là case tham chiếu từ spec, dùng làm mẫu đối chiếu định dạng hiển thị khi có dữ liệu thật tương tự.

---

## C. Filter theo giải đấu / mùa giải

**PXG-08 — Đổi Tournament filter → Player xG tính lại**
- Precondition: đội tham gia ≥ 2 giải đấu khác nhau, có dữ liệu Opta ở cả 2 giải.
- Steps: 1) ghi nhận Top 3 + số liệu ở giải A. 2) đổi Tournament filter sang giải B. 3) ghi nhận lại Top 3 + số liệu.
- Expected: danh sách Top 3, Goals, xG, số trận đều cập nhật lại đúng theo giải B (không giữ nguyên dữ liệu giải A, không giữ cache cũ).

**PXG-09 — Đổi Season filter → Player xG tính lại**
- Precondition: đội có dữ liệu ở ≥ 2 mùa giải.
- Steps: tương tự PXG-08 nhưng đổi Season filter thay vì Tournament.
- Expected: dữ liệu Player xG cập nhật đúng theo mùa giải mới chọn.

**PXG-10 — Đổi filter sang giải/mùa không có dữ liệu xG**
- Precondition: tìm giải/mùa mà đội không có cầu thủ nào đủ điều kiện tính xG (không có trận coverage 13/15).
- Steps: chọn filter đó.
- Expected: khối Player xG không hiển thị player item giả/rỗng gây hiểu nhầm. (Cần confirm với dev/PO: ẩn toàn bộ khối, hay hiển thị empty state — hiện spec chưa nêu rõ, xem mục "Câu hỏi mở" bên dưới.)

---

## D. Trường hợp đội có ít hơn 3 cầu thủ có dữ liệu

**PXG-11 — Đội chỉ có 1–2 cầu thủ có dữ liệu xG**
- Precondition: tìm đội/giải/mùa mà chỉ có 1 hoặc 2 cầu thủ đủ điều kiện tính xG.
- Steps: xem khối Player xG.
- Expected: chỉ hiển thị đúng số cầu thủ có dữ liệu thật (1 hoặc 2 item). KHÔNG tạo thêm player item giả/placeholder để đủ 3 slot.

**PXG-12 — Đội không có cầu thủ nào có dữ liệu xG**
- Precondition: đội/giải/mùa không có bất kỳ cầu thủ nào đủ điều kiện (0 trận coverage 13/15).
- Steps: xem tab Stats.
- Expected: khối Player xG không hiển thị player item nào. (Cùng câu hỏi mở như PXG-10 — cần confirm hành vi hiển thị khối rỗng.)

---

## E. Nút "View More / Xem thêm"

**PXG-13 — Nút View More hiển thị khi có > 3 cầu thủ đủ điều kiện**
- Precondition: đội có > 3 cầu thủ có dữ liệu xG trong giải/mùa đang chọn.
- Steps: xem khối Player xG.
- Expected: nút "View More"/"Xem thêm" hiển thị bên dưới Top 3.

**PXG-14 — Nút View More KHÔNG hiển thị (hoặc disable) khi ≤ 3 cầu thủ**
- Precondition: đội có ≤ 3 cầu thủ có dữ liệu xG.
- Steps: xem khối Player xG.
- Expected: không có nút View More (vì không còn gì để xem thêm). (Cần confirm hành vi cụ thể: ẩn hẳn hay disable.)

**PXG-15 — Click View More → hiển thị đầy đủ danh sách, đúng thứ tự**
- Precondition: đội có > 3 cầu thủ đủ điều kiện.
- Steps: click "View More".
- Expected:
  - Hiển thị toàn bộ cầu thủ của đội có dữ liệu xG trong giải/mùa đang filter (không chỉ 3).
  - Danh sách sắp xếp theo tổng xG giảm dần, nhất quán với Top 3 đã hiển thị trước đó (item 4 trở đi phải có xG ≤ xG của item 3).
  - Vẫn áp dụng đúng logic tính xG (chỉ tính trận coverage 13/15) như khối Top 3.

**PXG-16 — Danh sách đầy đủ vẫn tuân theo Tournament/Season filter đang chọn**
- Precondition: đã mở View More ở 1 giải/mùa.
- Steps: đóng danh sách đầy đủ (nếu có), đổi Tournament/Season filter, mở lại View More.
- Expected: danh sách đầy đủ cập nhật lại theo filter mới, không còn dữ liệu của filter cũ.

---

## F. Business rule — Backfill dữ liệu Opta coverage 13/15

**PXG-17 — Backfill dữ liệu từ 08/2025 đến hiện tại**
- Precondition: cần xác nhận với dev/data team phạm vi backfill đã chạy xong.
- Steps: kiểm tra (DB/API) các trận từ 08/2025 → hiện tại có coverage level 13 hoặc 15 đã có đủ dữ liệu để tính xG hay chưa (sample nhiều giải khác nhau).
- Expected: các trận trong khoảng thời gian trên, nếu đủ điều kiện coverage 13/15, phải có dữ liệu xG khả dụng để hệ thống tính toán — không bị thiếu do backfill chưa chạy.
- Note: đây là test cấp data/backend, nên verify bằng query DB (số trận coverage 13/15 có xg_match_stats tương ứng) trước khi verify qua UI.

---

## Câu hỏi mở cần confirm với dev/PO trước khi automation hoá đầy đủ

1. Khi đội không có cầu thủ nào đủ điều kiện xG (PXG-12): ẩn toàn bộ khối Player xG, hay hiển thị khối kèm empty state (ví dụ "No xG data available")? Spec hiện chưa nêu rõ.
2. Khi đội có 0 cầu thủ đủ điều kiện ở 1 giải nhưng có dữ liệu ở giải khác của cùng đội (PXG-10): hành vi UI có giống PXG-12 không?
3. Sai số làm tròn xG chấp nhận được là bao nhiêu khi đối chiếu FE vs backend (dùng cho PXG-06/PXG-07)?
4. "View More" mở dạng modal/trang riêng hay expand ngay trong tab Stats? (ảnh hưởng tới cách viết automation selector).
5. Format hiển thị số trận `x/y trận` — chữ "trận" có bị dịch theo ngôn ngữ khi đổi locale (EN/VI...) không? Cần test đa ngôn ngữ riêng nếu có.
