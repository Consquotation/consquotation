/* global Excel */

/**
 * Đọc/ghi vùng ô theo khối (quy ước chung: core/run.ts).
 *
 * An toàn khi ghi:
 * - địa chỉ phải hợp lệ, ma trận phải đúng kích thước vùng đích;
 * - sheet bị bảo vệ hoặc vùng chồng lên Excel Table thì không ghi;
 * - vùng đích có dữ liệu thì chỉ ghi khi nơi gọi đưa vân tay (fingerprint) lấy lúc kiểm tra và
 *   vân tay vẫn khớp, tức là người dùng đã xác nhận đúng nội dung đang có.
 */

import { ExcelOpError } from "../../domain/excel/errors";
import {
  CellInput,
  DEFAULT_MAX_CELLS,
  ReadSummary,
  assertShape,
  checkMatrix,
  summarizeRead,
  toFormulaCells,
  toValueCells,
} from "../../domain/excel/matrix";
import { OccupiedCells } from "../../application/workbookGateway";
import { RangeRect, parseRangeAddress, rangeAddress, stripSheetName } from "../../shared/a1";
import { EXCEL_ERRORS } from "../../shared/strings.excel.vi";
import { findOccupied, hashString } from "../excelHelpers";
import { requireWorksheet } from "./worksheets";

export interface RangeTarget {
  sheetName: string;
  /** Địa chỉ A1 không kèm tên sheet, ví dụ "B3:F10". */
  address: string;
}

export function parseTargetAddress(address: string): RangeRect {
  const rect = parseRangeAddress(address);
  if (!rect) {
    throw new ExcelOpError("invalidAddress", EXCEL_ERRORS.invalidAddress(address));
  }
  return rect;
}

function cellsOf(rect: { rowCount: number; columnCount: number }): number {
  return rect.rowCount * rect.columnCount;
}

function assertWithinLimit(rect: { rowCount: number; columnCount: number }, maxCells: number) {
  if (cellsOf(rect) > maxCells) {
    throw new ExcelOpError("tooLarge", EXCEL_ERRORS.tooLarge(cellsOf(rect), maxCells));
  }
}

export interface RangeRead extends RangeRect {
  sheetName: string;
  address: string;
  /** Giá trị thực (số là số, ngày là số sê-ri, ô lỗi là chuỗi "#N/A"…). */
  values: unknown[][];
  /** Công thức (en-US); ô hằng số trả về chính giá trị. */
  formulas: unknown[][];
  /** Chữ hiển thị theo định dạng ô. */
  text: string[][];
  /** "Empty" | "String" | "Double" | "Boolean" | "Error" | "Integer"… */
  valueTypes: string[][];
  summary: ReadSummary;
}

async function loadRead(
  context: Excel.RequestContext,
  sheetName: string,
  range: Excel.Range,
  rect: RangeRect
): Promise<RangeRead> {
  range.load("values,formulas,text,valueTypes");
  await context.sync();
  const valueTypes = range.valueTypes as unknown as string[][];
  return {
    sheetName,
    address: rangeAddress(rect.rowIndex, rect.columnIndex, rect.rowCount, rect.columnCount),
    ...rect,
    values: range.values,
    formulas: range.formulas,
    text: range.text,
    valueTypes,
    summary: summarizeRead(range.values, range.formulas, valueTypes, rect),
  };
}

/** Đọc một vùng: giá trị thực, công thức, chữ hiển thị và kiểu ô. Không đổi kiểu dữ liệu. */
export async function readRange(
  context: Excel.RequestContext,
  target: RangeTarget,
  maxCells = DEFAULT_MAX_CELLS
): Promise<RangeRead> {
  const rect = parseTargetAddress(target.address);
  assertWithinLimit(rect, maxCells);
  const sheet = await requireWorksheet(context, target.sheetName);
  const range = sheet.getRangeByIndexes(
    rect.rowIndex,
    rect.columnIndex,
    rect.rowCount,
    rect.columnCount
  );
  return loadRead(context, target.sheetName, range, rect);
}

/**
 * Đọc vùng có dữ liệu của sheet (chỉ tính ô có giá trị, bỏ qua ô chỉ có định dạng).
 * null nếu sheet trống. Vượt giới hạn thì báo "tooLarge" trước khi tải dữ liệu.
 */
export async function readUsedRange(
  context: Excel.RequestContext,
  sheetName: string,
  maxCells = DEFAULT_MAX_CELLS
): Promise<RangeRead | null> {
  const sheet = await requireWorksheet(context, sheetName);
  const used = sheet.getUsedRangeOrNullObject(true);
  used.load("rowIndex,columnIndex,rowCount,columnCount");
  await context.sync();
  if (used.isNullObject) {
    return null;
  }
  const rect: RangeRect = {
    rowIndex: used.rowIndex,
    columnIndex: used.columnIndex,
    rowCount: used.rowCount,
    columnCount: used.columnCount,
  };
  assertWithinLimit(rect, maxCells);
  return loadRead(context, sheetName, used, rect);
}

export interface WriteInspection {
  sheetName: string;
  address: string;
  occupied: OccupiedCells;
  /** Vân tay nội dung (công thức) của vùng lúc kiểm tra. */
  fingerprint: string;
  sheetProtected: boolean;
  /** Excel Table có phần chồng lên vùng. */
  overlappingTables: string[];
}

export function fingerprintOf(sheetName: string, address: string, formulas: unknown[][]): string {
  return hashString(`${sheetName}|${address}|${JSON.stringify(formulas)}`);
}

/** Kiểm tra vùng trước khi ghi/xóa; chỉ đọc. */
export async function inspectRange(
  context: Excel.RequestContext,
  target: RangeTarget,
  maxCells = DEFAULT_MAX_CELLS
): Promise<WriteInspection> {
  const rect = parseTargetAddress(target.address);
  assertWithinLimit(rect, maxCells);
  const sheet = await requireWorksheet(context, target.sheetName);
  const range = sheet.getRangeByIndexes(
    rect.rowIndex,
    rect.columnIndex,
    rect.rowCount,
    rect.columnCount
  );
  range.load("formulas");
  sheet.load("name,protection/protected");
  const tables = sheet.tables;
  tables.load("items/name");
  await context.sync();
  const overlaps = tables.items.map((table) => {
    const part = table.getRange().getIntersectionOrNullObject(range);
    part.load("address");
    return { name: table.name, part };
  });
  await context.sync();
  const address = rangeAddress(rect.rowIndex, rect.columnIndex, rect.rowCount, rect.columnCount);
  const formulas = range.formulas as unknown[][];
  return {
    sheetName: sheet.name,
    address,
    occupied: findOccupied(formulas, rect.rowIndex, rect.columnIndex),
    fingerprint: fingerprintOf(sheet.name, address, formulas),
    sheetProtected: sheet.protection.protected,
    overlappingTables: overlaps.filter((o) => !o.part.isNullObject).map((o) => o.name),
  };
}

export interface WriteOptions {
  /**
   * "values": mọi chuỗi là chữ (kể cả "=…"). "formulas": chuỗi bắt đầu bằng "=" là công thức.
   */
  mode: "values" | "formulas";
  /**
   * Vân tay từ inspectRange khi người dùng đã xác nhận ghi đè. Không có: chỉ ghi vào vùng trống.
   */
  expectedFingerprint?: string;
  /** Cho phép ghi chồng lên các Table này (mặc định: không Table nào). */
  allowTables?: readonly string[];
  maxCells?: number;
}

function assertWritable(inspection: WriteInspection, options: WriteOptions): void {
  if (inspection.sheetProtected) {
    throw new ExcelOpError("protected", EXCEL_ERRORS.sheetProtected(inspection.sheetName));
  }
  const blocked = inspection.overlappingTables.filter(
    (name) =>
      !(options.allowTables ?? []).some((allowed) => allowed.toLowerCase() === name.toLowerCase())
  );
  if (blocked.length > 0) {
    throw new ExcelOpError(
      "unavailable",
      EXCEL_ERRORS.tableOverlap(inspection.address, blocked.join(", "))
    );
  }
  if (options.expectedFingerprint !== undefined) {
    if (options.expectedFingerprint !== inspection.fingerprint) {
      throw new ExcelOpError("targetChanged", EXCEL_ERRORS.targetChanged(inspection.address));
    }
  } else if (inspection.occupied.count > 0) {
    throw new ExcelOpError(
      "targetNotEmpty",
      EXCEL_ERRORS.targetNotEmpty(
        inspection.address,
        inspection.occupied.count,
        inspection.occupied.sample.join(", ")
      )
    );
  }
}

/**
 * Ghi ma trận vào vùng. Thứ tự: kiểm tra ma trận (không gọi Excel) → kiểm tra vùng đích →
 * ghi một lần → sync. Lỗi trước bước ghi thì chưa có ô nào bị thay đổi.
 */
export async function writeRange(
  context: Excel.RequestContext,
  target: RangeTarget,
  matrix: CellInput[][],
  options: WriteOptions
): Promise<{ sheetName: string; address: string }> {
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const shape = checkMatrix(matrix, maxCells);
  const rect = parseTargetAddress(target.address);
  assertShape(shape, rect, target.address);
  const cells = options.mode === "formulas" ? toFormulaCells(matrix) : toValueCells(matrix);
  const inspection = await inspectRange(context, target, maxCells);
  assertWritable(inspection, options);
  const sheet = context.workbook.worksheets.getItem(inspection.sheetName);
  const range = sheet.getRangeByIndexes(
    rect.rowIndex,
    rect.columnIndex,
    rect.rowCount,
    rect.columnCount
  );
  if (options.mode === "formulas") {
    range.formulas = cells;
  } else {
    range.values = cells;
  }
  await context.sync();
  return { sheetName: inspection.sheetName, address: inspection.address };
}

/**
 * Xóa nội dung (giữ định dạng) của vùng. Luôn cần vân tay lúc kiểm tra: không xóa vùng mà
 * người dùng chưa xem.
 */
export async function clearRangeContents(
  context: Excel.RequestContext,
  target: RangeTarget,
  expectedFingerprint: string,
  options: { allowTables?: readonly string[] } = {}
): Promise<void> {
  const rect = parseTargetAddress(target.address);
  const inspection = await inspectRange(context, target);
  assertWritable(inspection, {
    mode: "values",
    expectedFingerprint,
    allowTables: options.allowTables,
  });
  context.workbook.worksheets
    .getItem(inspection.sheetName)
    .getRangeByIndexes(rect.rowIndex, rect.columnIndex, rect.rowCount, rect.columnCount)
    .clear(Excel.ClearApplyTo.contents);
  await context.sync();
}

/** Địa chỉ A1 (không kèm tên sheet) của vùng có dữ liệu; null nếu sheet trống. */
export async function usedRangeAddress(
  context: Excel.RequestContext,
  sheetName: string
): Promise<string | null> {
  const sheet = await requireWorksheet(context, sheetName);
  const used = sheet.getUsedRangeOrNullObject(true);
  used.load("address");
  await context.sync();
  return used.isNullObject ? null : stripSheetName(used.address);
}
