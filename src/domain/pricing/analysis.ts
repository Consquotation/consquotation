/**
 * Sheet "Phân tích đơn giá" (prompts/10: đơn giá phân tích cấu thành, truy vết được).
 * Một Excel Table CQ_Analysis cho cả workbook; mỗi công tác là một khối dòng (một dòng/tài nguyên).
 * - Thành tiền = Hao phí × Đơn giá nguồn (công thức Excel, trống khi thiếu số liệu).
 * - Đơn giá công tác = tổng Thành tiền của khối (công thức Excel; trống nếu còn dòng thiếu số liệu,
 *   lỗi nếu có ô lỗi — không đổi lỗi thành 0).
 * Bảng báo giá nhận đơn giá này dưới dạng GIÁ TRỊ (Excel tự lan công thức ra cả cột khi ghi công thức
 * vào cột Đơn giá đang trống — đã kiểm chứng), nên chức năng kiểm tra so sánh hai bên để báo lệch.
 *
 * So khớp mã bằng phép so sánh "=" trong SUMPRODUCT, không dùng COUNTIFS/SUMIFS: tiêu chí của
 * COUNTIFS coi "007", "07", "7" là một và hiểu * ? ~ là ký tự đại diện (đã kiểm chứng).
 */

import { RoundingRule, wrapRounding } from "./rounding";

export const ANALYSIS_TABLE_NAME = "CQ_Analysis";
export const ANALYSIS_SHEET_NAME = "Phân tích đơn giá";
export const ANALYSIS_TITLE = "PHÂN TÍCH ĐƠN GIÁ";
export const ANALYSIS_NOTE =
  "Đơn giá công tác = Σ (Hao phí × Đơn giá nguồn) của các dòng cùng mã. Sửa hao phí/đơn giá nguồn tại đây rồi dùng ConsQuotation › Kiểm tra báo giá để cập nhật bảng báo giá.";
/** Hàng (tính từ 0) của dòng tiêu đề cột trên sheet phân tích. */
export const ANALYSIS_HEADER_ROW = 3;

export type AnalysisColumnKey =
  | "code"
  | "name"
  | "unit"
  | "resourceCode"
  | "resourceName"
  | "resourceType"
  | "resourceUnit"
  | "quantity"
  | "price"
  | "lineAmount"
  | "unitPrice"
  | "source";

export interface AnalysisColumn {
  key: AnalysisColumnKey;
  header: string;
  width: number;
  numberFormat?: string;
}

export const ANALYSIS_COLUMNS: readonly AnalysisColumn[] = [
  { key: "code", header: "Mã công tác", width: 80 },
  { key: "name", header: "Tên công tác", width: 200 },
  { key: "unit", header: "Đơn vị công tác", width: 60 },
  { key: "resourceCode", header: "Mã tài nguyên", width: 80 },
  { key: "resourceName", header: "Tên tài nguyên", width: 180 },
  { key: "resourceType", header: "Loại", width: 80 },
  { key: "resourceUnit", header: "Đơn vị", width: 50 },
  { key: "quantity", header: "Hao phí", width: 70, numberFormat: "General" },
  { key: "price", header: "Đơn giá nguồn", width: 90, numberFormat: "#,##0" },
  { key: "lineAmount", header: "Thành tiền", width: 100, numberFormat: "#,##0" },
  { key: "unitPrice", header: "Đơn giá công tác", width: 100, numberFormat: "#,##0" },
  { key: "source", header: "Nguồn giá", width: 220 },
];

function headerOf(key: AnalysisColumnKey): string {
  return ANALYSIS_COLUMNS.find((c) => c.key === key)!.header;
}

const col = (key: AnalysisColumnKey) => `${ANALYSIS_TABLE_NAME}[${headerOf(key)}]`;
const here = (key: AnalysisColumnKey) => `[@[${headerOf(key)}]]`;

export function analysisLineAmountFormula(): string {
  return `=IF(OR(${here("quantity")}="",${here("price")}=""),"",${here("quantity")}*${here("price")})`;
}

export function analysisUnitPriceFormula(rule: RoundingRule): string {
  const sameCode = `--(${col("code")}=${here("code")})`;
  const missing = `SUMPRODUCT(${sameCode},--(${col("lineAmount")}=""))`;
  const total = `SUMPRODUCT(${sameCode},${col("lineAmount")})`;
  return `=IF(${missing}>0,"",${wrapRounding(total, rule)})`;
}

export function isAnalysisHeaders(headers: readonly string[]): boolean {
  return ANALYSIS_COLUMNS.every((c) => headers.filter((h) => h === c.header).length === 1);
}

export function analysisColumnIndex(headers: readonly string[], key: AnalysisColumnKey): number {
  return headers.indexOf(headerOf(key));
}
