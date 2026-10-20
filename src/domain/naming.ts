/**
 * Đặt tên sheet và Excel Table không trùng (prompts/06_WORKBOOK_INTEGRATION.md).
 * So sánh không phân biệt hoa thường vì Excel coi "Báo giá" và "báo giá" là trùng.
 */

const SHEET_NAME_MAX = 31;
const INVALID_SHEET_CHARS = /[[\]:*?/\\]/g;

export const QUOTE_TABLE_PREFIX = "CQ_Quote_";

function lowerSet(names: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    set.add(name.toLocaleLowerCase("vi-VN"));
  }
  return set;
}

/** Làm sạch tên sheet theo quy tắc Excel: bỏ ký tự cấm, không bắt đầu/kết thúc bằng nháy đơn. */
export function sanitizeSheetName(name: string): string {
  const cleaned = name
    .replace(INVALID_SHEET_CHARS, " ")
    .replace(/^'+|'+$/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "Sheet";
}

/** "Báo giá", "Báo giá (2)", "Báo giá (3)"… — cắt bớt phần gốc để không vượt 31 ký tự. */
export function uniqueSheetName(base: string, existing: Iterable<string>): string {
  const taken = lowerSet(existing);
  const root = sanitizeSheetName(base);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : ` (${n})`;
    const candidate = root.slice(0, SHEET_NAME_MAX - suffix.length).trimEnd() + suffix;
    if (!taken.has(candidate.toLocaleLowerCase("vi-VN"))) {
      return candidate;
    }
  }
}

/**
 * Tên Excel Table phải duy nhất trong workbook, kể cả so với các tên đã đặt (defined names).
 * Trả về CQ_Quote_<n> với n nhỏ nhất chưa dùng.
 */
export function uniqueQuoteTableName(existingNames: Iterable<string>): string {
  const taken = lowerSet(existingNames);
  for (let n = 1; ; n++) {
    const candidate = `${QUOTE_TABLE_PREFIX}${n}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

export function isQuoteTableName(name: string): boolean {
  return new RegExp(`^${QUOTE_TABLE_PREFIX}\\d+$`, "i").test(name);
}
