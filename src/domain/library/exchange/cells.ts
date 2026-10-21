/**
 * Đọc giá trị ô từ file nhập (Excel, CSV, JSON) theo kiểu của trường (prompts/09).
 * Bảo toàn: chữ tiếng Việt (chuẩn hóa NFC, không đổi nghĩa), mã dạng chữ (không mất số 0 đầu),
 * số thập phân và ngày. Không đoán: giá trị mơ hồ bị báo lỗi thay vì tự hiểu.
 */

import { parseDecimalInput } from "../../workItemDraft";
import { isIsoDate } from "../dates";
import { normalizeForSearch } from "../search";
import { PriceStatus, ResourceType } from "../types";
import { PRICE_STATUS_LABELS, RESOURCE_TYPE_LABELS } from "./schema";

/**
 * Một ô nguồn.
 * - value: giá trị gốc (CSV luôn là chữ; Excel có thể là số/logic).
 * - text: chữ Excel hiển thị (giữ "007" khi ô số định dạng "000").
 * - date: ngày ISO nếu ô Excel là số ngày tháng (định dạng ngày).
 */
export interface RawCell {
  value: string | number | boolean | null;
  text?: string;
  date?: string;
}

export type CellParse<T> = { ok: true; value: T } | { ok: false; message: string };

export function isBlankCell(cell: RawCell | undefined): boolean {
  if (!cell || cell.value === null) {
    return true;
  }
  return typeof cell.value === "string" && cell.value.trim() === "";
}

export function parseTextCell(cell: RawCell | undefined): string {
  if (!cell || cell.value === null) {
    return "";
  }
  if (typeof cell.value === "string") {
    return cell.value.normalize("NFC").trim();
  }
  // Ô số/logic trong Excel: lấy đúng chữ đang hiển thị (ví dụ mã "007").
  return (cell.text ?? String(cell.value)).normalize("NFC").trim();
}

export function parseNumberCell(cell: RawCell | undefined): CellParse<number | null> {
  if (isBlankCell(cell)) {
    return { ok: true, value: null };
  }
  const value = cell!.value;
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, message: "Số không hợp lệ." };
  }
  if (typeof value === "boolean") {
    return { ok: false, message: "Cần một số, không phải TRUE/FALSE." };
  }
  const parsed = parseDecimalInput(String(value));
  return parsed.ok ? parsed : { ok: false, message: parsed.message };
}

/** Định dạng số của Excel có phải định dạng ngày (có d hoặc y ngoài phần chữ/ngoặc)? */
export function isDateNumberFormat(format: string): boolean {
  const stripped = format
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "");
  return /[dy]/i.test(stripped);
}

/**
 * Số ngày Excel (hệ 1900) → "YYYY-MM-DD". Phần giờ bị bỏ.
 * Excel coi 1900 là năm nhuận (ngày 60 = 29/02/1900 không có thật) nên ngày đó không hợp lệ.
 */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial >= 2958466) {
    return null;
  }
  const day = Math.floor(serial);
  if (day === 60) {
    return null;
  }
  const epoch = day > 60 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31);
  return new Date(epoch + day * 86_400_000).toISOString().slice(0, 10);
}

const DATE_HINT = "Dùng dạng dd/mm/yyyy hoặc yyyy-mm-dd.";

/** Ngày chữ: "2026-06-30" hoặc "30/06/2026" (ngày trước tháng, năm 4 chữ số). */
export function parseDateText(text: string): string | null {
  const trimmed = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isIsoDate(trimmed) ? trimmed : null;
  }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  return null;
}

export function parseDateCell(cell: RawCell | undefined): CellParse<string | null> {
  if (isBlankCell(cell)) {
    return { ok: true, value: null };
  }
  if (cell!.date) {
    return { ok: true, value: cell!.date };
  }
  if (typeof cell!.value === "string") {
    const iso = parseDateText(cell!.value);
    return iso
      ? { ok: true, value: iso }
      : { ok: false, message: `Ngày không hợp lệ. ${DATE_HINT}` };
  }
  // Số không mang định dạng ngày: không đoán là ngày.
  return { ok: false, message: `Ngày không hợp lệ. ${DATE_HINT}` };
}

function parseLabel<K extends string>(
  cell: RawCell | undefined,
  labels: Record<K, string>,
  what: string
): CellParse<K | null> {
  const text = parseTextCell(cell);
  if (text === "") {
    return { ok: true, value: null };
  }
  const normalized = normalizeForSearch(text);
  for (const key of Object.keys(labels) as K[]) {
    if (normalized === key || normalized === normalizeForSearch(labels[key])) {
      return { ok: true, value: key };
    }
  }
  return {
    ok: false,
    message: `${what} "${text}" không hợp lệ. Dùng một trong: ${Object.values<string>(labels).join(", ")}.`,
  };
}

export function parseResourceTypeCell(cell: RawCell | undefined): CellParse<ResourceType | null> {
  return parseLabel(cell, RESOURCE_TYPE_LABELS, "Loại");
}

export function parsePriceStatusCell(cell: RawCell | undefined): CellParse<PriceStatus | null> {
  return parseLabel(cell, PRICE_STATUS_LABELS, "Trạng thái");
}
