# Library Import / Export

Cho phép nhập thư viện từ Excel/CSV và xuất để backup/chuyển máy.

Import flow: chọn file → nhận diện sheet/header → chọn loại dữ liệu → map cột → preview → validate → chọn cách xử lý bản ghi trùng → xác nhận → báo cáo kết quả.

Yêu cầu:
- Schema có version và template công bố.
- Không ghi đè mặc định; hỗ trợ thêm mới/cập nhật/hủy.
- Báo số dòng hợp lệ, lỗi, trùng, bỏ qua; chỉ ra dòng/cột lỗi.
- Không tự suy diễn đơn vị hoặc giá bị thiếu.
- Bảo toàn tiếng Việt, mã, số thập phân và ngày.
- Export theo schema; không xuất secret.
- Test file rỗng, header sai, dữ liệu thiếu, mã trùng, ngày/số không hợp lệ và file lớn.
