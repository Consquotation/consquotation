/**
 * Cổng lưu trữ thư viện cá nhân (ADR-0003). Nghiệp vụ chỉ phụ thuộc interface này;
 * implementation hiện tại là IndexedDB, sau này có thể thêm backend khác mà không sửa domain.
 */

import {
  LibrarySnapshot,
  NormDefinition,
  Resource,
  ResourcePrice,
  WorkItem,
} from "../domain/library/types";

export interface LibraryRepository {
  loadAll(): Promise<LibrarySnapshot>;
  putWorkItem(item: WorkItem): Promise<void>;
  /** Xóa công tác cùng mọi định mức của nó trong một giao dịch. */
  deleteWorkItem(id: string): Promise<void>;
  putResource(resource: Resource): Promise<void>;
  /** Xóa tài nguyên cùng mọi giá của nó trong một giao dịch (nghiệp vụ phải chặn trước nếu còn định mức dùng). */
  deleteResource(id: string): Promise<void>;
  putPrice(price: ResourcePrice): Promise<void>;
  deletePrice(id: string): Promise<void>;
  putNorm(norm: NormDefinition): Promise<void>;
  deleteNorm(id: string): Promise<void>;
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting<T>(key: string, value: T): Promise<void>;
}

/** Lỗi lưu trữ đã được diễn giải sang tiếng Việt, kèm tên lỗi gốc để chẩn đoán. */
export class LibraryStorageError extends Error {
  constructor(
    message: string,
    readonly causeName: string
  ) {
    super(message);
    this.name = "LibraryStorageError";
  }
}
