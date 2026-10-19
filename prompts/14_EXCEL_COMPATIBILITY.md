# Excel Compatibility

Xác định ma trận hỗ trợ: Excel Windows, Mac, Web và phiên bản cụ thể. Xác minh requirement sets/API cho từng tính năng; ghi nền tảng đã test và chưa test.

- Dùng Excel native cho copy/paste, undo/redo, filter, sort, formula, print và save.
- Không giả định mọi thao tác ghi qua Office.js đều tham gia undo stack như thao tác native.
- Xử lý người dùng đổi sheet/selection khi task pane mở.
- Tôn trọng protected sheet và báo lỗi rõ ràng.
- Dùng table/structured references khi phù hợp.
- Kiểm thử locale, dấu thập phân, dấu phân cách công thức và ngày.
- Không giữ selection cache cũ như thể luôn còn đúng.
