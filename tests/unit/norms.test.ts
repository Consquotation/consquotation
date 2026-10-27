import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { LibraryService, nextNormVersion } from "../../src/application/libraryService";
import { NormForm, percentToRate, rateToPercent, validateNormForm } from "../../src/domain/library/validation";
import { buildComposition, compositionLines } from "../../src/domain/pricing/composition";
import { calculateNorm } from "../../src/domain/pricing/normCalc";
import { buildExplanationSheet } from "../../src/domain/pricing/normExplanation";
import { NO_ROUNDING } from "../../src/domain/pricing/rounding";
import { IndexedDbLibraryRepository } from "../../src/storage/indexedDbLibraryRepository";

const T = "2026-10-27T00:00:00.000Z";

function setup(factory = new IDBFactory(), name = "lib") {
  const repo = new IndexedDbLibraryRepository(factory, name);
  let id = 0;
  let clock = Date.UTC(2026, 9, 27);
  const service = new LibraryService(repo, { now: () => new Date((clock += 1000)), newId: () => `id-${++id}` });
  return { repo, service };
}

const NORM_FORM: NormForm = {
  code: "THU-DM",
  name: "Công tác thử",
  unit: "m3",
  categoryId: "",
  workItemId: "",
  version: "1",
  effectiveFrom: "",
  sourceType: "user",
  source: "",
  sourceVerified: false,
  wasteIncluded: false,
  notes: "",
};

/** Thư viện thử: 3 tài nguyên có giá (dữ liệu giả định, không phải đơn giá thực tế). */
async function seed(service: LibraryService) {
  const ids: string[] = [];
  const spec = [
    ["A", "material", "kg", "10000"],
    ["B", "labor", "công", "40000"],
    ["C", "machine", "ca", "80000"],
  ] as const;
  for (const [code, type, unit, price] of spec) {
    let lib = await service.load();
    const r = await service.saveResource({ code, name: `Thử ${code}`, type, categoryId: "", unit, notes: "" }, null, lib);
    if (!r.ok) throw new Error("resource");
    lib = await service.load();
    await service.savePrice(
      r.value.id,
      { price, unit, currency: "VND", effectiveFrom: "", effectiveTo: "", supplierId: "", source: "Thử", status: "active", notes: "" },
      null,
      lib
    );
    ids.push(r.value.id);
  }
  return ids;
}

async function createNorm(service: LibraryService, form: Partial<NormForm> = {}) {
  const saved = await service.saveNorm({ ...NORM_FORM, ...form }, null, await service.load());
  if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
  return saved.value;
}

async function addComponent(service: LibraryService, normId: string, resourceId: string, consumption: string, wastePercent = "") {
  const r = await service.saveNormComponent(normId, { resourceId, consumption, wastePercent, notes: "" }, null, await service.load());
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}

/** Database v2 như bản 1.9.0: dòng định mức gắn thẳng vào công tác. */
function createV2Database(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["workItems", "resources", "resourcePrices", "norms", "categories", "suppliers"]) {
        db.createObjectStore(store, { keyPath: "id" });
      }
      db.createObjectStore("settings", { keyPath: "key" });
      const tx = request.transaction!;
      const base = { description: "", pricingMethod: "direct", unitPrice: null, currency: "", supplierId: null, source: "", effectiveFrom: null, effectiveTo: null, notes: "", createdAt: T, updatedAt: T };
      tx.objectStore("workItems").put({ id: "w1", code: "BT-01", name: "Bê tông thử", unit: "m3", categoryId: "c1", ...base });
      tx.objectStore("categories").put({ id: "c1", name: "Móng", notes: "", createdAt: T, updatedAt: T });
      tx.objectStore("resources").put({ id: "r1", code: "XM", name: "Xi măng", type: "material", categoryId: null, unit: "kg", notes: "", createdAt: T, updatedAt: T });
      tx.objectStore("resources").put({ id: "r2", code: "NC", name: "Nhân công", type: "labor", categoryId: null, unit: "công", notes: "", createdAt: T, updatedAt: T });
      tx.objectStore("norms").put({ id: "l1", workItemId: "w1", resourceId: "r1", quantity: 230.5, notes: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: T });
      tx.objectStore("norms").put({ id: "l2", workItemId: "w1", resourceId: "r2", quantity: 1.25, notes: "ghi chú", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: T });
      tx.objectStore("norms").put({ id: "l3", workItemId: "wGone", resourceId: "r1", quantity: 2, notes: "", createdAt: T, updatedAt: T });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

describe("nâng cấp thư viện v2 → v3", () => {
  it("dòng định mức của công tác thành định mức v1 đang dùng; giữ hao phí; dòng mồ côi thành bản nháp", async () => {
    const factory = new IDBFactory();
    await createV2Database(factory, "v2");
    const { repo } = setup(factory, "v2");
    const lib = await repo.loadAll();
    expect(lib.norms).toHaveLength(2);
    const main = lib.norms.find((n) => n.workItemId === "w1")!;
    expect(main).toMatchObject({ code: "BT-01", name: "Bê tông thử", unit: "m3", categoryId: "c1", version: "1", status: "approved", sourceType: "user", sourceVerified: false, wasteIncluded: false });
    const parts = lib.normComponents.filter((c) => c.normId === main.id).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(parts.map((c) => [c.id, c.resourceCodeSnapshot, c.consumption, c.wasteRate, c.sortOrder, c.notes])).toEqual([
      ["l1", "XM", 230.5, 0, 1, ""],
      ["l2", "NC", 1.25, 0, 2, "ghi chú"],
    ]);
    const orphan = lib.norms.find((n) => n.workItemId === null)!;
    expect(orphan.status).toBe("draft");
    expect(lib.normComponents.filter((c) => c.normId === orphan.id)).toHaveLength(1);
    expect(lib.normComponents.every((c) => !("quantity" in c) && !("workItemId" in c))).toBe(true);
    // Mở lại không nhân đôi.
    const again = await setup(factory, "v2").repo.loadAll();
    expect(again.norms).toHaveLength(2);
    expect(again.normComponents).toHaveLength(3);
  });
});

describe("thư viện định mức", () => {
  it("tạo nháp; thêm thành phần; tính đúng 60.000; hao hụt 5% → 61.000", async () => {
    const { service } = setup();
    const [a, b, c] = await seed(service);
    const norm = await createNorm(service);
    expect(norm.status).toBe("draft");
    await addComponent(service, norm.id, a, "2");
    await addComponent(service, norm.id, b, "0,5");
    await addComponent(service, norm.id, c, "0,25");
    let lib = await service.load();
    const opts = { today: "2026-10-27", now: T };
    expect(calculateNorm(norm, lib.normComponents, lib, opts).unitPrice).toBe(60000);
    const first = lib.normComponents.find((x) => x.resourceId === a)!;
    await service.saveNormComponent(norm.id, { resourceId: a, consumption: "2", wastePercent: "5", notes: "" }, first.id, lib);
    lib = await service.load();
    expect(lib.normComponents.find((x) => x.id === first.id)!.wasteRate).toBe(0.05);
    expect(calculateNorm(norm, lib.normComponents, lib, opts).unitPrice).toBe(61000);
  });

  it("đang dùng: khóa thành phần và trường ảnh hưởng tính toán; sao chép thành phiên bản mới (nháp) để sửa", async () => {
    const { service } = setup();
    const [a] = await seed(service);
    const norm = await createNorm(service);
    await addComponent(service, norm.id, a, "1");
    expect(await service.setNormStatus(norm.id, "approved", await service.load())).toEqual({ ok: true });
    let lib = await service.load();
    const approved = lib.norms[0];
    // Thành phần bị khóa.
    const locked = await service.saveNormComponent(approved.id, { resourceId: a, consumption: "3", wastePercent: "", notes: "" }, lib.normComponents[0].id, lib);
    expect(locked.ok).toBe(false);
    await expect(service.deleteNormComponent(lib.normComponents[0].id, lib)).rejects.toThrow();
    await expect(service.deleteNorm(approved.id, lib)).rejects.toThrow();
    // Trường khóa: đơn vị; trường mô tả: tên vẫn sửa được.
    expect((await service.saveNorm({ ...NORM_FORM, unit: "m2" }, approved.id, lib)).ok).toBe(false);
    expect((await service.saveNorm({ ...NORM_FORM, name: "Tên mới" }, approved.id, lib)).ok).toBe(true);
    // Không quay lại nháp.
    expect((await service.setNormStatus(approved.id, "draft", lib)).ok).toBe(false);
    lib = await service.load();
    const copy = await service.copyNormAsNewVersion(approved.id, lib);
    expect(copy).toMatchObject({ code: "THU-DM", version: "2", status: "draft" });
    lib = await service.load();
    expect(lib.normComponents.filter((x) => x.normId === copy.id)).toHaveLength(1);
    // Chỉ một phiên bản đang dùng cho mỗi mã.
    const conflict = await service.setNormStatus(copy.id, "approved", lib);
    expect(conflict.ok).toBe(false);
    await service.setNormStatus(approved.id, "inactive", lib);
    expect(await service.setNormStatus(copy.id, "approved", await service.load())).toEqual({ ok: true });
  });

  it("không chuyển sang đang dùng khi định mức rỗng, tài nguyên đổi đơn vị hoặc công tác đã có định mức đang dùng", async () => {
    const { service } = setup();
    const [a] = await seed(service);
    const empty = await createNorm(service);
    expect((await service.setNormStatus(empty.id, "approved", await service.load())).ok).toBe(false);
    await addComponent(service, empty.id, a, "1");
    let lib = await service.load();
    const resource = lib.resources.find((r) => r.id === a)!;
    await service.saveResource({ code: "A", name: resource.name, type: "material", categoryId: "", unit: "tấn", notes: "" }, a, lib);
    lib = await service.load();
    const blocked = await service.setNormStatus(empty.id, "approved", lib);
    expect(blocked.ok).toBe(false);
    // Kiểm tra lại hao phí rồi cập nhật liên kết: được chuyển.
    await service.refreshComponentLink(lib.normComponents[0].id, lib);
    lib = await service.load();
    expect(lib.normComponents[0].resourceUnitSnapshot).toBe("tấn");
    expect((await service.setNormStatus(empty.id, "approved", lib)).ok).toBe(true);
  });

  it("sắp xếp thành phần; phiên bản tiếp theo; mã + phiên bản không trùng", async () => {
    const { service } = setup();
    const [a, b, c] = await seed(service);
    const norm = await createNorm(service);
    await addComponent(service, norm.id, a, "1");
    await addComponent(service, norm.id, b, "1");
    const third = await addComponent(service, norm.id, c, "1");
    await service.moveNormComponent(third.id, -1, await service.load());
    const lib = await service.load();
    const order = lib.normComponents.sort((x, y) => x.sortOrder - y.sortOrder).map((x) => x.resourceId);
    expect(order).toEqual([a, c, b]);
    expect(nextNormVersion({ code: "X", version: "2024" }, [{ code: "x", version: "2025" }, { code: "X", version: "2024" }])).toBe("2026");
    expect(nextNormVersion({ code: "X", version: "QĐ-01" }, [])).toBe("QĐ-01-2");
    expect((await service.saveNorm({ ...NORM_FORM, version: " 1 " }, null, lib)).ok).toBe(false);
  });

  it("kiểm tra form: bắt buộc; nguồn tài liệu phải ghi tên; ngày hợp lệ; hao hụt 0–100%; đã gồm hao hụt thì không nhập hao hụt", async () => {
    const lib = { norms: [], categories: [], workItems: [] };
    const bad = validateNormForm({ ...NORM_FORM, code: "", unit: "", sourceType: "document", effectiveFrom: "2026-02-30" }, lib, null);
    expect(!bad.ok && bad.errors.map((e) => e.field).sort()).toEqual(["code", "effectiveFrom", "source", "unit"]);
    const { service } = setup();
    const [a] = await seed(service);
    const included = await createNorm(service, { wasteIncluded: true });
    const r = await service.saveNormComponent(included.id, { resourceId: a, consumption: "1", wastePercent: "5", notes: "" }, null, await service.load());
    expect(!r.ok && r.errors[0].field).toBe("wastePercent");
    const plain = await createNorm(service, { code: "K" });
    const over = await service.saveNormComponent(plain.id, { resourceId: a, consumption: "1", wastePercent: "150", notes: "" }, null, await service.load());
    expect(over.ok).toBe(false);
    expect(percentToRate(3.3)).toBe(0.033);
    expect(rateToPercent(0.07)).toBe("7");
    expect(rateToPercent(0)).toBe("");
  });

  it("phân tích từ định mức cho báo giá dùng phiên bản đang dùng của công tác, hao phí đã cộng hao hụt", async () => {
    const { service } = setup();
    const [a] = await seed(service);
    let lib = await service.load();
    const w = await service.saveWorkItem(
      { code: "W-1", name: "Thử", categoryId: "", unit: "m3", description: "", unitPrice: "", currency: "VND", supplierId: "", source: "", effectiveFrom: "", effectiveTo: "", notes: "" },
      null,
      lib
    );
    if (!w.ok) throw new Error();
    const draft = await createNorm(service, { workItemId: w.value.id });
    await addComponent(service, draft.id, a, "2", "5");
    lib = await service.load();
    expect(compositionLines(w.value, lib, "2026-10-27")).toEqual([]); // bản nháp chưa dùng
    await service.setNormStatus(draft.id, "approved", lib);
    lib = await service.load();
    const lines = compositionLines(w.value, lib, "2026-10-27");
    expect(lines[0].consumption).toBe(2.1);
    const result = buildComposition(w.value, lines, { [lines[0].component.id]: lines[0].defaultPriceId! }, NO_ROUNDING);
    expect(result.preview).toBe(21000);
    expect(result.rows[0][7]).toBe(2.1);
    expect(String(result.rows[0][11])).toContain("hao hụt 5% (cơ sở 2); định mức THU-DM v1");
  });

  it("bảng diễn giải: công thức Excel cho từng dòng và tổng hợp, kèm kết quả add-in để đối chiếu", async () => {
    const { service } = setup();
    const [a, b, c] = await seed(service);
    const norm = await createNorm(service);
    await addComponent(service, norm.id, a, "2", "5");
    await addComponent(service, norm.id, b, "0,5");
    await addComponent(service, norm.id, c, "0,25");
    const lib = await service.load();
    const result = calculateNorm(norm, lib.normComponents, lib, { today: "2026-10-27", now: T });
    const sheet = buildExplanationSheet(norm, result, "2026-10-27");
    expect(sheet.sheetName).toBe("Diễn giải THU-DM v1");
    const header = sheet.rows[sheet.headerRow];
    expect(header[7]).toBe("Hao phí tính toán");
    const first = sheet.rows[sheet.headerRow + 1];
    expect(first.slice(0, 10)).toEqual([1, "Vật liệu", "A", "Thử A", "kg", 2, 0.05, "=F7*(1+G7)", 10000, "=H7*I7"]);
    const total = sheet.rows[sheet.summaryRow + sheet.summaryRows - 1];
    expect(total[9]).toBe("=SUM(J7:J9)");
    expect(total[10]).toBe(61000);
    const material = sheet.rows[sheet.summaryRow + 1];
    expect(material[9]).toBe('=SUMIF(B7:B9,"Vật liệu",J7:J9)');
    expect(material[10]).toBe(21000);
    expect(sheet.rows.every((row) => row.length === sheet.columnCount)).toBe(true);
  });
});
