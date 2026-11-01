# Giai đoạn N1: chuyển nghiệp vụ sang C#

Kế hoạch: [NATIVE_PLAN.md](../NATIVE_PLAN.md). Mã: `native/src/ConsQuotation.Core` (.NET Framework 4.8, không phụ thuộc Excel). Ngày: 2026-11-01.

## Đã chuyển

| Bản web (TypeScript) | Bản Windows (C#) |
|---|---|
| `domain/library/types.ts` | `Library/Model.cs` (schema v3, cùng tên trường) |
| `domain/library/dates.ts` | `Library/Dates.cs` |
| `domain/library/search.ts` | `Library/Search.cs` |
| `domain/library/validation.ts` (form, chuyển trạng thái định mức) | `Library/Forms.cs`, `Library/Validation.cs` |
| `domain/library/validation.ts` (`libraryIssues`) | `Library/LibraryCheck.cs` |
| `domain/workItemDraft.ts` (`parseDecimalInput`) | `Numbers/DecimalInput.cs` |
| `domain/pricing/decimal.ts` | `Numbers/DecimalMath.cs` (dùng `decimal` của .NET) |
| `domain/pricing/rounding.ts` | `Pricing/Rounding.cs` |
| `domain/pricing/normCalc.ts` | `Pricing/NormCalc.cs` |
| `domain/pricing/composition.ts` | `Pricing/Composition.cs` |
| `domain/pricing/analysis.ts`, `formulaText.ts` | `Pricing/Analysis.cs` |
| `domain/pricing/adjustments.ts` | `Pricing/Adjustments.cs` |
| `domain/license/license.ts`, `application/licenseService.ts` | `Licensing/License.cs`, `Licensing/LicenseService.cs` |

Thông báo lỗi, công thức Excel, tên bảng, tên cột và chữ ghi trên sheet giữ nguyên từng ký tự, để workbook và file sao lưu dùng chung được giữa hai bản.

## Kiểm thử

`dotnet test native/ConsQuotation.sln`: 112 test đạt (5 test ribbon của N0 và 107 test N1).

| File test C# | Chuyển từ |
|---|---|
| `NormCalcTests.cs` | `normCalc.test.ts` (toàn bộ, trừ 2 ca NaN) |
| `LicenseTests.cs` | `license.test.ts` (trừ phần lệnh cấp phép Node, vẫn chạy ở bản web) |
| `LibraryDomainTests.cs` | `libraryDomain.test.ts` (trừ `draftFromWorkItem`) |
| `LibraryRulesTests.cs` | phần nghiệp vụ của `libraryV2.test.ts` và `norms.test.ts` |
| `PricingTests.cs` | `pricing.test.ts` (trừ kiểm tra báo giá và công thức mẫu bảng báo giá) |

Hai giá trị dùng chung giữa hai bản được đối chiếu bằng chính mã của bản web, không tính tay:
- khóa cấp phép SHA-256: 3 cặp email và mã, gồm email có chữ Việt, tham chiếu tính bằng `node:crypto`. Mã cấp phép thật không đưa vào test.
- dấu vân tay dữ liệu đầu vào của bộ máy tính: 4 chuỗi, tham chiếu tính bằng hàm `hashText` của bản web.

## Khác bản web

- Số: `decimal` của .NET (28–29 chữ số có nghĩa) thay cho bộ số học tự viết. Kiểu này không chứa được NaN hay vô cực, nên 2 ca test "không phải số" của bản web không áp dụng; dữ liệu hỏng sẽ bị chặn ở bước nhập file (N2).
- Ô nhập số: số có hơn 28 chữ số báo "Số quá lớn." (bản web làm tròn mất chữ số sau chữ số thứ 17).
- So sánh mã "số theo giá trị" ("BT-2" trước "BT-10") tự viết, vì .NET Framework 4.8 không có kiểu so sánh này. Phần chữ so theo tiếng Việt của Windows.
- Đường dẫn soạn thư mã hóa thêm dấu ngoặc `( )` thành `%28 %29`; nội dung thư sau khi giải mã giống hệt.

## Để lại cho giai đoạn sau

- N2: dịch vụ thư viện (lưu, sao chép phiên bản định mức, xóa có điều kiện), lưu trữ JSON, nâng cấp schema v1/v2, nhập/xuất. Các test tương ứng của `libraryV2.test.ts`, `norms.test.ts`, `libraryStorage.test.ts`, `libraryExchange.test.ts`.
- N2: kiểm trên Excel thật việc nạp `ConsQuotation.Core.dll` và `Newtonsoft.Json.dll` đã đóng gói trong `.xll` (khai báo bằng `ExcelAddInInclude`).
- N4: `toQuote.ts` (chèn công tác từ thư viện vào báo giá), `normExplanation.ts`, mẫu bảng báo giá.
- N5: `quoteCheck.ts` (kiểm tra báo giá).
