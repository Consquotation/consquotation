/* global Excel, Office */

/**
 * Adapter Office.js cho WorkbookGateway. Nơi duy nhất gọi Excel.run (ADR-0006).
 * - Không giữ proxy object ra ngoài Excel.run.
 * - Gom load rồi sync; không sync trong vòng lặp ghi.
 * - Bước ghi kiểm tra lại vùng đích trong cùng Excel.run trước khi thay đổi bất cứ ô nào.
 */

import {
  AppendInspection,
  AppendedRows,
  CreatedQuote,
  InsertPosition,
  OccupiedCells,
  QuoteTableInfo,
  TargetBlocker,
  TargetChangedError,
  TargetInspection,
  TemplateTarget,
  WorkbookContext,
  WorkbookGateway,
} from "../application/workbookGateway";
import { isQuoteTableName, uniqueQuoteTableName, uniqueSheetName } from "../domain/naming";
import {
  QUOTE_COLUMNS,
  QUOTE_TITLE,
  buildQuoteLayout,
  hasQuoteHeaders,
  quoteColumnFormulas,
  totalRowFormulas,
} from "../domain/quoteTemplate";
import { cellAddress, fitsInSheet, rangeAddress, stripSheetName } from "../shared/a1";

const SAMPLE_LIMIT = 5;
const SETTINGS_KEY = "ConsQuotation.quoteTables";
const NEW_SHEET_FINGERPRINT = "new-sheet";

interface QuoteTableRecord {
  tableName: string;
  createdAt: string;
  schemaVersion: 1;
}

/** Băm djb2 — chỉ để so sánh "có thay đổi hay không", không dùng cho bảo mật. */
function hashString(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

function isEmptyCell(value: unknown): boolean {
  return value === "" || value === null || value === undefined;
}

function findOccupied(formulas: unknown[][], rowIndex: number, columnIndex: number): OccupiedCells {
  let count = 0;
  const sample: string[] = [];
  formulas.forEach((row, r) =>
    row.forEach((value, c) => {
      if (!isEmptyCell(value)) {
        count++;
        if (sample.length < SAMPLE_LIMIT) {
          sample.push(cellAddress(rowIndex + r, columnIndex + c));
        }
      }
    })
  );
  return { count, sample };
}

function supports(version: string): boolean {
  return Office.context.requirements.isSetSupported("ExcelApi", version);
}

async function loadSheetNames(context: Excel.RequestContext): Promise<string[]> {
  const sheets = context.workbook.worksheets;
  sheets.load("items/name");
  await context.sync();
  return sheets.items.map((sheet) => sheet.name);
}

/** Tên Table và tên đã đặt (cấp workbook và cấp sheet) — Table không được trùng các tên này. */
async function loadTakenNames(context: Excel.RequestContext): Promise<string[]> {
  const tables = context.workbook.tables;
  tables.load("items/name");
  const names = context.workbook.names;
  names.load("items/name");
  const sheets = context.workbook.worksheets;
  sheets.load("items/name");
  await context.sync();
  const sheetNames = sheets.items.map((sheet) => {
    const scoped = sheet.names;
    scoped.load("items/name");
    return scoped;
  });
  await context.sync();
  return [
    ...tables.items.map((t) => t.name),
    ...names.items.map((n) => n.name),
    ...sheetNames.flatMap((scoped) => scoped.items.map((n) => n.name)),
  ];
}

async function inspectInContext(
  context: Excel.RequestContext,
  target: TemplateTarget,
  rowCount: number,
  columnCount: number
): Promise<TargetInspection> {
  if (target.kind === "newSheet") {
    const sheetName = uniqueSheetName(target.baseName, await loadSheetNames(context));
    return {
      target,
      sheetName,
      address: rangeAddress(0, 0, rowCount, columnCount),
      occupied: { count: 0, sample: [] },
      blockers: [],
      fingerprint: NEW_SHEET_FINGERPRINT,
      skippedChecks: [],
    };
  }

  const { sheetName, rowIndex, columnIndex } = target;
  const base: Omit<TargetInspection, "occupied" | "blockers" | "fingerprint" | "skippedChecks"> = {
    target,
    sheetName,
    address: fitsInSheet(rowIndex, columnIndex, rowCount, columnCount)
      ? rangeAddress(rowIndex, columnIndex, rowCount, columnCount)
      : cellAddress(rowIndex, columnIndex),
  };

  const sheet = context.workbook.worksheets.getItemOrNullObject(sheetName);
  sheet.load("name");
  await context.sync();
  if (sheet.isNullObject) {
    return {
      ...base,
      occupied: { count: 0, sample: [] },
      blockers: [{ kind: "sheetMissing" }],
      fingerprint: "",
      skippedChecks: [],
    };
  }
  if (!fitsInSheet(rowIndex, columnIndex, rowCount, columnCount)) {
    return {
      ...base,
      occupied: { count: 0, sample: [] },
      blockers: [{ kind: "outOfBounds" }],
      fingerprint: "",
      skippedChecks: [],
    };
  }

  const range = sheet.getRangeByIndexes(rowIndex, columnIndex, rowCount, columnCount);
  range.load("formulas");
  sheet.protection.load("protected");
  const tables = sheet.tables;
  tables.load("items/name");
  const skippedChecks: string[] = [];
  let merged: Excel.RangeAreas | undefined;
  if (supports("1.13")) {
    merged = range.getMergedAreasOrNullObject();
    merged.load("address");
  } else {
    skippedChecks.push("mergedCells");
  }
  await context.sync();

  const overlaps = tables.items.map((table) => {
    const intersection = table.getRange().getIntersectionOrNullObject(range);
    intersection.load("address");
    return { name: table.name, intersection };
  });
  await context.sync();

  const blockers: TargetBlocker[] = [];
  if (sheet.protection.protected) {
    blockers.push({ kind: "protected" });
  }
  const overlapping = overlaps.filter((o) => !o.intersection.isNullObject).map((o) => o.name);
  if (overlapping.length > 0) {
    blockers.push({ kind: "tableOverlap", tableNames: overlapping });
  }
  if (merged && !merged.isNullObject) {
    blockers.push({
      kind: "mergedCells",
      addresses: merged.address
        .split(",")
        .map((part) => stripSheetName(part.trim()))
        .slice(0, SAMPLE_LIMIT),
    });
  }

  const formulas = range.formulas as unknown[][];
  return {
    ...base,
    occupied: findOccupied(formulas, rowIndex, columnIndex),
    blockers,
    fingerprint: hashString(`${sheetName}|${rowIndex}|${columnIndex}|${JSON.stringify(formulas)}`),
    skippedChecks,
  };
}

async function recordQuoteTable(context: Excel.RequestContext, tableName: string): Promise<void> {
  const settings = context.workbook.settings;
  const existing = settings.getItemOrNullObject(SETTINGS_KEY);
  existing.load("value");
  await context.sync();
  const records: QuoteTableRecord[] =
    !existing.isNullObject && Array.isArray(existing.value)
      ? (existing.value as QuoteTableRecord[])
      : [];
  settings.add(SETTINGS_KEY, [
    ...records.filter((r) => r.tableName !== tableName),
    { tableName, createdAt: new Date().toISOString(), schemaVersion: 1 },
  ]);
}

/** Vùng đang chọn và sheet chứa nó; undefined khi đang chọn thứ không phải ô (ví dụ biểu đồ). */
async function loadSelection(
  context: Excel.RequestContext
): Promise<{ range: Excel.Range; sheetName: string } | undefined> {
  try {
    // Vùng chọn luôn nằm trên sheet đang hoạt động.
    const range = context.workbook.getSelectedRange();
    range.load("address");
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    sheet.load("name");
    await context.sync();
    return { range, sheetName: sheet.name };
  } catch {
    return undefined;
  }
}

interface AppendState {
  inspection: AppendInspection;
  table?: Excel.Table;
}

/**
 * Chỉ số chèn (trong phần dữ liệu) cho "ngay dưới dòng đang chọn".
 * - Chọn ở hàng tiêu đề → chèn lên đầu (0).
 * - Chọn trong dữ liệu → chèn dưới hàng cuối của vùng chọn; nếu đó là hàng cuối → null (cuối bảng).
 * - Chọn ở dòng tổng → null (cuối bảng).
 * - Vùng chọn ngoài bảng hoặc khác sheet → "outside".
 */
async function resolveInsertIndex(
  context: Excel.RequestContext,
  table: Excel.Table,
  sheetName: string,
  full: Excel.Range
): Promise<number | null | "outside"> {
  const selection = await loadSelection(context);
  if (!selection || selection.sheetName !== sheetName) {
    return "outside";
  }
  const intersection = full.getIntersectionOrNullObject(selection.range);
  intersection.load("rowIndex,rowCount");
  const body = table.getDataBodyRange();
  body.load("rowIndex,rowCount");
  await context.sync();
  if (intersection.isNullObject) {
    return "outside";
  }
  const lastSelectedRow = intersection.rowIndex + intersection.rowCount - 1;
  if (lastSelectedRow < body.rowIndex) {
    return 0;
  }
  const afterIndex = lastSelectedRow - body.rowIndex + 1;
  return afterIndex >= body.rowCount ? null : afterIndex;
}

async function inspectAppendInContext(
  context: Excel.RequestContext,
  tableName: string,
  position: InsertPosition
): Promise<AppendState> {
  const table = context.workbook.tables.getItemOrNullObject(tableName);
  table.load("name");
  await context.sync();
  if (table.isNullObject) {
    return {
      inspection: {
        tableName,
        sheetName: "",
        cellsBelow: { count: 0, sample: [] },
        blockers: [{ kind: "tableMissing" }],
        insertIndex: null,
        fingerprint: "",
      },
    };
  }

  const sheet = table.worksheet;
  sheet.load("name");
  sheet.protection.load("protected");
  const header = table.getHeaderRowRange();
  header.load("values");
  const full = table.getRange();
  full.load("address,rowIndex,columnIndex,rowCount,columnCount");
  const used = sheet.getUsedRangeOrNullObject(true);
  used.load("rowIndex,rowCount");
  await context.sync();

  const lastRow = full.rowIndex + full.rowCount - 1;
  const usedLastRow = used.isNullObject ? -1 : used.rowIndex + used.rowCount - 1;
  let below: OccupiedCells = { count: 0, sample: [] };
  let belowFormulas: unknown[][] = [];
  if (usedLastRow > lastRow) {
    const belowRange = sheet.getRangeByIndexes(
      lastRow + 1,
      full.columnIndex,
      usedLastRow - lastRow,
      full.columnCount
    );
    belowRange.load("formulas");
    await context.sync();
    belowFormulas = belowRange.formulas as unknown[][];
    below = findOccupied(belowFormulas, lastRow + 1, full.columnIndex);
  }

  const headers = (header.values[0] ?? []).map((v) => String(v));
  const blockers: AppendInspection["blockers"] = [];
  if (sheet.protection.protected) {
    blockers.push({ kind: "protected" });
  }
  if (!hasQuoteHeaders(headers)) {
    blockers.push({ kind: "headersChanged" });
  }

  let insertIndex: number | null = null;
  if (position.kind === "belowSelection") {
    const resolved = await resolveInsertIndex(context, table, sheet.name, full);
    if (resolved === "outside") {
      blockers.push({ kind: "selectionOutsideTable" });
    } else {
      insertIndex = resolved;
    }
  }

  return {
    table,
    inspection: {
      tableName,
      sheetName: sheet.name,
      cellsBelow: below,
      blockers,
      insertIndex,
      // Không đưa vùng chọn vào vân tay: người dùng có thể click chỗ khác khi hộp xác nhận đang mở;
      // vị trí chèn đã được cố định ở insertIndex.
      fingerprint: hashString(
        `${full.address}|${headers.join("\t")}|${JSON.stringify(belowFormulas)}`
      ),
    },
  };
}

export class ExcelWorkbookGateway implements WorkbookGateway {
  async readContext(): Promise<WorkbookContext> {
    return Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      sheet.load("name,protection/protected");
      const workbook = context.workbook;
      const canReadName = supports("1.7");
      if (canReadName) {
        workbook.load("name");
      }
      await context.sync();

      // Vùng chọn có thể không phải ô (ví dụ đang chọn biểu đồ) — khi đó để trống.
      let selectionAddress = "";
      try {
        const selection = context.workbook.getSelectedRange();
        selection.load("address");
        await context.sync();
        selectionAddress = stripSheetName(selection.address);
      } catch {
        selectionAddress = "";
      }

      return {
        workbookName: canReadName ? workbook.name : null,
        sheetName: sheet.name,
        selectionAddress,
        sheetProtected: sheet.protection.protected,
      };
    });
  }

  async inspectAtSelection(rowCount: number, columnCount: number): Promise<TargetInspection> {
    return Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      sheet.load("name");
      const anchor = context.workbook.getSelectedRange().getCell(0, 0);
      anchor.load("rowIndex,columnIndex");
      await context.sync();
      return inspectInContext(
        context,
        {
          kind: "atCell",
          sheetName: sheet.name,
          rowIndex: anchor.rowIndex,
          columnIndex: anchor.columnIndex,
        },
        rowCount,
        columnCount
      );
    });
  }

  async inspectTarget(
    target: TemplateTarget,
    rowCount: number,
    columnCount: number
  ): Promise<TargetInspection> {
    return Excel.run((context) => inspectInContext(context, target, rowCount, columnCount));
  }

  async writeTemplate(
    target: TemplateTarget,
    initialRows: number,
    expectedFingerprint: string
  ): Promise<CreatedQuote> {
    return Excel.run(async (context) => {
      const layout = buildQuoteLayout(initialRows);
      const inspection = await inspectInContext(
        context,
        target,
        layout.rowCount,
        layout.columnCount
      );
      if (inspection.blockers.length > 0 || inspection.fingerprint !== expectedFingerprint) {
        throw new TargetChangedError();
      }

      const tableName = uniqueQuoteTableName(await loadTakenNames(context));
      const isNewSheet = target.kind === "newSheet";
      const sheet = isNewSheet
        ? context.workbook.worksheets.add(inspection.sheetName)
        : context.workbook.worksheets.getItem(inspection.sheetName);
      const row0 = target.kind === "atCell" ? target.rowIndex : 0;
      const col0 = target.kind === "atCell" ? target.columnIndex : 0;
      const at = (row: number, column: number, rows = 1, columns = 1) =>
        sheet.getRangeByIndexes(row0 + row, col0 + column, rows, columns);

      // Người dùng đã xác nhận ghi đè (hoặc vùng trống): xóa nội dung cũ trong đúng vùng mẫu
      // để dữ liệu cũ không lọt vào bảng mới, và đưa định dạng số về General để định dạng cũ
      // (%, ngày…) không làm sai cách hiển thị mẫu (prompts/06: công thức/format đúng).
      // Màu nền, viền… ngoài định dạng số được giữ nguyên.
      const region = at(0, 0, layout.rowCount, layout.columnCount);
      region.clear(Excel.ClearApplyTo.contents);
      region.numberFormat = Array.from({ length: layout.rowCount }, () =>
        Array.from({ length: layout.columnCount }, () => "General")
      );

      const title = at(layout.titleCell.row, layout.titleCell.column);
      title.values = [[QUOTE_TITLE]];
      title.format.font.bold = true;
      title.format.font.size = 14;

      for (const info of layout.infoRows) {
        at(info.row, 0).values = [[info.label]];
      }

      at(layout.headerRow, 0, 1, layout.columnCount).values = [QUOTE_COLUMNS.map((c) => c.header)];
      const table = sheet.tables.add(
        at(layout.headerRow, 0, 1 + layout.dataRowCount, layout.columnCount),
        true
      );
      table.name = tableName;

      const formulas = quoteColumnFormulas(tableName);
      QUOTE_COLUMNS.forEach((column) => {
        const body = table.columns.getItem(column.header).getDataBodyRange();
        const formula = formulas[column.key];
        if (formula) {
          body.formulas = Array.from({ length: layout.dataRowCount }, () => [formula]);
        }
        if (column.numberFormat) {
          body.numberFormat = Array.from({ length: layout.dataRowCount }, () => [
            column.numberFormat as string,
          ]);
        }
      });

      table.showTotals = true;
      const totalRow = table.getTotalRowRange();
      totalRow.formulas = [totalRowFormulas(tableName)];
      totalRow.numberFormat = [QUOTE_COLUMNS.map((c) => c.numberFormat ?? "General")];

      // Độ rộng cột ảnh hưởng cả cột của sheet: chỉ đặt khi tạo trên sheet mới.
      if (isNewSheet) {
        QUOTE_COLUMNS.forEach((column, index) => {
          at(0, index).format.columnWidth = column.width;
        });
        sheet.activate();
      }
      table.getRange().select();
      await context.sync();

      await recordQuoteTable(context, tableName);
      await context.sync();

      return {
        sheetName: inspection.sheetName,
        tableName,
        address: rangeAddress(row0, col0, layout.rowCount, layout.columnCount),
      };
    });
  }

  async listQuoteTables(): Promise<QuoteTableInfo[]> {
    return Excel.run(async (context) => {
      const tables = context.workbook.tables;
      tables.load("items/name");
      await context.sync();
      const quoteTables = tables.items
        .filter((table) => isQuoteTableName(table.name))
        .map((table) => {
          const sheet = table.worksheet;
          sheet.load("name");
          const header = table.getHeaderRowRange();
          header.load("values");
          const rows = table.rows;
          rows.load("count");
          return { name: table.name, sheet, header, rows };
        });
      await context.sync();

      // Bảng nào chứa vùng đang chọn — để form "Thêm công tác" chọn sẵn (prompts/05: không bắt nhập lại).
      const containing = new Set<string>();
      const selection = await loadSelection(context);
      if (selection) {
        const checks = quoteTables
          .filter((t) => t.sheet.name === selection.sheetName)
          .map((t) => {
            const table = context.workbook.tables.getItem(t.name);
            const intersection = table.getRange().getIntersectionOrNullObject(selection.range);
            intersection.load("address");
            return { name: t.name, intersection };
          });
        await context.sync();
        checks.filter((c) => !c.intersection.isNullObject).forEach((c) => containing.add(c.name));
      }

      return quoteTables.map((t) => ({
        tableName: t.name,
        sheetName: t.sheet.name,
        dataRowCount: t.rows.count,
        headersMatch: hasQuoteHeaders((t.header.values[0] ?? []).map((v) => String(v))),
        containsSelection: containing.has(t.name),
      }));
    });
  }

  async selectQuoteTable(tableName: string): Promise<void> {
    await Excel.run(async (context) => {
      const table = context.workbook.tables.getItem(tableName);
      table.worksheet.activate();
      table.getRange().select();
      await context.sync();
    });
  }

  async inspectAppend(tableName: string, position: InsertPosition): Promise<AppendInspection> {
    return Excel.run(
      async (context) => (await inspectAppendInContext(context, tableName, position)).inspection
    );
  }

  async appendRows(
    tableName: string,
    rows: (string | number)[][],
    expectedFingerprint: string,
    insertIndex: number | null
  ): Promise<AppendedRows> {
    return Excel.run(async (context) => {
      // Kiểm tra lại bảng (không phụ thuộc vùng chọn hiện tại); vị trí chèn dùng insertIndex đã cố định.
      const { inspection, table } = await inspectAppendInContext(context, tableName, {
        kind: "end",
      });
      if (
        !table ||
        inspection.blockers.length > 0 ||
        inspection.fingerprint !== expectedFingerprint
      ) {
        throw new TargetChangedError();
      }
      const before = table.getDataBodyRange();
      before.load("rowCount");
      await context.sync();
      if (insertIndex !== null && (insertIndex < 0 || insertIndex > before.rowCount)) {
        throw new TargetChangedError();
      }

      table.rows.add(insertIndex ?? undefined, rows);
      const body = table.getDataBodyRange();
      body.load("rowIndex,columnIndex,rowCount,columnCount");
      await context.sync();

      const firstNewRow =
        insertIndex === null
          ? body.rowIndex + body.rowCount - rows.length
          : body.rowIndex + insertIndex;
      table.worksheet
        .getRangeByIndexes(firstNewRow, body.columnIndex, rows.length, body.columnCount)
        .select();
      await context.sync();
      return {
        tableName,
        sheetName: inspection.sheetName,
        address: rangeAddress(firstNewRow, body.columnIndex, rows.length, body.columnCount),
      };
    });
  }
}
