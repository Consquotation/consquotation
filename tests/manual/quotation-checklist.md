# Kiểm thử quy trình lập báo giá (2026-10-27, bản 1.11.0)

Phạm vi: giai đoạn 17. Gồm hồ sơ báo giá trong workbook, Mã dòng, đơn giá theo loại, trạng thái dòng, cập nhật theo thư viện, đồng bộ với Excel, lưu và mở lại, bảng cũ. Tài liệu: [docs/QUOTATION.md](../../docs/QUOTATION.md), [ADR-0014](../../docs/ADR/0014-ho-so-bao-gia-trong-workbook.md).

**Lần chạy 2026-10-27.** Claude tự chạy trên Excel desktop thật (build 16.0.20430), bản dev. Task pane được điều khiển qua DevTools; kết quả đọc lại từ giao diện, từ Excel (Office.js) và COM.
- Workbook: file tạm do `npm start` tạo, sau đó lưu thành file thử trong thư mục tạm của phiên.
- Không mở workbook nào của người dùng.
- Dev server của dự án VietMoneyToWords đang giữ cổng 3000 nên đã được dừng (người dùng đồng ý); cần bật lại.
- Dữ liệu thử (THU16-A/B/C, THU16-CT, THU-DM-16, XM, THU-T1, TC-17) là giả định, không phải định mức hay đơn giá thực tế.

Ghi `Đạt` / `Không đạt` / `Chưa chạy`.

## Tạo báo giá và thêm công tác

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| Q1 | Tạo bảng báo giá trên sheet mới "BG Thử 17" | 14 cột (9 cột cũ, 4 đơn giá thành phần, Mã dòng); Mã dòng bị ẩn; khối thông tin 10 nhãn | Đạt: tiêu đề cột ở hàng 13; `columnHidden` = true; đủ 10 nhãn |
| Q2 | Thư viện › THU16-CT › Chèn vào báo giá › Phân tích từ định mức, khối lượng 10 | Dòng có Mã dòng; đơn giá thành phần ghi theo thành phần đã chọn | Đạt: 22.720,25 / 20.000 / 20.000 / 0; đơn giá 62.720,25; thành tiền 627.202,5 |
| Q3 | Chèn THU-T1 (đơn giá thư viện), khối lượng 3 | Có Mã dòng; 4 cột đơn giá thành phần trống | Đạt: 850.000 × 3 = 2.550.000 |
| Q4 | Nhập tay TC-17, 2 m2 × 1.500 | Có Mã dòng | Đạt |
| Q5 | Đọc Custom XML Part | 1 phần, namespace `urn:consquotation:quotation`, thuộc tính `table="CQ_Quote_1"` | Đạt: 3.327 ký tự, 3 mục |

## Tab Công tác

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| C1 | Mở tab Công tác | Trạng thái Nháp; 3 dòng Hợp lệ; tổng ô tổng = tổng add-in cộng; tổng theo nhóm | Đạt: 3.180.202,5 cả hai; 3 nhóm |
| C2 | Tính lại và lưu | "Đã lưu kết quả tính vào hồ sơ." | Đạt |
| C3 | Đánh dấu hoàn tất | "Đã hoàn tất", có thời điểm | Đạt |
| C4 | Chi tiết dòng phân tích | Nguồn "định mức THU-DM-16 v2"; 4 thành phần với cơ sở, hao hụt, giá, nguồn | Đạt: THU16-A "hao phí cơ sở 2, hao hụt 5%, giá 10.000 VND/kg" |
| C5 | Bề rộng 320px, mở hết chi tiết | Không tràn ngang | Đạt (tab Công tác và tab Báo giá) |

## Thư viện thay đổi

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| L1 | Đổi giá THU16-A trong thư viện 10.000 → 10.500 (sửa thẳng IndexedDB) | Báo giá giữ 62.720,25; dòng "Có cảnh báo" với nội dung thay đổi; báo giá vẫn "Đã hoàn tất" | Đạt |
| L2 | Cập nhật theo thư viện › xác nhận | Hộp xác nhận nêu "THU16-A: 10.000 → 10.500 VND/kg"; sheet phân tích nhận giá mới; đơn giá dòng tính lại; báo giá về nháp | Đạt: 63.770,25 (2,1 × 10.500 = 22.050); đơn giá vật liệu 23.770,25; thành tiền 637.702,5 |
| L3 | Chữ nguồn trên sheet phân tích sau cập nhật | Giữ ghi chú hao hụt | Lần 1 không đạt (mất ghi chú hao hụt). Lần 2 đạt: "Không ghi nguồn; VND; hao phí gồm hao hụt 5% (cơ sở 2); cập nhật theo thư viện 27/10/2026; định mức THU-DM-16 v2"; 2,1 × 11.000 + 1.720,25 + 40.000 = 64.820,25 |
| L4 | Chỉ thư viện đổi (báo giá đang hoàn tất) | Dòng không bị báo "dữ liệu trên sheet đã đổi"; báo giá vẫn hoàn tất tới khi cập nhật; thông báo nói rõ về nháp | Lần 1 không đạt. Lần 2 đạt |

## Sửa trực tiếp trong Excel

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| E1 | Sửa khối lượng TC-17 thành 4 trong Excel | Thành tiền 6.000; dòng ghi "Khác lần tính đã lưu" | Đạt |
| E2 | Chép dòng TC-17 (cùng Mã dòng) và xóa dòng THU-T1 trong Excel | Báo "Mã dòng trùng"; "Lần lưu tới sẽ: gán Mã dòng cho 1 dòng, bỏ 1 mục hồ sơ" | Đạt |
| E3 | Tính lại và lưu | "1 dòng sao chép nhận mã mới. Bỏ 1 mục của dòng đã xóa."; 3 mã khác nhau | Đạt |
| E4 | Xóa giá nguồn THU16-B trên sheet phân tích | Dòng Lỗi: "Tài nguyên "THU16-B" chưa có đơn giá nguồn…"; hai số tổng khác nhau được giải thích | Đạt |
| E5 | Đánh dấu hoàn tất khi còn dòng lỗi | Bị chặn: "1 dòng chưa tính được (trạng thái lỗi)." | Đạt |
| E6 | Đổi khối lượng sau khi xem rồi bấm Hoàn tất | "Bảng báo giá hoặc hồ sơ vừa thay đổi… Add-in không ghi gì" | Đạt |
| E7 | Bảo vệ sheet rồi Tính lại và lưu (cần ghi Mã dòng) | Báo AccessDenied; hồ sơ không đổi; bỏ bảo vệ thì vẫn còn việc chờ | Đạt |

## Lưu và mở lại

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| S1 | Lưu workbook thành .xlsx, đóng, mở lại | Custom XML Part còn | Đạt (COM: 1 phần đúng namespace) |
| S2 | Mở pane trên file vừa mở lại, tab Công tác | Trạng thái, 3 dòng, kết quả và tổng như trước khi lưu; không dòng nào "khác lần tính" | Đạt: 646.702,5 |

## Bảng cũ và thông tin công trình

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| O1 | Bảng 9 cột (xóa 5 cột mở rộng), gõ một dòng | "Chưa có hồ sơ"; banner nêu 5 cột thiếu; Tính lại bị khóa | Đạt |
| O2 | Bổ sung cột quản lý theo dòng › xác nhận | Thêm 5 cột bên phải; Mã dòng bị ẩn (cột trống ngoài bảng) | Đạt |
| O3 | Tính lại và lưu | Gán mã 1 dòng | Đạt |
| O4 | Xóa nhãn "Địa điểm:" trên sheet | Panel Thông tin chỉ gợi ý (không cảnh báo); Tổng quan không báo nhãn mất | Đạt |

## Hồi quy

| # | Bước | Kết quả |
|---|---|---|
| R1 | `node tests/integration/run-in-taskpane.mjs tests/integration/excel-core.scenarios.js` | Đạt 26/26 |
| R2 | In và xuất PDF bảng mẫu 14 cột | Chưa chạy |
| R3 | Excel web, Mac | Chưa chạy |
