# Kế hoạch chuyển ConsQuotation sang add-in Windows (.NET, Excel-DNA)

Trạng thái: N0 đến N6 đã làm xong trên máy kiểm chính (Excel 64-bit). Còn lại trước khi phát hành `v2.0.0`: các mục chạy tay trong [bộ kịch bản nghiệm thu](native/ACCEPTANCE.md). Quyết định của chủ sản phẩm ngày 2026-11-01:
- cài bằng file .exe tải từ GitHub Releases của repo `Consquotation/consquotation`;
- giao diện và icon kiểu cổ điển của Excel;
- viết lại thành add-in Windows thuần (hướng B);
- chưa ký số file .exe, chấp nhận cảnh báo SmartScreen.

## Kiến trúc đề xuất

| Phần | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ, nền | C#, .NET Framework 4.8 | Có sẵn trên Windows 10/11; người dùng không phải cài thêm runtime |
| Nạp vào Excel | Excel-DNA (file .xll, bản 32-bit và 64-bit) | Miễn phí, mã nguồn mở, hỗ trợ ribbon tùy biến và Excel 2007 trở lên |
| Ribbon | Ribbon XML, icon có sẵn của Office (`imageMso`) | Đúng icon của Excel |
| Hộp thoại | WinForms | Cửa sổ Windows thật, kiểu cổ điển, không chặn Excel |
| Thao tác workbook | Excel COM object model | Không qua mạng, chạy được cả Office bản volume |
| Bộ cài | Inno Setup, cài cho người dùng hiện tại (không cần quyền admin) | Tự nhận Excel 32/64-bit và đăng ký đúng file .xll; gỡ cài sạch |
| Phát hành | GitHub Actions: gắn tag `vX.Y.Z` thì build, chạy test, đóng gói, đăng Release kèm `ConsQuotation-Setup-X.Y.Z.exe` và mã SHA-256 | Link tải cố định trên trang Releases |
| Cập nhật | Add-in hỏi GitHub Releases mỗi ngày tối đa 1 lần, báo khi có bản mới | Người dùng tự tải và cài đè |

## Dữ liệu và tương thích với bản web

- **Thư viện** lưu thành file JSON trong `%APPDATA%\ConsQuotation\`, cùng định dạng sao lưu schema v3 hiện nay. Mỗi lần ghi, add-in ghi ra file tạm rồi mới thay file chính, và giữ một bản trước đó. Không còn mất thư viện khi xóa cache Office.
- **Chuyển thư viện từ bản web:** tải bản sao lưu .json ở bản web, nhập vào bản mới.
- **Workbook báo giá** giữ nguyên định dạng: mẫu 14 cột, sheet "Phân tích đơn giá", hồ sơ báo giá trong Custom XML Part `urn:consquotation:quotation`. Báo giá làm bằng bản web mở và làm tiếp được ở bản mới.
- **Cấp phép** giữ cơ chế email cộng mã 20 ký tự và danh sách `licenses.json`. Mã đã cấp vẫn dùng được; lệnh `npm run license:grant` giữ nguyên.

## Giai đoạn

| # | Nội dung | Ước lượng | Kiểm chứng |
|---|---|---|---|
| N0 | Khung dự án, add-in nạp được, ribbon 5 nhóm với icon Excel, bộ cài, quy trình Release; phát hành thử `v2.0.0-alpha.1` | 2–3 ngày | Tải từ Releases, cài trên máy thật, SmartScreen, gỡ cài |
| N1 | Nghiệp vụ: mô hình thư viện, kiểm tra hợp lệ, định mức, bộ máy tính đơn giá (số thập phân), làm tròn, cấp phép | 1 tuần | Chuyển các unit test tương ứng của bản web sang xUnit |
| N2 | Lưu trữ và nhập/xuất: JSON v3, CSV, file mẫu, xuất workbook | 1 tuần | Nhập bản sao lưu thật của bản web, so khớp |
| N3 | Giao diện Thư viện: công tác, tài nguyên, giá, định mức, danh mục, kiểm tra | 1–2 tuần | Excel thật |
| N4 | Báo giá: tạo mẫu, thông tin, thêm công tác, hồ sơ từng dòng, tính lại | 2 tuần | Mở báo giá làm bằng bản web |
| N5 | Tính giá, tổng hợp chiết khấu/thuế, làm tròn, in ấn | 1–2 tuần | Excel thật |
| N6 | Cấp phép, kiểm tra cập nhật, kiểm thử tổng thể (Excel 32/64-bit), tài liệu, phát hành `v2.0.0` | 1 tuần | Bộ kịch bản nghiệm thu |

Tổng cộng khoảng 7–10 tuần làm việc. Mỗi giai đoạn chạy cổng kiểm tra (build, test) và kiểm trên Excel thật trước khi báo xong.

## Bản web trong thời gian chuyển đổi

- Giữ chạy trên GitHub Pages cho người đang dùng cho tới khi phát hành `v2.0.0`. Sau đó bản web hiện thông báo hướng dẫn chuyển sang bản cài đặt.
- Mã .NET nằm trong thư mục mới `native/` của cùng repo; mã web giữ nguyên chỗ cũ cho tới khi ngừng.

## Mất đi so với bản web

- Excel trên web và Mac.
- Tự cập nhật ngầm: người dùng phải tải và cài bản mới (add-in có báo).
- Thao tác ghi của add-in vẫn không hoàn tác được bằng Ctrl+Z, giống bản web.
