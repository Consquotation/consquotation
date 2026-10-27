/* global Excel */

/**
 * Adapter Excel cho hồ sơ báo giá (ADR-0014). Hồ sơ là Custom XML Part (ExcelApi 1.5) trong workbook,
 * nên đi cùng file khi người dùng lưu, gửi, mở trên máy khác. Mọi thao tác ghi ô đều đọc lại giá trị
 * cũ trong cùng Excel.run và dừng (TargetChangedError) nếu đã khác lúc người dùng xem.
 */

import {
  AnalysisCellWrite,
  ExtensionInspection,
  LineCellWrite,
  QuotationGateway,
  RecordChangedError,
  RecordRead,
  RecordUnreadableError,
  RowGuard,
} from "../application/quotationGateway";
import { TargetChangedError } from "../application/workbookGateway";
import { ANALYSIS_TABLE_NAME } from "../domain/pricing/analysis";
import {
  QUOTATION_XML_NAMESPACE,
  QuotationRecord,
  decodeRecord,
  encodeRecord,
  recordTableOf,
} from "../domain/quotation/model";
import {
  EXTENSION_COLUMNS,
  LINE_ID_HEADER,
  missingExtensionColumns,
} from "../domain/quoteTemplate";
import { addTableColumn, cellsDisplacedBy, runExcel } from "./core";
import { isEmptyCell } from "./excelHelpers";

interface FoundRecord {
  part: Excel.CustomXmlPart | null;
  read: RecordRead;
}

async function findRecord(context: Excel.RequestContext, tableName: string): Promise<FoundRecord> {
  const parts = context.workbook.customXmlParts.getByNamespace(QUOTATION_XML_NAMESPACE);
  parts.load("items/id");
  await context.sync();
  const loaded = parts.items.map((part) => ({ part, xml: part.getXml() }));
  await context.sync();
  for (const { part, xml: result } of loaded) {
    const xml = result.value;
    if (recordTableOf(xml) !== tableName) {
      continue;
    }
    const decoded = decodeRecord(xml);
    return {
      part,
      read: decoded.ok
        ? { kind: "ok", record: decoded.record }
        : { kind: "unreadable", reason: decoded.reason, message: decoded.message },
    };
  }
  return { part: null, read: { kind: "none" } };
}

async function isSheetProtected(
  context: Excel.RequestContext,
  table: Excel.Table
): Promise<boolean> {
  const sheet = table.worksheet;
  sheet.load("protection/protected");
  await context.sync();
  return sheet.protection.protected;
}

/** Ô trống của Excel đọc ra "", giá trị chờ có thể là null/undefined: coi như nhau. */
function sameCell(actual: unknown, expected: unknown): boolean {
  if (isEmptyCell(actual) || isEmptyCell(expected)) {
    return isEmptyCell(actual) && isEmptyCell(expected);
  }
  return actual === expected;
}

/** Chữ ghi kèm tiền tố ' để Excel giữ nguyên dạng chữ (ADR-0008, kết quả 5). */
function cellInput(value: string | number): string | number {
  return typeof value === "string" && value !== "" && !value.startsWith("'") ? `'${value}` : value;
}

export class ExcelQuotationGateway implements QuotationGateway {
  async readRecord(tableName: string): Promise<RecordRead> {
    return runExcel(
      "Đọc hồ sơ báo giá",
      async (context) => (await findRecord(context, tableName)).read
    );
  }

  async saveRecord(record: QuotationRecord, expectedUpdatedAt: string | null): Promise<void> {
    await runExcel("Lưu hồ sơ báo giá", async (context) => {
      const found = await findRecord(context, record.tableName);
      if (found.read.kind === "unreadable") {
        throw new RecordUnreadableError(found.read.message);
      }
      const current = found.read.kind === "ok" ? found.read.record.updatedAt : null;
      if (current !== expectedUpdatedAt) {
        throw new RecordChangedError();
      }
      const xml = encodeRecord(record);
      if (found.part) {
        found.part.setXml(xml);
      } else {
        context.workbook.customXmlParts.add(xml);
      }
      await context.sync();
    });
  }

  async writeLineCells(
    tableName: string,
    writes: LineCellWrite[],
    guards: RowGuard[]
  ): Promise<void> {
    if (writes.length === 0) {
      return;
    }
    await runExcel("Ghi dòng báo giá", async (context) => {
      const table = context.workbook.tables.getItemOrNullObject(tableName);
      table.load("name");
      await context.sync();
      if (table.isNullObject) {
        throw new TargetChangedError();
      }
      const headerRange = table.getHeaderRowRange();
      headerRange.load("values");
      const body = table.getDataBodyRange();
      body.load("rowCount");
      await context.sync();
      const headers = (headerRange.values[0] ?? []).map((v) => String(v));
      const cellAt = (row: number, header: string) => {
        const column = headers.indexOf(header);
        if (column < 0 || row < 0 || row >= body.rowCount) {
          throw new TargetChangedError();
        }
        const range = body.getCell(row, column);
        range.load("values");
        return range;
      };
      const targets = writes.map((write) => ({ write, range: cellAt(write.row, write.header) }));
      const checks = guards.flatMap((guard) =>
        Object.entries(guard.expected).map(([header, expected]) => ({
          expected,
          range: cellAt(guard.row, header),
        }))
      );
      await context.sync();
      const unchanged =
        targets.every(({ write, range }) => sameCell(range.values[0][0], write.expected)) &&
        checks.every(({ expected, range }) => sameCell(range.values[0][0], expected));
      if (!unchanged) {
        throw new TargetChangedError();
      }
      for (const { write, range } of targets) {
        range.values = [[cellInput(write.value)]];
      }
      await context.sync();
    });
  }

  async writeAnalysisCells(writes: AnalysisCellWrite[]): Promise<void> {
    if (writes.length === 0) {
      return;
    }
    await runExcel("Ghi sheet phân tích", async (context) => {
      const table = context.workbook.tables.getItemOrNullObject(ANALYSIS_TABLE_NAME);
      table.load("name");
      await context.sync();
      if (table.isNullObject) {
        throw new TargetChangedError();
      }
      const headerRange = table.getHeaderRowRange();
      headerRange.load("values,rowIndex,columnIndex");
      const body = table.getDataBodyRange();
      body.load("rowIndex,rowCount");
      await context.sync();
      const headers = (headerRange.values[0] ?? []).map((v) => String(v));
      const sheet = table.worksheet;
      const targets = writes.map((write) => {
        const column = headers.indexOf(write.header);
        if (
          column < 0 ||
          write.rowIndex < body.rowIndex ||
          write.rowIndex >= body.rowIndex + body.rowCount
        ) {
          throw new TargetChangedError();
        }
        const range = sheet.getCell(write.rowIndex, headerRange.columnIndex + column);
        range.load("values");
        return { write, range };
      });
      await context.sync();
      if (!targets.every(({ write, range }) => sameCell(range.values[0][0], write.expected))) {
        throw new TargetChangedError();
      }
      for (const { write, range } of targets) {
        range.values = [[cellInput(write.value)]];
      }
      await context.sync();
    });
  }

  async inspectExtensionColumns(tableName: string): Promise<ExtensionInspection> {
    return runExcel("Kiểm tra cột mở rộng", async (context) => {
      const table = context.workbook.tables.getItem(tableName);
      const headerRange = table.getHeaderRowRange();
      headerRange.load("values");
      const sheetProtected = await isSheetProtected(context, table);
      const headers = (headerRange.values[0] ?? []).map((v) => String(v));
      const missing = missingExtensionColumns(headers).map((c) => c.header);
      const cellsRight =
        missing.length > 0
          ? await cellsDisplacedBy(context, table, "right")
          : { count: 0, sample: [] };
      return { missing, cellsRight, sheetProtected };
    });
  }

  async addExtensionColumns(tableName: string): Promise<string[]> {
    return runExcel("Bổ sung cột quản lý theo dòng", async (context) => {
      const table = context.workbook.tables.getItem(tableName);
      const headerRange = table.getHeaderRowRange();
      headerRange.load("values");
      await context.sync();
      const missing = missingExtensionColumns((headerRange.values[0] ?? []).map((v) => String(v)));
      // addTableColumn kiểm tra lại: sheet bị bảo vệ, trùng tên cột, ô bên phải bảng có dữ liệu.
      for (const column of missing) {
        await addTableColumn(context, tableName, column.header);
      }
      if (missing.length === 0) {
        return [];
      }
      const body = table.getDataBodyRange();
      body.load("rowCount");
      await context.sync();
      for (const column of missing) {
        const columnRange = table.columns.getItem(column.header);
        if (column.numberFormat && body.rowCount > 0) {
          columnRange.getDataBodyRange().numberFormat = Array.from(
            { length: body.rowCount },
            () => [column.numberFormat as string]
          );
        }
      }
      // Cột Mã dòng: ẩn cả cột của sheet chỉ khi ngoài bảng cột đó không có gì (ẩn cột ảnh hưởng mọi
      // hàng); nếu không thì để hiện, chữ xám.
      if (missing.some((c) => c.header === LINE_ID_HEADER)) {
        const idColumn = table.columns.getItem(LINE_ID_HEADER).getRange();
        idColumn.load("rowIndex,rowCount");
        const used = idColumn.getEntireColumn().getUsedRangeOrNullObject(true);
        used.load("rowIndex,rowCount");
        await context.sync();
        const onlyTable =
          used.isNullObject ||
          (used.rowIndex >= idColumn.rowIndex &&
            used.rowIndex + used.rowCount <= idColumn.rowIndex + idColumn.rowCount + 1);
        if (onlyTable && EXTENSION_COLUMNS.find((c) => c.header === LINE_ID_HEADER)?.hidden) {
          idColumn.getEntireColumn().columnHidden = true;
        } else {
          idColumn.format.font.color = "#808080";
        }
      }
      await context.sync();
      return missing.map((c) => c.header);
    });
  }
}
