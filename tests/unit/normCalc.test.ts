import { describe, expect, it } from "vitest";
import * as D from "../../src/domain/pricing/decimal";
import { calculateNorm, calculateNormById } from "../../src/domain/pricing/normCalc";
import { Norm, NormComponent, Resource, ResourcePrice, ResourceType } from "../../src/domain/library/types";

const T = "2026-10-27T00:00:00.000Z";
const OPTS = { today: "2026-10-27", now: T };

// Dữ liệu kiểm thử giả định, không phải định mức hay đơn giá thực tế.
const res = (id: string, type: ResourceType, unit: string, extra: Partial<Resource> = {}): Resource => ({
  id,
  code: id.toUpperCase(),
  name: `Thử ${id}`,
  type,
  categoryId: null,
  unit,
  notes: "",
  createdAt: T,
  updatedAt: T,
  ...extra,
});
const price = (id: string, resourceId: string, value: number, unit: string, extra: Partial<ResourcePrice> = {}): ResourcePrice => ({
  id,
  resourceId,
  price: value,
  unit,
  currency: "VND",
  effectiveFrom: null,
  effectiveTo: null,
  supplierId: null,
  source: "Thử",
  status: "active",
  notes: "",
  createdAt: T,
  updatedAt: T,
  ...extra,
});
const NORM: Norm = {
  id: "n1",
  code: "THU-DM-01",
  name: "Thử công tác",
  unit: "m3",
  categoryId: null,
  workItemId: null,
  version: "1",
  effectiveFrom: null,
  sourceType: "user",
  source: "",
  sourceVerified: false,
  status: "approved",
  wasteIncluded: false,
  notes: "",
  createdAt: T,
  updatedAt: T,
};
const comp = (id: string, resource: Resource, consumption: number, extra: Partial<NormComponent> = {}): NormComponent => ({
  id,
  normId: "n1",
  resourceId: resource.id,
  resourceCodeSnapshot: resource.code,
  resourceNameSnapshot: resource.name,
  resourceUnitSnapshot: resource.unit,
  resourceTypeSnapshot: resource.type,
  consumption,
  wasteRate: 0,
  sortOrder: Number(id.replace(/\D/g, "")) || 0,
  notes: "",
  createdAt: T,
  updatedAt: T,
  ...extra,
});

const A = res("a", "material", "kg");
const B = res("b", "labor", "công");
const C = res("c", "machine", "ca");
const PRICES = [price("pa", "a", 10000, "kg"), price("pb", "b", 40000, "công"), price("pc", "c", 80000, "ca")];
const LIB = { resources: [A, B, C], resourcePrices: PRICES };

describe("số thập phân chính xác", () => {
  it("cộng, nhân không sai số dấu phẩy động", () => {
    expect(D.toString(D.add(D.fromNumber(0.1), D.fromNumber(0.2)))).toBe("0.3");
    expect(D.toString(D.multiply(D.fromNumber(0.1), D.fromNumber(3)))).toBe("0.3");
    expect(D.toString(D.multiply(D.fromNumber(1.05), D.fromNumber(1234567.891)))).toBe("1296296.28555");
    expect(D.toString(D.add(D.fromNumber(-5), D.fromNumber(2.25)))).toBe("-2.75");
    expect(D.toString(D.fromNumber(1.5e-7))).toBe("0.00000015");
    expect(D.toString(D.fromNumber(2e21))).toBe("2000000000000000000000");
  });

  it("làm tròn giống ROUND/ROUNDUP/ROUNDDOWN của Excel, kể cả số âm và hàng nghìn", () => {
    const r = (x: number, d: number, m: D.DecimalRoundingMode) => D.toString(D.round(D.fromNumber(x), d, m));
    expect(r(2.5, 0, "round")).toBe("3");
    expect(r(-2.5, 0, "round")).toBe("-3");
    expect(r(1.005, 2, "round")).toBe("1.01");
    expect(r(1.001, 2, "roundUp")).toBe("1.01");
    expect(r(-1.009, 2, "roundDown")).toBe("-1");
    expect(r(1234567.4, -3, "round")).toBe("1235000");
    expect(r(1234, -3, "roundDown")).toBe("1000");
    expect(r(999.5, 0, "round")).toBe("1000");
    expect(r(12, 2, "round")).toBe("12");
  });
});

describe("bộ máy tính đơn giá từ định mức", () => {
  it("ca chuẩn: 2 × 10.000 + 0,5 × 40.000 + 0,25 × 80.000 = 60.000; tổng theo nhóm", () => {
    const r = calculateNorm(NORM, [comp("c1", A, 2), comp("c2", B, 0.5), comp("c3", C, 0.25)], LIB, OPTS);
    expect(r.status).toBe("valid");
    expect(r.components.map((c) => c.amount)).toEqual([20000, 20000, 20000]);
    expect(r.totalsByType).toEqual({ material: 20000, labor: 20000, machine: 20000, other: 0 });
    expect(r.unitPrice).toBe(60000);
    expect(r.currency).toBe("VND");
  });

  it("hao hụt 5% cho vật liệu A: hao phí 2 → 2,1; chi phí 21.000; tổng 61.000", () => {
    const r = calculateNorm(NORM, [comp("c1", A, 2, { wasteRate: 0.05 }), comp("c2", B, 0.5), comp("c3", C, 0.25)], LIB, OPTS);
    expect(r.components[0]).toMatchObject({ effectiveConsumption: 2.1, effectiveConsumptionExact: "2.1", wasteApplied: true, amount: 21000 });
    expect(r.unitPrice).toBe(61000);
  });

  it("định mức đã gồm hao hụt: không cộng thêm, có cảnh báo", () => {
    const r = calculateNorm({ ...NORM, wasteIncluded: true }, [comp("c1", A, 2, { wasteRate: 0.05 })], LIB, OPTS);
    expect(r.status).toBe("validWithWarnings");
    expect(r.components[0]).toMatchObject({ effectiveConsumption: 2, wasteApplied: false, amount: 20000 });
    expect(r.issues.map((i) => i.code)).toEqual(["wasteIgnored"]);
  });

  it("giữ độ chính xác trung gian, chỉ làm tròn đơn giá tổng hợp một lần", () => {
    const prices = [price("pa", "a", 0.1, "kg")];
    const parts = [comp("c1", A, 1), comp("c2", res("a2", "material", "kg"), 1)];
    const lib = { resources: [A, res("a2", "material", "kg")], resourcePrices: [...prices, price("pa2", "a2", 0.2, "kg")] };
    const exact = calculateNorm(NORM, parts, lib, OPTS);
    expect(exact.unitPriceExact).toBe("0.3");
    expect(exact.unitPrice).toBe(0.3);
    const many = calculateNorm(NORM, [comp("c1", A, 1.2345)], { resources: [A], resourcePrices: [price("pa", "a", 1234.5678, "kg")] }, {
      ...OPTS,
      rounding: { mode: "round", digits: 0 },
    });
    expect(many.unitPriceExact).toBe("1524.0739491");
    expect(many.unitPrice).toBe(1524);
    expect(many.components[0].amount).toBe(1524.0739491);
  });

  it("không cộng trùng: cùng tài nguyên hai lần là lỗi", () => {
    const r = calculateNorm(NORM, [comp("c1", A, 1), comp("c2", A, 1)], LIB, OPTS);
    expect(r.status).toBe("invalid");
    expect(r.unitPrice).toBeNull();
    expect(r.issues.map((i) => i.code)).toContain("duplicateComponent");
  });

  it("định mức rỗng, thiếu tài nguyên, thiếu đơn giá: invalid, đơn giá null (không phải 0)", () => {
    expect(calculateNorm(NORM, [], LIB, OPTS)).toMatchObject({ status: "invalid", unitPrice: null, totalsByType: { material: null } });
    const missing = calculateNorm(NORM, [comp("c1", res("x", "material", "kg"), 1)], LIB, OPTS);
    expect(missing.issues[0]).toMatchObject({ code: "resourceMissing", componentId: "c1" });
    const noPrice = calculateNorm(NORM, [comp("c1", A, 1)], { resources: [A], resourcePrices: [] }, OPTS);
    expect(noPrice.issues[0].code).toBe("missingPrice");
    expect(noPrice.components[0].amount).toBeNull();
    expect(calculateNorm(NORM, [comp("c1", A, 1, { resourceId: "" })], LIB, OPTS).issues[0].code).toBe("noResourceLink");
  });

  it("đơn giá 0 tính được kèm cảnh báo; đơn giá âm là lỗi", () => {
    const zero = calculateNorm(NORM, [comp("c1", A, 2)], { resources: [A], resourcePrices: [price("pa", "a", 0, "kg")] }, OPTS);
    expect(zero).toMatchObject({ status: "validWithWarnings", unitPrice: 0 });
    expect(zero.issues[0].code).toBe("zeroPrice");
    const negative = calculateNorm(NORM, [comp("c1", A, 2)], { resources: [A], resourcePrices: [price("pa", "a", -1, "kg")] }, OPTS);
    expect(negative.issues.map((i) => i.code)).toContain("invalidPrice");
    const nan = calculateNorm(NORM, [comp("c1", A, 2)], { resources: [A], resourcePrices: [price("pa", "a", Number.NaN, "kg")] }, OPTS);
    expect(nan.issues.map((i) => i.code)).toContain("invalidPrice");
  });

  it("hao phí 0 cảnh báo; hao phí âm hoặc không phải số là lỗi", () => {
    expect(calculateNorm(NORM, [comp("c1", A, 0)], LIB, OPTS)).toMatchObject({ status: "validWithWarnings", unitPrice: 0 });
    expect(calculateNorm(NORM, [comp("c1", A, -1)], LIB, OPTS).issues[0].code).toBe("invalidConsumption");
    expect(calculateNorm(NORM, [comp("c1", A, Number.NaN)], LIB, OPTS).issues[0].code).toBe("invalidConsumption");
  });

  it("hao hụt âm hoặc vượt 100% là lỗi", () => {
    expect(calculateNorm(NORM, [comp("c1", A, 1, { wasteRate: -0.01 })], LIB, OPTS).issues[0].code).toBe("invalidWasteRate");
    expect(calculateNorm(NORM, [comp("c1", A, 1, { wasteRate: 5 })], LIB, OPTS).issues[0].code).toBe("invalidWasteRate");
    expect(calculateNorm(NORM, [comp("c1", A, 1, { wasteRate: 1 })], LIB, OPTS).unitPrice).toBe(20000);
  });

  it("đơn vị không tương thích: giá khác đơn vị, hoặc đơn vị tài nguyên đã đổi sau khi liên kết", () => {
    const pricedInTon = calculateNorm(NORM, [comp("c1", A, 1)], { resources: [A], resourcePrices: [price("pa", "a", 1, "tấn")] }, {
      ...OPTS,
      priceSelection: { c1: "pa" },
    });
    expect(pricedInTon.issues[0].code).toBe("priceUnitMismatch");
    // Không tự chọn giá khác đơn vị.
    expect(calculateNorm(NORM, [comp("c1", A, 1)], { resources: [A], resourcePrices: [price("pa", "a", 1, "tấn")] }, OPTS).issues[0].code).toBe(
      "missingPrice"
    );
    const changed = calculateNorm(NORM, [comp("c1", A, 1, { resourceUnitSnapshot: "bao" })], LIB, OPTS);
    expect(changed.issues[0].code).toBe("resourceUnitChanged");
  });

  it("tài nguyên đổi mã/tên sau khi liên kết: tính được nhưng cảnh báo; dùng dữ liệu hiện tại", () => {
    const r = calculateNorm(NORM, [comp("c1", A, 1, { resourceCodeSnapshot: "CU", resourceNameSnapshot: "Tên cũ" })], LIB, OPTS);
    expect(r.status).toBe("validWithWarnings");
    expect(r.components[0].resourceCode).toBe("A");
    expect(r.issues[0].code).toBe("resourceRenamed");
  });

  it("nhiều giá dùng được: không tự chọn; người dùng chọn thì tính; giá đã chọn bị xóa là lỗi", () => {
    const lib = { resources: [A], resourcePrices: [price("p1", "a", 100, "kg"), price("p2", "a", 120, "kg")] };
    expect(calculateNorm(NORM, [comp("c1", A, 1)], lib, OPTS).issues[0].code).toBe("ambiguousPrice");
    expect(calculateNorm(NORM, [comp("c1", A, 1)], lib, { ...OPTS, priceSelection: { c1: "p2" } }).unitPrice).toBe(120);
    expect(calculateNorm(NORM, [comp("c1", A, 1)], lib, { ...OPTS, priceSelection: { c1: "p9" } }).issues[0].code).toBe("selectedPriceMissing");
  });

  it("giá hết hiệu lực hoặc ngưng dùng chỉ dùng khi người dùng chọn, kèm cảnh báo", () => {
    const lib = { resources: [A], resourcePrices: [price("p1", "a", 100, "kg", { effectiveTo: "2026-01-01", status: "inactive" })] };
    expect(calculateNorm(NORM, [comp("c1", A, 1)], lib, OPTS).issues[0].code).toBe("missingPrice");
    const chosen = calculateNorm(NORM, [comp("c1", A, 1)], lib, { ...OPTS, priceSelection: { c1: "p1" } });
    expect(chosen.status).toBe("validWithWarnings");
    expect(chosen.issues.map((i) => i.code).sort()).toEqual(["inactivePrice", "priceNotInEffect"]);
  });

  it("khác tiền tệ là lỗi; phiên bản ngừng dùng cảnh báo; thiếu đơn vị công tác là lỗi", () => {
    const lib = { resources: [A, B], resourcePrices: [price("pa", "a", 1, "kg"), price("pb", "b", 1, "công", { currency: "USD" })] };
    expect(calculateNorm(NORM, [comp("c1", A, 1), comp("c2", B, 1)], lib, OPTS).issues.map((i) => i.code)).toContain("currencyMismatch");
    expect(calculateNorm({ ...NORM, status: "inactive" }, [comp("c1", A, 1)], LIB, OPTS).issues[0].code).toBe("normInactive");
    expect(calculateNorm({ ...NORM, unit: " " }, [comp("c1", A, 1)], LIB, OPTS).issues[0].code).toBe("missingWorkUnit");
  });

  it("số rất lớn vượt 15 chữ số là lỗi; số lớn trong giới hạn tính đúng", () => {
    const big = calculateNorm(NORM, [comp("c1", A, 1e9)], { resources: [A], resourcePrices: [price("pa", "a", 1e9, "kg")] }, OPTS);
    expect(big.issues[0].code).toBe("overflow");
    const ok = calculateNorm(NORM, [comp("c1", A, 123456.789)], { resources: [A], resourcePrices: [price("pa", "a", 9876543.21, "kg")] }, OPTS);
    expect(ok.unitPriceExact).toBe("1219326311126.35269");
  });

  it("phiên bản không tồn tại: invalid", () => {
    const r = calculateNormById("khong-co", { norms: [], normComponents: [], ...LIB }, OPTS);
    expect(r).toMatchObject({ status: "invalid", unitPrice: null });
    expect(r.issues[0].code).toBe("normNotFound");
  });

  it("vân tay đổi khi giá tài nguyên đổi (phát hiện dữ liệu thay đổi giữa lúc tính và lúc dùng)", () => {
    const before = calculateNorm(NORM, [comp("c1", A, 2)], LIB, OPTS);
    const after = calculateNorm(NORM, [comp("c1", A, 2)], { ...LIB, resourcePrices: [{ ...PRICES[0], price: 11000, updatedAt: "2026-10-28T00:00:00.000Z" }] }, OPTS);
    expect(before.inputFingerprint).not.toBe(after.inputFingerprint);
    expect(after.unitPrice).toBe(22000);
    expect(calculateNorm(NORM, [comp("c1", A, 2)], LIB, OPTS).inputFingerprint).toBe(before.inputFingerprint);
  });

  it("thứ tự thành phần theo sortOrder; 200 thành phần tính nhanh", () => {
    const resources = Array.from({ length: 200 }, (_, i) => res(`r${i}`, "material", "kg"));
    const prices = resources.map((r, i) => price(`p${i}`, r.id, 1000 + i, "kg"));
    const parts = resources.map((r, i) => comp(`c${200 - i}`, r, 0.1, { sortOrder: 200 - i }));
    const start = Date.now();
    const result = calculateNorm(NORM, parts, { resources, resourcePrices: prices }, OPTS);
    expect(Date.now() - start).toBeLessThan(500);
    expect(result.components[0].sortOrder).toBe(1);
    expect(result.unitPriceExact).toBe("21990");
  });
});
