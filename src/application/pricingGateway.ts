/**
 * Cổng giữa nghiệp vụ tính giá (prompts/10) và Excel. Implementation: src/office/excelPricingGateway.ts.
 * Mọi thao tác ghi đều kiểm tra lại trạng thái sheet trong cùng lượt ghi.
 */

import type { Adjustment } from "../domain/pricing/adjustments";
import type { QuoteSnapshot } from "../domain/pricing/quoteCheck";
import type { RoundingConfig } from "../domain/pricing/rounding";

export interface RoundingApplyResult {
  /** Số ô công thức đã cập nhật theo quy tắc mới. */
  updatedCells: number;
  /** Số ô có công thức khác mẫu (bị sửa tay) — giữ nguyên, không ghi đè. */
  keptCells: number;
}

/** Đơn giá công tác do Excel tính trên sheet phân tích. */
export type AnalysisPrice =
  { kind: "value"; value: number } | { kind: "missing" } | { kind: "error"; error: string };

export type AnalysisWriteResult =
  | { status: "written"; sheetName: string; price: AnalysisPrice }
  /** Mã đã có phân tích: không ghi thêm; dùng đơn giá hiện có nếu người dùng đồng ý. */
  | { status: "exists"; sheetName: string; price: AnalysisPrice };

export interface SummaryState {
  exists: boolean;
  adjustments: Adjustment[];
  /** Số dòng có Loại/Cách tính/Giá trị không hợp lệ trên sheet. */
  invalidRows: number;
  address: string;
}

export type SummaryAreaCheck =
  | { ok: true; address: string; fingerprint: string }
  | {
      ok: false;
      reason: "tableMissing" | "headersChanged" | "noTotals" | "protected" | "occupied";
      address?: string;
      sample?: string[];
    };

export interface UnitPriceFix {
  sheetName: string;
  address: string;
  /** Giá trị lúc kiểm tra; khác lúc ghi → dừng (người dùng vừa sửa). */
  expected: unknown;
  value: number;
}

export interface PricingGateway {
  readRounding(): Promise<RoundingConfig>;
  /** Lưu quy tắc làm tròn và cập nhật các công thức mẫu (Thành tiền, đơn giá phân tích, tổng hợp). */
  applyRounding(config: RoundingConfig): Promise<RoundingApplyResult>;
  /** Đơn giá phân tích hiện có của mã (null nếu chưa có phân tích). */
  findAnalysis(code: string): Promise<AnalysisPrice | null>;
  /** Thêm khối phân tích cho công tác (tạo sheet nếu chưa có); không ghi nếu mã đã có phân tích. */
  writeAnalysis(code: string, rows: (string | number)[][]): Promise<AnalysisWriteResult>;
  readSummary(quoteTableName: string): Promise<SummaryState>;
  /** Kiểm tra vùng sẽ ghi bảng tổng hợp với số khoản mục cho trước. */
  inspectSummary(quoteTableName: string, adjustmentCount: number): Promise<SummaryAreaCheck>;
  writeSummary(
    quoteTableName: string,
    adjustments: Adjustment[],
    fingerprint: string
  ): Promise<void>;
  removeSummary(quoteTableName: string): Promise<void>;
  readQuoteSnapshot(quoteTableName: string): Promise<QuoteSnapshot>;
  /** Ghi đơn giá theo phân tích sau khi người dùng xác nhận; trả về số ô đã ghi. */
  setUnitPrices(fixes: UnitPriceFix[]): Promise<number>;
  /** Chỉ điều hướng: kích hoạt sheet và chọn ô. */
  goTo(sheetName: string, address: string): Promise<void>;
}
