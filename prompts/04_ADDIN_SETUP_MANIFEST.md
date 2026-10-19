# Add-in Setup and Manifest

Tạo add-in bằng scaffold/tooling Office Add-ins được hỗ trợ tại thời điểm triển khai. Manifest phải hợp lệ, khai báo tên, mô tả, icon, Ribbon commands/task pane và quyền tối thiểu cần thiết.

Yêu cầu:
- Có scripts dev, lint, typecheck, test, build.
- Tài liệu hóa HTTPS/dev certificate nếu cần, sideload, gỡ add-in và xử lý cache.
- Tách cấu hình development/production; không để localhost trong manifest production.
- Không nhúng secret.
- Kiểm tra add-in xuất hiện và mở đúng task pane trong Excel mục tiêu.
- Không dùng manifest/schema cũ mà chưa xác minh.
