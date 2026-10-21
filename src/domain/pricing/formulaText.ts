/**
 * So sánh công thức đọc lại từ Excel với công thức mẫu. Excel tự viết lại tham chiếu có cấu trúc
 * (đã kiểm chứng trên Excel 16.0.20430):
 * - Tham chiếu tới chính bảng chứa ô bị bỏ tên bảng: "CQ_Analysis[Mã công tác]" → "[Mã công tác]",
 *   "CQ_Quote_1[Thành tiền]" ở dòng tổng → "[Thành tiền]" (nhưng giữ "CQ_Quote_1[#Headers]").
 * - Tên cột không có dấu cách bị bỏ ngoặc: "[@[Loại]]" → "[@Loại]".
 * Chuẩn hóa cả hai phía rồi mới so.
 */

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeFormula(formula: string, ownTable: string): string {
  return formula
    .replace(new RegExp(`${escapeRegExp(ownTable)}\\[`, "g"), "[")
    .replace(/\[@\[([^\][\s]+)\]\]/g, "[@$1]");
}

export function sameFormula(actual: unknown, expected: string, ownTable: string): boolean {
  return (
    typeof actual === "string" &&
    normalizeFormula(actual, ownTable) === normalizeFormula(expected, ownTable)
  );
}
