# Validation and Error Handling

Kiểm tra: trường bắt buộc, mã trùng, đơn vị không khớp, giá bất thường, ngày hiệu lực, liên kết resource/norm, công thức lỗi, sheet/range không còn tồn tại, vùng bị bảo vệ, lỗi import/export và storage.

- Phân biệt lỗi chặn và cảnh báo.
- Gắn lỗi với bản ghi/dòng/cột/range.
- Đưa hướng khắc phục rõ ràng.
- Không thay dữ liệu lỗi bằng 0 hoặc giá mặc định âm thầm.
- Không nuốt exception; log an toàn, không lộ dữ liệu nhạy cảm.
- Nếu thao tác một phần thất bại, báo trạng thái và cách phục hồi.
- Không báo thành công trước khi API xác nhận.
