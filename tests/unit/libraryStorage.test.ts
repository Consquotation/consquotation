import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { LibraryService, uniqueCopyCode } from "../../src/application/libraryService";
import { LibrarySnapshot } from "../../src/domain/library/types";
import { WorkItemForm } from "../../src/domain/library/validation";
import {
  IndexedDbLibraryRepository,
  libraryDatabaseName,
  openLibraryDatabase,
} from "../../src/storage/indexedDbLibraryRepository";
import { LibraryStorageError } from "../../src/storage/libraryRepository";

function setup() {
  const factory = new IDBFactory();
  const repo = new IndexedDbLibraryRepository(factory, "test-lib");
  let id = 0;
  let clock = Date.UTC(2026, 9, 20);
  const service = new LibraryService(repo, {
    now: () => new Date((clock += 1000)),
    newId: () => `id-${++id}`,
  });
  return { factory, repo, service };
}

const FORM: WorkItemForm = {
  code: "BT-01",
  name: "Bê tông móng",
  group: "Móng",
  unit: "m3",
  description: "",
  unitPrice: "1500000",
  currency: "VND",
  source: "",
  effectiveFrom: "",
  effectiveTo: "",
  notes: "",
};

describe("libraryDatabaseName", () => {
  it("ghép partition key khi có", () => {
    expect(libraryDatabaseName(undefined)).toBe("consquotation-library");
    expect(libraryDatabaseName("pk")).toBe("pk:consquotation-library");
  });
});

describe("IndexedDbLibraryRepository + LibraryService", () => {
  it("thư viện mới trống — không có dữ liệu mẫu", async () => {
    const { service } = setup();
    expect(await service.load()).toEqual({ workItems: [], resources: [], resourcePrices: [], norms: [] });
  });

  it("lưu, đọc lại, sửa giữ createdAt, chặn mã trùng", async () => {
    const { service } = setup();
    let lib = await service.load();
    const created = await service.saveWorkItem(FORM, null, lib);
    expect(created.ok).toBe(true);
    lib = await service.load();
    expect(lib.workItems).toHaveLength(1);
    const item = lib.workItems[0];

    const edited = await service.saveWorkItem({ ...FORM, name: "Bê tông móng M250" }, item.id, lib);
    expect(edited.ok && edited.value.createdAt).toBe(item.createdAt);
    expect(edited.ok && edited.value.updatedAt > item.updatedAt).toBe(true);

    lib = await service.load();
    const dup = await service.saveWorkItem({ ...FORM, name: "Khác" }, null, lib);
    expect(dup.ok).toBe(false);
    expect((await service.load()).workItems).toHaveLength(1);
  });

  it("dữ liệu còn sau khi mở lại database (đóng/mở task pane)", async () => {
    const { factory, service } = setup();
    await service.saveWorkItem(FORM, null, await service.load());
    const reopened = new IndexedDbLibraryRepository(factory, "test-lib");
    expect((await reopened.loadAll()).workItems.map((w) => w.code)).toEqual(["BT-01"]);
  });

  it("sao chép công tác: mã mới không trùng, chép kèm định mức", async () => {
    const { service } = setup();
    let lib = await service.load();
    const w = await service.saveWorkItem(FORM, null, lib);
    lib = await service.load();
    const r = await service.saveResource({ code: "XM", name: "Xi măng", type: "material", unit: "kg", notes: "" }, null, lib);
    lib = await service.load();
    if (!w.ok || !r.ok) throw new Error("setup");
    await service.saveNorm(w.value.id, { resourceId: r.value.id, quantity: "350", notes: "" }, null, lib);
    lib = await service.load();

    const copy = await service.copyWorkItem(w.value.id, lib);
    expect(copy.code).toBe("BT-01 (2)");
    lib = await service.load();
    expect(lib.norms.filter((n) => n.workItemId === copy.id)).toHaveLength(1);
    const again = await service.copyWorkItem(w.value.id, lib);
    expect(again.code).toBe("BT-01 (3)");
  });

  it("xóa công tác xóa luôn định mức của nó (một giao dịch)", async () => {
    const { service } = setup();
    let lib = await service.load();
    const w = await service.saveWorkItem(FORM, null, lib);
    lib = await service.load();
    const r = await service.saveResource({ code: "XM", name: "Xi măng", type: "material", unit: "kg", notes: "" }, null, lib);
    lib = await service.load();
    if (!w.ok || !r.ok) throw new Error("setup");
    await service.saveNorm(w.value.id, { resourceId: r.value.id, quantity: "1", notes: "" }, null, lib);
    await service.deleteWorkItem(w.value.id);
    lib = await service.load();
    expect(lib.workItems).toEqual([]);
    expect(lib.norms).toEqual([]);
    expect(lib.resources).toHaveLength(1);
  });

  it("chặn xóa tài nguyên đang được định mức dùng; xóa được thì xóa kèm giá", async () => {
    const { service } = setup();
    let lib = await service.load();
    const w = await service.saveWorkItem(FORM, null, lib);
    lib = await service.load();
    const r = await service.saveResource({ code: "XM", name: "Xi măng", type: "material", unit: "kg", notes: "" }, null, lib);
    lib = await service.load();
    if (!w.ok || !r.ok) throw new Error("setup");
    await service.savePrice(r.value.id, { price: "1850", unit: "kg", currency: "VND", effectiveFrom: "", effectiveTo: "", source: "NCC", status: "active", notes: "" }, null, lib);
    lib = await service.load();
    const n = await service.saveNorm(w.value.id, { resourceId: r.value.id, quantity: "1", notes: "" }, null, lib);
    lib = await service.load();

    expect(await service.deleteResource(r.value.id, lib)).toEqual({ ok: false, reason: "inUse", normCount: 1 });
    expect((await service.load()).resources).toHaveLength(1);

    if (!n.ok) throw new Error("setup");
    await service.deleteNorm(n.value.id);
    lib = await service.load();
    expect(await service.deleteResource(r.value.id, lib)).toEqual({ ok: true });
    lib = await service.load();
    expect(lib.resources).toEqual([]);
    expect(lib.resourcePrices).toEqual([]);
  });

  it("settings lưu/đọc được", async () => {
    const { repo } = setup();
    expect(await repo.getSetting("lastBackupAt")).toBeUndefined();
    await repo.setSetting("lastBackupAt", "2026-10-20");
    expect(await repo.getSetting("lastBackupAt")).toBe("2026-10-20");
  });

  it("database của phiên bản add-in mới hơn: báo lỗi tiếng Việt, không ghi đè", async () => {
    const factory = new IDBFactory();
    // Mô phỏng phiên bản tương lai đã nâng schema lên 99.
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("future-lib", 99);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    await expect(openLibraryDatabase(factory, "future-lib")).rejects.toBeInstanceOf(LibraryStorageError);
    const repo = new IndexedDbLibraryRepository(factory, "future-lib");
    await expect(repo.loadAll()).rejects.toThrow(/phiên bản ConsQuotation mới hơn/);
  });
});

describe("uniqueCopyCode", () => {
  it("tìm hậu tố chưa dùng, không phân biệt hoa thường", () => {
    expect(uniqueCopyCode("A", [{ code: "A" }])).toBe("A (2)");
    expect(uniqueCopyCode("A", [{ code: "A" }, { code: "a (2)" }])).toBe("A (3)");
  });
});

// Đảm bảo kiểu snapshot không đổi ngoài ý muốn.
const _typecheck: LibrarySnapshot = { workItems: [], resources: [], resourcePrices: [], norms: [] };
void _typecheck;

describe("versionchange", () => {
  it("không chặn việc xóa database (mô phỏng xóa cache) khi đang có kết nối mở", async () => {
    const factory = new IDBFactory();
    const repo = new IndexedDbLibraryRepository(factory, "vc-lib");
    await repo.setSetting("x", 1);
    const deleted = await new Promise<string>((resolve) => {
      const request = factory.deleteDatabase("vc-lib");
      request.onsuccess = () => resolve("deleted");
      request.onblocked = () => resolve("blocked");
    });
    expect(deleted).toBe("deleted");
    // Chính repo cũ (kết nối đã bị đóng) tự mở lại database mới (trống), không báo lỗi.
    expect(await repo.loadAll()).toEqual({ workItems: [], resources: [], resourcePrices: [], norms: [] });
    expect(await repo.getSetting("x")).toBeUndefined();
  });
});
