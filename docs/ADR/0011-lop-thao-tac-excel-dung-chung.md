# ADR-0011: Lớp thao tác Excel dùng chung

- Trạng thái: Đề xuất (chờ người dùng duyệt các mục ở cuối)
- Ngày: 2026-10-26
- Liên quan: [ADR-0006](0006-cong-nghe-ui-va-cong-cu.md) (chia lớp domain/application/office), [ADR-0008](0008-tinh-don-gia-va-thanh-tien.md) (ghi chữ có tiền tố `'`), [ADR-0009](0009-mau-bao-gia-va-in-an.md) (mẫu báo giá)

## Bối cảnh

Đến bản 1.8.0, mọi thao tác Excel nằm trong ba adapter nghiệp vụ: `excelWorkbookGateway` (920 dòng), `excelPricingGateway` (758 dòng) và `excelLayoutGateway` (390 dòng). Mỗi adapter tự làm các việc sau:
- kiểm tra vùng đích;
- tính vân tay;
- đọc tên đã dùng;
- tạo Table;
- định dạng.

Giai đoạn tích hợp Excel yêu cầu một lớp thao tác dùng lại được cho thư viện đơn giá, định mức và tính giá, kèm kiểm tra dữ liệu và xử lý lỗi thống nhất.

## Quyết định

1. **Thêm `src/office/core/`.** Thư mục này chứa hàm thao tác Excel nhận `context` của một `Excel.run` do nơi gọi mở. Không dùng class service giữ trạng thái. Lý do:
   - nơi gọi gom được nhiều bước vào một batch;
   - proxy object không sống ngoài `Excel.run`;
   - quy ước này giống các adapter hiện có.
2. **Phần thuần đặt ở `src/domain/excel/`.** Gồm kiểm tra ma trận, schema cột, quy tắc định dạng, lỗi có phân loại. Phần này có unit test, không giả lập Excel.
3. **Lỗi kiểm tra là `ExcelOpError` có `kind`.** Lỗi này được ném trước khi ghi, nên khi có lỗi thì chưa ô nào bị đổi. Lỗi Office.js giữ nguyên `code` như trước. `describeOfficeError` dịch cả hai loại.
4. **Chỉ sửa Table có tiền tố `CQ_`.** Tạo bảng mới bắt buộc tiền tố này. Table khác của người dùng chỉ được đọc.
5. **Không đổi các adapter đang chạy**, trừ một chỗ: `loadTakenNames` chuyển sang core và được `excelWorkbookGateway` dùng lại. Chuyển dần các adapter sang core khi có tính năng mới cần sửa chúng, có kiểm thử lại trên Excel.
6. **Khu vực Kiểm thử Excel chỉ có trong bản phát triển** và được tải lười (`React.lazy`). Lý do: thêm thẳng vào bundle làm `taskpane.js` production tăng 29,7 KB, dù khu vực này không bao giờ hiện ở đó. Sau khi tải lười, bản production chỉ tăng 677 byte.
7. **`QUOTE_LINE_SCHEMA` là cấu trúc tham khảo 11 trường**, có tách đơn giá vật liệu, nhân công và máy. Mẫu báo giá chính thức (`QUOTE_COLUMNS`, 9 cột) chưa đổi.

## Hệ quả

- Tính năng mới gọi core thay vì tự viết lại các bước kiểm tra, ghi và định dạng.
- Có hai khai báo cột cùng tồn tại (`QUOTE_COLUMNS` và `QUOTE_LINE_SCHEMA`) cho tới khi người dùng chốt mẫu có tách đơn giá. Unit test giữ định dạng số của hai nơi trùng nhau.
- Kịch bản tích hợp (`tests/integration/`) chạy trên Excel thật qua DevTools. Bản phát triển đặt `window.__CQ_DEV_EXCEL_CORE__` để kịch bản gọi core. Bản production không có biến này.

## Kết quả xác minh (2026-10-26)

Chạy trên Excel Microsoft 365 Windows, build 16.0.20430.20182, trong workbook tạm do `npm start` mở:
- kịch bản tích hợp: 26/26 tình huống đạt, sheet thử được dọn sạch;
- khu vực Kiểm thử Excel: 14 bước giao diện đạt (tests/manual/excel-integration-checklist.md);
- hồi quy: tạo bảng báo giá hai lần, thêm công tác, Kiểm tra báo giá, In ấn, Thư viện chạy như trước.

Hành vi Excel kiểm chứng được và ràng buộc thiết kế:
- `Table.columns.add` chèn ô trong các hàng của bảng, đẩy mọi ô bên phải bảng ở các hàng đó sang phải một cột; hàng ngoài bảng giữ nguyên. Vì vậy thêm cột bị chặn khi có bất kỳ ô nào bên phải bảng trong các hàng đó.
- Chữ xuống dòng trong ô bị cắt khi in nếu không tăng chiều cao hàng. `formatTableBySchema` tự điều chỉnh chiều cao hàng dữ liệu.

## Cần người dùng duyệt

- Khu vực Kiểm thử Excel chỉ hiện trong bản phát triển, không hiện cho đồng nghiệp dùng bản production.
- `QUOTE_LINE_SCHEMA` cần được chốt hai điểm: trường bắt buộc (hiện chỉ Tên công tác), và Đơn giá tổng hợp là cột nhập hay cột công thức (= VL + NC + Máy).
