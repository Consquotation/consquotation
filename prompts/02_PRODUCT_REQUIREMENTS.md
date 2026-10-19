# Product Requirements

## Mục tiêu
Cung cấp công cụ báo giá thi công xây dựng chạy trong Excel, tận dụng workbook và công thức Excel, bổ sung các lệnh chuyên ngành cùng thư viện riêng do người dùng quản lý.

## MVP
- Cài đặt/sideload add-in và mở task pane từ Ribbon.
- Tạo bảng báo giá trong workbook hiện tại.
- Nhập công tác thủ công hoặc chọn từ thư viện cá nhân.
- Quản lý thư viện: thêm, sửa, sao chép, xóa có xác nhận, tìm kiếm và phân nhóm.
- Import/export thư viện qua file theo schema có version.
- Tính thành tiền, tổng hợp, kiểm tra dữ liệu thiếu và lỗi công thức.
- Hướng dẫn backup/restore và xử lý lỗi.

## Ngoài phạm vi ban đầu
- Không có thư viện định mức/giá chính thức cài sẵn.
- Không tự động tra giá thị trường.
- Không tự xác nhận tuân thủ pháp luật.
- Không gửi báo giá hoặc dữ liệu ra dịch vụ ngoài.
- Không xây ứng dụng desktop độc lập.

## Cột báo giá mặc định
STT, Mã công tác, Nhóm công tác, Nội dung công việc, Đơn vị tính, Khối lượng, Đơn giá, Thành tiền, Ghi chú.

## Thông tin báo giá tùy chọn
Đơn vị lập, khách hàng, dự án, mã báo giá, ngày lập, phiên bản, hiệu lực, phạm vi, giả định, phần loại trừ và điều khoản thương mại.

## Câu hỏi cần xác minh
- Excel Windows, Mac, Web hay kết hợp?
- Phiên bản Microsoft 365 hay Excel bản vĩnh viễn?
- Có bắt buộc offline?
- Cài cá nhân hay triển khai tập trung?
- Thư viện lưu local, trong file người dùng chọn hay OneDrive/SharePoint?
Nếu chưa rõ, nêu giả định; không thêm backend không cần thiết.
