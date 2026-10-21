# Ma trận tương thích Excel (prompts/14)

Cập nhật 2026-10-21. Quyết định nền tảng: [ADR-0001](ADR/0001-nen-tang-excel-muc-tieu.md). Manifest và requirement set: [ADR-0002](ADR/0002-manifest-va-requirement-set.md).

## Nền tảng

| Nền tảng | Mức hỗ trợ | Đã kiểm thử | Ghi chú |
|---|---|---|---|
| Excel Microsoft 365 trên Windows (WebView2) | **Chính** | **Có.** Build 16.0.20430.20182 (en-US), định dạng vùng tiếng Việt (dấu thập phân `,`, công thức hiển thị `;`). Đã chạy mọi checklist prompts/04–17 | |
| Excel trên web | Phụ | **Chưa** | Có giới hạn 5 MB mỗi lần gửi tới Excel (đọc sheet đã chia khối 2.000 dòng). Tải file và chọn file theo cách của trình duyệt |
| Excel 2016/2019/2021/2024 bản retail trên Windows | Hỗ trợ nếu có WebView2 và ExcelApi ≥ 1.8 | **Chưa** (không có máy) | Thiếu 1.9 thì phần thiết lập in chỉ hiện hướng dẫn |
| Excel trên Mac | Chưa kiểm thử | **Chưa** | Chưa kiểm tra tải file JSON và `<input type=file>` trên WKWebView |
| Excel 2016/2019 bản volume (IE11/EdgeHTML) | **Không hỗ trợ** | Unit test | Hiện thông báo không tương thích, không thao tác workbook |

## Requirement set theo tính năng

Mức tối thiểu lúc chạy là **ExcelApi 1.8**; thiếu mức này thì add-in không chạy. Tab Cài đặt › Môi trường Excel hiện tình trạng thực tế trên máy đang dùng.

| Tính năng | API chính | Requirement set | Thiếu thì sao | Đã test (Win) |
|---|---|---|---|---|
| Tạo bảng báo giá, chèn dòng, Table, công thức có cấu trúc | `tables.add`, `rows.add`, `Range.formulas` | 1.1 | — | Có |
| Kiểm tra sheet bị bảo vệ | `worksheet.protection` | 1.2 | — | Có |
| Đối tượng null, settings, tên đã đặt (khu vực điều khoản) | `getItemOrNullObject`, `settings`, `names.add` | 1.4 | — | Có |
| Vùng chọn đổi khi pane mở | `DocumentSelectionChanged` (Common API) | Common | — | Có |
| Xuất workbook mới (sao lưu thư viện) | `Excel.createWorkbook` | 1.8 | (mức tối thiểu) | Có |
| Danh sách chọn ở bảng tổng hợp | `dataValidation` | 1.8 | (mức tối thiểu) | Có |
| **Thiết lập trang in** | `worksheet.pageLayout` | **1.9** | Hiện hướng dẫn Page Layout trong Excel; không gọi API | Có |
| **Kiểm tra ô gộp khi tạo mẫu** | `getMergedAreasOrNullObject` | **1.13** | Bỏ qua kiểm tra này và báo "không kiểm tra được ô gộp" | Có |

## Dùng chức năng sẵn có của Excel

Add-in **không** làm thay các việc sau; người dùng dùng Excel như bình thường:
- sao chép/dán, lọc, sắp xếp;
- công thức tự viết;
- lưu workbook;
- in, xem trước bản in, xuất PDF.

Các thao tác add-in ghi (tạo bảng, chèn dòng, ghi tổng hợp, điều khoản, thông tin, áp dụng làm tròn) **không hoàn tác được bằng Ctrl+Z** (đã kiểm chứng). Vì vậy:
- mọi thao tác ghi vào vùng có dữ liệu đều được kiểm tra và hỏi xác nhận trước;
- các hộp xác nhận nhắc rằng thao tác không hoàn tác được;
- nếu lỗi xảy ra giữa chừng, thông báo nói rõ một phần có thể đã được ghi và cách kiểm tra lại.

## Sheet và vùng chọn thay đổi khi task pane đang mở

- Không dùng vùng chọn đã lưu như thể vẫn còn đúng. Vị trí chèn được xác định khi kiểm tra; ngay trước khi ghi, add-in kiểm tra lại bằng vân tay và dừng nếu sheet đã đổi.
- Danh sách bảng tự làm mới khi vùng chọn hoặc sheet đổi.
- Sheet hoặc bảng bị đổi tên hay xóa: add-in báo "Không tìm thấy… — bấm Tải lại danh sách" (mã `ItemNotFound`).
- Panel Thông tin, Tổng hợp và Ghi chú đọc lại sheet trước khi ghi. Nếu sheet vừa bị sửa, add-in không ghi đè.

## Sheet bị bảo vệ

Các thao tác ghi đều kiểm tra trước khi chạy. Nếu sheet đang được bảo vệ, add-in chặn và báo rõ, kể cả khi đã kiểm tra mà Excel vẫn từ chối (mã `AccessDenied` kèm hướng khắc phục). Các thao tác gồm:
- tạo bảng, chèn dòng;
- bảng tổng hợp, khu vực điều khoản, thông tin báo giá;
- sheet phân tích;
- thiết lập trang in.

Đã kiểm thử: xem checklist regression ở `tests/manual/regression-checklist.md`.

## Locale

- **Công thức** luôn được ghi theo cú pháp en-US qua `Range.formulas` (dấu `,`). Excel tự hiển thị theo locale; đã kiểm chứng `formulasLocal` dùng `;` trên máy định dạng tiếng Việt.
- **Số người dùng gõ** trong task pane:
  - Nhận dấu thập phân `.` hoặc `,`.
  - Từ chối dấu phân cách hàng nghìn (`1.500.000`) thay vì đoán.
  - Số đọc từ ô Excel là số thật, không phụ thuộc cách hiển thị.
- **Ngày:** người dùng nhập `dd/mm/yyyy` hoặc `yyyy-mm-dd`; add-in ghi vào ô dưới dạng số ngày Excel kèm định dạng `dd/mm/yyyy`.
  - Không ghi chuỗi ngày vào ô, vì Excel hiểu chuỗi theo locale của Excel. Đã kiểm chứng: "01/10/2026" bị hiểu thành 10/01/2026 trên Excel en-US.
- **Chữ:** luôn ghi kèm tiền tố `'`, nên "007" không thành 7, "1/2" không thành ngày, "10%" không thành 0,1.
- **Chưa kiểm thử:** Excel giao diện tiếng Việt, và định dạng vùng en-US (dấu thập phân `.`). Không đổi cài đặt hệ thống của máy kiểm thử.
