/**
 * Kiểm tra dữ liệu nhập và lập danh sách thay đổi (prompts/09):
 * - Dòng lỗi không bao giờ được nhập; báo đúng dòng/cột.
 * - Không tự suy diễn đơn vị hoặc giá bị thiếu.
 * - Bản ghi trùng với thư viện: mặc định bỏ qua; chỉ cập nhật khi người dùng chọn,
 *   và chỉ các trường có cột trong file.
 * - Cột "Nhóm"/"Nhà cung cấp" tham chiếu theo TÊN; tên chưa có thì tạo mới, nhưng chỉ khi dòng
 *   hợp lệ và thực sự được thêm/cập nhật. Danh sách tên sẽ tạo nằm trong bản xem trước.
 * Hàm thuần: không ghi gì; bước ghi dùng `changes` trong một giao dịch.
 */

import { normalizeCode, percentToRate } from "../validation";
import { normalizeForSearch } from "../search";
import {
  Category,
  LibrarySnapshot,
  Norm,
  NormComponent,
  NormStatus,
  Resource,
  ResourcePrice,
  Supplier,
  WorkItem,
  normalizeName,
} from "../types";
import {
  CellParse,
  isBlankCell,
  parseDateCell,
  parseNormSourceTypeCell,
  parseNormStatusCell,
  parseNumberCell,
  parsePriceStatusCell,
  parseYesNoCell,
  parseResourceTypeCell,
  parseTextCell,
} from "./cells";
import { ImportDataset, ImportRow } from "./source";
import { DATASET_KINDS, DatasetKind } from "./schema";

export type DuplicateMode = "skip" | "update";

export interface ImportIssue {
  sourceLabel: string;
  rowLabel: string;
  columnLabel?: string;
  message: string;
}

export interface DatasetSummary {
  kind: DatasetKind;
  sourceLabel: string;
  total: number;
  added: number;
  /** Trùng với thư viện (đã cập nhật hoặc bỏ qua tùy chế độ). */
  duplicates: number;
  updated: number;
  errors: number;
  empty: number;
}

export type ImportChanges = LibrarySnapshot;

export interface ImportAnalysis {
  summaries: DatasetSummary[];
  issues: ImportIssue[];
  /** Lỗi chặn cả lần nhập (thiếu cột bắt buộc…). */
  problems: string[];
  changes: ImportChanges;
  /** Tên nhóm/nhà cung cấp chưa có, sẽ được tạo vì được dùng ở cột "Nhóm"/"Nhà cung cấp". */
  createdFromReferences: { categories: string[]; suppliers: string[]; norms: string[] };
}

export interface AnalyzeOptions {
  mode: DuplicateMode;
  /** Thời điểm nhập (ISO) cho createdAt/updatedAt. */
  now: string;
  newId: () => string;
}

type RowErrors = { field?: string; message: string }[];

function read<T>(errors: RowErrors, field: string, parsed: CellParse<T>, fallback: T): T {
  if (!parsed.ok) {
    errors.push({ field, message: parsed.message });
    return fallback;
  }
  return parsed.value;
}

function requireText(errors: RowErrors, field: string, value: string, label: string): void {
  if (value === "") {
    errors.push({ field, message: `Thiếu ${label}.` });
  }
}

function checkPeriod(errors: RowErrors, from: string | null, to: string | null): void {
  if (from && to && from > to) {
    errors.push({
      field: "effectiveTo",
      message: "Ngày kết thúc hiệu lực phải sau hoặc bằng ngày bắt đầu.",
    });
  }
}

function validTimestamp(value: string | undefined): string | undefined {
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

/** Ghép giá trị mới vào bản ghi cũ, chỉ với các trường có cột trong file. */
function mergeMapped<T extends object>(existing: T, incoming: Partial<T>, mapped: Set<string>): T {
  const result = { ...existing };
  for (const key of Object.keys(incoming) as (keyof T)[]) {
    if (mapped.has(key as string)) {
      result[key] = incoming[key] as T[keyof T];
    }
  }
  return result;
}

const KIND_ORDER: Record<DatasetKind, number> = {
  categories: 0,
  suppliers: 1,
  resources: 2,
  workItems: 3,
  resourcePrices: 4,
  norms: 5,
  normComponents: 6,
};

/** Trường "category"/"supplier" của file tương ứng thuộc tính "categoryId"/"supplierId" của bản ghi. */
function recordKeys(mapped: Set<string>): Set<string> {
  const keys = new Set(mapped);
  if (mapped.has("category")) {
    keys.add("categoryId");
  }
  if (mapped.has("supplier")) {
    keys.add("supplierId");
  }
  if (mapped.has("wastePercent")) {
    keys.add("wasteRate");
  }
  if (mapped.has("workItemCode")) {
    keys.add("workItemId");
  }
  return keys;
}

export function analyzeImport(
  datasets: readonly ImportDataset[],
  library: LibrarySnapshot,
  options: AnalyzeOptions
): ImportAnalysis {
  const { mode, now, newId } = options;
  const issues: ImportIssue[] = [];
  const problems: string[] = [];
  const changes: ImportChanges = {
    categories: [],
    suppliers: [],
    workItems: [],
    resources: [],
    resourcePrices: [],
    norms: [],
    normComponents: [],
  };
  const createdFromReferences = {
    categories: [] as string[],
    suppliers: [] as string[],
    norms: [] as string[],
  };

  // Trạng thái thư viện sau các thay đổi đã lập (để giá/định mức tham chiếu được dữ liệu vừa nhập).
  const resourceByCode = new Map<string, Resource>();
  for (const r of library.resources) {
    if (!resourceByCode.has(normalizeCode(r.code))) {
      resourceByCode.set(normalizeCode(r.code), r);
    }
  }
  const workItemByCode = new Map<string, WorkItem>();
  for (const w of library.workItems) {
    if (!workItemByCode.has(normalizeCode(w.code))) {
      workItemByCode.set(normalizeCode(w.code), w);
    }
  }
  const categoryByName = new Map<string, Category>();
  for (const c of library.categories) {
    categoryByName.set(normalizeName(c.name), c);
  }
  const supplierByName = new Map<string, Supplier>();
  for (const s of library.suppliers) {
    supplierByName.set(normalizeName(s.name), s);
  }
  const priceById = new Map(library.resourcePrices.map((p) => [p.id, p]));
  const priceKey = (
    p: Pick<
      ResourcePrice,
      "resourceId" | "price" | "unit" | "currency" | "effectiveFrom" | "effectiveTo" | "source"
    >
  ) =>
    [
      p.resourceId,
      p.price,
      normalizeCode(p.unit),
      normalizeCode(p.currency),
      p.effectiveFrom ?? "",
      p.effectiveTo ?? "",
      normalizeForSearch(p.source),
    ].join("|");
  const priceByKey = new Map(library.resourcePrices.map((p) => [priceKey(p), p]));
  const normKey = (code: string, version: string) =>
    `${normalizeCode(code)}|${normalizeCode(version)}`;
  const normByKey = new Map(library.norms.map((n) => [normKey(n.code, n.version), n]));
  /** Định mức tạo trong lần nhập này: được thêm thành phần dù trạng thái không phải nháp. */
  const newNormIds = new Set<string>();
  const componentByPair = new Map(
    library.normComponents.map((c) => [`${c.normId}|${c.resourceId}`, c])
  );
  const approvedConflict = (code: string, workItemId: string | null): string | null => {
    for (const n of normByKey.values()) {
      if (n.status !== "approved") {
        continue;
      }
      if (normalizeCode(n.code) === normalizeCode(code)) {
        return `Mã "${code}" đã có phiên bản đang dùng (${n.version}). Nhập phiên bản này ở trạng thái Nháp hoặc Ngừng dùng.`;
      }
      if (workItemId && n.workItemId === workItemId) {
        return `Công tác liên kết đã dùng định mức "${n.code}" phiên bản ${n.version}.`;
      }
    }
    return null;
  };
  const usedIds = new Set<string>([
    ...library.categories.map((x) => x.id),
    ...library.suppliers.map((x) => x.id),
    ...library.workItems.map((x) => x.id),
    ...library.resources.map((x) => x.id),
    ...library.resourcePrices.map((x) => x.id),
    ...library.norms.map((x) => x.id),
    ...library.normComponents.map((x) => x.id),
  ]);

  const takeId = (row: ImportRow): string => {
    const id = row.meta?.id;
    if (id && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
    const fresh = newId();
    usedIds.add(fresh);
    return fresh;
  };
  const stamps = (row: ImportRow) => ({
    createdAt: validTimestamp(row.meta?.createdAt) ?? now,
    updatedAt: validTimestamp(row.meta?.updatedAt) ?? now,
  });

  /** id của nhóm theo tên; tạo nhóm mới nếu chưa có (chỉ gọi khi bản ghi thực sự được ghi). */
  const ensureCategory = (name: string): string | null => {
    const cleaned = name.replace(/\s+/g, " ").trim();
    if (cleaned === "") {
      return null;
    }
    const key = normalizeName(cleaned);
    const found = categoryByName.get(key);
    if (found) {
      return found.id;
    }
    const id = newId();
    usedIds.add(id);
    const created: Category = { id, name: cleaned, notes: "", createdAt: now, updatedAt: now };
    changes.categories.push(created);
    categoryByName.set(key, created);
    createdFromReferences.categories.push(cleaned);
    return id;
  };
  const ensureSupplier = (name: string): string | null => {
    const cleaned = name.replace(/\s+/g, " ").trim();
    if (cleaned === "") {
      return null;
    }
    const key = normalizeName(cleaned);
    const found = supplierByName.get(key);
    if (found) {
      return found.id;
    }
    const id = newId();
    usedIds.add(id);
    const created: Supplier = {
      id,
      name: cleaned,
      contactInfo: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    changes.suppliers.push(created);
    supplierByName.set(key, created);
    createdFromReferences.suppliers.push(cleaned);
    return id;
  };

  /**
   * Định mức cho dòng thành phần: theo mã + phiên bản; không ghi phiên bản thì phải có đúng một
   * phiên bản. Bảng kiểu cũ (Mã công tác + Mã tài nguyên + Hao phí): chưa có định mức mã đó mà có
   * công tác cùng mã thì tạo định mức phiên bản "1" từ công tác (liệt kê trong bản xem trước).
   */
  const resolveNormFor = (code: string, version: string): { norm?: Norm; message: string } => {
    if (version) {
      const norm = normByKey.get(normKey(code, version));
      return norm
        ? { norm, message: "" }
        : {
            message: `Không có định mức "${code}" phiên bản "${version}" trong thư viện hoặc trong file.`,
          };
    }
    const candidates = [...normByKey.values()].filter(
      (n) => normalizeCode(n.code) === normalizeCode(code)
    );
    if (candidates.length === 1) {
      return { norm: candidates[0], message: "" };
    }
    if (candidates.length > 1) {
      return {
        message: `Định mức "${code}" có ${candidates.length} phiên bản: ghi rõ cột Phiên bản.`,
      };
    }
    const workItem = workItemByCode.get(normalizeCode(code));
    if (!workItem) {
      return {
        message: `Không có định mức hoặc công tác mã "${code}" trong thư viện hoặc trong file.`,
      };
    }
    const id = newId();
    usedIds.add(id);
    const norm: Norm = {
      id,
      code: workItem.code,
      name: workItem.name,
      unit: workItem.unit,
      categoryId: workItem.categoryId,
      workItemId: workItem.id,
      version: "1",
      effectiveFrom: null,
      sourceType: "user",
      source: "",
      sourceVerified: false,
      status: approvedConflict(workItem.code, workItem.id) ? "draft" : "approved",
      wasteIncluded: false,
      notes: "Tạo khi nhập bảng định mức kiểu cũ (Mã công tác, Mã tài nguyên, Hao phí).",
      createdAt: now,
      updatedAt: now,
    };
    changes.norms.push(norm);
    normByKey.set(normKey(norm.code, norm.version), norm);
    newNormIds.add(norm.id);
    createdFromReferences.norms.push(`${norm.code} v1`);
    return { norm, message: "" };
  };

  const ordered = [...datasets].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const summaries = new Map<ImportDataset, DatasetSummary>();

  for (const dataset of ordered) {
    const summary: DatasetSummary = {
      kind: dataset.kind,
      sourceLabel: dataset.sourceLabel,
      total: dataset.rows.length,
      added: 0,
      duplicates: 0,
      updated: 0,
      errors: 0,
      empty: 0,
    };
    summaries.set(dataset, summary);
    if (dataset.problems.length > 0) {
      problems.push(...dataset.problems.map((p) => `${dataset.sourceLabel}: ${p}`));
      continue;
    }
    const mapped = recordKeys(new Set(dataset.mappedFields));
    const seen = new Map<string, string>();

    const report = (row: ImportRow, errors: RowErrors) => {
      summary.errors++;
      for (const e of errors) {
        issues.push({
          sourceLabel: dataset.sourceLabel,
          rowLabel: row.rowLabel,
          columnLabel: e.field ? dataset.columnLabels[e.field] : undefined,
          message: e.message,
        });
      }
    };
    /** Trùng trong chính file: báo lỗi, trỏ về dòng đầu tiên. */
    const firstOccurrence = (
      key: string,
      row: ImportRow,
      errors: RowErrors,
      field: string,
      what: string
    ) => {
      const first = seen.get(key);
      if (first) {
        errors.push({ field, message: `${what} trùng với ${first.toLowerCase()} trong file.` });
      } else {
        seen.set(key, row.rowLabel);
      }
    };

    for (const row of dataset.rows) {
      const cells = row.cells;
      if (!row.preErrors && dataset.mappedFields.every((key) => isBlankCell(cells[key]))) {
        summary.empty++;
        continue;
      }
      const errors: RowErrors = [...(row.preErrors ?? [])];
      const text = (key: string) => parseTextCell(cells[key]);

      if (dataset.kind === "categories" || dataset.kind === "suppliers") {
        const isCategory = dataset.kind === "categories";
        const name = text("name").replace(/\s+/g, " ");
        requireText(errors, "name", name, isCategory ? "tên nhóm" : "tên nhà cung cấp");
        if (name) {
          firstOccurrence(normalizeName(name), row, errors, "name", `Tên "${name}"`);
        }
        if (errors.length > 0) {
          report(row, errors);
          continue;
        }
        const key = normalizeName(name);
        if (isCategory) {
          const incoming = { name, notes: text("notes") };
          const existing = categoryByName.get(key);
          if (existing) {
            summary.duplicates++;
            if (mode === "update") {
              const updated = { ...mergeMapped(existing, incoming, mapped), updatedAt: now };
              changes.categories.push(updated);
              categoryByName.set(key, updated);
              summary.updated++;
            }
            continue;
          }
          const created: Category = { id: takeId(row), ...incoming, ...stamps(row) };
          changes.categories.push(created);
          categoryByName.set(key, created);
        } else {
          const incoming = { name, contactInfo: text("contactInfo"), notes: text("notes") };
          const existing = supplierByName.get(key);
          if (existing) {
            summary.duplicates++;
            if (mode === "update") {
              const updated = { ...mergeMapped(existing, incoming, mapped), updatedAt: now };
              changes.suppliers.push(updated);
              supplierByName.set(key, updated);
              summary.updated++;
            }
            continue;
          }
          const created: Supplier = { id: takeId(row), ...incoming, ...stamps(row) };
          changes.suppliers.push(created);
          supplierByName.set(key, created);
        }
        summary.added++;
        continue;
      }

      if (dataset.kind === "resources") {
        const code = text("code");
        const name = text("name");
        const unit = text("unit");
        const type = read(errors, "type", parseResourceTypeCell(cells.type), null);
        requireText(errors, "code", code, "mã tài nguyên");
        requireText(errors, "name", name, "tên tài nguyên");
        requireText(errors, "unit", unit, "đơn vị tính");
        if (code) {
          firstOccurrence(normalizeCode(code), row, errors, "code", `Mã "${code}"`);
        }
        if (errors.length > 0) {
          report(row, errors);
          continue;
        }
        const existing = resourceByCode.get(normalizeCode(code));
        if (existing && mode === "skip") {
          summary.duplicates++;
          continue;
        }
        const incoming = {
          name,
          unit,
          type: type ?? "other",
          categoryId: mapped.has("categoryId") ? ensureCategory(text("category")) : null,
          notes: text("notes"),
        };
        if (existing) {
          summary.duplicates++;
          if (mode === "update") {
            const updated = { ...mergeMapped(existing, incoming, mapped), updatedAt: now };
            changes.resources.push(updated);
            resourceByCode.set(normalizeCode(code), updated);
            summary.updated++;
          }
          continue;
        }
        const created: Resource = { id: takeId(row), code, ...incoming, ...stamps(row) };
        changes.resources.push(created);
        resourceByCode.set(normalizeCode(code), created);
        summary.added++;
        continue;
      }

      if (dataset.kind === "workItems") {
        const code = text("code");
        const name = text("name");
        const unit = text("unit");
        const unitPrice = read(errors, "unitPrice", parseNumberCell(cells.unitPrice), null);
        const effectiveFrom = read(
          errors,
          "effectiveFrom",
          parseDateCell(cells.effectiveFrom),
          null
        );
        const effectiveTo = read(errors, "effectiveTo", parseDateCell(cells.effectiveTo), null);
        requireText(errors, "code", code, "mã công tác");
        requireText(errors, "name", name, "tên công tác");
        requireText(errors, "unit", unit, "đơn vị tính");
        if (unitPrice !== null && unitPrice < 0) {
          errors.push({ field: "unitPrice", message: "Đơn giá không được âm." });
        }
        if (code) {
          firstOccurrence(normalizeCode(code), row, errors, "code", `Mã "${code}"`);
        }
        const incoming = {
          name,
          // Gán sau khi dòng hợp lệ (ensureCategory/ensureSupplier có thể tạo bản ghi mới).
          categoryId: null as string | null,
          unit,
          description: text("description"),
          unitPrice,
          currency: text("currency"),
          supplierId: null as string | null,
          source: text("source"),
          effectiveFrom,
          effectiveTo,
          notes: text("notes"),
        };
        const existing = workItemByCode.get(normalizeCode(code));
        const candidate: WorkItem = existing
          ? mergeMapped(existing, incoming, mapped)
          : { id: "", code, pricingMethod: "direct", createdAt: now, updatedAt: now, ...incoming };
        // Ràng buộc chéo kiểm trên bản ghi sau khi ghép (khi cập nhật, cột không có trong file giữ giá trị cũ).
        if (candidate.unitPrice !== null && candidate.currency === "") {
          errors.push({ field: "currency", message: "Có đơn giá nhưng thiếu tiền tệ." });
        }
        checkPeriod(errors, candidate.effectiveFrom, candidate.effectiveTo);
        if (errors.length > 0) {
          report(row, errors);
          continue;
        }
        if (existing && mode === "skip") {
          summary.duplicates++;
          continue;
        }
        if (mapped.has("categoryId")) {
          candidate.categoryId = ensureCategory(text("category"));
        }
        if (mapped.has("supplierId")) {
          candidate.supplierId = ensureSupplier(text("supplier"));
        }
        if (existing) {
          summary.duplicates++;
          if (mode === "update") {
            const updated = { ...candidate, updatedAt: now };
            changes.workItems.push(updated);
            workItemByCode.set(normalizeCode(code), updated);
            summary.updated++;
          }
          continue;
        }
        const created: WorkItem = { ...candidate, id: takeId(row), ...stamps(row) };
        changes.workItems.push(created);
        workItemByCode.set(normalizeCode(code), created);
        summary.added++;
        continue;
      }

      if (dataset.kind === "resourcePrices") {
        const resourceCode = text("resourceCode");
        const price = read(errors, "price", parseNumberCell(cells.price), null);
        const unit = text("unit");
        const currency = text("currency");
        const effectiveFrom = read(
          errors,
          "effectiveFrom",
          parseDateCell(cells.effectiveFrom),
          null
        );
        const effectiveTo = read(errors, "effectiveTo", parseDateCell(cells.effectiveTo), null);
        const status = read(errors, "status", parsePriceStatusCell(cells.status), null);
        if (!row.preErrors) {
          requireText(errors, "resourceCode", resourceCode, "mã tài nguyên");
        }
        const resource = resourceCode ? resourceByCode.get(normalizeCode(resourceCode)) : undefined;
        if (resourceCode && !resource) {
          errors.push({
            field: "resourceCode",
            message: `Không có tài nguyên mã "${resourceCode}" trong thư viện hoặc trong file.`,
          });
        }
        if (price === null && !errors.some((e) => e.field === "price")) {
          errors.push({ field: "price", message: "Thiếu đơn giá." });
        } else if (price !== null && price < 0) {
          errors.push({ field: "price", message: "Đơn giá không được âm." });
        }
        requireText(errors, "unit", unit, "đơn vị tính của giá");
        requireText(errors, "currency", currency, "tiền tệ");
        checkPeriod(errors, effectiveFrom, effectiveTo);
        if (errors.length > 0 || !resource || price === null) {
          report(row, errors);
          continue;
        }
        const incoming = {
          resourceId: resource.id,
          price,
          unit,
          currency,
          effectiveFrom,
          effectiveTo,
          source: text("source"),
          status: status ?? "active",
          notes: text("notes"),
        };
        const key = priceKey(incoming);
        // Có id (JSON): trùng theo id. Không có id: giá giống hệt (tài nguyên, đơn giá, đơn vị, tiền tệ, hiệu lực, nguồn).
        const fileKey = row.meta?.id ? `id:${row.meta.id}` : key;
        firstOccurrence(fileKey, row, errors, "price", "Giá");
        if (errors.length > 0) {
          report(row, errors);
          continue;
        }
        const existing =
          (row.meta?.id ? priceById.get(row.meta.id) : undefined) ?? priceByKey.get(key);
        if (existing && mode === "skip") {
          summary.duplicates++;
          continue;
        }
        const supplierId = mapped.has("supplierId") ? ensureSupplier(text("supplier")) : null;
        if (existing) {
          summary.duplicates++;
          changes.resourcePrices.push({
            ...mergeMapped(
              existing,
              { ...incoming, supplierId },
              new Set([...mapped, "resourceId"])
            ),
            updatedAt: now,
          });
          summary.updated++;
          continue;
        }
        const created: ResourcePrice = {
          id: takeId(row),
          ...incoming,
          supplierId,
          ...stamps(row),
        };
        changes.resourcePrices.push(created);
        priceByKey.set(key, created);
        summary.added++;
        continue;
      }

      if (dataset.kind === "norms") {
        const code = text("code");
        const name = text("name");
        const unit = text("unit");
        const version = text("version") || "1";
        const effectiveFrom = read(
          errors,
          "effectiveFrom",
          parseDateCell(cells.effectiveFrom),
          null
        );
        const sourceType = read(
          errors,
          "sourceType",
          parseNormSourceTypeCell(cells.sourceType),
          null
        );
        const sourceVerified = read(
          errors,
          "sourceVerified",
          parseYesNoCell(cells.sourceVerified),
          null
        );
        const status = read(errors, "status", parseNormStatusCell(cells.status), null);
        const wasteIncluded = read(
          errors,
          "wasteIncluded",
          parseYesNoCell(cells.wasteIncluded),
          null
        );
        requireText(errors, "code", code, "mã định mức");
        requireText(errors, "name", name, "tên công tác");
        requireText(errors, "unit", unit, "đơn vị tính");
        const workItemCode = text("workItemCode");
        const workItem = workItemCode ? workItemByCode.get(normalizeCode(workItemCode)) : undefined;
        if (workItemCode && !workItem) {
          errors.push({
            field: "workItemCode",
            message: `Không có công tác mã "${workItemCode}" trong thư viện hoặc trong file.`,
          });
        }
        if (code) {
          firstOccurrence(
            normKey(code, version),
            row,
            errors,
            "version",
            `Định mức "${code}" phiên bản "${version}"`
          );
        }
        if (errors.length > 0) {
          report(row, errors);
          continue;
        }
        const existing = normByKey.get(normKey(code, version));
        if (existing && mode === "skip") {
          summary.duplicates++;
          continue;
        }
        const incoming = {
          name,
          categoryId: mapped.has("categoryId") ? ensureCategory(text("category")) : null,
          effectiveFrom,
          sourceType: sourceType ?? "user",
          source: text("source"),
          sourceVerified: sourceVerified ?? false,
          workItemId: workItem?.id ?? null,
          notes: text("notes"),
        };
        if (existing) {
          // Cập nhật chỉ đổi thông tin mô tả; mã, phiên bản, đơn vị, cờ hao hụt và trạng thái giữ nguyên
          // (phiên bản đã dùng không bị đổi âm thầm; trạng thái đổi qua giao diện có kiểm tra).
          const updated: Norm = { ...mergeMapped(existing, incoming, mapped), updatedAt: now };
          const linkTaken =
            updated.status === "approved" &&
            updated.workItemId &&
            updated.workItemId !== existing.workItemId
              ? [...normByKey.values()].find(
                  (n) =>
                    n.id !== existing.id &&
                    n.status === "approved" &&
                    n.workItemId === updated.workItemId
                )
              : undefined;
          if (linkTaken) {
            report(row, [
              {
                field: "workItemCode",
                message: `Công tác liên kết đã dùng định mức "${linkTaken.code}" phiên bản ${linkTaken.version}.`,
              },
            ]);
            continue;
          }
          summary.duplicates++;
          changes.norms.push(updated);
          normByKey.set(normKey(code, version), updated);
          summary.updated++;
          continue;
        }
        const nextStatus: NormStatus = status ?? "draft";
        if (nextStatus === "approved") {
          const conflict = approvedConflict(code, incoming.workItemId);
          if (conflict) {
            report(row, [{ field: "status", message: conflict }]);
            continue;
          }
        }
        const created: Norm = {
          id: takeId(row),
          code,
          version,
          unit,
          wasteIncluded: wasteIncluded ?? false,
          status: nextStatus,
          ...incoming,
          ...stamps(row),
        };
        changes.norms.push(created);
        normByKey.set(normKey(code, version), created);
        newNormIds.add(created.id);
        summary.added++;
        continue;
      }

      // normComponents
      const normCode = text("normCode");
      const normVersion = text("version");
      const resourceCode = text("resourceCode");
      const consumption = read(errors, "consumption", parseNumberCell(cells.consumption), null);
      const wastePercent = read(errors, "wastePercent", parseNumberCell(cells.wastePercent), null);
      const sortOrder = read(errors, "sortOrder", parseNumberCell(cells.sortOrder), null);
      if (!row.preErrors) {
        requireText(errors, "normCode", normCode, "mã định mức");
        requireText(errors, "resourceCode", resourceCode, "mã tài nguyên");
      }
      const resource = resourceCode ? resourceByCode.get(normalizeCode(resourceCode)) : undefined;
      if (resourceCode && !resource) {
        errors.push({
          field: "resourceCode",
          message: `Không có tài nguyên mã "${resourceCode}" trong thư viện hoặc trong file.`,
        });
      }
      if (consumption === null && !errors.some((e) => e.field === "consumption")) {
        errors.push({ field: "consumption", message: "Thiếu hao phí." });
      } else if (consumption !== null && consumption <= 0) {
        errors.push({ field: "consumption", message: "Hao phí phải lớn hơn 0." });
      }
      if (wastePercent !== null && (wastePercent < 0 || wastePercent > 100)) {
        errors.push({ field: "wastePercent", message: "Hao hụt từ 0 đến 100 (%)." });
      }
      const target = normCode
        ? resolveNormFor(normCode, normVersion)
        : { norm: undefined, message: "" };
      if (normCode && !target.norm) {
        errors.push({ field: "normCode", message: target.message });
      }
      const norm = target.norm;
      if (norm && resource) {
        firstOccurrence(
          `${norm.id}|${resource.id}`,
          row,
          errors,
          "resourceCode",
          "Thành phần (định mức, tài nguyên)"
        );
      }
      if (norm && wastePercent && wastePercent > 0 && norm.wasteIncluded) {
        errors.push({
          field: "wastePercent",
          message: "Định mức ghi hao phí đã gồm hao hụt: để trống hao hụt để không tính trùng.",
        });
      }
      if (errors.length > 0 || !norm || !resource || consumption === null) {
        report(row, errors);
        continue;
      }
      const editable = norm.status === "draft" || newNormIds.has(norm.id);
      const existingComponent = componentByPair.get(`${norm.id}|${resource.id}`);
      const fields = {
        consumption,
        wasteRate: wastePercent ? percentToRate(wastePercent) : 0,
        notes: text("notes"),
      };
      if (existingComponent) {
        summary.duplicates++;
        if (mode === "update" && editable) {
          changes.normComponents.push({
            ...mergeMapped(
              existingComponent,
              { ...fields, sortOrder: sortOrder ?? existingComponent.sortOrder },
              mapped
            ),
            updatedAt: now,
          });
          summary.updated++;
        }
        continue;
      }
      if (!editable) {
        report(row, [
          {
            field: "normCode",
            message: `Định mức "${norm.code}" phiên bản ${norm.version} không còn là nháp: không thêm thành phần. Sao chép thành phiên bản mới rồi nhập.`,
          },
        ]);
        continue;
      }
      const siblingsMax = Math.max(
        0,
        ...[...componentByPair.values()].filter((c) => c.normId === norm.id).map((c) => c.sortOrder)
      );
      const snapshot = row.meta?.snapshot;
      // Giá đã chọn (JSON) chỉ giữ khi giá đó có trong thư viện hoặc trong file và thuộc đúng tài nguyên.
      const savedPriceId = row.meta?.priceId;
      const savedPrice = savedPriceId
        ? (priceById.get(savedPriceId) ?? changes.resourcePrices.find((p) => p.id === savedPriceId))
        : undefined;
      const created: NormComponent = {
        id: takeId(row),
        normId: norm.id,
        resourceId: resource.id,
        resourceCodeSnapshot: snapshot?.code ?? resource.code,
        resourceNameSnapshot: snapshot?.name ?? resource.name,
        resourceUnitSnapshot: snapshot?.unit ?? resource.unit,
        resourceTypeSnapshot: snapshot?.type ?? resource.type,
        ...fields,
        priceId: savedPrice && savedPrice.resourceId === resource.id ? savedPrice.id : null,
        sortOrder: sortOrder ?? siblingsMax + 1,
        ...stamps(row),
      };
      changes.normComponents.push(created);
      componentByPair.set(`${norm.id}|${resource.id}`, created);
      summary.added++;
    }
  }

  return {
    // Báo cáo theo thứ tự nguồn người dùng thấy.
    summaries: datasets.map((d) => summaries.get(d)!).filter(Boolean),
    issues,
    problems,
    changes,
    createdFromReferences,
  };
}

export function changeCount(changes: ImportChanges): number {
  return DATASET_KINDS.reduce((sum, kind) => sum + changes[kind].length, 0);
}
