/**
 * Lỗi có phân loại của lớp thao tác Excel (src/office/core/). Thuần TypeScript để test được.
 *
 * - `kind` cho code xử lý theo loại (ví dụ hỏi xác nhận khi `targetNotEmpty`).
 * - `message` là câu tiếng Việt cho người dùng; chỉ chứa tên sheet/Table/địa chỉ do add-in
 *   hoặc người dùng chọn, KHÔNG chứa nội dung ô (prompts/13, docs/SECURITY.md).
 * - Lỗi gốc của Office.js (có `code`) không bị bọc lại: officeErrors.ts dịch theo mã.
 */

export type ExcelErrorKind =
  | "sheetNotFound"
  | "sheetExists"
  | "tableNotFound"
  | "tableExists"
  | "invalidName"
  | "invalidAddress"
  | "sizeMismatch"
  | "invalidData"
  | "tooLarge"
  | "targetNotEmpty"
  | "targetChanged"
  | "notOwned"
  | "protected"
  | "unavailable"
  | "unsupported"
  | "noMatch"
  | "ambiguousMatch"
  | "duplicateColumn";

export class ExcelOpError extends Error {
  readonly kind: ExcelErrorKind;

  constructor(kind: ExcelErrorKind, message: string) {
    super(message);
    this.name = "ExcelOpError";
    this.kind = kind;
  }
}

export function isExcelOpError(error: unknown, kind?: ExcelErrorKind): error is ExcelOpError {
  return error instanceof ExcelOpError && (kind === undefined || error.kind === kind);
}
