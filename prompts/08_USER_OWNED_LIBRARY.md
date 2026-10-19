# User-Owned Library

**Mỗi người dùng tự xây dựng và quản lý thư viện của mình.** Không cần thư viện chung cài sẵn; không tự tải hay bịa dữ liệu.

## Loại dữ liệu
- WorkItem: công tác.
- Resource: vật liệu/nhân công/máy/tài nguyên do người dùng định nghĩa.
- ResourcePrice: đơn giá nguồn, đơn vị, tiền tệ, ngày hiệu lực, nguồn và trạng thái.
- NormDefinition: định mức/cấu thành hao phí nếu người dùng có dữ liệu.
- QuoteTemplate và thiết lập cá nhân khi cần.

## Trường WorkItem gợi ý
`id`, `code`, `name`, `group`, `unit`, `description`, `pricingMethod`, `unitPrice`, `currency`, `source`, `effectiveFrom`, `effectiveTo`, `notes`, `createdAt`, `updatedAt`.

## Nghiệp vụ
- Thêm/sửa/sao chép/xóa có xác nhận.
- Tìm kiếm theo mã/tên/nhóm/đơn vị.
- Kiểm tra mã trùng, dữ liệu thiếu và liên kết hỏng.
- Hỗ trợ giá có ngày hiệu lực; cảnh báo giá hết hạn.
- Không mặc định giá mới nhất là giá đúng.
- Không để cập nhật thư viện làm đổi báo giá cũ âm thầm.
- Tài liệu hóa nơi lưu, backup, restore và cách chuyển máy.
- Không trộn dữ liệu người dùng nếu không có tính năng chia sẻ rõ ràng.
