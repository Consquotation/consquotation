# ADR-0002: Loại manifest và requirement set tối thiểu

- Trạng thái: Chấp nhận
- Ngày: 2026-10-19

## Bối cảnh

Microsoft hiện cung cấp hai loại manifest cho add-in Excel:

1. **Manifest chỉ dành cho add-in (XML).** Dùng được cho production trên mọi nền tảng Excel, kể cả Office 2016.
2. **Manifest hợp nhất cho Microsoft 365 (JSON).** Hỗ trợ Excel trên web, Windows Microsoft 365 từ Version 2501 và Mac từ 16.103. **Không hỗ trợ Office vĩnh viễn trên Windows.** Việc sideload đi qua Microsoft 365 Agents Toolkit hoặc kho ứng dụng Teams.

Trên Windows, manifest XML được sideload bằng `npm start` (qua registry dev settings). Cách này không cần tenant Microsoft 365 công việc/trường học, nên phù hợp với tài khoản cá nhân trên máy phát triển.

ADR-0001 yêu cầu add-in **cài được trên Excel 2016 trở lên**. Excel 2016 volume chỉ có ExcelApi 1.1. Nếu manifest đòi requirement set cao hơn, Excel sẽ ẩn add-in và người dùng không biết lý do.

Các API cốt lõi mà ConsQuotation cần:

| API | Requirement set |
|---|---|
| Table, Range, `formulas`, `values` | 1.1 |
| Kiểm tra sheet bị bảo vệ | 1.2 |
| `getItemOrNullObject`, `workbook.settings` | 1.4 |
| Sự kiện worksheet/selection | 1.7 |
| `Excel.createWorkbook` (export, ADR-0004) | 1.8 |

## Quyết định

- Dùng **manifest XML (add-in only)**.
- Tách manifest thành hai file:
  - `manifest.dev.xml` trỏ tới `https://localhost:<port>`.
  - `manifest.prod.xml` trỏ tới domain HTTPS production (ADR-0005). Bản này không chứa localhost.
- **Manifest khai báo `ExcelApi` 1.1** để add-in cài và hiện trên Ribbon ở mọi Excel từ 2016. Nhờ đó add-in luôn có cơ hội báo lỗi tiếng Việt thay vì biến mất.
- **Mức tối thiểu lúc chạy là ExcelApi 1.8**, kèm webview hiện đại (WebView2, WKWebView hoặc trình duyệt hiện đại). Khi khởi động:
  1. Đoạn ES5 trong `taskpane.html` loại trừ IE11 và EdgeHTML (ADR-0001).
  2. Bundle chính gọi `Office.context.requirements.isSetSupported('ExcelApi', '1.8')`. Nếu không đạt, hiện thông báo không tương thích và không thao tác workbook.
- API cao hơn 1.8 chỉ được gọi sau khi kiểm tra `isSetSupported`. Nếu không hỗ trợ, hiện thông báo và dùng phương án thay thế hoặc ẩn tính năng.
- Mọi lời gọi requirement set được gom vào một module trong `src/office/` (bảng "tính năng → requirement set") để kiểm tra tập trung.
- Permission khai báo ở mức `ReadWriteDocument`, là quyền tối thiểu để ghi bảng báo giá vào workbook.
- Ribbon có tab hoặc nhóm "ConsQuotation". Chỉ thêm nút khi lệnh đã được triển khai; giai đoạn 1 chỉ có "Mở ConsQuotation". Ribbon command cần `AddinCommands 1.1`. Excel cũ không hỗ trợ add-in command sẽ dùng nút mặc định trong menu Add-ins.

## Hệ quả

- Chưa kết hợp được add-in với Teams app hoặc Copilot agent trong một gói. Hiện không có nhu cầu này.
- Khi Microsoft hỗ trợ manifest hợp nhất cho Office vĩnh viễn, có thể chuyển đổi bằng công cụ `office-addin-manifest-converter` và ghi ADR mới.
- Vì manifest khai báo 1.1, người dùng Excel quá cũ vẫn thấy add-in. Màn hình thông báo không tương thích là bắt buộc, không phải tùy chọn.

## Cần xác minh trong Excel thật

- [ ] `npm start` sideload thành công với tài khoản Microsoft cá nhân trên máy phát triển.
- [ ] `office-addin-manifest validate` báo hợp lệ cho cả manifest dev và prod.
- [ ] Kiểm tra môi trường lúc chạy báo đạt trên Excel Microsoft 365 của máy phát triển.

## Nguồn

- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/add-in-manifests
- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/unified-manifest-overview
- https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-add-in-with-unified-manifest
- https://learn.microsoft.com/en-us/javascript/api/requirement-sets/excel/excel-api-requirement-sets
