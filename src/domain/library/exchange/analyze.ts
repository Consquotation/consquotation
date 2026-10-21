/**
 * Kiểm tra dữ liệu nhập và lập danh sách thay đổi (prompts/09):
 * - Dòng lỗi không bao giờ được nhập; báo đúng dòng/cột.
 * - Không tự suy diễn đơn vị hoặc giá bị thiếu.
 * - Bản ghi trùng với thư viện: mặc định bỏ qua; chỉ cập nhật khi người dùng chọn,
 *   và chỉ các trường có cột trong file.
 * Hàm thuần: không ghi gì; bước ghi dùng `changes` trong một giao dịch.
 */

import { normalizeCode } from "../validation";
import { normalizeForSearch } from "../search";
import { LibrarySnapshot, NormDefinition, Resource, ResourcePrice, WorkItem } from "../types";
import {
  CellParse,
  isBlankCell,
  parseDateCell,
  parseNumberCell,
  parsePriceStatusCell,
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

export interface ImportChanges {
  workItems: WorkItem[];
  resources: Resource[];
  resourcePrices: ResourcePrice[];
  norms: NormDefinition[];
}

export interface ImportAnalysis {
  summaries: DatasetSummary[];
  issues: ImportIssue[];
  /** Lỗi chặn cả lần nhập (thiếu cột bắt buộc…). */
  problems: string[];
  changes: ImportChanges;
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
  resources: 0,
  workItems: 1,
  resourcePrices: 2,
  norms: 3,
};

export function analyzeImport(
  datasets: readonly ImportDataset[],
  library: LibrarySnapshot,
  options: AnalyzeOptions
): ImportAnalysis {
  const { mode, now, newId } = options;
  const issues: ImportIssue[] = [];
  const problems: string[] = [];
  const changes: ImportChanges = { workItems: [], resources: [], resourcePrices: [], norms: [] };

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
  const normByPair = new Map(library.norms.map((n) => [`${n.workItemId}|${n.resourceId}`, n]));
  const usedIds = new Set<string>([
    ...library.workItems.map((x) => x.id),
    ...library.resources.map((x) => x.id),
    ...library.resourcePrices.map((x) => x.id),
    ...library.norms.map((x) => x.id),
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
    const mapped = new Set(dataset.mappedFields);
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
        const incoming = { name, unit, type: type ?? "other", notes: text("notes") };
        const existing = resourceByCode.get(normalizeCode(code));
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
          group: text("group"),
          unit,
          description: text("description"),
          unitPrice,
          currency: text("currency"),
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
        if (existing) {
          summary.duplicates++;
          if (mode === "update") {
            changes.resourcePrices.push({
              ...mergeMapped(existing, incoming, new Set([...mapped, "resourceId"])),
              updatedAt: now,
            });
            summary.updated++;
          }
          continue;
        }
        const created: ResourcePrice = { id: takeId(row), ...incoming, ...stamps(row) };
        changes.resourcePrices.push(created);
        priceByKey.set(key, created);
        summary.added++;
        continue;
      }

      // norms
      const workItemCode = text("workItemCode");
      const resourceCode = text("resourceCode");
      const quantity = read(errors, "quantity", parseNumberCell(cells.quantity), null);
      if (!row.preErrors) {
        requireText(errors, "workItemCode", workItemCode, "mã công tác");
        requireText(errors, "resourceCode", resourceCode, "mã tài nguyên");
      }
      const workItem = workItemCode ? workItemByCode.get(normalizeCode(workItemCode)) : undefined;
      const resource = resourceCode ? resourceByCode.get(normalizeCode(resourceCode)) : undefined;
      if (workItemCode && !workItem) {
        errors.push({
          field: "workItemCode",
          message: `Không có công tác mã "${workItemCode}" trong thư viện hoặc trong file.`,
        });
      }
      if (resourceCode && !resource) {
        errors.push({
          field: "resourceCode",
          message: `Không có tài nguyên mã "${resourceCode}" trong thư viện hoặc trong file.`,
        });
      }
      if (quantity === null && !errors.some((e) => e.field === "quantity")) {
        errors.push({ field: "quantity", message: "Thiếu hao phí." });
      } else if (quantity !== null && quantity <= 0) {
        errors.push({ field: "quantity", message: "Hao phí phải lớn hơn 0." });
      }
      if (workItem && resource) {
        firstOccurrence(
          `${workItem.id}|${resource.id}`,
          row,
          errors,
          "resourceCode",
          "Định mức (công tác, tài nguyên)"
        );
      }
      if (errors.length > 0 || !workItem || !resource || quantity === null) {
        report(row, errors);
        continue;
      }
      const incoming = {
        workItemId: workItem.id,
        resourceId: resource.id,
        quantity,
        notes: text("notes"),
      };
      const existing = normByPair.get(`${workItem.id}|${resource.id}`);
      if (existing) {
        summary.duplicates++;
        if (mode === "update") {
          changes.norms.push({
            ...mergeMapped(existing, { quantity, notes: incoming.notes }, mapped),
            updatedAt: now,
          });
          summary.updated++;
        }
        continue;
      }
      const created: NormDefinition = { id: takeId(row), ...incoming, ...stamps(row) };
      changes.norms.push(created);
      normByPair.set(`${workItem.id}|${resource.id}`, created);
      summary.added++;
    }
  }

  return {
    // Báo cáo theo thứ tự nguồn người dùng thấy.
    summaries: datasets.map((d) => summaries.get(d)!).filter(Boolean),
    issues,
    problems,
    changes,
  };
}

export function changeCount(changes: ImportChanges): number {
  return DATASET_KINDS.reduce((sum, kind) => sum + changes[kind].length, 0);
}
