/**
 * Dữ liệu cho khu vực Kiểm thử Excel. Chỉ là dữ liệu thử, ghi rõ "Thử …", không phải đơn giá
 * hay công tác thật (prompts/01: không tạo sẵn dữ liệu chuyên ngành giả).
 *
 * Mỗi dòng nhắm một tình huống của giai đoạn tích hợp Excel: chữ tiếng Việt có dấu, mã có số 0
 * đầu, chữ dễ bị Excel tự đổi kiểu ("1/2", "10%"), số 0, ô trống, ký tự đặc biệt, công thức
 * hợp lệ và công thức cho lỗi.
 */

import { CellInput, isFormulaText } from "./matrix";
import { QUOTE_LINE_SCHEMA } from "./quoteLineSchema";
import { schemaHeaders } from "./tableSchema";
import { cellAddress, parseRangeAddress } from "../../shared/a1";

export const LAB_SHEET_NAME = "CQ Thử nghiệm";
export const LAB_TABLE_NAME = "CQ_Test_Lab";
/** Ô neo của vùng mẫu: chừa hàng 1 và cột A trống để thấy rõ ranh giới khi kiểm tra. */
export const LAB_ANCHOR = "B2";

/**
 * Cột (theo QUOTE_LINE_SCHEMA, bắt đầu từ B): B STT · C Mã · D Tên · E ĐVT · F Khối lượng ·
 * G VL · H NC · I Máy · J Đơn giá tổng hợp · K Thành tiền · L Ghi chú. Dòng dữ liệu ở hàng 3–7.
 */
const DATA_ROWS: CellInput[][] = [
  [
    "=ROW()-2",
    "THU-001",
    "Thử chữ tiếng Việt có dấu: Đường ống, Ốp lát, Ữ ặ ỹ",
    "m",
    12.5,
    1234567.891,
    0.5,
    0,
    1234568.391,
    "=F3*J3",
    "Đơn giá có phần lẻ: hiển thị theo định dạng ô, giá trị giữ nguyên",
  ],
  ["=ROW()-2", "007", "Thử mã có số 0 đầu và số 0", "cái", 0, 0, 0, 0, 0, "=F4*J4", "1/2"],
  [
    "=ROW()-2",
    "THU-003",
    "Thử ô trống",
    "",
    null,
    null,
    null,
    null,
    null,
    '=IF(OR(F5="",J5=""),"",F5*J5)',
    null,
  ],
  [
    "=ROW()-2",
    "10%",
    "Thử ký tự đặc biệt: & < > \" ' % / \\ [ ] # @ ; =1+1",
    "m²",
    1.25,
    1.5,
    2.25,
    3.125,
    6.875,
    "=F6*J6",
    "TRUE",
  ],
  [
    "=ROW()-2",
    "THU-005",
    "Thử công thức cho lỗi chia cho 0",
    "m³",
    2,
    null,
    null,
    null,
    1,
    "=F7/0",
    null,
  ],
];

/** Hàng tiêu đề + dòng dữ liệu, ghi bằng chế độ "formulas" (chuỗi "=…" là công thức). */
export function labSampleMatrix(): CellInput[][] {
  return [schemaHeaders(QUOTE_LINE_SCHEMA), ...DATA_ROWS.map((row) => [...row])];
}

export function labSampleAddress(): string {
  const anchor = parseRangeAddress(LAB_ANCHOR);
  if (!anchor) {
    throw new Error("LAB_ANCHOR không hợp lệ");
  }
  const rows = DATA_ROWS.length + 1;
  const columns = QUOTE_LINE_SCHEMA.columns.length;
  return `${LAB_ANCHOR}:${cellAddress(anchor.rowIndex + rows - 1, anchor.columnIndex + columns - 1)}`;
}

/** Số ô lỗi mong đợi khi đọc lại (dòng THU-005 cố ý chia cho 0). */
export const LAB_EXPECTED_ERRORS = 1;

/**
 * So dữ liệu đọc lại với dữ liệu đã ghi. Ô công thức so theo công thức, ô khác so theo giá trị
 * (chữ phải giống nguyên văn, số giống tuyệt đối, ô trống đọc lại là ""). Trả về địa chỉ ô khác.
 */
export function compareReadBack(
  written: CellInput[][],
  values: unknown[][],
  formulas: unknown[][],
  origin: { rowIndex: number; columnIndex: number }
): string[] {
  const mismatches: string[] = [];
  written.forEach((row, r) =>
    row.forEach((expected, c) => {
      const address = cellAddress(origin.rowIndex + r, origin.columnIndex + c);
      if (isFormulaText(expected)) {
        if (formulas[r]?.[c] !== expected) {
          mismatches.push(address);
        }
        return;
      }
      const actual = values[r]?.[c];
      if (actual !== (expected === null ? "" : expected)) {
        mismatches.push(address);
      }
    })
  );
  return mismatches;
}
