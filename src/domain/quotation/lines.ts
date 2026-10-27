/**
 * Đọc các dòng công tác từ ảnh chụp bảng báo giá (đọc trực tiếp từ sheet). Cột được tìm theo tên,
 * nên bảng có thêm cột riêng của người dùng hoặc đổi thứ tự cột vẫn đọc đúng; cột mở rộng (Mã dòng,
 * đơn giá thành phần) chỉ dùng khi có.
 */

import type { QuoteSnapshot, SheetRow } from "../pricing/quoteCheck";
import {
  BREAKDOWN_COLUMNS,
  LINE_ID_HEADER,
  QUOTE_COLUMNS,
  QuoteColumnKey,
  extensionHeader,
  missingExtensionColumns,
} from "../quoteTemplate";
import type { CostType } from "./model";

export const COST_TYPES: readonly CostType[] = ["material", "labor", "machine", "other"];

export interface CellRead {
  value: unknown;
  /** valueTypes của Excel: "Empty" | "String" | "Double" | "Error" | … */
  type: string;
  formula: unknown;
}

export interface QuoteLine {
  /** Chỉ số dòng dữ liệu trong bảng (từ 0). */
  row: number;
  /** Số hàng trên sheet (từ 1), để hiển thị và "Đi tới". */
  sheetRow: number;
  /** null khi bảng không có cột Mã dòng hoặc ô trống. */
  lineId: string | null;
  code: string;
  group: string;
  description: string;
  unit: string;
  notes: string;
  quantity: CellRead;
  unitPrice: CellRead;
  amount: CellRead;
  /** null khi bảng không có đủ 4 cột đơn giá thành phần. */
  breakdown: Record<CostType, CellRead> | null;
}

export interface QuoteLines {
  lines: QuoteLine[];
  hasLineIds: boolean;
  hasBreakdown: boolean;
  /** Tên các cột mở rộng còn thiếu (bảng tạo trước giai đoạn 17). */
  missingColumns: string[];
  /** Chỉ số cột (trong bảng) theo tên; -1 nếu không có. */
  columnIndex: (header: string) => number;
}

export function isBlank(value: unknown): boolean {
  return value === "" || value === null || value === undefined;
}

function headerOf(key: QuoteColumnKey): string {
  return QUOTE_COLUMNS.find((c) => c.key === key)!.header;
}

function cell(row: SheetRow, index: number): CellRead {
  return index < 0
    ? { value: "", type: "Empty", formula: "" }
    : { value: row.values[index], type: row.types[index] ?? "Empty", formula: row.formulas[index] };
}

/** Các dòng có dữ liệu (cùng quy tắc với Kiểm tra báo giá: bỏ qua dòng trống của mẫu). */
export function quoteLines(snapshot: QuoteSnapshot): QuoteLines {
  const { quote } = snapshot;
  const columnIndex = (header: string) => quote.headers.indexOf(header);
  const col = (key: QuoteColumnKey) => columnIndex(headerOf(key));
  const idCol = columnIndex(LINE_ID_HEADER);
  const breakdownCols = COST_TYPES.map((t) => columnIndex(extensionHeader(BREAKDOWN_COLUMNS[t])));
  const hasBreakdown = breakdownCols.every((i) => i >= 0);
  const meaningful = (["code", "description", "quantity", "unitPrice", "notes"] as const).map(col);
  const text = (row: SheetRow, key: QuoteColumnKey) => String(row.values[col(key)] ?? "").trim();
  const lines: QuoteLine[] = [];
  quote.rows.forEach((row, r) => {
    if (!meaningful.some((c) => c >= 0 && !isBlank(row.values[c]))) {
      return;
    }
    const id = idCol >= 0 ? String(row.values[idCol] ?? "").trim() : "";
    lines.push({
      row: r,
      sheetRow: quote.firstRowIndex + r + 1,
      lineId: id === "" ? null : id,
      code: text(row, "code"),
      group: text(row, "group"),
      description: text(row, "description"),
      unit: text(row, "unit"),
      notes: String(row.values[col("notes")] ?? ""),
      quantity: cell(row, col("quantity")),
      unitPrice: cell(row, col("unitPrice")),
      amount: cell(row, col("amount")),
      breakdown: hasBreakdown
        ? (Object.fromEntries(COST_TYPES.map((t, i) => [t, cell(row, breakdownCols[i])])) as Record<
            CostType,
            CellRead
          >)
        : null,
    });
  });
  return {
    lines,
    hasLineIds: idCol >= 0,
    hasBreakdown,
    missingColumns: missingExtensionColumns(quote.headers).map((c) => c.header),
    columnIndex,
  };
}

/** Băm djb2 (32 bit) để so nhanh nội dung; không dùng cho bảo mật. */
export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Vân tay nội dung báo giá: giá trị mọi ô của bảng, dòng tổng, các dòng phân tích của các mã đang
 * dùng. Dùng để biết báo giá có bị sửa sau khi hoàn tất hoặc sau lần xem gần nhất không.
 */
export function contentFingerprint(snapshot: QuoteSnapshot): string {
  const { quote, analysis } = snapshot;
  const codeCol = quote.headers.indexOf(headerOf("code"));
  const codes = new Set(
    quote.rows.map((r) =>
      String(r.values[codeCol] ?? "")
        .trim()
        .toLocaleLowerCase("vi-VN")
    )
  );
  const parts = [
    quote.name,
    JSON.stringify(quote.headers),
    ...quote.rows.map((r) => JSON.stringify(r.values)),
    JSON.stringify(quote.totals?.values ?? null),
    ...(analysis ?? [])
      .filter((a) => codes.has(a.code.toLocaleLowerCase("vi-VN")))
      .map((a) => JSON.stringify([a.code, a.resourceCode, a.quantity, a.price, a.unitPrice])),
  ];
  return hashText(parts.join("\n"));
}
