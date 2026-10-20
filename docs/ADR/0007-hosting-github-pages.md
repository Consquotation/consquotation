# ADR-0007: Hosting production trên GitHub Pages

- Trạng thái: Chấp nhận
- Ngày: 2026-10-19
- Giải quyết mục mở của: [ADR-0005](0005-hosting-va-trien-khai.md)

## Bối cảnh

ADR-0005 yêu cầu host file tĩnh trên HTTPS với **origin cố định và dành riêng**, vì origin quyết định kho IndexedDB của thư viện cá nhân (ADR-0003). Người dùng không muốn mua tên miền riêng.

Đặc điểm GitHub Pages liên quan:

| Đặc điểm | Ảnh hưởng |
|---|---|
| Với GitHub Free (cá nhân hoặc tổ chức), repo dùng Pages phải là **public** | Mã nguồn để public. Dự án không có secret (ADR-0005) |
| Trang của tài khoản hoặc tổ chức đều dùng origin `https://<tên>.github.io` | Mọi Pages site của cùng tài khoản/tổ chức **dùng chung origin**, nên dùng chung IndexedDB |
| HTTPS mặc định, có thể bắt buộc HTTPS | Đáp ứng yêu cầu của Office Add-in |
| Không cấu hình được HTTP header | Header cache mặc định của GitHub Pages không phải `no-store`, đáp ứng yêu cầu cache icon của manifest |
| Deploy bằng GitHub Actions (`actions/deploy-pages`) | Build và kiểm tra chạy tự động trước khi phát hành |

## Quyết định

- Tạo một **GitHub Organization miễn phí dành riêng** cho ConsQuotation. Tổ chức này **không host Pages site nào khác** để giữ origin dành riêng.
- Repo public `consquotation` trong tổ chức đó chứa mã nguồn.
- URL production: `https://<tên-tổ-chức>.github.io/consquotation/`.
- Lưu URL này trong biến repo `CQ_PROD_URL` (Settings › Secrets and variables › Actions › Variables). Biến này không phải secret.
- Workflow `.github/workflows/deploy-pages.yml` chạy khi push lên `master` hoặc khi chạy tay. Các bước:
  1. `npm ci`.
  2. typecheck, lint, test.
  3. Build production với `CQ_PROD_URL`.
  4. Validate manifest production.
  5. Deploy thư mục `dist/` lên Pages.
- Manifest production được phục vụ tại `<URL production>manifest.prod.xml` để người dùng tải về và cài.

## Hệ quả

- **Không đổi tên tổ chức, tên repo hay chuyển sang domain khác** sau khi có người dùng thật. Mọi thay đổi origin đều làm thư viện cục bộ "biến mất" (phải export rồi import lại). Nếu buộc phải đổi, cần ADR mới và hướng dẫn chuyển dữ liệu.
- Không bật Pages cho repo nào khác trong tổ chức.
- Bản build public có kèm source map. Điều này chấp nhận được vì mã nguồn đã public.
- Dữ liệu thử ở môi trường dev (`https://localhost:3000`) tách biệt với production.
- Manifest dev và prod dùng chung `Id`: không cài đồng thời. Chạy `npm stop` trước khi cài bản production trên máy phát triển.

## Cần xác minh

- [x] Workflow deploy thành công; `taskpane.html`, `help.html`, icon và `manifest.prod.xml` trả về HTTP 200 qua HTTPS.
- [ ] Cài `manifest.prod.xml` vào Excel trên Windows; tab và task pane hoạt động từ GitHub Pages.
- [x] Header `Cache-Control` của icon không chứa `no-cache` / `no-store`.

## Kết quả xác minh

**2026-10-20:**

- Tổ chức `Consquotation`, repo public `Consquotation/consquotation`. URL production: `https://consquotation.github.io/consquotation/`.
- Lần deploy đầu bị từ chối với thông báo *Branch "master" is not allowed to deploy to github-pages due to environment protection rules*. Nguyên nhân: khi bật Pages trên repo còn trống, GitHub tạo environment `github-pages` chỉ cho phép nhánh `main`. Cách sửa đã áp dụng: thêm quy tắc nhánh `master` vào environment, rồi chạy lại job deploy, lần này thành công.
- Sau khi deploy:
  - `taskpane.html`, `help.html`, `compat-gate.js`, `commands.html`, `taskpane.js`, icon và `manifest.prod.xml` đều trả HTTP 200 qua HTTPS.
  - Truy cập bằng HTTP bị chuyển hướng 301 sang HTTPS.
  - Icon có header `Cache-Control: max-age=600`.
  - `manifest.prod.xml` không chứa `localhost`.
- Lịch sử commit dùng email ẩn danh của GitHub (`…@users.noreply.github.com`) để không lộ email cá nhân trên repo public.

**2026-10-20 (giai đoạn 2):** Hệ quả "dev và prod dùng chung Id" ở trên đã được khắc phục.
- Manifest dev có Id riêng `03040238-…` và tên "ConsQuotation (Dev)".
- Build production thay về Id chính thức `33062f3c-…` và tên "ConsQuotation", và thất bại nếu còn sót Id hoặc tên của bản dev.
- Hai bản giờ cài song song được.

## Nguồn

- https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
