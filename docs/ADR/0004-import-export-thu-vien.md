# ADR-0004: Import/export và backup thư viện

- Trạng thái: Chấp nhận (một số kênh phụ thuộc kết quả spike)
- Ngày: 2026-10-19

## Bối cảnh

Theo ADR-0003, backup ra ngoài là cơ chế duy nhất bảo vệ thư viện. Tuy nhiên:

- Microsoft ghi rõ WebView2 **không hỗ trợ tải trực tiếp blob PDF** trong add-in. Chưa có tài liệu cho JSON hoặc CSV.
- Add-in không ghi được file theo đường dẫn.
- `<input type="file">` là cơ chế web chuẩn để đọc file người dùng chọn, nhưng cần xác minh trong WebView2, WKWebView và Excel web.
- `Excel.createWorkbook(base64)` (ExcelApi 1.8) mở một workbook mới. Người dùng tự lưu workbook này bằng Excel, nên không cần quyền file.

## Quyết định

### Định dạng

- **Định dạng backup chuẩn:** JSON, theo schema có version.
  - Cấu trúc: `{ "format": "consquotation-library", "schemaVersion": 1, "exportedAt": …, "data": { workItems, resources, resourcePrices, norms } }`.
  - Schema được công bố trong `docs/` kèm file mẫu **rỗng**, không có dữ liệu chuyên ngành.
- **Định dạng trao đổi:** bảng Excel hoặc CSV (UTF-8) cho từng loại dữ liệu, có template tiêu đề cột công bố.

### Kênh export

Thứ tự ưu tiên:

1. **Workbook mới (kênh chính).**
   - Tạo workbook chứa mỗi loại dữ liệu trong một sheet, cùng một sheet `_meta` ghi schemaVersion.
   - Mở bằng `Excel.createWorkbook`. Người dùng lưu bằng File › Save As.
   - Không phụ thuộc khả năng tải file của webview.
2. **Tải file JSON.** Chỉ bật trên nền tảng mà spike xác nhận chạy được.
3. **Sao chép JSON vào clipboard.** Dự phòng cuối, nếu spike xác nhận.

### Kênh import

1. **Từ vùng dữ liệu hoặc sheet trong workbook hiện tại.** Luôn khả dụng. Người dùng mở file backup hoặc CSV bằng Excel rồi chép vào, hoặc mở chính workbook backup và chạy import.
2. **Từ file JSON/CSV qua `<input type="file">`.** Bật sau khi spike xác nhận.
3. **Import trực tiếp file .xlsx** cần thư viện parse như ExcelJS hoặc SheetJS. Hoãn lại; nếu cần sẽ ghi ADR riêng (giấy phép, kích thước bundle).

### Luồng import

Chọn nguồn → nhận diện header → chọn loại dữ liệu → map cột → preview → validate → chọn cách xử lý bản ghi trùng → xác nhận → báo cáo.

- Mặc định **không ghi đè** bản ghi trùng. Các lựa chọn là: bỏ qua, cập nhật, hoặc hủy toàn bộ.
- Báo cáo số dòng hợp lệ, lỗi, trùng và bỏ qua, chỉ rõ dòng và cột.
- Không suy diễn đơn vị hoặc giá còn thiếu.
- Ghi vào IndexedDB trong một transaction. Nếu lỗi thì rollback và không để lại dữ liệu nửa chừng.
- Mã giữ nguyên dạng chuỗi (không mất số 0 đầu). Số thập phân đọc từ `values` dạng số. Ngày lưu dạng ISO 8601.

### Giới hạn

- Hiển thị cảnh báo trước khi import khi số dòng vượt ngưỡng cấu hình. Ngưỡng sẽ đo ở giai đoạn 6, không cam kết trước.

## Hệ quả

- Kênh workbook mới đòi hỏi ExcelApi 1.8, đúng bằng mức tối thiểu lúc chạy (ADR-0002) nên luôn có ở môi trường được hỗ trợ.
- Round-trip export → import phải được test tự động ở tầng serializer/parser và test tay trong Excel.

## Spike cần làm ở giai đoạn 1 và 3

- [ ] `<input type="file">` đọc được file JSON/CSV trong Excel Windows (WebView2) và Excel web.
- [ ] Tải blob JSON bằng `<a download>` trong WebView2: thành công hay lỗi.
- [ ] `navigator.clipboard.writeText` trong WebView2.
- [ ] `Excel.createWorkbook` mở workbook mới; tiếng Việt và số thập phân còn đúng sau khi lưu và mở lại.

## Nguồn

- https://learn.microsoft.com/en-us/office/dev/add-ins/concepts/browsers-used-by-office-web-add-ins
