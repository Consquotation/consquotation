# Giai đoạn N3: giao diện Thư viện

Kế hoạch: [NATIVE_PLAN.md](../NATIVE_PLAN.md). Mã: `native/src/ConsQuotation.AddIn` (thư mục `Ui`, `LibraryUi`, `Excel`) và `native/src/ConsQuotation.Core/Exchange/Xlsx.cs`. Ngày: 2026-11-02.

## Cửa sổ Thư viện

Các nút Thư viện trên ribbon mở một cửa sổ nổi "Thư viện của tôi – ConsQuotation". Cửa sổ này không chặn Excel: trong lúc nó mở, kể cả khi đang mở hộp thoại sửa công tác, người dùng vẫn gõ được vào sheet. Mỗi phiên Excel chỉ có một cửa sổ Thư viện; bấm nút khác chỉ chuyển sang thẻ tương ứng.

| Nút ribbon | Thẻ mở sẵn |
|---|---|
| Thư viện của tôi | Công tác |
| Tài nguyên | Tài nguyên |
| Định mức | Định mức |
| Quản lý › Danh mục | Danh mục (nhóm, nhà cung cấp) |
| Quản lý › Kiểm tra thư viện | Kiểm tra |
| Quản lý › Nhập/Xuất và sao lưu | Nhập/Xuất |

Phần đầu cửa sổ có tên thư viện (đổi được), số bản ghi, lần cập nhật gần nhất, nơi lưu file và lời nhắc sao lưu. Thanh trạng thái ở đáy báo thao tác vừa làm ("Đã lưu "BT01"."). Khi cửa sổ được kích hoạt lại, add-in đọc lại file nếu một cửa sổ Excel khác vừa sửa thư viện.

Cách chạy: cửa sổ dùng một luồng giao diện riêng (STA, vòng lặp thông điệp WinForms), chủ sở hữu là cửa sổ Excel nên luôn nằm trên Excel và thu nhỏ theo Excel. Phím Tab, Enter, Esc chạy như hộp thoại Windows thường. Mọi lệnh đọc/ghi workbook đi qua `ExcelBridge` (`ExcelAsyncUtil.QueueAsMacro`) để chạy trên luồng chính của Excel. Lỗi không bắt ở luồng giao diện hiện hộp thông báo thay vì làm sập Excel.

## Các thẻ và hộp thoại

| Bản web | Bản Windows |
|---|---|
| `LibraryView.tsx` | `LibraryWindow.cs` (`LibraryForm`) |
| `WorkItemsPanel.tsx`, `WorkItemEditor.tsx` | `Pages.cs` (`WorkItemsPage`), `Dialogs.cs` (`WorkItemDialog`) |
| `ResourcesPanel.tsx`, `ResourceEditor.tsx` | `ResourcesPage`, `ResourceDialog`, `PriceDialog` |
| `NormsPanel.tsx`, `NormEditor.tsx` | `NormsPage`, `NormDialog.cs` |
| `CatalogPanel.tsx` | `CatalogPage`, `CategoryDialog`, `SupplierDialog` |
| `LibraryCheckPanel.tsx` | `CheckPage` |
| `ExchangePanel.tsx`, `ImportSection.tsx`, `ImportReview.tsx` | `ExchangePage.cs` |
| `ListFilters.tsx`, `common.tsx`, `newRefs.ts` | `FilterBar`, `Ux.cs`, `NewRefs` |
| `strings.library.vi.ts`, `strings.norms.vi.ts`, `strings.exchange.vi.ts` | `Strings.cs` |

Danh sách dùng ListView ảo (chỉ dựng dòng đang hiện), nên không cần nút "Xem thêm" như bản web. Nháy đúp hoặc Enter để sửa, phím Delete để xóa. Lỗi kiểm tra dữ liệu hiện ngay dưới từng ô nhập, chữ y như bản web. Ô ngày có hộp đánh dấu: bỏ đánh dấu là không ghi ngày.

Hộp thoại tài nguyên mới lưu xong vẫn mở để thêm giá ngay (như bản web). Hộp thoại định mức gồm thông tin phiên bản, nút đổi trạng thái, danh sách thành phần (chọn một dòng để sửa, đổi thứ tự, chọn giá áp dụng), ô thêm thành phần và kết quả tính đơn giá. Thẻ Kiểm tra: nháy đúp một dòng để mở bản ghi liên quan.

## Nhập/Xuất

Thẻ Nhập/Xuất chia hai cột: sao lưu và xuất bên trái, nhập bên phải.

- Lưu bản sao lưu .json: hộp thoại Lưu của Windows, mặc định thư mục Downloads và tên `ConsQuotation-thu-vien-yyyy-MM-dd-HHmm.json` như bản web. Nội dung do `Backup.ToBackupJson` dựng (đã đối chiếu với bản web ở N2).
- Xuất ra workbook Excel, Mở file mẫu trống: add-in dựng file .xlsx bằng `Xlsx.Build` (chuyển từ `src/shared/xlsx.ts`) rồi mở bằng `Workbooks.Add(file)`, nên Excel tạo workbook mới chưa lưu (ThuVien1, MauThuVien1), giống `Excel.createWorkbook` của bản web. Chữ ghi dạng inline string nên "007" và "=SUM(A1)" giữ nguyên là chữ.
- Nhập: file .json/.csv, một sheet hoặc một Excel Table của workbook đang mở, hoặc cả bản xuất thư viện (nhận ra qua sheet "Thông tin"). Luôn qua bước xem trước, map cột, kiểm tra; chỉ ghi khi người dùng bấm Nhập trong hộp xác nhận. Trước khi ghi, add-in phân tích lại trên thư viện mới đọc; khác kết quả đã hiện thì dừng và báo.

Đọc sheet qua COM: vùng đọc là vùng có giá trị hoặc công thức (tìm bằng `Range.Find`), không dùng `UsedRange` vì nó gồm cả ô chỉ có định dạng. Ô số giữ chữ hiển thị (mã "007" định dạng "000"), ô Excel hiểu là ngày đổi sang ngày ISO, ô lỗi (#N/A) lấy chữ hiển thị.

Trong lúc đang đọc Excel, các nút của thẻ bị làm mờ. Lần kiểm đầu trên Excel thật cho thấy nếu không làm mờ, cú bấm lúc thẻ đang tải lại danh sách sheet bị bỏ qua mà người dùng không biết.

## Kiểm thử

`dotnet test native/ConsQuotation.sln`: 226 test đạt (196 của N0–N2, 30 mới).

| File test | Nội dung |
|---|---|
| `XlsxTests.cs` | Mọi phần XML của file .xlsx giống hệt file do `buildXlsx` của bản web sinh từ cùng nội dung (`Fixtures/web-export.xlsx`); chữ không thành công thức; ký tự điều khiển; ô quá 32.767 ký tự |
| `LibraryUiTests.cs` | Dựng thật các hộp thoại và thẻ trên luồng STA với file thư viện tạm, thay hộp xác nhận và Excel bằng bản giả, rồi kiểm dữ liệu ghi xuống file: lưu công tác kèm nhóm mới, lỗi từng ô, cảnh báo trùng tên, tìm không dấu, sao chép, xóa; tài nguyên và giá; định mức (thêm thành phần, tính đơn giá, duyệt, khóa, sao chép phiên bản); xóa nhóm đang dùng; sao lưu .json; xuất workbook; nhập CSV, file sao lưu của bản web, sheet, sheet quá lớn; thư viện đổi giữa chừng; file thư viện hỏng |
| `LibraryStoreTests.cs` | Thêm: nơi lưu mặc định và biến `CONSQUOTATION_LIBRARY` |

Đã thử bỏ bước phân tích lại trước khi ghi trong `ImportReviewPanel`: test "thư viện đổi giữa chừng" báo lỗi; trả lại thì đạt.

## Kiểm trên Excel thật

Excel 64-bit (Microsoft 365, 16.0) trên máy phát triển, ngày 2026-11-02. Mỗi lần chạy mở một phiên Excel riêng (`excel.exe /x`), nạp `ConsQuotation64-packed.xll` bằng `RegisterXLL`, không ghi registry. Biến `CONSQUOTATION_LIBRARY` trỏ thư viện vào thư mục tạm, nên thư mục `%APPDATA%\ConsQuotation` của người dùng không bị tạo. Nút ribbon được bấm bằng UI Automation; control trong cửa sổ add-in được điều khiển bằng MSAA và thông điệp Win32.

Kết quả lần chạy cuối: 42/42 điểm kiểm đạt.

| Nhóm | Điểm kiểm |
|---|---|
| Mở cửa sổ | Mở từ nút "Thư viện của tôi", đúng thẻ Công tác; số liệu và nơi lưu đúng; chỉ xem thì không tạo file |
| Không chặn Excel | Lệnh COM vào Excel trả lời sau 15–43 ms khi cửa sổ Thư viện mở, 2–7 ms khi hộp thoại sửa công tác đang mở |
| Công tác | Bấm Lưu khi trống: hộp thoại không đóng, hiện "Nhập mã công tác.", "Nhập đơn vị tính." dưới ô; nhập đủ rồi lưu: file có BT01, đơn giá 1250000.5, danh sách và số liệu cập nhật, có lời nhắc sao lưu |
| Ribbon | Nút "Tài nguyên" và "Quản lý › Nhập/Xuất và sao lưu" dùng lại cùng cửa sổ, chuyển đúng thẻ |
| Nhập từ sheet | Danh sách sheet của workbook đang mở; xem trước 2 bản ghi; hộp xác nhận; ghi xong mã "007" vẫn là "007" |
| Nhập từ Excel Table | Bảng giá có ô ngày định dạng dd/mm/yyyy: giá 350000.5 gắn đúng tài nguyên "007", ngày 2026-01-15 |
| Xuất workbook | Workbook mới chưa lưu (ThuVien1), 8 sheet đúng tên và thứ tự như bản web, mã "007" là chữ, cột định dạng @, giá là số, ghi mốc sao lưu và hết lời nhắc |
| Bản xuất của bản web | Mở workbook xuất từ bản web 1.13.1: nhận ra bản xuất, xem trước 11 bản ghi, nhập đủ định mức và thành phần |
| Định mức | Thẻ Định mức có danh sách; tạo định mức mới, hộp thoại chuyển sang phiên bản vừa tạo và hiện phần thành phần, kết quả tính |
| Kiểm tra, đóng | Thẻ Kiểm tra liệt kê "0 lỗi · 3 cảnh báo"; đóng cửa sổ; `%APPDATA%\ConsQuotation` không bị tạo |

Kiểm bằng ảnh chụp: ô chọn sheet hiện "NhapThu (3 dòng × 4 cột)" dù sheet có ô K40 chỉ tô màu (vùng đọc bỏ qua ô chỉ có định dạng); thanh trạng thái hiện "Đã lưu "BT01"."; bố cục các thẻ và hộp thoại.

Thoát Excel: mở phiên Excel riêng, nạp add-in, đóng Excel bằng nút X (WM_CLOSE). Không mở cửa sổ Thư viện: Excel thoát sau 2,6–3,3 giây. Cửa sổ Thư viện đang mở: 2,9 giây. Mở rồi đóng cửa sổ: 4,9–7,5 giây. Không lần nào Excel bị treo.

Lỗi tìm ra khi kiểm trên Excel thật và đã sửa:

1. Bấm nút trong thẻ Nhập/Xuất lúc thẻ đang đọc Excel bị bỏ qua không báo: nay làm mờ các nút trong lúc bận.
2. Phần nhập bị đẩy xuống dưới phần sao lưu, phải cuộn mới thấy bước xem trước: nay xếp hai cột.
3. Ô ngày trong hộp thoại công tác có khoảng trống lớn bên dưới; hàng bộ lọc ở thẻ Tài nguyên có khoảng trống trên và dưới; dòng "1 mục" nhảy lên trên ô tìm kiếm khi thư viện từ trống sang có dữ liệu. Nguyên nhân là cách TableLayoutPanel đo chữ tự xuống dòng và giữ vị trí ô cũ. Nay dòng gợi ý/lỗi xuống dòng ở bề rộng cố định, hàng bộ lọc không xuống dòng, hàng của mỗi control được gán theo thứ tự.

Chưa thử: Excel 32-bit, Office 2016 (để sau theo yêu cầu), màn hình DPI khác 100%.

## Khác bản web

- Nút "Chèn vào báo giá" ở thẻ Công tác và "Xuất bảng diễn giải ra Excel" trong định mức thuộc phần báo giá, làm ở N4.
- Cảnh báo "thư viện trống nhưng workbook từng dùng thư viện" cần dấu ghi trong workbook báo giá, làm ở N4.
- Bản sao lưu .json lưu qua hộp thoại Lưu của Windows (bản web tải về Downloads); thông báo ghi rõ đường dẫn đã lưu.
- Một số câu đổi theo nơi lưu mới: câu nói về IndexedDB, cache Office, "task pane khác" đổi thành file trên máy, máy hỏng/cài lại Windows, "cửa sổ Excel khác". Vài câu thay dấu gạch dài bằng dấu hai chấm hoặc chấm phẩy.
- Biến môi trường `CONSQUOTATION_LIBRARY` (đường dẫn file thư viện) dùng cho kiểm thử; người dùng thường không đặt.
- Thêm `AccessibleName` cho ô nhập theo nhãn, để trình đọc màn hình đọc đúng tên ô.

## Để lại cho N4

- Chèn công tác từ thư viện vào bảng báo giá; phân tích đơn giá từ định mức trong báo giá; bảng diễn giải định mức.
- Dấu "workbook đã dùng thư viện" và cảnh báo khi thư viện trên máy trống.
