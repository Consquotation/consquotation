# Đánh giá trước giai đoạn 17: quy trình lập báo giá

Ngày đánh giá: 2026-10-27. Mã nguồn tại commit `bb2a6e0` (bản 1.10.0, chưa phát hành). Đánh giá dựa trên đọc mã, tài liệu trong `docs/`, ADR-0001 đến ADR-0013, `prompts/02`, `03`, `07`, `08`, `10`, `12` và kết quả chạy lệnh kiểm tra.

## Trạng thái ban đầu (đã chạy)

| Lệnh | Kết quả |
|---|---|
| `npm run lint` | 0 lỗi |
| `npx tsc --noEmit` | đạt |
| `npm test` | 336/336 test, 22 file |
| `npm run validate` | manifest hợp lệ |
| `npm run build` | đạt; `taskpane.js` 689.967 byte |
| `tests/integration/excel-core.scenarios.js` trong Excel 16.0.20430 | 26/26 (chạy cuối giai đoạn 16) |

## Chức năng hiện có và bằng chứng

| Bước nghiệp vụ | Hiện có | Bằng chứng |
|---|---|---|
| 1. Tạo báo giá, thông tin công trình | Tab Báo giá: tạo bảng `CQ_Quote_n` trên sheet mới hoặc tại ô chọn; khối thông tin 7 mục (Đơn vị lập, Khách hàng, Dự án, Mã báo giá, Ngày lập, Phiên bản, Hiệu lực đến), sửa được qua panel Thông tin báo giá | `src/domain/quoteTemplate.ts`, `src/domain/quoteInfo.ts`, `QuoteInfoPanel.tsx`; checklist spec-06, spec-07 |
| 2. Bảng báo giá trong Excel | Excel Table 9 cột: STT, Mã công tác, Nhóm công tác, Nội dung công việc, Đơn vị tính, Khối lượng, Đơn giá, Thành tiền, Ghi chú; STT và Thành tiền là công thức; dòng tổng `SUBTOTAL` | `quoteTemplate.ts`, ADR-0008, ADR-0009 |
| 3. Thêm công tác | Thủ công, hoặc "Chèn vào báo giá" từ Thư viện (tìm không dấu, lọc nhóm/loại/nhà cung cấp), chèn cuối bảng hoặc dưới dòng chọn, chống bấm lặp | `AddWorkItemPanel.tsx`, `quoteService.ts`, checklist spec-08 |
| 4. Định mức, thành phần hao phí | Thư viện định mức có phiên bản (giai đoạn 16); khi chèn chọn "Phân tích từ định mức" dùng phiên bản Đang dùng, xem từng tài nguyên | `composition.ts`, `CompositionPicker.tsx`, `norms-checklist.md` |
| 5. Đơn giá nguồn lực | Chỉ tự chọn khi có đúng một giá dùng được; nhiều giá thì người dùng chọn; giá khác đơn vị không chọn được; giá áp dụng lưu theo thành phần định mức | `composition.ts`, `normCalc.ts`, ADR-0013 |
| 6. Tính đơn giá công tác | Sheet "Phân tích đơn giá" (`CQ_Analysis`): Thành tiền = Hao phí × Đơn giá nguồn, Đơn giá công tác = Σ bằng công thức Excel; đơn giá ghi vào báo giá dạng giá trị | `analysis.ts`, ADR-0008 |
| 7. Thành tiền, tổng hợp | Thành tiền là công thức, tự cập nhật khi đổi khối lượng/đơn giá; bảng `CQ_Summary_n` cho chiết khấu, phụ phí, thuế do người dùng cấu hình, có thứ tự, cách tính, lũy kế | `adjustments.ts`, `SummaryPanel.tsx` |
| Kiểm tra | Kiểm tra báo giá đọc trực tiếp sheet: lỗi công thức, ô trống, số dạng chữ, số âm, 0, Thành tiền bị sửa tay, đơn giá lệch sheet phân tích (có đề xuất sửa cần xác nhận), đơn giá lệch thư viện | `quoteCheck.ts`, `QuoteCheckPanel.tsx` |
| Quy trình | Tab Tổng quan hiện 7 bước, tính từ dữ liệu đọc lại | `workflow.ts`, `WorkflowPanel.tsx` |
| Snapshot | Đơn giá thư viện và phân tích là bản sao giá trị trong workbook; sửa thư viện không đổi báo giá (đã kiểm chứng ở spec-08) | `toQuote.ts`, `docs/LIBRARY.md` |
| Lưu trữ | Báo giá nằm trong workbook, lưu bằng Excel; thư viện trong IndexedDB, sao lưu JSON/workbook; cấu hình làm tròn trong `workbook.settings` | ADR-0003, ADR-0004, ADR-0008 |
| Lớp Excel | `src/office/core`: tạo sheet, ghi vùng có vân tay, Table, định dạng (giai đoạn 14) | ADR-0011, 26/26 kịch bản |

## Chức năng còn thiếu hoặc chưa đạt

1. **Không có định danh báo giá và trạng thái.** Bảng báo giá chỉ có tên Table. Không có trạng thái nháp/hoàn tất, nên không có chỗ chặn "hoàn tất khi còn lỗi". Prompts/07 cho phép thêm trạng thái khi có yêu cầu và logic rõ ràng; giai đoạn 17 là yêu cầu đó.
2. **Dòng công tác không có định danh ổn định.** Mọi kiểm tra dùng vị trí dòng. Người dùng chèn, xóa, sắp xếp hay sao chép dòng thì không truy được dòng nào là dòng nào.
3. **Không tách đơn giá vật liệu, nhân công, máy, khác trên bảng báo giá.** Có schema tham khảo `QUOTE_LINE_SCHEMA` (giai đoạn 14) nhưng chưa dùng; phần tách loại chỉ có trên sheet phân tích.
4. **Snapshot thiếu khóa truy vết.** Sheet phân tích có mã, tên, loại, đơn vị, hao phí áp dụng, đơn giá và chữ nguồn, nhưng không có id tài nguyên, id giá, id và phiên bản định mức, hao phí cơ sở, tỷ lệ hao hụt dưới dạng dữ liệu. Vì vậy không phát hiện được "đơn giá thư viện đã đổi so với snapshot" cho dòng phân tích (dòng lấy từ thư viện thì đã có kiểm tra).
5. **Không có trạng thái tính toán theo dòng** (valid / valid_with_warnings / invalid). Kiểm tra báo giá báo theo ô; chưa gom thành trạng thái từng công tác và chưa có kết quả tính lưu lại để so khi mở lại.
6. **Không có thao tác cập nhật đơn giá theo thư viện cho dòng phân tích** sau khi người dùng chủ động yêu cầu.
7. **Khối thông tin thiếu** Địa điểm, Hạng mục/gói thầu, Người lập.
8. **Không có tổng theo nhóm công tác** (chỉ có tổng cả bảng).
9. **Chưa có engine tính đơn giá công tác trên dữ liệu snapshot** để đối chiếu với kết quả Excel; engine giai đoạn 16 tính trên thực thể thư viện.

Không phát hiện lỗi chặn ở giai đoạn 14–16 cần sửa trước. Giới hạn đã biết của giai đoạn 16 (ADR-0013) không ảnh hưởng luồng báo giá.

## Kiến trúc tích hợp được chọn

Giữ quyết định đã có: **báo giá sống trong workbook**, Excel là giao diện và nơi lưu chính (prompts/07, ADR-0008). Không tạo kho báo giá thứ hai trong IndexedDB, vì:
- workbook là tài liệu người dùng lưu, gửi, in; kho riêng sẽ lệch khi người dùng sửa sheet, gửi file cho người khác, hoặc mở file trên máy khác;
- prompts/07 yêu cầu đọc lại workbook trước mỗi nghiệp vụ, không tin trạng thái lưu tạm.

Bổ sung (ADR-0014):
1. **Hồ sơ báo giá (quotation record)** lưu ngay trong workbook dưới dạng Custom XML Part (ExcelApi 1.5, nằm trong mức tối thiểu 1.8 đang kiểm tra lúc chạy). Mỗi bảng báo giá một hồ sơ. Hồ sơ chứa những gì ô Excel không chứa được: id báo giá, trạng thái, id dòng ↔ nguồn (phương pháp, công tác thư viện, định mức và phiên bản), snapshot thành phần có id tài nguyên/giá, kết quả tính lần gần nhất. Lưu workbook là lưu hồ sơ; không cần cơ chế sao lưu mới.
2. **Cột "Mã dòng"** trong bảng báo giá chứa id dòng (ẩn, nằm trong Table để đi theo dòng khi chèn, xóa, sắp xếp). Đây là khóa nối dòng Excel với hồ sơ.
3. **Bốn cột đơn giá thành phần** (vật liệu, nhân công, máy, khác) trong bảng. Add-in ghi dạng giá trị (ADR-0008 kết quả 1: ghi công thức vào cột trống sẽ lan cả cột) cho dòng phân tích định mức; dòng nhập trực tiếp hoặc lấy từ thư viện để trống (không biết cơ cấu, không ghi 0).
4. **Nguồn sự thật theo trường:** giá trị trên sheet (khối lượng, đơn giá, thành tiền, hao phí và giá nguồn trên sheet phân tích) luôn thắng. Hồ sơ chỉ cung cấp định danh, nguồn gốc và snapshot để so. Khi hai bên lệch, add-in báo và để người dùng chọn cập nhật.
5. **Đồng bộ (reconcile)** chạy mỗi lần mở panel: dòng chưa có mã được gán mã; dòng bị sao chép (trùng mã) được gán mã mới và chép nguồn của dòng gốc; mã trong hồ sơ không còn trên sheet được bỏ khỏi hồ sơ. Không có giao dịch nguyên tử giữa sheet và hồ sơ; thứ tự ghi là sheet trước, hồ sơ sau, và lần đồng bộ sau tự phục hồi phần thiếu.
6. **Engine tính dòng** thuần TypeScript (`src/domain/quotation/`), dùng số học thập phân và quy tắc làm tròn của giai đoạn 16 trên dữ liệu đọc từ sheet; đối chiếu với kết quả Excel.
7. **Trạng thái dòng** gom từ Kiểm tra báo giá hiện có (gắn thêm chỉ số dòng cho từng vấn đề) cộng các kiểm tra mới (thiếu phân tích, thiếu giá nguồn, đơn giá thành phần lệch, thư viện đã đổi, thiếu hồ sơ).

## Mô hình dữ liệu báo giá đề xuất

Đặt tên theo mô hình tham khảo của yêu cầu, điều chỉnh theo dữ liệu thực tế:
- `QuotationRecord`: `schemaVersion`, `id`, `tableName`, `status` (`draft` / `completed`), `completedAt`, `completedFingerprint`, `createdAt`, `updatedAt`, `items`. Mã báo giá, tên công trình và thông tin công trình **không nhân đôi**: chúng nằm ở khối thông tin trên sheet và được đọc từ đó.
- `QuotationItemRecord`: `id`, `pricingMethod` (`manual` / `library` / `norm`), `workCode`, `workName`, `unit` (lúc chèn), `source` (id công tác thư viện, id/mã/phiên bản định mức), `libraryPrice` (giá công tác thư viện lúc chèn), `components`, `result`, `createdAt`, `updatedAt`. Khối lượng, đơn giá, ghi chú, thứ tự lấy từ sheet.
- `QuotationComponent`: `resourceType`, `resourceId`, `resourceCodeSnapshot`, `resourceNameSnapshot`, `unitSnapshot`, `baseConsumption`, `wasteRate`, `appliedConsumption`, `priceId`, `unitPriceSnapshot`, `currency`, `sourceReference`.
- `QuotationPricingResult` (lưu trong `result` của dòng): chi phí vật liệu, nhân công, máy, khác, đơn giá, khối lượng, thành tiền, quy tắc làm tròn, trạng thái, danh sách vấn đề, `calculatedAt`, `calculationVersion`.

## Thay đổi dự kiến

- `src/domain/quotation/`: mô hình, mã hóa/giải mã hồ sơ XML và nâng cấp schema, đồng bộ, engine tính dòng, phát hiện thư viện thay đổi.
- `quoteTemplate.ts`: cột mở rộng (Mã dòng, 4 cột đơn giá thành phần); mẫu mới có sẵn; bảng cũ thêm được sau khi xác nhận.
- `quoteInfo.ts`: thêm 3 mục tùy chọn (Địa điểm, Hạng mục/gói thầu, Người lập), không coi là thiếu trên sheet cũ.
- `quoteCheck.ts`: mỗi vấn đề của dòng mang chỉ số dòng; sheet phân tích đọc đủ chi tiết.
- Port `QuotationGateway` và adapter Excel (Custom XML Part, ghi ô có kiểm tra giá trị cũ, thêm cột, cập nhật giá nguồn trên sheet phân tích).
- `QuotationService`: mở/đồng bộ, tính lại, hoàn tất/mở lại, cập nhật theo thư viện, ghi nhận dòng mới khi chèn.
- Giao diện: panel "Công tác trong báo giá" ở tab Báo giá (trạng thái báo giá, danh sách dòng có trạng thái, chi tiết thành phần, tổng theo nhóm, các nút thao tác); form Thêm công tác ghi mã dòng và đơn giá thành phần.

## Rủi ro

| Nhóm | Rủi ro | Biện pháp |
|---|---|---|
| Dữ liệu | Người dùng sửa, xóa, sao chép dòng hoặc đổi tên cột ngoài add-in | Đồng bộ theo mã dòng; sheet thắng; cột mẫu đổi tên thì dừng như hiện nay |
| Dữ liệu | Hồ sơ XML hỏng hoặc của phiên bản mới hơn | Từ chối đọc, không ghi đè; báo rõ |
| Dữ liệu | Ghi sheet thành công nhưng ghi hồ sơ lỗi | Lần mở sau đồng bộ lại; dòng mất nguồn được đánh dấu "thiếu dữ liệu truy vết" |
| Tính toán | Kết quả engine lệch Excel do số thực | So sánh theo quy tắc làm tròn; báo lệch, không tự sửa |
| Tính toán | Đơn giá thành phần lệch đơn giá khi có làm tròn cấp đơn giá | Dung sai bằng bước làm tròn đang dùng |
| Tương thích | Custom XML Part chưa thử trên Excel web/Mac | Ghi rõ là chưa kiểm chứng |
| Tương thích | Bảng cũ 9 cột | Vẫn dùng như cũ; tính năng theo dòng cần thêm cột sau khi xác nhận |
| Lưu trữ | Hồ sơ lớn | Ước tính 500 dòng × 10 thành phần khoảng 2 MB; Custom XML Part không có giới hạn nhỏ như settings |

## Tiêu chí nghiệm thu

1. Tạo báo giá mới có Mã dòng và 4 cột đơn giá thành phần; khối thông tin có 10 mục.
2. Thêm công tác thủ công, từ thư viện và phân tích định mức; mỗi dòng có mã dòng và được ghi vào hồ sơ.
3. Dòng phân tích có đơn giá vật liệu/nhân công/máy/khác đúng (test 1: 20.000/20.000/20.000/60.000; test 2: 21.000; test 3: thành tiền 600.000).
4. Thiếu đơn giá nguồn hoặc sai đơn vị: dòng `invalid`, chỉ rõ tài nguyên, không thành 0.
5. Đổi giá thư viện: báo giá giữ số cũ, dòng có cảnh báo "thư viện đã đổi"; chỉ đổi khi người dùng bấm cập nhật.
6. Sửa khối lượng: thành tiền đổi, đơn giá và thành phần giữ nguyên.
7. Lưu workbook, đóng, mở lại: hồ sơ, trạng thái, kết quả khớp.
8. Hoàn tất bị chặn khi còn dòng `invalid` hoặc lỗi kiểm tra; sửa sheet sau khi hoàn tất thì được báo.
9. Lỗi đọc/ghi Excel (bảng bị xóa, sheet bị bảo vệ) báo rõ, không mất dữ liệu thư viện.
10. lint, typecheck, test, build đạt; kịch bản Excel ghi rõ đã chạy hay chưa.
