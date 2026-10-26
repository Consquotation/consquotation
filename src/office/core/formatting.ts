/* global Excel */

/**
 * Định dạng vùng, hàng, cột, Table theo bộ quy tắc domain/excel/formatRules.ts.
 * Các hàm "apply…" chỉ xếp lệnh vào batch (không sync); nơi gọi sync một lần.
 * Chỉ định dạng vùng được truyền vào, không đổi định dạng toàn workbook hay kiểu mặc định.
 * Định dạng số không đổi giá trị trong ô.
 */

import {
  BorderStyle,
  CQ_STYLE,
  CellStyle,
  COLUMN_ALIGN,
  COLUMN_WIDTH,
  NUMBER_FORMATS,
  clampWidth,
} from "../../domain/excel/formatRules";
import { TableSchema, matchHeaders } from "../../domain/excel/tableSchema";
import { supports } from "../excelHelpers";
import { readTable, requireTable } from "./tables";

export function applyCellStyle(range: Excel.Range, style: CellStyle): void {
  const format = range.format;
  if (style.bold !== undefined) {
    format.font.bold = style.bold;
  }
  if (style.fontColor) {
    format.font.color = style.fontColor;
  }
  if (style.fill) {
    format.fill.color = style.fill;
  }
  if (style.horizontal) {
    format.horizontalAlignment = style.horizontal;
  }
  if (style.vertical) {
    format.verticalAlignment = style.vertical;
  }
  if (style.wrap !== undefined) {
    format.wrapText = style.wrap;
  }
}

const OUTER_EDGES = ["EdgeTop", "EdgeBottom", "EdgeLeft", "EdgeRight"] as const;
const INNER_EDGES = ["InsideHorizontal", "InsideVertical"] as const;

/** Viền ngoài và viền trong (InsideHorizontal/Vertical bị Excel bỏ qua nếu vùng chỉ có 1 hàng/cột). */
export function applyBorders(range: Excel.Range, border: BorderStyle, inner = true): void {
  const edges = inner ? [...OUTER_EDGES, ...INNER_EDGES] : [...OUTER_EDGES];
  for (const edge of edges) {
    const item = range.format.borders.getItem(edge);
    item.style = "Continuous";
    item.color = border.color;
    item.weight = border.weight;
  }
}

/** Độ rộng (point) cho từng cột của vùng, theo thứ tự; undefined thì bỏ qua cột đó. */
export function setColumnWidths(range: Excel.Range, widths: readonly (number | undefined)[]): void {
  widths.forEach((width, i) => {
    if (width !== undefined) {
      range.getColumn(i).format.columnWidth = width;
    }
  });
}

export function setRowHeight(range: Excel.Range, height: number): void {
  range.format.rowHeight = height;
}

/** Một mã định dạng số cho cả vùng (ma trận cùng kích thước để chạy được với mọi phiên bản). */
export function applyNumberFormat(
  range: Excel.Range,
  format: string,
  rowCount: number,
  columnCount: number
): void {
  range.numberFormat = Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, () => format)
  );
}

/** Cố định `rows` hàng đầu của sheet khi cuộn (ExcelApi 1.7). Không có API thì bỏ qua, trả false. */
export function freezeTopRows(sheet: Excel.Worksheet, rows: number): boolean {
  if (!supports("1.7")) {
    return false;
  }
  sheet.freezePanes.freezeRows(rows);
  return true;
}

/**
 * Tự điều chỉnh độ rộng cột rồi kẹp vào [min, max] để một ô chữ dài không kéo cột quá rộng.
 * Cần 2 lần sync (autofit → đọc độ rộng → kẹp).
 */
export async function autofitColumnsClamped(
  context: Excel.RequestContext,
  range: Excel.Range,
  columnCount: number,
  min: number = CQ_STYLE.autofitMinWidth,
  max: number = CQ_STYLE.autofitMaxWidth
): Promise<void> {
  if (!supports("1.2")) {
    return;
  }
  range.format.autofitColumns();
  const columns = Array.from({ length: columnCount }, (_, i) => {
    const format = range.getColumn(i).format;
    format.load("columnWidth");
    return format;
  });
  await context.sync();
  columns.forEach((format) => {
    const clamped = clampWidth(format.columnWidth, min, max);
    if (clamped !== format.columnWidth) {
      format.columnWidth = clamped;
    }
  });
  await context.sync();
}

export interface TableFormatOptions {
  /** Đặt độ rộng gợi ý theo kiểu cột (true) hay tự điều chỉnh có giới hạn (false). */
  fixedWidths?: boolean;
  freezeHeader?: boolean;
}

export interface TableFormatResult {
  /** Cột trong bảng không thuộc schema: giữ nguyên định dạng. */
  untouchedColumns: string[];
  frozen: boolean;
}

/**
 * Định dạng Table theo schema: tiêu đề, viền, định dạng số và căn lề theo kiểu cột, độ rộng,
 * cố định hàng tiêu đề. Cột người dùng tự thêm (không thuộc schema) không bị đổi định dạng.
 */
export async function formatTableBySchema(
  context: Excel.RequestContext,
  tableName: string,
  schema: TableSchema,
  options: TableFormatOptions = {}
): Promise<TableFormatResult> {
  await requireTable(context, tableName);
  const info = await readTable(context, tableName);
  const table = context.workbook.tables.getItem(info.name);
  const { indexByKey, extra } = matchHeaders(schema, info.headers);
  const header = table.getHeaderRowRange();
  const body = table.getDataBodyRange();
  const rowCount = info.values.length;

  table.style = CQ_STYLE.tableStyle;
  table.showHeaders = true;
  applyCellStyle(header, CQ_STYLE.header);
  setRowHeight(header, CQ_STYLE.headerRowHeight);
  applyBorders(table.getRange(), CQ_STYLE.border);

  const widths: (number | undefined)[] = info.headers.map(() => undefined);
  for (const column of schema.columns) {
    const index = indexByKey[column.key];
    if (index === undefined) {
      continue;
    }
    const cells = body.getColumn(index);
    applyNumberFormat(cells, NUMBER_FORMATS[column.kind], rowCount, 1);
    cells.format.horizontalAlignment = COLUMN_ALIGN[column.kind];
    cells.format.wrapText = column.kind === "text";
    widths[index] = column.width ?? COLUMN_WIDTH[column.kind];
  }
  let frozen = false;
  if (options.freezeHeader ?? true) {
    // Cố định tới hết hàng tiêu đề của bảng (bảng có thể không bắt đầu ở hàng 1).
    header.load("rowIndex");
    await context.sync();
    frozen = freezeTopRows(table.worksheet, header.rowIndex + 1);
  }
  if (options.fixedWidths ?? true) {
    setColumnWidths(table.getRange(), widths);
    await context.sync();
  } else {
    await context.sync();
    await autofitColumnsClamped(context, table.getRange(), info.headers.length);
  }
  // Sau khi có độ rộng cuối cùng: tăng chiều cao hàng dữ liệu để chữ xuống dòng không bị cắt khi
  // in (đã gặp khi xuất PDF, 2026-10-26). Hàng tiêu đề giữ chiều cao cố định.
  if (supports("1.2")) {
    body.format.autofitRows();
    await context.sync();
  }
  return { untouchedColumns: extra, frozen };
}

/** Bật/tắt hàng tiêu đề của Table. Tắt chỉ ẩn, không xóa tên cột. */
export function setTableHeaderVisible(table: Excel.Table, visible: boolean): void {
  table.showHeaders = visible;
}
