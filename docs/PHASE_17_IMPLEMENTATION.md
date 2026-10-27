# Triển khai giai đoạn 17: hoàn thiện quy trình lập báo giá

Bản 1.11.0, 2026-10-27. Đánh giá trước khi làm: [PHASE_17_ASSESSMENT.md](PHASE_17_ASSESSMENT.md). Quyết định kiến trúc: [ADR-0014](ADR/0014-ho-so-bao-gia-trong-workbook.md). Hướng dẫn người dùng và mô hình dữ liệu: [QUOTATION.md](QUOTATION.md).

## Kiến trúc và luồng dữ liệu sau tích hợp

```
Thư viện (IndexedDB)           Workbook (nguồn sự thật của báo giá)
 công tác, tài nguyên, giá,     ┌───────────────────────────────────────────────┐
 định mức (giai đoạn 15–16)     │ Sheet báo giá: khối thông tin + CQ_Quote_n    │
        │                       │   (14 cột, Mã dòng ẩn)                        │
        │ chèn (bản sao giá trị)│ Sheet "Phân tích đơn giá": CQ_Analysis        │
        ▼                       │   (hao phí × giá nguồn bằng công thức Excel)  │
 AddWorkItemPanel ─ ghi dòng ──►│ Custom XML Part "urn:consquotation:quotation" │
        │ + Mã dòng, đơn giá    │   hồ sơ báo giá: id, trạng thái, nguồn gốc,   │
        │   thành phần          │   snapshot thành phần, kết quả tính          │
        └─ registerInsertedLine►└───────────────────────────────────────────────┘
                                         ▲ đọc lại mỗi lần          │ ghi có kiểm tra
 Tab Công tác ── QuotationService ──────┘                           │
   (src/application)   ├─ PricingGateway.readQuoteSnapshot (dùng chung với Kiểm tra báo giá)
                       ├─ QuotationGateway (hồ sơ XML, ghi ô có kiểm tra giá trị cũ, thêm cột)
                       └─ domain/quotation: lines → reconcile → evaluate (calculate, drift)
                            └─ dùng lại quoteCheck, decimal, rounding, composition của giai đoạn 10–16
```

Thứ tự ghi luôn là ô Excel trước, hồ sơ sau. Không có giao dịch chung giữa hai nơi; lần "Tính lại và lưu" kế tiếp đồng bộ lại từ sheet.

## Người dùng lập một báo giá từ đầu đến cuối

1. Tab **Báo giá** › Tạo bảng báo giá. Điền thông tin công trình ở panel Thông tin báo giá.
2. Tab **Thư viện** › tìm công tác › **Chèn vào báo giá**. Với công tác có định mức Đang dùng, chọn **Phân tích từ định mức** và kiểm tra từng tài nguyên, giá. Nhập khối lượng, bấm Thêm vào bảng. Công tác ngoài thư viện thì nhập tay ở form Thêm công tác.
3. Tab **Công tác**: xem trạng thái từng dòng, đơn giá vật liệu/nhân công/máy/khác, tổng theo nhóm, lỗi và cảnh báo kèm hướng xử lý. Sửa trên sheet (khối lượng, đơn giá) hoặc ở thư viện, rồi bấm **Tính lại và lưu**.
4. Khi thư viện đổi giá, dòng hiện cảnh báo. Muốn dùng giá mới thì bấm **Cập nhật theo thư viện** và xác nhận.
5. Tab **Tính giá** › Tổng hợp nếu cần chiết khấu, phụ phí, thuế (người dùng tự cấu hình).
6. Tab Công tác › **Đánh dấu hoàn tất**. Bị chặn nếu còn dòng lỗi.
7. Lưu workbook (File › Save), in hoặc xuất PDF bằng Excel.

## Thay đổi chính

| Phần | Thay đổi |
|---|---|
| Mẫu bảng | 5 cột mở rộng: Đơn giá vật liệu, Đơn giá nhân công, Đơn giá máy, Đơn giá khác, Mã dòng; Mã dòng ẩn khi tạo trên sheet mới; 9 cột cũ vẫn là bộ bắt buộc |
| Thông tin công trình | Thêm Người lập, Địa điểm, Hạng mục/gói thầu (tùy chọn; sheet cũ thiếu không bị coi là hỏng) |
| Hồ sơ báo giá | `QuotationRecord` schema 1 trong Custom XML Part; mã hóa, giải mã, kiểm tra cấu trúc, từ chối schema mới hơn |
| Engine tính dòng | Đơn giá theo loại từ sheet phân tích bằng số học thập phân; làm tròn một lần ở cấp đơn giá và cấp thành tiền; đối chiếu Excel |
| Trạng thái dòng | Gom Kiểm tra báo giá (thêm chỉ số dòng, mã vấn đề) cộng kiểm tra mới; 20 mã vấn đề của dòng |
| Thư viện đổi | So snapshot với thư viện theo id; kế hoạch cập nhật cho dòng thư viện và dòng phân tích |
| Đồng bộ | Gán mã dòng mới, xử lý dòng sao chép, bỏ dòng đã xóa; mã mới không trùng |
| Hoàn tất | Nháp / hoàn tất với vân tay nội dung; chặn khi còn lỗi |
| Giao diện | Tab Công tác; form Thêm công tác ghi Mã dòng, đơn giá thành phần và ghi nhận hồ sơ; panel Thông tin gợi ý mục mới |
| Phiên bản | 1.11.0 |

## File mới

- `src/domain/quotation/model.ts`, `lines.ts`, `reconcile.ts`, `calculate.ts`, `drift.ts`, `evaluate.ts`, `fromInsert.ts`
- `src/application/quotationGateway.ts`, `src/application/quotationService.ts`
- `src/office/excelQuotationGateway.ts`
- `src/taskpane/components/quotation/QuotationItemsView.tsx`
- `src/shared/strings.quotation.vi.ts`
- `tests/unit/quotation.test.ts`
- `docs/PHASE_17_ASSESSMENT.md`, `docs/PHASE_17_IMPLEMENTATION.md`, `docs/QUOTATION.md`, `docs/ADR/0014-ho-so-bao-gia-trong-workbook.md`, `tests/manual/quotation-checklist.md`

## File đã sửa

- `src/domain/quoteTemplate.ts`: cột mở rộng, `TEMPLATE_COLUMNS`, `templateTotalRow`, `alignRowToHeaders` nhận giá trị cột mở rộng, 10 nhãn thông tin.
- `src/domain/quoteInfo.ts`: 3 mục mới, cờ `addedLater`.
- `src/domain/pricing/quoteCheck.ts`: chỉ số dòng và mã ổn định cho vấn đề; chi tiết tài nguyên của sheet phân tích.
- `src/office/excelWorkbookGateway.ts`: tạo bảng 14 cột, ẩn Mã dòng; thêm dòng ghi cột mở rộng.
- `src/office/excelPricingGateway.ts`: đọc đủ chi tiết sheet phân tích.
- `src/application/workbookGateway.ts`, `quoteService.ts`: tham số `extras` khi thêm dòng.
- `src/taskpane/components/App.tsx`, `navigation.ts`, `AddWorkItemPanel.tsx`, `QuoteInfoPanel.tsx`: tab mới, ghi nhận dòng, gợi ý mục mới.
- `src/shared/strings.vi.ts`, `strings.workflow.vi.ts`.
- Test: `quoteTemplate`, `workflow`, `navigation`, `pricing` (dữ liệu mẫu theo cấu trúc mới).
- `README.md`, `docs/ADR/README.md`, `package.json`.

## Kết quả kiểm tra

Mức "đã kiểm tra tự động":

| Lệnh | Kết quả |
|---|---|
| `npm run lint` | 0 lỗi |
| `npx tsc --noEmit` | đạt |
| `npm test` | 357/357 test, 23 file (trước giai đoạn: 336) |
| `npm run validate` | manifest hợp lệ |
| `npm run build` | đạt; `taskpane.js` 752.960 byte (trước: 689.967); không chứa mã lab |

`tests/unit/quotation.test.ts` có 21 test, trong đó 10 tình huống bắt buộc của yêu cầu:
1. 20.000 / 20.000 / 20.000, đơn giá 60.000.
2. Hao phí áp dụng 2,1, chi phí vật liệu 21.000.
3. Thành tiền 600.000.
4. Thiếu giá: dòng invalid, chỉ rõ tài nguyên, không có số.
5. Sai đơn vị: invalid, có lỗi cụ thể.
6. Thư viện đổi: báo giá giữ snapshot, chỉ cập nhật khi người dùng bấm.
7. Sửa khối lượng: thành tiền đổi, đơn giá giữ nguyên.
8. Lưu và mở lại: khớp.
9. Đồng bộ với Excel và các lỗi ghi.
10. Dữ liệu không hợp lệ: số âm, chữ, trống, vô hạn, sai schema, schema mới hơn.

Mức "đã kiểm tra thủ công": chạy trên Excel 16.0.20430 (Windows), chi tiết ở [quotation-checklist.md](../tests/manual/quotation-checklist.md). Gồm:
- tạo báo giá và chèn 3 loại dòng;
- tab Công tác, Tính lại và lưu, Hoàn tất;
- đổi giá thư viện và cập nhật;
- sửa, chép, xóa dòng trong Excel;
- thiếu giá nguồn chặn hoàn tất;
- sheet đổi giữa lúc xem và lúc ghi; sheet bị bảo vệ;
- lưu ra file, đóng, mở lại;
- bổ sung cột cho bảng cũ;
- bề rộng 320px;
- hồi quy lớp core 26/26.

Mức "chưa kiểm chứng": Excel web và Mac; in và xuất PDF bảng 14 cột; workbook rất lớn (hàng trăm dòng, hồ sơ trên 1 MB).

## Lỗi phát hiện và xử lý trong giai đoạn

- Ký tự backspace lọt vào biểu thức chính quy khi sửa file bằng `node -e`. Đã phát hiện bằng typecheck/grep và ghi lại bằng script.
- Vòng lặp vô hạn khi chống trùng mã dòng với hàm sinh mã cố định (lần chạy thử trong `load`). Đã sửa hàm sinh mã và giới hạn 1.000 lần thử.
- Unit test phát hiện mã dòng mới có thể trùng mã đang có. Đã chặn.
- Excel thật phát hiện 3 lỗi, đều đã sửa, có unit test và đã chạy lại trên Excel:
  - chữ nguồn mất ghi chú hao hụt sau khi cập nhật theo thư viện;
  - thư viện đổi bị báo nhầm là "sheet đã đổi";
  - thông báo không nói báo giá đã về nháp.
- 4 lỗi lint theo quy tắc Office.js (đọc thuộc tính trước khi load). Đã sửa.

## Giới hạn còn tồn tại

- Khối phân tích dùng chung theo mã công tác (ADR-0008). Hai dòng cùng mã luôn cùng đơn giá; cập nhật theo thư viện tác động cả hai.
- Định mức có phiên bản mới chỉ được cảnh báo; muốn dùng phải xóa khối phân tích cũ rồi chèn lại (chưa có nút).
- Sao chép dòng giữa hai báo giá khác workbook: dòng nhận mã mới ở lần đồng bộ, nguồn gốc lấy theo ghi chú (không còn id thư viện).
- Bước Hoàn tất ở Tổng quan (quy trình 7 bước) chưa đọc trạng thái hồ sơ; trạng thái chỉ hiện ở tab Công tác.
- Thuế, chi phí chung, lợi nhuận không có quy tắc mặc định; dùng bảng Tổng hợp do người dùng cấu hình (không đổi so với giai đoạn 10).
