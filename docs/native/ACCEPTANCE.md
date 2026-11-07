# Bộ kịch bản nghiệm thu bản Windows

Dùng trước khi phát hành `v2.0.0` và lặp lại cho mỗi bản lớn sau đó. Máy kiểm chính: Windows 11, Excel Microsoft 365 64-bit, bản 16.0.20527, DPI 100%, ngày 2026-11-07.

Dữ liệu thử chỉ dùng số giả định; không dùng thư viện hay báo giá thật. Khi kiểm tự động, đặt `CONSQUOTATION_LIBRARY` trỏ tới thư mục tạm: license.json và update-check.json cũng theo thư mục đó.

## Đã chạy tự động trên máy kiểm chính

| Nhóm | Kịch bản | Kết quả |
|---|---|---|
| Lần đầu | Chưa bấm gì thì chưa tính dùng thử; bấm lần đầu thì tính 30 ngày, nút ribbon đổi nhãn | Đạt |
| Cập nhật | Hỏi GitHub thật sau 10 giây; bản thử được báo bản cao hơn; bản chính thức không được báo bản thử | Đạt |
| Cập nhật | Mở lại trong ngày không hỏi lại, nút ribbon vẫn báo; quá 24 giờ thì hỏi lại; kiểm tra tay; bấm Mở trang tải không báo lỗi | Đạt |
| Cấp phép | Email sai, mã sai dạng, mã đúng dạng nhưng không có trong danh sách thật | Đạt |
| Hết hạn | 6 nút Báo giá và Thư viện đều vào thẻ Bản quyền; không mở Báo giá, Thư viện; Cài đặt và Trợ giúp vẫn mở | Đạt |
| Hết hạn | Lưu bản sao lưu qua hộp thoại thật, đủ công tác; workbook vẫn sửa được bằng Excel | Đạt |
| Đã cấp phép | Quá 30 ngày vẫn dùng được; không còn form kích hoạt (dữ liệu giả, không dùng mã thật) | Đạt |
| File hỏng | license.json và update-check.json hỏng: ribbon nạp bình thường, file hợp lệ trở lại | Đạt |
| Đang sửa ô | Kiểm tra ngầm xong khi đang sửa ô: Excel không treo, hết sửa ô thì nhãn cập nhật | Đạt |
| Thoát Excel | Cửa sổ Hệ thống đang mở, kiểm tra ngầm chưa chạy: thoát khoảng 3 giây | Đạt |
| Bộ cài | Cài, 2 file .xll, thêm đúng mục OPEN, giữ add-in khác theo thứ tự, Excel tự nạp, cài đè không trùng, gỡ, registry như cũ | Đạt |
| Báo giá | Toàn bộ kiểm tra N4 và N5 trên cùng bản | N4 đạt; N5 có 1 mục lúc đạt lúc không, xem [N6_RELEASE.md](N6_RELEASE.md) |
| 32-bit | Toàn bộ test đơn vị trong tiến trình 32-bit; file `ConsQuotation.xll` là PE x86, nạp được bằng LoadLibrary trong tiến trình 32-bit, có `xlAutoOpen` | Đạt, nhưng không thay cho Excel 32-bit |

## Cần chạy tay trước khi phát hành

Các mục này chưa chạy lần nào. Điền kết quả, máy và ngày vào cột cuối.

| # | Môi trường | Việc cần làm | Đạt khi | Kết quả |
|---|---|---|---|---|
| 1 | Excel 32-bit | Chạy bộ cài | Registry trỏ `ConsQuotation.xll`, tab ConsQuotation hiện | |
| 2 | Excel 32-bit | Thẻ Cài đặt | Mục Phiên bản ghi 32-bit | |
| 3 | Excel 32-bit | Tạo báo giá, thêm công tác từ định mức, Tổng hợp, Làm tròn, Ghi chú, Trang in, xuất PDF | Số tiền đúng theo tính tay, PDF đủ nội dung | |
| 4 | Office 2016 | Như mục 3 | Không có lỗi "add-in không đọc được dữ liệu"; công thức STT và Thành tiền tính đúng | |
| 5 | Office 2016 | Xem ribbon | Đủ icon (tên icon mới kiểm trên Excel 16.0.20527) | |
| 6 | DPI 125% và 150% | Mở 3 cửa sổ, xem mọi thẻ | Không có chữ bị cắt, nút chồng nhau | |
| 7 | Không có máy in mặc định | Thẻ Trang in | Báo rõ cần máy in, không lỗi lạ | |
| 8 | Có mã thật | Bản quyền: nhập email và mã đã được cấp, bấm Kích hoạt | Báo đã kích hoạt, nút đổi thành Đã cấp phép, mở lại Excel vẫn vậy | |
| 9 | Bất kỳ | Bấm Soạn bằng Gmail, Soạn bằng Outlook.com, Mở ứng dụng thư | Trang soạn thư mở đúng người nhận, tiêu đề, nội dung tiếng Việt có dấu | |
| 10 | Bất kỳ | Sao chép nội dung rồi dán vào Notepad | Đúng nội dung thư | |
| 11 | Tắt mạng | Bấm Kích hoạt, Kiểm tra cập nhật; mở lại Excel | Báo cần Internet, không treo; tính năng khác vẫn chạy | |
| 12 | Máy có Excel và bản web | Mở báo giá có bảng tổng hợp và ghi chú do bản Windows tạo, bằng bản web | Đọc được hồ sơ, không báo lỗi | |
| 13 | Máy sạch | Tải bộ cài từ Releases, chạy qua cảnh báo SmartScreen, gỡ cài | Đúng các bước trong [USER_GUIDE.md](USER_GUIDE.md) | |
| 14 | Có bản cũ | Đang cài `v2.0.0-alpha.3`, cài đè bản mới | Thư viện và thời hạn dùng thử giữ nguyên | |

Các mục 1 đến 5 cần máy có Excel 32-bit và Office 2016, chưa có trên máy kiểm chính.
