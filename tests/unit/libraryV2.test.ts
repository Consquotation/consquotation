import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { LibraryService, cleanLibraryName } from "../../src/application/libraryService";
import { analyzeImport } from "../../src/domain/library/exchange/analyze";
import { parseBackupJson, toBackupJson } from "../../src/domain/library/exchange/backup";
import { parseCsv } from "../../src/domain/library/exchange/csv";
import {
  autoMap,
  datasetFromTable,
  guessKind,
  headerTexts,
  SourceTable,
} from "../../src/domain/library/exchange/source";
import {
  NONE,
  categoryUsage,
  currentPrice,
  nameLookup,
  searchResources,
  searchWorkItems,
  supplierUsage,
} from "../../src/domain/library/search";
import { traceNote } from "../../src/domain/library/toQuote";
import {
  Category,
  DEFAULT_LIBRARY_NAME,
  EMPTY_LIBRARY,
  LibrarySnapshot,
  Resource,
  ResourcePrice,
  Supplier,
  WorkItem,
  normalizeName,
} from "../../src/domain/library/types";
import {
  PriceForm,
  ResourceForm,
  WorkItemForm,
  libraryIssues,
  sameNameRecords,
  validateCategoryForm,
  validatePriceForm,
  validateSupplierForm,
  validateWorkItemForm,
} from "../../src/domain/library/validation";
import { IndexedDbLibraryRepository } from "../../src/storage/indexedDbLibraryRepository";

const T = "2026-10-26T00:00:00.000Z";

function setup(factory = new IDBFactory(), name = "lib") {
  const repo = new IndexedDbLibraryRepository(factory, name);
  let id = 0;
  let clock = Date.UTC(2026, 9, 26);
  const service = new LibraryService(repo, {
    now: () => new Date((clock += 1000)),
    newId: () => `id-${++id}`,
  });
  return { factory, repo, service };
}

const WORK: WorkItemForm = {
  code: "TH-01",
  name: "Thử bê tông",
  categoryId: "",
  unit: "m3",
  description: "",
  unitPrice: "1250000",
  currency: "VND",
  supplierId: "",
  source: "",
  effectiveFrom: "",
  effectiveTo: "",
  notes: "",
};
const RES: ResourceForm = {
  code: "TH-XM",
  name: "Thử xi măng",
  type: "material",
  categoryId: "",
  unit: "kg",
  notes: "",
};
const PRICE: PriceForm = {
  price: "1850",
  unit: "kg",
  currency: "VND",
  effectiveFrom: "",
  effectiveTo: "",
  supplierId: "",
  source: "Báo giá thử",
  status: "active",
  notes: "",
};

/** Tạo database phiên bản 1 (như bản 1.8.0) có sẵn dữ liệu, để thử nâng cấp lên v2. */
function createV1Database(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["workItems", "resources", "resourcePrices", "norms"]) {
        db.createObjectStore(store, { keyPath: "id" });
      }
      db.createObjectStore("settings", { keyPath: "key" });
      const tx = request.transaction!;
      const base = {
        unit: "m3",
        description: "",
        pricingMethod: "direct",
        unitPrice: 1,
        currency: "VND",
        source: "",
        effectiveFrom: null,
        effectiveTo: null,
        notes: "",
        createdAt: T,
        updatedAt: T,
      };
      tx.objectStore("workItems").put({ id: "w1", code: "A", name: "A", group: "Móng", ...base });
      tx.objectStore("workItems").put({
        id: "w2",
        code: "B",
        name: "B",
        group: "  móng ",
        ...base,
      });
      tx.objectStore("workItems").put({ id: "w3", code: "C", name: "C", group: "Đất", ...base });
      tx.objectStore("workItems").put({ id: "w4", code: "D", name: "D", group: "", ...base });
      tx.objectStore("resources").put({
        id: "r1",
        code: "XM",
        name: "Xi măng",
        type: "material",
        unit: "kg",
        notes: "",
        createdAt: T,
        updatedAt: T,
      });
      tx.objectStore("resourcePrices").put({
        id: "p1",
        resourceId: "r1",
        price: 10,
        unit: "kg",
        currency: "VND",
        effectiveFrom: null,
        effectiveTo: null,
        source: "NCC cũ",
        status: "active",
        notes: "",
        createdAt: T,
        updatedAt: T,
      });
      tx.objectStore("settings").put({ key: "lastBackupAt", value: T });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

describe("nâng cấp thư viện v1 → v2", () => {
  it("mỗi tên nhóm thành một danh mục (gộp khác hoa thường/khoảng trắng); không mất bản ghi nào", async () => {
    const factory = new IDBFactory();
    await createV1Database(factory, "old");
    const { repo } = setup(factory, "old");
    const lib = await repo.loadAll();
    expect(lib.categories.map((c) => c.name).sort()).toEqual(["Móng", "Đất"].sort());
    const byCode = new Map(lib.workItems.map((w) => [w.code, w]));
    const mong = lib.categories.find((c) => c.name === "Móng")!.id;
    expect(byCode.get("A")!.categoryId).toBe(mong);
    expect(byCode.get("B")!.categoryId).toBe(mong);
    expect(byCode.get("C")!.categoryId).toBe(lib.categories.find((c) => c.name === "Đất")!.id);
    expect(byCode.get("D")!.categoryId).toBeNull();
    expect(lib.workItems.every((w) => !("group" in w) && w.supplierId === null)).toBe(true);
    expect(lib.resources[0].categoryId).toBeNull();
    expect(lib.resourcePrices[0]).toMatchObject({ supplierId: null, source: "NCC cũ", price: 10 });
    expect(lib.suppliers).toEqual([]);
    expect(await repo.getSetting("lastBackupAt")).toBe(T);
  });

  it("mở lại lần nữa không tạo thêm danh mục", async () => {
    const factory = new IDBFactory();
    await createV1Database(factory, "old2");
    await setup(factory, "old2").repo.loadAll();
    const again = await setup(factory, "old2").repo.loadAll();
    expect(again.categories).toHaveLength(2);
  });
});

describe("danh mục", () => {
  it("thêm, chặn trùng tên (không phân biệt hoa thường/khoảng trắng, phân biệt dấu), đổi tên", async () => {
    const { service } = setup();
    let lib = await service.load();
    const a = await service.saveCategory({ name: " Vật  liệu ", notes: "" }, null, lib);
    expect(a.ok && a.value.name).toBe("Vật liệu");
    lib = await service.load();
    expect((await service.saveCategory({ name: "vật liệu", notes: "" }, null, lib)).ok).toBe(false);
    expect((await service.saveCategory({ name: "Vat lieu", notes: "" }, null, lib)).ok).toBe(true);
    expect((await service.saveCategory({ name: "", notes: "" }, null, lib)).ok).toBe(false);
    if (!a.ok) throw new Error();
    const renamed = await service.saveCategory(
      { name: "Vật liệu xây dựng", notes: "" },
      a.value.id,
      lib
    );
    expect(renamed.ok && renamed.value).toMatchObject({
      id: a.value.id,
      name: "Vật liệu xây dựng",
      createdAt: a.value.createdAt,
    });
  });

  it("xóa nhóm đang dùng: chuyển sang nhóm khác hoặc bỏ phân nhóm; không xóa công tác/tài nguyên", async () => {
    const { service } = setup();
    let lib = await service.load();
    const c1 = await service.saveCategory({ name: "Nhóm 1", notes: "" }, null, lib);
    lib = await service.load();
    const c2 = await service.saveCategory({ name: "Nhóm 2", notes: "" }, null, lib);
    if (!c1.ok || !c2.ok) throw new Error();
    lib = await service.load();
    await service.saveWorkItem({ ...WORK, categoryId: c1.value.id }, null, lib);
    lib = await service.load();
    await service.saveResource({ ...RES, categoryId: c1.value.id }, null, lib);
    lib = await service.load();
    expect(categoryUsage(lib).get(c1.value.id)).toEqual({ workItems: 1, resources: 1 });

    await service.deleteCategory(c1.value.id, c2.value.id, lib);
    lib = await service.load();
    expect(lib.categories.map((c) => c.id)).toEqual([c2.value.id]);
    expect(lib.workItems[0].categoryId).toBe(c2.value.id);
    expect(lib.resources[0].categoryId).toBe(c2.value.id);

    await service.deleteCategory(c2.value.id, null, lib);
    lib = await service.load();
    expect(lib.categories).toEqual([]);
    expect(lib.workItems).toHaveLength(1);
    expect(lib.workItems[0].categoryId).toBeNull();
    expect(categoryUsage(lib).get(NONE)).toEqual({ workItems: 1, resources: 1 });
  });

  it("không cho chuyển sang chính nhóm đang xóa hoặc nhóm không tồn tại", async () => {
    const { service } = setup();
    let lib = await service.load();
    const c = await service.saveCategory({ name: "X", notes: "" }, null, lib);
    if (!c.ok) throw new Error();
    lib = await service.load();
    await expect(service.deleteCategory(c.value.id, c.value.id, lib)).rejects.toThrow();
    await expect(service.deleteCategory(c.value.id, "khong-co", lib)).rejects.toThrow();
    expect((await service.load()).categories).toHaveLength(1);
  });
});

describe("nhà cung cấp", () => {
  it("thêm, chặn trùng; xóa chỉ bỏ liên kết ở công tác và giá, giữ nguồn giá", async () => {
    const { service } = setup();
    let lib = await service.load();
    const s = await service.saveSupplier(
      { name: "Công ty Thử", contactInfo: "0901 000 000", notes: "" },
      null,
      lib
    );
    if (!s.ok) throw new Error();
    lib = await service.load();
    expect(
      (await service.saveSupplier({ name: "công ty thử", contactInfo: "", notes: "" }, null, lib))
        .ok
    ).toBe(false);
    await service.saveWorkItem({ ...WORK, supplierId: s.value.id }, null, lib);
    lib = await service.load();
    const r = await service.saveResource(RES, null, lib);
    if (!r.ok) throw new Error();
    lib = await service.load();
    await service.savePrice(r.value.id, { ...PRICE, supplierId: s.value.id }, null, lib);
    lib = await service.load();
    expect(supplierUsage(lib).get(s.value.id)).toEqual({ workItems: 1, prices: 1 });

    await service.deleteSupplier(s.value.id);
    lib = await service.load();
    expect(lib.suppliers).toEqual([]);
    expect(lib.workItems[0].supplierId).toBeNull();
    expect(lib.resourcePrices[0]).toMatchObject({ supplierId: null, source: "Báo giá thử" });
  });

  it("thông tin liên hệ có giới hạn độ dài", () => {
    expect(
      validateSupplierForm({ name: "A", contactInfo: "x".repeat(501), notes: "" }, [], null).ok
    ).toBe(false);
  });
});

describe("kiểm tra dữ liệu đơn giá", () => {
  const lib = {
    workItems: [] as WorkItem[],
    categories: [] as Category[],
    suppliers: [] as Supplier[],
  };

  it("tên tiếng Việt có dấu hợp lệ; thiếu tên/đơn vị báo đúng trường", () => {
    const ok = validateWorkItemForm({ ...WORK, name: "Trồng cây Sao đen, bầu đất Ø40" }, lib, null);
    expect(ok.ok && ok.value.name).toBe("Trồng cây Sao đen, bầu đất Ø40");
    const bad = validateWorkItemForm({ ...WORK, name: " ", unit: "" }, lib, null);
    expect(!bad.ok && bad.errors.map((e) => e.field)).toEqual(["name", "unit"]);
  });

  it("đơn giá 0 được lưu (kiểm tra thư viện cảnh báo), đơn giá âm và chữ bị từ chối", () => {
    expect(validatePriceForm({ ...PRICE, price: "0" }, []).ok).toBe(true);
    expect(validatePriceForm({ ...PRICE, price: "-1" }, []).ok).toBe(false);
    expect(validatePriceForm({ ...PRICE, price: "1.250.000 VNĐ" }, []).ok).toBe(false);
    expect(validatePriceForm({ ...PRICE, price: "abc" }, []).ok).toBe(false);
  });

  it("ngày áp dụng không hợp lệ bị từ chối", () => {
    expect(validatePriceForm({ ...PRICE, effectiveFrom: "2026-02-30" }, []).ok).toBe(false);
    expect(validateWorkItemForm({ ...WORK, effectiveFrom: "31/12/2026" }, lib, null).ok).toBe(
      false
    );
  });

  it("nhóm hoặc nhà cung cấp không tồn tại bị từ chối", () => {
    const r = validateWorkItemForm(
      { ...WORK, categoryId: "khong-co", supplierId: "khong-co" },
      lib,
      null
    );
    expect(!r.ok && r.errors.map((e) => e.field).sort()).toEqual(["categoryId", "supplierId"]);
    expect(validatePriceForm({ ...PRICE, supplierId: "khong-co" }, []).ok).toBe(false);
  });

  it("hai bản ghi cùng tên khác mã: được lưu, chỉ cảnh báo có khả năng trùng", () => {
    const existing: WorkItem[] = [{ ...EMPTY_ITEM, id: "a", code: "A-1", name: "Thử Bê Tông" }];
    expect(
      validateWorkItemForm({ ...WORK, code: "A-2" }, { ...lib, workItems: existing }, null).ok
    ).toBe(true);
    expect(sameNameRecords("thu be tong", existing, null).map((x) => x.code)).toEqual(["A-1"]);
    expect(sameNameRecords("thu be tong", existing, "a")).toEqual([]);
    const issues = libraryIssues(
      { ...EMPTY_LIBRARY, workItems: [...existing, { ...existing[0], id: "b", code: "A-2" }] },
      "2026-10-26"
    );
    expect(issues.filter((i) => i.kind === "sameName")).toHaveLength(2);
  });

  it("tên nhóm chuẩn hóa giữ dấu", () => {
    expect(normalizeName("  Cát   Vàng ")).toBe("cát vàng");
    expect(normalizeName("Cát")).not.toBe(normalizeName("Cạt"));
    expect(validateCategoryForm({ name: "x".repeat(121), notes: "" }, [], null).ok).toBe(false);
  });

  it("tham chiếu nhóm/nhà cung cấp hỏng được báo trong Kiểm tra thư viện", () => {
    const issues = libraryIssues(
      {
        ...EMPTY_LIBRARY,
        workItems: [
          { ...EMPTY_ITEM, id: "w", code: "W", name: "Thử", categoryId: "mat", supplierId: "mat" },
        ],
      },
      "2026-10-26"
    );
    expect(issues.map((i) => i.kind).sort()).toEqual(["brokenCategory", "brokenSupplier"]);
  });
});

const EMPTY_ITEM: WorkItem = {
  id: "",
  code: "",
  name: "",
  categoryId: null,
  unit: "m3",
  description: "",
  pricingMethod: "direct",
  unitPrice: 100,
  currency: "VND",
  supplierId: null,
  source: "",
  effectiveFrom: null,
  effectiveTo: null,
  notes: "",
  createdAt: T,
  updatedAt: T,
};
const res = (id: string, code: string, extra: Partial<Resource> = {}): Resource => ({
  id,
  code,
  name: code,
  type: "material",
  categoryId: null,
  unit: "kg",
  notes: "",
  createdAt: T,
  updatedAt: T,
  ...extra,
});
const price = (
  id: string,
  resourceId: string,
  value: number,
  extra: Partial<ResourcePrice> = {}
): ResourcePrice => ({
  id,
  resourceId,
  price: value,
  unit: "kg",
  currency: "VND",
  effectiveFrom: null,
  effectiveTo: null,
  supplierId: null,
  source: "",
  status: "active",
  notes: "",
  createdAt: T,
  updatedAt: T,
  ...extra,
});

describe("tìm kiếm, lọc, sắp xếp", () => {
  const items: WorkItem[] = [
    {
      ...EMPTY_ITEM,
      id: "1",
      code: "B-2",
      name: "Cây Sao đen",
      categoryId: "c",
      supplierId: "s",
      unitPrice: 300,
    },
    { ...EMPTY_ITEM, id: "2", code: "B-10", name: "Bê tông", categoryId: null, unitPrice: null },
    { ...EMPTY_ITEM, id: "3", code: "A-1", name: "Đá 1x2", categoryId: "c", unitPrice: 50 },
  ];

  it("lọc chưa phân nhóm, theo nhà cung cấp; tìm theo tên nhà cung cấp", () => {
    const lookup = nameLookup({
      categories: [],
      suppliers: [
        { id: "s", name: "Vườn ươm Thử", contactInfo: "", notes: "", createdAt: T, updatedAt: T },
      ],
    });
    expect(searchWorkItems(items, { categoryId: NONE }).map((i) => i.id)).toEqual(["2"]);
    expect(searchWorkItems(items, { supplierId: "s" }).map((i) => i.id)).toEqual(["1"]);
    expect(searchWorkItems(items, { supplierId: NONE }).map((i) => i.id)).toEqual(["3", "2"]);
    expect(searchWorkItems(items, { query: "vuon uom" }, lookup).map((i) => i.id)).toEqual(["1"]);
  });

  it("sắp theo mã (số tự nhiên), tên, giá (chưa có giá ở cuối)", () => {
    expect(searchWorkItems(items, { sort: "code" }).map((i) => i.code)).toEqual([
      "A-1",
      "B-2",
      "B-10",
    ]);
    expect(searchWorkItems(items, { sort: "name" }).map((i) => i.id)).toEqual(["2", "1", "3"]);
    expect(searchWorkItems(items, { sort: "price" }).map((i) => i.id)).toEqual(["3", "1", "2"]);
  });

  it("tài nguyên: lọc loại và nhà cung cấp của giá; giá hiện hành chỉ khi có đúng một giá còn hiệu lực", () => {
    const resources = [res("r1", "R1"), res("r2", "R2", { type: "labor" }), res("r3", "R3")];
    const prices = [
      price("p1", "r1", 100, { supplierId: "s" }),
      price("p2", "r3", 5),
      price("p3", "r3", 7, { effectiveFrom: "2026-01-01" }),
      price("p4", "r2", 1, { status: "inactive" }),
    ];
    expect(searchResources(resources, prices, { type: "labor" }).map((r) => r.id)).toEqual(["r2"]);
    expect(searchResources(resources, prices, { supplierId: "s" }).map((r) => r.id)).toEqual([
      "r1",
    ]);
    expect(currentPrice("r1", prices, "2026-10-26")).toMatchObject({
      activeCount: 1,
      price: { id: "p1" },
    });
    expect(currentPrice("r3", prices, "2026-10-26")).toEqual({ price: null, activeCount: 2 });
    expect(currentPrice("r2", prices, "2026-10-26")).toEqual({ price: null, activeCount: 0 });
    expect(
      searchResources(resources, prices, { sort: "price" }, undefined, "2026-10-26").map(
        (r) => r.id
      )
    ).toEqual(["r1", "r2", "r3"]);
  });
});

function csvDataset(text: string) {
  const table: SourceTable = {
    label: "File thử",
    firstRowNumber: 1,
    firstColumnIndex: 0,
    rows: parseCsv(text).map((row) => row.map((value) => ({ value: value === "" ? null : value }))),
  };
  const kind = guessKind(headerTexts(table, 0));
  if (!kind) throw new Error("không nhận ra loại");
  return datasetFromTable(table, 0, kind, autoMap(kind, headerTexts(table, 0)));
}

describe("nhập dữ liệu có cột Nhóm / Nhà cung cấp", () => {
  const run = (
    text: string,
    library: LibrarySnapshot = EMPTY_LIBRARY,
    mode: "skip" | "update" = "skip"
  ) => {
    let n = 0;
    return analyzeImport([csvDataset(text)], library, { mode, now: T, newId: () => `n${++n}` });
  };

  it("tạo nhóm/nhà cung cấp chưa có, chỉ cho dòng hợp lệ; gộp tên khác hoa thường", () => {
    const a = run(
      "Mã công tác,Tên công tác,Nhóm,Đơn vị tính,Nhà cung cấp\nT1,Thử 1,Cây xanh,cây,NCC Thử\nT2,Thử 2,cây  xanh,cây,\nT3,,Nhóm từ dòng lỗi,cây,NCC lỗi\n"
    );
    expect(a.summaries[0]).toMatchObject({ added: 2, errors: 1 });
    expect(a.createdFromReferences).toEqual({ categories: ["Cây xanh"], suppliers: ["NCC Thử"], norms: [] });
    expect(a.changes.workItems.map((w) => w.categoryId)).toEqual([
      a.changes.categories[0].id,
      a.changes.categories[0].id,
    ]);
    expect(a.changes.workItems[1].supplierId).toBeNull();
  });

  it("dòng trùng bị bỏ qua không tạo nhóm mới", () => {
    const lib: LibrarySnapshot = {
      ...EMPTY_LIBRARY,
      workItems: [{ ...EMPTY_ITEM, id: "w", code: "T1", name: "Cũ" }],
    };
    const a = run("Mã công tác,Tên công tác,Nhóm,Đơn vị tính\nT1,Mới,Nhóm mới,m3\n", lib, "skip");
    expect(a.summaries[0]).toMatchObject({ duplicates: 1, added: 0 });
    expect(a.changes.categories).toEqual([]);
  });

  it("nhóm đã có được dùng lại; cập nhật chỉ đổi cột có trong file", () => {
    const cat: Category = { id: "c", name: "Móng", notes: "", createdAt: T, updatedAt: T };
    const lib: LibrarySnapshot = {
      ...EMPTY_LIBRARY,
      categories: [cat],
      workItems: [{ ...EMPTY_ITEM, id: "w", code: "T1", name: "Cũ", supplierId: "s" }],
    };
    const a = run("Mã công tác,Tên công tác,Nhóm,Đơn vị tính\nT1,Mới,móng,m3\n", lib, "update");
    expect(a.changes.categories).toEqual([]);
    expect(a.changes.workItems[0]).toMatchObject({
      id: "w",
      name: "Mới",
      categoryId: "c",
      supplierId: "s",
    });
  });

  it("nhập danh sách nhóm và nhà cung cấp; trùng trong file báo lỗi", () => {
    const cats = run("Tên nhóm,Ghi chú\nVật liệu,\nvật liệu,\nNhân công,thử\n");
    expect(cats.summaries[0]).toMatchObject({ kind: "categories", added: 2, errors: 1 });
    const sups = run("Tên nhà cung cấp,Liên hệ\nNCC Thử,0901\n");
    expect(sups.changes.suppliers[0]).toMatchObject({ name: "NCC Thử", contactInfo: "0901" });
  });
});

describe("sao lưu JSON v1 vẫn khôi phục được", () => {
  it("nhóm dạng chữ của v1 thành danh mục", () => {
    const v1 = JSON.stringify({
      format: "consquotation-library",
      schemaVersion: 1,
      data: {
        workItems: [
          {
            id: "w",
            code: "A",
            name: "A",
            group: "Móng",
            unit: "m3",
            unitPrice: 1,
            currency: "VND",
            createdAt: T,
            updatedAt: T,
          },
        ],
      },
    });
    const parsed = parseBackupJson(v1);
    if (!parsed.ok) throw new Error(parsed.message);
    const a = analyzeImport(parsed.datasets, EMPTY_LIBRARY, {
      mode: "skip",
      now: T,
      newId: () => "c-new",
    });
    expect(a.issues).toEqual([]);
    expect(a.changes.categories.map((c) => c.name)).toEqual(["Móng"]);
    expect(a.changes.workItems[0]).toMatchObject({
      id: "w",
      categoryId: "c-new",
      supplierId: null,
    });
  });

  it("v2: id nhóm không có trong file bị báo lỗi theo bản ghi", () => {
    const v2 = JSON.stringify({
      format: "consquotation-library",
      schemaVersion: 2,
      data: {
        categories: [],
        workItems: [{ id: "w", code: "A", name: "A", categoryId: "mat", unit: "m3" }],
      },
    });
    const parsed = parseBackupJson(v2);
    if (!parsed.ok) throw new Error();
    const a = analyzeImport(parsed.datasets, EMPTY_LIBRARY, {
      mode: "skip",
      now: T,
      newId: () => "x",
    });
    expect(a.issues.map((i) => i.message)).toContain(
      'Tham chiếu nhóm id "mat" không có trong file.'
    );
  });

  it("khôi phục vào thư viện đã có nhóm cùng tên: dùng lại nhóm đó, không nhân đôi", () => {
    const fileLib: LibrarySnapshot = {
      ...EMPTY_LIBRARY,
      categories: [{ id: "c-file", name: "Móng", notes: "", createdAt: T, updatedAt: T }],
      workItems: [{ ...EMPTY_ITEM, id: "w-file", code: "A", name: "A", categoryId: "c-file" }],
    };
    const parsed = parseBackupJson(
      toBackupJson(fileLib, { exportedAt: T, appVersion: "x", libraryName: "Thử" })
    );
    if (!parsed.ok) throw new Error();
    const current: LibrarySnapshot = {
      ...EMPTY_LIBRARY,
      categories: [{ id: "c-here", name: "móng", notes: "", createdAt: T, updatedAt: T }],
    };
    const a = analyzeImport(parsed.datasets, current, { mode: "skip", now: T, newId: () => "x" });
    expect(a.changes.categories).toEqual([]);
    expect(a.changes.workItems[0].categoryId).toBe("c-here");
  });
});

describe("tên thư viện và độ bền", () => {
  it("tên mặc định, chuẩn hóa, giới hạn độ dài", () => {
    expect(cleanLibraryName("   ")).toBe(DEFAULT_LIBRARY_NAME);
    expect(cleanLibraryName("  Thư  viện   Cty A ")).toBe("Thư viện Cty A");
    expect(cleanLibraryName("x".repeat(200))).toHaveLength(80);
  });

  it("dữ liệu còn nguyên khi mở lại (mô phỏng đóng/mở task pane)", async () => {
    const factory = new IDBFactory();
    const first = setup(factory, "persist");
    let lib = await first.service.load();
    const c = await first.service.saveCategory({ name: "Thử", notes: "" }, null, lib);
    if (!c.ok) throw new Error();
    lib = await first.service.load();
    await first.service.saveWorkItem({ ...WORK, categoryId: c.value.id }, null, lib);
    await first.service.setLibraryName("Thư viện Thử");
    const reopened = setup(factory, "persist");
    const again = await reopened.service.load();
    expect(again.workItems[0].categoryId).toBe(c.value.id);
    expect(await reopened.service.libraryName()).toBe("Thư viện Thử");
  });

  it("ghi chú truy vết có nhà cung cấp", () => {
    const lookup = nameLookup({
      categories: [],
      suppliers: [
        { id: "s", name: "NCC Thử", contactInfo: "", notes: "", createdAt: T, updatedAt: T },
      ],
    });
    expect(traceNote({ ...EMPTY_ITEM, code: "X", supplierId: "s", source: "BG 01" }, lookup)).toBe(
      "Thư viện: X; nhà cung cấp: NCC Thử; nguồn giá: BG 01; tiền tệ: VND"
    );
  });
});

// Kiểu chung, tránh import không dùng khi đổi test.
void validateWorkItemForm;
