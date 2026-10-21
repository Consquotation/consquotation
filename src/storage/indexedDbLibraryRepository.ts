/**
 * Thư viện cá nhân lưu trong IndexedDB của add-in (ADR-0003).
 * - Tên database ghép partition key nếu Office cấp (Excel trên web).
 * - Phiên bản schema = phiên bản IndexedDB; gặp database của phiên bản add-in mới hơn thì báo lỗi,
 *   không ghi đè.
 * - Mọi thao tác ghi nhiều store (xóa kèm phụ thuộc) chạy trong một giao dịch: lỗi thì không lưu gì.
 */

/* global IDBDatabase, IDBFactory, IDBRequest, IDBTransaction, IDBTransactionMode, DOMException */

import {
  LIBRARY_SCHEMA_VERSION,
  LibrarySnapshot,
  NormDefinition,
  Resource,
  ResourcePrice,
  WorkItem,
} from "../domain/library/types";
import { LibraryRepository, LibraryStorageError } from "./libraryRepository";

const DB_BASE_NAME = "consquotation-library";
const STORES = {
  workItems: "workItems",
  resources: "resources",
  resourcePrices: "resourcePrices",
  norms: "norms",
  settings: "settings",
} as const;
type StoreName = (typeof STORES)[keyof typeof STORES];

export function libraryDatabaseName(partitionKey: string | undefined): string {
  return partitionKey ? `${partitionKey}:${DB_BASE_NAME}` : DB_BASE_NAME;
}

function describeStorageError(error: unknown): LibraryStorageError {
  const name = (error as DOMException | null)?.name ?? "UnknownError";
  const messages: Record<string, string> = {
    VersionError:
      "Thư viện trên máy này được tạo bởi phiên bản ConsQuotation mới hơn. Hãy dùng phiên bản mới nhất; add-in không ghi đè để tránh mất dữ liệu.",
    QuotaExceededError: "Bộ nhớ cục bộ của add-in đã đầy. Hãy sao lưu và dọn bớt dữ liệu.",
    InvalidStateError: "Kết nối tới bộ nhớ cục bộ đã bị đóng. Hãy mở lại task pane.",
    UnknownError: "Không đọc/ghi được bộ nhớ cục bộ của add-in.",
  };
  return new LibraryStorageError(messages[name] ?? `Lỗi bộ nhớ cục bộ (${name}).`, name);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new DOMException("Aborted", "AbortError"));
  });
}

export function openLibraryDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, LIBRARY_SCHEMA_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      // Migration tuần tự theo phiên bản cũ; hiện chỉ có v1.
      if (event.oldVersion < 1) {
        db.createObjectStore(STORES.workItems, { keyPath: "id" });
        db.createObjectStore(STORES.resources, { keyPath: "id" });
        db.createObjectStore(STORES.resourcePrices, { keyPath: "id" });
        db.createObjectStore(STORES.norms, { keyPath: "id" });
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Nhường khi pane khác (phiên bản mới hơn) cần nâng cấp hoặc xóa database:
      // đóng kết nối thay vì chặn mãi; lần thao tác sau sẽ mở lại.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(describeStorageError(request.error));
    request.onblocked = () =>
      reject(
        new LibraryStorageError(
          "Thư viện đang được mở ở cửa sổ khác. Hãy đóng các task pane khác rồi thử lại.",
          "Blocked"
        )
      );
  });
}

export class IndexedDbLibraryRepository implements LibraryRepository {
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(
    private readonly factory: IDBFactory,
    private readonly name: string
  ) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      // (Mở lại khi kết nối cũ đã bị đóng do versionchange — xem openLibraryDatabase.)
      this.dbPromise = openLibraryDatabase(this.factory, this.name).catch((error) => {
        this.dbPromise = undefined;
        throw error;
      });
    }
    return this.dbPromise;
  }

  private async run<T>(
    stores: StoreName[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => Promise<T> | T
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        const db = await this.db();
        // transaction() ném InvalidStateError ngay nếu kết nối đã bị đóng — trước khi có thay đổi nào.
        const tx = db.transaction(stores, mode);
        const done = transactionDone(tx);
        let result: T;
        try {
          result = await work(tx);
        } catch (error) {
          // Lỗi giữa chừng: hủy giao dịch để các lệnh ghi trước đó không được lưu.
          try {
            tx.abort();
          } catch {
            /* giao dịch đã kết thúc */
          }
          done.catch(() => undefined);
          throw error;
        }
        await done;
        return result;
      } catch (error) {
        const closed = (error as DOMException | null)?.name === "InvalidStateError";
        if (closed) {
          // Kết nối đã bị đóng (versionchange): mở lại và thử lại một lần.
          this.dbPromise = undefined;
          if (attempt === 1) {
            continue;
          }
        }
        throw error instanceof LibraryStorageError ? error : describeStorageError(error);
      }
    }
  }

  async loadAll(): Promise<LibrarySnapshot> {
    return this.run(
      [STORES.workItems, STORES.resources, STORES.resourcePrices, STORES.norms],
      "readonly",
      async (tx) => {
        const [workItems, resources, resourcePrices, norms] = await Promise.all([
          requestToPromise(tx.objectStore(STORES.workItems).getAll() as IDBRequest<WorkItem[]>),
          requestToPromise(tx.objectStore(STORES.resources).getAll() as IDBRequest<Resource[]>),
          requestToPromise(
            tx.objectStore(STORES.resourcePrices).getAll() as IDBRequest<ResourcePrice[]>
          ),
          requestToPromise(tx.objectStore(STORES.norms).getAll() as IDBRequest<NormDefinition[]>),
        ]);
        return { workItems, resources, resourcePrices, norms };
      }
    );
  }

  private put(store: StoreName, value: unknown): Promise<void> {
    return this.run([store], "readwrite", (tx) => {
      tx.objectStore(store).put(value);
    });
  }

  private remove(store: StoreName, id: string): Promise<void> {
    return this.run([store], "readwrite", (tx) => {
      tx.objectStore(store).delete(id);
    });
  }

  /** Xóa bản ghi `id` ở store chính và mọi bản ghi ở store phụ có `foreignKey === id`. */
  private removeWithDependents(
    store: StoreName,
    dependentStore: StoreName,
    foreignKey: "workItemId" | "resourceId",
    id: string
  ): Promise<void> {
    return this.run([store, dependentStore], "readwrite", async (tx) => {
      const dependents = tx.objectStore(dependentStore);
      const all = (await requestToPromise(dependents.getAll())) as Array<Record<string, string>>;
      for (const record of all) {
        if (record[foreignKey] === id) {
          dependents.delete(record.id);
        }
      }
      tx.objectStore(store).delete(id);
    });
  }

  putWorkItem(item: WorkItem): Promise<void> {
    return this.put(STORES.workItems, item);
  }
  deleteWorkItem(id: string): Promise<void> {
    return this.removeWithDependents(STORES.workItems, STORES.norms, "workItemId", id);
  }
  putResource(resource: Resource): Promise<void> {
    return this.put(STORES.resources, resource);
  }
  deleteResource(id: string): Promise<void> {
    return this.removeWithDependents(STORES.resources, STORES.resourcePrices, "resourceId", id);
  }
  putPrice(price: ResourcePrice): Promise<void> {
    return this.put(STORES.resourcePrices, price);
  }
  deletePrice(id: string): Promise<void> {
    return this.remove(STORES.resourcePrices, id);
  }
  putNorm(norm: NormDefinition): Promise<void> {
    return this.put(STORES.norms, norm);
  }
  deleteNorm(id: string): Promise<void> {
    return this.remove(STORES.norms, id);
  }

  applyImport(changes: LibrarySnapshot): Promise<void> {
    return this.run(
      [STORES.workItems, STORES.resources, STORES.resourcePrices, STORES.norms],
      "readwrite",
      (tx) => {
        for (const item of changes.workItems) {
          tx.objectStore(STORES.workItems).put(item);
        }
        for (const resource of changes.resources) {
          tx.objectStore(STORES.resources).put(resource);
        }
        for (const price of changes.resourcePrices) {
          tx.objectStore(STORES.resourcePrices).put(price);
        }
        for (const norm of changes.norms) {
          tx.objectStore(STORES.norms).put(norm);
        }
      }
    );
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return this.run([STORES.settings], "readonly", async (tx) => {
      const record = (await requestToPromise(tx.objectStore(STORES.settings).get(key))) as
        { key: string; value: T } | undefined;
      return record?.value;
    });
  }

  setSetting<T>(key: string, value: T): Promise<void> {
    return this.put(STORES.settings, { key, value });
  }
}
