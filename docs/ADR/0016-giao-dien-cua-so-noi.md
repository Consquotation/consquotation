# ADR-0016: Giao diện trong cửa sổ nổi, task pane làm cầu nối với workbook

- Trạng thái: Chấp nhận (triển khai trong bản 1.14.0, chờ chủ sản phẩm duyệt trước khi phát hành)
- Ngày: 2026-11-01
- Liên quan: [ADR-0006](0006-cong-nghe-ui-va-cong-cu.md) (UI), [ADR-0011](0011-lop-thao-tac-excel-dung-chung.md) (lớp Excel), [ADR-0015](0015-cap-phep-bang-ma-khong-may-chu.md) (cấp phép)

## Bối cảnh

Chủ sản phẩm muốn mọi tính năng hiện trong hộp thoại nổi thay vì thanh bên phải, và bỏ các phần đó khỏi task pane (trao đổi ngày 2026-10-29).

Ràng buộc của Office (tài liệu "Use the Office dialog API", cập nhật 2026-09-28):

- Hộp thoại không chặn Excel: người dùng vẫn chọn ô, gõ vào sheet khi hộp thoại mở. Người dùng kéo và đổi kích thước được.
- Trong hộp thoại chỉ gọi được `messageParent` và `isSetSupported`. Không có `Excel.run`, không có `Office.context.document`. Microsoft khuyên không dùng hộp thoại để thao tác tài liệu.
- Mỗi trang chủ chỉ mở được một hộp thoại.
- Task pane gửi tin xuống hộp thoại bằng `messageChild` (DialogApi 1.2): Microsoft 365, Office 2021 trở lên, Office bán lẻ từ phiên bản 2005. Office 2016/2019 bản volume không có (đã không hỗ trợ từ ADR-0015).
- Trang lệnh chạy ngầm của ribbon (ExecuteFunction) bị dừng sau 5 phút, nên không làm cầu nối cho hộp thoại mở lâu được.

Kiểm chứng trên Excel 16.0.20527 (Windows), ngày 2026-11-01:

- Hộp thoại cùng nguồn với task pane dùng chung localStorage và IndexedDB (thấy thư viện `consquotation-library` và trạng thái cấp phép).
- Tin nhắn 10 KB, 100 KB, 1 MB, 5 MB đều tới đủ theo cả hai chiều.
- Task pane nạp lại (bấm nút ribbon có URL khác) thì hộp thoại đóng theo.

## Quyết định

1. **Task pane làm cầu nối.** Khi mở, task pane tự mở hộp thoại ở màn hình mà nút ribbon chỉ định (`view`, `focus`, `section`), và chỉ hiện một khung nhỏ: trạng thái cửa sổ, nút "Mở cửa sổ ConsQuotation", ghi chú phải giữ thanh mở.
2. **Hộp thoại chạy toàn bộ giao diện cũ** (`App`) với gateway đại diện: mỗi lời gọi gateway thành tin nhắn `{t:"call", gateway, method, args}`. Task pane gọi gateway thật (`ExcelWorkbookGateway`, `ExcelPricingGateway`, `ExcelQuotationGateway`, `ExcelLayoutGateway`, `ExcelNormExportGateway`) và trả kết quả hoặc lỗi.
   - Lỗi giữ `name`, `message`, mã lỗi Office (`code`) và `kind`. `ExcelOpError`, `TargetChangedError`, `RecordChangedError`, `RecordUnreadableError` được dựng lại đúng lớp vì giao diện kiểm bằng `instanceof`.
   - Lời gọi không có trả lời sau 120 giây báo mất cầu nối.
   - Chỉ gọi được phương thức của 5 gateway; không gọi `constructor` hay tên bắt đầu bằng `_`.
3. **Những gì hộp thoại không tự làm được** đi qua task pane: sự kiện đổi vùng chọn (task pane nghe rồi báo sang), mở trình duyệt (soạn thư cấp phép, chỉ đường dẫn https), thông tin môi trường Excel (task pane đo rồi ghi vào localStorage `consquotation.dialog.host`). Tất cả gom ở `setDialogHost` trong `src/office/environment.ts`; component không phải sửa.
4. **Phạm vi:** chỉ Excel trên Windows có DialogApi 1.2. Excel trên web và Mac giữ giao diện trong task pane cho tới khi kiểm chứng được hộp thoại dùng chung thư viện với task pane (trên web, Office phân vùng bộ nhớ add-in). Không mở được hộp thoại thì khung nhỏ có nút "Dùng giao diện ngay trong thanh này".
5. Kích thước mặc định: rộng 50%, cao 85% màn hình.

## Hệ quả

- Không đổi manifest; nút ribbon vẫn là ShowTaskpane.
- Task pane phải mở trong lúc dùng cửa sổ. Đóng task pane thì cửa sổ đóng theo.
- Bấm một nút ribbon khác: task pane nạp lại, cửa sổ đóng rồi mở lại ở phần mới; nội dung nhập dở chưa lưu bị mất. Trước bản này, task pane nạp lại cũng mất nội dung nhập dở, nên hành vi không kém đi.
- Mỗi thao tác workbook thêm một lượt nhắn tin giữa hai cửa sổ, chậm hơn không đáng kể so với thời gian Excel xử lý.
- Thanh tiêu đề cửa sổ do Office vẽ, có tên add-in và đường dẫn trang.

## Kết quả xác minh

Excel Microsoft 365 cho Windows 16.0.20527, bản dev, ngày 2026-11-01:

- Bấm "Thư viện của tôi" và "Tạo bảng báo giá" trên ribbon: cửa sổ mở đúng tab; task pane chỉ còn khung nhỏ.
- Trong cửa sổ: tạo bảng báo giá (`CQ_Quote_1`, đối chiếu bằng Excel API ở task pane), thêm 2 công tác (đơn giá và thành tiền đúng trên sheet: 12 × 150.000 = 1.800.000; 3 × 200.000 = 600.000).
- Chọn ô B15 trong Excel: cửa sổ tự cập nhật "Vùng chọn B15".
- Tải bản sao lưu thư viện (.json) từ cửa sổ: file 20 KB được tải về.
- Bấm "Soạn bằng Gmail" ở phần cấp phép trong cửa sổ: trình duyệt mở trang soạn thư qua task pane.
- Đóng cửa sổ bằng nút X: khung nhỏ báo đã đóng; bấm "Mở cửa sổ ConsQuotation" mở lại được.
- Chưa kiểm: Excel trên web, Mac (đang dùng task pane); Office 2016/2019 bán lẻ.
