import { describe, expect, it } from "vitest";
import { formatIsoDate, isIsoDate, periodsOverlap, todayIso, validityOn } from "../../src/domain/library/dates";
import { nameLookup, normalizeForSearch, searchWorkItems } from "../../src/domain/library/search";
import { draftFromWorkItem, traceNote } from "../../src/domain/library/toQuote";
import { LibrarySnapshot, Norm, NormComponent, Resource, ResourcePrice, WorkItem } from "../../src/domain/library/types";
import {
  WorkItemForm,
  libraryIssues,
  normalizeCode,
  validateNormComponentForm,
  validatePriceForm,
  validateResourceForm,
  validateWorkItemForm,
} from "../../src/domain/library/validation";
import { validateWorkItemDraft } from "../../src/domain/workItemDraft";

const T = "2026-01-01T00:00:00.000Z";

function workItem(partial: Partial<WorkItem> & { id: string; code: string }): WorkItem {
  return {
    name: "Công tác",
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
    ...partial,
  };
}

function resource(partial: Partial<Resource> & { id: string; code: string }): Resource {
  return { name: "Tài nguyên", type: "material", categoryId: null, unit: "kg", notes: "", createdAt: T, updatedAt: T, ...partial };
}

function price(partial: Partial<ResourcePrice> & { id: string; resourceId: string }): ResourcePrice {
  return {
    price: 10,
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
    ...partial,
  };
}

function normSet(partial: Partial<Norm> & { id: string }): Norm {
  return {
    code: partial.id.toUpperCase(),
    name: "Định mức thử",
    unit: "m3",
    categoryId: null,
    workItemId: null,
    version: "1",
    effectiveFrom: null,
    sourceType: "user",
    source: "",
    sourceVerified: false,
    status: "draft",
    wasteIncluded: false,
    notes: "",
    createdAt: T,
    updatedAt: T,
    ...partial,
  };
}

function component(partial: Partial<NormComponent> & { id: string; normId: string; resourceId: string }): NormComponent {
  return {
    resourceCodeSnapshot: "XM",
    resourceNameSnapshot: "Tài nguyên",
    resourceUnitSnapshot: "kg",
    resourceTypeSnapshot: "material",
    consumption: 1,
    wasteRate: 0,
    priceId: null,
    sortOrder: 1,
    notes: "",
    createdAt: T,
    updatedAt: T,
    ...partial,
  };
}

const FORM: WorkItemForm = {
  code: "BT-01",
  name: "Bê tông móng",
  categoryId: "",
  unit: "m3",
  description: "",
  unitPrice: "1500000",
  currency: "VND",
  supplierId: "",
  source: "Báo giá NCC A",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  notes: "",
};

describe("dates", () => {
  it("chỉ chấp nhận ngày có thật dạng YYYY-MM-DD", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("28/02/2026")).toBe(false);
  });

  it("todayIso dùng giờ máy, không lệch múi giờ", () => {
    expect(todayIso(new Date(2026, 9, 20, 23, 59))).toBe("2026-10-20");
  });

  it("formatIsoDate hiển thị dd/mm/yyyy", () => {
    expect(formatIsoDate("2026-10-20")).toBe("20/10/2026");
    expect(formatIsoDate(null)).toBe("");
  });

  it.each([
    [null, null, "noDates"],
    ["2026-11-01", null, "notYetEffective"],
    [null, "2026-10-19", "expired"],
    ["2026-10-01", "2026-10-20", "active"],
    ["2026-10-20", "2026-10-20", "active"],
  ] as const)("validityOn(%s, %s) = %s tại 2026-10-20", (from, to, expected) => {
    expect(validityOn(from, to, "2026-10-20")).toBe(expected);
  });

  it("periodsOverlap xử lý khoảng mở", () => {
    expect(periodsOverlap({ effectiveFrom: null, effectiveTo: null }, { effectiveFrom: "2026-01-01", effectiveTo: null })).toBe(true);
    expect(
      periodsOverlap({ effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" }, { effectiveFrom: "2026-07-01", effectiveTo: null })
    ).toBe(false);
  });
});

describe("search", () => {
  const items = [
    workItem({ id: "1", code: "BT-02", name: "Bê tông lót", categoryId: "c-mong", unit: "m3" }),
    workItem({ id: "2", code: "BT-01", name: "Bê tông móng", categoryId: "c-mong", unit: "m3" }),
    workItem({ id: "3", code: "DD-01", name: "Đào đất hố móng", categoryId: "c-dat", unit: "m3" }),
    workItem({ id: "4", code: "XT-10", name: "Xây tường gạch", categoryId: "c-than", unit: "m2" }),
  ];
  const lookup = nameLookup({
    categories: [
      { id: "c-mong", name: "Móng", notes: "", createdAt: T, updatedAt: T },
      { id: "c-dat", name: "Đất", notes: "", createdAt: T, updatedAt: T },
      { id: "c-than", name: "Thân", notes: "", createdAt: T, updatedAt: T },
    ],
    suppliers: [],
  });

  it("không phân biệt dấu và hoa thường, kể cả chữ đ", () => {
    expect(normalizeForSearch("  Đào ĐẤT  ")).toBe("dao dat");
    expect(searchWorkItems(items, { query: "be tong" }).map((i) => i.code)).toEqual(["BT-01", "BT-02"]);
    expect(searchWorkItems(items, { query: "dao dat" }).map((i) => i.code)).toEqual(["DD-01"]);
  });

  it("tìm theo mã, nhóm, đơn vị; mọi từ phải khớp", () => {
    expect(searchWorkItems(items, { query: "xt-10" }).map((i) => i.code)).toEqual(["XT-10"]);
    expect(searchWorkItems(items, { query: "m2" }).map((i) => i.code)).toEqual(["XT-10"]);
    expect(searchWorkItems(items, { query: "mong lot" }, lookup).map((i) => i.code)).toEqual(["BT-02"]);
    expect(searchWorkItems(items, { query: "than" }, lookup).map((i) => i.code)).toEqual(["XT-10"]);
  });

  it("lọc theo nhóm và sắp theo mã (số tự nhiên)", () => {
    expect(searchWorkItems(items, { categoryId: "c-mong" }).map((i) => i.code)).toEqual(["BT-01", "BT-02"]);
  });
});

const NOLIB = { workItems: [] as WorkItem[], categories: [], suppliers: [] };

describe("validateWorkItemForm", () => {
  it("tạo dữ liệu hợp lệ, phương pháp giá direct", () => {
    const result = validateWorkItemForm(FORM, NOLIB, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unitPrice).toBe(1500000);
      expect(result.value.pricingMethod).toBe("direct");
    }
  });

  it("đơn giá trống là null (chưa có giá), không phải 0", () => {
    const result = validateWorkItemForm({ ...FORM, unitPrice: "" }, NOLIB, null);
    expect(result.ok && result.value.unitPrice).toBeNull();
  });

  it("bắt buộc mã, tên, đơn vị; báo đúng trường", () => {
    const result = validateWorkItemForm({ ...FORM, code: " ", name: "", unit: "" }, NOLIB, null);
    expect(!result.ok && result.errors.map((e) => e.field)).toEqual(["code", "name", "unit"]);
  });

  it("chặn mã trùng (không phân biệt hoa thường, khoảng trắng), nhưng cho sửa chính nó", () => {
    const existing = [workItem({ id: "x", code: "bt-01 " })];
    expect(validateWorkItemForm(FORM, { ...NOLIB, workItems: existing }, null).ok).toBe(false);
    expect(validateWorkItemForm(FORM, { ...NOLIB, workItems: existing }, "x").ok).toBe(true);
    expect(normalizeCode(" BT-01 ")).toBe("bt-01");
  });

  it("kiểm tra ngày hiệu lực và tiền tệ khi có giá", () => {
    const bad = validateWorkItemForm({ ...FORM, effectiveFrom: "2026-12-31", effectiveTo: "2026-01-01", currency: "" }, NOLIB, null);
    expect(!bad.ok && bad.errors.map((e) => e.field).sort()).toEqual(["currency", "effectiveTo"]);
    const badDate = validateWorkItemForm({ ...FORM, effectiveFrom: "2026-02-30" }, NOLIB, null);
    expect(!badDate.ok && badDate.errors[0].field).toBe("effectiveFrom");
  });

  it("từ chối đơn giá âm hoặc có dấu phân cách hàng nghìn mơ hồ", () => {
    expect(validateWorkItemForm({ ...FORM, unitPrice: "-1" }, NOLIB, null).ok).toBe(false);
    expect(validateWorkItemForm({ ...FORM, unitPrice: "1.500.000" }, NOLIB, null).ok).toBe(false);
  });
});

describe("validateResourceForm / validatePriceForm / validateNormForm", () => {
  const lib: LibrarySnapshot = {
    categories: [],
    suppliers: [],
    workItems: [workItem({ id: "w1", code: "BT-01" })],
    resources: [resource({ id: "r1", code: "XM" }), resource({ id: "r2", code: "CAT" })],
    resourcePrices: [],
    norms: [normSet({ id: "n1", workItemId: "w1" })],
    normComponents: [component({ id: "c1", normId: "n1", resourceId: "r1" })],
  };

  it("tài nguyên: bắt buộc và chặn mã trùng", () => {
    expect(validateResourceForm({ code: "xm", name: "Xi măng", type: "material", categoryId: "", unit: "kg", notes: "" }, lib, null).ok).toBe(false);
    expect(validateResourceForm({ code: "DA", name: "Đá", type: "material", categoryId: "", unit: "m3", notes: "" }, lib, null).ok).toBe(true);
  });

  it("giá: bắt buộc có đơn giá, không âm", () => {
    const base = { price: "", unit: "kg", currency: "VND", effectiveFrom: "", effectiveTo: "", supplierId: "", source: "", status: "active" as const, notes: "" };
    expect(validatePriceForm(base, []).ok).toBe(false);
    expect(validatePriceForm({ ...base, price: "-5" }, []).ok).toBe(false);
    expect(validatePriceForm({ ...base, price: "1850,5" }, []).ok).toBe(true);
  });

  it("thành phần định mức: tài nguyên phải tồn tại, không trùng trong cùng định mức, hao phí > 0", () => {
    const n1 = lib.norms[0];
    const form = (resourceId: string, consumption: string) => ({ resourceId, consumption, wastePercent: "", notes: "" });
    expect(validateNormComponentForm(form("r1", "1"), n1, lib, null).ok).toBe(false);
    expect(validateNormComponentForm(form("r1", "1"), n1, lib, "c1").ok).toBe(true);
    expect(validateNormComponentForm(form("rx", "1"), n1, lib, null).ok).toBe(false);
    expect(validateNormComponentForm(form("r2", "0"), n1, lib, null).ok).toBe(false);
    expect(validateNormComponentForm(form("r2", "0,35"), n1, lib, null).ok).toBe(true);
  });
});

describe("libraryIssues", () => {
  const today = "2026-10-20";

  it("thư viện sạch → không có vấn đề", () => {
    expect(libraryIssues({ categories: [], suppliers: [], workItems: [workItem({ id: "1", code: "A" })], resources: [], resourcePrices: [], norms: [], normComponents: [] }, today)).toEqual([]);
  });

  it("phát hiện mã trùng, thiếu giá, giá hết hạn/chưa hiệu lực", () => {
    const issues = libraryIssues({
        categories: [],
        suppliers: [],
        workItems: [
          workItem({ id: "1", code: "A" }),
          workItem({ id: "2", code: "a" }),
          workItem({ id: "3", code: "B", unitPrice: null }),
          workItem({ id: "4", code: "C", effectiveTo: "2026-10-19" }),
          workItem({ id: "5", code: "D", effectiveFrom: "2026-11-01" }),
        ],
        resources: [],
        resourcePrices: [],
        norms: [],
        normComponents: [],
      },
      today
    );
    expect(issues.filter((i) => i.kind === "duplicateWorkItemCode")).toHaveLength(2);
    expect(issues.find((i) => i.kind === "missingPrice")?.entityId).toBe("3");
    expect(issues.find((i) => i.kind === "expiredPrice")?.entityId).toBe("4");
    expect(issues.find((i) => i.kind === "notYetEffectivePrice")?.entityId).toBe("5");
  });

  it("phát hiện liên kết hỏng, đơn vị không khớp, nhiều giá đang dùng chồng thời gian", () => {
    const issues = libraryIssues({
        categories: [],
        suppliers: [],
        workItems: [workItem({ id: "w1", code: "W" })],
        resources: [resource({ id: "r1", code: "XM", unit: "kg" })],
        resourcePrices: [
          price({ id: "p1", resourceId: "r1", effectiveFrom: "2026-01-01" }),
          price({ id: "p2", resourceId: "r1", effectiveFrom: "2026-06-01", unit: "tấn" }),
          price({ id: "p3", resourceId: "rX" }),
        ],
        norms: [normSet({ id: "n1", workItemId: "w1" }), normSet({ id: "n2", workItemId: "wGone" })],
        normComponents: [
          component({ id: "c1", normId: "n1", resourceId: "rGone" }),
          component({ id: "c2", normId: "n2", resourceId: "r1" }),
        ],
      },
      today
    );
    const kinds = issues.map((i) => i.kind);
    expect(kinds).toContain("brokenNormResource");
    expect(kinds).toContain("brokenNormWorkItem");
    expect(kinds).toContain("brokenPriceResource");
    expect(kinds).toContain("priceUnitMismatch");
    expect(kinds).toContain("overlappingPrices");
  });

  it("giá ngưng dùng không bị tính là chồng thời gian", () => {
    const issues = libraryIssues({
        categories: [],
        suppliers: [],
        workItems: [],
        resources: [resource({ id: "r1", code: "XM" })],
        resourcePrices: [price({ id: "p1", resourceId: "r1" }), price({ id: "p2", resourceId: "r1", status: "inactive" })],
        norms: [],
        normComponents: [],
      },
      today
    );
    expect(issues.map((i) => i.kind)).not.toContain("overlappingPrices");
  });
});

describe("draftFromWorkItem (chèn vào báo giá)", () => {
  const item = workItem({
    id: "1",
    code: "BT-01",
    name: "Bê tông móng",
    categoryId: "c1",
    unit: "m3",
    unitPrice: 1500000.5,
    source: "NCC A",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
  });

  it("chép giá trị (snapshot) kèm ghi chú truy vết nguồn giá; khối lượng để trống", () => {
    const lookup = nameLookup({ categories: [{ id: "c1", name: "Móng", notes: "", createdAt: T, updatedAt: T }], suppliers: [] });
    const { draft, warnings } = draftFromWorkItem(item, "2026-10-20", lookup);
    expect(warnings).toEqual([]);
    expect(draft).toMatchObject({ code: "BT-01", group: "Móng", description: "Bê tông móng", unit: "m3", quantity: "", unitPrice: "1500000.5" });
    expect(draft.notes).toBe("Thư viện: BT-01; nguồn giá: NCC A; hiệu lực 01/01/2026 – 31/12/2026; tiền tệ: VND");
    // Dòng tạo ra hợp lệ với bảng báo giá.
    const row = validateWorkItemDraft(draft, "CQ_Quote_1");
    expect(row.ok && row.row[6]).toBe(1500000.5);
  });

  it("cảnh báo khi giá hết hạn, chưa hiệu lực hoặc chưa có giá — không tự đổi giá", () => {
    expect(draftFromWorkItem(item, "2027-01-01").warnings).toEqual([{ kind: "expired", effectiveTo: "2026-12-31" }]);
    expect(draftFromWorkItem(item, "2025-12-31").warnings).toEqual([{ kind: "notYetEffective", effectiveFrom: "2026-01-01" }]);
    const noPrice = draftFromWorkItem({ ...item, unitPrice: null }, "2026-10-20");
    expect(noPrice.warnings).toEqual([{ kind: "missingPrice" }]);
    expect(noPrice.draft.unitPrice).toBe("");
  });

  it("ghi chú truy vết gọn khi thiếu thông tin", () => {
    expect(traceNote(workItem({ id: "x", code: "X", unitPrice: null, currency: "" }))).toBe("Thư viện: X");
  });
});

describe("kiểm tra thư viện — giá bằng 0 (prompts/13)", () => {
  it("cảnh báo đơn giá 0, phân biệt với chưa có giá", () => {
    const stamp = { createdAt: "", updatedAt: "" };
    const issues = libraryIssues({
        categories: [],
        suppliers: [],
        workItems: [
          { id: "a", code: "A", name: "A", categoryId: null, unit: "m3", description: "", pricingMethod: "direct", unitPrice: 0, currency: "VND", supplierId: null, source: "", effectiveFrom: null, effectiveTo: null, notes: "", ...stamp },
        ],
        resources: [{ id: "r", code: "R", name: "R", type: "material", categoryId: null, unit: "kg", notes: "", ...stamp }],
        resourcePrices: [{ id: "p", resourceId: "r", price: 0, unit: "kg", currency: "VND", effectiveFrom: null, effectiveTo: null, supplierId: null, source: "", status: "active", notes: "", ...stamp }],
        norms: [],
        normComponents: [],
      },
      "2026-10-21"
    );
    expect(issues.filter((i) => i.kind === "zeroPrice").map((i) => i.entity)).toEqual(["workItem", "price"]);
    expect(issues.some((i) => i.kind === "missingPrice")).toBe(false);
  });
});
