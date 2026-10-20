# Triển khai ConsQuotation lên GitHub Pages

Theo [ADR-0007](ADR/0007-hosting-github-pages.md). Trong hướng dẫn này, `<to-chuc>` là tên GitHub Organization dành riêng cho ConsQuotation.

URL production: `https://<to-chuc>.github.io/consquotation/`

> Chọn tên tổ chức và tên repo **một lần**. Đổi tên sau khi có người dùng sẽ đổi origin, và thư viện cá nhân lưu cục bộ của họ sẽ "biến mất" (phải export rồi import lại).

## 1. Chuẩn bị trên GitHub (làm một lần)

1. **Tạo Organization miễn phí:** github.com › ảnh đại diện › **Your organizations** › **New organization** › gói **Free**. Đặt tên `<to-chuc>`, ví dụ `consquotation` nếu còn trống.
2. **Tạo repo public:** trong tổ chức, **New repository**, tên `consquotation`, chọn **Public**. **Không** tạo README, `.gitignore` hay license, để repo trống.
3. **Bật Pages bằng GitHub Actions:** repo › **Settings** › **Pages** › **Build and deployment** › **Source** = **GitHub Actions**.
4. **Đặt biến URL production:** repo › **Settings** › **Secrets and variables** › **Actions** › tab **Variables** › **New repository variable**:
   - Name: `CQ_PROD_URL`
   - Value: `https://<to-chuc>.github.io/consquotation/`
5. **Cho phép nhánh `master` deploy:** repo › **Settings** › **Environments** › `github-pages` › **Deployment branches and tags** › **Add deployment branch or tag rule**, nhập `master`, rồi bấm **Add rule**. Khi bật Pages trên repo trống, GitHub chỉ cho phép nhánh `main`; thiếu bước này thì job deploy bị từ chối.
6. Không bật Pages cho repo nào khác trong tổ chức này, để origin luôn dành riêng.
7. Repo public sẽ hiện email tác giả commit. Nên dùng email ẩn danh của GitHub: `git config user.email "<id>+<tài-khoản>@users.noreply.github.com"`.

## 2. Đẩy mã nguồn

```bash
git remote add origin https://github.com/<to-chuc>/consquotation.git
git push -u origin master
```

Mỗi lần push lên `master`, workflow [deploy-pages.yml](../.github/workflows/deploy-pages.yml) chạy theo thứ tự: `npm ci` → typecheck → lint → test → build (với `CQ_PROD_URL`) → validate manifest production → deploy. Có thể chạy tay ở tab **Actions** › **Deploy GitHub Pages** › **Run workflow**.

Ghi chú: bước validate gửi nội dung manifest tới dịch vụ kiểm tra trực tuyến của Microsoft.

## 3. Kiểm tra sau khi deploy

Mở trong trình duyệt. Tất cả phải hiển thị qua HTTPS:

- `https://<to-chuc>.github.io/consquotation/taskpane.html`
- `https://<to-chuc>.github.io/consquotation/help.html`
- `https://<to-chuc>.github.io/consquotation/assets/icon-80.png`
- `https://<to-chuc>.github.io/consquotation/manifest.prod.xml`

Ở trình duyệt thường, `taskpane.html` có thể chỉ hiện trang trống vì không chạy trong Excel. Điều đó là bình thường.

## 4. Cài add-in bản production vào Excel

Bản dev (tab **ConsQuotation (Dev)**) và bản production (tab **ConsQuotation**) có Id riêng nên có thể cài cùng lúc trên máy phát triển.

1. Tải `manifest.prod.xml` từ URL ở mục 3 về máy.
2. Cài theo một trong hai cách:
   - **Excel trên web:** **Home** › **Add-ins** › **More Settings** › **Upload My Add-in** › chọn `manifest.prod.xml`.
   - **Excel trên Windows (chỉ để thử nghiệm):** dùng thư mục chia sẻ làm catalog tin cậy. Microsoft ghi rõ cách này *không được hỗ trợ cho add-in production*: chỉ chạy trên Windows, và mỗi lần đổi Ribbon người dùng phải cài lại. Để phân phối thật trên Windows, dùng Centralized Deployment (mục 3) hoặc Microsoft Marketplace.
     1. Đặt `manifest.prod.xml` vào một thư mục chia sẻ mạng.
     2. Trong Excel: **File** › **Options** › **Trust Center** › **Trust Center Settings** › **Trusted Add-in Catalogs**, thêm đường dẫn thư mục chia sẻ (dạng `\\may\thu-muc`), tick **Show in Menu**, rồi khởi động lại Excel.
     3. **Home** › **Add-ins** › **More Add-ins** › **SHARED FOLDER** › ConsQuotation.
3. Với tổ chức có Microsoft 365: quản trị viên có thể triển khai tập trung (Centralized Deployment) qua Microsoft 365 admin center.

## 5. Gỡ cài đặt bản production

| Cách đã cài | Cách gỡ |
|---|---|
| Excel trên web (Upload My Add-in) | **Home** › **Add-ins** › **More Settings** › tab **My Add-ins** › menu `…` của ConsQuotation › **Remove** |
| Excel trên Windows từ thư mục chia sẻ | Đóng Excel, chạy `npx office-addin-cache clear` (xóa cache Office; **mọi** add-in mất dữ liệu cục bộ, xem ADR-0003) |
| Centralized Deployment | Quản trị viên gỡ trong Microsoft 365 admin center |

Gỡ hẳn thư mục catalog thử nghiệm trên Windows:

1. Bỏ tin cậy catalog: Excel › **File** › **Options** › **Trust Center** › **Trust Center Settings** › **Trusted Add-in Catalogs** › chọn đường dẫn › **Remove**. Cách khác là xóa khóa tương ứng trong `HKEY_CURRENT_USER\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs`.
2. Ngừng chia sẻ thư mục, cần quyền quản trị: `Remove-SmbShare -Name ConsQuotationCatalog` (PowerShell), hoặc vào **Properties** › **Sharing** › **Advanced Sharing** của thư mục.
3. Xóa thư mục catalog nếu không dùng nữa.

## 6. Cập nhật phiên bản

- Thay đổi HTML/JS/icon: chỉ cần push. Excel tải bản mới khi mở lại task pane. Cache trình duyệt có thể giữ bản cũ khoảng 10 phút.
- Thay đổi manifest (nút Ribbon, quyền, tên): tăng `<Version>` trong `manifest/manifest.dev.xml`, push, rồi người dùng cài lại manifest mới.
