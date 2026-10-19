# Kiểm thử tay — Giai đoạn 1 (Scaffold)

Ghi kết quả vào bảng: `Đạt` / `Không đạt` / `Chưa chạy`, kèm phiên bản Excel và ghi chú.

Môi trường kiểm thử chính: Excel Microsoft 365 trên Windows, Current Channel, build 16.0.20430.20182 x64.

| # | Bước | Kết quả mong đợi | Windows M365 | Excel web |
|---|---|---|---|---|
| 1 | `npm start` | Dev server chạy, Excel mở, không lỗi chứng chỉ | Đạt (2026-10-19) | — |
| 2 | Quan sát Ribbon | Có tab **ConsQuotation**, nhóm **Báo giá**, nút **Mở ConsQuotation** có icon | Đạt — có icon | Chưa chạy |
| 3 | Bấm **Mở ConsQuotation** | Task pane mở, tiêu đề "ConsQuotation", chữ tiếng Việt hiển thị đúng dấu | Đạt | Chưa chạy |
| 4 | Khối "Môi trường Excel" | Hiện ứng dụng Excel, nền tảng, phiên bản; "Mức API tối thiểu (ExcelApi 1.8)": **Đạt** | Đạt — Excel / PC / 16.0.20430.20182 / Đạt | Chưa chạy |
| 5 | Mở task pane trên workbook có dữ liệu | Không ô nào trong workbook thay đổi (add-in giai đoạn 1 không ghi workbook) | Chưa chạy | Chưa chạy |
| 6 | "Kiểm tra lưu trữ cục bộ" › **Chạy kiểm tra** lần 1 | IndexedDB khả dụng; "Lần ghi trước": chưa có; hiện "Lần ghi này" | Đạt — lần ghi 11:07:54 19/10/2026 | Chưa chạy |
| 7 | Đóng hẳn Excel, mở lại, chạy kiểm tra lần 2 | "Lần ghi trước" = mốc của bước 6 (dữ liệu còn sau khởi động lại) | Đạt — "Lần ghi trước" = 11:07:54 19/10/2026 | Chưa chạy |
| 8 | `npm stop`, `npx office-addin-cache clear`, `npm start`, chạy kiểm tra | "Lần ghi trước": chưa có (xác nhận cache clear xóa dữ liệu — ADR-0003) | Chưa chạy | — |
| 9 | Ghi nhận partition key, persisted, dung lượng/hạn mức | Ghi giá trị thực tế vào ADR-0003 phần xác minh | Đạt — partition key: không có; persisted: Không; hạn mức 10.240 MB | Chưa chạy |
| 10 | `npm stop` | Dev server dừng, add-in được gỡ khỏi Excel | Chưa chạy | — |

## Không kiểm thử được ở giai đoạn này

- Excel 2016/2019 (retail và volume), Excel 2021/2024: không có máy. Thông báo không tương thích cho IE11/EdgeHTML chỉ được kiểm bằng unit test (`tests/unit/compat-gate.test.ts`).
- Excel trên Mac/iPad: không có máy.
