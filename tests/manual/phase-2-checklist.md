# Kiểm thử tay — Giai đoạn 2 (Workbook adapter)

Ghi `Đạt` / `Không đạt` / `Chưa chạy` kèm ghi chú. Môi trường chính: Excel Microsoft 365 trên Windows, add-in dev (tab **ConsQuotation (Dev)**).

**Nguyên tắc kiểm chứng "không phá dữ liệu ngoài vùng":** trước mỗi bước ghi, gõ một giá trị kiểm chứng (ví dụ `X`) vào các ô sát ngay ngoài 4 cạnh của vùng sẽ ghi. Sau khi ghi, các ô đó phải giữ nguyên.

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| 1 | Mở tab **Báo giá**; đổi ô chọn và đổi sheet | Khối "Workbook hiện tại" cập nhật sheet và vùng chọn sau khoảng 0,3 giây | Đạt (2026-10-20) |
| 2 | Tạo bảng, vị trí **Sheet mới**, 5 dòng | Có sheet "Báo giá" với tiêu đề, 7 nhãn thông tin, Table `CQ_Quote_1` gồm 9 cột, STT 1–5, Thành tiền trống, dòng "Tổng cộng"; báo thành công kèm địa chỉ | Đạt (2026-10-20) |
| 3 | Tạo thêm lần nữa trên sheet mới | Có sheet "Báo giá (2)", Table `CQ_Quote_2`; không trùng, không lỗi | Đạt (2026-10-20) |
| 4 | Chọn ô trống trên sheet khác › **Tại ô đang chọn** | Hộp xác nhận nêu đúng vùng (ví dụ `'Sheet1'!B2:J17`). **Hủy** thì không ô nào thay đổi | Đạt (2026-10-20) |
| 5 | Lặp lại bước 4 và bấm **Tạo bảng** | Bảng tạo đúng vị trí; các ô kiểm chứng ngoài vùng giữ nguyên | Đạt (2026-10-20) |
| 6 | Chọn ô sao cho vùng mẫu chứa vài ô có dữ liệu | Hộp "Vùng đích đang có dữ liệu" nêu số ô và ví dụ địa chỉ. **Hủy** thì dữ liệu nguyên vẹn | Đạt (2026-10-20) |
| 7 | Lặp lại bước 6 và bấm **Ghi đè** | Nội dung trong vùng được thay bằng mẫu; các ô kiểm chứng ngoài vùng giữ nguyên | Đạt (2026-10-20) |
| 8 | Chọn ô sao cho vùng mẫu chồng lên một Excel Table có sẵn | Bị chặn, nêu tên Table; không có nút ghi đè | Đạt (2026-10-20) |
| 9 | Bảo vệ sheet (Review › Protect Sheet) rồi tạo tại ô đang chọn | Bị chặn với thông báo sheet được bảo vệ; khối "Workbook hiện tại" cũng cảnh báo | Đạt (2026-10-20) |
| 10 | Vùng mẫu chứa ô gộp (Merge) | Bị chặn, nêu địa chỉ ô gộp | Đạt (2026-10-20) |
| 11 | Trong bảng: Khối lượng `12,5` (hoặc `12.5` tùy locale Excel), Đơn giá `1500000` | Thành tiền = 18.750.000; dòng tổng cập nhật | Đạt (2026-10-20) |
| 12 | Gõ chữ vào ô Khối lượng của một dòng có Đơn giá | Thành tiền hiện `#VALUE!` (không bị đổi thành 0) | Đạt (2026-10-20) |
| 13 | Lọc bảng ẩn bớt dòng | Tổng cộng chỉ cộng các dòng đang hiện (SUBTOTAL 109) | Đạt (2026-10-20) |
| 14 | **Thêm công tác thủ công**: Nội dung `Đổ bê tông móng`, KL `2,5`, Đơn giá `100`, Ghi chú `=SUM(A1)` | Thêm 1 dòng cuối bảng; STT và Thành tiền (250) đúng; Ghi chú hiện đúng chữ `=SUM(A1)`, không phải công thức | Đạt (2026-10-20) |
| 15 | Bỏ trống Nội dung, hoặc nhập KL `1.234,5` | Báo lỗi tại đúng trường; không ghi gì | Đạt (2026-10-20) |
| 16 | Gõ dữ liệu ngay dưới dòng tổng của bảng, rồi thêm công tác | Hộp hỏi xác nhận đẩy dữ liệu xuống. Sau khi thêm, dữ liệu đó còn nguyên (dời xuống 1 dòng) | Đạt (2026-10-20) |
| 17 | Đổi tên một tiêu đề cột của bảng, rồi thêm công tác | Bị chặn với thông báo tiêu đề cột đã đổi | Đạt (2026-10-20) |
| 18 | Mở hộp xác nhận (bước 4 hoặc 6), sửa một ô trong vùng đích trong Excel, rồi bấm xác nhận | Báo "Workbook đã thay đổi…", không ghi gì | Đạt (2026-10-20) |
| 19 | Sau khi tạo bảng, nhấn Ctrl+Z trong Excel | Ghi nhận thực tế: Undo được hay không (R3) | Ghi nhận (2026-10-20): **Ctrl+Z không hoàn tác được** thao tác của add-in |
| 20 | Đóng và mở lại task pane | Danh sách bảng báo giá tải lại đúng | Đạt (2026-10-20) |

## Chưa kiểm thử được

- Excel trên web, Mac, Excel 2016–2024: không có môi trường ở giai đoạn này.
- Kiểm tra ô gộp cần ExcelApi 1.13; với Excel cũ hơn, add-in báo bỏ qua kiểm tra này. Chỉ có test tự động cho nhánh đó.
