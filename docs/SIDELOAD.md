# Cài đặt môi trường phát triển và sideload ConsQuotation

Hướng dẫn chạy add-in ở chế độ phát triển (manifest `manifest/manifest.dev.xml`, máy chủ `https://localhost:3000`).

## 1. Yêu cầu

| Thành phần | Yêu cầu |
|---|---|
| Node.js | Bản Active LTS (dự án khai báo `>=24`) |
| Excel | Excel trên Windows (Microsoft 365) — nền tảng chính. Excel trên web cần tài liệu trên OneDrive/SharePoint |
| Quyền | Quyền cài chứng chỉ cho tài khoản Windows hiện tại; quyền quản trị nếu Windows hỏi về loopback exemption |

## 2. Cài dependency

```bash
npm install
```

npm 11 có thể cảnh báo `allow-scripts` cho `keytar`, `core-js` và `@microsoft/m365agentstoolkit-cli`. Các script cài đặt này không cần cho việc sideload manifest XML; có thể bỏ qua cảnh báo.

## 3. Cài chứng chỉ HTTPS phát triển (một lần)

Office Add-in phải chạy qua HTTPS, kể cả khi phát triển.

```bash
npx office-addin-dev-certs install
```

- Lệnh này tạo CA tự ký "Developer CA for Microsoft Office Add-ins" trong `%USERPROFILE%\.office-addin-dev-certs` và thêm CA vào kho chứng chỉ tin cậy của người dùng Windows hiện tại.
- Windows sẽ hiện hộp thoại cảnh báo bảo mật; chọn **Yes** để đồng ý.
- Kiểm tra: `npx office-addin-dev-certs verify`.
- Gỡ: `npx office-addin-dev-certs uninstall`.

Nếu chưa cài, `npm start` cũng sẽ đề nghị cài.

## 4. Chạy trong Excel trên Windows

```bash
npm start
```

Lệnh này build bản development, chạy dev server tại `https://localhost:3000`, đăng ký manifest dev với Excel và mở Excel.

- Lần đầu có thể được hỏi "Allow localhost loopback for Microsoft Edge WebView?" — nhập `Y` (cần quyền quản trị).
- Trong Excel: tab **ConsQuotation (Dev)** › **Mở ConsQuotation**. Nếu tab chưa hiện: **Home** › **Add-ins** › chọn ConsQuotation.
- Sửa HTML/JS: bấm vào task pane rồi nhấn `Ctrl+F5` để tải lại. Sửa manifest: dừng, xóa cache (mục 7) rồi chạy lại.

Dừng và gỡ add-in đã sideload:

```bash
npm stop
```

## 5. Chạy trong Excel trên web

1. Tạo hoặc mở một workbook trên OneDrive/SharePoint, chọn **Share** › **Copy link**.
2. Chạy:

   ```bash
   npm run start:web -- --document "<link workbook>"
   ```

3. Nếu add-in không tự sideload: trong Excel trên web, **Home** › **Add-ins** › **More Settings** › **Upload My Add-in**, chọn `manifest/manifest.dev.xml`.

Manifest sideload trên web được lưu trong bộ nhớ trình duyệt; xóa dữ liệu trình duyệt thì phải sideload lại.

## 6. Kiểm tra chất lượng

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | Chỉ chạy dev server `https://localhost:3000`, không mở Excel (dùng khi đã sideload thủ công hoặc trên Mac) |
| `npm run typecheck` | TypeScript strict, không sinh file |
| `npm run lint` | ESLint + Prettier theo cấu hình `office-addin-lint` |
| `npm test` | Vitest (unit test) |
| `npm run validate` | Kiểm tra manifest dev. **Lưu ý:** công cụ gửi nội dung manifest (không có dữ liệu người dùng) tới dịch vụ kiểm tra trực tuyến của Microsoft |
| `npm run build` | Build production vào `dist/` |
| `npm run check` | Chạy tất cả các bước trên theo thứ tự |

## 7. Xóa cache add-in của Office

Cần khi đổi manifest hoặc add-in hoạt động bất thường:

```bash
npx office-addin-cache clear
```

> **Cảnh báo (ADR-0003):** trên Windows, thao tác này xóa cả thư mục `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`, gồm dữ liệu cục bộ (IndexedDB/localStorage) của **mọi** add-in. Khi đã có thư viện cá nhân, hãy xuất backup trước khi xóa cache.

## 8. Manifest production

Nhà cung cấp hosting production chưa được chọn (ADR-0005). Khi đã có domain HTTPS cố định:

```bash
# bash
CQ_PROD_URL=https://<domain-cua-ban> npm run build
```

```powershell
# PowerShell
$env:CQ_PROD_URL = "https://<domain-cua-ban>"; npm run build
```

Build sinh `dist/manifest.prod.xml` với mọi URL trỏ tới domain production và **thất bại** nếu manifest còn chứa `localhost`. Không đặt `CQ_PROD_URL` thì build vẫn chạy nhưng không sinh manifest production.

Kiểm tra manifest production vừa sinh: `npm run validate:prod`.

## 9. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Task pane báo "We can't open this add-in from localhost" | Cho phép loopback exemption (mục 4) và kiểm tra dev server đang chạy |
| Trình duyệt/Excel báo chứng chỉ không tin cậy | `npx office-addin-dev-certs verify`; nếu lỗi thì `uninstall` rồi `install` lại |
| Tab ConsQuotation không hiện sau khi sửa manifest | `npm stop`, xóa cache (mục 7), `npm start` |
| Task pane hiện "Phiên bản Excel chưa tương thích" | Excel đang dùng webview IE11/EdgeHTML hoặc thiếu ExcelApi 1.8 (ADR-0001, ADR-0002) |
| Cổng 3000 bị chiếm | Dừng tiến trình đang dùng cổng 3000, hoặc đổi `config.dev_server_port` trong `package.json` và URL trong manifest dev |
