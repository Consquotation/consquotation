# Kiểm thử — Mẫu báo giá và in ấn (prompts/11_TEMPLATE_PRINT_EXPORT.md)

**Lần chạy 2026-10-21.**
- Claude tự chạy trên Excel desktop thật (Microsoft 365, build 16.0.20430.20182), điều khiển task pane qua DevTools.
- Bản in được kiểm chứng bằng xuất PDF thật (`ExportAsFixedFormat` qua COM), rồi đọc chữ trong PDF bằng Word ẩn.
- Workbook tạm do `npm start` tạo; dùng các sheet "BG Tính giá" (`CQ_Quote_1`, có bảng tổng hợp), "BG làm tròn" (`CQ_Quote_2`, 120+ dòng) và "BG mẫu in" (`CQ_Quote_3`).

## Đối chiếu yêu cầu

| Yêu cầu | Đáp ứng | Trạng thái |
|---|---|---|
| Khối thông tin ở trên, bảng công tác, header rõ ràng | Mẫu từ prompts/06 | Có sẵn |
| Tổng hợp | Bảng tổng hợp (prompts/10) | Có sẵn |
| Khu vực ghi chú/điều khoản theo cấu hình | **Mới:** In ấn › Ghi chú và điều khoản | Bổ sung |
| Người dùng chọn sheet/vị trí; cảnh báo và xác nhận khi vùng có dữ liệu | prompts/06; khu vực điều khoản bị chặn nếu vùng có dữ liệu | Có sẵn / bổ sung |
| Không xóa sheet có sẵn | Add-in không xóa sheet nào của người dùng (chỉ dọn sheet phân tích do chính nó vừa tạo nếu bị lỗi giữa chừng) | Có sẵn |
| Dùng Excel Table khi phù hợp; tránh tên trùng | Bảng báo giá, tổng hợp, phân tích dùng Table. Khu vực điều khoản dùng tên `CQ_Terms_n` (cần cột rộng, không gộp ô) | Có sẵn |
| Chỉ định dạng vùng cần thiết | Xuống dòng chỉ ở cột Nội dung công việc, cột Ghi chú và dòng tiêu đề bảng; độ rộng cột chỉ đặt trên sheet mới | Có sẵn / bổ sung |
| In/xuất PDF bằng Excel; chỉ cấu hình khi API hỗ trợ và đã test | **Mới:** Thiết lập trang in qua PageLayout (ExcelApi 1.9), đã kiểm chứng bằng PDF | Bổ sung |
| Không hỗ trợ thì hướng dẫn trong Excel | **Mới:** cảnh báo kèm các bước Page Layout; hướng dẫn xem trước/in/xuất PDF luôn hiển thị | Bổ sung |
| Kiểm thử tiếng Việt, ngắt trang, bảng dài, công thức tổng, mẫu đã sửa | P1–P12 bên dưới | Đạt |

## Kết quả

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| P1 | Thử PageLayout trực tiếp; đọc lại qua COM | Vùng in, dòng lặp `$10:$10`, A4 dọc, vừa 1 trang ngang (`FitToPagesTall=False`), chân trang "Trang &P / &N" đều đúng | Đạt |
| P2 | In ấn › Ghi chú: Phạm vi (2 dòng, có "m²") và Điều khoản thương mại | Ghi tại A27:I29, cách bảng tổng hợp D22:I25 một hàng. Nhãn in đậm; nội dung xuống dòng; tiếng Việt đúng; tên `CQ_Terms_1` | Đạt |
| P3 | Thêm 1 dòng công tác | Không hỏi xác nhận "đẩy dữ liệu". Bảng tổng hợp và khu vực ghi chú cùng dời xuống 1 hàng | Đạt |
| P4 | Thêm 1 khoản vào bảng tổng hợp khi khu vực ghi chú nằm ngay dưới | Add-in chèn nguyên hàng, khu vực ghi chú dời xuống, vẫn cách 1 hàng; số liệu tổng hợp đúng | Đạt |
| P5 | Sửa nội dung ghi chú trực tiếp trên sheet khi panel đang mở → Ghi | Không ghi gì; tải lại nội dung mới; lần ghi sau giữ nội dung trên sheet và thêm mục Ghi chú | Đạt |
| P6 | Thiết lập trang in cho CQ_Quote_1 → xuất PDF | Vùng in A1:I32 (tiêu đề → hết ghi chú). PDF 1 trang có đủ tiêu đề, thông tin, bảng, tổng hợp, ghi chú và "Trang 1 / 1" | Đạt (sau khi sửa lỗi 3) |
| P7 | Bảng dài (CQ_Quote_2, hơn 120 dòng tiếng Việt) → thiết lập in → PDF | 3 trang; dòng tiêu đề bảng có ở cả 3 trang; đủ 120 mô tả dài, không bị cắt. Dòng tổng `SUBTOTAL` đúng. Dữ liệu riêng của người dùng dưới bảng nằm ngoài vùng in | Đạt (sau khi sửa lỗi 1) |
| P8 | Mẫu bị người dùng sửa: xóa tiêu đề, chèn 2 dòng vào khối thông tin, thêm cột "Ghi chú nội bộ" | Vùng in A2:J140, bắt đầu từ nhãn thông tin đầu tiên và gồm cả cột J. Dòng lặp `$12:$12` theo vị trí mới | Đạt |
| P9 | Ghi ghi chú khi ngay dưới bảng có dữ liệu của người dùng (B142) → bỏ dữ liệu → ghi | Lần đầu bị chặn, nêu đúng ô B142. Lần sau ghi tại A142:J143 (rộng theo cột J). PDF có nội dung ghi chú; tiêu đề cột J in đủ ở cả 3 trang | Đạt (sau khi sửa lỗi 2) |
| P10 | Tạo bảng báo giá mới | Cột Nội dung công việc và Ghi chú có sẵn xuống dòng; các cột số không bị đổi | Đạt |
| P11 | Tổng quan › Quy trình › bước 9 › **Mở In ấn** | Chuyển tab In ấn, focus vào Ghi chú và điều khoản | Đạt |
| P12 | Xóa khu vực ghi chú | Có hộp xác nhận; nội dung bị xóa sạch; tên `CQ_Terms_2` bị gỡ | Đạt |

## Lỗi phát hiện và đã sửa

1. **Chữ dài bị cắt khi in.**
   - Hiện tượng: nội dung công việc không xuống dòng, nên PDF chỉ in phần đầu.
   - Sửa: bảng mới có sẵn xuống dòng cho cột Nội dung công việc và Ghi chú; tùy chọn "xuống dòng" trong Thiết lập trang in áp dụng cho bảng cũ.
2. **Tiêu đề cột người dùng tự thêm bị cắt khi in** ("Ghi chú nộ").
   - Sửa: tùy chọn xuống dòng áp dụng cả cho dòng tiêu đề bảng.
3. **Ghi chú truy vết của đơn giá phân tích quá dài.**
   - Hiện tượng: khi co giãn để vừa trang, Excel ngắt chữ khác màn hình nên dòng cuối của ô bị cắt.
   - Sửa: rút gọn ghi chú, và thêm lưu ý "kiểm tra bản xem trước, kéo cao dòng nếu cần" vào hướng dẫn. Bản thân việc ngắt chữ lệch nhau là giới hạn của Excel.
4. Phần "Thiết lập hiện có" hiện hướng giấy bằng tiếng Anh ("Portrait"). Sửa: hiển thị "Dọc" / "Ngang".

## Kết quả kiểm tra tự động

Chạy sau thay đổi cuối cùng của giai đoạn, đúng các lệnh khai báo trong `package.json`:

| Lệnh | Kết quả |
|---|---|
| `npm run lint` (`office-addin-lint check`) | Đạt — 0 lỗi, 0 cảnh báo |
| `npm run typecheck` (`tsc --noEmit`) | Đạt — 0 lỗi |
| `npm run test` (`vitest run`) | Đạt — 16 file, 232/232 test |
| `npm run build` (`webpack --mode production`) | Đạt, kèm **3 cảnh báo** về kích thước: `taskpane.js` 561 KiB, vượt mức khuyến nghị 244 KiB của webpack |

**Lỗi và hạn chế còn tồn tại:**
- Cảnh báo kích thước bundle: không chặn chạy, đã có từ các giai đoạn trước. Tối ưu (tách code, tải lười) thuộc prompts/17 (hiệu năng).
- Excel trên web và Mac chưa được kiểm thử: PageLayout, xuất PDF.
- Chưa in ra máy in thật; đã kiểm chứng bằng xuất PDF.
- Đường "Excel không hỗ trợ ExcelApi 1.9" không tái hiện được trên máy kiểm thử. Logic đã kiểm qua mã: chỉ hiển thị cảnh báo và hướng dẫn, không gọi API.
