# Security and Deployment

- Chỉ xin quyền tối thiểu trong manifest.
- Không lưu secret trong repository, manifest hoặc frontend bundle.
- Validate import; escape nội dung người dùng hiển thị trong HTML.
- Không thực thi mã tùy ý từ thư viện.
- Tách development/production; không dùng localhost trong bản production.
- Tài liệu hóa sideload, triển khai nội bộ, cập nhật và gỡ cài đặt.
- Chọn triển khai theo chính sách tổ chức; không coi sideload là phương thức phát hành cuối nếu không phù hợp.
- Kiểm tra môi trường Excel và báo khi không tương thích.
