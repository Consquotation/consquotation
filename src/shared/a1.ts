/** Tiện ích địa chỉ ô kiểu A1. Chỉ số hàng/cột tính từ 0. */

export const MAX_ROWS = 1_048_576;
export const MAX_COLUMNS = 16_384;

export function columnToLetters(columnIndex: number): string {
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= MAX_COLUMNS) {
    throw new RangeError(`Chỉ số cột không hợp lệ: ${columnIndex}`);
  }
  let n = columnIndex + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function cellAddress(rowIndex: number, columnIndex: number): string {
  return `${columnToLetters(columnIndex)}${rowIndex + 1}`;
}

export function rangeAddress(
  rowIndex: number,
  columnIndex: number,
  rowCount: number,
  columnCount: number
): string {
  const start = cellAddress(rowIndex, columnIndex);
  if (rowCount === 1 && columnCount === 1) {
    return start;
  }
  return `${start}:${cellAddress(rowIndex + rowCount - 1, columnIndex + columnCount - 1)}`;
}

/** Bỏ phần tên sheet khỏi địa chỉ Office.js, ví dụ "'Báo giá'!A1:B2" → "A1:B2". */
export function stripSheetName(address: string): string {
  const bang = address.lastIndexOf("!");
  return bang >= 0 ? address.slice(bang + 1) : address;
}

/** Tên sheet đặt trong dấu nháy đơn để dùng trong địa chỉ hiển thị cho người dùng. */
export function qualifiedAddress(sheetName: string, address: string): string {
  return `'${sheetName.replace(/'/g, "''")}'!${address}`;
}

export function fitsInSheet(
  rowIndex: number,
  columnIndex: number,
  rowCount: number,
  columnCount: number
): boolean {
  return rowIndex + rowCount <= MAX_ROWS && columnIndex + columnCount <= MAX_COLUMNS;
}

export interface RangeRect {
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
}

/** "A" → 0, "AA" → 26. Trả về -1 nếu không phải chữ cột hợp lệ trong giới hạn của Excel. */
export function lettersToColumn(letters: string): number {
  if (!/^[A-Za-z]{1,3}$/.test(letters)) {
    return -1;
  }
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n <= MAX_COLUMNS ? n - 1 : -1;
}

const CELL_REF = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

function parseCell(text: string): { row: number; column: number } | null {
  const match = CELL_REF.exec(text);
  if (!match) {
    return null;
  }
  const column = lettersToColumn(match[1]);
  const row = Number(match[2]) - 1;
  if (column < 0 || row < 0 || row >= MAX_ROWS) {
    return null;
  }
  return { row, column };
}

/**
 * Đọc địa chỉ "A1" hoặc "A1:D10" (chấp nhận $, góc theo thứ tự bất kỳ).
 * Không nhận: tên sheet, nhiều vùng (dấu phẩy), cả cột "A:A" hoặc cả hàng "1:1", tên đã đặt.
 * Trả về null nếu không hợp lệ.
 */
export function parseRangeAddress(address: string): RangeRect | null {
  const parts = address.trim().split(":");
  if (parts.length > 2) {
    return null;
  }
  const first = parseCell(parts[0]);
  const second = parts.length === 2 ? parseCell(parts[1]) : first;
  if (!first || !second) {
    return null;
  }
  const top = Math.min(first.row, second.row);
  const left = Math.min(first.column, second.column);
  return {
    rowIndex: top,
    columnIndex: left,
    rowCount: Math.abs(first.row - second.row) + 1,
    columnCount: Math.abs(first.column - second.column) + 1,
  };
}
