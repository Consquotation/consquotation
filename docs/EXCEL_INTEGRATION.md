# Lớp tích hợp Excel

Lớp thao tác Excel dùng chung cho các tính năng sau này: thư viện đơn giá, định mức, tính giá. Quyết định kiến trúc: [ADR-0011](ADR/0011-lop-thao-tac-excel-dung-chung.md). Cập nhật 2026-10-26, bản 1.8.0.

## Kiến trúc

Giữ cách chia lớp đã có từ ADR-0006:

| Thư mục | Vai trò | Gọi Office.js |
|---|---|---|
| `src/domain/excel/` | Kiểm tra ma trận, schema cột, quy tắc định dạng, lỗi có phân loại, dữ liệu kiểm thử | Không |
| `src/shared/a1.ts`, `src/domain/naming.ts` | Địa chỉ A1, quy tắc tên sheet và Table | Không |
| `src/office/core/` | Hàm thao tác Excel dùng chung: worksheet, vùng ô, Table, định dạng | Có |
| `src/office/excel*Gateway.ts` | Adapter nghiệp vụ (tạo báo giá, tính giá, in ấn, kiểm thử) | Có |
| `src/application/` | Cổng (interface) giữa giao diện và adapter | Không |
| `src/taskpane/` | Giao diện | Không (qua gateway) |

Luồng một thao tác ghi:

```
Giao diện ─▶ gateway (Excel.run) ─▶ core: kiểm tra đầu vào (thuần, chưa gọi Excel)
                                        ─▶ kiểm tra vùng đích (đọc, sync)
                                        ─▶ ghi một lần, sync
          ◀─ ExcelOpError (chưa ghi gì) hoặc lỗi Office.js (giữ nguyên mã)
```

## Quy ước của `src/office/core/`

- Mọi hàm nhận `context` của một `Excel.run` do nơi gọi mở. Nhờ vậy nhiều thao tác gom vào cùng một batch, và không proxy object nào sống ngoài `Excel.run`.
- Gom `load` rồi mới `sync`; không `sync` trong vòng lặp. Ví dụ: cập nhật 50 dòng của Table chỉ tốn một lần sync ghi.
- Kiểm tra đầu vào trước khi gửi lệnh ghi. Lỗi kiểm tra là `ExcelOpError`, lúc đó chưa có ô nào bị đổi.
- Lỗi Office.js (có `code`, ví dụ `AccessDenied`) được ném tiếp nguyên vẹn. `describeOfficeError` dịch cả hai loại sang tiếng Việt.
- Không tự thử lại thao tác ghi.
- Chỉ sửa Table do ConsQuotation tạo (tên bắt đầu bằng `CQ_`). Table khác chỉ được đọc.
- Không xóa sheet. Không đổi tên sheet trừ khi người dùng yêu cầu rõ cho sheet đó.
- Không lấy đường dẫn file của workbook.

## Module và hàm

### Workbook và worksheet: `core/worksheets.ts`

| Hàm | Việc làm |
|---|---|
| `readWorkbookInfo(ctx)` | Tên workbook (nếu Excel cho biết), chỉ đọc, cấu trúc bị khóa, sheet hiện hành, số sheet |
| `readActiveWorksheet(ctx)` | Tên, bị bảo vệ, vùng có dữ liệu của sheet hiện hành |
| `listWorksheets(ctx)` | Tên, vị trí, ẩn/hiện, bị bảo vệ của mọi sheet |
| `findWorksheet(ctx, name)` / `requireWorksheet` | Tìm theo tên (không phân biệt hoa thường); `require…` ném `sheetNotFound` |
| `createWorksheet(ctx, name, ifExists)` | `ifExists`: `"error"` ném `sheetExists`, `"reuse"` dùng lại (chạy lặp không tạo trùng), `"suffix"` thêm (2), (3)… |
| `renameWorksheet(ctx, from, to)` | Kiểm tra tên hợp lệ, không trùng sheet khác, cấu trúc workbook không bị khóa |
| `assertSheetEditable(ctx, sheet)` | Ném `protected` nếu sheet bị bảo vệ |

### Vùng ô: `core/ranges.ts`

| Hàm | Việc làm |
|---|---|
| `readRange(ctx, {sheetName, address}, maxCells?)` | Trả `values` (giá trị thực), `formulas`, `text` (chữ hiển thị), `valueTypes` và tóm tắt (ô trống, ô công thức, ô lỗi kèm địa chỉ) |
| `readUsedRange(ctx, sheetName, maxCells?)` | Như trên cho vùng có dữ liệu; `null` nếu sheet trống |
| `inspectRange(ctx, target)` | Chỉ đọc: số ô có dữ liệu, vân tay nội dung, sheet bị bảo vệ, Table chồng lên |
| `writeRange(ctx, target, matrix, options)` | Ghi ma trận theo khối, xem chi tiết bên dưới |
| `clearRangeContents(ctx, target, fingerprint)` | Xóa nội dung, giữ định dạng; luôn cần vân tay lúc kiểm tra |
| `usedRangeAddress(ctx, sheetName)` | Địa chỉ vùng có dữ liệu |

Quy tắc của `writeRange`:
- Địa chỉ dạng `A1` hoặc `A1:D10`, không kèm tên sheet. Không nhận cả cột, cả hàng hay nhiều vùng (`invalidAddress`).
- Ma trận phải chữ nhật và đúng kích thước vùng (`sizeMismatch`). Add-in không cắt bớt và không lặp lại dữ liệu.
- Ô chỉ nhận chữ, số hữu hạn, đúng/sai, `null` hoặc `""` (`invalidData`). Ngày phải đổi sang số sê-ri Excel trước khi ghi.
- `mode: "values"`: mọi chuỗi là chữ, kể cả chuỗi bắt đầu bằng `=`. Add-in luôn thêm tiền tố `'` để Excel không đổi "007" thành 7, "1/2" thành ngày, "10%" thành 0,1 (ADR-0008).
- `mode: "formulas"`: chuỗi bắt đầu bằng `=` là công thức Excel, cú pháp en-US (dấu `,`). Excel tự tính; add-in không tự đánh giá biểu thức.
- Vùng có dữ liệu thì chỉ ghi khi có `expectedFingerprint` lấy từ `inspectRange` lúc người dùng xác nhận, và vân tay vẫn khớp. Nếu không: `targetNotEmpty` hoặc `targetChanged`.
- Vùng chồng lên Table thì không ghi, trừ khi tên Table nằm trong `allowTables`.
- Giới hạn mặc định 100.000 ô mỗi lần (`tooLarge`).

### Excel Table: `core/tables.ts`

| Hàm | Việc làm |
|---|---|
| `listTables(ctx)` | Tên, sheet, số dòng, có phải bảng của add-in |
| `findTable` / `requireTable(ctx, name, owned = true)` | `tableNotFound`; `owned` thì bảng phải có tiền tố `CQ_` (`notOwned`) |
| `readTable(ctx, name)` | Tiêu đề, vùng, giá trị, công thức, `isEmpty` (bảng chỉ còn một dòng trống) |
| `createTable(ctx, {sheetName, address, name})` | Tên hợp lệ, có tiền tố `CQ_`, không trùng Table hay tên đã đặt (`tableExists`); vùng có ít nhất 2 hàng; tiêu đề không trống, không trùng; không chồng bảng khác |
| `addTableRows(ctx, name, rows, {mode, allowShiftDown})` | Số cột phải bằng số cột bảng. `null` giữ công thức cột tính toán. Bảng rỗng thì dòng đầu ghi vào dòng trống sẵn có. Có dữ liệu bên dưới bảng (trong các cột của bảng) thì báo `targetNotEmpty`, vì Excel sẽ đẩy các ô đó xuống; chỉ đặt `allowShiftDown` sau khi người dùng xác nhận |
| `updateTableRows(ctx, name, {column, equals}, patch)` | Tiêu chí khớp chính xác (cùng kiểu). Mặc định phải khớp đúng một dòng (`noMatch`, `ambiguousMatch`); một lần sync cho mọi ô |
| `deleteTableRows(ctx, name, criteria, {allowMultiple})` | Như trên; xóa từ dưới lên. Nơi gọi phải hỏi xác nhận trước |
| `addTableColumn(ctx, name, header, values?)` | Không trùng tên cột (`duplicateColumn`). Mọi ô bên phải bảng, trong các hàng của bảng, phải trống (`targetNotEmpty`): Excel chèn ô và đẩy toàn bộ các ô đó sang phải một cột, còn hàng ngoài bảng giữ nguyên nên dữ liệu bị lệch hàng (đã kiểm chứng 2026-10-26) |
| `cellsDisplacedBy(ctx, table, "right" | "below")` | Ô có dữ liệu sẽ bị dời khi bảng nở sang phải hoặc xuống dưới, xét tới hết vùng có dữ liệu |
| `loadTakenNames(ctx)` | Tên Table và tên đã đặt (dùng chung với tạo bảng báo giá) |

### Định dạng: `core/formatting.ts` và `domain/excel/formatRules.ts`

`formatRules.ts` là bộ quy tắc duy nhất. Nó gồm mã định dạng số, căn lề và độ rộng theo kiểu cột, kiểu tiêu đề, viền, kiểu Table, giới hạn autofit.

| Kiểu cột | Định dạng số | Căn lề |
|---|---|---|
| `text`, `code`, `integer`, `quantity` | `General` | trái (số: phải, STT: giữa) |
| `money` | `#,##0` | phải |
| `percent` | `0.00%` | phải |
| `date` | `dd/mm/yyyy;@` | giữa |

Định dạng chỉ đổi cách hiển thị, không đổi giá trị. Unit test kiểm tra định dạng tiền và ngày trùng với mẫu báo giá đang dùng.

| Hàm | Việc làm |
|---|---|
| `applyCellStyle`, `applyBorders`, `setColumnWidths`, `setRowHeight`, `applyNumberFormat` | Chỉ xếp lệnh vào batch; nơi gọi sync |
| `freezeTopRows(sheet, n)` | Cố định n hàng đầu (ExcelApi 1.7) |
| `autofitColumnsClamped(ctx, range, columns, min, max)` | Tự điều chỉnh độ rộng rồi kẹp vào khoảng cho phép |
| `formatTableBySchema(ctx, name, schema)` | Tiêu đề, viền, định dạng số, căn lề, độ rộng theo kiểu cột (hoặc `width` riêng của cột), cố định hàng tiêu đề, tự tăng chiều cao hàng dữ liệu để chữ xuống dòng không bị cắt khi in. Cột không thuộc schema giữ nguyên |
| `setTableHeaderVisible(table, visible)` | Ẩn/hiện hàng tiêu đề, không xóa tên cột |

### Schema bảng: `domain/excel/tableSchema.ts`

Một khai báo `TableSchema` gồm tên cột, kiểu, bắt buộc, cột công thức (`computed`) và giá trị nhỏ nhất. Từ schema suy ra cách kiểm tra dữ liệu, thứ tự cột và định dạng. Đổi cấu trúc bảng chỉ cần sửa một chỗ.

- `validateRecord(schema, record)`: không tự đổi kiểu ("12" ở cột số là lỗi). Ô trống ở cột không bắt buộc là trống, không phải 0. Cột công thức nhận `null`. Trường lạ bị báo lỗi.
- `matchHeaders`, `alignToHeaders`: ghi theo tên cột thực tế; cột người dùng tự thêm nhận `null`.
- `QUOTE_LINE_SCHEMA` (`domain/excel/quoteLineSchema.ts`): cấu trúc tham khảo 11 trường, gồm STT, mã, tên, đơn vị, khối lượng, đơn giá vật liệu, nhân công, máy, đơn giá tổng hợp, thành tiền, ghi chú. **Chưa phải mẫu báo giá chính thức**: lệnh Tạo bảng báo giá vẫn dùng `QUOTE_COLUMNS` (ADR-0009).

### Lỗi: `domain/excel/errors.ts`

`ExcelOpError.kind` là một trong các loại sau:
- sheet: `sheetNotFound`, `sheetExists`;
- bảng: `tableNotFound`, `tableExists`, `duplicateColumn`, `notOwned`;
- tên và địa chỉ: `invalidName`, `invalidAddress`;
- dữ liệu: `sizeMismatch`, `invalidData`, `tooLarge`;
- vùng đích: `targetNotEmpty`, `targetChanged`, `protected`, `unavailable`;
- môi trường: `unsupported`;
- tìm dòng: `noMatch`, `ambiguousMatch`.

Thông báo chỉ chứa tên sheet, Table, địa chỉ, không chứa nội dung ô. Nhật ký phiên (Cài đặt › Nhật ký lỗi) ghi:
- tên thao tác và mã lỗi;
- vị trí API Office.js (`debugInfo.errorLocation`, ví dụ `Range.values`).

Nhật ký không ghi `debugInfo.statement`, vì phần này có thể chứa giá trị ô.

## Cách gọi

```ts
import { runExcel, inspectRange, writeRange } from "../office/core";

// Ghi khối dữ liệu vào vùng trống; vùng có dữ liệu thì hỏi người dùng trước.
const target = { sheetName: "Báo giá", address: "B10:D12" };
const inspection = await runExcel("ví dụ: kiểm tra", (ctx) => inspectRange(ctx, target));
if (inspection.occupied.count > 0 && !(await askUser(inspection))) {
  return;
}
await runExcel("ví dụ: ghi", (ctx) =>
  writeRange(ctx, target, rows, {
    mode: "values",
    expectedFingerprint: inspection.occupied.count > 0 ? inspection.fingerprint : undefined,
  })
);
```

Gom nhiều thao tác vào một `Excel.run`:

```ts
await runExcel("ví dụ: tạo bảng", async (ctx) => {
  await createWorksheet(ctx, "Phân tích", "reuse");
  await writeRange(ctx, { sheetName: "Phân tích", address: "A1:C3" }, matrix, { mode: "formulas" });
  await createTable(ctx, { sheetName: "Phân tích", address: "A1:C3", name: "CQ_Analysis_2" });
  await formatTableBySchema(ctx, "CQ_Analysis_2", schema);
});
```

## Khu vực Kiểm thử Excel

Vị trí: Cài đặt › Kiểm thử Excel (dành cho phát triển). Khu vực này chỉ có trong bản phát triển (`npm start`). Bản production không đóng gói code này: webpack loại nhánh `__CQ_BUILD_MODE__ === "development"` lúc build. Các nút:
1. Đọc sheet hiện hành.
2. Liệt kê sheet.
3. Tạo sheet thử nghiệm "CQ Thử nghiệm". Chạy lặp thì dùng lại, không tạo trùng.
4. Ghi dữ liệu mẫu vào `B2:L7`. Vùng có dữ liệu thì hỏi xác nhận; vùng đã là bảng thì từ chối.
5. Tạo bảng `CQ_Test_Lab` từ dữ liệu mẫu. Đã có thì báo, không tạo trùng.
6. Định dạng bảng theo `QUOTE_LINE_SCHEMA`.
7. Đọc lại để xác nhận. Kết quả so từng ô với dữ liệu đã ghi và đếm ô lỗi (mong đợi 1 ô `#DIV/0!` cố ý).

Dữ liệu mẫu chỉ là dòng "Thử …". Mỗi dòng nhắm một tình huống:
- chữ có dấu;
- mã "007";
- chữ "1/2", "10%", "TRUE";
- số 0, ô trống;
- ký tự đặc biệt;
- công thức hợp lệ và công thức lỗi.

Các nút bị khóa khi đang chạy; mỗi lần chỉ chạy một thao tác.

## Kiểm thử

| Loại | Lệnh / file | Phạm vi |
|---|---|---|
| Unit | `npm test` (`tests/unit/excelIntegration.test.ts`) | Ma trận, địa chỉ, tên Table, schema, định dạng, dữ liệu mẫu, thông báo lỗi và nhật ký. Không giả lập Excel |
| Tích hợp trên Excel thật | `node tests/integration/run-in-taskpane.mjs tests/integration/excel-core.scenarios.js` | 26 tình huống gọi `src/office/core/` qua DevTools trong task pane bản phát triển |
| Thủ công | [tests/manual/excel-integration-checklist.md](../tests/manual/excel-integration-checklist.md) | Khu vực Kiểm thử Excel trên giao diện |

Chạy kiểm thử tích hợp:
1. `npm start`. Excel mở một workbook tạm.
2. Mở tab ConsQuotation (Dev) › Mở ConsQuotation, chờ task pane tải xong. Nếu hiện hộp thoại "WebView Stop On Load" thì bấm OK.
3. Ở terminal khác: `node tests/integration/run-in-taskpane.mjs tests/integration/excel-core.scenarios.js`. Mã thoát 0 là mọi tình huống đạt.

Phạm vi an toàn của kịch bản:
- chỉ tạo và xóa sheet tên bắt đầu bằng "CQ IT ";
- dừng ngay nếu workbook đã có sheet như vậy;
- dọn sạch sau khi chạy;
- runner chỉ kết nối `localhost:9229`.

## Requirement set

Mức tối thiểu lúc chạy vẫn là ExcelApi 1.8 (ADR-0002). Lớp core không dùng API vượt mức này.

| API | Requirement set | Thiếu thì sao |
|---|---|---|
| Range, Table, `tables.add`, `rows.add`, `TableRow.delete`, `columns.add`, borders | 1.1 | (mức tối thiểu) |
| `autofitColumns`, `autofitRows`, `worksheet.protection` | 1.2 | (mức tối thiểu) |
| `getItemOrNullObject`, `getUsedRangeOrNullObject`, `columns.add(…, name)` | 1.4 | (mức tối thiểu) |
| `Workbook.name`, `Workbook.protection`, `freezePanes` | 1.7 | Hàm kiểm tra bằng `supports()`; thiếu thì trả `null` hoặc bỏ qua |
| `Workbook.readOnly` | 1.8 | Như trên |

## Giới hạn tương thích

- Đã kiểm thử trên Excel Microsoft 365 Windows. Excel trên web và Mac chưa kiểm thử, xem [COMPATIBILITY.md](COMPATIBILITY.md).
- Excel trên web giới hạn khoảng 5 MB mỗi lần gửi. Giới hạn 100.000 ô của lớp core chưa đo trên web.
- Office.js không cho biết Excel đang ở chế độ sửa ô. Nếu người dùng đang gõ trong ô, thao tác ghi báo `InvalidOperation` kèm hướng dẫn nhấn Enter hoặc Esc.
- Thao tác ghi của add-in không hoàn tác được bằng Ctrl+Z. Vì vậy vùng có dữ liệu luôn được kiểm tra và hỏi xác nhận trước.
