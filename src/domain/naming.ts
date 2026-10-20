/**
 * Đặt tên sheet và Excel Table không trùng (prompts/06_WORKBOOK_INTEGRATION.md).
 * So sánh không phân biệt hoa thường vì Excel coi "Báo giá" và "báo giá" là trùng.
 */

export const SHEET_NAME_MAX = 31;
const INVALID_SHEET_CHARS = /[[\]:*?/\\]/g;
/** Excel dành riêng tên "History" (không phân biệt hoa thường) cho tính năng theo dõi thay đổi. */
const RESERVED_SHEET_NAMES = ["history"];

export const DEFAULT_QUOTE_SHEET_NAME = "Báo giá";
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

/**
 * "Báo giá", "Báo giá (2)", "Báo giá (3)"… — cắt bớt phần gốc để không vượt 31 ký tự,
 * không kết thúc bằng nháy đơn sau khi cắt, và không trùng tên Excel dành riêng.
 */
export function uniqueSheetName(base: string, existing: Iterable<string>): string {
  const taken = lowerSet([...existing, ...RESERVED_SHEET_NAMES]);
  const root = sanitizeSheetName(base);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : ` (${n})`;
    // Bỏ mọi nháy đơn/khoảng trắng ở cuối sau khi cắt (ví dụ "…O' " → "…O").
    const head = root.slice(0, SHEET_NAME_MAX - suffix.length).replace(/['\s]+$/, "");
    const candidate = (head.length > 0 ? head : "Sheet") + suffix;
    if (!taken.has(candidate.toLocaleLowerCase("vi-VN"))) {
      return candidate;
    }
  }
}

export type SheetNameCheck = { ok: true; name: string } | { ok: false; message: string };

/**
 * Kiểm tra tên sheet người dùng gõ. Không tự sửa âm thầm: báo lỗi nếu có ký tự cấm,
 * quá dài hoặc trùng tên dành riêng. Tên trùng sheet có sẵn vẫn hợp lệ — add-in sẽ thêm (2), (3)…
 */
export function checkSheetNameInput(input: string): SheetNameCheck {
  const name = input.trim();
  if (name === "") {
    return { ok: false, message: "Nhập tên sheet." };
  }
  if (/[[\]:*?/\\]/.test(name)) {
    return { ok: false, message: "Tên sheet không được chứa các ký tự [ ] : * ? / \\" };
  }
  if (/^'|'$/.test(name)) {
    return { ok: false, message: "Tên sheet không được bắt đầu hoặc kết thúc bằng dấu nháy đơn." };
  }
  if (name.length > SHEET_NAME_MAX) {
    return { ok: false, message: `Tên sheet tối đa ${SHEET_NAME_MAX} ký tự.` };
  }
  if (RESERVED_SHEET_NAMES.includes(name.toLocaleLowerCase("vi-VN"))) {
    return { ok: false, message: `Excel không cho phép đặt tên sheet là "${name}".` };
  }
  return { ok: true, name };
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
