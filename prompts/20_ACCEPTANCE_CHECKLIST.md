# Acceptance Checklist

## Nền tảng
- [ ] Excel mục tiêu được chốt và API requirement sets đã xác minh.
- [ ] Manifest hợp lệ; task pane mở từ Ribbon.
- [ ] Hướng dẫn sideload/triển khai đúng.

## Workbook
- [ ] Tạo mẫu trên workbook hiện tại.
- [ ] Kiểm tra vùng đích và cảnh báo ghi đè.
- [ ] Không thay đổi dữ liệu ngoài vùng được xác nhận.
- [ ] Không tạo sheet/table trùng ngoài ý muốn.

## Thư viện cá nhân
- [ ] Người dùng tự thêm/sửa/xóa/tìm kiếm.
- [ ] Không có thư viện định mức/giá chính thức giả lập cài sẵn.
- [ ] Import có preview và validation.
- [ ] Export/import lại bảo toàn dữ liệu.
- [ ] Có backup/restore và mô tả storage.

## Tính toán
- [ ] Thành tiền/tổng đúng.
- [ ] Quy tắc làm tròn rõ ràng.
- [ ] Thiếu dữ liệu/công thức lỗi được cảnh báo.
- [ ] Không hard-code thuế/chiết khấu thiếu căn cứ.
- [ ] Có thể truy vết nguồn giá khi có dữ liệu.

## Chất lượng
- [ ] Lint/typecheck/build/test đạt hoặc nêu giới hạn.
- [ ] Luồng chính đã thử trong Excel thật.
- [ ] Không có secret trong repository.
- [ ] README đúng với project thực tế.
