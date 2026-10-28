# ADR-0015: Cấp phép bằng email và mã 20 ký tự, dùng thử 30 ngày, không máy chủ

- Trạng thái: Chấp nhận (triển khai trong bản 1.12.0, chờ chủ sản phẩm duyệt trước khi phát hành)
- Ngày: 2026-10-28
- Liên quan: [ADR-0001](0001-nen-tang-excel-muc-tieu.md) (nền tảng), [ADR-0003](0003-luu-tru-thu-vien-ca-nhan.md) (lưu trữ cục bộ), [ADR-0007](0007-hosting-github-pages.md) (GitHub Pages, không backend)

## Bối cảnh

Chủ sản phẩm đặt điều kiện cho người khác dùng ConsQuotation (trao đổi ngày 2026-10-28):

1. Hỗ trợ Microsoft 365 và Office 2016 trở về sau. Office 2016/2019 bản volume (MSI, chạy add-in bằng Internet Explorer 11) không hỗ trợ; người dùng nhóm này dùng Excel trên web.
2. Muốn dùng lâu dài phải được chủ sản phẩm cấp phép: người dùng gửi yêu cầu về `nguyenchikhoa97@gmail.com`, chủ sản phẩm trả lời kèm một mã 20 ký tự chữ và số, ngẫu nhiên, khác nhau cho từng người.
3. Mã vĩnh viễn, một mã cho một tài khoản, không thu hồi.
4. Trước khi được cấp phép: dùng thử đủ tính năng trong 30 ngày.
5. Không dùng máy chủ; chủ sản phẩm duyệt tay.

Bản đề xuất đầu tiên của ADR này xác định tài khoản bằng đăng nhập Microsoft (MSAL, Nested App Authentication). Cách đó cần đăng ký ứng dụng trên Microsoft Entra; với tài khoản Microsoft cá nhân, việc này đòi tạo tenant qua tài khoản Azure miễn phí (xác minh bằng thẻ). Chủ sản phẩm thấy quy trình này quá phức tạp và chọn phương án 1: email cộng mã, không đăng nhập.

## Quyết định

### Danh tính là email người dùng tự khai

- Add-in không đọc tài khoản đang đăng nhập Excel. Danh tính là địa chỉ email người dùng gửi thư yêu cầu, và chủ sản phẩm trả mã về đúng địa chỉ đó.
- Điều kiện "Excel phải đăng nhập tài khoản" không được add-in kiểm tra. Nó chỉ còn là yêu cầu cài đặt (Microsoft 365 cần đăng nhập để kích hoạt Office).

### Danh sách cấp phép tĩnh

- File `licenses.json` ở gốc repo, được build sao chép lên GitHub Pages cùng nguồn với add-in:

  ```json
  { "format": "consquotation-licenses", "version": 1, "keys": ["<64 ký tự hex>", "..."] }
  ```

- Mỗi khóa là SHA-256 của `"cq-license-v1|" + email + "|" + mã`, với email đã chuẩn hóa (bỏ khoảng trắng đầu cuối, chữ thường) và mã đã chuẩn hóa (chữ hoa, bỏ khoảng trắng và gạch nối).
- Danh sách không chứa email hay mã gốc. Muốn biết một email đã được cấp phép chưa phải biết cả mã.
- Mã có 20 ký tự lấy từ bảng `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (bỏ 0, O, 1, I, L dễ nhầm), có ít nhất một chữ và một số. Sinh bằng nguồn ngẫu nhiên mật mã, lấy mẫu loại bỏ (byte từ 248 trở lên bị bỏ) để không lệch phân bố.

### Kích hoạt

- Người dùng nhập email và mã ở tab Cài đặt, mục Cấp phép, rồi bấm Kích hoạt. Add-in tải `licenses.json` (không dùng cache), băm cặp email và mã, so với danh sách.
- Khớp thì lưu `{email, code, activatedAt}` trong localStorage của add-in (khóa `consquotation.license.v1`) và mở khóa vĩnh viễn trên máy đó, kể cả khi không có mạng.
- Máy khác, hoặc sau khi xóa cache Office, người dùng nhập lại cùng email và mã một lần.
- Lỗi được phân biệt: email sai định dạng, mã sai định dạng, không khớp danh sách, không tải được danh sách (mất mạng).

### Dùng thử 30 ngày

- Bắt đầu từ lần đầu mở add-in trên một máy, lưu cùng khóa localStorage ở trên.
- Không có máy chủ thì không chặn được việc dùng thử lại: xóa cache Office, cài lại Office hay đổi máy sẽ bắt đầu lại 30 ngày. Chủ sản phẩm chấp nhận mức này khi chọn phương án không máy chủ.

### Hết hạn dùng thử mà chưa kích hoạt

- Task pane chỉ còn màn hình cấp phép: gửi yêu cầu, nhập mã, và nút tải bản sao lưu thư viện (.json). Các tab và nút Trợ giúp bị ẩn.
- Dữ liệu của người dùng không bị khóa: báo giá nằm trong file Excel nên vẫn mở, sửa, in bằng Excel; thư viện vẫn tải sao lưu được.

### Gửi yêu cầu

- Nút "Soạn bằng Gmail" và "Soạn bằng Outlook.com" mở trang soạn thư soạn sẵn (người nhận, tiêu đề, phiên bản add-in, ngày bắt đầu dùng thử) trong trình duyệt mặc định qua `Office.context.ui.openBrowserWindow`.
- Nút "Mở ứng dụng thư" (`mailto:`) chỉ hiện trên Excel trên web. Trên Excel desktop, Office bỏ qua `mailto:` cả qua `openBrowserWindow` lẫn `window.open` (kiểm chứng trên Excel 16.0.20430, 2026-10-28).
- Nút "Sao chép nội dung" và một ô chỉ đọc chứa toàn bộ thư, dùng khi người dùng gửi bằng ứng dụng khác. `navigator.clipboard` bị WebView2 của Excel chặn nên add-in dùng `document.execCommand("copy")` làm dự phòng.
- Add-in không tự gửi thư và không gửi dữ liệu đi đâu.

### Duyệt (công cụ của chủ sản phẩm)

- Lệnh `npm run license:grant -- <email>` chạy trên máy chủ sản phẩm:
  - sinh mã, hoặc dùng lại mã cũ nếu email đã có trong sổ;
  - thêm khóa vào `licenses.json` (không trùng);
  - ghi sổ cấp phép `ngay,email,ma` ngoài repo, mặc định `%USERPROFILE%\ConsQuotation-licenses\ledger.csv`;
  - in thư trả lời và đường dẫn soạn thư Gmail.
- Chủ sản phẩm gửi thư, rồi commit và push `licenses.json`. Hướng dẫn: [LICENSING.md](../LICENSING.md).

## Hệ quả

- Không thêm phụ thuộc, không đổi manifest, người dùng hiện tại không phải cài lại. Thêm `licenses.json` trên GitHub Pages.
- Add-in có một yêu cầu mạng mới: tải `licenses.json` khi người dùng bấm Kích hoạt. Email và mã chỉ lưu cục bộ, không gửi đi.
- Mã gắn với email, không gắn với máy hay tài khoản Excel. Người có mã có thể đưa cả email và mã cho người khác dùng. Không có máy chủ thì không phát hiện được việc này.
- Kiểm tra chạy hoàn toàn phía máy người dùng nên chỉ ngăn được người dùng thông thường; người rành kỹ thuật có thể sửa localStorage hoặc mã để bỏ qua. Muốn chặn triệt để phải có máy chủ.
- Bản dev (`npm start`) cũng áp dụng cấp phép như bản production; khi kiểm thử phải xóa khóa localStorage sau khi xong.
- Phát hành bản này lên production sẽ bắt đầu tính 30 ngày dùng thử cho mọi người dùng hiện có, kể từ lần đầu họ mở bản mới.

## Kết quả xác minh

Excel Microsoft 365 cho Windows 16.0.20430, bản dev, ngày 2026-10-28:

- Lần đầu mở: tiêu đề hiện "Dùng thử: còn 30 ngày", mục Cấp phép hiện ngày kết thúc 27/11/2026.
- Bấm thật "Soạn bằng Gmail" mở cửa sổ soạn thư Gmail trong Chrome tới đúng địa chỉ; bấm thật "Sao chép nội dung" đưa đúng nội dung vào clipboard. `mailto:` không mở gì trên desktop.
- Sau `license:grant` cho một email thử: mã sai, email khác đều báo không khớp; mã chứa số 0 báo sai định dạng; mã chữ thường có gạch nối kích hoạt được; tải lại task pane vẫn ở trạng thái đã cấp phép.
- Ngày bắt đầu dùng thử lùi 31 ngày: chỉ còn màn hình cấp phép và nút sao lưu; kích hoạt từ màn hình này thì các tab trở lại.
- Chặn mạng khi kích hoạt: báo không tải được danh sách.
- Bề rộng 320 px: không tràn ngang.
- Nút tải sao lưu ở màn hình hết hạn chưa được bấm thử (để không ghi file vào thư mục Downloads); nút này gọi cùng hàm sao lưu đã kiểm chứng ở tab Thư viện.
