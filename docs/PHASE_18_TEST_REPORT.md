# Báo cáo kiểm thử giai đoạn 18

Ngày chạy: 2026-10-27 đến 2026-10-28. Kế hoạch: [PHASE_18_TEST_PLAN.md](PHASE_18_TEST_PLAN.md). Checklist thủ công: [PHASE_18_MANUAL_QA_CHECKLIST.md](PHASE_18_MANUAL_QA_CHECKLIST.md).

Ba mức bằng chứng dùng trong báo cáo:
- **Tự động**: có kết quả lệnh (Vitest, kịch bản tích hợp);
- **Thủ công trên Excel**: thao tác qua task pane thật, kết quả đọc lại từ giao diện và Excel;
- **Chưa kiểm chứng**: không chạy được trong môi trường hiện có.

## 1. Trạng thái repository trước kiểm thử

- Commit `c699dfa`, bản 1.11.0, cây làm việc sạch. Các bản 1.9.0, 1.10.0, 1.11.0 chưa push.
- `npm run check` đạt: 357/357 test (23 file), lint 0 lỗi, typecheck đạt, manifest hợp lệ, build đạt (3 cảnh báo kích thước bundle).
- `npm audit --omit=dev`: 0 lỗ hổng. `npm audit` cả dev: 14 lỗ hổng, đều trong công cụ phát triển (chi tiết ở mục 10).
- Không có script integration test riêng. Kiểm thử Excel thật dùng `tests/integration/run-in-taskpane.mjs` (giai đoạn 14).

## 2. Lỗi đã phát hiện

| Mã | Mức | Mô tả | Phát hiện bằng | Trạng thái |
|---|---|---|---|---|
| B1 | P1 | Xóa bảng báo giá rồi tạo bảng mới: bảng mới lấy lại tên cũ (`CQ_Quote_n` nhỏ nhất còn trống) và nhận nhầm hồ sơ của báo giá đã xóa (id, trạng thái "hoàn tất", mục cũ). Báo giá mới bị báo sai trạng thái và trộn định danh với báo giá cũ | Đọc mã (`uniqueQuoteTableName` + hồ sơ khóa theo tên bảng), tái hiện trên Excel | Đã sửa, có test |
| B2 | P2 | Ghi ô và lưu hồ sơ dùng "kiểm tra rồi ghi" qua hai lần `sync`. Hai task pane chạy cùng lúc có thể cùng qua bước kiểm tra, để lại ô theo bên này và hồ sơ theo bên kia | Kịch bản Excel "bấm lặp" với service riêng (lần đầu cả hai báo "xong") | Đã giảm thiểu; còn rủi ro nhỏ (mục 10) |
| B3 | P3 | Định mức của dòng chuyển Ngừng dùng mà không có phiên bản mới: dòng không có cảnh báo nào (báo giá vẫn giữ snapshot đúng) | Rà mã khi viết test "ngừng dùng định mức" | Đã sửa, có test |
| B4 | P3 | Form Thêm công tác: ô số nhập sai hiện câu hướng dẫn hai lần (thông báo lỗi và gợi ý cố định) | Kiểm thử giao diện trên Excel | Đã sửa, đã kiểm trên Excel |

Không phát hiện lỗi P0. Không có lỗi tính toán sai: mọi kỳ vọng tính tay đều khớp.

Ghi nhận khác, không phải lỗi sản phẩm:
- Ghi giá trị vào ô sát mép phải Excel Table (kể cả qua API) làm Excel tự nới bảng thêm một cột. Add-in chịu được cột lạ (tìm cột theo tên). Kịch bản kiểm thử ban đầu đặt sai vị trí ô vì chưa biết điều này.
- Ba lỗi nằm ở bộ test, đã sửa:
  - workbook giả lập ghi công thức Thành tiền không theo quy tắc làm tròn;
  - dữ liệu thử thiếu Mã dòng;
  - dữ liệu thử 300 dòng thiếu Đơn vị tính.
  Trong cả ba trường hợp sản phẩm báo cảnh báo đúng quy tắc.

## 3. Nguyên nhân và cách sửa

- **B1.** Hồ sơ báo giá gắn với tên bảng, và tên bảng được dùng lại. Khi tạo bảng mới, `ExcelWorkbookGateway.writeTemplate` gọi `detachOrphanRecords`: hồ sơ còn mang tên bảng đó (thuộc bảng đã bị xóa) được đổi thuộc tính `table` thành `"<tên>#tách <thời điểm>"`. Không xóa hồ sơ; phần JSON giữ nguyên để còn đọc được. Hàm thuần `detachRecordXml` chỉ đổi thuộc tính của phần tử gốc.
- **B2.** Office.js không có khóa hay giao dịch có điều kiện. Thêm bước đọc lại ngay sau khi ghi, trong `writeLineCells` và `saveRecord`: bên bị ghi đè báo "đã thay đổi" và dừng trước khi lưu hồ sơ. Lần "Tính lại và lưu" kế tiếp đồng bộ lại từ sheet. Trong một task pane, giao diện vốn đã khóa thao tác lặp (`useExclusive`).
- **B3.** `libraryDrift` thêm cảnh báo `normVersionChanged` khi định mức nguồn đang Ngừng dùng và không có phiên bản Đang dùng khác.
- **B4.** `AddWorkItemPanel` bỏ gợi ý cố định của ô số khi ô đó đang có thông báo lỗi.

## 4. File đã thay đổi

| File | Thay đổi |
|---|---|
| `src/domain/quotation/model.ts` | `detachRecordXml` (B1) |
| `src/office/excelQuotationGateway.ts` | `detachOrphanRecords` (B1); đọc lại sau khi ghi ô và lưu hồ sơ (B2) |
| `src/office/excelWorkbookGateway.ts` | Tách hồ sơ mồ côi khi tạo bảng (B1) |
| `src/domain/quotation/drift.ts` | Cảnh báo định mức ngừng dùng (B3) |
| `src/taskpane/components/AddWorkItemPanel.tsx` | Không lặp gợi ý khi có lỗi (B4) |
| `src/taskpane/devQuotationHarness.ts` (mới), `src/taskpane/index.tsx` | Harness chỉ có ở bản dev cho kịch bản tích hợp; không có trong bundle production (đã kiểm source map) |
| `tests/unit/quotation.test.ts` | Thêm 8 test (mục 5); workbook giả lập áp quy tắc làm tròn như công thức Excel |
| `tests/integration/quotation.scenarios.js` (mới) | 23 tình huống trên Excel thật |
| `docs/PHASE_18_*.md` (mới), `docs/QUOTATION.md`, `README.md` | Tài liệu |

## 5. Test đã chạy

| Nhóm | Lệnh | Số lượng |
|---|---|---|
| Unit và tích hợp giả lập | `npm test` | 365 test, 23 file |
| Tích hợp Excel thật, quy trình báo giá | `node tests/integration/run-in-taskpane.mjs tests/integration/quotation.scenarios.js` | 23 tình huống |
| Hồi quy lớp Excel (giai đoạn 14) | `… tests/integration/excel-core.scenarios.js` | 26 tình huống |
| Giao diện trên Excel | Điều khiển task pane qua DevTools | 16 kiểm tra (checklist mục G) |

Test mới thêm trong `quotation.test.ts`:
- **Luồng đầy đủ:** thư viện IndexedDB giả lập → định mức có hao hụt → chọn giá → phân tích → dòng báo giá → hồ sơ → hoàn tất → đổi giá thư viện → ngừng định mức → xóa giá → cập nhật theo yêu cầu → mở lại.
- **Làm tròn:**
  - cấp đơn giá tới hàng nghìn: 61.699,3 → 62.000;
  - ROUNDUP, ROUNDDOWN, ROUND ở cấp thành tiền: 1.000,005 → 1.001; → 1.000; → 1.100 (tới hàng trăm).
- **Thập phân:** 0,1 × 3 = 0,3; 0,7 × 0,1 = 0,07; tổng 115,37.
- **Số lớn:** 999.999.000.000.000 tính đúng; 10^15 (16 chữ số) báo tràn, không có số.
- **Giá trị 0 hợp lệ:** khối lượng 0, giá nguồn 0 → tính được, có cảnh báo.
- **Thiếu khối phân tích:** dòng Lỗi.
- **Tách hồ sơ mồ côi (B1)**, kể cả khi dữ liệu có chữ `table="…"`.

Các yêu cầu của mục 6 đã có test từ giai đoạn trước và đã chạy lại trong 365 test:
- bản ghi trùng: `libraryExchange` "mã trùng trong file", "trùng với thư viện";
- nhập dữ liệu sai: "dữ liệu thiếu, số/ngày sai", "header sai", "từ chối file lạ";
- xuất rồi nhập lại: "round-trip vào thư viện trống", "round-trip qua các sheet";
- migration: `libraryStorage` v1→v2, `norms` v2→v3;
- lưu bị gián đoạn: "nhập trong một giao dịch; lỗi giữa chừng thì không lưu gì", `quotation` test 9 (ghi hồ sơ lỗi rồi đồng bộ lại).

## 6. Kết quả từng nhóm

| Nhóm | Kết quả | Mức bằng chứng |
|---|---|---|
| Unit và tích hợp giả lập | 365/365 đạt | Tự động |
| Luồng 12 bước trên Excel thật | 12/12 đạt: bảng 14 cột; thông tin công trình 10 mục ghi và đọc lại; dòng nhập tay; định mức 3 thành phần (2,1 / 0,5 / 0,25); giá chọn sẵn đúng; Excel và add-in cùng ra 61.000; đơn giá thành phần 21.000 / 20.000 / 20.000 / 0; thành tiền 610.000; tổng 613.000; sửa khối lượng thành 12 thì thành tiền 732.000; hồ sơ XML đúng snapshot; đọc lại bằng service mới khớp | Tự động trên Excel thật |
| Toàn vẹn dữ liệu trên Excel thật | 4/4 đạt (bảng dưới) | Tự động trên Excel thật |
| Tình huống Excel | 7/7 đạt (bảng dưới) | Tự động trên Excel thật |
| Hồi quy lớp core | 26/26 đạt | Tự động trên Excel thật |
| Giao diện | 16/16 đạt sau khi sửa B4 | Thủ công trên Excel |

Chi tiết nhóm toàn vẹn dữ liệu:

| Tình huống | Kết quả |
|---|---|
| Thư viện đổi giá | Báo giá giữ 61.000. Cập nhật theo yêu cầu thì ra 65.200 (2,1 × 12.000 + 40.000), thành tiền 782.400, báo giá về nháp |
| Định mức ngừng dùng, tài nguyên bị xóa | Có cảnh báo; báo giá không tự đổi |
| Nhiều báo giá | Hồ sơ riêng; hồ sơ A không bị đổi khi lưu B |
| Bảng mới trùng tên (B1) | Không nhận nhầm hồ sơ cũ; hồ sơ cũ được giữ |

Chi tiết nhóm tình huống Excel:

| Tình huống | Kết quả |
|---|---|
| Sheet đổi tên | Vẫn dùng được |
| Bảng không tồn tại | Báo ItemNotFound, không tạo hồ sơ |
| Ghi ngoài phạm vi | Dòng hoặc cột không có: dừng, không ghi |
| Ô sai kiểu, ô trống, thiếu giá nguồn | Dòng Lỗi đúng mã, không thành 0, chặn hoàn tất |
| Cột Khối lượng bị đổi tên | Báo lỗi cấu trúc, chặn hoàn tất |
| Bấm lặp: 5 vòng × 3 service chạy song song | Bên bị ghi đè báo "changed"; ô và hồ sơ khớp; dòng phân tích giữ đủ snapshot |
| Ô ngoài bảng | Ô bên phải có dữ liệu thì không thêm cột; ô của người dùng còn nguyên |

Dữ liệu lớn: 300 dòng gõ trong Excel. Đọc 216–305 ms, Tính lại và lưu 1,1–1,9 giây, hồ sơ 177.990 ký tự. Tổng 1.204.279 khớp kỳ vọng tính độc lập.

## 7. Build, lint, type checking

| Lệnh | Trước | Sau |
|---|---|---|
| `npm run typecheck` | đạt | đạt |
| `npm run lint` | 0 lỗi | 0 lỗi |
| `npm test` | 357/357 | 365/365 |
| `npm run validate` | hợp lệ | hợp lệ |
| `npm run build` | đạt, `taskpane.js` 752.960 byte | đạt, 753.961 byte; harness dev không có trong bundle |
| `npm audit --omit=dev` | 0 | 0 |

## 8. Chức năng chưa triển khai

- Bước Hoàn tất ở tab Tổng quan (quy trình 7 bước) chưa đọc trạng thái hồ sơ báo giá.
- Chưa có nút chèn lại phân tích theo phiên bản định mức mới; hiện chỉ cảnh báo.
- Đặc tả 12 (lưu trữ và quyền riêng tư), 19, 21 chưa làm.
- Chưa thử cài bản production.

## 9. Kiểm thử chưa thực hiện được

- Excel trên web, Mac, iPad: không có môi trường.
- In và xuất PDF bảng 14 cột.
- "Không có workbook khả dụng": task pane luôn chạy trong một workbook đang mở, không tái hiện được.
- Lưu ra file và mở lại thật bằng Excel trong giai đoạn 18: đã chạy ở giai đoạn 17 (commit `c699dfa`). Giai đoạn 18 đối chiếu bằng service và gateway mới đọc lại hồ sơ trong cùng workbook. Mã lưu hồ sơ có thay đổi nhỏ (đọc lại sau khi ghi) nên nên chạy lại bước S1–S2 của checklist giai đoạn 17.
- Excel bị tắt hoặc mất điện giữa lúc ghi: thay bằng lỗi ghi giả lập (unit) và sheet bị bảo vệ (giai đoạn 17).

## 10. Rủi ro còn tồn tại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Hai task pane cùng ghi một bảng cùng lúc | P2 | Đã có đọc lại sau ghi. Vẫn còn khe nhỏ giữa lần đọc lại và bước kế tiếp; lần Tính lại sau tự đồng bộ |
| Khối phân tích dùng chung theo mã trên toàn workbook | P3 | Cập nhật theo thư viện ở báo giá A làm dòng cùng mã ở báo giá B lệch phân tích; Kiểm tra báo giá của B báo và đề xuất cập nhật |
| Hồ sơ gắn theo tên bảng | P3 | Người dùng đổi tên Table thì bảng mất hồ sơ (hồ sơ còn trong file) |
| 14 lỗ hổng trong dependency phát triển | P3 | Không vào bundle. Bản sửa của office-addin-debugging/manifest là nâng phiên bản lớn (7.x, 3.x); chưa nâng vì yêu cầu không cập nhật hàng loạt |
| Bundle 736 KiB | P3 | Cảnh báo kích thước của webpack, có từ trước |

## 11. Kết luận nghiệm thu theo tiêu chí

| Tiêu chí | Kết luận | Bằng chứng |
|---|---|---|
| Luồng 12 bước chạy được, dữ liệu không mất, trùng hay đổi ngoài ý muốn | Đạt | 12/12 trên Excel thật, luồng đầy đủ trong unit test |
| Tính toán đúng (hao phí, hao hụt, theo loại, đơn giá, thành tiền, làm tròn, thập phân, số lớn, 0, dữ liệu sai) | Đạt | Unit test với kỳ vọng tính tay; Excel và add-in cùng ra 61.000 / 65.200 |
| Báo giá cũ giữ snapshot khi thư viện đổi | Đạt | Unit + Excel thật |
| Toàn vẹn dữ liệu (nhiều báo giá, trùng, nhập sai, xuất–nhập, migration, gián đoạn, lệch đồng bộ) | Đạt, có rủi ro P2 về ghi đồng thời | Mục 5–6, 10 |
| Tích hợp Excel (sheet/bảng bị đổi, cấu trúc sai, sửa trực tiếp, phạm vi sai, bấm lặp, dữ liệu lớn, không ghi đè) | Đạt | 7/7 tình huống + 26/26 hồi quy |
| Giao diện (nút, trạng thái, thông báo, form, tìm/lọc, không trùng, tải lại, 320px) | Đạt sau khi sửa B4 | Checklist mục G |
| Build, lint, typecheck | Đạt | Mục 7 |
| Không còn P0/P1 mở | Đạt | B1 đã sửa và kiểm trên Excel thật |
| Excel web/Mac, in PDF bảng 14 cột | Chưa kiểm chứng | Mục 9 |

Kết luận: giai đoạn 18 đạt nghiệm thu cho Excel desktop Windows, với các mục chưa kiểm chứng và rủi ro đã nêu. Chưa đủ căn cứ nghiệm thu cho Excel web và Mac.
