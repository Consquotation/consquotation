/**
 * Cổng (port) giữa nghiệp vụ và Excel. Implementation thật nằm ở src/office/;
 * test dùng bản giả lập. Mọi địa chỉ trả về là địa chỉ A1 không kèm tên sheet.
 */

import type { SourceTable } from "../domain/library/exchange/source";

export interface WorkbookContext {
  workbookName: string | null;
  sheetName: string;
  selectionAddress: string;
  sheetProtected: boolean;
}

/** Vị trí ghi đã được cố định sau khi kiểm tra, để bước ghi không phụ thuộc vùng chọn mới. */
export type TemplateTarget =
  /** baseName: tên người dùng chọn; add-in thêm (2), (3)… nếu trùng. */
  | { kind: "newSheet"; baseName: string }
  | { kind: "atCell"; sheetName: string; rowIndex: number; columnIndex: number };

/** Nơi chèn công tác vào bảng báo giá (prompts/06: chèn tại vị trí đã chọn). */
export type InsertPosition = { kind: "end" } | { kind: "belowSelection" };

export interface OccupiedCells {
  count: number;
  /** Tối đa vài địa chỉ đầu tiên để hiển thị. */
  sample: string[];
}

export type TargetBlocker =
  | { kind: "protected" }
  | { kind: "tableOverlap"; tableNames: string[] }
  | { kind: "mergedCells"; addresses: string[] }
  | { kind: "outOfBounds" }
  | { kind: "sheetMissing" };

export interface TargetInspection {
  target: TemplateTarget;
  sheetName: string;
  /** Vùng sẽ ghi; với sheet mới là vùng dự kiến trên sheet sẽ tạo. */
  address: string;
  occupied: OccupiedCells;
  blockers: TargetBlocker[];
  /** Dấu vân tay nội dung vùng đích lúc kiểm tra, dùng để phát hiện thay đổi trước khi ghi. */
  fingerprint: string;
  /** Các kiểm tra không chạy được trên Excel này (ví dụ ô gộp cần ExcelApi 1.13). */
  skippedChecks: string[];
}

export interface CreatedQuote {
  sheetName: string;
  tableName: string;
  address: string;
}

export interface QuoteTableInfo {
  tableName: string;
  sheetName: string;
  dataRowCount: number;
  headersMatch: boolean;
  /** Vùng đang chọn trong Excel nằm trong bảng này. */
  containsSelection: boolean;
  /** Số hàng trên sheet (tính từ 1) của hàng cuối vùng chọn nằm trong bảng; null nếu không nằm trong bảng. */
  selectedSheetRow: number | null;
}

export interface AppendInspection {
  tableName: string;
  sheetName: string;
  /** Ô có dữ liệu nằm dưới bảng, trong phạm vi cột của bảng — sẽ bị Excel đẩy xuống khi thêm dòng. */
  cellsBelow: OccupiedCells;
  blockers: (
    | TargetBlocker
    | { kind: "tableMissing" }
    | { kind: "headersChanged" }
    /** Chọn "dưới dòng đang chọn" nhưng vùng chọn không nằm trong bảng. */
    | { kind: "selectionOutsideTable" }
  )[];
  /**
   * Chỉ số (tính từ 0, trong phần dữ liệu của bảng) mà dòng mới sẽ chiếm; null = cuối bảng.
   * Cố định lúc kiểm tra để bước ghi không phụ thuộc vùng chọn mới.
   */
  insertIndex: number | null;
  fingerprint: string;
}

export interface AppendedRows {
  tableName: string;
  sheetName: string;
  address: string;
}

export interface SheetSummary {
  name: string;
  /** Kích thước vùng có dữ liệu (0 nếu sheet trống). */
  rowCount: number;
  columnCount: number;
}

export interface SheetRead {
  table: SourceTable;
  /** Tổng số dòng có dữ liệu trên sheet; lớn hơn số dòng đã đọc nếu vượt giới hạn. */
  totalRows: number;
}

export interface WorkbookGateway {
  readContext(): Promise<WorkbookContext>;
  /** Kiểm tra vùng mẫu sẽ chiếm tại ô đầu tiên của vùng đang chọn trên sheet hiện tại. */
  inspectAtSelection(rowCount: number, columnCount: number): Promise<TargetInspection>;
  /** Kiểm tra lại một vị trí đã cố định (dùng ngay trước khi ghi). */
  inspectTarget(
    target: TemplateTarget,
    rowCount: number,
    columnCount: number
  ): Promise<TargetInspection>;
  /**
   * Ghi mẫu. Implementation phải kiểm tra lại vân tay vùng đích trong cùng batch ghi
   * và ném TargetChangedError nếu khác.
   */
  writeTemplate(
    target: TemplateTarget,
    initialRows: number,
    expectedFingerprint: string
  ): Promise<CreatedQuote>;
  listQuoteTables(): Promise<QuoteTableInfo[]>;
  /** Kích hoạt sheet và chọn bảng (chỉ điều hướng, không ghi dữ liệu). */
  selectQuoteTable(tableName: string): Promise<void>;
  /**
   * Cờ trong workbook settings cho biết workbook này đã từng chèn công tác từ thư viện.
   * Dùng để cảnh báo khi thư viện cục bộ trống bất thường (ADR-0003: cache Office bị xóa).
   */
  wasLibraryUsed(): Promise<boolean>;
  markLibraryUsed(): Promise<void>;
  /** Danh sách sheet để chọn nguồn nhập thư viện (chỉ đọc). */
  listSheets(): Promise<{ sheets: SheetSummary[]; activeSheet: string }>;
  /** Đọc vùng có dữ liệu của sheet (tối đa maxRows dòng), kèm chữ hiển thị và ngày (chỉ đọc). */
  readSheet(sheetName: string, maxRows: number): Promise<SheetRead>;
  /** Mở workbook mới từ nội dung .xlsx (base64); người dùng tự lưu bằng Excel. */
  openNewWorkbook(base64: string): Promise<void>;
  inspectAppend(tableName: string, position: InsertPosition): Promise<AppendInspection>;
  /** Chèn dòng tại insertIndex đã kiểm tra (null = cuối bảng); kiểm tra lại vân tay trong cùng batch. */
  appendRows(
    tableName: string,
    rows: (string | number)[][],
    expectedFingerprint: string,
    insertIndex: number | null
  ): Promise<AppendedRows>;
}

export class TargetChangedError extends Error {
  constructor() {
    super("Vùng đích đã thay đổi kể từ lúc kiểm tra.");
    this.name = "TargetChangedError";
  }
}
