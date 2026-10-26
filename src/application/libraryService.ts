/**
 * Use case quản lý thư viện cá nhân (prompts/08). Kiểm tra dữ liệu trước khi lưu,
 * giữ ràng buộc giữa các bản ghi, không tự bịa dữ liệu.
 */

import {
  normalizeCode,
  validateCategoryForm,
  validateNormForm,
  validatePriceForm,
  validateResourceForm,
  validateSupplierForm,
  validateWorkItemForm,
} from "../domain/library/validation";
import type {
  CategoryField,
  CategoryForm,
  FieldError,
  NormField,
  NormForm,
  PriceField,
  PriceForm,
  ResourceField,
  ResourceForm,
  SupplierField,
  SupplierForm,
  WorkItemField,
  WorkItemForm,
} from "../domain/library/validation";
import {
  Category,
  DEFAULT_LIBRARY_NAME,
  LIBRARY_NAME_MAX,
  LibrarySnapshot,
  NormDefinition,
  Resource,
  ResourcePrice,
  Supplier,
  WorkItem,
} from "../domain/library/types";
import { LibraryRepository } from "../storage/libraryRepository";
import {
  DuplicateMode,
  ImportAnalysis,
  ImportChanges,
  analyzeImport,
} from "../domain/library/exchange/analyze";
import { ImportDataset } from "../domain/library/exchange/source";

export interface LibraryDeps {
  now: () => Date;
  newId: () => string;
}

export type SaveResult<T, F extends string> =
  { ok: true; value: T } | { ok: false; errors: FieldError<F>[] };

/** Mốc sao lưu (ADR-0003): nhắc người dùng khi thư viện thay đổi sau lần sao lưu gần nhất. */
export interface BackupStatus {
  lastBackupAt: string | null;
  lastChangedAt: string | null;
}

const LAST_BACKUP_KEY = "lastBackupAt";
const LAST_CHANGED_KEY = "lastChangedAt";
const LIBRARY_NAME_KEY = "libraryName";

/** Tên thư viện hợp lệ: bỏ khoảng trắng thừa, tối đa LIBRARY_NAME_MAX ký tự; trống → tên mặc định. */
export function cleanLibraryName(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim().slice(0, LIBRARY_NAME_MAX).trim();
  return cleaned === "" ? DEFAULT_LIBRARY_NAME : cleaned;
}

export type DeleteResourceResult = { ok: true } | { ok: false; reason: "inUse"; normCount: number };

/** "BT-01" → "BT-01 (2)", "BT-01 (3)"… sao cho không trùng mã nào trong thư viện. */
export function uniqueCopyCode(code: string, existing: readonly { code: string }[]): string {
  const taken = new Set(existing.map((e) => normalizeCode(e.code)));
  for (let n = 2; ; n++) {
    const candidate = `${code} (${n})`;
    if (!taken.has(normalizeCode(candidate))) {
      return candidate;
    }
  }
}

export class LibraryService {
  constructor(
    private readonly repo: LibraryRepository,
    private readonly deps: LibraryDeps
  ) {}

  load(): Promise<LibrarySnapshot> {
    return this.repo.loadAll();
  }

  private stamp(): string {
    return this.deps.now().toISOString();
  }

  /** Ghi mốc "thư viện vừa thay đổi". Lỗi ở đây không làm hỏng thao tác chính đã lưu. */
  private async touch(): Promise<void> {
    try {
      await this.repo.setSetting(LAST_CHANGED_KEY, this.stamp());
    } catch {
      /* chỉ ảnh hưởng lời nhắc sao lưu */
    }
  }

  async libraryName(): Promise<string> {
    return cleanLibraryName((await this.repo.getSetting<string>(LIBRARY_NAME_KEY)) ?? "");
  }

  async setLibraryName(name: string): Promise<string> {
    const cleaned = cleanLibraryName(name);
    await this.repo.setSetting(LIBRARY_NAME_KEY, cleaned);
    await this.touch();
    return cleaned;
  }

  async backupStatus(): Promise<BackupStatus> {
    const [lastBackupAt, lastChangedAt] = await Promise.all([
      this.repo.getSetting<string>(LAST_BACKUP_KEY),
      this.repo.getSetting<string>(LAST_CHANGED_KEY),
    ]);
    return { lastBackupAt: lastBackupAt ?? null, lastChangedAt: lastChangedAt ?? null };
  }

  /** Gọi sau khi file sao lưu đã được tạo (tải về). */
  async recordBackup(at: Date): Promise<void> {
    await this.repo.setSetting(LAST_BACKUP_KEY, at.toISOString());
  }

  analyzeImport(
    datasets: readonly ImportDataset[],
    library: LibrarySnapshot,
    mode: DuplicateMode
  ): ImportAnalysis {
    return analyzeImport(datasets, library, { mode, now: this.stamp(), newId: this.deps.newId });
  }

  /** Ghi kết quả nhập trong một giao dịch: lỗi thì thư viện giữ nguyên. */
  async applyImport(changes: ImportChanges): Promise<void> {
    await this.repo.applyImport(changes);
    await this.touch();
  }

  async saveWorkItem(
    form: WorkItemForm,
    editingId: string | null,
    library: LibrarySnapshot
  ): Promise<SaveResult<WorkItem, WorkItemField>> {
    const result = validateWorkItemForm(form, library, editingId);
    if (!result.ok) {
      return result;
    }
    const existing = editingId ? library.workItems.find((w) => w.id === editingId) : undefined;
    const now = this.stamp();
    const item: WorkItem = {
      ...result.value,
      // Giữ phương pháp định giá đã có (ví dụ "composition" do phần định giá đặt) khi sửa.
      pricingMethod: existing?.pricingMethod ?? result.value.pricingMethod,
      id: existing?.id ?? this.deps.newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putWorkItem(item);
    await this.touch();
    return { ok: true, value: item };
  }

  /** Sao chép công tác (kèm định mức) với mã mới không trùng. */
  async copyWorkItem(id: string, library: LibrarySnapshot): Promise<WorkItem> {
    const source = library.workItems.find((w) => w.id === id);
    if (!source) {
      throw new Error("Công tác không còn tồn tại.");
    }
    const now = this.stamp();
    const copy: WorkItem = {
      ...source,
      id: this.deps.newId(),
      code: uniqueCopyCode(source.code, library.workItems),
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.putWorkItem(copy);
    for (const norm of library.norms.filter((n) => n.workItemId === id)) {
      await this.repo.putNorm({
        ...norm,
        id: this.deps.newId(),
        workItemId: copy.id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await this.touch();
    return copy;
  }

  async deleteWorkItem(id: string): Promise<void> {
    await this.repo.deleteWorkItem(id);
    await this.touch();
  }

  async saveResource(
    form: ResourceForm,
    editingId: string | null,
    library: LibrarySnapshot
  ): Promise<SaveResult<Resource, ResourceField>> {
    const result = validateResourceForm(form, library, editingId);
    if (!result.ok) {
      return result;
    }
    const existing = editingId ? library.resources.find((r) => r.id === editingId) : undefined;
    const now = this.stamp();
    const resource: Resource = {
      ...result.value,
      id: existing?.id ?? this.deps.newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putResource(resource);
    await this.touch();
    return { ok: true, value: resource };
  }

  /** Chặn xóa tài nguyên đang được định mức sử dụng; giá của tài nguyên được xóa cùng. */
  async deleteResource(id: string, library: LibrarySnapshot): Promise<DeleteResourceResult> {
    const normCount = library.norms.filter((n) => n.resourceId === id).length;
    if (normCount > 0) {
      return { ok: false, reason: "inUse", normCount };
    }
    await this.repo.deleteResource(id);
    await this.touch();
    return { ok: true };
  }

  async savePrice(
    resourceId: string,
    form: PriceForm,
    editingId: string | null,
    library: LibrarySnapshot
  ): Promise<SaveResult<ResourcePrice, PriceField>> {
    if (!library.resources.some((r) => r.id === resourceId)) {
      throw new Error("Tài nguyên không còn tồn tại.");
    }
    const result = validatePriceForm(form, library.suppliers);
    if (!result.ok) {
      return result;
    }
    const existing = editingId ? library.resourcePrices.find((p) => p.id === editingId) : undefined;
    const now = this.stamp();
    const price: ResourcePrice = {
      ...result.value,
      id: existing?.id ?? this.deps.newId(),
      resourceId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putPrice(price);
    await this.touch();
    return { ok: true, value: price };
  }

  async deletePrice(id: string): Promise<void> {
    await this.repo.deletePrice(id);
    await this.touch();
  }

  async saveNorm(
    workItemId: string,
    form: NormForm,
    editingId: string | null,
    library: LibrarySnapshot
  ): Promise<SaveResult<NormDefinition, NormField>> {
    if (!library.workItems.some((w) => w.id === workItemId)) {
      throw new Error("Công tác không còn tồn tại.");
    }
    const result = validateNormForm(form, workItemId, library, editingId);
    if (!result.ok) {
      return result;
    }
    const existing = editingId ? library.norms.find((n) => n.id === editingId) : undefined;
    const now = this.stamp();
    const norm: NormDefinition = {
      ...result.value,
      id: existing?.id ?? this.deps.newId(),
      workItemId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putNorm(norm);
    await this.touch();
    return { ok: true, value: norm };
  }

  async deleteNorm(id: string): Promise<void> {
    await this.repo.deleteNorm(id);
    await this.touch();
  }

  // ---------- Danh mục ----------

  async saveCategory(
    form: CategoryForm,
    editingId: string | null,
    library: LibrarySnapshot
  ): Promise<SaveResult<Category, CategoryField>> {
    const result = validateCategoryForm(form, library.categories, editingId);
    if (!result.ok) {
      return result;
    }
    const existing = editingId ? library.categories.find((c) => c.id === editingId) : undefined;
    if (editingId && !existing) {
      throw new Error("Nhóm không còn tồn tại.");
    }
    const now = this.stamp();
    const category: Category = {
      ...result.value,
      id: existing?.id ?? this.deps.newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putCategory(category);
    await this.touch();
    return { ok: true, value: category };
  }

  /**
   * Xóa danh mục. Công tác/tài nguyên của nó KHÔNG bị xóa: chuyển sang `reassignTo`
   * hoặc bỏ phân nhóm (null), trong cùng một giao dịch.
   */
  async deleteCategory(
    id: string,
    reassignTo: string | null,
    library: LibrarySnapshot
  ): Promise<void> {
    if (reassignTo === id) {
      throw new Error("Không thể chuyển sang chính nhóm đang xóa.");
    }
    if (reassignTo !== null && !library.categories.some((c) => c.id === reassignTo)) {
      throw new Error("Nhóm đích không còn tồn tại.");
    }
    await this.repo.deleteCategory(id, reassignTo, this.stamp());
    await this.touch();
  }

  // ---------- Nhà cung cấp ----------

  async saveSupplier(
    form: SupplierForm,
    editingId: string | null,
    library: LibrarySnapshot
  ): Promise<SaveResult<Supplier, SupplierField>> {
    const result = validateSupplierForm(form, library.suppliers, editingId);
    if (!result.ok) {
      return result;
    }
    const existing = editingId ? library.suppliers.find((s) => s.id === editingId) : undefined;
    if (editingId && !existing) {
      throw new Error("Nhà cung cấp không còn tồn tại.");
    }
    const now = this.stamp();
    const supplier: Supplier = {
      ...result.value,
      id: existing?.id ?? this.deps.newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putSupplier(supplier);
    await this.touch();
    return { ok: true, value: supplier };
  }

  /** Xóa nhà cung cấp; công tác/giá đang trỏ tới nó chỉ bị bỏ liên kết, không bị xóa. */
  async deleteSupplier(id: string): Promise<void> {
    await this.repo.deleteSupplier(id, this.stamp());
    await this.touch();
  }
}
