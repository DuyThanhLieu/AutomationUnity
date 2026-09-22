# Test Case — Bổ sung xG vào tính năng So sánh cầu thủ (Player Detail)

Nguồn: User Story "Xem và so sánh chỉ số xG giữa các cầu thủ tại trang Player Detail".
Vị trí: Player Detail → tính năng So sánh cầu thủ → component **Attack** → field **xG** (hiển thị dưới "Total shots", trên "Freekicks").

## Quy ước

- Mã test case: `XGC-xx`.
- Mỗi case ghi rõ Precondition / Steps / Expected.
- Case liên quan tính toán xG cần đối chiếu số liệu backend (DB/API), không chỉ nhìn UI.

---

## A. Hiển thị field xG cơ bản

**XGC-01 — Field xG xuất hiện đúng vị trí trong component Attack**
- Precondition: đang ở tính năng So sánh cầu thủ, đã chọn ít nhất 2 cầu thủ.
- Steps: mở component Attack trong bảng so sánh, quan sát thứ tự các field.
- Expected: field "xG" xuất hiện ngay dưới "Total shots" và ngay trên "Freekicks" — đúng thứ tự đã spec, không bị chèn sai vị trí.

**XGC-02 — Label hiển thị đúng "xG"**
- Steps: xem tên field hiển thị trên UI.
- Expected: label chính xác là "xG" (không phải "Expected Goals" đầy đủ, không viết hoa/thường sai).

**XGC-03 — Giá trị xG hiển thị đúng định dạng số**
- Precondition: cầu thủ có dữ liệu xG > 0.
- Steps: xem giá trị xG hiển thị.
- Expected: hiển thị đúng tổng xG dạng số (cần xác nhận số chữ số thập phân theo design — ví dụ 2 chữ số như các nơi khác đã dùng trong hệ thống, ví dụ "6.71").

---

## B. Logic tính xG theo Competition + Season

**XGC-04 — xG tính đúng theo Competition + Season đang chọn**
- Precondition: cầu thủ tham gia nhiều giải đấu/mùa giải khác nhau.
- Steps: 1. Chọn Competition A + Season A. 2. Ghi nhận giá trị xG hiển thị. 3. Đối chiếu với tổng xG thực tế của cầu thủ đó trong đúng Competition A + Season A (query API/DB).
- Expected: giá trị xG trên UI khớp chính xác với tổng xG backend tính cho đúng Competition A + Season A — không lẫn dữ liệu từ giải/mùa khác.

**XGC-05 — Đổi Competition → xG của TẤT CẢ cầu thủ trong bảng so sánh cập nhật lại**
- Precondition: đang so sánh ≥ 2 cầu thủ, đã có giá trị xG cho Competition A.
- Steps: 1. Ghi nhận xG của từng cầu thủ ở Competition A. 2. Đổi sang Competition B. 3. Ghi nhận lại xG của từng cầu thủ.
- Expected: xG của TẤT CẢ cầu thủ trong bảng đều đổi theo đúng Competition B, không có cầu thủ nào bị "kẹt" giá trị cũ.

**XGC-06 — Đổi Season → xG của tất cả cầu thủ trong bảng so sánh cập nhật lại**
- Precondition: tương tự XGC-05 nhưng đổi Season thay vì Competition.
- Steps: 1. Ghi nhận xG ở Season A. 2. Đổi sang Season B (cùng Competition). 3. Ghi nhận lại.
- Expected: xG cập nhật đúng theo Season B cho mọi cầu thủ.

**XGC-07 — Đổi cả Competition lẫn Season cùng lúc**
- Steps: đổi đồng thời cả 2 filter, không đổi riêng lẻ.
- Expected: xG cập nhật đúng theo tổ hợp Competition + Season mới, không bị tính theo tổ hợp cũ (ví dụ giữ Competition cũ + Season mới do cập nhật thiếu đồng bộ).

---

## C. Giá trị mặc định khi mở tính năng So sánh

**XGC-08 — Mặc định Competition = giải VĐQG cầu thủ đang tham gia**
- Precondition: mở tính năng So sánh cầu thủ lần đầu (chưa từng chọn filter).
- Steps: quan sát Competition filter mặc định.
- Expected: Competition mặc định đúng là giải vô địch quốc gia (national league) mà cầu thủ hiện đang thi đấu — không phải giải cup, không phải giải quốc tế.

**XGC-09 — Mặc định Season = mùa giải hiện tại**
- Steps: quan sát Season filter mặc định.
- Expected: Season mặc định là mùa giải đang diễn ra (current season), không phải mùa cũ.

**XGC-10 — xG mặc định khớp đúng Competition + Season mặc định**
- Steps: đối chiếu giá trị xG hiển thị mặc định với tổng xG thực tế của cầu thủ trong đúng giải VĐQG + mùa hiện tại.
- Expected: khớp chính xác — không hiển thị dữ liệu rỗng hoặc dữ liệu của giải khác khi vừa mở tính năng.

**XGC-11 — So sánh nhiều cầu thủ có giải VĐQG mặc định KHÁC NHAU**
- Precondition: 2 cầu thủ trong bảng so sánh thi đấu ở 2 giải quốc nội khác nhau (ví dụ 1 người Ligue 1, 1 người Premier League).
- Steps: mở tính năng so sánh 2 cầu thủ này.
- Expected: cần làm rõ — Competition mặc định áp dụng chung cho cả bảng (theo 1 cầu thủ chính) hay mỗi cầu thủ tự động lấy đúng giải VĐQG riêng của mình rồi hệ thống liệt kê cạnh nhau? Đây là điểm spec chưa nêu rõ, xem mục "Câu hỏi mở".

---

## D. Logic so sánh — Highlight giá trị cao nhất

**XGC-12 — Cầu thủ có xG cao nhất được highlight (label xanh dương)**
- Precondition: so sánh ≥ 2 cầu thủ có xG khác nhau.
- Steps: quan sát field xG trong bảng so sánh.
- Expected: cầu thủ có tổng xG cao nhất được highlight đúng theo logic hiện tại của tính năng so sánh (label màu xanh dương).

**XGC-13 — Nhiều cầu thủ cùng giá trị xG cao nhất → TẤT CẢ đều được highlight**
- Precondition: ≥ 2 cầu thủ có xG bằng nhau và là giá trị cao nhất trong bảng.
- Steps: quan sát highlight.
- Expected: toàn bộ các cầu thủ có giá trị bằng nhau (và là cao nhất) đều được highlight, không chỉ 1 cầu thủ đầu tiên.

**XGC-14 — Chỉ 1 cầu thủ có xG hợp lệ, còn lại "-"**
- Precondition: so sánh 2 cầu thủ, 1 người có xG > 0, người kia không có dữ liệu ("-").
- Steps: quan sát highlight.
- Expected: cầu thủ có giá trị hợp lệ được highlight (vì là giá trị cao nhất có thể so sánh); cầu thủ "-" không được highlight và không gây lỗi tính toán so sánh.

**XGC-15 — Tất cả cầu thủ đều "-" (không ai có dữ liệu)**
- Steps: so sánh nhóm cầu thủ toàn bộ không có dữ liệu xG.
- Expected: không có highlight nào được áp dụng (không có gì để so sánh), không hiển thị lỗi.

---

## E. Xử lý dữ liệu — các trường hợp biên

**XGC-16 — Có dữ liệu xG và xG > 0 → hiển thị đúng giá trị**
- Steps: xem cầu thủ có xG > 0.
- Expected: hiển thị đúng số, không làm tròn sai, không hiển thị "-" hay "0" nhầm.

**XGC-17 — Có dữ liệu xG và xG = 0 → hiển thị "0", KHÔNG hiển thị "-"**
- Precondition: cầu thủ có dữ liệu xG hợp lệ (đã tham gia đủ điều kiện tính toán) nhưng tổng xG thực tế = 0 (ví dụ chưa từng dứt điểm tạo cơ hội).
- Steps: xem giá trị xG hiển thị.
- Expected: hiển thị chính xác "0" — đây là điểm dễ nhầm lẫn nhất, cần phân biệt rõ "0 hợp lệ" và "không có dữ liệu" (xem XGC-18).

**XGC-18 — Không có dữ liệu xG → hiển thị "-"**
- Precondition: cầu thủ không có bất kỳ dữ liệu xG nào cho Competition + Season đang chọn (ví dụ giải/mùa mà cầu thủ hoàn toàn không thi đấu, hoặc dữ liệu Opta chưa cover).
- Steps: xem giá trị xG hiển thị.
- Expected: hiển thị "-", không hiển thị "0" (tránh gây hiểu nhầm là cầu thủ đã thi đấu nhưng không tạo cơ hội nào).

**XGC-19 — Một số trận không có dữ liệu xG → KHÔNG tự động tính các trận đó thành 0**
- Precondition: cầu thủ có N trận trong mùa giải, trong đó chỉ M trận (M < N) có dữ liệu xG đủ điều kiện (ví dụ theo rule Opta coverage level đã áp dụng ở feature Player xG trước đó — US liên quan PXG-18).
- Steps: đối chiếu tổng xG hiển thị với tổng xG tính thủ công CHỈ từ M trận có dữ liệu, không cộng thêm 0 cho (N-M) trận thiếu.
- Expected: tổng xG hiển thị = tổng xG của đúng M trận có dữ liệu thực tế — không bị pha loãng/sai lệch do cộng nhầm các trận thiếu dữ liệu thành 0.
- Ghi chú: đây là rule đã áp dụng nhất quán ở feature "Player xG" (Team Details) trước đó — cần đảm bảo tính năng so sánh cầu thủ này dùng CHUNG 1 nguồn tính toán, không tự viết lại logic riêng có nguy cơ sai khác.

**XGC-20 — Cầu thủ mới chuyển nhượng, chưa thi đấu trận nào ở Competition + Season đang chọn**
- Steps: chọn 1 cầu thủ vừa chuyển đến đội mới, giải mới, chưa ra sân trận nào ở giải/mùa hiện tại.
- Expected: hiển thị "-" (không có dữ liệu), không hiển thị "0" (vì "0" ngụ ý đã thi đấu nhưng không có xG, khác với "chưa từng thi đấu").

---

## F. Case tổng hợp / tương tác giữa các rule

**XGC-21 — So sánh 3+ cầu thủ với đủ 3 trạng thái: xG > 0, xG = 0, và "-"**
- Precondition: bảng so sánh có ít nhất 3 cầu thủ đại diện đủ 3 trường hợp trên.
- Steps: quan sát đồng thời hiển thị giá trị và highlight.
- Expected: hiển thị đúng từng trường hợp (số thật / "0" / "-"), chỉ cầu thủ có xG cao nhất trong nhóm CÓ dữ liệu hợp lệ được highlight; "-" không tham gia so sánh và không bị highlight nhầm.

**XGC-22 — Thêm/bớt cầu thủ trong bảng so sánh sau khi đã có xG**
- Precondition: đang so sánh 2 cầu thủ, đã hiển thị xG + highlight đúng.
- Steps: thêm 1 cầu thủ thứ 3 vào bảng so sánh (hoặc bớt đi 1 người).
- Expected: xG của cầu thủ mới thêm được tính đúng theo Competition + Season hiện tại (không phải mặc định riêng của cầu thủ đó); highlight được tính lại cho toàn bộ nhóm mới, không giữ highlight cũ sai.

**XGC-23 — Tải lại trang / mở lại tính năng so sánh với cùng danh sách cầu thủ**
- Steps: đã chọn Competition/Season khác mặc định, sau đó tải lại trang.
- Expected: cần xác nhận với PO — filter có được nhớ lại (persist) hay quay về mặc định (giải VĐQG + mùa hiện tại) mỗi lần mở lại? Spec hiện chưa nêu rõ, xem mục Câu hỏi mở.

---

## Câu hỏi mở cần xác nhận với dev/PO trước khi automation hoá đầy đủ

1. **XGC-11**: Khi so sánh nhiều cầu thủ có giải VĐQG mặc định khác nhau, Competition mặc định áp dụng theo cầu thủ nào? Có 1 filter chung cho cả bảng, hay từng cầu thủ có filter riêng?
2. **XGC-19**: Rule loại trừ trận thiếu dữ liệu xG (Opta coverage) có dùng chung công thức/nguồn dữ liệu với feature "Player xG" (Team Details) đã làm trước đó không, hay là 1 luồng tính toán độc lập mới?
3. **XGC-23**: Filter Competition/Season có được lưu lại (persist qua session/reload) hay luôn reset về mặc định mỗi lần mở tính năng so sánh?
4. Số chữ số thập phân hiển thị cho xG là bao nhiêu? (ví dụ 1, 2 chữ số) — cần đồng bộ với cách hiển thị xG ở các màn hình khác trong hệ thống.
5. "Giải Vô địch quốc gia mặc định" được xác định dựa trên nguồn nào nếu cầu thủ đang cho mượn (loan) — đội chủ quản hay đội đang thi đấu?
6. Case cầu thủ đang thi đấu ở giải trẻ (U19/U21) không có giải "vô địch quốc gia" người lớn tương ứng — mặc định sẽ là gì?
