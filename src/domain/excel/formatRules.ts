/**
 * Bộ quy tắc định dạng dùng chung cho các bảng do ConsQuotation tạo. Thuần dữ liệu.
 *
 * - Định dạng số chỉ đổi cách hiển thị, không đổi giá trị trong ô (ADR-0008: hiển thị theo
 *   định dạng ô; làm tròn chỉ khi người dùng đặt quy tắc).
 * - Mã định dạng viết theo en-US; Excel tự hiển thị theo locale máy (dấu "." hay "," cho hàng
 *   nghìn/thập phân).
 * - Màu ít và trung tính để in đen trắng vẫn rõ; không đổi phông chữ của workbook.
 */

import { ColumnKind } from "./tableSchema";

export const NUMBER_FORMATS: Record<ColumnKind, string> = {
  text: "General",
  code: "General",
  integer: "General",
  quantity: "General",
  /** Tiền đồng: không có phần lẻ khi hiển thị; giá trị vẫn giữ đủ phần lẻ. */
  money: "#,##0",
  percent: "0.00%",
  /** ";@" để không bị đổi theo định dạng ngày ngắn của hệ thống (đã kiểm chứng khi nghiệm thu). */
  date: "dd/mm/yyyy;@",
};

export type HorizontalAlign = "Left" | "Center" | "Right" | "General";

export const COLUMN_ALIGN: Record<ColumnKind, HorizontalAlign> = {
  text: "Left",
  code: "Left",
  integer: "Center",
  quantity: "Right",
  money: "Right",
  percent: "Right",
  date: "Center",
};

/** Độ rộng gợi ý (point) theo kiểu cột; dùng khi tạo bảng mới. */
export const COLUMN_WIDTH: Record<ColumnKind, number> = {
  text: 200,
  code: 80,
  integer: 36,
  quantity: 70,
  money: 95,
  percent: 60,
  date: 75,
};

export interface CellStyle {
  bold?: boolean;
  fontColor?: string;
  fill?: string;
  horizontal?: HorizontalAlign;
  vertical?: "Top" | "Center" | "Bottom";
  wrap?: boolean;
}

export interface BorderStyle {
  color: string;
  weight: "Hairline" | "Thin" | "Medium";
}

export const CQ_STYLE = {
  header: {
    bold: true,
    fontColor: "#000000",
    fill: "#D9E1F2",
    horizontal: "Center",
    vertical: "Center",
    wrap: true,
  } satisfies CellStyle,
  border: { color: "#808080", weight: "Thin" } satisfies BorderStyle,
  /** Kiểu Table có sẵn trong Excel, nhạt để không lấn màu tiêu đề. */
  tableStyle: "TableStyleLight1",
  headerRowHeight: 30,
  /** Giới hạn khi tự điều chỉnh độ rộng cột (point). */
  autofitMinWidth: 30,
  autofitMaxWidth: 300,
} as const;

/** Kẹp độ rộng sau autofit vào [min, max] để một ô chữ dài không kéo cột quá rộng. */
export function clampWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}
