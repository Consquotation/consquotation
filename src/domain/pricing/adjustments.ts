/**
 * Bảng tổng hợp sau bảng báo giá: chiết khấu, phụ phí, thuế… do NGƯỜI DÙNG cấu hình (prompts/10).
 * Không có khoản hay tỷ lệ mặc định nào. Thứ tự áp dụng = thứ tự dòng.
 *
 * Bảng Excel CQ_Summary_<n> đặt dưới dòng tổng của CQ_Quote_<n>, trong phạm vi cột của bảng báo giá
 * (để khi chèn dòng báo giá, Excel đẩy cả bảng tổng hợp xuống — đã kiểm chứng). Mọi phép tính là
 * công thức Excel; người dùng sửa trực tiếp "Giá trị" trên sheet được.
 *
 * Cột: Khoản mục | Loại | Cách tính | Giá trị | Số tiền | Lũy kế
 * - Dòng đầu: "Cộng giá trị báo giá" = ô tổng Thành tiền của bảng báo giá.
 * - Mỗi khoản: Số tiền = dấu × (Giá trị | Giá trị% × lũy kế dòng trên | Giá trị% × giá trị báo giá).
 * - Dòng tổng của bảng: Tổng cộng = Lũy kế dòng cuối.
 * Giá trị trống → Số tiền trống → Lũy kế và Tổng cộng báo #N/A (không bỏ qua âm thầm).
 * Loại/Cách tính gõ sai → #N/A.
 */

import { RoundingRule, wrapRounding } from "./rounding";

export type AdjustmentKind = "deduct" | "add";
export type AdjustmentMethod = "percentOfRunning" | "percentOfBase" | "fixed";

export interface Adjustment {
  name: string;
  kind: AdjustmentKind;
  method: AdjustmentMethod;
  /** Tỷ lệ % (ví dụ 8 = 8%) hoặc số tiền; null = chưa nhập (khác 0). */
  value: number | null;
}

export const SUMMARY_HEADERS = [
  "Khoản mục",
  "Loại",
  "Cách tính",
  "Giá trị",
  "Số tiền",
  "Lũy kế",
] as const;
/** Bảng tổng hợp chiếm các cột "Nội dung công việc" … "Ghi chú" (chỉ số 3..8) của bảng báo giá. */
export const SUMMARY_FIRST_COLUMN_OFFSET = 3;

export const BASE_KIND_LABEL = "Cộng";
export const BASE_METHOD_LABEL = "Theo bảng báo giá";
export const BASE_ROW_LABEL = "Cộng giá trị báo giá";
export const SUMMARY_TOTAL_LABEL = "Tổng cộng";
/** Nhãn dòng tổng của bảng báo giá khi có bảng tổng hợp (tổng thật nằm ở bảng tổng hợp). */
export const QUOTE_SUBTOTAL_LABEL = "Cộng";

export const KIND_LABELS: Record<AdjustmentKind, string> = {
  deduct: "Giảm trừ",
  add: "Cộng thêm",
};

export const METHOD_LABELS: Record<AdjustmentMethod, string> = {
  percentOfRunning: "% trên lũy kế",
  percentOfBase: "% trên giá trị báo giá",
  fixed: "Số tiền",
};

export function isSummaryTableName(name: string): boolean {
  return /^CQ_Summary_\d+$/.test(name);
}

export function quoteTableOfSummary(summaryName: string): string {
  return summaryName.replace(/^CQ_Summary_/, "CQ_Quote_");
}

export function summaryTableName(quoteTableName: string): string {
  return quoteTableName.replace(/^CQ_Quote_/, "CQ_Summary_");
}

const H = {
  name: "[@[Khoản mục]]",
  kind: "[@[Loại]]",
  method: "[@[Cách tính]]",
  value: "[@[Giá trị]]",
  amount: "[@[Số tiền]]",
  running: "[@[Lũy kế]]",
};

/** Ô tổng Thành tiền của bảng báo giá; ô trống bị coi là lỗi (Excel sẽ coi ô trống là 0). */
function baseExpression(quoteTableName: string): string {
  const total = `${quoteTableName}[[#Totals],[Thành tiền]]`;
  return `IF(${total}="",NA(),${total})`;
}

export function summaryAmountFormula(quoteTableName: string, rule: RoundingRule): string {
  const base = baseExpression(quoteTableName);
  const sign = `IF(${H.kind}="${KIND_LABELS.deduct}",-1,IF(${H.kind}="${KIND_LABELS.add}",1,NA()))`;
  const previous = `OFFSET(${H.running},-1,0)`;
  const magnitude =
    `IF(${H.method}="${METHOD_LABELS.fixed}",${H.value},` +
    `IF(${H.method}="${METHOD_LABELS.percentOfRunning}",${H.value}/100*${previous},` +
    `IF(${H.method}="${METHOD_LABELS.percentOfBase}",${H.value}/100*${base},NA())))`;
  return (
    `=IF(${H.method}="${BASE_METHOD_LABEL}",${base},` +
    `IF(${H.value}="","",${wrapRounding(`${sign}*${magnitude}`, rule)}))`
  );
}

export function summaryRunningFormula(): string {
  return `=IF(${H.amount}="",NA(),IF(${H.method}="${BASE_METHOD_LABEL}",${H.amount},OFFSET(${H.running},-1,0)+${H.amount}))`;
}

export function summaryTotalFormula(summaryName: string): string {
  const running = `${summaryName}[Lũy kế]`;
  return `=IF(COUNTBLANK(${running})>0,NA(),INDEX(${running},ROWS(${running})))`;
}

/** Các dòng dữ liệu ghi vào bảng tổng hợp (dòng cơ sở + từng khoản), theo thứ tự cột SUMMARY_HEADERS. */
export function summaryRows(
  quoteTableName: string,
  adjustments: readonly Adjustment[],
  rule: RoundingRule
): (string | number)[][] {
  const amount = summaryAmountFormula(quoteTableName, rule);
  const running = summaryRunningFormula();
  return [
    [BASE_ROW_LABEL, BASE_KIND_LABEL, BASE_METHOD_LABEL, "", amount, running],
    ...adjustments.map((a) => [
      // Tiền tố ' để Excel giữ nguyên chữ (không hiểu "10%" thành số…).
      `'${a.name}`,
      KIND_LABELS[a.kind],
      METHOD_LABELS[a.method],
      a.value ?? "",
      amount,
      running,
    ]),
  ];
}

export interface AdjustmentError {
  index: number;
  field: "name" | "value";
  message: string;
}

export function validateAdjustments(adjustments: readonly Adjustment[]): AdjustmentError[] {
  const errors: AdjustmentError[] = [];
  adjustments.forEach((a, index) => {
    if (a.name.trim() === "") {
      errors.push({ index, field: "name", message: "Nhập tên khoản mục." });
    }
    if (a.value !== null) {
      if (!Number.isFinite(a.value) || a.value < 0) {
        errors.push({ index, field: "value", message: "Giá trị phải là số không âm." });
      } else if (a.method !== "fixed" && a.kind === "deduct" && a.value > 100) {
        errors.push({ index, field: "value", message: "Tỷ lệ giảm trừ không được lớn hơn 100%." });
      }
    }
  });
  return errors;
}

function keyOf<K extends string>(labels: Record<K, string>, text: string): K | null {
  return (Object.keys(labels) as K[]).find((k) => labels[k] === text) ?? null;
}

export interface ParsedSummary {
  adjustments: Adjustment[];
  /** Dòng có Loại/Cách tính không hợp lệ (người dùng sửa trực tiếp trên sheet). */
  invalidRows: number[];
}

/** Đọc lại cấu hình hiện có từ chính bảng tổng hợp trên sheet (nguồn sự thật là workbook). */
export function parseSummaryRows(rows: readonly (readonly unknown[])[]): ParsedSummary {
  const adjustments: Adjustment[] = [];
  const invalidRows: number[] = [];
  rows.forEach((row, index) => {
    const [name, kindText, methodText, value] = row.map((v) =>
      v === null || v === undefined ? "" : v
    );
    if (methodText === BASE_METHOD_LABEL) {
      return;
    }
    const kind = keyOf(KIND_LABELS, String(kindText));
    const method = keyOf(METHOD_LABELS, String(methodText));
    if (!kind || !method || (value !== "" && typeof value !== "number")) {
      invalidRows.push(index);
      return;
    }
    adjustments.push({
      name: String(name),
      kind,
      method,
      value: value === "" ? null : (value as number),
    });
  });
  return { adjustments, invalidRows };
}
