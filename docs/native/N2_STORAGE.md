# Giai đoạn N2: lưu trữ thư viện và nhập/xuất

Kế hoạch: [NATIVE_PLAN.md](../NATIVE_PLAN.md). Mã: `native/src/ConsQuotation.Core` (thư mục `Storage`, `Exchange`, file `Library/LibraryService.cs`). Ngày: 2026-11-02.

## Lưu thư viện trên máy

Bản web lưu thư viện trong IndexedDB của task pane; xóa cache Office là mất. Bản Windows lưu thành một file:

```
%APPDATA%\ConsQuotation\library.json       thư viện hiện tại
%APPDATA%\ConsQuotation\library.json.bak   bản trước lần ghi gần nhất
```

File có `format: "consquotation-library-store"`, `schemaVersion: 3`, phần `settings` (tên thư viện, mốc sao lưu) và phần `library` cùng tên trường, cùng cách ghi số và giá trị liệt kê với file sao lưu của bản web. Mỗi thao tác lưu, xóa, nhập:

1. giữ khóa dùng chung toàn máy (Mutex theo đường dẫn file), để hai cửa sổ Excel không ghi đè nhau;
2. đọc lại file mới nhất, áp thay đổi;
3. ghi ra `library.json.tmp`, rồi thay file chính bằng `File.Replace` (file cũ thành `.bak`).

Lần đọc cũng giữ khóa: khi chưa giữ khóa, test đọc trong lúc luồng khác đang ghi gặp lỗi "file đang bị dùng" và "không tìm thấy file". Lỗi tạm do chương trình khác mở file (diệt virus, đồng bộ đám mây) được thử lại 5 lần.

Add-in không ghi đè file trong ba trường hợp, chỉ báo lỗi tiếng Việt để người dùng khôi phục: file hỏng (JSON sai), file không phải thư viện ConsQuotation (thiếu hoặc sai `format`), file của phiên bản mới hơn (`schemaVersion` > 3). Chỉ mở xem (nút Trợ giúp) không tạo file.

## Đã chuyển từ bản web

| Bản web (TypeScript) | Bản Windows (C#) |
|---|---|
| `application/libraryService.ts` | `Library/LibraryService.cs` |
| `storage/indexedDbLibraryRepository.ts` | `Storage/LibraryStore.cs` (file JSON thay IndexedDB) |
| `domain/library/exchange/schema.ts` | `Exchange/Schema.cs` |
| `domain/library/exchange/cells.ts` | `Exchange/Cells.cs` |
| `domain/library/exchange/csv.ts` | `Exchange/Csv.cs` |
| `domain/library/exchange/source.ts` | `Exchange/Source.cs` |
| `domain/library/exchange/backup.ts` | `Exchange/Backup.cs` (sao lưu JSON, nội dung các sheet xuất) |
| `domain/library/exchange/analyze.ts` | `Exchange/Analyze.cs` |

Thông báo lỗi, tên sheet, tiêu đề cột và nhãn (Vật liệu, Đang dùng, Có/Không…) giữ nguyên từng ký tự.

## Kiểm thử

`dotnet test native/ConsQuotation.sln`: 196 test đạt (112 của N0–N1, 84 mới).

| File test C# | Nội dung |
|---|---|
| `LibraryStoreTests.cs` | Ghi/đọc lại, `.bak`, file hỏng/lạ/mới hơn không bị ghi đè, thao tác lỗi giữa chừng không đổi file, 4 luồng × 25 lần ghi không mất bản ghi, đọc trong lúc ghi |
| `LibraryServiceTests.cs` | Phần dịch vụ của `libraryStorage.test.ts`, `libraryV2.test.ts`, `norms.test.ts` |
| `ExchangeTests.cs` | `libraryExchange.test.ts` và phần nhập của `libraryV2.test.ts` |

Đối chiếu với bản web bằng chính mã của bản web: `toBackupJson` và `exportSheets` của bản web chạy trên cùng thư viện thử, kết quả lưu trong `native/tests/ConsQuotation.Tests/Fixtures/`. Test C# kiểm tra:

- file sao lưu do bản Windows ghi giống hệt file của bản web (so cây JSON, cả thứ tự khóa cấp trên);
- đọc file sao lưu của bản web vào thư viện trống cho lại đúng mọi bản ghi, kể cả id, thời điểm và giá áp dụng đã chọn;
- nội dung 8 sheet xuất giống hệt bản web.

Đã thử sửa một giá trị trong bản sao file đối chiếu: 3 test trên báo lỗi, chép lại bản gốc thì đạt.

File sao lưu thật: 4 file người dùng đã xuất từ bản web (21/10 đến 26/10/2026; 3 file schema 1, 1 file schema 2; tới 7 công tác, 5 giá, 2 định mức). Mỗi file được đọc và phân tích (nhập vào thư viện trống) bằng mã bản web và mã C#, rồi so toàn bộ kết quả: thống kê, danh sách lỗi, mọi bản ghi sẽ nhập kể cả id cấp mới. Cả 4 file: 0 lỗi, kết quả giống hệt. Phép so này chạy một lần bằng test tạm, không đưa file của người dùng vào repo.

Các file mẫu CSV trong `docs/templates/` được test đọc trực tiếp và so với tiêu đề chuẩn.

## Kiểm trên Excel thật

Excel 64-bit (Microsoft 365) trên máy phát triển, phiên Excel riêng mở bằng COM, nạp `ConsQuotation64-packed.xll` bằng `RegisterXLL` (không ghi registry). Bấm Trợ giúp, hộp thoại hiện:

```
Thư viện trên máy: C:\Users\…\AppData\Roaming\ConsQuotation\library.json
0 công tác, 0 tài nguyên, 0 định mức.
Thành phần: ConsQuotation.Core 2.0.0.0, Newtonsoft.Json 13.0.0.0.
```

Kết quả: hai DLL đóng gói trong `.xll` nạp được khi chạy; sau lần bấm, thư mục `%APPDATA%\ConsQuotation` vẫn chưa có (chỉ đọc thì không tạo file). Bản 32-bit và Office 2016 chưa thử (để sau theo yêu cầu).

## Khác bản web

- Không có bước nâng cấp IndexedDB v1 → v2 → v3: bản Windows bắt đầu ở schema 3. Dữ liệu cũ chuyển sang bằng file sao lưu .json, bộ đọc vẫn nhận file schema 1 và 2.
- Cột "Thứ tự" của thành phần định mức phải là số nguyên (bản web nhận cả số lẻ như 1,5).
- Ô số Excel (double) đổi sang decimal theo 15 chữ số có nghĩa, như Excel hiển thị.
- Kiểm tra định mức không đổi; xóa tài nguyên đang dùng trả về số định mức đang dùng thay cho đối tượng `{ ok, reason, normCount }`; đổi trạng thái định mức trả về `null` khi được, ngược lại là lý do.

## Để lại cho N3

- Đọc/ghi workbook thật qua Excel: đọc sheet đang mở thành `SourceTable` (giữ chữ hiển thị của ô số, nhận ô ngày), ghi `ExportSheet` ra workbook mới.
- Giao diện Thư viện và hộp thoại Nhập/Xuất dùng `LibraryService`, `Backup`, `ImportAnalyzer`.
