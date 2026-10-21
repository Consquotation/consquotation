# Kiểm thử — Quy trình báo giá (prompts/07_QUOTATION_WORKFLOW.md)

**Lần chạy:** 2026-10-21.
- Claude tự chạy trên Excel desktop thật (Microsoft 365, build 16.0.20430.20182), điều khiển task pane qua DevTools.
- Workbook tạm do `npm start` tạo; sheet "BG Tính giá" (bảng `CQ_Quote_1`).

## Đối chiếu 9 bước

| Bước | Đáp ứng bởi | Trạng thái |
|---|---|---|
| 1. Mở workbook và ConsQuotation | Ribbon và task pane (prompts/04–05) | Có sẵn |
| 2. Tạo mẫu hoặc dùng mẫu có sẵn | Tạo bảng báo giá; nhận diện các bảng `CQ_Quote_n` có trong workbook | Có sẵn |
| 3. Chọn sheet/vị trí; cảnh báo vùng có dữ liệu | Kiểm tra vùng đích và xác nhận ghi đè (prompts/06) | Có sẵn |
| 4. Nhập thông tin báo giá | **Mới:** panel Thông tin báo giá | Bổ sung |
| 5. Thêm công tác thủ công/từ thư viện | prompts/06, 08 | Có sẵn |
| 6. Khối lượng; cách xác định đơn giá | prompts/10 | Có sẵn |
| 7–8. Tính toán, validate, hiển thị lỗi để sửa | Kiểm tra báo giá, nút Đi tới (prompts/10) | Có sẵn |
| 9. Lưu, in/xuất PDF bằng Excel | **Mới:** hướng dẫn trong panel Quy trình và trang Trợ giúp; add-in không tự gửi | Bổ sung |
| Trạng thái nháp/đã kiểm tra/đã phát hành | **Không thêm:** chưa có yêu cầu và logic rõ ràng | — |
| Kiểm tra dữ liệu hiện tại, không tin bộ nhớ đệm | **Mới:** chặn ghi đè ở Thông tin báo giá và Tổng hợp; mốc thời gian ở Kiểm tra; tình trạng quy trình luôn đọc lại | Bổ sung |

## Kết quả

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| Q1 | Tổng quan › **Quy trình báo giá** | 7 mục (gộp bước 1–3 và 7–8) có nhãn Xong / Chưa làm / Cần xem / Tùy chọn. Chi tiết đọc từ sheet (4 dòng công tác, 0 lỗi, 4 cảnh báo…). Hiện thời điểm kiểm tra | Đạt |
| Q2 | Bấm **Nhập thông tin** | Chuyển sang tab Báo giá, focus vào tiêu đề Thông tin báo giá, chọn sẵn đúng bảng | Đạt |
| Q3 | Nhập Khách hàng, Mã báo giá "007", Ngày lập 21/10/2026, Hiệu lực đến 20/10/2026 → Lưu; sửa thành 21/11/2026 → Lưu | Lần đầu báo lỗi "Hiệu lực đến phải sau hoặc bằng ngày lập" và không ghi. Lần sau ghi 4 mục: "007" dạng chữ; ngày là ngày Excel, hiển thị 21/10/2026 | Đạt |
| Q4 | Form đang mở thì sheet bị sửa (Khách hàng = "Công ty XYZ"), người dùng sửa Dự án → Lưu → Lưu lần nữa | Lần đầu không ghi gì; form giữ Dự án người dùng nhập và lấy "Công ty XYZ" mới. Lần sau chỉ ghi Dự án; "Công ty XYZ" không bị ghi đè | Đạt (sau khi sửa lỗi 1) |
| Q5 | Xóa nhãn "Phiên bản:" trên sheet; Hiệu lực đến là ngày đã qua | Ô Phiên bản bị khóa kèm giải thích. Báo "Báo giá đã hết hiệu lực". Bước 4 của quy trình hiện "Cần xem" kèm "1 nhãn không còn trên sheet" | Đạt |
| Q6 | Tổng hợp: panel đã tải (thuế 10), sửa trực tiếp trên sheet thành 8, rồi thêm khoản trong panel → Áp dụng | Không ghi gì. Báo "vừa được sửa sau khi panel tải" và tải lại giá trị 8 | Đạt |
| Q7 | Kiểm tra báo giá | Hiện "Kết quả lúc …; nếu sửa sheet sau đó hãy kiểm tra lại" | Đạt |
| Q8 | Các nút **Thiết lập tổng hợp**, **Mở Kiểm tra báo giá**, **Thêm công tác** trong panel Quy trình | Chuyển đúng tab và focus đúng phần | Đạt (sau khi sửa lỗi 2) |
| Q9 | Bước 9 | Hướng dẫn lưu, in, xuất PDF bằng Excel; ghi rõ add-in không tự gửi báo giá | Đạt |

## Lỗi phát hiện và đã sửa

1. **Form Thông tin báo giá vẫn có thể ghi đè thay đổi trên sheet.**
   - Hiện tượng: khi sheet đổi trong lúc form đang mở, bản đầu giữ toàn bộ giá trị trong form. Lần Lưu sau vì thế ghi đè cả những mục người dùng không sửa.
   - Sửa: chỉ giữ các mục người dùng đã sửa; các mục khác lấy giá trị mới trên sheet.
2. **Nút điều hướng tới tab Tính giá không đưa focus tới đúng phần.**
   - Nguyên nhân: các panel của tab này chỉ hiện sau khi tải xong danh sách bảng.
   - Sửa: thử lại việc chuyển focus trong tối đa 3 giây.
3. **Phần chèn từ phân tích định mức không báo khi dùng phân tích có sẵn** (phân tích được thêm ở nơi khác sau khi form mở).
   - Sửa: báo rằng add-in đã dùng phân tích có sẵn thay cho lựa chọn giá của người dùng.

## Ghi chú

- Ghi chuỗi "01/10/2026" vào ô qua API thì Excel hiểu theo kiểu Mỹ (tháng trước). Add-in luôn ghi ngày dạng số ngày Excel nên không bị ảnh hưởng.
- Các mục thông tin mở rộng trong prompts/02 (phạm vi, giả định, phần loại trừ, điều khoản thương mại) chưa có trong mẫu. Đề xuất làm cùng mẫu in ở prompts/11.
- Excel trên web và Mac chưa được kiểm thử.
