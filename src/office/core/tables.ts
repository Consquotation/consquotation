/* global Excel */

/**
 * Excel Table: tạo, đọc, thêm/cập nhật/xóa dòng, thêm cột (quy ước chung: core/run.ts).
 *
 * Phạm vi sửa: chỉ bảng do ConsQuotation tạo (tên bắt đầu bằng CQ_). Bảng khác của người dùng
 * chỉ được đọc. Xóa dòng chỉ theo tiêu chí khớp chính xác và mặc định phải khớp đúng một dòng.
 */

import { ExcelOpError } from "../../domain/excel/errors";
import {
  CellInput,
  DEFAULT_MAX_CELLS,
  checkMatrix,
  toFormulaCells,
  toValueCells,
} from "../../domain/excel/matrix";
import { OccupiedCells } from "../../application/workbookGateway";
import { headerProblems } from "../../domain/excel/tableSchema";
import { checkTableName, isOwnedTableName, sameName } from "../../domain/naming";
import { rangeAddress, stripSheetName } from "../../shared/a1";
import { EXCEL_ERRORS } from "../../shared/strings.excel.vi";
import { findOccupied, isEmptyCell } from "../excelHelpers";
import { RangeTarget, inspectRange, parseTargetAddress } from "./ranges";
import { assertSheetEditable } from "./worksheets";

/** Sheet chứa bảng không bị bảo vệ (kiểm tra trước mọi thao tác ghi vào bảng). */
async function assertTableSheetEditable(
  context: Excel.RequestContext,
  table: Excel.Table
): Promise<void> {
  const sheet = table.worksheet;
  await assertSheetEditable(context, sheet);
}

/** Tên Table và tên đã đặt (cấp workbook và cấp sheet): tên Table mới không được trùng các tên này. */
export async function loadTakenNames(context: Excel.RequestContext): Promise<string[]> {
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

export async function findTable(
  context: Excel.RequestContext,
  name: string
): Promise<Excel.Table | null> {
  const table = context.workbook.tables.getItemOrNullObject(name);
  table.load("name");
  await context.sync();
  return table.isNullObject ? null : table;
}

/** Bảng phải tồn tại; `owned` (mặc định) thì phải do ConsQuotation tạo. */
export async function requireTable(
  context: Excel.RequestContext,
  name: string,
  owned = true
): Promise<Excel.Table> {
  const table = await findTable(context, name);
  if (!table) {
    throw new ExcelOpError("tableNotFound", EXCEL_ERRORS.tableNotFound(name));
  }
  if (owned && !isOwnedTableName(table.name)) {
    throw new ExcelOpError("notOwned", EXCEL_ERRORS.notOwned(table.name));
  }
  return table;
}

export interface TableSummary {
  name: string;
  sheetName: string;
  dataRowCount: number;
  owned: boolean;
}

export async function listTables(context: Excel.RequestContext): Promise<TableSummary[]> {
  const tables = context.workbook.tables;
  tables.load("items/name");
  await context.sync();
  const loaded = tables.items.map((table) => {
    const sheet = table.worksheet;
    sheet.load("name");
    const rows = table.rows;
    rows.load("count");
    return { name: table.name, sheet, rows };
  });
  await context.sync();
  return loaded.map((t) => ({
    name: t.name,
    sheetName: t.sheet.name,
    dataRowCount: t.rows.count,
    owned: isOwnedTableName(t.name),
  }));
}

export interface TableRead {
  name: string;
  sheetName: string;
  /** Vùng cả bảng (A1, không kèm tên sheet). */
  address: string;
  headers: string[];
  showHeaders: boolean;
  showTotals: boolean;
  /** Vùng dữ liệu (không gồm tiêu đề, dòng tổng). */
  bodyAddress: string;
  values: unknown[][];
  formulas: unknown[][];
  /**
   * Bảng không có dữ liệu: mọi ô vùng dữ liệu đều trống. Excel luôn giữ ít nhất một dòng trong
   * Table, nên bảng "rỗng" vẫn có một dòng trống.
   */
  isEmpty: boolean;
}

export async function readTable(context: Excel.RequestContext, name: string): Promise<TableRead> {
  const table = await requireTable(context, name, false);
  table.load("name,showHeaders,showTotals");
  const sheet = table.worksheet;
  sheet.load("name");
  const columns = table.columns;
  columns.load("items/name");
  const whole = table.getRange();
  whole.load("address");
  const body = table.getDataBodyRange();
  body.load("address,values,formulas");
  await context.sync();
  const formulas = body.formulas as unknown[][];
  return {
    name: table.name,
    sheetName: sheet.name,
    address: stripSheetName(whole.address),
    headers: columns.items.map((c) => c.name),
    showHeaders: table.showHeaders,
    showTotals: table.showTotals,
    bodyAddress: stripSheetName(body.address),
    values: body.values,
    formulas,
    isEmpty: formulas.every((row) => row.every(isEmptyCell)),
  };
}

export interface CreateTableOptions extends RangeTarget {
  /** Tên bảng; phải bắt đầu bằng CQ_ để add-in quản lý được về sau. */
  name: string;
  tableStyle?: string;
}

/**
 * Tạo Table từ vùng đã có dữ liệu, hàng đầu là tiêu đề. Vùng phải có ít nhất 2 hàng để Excel
 * không tự lấy thêm hàng bên dưới vùng. Không tạo trùng tên, không chồng lên bảng khác.
 */
export async function createTable(
  context: Excel.RequestContext,
  options: CreateTableOptions
): Promise<TableRead> {
  const check = checkTableName(options.name);
  if (!check.ok) {
    throw new ExcelOpError("invalidName", EXCEL_ERRORS.invalidTableName(check.message));
  }
  if (!isOwnedTableName(check.name)) {
    throw new ExcelOpError(
      "invalidName",
      EXCEL_ERRORS.invalidTableName("tên bảng do add-in tạo phải bắt đầu bằng CQ_.")
    );
  }
  const rect = parseTargetAddress(options.address);
  if (rect.rowCount < 2) {
    throw new ExcelOpError(
      "invalidAddress",
      EXCEL_ERRORS.invalidTableName("vùng phải có hàng tiêu đề và ít nhất một hàng dữ liệu.")
    );
  }
  const taken = await loadTakenNames(context);
  const clash = taken.find((n) => sameName(n, check.name));
  if (clash !== undefined) {
    throw new ExcelOpError("tableExists", EXCEL_ERRORS.tableExists(clash));
  }
  const inspection = await inspectRange(context, options);
  if (inspection.sheetProtected) {
    throw new ExcelOpError("protected", EXCEL_ERRORS.sheetProtected(inspection.sheetName));
  }
  if (inspection.overlappingTables.length > 0) {
    throw new ExcelOpError(
      "unavailable",
      EXCEL_ERRORS.tableOverlap(inspection.address, inspection.overlappingTables.join(", "))
    );
  }
  const sheet = context.workbook.worksheets.getItem(inspection.sheetName);
  const range = sheet.getRangeByIndexes(
    rect.rowIndex,
    rect.columnIndex,
    rect.rowCount,
    rect.columnCount
  );
  const headerRow = range.getRow(0);
  headerRow.load("values");
  await context.sync();
  const headers = (headerRow.values[0] ?? []).map((v) => (isEmptyCell(v) ? "" : String(v)));
  const problems = headerProblems(headers);
  if (problems.length > 0) {
    throw new ExcelOpError("invalidData", problems.join(" "));
  }
  const table = sheet.tables.add(range, true);
  table.name = check.name;
  if (options.tableStyle) {
    table.style = options.tableStyle;
  }
  await context.sync();
  return readTable(context, check.name);
}

/**
 * Ô có dữ liệu sẽ bị Excel dời chỗ khi bảng nở ra:
 * - "right" (thêm cột): Excel chèn ô trong các hàng của bảng, đẩy MỌI ô bên phải bảng ở các hàng
 *   đó sang phải một cột, còn hàng ngoài bảng giữ nguyên, nên dữ liệu bị lệch hàng;
 * - "below" (thêm dòng): Excel đẩy ô bên dưới bảng, trong các cột của bảng, xuống (ADR-0008, kết quả 6).
 * Đã kiểm chứng trên Excel 16.0.20430 (2026-10-26). Xét tới hết vùng có dữ liệu của sheet.
 */
export async function cellsDisplacedBy(
  context: Excel.RequestContext,
  table: Excel.Table,
  direction: "right" | "below"
): Promise<OccupiedCells> {
  const whole = table.getRange();
  whole.load("rowIndex,columnIndex,rowCount,columnCount");
  const sheet = table.worksheet;
  const used = sheet.getUsedRangeOrNullObject(true);
  used.load("rowIndex,columnIndex,rowCount,columnCount");
  await context.sync();
  if (used.isNullObject) {
    return { count: 0, sample: [] };
  }
  const rect =
    direction === "right"
      ? {
          rowIndex: whole.rowIndex,
          columnIndex: whole.columnIndex + whole.columnCount,
          rowCount: whole.rowCount,
          columnCount:
            used.columnIndex + used.columnCount - (whole.columnIndex + whole.columnCount),
        }
      : {
          rowIndex: whole.rowIndex + whole.rowCount,
          columnIndex: whole.columnIndex,
          rowCount: used.rowIndex + used.rowCount - (whole.rowIndex + whole.rowCount),
          columnCount: whole.columnCount,
        };
  if (rect.rowCount <= 0 || rect.columnCount <= 0) {
    return { count: 0, sample: [] };
  }
  const cells = rect.rowCount * rect.columnCount;
  if (cells > DEFAULT_MAX_CELLS) {
    throw new ExcelOpError("tooLarge", EXCEL_ERRORS.tooLarge(cells, DEFAULT_MAX_CELLS));
  }
  const region = sheet.getRangeByIndexes(
    rect.rowIndex,
    rect.columnIndex,
    rect.rowCount,
    rect.columnCount
  );
  region.load("formulas");
  await context.sync();
  const regionFormulas = region.formulas as unknown[][];
  return findOccupied(regionFormulas, rect.rowIndex, rect.columnIndex);
}

export interface AddRowsOptions {
  mode?: "values" | "formulas";
  /**
   * Cho phép Excel đẩy dữ liệu bên dưới bảng xuống. Chỉ đặt true sau khi người dùng đã xác nhận;
   * mặc định thì báo "targetNotEmpty" và không ghi gì.
   */
  allowShiftDown?: boolean;
}

/**
 * Thêm dòng vào cuối bảng. Số cột phải bằng số cột của bảng (dùng alignToHeaders nếu bảng có
 * cột người dùng tự thêm). null giữ công thức của cột tính toán.
 * Bảng rỗng (một dòng trống) thì dòng đầu được ghi vào dòng trống đó thay vì để lại dòng trống.
 */
export async function addTableRows(
  context: Excel.RequestContext,
  tableName: string,
  rows: CellInput[][],
  options: AddRowsOptions = {}
): Promise<{ address: string; filledBlankRow: boolean }> {
  const mode = options.mode ?? "values";
  const shape = checkMatrix(rows);
  await requireTable(context, tableName);
  const current = await readTable(context, tableName);
  if (shape.columnCount !== current.headers.length) {
    throw new ExcelOpError(
      "sizeMismatch",
      EXCEL_ERRORS.sizeMismatch(
        `bảng ${current.name}`,
        shape.rowCount,
        current.headers.length,
        shape.rowCount,
        shape.columnCount
      )
    );
  }
  const table = context.workbook.tables.getItem(current.name);
  await assertTableSheetEditable(context, table);
  const cells = mode === "formulas" ? toFormulaCells(rows, null) : toValueCells(rows, null);
  const fillBlank = current.isEmpty && current.values.length === 1;
  const rest = fillBlank ? cells.slice(1) : cells;
  if (rest.length > 0 && !options.allowShiftDown) {
    const below = await cellsDisplacedBy(context, table, "below");
    if (below.count > 0) {
      throw new ExcelOpError(
        "targetNotEmpty",
        EXCEL_ERRORS.shiftDown(current.name, below.count, below.sample.join(", "))
      );
    }
  }
  if (fillBlank) {
    const firstRow = table.getDataBodyRange().getRow(0);
    if (mode === "formulas") {
      firstRow.formulas = [cells[0]];
    } else {
      firstRow.values = [cells[0]];
    }
  }
  if (rest.length > 0) {
    // null: Excel tự điền công thức cột tính toán (đã kiểm chứng trên Excel 16.0.20430).
    table.rows.add(undefined, rest as unknown as (string | number | boolean)[][]);
  }
  const body = table.getDataBodyRange();
  body.load("rowIndex,columnIndex,rowCount,columnCount");
  await context.sync();
  const added = shape.rowCount;
  return {
    address: rangeAddress(
      body.rowIndex + body.rowCount - added,
      body.columnIndex,
      added,
      body.columnCount
    ),
    filledBlankRow: fillBlank,
  };
}

/** Tiêu chí chọn dòng: giá trị ô ở cột `column` bằng đúng `equals` (cùng kiểu, không đổi kiểu). */
export interface RowCriteria {
  column: string;
  equals: string | number | boolean;
}

function columnIndex(table: TableRead, header: string): number {
  const index = table.headers.findIndex((h) => sameName(h, header));
  if (index < 0) {
    throw new ExcelOpError("invalidData", EXCEL_ERRORS.columnMissing(table.name, header));
  }
  return index;
}

/** Chỉ số (trong vùng dữ liệu, tính từ 0) của các dòng khớp tiêu chí. */
export function matchRowIndices(table: TableRead, criteria: RowCriteria): number[] {
  const column = columnIndex(table, criteria.column);
  const indices: number[] = [];
  table.values.forEach((row, i) => {
    if (row[column] === criteria.equals) {
      indices.push(i);
    }
  });
  return indices;
}

function requireMatches(table: TableRead, criteria: RowCriteria, allowMultiple: boolean): number[] {
  const indices = matchRowIndices(table, criteria);
  const shown = String(criteria.equals);
  if (indices.length === 0) {
    throw new ExcelOpError("noMatch", EXCEL_ERRORS.noMatch(criteria.column, shown));
  }
  if (indices.length > 1 && !allowMultiple) {
    throw new ExcelOpError(
      "ambiguousMatch",
      EXCEL_ERRORS.ambiguousMatch(criteria.column, shown, indices.length)
    );
  }
  return indices;
}

/**
 * Cập nhật các cột trong `patch` của dòng khớp tiêu chí. Mặc định phải khớp đúng một dòng.
 * Ghi đè công thức của cột tính toán sẽ làm ô đó khác cột: nơi gọi không nên đưa cột computed vào patch.
 */
export async function updateTableRows(
  context: Excel.RequestContext,
  tableName: string,
  criteria: RowCriteria,
  patch: Record<string, CellInput>,
  options: { allowMultiple?: boolean; mode?: "values" | "formulas" } = {}
): Promise<number> {
  await requireTable(context, tableName);
  const current = await readTable(context, tableName);
  const updates = Object.entries(patch).map(([header, value]) => ({
    column: columnIndex(current, header),
    value,
  }));
  if (updates.length === 0) {
    return 0;
  }
  const indices = requireMatches(current, criteria, options.allowMultiple ?? false);
  const mode = options.mode ?? "values";
  const converted = (mode === "formulas" ? toFormulaCells : toValueCells)([
    updates.map((u) => u.value),
  ]);
  const table = context.workbook.tables.getItem(current.name);
  await assertTableSheetEditable(context, table);
  const body = table.getDataBodyRange();
  for (const index of indices) {
    updates.forEach((u, i) => {
      const cell = body.getCell(index, u.column);
      if (mode === "formulas") {
        cell.formulas = [[converted[0][i]]];
      } else {
        cell.values = [[converted[0][i]]];
      }
    });
  }
  await context.sync();
  return indices.length;
}

/**
 * Xóa dòng khớp tiêu chí (từ dưới lên để chỉ số không lệch). Mặc định phải khớp đúng một dòng;
 * nơi gọi phải hỏi người dùng xác nhận trước vì thao tác không hoàn tác được bằng Ctrl+Z.
 */
export async function deleteTableRows(
  context: Excel.RequestContext,
  tableName: string,
  criteria: RowCriteria,
  options: { allowMultiple?: boolean } = {}
): Promise<number> {
  await requireTable(context, tableName);
  const current = await readTable(context, tableName);
  const indices = requireMatches(current, criteria, options.allowMultiple ?? false);
  const table = context.workbook.tables.getItem(current.name);
  await assertTableSheetEditable(context, table);
  [...indices].sort((a, b) => b - a).forEach((index) => table.rows.getItemAt(index).delete());
  await context.sync();
  return indices.length;
}

/**
 * Thêm cột ở bên phải bảng. Không trùng tên cột (Excel không phân biệt hoa thường). Các ô ngay
 * bên phải bảng phải trống: Excel sẽ đẩy chúng sang phải khi thêm cột.
 * `values` (nếu có) là giá trị cho từng dòng dữ liệu; chuỗi "=…" là công thức.
 */
export async function addTableColumn(
  context: Excel.RequestContext,
  tableName: string,
  header: string,
  values?: CellInput[]
): Promise<void> {
  await requireTable(context, tableName);
  const current = await readTable(context, tableName);
  const name = header.trim();
  const problems = headerProblems([...current.headers, name]);
  if (name === "" || problems.length > 0) {
    throw new ExcelOpError(
      name === "" ? "invalidData" : "duplicateColumn",
      name === ""
        ? EXCEL_ERRORS.emptyHeader(current.headers.length + 1)
        : EXCEL_ERRORS.duplicateColumn(current.name, name)
    );
  }
  if (values && values.length !== current.values.length) {
    throw new ExcelOpError(
      "sizeMismatch",
      EXCEL_ERRORS.sizeMismatch(
        `cột mới của ${current.name}`,
        current.values.length,
        1,
        values.length,
        1
      )
    );
  }
  const table = context.workbook.tables.getItem(current.name);
  await assertTableSheetEditable(context, table);
  const right = await cellsDisplacedBy(context, table, "right");
  if (right.count > 0) {
    throw new ExcelOpError(
      "targetNotEmpty",
      EXCEL_ERRORS.shiftRight(current.name, right.count, right.sample.join(", "))
    );
  }
  if (values) {
    // Cột mới không có công thức sẵn để giữ: ô null ghi là trống.
    const cells = toFormulaCells([values])[0] as (string | number | boolean)[];
    table.columns.add(undefined, [[name], ...cells.map((v) => [v])]);
  } else {
    table.columns.add(undefined, undefined, name);
  }
  await context.sync();
}
