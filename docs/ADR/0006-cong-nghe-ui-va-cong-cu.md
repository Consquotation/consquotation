# ADR-0006: Công nghệ UI và công cụ phát triển

- Trạng thái: Chấp nhận
- Ngày: 2026-10-19

## Bối cảnh

Task pane cần: form CRUD, danh sách có tìm kiếm và phân trang, dialog xác nhận, wizard import nhiều bước, các trạng thái loading/empty/success/warning/error, keyboard navigation và accessibility cơ bản, toàn bộ bằng tiếng Việt.

Yeoman generator for Office Add-ins (`yo office`) là công cụ dựng khung Microsoft đang hướng dẫn. Nó có template TypeScript cho task pane và có template React.

## Quyết định

### Dựng khung

- Dùng `npx -p yo -p generator-office yo office`, không cài toàn cục. Chọn task pane, **React**, **TypeScript**, manifest XML và host Excel.
- Generator tạo dự án trong **thư mục tạm**. Sau đó gộp có chọn lọc vào repo:
  - Không ghi đè `README.md`.
  - Gộp `.gitignore` thay vì thay thế.
  - Xem diff trước khi commit.
- Giữ webpack và các công cụ `office-addin-*` do generator cung cấp (debugging, dev-certs, manifest validate, lint).

### Giao diện

- Dùng **React + Fluent UI React v9** (theo template generator) để có giao diện đồng bộ với Office và hỗ trợ accessibility.
- React 18+ và Fluent UI v9 không chạy trên IE11. Vì vậy `taskpane.html` có đoạn kiểm tra môi trường viết bằng **ES5 thuần** (không qua Babel/TypeScript), chạy trước bundle. Nếu phát hiện IE11 hoặc EdgeHTML, đoạn này hiện thông báo tiếng Việt và không tải bundle (ADR-0001). Logic phát hiện user agent được tách thành hàm có test.
- Mọi chuỗi giao diện tập trung trong `src/shared/` để thống nhất tiếng Việt.
- Không render HTML từ dữ liệu người dùng. Chỉ dùng render mặc định của React, không dùng `dangerouslySetInnerHTML`.

### Công cụ chất lượng

| Script | Công cụ |
|---|---|
| `lint` | ESLint (cấu hình `office-addin-lint` của generator) |
| `typecheck` | `tsc --noEmit`, `strict: true` |
| `test` | Vitest; `fake-indexeddb` cho storage; adapter giả lập Excel (kết hợp `office-addin-mock` khi phù hợp) |
| `build` | webpack production |
| `validate` | `office-addin-manifest validate` cho manifest dev và prod |

Nếu template generator dùng công cụ khác (ví dụ Jest), ưu tiên giữ công cụ của generator khi nó đáp ứng yêu cầu, và ghi chú thay đổi vào ADR này.

### Phân lớp

Phân lớp theo [03_PLATFORM_ARCHITECTURE.md](../../prompts/03_PLATFORM_ARCHITECTURE.md), điều chỉnh theo scaffold thực tế:

- `domain/` không phụ thuộc DOM, React hay Office.js.
- Chỉ `office/` được gọi `Excel.run`. Không giữ proxy object ra ngoài batch.
- `storage/` đứng sau interface `LibraryRepository`.

### Phiên bản Node

Dùng bản Active LTS theo yêu cầu của Microsoft. Máy phát triển hiện có Node 24.18.0. Ghi phiên bản thực tế vào `package.json` (`engines`) khi scaffold.

## Hệ quả

- Bundle lớn hơn so với TypeScript thuần. Thời gian mở task pane sẽ được đo ở giai đoạn 6 trước khi tối ưu.
- Phiên bản chính xác của generator, React, Fluent UI và các công cụ khác được ghi lại sau khi scaffold, theo `package.json` thực tế.
