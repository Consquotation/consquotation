import { QuoteTableInfo } from "./workbookGateway";

/**
 * Chọn sẵn bảng cho "Thêm công tác": ưu tiên bảng đang chứa vùng chọn trong Excel,
 * rồi lựa chọn hiện tại, rồi bảng đúng mẫu đầu tiên (prompts/05: không bắt người dùng chọn lại).
 */
export function preferredTable(list: readonly QuoteTableInfo[], current: string): string {
  return (
    list.find((t) => t.containsSelection)?.tableName ??
    list.find((t) => t.tableName === current)?.tableName ??
    (list.find((t) => t.headersMatch) ?? list[0])?.tableName ??
    ""
  );
}
