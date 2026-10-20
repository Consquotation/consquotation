# Kiểm thử tay — Workbook Integration (prompts/06_WORKBOOK_INTEGRATION.md)

Môi trường: Excel Microsoft 365 trên Windows, add-in dev (tab **ConsQuotation (Dev)**). Ghi `Đạt` / `Không đạt` / `Chưa chạy`.

Bổ sung cho [phase-2-checklist.md](phase-2-checklist.md), vốn đã kiểm thử phần tạo mẫu, ghi đè, chặn khi sheet bị khóa/chồng Table/ô gộp và thêm công tác cuối bảng.

## Tên sheet và Table

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W1 | Tạo bảng trên sheet mới với tên `Báo giá nhà xưởng` | Có sheet đúng tên đó | Chưa chạy |
| W2 | Tạo lại với cùng tên | Sheet mới tên `Báo giá nhà xưởng (2)`, Table tên mới; không lỗi | Chưa chạy |
| W3 | Gõ tên có ký tự `/`, tên bắt đầu bằng `'`, hoặc tên `History` | Báo lỗi ngay dưới ô tên; nút Tạo bảng bị vô hiệu hóa; không ghi gì | Chưa chạy |

## Chạy lặp không tạo trùng

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W4 | Bấm đúp thật nhanh nút **Tạo bảng báo giá** (sheet mới), hoặc giữ Enter trong ô Số dòng | Chỉ tạo **một** sheet và một bảng | Chưa chạy |
| W5 | Ở hộp xác nhận ghi đè, bấm đúp nhanh nút **Ghi đè** | Chỉ ghi một lần | Chưa chạy |
| W6 | Bấm đúp nhanh **Thêm vào bảng**, hoặc giữ Enter trong ô Nội dung | Chỉ thêm **một** dòng | Chưa chạy |

## Định dạng sau khi ghi đè

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W7 | Định dạng một vùng là Percent, một vùng là Date, gõ vài số, rồi tạo bảng tại đó (Ghi đè) | Sau khi tạo, gõ Mã công tác `12` hiện `12` (không phải `1200%`); Khối lượng, Đơn giá, Thành tiền hiện đúng kiểu số; dòng tổng đúng | Chưa chạy |

## Chèn công tác tại vị trí đã chọn

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W8 | Bảng có ít nhất 3 dòng. Chọn một ô ở dòng 2, chọn vị trí **Ngay dưới dòng đang chọn**, thêm công tác | Dòng mới nằm ngay dưới dòng 2; STT tự đánh lại liên tục; Thành tiền và Tổng cộng đúng | Chưa chạy |
| W9 | Chọn ô ở hàng tiêu đề của bảng rồi chèn | Dòng mới thành dòng đầu của bảng | Chưa chạy |
| W10 | Chọn ô ở dòng Tổng cộng rồi chèn | Dòng mới nằm cuối bảng, ngay trên dòng tổng | Chưa chạy |
| W11 | Chọn một ô **ngoài** bảng, vị trí **Ngay dưới dòng đang chọn** | Bị chặn với thông báo vùng chọn không nằm trong bảng; không ghi gì | Chưa chạy |
| W12 | Có dữ liệu dưới bảng; chọn ô trong bảng, chèn để hiện hộp xác nhận đẩy xuống; click sang ô khác trong Excel; rồi bấm **Vẫn thêm dòng** | Dòng mới vẫn chèn đúng vị trí đã kiểm tra lúc đầu | Chưa chạy |
| W13 | Gõ `X` vào ô ngay bên phải bảng (cùng hàng với dòng 2), rồi chèn dưới dòng 2 | `X` giữ nguyên vị trí (Excel chỉ dời các ô trong phạm vi cột của bảng) | Chưa chạy |

## Sheet hoặc bảng bị đổi/xóa trong lúc task pane mở

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| W14 | Đổi tên sheet chứa bảng báo giá, rồi click một ô trong Excel | Danh sách bảng (Tổng quan) và danh sách trong form Thêm công tác hiện tên sheet mới | Chưa chạy |
| W15 | Xóa sheet chứa bảng báo giá, rồi click một ô | Bảng đó biến khỏi các danh sách | Chưa chạy |
| W16 | Mở form Thêm công tác với bảng A đang chọn; xóa sheet chứa bảng A bằng chuột phải (không click ô nào khác); bấm **Thêm vào bảng** ngay | Thông báo bảng không còn tồn tại; không ghi gì | Chưa chạy |
| W17 | Bấm **Đi tới** một bảng vừa bị xóa (trước khi danh sách cập nhật) | Thông báo lỗi tiếng Việt; danh sách tự tải lại | Chưa chạy |
