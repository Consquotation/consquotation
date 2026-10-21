/**
 * Cổng cho mẫu in và khu vực ghi chú/điều khoản (prompts/11).
 * Implementation: src/office/excelLayoutGateway.ts.
 */

import type { PrintOptions } from "../domain/printLayout";
import type { TermsSection } from "../domain/terms";

export interface TermsState {
  exists: boolean;
  sections: TermsSection[];
  /** Địa chỉ A1 (không kèm tên sheet) của khu vực hiện có. */
  address: string;
}

export type TermsAreaCheck =
  | { ok: true; address: string; fingerprint: string }
  | { ok: false; reason: "tableMissing" | "protected" | "occupied"; sample?: string[] };

export interface PrintSetupState {
  /** Office.js có PageLayout (ExcelApi 1.9) trên Excel này không. */
  supported: boolean;
  sheetName: string;
  /** Vùng báo giá sẽ được đặt làm vùng in (tiêu đề → hết khu vực điều khoản). */
  quoteArea: string;
  headerRow: number;
  /** Sheet đang được bảo vệ: không đặt được thiết lập in. */
  sheetProtected: boolean;
  /** Thiết lập đang có trên sheet (null nếu chưa đặt hoặc không đọc được). */
  current: {
    printArea: string | null;
    titleRows: string | null;
    orientation: string | null;
    paper: string | null;
    fitWide: number | null;
    fitTall: number | null;
    scale: number | null;
    footer: string | null;
  } | null;
}

export interface LayoutGateway {
  readTerms(quoteTableName: string): Promise<TermsState>;
  inspectTerms(quoteTableName: string, rowCount: number): Promise<TermsAreaCheck>;
  /** Ghi (hoặc ghi lại) khu vực điều khoản; danh sách rỗng = xóa khu vực. */
  writeTerms(quoteTableName: string, sections: TermsSection[], fingerprint: string): Promise<void>;
  removeTerms(quoteTableName: string): Promise<void>;
  readPrintSetup(quoteTableName: string): Promise<PrintSetupState>;
  /** Đặt vùng in, lặp tiêu đề, hướng/khổ giấy, co giãn, chân trang; trả về vùng in đã đặt. */
  applyPrintSetup(quoteTableName: string, options: PrintOptions): Promise<{ printArea: string }>;
}
