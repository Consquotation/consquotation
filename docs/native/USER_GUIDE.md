# Hướng dẫn sử dụng ConsQuotation trên Windows

ConsQuotation là add-in lập báo giá thi công xây dựng ngay trong Excel. Báo giá nằm trong workbook, lưu và in bằng Excel như mọi file khác.

Yêu cầu: Windows 10 hoặc 11, Excel 2016 trở lên, bản 32-bit hoặc 64-bit. Không chạy trên Excel web và Excel Mac.

## Cài đặt

1. Vào [trang phát hành](https://github.com/Consquotation/consquotation/releases), tải file `ConsQuotation-Setup-<phiên bản>.exe` của bản mới nhất.
2. Đóng Excel.
3. Chạy file vừa tải. File chưa được ký số nên Windows có thể hiện "Windows protected your PC": bấm More info, rồi Run anyway. Bộ cài không cần quyền quản trị.
4. Mở Excel: tab ConsQuotation xuất hiện trên ribbon.

Muốn kiểm tra file tải về, so mã SHA-256 của file với nội dung file `.sha256` đi kèm trên trang phát hành.

## Cập nhật và gỡ cài

Add-in hỏi trang phát hành trên GitHub tối đa 1 lần mỗi ngày. Khi có bản mới, nút Cài đặt trên ribbon đổi thành "Cài đặt (có bản mới)". Bấm nút đó, chọn Mở trang tải, tải file `.exe`, đóng Excel rồi chạy file để cài đè. Thư viện và cấp phép giữ nguyên.

Gỡ cài: Settings › Apps › ConsQuotation › Uninstall. Gỡ cài không xóa thư viện của bạn trong `%APPDATA%\ConsQuotation`.

## Dùng thử và cấp phép

Lần đầu bấm một nút của add-in, bạn được dùng thử đủ tính năng 30 ngày. Nút Bản quyền trên ribbon hiện số ngày còn lại.

Để xin cấp phép:

1. Bấm Bản quyền, chọn Soạn bằng Gmail, Soạn bằng Outlook.com hoặc Mở ứng dụng thư. Nếu không dùng các cách này, bấm Sao chép nội dung rồi dán vào hộp thư bạn đang dùng.
2. Gửi thư từ địa chỉ email của bạn. Mã cấp phép 20 ký tự được gửi lại cho đúng địa chỉ đó.
3. Nhập đúng email đã gửi và mã, bấm Kích hoạt. Bước này cần Internet.

Sang máy khác, nhập lại cùng email và mã một lần. Mã đã cấp ở bản web dùng được ở đây.

Hết 30 ngày mà chưa kích hoạt, các nút Báo giá và Thư viện chỉ mở thẻ Bản quyền, nơi bạn vẫn xin cấp phép, kích hoạt và lưu bản sao lưu thư viện. Cài đặt và Trợ giúp vẫn mở được. File Excel báo giá vẫn mở, sửa, in bình thường.

## Chuyển từ bản web

1. Ở bản web, vào Thư viện › Nhập/Xuất, tải bản sao lưu `.json`.
2. Cài bản Windows, vào Thư viện › Nhập/Xuất và sao lưu, chọn file `.json` đó để nhập. Xem trước rồi mới xác nhận.
3. Báo giá làm bằng bản web mở và làm tiếp được ở bản Windows, không cần chuyển đổi.
4. Nếu đã kích hoạt ở bản web, nhập lại email và mã một lần ở bản Windows.

Quy tắc làm tròn do bản Windows lưu không hiện ở bản web. Công thức đã ghi trên sheet vẫn đúng, nhưng dòng thêm mới từ bản web sẽ theo cấu hình của bản web.

## Lập một báo giá

1. Mở workbook, bấm Tạo bảng báo giá: trên sheet mới hoặc tại ô đang chọn. Add-in hỏi trước khi ghi vào vùng có dữ liệu. Tạo trên sheet mới là cách an toàn nhất.
2. Thông tin công trình: mã báo giá, khách hàng, dự án, địa điểm. Tất cả đều tùy chọn, có thể gõ thẳng trên sheet.
3. Thêm công tác: nhập trực tiếp, lấy từ thư viện hoặc phân tích từ định mức.
4. Công tác: xem từng dòng, phương pháp tính, nguồn giá và trạng thái; tính lại và lưu.
5. Tính giá mở thẻ Kiểm tra: danh sách lỗi và cảnh báo kèm cách sửa, nút Đi tới ô chọn đúng ô cần sửa.
6. Thẻ Tổng hợp: chiết khấu, phụ phí, thuế do bạn tự thêm, áp dụng từ trên xuống. Add-in không có tỷ lệ mặc định.
7. Thẻ Làm tròn: quy tắc cho đơn giá phân tích, thành tiền và khoản tổng hợp, áp dụng cho cả workbook. Mặc định không làm tròn.
8. In ấn mở thẻ Ghi chú: 5 mục do bạn tự nhập. Thẻ Trang in: vùng in, khổ và hướng giấy, co giãn, dòng lặp, số trang.
9. Lưu bằng Ctrl+S. Xem trước và in bằng File › Print, xuất PDF bằng File › Export.

Cửa sổ của add-in không chặn Excel: bạn vẫn sửa sheet được trong lúc cửa sổ đang mở. Add-in đọc lại dữ liệu khi bạn đổi thẻ, bấm nút hoặc quay lại cửa sổ.

## Thư viện của tôi

Thư viện gồm công tác, tài nguyên, giá theo ngày hiệu lực, định mức, danh mục và nhà cung cấp, do bạn tự tạo. Add-in không kèm sẵn dữ liệu nào.

Thư viện lưu ở `%APPDATA%\ConsQuotation\library.json`; nút Mở thư mục ở thẻ Cài đặt mở đúng nơi đó. Mỗi lần ghi, add-in giữ một bản trước đó trong file `.bak` cùng thư mục. File này không đồng bộ giữa các máy: dùng Thư viện › Nhập/Xuất và sao lưu để sao lưu ra `.json`, rồi chép tới nơi an toàn.

Chèn vào báo giá chép giá trị: sửa thư viện sau đó không làm đổi báo giá cũ.

## Lưu ý khi ghi vào workbook

- Thao tác ghi của add-in không hoàn tác được bằng Ctrl+Z. Lưu file trước những thay đổi lớn.
- Thành tiền để trống khi thiếu khối lượng hoặc đơn giá. Lỗi công thức hiện ra ở tổng, không bị đổi thành 0.
- Ô công thức bạn sửa tay được giữ nguyên khi đổi quy tắc làm tròn.
- Excel giới hạn chiều cao một hàng ở 409 pt. Ghi chú dài hơn vẫn đủ chữ trong ô nhưng phần cuối không hiện và không in được; add-in báo mục nào bị ảnh hưởng.

## Dữ liệu của bạn

Add-in không gửi workbook hay thư viện đi đâu. Add-in chỉ kết nối mạng trong hai trường hợp:

| Khi nào | Tải từ | Gửi đi |
|---|---|---|
| Bấm Kích hoạt | Danh sách cấp phép trên `consquotation.github.io`, chỉ chứa giá trị băm | Không gửi email hay mã; add-in so khớp trên máy |
| Tối đa 1 lần mỗi ngày, hoặc khi bấm Kiểm tra cập nhật | Danh sách phát hành trên `api.github.com` | Không gửi dữ liệu của bạn; yêu cầu chỉ ghi tên và phiên bản add-in |

Như mọi trang web, GitHub thấy địa chỉ IP của máy gửi yêu cầu. Không có mạng thì add-in vẫn làm việc bình thường, chỉ không kích hoạt và không kiểm tra cập nhật được.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy tab ConsQuotation | Vào File › Options › Add-ins, mục Manage chọn Disabled Items, bấm Go; nếu có ConsQuotation thì bật lại. Sau đó chạy lại bộ cài |
| Bộ cài báo Excel đang mở | Lưu công việc, đóng mọi cửa sổ Excel, bấm OK |
| Kích hoạt báo "không khớp" | Dùng đúng email đã gửi thư xin cấp phép. Mã vừa được cấp có thể cần chờ vài phút |
| Kích hoạt báo không tải được danh sách | Kiểm tra Internet; máy ở công ty có thể bị chặn `consquotation.github.io` |
| Báo file thư viện lỗi | Không xóa file. Thẻ Cài đặt có nút Mở thư mục; file `library.json.bak` là bản trước lần ghi gần nhất |

Báo lỗi kèm nội dung mục Phiên bản ở thẻ Cài đặt tại [trang Issues](https://github.com/Consquotation/consquotation/issues).
