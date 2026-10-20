/**
 * Chuyển lỗi Office.js thành thông báo tiếng Việt có hướng khắc phục (prompts/13).
 * Chỉ dùng mã lỗi, không đưa nội dung ô hay dữ liệu báo giá vào thông báo/log.
 */

const MESSAGES: Record<string, string> = {
  AccessDenied:
    "Excel từ chối thao tác. Sheet hoặc workbook có thể đang được bảo vệ (Protect) hoặc ở chế độ chỉ đọc.",
  InsertDeleteConflict:
    "Không thể chèn dòng vì sẽ đẩy lệch một bảng khác, ô gộp hoặc vùng bị khóa bên dưới. Hãy di chuyển dữ liệu bên dưới bảng rồi thử lại.",
  InvalidOperation:
    "Excel không cho phép thao tác này ở trạng thái hiện tại (ví dụ đang sửa một ô). Nhấn Enter hoặc Esc trong Excel rồi thử lại.",
  ItemAlreadyExists: "Tên sheet hoặc tên bảng đã tồn tại. Hãy thử lại để add-in chọn tên khác.",
  ItemNotFound: "Không tìm thấy sheet hoặc bảng. Có thể nó vừa bị đổi tên hoặc xóa.",
  InvalidArgument: "Dữ liệu ghi vào Excel không hợp lệ.",
  InvalidSelection: "Vùng đang chọn không phải là ô. Hãy chọn một ô trên sheet.",
  UnsupportedOperation: "Phiên bản Excel này chưa hỗ trợ thao tác này.",
  ApiNotFound: "Phiên bản Excel này chưa hỗ trợ API cần thiết.",
};

interface OfficeLikeError {
  code?: string;
  message?: string;
}

export function describeOfficeError(error: unknown): string {
  const code = (error as OfficeLikeError | null)?.code;
  if (code && MESSAGES[code]) {
    return `${MESSAGES[code]} (Mã lỗi: ${code})`;
  }
  if (code) {
    return `Excel báo lỗi khi thực hiện thao tác. (Mã lỗi: ${code})`;
  }
  return error instanceof Error ? error.message : String(error);
}
