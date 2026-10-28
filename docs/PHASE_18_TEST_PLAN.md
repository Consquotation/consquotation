# Kế hoạch kiểm thử giai đoạn 18: kiểm thử tổng thể và nghiệm thu

Ngày lập: 2026-10-27. Mã nguồn tại commit `c699dfa` (bản 1.11.0, chưa phát hành). Kết quả ghi ở [PHASE_18_TEST_REPORT.md](PHASE_18_TEST_REPORT.md); kiểm thử tay ở [PHASE_18_MANUAL_QA_CHECKLIST.md](PHASE_18_MANUAL_QA_CHECKLIST.md).

## Trạng thái ban đầu (đã chạy)

| Lệnh (theo `package.json`) | Kết quả |
|---|---|
| `npm run check` (typecheck, lint, test, validate, build) | Đạt; 357/357 test, 23 file; manifest hợp lệ; build có 3 cảnh báo kích thước bundle (735 KiB) |
| `npm audit --omit=dev` | 0 lỗ hổng trong dependency đóng gói |
| `npm audit` (cả dev) | 14 lỗ hổng (12 cao, 1 vừa, 1 thấp), đều trong công cụ phát triển (office-addin-debugging/manifest/dev-settings, teamsfx, adm-zip, node-forge, body-parser…); bản sửa của nhóm office-addin là nâng phiên bản lớn |

Repository không có script integration test riêng; kiểm thử Excel thật chạy bằng `tests/integration/run-in-taskpane.mjs` khi task pane bản dev đang mở.

## Phạm vi

| # | Khu vực | Module chính |
|---|---|---|
| A | Cấu trúc add-in, manifest, kiểm tra tương thích | `manifest/`, `src/office/capabilities.ts`, `compat-gate.js` |
| B | Task pane, điều hướng, trạng thái giao diện | `src/taskpane/` |
| C | Lớp tích hợp Excel | `src/office/core`, các gateway Excel |
| D | Thư viện đơn giá cá nhân | `src/domain/library`, `libraryService`, IndexedDB |
| E | Định mức, thành phần hao phí | `normCalc`, `composition`, `norms` |
| F | Bộ máy tính | `decimal`, `rounding`, `normCalc`, `quotation/calculate`, công thức Excel |
| G | Quy trình báo giá | `quoteService`, `quotationService`, `quoteCheck`, `quotation/*` |
| H | Lưu trữ, nhập/xuất, sao lưu, khôi phục, migration | `exchange/*`, IndexedDB v1→v3, hồ sơ báo giá XML |
| I | Đồng bộ workbook và ứng dụng | `reconcile`, kiểm tra vân tay, giá trị cũ |
| J | Xử lý lỗi, loading, thông báo | `officeErrors`, các panel |

Ngoài phạm vi: cài bản production (P1 của roadmap), Excel web và Mac (không có môi trường), đặc tả 12/19/21.

## Phụ thuộc và môi trường

- Node.js và npm của repository; Vitest + fake-indexeddb cho unit test.
- Excel Microsoft 365 Windows 16.0.20430, sideload bằng `npm start`, điều khiển task pane qua WebView2 DevTools (cổng 9229).
- Cổng 3000 phải trống (dự án VietMoneyToWords của người dùng cũng dùng cổng này).
- Dữ liệu kiểm thử: bộ dữ liệu giả định trong chính kịch bản (thư viện trong bộ nhớ, mã bắt đầu `CQIT-`), workbook tạm do `npm start` tạo. Không ghi vào thư viện hay workbook của người dùng.

## Cấp kiểm thử

| Cấp | Công cụ | Ghi chú |
|---|---|---|
| Unit | `npm test` | Domain thuần, service với gateway giả lập (bộ giả lập mô phỏng công thức Excel) |
| Tích hợp giả lập | `npm test` (`tests/unit/quotation.test.ts`, nhóm "luồng đầy đủ") | Luồng đầy đủ: thư viện IndexedDB giả lập → định mức → phân tích → báo giá → hồ sơ → mở lại |
| Tích hợp Excel thật | `node tests/integration/run-in-taskpane.mjs tests/integration/quotation.scenarios.js` | Gọi gateway và service thật trong task pane; chỉ đụng sheet, bảng và hồ sơ do kịch bản tạo |
| Hồi quy lớp Excel | `tests/integration/excel-core.scenarios.js` | 26 tình huống của giai đoạn 14 |
| Giao diện | Điều khiển task pane qua DevTools | Nút, trạng thái, bề rộng 320px, bấm lặp, tải lại pane |
| Thủ công | [PHASE_18_MANUAL_QA_CHECKLIST.md](PHASE_18_MANUAL_QA_CHECKLIST.md) | Bước người dùng tự kiểm tra |

## Ma trận kiểm thử

| Yêu cầu (mục prompt) | Unit | Tích hợp giả lập | Excel thật | Giao diện/tay |
|---|---|---|---|---|
| 4. Luồng 12 bước | | x | x | x |
| 5. Hao phí, chi phí, đơn giá theo loại, hao hụt | x | x | x | |
| 5. Làm tròn, thập phân, số lớn, 0 hợp lệ | x | | x | |
| 5. Âm, không hữu hạn, thiếu giá/định mức, sai đơn vị | x | x | x | |
| 5. Cập nhật khối lượng, đơn giá; tính không thành công | x | x | x | |
| 6. Nhiều báo giá độc lập | | | x | |
| 6. Sửa, lưu, mở lại | x | x | x | x |
| 6. Thư viện đổi, định mức ngừng dùng, tài nguyên bị xóa | x | x | x | |
| 6. Bản ghi trùng; nhập dữ liệu sai; xuất rồi nhập lại; migration | x | | | |
| 6. Lưu bị gián đoạn; workbook và hồ sơ lệch | x | | x | |
| 7. Sheet/bảng bị xóa, đổi tên; cấu trúc sai; sửa trực tiếp; ô sai kiểu | x | | x | |
| 7. Phạm vi ghi sai; lệnh Excel thất bại; bấm lặp; dữ liệu lớn | x | | x | x |
| 7. Không ghi đè vùng ngoài quyền quản lý | x | | x | |
| 8. Nút, trạng thái, thông báo, tìm/lọc, 320px, tải lại pane | | | | x |

## Tiêu chí đạt/trượt

- Một tình huống **đạt** khi kết quả thực tế khớp giá trị kỳ vọng tính độc lập (ghi trong test hoặc checklist), không chỉ khi không có exception.
- **Trượt** khi sai số liệu, mất hoặc trùng dữ liệu, ghi ra ngoài vùng của add-in, hoặc thông báo sai sự thật.
- Lỗi phân loại P0 (mất/hỏng dữ liệu), P1 (tính sai, báo giá sai, lỗi lưu, luồng chính không dùng được), P2 (chức năng quan trọng sai nhưng có cách khác), P3 (giao diện, cải tiến).
- Nghiệm thu chỉ khi không còn P0/P1 mở, `npm run check` đạt, và kịch bản Excel thật của luồng chính đạt.
- Chức năng chưa có được liệt kê riêng, không tính là đạt.

## Giới hạn môi trường

- Chỉ có Excel desktop Windows một phiên bản; không có Excel web, Mac, iPad.
- "Không có workbook khả dụng" không tái hiện được: add-in task pane luôn chạy trong một workbook đang mở. Kiểm tra thay bằng trạng thái "chưa có bảng báo giá".
- Không mô phỏng được mất điện hay Excel bị tắt giữa chừng; thay bằng lỗi ghi giả lập (unit) và sheet bị bảo vệ (Excel thật).
- Tốc độ đo trên một máy, chỉ để so sánh tương đối.
