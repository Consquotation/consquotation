/* global Excel, Office */

/** Tiện ích Office.js dùng chung cho các adapter trong src/office/ (ADR-0006). */

import { OccupiedCells } from "../application/workbookGateway";
import { summaryTableName } from "../domain/pricing/adjustments";
import { RoundingConfig, normalizeRounding } from "../domain/pricing/rounding";
import { termsNameFor } from "../domain/terms";
import { cellAddress } from "../shared/a1";
import { recordError } from "../shared/diagnostics";

/** Cấu hình tính giá của workbook (lưu trong workbook settings, đi theo file). */
export const PRICING_SETTINGS_KEY = "ConsQuotation.pricing";

export const SAMPLE_LIMIT = 5;

/** Băm djb2 — chỉ để so sánh "có thay đổi hay không", không dùng cho bảo mật. */
export function hashString(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

export function isEmptyCell(value: unknown): boolean {
  return value === "" || value === null || value === undefined;
}

export interface CellRect {
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
}

function insideOne(rect: CellRect, row: number, column: number): boolean {
  return (
    row >= rect.rowIndex &&
    row < rect.rowIndex + rect.rowCount &&
    column >= rect.columnIndex &&
    column < rect.columnIndex + rect.columnCount
  );
}

function inside(rects: CellRect | CellRect[] | undefined, row: number, column: number): boolean {
  const list = rects === undefined ? [] : Array.isArray(rects) ? rects : [rects];
  return list.some((rect) => insideOne(rect, row, column));
}

/** Đếm ô có nội dung; bỏ qua các ô thuộc vùng exclude (các khối của chính add-in). */
export function findOccupied(
  formulas: unknown[][],
  rowIndex: number,
  columnIndex: number,
  exclude?: CellRect | CellRect[]
): OccupiedCells {
  let count = 0;
  const sample: string[] = [];
  formulas.forEach((row, r) =>
    row.forEach((value, c) => {
      if (!isEmptyCell(value) && !inside(exclude, rowIndex + r, columnIndex + c)) {
        count++;
        if (sample.length < SAMPLE_LIMIT) {
          sample.push(cellAddress(rowIndex + r, columnIndex + c));
        }
      }
    })
  );
  return { count, sample };
}

export function supports(version: string): boolean {
  return Office.context.requirements.isSetSupported("ExcelApi", version);
}

export async function loadSheetNames(context: Excel.RequestContext): Promise<string[]> {
  const sheets = context.workbook.worksheets;
  sheets.load("items/name");
  await context.sync();
  return sheets.items.map((sheet) => sheet.name);
}

/**
 * Chạy một bước phụ sau khi thao tác chính đã được Excel xác nhận; nuốt lỗi có chủ đích
 * (bước phụ không được làm sai kết quả của thao tác chính).
 */
export async function bestEffort(
  context: Excel.RequestContext,
  queue: () => void | Promise<void>
): Promise<void> {
  try {
    await queue();
    await context.sync();
  } catch (error) {
    // Không làm hỏng kết quả thao tác chính (chỉ là điều hướng/metadata), nhưng không nuốt im lặng:
    // ghi mã lỗi vào nhật ký phiên.
    recordError("bước phụ sau khi ghi", error);
  }
}

/** Đọc quy tắc làm tròn của workbook; chưa cấu hình → không làm tròn. */
export async function readRounding(context: Excel.RequestContext): Promise<RoundingConfig> {
  const setting = context.workbook.settings.getItemOrNullObject(PRICING_SETTINGS_KEY);
  setting.load("value");
  await context.sync();
  const value = setting.isNullObject ? undefined : (setting.value as { rounding?: unknown } | null);
  return normalizeRounding(value?.rounding);
}

/**
 * Các khối của chính add-in nằm dưới bảng báo giá: bảng tổng hợp (CQ_Summary_n) và khu vực
 * ghi chú/điều khoản (tên CQ_Terms_n). Excel dời chúng cùng khi chèn dòng vào bảng báo giá
 * (đã kiểm chứng) nên không tính là "dữ liệu bên dưới" cần hỏi xác nhận.
 */
export async function ownBlocksBelow(
  context: Excel.RequestContext,
  quoteTableName: string
): Promise<{ summary?: CellRect; terms?: CellRect }> {
  const summary = context.workbook.tables.getItemOrNullObject(summaryTableName(quoteTableName));
  summary.load("name");
  const name = context.workbook.names.getItemOrNullObject(termsNameFor(quoteTableName));
  name.load("name");
  await context.sync();
  const summaryRange = summary.isNullObject ? undefined : summary.getRange();
  summaryRange?.load("rowIndex,columnIndex,rowCount,columnCount");
  const termsRange = name.isNullObject ? undefined : name.getRangeOrNullObject();
  termsRange?.load("rowIndex,columnIndex,rowCount,columnCount");
  await context.sync();
  const rect = (r: Excel.Range): CellRect => ({
    rowIndex: r.rowIndex,
    columnIndex: r.columnIndex,
    rowCount: r.rowCount,
    columnCount: r.columnCount,
  });
  return {
    summary: summaryRange ? rect(summaryRange) : undefined,
    terms: termsRange && !termsRange.isNullObject ? rect(termsRange) : undefined,
  };
}
