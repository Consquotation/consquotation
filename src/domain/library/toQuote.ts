/**
 * Chép công tác từ thư viện sang dòng báo giá dưới dạng BẢN SAO GIÁ TRỊ (snapshot):
 * dòng báo giá không liên kết với thư viện, nên sửa thư viện sau đó không làm đổi báo giá cũ
 * (prompts/08). Không tự thay giá thiếu bằng 0, không tự chọn giá khác (prompts/10).
 */

import { WorkItemDraftInput } from "../workItemDraft";
import { formatIsoDate, validityOn } from "./dates";
import { NameLookup } from "./search";
import { WorkItem } from "./types";

const NO_NAMES: NameLookup = { category: new Map(), supplier: new Map() };

export type InsertWarning =
  | { kind: "missingPrice" }
  | { kind: "expired"; effectiveTo: string }
  | { kind: "notYetEffective"; effectiveFrom: string };

export interface LibraryDraft {
  draft: WorkItemDraftInput;
  /** Cảnh báo cần người dùng xác nhận trước khi chèn. */
  warnings: InsertWarning[];
}

/** Ghi chú truy vết nguồn giá đi kèm dòng báo giá (prompts/10: hiển thị nguồn giá). */
export function traceNote(item: WorkItem, lookup: NameLookup = NO_NAMES): string {
  const parts = [`Thư viện: ${item.code}`];
  const supplier = item.supplierId ? lookup.supplier.get(item.supplierId) : undefined;
  if (supplier) {
    parts.push(`nhà cung cấp: ${supplier}`);
  }
  if (item.source) {
    parts.push(`nguồn giá: ${item.source}`);
  }
  if (item.effectiveFrom || item.effectiveTo) {
    parts.push(
      `hiệu lực ${formatIsoDate(item.effectiveFrom) || "…"} – ${formatIsoDate(item.effectiveTo) || "…"}`
    );
  }
  if (item.unitPrice !== null && item.currency) {
    parts.push(`tiền tệ: ${item.currency}`);
  }
  return parts.join("; ");
}

/** `lookup` cho tên nhóm (chép vào cột Nhóm công tác) và tên nhà cung cấp (ghi chú truy vết). */
export function draftFromWorkItem(
  item: WorkItem,
  today: string,
  lookup: NameLookup = NO_NAMES
): LibraryDraft {
  const warnings: InsertWarning[] = [];
  if (item.unitPrice === null) {
    warnings.push({ kind: "missingPrice" });
  } else {
    const validity = validityOn(item.effectiveFrom, item.effectiveTo, today);
    if (validity === "expired" && item.effectiveTo) {
      warnings.push({ kind: "expired", effectiveTo: item.effectiveTo });
    }
    if (validity === "notYetEffective" && item.effectiveFrom) {
      warnings.push({ kind: "notYetEffective", effectiveFrom: item.effectiveFrom });
    }
  }
  return {
    draft: {
      code: item.code,
      group: item.categoryId ? (lookup.category.get(item.categoryId) ?? "") : "",
      description: item.name,
      unit: item.unit,
      quantity: "",
      unitPrice: item.unitPrice === null ? "" : String(item.unitPrice),
      notes: traceNote(item, lookup),
    },
    warnings,
  };
}
