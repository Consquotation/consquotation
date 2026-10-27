/**
 * Sao lưu và xuất thư viện theo schema (prompts/09, ADR-0004).
 * - JSON: bản sao lưu đầy đủ nhất (giữ id và thời điểm tạo/sửa).
 * - Workbook: mỗi loại một sheet, tham chiếu bằng mã; sheet "Thông tin" ghi schemaVersion.
 * Chỉ xuất dữ liệu thư viện; không xuất cài đặt nội bộ hay bất kỳ bí mật nào (không có).
 */

import { XlsxCell, XlsxSheet } from "../../../shared/xlsx";
import {
  Category,
  LibrarySnapshot,
  Norm,
  NormComponent,
  ResourceType,
  Resource,
  ResourcePrice,
  Supplier,
  WorkItem,
} from "../types";
import { compareCodes, compareText } from "../search";
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
  NORM_SOURCE_TYPE_LABELS,
  NORM_STATUS_LABELS,
  PRICE_STATUS_LABELS,
  RESOURCE_TYPE_LABELS,
  YES_NO_LABELS,
} from "./schema";
import { rateToPercent } from "../validation";

export interface BackupMeta {
  exportedAt: string;
  appVersion: string;
  /** Tên thư viện người dùng đặt (thông tin thư viện trong file sao lưu). */
  libraryName: string;
}

export interface BackupFile {
  format: typeof EXCHANGE_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  library: { name: string };
  data: LibrarySnapshot;
}

export function toBackupJson(library: LibrarySnapshot, meta: BackupMeta): string {
  const file: BackupFile = {
    format: EXCHANGE_FORMAT,
    schemaVersion: EXCHANGE_SCHEMA_VERSION,
    exportedAt: meta.exportedAt,
    appVersion: meta.appVersion,
    library: { name: meta.libraryName },
    data: {
      categories: library.categories,
      suppliers: library.suppliers,
      workItems: library.workItems,
      resources: library.resources,
      resourcePrices: library.resourcePrices,
      norms: library.norms,
      normComponents: library.normComponents,
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
      meta: { schemaVersion: number; exportedAt: string; appVersion: string; libraryName: string };
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

/** Trường của từng loại có giá trị lấy thẳng từ bản ghi JSON (trường tham chiếu được đổi riêng). */
const DATASET_FIELDS_FROM_JSON: Record<DatasetKind, string[]> = Object.fromEntries(
  DATASET_KINDS.map((kind) => [kind, DATASETS[kind].fields.map((field) => field.key)])
) as Record<DatasetKind, string[]>;

/**
 * Sheet của workbook xuất ứng với loại dữ liệu nào. Bản xuất schema 1–2 có sheet "Định mức" chứa dòng
 * định mức kiểu cũ (Mã công tác, Mã tài nguyên, Hao phí) → đọc như thành phần định mức.
 */
export function backupSheetKinds(
  schemaVersion: number
): { kind: DatasetKind; sheetName: string }[] {
  if (schemaVersion >= 3) {
    return DATASET_KINDS.map((kind) => ({ kind, sheetName: DATASETS[kind].sheetName }));
  }
  return DATASET_KINDS.filter((kind) => kind !== "normComponents").map((kind) => ({
    kind: kind === "norms" ? "normComponents" : kind,
    sheetName: DATASETS[kind].sheetName,
  }));
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
  // v2: nhóm và nhà cung cấp tham chiếu bằng id trong file; đổi sang tên như dạng bảng.
  const nameById = (kind: "categories" | "suppliers") => {
    const map = new Map<string, unknown>();
    for (const x of list(kind)) {
      if (isObject(x) && typeof x.id === "string") {
        map.set(x.id, x.name);
      }
    }
    return map;
  };
  const categoryNameById = nameById("categories");
  const supplierNameById = nameById("suppliers");
  const version = parsed.schemaVersion as number;

  // v3: định mức có id; thành phần trỏ tới định mức bằng normId.
  const normById = new Map<string, { code: unknown; version: unknown }>();
  for (const n of version >= 3 ? list("norms") : []) {
    if (isObject(n) && typeof n.id === "string") {
      normById.set(n.id, { code: n.code, version: n.version });
    }
  }
  /** v1/v2: "norms" là dòng định mức kiểu cũ (công tác, tài nguyên, hao phí) → thành phần. */
  const recordsFor = (kind: DatasetKind): unknown[] => {
    if (version >= 3) {
      return list(kind);
    }
    if (kind === "norms") {
      return [];
    }
    return kind === "normComponents" ? list("norms") : list(kind);
  };

  const datasets = DATASET_KINDS.map((kind): ImportDataset => {
    const fields = DATASET_FIELDS_FROM_JSON[kind];
    const rows = recordsFor(kind).map((record, i): ImportRow => {
      const rowLabel = `Bản ghi ${i + 1}`;
      if (!isObject(record)) {
        return { rowLabel, cells: {}, preErrors: [{ message: "Bản ghi không phải object." }] };
      }
      const cells: Record<string, RawCell> = {};
      const preErrors: { field?: string; message: string }[] = [];
      for (const key of fields) {
        cells[key] = cell(record[key]);
      }
      // Tham chiếu nhóm/nhà cung cấp: v1 ghi tên nhóm ở "group"; v2 ghi id ở "categoryId"/"supplierId".
      const resolveRef = (
        idKey: "categoryId" | "supplierId",
        cellKey: "category" | "supplier",
        names: Map<string, unknown>,
        what: string
      ) => {
        const id = record[idKey];
        if (id === null || id === undefined || id === "") {
          cells[cellKey] = cell(null);
        } else if (typeof id === "string" && names.has(id)) {
          cells[cellKey] = cell(names.get(id));
        } else {
          cells[cellKey] = cell(null);
          preErrors.push({
            field: cellKey,
            message: `Tham chiếu ${what} id "${String(id)}" không có trong file.`,
          });
        }
      };
      if (kind === "workItems") {
        if (version < 2) {
          cells.category = cell(record.group ?? null);
          cells.supplier = cell(null);
        } else {
          resolveRef("categoryId", "category", categoryNameById, "nhóm");
          resolveRef("supplierId", "supplier", supplierNameById, "nhà cung cấp");
        }
      }
      if (kind === "resources") {
        if (version < 2) {
          cells.category = cell(null);
        } else {
          resolveRef("categoryId", "category", categoryNameById, "nhóm");
        }
      }
      if (kind === "resourcePrices") {
        if (version < 2) {
          cells.supplier = cell(null);
        } else {
          resolveRef("supplierId", "supplier", supplierNameById, "nhà cung cấp");
        }
      }
      let snapshot: NonNullable<ImportRow["meta"]>["snapshot"];
      if (kind === "norms") {
        resolveRef("categoryId", "category", categoryNameById, "nhóm");
        const workItemId = str(record.workItemId) ?? "";
        if (workItemId && !workItemCodeById.has(workItemId)) {
          preErrors.push({
            field: "workItemCode",
            message: `Tham chiếu công tác id "${workItemId}" không có trong file.`,
          });
        }
        cells.workItemCode = cell(workItemId ? (workItemCodeById.get(workItemId) ?? null) : null);
      }
      if (kind === "normComponents") {
        if (version >= 3) {
          const owner = normById.get(str(record.normId) ?? "");
          if (!owner) {
            preErrors.push({
              field: "normCode",
              message: `Tham chiếu định mức id "${String(record.normId)}" không có trong file.`,
            });
          }
          cells.normCode = cell(owner?.code ?? null);
          cells.version = cell(owner?.version ?? null);
          cells.wastePercent = cell(
            typeof record.wasteRate === "number" && Number.isFinite(record.wasteRate)
              ? Number(rateToPercent(record.wasteRate) || 0)
              : record.wasteRate
          );
          if (typeof record.resourceCodeSnapshot === "string") {
            snapshot = {
              code: record.resourceCodeSnapshot,
              name: str(record.resourceNameSnapshot) ?? "",
              unit: str(record.resourceUnitSnapshot) ?? "",
              type: (str(record.resourceTypeSnapshot) as ResourceType | undefined) ?? "other",
            };
          }
        } else {
          // Dòng kiểu cũ: mã định mức = mã công tác; phiên bản để trống (add-in tạo phiên bản "1").
          const workItemId = str(record.workItemId) ?? "";
          if (!workItemCodeById.has(workItemId)) {
            preErrors.push({
              field: "normCode",
              message: `Tham chiếu công tác id "${workItemId}" không có trong file.`,
            });
          }
          cells.normCode = cell(workItemCodeById.get(workItemId) ?? null);
          cells.version = cell(null);
          cells.consumption = cell(record.quantity);
          cells.wastePercent = cell(null);
        }
      }
      if (kind === "resourcePrices" || kind === "normComponents") {
        const resourceId = str(record.resourceId) ?? "";
        if (!resourceCodeById.has(resourceId)) {
          preErrors.push({
            field: "resourceCode",
            message: `Tham chiếu tài nguyên id "${resourceId}" không có trong file.`,
          });
        }
        cells.resourceCode = cell(resourceCodeById.get(resourceId) ?? null);
      }
      return {
        rowLabel,
        cells,
        meta: {
          snapshot,
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
      schemaVersion: version,
      exportedAt: str(parsed.exportedAt) ?? "",
      appVersion: str(parsed.appVersion) ?? "",
      libraryName: isObject(parsed.library) ? (str(parsed.library.name) ?? "") : "",
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
  const categoryName = new Map(library.categories.map((c) => [c.id, c.name]));
  const supplierName = new Map(library.suppliers.map((s) => [s.id, s.name]));
  const cat = (id: string | null) => (id ? (categoryName.get(id) ?? null) : null);
  const sup = (id: string | null) => (id ? (supplierName.get(id) ?? null) : null);
  const byName = <T extends { name: string }>(items: readonly T[]) =>
    [...items].sort((a, b) => compareText(a.name, b.name));

  const categories = byName(library.categories).map((c: Category): XlsxCell[] => [c.name, c.notes]);
  const suppliers = byName(library.suppliers).map((s: Supplier): XlsxCell[] => [
    s.name,
    s.contactInfo,
    s.notes,
  ]);
  const workItems = sortByCode(library.workItems).map((w: WorkItem): XlsxCell[] => [
    w.code,
    w.name,
    cat(w.categoryId),
    w.unit,
    w.description,
    w.unitPrice,
    w.currency,
    sup(w.supplierId),
    w.source,
    w.effectiveFrom,
    w.effectiveTo,
    w.notes,
  ]);
  const resources = sortByCode(library.resources).map((r: Resource): XlsxCell[] => [
    r.code,
    r.name,
    RESOURCE_TYPE_LABELS[r.type] ?? r.type,
    cat(r.categoryId),
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
      sup(p.supplierId),
      p.source,
      PRICE_STATUS_LABELS[p.status] ?? p.status,
      p.notes,
    ]);
  const yesNo = (v: boolean) => (v ? YES_NO_LABELS.yes : YES_NO_LABELS.no);
  const norms = [...library.norms]
    .sort((a, b) => compareCodes(a.code, b.code) || compareCodes(a.version, b.version))
    .map((n: Norm): XlsxCell[] => [
      n.code,
      n.name,
      n.unit,
      cat(n.categoryId),
      n.version,
      n.effectiveFrom,
      NORM_SOURCE_TYPE_LABELS[n.sourceType] ?? n.sourceType,
      n.source,
      yesNo(n.sourceVerified),
      NORM_STATUS_LABELS[n.status] ?? n.status,
      yesNo(n.wasteIncluded),
      n.workItemId ? (workItemCode.get(n.workItemId) ?? null) : null,
      n.notes,
    ]);
  const normById = new Map(library.norms.map((n) => [n.id, n]));
  const normComponents = [...library.normComponents]
    .map((c: NormComponent) => ({
      c,
      n: normById.get(c.normId),
      r: resourceCode.get(c.resourceId) ?? c.resourceCodeSnapshot,
    }))
    .sort(
      (a, b) =>
        compareCodes(a.n?.code ?? "", b.n?.code ?? "") ||
        compareCodes(a.n?.version ?? "", b.n?.version ?? "") ||
        a.c.sortOrder - b.c.sortOrder
    )
    .map(({ c, n, r }): XlsxCell[] => [
      n?.code ?? "",
      n?.version ?? "",
      r,
      c.consumption,
      c.wasteRate === 0 ? null : Number(rateToPercent(c.wasteRate)),
      c.sortOrder,
      c.notes,
    ]);

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
      ["libraryName", meta.libraryName],
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
        "Không đổi tên sheet hay tiêu đề cột. Ngày dạng yyyy-mm-dd hoặc dd/mm/yyyy. Giá và định mức tham chiếu bằng mã; nhóm và nhà cung cấp tham chiếu bằng tên.",
      ],
    ],
    headerRows: 0,
  };

  return [
    metaSheet,
    dataSheet("categories", categories),
    dataSheet("suppliers", suppliers),
    dataSheet("workItems", workItems),
    dataSheet("resources", resources),
    dataSheet("resourcePrices", prices),
    dataSheet("norms", norms),
    dataSheet("normComponents", normComponents),
  ];
}

export type WorkbookBackupCheck =
  | { kind: "notBackup" }
  | { kind: "backup"; schemaVersion: number; exportedAt: string; libraryName: string }
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
  return {
    kind: "backup",
    schemaVersion: version,
    exportedAt: values.get("exportedAt") ?? "",
    libraryName: values.get("libraryName") ?? "",
  };
}

/** Sheet dữ liệu của workbook xuất: tiêu đề ở dòng đầu, map theo tên cột chuẩn. */
export function datasetFromBackupSheet(kind: DatasetKind, table: SourceTable): ImportDataset {
  const headerIndex = table.rows.length > 0 ? 0 : -1;
  const headers = headerIndex < 0 ? [] : headerTexts(table, headerIndex);
  return datasetFromTable(table, headerIndex, kind, autoMap(kind, headers));
}
