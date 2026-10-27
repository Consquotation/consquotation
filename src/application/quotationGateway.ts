/**
 * Cổng giữa nghiệp vụ hồ sơ báo giá (ADR-0014) và Excel. Implementation: src/office/excelQuotationGateway.ts.
 * Bảng báo giá và sheet phân tích được đọc qua PricingGateway.readQuoteSnapshot (dùng chung với Kiểm
 * tra báo giá); cổng này lo hồ sơ (Custom XML Part) và các thao tác ghi có kiểm tra giá trị cũ.
 */

import type { OccupiedCells } from "./workbookGateway";
import type { QuotationRecord } from "../domain/quotation/model";

export type RecordRead =
  | { kind: "none" }
  | { kind: "ok"; record: QuotationRecord }
  /** Hồ sơ có trong workbook nhưng không đọc được (hỏng hoặc của phiên bản mới hơn): không ghi đè. */
  | { kind: "unreadable"; reason: "invalid" | "newer"; message: string };

/** Ghi một ô của dòng báo giá; `expected` là giá trị lúc đọc, khác lúc ghi → dừng, không ghi gì. */
export interface LineCellWrite {
  /** Chỉ số dòng dữ liệu trong bảng (từ 0). */
  row: number;
  header: string;
  /** "" = xóa ô. Chữ được ghi với tiền tố ' để Excel không tự đổi kiểu. */
  value: string | number;
  expected: unknown;
}

/** Điều kiện nhận diện dòng (ví dụ Mã công tác, Nội dung, Mã dòng) phải còn đúng lúc ghi. */
export interface RowGuard {
  row: number;
  expected: Record<string, unknown>;
}

/** Ghi một ô trên sheet phân tích (bảng CQ_Analysis). */
export interface AnalysisCellWrite {
  /** Chỉ số hàng trên sheet (từ 0). */
  rowIndex: number;
  header: string;
  value: string | number;
  expected: unknown;
}

export interface ExtensionInspection {
  /** Tên cột mở rộng còn thiếu, theo thứ tự sẽ thêm. */
  missing: string[];
  /** Ô có dữ liệu ngay bên phải bảng (sẽ bị Excel đẩy sang phải): có thì không thêm. */
  cellsRight: OccupiedCells;
  sheetProtected: boolean;
}

export interface QuotationGateway {
  readRecord(tableName: string): Promise<RecordRead>;
  /**
   * Lưu hồ sơ. `expectedUpdatedAt` là updatedAt của hồ sơ lúc đọc (null = lúc đó chưa có hồ sơ).
   * Hồ sơ trong workbook khác → RecordChangedError; hồ sơ không đọc được → không ghi đè, báo lỗi.
   */
  saveRecord(record: QuotationRecord, expectedUpdatedAt: string | null): Promise<void>;
  /** Ghi các ô của bảng báo giá; kiểm tra mọi giá trị cũ và điều kiện dòng trong cùng lượt ghi. */
  writeLineCells(tableName: string, writes: LineCellWrite[], guards: RowGuard[]): Promise<void>;
  writeAnalysisCells(writes: AnalysisCellWrite[]): Promise<void>;
  inspectExtensionColumns(tableName: string): Promise<ExtensionInspection>;
  /** Thêm các cột mở rộng còn thiếu vào bên phải bảng; trả về tên các cột đã thêm. */
  addExtensionColumns(tableName: string): Promise<string[]>;
}

export class RecordChangedError extends Error {
  constructor() {
    super("Hồ sơ báo giá trong workbook vừa thay đổi (có thể ở task pane khác).");
    this.name = "RecordChangedError";
  }
}

export class RecordUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordUnreadableError";
  }
}
