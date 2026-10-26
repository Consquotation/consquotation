/* global Excel */

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
  QuoteInfoRead,
  SheetRead,
  SheetSummary,
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
  INFO_VALUE_COLUMN_OFFSET,
  QUOTE_COLUMNS,
  QUOTE_TITLE,
  alignRowToHeaders,
  blankRowFlags,
  blankRowToFill,
  buildQuoteLayout,
  hasQuoteHeaders,
  quoteColumnFormulas,
  totalRowFormulas,
} from "../domain/quoteTemplate";
import { cellAddress, fitsInSheet, rangeAddress, stripSheetName } from "../shared/a1";
import {
  CellRect,
  SAMPLE_LIMIT,
  bestEffort,
  findOccupied,
  hashString,
  isEmptyCell,
  loadSheetNames,
  ownBlocksBelow,
  readRounding,
  supports,
} from "./excelHelpers";
import {
  INFO_DATE_FORMAT,
  INFO_FIELDS,
  INFO_SCAN_ROWS,
  InfoCell,
  InfoWrite,
  labelMatches,
} from "../domain/quoteInfo";
import { asLiteralText } from "../domain/workItemDraft";
import { loadTakenNames } from "./core/tables";
import { RawCell, excelSerialToIso, isDateNumberFormat } from "../domain/library/exchange/cells";

const SETTINGS_KEY = "ConsQuotation.quoteTables";
const LIBRARY_USED_KEY = "ConsQuotation.libraryUsed";
const NEW_SHEET_FINGERPRINT = "new-sheet";
/** Đọc sheet theo từng khối để không vượt giới hạn kích thước phản hồi (Excel trên web ~5 MB). */
const READ_CHUNK_ROWS = 2000;

interface QuoteTableRecord {
  tableName: string;
  createdAt: string;
  schemaVersion: 1;
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
        fillIndex: null,
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
  const dataBody = table.getDataBodyRange();
  dataBody.load("formulas");
  const used = sheet.getUsedRangeOrNullObject(true);
  used.load("rowIndex,rowCount");
  await context.sync();
  // Bảng tổng hợp và khu vực điều khoản của chính bảng này được Excel dời cùng khi chèn dòng.
  const own = await ownBlocksBelow(context, tableName);
  const ownRects = [own.summary, own.terms].filter((r): r is CellRect => r !== undefined);

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
    below = findOccupied(belowFormulas, lastRow + 1, full.columnIndex, ownRects);
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

  // Mẫu tạo sẵn vài dòng trống: ghi vào đó thay vì chèn thêm, để không còn dòng trống có STT bị in ra.
  // insertIndex null (cuối bảng, kể cả khi đang chọn dòng tổng/cả bảng như ngay sau khi tạo mẫu)
  // → dòng trống đầu tiên ở cuối bảng.
  const blank = blankRowFlags(headers, dataBody.formulas as unknown[][]);
  const fillIndex = blankRowToFill(blank, insertIndex);

  return {
    table,
    inspection: {
      tableName,
      sheetName: sheet.name,
      cellsBelow: below,
      blockers,
      insertIndex,
      fillIndex,
      // Không đưa vùng chọn vào vân tay: người dùng có thể click chỗ khác khi hộp xác nhận đang mở;
      // vị trí chèn đã được cố định ở insertIndex. Trạng thái trống của từng dòng thì có: nếu người
      // dùng vừa gõ vào dòng trống sắp được ghi, add-in dừng thay vì ghi đè.
      fingerprint: hashString(
        `${full.address}|${headers.join("\t")}|${JSON.stringify(belowFormulas)}|${blank
          .map((b) => (b ? 1 : 0))
          .join("")}`
      ),
    },
  };
}

interface InfoScan {
  read: QuoteInfoRead;
  sheet: Excel.Worksheet;
}

/** Dò nhãn thông tin báo giá trong các dòng phía trên tiêu đề bảng (cột đầu của bảng). */
async function scanQuoteInfo(context: Excel.RequestContext, tableName: string): Promise<InfoScan> {
  const table = context.workbook.tables.getItem(tableName);
  const sheet = context.workbook.tables.getItem(tableName).worksheet;
  sheet.load("name");
  sheet.protection.load("protected");
  const header = table.getHeaderRowRange();
  header.load("rowIndex,columnIndex");
  await context.sync();
  const first = Math.max(0, header.rowIndex - INFO_SCAN_ROWS);
  const count = header.rowIndex - first;
  const cells: InfoCell[] = INFO_FIELDS.map((f) => ({
    key: f.key,
    found: false,
    address: "",
    value: "",
    text: "",
    numberFormat: "General",
  }));
  if (count <= 0) {
    return {
      sheet,
      read: {
        sheetName: sheet.name,
        sheetProtected: sheet.protection.protected,
        cells,
        fingerprint: "",
      },
    };
  }
  const labels = sheet.getRangeByIndexes(first, header.columnIndex, count, 1);
  labels.load("values");
  const values = sheet.getRangeByIndexes(
    first,
    header.columnIndex + INFO_VALUE_COLUMN_OFFSET,
    count,
    1
  );
  values.load("values,text,numberFormat,formulas");
  await context.sync();
  const labelValues = labels.values;
  const cellValues = values.values;
  const cellText = values.text;
  const cellFormats = values.numberFormat;
  INFO_FIELDS.forEach((field, i) => {
    const r = labelValues.findIndex((row) => labelMatches(row[0], field.label));
    if (r >= 0) {
      cells[i] = {
        key: field.key,
        found: true,
        address: cellAddress(first + r, header.columnIndex + INFO_VALUE_COLUMN_OFFSET),
        value: cellValues[r][0],
        text: String(cellText[r][0] ?? ""),
        numberFormat: String(cellFormats[r][0] ?? "General"),
      };
    }
  });
  return {
    sheet,
    read: {
      sheetName: sheet.name,
      sheetProtected: sheet.protection.protected,
      cells,
      fingerprint: hashString(
        `${first}|${JSON.stringify(labelValues)}|${JSON.stringify(values.formulas)}`
      ),
    },
  };
}

export class ExcelWorkbookGateway implements WorkbookGateway {
  async readQuoteInfo(tableName: string): Promise<QuoteInfoRead> {
    return Excel.run(async (context) => (await scanQuoteInfo(context, tableName)).read);
  }

  async writeQuoteInfo(
    tableName: string,
    writes: InfoWrite[],
    expectedFingerprint: string
  ): Promise<void> {
    await Excel.run(async (context) => {
      const { read, sheet } = await scanQuoteInfo(context, tableName);
      if (read.fingerprint !== expectedFingerprint) {
        throw new TargetChangedError();
      }
      for (const write of writes) {
        const cell = read.cells.find((c) => c.key === write.key);
        if (!cell?.found) {
          throw new TargetChangedError();
        }
        const range = sheet.getRange(cell.address);
        if (write.kind === "clear") {
          range.clear(Excel.ClearApplyTo.contents);
        } else if (write.kind === "date") {
          range.numberFormat = [[INFO_DATE_FORMAT]];
          // Ngày là số nên Excel căn phải; căn trái cho thẳng hàng với các mục chữ khi in.
          range.format.horizontalAlignment = Excel.HorizontalAlignment.left;
          range.values = [[write.serial]];
        } else {
          range.values = [[asLiteralText(write.text)]];
        }
      }
      await context.sync();
    });
  }

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

      // Thành tiền theo quy tắc làm tròn của workbook (prompts/10).
      const formulas = quoteColumnFormulas(tableName, (await readRounding(context)).amount);
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
        if (column.wrap) {
          body.format.wrapText = true;
        }
      });

      // Bật dòng tổng: Excel CHÈN một hàng dưới bảng (trong phạm vi cột của bảng) và đẩy mọi ô
      // bên dưới xuống 1 hàng, kể cả khi hàng đó trống (đã kiểm chứng trên Excel 16.0.20430).
      // Hàng bị đẩy xuống ngay dưới dòng tổng là hàng cuối của vùng mẫu (đã xóa trống ở trên);
      // xóa nó và kéo ô bên dưới lên để dữ liệu ngoài vùng mẫu về đúng vị trí cũ (prompts/06).
      table.showTotals = true;
      await context.sync();
      const pushedDown = at(layout.totalRow + 1, 0, 1, layout.columnCount);
      pushedDown.load("formulas");
      await context.sync();
      if (!(pushedDown.formulas as unknown[][]).every((row) => row.every(isEmptyCell))) {
        // Không phải hàng trống của vùng mẫu như dự kiến: không xóa gì, báo lỗi để người dùng kiểm tra.
        throw new Error(
          "Excel đã chèn dòng tổng nhưng hàng ngay bên dưới không trống như dự kiến; add-in dừng lại và không xóa gì thêm."
        );
      }
      pushedDown.delete(Excel.DeleteShiftDirection.up);

      const totalRow = table.getTotalRowRange();
      totalRow.formulas = [totalRowFormulas(tableName)];
      totalRow.numberFormat = [QUOTE_COLUMNS.map((c) => c.numberFormat ?? "General")];

      // Độ rộng cột ảnh hưởng cả cột của sheet: chỉ đặt khi tạo trên sheet mới.
      if (isNewSheet) {
        QUOTE_COLUMNS.forEach((column, index) => {
          at(0, index).format.columnWidth = column.width;
        });
      }
      // Lệnh ghi phải được Excel xác nhận trước; các bước sau là phụ.
      await context.sync();

      // Bước phụ (sau khi ghi đã thành công): ghi metadata và chuyển tới bảng vừa tạo.
      // Lỗi ở đây (ví dụ cửa sổ workbook mất focus khi mở nhiều workbook) KHÔNG được làm
      // báo thất bại, nếu không người dùng sẽ bấm lại và tạo trùng bảng (prompts/06, 13).
      await bestEffort(context, async () => {
        await recordQuoteTable(context, tableName);
      });
      await bestEffort(context, () => {
        if (isNewSheet) {
          sheet.activate();
        }
        table.getRange().select();
      });

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
      // Hàng cuối của vùng chọn nằm trong bảng — để form hiển thị "sẽ chèn dưới hàng N".
      const selectedRows = new Map<string, number>();
      const selection = await loadSelection(context);
      if (selection) {
        const checks = quoteTables
          .filter((t) => t.sheet.name === selection.sheetName)
          .map((t) => {
            const table = context.workbook.tables.getItem(t.name);
            const intersection = table.getRange().getIntersectionOrNullObject(selection.range);
            intersection.load("rowIndex,rowCount");
            return { name: t.name, intersection };
          });
        await context.sync();
        checks
          .filter((c) => !c.intersection.isNullObject)
          .forEach((c) =>
            selectedRows.set(c.name, c.intersection.rowIndex + c.intersection.rowCount)
          );
      }

      return quoteTables.map((t) => ({
        tableName: t.name,
        sheetName: t.sheet.name,
        dataRowCount: t.rows.count,
        headersMatch: hasQuoteHeaders((t.header.values[0] ?? []).map((v) => String(v))),
        containsSelection: selectedRows.has(t.name),
        selectedSheetRow: selectedRows.get(t.name) ?? null,
      }));
    });
  }

  async wasLibraryUsed(): Promise<boolean> {
    return Excel.run(async (context) => {
      const setting = context.workbook.settings.getItemOrNullObject(LIBRARY_USED_KEY);
      setting.load("value");
      await context.sync();
      return !setting.isNullObject && setting.value === true;
    });
  }

  async markLibraryUsed(): Promise<void> {
    await Excel.run(async (context) => {
      context.workbook.settings.add(LIBRARY_USED_KEY, true);
      await context.sync();
    });
  }

  async listSheets(): Promise<{ sheets: SheetSummary[]; activeSheet: string }> {
    return Excel.run(async (context) => {
      const sheets = context.workbook.worksheets;
      sheets.load("items/name");
      const active = sheets.getActiveWorksheet();
      active.load("name");
      await context.sync();
      const used = sheets.items.map((sheet) => {
        const range = sheet.getUsedRangeOrNullObject(true);
        range.load("rowCount,columnCount");
        return range;
      });
      await context.sync();
      // Sheet trống vẫn trả về vùng A1: đọc giá trị ô đó để báo đúng là trống.
      const singles = used.map((range) => {
        if (range.isNullObject || range.rowCount * range.columnCount !== 1) {
          return null;
        }
        range.load("values");
        return range;
      });
      await context.sync();
      const isEmpty = (i: number) =>
        used[i].isNullObject || (singles[i] !== null && singles[i]!.values[0][0] === "");
      return {
        activeSheet: active.name,
        sheets: sheets.items.map((sheet, i) => ({
          name: sheet.name,
          rowCount: isEmpty(i) ? 0 : used[i].rowCount,
          columnCount: isEmpty(i) ? 0 : used[i].columnCount,
        })),
      };
    });
  }

  async readSheet(sheetName: string, maxRows: number): Promise<SheetRead> {
    return Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(sheetName);
      const used = sheet.getUsedRangeOrNullObject(true);
      used.load("rowIndex,columnIndex,rowCount,columnCount");
      await context.sync();
      const label = `Sheet "${sheetName}"`;
      if (used.isNullObject) {
        return { table: { label, firstRowNumber: 1, firstColumnIndex: 0, rows: [] }, totalRows: 0 };
      }
      const rowsToRead = Math.min(used.rowCount, maxRows);
      const rows: RawCell[][] = [];
      for (let offset = 0; offset < rowsToRead; offset += READ_CHUNK_ROWS) {
        const count = Math.min(READ_CHUNK_ROWS, rowsToRead - offset);
        const chunk = sheet.getRangeByIndexes(
          used.rowIndex + offset,
          used.columnIndex,
          count,
          used.columnCount
        );
        chunk.load("values,text,numberFormat");
        // Mỗi khối một lần sync: giữ kích thước phản hồi nhỏ (Excel trên web giới hạn ~5 MB).
        // eslint-disable-next-line office-addins/no-context-sync-in-loop
        await context.sync();
        const { values, text, numberFormat } = chunk;
        for (let r = 0; r < count; r++) {
          rows.push(
            values[r].map((value, c): RawCell => {
              const cell: RawCell = {
                value: value === "" ? null : (value as string | number | boolean),
              };
              if (typeof value === "number") {
                cell.text = text[r][c];
                if (isDateNumberFormat(String(numberFormat[r][c] ?? ""))) {
                  cell.date = excelSerialToIso(value) ?? undefined;
                }
              }
              return cell;
            })
          );
        }
      }
      return {
        table: {
          label,
          firstRowNumber: used.rowIndex + 1,
          firstColumnIndex: used.columnIndex,
          rows,
        },
        totalRows: used.rowCount,
      };
    });
  }

  async openNewWorkbook(base64: string): Promise<void> {
    await Excel.createWorkbook(base64);
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
    insertIndex: number | null,
    fillIndex: number | null
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
      const header = table.getHeaderRowRange();
      header.load("values");
      await context.sync();
      if (insertIndex !== null && (insertIndex < 0 || insertIndex > before.rowCount)) {
        throw new TargetChangedError();
      }
      if (
        fillIndex !== null &&
        (rows.length !== 1 || fillIndex < 0 || fillIndex >= before.rowCount)
      ) {
        throw new TargetChangedError();
      }
      // Công thức Thành tiền theo quy tắc làm tròn hiện tại của workbook (đọc ngay lúc ghi).
      const amountFormula =
        quoteColumnFormulas(tableName, (await readRounding(context)).amount).amount ?? "";
      const amountIndex = QUOTE_COLUMNS.findIndex((column) => column.key === "amount");
      const withAmount = rows.map((row) =>
        row.map((cell, i) => (i === amountIndex ? amountFormula : cell))
      );
      // Ghi theo tên cột: bảng có thể có thêm cột của người dùng hoặc đã đổi thứ tự cột.
      const headers = (header.values[0] ?? []).map((v) => String(v));
      const aligned = withAmount.map((row) => alignRowToHeaders(headers, row));
      if (aligned.some((row) => row === null)) {
        throw new TargetChangedError();
      }

      if (fillIndex !== null) {
        // Ghi vào dòng trống đã kiểm tra (vân tay bảo đảm dòng vẫn trống). Chỉ ghi các cột mẫu,
        // không đụng cột người dùng tự thêm.
        headers.forEach((header, column) => {
          const template = QUOTE_COLUMNS.findIndex((c) => c.header === header);
          if (template >= 0) {
            before.getCell(fillIndex, column).values = [[withAmount[0][template]]];
          }
        });
      } else {
        // null ở cột người dùng: Excel tự điền công thức cột tính toán (đã kiểm chứng trên Excel 16.0.20430).
        table.rows.add(insertIndex ?? undefined, aligned as unknown as (string | number)[][]);
      }
      const body = table.getDataBodyRange();
      body.load("rowIndex,columnIndex,rowCount,columnCount");
      await context.sync();

      const firstNewRow =
        fillIndex !== null
          ? body.rowIndex + fillIndex
          : insertIndex === null
            ? body.rowIndex + body.rowCount - rows.length
            : body.rowIndex + insertIndex;
      // Chọn dòng vừa thêm là bước phụ: lỗi (ví dụ workbook mất focus) không làm báo thất bại,
      // vì dòng đã được ghi — báo sai sẽ khiến người dùng thêm lại thành dòng trùng.
      await bestEffort(context, () => {
        table.worksheet
          .getRangeByIndexes(firstNewRow, body.columnIndex, rows.length, body.columnCount)
          .select();
      });
      return {
        tableName,
        sheetName: inspection.sheetName,
        address: rangeAddress(firstNewRow, body.columnIndex, rows.length, body.columnCount),
      };
    });
  }
}
