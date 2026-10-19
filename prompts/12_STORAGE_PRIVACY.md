# Storage and Privacy

Trước khi chọn storage, xác minh nền tảng Excel, giới hạn sandbox, khả năng browser storage, nhu cầu đồng bộ và chính sách IT. Không giả định Office.js được truy cập tùy ý vào file path hoặc dùng SQLite trực tiếp.

Chọn phương án đơn giản nhất:
- Storage cục bộ được nền tảng hỗ trợ cho dữ liệu nhỏ.
- File thư viện do người dùng import/export để backup/chuyển máy.
- OneDrive/SharePoint/backend chỉ khi có yêu cầu đồng bộ và đã xác định quyền/bảo mật.

Bắt buộc:
- Ghi rõ nơi lưu, dữ liệu nào lưu và cách backup/xóa.
- Không gửi workbook/thư viện lên server theo mặc định.
- Không log nội dung báo giá không cần thiết.
- Không nhúng secret.
- Version schema, xử lý quota/storage failure và phục hồi từ export.
