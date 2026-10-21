/**
 * Sao lưu và xuất thư viện theo schema (prompts/09, ADR-0004).
 * - JSON: bản sao lưu đầy đủ nhất (giữ id và thời điểm tạo/sửa).
 * - Workbook: mỗi loại một sheet, tham chiếu bằng mã; sheet "Thông tin" ghi schemaVersion.
 * Chỉ xuất dữ liệu thư viện; không xuất cài đặt nội bộ hay bất kỳ bí mật nào (không có).
 */

import { XlsxCell, XlsxSheet } from "../../../shared/xlsx";
import { LibrarySnapshot, NormDefinition, Resource, ResourcePrice, WorkItem } from "../types";
import { compareCodes } from "../search";
import { RawCell, parseTextCell } from "./cells";
import {
  ImportDataset,
  ImportRow,
  SourceTable,
  autoMap,
  datasetFromTable,
  headerTexts,
} from "./source";
import {
  DATASETS,
  DATASET_KINDS,
  DatasetKind,
  EXCHANGE_FORMAT,
  EXCHANGE_SCHEMA_VERSION,
  META_SHEET_NAME,
  PRICE_STATUS_LABELS,
  RESOURCE_TYPE_LABELS,
} from "./schema";

export interface BackupMeta {
  exportedAt: string;
  appVersion: string;
}

export interface BackupFile {
  format: typeof EXCHANGE_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  data: LibrarySnapshot;
}

export function toBackupJson(library: LibrarySnapshot, meta: BackupMeta): string {
  const file: BackupFile = {
    format: EXCHANGE_FORMAT,
    schemaVersion: EXCHANGE_SCHEMA_VERSION,
    exportedAt: meta.exportedAt,
    appVersion: meta.appVersion,
    data: {
      workItems: library.workItems,
      resources: library.resources,
      resourcePrices: library.resourcePrices,
      norms: library.norms,
    },
  };
  return JSON.stringify(file, null, 2);
}

/** "ConsQuotation-thu-vien-2026-10-21-0930.json" theo giờ máy. */
export function backupFileName(now: Date, extension: "json" | "xlsx"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `ConsQuotation-thu-vien-${stamp}.${extension}`;
}

export type ParsedBackup =
  | {
      ok: true;
      meta: { schemaVersion: number; exportedAt: string; appVersion: string };
      datasets: ImportDataset[];
    }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cell(value: unknown): RawCell {
  if (value === null || value === undefined) {
    return { value: null };
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { value };
  }
  // Kiểu lạ (mảng, object): đưa về chữ để báo lỗi kiểu dữ liệu ở bước kiểm tra.
  return { value: JSON.stringify(value) };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function checkVersion(format: unknown, version: unknown): string | null {
  if (format !== EXCHANGE_FORMAT) {
    return "Đây không phải file sao lưu thư viện ConsQuotation.";
  }
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return "File sao lưu thiếu hoặc sai schemaVersion.";
  }
  if (version > EXCHANGE_SCHEMA_VERSION) {
    return `File được tạo bởi phiên bản ConsQuotation mới hơn (schema ${version}). Hãy cập nhật add-in; không nhập để tránh mất dữ liệu.`;
  }
  return null;
}

/** Đọc file sao lưu JSON thành các bộ dữ liệu nhập; tham chiếu id được đổi sang mã. */
export function parseBackupJson(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, message: "File JSON không đọc được (sai cú pháp)." };
  }
  if (!isObject(parsed)) {
    return { ok: false, message: "Đây không phải file sao lưu thư viện ConsQuotation." };
  }
  const versionProblem = checkVersion(parsed.format, parsed.schemaVersion);
  if (versionProblem) {
    return { ok: false, message: versionProblem };
  }
  const data = isObject(parsed.data) ? parsed.data : {};
  const list = (key: DatasetKind): unknown[] =>
    Array.isArray(data[key]) ? (data[key] as unknown[]) : [];

  const resourceCodeById = new Map<string, unknown>();
  for (const r of list("resources")) {
    if (isObject(r) && typeof r.id === "string") {
      resourceCodeById.set(r.id, r.code);
    }
  }
  const workItemCodeById = new Map<string, unknown>();
  for (const w of list("workItems")) {
    if (isObject(w) && typeof w.id === "string") {
      workItemCodeById.set(w.id, w.code);
    }
  }

  const datasets = DATASET_KINDS.map((kind): ImportDataset => {
    const fields = DATASETS[kind].fields.map((field) => field.key);
    const rows = list(kind).map((record, i): ImportRow => {
      const rowLabel = `Bản ghi ${i + 1}`;
      if (!isObject(record)) {
        return { rowLabel, cells: {}, preErrors: [{ message: "Bản ghi không phải object." }] };
      }
      const cells: Record<string, RawCell> = {};
      const preErrors: { field?: string; message: string }[] = [];
      for (const key of fields) {
        cells[key] = cell(record[key]);
      }
      if (kind === "resourcePrices" || kind === "norms") {
        const resourceId = str(record.resourceId) ?? "";
        if (!resourceCodeById.has(resourceId)) {
          preErrors.push({
            field: "resourceCode",
            message: `Tham chiếu tài nguyên id "${resourceId}" không có trong file.`,
          });
        }
        cells.resourceCode = cell(resourceCodeById.get(resourceId) ?? null);
      }
      if (kind === "norms") {
        const workItemId = str(record.workItemId) ?? "";
        if (!workItemCodeById.has(workItemId)) {
          preErrors.push({
            field: "workItemCode",
            message: `Tham chiếu công tác id "${workItemId}" không có trong file.`,
          });
        }
        cells.workItemCode = cell(workItemCodeById.get(workItemId) ?? null);
      }
      return {
        rowLabel,
        cells,
        meta: {
          id: str(record.id),
          createdAt: str(record.createdAt),
          updatedAt: str(record.updatedAt),
        },
        preErrors: preErrors.length > 0 ? preErrors : undefined,
      };
    });
    const columnLabels: Record<string, string> = {};
    for (const key of fields) {
      columnLabels[key] = `trường "${key}"`;
    }
    return {
      kind,
      sourceLabel: `JSON: ${DATASETS[kind].sheetName}`,
      mappedFields: fields,
      columnLabels,
      rows,
      problems: [],
    };
  });

  return {
    ok: true,
    meta: {
      schemaVersion: parsed.schemaVersion as number,
      exportedAt: str(parsed.exportedAt) ?? "",
      appVersion: str(parsed.appVersion) ?? "",
    },
    datasets: datasets.filter((d) => d.rows.length > 0),
  };
}

// ---------- Workbook ----------

const sortByCode = <T extends { code: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => compareCodes(a.code, b.code));

function dataSheet(kind: DatasetKind, rows: XlsxCell[][]): XlsxSheet {
  const def = DATASETS[kind];
  return {
    name: def.sheetName,
    // Cột chữ (mã, tên, ngày ISO…) định dạng @ để Excel không tự đổi "007" thành 7 khi gõ thêm.
    columns: def.fields.map((field) => ({ width: field.width, text: field.type !== "number" })),
    rows: [def.fields.map((field) => field.header), ...rows],
    headerRows: 1,
  };
}

/** Các sheet của workbook xuất. Thư viện rỗng → file mẫu chỉ có tiêu đề. */
export function exportSheets(library: LibrarySnapshot, meta: BackupMeta): XlsxSheet[] {
  const resourceCode = new Map(library.resources.map((r) => [r.id, r.code]));
  const workItemCode = new Map(library.workItems.map((w) => [w.id, w.code]));

  const workItems = sortByCode(library.workItems).map((w: WorkItem): XlsxCell[] => [
    w.code,
    w.name,
    w.group,
    w.unit,
    w.description,
    w.unitPrice,
    w.currency,
    w.source,
    w.effectiveFrom,
    w.effectiveTo,
    w.notes,
  ]);
  const resources = sortByCode(library.resources).map((r: Resource): XlsxCell[] => [
    r.code,
    r.name,
    RESOURCE_TYPE_LABELS[r.type] ?? r.type,
    r.unit,
    r.notes,
  ]);
  const prices = [...library.resourcePrices]
    .map((p: ResourcePrice) => ({ p, code: resourceCode.get(p.resourceId) ?? "" }))
    .sort(
      (a, b) =>
        compareCodes(a.code, b.code) ||
        (a.p.effectiveFrom ?? "").localeCompare(b.p.effectiveFrom ?? "")
    )
    .map(({ p, code }): XlsxCell[] => [
      code,
      p.price,
      p.unit,
      p.currency,
      p.effectiveFrom,
      p.effectiveTo,
      p.source,
      PRICE_STATUS_LABELS[p.status] ?? p.status,
      p.notes,
    ]);
  const norms = [...library.norms]
    .map((n: NormDefinition) => ({
      n,
      w: workItemCode.get(n.workItemId) ?? "",
      r: resourceCode.get(n.resourceId) ?? "",
    }))
    .sort((a, b) => compareCodes(a.w, b.w) || compareCodes(a.r, b.r))
    .map(({ n, w, r }): XlsxCell[] => [w, r, n.quantity, n.notes]);

  const metaSheet: XlsxSheet = {
    name: META_SHEET_NAME,
    columns: [
      { width: 16, text: true },
      { width: 90, text: true },
    ],
    rows: [
      ["format", EXCHANGE_FORMAT],
      ["schemaVersion", String(EXCHANGE_SCHEMA_VERSION)],
      ["exportedAt", meta.exportedAt],
      ["appVersion", meta.appVersion],
      [null, null],
      [
        "Hướng dẫn",
        "Thư viện ConsQuotation. Lưu workbook này bằng File › Save As vào nơi an toàn (OneDrive, ổ đĩa ngoài).",
      ],
      [
        null,
        "Khôi phục: mở workbook này trong Excel, mở ConsQuotation › Thư viện › Nhập/Xuất › Đọc workbook đang mở.",
      ],
      [
        null,
        "Không đổi tên sheet hay tiêu đề cột. Ngày dạng yyyy-mm-dd hoặc dd/mm/yyyy. Giá và định mức tham chiếu bằng mã.",
      ],
    ],
    headerRows: 0,
  };

  return [
    metaSheet,
    dataSheet("workItems", workItems),
    dataSheet("resources", resources),
    dataSheet("resourcePrices", prices),
    dataSheet("norms", norms),
  ];
}

export type WorkbookBackupCheck =
  | { kind: "notBackup" }
  | { kind: "backup"; schemaVersion: number; exportedAt: string }
  | { kind: "unsupported"; message: string };

/** Đọc sheet "Thông tin": workbook có phải bản xuất thư viện ConsQuotation không. */
export function checkBackupMeta(metaRows: RawCell[][]): WorkbookBackupCheck {
  const values = new Map<string, string>();
  for (const row of metaRows) {
    const key = parseTextCell(row[0]);
    if (key) {
      values.set(key, parseTextCell(row[1]));
    }
  }
  if (values.get("format") !== EXCHANGE_FORMAT) {
    return { kind: "notBackup" };
  }
  const version = Number(values.get("schemaVersion"));
  const problem = checkVersion(EXCHANGE_FORMAT, version);
  if (problem) {
    return { kind: "unsupported", message: problem };
  }
  return { kind: "backup", schemaVersion: version, exportedAt: values.get("exportedAt") ?? "" };
}

/** Sheet dữ liệu của workbook xuất: tiêu đề ở dòng đầu, map theo tên cột chuẩn. */
export function datasetFromBackupSheet(kind: DatasetKind, table: SourceTable): ImportDataset {
  const headerIndex = table.rows.length > 0 ? 0 : -1;
  const headers = headerIndex < 0 ? [] : headerTexts(table, headerIndex);
  return datasetFromTable(table, headerIndex, kind, autoMap(kind, headers));
}
