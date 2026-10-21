# Kiểm thử — prompts/13–17: kiểm tra lỗi, tương thích, bảo mật, kiểm thử, hiệu năng

**Lần chạy 2026-10-21 (bản 1.7.0).** Claude tự chạy trên Excel desktop thật (Microsoft 365, build 16.0.20430.20182), điều khiển task pane qua DevTools.

## prompts/13 — Kiểm tra dữ liệu và xử lý lỗi

| Yêu cầu | Đáp ứng | Bằng chứng |
|---|---|---|
| Trường bắt buộc, mã trùng, đơn vị không khớp, ngày hiệu lực, liên kết resource/norm | Có từ prompts/08–10 | Unit test, checklist 08–10 |
| **Giá bất thường** | **Mới:** đơn giá ≥ 100 tỷ hoặc khối lượng ≥ 10 triệu thì cảnh báo (không chặn). Đơn giá trong báo giá khác đơn giá hiện tại trong thư viện thì cảnh báo. Thư viện có giá bằng 0 thì cảnh báo | `quoteCheck.ts`, `validation.ts`, unit test |
| **Thiếu đơn vị tính** trong báo giá | **Mới:** cảnh báo ở đúng ô | Regression #6 |
| Công thức lỗi | Có (prompts/10); **mới:** cách sửa theo từng loại lỗi (#DIV/0!, #VALUE!, #REF!, #NAME?, #N/A) | Unit test |
| Sheet/range không còn tồn tại | Bảng bị xóa hoặc đổi tên → thông báo kèm "Tải lại danh sách". **Mới:** cột mẫu bị đổi tên → báo lỗi chặn rõ ràng thay vì crash | Regression #7, #9 |
| Vùng bị bảo vệ | Chặn trước khi ghi ở mọi tính năng. **Mới:** thêm cho Thiết lập trang in, kèm hướng dẫn Review › Unprotect Sheet | Regression #7 |
| Lỗi import/export, storage | Có (prompts/09). Lỗi IndexedDB → thông báo kèm Thử lại | Regression #7 |
| Phân biệt lỗi chặn và cảnh báo | Mức Lỗi / Cảnh báo ở mọi danh sách kiểm tra | |
| Gắn lỗi với bản ghi/dòng/cột/range | Mỗi mục có sheet, dòng, địa chỉ ô và nút Đi tới | |
| **Hướng khắc phục rõ ràng** | **Mới:** mọi mục của Kiểm tra báo giá có "Cách sửa: …" (unit test kiểm tra đủ) | |
| Không thay lỗi bằng 0/giá mặc định | Có (prompts/10) | |
| **Không nuốt exception; log an toàn** | **Mới:** nhật ký lỗi kỹ thuật của phiên (Cài đặt › Nhật ký lỗi kỹ thuật), chỉ ghi thời điểm, thao tác và mã lỗi, không ghi nội dung. Các bước phụ trước đây bỏ qua lỗi im lặng nay ghi vào nhật ký. Lỗi IndexedDB cũng được ghi | `diagnostics.ts` |
| **Thất bại một phần: báo trạng thái và cách phục hồi** | **Mới:** lỗi của thao tác ghi kèm câu "một phần có thể đã được ghi… kiểm tra vùng… chạy Kiểm tra báo giá" | `describeWriteError` |
| Không báo thành công trước khi API xác nhận | Có. **Mới:** câu báo sau khi sao lưu JSON nói rõ add-in không xác nhận được việc lưu file | |

## prompts/14 — Tương thích Excel

Ma trận nền tảng, requirement set theo tính năng và locale: [docs/COMPATIBILITY.md](../../docs/COMPATIBILITY.md).
- **Mới:** tab Cài đặt hiện tính năng tùy chọn có dùng được trên máy hay không (in, ExcelApi 1.9; kiểm tra ô gộp, ExcelApi 1.13).
- **Mới:** `OPTIONAL_FEATURES`, có unit test bảo đảm tính năng cốt lõi nằm trong mức tối thiểu 1.8.
- Đổi sheet hoặc vùng chọn khi pane mở, sheet bị bảo vệ, Ctrl+Z: kiểm thử trong regression.
- Excel trên web và Mac: **chưa kiểm thử** (không có môi trường).

## prompts/15 — Bảo mật và triển khai

Tình trạng từng mục: [docs/SECURITY.md](../../docs/SECURITY.md).
- **Mới:** Content-Security-Policy tối thiểu (`object-src 'none'; base-uri 'self'; form-action 'none'`). Đã kiểm chứng trên Excel: các form vẫn gửi bình thường.
- **Mới:** `docs/DEPLOY.md` §6 hướng dẫn chọn cách triển khai cho tổ chức; khuyên dùng Centralized Deployment cho bản chính thức nội bộ.
- Đã quét repo: không có secret.

## prompts/16 — Kiểm thử và nghiệm thu

- **Các lớp test:**
  - unit (domain, validation, nhập, tính giá, in);
  - integration với IndexedDB giả lập (`fake-indexeddb`);
  - giả lập Office.js qua `FakeGateway` cho phần điều phối;
  - test tay trên Excel thật cho từng giai đoạn (`tests/manual/spec-*.md`);
  - regression.
- **Regression:** [regression-checklist.md](regression-checklist.md), 10/10 đạt sau khi sửa 2 lỗi.
- **Nghiệm thu:** xem "Kết quả kiểm tra tự động" bên dưới. README được cập nhật đúng thực tế; không có secret.

## prompts/17 — Hiệu năng và độ tin cậy

Số đo và các biện pháp: [docs/PERFORMANCE.md](../../docs/PERFORMANCE.md).
- **Mới:** mốc `performance.mark` khi mở pane.
- **Mới:** bỏ polyfill IE11 và biên dịch theo `browserslist` (ADR-0010). Trang tải nhẹ hơn 236 KiB; render lần đầu 0,31 s (trước đó 0,34–0,50 s).
- **Mới:** `randomId()` dự phòng cho Safari < 15.4.

## Kết quả kiểm tra tự động

Chạy sau thay đổi mã cuối cùng, đúng các lệnh trong `package.json`:

| Lệnh | Kết quả |
|---|---|
| `npm run lint` | Đạt — 0 lỗi, 0 cảnh báo |
| `npm run typecheck` | Đạt — 0 lỗi. Lần chạy đầu bắt được 1 lỗi kiểu trong `tests/unit/uuid.test.ts`, đã sửa |
| `npm run test` | Đạt — 17 file, 239/239 test |
| `npm run build` | Đạt, kèm **3 cảnh báo** kích thước: `taskpane.js` 571 KiB (161 KiB gzip) vượt mức khuyến nghị 244 KiB. `polyfill.js` không còn |

**Lỗi và hạn chế còn tồn tại:**
- Cảnh báo kích thước bundle: chưa tách code vì thời gian mở pane đo được dưới 0,5 s; ghi trong PERFORMANCE.md.
- Excel trên web, Mac và Excel bản 2016–2024: chưa kiểm thử.
- Excel giao diện tiếng Việt, và định dạng vùng en-US: chưa kiểm thử (không đổi cài đặt hệ thống của máy kiểm thử).
- Tham chiếu vòng: Office.js không cho đọc, Excel tự cảnh báo.
- Prompts/12 (lưu trữ và quyền riêng tư) chưa làm, theo thứ tự giao việc.
