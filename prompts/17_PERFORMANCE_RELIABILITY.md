# Performance and Reliability

- Batch đọc/ghi range, tránh `context.sync()` thừa trong vòng lặp.
- Chỉ load properties cần thiết.
- Phân trang/lọc danh sách thư viện lớn; debounce tìm kiếm.
- Không giữ toàn workbook trong memory khi chỉ cần một vùng.
- Hiển thị tiến độ cho thao tác lâu.
- Giới hạn import và báo trước khi file quá lớn.
- Xử lý lỗi storage/API không làm mất dữ liệu.
- Đo thời gian mở pane, tải thư viện, chèn một/nhiều công tác, validate và import/export trên môi trường mục tiêu; không cam kết hiệu năng trước khi đo.
