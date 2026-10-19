# Pricing and Formula Rules

Các phương pháp đơn giá: nhập trực tiếp; tra thư viện người dùng; phân tích cấu thành từ tài nguyên/định mức do người dùng nhập; công thức tùy chỉnh có kiểm soát nếu được triển khai.

Nguyên tắc:
- Không tự thêm đơn giá/định mức/thuế suất.
- Hiển thị phương pháp và nguồn giá.
- Phân biệt trống, 0 và lỗi; không thay lỗi bằng 0 âm thầm.
- Dùng công thức Excel cho phép tính đơn giản khi phù hợp; xác định cột/range qua table/header hoặc template, không hard-code địa chỉ ô thiếu căn cứ.
- Kiểm tra cú pháp, dữ liệu đầu vào, chia 0 và tham chiếu vòng nếu engine hỗ trợ.
- Quy tắc làm tròn phải nêu rõ precision, rounding mode và cấp làm tròn.
- Chiết khấu/phụ phí/thuế/thứ tự áp dụng phải cấu hình; không hard-code tỷ lệ không có căn cứ.
- Với đơn giá phân tích, cho phép truy vết tài nguyên, định mức, đơn giá nguồn và phép tính trung gian.
- Xác minh cú pháp công thức và locale Excel trên nền tảng mục tiêu.
