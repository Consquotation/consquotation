# ADR-0001: Nền tảng Excel mục tiêu

- Trạng thái: Chấp nhận
- Ngày: 2026-10-19

## Bối cảnh

ConsQuotation là Excel Add-in (Office.js), không phải ứng dụng desktop. Add-in chạy trong webview do Excel cung cấp:

| Excel | Webview | ExcelApi cao nhất |
|---|---|---|
| Microsoft 365 trên Windows; Office 2016/2019/2021/2024 **retail** (Click-to-Run, có cập nhật) | Edge WebView2 (Office 2021+ cài sẵn; bản cũ hơn cần WebView2 Runtime) | Theo build, tới 1.21 |
| Office 2016 **volume** (MSI) | Internet Explorer 11 (Trident) | 1.1 |
| Office 2019 **volume** | Internet Explorer 11 (Trident) | 1.8 |
| Office 2021 / 2024 volume (LTSC) | WebView2 | 1.14 / 1.17 |
| Excel trên Mac | Safari WKWebView | Theo phiên bản, tới 1.21 |
| Excel trên web | Trình duyệt người dùng | Mới nhất |

Office 2016 và 2019 đã hết hạn hỗ trợ của Microsoft. Microsoft khuyến nghị add-in ít nhất phải báo lỗi rõ ràng khi chạy trong webview IE11/EdgeHTML thay vì để trống màn hình.

Môi trường phát triển hiện có: Windows 11, Excel Microsoft 365 (Home, tài khoản Microsoft cá nhân), Current Channel, build 16.0.20430.20182 x64. Không có máy Mac. Không có máy Excel 2016/2019.

## Quyết định

| Mức | Nền tảng | Cam kết |
|---|---|---|
| Chính | Excel trên Windows, Microsoft 365 | Phát triển và kiểm thử đầy đủ trên máy phát triển |
| Phụ | Excel trên web (tài liệu OneDrive) | Kiểm thử luồng chính trước mỗi bản phát hành |
| Hỗ trợ đầy đủ, chưa kiểm thử | Excel 2016 / 2019 / 2021 / 2024 trên Windows **khi chạy WebView2 và đạt ExcelApi tối thiểu lúc chạy** (ADR-0002) | Không có máy test; đảm bảo bằng kiểm tra môi trường lúc chạy. Ghi "chưa kiểm thử" trong README |
| Chưa kiểm thử | Excel trên Mac, iPad | Không chặn, ghi rõ "chưa kiểm thử" |
| Cài được, báo không tương thích | Excel 2016 / 2019 **volume** (IE11) và mọi môi trường dùng IE11 hoặc EdgeHTML | Task pane hiện thông báo tiếng Việt: phiên bản không tương thích, cách khắc phục (cập nhật Office / cài WebView2 Runtime / dùng Excel trên web). Không thao tác workbook |

## Hệ quả

- `taskpane.html` có một đoạn kiểm tra môi trường viết bằng **ES5 thuần**, chạy trước bundle chính. Nếu phát hiện IE11 (Trident) hoặc EdgeHTML, đoạn này hiện thông báo và không tải bundle React. Như vậy IE11 không gặp lỗi cú pháp hay màn hình trắng.
- Sau khi bundle chính tải xong, add-in kiểm tra requirement set (ADR-0002). Nếu thiếu, hiện thông báo tương tự.
- README và tài liệu phát hành phải có ma trận nền tảng ghi rõ đã test / chưa test.
- Tính năng chỉ được tuyên bố hoàn thành khi đã chạy trong Excel Windows Microsoft 365.
- Excel trên web có kho lưu trữ trình duyệt riêng, không dùng chung với Excel desktop (ADR-0003).

## Cần xác minh

- [ ] Thông báo không tương thích hiển thị đúng khi giả lập user agent IE11/EdgeHTML (test tự động cho hàm phát hiện; không có máy thật).
- [ ] Nếu sau này có máy Excel 2016/2019, chạy checklist kiểm thử tay và cập nhật ma trận.

## Nguồn

- https://learn.microsoft.com/en-us/office/dev/add-ins/concepts/browsers-used-by-office-web-add-ins
- https://learn.microsoft.com/office/dev/add-ins/develop/support-ie-11
- https://learn.microsoft.com/en-us/javascript/api/requirement-sets/excel/excel-api-requirement-sets
