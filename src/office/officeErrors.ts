/**
 * Chuyển lỗi Office.js thành thông báo tiếng Việt có hướng khắc phục (prompts/13).
 * Chỉ dùng mã lỗi, không đưa nội dung ô hay dữ liệu báo giá vào thông báo/log.
 */

import { recordError } from "../shared/diagnostics";

const MESSAGES: Record<string, string> = {
  AccessDenied:
    "Excel từ chối thao tác. Sheet hoặc workbook có thể đang được bảo vệ (Protect) hoặc ở chế độ chỉ đọc.",
  InsertDeleteConflict:
    "Không thể chèn dòng vì sẽ đẩy lệch một bảng khác, ô gộp hoặc vùng bị khóa bên dưới. Hãy di chuyển dữ liệu bên dưới bảng rồi thử lại.",
  InvalidOperation:
    "Excel không cho phép thao tác này ở trạng thái hiện tại (ví dụ đang sửa một ô). Nhấn Enter hoặc Esc trong Excel rồi thử lại.",
  ItemAlreadyExists: "Tên sheet hoặc tên bảng đã tồn tại. Hãy thử lại để add-in chọn tên khác.",
  ItemNotFound:
    "Không tìm thấy sheet, bảng hoặc vùng cần dùng. Có thể nó vừa bị đổi tên hoặc xóa — hãy bấm Tải lại danh sách rồi thử lại.",
  InvalidArgument: "Dữ liệu ghi vào Excel không hợp lệ.",
  InvalidSelection: "Vùng đang chọn không phải là ô. Hãy chọn một ô trên sheet.",
  UnsupportedOperation: "Phiên bản Excel này chưa hỗ trợ thao tác này.",
  ApiNotFound: "Phiên bản Excel này chưa hỗ trợ API cần thiết.",
  GeneralException:
    "Excel báo lỗi chung khi thực hiện thao tác. Hãy thử lại; nếu lặp lại, đóng và mở lại task pane.",
  RequestPayloadSizeLimitExceeded:
    "Dữ liệu quá lớn cho một lần gửi tới Excel (thường gặp trên Excel trên web). Hãy chia nhỏ dữ liệu.",
};

interface OfficeLikeError {
  code?: string;
  message?: string;
}

export function describeOfficeError(error: unknown): string {
  // Ghi mã lỗi vào nhật ký phiên (không ghi nội dung) — lỗi không bị nuốt im lặng.
  recordError("ui", error);
  const code = (error as OfficeLikeError | null)?.code;
  if (code && MESSAGES[code]) {
    return `${MESSAGES[code]} (Mã lỗi: ${code})`;
  }
  if (code) {
    return `Excel báo lỗi khi thực hiện thao tác. (Mã lỗi: ${code})`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Hướng phục hồi khi thao tác GHI thất bại: Office.js có thể đã áp dụng một phần lệnh. */
export const PARTIAL_WRITE_HINT =
  "Một phần thay đổi có thể đã được ghi trước khi lỗi xảy ra và Ctrl+Z không hoàn tác được thao tác của add-in. Hãy kiểm tra vùng liên quan trên sheet, rồi chạy Tính giá › Kiểm tra báo giá trước khi thử lại.";

/** Thông báo cho lỗi của thao tác ghi: mô tả lỗi + trạng thái/cách phục hồi (prompts/13). */
export function describeWriteError(error: unknown): string {
  const base = describeOfficeError(error);
  // Lỗi không đến từ Excel (kiểm tra của add-in trước khi ghi) thì chưa có gì được ghi.
  const fromExcel = typeof (error as OfficeLikeError | null)?.code === "string";
  return fromExcel ? `${base} ${PARTIAL_WRITE_HINT}` : base;
}
