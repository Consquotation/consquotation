# ADR-0003: Lưu trữ thư viện cá nhân

- Trạng thái: Chấp nhận
- Ngày: 2026-10-19

## Bối cảnh

Mỗi người dùng tự xây dựng thư viện gồm WorkItem, Resource, ResourcePrice, NormDefinition và thiết lập cá nhân. Thư viện phải dùng được cho mọi workbook báo giá. Add-in không có quyền truy cập file path tùy ý, không dùng SQLite trực tiếp và không có Node APIs.

Các cơ chế lưu mà Office.js và webview cung cấp:

| Cơ chế | Phạm vi | Phù hợp làm thư viện chung? |
|---|---|---|
| `workbook.settings`, Custom XML Parts, document properties | Từng file workbook | Không. Chỉ dùng cho metadata của báo giá |
| `localStorage` | Origin của add-in, khoảng 5–10 MB | Chỉ hợp cho thiết lập nhỏ |
| IndexedDB | Origin của add-in, dung lượng lớn hơn | Có, nhưng có điều kiện (xem rủi ro) |
| OneDrive/SharePoint qua Microsoft Graph | Theo tài khoản, đồng bộ nhiều máy | Cần Entra app, đăng nhập, mạng; vượt phạm vi MVP |

### Rủi ro đã xác minh trên máy phát triển (2026-10-19)

1. **Dữ liệu bị xóa cùng cache Office.** Dữ liệu webview của add-in nằm tại `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\webview2\<…>\EBWebView`. Thư mục `Wef` chính là thư mục bị xóa khi:
   - bật "Next time Office starts, clear all previously-started web add-ins cache", hoặc
   - chạy `npx office-addin-cache clear`, hoặc
   - xóa cache thủ công.
2. **Dữ liệu bị tách riêng theo tài khoản Office.** Có thư mục con dạng `…_LiveId`, nên đăng nhập tài khoản khác sẽ thấy kho trống.
3. **Dữ liệu gắn với origin.** Đổi domain host hoặc cổng dev sẽ thấy kho trống.
4. **Excel trên web dùng kho của trình duyệt.** Kho này tách khỏi Excel desktop và bị chia ngăn theo top-level site.

## Quyết định

**Lưu chính bằng IndexedDB, kèm backup bắt buộc ra file hoặc workbook do người dùng giữ.**

- **Lớp lưu trữ:**
  - `src/storage/` định nghĩa interface `LibraryRepository`. Implementation đầu tiên là `IndexedDbLibraryRepository`.
  - Logic nghiệp vụ không phụ thuộc IndexedDB, nên sau này có thể thêm backend OneDrive mà không sửa domain.
- **Tên database và khóa:**
  - Tên database có tiền tố `consquotation`.
  - Nếu `Office.context.partitionKey` có giá trị, ghép nó vào tên database theo khuyến nghị của Microsoft.
- **Phiên bản schema:**
  - Lưu `schemaVersion` cùng dữ liệu, có migration tuần tự.
  - Nếu migration lỗi thì không ghi đè dữ liệu cũ. Báo lỗi và đề nghị export.
- **Thiết lập nhỏ** (lần backup gần nhất, tùy chọn giao diện) cũng lưu trong IndexedDB, không rải ra `localStorage`.
- **Bảo vệ người dùng khỏi mất dữ liệu:**
  - Màn hình Cài đặt luôn hiển thị nơi lưu, số bản ghi và ngày backup gần nhất.
  - Nhắc backup khi đã có thay đổi mà quá N ngày chưa backup (N do người dùng cấu hình).
  - Ghi một dấu hiệu "đã từng có dữ liệu" vào workbook settings của các báo giá. Khi thư viện trống nhưng workbook cho thấy từng có dữ liệu, cảnh báo khả năng cache đã bị xóa và hướng dẫn restore.
  - Gọi `navigator.storage.persist()` nếu webview hỗ trợ. Đây chỉ là biện pháp phụ, không thay cho backup.
- **Snapshot trong báo giá:**
  - Khi chèn công tác, dòng báo giá lưu lại đơn giá, đơn vị, nguồn giá, mã công tác và ngày hiệu lực tại thời điểm chèn.
  - Báo giá cũ không đổi khi thư viện đổi. Muốn áp giá mới, người dùng chủ động dùng lệnh "Cập nhật giá" (giai đoạn sau), có xem trước.
- **Không gửi dữ liệu ra ngoài:** thư viện và workbook không được gửi tới server nào. Không log nội dung báo giá hoặc thư viện.

## Phương án không chọn

- **Thư viện trong sheet của workbook:** Office.js chỉ đọc được workbook đang mở task pane, nên phải chép thư viện vào mọi file báo giá. Tuy vậy, cơ chế "import từ vùng dữ liệu trong workbook" vẫn được dùng cho restore (ADR-0004).
- **OneDrive qua Graph:** để dành cho giai đoạn có nhu cầu đồng bộ nhiều máy; khi đó cần ADR riêng về đăng nhập, quyền và bảo mật.

## Hệ quả

- README phải có mục "Thư viện của tôi được lưu ở đâu" và "Backup/restore/chuyển máy", nêu rõ các thao tác làm mất dữ liệu.
- Chuyển máy hoặc chuyển giữa Excel desktop và web được thực hiện bằng export rồi import.

## Cần xác minh trong Excel thật

- [x] IndexedDB còn dữ liệu sau khi đóng và mở lại Excel.
- [x] IndexedDB mất sau khi xóa cache, để xác nhận kịch bản cảnh báo.
- [ ] `Office.context.partitionKey` trên Windows desktop (dự kiến `undefined`) và trên Excel web. (Windows: đã xác minh; Excel web: chưa)
- [x] `navigator.storage.persist()` và `navigator.storage.estimate()` trong WebView2.

## Kết quả xác minh

**2026-10-19 — Excel Microsoft 365 trên Windows, build 16.0.20430.20182 x64** (công cụ "Kiểm tra lưu trữ cục bộ" của giai đoạn 1, checklist `tests/manual/phase-1-checklist.md`):

| Hạng mục | Kết quả |
|---|---|
| IndexedDB | Khả dụng |
| Dữ liệu sau khi đóng/mở lại Excel | Còn nguyên |
| `Office.context.partitionKey` | Không có (`undefined`), đúng như tài liệu Microsoft |
| `navigator.storage.persisted()` | `false` — trình duyệt nhúng có thể dọn dữ liệu khi thiếu dung lượng |
| `navigator.storage.estimate()` quota | 10.240 MB |
| `navigator.storage.persist()` | **Bị từ chối** — WebView2 trong Excel không cấp lưu trữ bền vững |
| Sau `npx office-addin-cache clear` | Dữ liệu IndexedDB **mất hoàn toàn** (thư mục `Wef` bị xóa) |

Kết luận: hai rủi ro mất dữ liệu (xóa cache Office, trình duyệt nhúng tự dọn khi thiếu dung lượng) đều có thật trên nền tảng chính. Backup bắt buộc và cảnh báo "thư viện trống bất thường" là yêu cầu bắt buộc của giai đoạn 3, không phải tùy chọn.

Chưa xác minh: Excel trên web.

## Nguồn

- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/persisting-add-in-state-and-settings
- https://learn.microsoft.com/en-us/office/dev/add-ins/testing/clear-cache
