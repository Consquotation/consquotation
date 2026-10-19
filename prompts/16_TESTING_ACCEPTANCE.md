# Testing and Acceptance

Các lớp test: unit tests cho domain/validation/import/pricing; integration tests cho storage; Office.js mocks cho orchestration; manual tests trong Excel thật; regression tests.

Test tối thiểu:
- Add-in xuất hiện, task pane mở.
- Tạo mẫu ở sheet trống; cảnh báo vùng có dữ liệu.
- Chèn công tác từ thư viện.
- CRUD thư viện; import/export và round-trip.
- Công thức thành tiền/tổng đúng.
- Thiếu giá/đơn vị/công thức có cảnh báo.
- Workbook/sheet đổi, sheet protected, storage lỗi.
- Mã trùng/liên kết hỏng.
- Người dùng sửa ô sau khi add-in chèn dữ liệu.
- Không làm hỏng dữ liệu ngoài vùng quản lý.

Nghiệm thu khi lint/typecheck/build/tests đạt hoặc có giới hạn được ghi rõ, luồng chính test trong Excel thật, README đúng thực tế và không có secret.
