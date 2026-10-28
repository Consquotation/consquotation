# Cấp phép ConsQuotation: hướng dẫn cho chủ sản phẩm

Quyết định và lý do: [ADR-0015](ADR/0015-cap-phep-bang-ma-khong-may-chu.md). Áp dụng từ bản 1.12.0.

## Người dùng thấy gì

1. Lần đầu mở add-in trên một máy: dùng thử đủ tính năng 30 ngày. Tiêu đề task pane hiện số ngày còn lại.
2. Muốn dùng lâu dài: vào Cài đặt › Cấp phép, bấm "Soạn bằng Gmail" hoặc "Soạn bằng Outlook.com" (hoặc sao chép nội dung), rồi gửi thư tới `nguyenchikhoa97@gmail.com` từ địa chỉ email của họ.
3. Nhận mã, nhập đúng email đã gửi và mã, bấm Kích hoạt. Máy khác thì nhập lại một lần.
4. Hết 30 ngày chưa kích hoạt: chỉ còn màn hình cấp phép và nút tải bản sao lưu thư viện. File Excel báo giá vẫn mở, sửa, in bình thường.

## Duyệt một yêu cầu

Mở terminal tại thư mục repo:

```sh
npm run license:grant -- nguoidung@example.com
```

Dùng đúng địa chỉ đã gửi thư yêu cầu. Lệnh in ra:

- mã cấp phép 20 ký tự;
- nội dung thư trả lời và một đường dẫn mở sẵn thư đó trong Gmail;
- đường dẫn sổ cấp phép.

Sau đó:

1. Mở đường dẫn Gmail, kiểm tra người nhận rồi gửi.
2. Commit và push `licenses.json`:

   ```sh
   git add licenses.json
   git commit -m "license: cấp phép thêm 1 tài khoản"
   git push
   ```

3. Đợi GitHub Actions deploy xong (thường dưới 5 phút) rồi mới báo người dùng kích hoạt. Kích hoạt trước lúc đó sẽ báo "không khớp".

Chạy lại lệnh với email đã cấp thì dùng lại mã cũ và không thêm khóa trùng. Dùng khi người dùng mất thư.

## Sổ cấp phép

- Mặc định `%USERPROFILE%\ConsQuotation-licenses\ledger.csv`, cột `ngay,email,ma`. Đổi bằng `--ledger <đường dẫn>`.
- Sổ chứa mã gốc nên nằm ngoài repo. Không commit, không chia sẻ.
- Mất sổ thì vẫn không mất cấp phép đã cấp (khóa băm nằm trong `licenses.json`), nhưng không tra lại được mã. Khi đó cấp mã mới cho email đó: xóa dòng email khỏi sổ (nếu còn) rồi chạy lại lệnh; mã cũ vẫn dùng được vì không có thu hồi.
- Sao lưu sổ cùng các tài liệu quan trọng khác.

## Giới hạn

- Dùng thử tính trên từng máy; xóa cache Office, cài lại Office hay đổi máy sẽ tính lại 30 ngày.
- Mã gắn với email, không gắn với máy. Ai có cả email và mã đều kích hoạt được.
- Kiểm tra chạy trên máy người dùng nên người rành kỹ thuật bỏ qua được.
- Không thu hồi được mã đã cấp. Xóa khóa khỏi `licenses.json` chỉ chặn kích hoạt mới; máy đã kích hoạt vẫn dùng tiếp.
- Office 2016/2019 bản volume (MSI) không chạy add-in; hướng người dùng sang Excel trên web.

## Kiểm thử trên bản dev

Bản dev cũng áp dụng cấp phép. Khi thử:

- dùng email giả (ví dụ `...@example.com`) và `--ledger` trỏ ra thư mục tạm;
- xong thì trả `licenses.json` về danh sách rỗng, xóa sổ tạm, và xóa khóa `consquotation.license.v1` trong localStorage của task pane dev.
