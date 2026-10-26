/**
 * Cổng của khu vực Kiểm thử Excel (Cài đặt › Kiểm thử Excel, chỉ bản phát triển).
 * Implementation: src/office/excelLabGateway.ts, dùng lớp src/office/core/.
 * Mọi thao tác ghi chỉ chạm sheet "CQ Thử nghiệm" và bảng CQ_Test_Lab.
 */

export interface LabActiveInfo {
  workbookName: string | null;
  readOnly: boolean | null;
  structureProtected: boolean | null;
  sheetCount: number;
  activeSheet: string;
  sheetProtected: boolean;
  usedAddress: string | null;
}

export interface LabSheet {
  name: string;
  visibility: string;
  protected: boolean;
}

export interface LabSampleInspection {
  address: string;
  occupiedCount: number;
  fingerprint: string;
  /** Vùng mẫu đã là bảng thử nghiệm: không ghi lại lên bảng. */
  isTable: boolean;
}

export interface LabReadBack {
  address: string;
  rowCount: number;
  columnCount: number;
  emptyCells: number;
  formulaCells: number;
  errorCount: number;
  expectedErrors: number;
  /** Ô khác dữ liệu đã ghi (tối đa vài địa chỉ). */
  mismatches: string[];
}

export interface ExcelLabGateway {
  readActive(): Promise<LabActiveInfo>;
  listSheets(): Promise<{ sheets: LabSheet[]; activeSheet: string }>;
  /** Tạo sheet thử nghiệm nếu chưa có (chạy lặp không tạo trùng) rồi kích hoạt nó. */
  ensureSheet(): Promise<{ name: string; created: boolean }>;
  inspectSample(): Promise<LabSampleInspection>;
  /** Có dữ liệu cũ thì cần vân tay lúc kiểm tra (người dùng đã xác nhận ghi đè). */
  writeSample(expectedFingerprint?: string): Promise<{ address: string }>;
  createTable(): Promise<{ name: string; address: string; created: boolean }>;
  formatTable(): Promise<{ name: string }>;
  readBack(): Promise<LabReadBack>;
}
