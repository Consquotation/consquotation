# Regression — danh sách test tối thiểu (prompts/16)

**Lần chạy 2026-10-21 (bản 1.7.0).**
- Claude tự chạy trên Excel desktop thật (Microsoft 365, build 16.0.20430.20182), điều khiển task pane qua DevTools.
- Chạy trên sheet mới "Regression" (sau đó đổi tên thành "Regression đổi tên"), bảng `CQ_Quote_4`.
- Đặt ô đánh dấu quanh vùng add-in quản lý: K1, K12, M30, A60.
- Chạy lại toàn bộ danh sách này trước mỗi lần phát hành.

| # | Test tối thiểu (prompts/16) | Cách kiểm | Kết quả |
|---|---|---|---|
| 1 | Add-in xuất hiện, task pane mở | Nút Ribbon (người dùng xác nhận ở prompts/08); pane tải, render xong sau 0,31 s | Đạt |
| 2 | Tạo mẫu ở sheet trống; cảnh báo vùng có dữ liệu | Tạo trên sheet mới. Tạo tại K1 (có ô đánh dấu) thì báo đúng K1, K12; bấm Hủy thì K1 giữ nguyên | Đạt |
| 3 | Chèn công tác từ thư viện | Thư viện › 007 › Chèn vào báo giá › KL 2 → đúng dòng, đơn giá và ghi chú truy vết | Đạt |
| 4 | CRUD thư viện; import/export và round-trip | CRUD: checklist prompts/08 cùng unit test. Sao lưu JSON rồi nhập lại → 14 bản ghi, toàn bộ là trùng, 0 bản ghi mới | Đạt |
| 5 | Công thức thành tiền/tổng đúng | 2 × 1.250.000,75 → 2.500.000 (quy tắc làm tròn tới hàng nghìn của workbook); 3 × 1.000 → 3.000; tổng `SUBTOTAL` = 2.503.000 | Đạt |
| 6 | Thiếu giá/đơn vị/công thức có cảnh báo | Kiểm tra báo "Thiếu đơn vị tính" (E18), "Thành tiền bị gõ đè" (H17), kèm cách sửa | Đạt |
| 7 | Workbook/sheet đổi, sheet protected, storage lỗi | Đổi tên sheet khi pane mở → vẫn thêm đúng bảng. Bảng bị xóa → "Không tìm thấy bảng báo giá…". Sheet bị bảo vệ → Thêm công tác, Thông tin, Tổng hợp, Ghi chú, Trang in đều chặn trước khi ghi. IndexedDB lỗi → "Không mở được thư viện" kèm nút Thử lại, phục hồi được | Đạt (sau khi sửa lỗi 2) |
| 8 | Mã trùng / liên kết hỏng | Unit test (thư viện, nhập). Tab Kiểm tra thư viện hiện 0 lỗi, 4 cảnh báo. Checklist prompts/08–09 | Đạt |
| 9 | Người dùng sửa ô sau khi add-in chèn | Sửa đơn giá dòng thư viện → báo khác thư viện hiện tại. Gõ đè Thành tiền → báo gõ đè. Đổi tên cột mẫu → báo lỗi rõ, không crash | Đạt (sau khi sửa lỗi 1) |
| 10 | Không làm hỏng dữ liệu ngoài vùng quản lý | Sau mọi thao tác: K1, K12, M30 nguyên vẹn. A60 nằm dưới bảng nên được hỏi trước khi đẩy; sau 4 lần chèn đã xác nhận, dữ liệu dời xuống A64, không mất | Đạt |

## Lỗi tìm thấy khi chạy regression (đã sửa)

1. **Kiểm tra báo giá bị crash (`RangeError`)** khi bảng có cột mẫu bị đổi tên, ví dụ ô tiêu đề "Đơn giá" bị gõ đè.
   - Lỗi được phát hiện nhờ nhật ký lỗi kỹ thuật mới.
   - Sửa: báo lỗi chặn nêu đúng cột bị đổi, kèm cách khắc phục; thêm unit test.
2. **Thiết lập trang in trên sheet bị bảo vệ để lại thay đổi dở dang.**
   - Hiện tượng: Excel báo AccessDenied *sau khi* đã đặt vùng in và khổ giấy (thấy rõ khi đọc lại sheet).
   - Sửa: kiểm tra bảo vệ trước khi ghi và khóa nút Áp dụng; các thông báo "sheet bị bảo vệ" chỉ cách bỏ bảo vệ.
