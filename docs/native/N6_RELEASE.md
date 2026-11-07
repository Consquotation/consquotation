# Giai đoạn N6: cấp phép, cập nhật, kiểm thử tổng thể

Kế hoạch: [NATIVE_PLAN.md](../NATIVE_PLAN.md). Kịch bản còn phải chạy trước khi phát hành: [ACCEPTANCE.md](ACCEPTANCE.md). Hướng dẫn cho người dùng: [USER_GUIDE.md](USER_GUIDE.md). Ngày: 2026-11-07.

Mã: `native/src/ConsQuotation.AddIn/SystemUi/`, `native/src/ConsQuotation.Core/Updates/UpdateCheck.cs`, `native/src/ConsQuotation.Core/Licensing/FileLicenseStorage.cs`, `native/src/ConsQuotation.Core/Storage/SettingsFile.cs`.

## Cửa sổ Hệ thống

Ba nút cuối của ribbon mở cửa sổ nổi có 3 thẻ. Từ N6, cả 16 nút đều có chức năng; hộp "sẽ có ở giai đoạn sau" đã bỏ.

| Nút | Thẻ | Việc làm được |
|---|---|---|
| Bản quyền | Bản quyền | Thời hạn, soạn thư xin cấp phép, kích hoạt; khi hết hạn thêm phần sao lưu thư viện |
| Cài đặt | Cài đặt | Phiên bản add-in và Excel, bitness, nơi lưu thư viện, kiểm tra cập nhật |
| Trợ giúp | Trợ giúp | Cách dùng ngắn gọn, liên kết tới hướng dẫn đầy đủ, trang phát hành, trang báo lỗi |

Nút Bản quyền hiện trạng thái ngay trên ribbon: "Dùng thử: còn N ngày", "Hết hạn dùng thử" hoặc "Đã cấp phép". Nút Cài đặt đổi thành "Cài đặt (có bản mới)" khi có bản cao hơn.

## Cấp phép

Cơ chế và câu chữ giữ nguyên bản web (ADR-0015): cùng `licenses.json` trên GitHub Pages nên mã đã cấp vẫn dùng được, lệnh `npm run license:grant` không đổi.

Khác bản web:

- Trạng thái lưu ở `%APPDATA%\ConsQuotation\license.json` thay localStorage. Xóa cache Office không còn làm mất cấp phép.
- Dùng thử bắt đầu ở lần đầu bấm một nút ribbon. Excel chỉ nạp add-in mà người dùng chưa bấm gì thì chưa tính.
- Có thêm nút Mở ứng dụng thư: Excel desktop chặn `mailto:` trong WebView, còn bản Windows mở được.
- Hết hạn: nút Báo giá và Thư viện đều mở thẻ Bản quyền. Cài đặt và Trợ giúp vẫn mở được để người dùng tự cập nhật. Cửa sổ đang mở từ trước khi hết hạn không bị đóng giữa chừng, giống bản web.

Không đọc được file trạng thái vì lỗi máy (bị khóa, không có quyền) thì không khóa người dùng. File hỏng hoặc ngày sai dạng thì tính lại dùng thử: bảo vệ này không nhằm chống người rành kỹ thuật, như giới hạn đã ghi trong [LICENSING.md](../LICENSING.md).

## Kiểm tra cập nhật

Add-in gọi GitHub Releases API sau khi nạp 10 giây, để không làm Excel mở chậm, nếu đã đủ 24 giờ từ lần hỏi trước. Lần lỗi cũng tính là một lần hỏi. Kết quả lưu ở `update-check.json` nên lần mở Excel sau nút ribbon báo ngay, không cần mạng.

Add-in chỉ báo bản mới khi: không phải bản nháp, đã kèm file `ConsQuotation-Setup-*.exe`, cao hơn bản đang chạy theo SemVer, và đường dẫn nằm trong trang phát hành của sản phẩm. Người dùng bản chính thức không được báo bản thử; người dùng bản thử được báo cả hai. Add-in không tự tải, không tự cài.

## Điểm khác với kế hoạch

- `Directory.Build.props` đổi sang `2.0.0`; quy trình Release vẫn ghi đè theo tag.
- Quy trình Release chạy thêm toàn bộ test trong tiến trình 32-bit.
- Bản web chưa thêm thông báo chuyển sang bản cài đặt: việc này chỉ làm sau khi `v2.0.0` đã đăng.

## Kết quả kiểm tra

Dữ liệu thử là số giả định. Excel chạy phiên riêng, thư viện và file trạng thái ở thư mục tạm.

| Phần | Kết quả |
|---|---|
| `dotnet test` Debug, Release, tiến trình 64-bit | 368/368 (326 ở N5, thêm 42) |
| `dotnet test` Debug, Release, tiến trình 32-bit (`testhost.net48.x86`) | 368/368 |
| Excel 64-bit thật, kịch bản N6, bản Release | 84/84 |
| Bộ cài thật: cài, Excel tự nạp, cài đè, gỡ | 14/14 |
| Chạy lại N4 trên cùng bản | 128/128 |
| Ctrl+Z, đang sửa ô, thoát Excel | 5/5 |
| Chạy lại N5 trên cùng bản | Lần 1: 86/87; lần 2: 87/87 (xem mục dưới) |

Kịch bản N6 trên Excel gọi mạng thật: GitHub API trả `2.0.0-alpha.3` cho bản thử build với số `2.0.0-alpha.1` và không báo gì cho bản `2.0.0`; kích hoạt với email và mã giả tải `licenses.json` thật và báo "không khớp". Excel thoát trong khoảng 3 giây, kể cả khi cửa sổ Hệ thống đang mở và kiểm tra ngầm chưa chạy.

Lỗi thật tìm được và đã sửa:

- Newtonsoft tự đổi chuỗi ngày ISO thành `DateTime` khi đọc JSON, nên add-in đọc lại ngày bắt đầu dùng thử ra rỗng và tính lại 30 ngày mỗi lần. Test đơn vị bắt được; nay đọc với `DateParseHandling.None`.
- Mở cửa sổ Hệ thống lần đầu vào thẻ Cài đặt thì thẻ trống: chọn thẻ trước khi cửa sổ hiện không phát sinh sự kiện đổi thẻ. Excel thật bắt được; nay đọc dữ liệu ở `OnShown`.

## Vấn đề còn mở

Sau khi đóng rồi mở lại workbook ngay trong lúc cửa sổ Báo giá đang mở, thẻ Làm tròn có lần hiện "Không làm tròn" dù workbook đã lưu quy tắc (mục `U1`). Đã gặp 1 lần trong 2 lượt chạy lại N5 sau N6; chạy lặp riêng 15 lần không tái hiện, và các lượt chạy ở N5 không gặp. Mã N6 không đụng đường đọc quy tắc này.

Chưa tìm ra nguyên nhân và chưa sửa. Lần gặp lỗi, part cấu hình vẫn đếm được 1 (`U3`), nhưng kịch bản không đọc lại quy tắc nên chưa xác nhận trực tiếp nội dung còn đúng, cũng chưa xác nhận chữ sai tự hết khi đổi thẻ. Nếu người dùng bấm Áp dụng đúng lúc đó, add-in hỏi xác nhận kèm số ô sẽ đổi trước khi ghi.

## Chưa kiểm tra

Danh sách đầy đủ ở [ACCEPTANCE.md](ACCEPTANCE.md): Excel 32-bit, Office 2016, DPI khác 100%, máy không có máy in, kích hoạt thành công bằng mã thật, mở trang soạn thư thật, clipboard thật (máy kiểm đang giữ dữ liệu không phải chữ nên kịch bản bỏ qua để không làm mất), máy không có mạng.

HawkScan không áp dụng: đây là add-in chạy trên máy, không có dịch vụ web để quét. Đường dẫn lấy từ mạng trước khi mở bằng trình duyệt đã được kiểm tra tiền tố, kể cả trường hợp tên miền giả (`SystemTests`).
