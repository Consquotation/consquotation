# Kiểm thử tay — Workbook Integration (prompts/06_WORKBOOK_INTEGRATION.md)

Môi trường: Excel Microsoft 365 trên Windows, add-in dev (tab **ConsQuotation (Dev)**). Ghi `Đạt` / `Không đạt` / `Chưa chạy`.

**Lần chạy 2026-10-20:** Claude tự chạy toàn bộ checklist trên Excel desktop thật (build 16.0.20430.20182), điều khiển task pane qua DevTools (cổng 9229 của WebView2) trong workbook tạm do `npm start` tạo. Lần chạy này phát hiện và sửa 2 lỗi, ghi ở cuối file.

Bổ sung cho [phase-2-checklist.md](phase-2-checklist.md), vốn đã kiểm thử phần tạo mẫu, ghi đè, chặn khi sheet bị khóa/chồng Table/ô gộp và thêm công tác cuối bảng.

## Tên sheet và Table

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W1 | Tạo bảng trên sheet mới với tên `Báo giá nhà xưởng` | Có sheet đúng tên đó | Đạt (2026-10-20, tự động) |
| W2 | Tạo lại với cùng tên | Sheet mới tên `Báo giá nhà xưởng (2)`, Table tên mới; không lỗi | Đạt (2026-10-20, tự động) |
| W3 | Gõ tên có ký tự `/`, tên bắt đầu bằng `'`, hoặc tên `History` | Báo lỗi ngay dưới ô tên; nút Tạo bảng bị vô hiệu hóa; không ghi gì | Đạt (2026-10-20, tự động) |

## Chạy lặp không tạo trùng

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W4 | Bấm đúp thật nhanh nút **Tạo bảng báo giá** (sheet mới), hoặc giữ Enter trong ô Số dòng | Chỉ tạo **một** sheet và một bảng | Đạt (2026-10-20, tự động) |
| W5 | Ở hộp xác nhận ghi đè, bấm đúp nhanh nút **Ghi đè** | Chỉ ghi một lần | Đạt (2026-10-20, tự động) |
| W6 | Bấm đúp nhanh **Thêm vào bảng**, hoặc giữ Enter trong ô Nội dung | Chỉ thêm **một** dòng | Đạt (2026-10-20, tự động) |

## Định dạng sau khi ghi đè

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W7 | Định dạng một vùng là Percent, một vùng là Date, gõ vài số, rồi tạo bảng tại đó (Ghi đè) | Sau khi tạo, gõ Mã công tác `12` hiện `12` (không phải `1200%`); Khối lượng, Đơn giá, Thành tiền hiện đúng kiểu số; dòng tổng đúng | Đạt (2026-10-20, tự động) |

## Chèn công tác tại vị trí đã chọn

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W8 | Bảng có ít nhất 3 dòng. Chọn một ô ở dòng 2, chọn vị trí **Ngay dưới dòng đang chọn**, thêm công tác | Dòng mới nằm ngay dưới dòng 2; STT tự đánh lại liên tục; Thành tiền và Tổng cộng đúng | Đạt (2026-10-20, tự động) |
| W9 | Chọn ô ở hàng tiêu đề của bảng rồi chèn | Dòng mới thành dòng đầu của bảng | Đạt (2026-10-20, tự động) |
| W10 | Chọn ô ở dòng Tổng cộng rồi chèn | Dòng mới nằm cuối bảng, ngay trên dòng tổng | Đạt (2026-10-20, tự động) |
| W11 | Chọn một ô **ngoài** bảng, vị trí **Ngay dưới dòng đang chọn** | Bị chặn với thông báo vùng chọn không nằm trong bảng; không ghi gì | Đạt (2026-10-20, tự động) |
| W12 | Có dữ liệu dưới bảng; chọn ô trong bảng, chèn để hiện hộp xác nhận đẩy xuống; click sang ô khác trong Excel; rồi bấm **Vẫn thêm dòng** | Dòng mới vẫn chèn đúng vị trí đã kiểm tra lúc đầu | Đạt (2026-10-20, tự động) |
| W13 | Gõ `X` vào ô ngay bên phải bảng (cùng hàng với dòng 2), rồi chèn dưới dòng 2 | Excel tự nới Table thêm cột `Column1` chứa `X`; add-in **vẫn thêm được** công tác (ghi theo tên cột, để trống cột người dùng tự thêm) | Đạt (2026-10-20, tự động) |

| W18 | Gõ `X` vào ô ngay dưới mép vùng mẫu (ví dụ A17 khi vùng là A1:I16) và các ô sát 4 cạnh, rồi tạo bảng tại A1 (Ghi đè) | **Mọi** ô kiểm chứng giữ nguyên vị trí, kể cả ô ngay dưới dòng tổng | Đạt (2026-10-20, tự động) |

## Sheet hoặc bảng bị đổi/xóa trong lúc task pane mở

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W14 | Đổi tên sheet chứa bảng báo giá, rồi click một ô trong Excel | Danh sách bảng (Tổng quan) và danh sách trong form Thêm công tác hiện tên sheet mới | Đạt (2026-10-20, tự động) |
| W15 | Xóa sheet chứa bảng báo giá, rồi click một ô | Bảng đó biến khỏi các danh sách | Đạt (2026-10-20, tự động) |
| W16 | Mở form Thêm công tác với bảng A đang chọn; xóa sheet chứa bảng A bằng chuột phải (không click ô nào khác); bấm **Thêm vào bảng** ngay | Thông báo bảng không còn tồn tại; không ghi gì | Đạt (2026-10-20, tự động) |
| W17 | Bấm **Đi tới** một bảng vừa bị xóa (trước khi danh sách cập nhật) | Thông báo lỗi tiếng Việt; danh sách tự tải lại | Đạt (2026-10-20, tự động) |

## Lỗi phát hiện trong lần chạy 2026-10-20 (đã sửa)

1. **Dòng tổng đẩy dữ liệu bên dưới xuống 1 hàng.**
   - Hiện tượng: bật `showTotals` khiến Excel chèn một hàng dưới Table, trong phạm vi các cột của bảng, kể cả khi hàng đó trống. Ô ngay dưới vùng mẫu bị dời xuống (ví dụ `X` ở A17 sang A18).
   - Có từ: giai đoạn 2. Bản production 1.1.0 cũng bị.
   - Cách sửa: sau khi bật dòng tổng, add-in xóa hàng trống của vùng mẫu vừa bị đẩy xuống và kéo ô bên dưới lên. Trước khi xóa, add-in kiểm tra hàng đó trống; nếu không trống thì dừng và báo lỗi.
   - Kiểm chứng: bước W18.
2. **Bảng bị nới thêm cột thì không thêm được công tác.**
   - Hiện tượng: gõ vào ô ngay bên phải bảng làm Excel tự thêm cột `Column1`. Sau đó add-in báo "Tiêu đề cột đã bị đổi" và chặn thao tác thêm.
   - Cách sửa: bảng hợp lệ khi có đủ 9 cột mẫu, mỗi tên đúng một lần. Dữ liệu được ghi theo tên cột; cột do người dùng thêm để trống.
   - Kiểm chứng: bước W13.
