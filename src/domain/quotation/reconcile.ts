/**
 * Đồng bộ hồ sơ báo giá với các dòng trên sheet (ADR-0014). Sheet là nguồn sự thật:
 * - dòng có dữ liệu nhưng chưa có Mã dòng (gõ tay trong Excel) → gán mã mới, tạo mục hồ sơ, đoán
 *   phương pháp theo ghi chú (giống Kiểm tra báo giá);
 * - nhiều dòng cùng Mã dòng (người dùng sao chép dòng) → dòng đầu giữ mã, các dòng sau nhận mã mới và
 *   bản sao nguồn gốc của dòng đầu;
 * - mục hồ sơ không còn dòng nào trên sheet (dòng đã bị xóa) → bỏ khỏi hồ sơ.
 * Thuần TypeScript; việc ghi mã lên sheet và lưu hồ sơ do service thực hiện.
 */

import { COMPOSITION_NOTE_PREFIX } from "../pricing/composition";
import type { QuoteLine } from "./lines";
import { PricingMethod, QuotationItemRecord, QuotationRecord, newRecord } from "./model";

export interface IdAssignment {
  row: number;
  lineId: string;
  reason: "missing" | "duplicate";
}

export interface ReconcileResult {
  record: QuotationRecord;
  assignments: IdAssignment[];
  /** Mục hồ sơ mới tạo cho dòng gõ tay. */
  added: number;
  /** Dòng sao chép nhận mã mới. */
  copied: number;
  /** Mã dòng đã bị xóa khỏi sheet (mục hồ sơ bị bỏ). */
  removed: string[];
  changed: boolean;
}

/** Phương pháp đơn giá đoán theo ghi chú truy vết mà add-in ghi khi chèn. */
export function inferMethod(notes: string): PricingMethod {
  if (notes.startsWith(COMPOSITION_NOTE_PREFIX)) {
    return "norm";
  }
  if (notes.startsWith("Thư viện:")) {
    return "library";
  }
  return "manual";
}

export function itemFromLine(line: QuoteLine, id: string, now: string): QuotationItemRecord {
  return {
    id,
    pricingMethod: inferMethod(line.notes),
    workCode: line.code,
    workName: line.description,
    unit: line.unit,
    source: null,
    libraryPrice: null,
    components: [],
    result: null,
    writtenBreakdown: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function reconcile(
  lines: readonly QuoteLine[],
  current: QuotationRecord | null,
  context: { tableName: string; now: string; newId: () => string }
): ReconcileResult {
  const { now } = context;
  const used = new Set<string>([
    ...lines.map((l) => l.lineId).filter((id): id is string => id !== null),
    ...(current?.items ?? []).map((i) => i.id),
  ]);
  // Mã mới không được trùng mã đang có trên sheet hoặc trong hồ sơ.
  const newId = () => {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const id = context.newId();
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
    throw new Error("Không tạo được Mã dòng mới không trùng.");
  };
  const base = current ?? newRecord(newId(), context.tableName, now);
  const byId = new Map(base.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const items: QuotationItemRecord[] = [];
  const assignments: IdAssignment[] = [];
  let added = 0;
  let copied = 0;
  for (const line of lines) {
    if (line.lineId !== null && !seen.has(line.lineId)) {
      seen.add(line.lineId);
      const existing = byId.get(line.lineId);
      if (existing) {
        items.push(existing);
      } else {
        // Mã dòng có trên sheet nhưng không có trong hồ sơ (hồ sơ chưa lưu được, hoặc dòng dán từ
        // workbook khác): tạo mục theo dữ liệu trên sheet.
        items.push(itemFromLine(line, line.lineId, now));
        added++;
      }
      continue;
    }
    const id = newId();
    if (line.lineId !== null) {
      const original = byId.get(line.lineId);
      items.push(
        original
          ? { ...structuredCopy(original), id, result: null, createdAt: now, updatedAt: now }
          : itemFromLine(line, id, now)
      );
      assignments.push({ row: line.row, lineId: id, reason: "duplicate" });
      copied++;
    } else {
      items.push(itemFromLine(line, id, now));
      assignments.push({ row: line.row, lineId: id, reason: "missing" });
      added++;
    }
  }
  const kept = new Set(items.map((i) => i.id));
  const removed = base.items.filter((i) => !kept.has(i.id)).map((i) => i.id);
  const changed = current === null || assignments.length > 0 || removed.length > 0 || added > 0;
  return {
    record: changed ? { ...base, items, updatedAt: now } : base,
    assignments,
    added,
    copied,
    removed,
    changed,
  };
}

function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
