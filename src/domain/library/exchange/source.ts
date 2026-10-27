/**
 * Từ bảng nguồn (sheet Excel hoặc CSV) tới bộ dữ liệu nhập: nhận diện dòng tiêu đề,
 * đoán loại dữ liệu, tự map cột theo tên (prompts/09). Người dùng luôn xem và sửa được.
 */

import { columnToLetters } from "../../../shared/a1";
import { RawCell, isBlankCell, parseTextCell } from "./cells";
import { DATASETS, DATASET_KINDS, DatasetKind, fieldMatchesHeader } from "./schema";
import type { ResourceType } from "../types";

/** Số dòng tối đa của một bộ dữ liệu nhập (prompts/17: giữ task pane phản hồi được). */
export const MAX_IMPORT_ROWS = 50_000;
/** Từ ngưỡng này hiển thị cảnh báo nhập lâu (ADR-0004). */
export const LARGE_IMPORT_ROWS = 5_000;
/** Chỉ tìm dòng tiêu đề trong vài chục dòng đầu. */
const HEADER_SCAN_ROWS = 30;

export interface SourceTable {
  /** Mô tả nguồn cho báo cáo, ví dụ: Sheet "Công tác" hoặc File "gia.csv". */
  label: string;
  /** Số thứ tự dòng (tính từ 1) trên sheet/file của rows[0]. */
  firstRowNumber: number;
  /** Chỉ số cột (tính từ 0) của cột đầu tiên. */
  firstColumnIndex: number;
  rows: RawCell[][];
}

export interface ImportRow {
  /** "Dòng 7" (sheet/CSV) hoặc "Bản ghi 3" (JSON). */
  rowLabel: string;
  cells: Record<string, RawCell | undefined>;
  /** Có ở file sao lưu JSON: giữ id và thời điểm tạo/sửa gốc khi khôi phục. */
  meta?: {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    /** JSON v3: ảnh chụp tài nguyên của thành phần định mức (giữ lịch sử liên kết khi khôi phục). */
    snapshot?: { code: string; name: string; unit: string; type: ResourceType };
  };
  /** Lỗi phát hiện khi đọc nguồn (ví dụ JSON tham chiếu id không có trong file). */
  preErrors?: { field?: string; message: string }[];
}

export interface ImportDataset {
  kind: DatasetKind;
  sourceLabel: string;
  /** Trường có cột nguồn. Khi cập nhật bản ghi trùng, chỉ các trường này được thay đổi. */
  mappedFields: string[];
  /** Nhãn cột của từng trường để chỉ ra chỗ lỗi, ví dụ: cột D (Đơn giá). */
  columnLabels: Record<string, string>;
  rows: ImportRow[];
  /** Lỗi của cả bộ dữ liệu (thiếu cột bắt buộc, quá nhiều dòng…): chặn nhập. */
  problems: string[];
}

export type ColumnMapping = Record<string, number | null>;

export function headerTexts(table: SourceTable, headerIndex: number): string[] {
  return (table.rows[headerIndex] ?? []).map((cell) => parseTextCell(cell));
}

function scoreKind(kind: DatasetKind, headers: string[]): number {
  const fields = DATASETS[kind].fields;
  const matched = fields.filter((field) => headers.some((h) => fieldMatchesHeader(field, h)));
  const required = fields.filter((field) => field.required);
  const requiredMatched = matched.filter((field) => field.required).length;
  if (requiredMatched === 0) {
    return 0;
  }
  // Ưu tiên loại có đủ cột bắt buộc, sau đó loại khớp nhiều cột hơn.
  return (requiredMatched / required.length) * 100 + matched.length;
}

/** Loại dữ liệu khớp tiêu đề nhất; null nếu không khớp cột bắt buộc nào. */
export function guessKind(headers: string[]): DatasetKind | null {
  let best: DatasetKind | null = null;
  let bestScore = 0;
  for (const kind of DATASET_KINDS) {
    const score = scoreKind(kind, headers);
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Dòng tiêu đề: dòng (trong 30 dòng đầu) khớp nhiều tên cột nhất;
 * không khớp dòng nào thì lấy dòng đầu tiên có dữ liệu. -1 nếu bảng trống.
 */
export function detectHeaderRow(table: SourceTable): number {
  let best = -1;
  let bestScore = 0;
  let firstNonEmpty = -1;
  const limit = Math.min(table.rows.length, HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const row = table.rows[r];
    if (row.every((cell) => isBlankCell(cell))) {
      continue;
    }
    if (firstNonEmpty < 0) {
      firstNonEmpty = r;
    }
    const headers = row.map((cell) => parseTextCell(cell));
    const score = Math.max(...DATASET_KINDS.map((kind) => scoreKind(kind, headers)));
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best >= 0 ? best : firstNonEmpty;
}

/** Map mỗi trường với cột đầu tiên có tên khớp; mỗi cột dùng cho tối đa một trường. */
export function autoMap(kind: DatasetKind, headers: string[]): ColumnMapping {
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  for (const field of DATASETS[kind].fields) {
    const index = headers.findIndex((h, i) => !used.has(i) && fieldMatchesHeader(field, h));
    mapping[field.key] = index >= 0 ? index : null;
    if (index >= 0) {
      used.add(index);
    }
  }
  return mapping;
}

export function columnLabel(table: SourceTable, headerIndex: number, column: number): string {
  const letter = columnToLetters(table.firstColumnIndex + column);
  const header = headerTexts(table, headerIndex)[column] ?? "";
  return header ? `cột ${letter} (${header})` : `cột ${letter}`;
}

export function datasetFromTable(
  table: SourceTable,
  headerIndex: number,
  kind: DatasetKind,
  mapping: ColumnMapping
): ImportDataset {
  const def = DATASETS[kind];
  const problems: string[] = [];
  const missing = def.fields.filter(
    (field) => field.required && (mapping[field.key] ?? null) === null
  );
  if (missing.length > 0) {
    problems.push(`Thiếu cột bắt buộc: ${missing.map((field) => field.header).join(", ")}.`);
  }
  const columns = Object.values(mapping).filter((c): c is number => c !== null);
  if (new Set(columns).size !== columns.length) {
    problems.push("Một cột nguồn đang được map cho nhiều trường.");
  }
  const dataRows = headerIndex < 0 ? [] : table.rows.slice(headerIndex + 1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    problems.push(
      `Có ${dataRows.length} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng mỗi lần nhập. Hãy chia nhỏ file.`
    );
  }

  const mappedFields = def.fields
    .filter((field) => (mapping[field.key] ?? null) !== null)
    .map((field) => field.key);
  const columnLabels: Record<string, string> = {};
  for (const key of mappedFields) {
    columnLabels[key] = columnLabel(table, headerIndex, mapping[key] as number);
  }
  const rows: ImportRow[] = dataRows.map((row, i) => {
    const cells: Record<string, RawCell | undefined> = {};
    for (const key of mappedFields) {
      cells[key] = row[mapping[key] as number];
    }
    return { rowLabel: `Dòng ${table.firstRowNumber + headerIndex + 1 + i}`, cells };
  });
  return { kind, sourceLabel: table.label, mappedFields, columnLabels, rows, problems };
}
