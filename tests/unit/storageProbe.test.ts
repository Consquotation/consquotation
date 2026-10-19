import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  probeDatabaseName,
  readStorageStatus,
  requestPersistence,
  runStorageProbe,
} from "../../src/storage/storageProbe";

function fakeStorageManager(options: {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}): StorageManager {
  return options as unknown as StorageManager;
}

describe("requestPersistence", () => {
  it("không gọi persist() khi đã được cấp từ trước", async () => {
    let persistCalls = 0;
    const manager = fakeStorageManager({
      persisted: async () => true,
      persist: async () => {
        persistCalls++;
        return true;
      },
    });
    await expect(requestPersistence(manager)).resolves.toBe("already");
    expect(persistCalls).toBe(0);
  });

  it("trả về granted / denied theo kết quả persist()", async () => {
    await expect(
      requestPersistence(fakeStorageManager({ persisted: async () => false, persist: async () => true }))
    ).resolves.toBe("granted");
    await expect(
      requestPersistence(fakeStorageManager({ persisted: async () => false, persist: async () => false }))
    ).resolves.toBe("denied");
  });

  it("báo unsupported khi thiếu API hoặc lời gọi lỗi", async () => {
    await expect(requestPersistence(undefined)).resolves.toBe("unsupported");
    await expect(requestPersistence(fakeStorageManager({}))).resolves.toBe("unsupported");
    await expect(
      requestPersistence(
        fakeStorageManager({
          persist: async () => {
            throw new Error("denied");
          },
        })
      )
    ).resolves.toBe("unsupported");
  });
});

describe("probeDatabaseName", () => {
  it("dùng tên gốc khi không có partition key (Excel trên Windows)", () => {
    expect(probeDatabaseName(undefined)).toBe("consquotation-probe");
  });

  it("ghép partition key vào tên database khi có (Excel trên web)", () => {
    expect(probeDatabaseName("abc123")).toBe("abc123:consquotation-probe");
  });
});

describe("runStorageProbe", () => {
  it("lần đầu chưa có lần ghi trước; lần sau đọc lại được mốc đã ghi", async () => {
    const factory = new IDBFactory();
    const first = await runStorageProbe(factory, undefined, new Date("2026-10-19T01:00:00Z"));
    expect(first.previousWriteAt).toBeNull();
    expect(first.currentWriteAt).toBe("2026-10-19T01:00:00.000Z");

    const second = await runStorageProbe(factory, undefined, new Date("2026-10-19T02:00:00Z"));
    expect(second.previousWriteAt).toBe("2026-10-19T01:00:00.000Z");
    expect(second.currentWriteAt).toBe("2026-10-19T02:00:00.000Z");
  });

  it("dữ liệu theo partition key tách biệt nhau", async () => {
    const factory = new IDBFactory();
    await runStorageProbe(factory, "partition-a", new Date("2026-10-19T01:00:00Z"));
    const other = await runStorageProbe(factory, "partition-b", new Date("2026-10-19T02:00:00Z"));
    expect(other.previousWriteAt).toBeNull();
  });
});

describe("readStorageStatus", () => {
  it("báo IndexedDB không khả dụng và trạng thái không xác định khi thiếu API", async () => {
    await expect(readStorageStatus(undefined, undefined)).resolves.toEqual({
      indexedDbAvailable: false,
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
    });
  });

  it("đọc persisted và estimate khi StorageManager có sẵn", async () => {
    const storageManager = {
      persisted: async () => true,
      estimate: async () => ({ usage: 2048, quota: 1_000_000 }),
    } as unknown as StorageManager;
    await expect(readStorageStatus(new IDBFactory(), storageManager)).resolves.toEqual({
      indexedDbAvailable: true,
      persisted: true,
      usageBytes: 2048,
      quotaBytes: 1_000_000,
    });
  });

  it("không ném lỗi khi StorageManager từ chối", async () => {
    const storageManager = {
      persisted: async () => {
        throw new Error("denied");
      },
      estimate: async () => {
        throw new Error("denied");
      },
    } as unknown as StorageManager;
    const status = await readStorageStatus(new IDBFactory(), storageManager);
    expect(status.persisted).toBeNull();
    expect(status.usageBytes).toBeNull();
  });
});
