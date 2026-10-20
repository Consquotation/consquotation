/**
 * Use case quản lý thư viện cá nhân (prompts/08). Kiểm tra dữ liệu trước khi lưu,
 * giữ ràng buộc giữa các bản ghi, không tự bịa dữ liệu.
 */

import {
  normalizeCode,
  validateNormForm,
  validatePriceForm,
  validateResourceForm,
  validateWorkItemForm,
} from "../domain/library/validation";
import type {
  FieldError,
  NormField,
  NormForm,
  PriceField,
  PriceForm,
  ResourceField,
  ResourceForm,
  WorkItemField,
  WorkItemForm,
} from "../domain/library/validation";
import {
  LibrarySnapshot,
  NormDefinition,
  Resource,
  ResourcePrice,
  WorkItem,
} from "../domain/library/types";
import { LibraryRepository } from "../storage/libraryRepository";

export interface LibraryDeps {
  now: () => Date;
  newId: () => string;
}

export type SaveResult<T, F extends string> =
  { ok: true; value: T } | { ok: false; errors: FieldError<F>[] };

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

  async saveWorkItem(
    form: WorkItemForm,
    editingId: string | null,
    library: LibrarySnapshot
  ): Promise<SaveResult<WorkItem, WorkItemField>> {
    const result = validateWorkItemForm(form, library.workItems, editingId);
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
    return copy;
  }

  deleteWorkItem(id: string): Promise<void> {
    return this.repo.deleteWorkItem(id);
  }

  async saveResource(
    form: ResourceForm,
    editingId: string | null,
    library: LibrarySnapshot
  ): Promise<SaveResult<Resource, ResourceField>> {
    const result = validateResourceForm(form, library.resources, editingId);
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
    return { ok: true, value: resource };
  }

  /** Chặn xóa tài nguyên đang được định mức sử dụng; giá của tài nguyên được xóa cùng. */
  async deleteResource(id: string, library: LibrarySnapshot): Promise<DeleteResourceResult> {
    const normCount = library.norms.filter((n) => n.resourceId === id).length;
    if (normCount > 0) {
      return { ok: false, reason: "inUse", normCount };
    }
    await this.repo.deleteResource(id);
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
    const result = validatePriceForm(form);
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
    return { ok: true, value: price };
  }

  deletePrice(id: string): Promise<void> {
    return this.repo.deletePrice(id);
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
    return { ok: true, value: norm };
  }

  deleteNorm(id: string): Promise<void> {
    return this.repo.deleteNorm(id);
  }
}
