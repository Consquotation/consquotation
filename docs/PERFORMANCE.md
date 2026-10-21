# Hiệu năng và độ tin cậy (prompts/17)

## Số đo

Đo ngày 2026-10-21 trên Excel Microsoft 365 Windows (build 16.0.20430.20182), máy phát triển của dự án, task pane dev (`localhost:3000`). Đo bằng DevTools: `performance.now()` và các mốc `performance.mark`. **Đây là số đo trên một máy, không phải cam kết.**

| Thao tác | Kết quả | Ghi chú |
|---|---|---|
| Mở task pane tới khi render xong | 0,31 s sau khi bỏ polyfill (trước đó 0,34–0,50 s) | Mốc `cq-office-ready`, `cq-app-rendered` |
| Tải bundle production từ GitHub Pages (gzip) | 0,25–0,26 s; lần đầu 0,84 s | `taskpane.js` 161 KiB gzip + `react.js` 45 KiB gzip |
| Mở tab Thư viện (4 công tác) | < 0,5 s | |
| Mở tab Công tác với thư viện 20.004 mục | 0,40 s | Đo ở prompts/09, sau khi dùng chung `Intl.Collator` |
| Tìm kiếm trong 20.004 mục | 0,38 s | Gồm 0,2 s debounce |
| Chèn 1 công tác (bấm Thêm → báo thành công) | 0,37–0,39 s (5 lần) | Có kiểm tra vùng và vân tay trước khi ghi |
| Kiểm tra báo giá, bảng 122 dòng | 0,13 s | Đọc bảng, tổng hợp, sheet phân tích rồi kiểm tra |
| Nhập 20.000 công tác (CSV) | Kiểm tra gần như tức thì; ghi khoảng 4,5 s | prompts/09; có hiện "Đang ghi…" |
| Nhập lại 20.000 dòng ở chế độ Cập nhật | 5,5 s | prompts/09 |
| Sao lưu JSON | 0,01 s | |
| Xuất ra workbook Excel mới | 0,93 s | Tạo `.xlsx` trong add-in rồi gọi `Excel.createWorkbook` |

**Chưa đo:**
- Excel trên web và Mac.
- Chèn nhiều công tác trong một lần: giao diện thêm từng dòng; chưa có tính năng chèn hàng loạt.
- Thư viện trên 20.000 mục.

## Các biện pháp đang áp dụng

- **Gom lệnh:** gom đọc/ghi range và tránh `context.sync()` trong vòng lặp (quy tắc lint `office-addins/no-context-sync-in-loop`). Ngoại lệ duy nhất là đọc sheet để nhập: đọc theo khối 2.000 dòng, mỗi khối một lần sync, vì Excel trên web giới hạn 5 MB mỗi lần trả dữ liệu.
- **Đọc vừa đủ:** chỉ `load` các thuộc tính cần dùng; không giữ cả workbook trong bộ nhớ. Kiểm tra báo giá chỉ đọc bảng báo giá, bảng tổng hợp và bảng phân tích.
- **Thư viện lớn:**
  - danh sách hiện 50 mục mỗi trang, có nút "Xem thêm";
  - tìm kiếm có debounce 0,2 s;
  - sắp xếp dùng chung một `Intl.Collator`.
- **Thao tác lâu có tiến độ:** nhập (trên 5.000 dòng có cảnh báo trước, khi ghi hiện "Đang ghi vào thư viện…"); xuất, kiểm tra và ghi thì có spinner.
- **Giới hạn nhập:** 20 MB mỗi file, 50.000 dòng mỗi loại dữ liệu; báo trước khi vượt.
- **Không mất dữ liệu khi lỗi:**
  - mỗi lần nhập là một giao dịch IndexedDB (lỗi thì hủy toàn bộ);
  - mọi thao tác ghi Excel kiểm tra trước và báo trạng thái khi lỗi giữa chừng;
  - thông báo thành công chỉ hiện sau khi Excel xác nhận.
- **Bundle:**
  - biên dịch theo `browserslist` của dự án (không có IE11) và không kèm polyfill (ADR-0010), giảm 236 KiB (77 KiB gzip);
  - `taskpane.js` còn 571 KiB (161 KiB gzip), phần lớn là Fluent UI;
  - webpack vẫn cảnh báo vượt mức khuyến nghị 244 KiB. Chưa tách code vì thời gian mở pane đo được đã dưới 0,5 s.

## Cách đo lại

1. `npm start`, mở task pane, rồi mở DevTools của WebView2 (cổng 9229 khi chạy debug).
2. `performance.getEntriesByType("mark")` cho mốc mở pane.
3. Các thao tác khác: đo từ lúc bấm nút tới lúc thông báo kết quả hiện ra (xem cách làm trong `tests/manual/spec-13-17-checklist.md`).
