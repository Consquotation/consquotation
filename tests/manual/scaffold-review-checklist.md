# Kiểm tra bộ khung Excel Add-in (2026-10-26, bản 1.8.0)

Rà lại bộ khung đang có (không tạo lại project): cấu hình, manifest, task pane, Ribbon, scripts và tài liệu chạy dự án.

## Môi trường

Node 24.18.0, npm 11.16.0, `package-lock.json`; `node_modules` đã đủ (`npm ls` không báo thiếu). Chứng chỉ dev: `npx office-addin-dev-certs verify` đạt.

## Đối chiếu cấu hình

| Hạng mục | Kết quả |
|---|---|
| `tsconfig.json` | `strict`, `noUnusedLocals/Parameters`, target ES2017, gồm `src` và `tests` |
| `webpack.config.js` | Entry `taskpane` (index.tsx + taskpane.html), `commands`, chunk `react`; dev server HTTPS cổng 3000 bằng chứng chỉ `office-addin-dev-certs`; manifest production chỉ sinh khi có `CQ_PROD_URL` |
| `manifest/manifest.dev.xml` | `npm run validate`: hợp lệ. 4 nút Ribbon đều `ShowTaskpane` vào cùng `CQ.MainTaskpane`; FunctionFile `commands.html` không cần hàm |
| URL trong manifest dev | Bật `npm run dev-server`: cả 19 URL (3 trang HTML, 4 biến thể taskpane, 12 icon) trả 200 qua HTTPS, chứng chỉ được Windows tin cậy (`ssl_verify=0`) |
| Entry point | `Office.onReady` → kiểm tra host là Excel và ExcelApi 1.8 → render `App`, nếu không thì màn hình "chưa tương thích". `compat-gate.js` (ES5) chặn webview IE11/EdgeHTML trước khi tải bundle |

## Sửa trong lần này

- Task pane: thêm dòng trạng thái dưới tiêu đề, ví dụ "Đã tải xong · Đã kết nối Excel trên Windows · Bản 1.8.0 (dev)". Dòng này chỉ hiện sau khi Office.js sẵn sàng và Excel đạt mức API tối thiểu. Thêm unit test `tests/unit/readyStatus.test.ts`.
- `src/commands/commands.ts`: sửa chú thích cũ (ghi chỉ có 1 nút; thực tế có 4 nút ShowTaskpane).
- README: thêm yêu cầu môi trường, cài đặt, chạy dev server và sideload, build/test, dừng server, bảng lỗi thường gặp.
- `docs/SIDELOAD.md`: sửa dòng cũ "hosting production chưa được chọn" (đã chọn GitHub Pages, ADR-0007); đổi cổng phải sửa cả `urlDev` trong webpack; thêm lỗi task pane trắng do hộp thoại "WebView Stop On Load".

## Kết quả kiểm tra tự động

| Lệnh | Kết quả |
|---|---|
| `npm run lint` | Đạt |
| `npm run typecheck` | Đạt |
| `npm run test` | Đạt, 18 file, 246/246 test |
| `npm run validate` | Manifest hợp lệ |
| `npm run build` | Đạt, kèm 3 cảnh báo kích thước: `taskpane.js` 573 KiB (162 KiB gzip) vượt mức khuyến nghị 244 KiB |

## Chưa kiểm tra trên Excel trong lần này

Excel đang mở workbook làm việc của người dùng nên không chạy `npm start`. Phần mở task pane từ Ribbon đã kiểm tra trên Excel ngày 2026-10-22 (bản trước khi thêm dòng trạng thái). Dòng trạng thái mới cần người dùng xác nhận theo các bước trong README, mục "Chạy thử trong Excel trên Windows".

## Còn tồn tại

- Cảnh báo kích thước bundle (task pane mở dưới 0,5 giây, xem docs/PERFORMANCE.md).
- `core-js`, `regenerator-runtime` còn trong dependencies nhưng không được dùng từ ADR-0010; chưa gỡ, chờ người dùng đồng ý.
- Excel trên web, Mac chưa kiểm thử.
