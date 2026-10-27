/**
 * Cổng xuất bảng diễn giải định mức ra workbook đang mở (ADR-0013).
 * Implementation: src/office/excelNormExportGateway.ts, dùng lớp src/office/core/.
 */

import type { ExplanationSheet } from "../domain/pricing/normExplanation";

export interface NormExportGateway {
  /** Tạo SHEET MỚI (thêm (2), (3)… nếu trùng tên), ghi bảng diễn giải, kích hoạt sheet đó. */
  writeExplanation(sheet: ExplanationSheet): Promise<{ sheetName: string; address: string }>;
}
