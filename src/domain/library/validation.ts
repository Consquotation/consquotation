/**
 * Kiểm tra dữ liệu thư viện (prompts/08, 13): lỗi chặn khi lưu và báo cáo kiểm tra toàn thư viện.
 * Không tự sửa, không tự điền giá trị thiếu.
 */

import { parseDecimalInput } from "../workItemDraft";
import { formatIsoDate, isIsoDate, periodsOverlap, validityOn } from "./dates";
import { normalizeForSearch } from "./search";
import {
  Category,
  LibrarySnapshot,
  NormDefinition,
  PriceStatus,
  Resource,
  ResourcePrice,
  ResourceType,
  Supplier,
  WorkItem,
  normalizeName,
} from "./types";

export interface FieldError<F extends string = string> {
  field: F;
  message: string;
}

export type FormResult<T, F extends string> =
  { ok: true; value: T } | { ok: false; errors: FieldError<F>[] };

/** Mã so sánh không phân biệt hoa thường và khoảng trắng hai đầu. */
export function normalizeCode(code: string): string {
  return code.trim().toLocaleLowerCase("vi-VN");
}

function checkDates<F extends string>(
  from: string,
  to: string,
  fromField: F,
  toField: F,
  errors: FieldError<F>[]
): { effectiveFrom: string | null; effectiveTo: string | null } {
  const effectiveFrom = from.trim() === "" ? null : from.trim();
  const effectiveTo = to.trim() === "" ? null : to.trim();
  if (effectiveFrom && !isIsoDate(effectiveFrom)) {
    errors.push({ field: fromField, message: "Ngày không hợp lệ." });
  }
  if (effectiveTo && !isIsoDate(effectiveTo)) {
    errors.push({ field: toField, message: "Ngày không hợp lệ." });
  }
  if (
    effectiveFrom &&
    effectiveTo &&
    isIsoDate(effectiveFrom) &&
    isIsoDate(effectiveTo) &&
    effectiveFrom > effectiveTo
  ) {
    errors.push({
      field: toField,
      message: "Ngày kết thúc hiệu lực phải sau hoặc bằng ngày bắt đầu.",
    });
  }
  return { effectiveFrom, effectiveTo };
}

function required<F extends string>(
  value: string,
  field: F,
  label: string,
  errors: FieldError<F>[]
): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    errors.push({ field, message: `Nhập ${label}.` });
  }
  return trimmed;
}

/** Tham chiếu danh mục/nhà cung cấp trên form: "" = không chọn. Phải trỏ tới bản ghi còn tồn tại. */
function checkRef<F extends string>(
  id: string,
  list: readonly { id: string }[],
  field: F,
  what: string,
  errors: FieldError<F>[]
): string | null {
  if (id === "") {
    return null;
  }
  if (!list.some((x) => x.id === id)) {
    errors.push({ field, message: `${what} đã chọn không còn tồn tại. Hãy chọn lại.` });
    return null;
  }
  return id;
}

/**
 * Bản ghi cùng tên (không phân biệt dấu, hoa thường) nhưng là bản ghi khác: chỉ để CẢNH BÁO
 * "có khả năng trùng", không chặn và không tự gộp (hai vật tư cùng tên khác mã là chuyện thường).
 */
export function sameNameRecords<T extends { id: string; name: string }>(
  name: string,
  items: readonly T[],
  editingId: string | null
): T[] {
  const key = normalizeForSearch(name);
  if (key === "") {
    return [];
  }
  return items.filter((x) => x.id !== editingId && normalizeForSearch(x.name) === key);
}

// ---------- Công tác ----------

export interface WorkItemForm {
  code: string;
  name: string;
  /** id danh mục; "" = chưa phân nhóm. */
  categoryId: string;
  unit: string;
  description: string;
  unitPrice: string;
  currency: string;
  /** id nhà cung cấp; "" = không có. */
  supplierId: string;
  source: string;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}

export type WorkItemField = keyof WorkItemForm;

export type WorkItemData = Omit<WorkItem, "id" | "createdAt" | "updatedAt">;

export function validateWorkItemForm(
  form: WorkItemForm,
  library: Pick<LibrarySnapshot, "workItems" | "categories" | "suppliers">,
  editingId: string | null
): FormResult<WorkItemData, WorkItemField> {
  const existing = library.workItems;
  const errors: FieldError<WorkItemField>[] = [];
  const code = required(form.code, "code", "mã công tác", errors);
  const name = required(form.name, "name", "tên công tác", errors);
  const unit = required(form.unit, "unit", "đơn vị tính", errors);
  if (
    code &&
    existing.some((w) => w.id !== editingId && normalizeCode(w.code) === normalizeCode(code))
  ) {
    errors.push({ field: "code", message: `Mã "${code}" đã có trong thư viện.` });
  }
  const price = parseDecimalInput(form.unitPrice);
  let unitPrice: number | null = null;
  if (!price.ok) {
    errors.push({ field: "unitPrice", message: price.message });
  } else if (price.value !== null && price.value < 0) {
    errors.push({ field: "unitPrice", message: "Đơn giá không được âm." });
  } else {
    unitPrice = price.value;
  }
  const currency = form.currency.trim();
  if (unitPrice !== null && currency === "") {
    errors.push({ field: "currency", message: "Nhập đơn vị tiền tệ cho đơn giá." });
  }
  const dates = checkDates(
    form.effectiveFrom,
    form.effectiveTo,
    "effectiveFrom",
    "effectiveTo",
    errors
  );
  const categoryId = checkRef(form.categoryId, library.categories, "categoryId", "Nhóm", errors);
  const supplierId = checkRef(
    form.supplierId,
    library.suppliers,
    "supplierId",
    "Nhà cung cấp",
    errors
  );

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      code,
      name,
      categoryId,
      unit,
      description: form.description.trim(),
      pricingMethod: "direct",
      unitPrice,
      currency,
      supplierId,
      source: form.source.trim(),
      ...dates,
      notes: form.notes.trim(),
    },
  };
}

export function workItemToForm(item: WorkItem): WorkItemForm {
  return {
    code: item.code,
    name: item.name,
    categoryId: item.categoryId ?? "",
    unit: item.unit,
    description: item.description,
    unitPrice: item.unitPrice === null ? "" : String(item.unitPrice),
    currency: item.currency,
    supplierId: item.supplierId ?? "",
    source: item.source,
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
    notes: item.notes,
  };
}

// ---------- Tài nguyên ----------

export interface ResourceForm {
  code: string;
  name: string;
  type: ResourceType;
  /** id danh mục; "" = chưa phân nhóm. */
  categoryId: string;
  unit: string;
  notes: string;
}

export type ResourceField = keyof ResourceForm;
export type ResourceData = Omit<Resource, "id" | "createdAt" | "updatedAt">;

export function validateResourceForm(
  form: ResourceForm,
  library: Pick<LibrarySnapshot, "resources" | "categories">,
  editingId: string | null
): FormResult<ResourceData, ResourceField> {
  const existing = library.resources;
  const errors: FieldError<ResourceField>[] = [];
  const code = required(form.code, "code", "mã tài nguyên", errors);
  const name = required(form.name, "name", "tên tài nguyên", errors);
  const unit = required(form.unit, "unit", "đơn vị tính", errors);
  if (
    code &&
    existing.some((r) => r.id !== editingId && normalizeCode(r.code) === normalizeCode(code))
  ) {
    errors.push({ field: "code", message: `Mã "${code}" đã có trong thư viện.` });
  }
  const categoryId = checkRef(form.categoryId, library.categories, "categoryId", "Nhóm", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { code, name, type: form.type, categoryId, unit, notes: form.notes.trim() },
  };
}

// ---------- Giá tài nguyên ----------

export interface PriceForm {
  price: string;
  unit: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
  /** id nhà cung cấp; "" = không có. */
  supplierId: string;
  source: string;
  status: PriceStatus;
  notes: string;
}

export type PriceField = keyof PriceForm;
export type PriceData = Omit<ResourcePrice, "id" | "resourceId" | "createdAt" | "updatedAt">;

export function validatePriceForm(
  form: PriceForm,
  suppliers: readonly Supplier[]
): FormResult<PriceData, PriceField> {
  const errors: FieldError<PriceField>[] = [];
  const parsed = parseDecimalInput(form.price);
  let price = 0;
  if (!parsed.ok) {
    errors.push({ field: "price", message: parsed.message });
  } else if (parsed.value === null) {
    errors.push({ field: "price", message: "Nhập đơn giá." });
  } else if (parsed.value < 0) {
    errors.push({ field: "price", message: "Đơn giá không được âm." });
  } else {
    price = parsed.value;
  }
  const unit = required(form.unit, "unit", "đơn vị tính", errors);
  const currency = required(form.currency, "currency", "đơn vị tiền tệ", errors);
  const dates = checkDates(
    form.effectiveFrom,
    form.effectiveTo,
    "effectiveFrom",
    "effectiveTo",
    errors
  );
  const supplierId = checkRef(form.supplierId, suppliers, "supplierId", "Nhà cung cấp", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      price,
      unit,
      currency,
      ...dates,
      supplierId,
      source: form.source.trim(),
      status: form.status,
      notes: form.notes.trim(),
    },
  };
}

// ---------- Danh mục và nhà cung cấp ----------

export const NAME_MAX = 120;
export const CONTACT_MAX = 500;

export interface CategoryForm {
  name: string;
  notes: string;
}
export type CategoryField = keyof CategoryForm;
export type CategoryData = Omit<Category, "id" | "createdAt" | "updatedAt">;

function uniqueName<F extends string>(
  name: string,
  existing: readonly { id: string; name: string }[],
  editingId: string | null,
  field: F,
  what: string,
  errors: FieldError<F>[]
): void {
  if (name.length > NAME_MAX) {
    errors.push({ field, message: `Tên tối đa ${NAME_MAX} ký tự.` });
  }
  if (
    name &&
    existing.some((x) => x.id !== editingId && normalizeName(x.name) === normalizeName(name))
  ) {
    errors.push({ field, message: `Đã có ${what} tên "${name}".` });
  }
}

export function validateCategoryForm(
  form: CategoryForm,
  existing: readonly Category[],
  editingId: string | null
): FormResult<CategoryData, CategoryField> {
  const errors: FieldError<CategoryField>[] = [];
  const name = required(form.name.replace(/\s+/g, " "), "name", "tên nhóm", errors);
  uniqueName(name, existing, editingId, "name", "nhóm", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name, notes: form.notes.trim() } };
}

export interface SupplierForm {
  name: string;
  contactInfo: string;
  notes: string;
}
export type SupplierField = keyof SupplierForm;
export type SupplierData = Omit<Supplier, "id" | "createdAt" | "updatedAt">;

export function validateSupplierForm(
  form: SupplierForm,
  existing: readonly Supplier[],
  editingId: string | null
): FormResult<SupplierData, SupplierField> {
  const errors: FieldError<SupplierField>[] = [];
  const name = required(form.name.replace(/\s+/g, " "), "name", "tên nhà cung cấp", errors);
  uniqueName(name, existing, editingId, "name", "nhà cung cấp", errors);
  const contactInfo = form.contactInfo.trim();
  if (contactInfo.length > CONTACT_MAX) {
    errors.push({
      field: "contactInfo",
      message: `Thông tin liên hệ tối đa ${CONTACT_MAX} ký tự.`,
    });
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name, contactInfo, notes: form.notes.trim() } };
}

// ---------- Định mức ----------

export interface NormForm {
  resourceId: string;
  quantity: string;
  notes: string;
}

export type NormField = keyof NormForm;
export type NormData = Omit<NormDefinition, "id" | "workItemId" | "createdAt" | "updatedAt">;

export function validateNormForm(
  form: NormForm,
  workItemId: string,
  library: LibrarySnapshot,
  editingId: string | null
): FormResult<NormData, NormField> {
  const errors: FieldError<NormField>[] = [];
  if (!library.resources.some((r) => r.id === form.resourceId)) {
    errors.push({ field: "resourceId", message: "Chọn tài nguyên." });
  } else if (
    library.norms.some(
      (n) => n.workItemId === workItemId && n.resourceId === form.resourceId && n.id !== editingId
    )
  ) {
    errors.push({
      field: "resourceId",
      message: "Tài nguyên này đã có trong định mức của công tác.",
    });
  }
  const parsed = parseDecimalInput(form.quantity);
  let quantity = 0;
  if (!parsed.ok) {
    errors.push({ field: "quantity", message: parsed.message });
  } else if (parsed.value === null) {
    errors.push({ field: "quantity", message: "Nhập hao phí." });
  } else if (parsed.value <= 0) {
    errors.push({ field: "quantity", message: "Hao phí phải lớn hơn 0." });
  } else {
    quantity = parsed.value;
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { resourceId: form.resourceId, quantity, notes: form.notes.trim() } };
}

// ---------- Báo cáo kiểm tra toàn thư viện ----------

export type IssueSeverity = "error" | "warning";

export type IssueKind =
  | "duplicateWorkItemCode"
  | "duplicateResourceCode"
  | "missingRequired"
  | "missingPrice"
  | "zeroPrice"
  | "expiredPrice"
  | "notYetEffectivePrice"
  | "brokenNormWorkItem"
  | "brokenNormResource"
  | "brokenPriceResource"
  | "overlappingPrices"
  | "priceUnitMismatch"
  | "brokenCategory"
  | "brokenSupplier"
  | "sameName";

export interface LibraryIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  /** Bản ghi liên quan để người dùng tìm và sửa. */
  entity: "workItem" | "resource" | "price" | "norm";
  entityId: string;
  /** Mã hoặc tên hiển thị của bản ghi. */
  label: string;
  detail: string;
}

export function libraryIssues(library: LibrarySnapshot, today: string): LibraryIssue[] {
  const issues: LibraryIssue[] = [];
  const workItemsById = new Map(library.workItems.map((w) => [w.id, w]));
  const resourcesById = new Map(library.resources.map((r) => [r.id, r]));

  const groupByCode = <T extends { code: string }>(items: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const key = normalizeCode(item.code);
      if (key !== "") {
        map.set(key, [...(map.get(key) ?? []), item]);
      }
    }
    return [...map.values()].filter((list) => list.length > 1);
  };

  for (const dupes of groupByCode(library.workItems)) {
    for (const w of dupes) {
      issues.push({
        kind: "duplicateWorkItemCode",
        severity: "error",
        entity: "workItem",
        entityId: w.id,
        label: w.code,
        detail: `Mã công tác "${w.code}" bị trùng (${dupes.length} công tác).`,
      });
    }
  }
  for (const dupes of groupByCode(library.resources)) {
    for (const r of dupes) {
      issues.push({
        kind: "duplicateResourceCode",
        severity: "error",
        entity: "resource",
        entityId: r.id,
        label: r.code,
        detail: `Mã tài nguyên "${r.code}" bị trùng (${dupes.length} tài nguyên).`,
      });
    }
  }

  for (const w of library.workItems) {
    const missing = [
      w.code.trim() ? null : "mã",
      w.name.trim() ? null : "tên",
      w.unit.trim() ? null : "đơn vị tính",
    ].filter(Boolean);
    if (missing.length > 0) {
      issues.push({
        kind: "missingRequired",
        severity: "error",
        entity: "workItem",
        entityId: w.id,
        label: w.code || w.name || w.id,
        detail: `Công tác thiếu ${missing.join(", ")}.`,
      });
    }
    if (w.pricingMethod === "direct" && w.unitPrice === null) {
      issues.push({
        kind: "missingPrice",
        severity: "warning",
        entity: "workItem",
        entityId: w.id,
        label: w.code,
        detail: "Công tác chưa có đơn giá.",
      });
    }
    if (w.unitPrice === 0) {
      issues.push({
        kind: "zeroPrice",
        severity: "warning",
        entity: "workItem",
        entityId: w.id,
        label: w.code,
        detail:
          "Đơn giá bằng 0 (khác với chưa có giá) — kiểm tra lại; nếu chưa có giá hãy để trống.",
      });
    }
    const validity = validityOn(w.effectiveFrom, w.effectiveTo, today);
    if (w.unitPrice !== null && validity === "expired") {
      issues.push({
        kind: "expiredPrice",
        severity: "warning",
        entity: "workItem",
        entityId: w.id,
        label: w.code,
        detail: `Đơn giá hết hiệu lực sau ngày ${formatIsoDate(w.effectiveTo)}.`,
      });
    }
    if (w.unitPrice !== null && validity === "notYetEffective") {
      issues.push({
        kind: "notYetEffectivePrice",
        severity: "warning",
        entity: "workItem",
        entityId: w.id,
        label: w.code,
        detail: `Đơn giá chỉ có hiệu lực từ ngày ${formatIsoDate(w.effectiveFrom)}.`,
      });
    }
  }

  for (const r of library.resources) {
    const missing = [
      r.code.trim() ? null : "mã",
      r.name.trim() ? null : "tên",
      r.unit.trim() ? null : "đơn vị tính",
    ].filter(Boolean);
    if (missing.length > 0) {
      issues.push({
        kind: "missingRequired",
        severity: "error",
        entity: "resource",
        entityId: r.id,
        label: r.code || r.name || r.id,
        detail: `Tài nguyên thiếu ${missing.join(", ")}.`,
      });
    }
  }

  for (const n of library.norms) {
    if (!workItemsById.has(n.workItemId)) {
      issues.push({
        kind: "brokenNormWorkItem",
        severity: "error",
        entity: "norm",
        entityId: n.id,
        label: n.id,
        detail: "Định mức trỏ tới công tác không còn tồn tại.",
      });
    }
    if (!resourcesById.has(n.resourceId)) {
      const owner = workItemsById.get(n.workItemId);
      issues.push({
        kind: "brokenNormResource",
        severity: "error",
        entity: "norm",
        entityId: n.id,
        label: owner?.code ?? n.id,
        detail: "Định mức trỏ tới tài nguyên không còn tồn tại.",
      });
    }
  }

  for (const p of library.resourcePrices) {
    const resource = resourcesById.get(p.resourceId);
    if (!resource) {
      issues.push({
        kind: "brokenPriceResource",
        severity: "error",
        entity: "price",
        entityId: p.id,
        label: p.id,
        detail: "Giá trỏ tới tài nguyên không còn tồn tại.",
      });
      continue;
    }
    if (p.price === 0) {
      issues.push({
        kind: "zeroPrice",
        severity: "warning",
        entity: "price",
        entityId: p.id,
        label: resource.code,
        detail: `Giá của "${resource.code}" bằng 0 — kiểm tra lại.`,
      });
    }
    if (normalizeCode(p.unit) !== normalizeCode(resource.unit)) {
      issues.push({
        kind: "priceUnitMismatch",
        severity: "warning",
        entity: "price",
        entityId: p.id,
        label: resource.code,
        detail: `Đơn vị của giá (${p.unit}) khác đơn vị tài nguyên (${resource.unit}).`,
      });
    }
    if (p.status === "active" && validityOn(p.effectiveFrom, p.effectiveTo, today) === "expired") {
      issues.push({
        kind: "expiredPrice",
        severity: "warning",
        entity: "price",
        entityId: p.id,
        label: resource.code,
        detail: `Giá đang dùng của "${resource.code}" đã hết hiệu lực sau ngày ${formatIsoDate(p.effectiveTo)}.`,
      });
    }
  }

  // Tham chiếu danh mục/nhà cung cấp hỏng (chỉ xảy ra với dữ liệu sửa tay hoặc lỗi lưu trữ).
  const categoryIds = new Set(library.categories.map((c) => c.id));
  const supplierIds = new Set(library.suppliers.map((s) => s.id));
  const refs: {
    entity: "workItem" | "resource" | "price";
    id: string;
    label: string;
    categoryId?: string | null;
    supplierId?: string | null;
  }[] = [
    ...library.workItems.map((w) => ({
      entity: "workItem" as const,
      id: w.id,
      label: w.code,
      categoryId: w.categoryId,
      supplierId: w.supplierId,
    })),
    ...library.resources.map((r) => ({
      entity: "resource" as const,
      id: r.id,
      label: r.code,
      categoryId: r.categoryId,
    })),
    ...library.resourcePrices.map((p) => ({
      entity: "price" as const,
      id: p.id,
      label: resourcesById.get(p.resourceId)?.code ?? p.id,
      supplierId: p.supplierId,
    })),
  ];
  for (const ref of refs) {
    if (ref.categoryId && !categoryIds.has(ref.categoryId)) {
      issues.push({
        kind: "brokenCategory",
        severity: "warning",
        entity: ref.entity,
        entityId: ref.id,
        label: ref.label,
        detail: "Trỏ tới nhóm không còn tồn tại; hãy chọn lại nhóm.",
      });
    }
    if (ref.supplierId && !supplierIds.has(ref.supplierId)) {
      issues.push({
        kind: "brokenSupplier",
        severity: "warning",
        entity: ref.entity,
        entityId: ref.id,
        label: ref.label,
        detail: "Trỏ tới nhà cung cấp không còn tồn tại; hãy chọn lại.",
      });
    }
  }

  // Cùng tên (không phân biệt dấu, hoa thường) nhưng khác bản ghi: có khả năng trùng. Chỉ cảnh báo, không gộp.
  const sameNames = <T extends { id: string; code: string; name: string }>(
    items: readonly T[],
    entity: "workItem" | "resource",
    what: string
  ) => {
    const byName = new Map<string, T[]>();
    for (const item of items) {
      const key = normalizeForSearch(item.name);
      if (key) {
        byName.set(key, [...(byName.get(key) ?? []), item]);
      }
    }
    for (const list of byName.values()) {
      if (list.length > 1) {
        for (const item of list) {
          issues.push({
            kind: "sameName",
            severity: "warning",
            entity,
            entityId: item.id,
            label: item.code,
            detail: `${what} cùng tên "${item.name}" với mã ${list
              .filter((x) => x.id !== item.id)
              .map((x) => x.code)
              .join(", ")}: kiểm tra có bị nhập trùng không.`,
          });
        }
      }
    }
  };
  sameNames(library.workItems, "workItem", "Công tác");
  sameNames(library.resources, "resource", "Tài nguyên");

  // Nhiều giá đang dùng có thời gian hiệu lực chồng nhau: add-in không tự chọn giá nào là đúng.
  for (const r of library.resources) {
    const active = library.resourcePrices.filter(
      (p) => p.resourceId === r.id && p.status === "active"
    );
    const overlapping = active.filter((p, i) =>
      active.some((q, j) => i !== j && periodsOverlap(p, q))
    );
    if (overlapping.length > 1) {
      issues.push({
        kind: "overlappingPrices",
        severity: "warning",
        entity: "resource",
        entityId: r.id,
        label: r.code,
        detail: `Có ${overlapping.length} giá đang dùng với thời gian hiệu lực chồng nhau; hãy tự xác định giá áp dụng.`,
      });
    }
  }

  return issues;
}
