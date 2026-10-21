# ConsQuotation

Microsoft Excel Add-in hỗ trợ lập báo giá thi công xây dựng **ngay trong Excel**. Excel vẫn là bảng tính chính (ô, công thức, copy/paste, in, lưu file); add-in bổ sung tab Ribbon, task pane và nghiệp vụ báo giá. Mỗi người dùng tự xây dựng và quản lý thư viện công tác, định mức, đơn giá của mình — add-in **không** kèm sẵn dữ liệu định mức hay đơn giá.

## Trạng thái

Đã triển khai theo bộ đặc tả trong `prompts/`: 04 (setup, manifest), 05 (Ribbon, task pane), 06 (workbook integration), 08 (thư viện cá nhân), 09 (nhập/xuất, sao lưu thư viện).

Đã có:
- **Ribbon**: tab **ConsQuotation** gồm nhóm **Báo giá** (Mở ConsQuotation, Tạo bảng báo giá, Thư viện của tôi) và nhóm **Trợ giúp**.
- **Task pane** tiếng Việt với các tab Tổng quan, Báo giá, Thư viện, Cài đặt, cùng màn hình Trợ giúp.
- **Tạo bảng báo giá** trên sheet mới (tự đặt tên) hoặc tại ô đang chọn:
  - Gồm khối thông tin và Excel Table 9 cột.
  - Kiểm tra vùng đích, hỏi xác nhận trước khi ghi đè.
  - Chặn khi sheet bị bảo vệ, có Table chồng lên, có ô gộp, hoặc vượt giới hạn sheet.
  - Dòng tổng không đẩy dữ liệu bên dưới.
- **Thêm công tác** thủ công hoặc từ thư viện:
  - Mặc định chèn ngay dưới dòng đang chọn.
  - Chống bấm lặp tạo dòng trùng.
  - Chữ bắt đầu bằng `= + - @` được lưu dạng chữ.
- **Thư viện của tôi** (xem [docs/LIBRARY.md](docs/LIBRARY.md)):
  - Gồm công tác, tài nguyên, giá có ngày hiệu lực và định mức.
  - Thêm, sửa, sao chép, xóa (có xác nhận); tìm kiếm không cần gõ dấu.
  - Kiểm tra thư viện: mã trùng, thiếu dữ liệu, liên kết hỏng, giá hết hạn, giá chồng thời gian.
  - Chèn vào báo giá dưới dạng bản sao giá trị.
  - Thư viện ban đầu **trống**, không có dữ liệu mẫu.
- **Nhập/Xuất và sao lưu thư viện** (xem [docs/LIBRARY_SCHEMA.md](docs/LIBRARY_SCHEMA.md)):
  - Sao lưu ra file JSON, xuất ra workbook Excel mới, mở file mẫu trống.
  - Nhập từ JSON, CSV UTF-8 hoặc một sheet trong workbook đang mở.
  - Luồng nhập: nhận diện tiêu đề → chọn loại dữ liệu → map cột → xem trước → kiểm tra → chọn cách xử lý trùng → xác nhận → báo cáo.
  - Không ghi đè mặc định. Báo lỗi theo dòng và cột. Mỗi lần nhập ghi trong một giao dịch.
  - Nhắc khi thư viện chưa được sao lưu.
- Thông báo "không tương thích" cho Excel dùng webview cũ (IE11/EdgeHTML) hoặc thiếu ExcelApi 1.8.

Chưa có: kiểm tra báo giá, định giá theo định mức (prompts/10), in ấn (prompts/11).

### Hạn chế đã biết

- **Thao tác ghi của add-in không hoàn tác được bằng Ctrl+Z.** Đã kiểm chứng trên Excel Microsoft 365 cho Windows, ngày 2026-10-20. Vì vậy add-in luôn kiểm tra và hỏi xác nhận trước khi ghi vào vùng có dữ liệu.
- **Thư viện cá nhân bị xóa khi xóa cache Office.** Hãy sao lưu thường xuyên bằng Thư viện › Nhập/Xuất. Xem [docs/LIBRARY.md](docs/LIBRARY.md).
- Add-in không đọc trực tiếp file `.xlsx`: mở file trong Excel rồi dùng "Đọc từ workbook đang mở".

## Công nghệ

Office.js · TypeScript (strict) · React 18 · Fluent UI React v9 · webpack 5 · Vitest. Dự án được tạo bằng Yeoman generator for Office Add-ins (`yo office`, template React + TypeScript, manifest XML) rồi tùy biến. Phiên bản cụ thể xem [package.json](package.json).

## Nền tảng Excel

| Nền tảng | Mức hỗ trợ | Đã kiểm thử |
|---|---|---|
| Excel Microsoft 365 trên Windows | Chính | Có — đặc tả 04, 05, 06, 08, 09 (2026-10-19/21), build 16.0.20430.20182 |
| Excel trên web | Phụ | Chưa |
| Excel 2016/2019/2021/2024 bản retail trên Windows (WebView2) | Hỗ trợ | Chưa — không có máy kiểm thử |
| Excel trên Mac | Chưa kiểm thử | Chưa |
| Excel 2016/2019 bản volume (IE11) | Hiện thông báo không tương thích | Chỉ unit test |

Chi tiết: [ADR-0001](docs/ADR/0001-nen-tang-excel-muc-tieu.md), [ADR-0002](docs/ADR/0002-manifest-va-requirement-set.md).

## Cấu trúc thư mục

```
manifest/manifest.dev.xml   Manifest phát triển (localhost). Manifest production sinh khi build.
src/taskpane/               Task pane (React + Fluent UI)
src/commands/               FunctionFile cho lệnh Ribbon
src/compat/compat-gate.js   Kiểm tra webview viết bằng ES5, chạy trước bundle
src/office/                 Adapter Office.js (requirement set, thông tin môi trường)
src/storage/                Lưu trữ cục bộ (hiện: công cụ kiểm tra IndexedDB)
src/shared/                 Chuỗi tiếng Việt dùng chung
src/help/help.html          Trang trợ giúp (SupportUrl của manifest)
tests/unit/                 Unit test (Vitest)
tests/manual/               Checklist kiểm thử tay trong Excel
docs/ADR/                   Quyết định kiến trúc
docs/SIDELOAD.md            Cài đặt môi trường, sideload, xử lý sự cố
docs/DEPLOY.md              Triển khai lên GitHub Pages, cài bản production
.github/workflows/          GitHub Actions: build, kiểm tra, deploy Pages
prompts/                    Bộ đặc tả yêu cầu dự án
```

## Lệnh

```bash
npm install          # cài dependency
npm start            # chạy dev server và sideload vào Excel trên Windows
npm run start:web -- --document "<link workbook OneDrive>"   # Excel trên web
npm stop             # dừng và gỡ add-in đã sideload
npm run typecheck    # TypeScript
npm run lint         # ESLint + Prettier
npm test             # Vitest
npm run validate     # kiểm tra manifest (gửi nội dung manifest tới dịch vụ kiểm tra của Microsoft)
npm run build        # build production vào dist/ (đặt CQ_PROD_URL để sinh manifest production)
npm run validate:prod  # kiểm tra dist/manifest.prod.xml
npm run check        # chạy typecheck, lint, test, validate, build
```

Hướng dẫn đầy đủ (chứng chỉ HTTPS, Excel trên web, xóa cache, manifest production): [docs/SIDELOAD.md](docs/SIDELOAD.md).

## Dữ liệu và quyền riêng tư

- Add-in không gửi workbook hay thư viện lên máy chủ nào và không có backend.
- Thư viện cá nhân (khi được triển khai) lưu cục bộ trong IndexedDB của add-in. Dữ liệu này **bị xóa khi xóa cache add-in của Office** và không đồng bộ giữa các máy hoặc giữa Excel desktop và Excel trên web — người dùng phải sao lưu bằng chức năng export. Xem [ADR-0003](docs/ADR/0003-luu-tru-thu-vien-ca-nhan.md) và [ADR-0004](docs/ADR/0004-import-export-thu-vien.md).

## Triển khai

Bản production được host trên GitHub Pages của một GitHub Organization dành riêng ([ADR-0007](docs/ADR/0007-hosting-github-pages.md)), deploy tự động bằng GitHub Actions khi push lên `master`. Hướng dẫn: [docs/DEPLOY.md](docs/DEPLOY.md).

- Repo: https://github.com/Consquotation/consquotation
- Địa chỉ production: https://consquotation.github.io/consquotation/
- Manifest production: https://consquotation.github.io/consquotation/manifest.prod.xml
- Trạng thái: đã deploy (2026-10-20); chưa thử cài bản production vào Excel.
