# Giai đoạn N4: báo giá

Kế hoạch: [NATIVE_PLAN.md](../NATIVE_PLAN.md). Mã: `native/src/ConsQuotation.Core/Quotation`, `native/src/ConsQuotation.AddIn/QuoteUi`, `native/src/ConsQuotation.AddIn/Excel/QuoteGateway.cs`. Ngày: 2026-11-06.

## Cửa sổ Báo giá

Năm nút ribbon mở một cửa sổ nổi "Báo giá – ConsQuotation", không chặn Excel, chạy trên cùng luồng giao diện với cửa sổ Thư viện.

| Nút ribbon | Thẻ mở sẵn | Bản web |
|---|---|---|
| Mở ConsQuotation | Tổng quan: workbook, bảng báo giá, tình trạng từng bước | `WorkflowPanel`, `QuoteTablesPanel` |
| Tạo bảng báo giá | Tạo bảng: sheet mới hoặc tại ô chọn | `CreateQuotePanel` |
| Thông tin công trình | Thông tin: 10 mục phía trên bảng | `QuoteInfoPanel` |
| Thêm công tác | Thêm công tác: nhập tay, từ thư viện, phân tích định mức | `AddWorkItemPanel`, `CompositionPicker` |
| Công tác | Công tác: trạng thái từng dòng, tính lại và lưu, hoàn tất, cập nhật theo thư viện | `QuotationItemsView` |

Cửa sổ Thư viện có thêm nút "Chèn vào báo giá" ở thẻ Công tác (điền sẵn thẻ Thêm công tác) và nút "Xuất bảng diễn giải ra Excel" trong hộp thoại định mức (ghi sheet mới, có công thức để đối chiếu). Thư viện trống mà workbook đang mở từng dùng thư viện thì hiện lời nhắc khôi phục.

Tính giá, bảng tổng hợp, quy tắc làm tròn, in ấn thuộc N5; nút Tính giá và In ấn vẫn báo "đang chuyển".

## Tương thích với bản web

Tên bảng, tên cột, công thức, định dạng XML của hồ sơ và vân tay nội dung giữ nguyên, nên workbook tạo ở bản nào cũng mở được ở bản kia.

- Công thức, vân tay `contentFingerprint`, hàm băm, cách ghi số kiểu JavaScript được đối chiếu với kết quả do chính mã nguồn web sinh ra (`native/tests/ConsQuotation.Tests/Fixtures/web-quotation.json`). Mục đích: báo giá hoàn tất ở bản web vẫn là "Đã hoàn tất" ở bản này. File mẫu q17 đang ở trạng thái Nháp nên chưa đo trên một workbook hoàn tất thật do bản web lưu.
- Hồ sơ của bản web đọc được ở bản native; hồ sơ bản native ghi vào workbook thật được `decodeRecord` của bản web đọc được (đã chạy thử một lần trên file `test-n4.xlsx`).
- Mở bản sao `q17-reopen.xlsx` (báo giá làm bằng bản web): đọc đúng dòng, hồ sơ, trạng thái Nháp, tổng 646.702,5; chỉ xem thì hồ sơ không đổi.

`workbook.settings` của Office.js nằm trong vùng lưu của webextension, COM không đọc được. Vì vậy:

| Cấu hình | Bản web | Bản native |
|---|---|---|
| Quy tắc làm tròn | settings `ConsQuotation.pricing` | Custom XML `urn:consquotation:settings` (N5 sẽ ghi); chưa có thì suy từ công thức Thành tiền và Đơn giá công tác trên sheet |
| Đã dùng thư viện | settings `ConsQuotation.libraryUsed` | Cùng part đó; chưa có thì suy từ `source` của các mục trong hồ sơ |
| `quoteTables` | settings | Không dùng (bản web cũng không đọc lại) |

Bản web không biết part `urn:consquotation:settings` và bỏ qua nó.

## Điểm khác với Office.js

- `Range.Formula` qua COM làm Excel có mảng động hiện `=ROW()-@ROW(...)`. Add-in ghi bằng `Formula2` như Office.js; Excel 2016 không có `Formula2` thì dùng `Formula` (nhánh này chưa chạy thử trên Office 2016).
- `ListObjects.Add` qua COM tự co giãn cột theo tiêu đề. Tạo tại ô chọn trên sheet có sẵn thì add-in trả lại độ rộng cột cũ của người dùng.
- COM không có `setXml` cho Custom XML: add-in thêm part mới, thành công mới xóa part cũ, rồi đọc lại để chắc đã lưu đúng.
- `NumberFormat` đọc qua IDispatch trả theo vùng miền của máy (`#.##0` trên máy dùng dấu chấm hàng nghìn), dù ghi bằng mã en-US vẫn đúng. N5 cần lưu ý khi so định dạng tiền.
- Chỉ đọc dữ liệu không xóa lịch sử Ctrl+Z của người dùng (đo bằng nút Undo trước và sau khi add-in đọc). Lệnh ghi của add-in không hoàn tác được; các hộp xác nhận ghi rõ điều này.

Kiểm tra và ghi nằm trong cùng một lượt macro trên luồng Excel. Vân tay vùng đích, giá trị cũ của từng ô và điều kiện nhận diện dòng được đối chiếu ngay trước khi ghi; khác thì dừng, không ghi gì, và báo để người dùng xem lại.

Add-in không dò Excel theo chu kỳ. Dữ liệu đọc lại khi mở thẻ, khi bấm nút và khi quay lại cửa sổ. Thẻ Thông tin đang có chữ chưa lưu thì không đổi bảng theo vùng chọn, để không mất chữ đang gõ. Lệnh từ cửa sổ Thư viện (xuất diễn giải) ghi vào workbook đang mở trên cùng.

## Kiểm tra

Dữ liệu thử là số giả định, không phải định mức hay đơn giá thực tế.

`dotnet test`: 298 test đạt ở cả Debug và Release (226 ở N3, thêm 72: chuyển từ `quotation.test.ts`, `quoteService.test.ts`, `quoteTemplate.test.ts`, `naming.test.ts`, `workItemDraft.test.ts`, đối chiếu fixture web, giao diện các thẻ).

Excel 64-bit thật, phiên riêng (`excel.exe /x`), workbook và thư viện ở thư mục tạm, không ghi registry. Bản Release: 127/128 mục đạt; mục còn lại (L1, Ctrl+Z) lần chạy đó không đưa được Excel lên trước nên chưa đo, chạy riêng trên cùng bản Release thì đạt. Các nhóm mục:

| Nhóm | Nội dung |
|---|---|
| A, B | Mở từ ribbon; tạo trên sheet mới: vị trí, cột, công thức, dòng tổng, định dạng, cột Mã dòng ẩn; so kiểu Table và độ rộng cột với bảng do bản web tạo (lệch tối đa 0,8 pt) |
| C | Tạo tại ô chọn: xác nhận, hủy, mốc dưới bảng về đúng vị trí, ghi đè, sheet đổi trong lúc xác nhận thì không ghi; chặn ô gộp, sheet bảo vệ, chồng Table |
| D | Thông tin: ngày sai, hiệu lực trước ngày lập, chữ "007" giữ nguyên, ngày thành số ngày Excel, sheet đổi thì giữ chữ đang sửa |
| E | Nhập tay: lỗi từng ô, bấm đúp không tạo dòng trùng, ghi vào dòng trống, dưới dòng chọn, chèn giữa bảng, đẩy dữ liệu dưới bảng khi đã xác nhận |
| F, G | Từ thư viện và phân tích định mức: tìm không dấu, chụp nguồn và giá vào hồ sơ, đơn giá do Excel tính (61.000), đơn giá thành phần, dùng lại phân tích có sẵn |
| H | Tính lại và lưu, chặn hoàn tất, hoàn tất, sửa sau hoàn tất, dòng gõ tay, dòng sao chép, dòng xóa, cập nhật theo thư viện (65.200), lưu rồi mở lại không sinh thêm part |
| I | Mở báo giá do bản web tạo |
| J | Xuất bảng diễn giải: công thức khớp kết quả add-in |
| K | Bảng cũ 9 cột: chặn khi có dữ liệu bên phải, bổ sung cột, ẩn cột Mã dòng |
| L, X | Ctrl+Z sau khi đọc; đang sửa ô thì thẻ chờ và chạy tiếp sau khi thoát sửa ô; Excel thoát trong 2,7 giây khi cửa sổ Báo giá đang mở |
| M | Đóng hết workbook: báo rõ, tạo bảng báo lỗi tiếng Việt |

Lỗi thật tìm được khi kiểm trên Excel và đã sửa:

- Gọi `Application.TypeName` (hàm của VBA, COM không có) làm việc đọc vùng chọn luôn lỗi.
- Dấu `@` trong công thức STT khi ghi bằng `Range.Formula`.
- Tạo bảng tại ô chọn làm đổi độ rộng cột của người dùng.
- Xuất diễn giải từ cửa sổ Thư viện ghi nhầm vào workbook vừa liệt kê thay vì workbook đang mở.
- Cú bấm rơi đúng lúc cửa sổ đang tải lại danh sách bảng bị bỏ qua; nay chờ tải xong rồi chạy.

## Chưa kiểm tra

Excel 32-bit, Office 2016, DPI khác 100%: để cuối kế hoạch (N6). Mở báo giá do bản native tạo trong bản web chạy thật: mới kiểm ở mức định dạng (công thức, tên cột, `decodeRecord`). Workbook hoàn tất thật do bản web lưu: mới đối chiếu thuật toán vân tay bằng fixture.
