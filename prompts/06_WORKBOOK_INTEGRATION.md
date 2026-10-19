# Workbook Integration

Add-in thao tác với workbook hiện tại và chỉ thay đổi vùng đã xác định.

- Đọc workbook, worksheet, selection an toàn.
- Tạo sheet/mẫu hoặc dùng sheet hiện tại theo lựa chọn.
- Tạo bảng báo giá và Excel Table khi phù hợp.
- Chèn công tác tại vị trí đã chọn.
- Kiểm tra vùng đích trước khi ghi; cảnh báo nếu có dữ liệu.
- Không xóa/đổi tên sheet hoặc ghi đè dữ liệu ngoài phạm vi được xác nhận.
- Dùng tên sheet/table hợp lệ và tránh trùng.
- Xử lý workbook/sheet bị đổi hoặc bị xóa trong lúc task pane mở.
- Dùng batch Office.js, load properties cần thiết, tránh sync thừa trong vòng lặp.
- Không giữ proxy object sau batch.
- Tạo thao tác idempotent khi có thể.

Nghiệm thu: chạy lặp không tạo trùng ngoài ý muốn; công thức/format đúng; dữ liệu ngoài vùng không đổi.
