# Bảo mật và triển khai — tình trạng theo prompts/15

Rà soát ngày 2026-10-21, sau giai đoạn prompts/13–17.

| Yêu cầu | Tình trạng | Bằng chứng |
|---|---|---|
| Chỉ xin quyền tối thiểu trong manifest | `<Permissions>ReadWriteDocument</Permissions>`: mức thấp nhất cho phép đọc và ghi workbook (cần để tạo bảng báo giá). Không xin quyền mailbox, quyền đọc tài liệu khác hay gọi API ngoài | `manifest/manifest.dev.xml` |
| Không có secret trong repository, manifest, bundle | Không có backend, khóa API hay token. `git grep` tìm khóa, mật khẩu, token, private key: không thấy. Biến `CQ_PROD_URL` chỉ là URL công khai | ADR-0005, ADR-0007 |
| Validate import | Mọi giá trị nhập qua cùng một bộ kiểm tra (kiểu, bắt buộc, trùng, tham chiếu). Chỉ nhận UTF-8. Giới hạn 20 MB và 50.000 dòng. JSON chỉ được `JSON.parse`, không thực thi | `src/domain/library/exchange/*` |
| Escape nội dung người dùng khi hiển thị | Giao diện React tự escape; không dùng `dangerouslySetInnerHTML`. `compat-gate.js` chỉ chèn một chuỗi cố định. File `.xlsx` xuất ra escape XML và ghi chữ dạng inline string | `src/shared/xlsx.ts` |
| Không thực thi mã tùy ý từ thư viện | Chữ ghi vào ô luôn có tiền tố `'`, nên "=…", "+…", "@…" không bao giờ thành công thức. Công thức chỉ do add-in sinh từ mẫu cố định | `asLiteralText`, ADR-0008 |
| Tách development và production | Manifest dev (Id riêng, tên "(Dev)", `localhost:3000`) khác manifest prod. Bản build prod **dừng lại** nếu còn `localhost`, Id dev hoặc tên dev | `webpack.config.js` |
| Content-Security-Policy | Thẻ meta `object-src 'none'; base-uri 'self'; form-action 'none'` trên task pane và trang trợ giúp. Không chặn script vì `office.js` phải tải từ `appsforoffice.microsoft.com`, và Excel trên web chưa được kiểm thử | `src/taskpane/taskpane.html` |
| Không gửi dữ liệu ra ngoài | Không có lệnh gọi mạng nào ngoài việc tải `office.js`. Nhật ký lỗi chỉ ghi mã lỗi và chỉ tồn tại trong phiên | `src/shared/diagnostics.ts` |
| Tài liệu sideload, triển khai nội bộ, cập nhật, gỡ cài đặt | Có đủ | `docs/SIDELOAD.md`, `docs/DEPLOY.md` §4–7 |
| Chọn triển khai theo chính sách tổ chức | Khuyên dùng Centralized Deployment cho bản chính thức nội bộ; sideload chỉ để phát triển | `docs/DEPLOY.md` §6 |
| Kiểm tra môi trường Excel, báo khi không tương thích | Webview cũ (IE11/EdgeHTML) hoặc thiếu ExcelApi 1.8 thì hiện thông báo và không thao tác workbook. Tính năng tùy chọn (1.9, 1.13) có đường thay thế | `compat-gate.js`, `UnsupportedScreen`, `docs/COMPATIBILITY.md` |

## Ngoài phạm vi / còn mở

- **Không ký số mã nguồn** và **không tự kiểm tra tính toàn vẹn của bundle**: tin cậy vào HTTPS của GitHub Pages. Không có header bảo mật tùy chỉnh vì GitHub Pages không cho đặt header.
- **Kho mã public:** ai cũng xem được mã nguồn (ADR-0007). Không có dữ liệu người dùng trong repo.
- Thư viện lưu trong IndexedDB **không mã hóa**, giống mọi dữ liệu web cục bộ. Sẽ xem xét ở prompts/12 (lưu trữ và quyền riêng tư).
