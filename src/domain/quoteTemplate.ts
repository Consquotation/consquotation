/**
 * Định nghĩa mẫu bảng báo giá (prompts/02, 06, 10, 11).
 * Thuần TypeScript: chỉ mô tả nội dung cần ghi, không gọi Office.js.
 *
 * Bố cục, tính từ ô neo (hàng 0, cột 0):
 *   hàng 0            Tiêu đề
 *   hàng 1..7         Khối thông tin: nhãn ở cột 0, ô giá trị (để trống) ở cột 3
 *   hàng 8            Trống
 *   hàng 9            Tiêu đề cột của Excel Table
 *   hàng 10..9+N      N dòng công tác
 *   hàng 10+N         Dòng tổng (totals row của Table)
 */

import { NO_ROUNDING, RoundingRule, wrapRounding } from "./pricing/rounding";

export type QuoteColumnKey =
  "stt" | "code" | "group" | "description" | "unit" | "quantity" | "unitPrice" | "amount" | "notes";

export interface QuoteColumn {
  key: QuoteColumnKey;
  header: string;
  /** Định dạng số Excel (mã en-US, Excel tự hiển thị theo locale). Không làm tròn giá trị. */
  numberFormat?: string;
  /** Độ rộng gợi ý (point) — chỉ áp dụng khi tạo trên sheet mới. */
  width: number;
}

/** Cột báo giá mặc định (prompts/02_PRODUCT_REQUIREMENTS.md). */
export const QUOTE_COLUMNS: readonly QuoteColumn[] = [
  { key: "stt", header: "STT", width: 36 },
  { key: "code", header: "Mã công tác", width: 80 },
  { key: "group", header: "Nhóm công tác", width: 100 },
  { key: "description", header: "Nội dung công việc", width: 260 },
  { key: "unit", header: "Đơn vị tính", width: 60 },
  { key: "quantity", header: "Khối lượng", numberFormat: "General", width: 70 },
  { key: "unitPrice", header: "Đơn giá", numberFormat: "#,##0", width: 90 },
  { key: "amount", header: "Thành tiền", numberFormat: "#,##0", width: 100 },
  { key: "notes", header: "Ghi chú", width: 120 },
];

export const QUOTE_TITLE = "BẢNG BÁO GIÁ";

/** Thông tin báo giá tùy chọn; người dùng tự điền giá trị. */
export const QUOTE_INFO_LABELS: readonly string[] = [
  "Đơn vị lập:",
  "Khách hàng:",
  "Dự án:",
  "Mã báo giá:",
  "Ngày lập:",
  "Phiên bản:",
  "Hiệu lực đến:",
];

export const INFO_VALUE_COLUMN_OFFSET = 3;
export const TOTAL_LABEL = "Tổng cộng";
export const DEFAULT_INITIAL_ROWS = 5;
export const MAX_INITIAL_ROWS = 500;

const HEADER_ROW_OFFSET = 1 + QUOTE_INFO_LABELS.length + 1;

export function columnIndexOf(key: QuoteColumnKey): number {
  return QUOTE_COLUMNS.findIndex((column) => column.key === key);
}

function headerOf(key: QuoteColumnKey): string {
  return QUOTE_COLUMNS[columnIndexOf(key)].header;
}

/** Tham chiếu cột trong cùng dòng của Table, ví dụ [@[Khối lượng]]. */
function thisRow(key: QuoteColumnKey): string {
  return `[@[${headerOf(key)}]]`;
}

/**
 * Công thức cột tính toán (calculated column). Viết bằng cú pháp en-US qua Range.formulas
 * nên không phụ thuộc dấu phân cách theo locale của người dùng.
 */
export function quoteColumnFormulas(
  tableName: string,
  amountRule: RoundingRule = NO_ROUNDING
): Partial<Record<QuoteColumnKey, string>> {
  const quantity = thisRow("quantity");
  const unitPrice = thisRow("unitPrice");
  return {
    // Tự đánh số; người dùng có thể gõ đè (ví dụ đánh số nhóm I, II).
    stt: `=ROW()-ROW(${tableName}[#Headers])`,
    // Để trống khi thiếu khối lượng hoặc đơn giá; không đổi lỗi thành 0 (prompts/10).
    // Làm tròn (nếu người dùng cấu hình) bằng hàm Excel, ở cấp Thành tiền từng dòng.
    amount: `=IF(OR(${quantity}="",${unitPrice}=""),"",${wrapRounding(`${quantity}*${unitPrice}`, amountRule)})`,
  };
}

export function totalRowFormulas(tableName: string): string[] {
  return QUOTE_COLUMNS.map((column) => {
    if (column.key === "description") {
      return TOTAL_LABEL;
    }
    if (column.key === "amount") {
      // SUBTOTAL(109, …) bỏ qua dòng bị lọc ẩn.
      return `=SUBTOTAL(109,${tableName}[${column.header}])`;
    }
    return "";
  });
}

export interface QuoteLayout {
  rowCount: number;
  columnCount: number;
  titleCell: { row: number; column: number };
  infoRows: { row: number; label: string; valueColumn: number }[];
  headerRow: number;
  firstDataRow: number;
  dataRowCount: number;
  totalRow: number;
}

export function clampInitialRows(requested: number): number {
  if (!Number.isFinite(requested)) {
    return DEFAULT_INITIAL_ROWS;
  }
  return Math.min(MAX_INITIAL_ROWS, Math.max(1, Math.floor(requested)));
}

/** Vị trí tương đối của từng phần trong mẫu; vùng chiếm dụng là rowCount × columnCount từ ô neo. */
export function buildQuoteLayout(initialRows: number): QuoteLayout {
  const dataRowCount = clampInitialRows(initialRows);
  const firstDataRow = HEADER_ROW_OFFSET + 1;
  return {
    rowCount: HEADER_ROW_OFFSET + 1 + dataRowCount + 1,
    columnCount: QUOTE_COLUMNS.length,
    titleCell: { row: 0, column: 0 },
    infoRows: QUOTE_INFO_LABELS.map((label, index) => ({
      row: 1 + index,
      label,
      valueColumn: INFO_VALUE_COLUMN_OFFSET,
    })),
    headerRow: HEADER_ROW_OFFSET,
    firstDataRow,
    dataRowCount,
    totalRow: firstDataRow + dataRowCount,
  };
}

/**
 * Bảng vẫn dùng được khi có đủ 9 cột mẫu, mỗi tên đúng một lần. Cho phép người dùng thêm cột
 * riêng hoặc đổi thứ tự cột — Excel tự nới Table khi gõ vào ô ngay bên phải bảng.
 * Không dùng được khi một cột mẫu bị đổi tên/xóa hoặc bị trùng tên.
 */
export function hasQuoteHeaders(headers: readonly string[]): boolean {
  return QUOTE_COLUMNS.every(
    (column) => headers.filter((header) => header === column.header).length === 1
  );
}

/**
 * Sắp một dòng giá trị theo thứ tự QUOTE_COLUMNS sang đúng thứ tự cột thực tế của bảng
 * (khớp theo tên cột); cột người dùng tự thêm được để trống. Trả về null nếu thiếu cột mẫu.
 */
export function alignRowToHeaders(
  headers: readonly string[],
  templateRow: readonly (string | number)[]
): (string | number)[] | null {
  if (!hasQuoteHeaders(headers) || templateRow.length !== QUOTE_COLUMNS.length) {
    return null;
  }
  return headers.map((header) => {
    const index = QUOTE_COLUMNS.findIndex((column) => column.header === header);
    return index >= 0 ? templateRow[index] : "";
  });
}
