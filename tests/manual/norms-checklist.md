# Kiểm thử định mức và bộ máy tính đơn giá (2026-10-27, bản 1.10.0)

Phạm vi: định mức có phiên bản, thành phần tài nguyên, hao hụt, bộ máy tính, bảng diễn giải xuất ra Excel, phân tích đơn giá trong báo giá, schema v3 và nâng cấp từ v2. Tài liệu: [docs/LIBRARY.md](../../docs/LIBRARY.md#định-mức), [docs/LIBRARY_SCHEMA.md](../../docs/LIBRARY_SCHEMA.md), [ADR-0013](../../docs/ADR/0013-dinh-muc-phien-ban-va-bo-may-tinh.md).

**Lần chạy 2026-10-27:** Claude tự chạy trên Excel desktop thật (build 16.0.20430), bản dev, workbook tạm do `npm start` mở. Task pane được điều khiển qua DevTools; kết quả đọc lại từ giao diện, IndexedDB và Excel. Excel không mở workbook nào của người dùng trong lúc thử. Tài nguyên thử THU16-A/B/C và tài liệu "TL-THU-01" là dữ liệu giả định, không phải định mức hay đơn giá thực tế. Ghi `Đạt` / `Không đạt` / `Chưa chạy`.

## Nâng cấp và lưu trữ

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| U1 | Mở tab Thư viện với thư viện v2 có sẵn của bản dev | Database lên v3; mỗi công tác có định mức cũ thành một định mức phiên bản 1, Đang dùng; thành phần giữ hao phí và tài nguyên | Đạt: 3 dòng định mức thành "007 v1" (2 thành phần) và "XT-02 v1" (1 thành phần); hao phí, mã tài nguyên, công tác khớp từng dòng; không còn trường cũ |
| U2 | Tải lại task pane | Định mức, trạng thái, thành phần còn nguyên | Đạt |
| U3 | Mở thư viện v3 bằng bản 1.9.0 | Báo thư viện được tạo bởi phiên bản mới hơn, không ghi đè | Chưa chạy trên Excel (có unit test cho kiểm tra phiên bản database) |

## Định mức và thành phần

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| N1 | Thêm định mức, nguồn "Tài liệu bên ngoài", để trống ô Nguồn | Lỗi tại ô Nguồn, không lưu | Đạt |
| N2 | Lưu THU-DM-16 (m3), nguồn "TL-THU-01 (tài liệu giả định)" | Tạo phiên bản 1, trạng thái Nháp | Đạt |
| N3 | Thêm THU16-A 2, THU16-B 0,5, THU16-C 0,25 | Kết quả Hợp lệ: vật liệu 20.000, nhân công 20.000, máy 20.000, khác 0, đơn giá 60.000 VND | Đạt |
| N4 | Sửa THU16-A, hao hụt 5 | "Hao phí 2 · hao hụt 5% → tính toán 2,1 kg × 10.000 VND/kg = 21.000 VND"; đơn giá 61.000 | Đạt |
| N5 | Thêm lại THU16-A | "Tài nguyên này đã có trong định mức." | Đạt |
| N6 | Hao phí -1; hao hụt 150 | "Hao phí phải lớn hơn 0."; "Hao hụt từ 0 đến 100 (%)." | Đạt |
| N7 | Chuyển sang đang dùng | Nhãn Đang dùng; ô Mã, Đơn vị bị khóa; thành phần không còn nút Sửa/Lên/Xuống/Xóa; ẩn form thêm thành phần | Đạt (ô Tên vẫn sửa được theo thiết kế) |
| N8 | Sao chép thành phiên bản mới | "Định mức THU-DM-16 phiên bản 2", Nháp, đủ 3 thành phần | Đạt |
| N9 | Thêm XM (3 giá đang dùng) vào v2 | Lỗi "có 2 giá dùng được; add-in không tự chọn", đơn giá Chưa tính được; ô Giá áp dụng liệt kê các giá | Đạt: chọn giá 1.650,5 VND/kg (Thông báo giá Q1) thì đơn giá 62.650,5 VND, trạng thái "Tính được, có cảnh báo" |
| N10 | Duyệt v2 khi v1 đang dùng | "Mã "THU-DM-16" đang dùng phiên bản 1. Chuyển phiên bản đó sang ngừng dùng trước." | Đạt |
| N11 | Ngừng dùng v1, rồi duyệt v2 | v1 Ngừng dùng, v2 Đang dùng; v1 không có nút Xóa | Đạt |
| N12 | Xóa bản nháp v3 | Hộp xác nhận "Xóa định mức THU-DM-16 phiên bản 3 cùng 4 thành phần…"; xóa xong v3 biến mất | Đạt |
| N13 | Đổi đơn vị THU16-C từ ca sang giờ | v2 và v3: lỗi "Đơn vị … đã đổi từ "ca" sang "giờ"… add-in không tự quy đổi"; v2 (Đang dùng) không có nút Cập nhật liên kết | Đạt |
| N14 | Bản nháp v3: Cập nhật liên kết | Hết lỗi đổi đơn vị; báo thiếu giá cùng đơn vị (giá cũ tính theo ca) | Đạt; đổi đơn vị về ca thì v2 tính lại 20.000 cho THU16-C |
| N15 | Bề rộng 320px ở tab Định mức (danh sách, phiên bản Đang dùng, bản nháp, đang sửa thành phần) | Không tràn ngang | Đạt sau khi sửa ô chọn Công tác liên kết (trước đó tràn 16px) |

## Giá áp dụng (lần chạy 2, 2026-10-27)

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| P1 | v2 (Đang dùng): chọn giá NCC B cho XM | Lưu ngay; đơn giá tính được | Đạt: Hợp lệ, 62.720,25 VND; ô chọn có ghi chú "Lưu cùng định mức…" |
| P2 | Tải lại task pane, mở lại v2 | Ô Giá áp dụng vẫn là NCC B | Đạt |
| P3 | Chèn THU16-CT vào báo giá, Phân tích từ định mức | Ô giá của XM mặc định NCC B | Đạt: tạm tính 62.720,25 VND |
| P4 | Mở v1 (Ngừng dùng) | Ô Giá áp dụng bị khóa | Đạt |

## Xuất bảng diễn giải

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| E1 | v1 (61.000): Xuất bảng diễn giải ra Excel | Sheet mới "Diễn giải THU-DM-16 v1"; H7 `=F7*(1+G7)` = 2,1; J7 `=H7*I7` = 21.000; tổng theo SUMIF/SUM khớp cột Kết quả add-in | Đạt: vật liệu 21.000, nhân công 20.000, máy 20.000, khác 0, đơn giá 61.000 ở cả hai cột |
| E2 | Ghi thêm N2 vào sheet diễn giải, xuất lại v1 | Sheet mới "Diễn giải THU-DM-16 v1 (2)"; sheet cũ không đổi | Đạt (so toàn bộ công thức trước/sau) |
| E3 | Đang xem v2, sửa giá THU16-A 10.000 → 10.500 trực tiếp trong IndexedDB (giả lập task pane khác), bấm xuất | Không ghi sheet; báo dữ liệu vừa đổi; kết quả tính lại | Đạt (lần chạy 2): không có sheet mới; đơn giá tính lại 63.770,25; xuất lần hai ghi sheet "Diễn giải THU-DM-16 v2" với 2,1 × 10.500 = 22.050. Unit test `recheckNorm` cho giá, tài nguyên, định mức, thành phần, giá áp dụng đổi |

## Báo giá

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| Q1 | Liên kết v2 với công tác THU16-CT, chèn vào báo giá, Phân tích từ định mức, khối lượng 2, chọn giá XM NCC B | Dùng v2 (4 tài nguyên); sheet "Phân tích đơn giá" ghi hao phí 2,1 cho THU16-A, ghi chú "hao phí gồm hao hụt 5% (cơ sở 2); định mức THU-DM-16 v2" | Đạt: đơn giá 62.720,25 (21.000 + 20.000 + 20.000 + 1.720,25); thành tiền 125.440,5 |

## Nhập/xuất thư viện

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| X1 | Xuất ra workbook Excel | Có sheet "Định mức" (13 cột) và "Thành phần định mức" (7 cột) | Đạt: 4 phiên bản, 10 thành phần, hao hụt ghi 5 |
| X2 | Đọc sheet thành phần: 1 dòng trùng, 1 mã tài nguyên lạ, 1 dòng thêm vào phiên bản Đang dùng | Loại "Thành phần định mức"; 1 trùng, 2 lỗi với thông báo theo dòng và cột; không ghi gì khi chưa xác nhận | Đạt (đã sửa nhãn loại dữ liệu bị thiếu) |

## Hồi quy

| # | Bước | Kết quả | 
|---|---|---|
| R1 | `node tests/integration/run-in-taskpane.mjs tests/integration/excel-core.scenarios.js` | Đạt 26/26 |
| R2 | Bề rộng 320px các tab khác | Lần 1 không đạt (lỗi có từ trước): Báo giá 331px, Tính giá và In ấn 403px, Nhập/Xuất 358px. Lần 2 đạt: với bảng báo giá và sheet tên dài 30 ký tự, mọi tab và mục thư viện rộng 305px; ô chọn bảng ở Tính giá rộng 201px (không bị co mất); màn hình chọn giá khi chèn vào báo giá không tràn |
| R3 | Hồi quy lớp core sau lần sửa 2 | Đạt 26/26 |
