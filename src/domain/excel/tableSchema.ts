/**
 * Mô tả cấu trúc cột của một Excel Table: tên cột, kiểu dữ liệu, bắt buộc hay không.
 * Thuần TypeScript, tách khỏi định dạng (formatRules.ts) và khỏi Office.js.
 * Đổi cấu trúc bảng = sửa một khai báo schema; kiểm tra dữ liệu, thứ tự cột và định dạng số
 * đều suy ra từ đó.
 */

import { CellInput } from "./matrix";
import { sameName } from "../naming";
import { EXCEL_ERRORS } from "../../shared/strings.excel.vi";

/**
 * Kiểu dữ liệu nghiệp vụ của cột. Kiểu quyết định cách kiểm tra đầu vào và định dạng số,
 * không quyết định giá trị: add-in không làm tròn hay đổi đơn vị khi ghi.
 */
export type ColumnKind =
  /** Chữ tự do (tên công tác, ghi chú). */
  | "text"
  /** Mã giữ nguyên văn: "007" không thành 7. */
  | "code"
  /** Số nguyên (STT). */
  | "integer"
  /** Khối lượng: số thực. */
  | "quantity"
  /** Tiền (đơn giá, thành tiền): số thực, đơn vị đồng; hiển thị theo định dạng ô (ADR-0008). */
  | "money"
  /** Tỷ lệ dạng thập phân: 0,1 = 10%. */
  | "percent"
  /** Ngày dạng số sê-ri Excel. */
  | "date";

export interface ColumnSpec<K extends string = string> {
  key: K;
  header: string;
  kind: ColumnKind;
  required: boolean;
  /** Cột do công thức Excel tính (STT, thành tiền…): không nhận dữ liệu nhập. */
  computed?: boolean;
  /** Giá trị nhỏ nhất cho cột số (ví dụ 0 cho khối lượng, đơn giá). */
  min?: number;
  /** Độ rộng (point) khi khác mặc định theo kiểu cột, ví dụ cột đơn vị tính ngắn hơn cột tên. */
  width?: number;
}

export interface TableSchema<K extends string = string> {
  /** Tên mô tả (không phải tên Excel Table). */
  title: string;
  columns: readonly ColumnSpec<K>[];
}

export type RecordInput<K extends string = string> = Partial<Record<K, unknown>>;

export interface FieldError<K extends string = string> {
  key: K;
  header: string;
  message: string;
}

export type RecordCheck<K extends string = string> =
  { ok: true; row: CellInput[] } | { ok: false; errors: FieldError<K>[] };

/** Ngày sê-ri hợp lệ của Excel: 1 (01/01/1900) … 2958465 (31/12/9999). */
const MAX_DATE_SERIAL = 2_958_465;

/** Lỗi cấu trúc của chính schema (dùng trong test và khi khai báo schema mới). */
export function checkSchema(schema: TableSchema): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const headers: string[] = [];
  schema.columns.forEach((column, i) => {
    if (column.header.trim() === "") {
      problems.push(EXCEL_ERRORS.emptyHeader(i + 1));
    }
    if (keys.has(column.key)) {
      problems.push(`Khóa cột "${column.key}" bị trùng.`);
    }
    keys.add(column.key);
    if (headers.some((h) => sameName(h, column.header.trim()))) {
      problems.push(EXCEL_ERRORS.duplicateHeaders(column.header));
    }
    headers.push(column.header.trim());
    if (column.computed && column.required) {
      problems.push(`Cột "${column.header}" vừa tính bằng công thức vừa bắt buộc nhập.`);
    }
  });
  return problems;
}

/** Tiêu đề trùng (không phân biệt hoa thường) hoặc trống — Excel sẽ tự đổi tên nếu để vậy. */
export function headerProblems(headers: readonly string[]): string[] {
  const problems: string[] = [];
  const seen: string[] = [];
  const duplicates: string[] = [];
  headers.forEach((header, i) => {
    const h = header.trim();
    if (h === "") {
      problems.push(EXCEL_ERRORS.emptyHeader(i + 1));
      return;
    }
    if (seen.some((s) => sameName(s, h)) && !duplicates.some((d) => sameName(d, h))) {
      duplicates.push(h);
    }
    seen.push(h);
  });
  if (duplicates.length > 0) {
    problems.push(EXCEL_ERRORS.duplicateHeaders(duplicates.join(", ")));
  }
  return problems;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function checkValue(column: ColumnSpec, value: unknown): string | null {
  switch (column.kind) {
    case "text":
    case "code":
      return typeof value === "string" ? null : "phải là chữ.";
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return "phải là số nguyên.";
      }
      break;
    case "quantity":
    case "money":
    case "percent":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "phải là số.";
      }
      break;
    case "date":
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 1 ||
        value > MAX_DATE_SERIAL
      ) {
        return "phải là ngày dạng số sê-ri Excel.";
      }
      break;
  }
  if (column.min !== undefined && (value as number) < column.min) {
    return `không được nhỏ hơn ${column.min}.`;
  }
  return null;
}

/**
 * Kiểm tra một bản ghi theo schema và tạo dòng theo thứ tự cột của schema.
 * - Không tự đổi kiểu: "12" ở cột số là lỗi, không phải 12.
 * - Ô trống ở cột không bắt buộc ghi là trống (không phải 0).
 * - Cột computed nhận null để giữ công thức của Table (cột tính toán).
 * - Khóa lạ trong bản ghi bị báo lỗi để không mất dữ liệu âm thầm.
 */
export function validateRecord<K extends string>(
  schema: TableSchema<K>,
  record: RecordInput<K>
): RecordCheck<K> {
  const errors: FieldError<K>[] = [];
  const known = new Set<string>(schema.columns.map((c) => c.key));
  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      errors.push({ key: key as K, header: key, message: `Trường "${key}" không có trong bảng.` });
    }
  }
  const row: CellInput[] = schema.columns.map((column) => {
    const value = record[column.key];
    if (column.computed) {
      if (!isBlank(value)) {
        errors.push({
          key: column.key,
          header: column.header,
          message: `${column.header} do công thức tính, không nhập.`,
        });
      }
      return null;
    }
    if (isBlank(value)) {
      if (column.required) {
        errors.push({
          key: column.key,
          header: column.header,
          message: `${column.header} là bắt buộc.`,
        });
      }
      return null;
    }
    const problem = checkValue(column, value);
    if (problem) {
      errors.push({
        key: column.key,
        header: column.header,
        message: `${column.header} ${problem}`,
      });
      return null;
    }
    return value as CellInput;
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, row };
}

export interface HeaderMatch<K extends string = string> {
  /** Vị trí (tính từ 0) của từng cột schema trong tiêu đề thực tế. */
  indexByKey: Partial<Record<K, number>>;
  missing: ColumnSpec<K>[];
  /** Tiêu đề thực tế không thuộc schema (ví dụ cột người dùng tự thêm). */
  extra: string[];
}

/** So tiêu đề thực tế của Table với schema (bỏ khoảng trắng hai đầu, không phân biệt hoa thường). */
export function matchHeaders<K extends string>(
  schema: TableSchema<K>,
  headers: readonly string[]
): HeaderMatch<K> {
  const indexByKey: Partial<Record<K, number>> = {};
  const missing: ColumnSpec<K>[] = [];
  const used = new Set<number>();
  for (const column of schema.columns) {
    const index = headers.findIndex(
      (h, i) => !used.has(i) && sameName(String(h).trim(), column.header.trim())
    );
    if (index < 0) {
      missing.push(column);
    } else {
      indexByKey[column.key] = index;
      used.add(index);
    }
  }
  const extra = headers.filter((_, i) => !used.has(i)).map(String);
  return { indexByKey, missing, extra };
}

/**
 * Sắp dòng theo schema vào đúng thứ tự cột thực tế của Table. Cột không thuộc schema nhận null
 * (giữ nguyên/để trống, không ghi đè công thức của người dùng).
 */
export function alignToHeaders<K extends string>(
  schema: TableSchema<K>,
  row: readonly CellInput[],
  headers: readonly string[]
): CellInput[] {
  const { indexByKey } = matchHeaders(schema, headers);
  const aligned: CellInput[] = headers.map(() => null);
  schema.columns.forEach((column, i) => {
    const index = indexByKey[column.key];
    if (index !== undefined) {
      aligned[index] = row[i];
    }
  });
  return aligned;
}

export function schemaHeaders(schema: TableSchema): string[] {
  return schema.columns.map((c) => c.header);
}
