/**
 * Kiểm tra và chuẩn bị ma trận dữ liệu trước khi ghi vào Excel. Thuần TypeScript.
 *
 * Quy ước ô đầu vào (CellInput):
 * - chữ: ghi đúng nguyên văn. Luôn thêm tiền tố ' để Excel không tự đổi "007" thành 7,
 *   "1/2" thành ngày, "=…" thành công thức (ADR-0008, kết quả 5);
 * - số: phải hữu hạn; ghi nguyên giá trị, không làm tròn;
 * - đúng/sai: ghi giá trị logic;
 * - null hoặc "": ô trống (xóa nội dung cũ của ô khi ghi đè đã được xác nhận).
 * Ngày phải được đổi sang số sê-ri Excel trước (Date không được nhận để tránh lệch múi giờ).
 */

import { asLiteralText } from "../workItemDraft";
import { ExcelOpError } from "./errors";
import { EXCEL_ERRORS } from "../../shared/strings.excel.vi";
import { cellAddress } from "../../shared/a1";

export type CellInput = string | number | boolean | null;
export type CellOutput = string | number | boolean | null;

/**
 * Cách ghi ô null: "" xóa nội dung ô (ghi vùng); null giữ nguyên ô và công thức cột tính toán
 * của Table khi thêm dòng (đã kiểm chứng ở bản 1.8.0: ghi "" làm mất công thức cột).
 */
export type NullAs = "" | null;

export interface MatrixShape {
  rowCount: number;
  columnCount: number;
}

/** Giới hạn mặc định cho một lần ghi/đọc của lớp này (Excel trên web giới hạn ~5 MB mỗi lần gửi). */
export const DEFAULT_MAX_CELLS = 100_000;
export const MAX_TEXT_LENGTH = 32_767;
export const MAX_FORMULA_LENGTH = 8_192;

/** Giá trị lỗi Excel có thể xuất hiện trong Range.values. */
export const EXCEL_ERROR_VALUES: readonly string[] = [
  "#NULL!",
  "#DIV/0!",
  "#VALUE!",
  "#REF!",
  "#NAME?",
  "#NUM!",
  "#N/A",
  "#GETTING_DATA",
  "#SPILL!",
  "#CALC!",
  "#FIELD!",
  "#BLOCKED!",
  "#CONNECT!",
  "#BUSY!",
  "#UNKNOWN!",
];

function isCellInput(value: unknown): value is CellInput {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/**
 * Kiểm tra ma trận chữ nhật, không rỗng, mọi ô đúng kiểu, không vượt giới hạn.
 * Ném ExcelOpError("invalidData" | "tooLarge"). Hàng/cột trong thông báo tính từ 1.
 */
export function checkMatrix(matrix: unknown, maxCells = DEFAULT_MAX_CELLS): MatrixShape {
  if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0])) {
    throw new ExcelOpError("invalidData", EXCEL_ERRORS.matrixEmpty);
  }
  const columnCount = (matrix[0] as unknown[]).length;
  if (columnCount === 0) {
    throw new ExcelOpError("invalidData", EXCEL_ERRORS.matrixEmpty);
  }
  const cells = matrix.length * columnCount;
  if (cells > maxCells) {
    throw new ExcelOpError("tooLarge", EXCEL_ERRORS.tooLarge(cells, maxCells));
  }
  matrix.forEach((row: unknown, r) => {
    if (!Array.isArray(row) || row.length !== columnCount) {
      throw new ExcelOpError(
        "invalidData",
        EXCEL_ERRORS.matrixRagged(r + 1, columnCount, Array.isArray(row) ? row.length : 0)
      );
    }
    row.forEach((value: unknown, c) => {
      if (!isCellInput(value)) {
        throw new ExcelOpError("invalidData", EXCEL_ERRORS.cellType(r + 1, c + 1));
      }
      if (typeof value === "string" && value.length > MAX_TEXT_LENGTH) {
        throw new ExcelOpError("invalidData", EXCEL_ERRORS.textTooLong(r + 1, c + 1));
      }
    });
  });
  return { rowCount: matrix.length, columnCount };
}

/** Kích thước ma trận phải đúng bằng vùng đích; không cắt bớt, không lặp lại. */
export function assertShape(shape: MatrixShape, target: MatrixShape, targetAddress: string): void {
  if (shape.rowCount !== target.rowCount || shape.columnCount !== target.columnCount) {
    throw new ExcelOpError(
      "sizeMismatch",
      EXCEL_ERRORS.sizeMismatch(
        targetAddress,
        target.rowCount,
        target.columnCount,
        shape.rowCount,
        shape.columnCount
      )
    );
  }
}

function literal(value: CellInput, nullAs: NullAs): CellOutput {
  if (value === null) {
    return nullAs;
  }
  return typeof value === "string" ? asLiteralText(value) : value;
}

/** Ma trận cho Range.values: chữ luôn là chữ, kể cả chuỗi bắt đầu bằng "=". */
export function toValueCells(matrix: CellInput[][], nullAs: NullAs = ""): CellOutput[][] {
  return matrix.map((row) => row.map((value) => literal(value, nullAs)));
}

export function isFormulaText(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("=");
}

/**
 * Ma trận cho Range.formulas: chuỗi bắt đầu bằng "=" là công thức (cú pháp en-US, dấu ","),
 * Excel tự tính; add-in không tự đánh giá biểu thức. Chuỗi khác vẫn được ghi nguyên văn như chữ.
 */
export function toFormulaCells(matrix: CellInput[][], nullAs: NullAs = ""): CellOutput[][] {
  return matrix.map((row, r) =>
    row.map((value, c) => {
      if (isFormulaText(value)) {
        if (value.trim().length < 2 || value.length > MAX_FORMULA_LENGTH) {
          throw new ExcelOpError("invalidData", EXCEL_ERRORS.formulaInvalid(r + 1, c + 1));
        }
        return value;
      }
      return literal(value, nullAs);
    })
  );
}

export interface ReadSummary {
  emptyCells: number;
  formulaCells: number;
  /** Địa chỉ A1 và giá trị lỗi (#N/A, #DIV/0!…), tối đa `limit` mục. */
  errorCells: { address: string; error: string }[];
  errorCount: number;
}

/**
 * Tóm tắt kết quả đọc. Nhận diện ô lỗi bằng valueTypes ("Error") nếu có — chữ "#N/A" người dùng
 * gõ có kiểu String nên không bị nhầm là lỗi. Thiếu valueTypes thì dựa vào công thức + giá trị lỗi.
 */
export function summarizeRead(
  values: unknown[][],
  formulas: unknown[][],
  valueTypes: string[][] | undefined,
  origin: { rowIndex: number; columnIndex: number },
  limit = 10
): ReadSummary {
  const summary: ReadSummary = { emptyCells: 0, formulaCells: 0, errorCells: [], errorCount: 0 };
  values.forEach((row, r) =>
    row.forEach((value, c) => {
      const formula = formulas[r]?.[c];
      if (isFormulaText(formula)) {
        summary.formulaCells++;
      }
      const type = valueTypes?.[r]?.[c];
      const isError =
        type !== undefined
          ? type === "Error"
          : isFormulaText(formula) &&
            typeof value === "string" &&
            EXCEL_ERROR_VALUES.includes(value);
      if (isError) {
        summary.errorCount++;
        if (summary.errorCells.length < limit) {
          summary.errorCells.push({
            address: cellAddress(origin.rowIndex + r, origin.columnIndex + c),
            error: String(value),
          });
        }
      } else if (value === "" || value === null || value === undefined) {
        summary.emptyCells++;
      }
    })
  );
  return summary;
}
