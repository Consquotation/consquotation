# Kiểm thử tay — Ribbon và Task pane (prompts/05_RIBBON_TASKPANE_UX.md)

Môi trường: Excel Microsoft 365 trên Windows, add-in dev (tab **ConsQuotation (Dev)**). Ghi `Đạt` / `Không đạt` / `Chưa chạy`.

## Ribbon

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| R1 | Mở tab **ConsQuotation (Dev)** | Hai nhóm: **Báo giá** (Mở ConsQuotation, Tạo bảng báo giá) và **Trợ giúp** (Trợ giúp); đủ icon; không có nút của tính năng chưa làm | Đạt (2026-10-20) |
| R2 | Rê chuột lên từng nút | Tooltip tiếng Việt mô tả đúng việc nút làm | Đạt (2026-10-20) |
| R3 | Bấm **Tạo bảng báo giá** khi pane đang đóng | Pane mở thẳng tab **Báo giá** | Đạt (2026-10-20) |
| R4 | Pane đang mở ở Tổng quan, bấm **Tạo bảng báo giá** | Cùng pane chuyển sang tab Báo giá (không mở pane thứ hai) | Đạt (2026-10-20) |
| R5 | Bấm **Trợ giúp** | Pane hiện màn hình Trợ giúp với nội dung hướng dẫn; nút **Quay lại** về tab trước | Đạt (2026-10-20) |
| R6 | Bấm **Mở ConsQuotation** | Pane về tab Tổng quan | Đạt (2026-10-20) |

## Task pane

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| T1 | Tab **Tổng quan** | Có Workbook hiện tại, Lối tắt (Tạo bảng báo giá, Thêm công tác thủ công, Xem hướng dẫn), Bảng báo giá trong workbook | Đạt (2026-10-20) |
| T2 | Workbook chưa có bảng báo giá | Danh sách bảng báo trạng thái trống kèm hướng dẫn | Đạt (2026-10-20) |
| T3 | Lối tắt **Thêm công tác thủ công** | Chuyển sang tab Báo giá và cuộn tới phần Thêm công tác | Đạt (2026-10-20) |
| T4 | Ở danh sách bảng, bấm **Đi tới** | Excel chuyển sang đúng sheet và chọn bảng; không ô nào thay đổi | Đạt (2026-10-20) |
| T5 | Chọn một ô trong bảng `CQ_Quote_2`, mở tab Báo giá | Form Thêm công tác chọn sẵn `CQ_Quote_2` | Đạt (2026-10-20) |
| T6 | Thêm công tác có Nhóm `Móng`, Đơn vị `m3` | Sau khi thêm: Nhóm và Đơn vị giữ nguyên, các ô khác xóa trống | Đạt (2026-10-20) |
| T7 | Nhấn Enter trong ô Nội dung công việc (form Thêm công tác) và trong ô Số dòng (Tạo bảng) | Gửi biểu mẫu như bấm nút | Đạt (2026-10-20) |
| T8 | Tab **Cài đặt** | Phiên bản add-in `1.1.0`, bản build "Phát triển (dev)", Môi trường Excel, Kiểm tra lưu trữ cục bộ | Đạt (2026-10-20) |
| T9 | Chỉ dùng bàn phím: Tab tới thanh tab, dùng phím mũi tên đổi tab, Tab vào nút và Enter | Đi qua được mọi điều khiển; viền focus hiển thị rõ; mũi tên trên thanh tab không bị kéo focus đi chỗ khác | Đạt (2026-10-20) |
| T10 | Rà các trạng thái: đang tải, trống, thành công, cảnh báo, lỗi (ví dụ thêm công tác khi sheet bị bảo vệ) | Mỗi trạng thái có thông báo tiếng Việt rõ ràng | Đạt (2026-10-20) |
| T11 | Toàn bộ chữ trên Ribbon và task pane | Tiếng Việt nhất quán, đúng dấu | Đạt (2026-10-20) |

## Bản production (sau khi deploy)

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| P1 | Cài lại `manifest.prod.xml` (phiên bản 1.1.0.0) từ thư mục catalog | Tab **ConsQuotation** có đủ nút như R1; tab Cài đặt hiện "Chính thức (production)" | Chưa chạy |
