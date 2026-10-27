/**
 * Tính đơn giá công tác theo loại tài nguyên từ khối phân tích trên sheet (snapshot hao phí và đơn giá
 * nguồn mà Excel đang dùng). Cùng công thức với sheet phân tích:
 *   Chi phí thành phần = Hao phí áp dụng × Đơn giá nguồn
 *   Đơn giá loại       = Σ chi phí thành phần cùng loại (vật liệu, nhân công, máy, khác)
 *   Đơn giá công tác   = Σ mọi thành phần, làm tròn MỘT lần theo quy tắc cấp đơn giá (nếu có)
 *   Thành tiền         = Khối lượng × Đơn giá, làm tròn theo quy tắc cấp thành tiền (nếu có)
 * Số học thập phân chính xác (giai đoạn 16); không làm tròn từng bước; thiếu số liệu → null, không 0.
 * Dùng để ghi cột đơn giá thành phần và đối chiếu với kết quả do chính Excel tính.
 */

import * as D from "../pricing/decimal";
import { MAX_INTEGER_DIGITS } from "../pricing/normCalc";
import { RESOURCE_TYPE_TEXT } from "../pricing/composition";
import { RoundingRule } from "../pricing/rounding";
import type { AnalysisLine } from "../pricing/quoteCheck";
import { normalizeCode } from "../library/validation";
import { COST_TYPES } from "./lines";
import type { CostType, ItemIssue } from "./model";

export interface BreakdownResult {
  /** Đơn giá từng loại; null khi còn thiếu số liệu hoặc lỗi. */
  totals: Record<CostType, number> | null;
  /** Đơn giá công tác sau quy tắc làm tròn cấp đơn giá; null khi không tính được. */
  unitPrice: number | null;
  /** Số dòng tài nguyên của khối phân tích. */
  resourceCount: number;
  issues: ItemIssue[];
}

/** Loại tài nguyên theo nhãn trên sheet ("Vật liệu", "nhân công"…); null nếu không nhận ra. */
export function costTypeFromLabel(label: string): CostType | null {
  const key = label.trim().toLocaleLowerCase("vi-VN");
  const found = COST_TYPES.find((t) => RESOURCE_TYPE_TEXT[t].toLocaleLowerCase("vi-VN") === key);
  return found ?? null;
}

export function roundDecimal(value: D.Decimal, rule: RoundingRule): D.Decimal {
  return rule.mode === "none" ? value : D.round(value, rule.digits, rule.mode);
}

function numberCell(value: unknown, type: string): "blank" | "error" | "text" | D.Decimal {
  if (type === "Error") {
    return "error";
  }
  if (value === "" || value === null || value === undefined) {
    return "blank";
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "text";
  }
  return D.fromNumber(value);
}

/** Dòng phân tích của một mã công tác (so mã không phân biệt hoa thường, như sheet phân tích). */
export function analysisRowsFor(analysis: readonly AnalysisLine[], code: string): AnalysisLine[] {
  const key = normalizeCode(code);
  return analysis.filter((a) => normalizeCode(a.code) === key);
}

export function analysisBreakdown(
  rows: readonly AnalysisLine[],
  code: string,
  unitPriceRule: RoundingRule
): BreakdownResult {
  const issues: ItemIssue[] = [];
  if (rows.length === 0) {
    issues.push({
      code: "analysisMissing",
      severity: "error",
      message: `Không có khối phân tích cho mã "${code}" trên sheet "Phân tích đơn giá".`,
      hint: "Chèn lại công tác từ thư viện với cách xác định đơn giá Phân tích từ định mức, hoặc nhập đơn giá trực tiếp.",
    });
    return { totals: null, unitPrice: null, resourceCount: 0, issues };
  }
  const sums: Record<CostType, D.Decimal> = {
    material: D.ZERO,
    labor: D.ZERO,
    machine: D.ZERO,
    other: D.ZERO,
  };
  let complete = true;
  for (const row of rows) {
    const label = row.resourceCode || `dòng ${row.rowIndex + 1}`;
    const quantity = numberCell(row.quantity, row.quantityType);
    const price = numberCell(row.price, row.priceType);
    for (const [cellValue, what] of [
      [quantity, "hao phí"],
      [price, "đơn giá nguồn"],
    ] as const) {
      if (cellValue === "blank") {
        complete = false;
        issues.push({
          code: "analysisIncomplete",
          severity: "error",
          resourceCode: row.resourceCode,
          message: `Tài nguyên "${label}" chưa có ${what} trên sheet phân tích (dòng ${row.rowIndex + 1}).`,
          hint:
            what === "đơn giá nguồn"
              ? "Thêm giá cho tài nguyên trong thư viện rồi cập nhật, hoặc nhập Đơn giá nguồn trên sheet phân tích."
              : "Nhập hao phí trên sheet phân tích.",
        });
      } else if (cellValue === "error" || cellValue === "text") {
        complete = false;
        issues.push({
          code: "analysisError",
          severity: "error",
          resourceCode: row.resourceCode,
          message: `Tài nguyên "${label}": ${what} trên sheet phân tích ${cellValue === "error" ? "đang lỗi" : "không phải số"} (dòng ${row.rowIndex + 1}).`,
          hint: "Sửa ô này trên sheet Phân tích đơn giá.",
        });
      } else if (D.isNegative(cellValue)) {
        complete = false;
        issues.push({
          code: "analysisError",
          severity: "error",
          resourceCode: row.resourceCode,
          message: `Tài nguyên "${label}": ${what} âm (dòng ${row.rowIndex + 1}).`,
          hint: "Nhập giá trị không âm trên sheet phân tích.",
        });
      }
    }
    if (typeof quantity === "string" || typeof price === "string") {
      continue;
    }
    if (D.isNegative(quantity) || D.isNegative(price)) {
      continue;
    }
    let type = costTypeFromLabel(row.resourceType);
    if (type === null) {
      issues.push({
        code: "analysisError",
        severity: "warning",
        resourceCode: row.resourceCode,
        message: `Tài nguyên "${label}" có loại "${row.resourceType}" không nhận ra; tính vào đơn giá khác.`,
        hint: "Ghi cột Loại là Vật liệu, Nhân công, Máy thi công hoặc Khác.",
      });
      type = "other";
    }
    sums[type] = D.add(sums[type], D.multiply(quantity, price));
  }
  if (!complete) {
    return { totals: null, unitPrice: null, resourceCount: rows.length, issues };
  }
  const total = D.sum(COST_TYPES.map((t) => sums[t]));
  const rounded = roundDecimal(total, unitPriceRule);
  if (D.integerDigits(rounded) > MAX_INTEGER_DIGITS) {
    issues.push({
      code: "overflow",
      severity: "error",
      message: "Đơn giá vượt quá 15 chữ số, giới hạn chính xác của Excel.",
      hint: "Kiểm tra lại hao phí và đơn giá nguồn trên sheet phân tích.",
    });
    return { totals: null, unitPrice: null, resourceCount: rows.length, issues };
  }
  return {
    totals: Object.fromEntries(COST_TYPES.map((t) => [t, D.toNumber(sums[t])])) as Record<
      CostType,
      number
    >,
    unitPrice: D.toNumber(rounded),
    resourceCount: rows.length,
    issues,
  };
}

/** Thành tiền = Khối lượng × Đơn giá, làm tròn một lần theo quy tắc cấp thành tiền. */
export function lineAmount(quantity: number, unitPrice: number, amountRule: RoundingRule): number {
  return D.toNumber(
    roundDecimal(D.multiply(D.fromNumber(quantity), D.fromNumber(unitPrice)), amountRule)
  );
}

/**
 * Hai số coi là bằng nhau: lệch không quá nửa bước làm tròn đang dùng (nếu có) hoặc 1e-9 tương đối
 * (sai số biểu diễn số thực của Excel).
 */
export function sameAmount(a: number, b: number, rule?: RoundingRule): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  const tolerance = rule && rule.mode !== "none" ? Math.pow(10, -rule.digits) : 1e-9 * scale;
  return Math.abs(a - b) <= tolerance;
}
