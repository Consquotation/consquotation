# Kiểm thử lớp tích hợp Excel (2026-10-26, bản 1.8.0)Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (sau khi sửa lỗi 2) (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (2026-10-26, tự động) |Đạt (Báo giá, Tính giá, Tổng quan, In ấn, Thư viện) (2026-10-26, tự động) |

Phạm vi: lớp `src/office/core/` và khu vực Cài đặt › Kiểm thử Excel. Tài liệu: [docs/EXCEL_INTEGRATION.md](../../docs/EXCEL_INTEGRATION.md).

Môi trường: Excel Microsoft 365 trên Windows, bản phát triển (`npm start`), workbook tạm do `npm start` mở. Ghi `Đạt` / `Không đạt` / `Chưa chạy`.

**Lần chạy 2026-10-26:** Claude tự chạy trên Excel desktop thật (build 16.0.20430.20182): kịch bản tích hợp 26/26 tình huống đạt, các bước giao diện điều khiển task pane qua DevTools. Người dùng đã đóng workbook làm việc trước khi chạy. Lần chạy phát hiện và sửa 3 lỗi, ghi ở cuối file.

## Kiểm thử tự động trên Excel thật

Chạy: `node tests/integration/run-in-taskpane.mjs tests/integration/excel-core.scenarios.js` (task pane đang mở).

| # | Tình huống (prompt giai đoạn 14, mục 6.3) | Kết quả |
|---|---|---|
| A1 | Workbook nhiều sheet; liệt kê đủ | Đạt (2026-10-26, tự động) |
| A2 | Sheet đích không tồn tại | Đạt (2026-10-26, tự động) |
| A3 | Sheet đích đã tồn tại (error / reuse / suffix); tên không hợp lệ; đổi tên trùng | Đạt (2026-10-26, tự động) |
| A4 | Vùng ghi có kích thước không khớp: không ghi gì | Đạt (2026-10-26, tự động) |
| A5 | Dữ liệu sai kiểu (Date, NaN): không ghi gì | Đạt (2026-10-26, tự động) |
| A6 | Ô trống, số 0, tiếng Việt có dấu, ký tự đặc biệt, chữ dễ bị đổi kiểu ("007", "1/2", "10%", "TRUE", "=1+1") | Đạt (2026-10-26, tự động) |
| A7 | Ghi vào vùng có dữ liệu từ trước: cần xác nhận (vân tay); người dùng sửa sau khi kiểm tra thì không ghi đè | Đạt (2026-10-26, tự động) |
| A8 | Công thức Excel hợp lệ được tính; công thức lỗi được nhận diện; không ghi ra ngoài vùng | Đạt (2026-10-26, tự động) |
| A9 | Table đã tồn tại; tên Table không hợp lệ; chồng bảng; tiêu đề trùng | Đạt (2026-10-26, tự động) |
| A10 | Thêm, cập nhật, xóa dòng theo tiêu chí; khớp nhiều/không khớp | Đạt (2026-10-26, tự động) |
| A11 | Thêm cột: trùng tên, có dữ liệu bên phải | Đạt (2026-10-26, tự động) |
| A12 | Table rỗng | Đạt (2026-10-26, tự động) |
| A13 | Bảng của người dùng (không có tiền tố CQ_) chỉ đọc | Đạt (2026-10-26, tự động) |
| A14 | Định dạng theo schema không đổi giá trị; cố định hàng tiêu đề; autofit có giới hạn | Đạt (2026-10-26, tự động) |
| A15 | Lỗi Office.js (sheet bị bảo vệ → AccessDenied) giữ nguyên mã; kiểm tra trước báo "protected" | Đạt (2026-10-26, tự động) |
| A16 | Dọn sạch sheet "CQ IT …" sau khi chạy | Đạt (2026-10-26, tự động) |

## Kiểm thử tay trên giao diện

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| U1 | Cài đặt › Kiểm thử Excel › **Mở** | Hiện 7 nút; mặc định thu gọn | Đạt (2026-10-26, tự động) |
| U2 | **Đọc sheet hiện hành** | Tên workbook, chỉ đọc, cấu trúc bị khóa, số sheet, sheet đang mở, vùng có dữ liệu | Đạt (2026-10-26, tự động) |
| U3 | **Liệt kê sheet** | Đủ mọi sheet, đánh dấu sheet đang mở | Đạt (2026-10-26, tự động) |
| U4 | **Tạo sheet thử nghiệm** hai lần | Lần 1: "Đã tạo sheet"; lần 2: "đã có từ trước", không có sheet "(2)" | Đạt (2026-10-26, tự động) |
| U5 | **Ghi dữ liệu mẫu** | `B2:L7` có 6 hàng; "007" giữ số 0 đầu; "1/2", "10%", "TRUE" là chữ; Thành tiền dòng 1 là công thức; dòng 5 hiện `#DIV/0!` | Đạt (2026-10-26, tự động) |
| U6 | Gõ một ô trong `B2:L7`, bấm **Ghi dữ liệu mẫu** | Hỏi xác nhận ghi đè; Hủy thì ô vẫn giữ giá trị vừa gõ | Đạt (2026-10-26, tự động) |
| U7 | Hộp xác nhận đang mở, sửa thêm một ô trong vùng rồi bấm **Ghi đè** | Báo vùng đã thay đổi, không ghi | Đạt (2026-10-26, tự động) |
| U8 | **Tạo bảng từ dữ liệu mẫu** hai lần | Lần 1: tạo `CQ_Test_Lab`; lần 2: "đã có; không tạo trùng" | Đạt (2026-10-26, tự động) |
| U9 | **Định dạng bảng** | Tiêu đề nền xanh nhạt, chữ đậm; viền; cột tiền dạng `#,##0`; hàng tiêu đề được cố định | Đạt sau khi sửa lỗi 2 (2026-10-26, tự động) |
| U10 | **Đọc lại để xác nhận** | "khớp dữ liệu đã ghi", 1 ô lỗi | Đạt (2026-10-26, tự động) |
| U11 | Bấm đúp nhanh một nút | Chỉ chạy một lần; các nút bị khóa khi đang chạy | Đạt (2026-10-26, tự động) |
| U12 | Xóa sheet "CQ Thử nghiệm", bấm **Ghi dữ liệu mẫu** | Báo chưa có sheet, không tạo gì | Đạt (2026-10-26, tự động) |
| U13 | Bản production (`npm run build`) | `dist/taskpane.js` không chứa "CQ Thử nghiệm"; tab Cài đặt không có khu vực Kiểm thử Excel | Đạt (2026-10-26, tự động) |
| U14 | Các tab khác (Tổng quan, Báo giá, Tính giá, In ấn, Thư viện) | Hoạt động như trước | Đạt: Báo giá, Tính giá, Tổng quan, In ấn, Thư viện (2026-10-26, tự động) |

## Lỗi phát hiện trong lần chạy 2026-10-26 (đã sửa)

1. **Thêm cột làm lệch dữ liệu bên phải bảng.**
   - Hiện tượng: `Table.columns.add` chèn ô trong các hàng của bảng và đẩy mọi ô bên phải bảng ở các hàng đó sang phải một cột. Hàng ngoài bảng giữ nguyên, nên dữ liệu bị lệch hàng. Kiểm chứng: mốc ở D1:D3 chuyển sang E1:E3, mốc ở D5 (dưới bảng) vẫn ở D5.
   - Bản đầu chỉ kiểm tra cột sát bên phải nên không chặn được.
   - Cách sửa: `cellsDisplacedBy` xét mọi ô bên phải bảng tới hết vùng có dữ liệu; có dữ liệu thì báo `targetNotEmpty`. Thêm dòng cũng kiểm tra ô bên dưới bảng, chỉ cho Excel đẩy xuống khi nơi gọi đặt `allowShiftDown` sau khi người dùng xác nhận.
   - Kiểm chứng: A10, A11 (tình huống "Dữ liệu bên dưới bảng" và "Thêm cột").
2. **Chữ xuống dòng bị cắt khi in.**
   - Hiện tượng: xuất PDF sheet thử nghiệm, ô Ghi chú dòng 1 mất chữ cuối vì chiều cao hàng không tăng theo.
   - Cách sửa: `formatTableBySchema` tự điều chỉnh chiều cao hàng dữ liệu sau khi đặt độ rộng cột. Kiểm chứng lại bằng PDF: đủ chữ.
   - Cùng lúc: cột "Đơn vị tính" và "Ghi chú" có độ rộng riêng trong schema (60 và 150pt) thay vì 200pt của kiểu chữ.
3. **Thông báo cảnh báo có tiêu đề "Xong".** Ví dụ khi vùng mẫu đã là bảng và add-in không ghi gì. Đổi tiêu đề thành "Lưu ý".

Ngoài ra, một tình huống trong kịch bản tích hợp ban đầu viết sai kỳ vọng (công thức `=F2&"!"` ở dòng thứ hai). Excel ghi đúng nguyên văn công thức; đã sửa kịch bản.
