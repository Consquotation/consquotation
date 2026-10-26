/* global Excel */

/**
 * Lớp thao tác Excel dùng chung (src/office/core/). Quy ước của mọi hàm trong thư mục này:
 * - Nhận `context` của một Excel.run do nơi gọi mở, để nhiều thao tác gom vào cùng một batch.
 *   Hàm không giữ proxy object ra ngoài Excel.run của nơi gọi.
 * - Gom load rồi mới sync; không sync trong vòng lặp.
 * - Kiểm tra đầu vào trước khi gửi lệnh ghi; lỗi kiểm tra là ExcelOpError (không có gì được ghi).
 * - Lỗi Office.js (có `code`) được ném tiếp nguyên vẹn để officeErrors.ts dịch theo mã.
 * - Không tự thử lại thao tác ghi.
 */

import { ExcelOpError } from "../../domain/excel/errors";
import { Feature, FEATURE_REQUIREMENTS } from "../capabilities";
import { recordError } from "../../shared/diagnostics";
import { EXCEL_ERRORS } from "../../shared/strings.excel.vi";
import { supports } from "../excelHelpers";

/**
 * Excel.run kèm ghi nhật ký: lỗi Office.js được ghi mã, vị trí API và tên thao tác.
 * Lỗi kiểm tra (ExcelOpError) không ghi ở đây; giao diện ghi khi hiển thị.
 */
export async function runExcel<T>(
  operation: string,
  batch: (context: Excel.RequestContext) => Promise<T>
): Promise<T> {
  try {
    return await Excel.run(batch);
  } catch (error) {
    if (!(error instanceof ExcelOpError)) {
      recordError(operation, error);
    }
    throw error;
  }
}

/** Ném "unsupported" nếu Excel đang chạy thiếu requirement set của tính năng. */
export function requireFeature(feature: Feature, label: string): void {
  const requirement = FEATURE_REQUIREMENTS[feature];
  if (!supports(requirement.version)) {
    throw new ExcelOpError("unsupported", EXCEL_ERRORS.unsupported(label, requirement.version));
  }
}
