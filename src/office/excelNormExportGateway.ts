/**
 * Ghi bảng diễn giải định mức vào một sheet mới bằng lớp src/office/core/ (ADR-0011, ADR-0013).
 * Sheet mới nên không có dữ liệu nào bị ghi đè; vùng ghi vẫn được kiểm tra trống trước khi ghi.
 */

import { NormExportGateway } from "../application/normExportGateway";
import { CQ_STYLE } from "../domain/excel/formatRules";
import {
  EXPLANATION_FORMATS,
  EXPLANATION_WIDTHS,
  ExplanationSheet,
} from "../domain/pricing/normExplanation";
import { rangeAddress } from "../shared/a1";
import {
  applyBorders,
  applyCellStyle,
  applyNumberFormat,
  createWorksheet,
  runExcel,
  setColumnWidths,
  writeRange,
} from "./core";

export class ExcelNormExportGateway implements NormExportGateway {
  writeExplanation(sheet: ExplanationSheet): Promise<{ sheetName: string; address: string }> {
    return runExcel("định mức: xuất bảng diễn giải", async (context) => {
      const created = await createWorksheet(context, sheet.sheetName, "suffix");
      const address = rangeAddress(0, 0, sheet.rows.length, sheet.columnCount);
      await writeRange(context, { sheetName: created.name, address }, sheet.rows, {
        mode: "formulas",
      });
      const ws = context.workbook.worksheets.getItem(created.name);
      const title = ws.getRange("A1");
      title.format.font.bold = true;
      title.format.font.size = 14;

      // Bảng thành phần: tiêu đề, viền, định dạng số theo cột.
      const tableRows = sheet.componentRows + 1;
      const table = ws.getRangeByIndexes(sheet.headerRow, 0, tableRows, sheet.columnCount);
      applyCellStyle(table.getRow(0), CQ_STYLE.header);
      applyBorders(table, CQ_STYLE.border);
      if (sheet.componentRows > 0) {
        EXPLANATION_FORMATS.forEach((format, column) => {
          applyNumberFormat(
            ws.getRangeByIndexes(sheet.headerRow + 1, column, sheet.componentRows, 1),
            format,
            sheet.componentRows,
            1
          );
        });
        const notes = ws.getRangeByIndexes(
          sheet.headerRow + 1,
          0,
          sheet.componentRows,
          sheet.columnCount
        );
        notes.format.wrapText = true;
        notes.format.verticalAlignment = "Top";
      }
      setColumnWidths(ws.getRangeByIndexes(0, 0, 1, sheet.columnCount), EXPLANATION_WIDTHS);

      // Phần tổng hợp: cột I (nhãn), J (công thức Excel), K (kết quả add-in).
      const summary = ws.getRangeByIndexes(sheet.summaryRow, 8, sheet.summaryRows, 3);
      applyCellStyle(summary.getRow(0), CQ_STYLE.header);
      applyBorders(summary, CQ_STYLE.border);
      applyNumberFormat(
        ws.getRangeByIndexes(sheet.summaryRow + 1, 9, sheet.summaryRows - 1, 2),
        "#,##0",
        sheet.summaryRows - 1,
        2
      );
      summary.getRow(sheet.summaryRows - 1).format.font.bold = true;
      ws.activate();
      await context.sync();
      return { sheetName: created.name, address };
    });
  }
}
