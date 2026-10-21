# ADR-0009: Mẫu báo giá, ghi chú/điều khoản và in ấn

- Trạng thái: Chấp nhận
- Ngày: 2026-10-21
- Theo: [prompts/11_TEMPLATE_PRINT_EXPORT.md](../../prompts/11_TEMPLATE_PRINT_EXPORT.md)

## Bối cảnh

Prompts/11 yêu cầu:
- mẫu báo giá gồm khối thông tin, bảng công tác, tổng hợp, và **khu vực ghi chú/điều khoản theo cấu hình**;
- ưu tiên tính năng in/xuất PDF có sẵn của Excel;
- chỉ tự cấu hình vùng in, hướng giấy và co giãn khi API hỗ trợ và đã kiểm thử; nếu không hỗ trợ thì hướng dẫn người dùng thay vì giả vờ hỗ trợ.

Kiểm thử trên Excel Microsoft 365 Windows (build 16.0.20430.20182). Kết quả được kiểm chứng bằng cách xuất PDF qua `ExportAsFixedFormat` (COM) rồi đọc chữ bằng Word:

1. **PageLayout (ExcelApi 1.9)** đặt được và đọc lại đúng các thiết lập sau:
   - `setPrintArea`, `setPrintTitleRows("$10:$10")`;
   - `orientation`, `paperSize`, `centerHorizontally`;
   - `headersFooters.defaultForAllPages.centerFooter = "Trang &P / &N"`.

   Đặt `zoom = { horizontalFitToPages: 1, verticalFitToPages: 0 }` thì Excel ghi `FitToPagesWide = 1` và `FitToPagesTall = False` (tự động).
2. Vùng in là một tên đã đặt, nên Excel tự giãn vùng in khi chèn dòng vào bên trong nó.
3. Bảng 120 dòng in thành 3 trang. Dòng tiêu đề bảng lặp ở mỗi trang; tiếng Việt và ký tự m² giữ nguyên.
4. **Không xuống dòng thì chữ dài bị cắt trong PDF**, gồm nội dung công việc và tiêu đề của cột hẹp do người dùng thêm.
5. Khi co giãn cho vừa trang, Excel có thể ngắt chữ khác với màn hình, làm dòng cuối của một ô cao bị cắt. Đây là giới hạn của Excel.
6. Office.js **không có** API xem trước bản in, in, hay xuất PDF.

## Quyết định

### Khu vực "Ghi chú và điều khoản"

- **Các mục:**
  - Phạm vi công việc, Giả định, Phần loại trừ, Điều khoản thương mại, Ghi chú (theo prompts/02).
  - Người dùng tự nhập nội dung; **add-in không soạn sẵn điều khoản nào**. Mục để trống không được ghi.
- **Vị trí:** dưới bảng tổng hợp (hoặc dưới dòng tổng của bảng báo giá), cách 1 hàng, trải đúng phạm vi cột của bảng báo giá. Nhãn đặt ở cột đầu; nội dung đặt ở cột "Nội dung công việc", có xuống dòng.
- **Đánh dấu vùng:** dùng tên cấp workbook `CQ_Terms_<n>`, không dùng Table, để tìm lại sau khi dòng bị dời. Lý do không dùng Table: nội dung cần cột rộng và không gộp ô.
- **Chèn dòng vào bảng báo giá:** Excel dời cả bảng tổng hợp lẫn khu vực này. Khi hỏi xác nhận "dữ liệu bên dưới", vùng này không bị tính.
- **Khi bảng tổng hợp cần thêm dòng** mà khu vực điều khoản nằm ngay dưới, add-in **chèn nguyên hàng** ngay trên khu vực đó, để mọi thứ bên dưới dời đồng đều, không lệch cột.
- **Vùng mới phải trống;** nếu có dữ liệu thì add-in chặn và không ghi đè.
- **Trước khi ghi,** add-in đọc lại sheet và so sánh, giống phần Tổng hợp (prompts/07).

### Thiết lập trang in

- **Vùng in** được tính lại từ sheet mỗi lần: từ tiêu đề "BẢNG BÁO GIÁ" (nếu đã bị xóa thì từ nhãn thông tin đầu tiên, nếu cũng không còn thì từ dòng tiêu đề bảng) tới hết khu vực điều khoản. Chiều ngang theo đúng các cột của bảng, kể cả cột người dùng thêm.
- **Tùy chọn mặc định:**
  - khổ A4, giấy dọc;
  - vừa 1 trang theo chiều ngang (nhiều trang theo chiều dọc);
  - lặp dòng tiêu đề bảng ở mỗi trang;
  - chân trang "Trang x / y";
  - căn giữa theo chiều ngang;
  - xuống dòng cho cột Nội dung công việc, cột Ghi chú và dòng tiêu đề bảng.
- Người dùng xem trước và xác nhận. Hộp xác nhận nêu vùng in cũ sẽ bị thay.
- Chỉ gỡ chân trang khi đó là chân trang add-in đã đặt.
- **Không có ExcelApi 1.9:** add-in không đặt gì, hiển thị cảnh báo kèm hướng dẫn thao tác trong Excel (Page Layout › Print Area / Print Titles / Orientation / Size / Scale to Fit).
- **Xem trước, in và xuất PDF:** luôn hướng dẫn dùng File › Print và File › Export của Excel, kèm lưu ý về chữ bị cắt khi co giãn (kết quả 5).

### Mẫu mới

Cột "Nội dung công việc" và "Ghi chú" có sẵn chế độ xuống dòng. Add-in chỉ định dạng vùng mẫu, không định dạng toàn sheet.

## Hệ quả

- Thêm tab **In ấn**, port `LayoutGateway` và adapter `ExcelLayoutGateway`.
- Ghi chú truy vết của đơn giá phân tích được rút gọn (`Phân tích định mức: <mã>; n tài nguyên`) để ít dòng khi in.
- Chưa kiểm thử: Excel trên web và Mac (PageLayout, xuất PDF); máy in thật (đã kiểm thử bằng xuất PDF).
