# ADR-0005: Hosting và triển khai

- Trạng thái: Chấp nhận. Mục mở "chọn nhà cung cấp hosting" được giải quyết bởi [ADR-0007](0007-hosting-github-pages.md) (GitHub Pages)
- Ngày: 2026-10-19

## Bối cảnh

- Add-in là web app. Excel tải task pane từ URL HTTPS khai báo trong manifest.
- Manifest production không được dùng localhost.
- Origin của trang host quyết định kho IndexedDB (ADR-0003). **Đổi domain sau khi người dùng đã có dữ liệu đồng nghĩa với việc họ thấy thư viện trống**, nên họ phải export rồi import lại.
- Add-in cần mạng để tải task pane. Yêu cầu "offline hoàn toàn" không đáp ứng được bằng cấu hình mặc định.

## Quyết định

### Môi trường phát triển

- Dùng dev server webpack HTTPS trên localhost với chứng chỉ dev của `office-addin-dev-certs`.
- Sideload bằng `npm start` trên Windows và `npm run start -- web --document <url>` cho Excel web.
- Dữ liệu thư viện trong môi trường dev **là dữ liệu thử**. Origin localhost khác origin production.

### Môi trường production

- Host file tĩnh (HTML/JS/CSS/icon) trên dịch vụ HTTPS có **origin cố định và dành riêng** cho ConsQuotation:
  - Subdomain riêng hoặc domain riêng.
  - Không dùng chung origin với site khác, ví dụ `user.github.io` dùng chung cho nhiều project.
- Không có backend và không có secret.
- Ảnh icon phải cho phép cache: không trả `Cache-Control: no-cache` hoặc `no-store`.

### Phân phối

| Đối tượng | Cách phân phối |
|---|---|
| Cá nhân, thử nghiệm | Upload My Add-in hoặc shared folder catalog (Windows) với `manifest.prod.xml` |
| Tổ chức | Centralized Deployment qua Microsoft 365 admin center; ghi tài liệu khi có nhu cầu |
| Marketplace | Ngoài phạm vi hiện tại |

Sideload không được coi là phương thức phát hành cuối cho tổ chức.

### Mục mở

Chọn nhà cung cấp hosting trước khi phát hành bản đầu tiên cho người dùng thật, chậm nhất ở giai đoạn 6.

- Ứng viên:
  - Azure Static Web Apps (có subdomain riêng, gói miễn phí).
  - GitHub Pages hoặc Cloudflare Pages với **custom domain riêng**.
- Tiêu chí: origin cố định lâu dài, HTTPS, không yêu cầu backend, chi phí.

## Hệ quả

- Build production thay URL dev bằng URL production. Kiểm tra tự động rằng `manifest.prod.xml` không chứa `localhost`.
- README hướng dẫn: sideload dev, cài từ manifest production, gỡ cài đặt, xóa cache (kèm cảnh báo mất thư viện theo ADR-0003) và cập nhật phiên bản.

## Nguồn

- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/add-in-manifests
- https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing
