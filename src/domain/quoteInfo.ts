/**
 * Khối "Thông tin báo giá" phía trên bảng báo giá (prompts/02, 07 bước 4).
 * Nguồn sự thật là chính sheet: add-in tìm nhãn trên sheet mỗi lần đọc (người dùng có thể đã
 * chèn/xóa dòng), không dựa vào vị trí đã lưu. Mọi mục đều tùy chọn — không bắt buộc điền.
 * Ngày được ghi thành ngày thật của Excel (định dạng dd/mm/yyyy) để Excel tính toán/sắp xếp được.
 */

import { excelSerialToIso, isDateNumberFormat, parseDateText } from "./library/exchange/cells";
import { formatIsoDate } from "./library/dates";
import { QUOTE_INFO_LABELS } from "./quoteTemplate";

export type InfoKey =
  "issuer" | "customer" | "project" | "quoteNo" | "date" | "version" | "validUntil";

export interface InfoField {
  key: InfoKey;
  label: string;
  type: "text" | "date";
}

const KEYS: InfoKey[] = [
  "issuer",
  "customer",
  "project",
  "quoteNo",
  "date",
  "version",
  "validUntil",
];

export const INFO_FIELDS: readonly InfoField[] = QUOTE_INFO_LABELS.map((label, i) => ({
  key: KEYS[i],
  label,
  type: KEYS[i] === "date" || KEYS[i] === "validUntil" ? "date" : "text",
}));

export const INFO_DATE_FORMAT = "dd/mm/yyyy";
/** Số dòng phía trên dòng tiêu đề bảng được dò tìm nhãn. */
export const INFO_SCAN_ROWS = 15;

/** Ô giá trị của một mục, đọc trực tiếp từ sheet. */
export interface InfoCell {
  key: InfoKey;
  /** Có tìm thấy nhãn trên sheet không (người dùng có thể đã xóa/sửa nhãn). */
  found: boolean;
  /** Địa chỉ A1 của ô giá trị (không kèm tên sheet); "" nếu không tìm thấy. */
  address: string;
  value: unknown;
  /** Chữ Excel hiển thị. */
  text: string;
  numberFormat: string;
}

export function labelMatches(cellValue: unknown, label: string): boolean {
  const normalize = (s: string) => s.trim().replace(/:$/, "").trim().toLocaleLowerCase("vi-VN");
  return typeof cellValue === "string" && normalize(cellValue) === normalize(label);
}

/** Giá trị hiển thị trong form: ngày → dd/mm/yyyy; còn lại → chữ Excel hiển thị. */
export function infoDisplayValue(field: InfoField, cell: InfoCell): string {
  if (
    field.type === "date" &&
    typeof cell.value === "number" &&
    isDateNumberFormat(cell.numberFormat)
  ) {
    return formatIsoDate(excelSerialToIso(cell.value));
  }
  if (typeof cell.value === "string") {
    return cell.value;
  }
  return cell.value === null || cell.value === undefined || cell.value === "" ? "" : cell.text;
}

/** ISO → số ngày Excel (hệ 1900), cho ngày từ 01/03/1900. */
export function isoToExcelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export type InfoWrite =
  | { key: InfoKey; kind: "clear" }
  | { key: InfoKey; kind: "text"; text: string }
  | { key: InfoKey; kind: "date"; serial: number; iso: string };

export interface InfoValidation {
  writes: InfoWrite[];
  errors: { key: InfoKey; message: string }[];
}

/**
 * Từ giá trị người dùng nhập → các thay đổi cần ghi (chỉ mục đã đổi so với sheet).
 * Ngày: dd/mm/yyyy hoặc yyyy-mm-dd; "Hiệu lực đến" không được trước "Ngày lập".
 */
export function planInfoWrites(
  input: Record<InfoKey, string>,
  current: Record<InfoKey, string>
): InfoValidation {
  const writes: InfoWrite[] = [];
  const errors: InfoValidation["errors"] = [];
  const isoOf: Partial<Record<InfoKey, string>> = {};
  for (const field of INFO_FIELDS) {
    const text = (input[field.key] ?? "").trim();
    if (field.type === "date" && text !== "") {
      const iso = parseDateText(text);
      if (!iso) {
        errors.push({ key: field.key, message: "Ngày không hợp lệ. Dùng dạng dd/mm/yyyy." });
        continue;
      }
      isoOf[field.key] = iso;
    }
    if (text === (current[field.key] ?? "").trim()) {
      continue;
    }
    if (text === "") {
      writes.push({ key: field.key, kind: "clear" });
    } else if (field.type === "date") {
      writes.push({
        key: field.key,
        kind: "date",
        serial: isoToExcelSerial(isoOf[field.key]!),
        iso: isoOf[field.key]!,
      });
    } else {
      writes.push({ key: field.key, kind: "text", text });
    }
  }
  if (isoOf.date && isoOf.validUntil && isoOf.validUntil < isoOf.date) {
    errors.push({ key: "validUntil", message: "Hiệu lực đến phải sau hoặc bằng ngày lập." });
  }
  return { writes, errors };
}

export interface InfoSummary {
  filled: number;
  total: number;
  missingLabels: InfoKey[];
  /** Ngày hiệu lực đã qua (so với hôm nay). */
  expired: string | null;
}

export function summarizeInfo(cells: readonly InfoCell[], today: string): InfoSummary {
  const field = (key: InfoKey) => INFO_FIELDS.find((f) => f.key === key)!;
  const display = (cell: InfoCell) => infoDisplayValue(field(cell.key), cell).trim();
  const validUntil = cells.find((c) => c.key === "validUntil");
  let expired: string | null = null;
  if (validUntil?.found) {
    const iso = parseDateText(display(validUntil));
    if (iso && iso < today) {
      expired = formatIsoDate(iso);
    }
  }
  return {
    filled: cells.filter((c) => c.found && display(c) !== "").length,
    total: INFO_FIELDS.length,
    missingLabels: cells.filter((c) => !c.found).map((c) => c.key),
    expired,
  };
}
