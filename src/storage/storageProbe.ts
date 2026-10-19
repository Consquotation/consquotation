/**
 * Công cụ chẩn đoán lưu trữ cục bộ (spike ADR-0003).
 * Ghi một mốc thời gian vào IndexedDB riêng cho việc kiểm tra và đọc lại lần ghi trước,
 * để xác minh dữ liệu còn sau khi khởi động lại Excel hoặc mất sau khi xóa cache Office.
 * Không chạm vào dữ liệu thư viện.
 */

/* global IDBDatabase, IDBFactory, IDBRequest, IDBTransaction, StorageManager */

const PROBE_DB_BASE_NAME = "consquotation-probe";
const PROBE_STORE = "probe";
const PROBE_KEY = "lastWrite";

export interface ProbeResult {
  databaseName: string;
  previousWriteAt: string | null;
  currentWriteAt: string;
}

export interface StorageStatus {
  indexedDbAvailable: boolean;
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

/** Ghép partition key (nếu có) vào tên database theo khuyến nghị của Microsoft. */
export function probeDatabaseName(partitionKey: string | undefined): string {
  return partitionKey ? `${partitionKey}:${PROBE_DB_BASE_NAME}` : PROBE_DB_BASE_NAME;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Lỗi IndexedDB không rõ nguyên nhân."));
  });
}

function openProbeDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(PROBE_STORE)) {
      request.result.createObjectStore(PROBE_STORE);
    }
  };
  return requestToPromise(request);
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Giao dịch IndexedDB thất bại."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Giao dịch IndexedDB bị hủy."));
  });
}

export async function runStorageProbe(
  factory: IDBFactory,
  partitionKey: string | undefined,
  now: Date = new Date()
): Promise<ProbeResult> {
  const databaseName = probeDatabaseName(partitionKey);
  const db = await openProbeDatabase(factory, databaseName);
  try {
    const transaction = db.transaction(PROBE_STORE, "readwrite");
    const store = transaction.objectStore(PROBE_STORE);
    const previous = await requestToPromise(store.get(PROBE_KEY));
    const currentWriteAt = now.toISOString();
    store.put(currentWriteAt, PROBE_KEY);
    await transactionDone(transaction);
    return {
      databaseName,
      previousWriteAt: typeof previous === "string" ? previous : null,
      currentWriteAt,
    };
  } finally {
    db.close();
  }
}

export async function readStorageStatus(
  factory: IDBFactory | undefined,
  storageManager: StorageManager | undefined
): Promise<StorageStatus> {
  let persisted: boolean | null = null;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;

  if (storageManager?.persisted) {
    persisted = await storageManager.persisted().catch(() => null);
  }
  if (storageManager?.estimate) {
    const estimate = await storageManager.estimate().catch(() => undefined);
    usageBytes = estimate?.usage ?? null;
    quotaBytes = estimate?.quota ?? null;
  }

  return { indexedDbAvailable: factory !== undefined, persisted, usageBytes, quotaBytes };
}
