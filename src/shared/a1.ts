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
