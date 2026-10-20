# Kiểm thử — Thư viện của tôi (prompts/08_USER_OWNED_LIBRARY.md)

**Lần chạy 2026-10-20:** Claude tự chạy trên Excel desktop thật (Microsoft 365, build 16.0.20430.20182), điều khiển task pane qua DevTools (cổng 9229) trong workbook tạm do `npm start` tạo; dữ liệu thử nằm trong thư viện của bản dev (`localhost:3000`).

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| L1 | Mở tab **Thư viện** lần đầu | Thư viện trống, không có dữ liệu mẫu; có cảnh báo chưa có sao lưu | Đạt |
| L2 | Thêm công tác, bấm Lưu khi để trống | Lỗi tiếng Việt tại Mã, Tên, Đơn vị | Đạt (sau khi sửa lỗi 1) |
| L3 | Mã trùng khác hoa thường và có khoảng trắng (`" bt-01 "`); đơn giá `1.500.000`; ngày kết thúc trước ngày bắt đầu | Báo lỗi tại đúng trường, không lưu | Đạt |
| L4 | Thêm tài nguyên XM và CAT; thêm 3 giá cho XM (2 chồng thời gian, 1 sai đơn vị); thêm tài nguyên trùng mã `xm` | Đơn vị giá mặc định theo tài nguyên; cảnh báo "không tự chọn giá"; giá hết hạn có nhãn; mã trùng bị chặn | Đạt (sau khi sửa lỗi 2 và 3) |
| L5 | Định mức: hao phí 0; trùng tài nguyên; hao phí `0,48`; xóa định mức | Chặn 0 và trùng; nhận `0,48`; xóa phải xác nhận | Đạt |
| L6 | Tìm kiếm `be tong`, `DAO DAT`, `m2`, `khongco`; lọc nhóm Móng | Không phân biệt dấu và hoa thường; đúng kết quả; lọc nhóm đúng | Đạt |
| L7 | Bấm Sao chép 2 lần nhanh | Đúng 1 bản sao `BT-01 (2)` kèm 2 định mức | Đạt |
| L8 | Xóa tài nguyên đang được định mức dùng; xóa tài nguyên có giá (Hủy, rồi Xóa bấm đúp); xóa công tác có định mức | Tài nguyên đang dùng bị chặn ngay, không có hộp xác nhận; hộp xác nhận nêu số giá/định mức bị xóa kèm; Hủy giữ nguyên | Đạt |
| L9 | Tab Kiểm tra | Liệt kê giá hết hạn, thiếu giá, đơn vị không khớp, giá chồng thời gian; ngày dạng dd/mm/yyyy | Đạt (sau khi sửa định dạng ngày) |
| L10 | Nạp lại task pane | Dữ liệu còn nguyên; tab Cài đặt hiện số lượng | Đạt |
| L11 | Chọn ô D12 trong bảng báo giá → Thư viện › BT-01 › **Chèn vào báo giá** → nhập Khối lượng 2 → Thêm (bấm 2 lần) | Chuyển sang tab Báo giá, form điền sẵn kèm ghi chú nguồn giá; vị trí "dưới hàng 12"; dòng vào hàng 13; Thành tiền 3.000.000; chỉ 1 dòng; workbook được đánh dấu đã dùng thư viện | Đạt |
| L12 | Chèn DD-01 (giá hết hạn) và XT-10 (chưa có giá) | Cảnh báo hết hạn (30/06/2026) hoặc chưa có giá; không tự đổi giá; Đơn giá trống khi chưa có giá | Đạt |
| L13 | Bấm Lưu công tác mới 2 lần nhanh | Chỉ tạo 1 công tác | Đạt |
| L14 | Sau khi chèn, sang tab khác rồi về Báo giá | Form không bị điền lại công tác cũ | Đạt |
| L15 | Mô phỏng xóa cache (xóa database thư viện) khi 2 task pane đang mở | Xóa không bị treo; workbook từng dùng thư viện hiện cảnh báo thư viện trống bất thường; workbook khác không cảnh báo; lưu tiếp vẫn được | Đạt (sau khi sửa lỗi 5) |
| L16 | Công tác tên `=SUM(A1:A3)` → chèn vào báo giá | Ô lưu dạng chữ, không chạy công thức | Đạt |
| L17 | Sửa giá BT-01 trong thư viện sau khi đã chèn | Dòng báo giá **giữ giá cũ** (bản sao giá trị) | Đạt |
| L18 | Thêm công tác hoặc tạo bảng khi workbook đang **không** có focus (mở nhiều workbook) | Báo thành công, ghi đúng 1 lần | Đạt (sau khi sửa lỗi 4) |

## Lỗi phát hiện và đã sửa trong lần chạy này

1. **Kiểm tra mặc định của trình duyệt chặn thông báo lỗi tiếng Việt.**
   - Hiện tượng: ô bắt buộc mang thuộc tính `required`, nên trình duyệt nhúng chặn việc gửi form và hiện bong bóng nhắc riêng của nó; kiểm tra của add-in không chạy.
   - Phạm vi: ảnh hưởng cả form Thêm công tác (ô Nội dung công việc) từ giai đoạn 2.
   - Sửa: thêm `noValidate` cho mọi form.
2. **Hai ô cùng tên "Đơn vị tính"** trong màn hình sửa tài nguyên (của tài nguyên và của giá).
   - Sửa: đổi tên ô của giá thành "Đơn vị tính của giá".
3. **Hai nút cùng tên "Lưu"** khi đang sửa một giá.
   - Hiện tượng: bấm nhầm nút lưu tài nguyên thì thay đổi của giá bị bỏ qua mà không báo gì.
   - Sửa: đặt tên "Lưu tài nguyên", "Lưu giá", "Lưu công tác".
4. **Báo thất bại dù đã ghi khi workbook mất focus.**
   - Hiện tượng: khi mở nhiều workbook, bước chọn hoặc chuyển tới vùng vừa ghi bị lỗi. Add-in báo thất bại dù dữ liệu đã ghi, dễ khiến người dùng bấm lại và tạo trùng.
   - Phạm vi: có từ giai đoạn 2.
   - Sửa: bước chọn, chuyển sheet và ghi metadata chạy sau khi ghi đã thành công, và không còn làm sai kết quả nếu chúng lỗi.
5. **Xóa hoặc nâng cấp database thư viện bị treo khi nhiều task pane đang mở.**
   - Sửa: kết nối tự đóng khi có yêu cầu `versionchange`, rồi tự mở lại và thử lại một lần.
6. Thông báo kiểm tra hiện ngày dạng `2026-06-30`. Sửa: hiện `30/06/2026`.

## Chưa kiểm thử

- Nút Ribbon **Thư viện của tôi**: không điều khiển được Ribbon qua DevTools. Manifest đã validate; cần thấy nút trên Excel thật (có thể phải xóa cache Office để Ribbon cập nhật).
- Thư viện lớn (hàng nghìn mục): có phân trang 50 mục và debounce tìm kiếm, nhưng chưa đo thời gian (prompts/17).
- Excel trên web, Mac.
