# Giai đoạn N5: tính giá, tổng hợp, làm tròn, in ấn

Kế hoạch: [NATIVE_PLAN.md](../NATIVE_PLAN.md). Mã: `native/src/ConsQuotation.Core/Quotation/Layout.cs`, `native/src/ConsQuotation.AddIn/QuoteUi/PricingPanels.cs`, `native/src/ConsQuotation.AddIn/Excel/QuoteGateway.Layout.cs`. Ngày: 2026-11-07.

## Năm thẻ mới trong cửa sổ Báo giá

Nút Tính giá mở thẻ Kiểm tra, nút In ấn mở thẻ Ghi chú. Sau N5 cả 16 nút ribbon trừ Cài đặt, Bản quyền (N6) đều có chức năng thật.

| Thẻ | Việc làm được | Bản web |
|---|---|---|
| Kiểm tra | Liệt kê lỗi và cảnh báo, đi tới ô, cách sửa, thống kê phương pháp đơn giá, cập nhật đơn giá theo sheet phân tích sau khi xác nhận | `QuoteCheckPanel` |
| Tổng hợp | Thêm, sửa, đổi thứ tự, bỏ khoản chiết khấu, phụ phí, thuế; ghi và xóa bảng `CQ_Summary_n` | `SummaryPanel` |
| Làm tròn | Quy tắc cho đơn giá phân tích, thành tiền, khoản tổng hợp; đổi công thức mẫu trong cả workbook | `RoundingPanel` |
| Ghi chú | 5 mục do người dùng tự nhập; ghi và xóa khu vực `CQ_Terms_n` | `TermsPanel` |
| Trang in | Vùng in, dòng lặp, hướng và khổ giấy, co giãn, chân trang, xuống dòng | `PrintSetupPanel` |

Add-in không có khoản, tỷ lệ hay điều khoản soạn sẵn. Xem trước, in và xuất PDF dùng chức năng có sẵn của Excel.

## Lưu quy tắc làm tròn

Bản native ghi quy tắc vào Custom XML `urn:consquotation:settings`. Workbook chưa có part này (tạo ở bản web) thì suy quy tắc từ công thức trên sheet. Bản web đọc `workbook.settings` của Office.js nên không thấy quy tắc do bản native lưu: công thức đã ghi trên sheet vẫn đúng, nhưng dòng thêm mới từ bản web sẽ theo cấu hình của bản web.

## Điểm khác với Office.js

- Ghi công thức vào một ô của cột tính toán qua COM làm Excel tự điền cả cột (lần kiểm đầu: một ô sửa tay đè cả cột Thành tiền). Add-in tắt `AutoCorrect.AutoFillFormulasInLists` trong lúc ghi từng ô rồi trả lại thiết lập của người dùng. Khi mọi ô trong cột đều là công thức mẫu thì ghi cả cột, để dòng người dùng tự thêm về sau cũng theo quy tắc mới.
- Đổi quy tắc chỉ ghi vào ô cần đổi. Bản web ghi lại cả mảng công thức; cách đó qua COM có thể đổi ô chữ "007" thành số.
- `ListObjects.Add` tự co giãn cột theo tiêu đề: độ rộng cột được trả lại sau khi tạo bảng tổng hợp.
- `PageSetup.PaperSize` đọc qua COM ra kiểu double; add-in đổi kiểu tường minh. `PageSetup` cần có máy in mặc định; không có thì thẻ Trang in báo rõ (nhánh này chưa chạy thử vì máy kiểm có máy in PDF).
- Định dạng số đọc qua COM theo vùng miền của máy. Khi đổi định dạng tiền, add-in nhận cả `#,##0` và dạng theo dấu phân cách của máy.

Thêm so với bản web: chữ ghi chú dài quá chiều cao hàng tối đa của Excel (409 pt) thì add-in báo mục nào, vì phần cuối không hiện và không in được dù ô vẫn giữ đủ chữ. Lần xuất PDF thử cho thấy Excel cắt im lặng trường hợp này.

Các thẻ đang có chữ chưa lưu (Thông tin, Tổng hợp, Ghi chú) không đọc đè khi người dùng quay lại cửa sổ. Bấm ghi mà sheet đã đổi so với lúc tải thì không ghi, đọc lại và báo.

## Kiểm tra

Dữ liệu thử là số giả định, không phải định mức hay đơn giá thực tế.

`dotnet test`: 326 test đạt ở cả Debug và Release (298 ở N4, thêm 28: chuyển phần kiểm tra báo giá của `pricing.test.ts`, `print.test.ts`, `workflow.test.ts`; đổi quy tắc làm tròn; giao diện năm thẻ). Khi chuyển test tìm ra thứ tự nhãn trong thông báo Loại không hợp lệ khác bản web, đã sửa.

Excel 64-bit thật, bản Release, phiên riêng, workbook và thư viện ở thư mục tạm: 87/87 mục N5 đạt. Chạy lại kiểm tra N4 trên cùng bản: 128/128 đạt; Ctrl+Z, đang sửa ô, thoát Excel: 5/5 đạt.

| Nhóm | Nội dung |
|---|---|
| P | Tự kiểm tra khi mở thẻ, cách sửa, đi tới ô; đơn giá lệch phân tích: hủy, sheet đổi trong lúc xác nhận, ghi đơn giá do Excel tính |
| S | Lỗi từng ô, vị trí bảng, số tiền và tổng đúng theo tính tay, tên "10%" giữ dạng chữ, đổi nhãn dòng tổng, mốc dưới bảng không đẩy, độ rộng cột không đổi, danh sách chọn hợp lệ, sheet đổi thì không ghi đè, vùng có dữ liệu thì chặn, thiếu giá trị thì #N/A, thêm dòng báo giá làm bảng tổng hợp dời theo |
| R | Hủy, số ô đổi và ô giữ nguyên, ô sửa tay không bị đè kể cả khi thêm dòng, đổi mọi bảng, dòng mới theo quy tắc mới, định dạng 2 chữ số thập phân, bỏ làm tròn, ROUNDUP ở sheet phân tích, trả lại thiết lập tự điền |
| T | Chữ nhiều dòng, 12.000 ký tự ghi đủ, chữ dạng công thức, tên vùng, sheet đổi thì không ghi đè, thêm khoản tổng hợp làm ghi chú dời xuống không mất |
| Q | Vùng in tới hết ghi chú, A3 ngang thu 1 trang, A4 dọc vừa chiều ngang, 100%, giữ chân trang người dùng tự đặt, sheet bảo vệ khóa nút, xuất PDF (đã xem ảnh trang: đủ bảng, tổng hợp, ghi chú, số trang) |
| U | Lưu rồi mở lại: quy tắc và ghi chú còn nguyên, không sinh thêm part; xóa khu vực ghi chú, xóa bảng tổng hợp, nhãn dòng tổng trở lại |

Lỗi thật tìm được khi kiểm trên Excel và đã sửa:

- Thẻ Trang in không tải được vì `PaperSize` kiểu double.
- Đổi thẻ đúng lúc thẻ khác đang chạy thì thẻ mới không tải; nay đọc lại ngay khi việc đó xong.
- Dựng lại các ô Tổng hợp mỗi lần quay lại cửa sổ làm mất con trỏ; nay chỉ dựng khi dữ liệu đổi.
- Chữ ghi chú quá dài bị cắt im lặng khi in; nay có cảnh báo.

## Chưa kiểm tra

Excel 32-bit, Office 2016, DPI khác 100%, máy không có máy in mặc định: để N6. Mở báo giá có bảng tổng hợp và ghi chú do bản native tạo trong bản web chạy thật: chưa làm.
