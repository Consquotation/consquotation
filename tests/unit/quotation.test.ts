/**
 * Giai đoạn 17: hồ sơ báo giá, trạng thái tính toán theo dòng, đơn giá theo loại tài nguyên, snapshot
 * và đồng bộ với sheet. Số liệu là dữ liệu kiểm thử kỹ thuật, không phải định mức hay đơn giá thực tế.
 */

import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { LibraryService } from "../../src/application/libraryService";
import { IndexedDbLibraryRepository } from "../../src/storage/indexedDbLibraryRepository";
import { ANALYSIS_COLUMNS } from "../../src/domain/pricing/analysis";
import { buildComposition, compositionLines, compositionNote, defaultSelection } from "../../src/domain/pricing/composition";
import { QuotationService } from "../../src/application/quotationService";
import type {
  AnalysisCellWrite,
  ExtensionInspection,
  LineCellWrite,
  QuotationGateway,
  RecordRead,
  RowGuard,
} from "../../src/application/quotationGateway";
import { RecordChangedError } from "../../src/application/quotationGateway";
import type { PricingGateway } from "../../src/application/pricingGateway";
import { TargetChangedError } from "../../src/application/workbookGateway";
import type { LibrarySnapshot, Norm, NormComponent, Resource, ResourcePrice, WorkItem } from "../../src/domain/library/types";
import type { CompositionLine } from "../../src/domain/pricing/composition";
import { AnalysisLine, QuoteSnapshot, SheetRow, checkQuote } from "../../src/domain/pricing/quoteCheck";
import { DEFAULT_ROUNDING, NO_ROUNDING, RoundingConfig, roundLikeExcel } from "../../src/domain/pricing/rounding";
import { analysisBreakdown, costTypeFromLabel, lineAmount } from "../../src/domain/quotation/calculate";
import { completionBlockers, evaluateQuotation } from "../../src/domain/quotation/evaluate";
import { compositionBreakdown, libraryItem, manualItem, normItem } from "../../src/domain/quotation/fromInsert";
import { contentFingerprint, quoteLines } from "../../src/domain/quotation/lines";
import {
  QUOTATION_SCHEMA_VERSION,
  QuotationItemRecord,
  QuotationRecord,
  decodeRecord,
  detachRecordXml,
  encodeRecord,
  newRecord,
  recordTableOf,
} from "../../src/domain/quotation/model";
import { reconcile } from "../../src/domain/quotation/reconcile";
import {
  LINE_ID_HEADER,
  QUOTE_COLUMNS,
  TEMPLATE_COLUMNS,
  alignRowToHeaders,
  missingExtensionColumns,
  quoteColumnFormulas,
  templateTotalRow,
} from "../../src/domain/quoteTemplate";

const T = "2026-10-27T00:00:00.000Z";
const NOTE_NORM = "Phân tích định mức: DM-01; 3 tài nguyên; tiền tệ: VND";
const TYPE = { material: "Vật liệu", labor: "Nhân công", machine: "Máy thi công", other: "Khác" } as const;

// ---------- Workbook giả lập (mô phỏng công thức Excel) ----------

interface LineSpec {
  id?: string;
  code: string;
  group?: string;
  description?: string;
  unit?: string;
  quantity: unknown;
  unitPrice: unknown;
  notes?: string;
  breakdown?: [unknown, unknown, unknown, unknown];
}

interface AnalysisSpec {
  code: string;
  resourceCode: string;
  type: keyof typeof TYPE;
  quantity: unknown;
  price: unknown;
}

class FakeWorkbook {
  headers = TEMPLATE_COLUMNS.map((c) => c.header);
  rows: unknown[][] = [];
  analysis: AnalysisSpec[] = [];
  analysisSource: string[] = [];
  xml: string | null = null;
  rounding: RoundingConfig = DEFAULT_ROUNDING;

  col(header: string) {
    return this.headers.indexOf(header);
  }

  add(spec: LineSpec) {
    const row = this.headers.map(() => "" as unknown);
    const set = (h: string, v: unknown) => {
      if (this.col(h) >= 0) row[this.col(h)] = v;
    };
    set("Mã công tác", spec.code);
    set("Nhóm công tác", spec.group ?? "");
    set("Nội dung công việc", spec.description ?? `Công tác ${spec.code}`);
    set("Đơn vị tính", spec.unit ?? "m3");
    set("Khối lượng", spec.quantity);
    set("Đơn giá", spec.unitPrice);
    set("Ghi chú", spec.notes ?? "");
    set(LINE_ID_HEADER, spec.id ?? "");
    (["Đơn giá vật liệu", "Đơn giá nhân công", "Đơn giá máy", "Đơn giá khác"] as const).forEach((h, i) =>
      set(h, spec.breakdown?.[i] ?? "")
    );
    this.rows.push(row);
  }

  cell(row: number, header: string) {
    return this.rows[row][this.col(header)];
  }

  setCell(row: number, header: string, value: unknown) {
    this.rows[row][this.col(header)] = typeof value === "string" ? value.replace(/^'/, "") : value;
  }

  private analysisUnitPrice(code: string): number | "" {
    const rows = this.analysis.filter((a) => a.code === code);
    if (rows.some((a) => typeof a.quantity !== "number" || typeof a.price !== "number")) {
      return "";
    }
    // Như công thức Excel: cộng rồi làm tròn MỘT lần theo quy tắc cấp đơn giá (ROUND/ROUNDUP/ROUNDDOWN).
    return roundLikeExcel(rows.reduce((s, a) => s + (a.quantity as number) * (a.price as number), 0), this.rounding.unitPrice);
  }

  snapshot(): QuoteSnapshot {
    const sheetRow = (values: unknown[], formulas?: unknown[]): SheetRow => ({
      values,
      formulas: formulas ?? values,
      types: values.map((v) => (v === "" ? "Empty" : typeof v === "number" ? "Double" : "String")),
    });
    const q = this.col("Khối lượng");
    const p = this.col("Đơn giá");
    const a = this.col("Thành tiền");
    const rows = this.rows.map((r) => {
      const values = [...r];
      values[a] =
        typeof r[q] === "number" && typeof r[p] === "number" ? roundLikeExcel((r[q] as number) * (r[p] as number), this.rounding.amount) : "";
      const formulas = [...values];
      // Công thức Thành tiền đúng như add-in ghi theo quy tắc làm tròn hiện tại.
      formulas[a] = quoteColumnFormulas("CQ_Quote_1", this.rounding.amount).amount;
      formulas[this.col("STT")] = "=ROW()-ROW(CQ_Quote_1[#Headers])";
      return sheetRow(values, formulas);
    });
    const total = rows.reduce((s, r) => s + (typeof r.values[a] === "number" ? (r.values[a] as number) : 0), 0);
    const totalsValues = this.headers.map((_h, i) => (i === a ? total : i === this.col("Nội dung công việc") ? "Tổng cộng" : ""));
    const totalsFormulas = templateTotalRow("CQ_Quote_1").map((f) => f.replace("CQ_Quote_1[", "["));
    const analysis: AnalysisLine[] = this.analysis.map((x, i) => {
      const unitPrice = this.analysisUnitPrice(x.code);
      return {
        code: x.code,
        rowIndex: 4 + i,
        sheetName: "Phân tích đơn giá",
        quantityBlank: x.quantity === "",
        priceBlank: x.price === "",
        unitPrice,
        unitPriceType: unitPrice === "" ? "Empty" : "Double",
        priceAddress: `I${5 + i}`,
        resourceCode: x.resourceCode,
        resourceName: `Tài nguyên ${x.resourceCode}`,
        resourceType: TYPE[x.type],
        resourceUnit: "kg",
        quantity: x.quantity,
        quantityType: x.quantity === "" ? "Empty" : "Double",
        price: x.price,
        priceType: x.price === "" ? "Empty" : "Double",
        source: this.analysisSource[i] ?? "",
      };
    });
    return {
      quote: {
        name: "CQ_Quote_1",
        sheetName: "BG",
        headers: this.headers,
        firstRowIndex: 13,
        firstColumnIndex: 0,
        rows,
        totals: { values: totalsValues, formulas: totalsFormulas, types: totalsValues.map((v) => (typeof v === "number" ? "Double" : "String")) },
      },
      summary: null,
      analysis: this.analysis.length > 0 ? analysis : null,
      amountRule: this.rounding.amount,
    };
  }
}

class FakePricing implements Partial<PricingGateway> {
  constructor(private wb: FakeWorkbook) {}
  async readQuoteSnapshot() {
    return this.wb.snapshot();
  }
  async readRounding() {
    return this.wb.rounding;
  }
}

class FakeQuotationGateway implements QuotationGateway {
  saves = 0;
  failSave = false;
  constructor(private wb: FakeWorkbook) {}
  async readRecord(): Promise<RecordRead> {
    if (!this.wb.xml) return { kind: "none" };
    const d = decodeRecord(this.wb.xml);
    return d.ok ? { kind: "ok", record: d.record } : { kind: "unreadable", reason: d.reason, message: d.message };
  }
  async saveRecord(record: QuotationRecord, expected: string | null) {
    if (this.failSave) throw new Error("Lưu hồ sơ thất bại (giả lập).");
    const current = await this.readRecord();
    if ((current.kind === "ok" ? current.record.updatedAt : null) !== expected) throw new RecordChangedError();
    this.wb.xml = encodeRecord(record);
    this.saves++;
  }
  async writeLineCells(_t: string, writes: LineCellWrite[], guards: RowGuard[]) {
    const same = (a: unknown, b: unknown) => (a === "" || a == null ? b === "" || b == null : a === b);
    for (const w of writes) if (!same(this.wb.cell(w.row, w.header), w.expected)) throw new TargetChangedError();
    for (const g of guards) for (const [h, v] of Object.entries(g.expected)) if (!same(this.wb.cell(g.row, h), v)) throw new TargetChangedError();
    for (const w of writes) this.wb.setCell(w.row, w.header, w.value);
  }
  async writeAnalysisCells(writes: AnalysisCellWrite[]) {
    for (const w of writes) {
      const i = w.rowIndex - 4;
      if (w.header === "Đơn giá nguồn") {
        if (this.wb.analysis[i].price !== w.expected) throw new TargetChangedError();
        this.wb.analysis[i].price = w.value;
      } else {
        this.wb.analysisSource[i] = String(w.value).replace(/^'/, "");
      }
    }
  }
  async inspectExtensionColumns(): Promise<ExtensionInspection> {
    return { missing: missingExtensionColumns(this.wb.headers).map((c) => c.header), cellsRight: { count: 0, sample: [] }, sheetProtected: false };
  }
  async addExtensionColumns() {
    const missing = missingExtensionColumns(this.wb.headers).map((c) => c.header);
    this.wb.headers.push(...missing);
    this.wb.rows.forEach((r) => r.push(...missing.map(() => "")));
    return missing;
  }
}

function setup(library?: LibrarySnapshot) {
  const wb = new FakeWorkbook();
  const gateway = new FakeQuotationGateway(wb);
  let id = 0;
  let clock = Date.UTC(2026, 9, 27);
  const service = new QuotationService(new FakePricing(wb) as unknown as PricingGateway, gateway, {
    now: () => new Date((clock += 1000)),
    newId: () => `L${++id}`,
    loadLibrary: library ? async () => library : undefined,
  });
  return { wb, gateway, service };
}

/** Định mức thử A (vật liệu) 2, B (nhân công) 0,5, C (máy) 0,25 với giá 10.000 / 40.000 / 80.000. */
function seedNormAnalysis(wb: FakeWorkbook, priceA: unknown = 10000, quantityA: unknown = 2) {
  wb.analysis = [
    { code: "DM-01", resourceCode: "A", type: "material", quantity: quantityA, price: priceA },
    { code: "DM-01", resourceCode: "B", type: "labor", quantity: 0.5, price: 40000 },
    { code: "DM-01", resourceCode: "C", type: "machine", quantity: 0.25, price: 80000 },
  ];
}

function evaluate(wb: FakeWorkbook, record: QuotationRecord | null = null, library?: LibrarySnapshot) {
  const snapshot = wb.snapshot();
  return evaluateQuotation({ snapshot, record, check: checkQuote(snapshot, { library }), unitPriceRule: wb.rounding.unitPrice, library, now: T });
}

// ---------- Thư viện thử ----------

const stamp = { createdAt: T, updatedAt: T };
const RES_A: Resource = { id: "rA", code: "A", name: "Vật liệu A", type: "material", categoryId: null, unit: "kg", notes: "", ...stamp };
const RES_B: Resource = { id: "rB", code: "B", name: "Nhân công B", type: "labor", categoryId: null, unit: "công", notes: "", ...stamp };
const RES_C: Resource = { id: "rC", code: "C", name: "Máy C", type: "machine", categoryId: null, unit: "ca", notes: "", ...stamp };
const price = (id: string, resourceId: string, value: number, unit: string): ResourcePrice => ({
  id, resourceId, price: value, unit, currency: "VND", effectiveFrom: null, effectiveTo: null, supplierId: null, source: "Thử", status: "active", notes: "", ...stamp,
});
const NORM: Norm = {
  id: "n1", code: "DM-01", name: "Công tác thử", unit: "m3", categoryId: null, workItemId: "w1", version: "1", effectiveFrom: null,
  sourceType: "user", source: "", sourceVerified: false, status: "approved", wasteIncluded: false, notes: "", ...stamp,
};
const WORK: WorkItem = {
  id: "w1", code: "DM-01", name: "Công tác thử", categoryId: null, unit: "m3", description: "", pricingMethod: "direct", unitPrice: 50000, currency: "VND",
  supplierId: null, source: "", effectiveFrom: null, effectiveTo: null, notes: "", ...stamp,
};
const component = (id: string, resource: Resource, consumption: number, wasteRate = 0): NormComponent => ({
  id, normId: "n1", resourceId: resource.id, resourceCodeSnapshot: resource.code, resourceNameSnapshot: resource.name,
  resourceUnitSnapshot: resource.unit, resourceTypeSnapshot: resource.type, consumption, wasteRate, priceId: null, sortOrder: 1, notes: "", ...stamp,
});
function compositionLine(c: NormComponent, resource: Resource, p: ResourcePrice | null, applied = c.consumption): CompositionLine {
  return {
    norm: NORM,
    component: c,
    consumption: applied,
    resource,
    options: p ? [{ price: p, validity: "noDates", unitMatches: p.unit === resource.unit, usable: true }] : [],
    defaultPriceId: p?.id ?? null,
  };
}
function library(prices: ResourcePrice[], extra: Partial<LibrarySnapshot> = {}): LibrarySnapshot {
  return {
    categories: [], suppliers: [], workItems: [WORK], resources: [RES_A, RES_B, RES_C], resourcePrices: prices,
    norms: [NORM], normComponents: [], ...extra,
  };
}
const PRICES = [price("pA", "rA", 10000, "kg"), price("pB", "rB", 40000, "công"), price("pC", "rC", 80000, "ca")];
function normRecordItem(id: string, wasteA = 0): QuotationItemRecord {
  const lines = [
    compositionLine(component("cA", RES_A, 2, wasteA), RES_A, PRICES[0], wasteA ? 2 * (1 + wasteA) : 2),
    compositionLine(component("cB", RES_B, 0.5), RES_B, PRICES[1]),
    compositionLine(component("cC", RES_C, 0.25), RES_C, PRICES[2]),
  ];
  return normItem({ id, code: "DM-01", name: "Công tác thử", unit: "m3", now: T }, WORK, lines, { cA: "pA", cB: "pB", cC: "pC" }, []);
}

// ---------- Test bắt buộc của giai đoạn 17 ----------

describe("test 1–3: đơn giá theo loại, hao hụt, thành tiền", () => {
  it("test 1: 2 × 10.000 + 0,5 × 40.000 + 0,25 × 80.000 → 20.000 / 20.000 / 20.000, đơn giá 60.000", () => {
    const wb = new FakeWorkbook();
    seedNormAnalysis(wb);
    const result = analysisBreakdown(wb.snapshot().analysis!, "DM-01", NO_ROUNDING);
    expect(result.totals).toEqual({ material: 20000, labor: 20000, machine: 20000, other: 0 });
    expect(result.unitPrice).toBe(60000);
    expect(result.issues).toEqual([]);
  });

  it("test 2: hao phí cơ sở 2, hao hụt 5% → áp dụng 2,1; chi phí vật liệu 21.000 (snapshot thành phần ghi đủ cơ sở, tỷ lệ, áp dụng)", () => {
    const wb = new FakeWorkbook();
    seedNormAnalysis(wb, 10000, 2.1);
    expect(analysisBreakdown(wb.snapshot().analysis!, "DM-01", NO_ROUNDING).totals?.material).toBe(21000);
    const item = normRecordItem("L1", 0.05);
    expect(item.components[0]).toMatchObject({ baseConsumption: 2, wasteRate: 0.05, appliedConsumption: 2.1, unitPriceSnapshot: 10000, priceId: "pA" });
    // Đơn giá theo loại lúc chèn tính từ thành phần và giá đã chọn.
    const lines = [compositionLine(component("cA", RES_A, 2, 0.05), RES_A, PRICES[0], 2.1)];
    expect(compositionBreakdown(lines, { cA: "pA" })).toEqual({ material: 21000, labor: 0, machine: 0, other: 0 });
    expect(compositionBreakdown(lines, {})).toBeNull(); // chưa chọn giá → không có số
  });

  it("test 3: đơn giá 60.000 × khối lượng 10 = 600.000; làm tròn một lần theo quy tắc cấp thành tiền", () => {
    expect(lineAmount(10, 60000, NO_ROUNDING)).toBe(600000);
    expect(lineAmount(3, 333.335, { mode: "round", digits: 2 })).toBe(1000.01);
    const wb = new FakeWorkbook();
    seedNormAnalysis(wb);
    wb.add({ id: "L1", code: "DM-01", quantity: 10, unitPrice: 60000, notes: NOTE_NORM, breakdown: [20000, 20000, 20000, 0] });
    const record = { ...newRecord("Q1", "CQ_Quote_1", T), items: [normRecordItem("L1")] };
    const ev = evaluate(wb, record, library(PRICES));
    expect(ev.lines[0].result).toMatchObject({
      status: "valid", materialCost: 20000, laborCost: 20000, machineCost: 20000, otherCost: 0, unitPrice: 60000, quantity: 10, amount: 600000,
    });
    expect(ev.total.value).toBe(600000);
    expect(ev.computedTotal).toBe(600000);
  });
});

describe("test 4–5: thiếu đơn giá, sai đơn vị", () => {
  it("test 4: thành phần thiếu đơn giá nguồn → dòng invalid, chỉ rõ tài nguyên, không lấy 0 làm đơn giá", () => {
    const wb = new FakeWorkbook();
    seedNormAnalysis(wb, "");
    wb.add({ id: "L1", code: "DM-01", quantity: 10, unitPrice: "", notes: NOTE_NORM });
    const ev = evaluate(wb, { ...newRecord("Q1", "CQ_Quote_1", T), items: [normRecordItem("L1")] });
    const line = ev.lines[0];
    expect(line.result.status).toBe("invalid");
    expect(line.result.unitPrice).toBeNull();
    expect(line.result.amount).toBeNull();
    expect(line.result.materialCost).toBeNull();
    const codes = line.result.issues.map((i) => i.code);
    expect(codes).toContain("missingUnitPrice");
    const missing = line.result.issues.find((i) => i.code === "analysisIncomplete")!;
    expect(missing.resourceCode).toBe("A");
    expect(missing.message).toContain('"A" chưa có đơn giá nguồn');
    expect(ev.counts.invalid).toBe(1);
    expect(completionBlockers(ev)).toContain("1 dòng chưa tính được (trạng thái lỗi).");
  });

  it("test 5: đơn vị giá khác đơn vị hao phí, không có quy tắc quy đổi → invalid, lỗi cụ thể", () => {
    const wb = new FakeWorkbook();
    seedNormAnalysis(wb);
    wb.add({ id: "L1", code: "DM-01", quantity: 1, unitPrice: 60000, notes: NOTE_NORM });
    const item = normRecordItem("L1");
    item.components[0] = { ...item.components[0], priceUnitSnapshot: "tấn" };
    const ev = evaluate(wb, { ...newRecord("Q1", "CQ_Quote_1", T), items: [item] });
    expect(ev.lines[0].result.status).toBe("invalid");
    expect(ev.lines[0].result.issues.find((i) => i.code === "componentUnitMismatch")?.message).toBe(
      'Giá của "A" tính theo tấn, khác đơn vị hao phí kg.'
    );
  });
});

describe("test 6–8: thư viện thay đổi, sửa khối lượng, lưu và mở lại", () => {
  it("test 6: đổi giá trong thư viện → báo giá giữ snapshot; chỉ cập nhật khi người dùng bấm", async () => {
    const lib = library([price("pA", "rA", 12000, "kg"), PRICES[1], PRICES[2]]);
    const { wb, service } = setup(lib);
    seedNormAnalysis(wb);
    wb.add({ id: "L1", code: "DM-01", quantity: 10, unitPrice: 60000, notes: NOTE_NORM, breakdown: [20000, 20000, 20000, 0] });
    // Đơn giá thành phần do add-in ghi lúc chèn (ghi trong hồ sơ để phân biệt với sửa tay).
    const written = { material: 20000, labor: 20000, machine: 20000, other: 0 };
    wb.xml = encodeRecord({ ...newRecord("Q1", "CQ_Quote_1", T), items: [{ ...normRecordItem("L1"), writtenBreakdown: written }] });

    let view = await service.load("CQ_Quote_1");
    const line = view.evaluation.lines[0];
    expect(line.result.unitPrice).toBe(60000); // vẫn giá cũ
    expect(line.result.status).toBe("validWithWarnings");
    expect(line.result.issues.find((i) => i.code === "libraryPriceChanged")?.message).toBe(
      'Giá "A" trong thư viện đã đổi: 10.000 → 12.000 VND/kg.'
    );
    expect(line.plan).toMatchObject({ kind: "norm", prices: [{ resourceCode: "A", oldPrice: 10000, newPrice: 12000 }] });
    expect(wb.cell(0, "Đơn giá")).toBe(60000);

    const outcome = await service.applyLibraryUpdate("CQ_Quote_1", "L1", view.evaluation.fingerprint);
    expect(outcome).toMatchObject({ status: "done", analysisCells: 1, unitPriceCells: 1, affectedLines: 1 });
    expect(wb.analysis[0].price).toBe(12000);
    expect(wb.cell(0, "Đơn giá")).toBe(64000);
    expect(wb.cell(0, "Đơn giá vật liệu")).toBe(24000);
    view = await service.load("CQ_Quote_1");
    expect(view.evaluation.lines[0].result).toMatchObject({ status: "valid", unitPrice: 64000, amount: 640000 });
    const saved = decodeRecord(wb.xml!);
    expect(saved.ok && saved.record.items[0].components[0].unitPriceSnapshot).toBe(12000);
  });

  it("test 6: thư viện đổi không bị báo là sheet đổi; cập nhật giữ ghi chú hao hụt; báo giá hoàn tất về nháp", async () => {
    const { wb, service } = setup(library(PRICES));
    seedNormAnalysis(wb, 10000, 2.1);
    wb.analysisSource = ["Thử; VND; hao phí gồm hao hụt 5% (cơ sở 2); định mức DM-01 v1", "", ""];
    wb.add({ id: "L1", code: "DM-01", quantity: 1, unitPrice: 61000, notes: NOTE_NORM });
    wb.xml = encodeRecord({ ...newRecord("Q1", "CQ_Quote_1", T), items: [normRecordItem("L1", 0.05)] });
    let view = await service.load("CQ_Quote_1");
    await service.recalculate("CQ_Quote_1", view.evaluation.fingerprint);
    view = await service.load("CQ_Quote_1");
    expect(await service.complete("CQ_Quote_1", view.evaluation.fingerprint)).toMatchObject({ status: "done" });

    // Chỉ thư viện đổi: trạng thái dòng thành "có cảnh báo" nhưng không phải "sheet đã đổi".
    const changed = setup(library([price("pA", "rA", 11000, "kg"), PRICES[1], PRICES[2]]));
    Object.assign(changed.wb, { rows: wb.rows, analysis: wb.analysis, analysisSource: wb.analysisSource, xml: wb.xml });
    view = await changed.service.load("CQ_Quote_1");
    expect(view.state).toBe("completed");
    expect(view.evaluation.lines[0].result.status).toBe("validWithWarnings");
    expect(view.evaluation.lines[0].changedSinceLastCalc).toBe(false);

    const outcome = await changed.service.applyLibraryUpdate("CQ_Quote_1", "L1", view.evaluation.fingerprint);
    expect(outcome).toMatchObject({ status: "done", completionCleared: true });
    expect(changed.wb.analysisSource[0]).toMatch(/^Thử; VND; hao phí gồm hao hụt 5% \(cơ sở 2\); cập nhật theo thư viện \d\d\/10\/2026; định mức DM-01 v1$/);
    expect(changed.wb.cell(0, "Đơn giá")).toBe(63100); // 2,1 × 11.000 + 20.000 + 20.000
    expect((await changed.service.load("CQ_Quote_1")).state).toBe("draft");
  });

  it("test 6 (dòng thư viện): đơn giá công tác trong thư viện đổi → cảnh báo theo id công tác, cập nhật khi bấm", async () => {
    const lib = library(PRICES, { workItems: [{ ...WORK, unitPrice: 55000 }] });
    const { wb, service } = setup(lib);
    wb.add({ id: "L1", code: "DM-01", quantity: 2, unitPrice: 50000, notes: "Thư viện: DM-01" });
    wb.xml = encodeRecord({ ...newRecord("Q1", "CQ_Quote_1", T), items: [libraryItem({ id: "L1", code: "DM-01", name: "x", unit: "m3", now: T }, WORK)] });
    const view = await service.load("CQ_Quote_1");
    const issues = view.evaluation.lines[0].result.issues;
    expect(issues.filter((i) => i.code === "libraryPriceChanged")).toHaveLength(1);
    expect(issues.some((i) => i.code === "sheetCheck" && i.message.includes("khác đơn giá hiện tại"))).toBe(false); // không báo trùng
    expect(await service.applyLibraryUpdate("CQ_Quote_1", "L1", view.evaluation.fingerprint)).toMatchObject({ status: "done" });
    expect(wb.cell(0, "Đơn giá")).toBe(55000);
  });

  it("test 7: sửa khối lượng → thành tiền đổi đúng, đơn giá và đơn giá thành phần giữ nguyên", async () => {
    const { wb, service } = setup(library(PRICES));
    seedNormAnalysis(wb);
    wb.add({ id: "L1", code: "DM-01", quantity: 10, unitPrice: 60000, notes: NOTE_NORM, breakdown: [20000, 20000, 20000, 0] });
    wb.xml = encodeRecord({ ...newRecord("Q1", "CQ_Quote_1", T), items: [normRecordItem("L1")] });
    const first = await service.load("CQ_Quote_1");
    expect(await service.recalculate("CQ_Quote_1", first.evaluation.fingerprint)).toMatchObject({ status: "done" });
    wb.setCell(0, "Khối lượng", 12.5);
    const view = await service.load("CQ_Quote_1");
    const line = view.evaluation.lines[0];
    expect(line.result).toMatchObject({ quantity: 12.5, unitPrice: 60000, amount: 750000, materialCost: 20000, status: "valid" });
    expect(line.changedSinceLastCalc).toBe(true);
    expect(line.breakdownWrite).toBeNull();
    expect(wb.analysis.map((a) => a.price)).toEqual([10000, 40000, 80000]);
  });

  it("test 8: tính, lưu, mở lại → hồ sơ, snapshot, trạng thái và kết quả khôi phục nhất quán", async () => {
    const { wb, gateway, service } = setup(library(PRICES));
    seedNormAnalysis(wb);
    wb.add({ id: "L1", code: "DM-01", quantity: 10, unitPrice: 60000, notes: NOTE_NORM });
    wb.add({ code: "TC-01", description: "Gõ tay", quantity: 2, unitPrice: 1500 });
    await service.registerInsertedLine("CQ_Quote_1", normRecordItem("L1"));
    const before = await service.load("CQ_Quote_1");
    expect(before.pending).toEqual({ assignIds: 1, removeItems: 0, writeBreakdown: 1 });
    expect(await service.recalculate("CQ_Quote_1", before.evaluation.fingerprint)).toMatchObject({
      status: "done", assigned: 1, copied: 0, removed: 0, breakdownWritten: 1,
    });
    // "Mở lại": dịch vụ mới đọc từ chính XML đã lưu trong workbook.
    const xml = wb.xml!;
    const reopened = decodeRecord(xml);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.record.schemaVersion).toBe(QUOTATION_SCHEMA_VERSION);
    expect(reopened.record.items.map((i) => [i.id, i.pricingMethod, i.result?.status, i.result?.amount])).toEqual([
      ["L1", "norm", "valid", 600000],
      ["L2", "manual", "valid", 3000],
    ]);
    expect(reopened.record.items[0].components.map((c) => [c.resourceCodeSnapshot, c.appliedConsumption, c.unitPriceSnapshot])).toEqual([
      ["A", 2, 10000],
      ["B", 0.5, 40000],
      ["C", 0.25, 80000],
    ]);
    expect(reopened.record.items[0].writtenBreakdown).toEqual({ material: 20000, labor: 20000, machine: 20000, other: 0 });
    const after = await service.load("CQ_Quote_1");
    expect(after.evaluation.lines.map((l) => [l.line.lineId, l.result.status, l.changedSinceLastCalc])).toEqual([
      ["L1", "valid", false],
      ["L2", "valid", false],
    ]);
    expect(after.pending).toEqual({ assignIds: 0, removeItems: 0, writeBreakdown: 0 });
    expect(gateway.saves).toBe(2);
  });
});

describe("test 9: đồng bộ với Excel", () => {
  it("dòng gõ tay được gán mã; dòng sao chép nhận mã mới và nguồn của dòng gốc; dòng bị xóa bỏ khỏi hồ sơ", async () => {
    const { wb, service } = setup();
    seedNormAnalysis(wb);
    wb.add({ id: "L1", code: "DM-01", quantity: 1, unitPrice: 60000, notes: NOTE_NORM });
    wb.add({ id: "L1", code: "DM-01", quantity: 3, unitPrice: 60000, notes: NOTE_NORM }); // người dùng chép dòng
    wb.add({ code: "TC-02", quantity: 1, unitPrice: 10 });
    wb.xml = encodeRecord({ ...newRecord("Q1", "CQ_Quote_1", T), items: [normRecordItem("L1"), manualItem({ id: "GONE", code: "X", name: "x", unit: "m", now: T })] });
    const view = await service.load("CQ_Quote_1");
    expect(view.pending).toMatchObject({ assignIds: 2, removeItems: 1 });
    expect(view.evaluation.lines[1].result.issues.some((i) => i.message.includes("Mã dòng trùng"))).toBe(true);
    const outcome = await service.recalculate("CQ_Quote_1", view.evaluation.fingerprint);
    expect(outcome).toMatchObject({ status: "done", assigned: 1, copied: 1, removed: 1 });
    expect([0, 1, 2].map((r) => wb.cell(r, LINE_ID_HEADER))).toEqual(["L1", "L2", "L3"]);
    const saved = decodeRecord(wb.xml!);
    if (!saved.ok) throw new Error();
    expect(saved.record.items.map((i) => [i.id, i.pricingMethod, i.components.length])).toEqual([
      ["L1", "norm", 3],
      ["L2", "norm", 3],
      ["L3", "manual", 0],
    ]);
  });

  it("sheet bị sửa sau khi xem → không ghi gì; ghi ô lỗi giữa chừng → báo thay đổi, không lưu hồ sơ", async () => {
    const { wb, gateway, service } = setup();
    wb.add({ code: "TC-01", quantity: 1, unitPrice: 10 });
    const view = await service.load("CQ_Quote_1");
    wb.setCell(0, "Khối lượng", 2); // người dùng sửa trong Excel
    expect(await service.recalculate("CQ_Quote_1", view.evaluation.fingerprint)).toEqual({ status: "changed" });
    expect(wb.cell(0, LINE_ID_HEADER)).toBe("");
    expect(gateway.saves).toBe(0);
    // Ghi hồ sơ thất bại sau khi đã ghi Mã dòng: lỗi được báo, lần sau đồng bộ lại từ sheet.
    const fresh = await service.load("CQ_Quote_1");
    gateway.failSave = true;
    await expect(service.recalculate("CQ_Quote_1", fresh.evaluation.fingerprint)).rejects.toThrow("Lưu hồ sơ thất bại");
    gateway.failSave = false;
    const again = await service.load("CQ_Quote_1");
    expect(again.state).toBe("noRecord");
    expect(await service.recalculate("CQ_Quote_1", again.evaluation.fingerprint)).toMatchObject({ status: "done", assigned: 0 });
    const saved = decodeRecord(wb.xml!);
    expect(saved.ok && saved.record.items.map((i) => i.id)).toEqual([wb.cell(0, LINE_ID_HEADER)]);
  });

  it("bảng cũ 9 cột: chưa có Mã dòng → chặn Tính lại và lưu; bổ sung cột rồi dùng được", async () => {
    const { wb, service } = setup();
    wb.headers = QUOTE_COLUMNS.map((c) => c.header);
    wb.add({ code: "TC-01", quantity: 1, unitPrice: 10 });
    const view = await service.load("CQ_Quote_1");
    expect(view.evaluation.hasLineIds).toBe(false);
    expect(view.evaluation.missingColumns).toEqual(["Đơn giá vật liệu", "Đơn giá nhân công", "Đơn giá máy", "Đơn giá khác", LINE_ID_HEADER]);
    expect(await service.recalculate("CQ_Quote_1", view.evaluation.fingerprint)).toMatchObject({ status: "blocked" });
    expect(await service.addColumns("CQ_Quote_1")).toHaveLength(5);
    const after = await service.load("CQ_Quote_1");
    expect(await service.recalculate("CQ_Quote_1", after.evaluation.fingerprint)).toMatchObject({ status: "done", assigned: 1 });
  });

  it("thêm dòng: cột mở rộng ghi theo tên cột; bảng không có cột đó thì bỏ qua", () => {
    const row = QUOTE_COLUMNS.map((c) => c.header);
    const headers = [...QUOTE_COLUMNS.map((c) => c.header), "Cột riêng", LINE_ID_HEADER];
    expect(alignRowToHeaders(headers, row, { [LINE_ID_HEADER]: "L9", "Không có": 1 })?.slice(-2)).toEqual([null, "L9"]);
    expect(TEMPLATE_COLUMNS.map((c) => c.header)).toEqual([
      "STT", "Mã công tác", "Nhóm công tác", "Nội dung công việc", "Đơn vị tính", "Khối lượng",
      "Đơn giá vật liệu", "Đơn giá nhân công", "Đơn giá máy", "Đơn giá khác", "Đơn giá", "Thành tiền", "Ghi chú", LINE_ID_HEADER,
    ]);
    expect(templateTotalRow("CQ_Quote_1").filter(Boolean)).toEqual(["Tổng cộng", "=SUBTOTAL(109,CQ_Quote_1[Thành tiền])"]);
  });
});

describe("test 10: dữ liệu không hợp lệ", () => {
  it("khối lượng âm, dạng chữ, để trống; đơn giá thiếu → invalid với mã lỗi riêng, không thành 0", () => {
    const wb = new FakeWorkbook();
    wb.add({ code: "A1", quantity: -1, unitPrice: 10 });
    wb.add({ code: "A2", quantity: "1.500", unitPrice: 10 });
    wb.add({ code: "A3", quantity: "", unitPrice: 10 });
    wb.add({ code: "A4", quantity: 2, unitPrice: "" });
    wb.add({ code: "A5", quantity: 0, unitPrice: 10 });
    const ev = evaluate(wb);
    expect(ev.lines.map((l) => [l.line.code, l.result.status, l.result.issues.filter((i) => i.severity === "error").map((i) => i.code)])).toEqual([
      ["A1", "invalid", ["negativeQuantity"]],
      ["A2", "invalid", ["invalidQuantity"]],
      ["A3", "invalid", ["missingQuantity"]],
      ["A4", "invalid", ["missingUnitPrice"]],
      ["A5", "validWithWarnings", []], // 0 là cảnh báo, không bị đổi thành lỗi
    ]);
    expect(ev.lines.slice(0, 4).every((l) => l.result.amount === null && l.result.unitPrice === null)).toBe(true);
    expect(ev.lines[4].result.amount).toBe(0);
  });

  it("số không hữu hạn hoặc chữ trong hao phí/giá nguồn; loại tài nguyên lạ; vượt 15 chữ số", () => {
    const wb = new FakeWorkbook();
    wb.analysis = [
      { code: "X", resourceCode: "A", type: "material", quantity: Infinity, price: 1 },
      { code: "Y", resourceCode: "B", type: "material", quantity: 1, price: "abc" },
    ];
    const snap = wb.snapshot().analysis!;
    expect(analysisBreakdown(snap, "X", NO_ROUNDING).issues[0]).toMatchObject({ code: "analysisError", resourceCode: "A" });
    expect(analysisBreakdown(snap, "Y", NO_ROUNDING).totals).toBeNull();
    const odd = { ...snap[0], code: "Z", quantity: 2, resourceType: "Nhiên liệu" };
    expect(analysisBreakdown([odd], "Z", NO_ROUNDING)).toMatchObject({ totals: { other: 2 }, unitPrice: 2 });
    const big = { ...snap[0], code: "B", quantity: 1e10, price: 1e10 };
    expect(analysisBreakdown([big], "B", NO_ROUNDING).issues.map((i) => i.code)).toEqual(["overflow"]);
    expect(costTypeFromLabel(" máy thi công ")).toBe("machine");
  });

  it("hồ sơ sai schema, hỏng, của phiên bản mới hơn → từ chối, không ghi đè", async () => {
    const record = newRecord("Q1", "CQ_Quote_1", T);
    expect(decodeRecord("<quotation/>")).toMatchObject({ ok: false, reason: "invalid" });
    expect(decodeRecord("<quotation><data>{không phải json</data></quotation>")).toMatchObject({ ok: false, reason: "invalid" });
    expect(decodeRecord(encodeRecord({ ...record, schemaVersion: 99 }))).toMatchObject({ ok: false, reason: "newer" });
    expect(decodeRecord(encodeRecord({ ...record, items: [manualItem({ id: "", code: "", name: "", unit: "", now: T })] }))).toMatchObject({ ok: false });
    const dup = manualItem({ id: "D", code: "", name: "", unit: "", now: T });
    expect(decodeRecord(encodeRecord({ ...record, items: [dup, dup] }))).toMatchObject({ ok: false });
    expect(decodeRecord(encodeRecord({ ...record, items: [{ ...dup, components: [{ resourceType: "fuel" }] } as unknown as QuotationItemRecord] }))).toMatchObject({ ok: false });

    const { wb, service } = setup();
    wb.add({ code: "TC", quantity: 1, unitPrice: 1 });
    wb.xml = encodeRecord({ ...record, schemaVersion: 99 });
    const view = await service.load("CQ_Quote_1");
    expect(view.state).toBe("unreadable");
    expect(await service.recalculate("CQ_Quote_1", view.evaluation.fingerprint)).toMatchObject({ status: "blocked" });
    expect(await service.registerInsertedLine("CQ_Quote_1", dup)).toMatchObject({ saved: false });
    expect(recordTableOf(wb.xml)).toBe("CQ_Quote_1");
  });

  it("mã hóa XML: ký tự đặc biệt trong chữ (& < > \" ') giữ nguyên qua lưu/đọc", () => {
    const item = manualItem({ id: "L1", code: "A&B", name: "Ống <D100> \"loại 1\" 'x'", unit: "m", now: T });
    const record = { ...newRecord("Q1", "CQ_Quote_1", T), items: [item] };
    const xml = encodeRecord(record);
    expect(xml).not.toContain("<D100>");
    const back = decodeRecord(xml.replace("&lt;D100&gt;", "&#60;D100&#x3E;"));
    expect(back.ok && back.record.items[0].workName).toBe(item.workName);
    expect(back.ok && back.record).toEqual(record);
  });
});

describe("tính toán (giai đoạn 18): làm tròn, thập phân, số lớn, giá trị 0 — kỳ vọng tính tay", () => {
  it("làm tròn cấp đơn giá tới hàng nghìn: đơn giá theo loại giữ số chưa làm tròn, tổng lệch trong một bước làm tròn", () => {
    const wb = new FakeWorkbook();
    wb.rounding = { ...DEFAULT_ROUNDING, unitPrice: { mode: "round", digits: -3 } };
    // A: 2,1 × 10.333 = 21.699,3; B: 0,5 × 40.000 = 20.000; C: 0,25 × 80.000 = 20.000 → 61.699,3 → 62.000
    seedNormAnalysis(wb, 10333, 2.1);
    const result = analysisBreakdown(wb.snapshot().analysis!, "DM-01", wb.rounding.unitPrice);
    expect(result.totals).toEqual({ material: 21699.3, labor: 20000, machine: 20000, other: 0 });
    expect(result.unitPrice).toBe(62000);
    wb.add({ id: "L1", code: "DM-01", quantity: 3, unitPrice: 62000, notes: NOTE_NORM, breakdown: [21699.3, 20000, 20000, 0] });
    const item = { ...normRecordItem("L1", 0.05), writtenBreakdown: { material: 21699.3, labor: 20000, machine: 20000, other: 0 } };
    const ev = evaluate(wb, { ...newRecord("Q1", "CQ_Quote_1", T), items: [item] });
    expect(ev.lines[0].result).toMatchObject({ status: "valid", unitPrice: 62000, amount: 186000, materialCost: 21699.3 });
    expect(ev.lines[0].result.issues).toEqual([]);
  });

  it("ROUNDUP và ROUNDDOWN cấp thành tiền; số âm không làm tròn sai hướng", () => {
    expect(lineAmount(3, 333.335, { mode: "roundUp", digits: 0 })).toBe(1001); // 1.000,005 → 1.001
    expect(lineAmount(3, 333.335, { mode: "roundDown", digits: 2 })).toBe(1000); // 1.000,005 → 1.000,00
    expect(lineAmount(2.5, 1.01, { mode: "round", digits: 1 })).toBe(2.5); // 2,525 → 2,5
    expect(lineAmount(1.005, 1000, { mode: "round", digits: -1 })).toBe(1010); // 1.005 → 1.010
    const wb = new FakeWorkbook();
    wb.rounding = { ...DEFAULT_ROUNDING, amount: { mode: "roundUp", digits: -2 } };
    wb.add({ id: "R1", code: "R1", quantity: 3, unitPrice: 333.335 }); // 1.000,005 → 1.100
    const ev = evaluate(wb);
    expect(ev.lines[0].result).toMatchObject({ status: "valid", amount: 1100 });
  });

  it("thập phân không sai số số thực: 0,1 × 3 = 0,3; 0,7 × 0,1 = 0,07; 1,15 × 100 = 115", () => {
    const wb = new FakeWorkbook();
    wb.analysis = [
      { code: "D", resourceCode: "A", type: "material", quantity: 0.1, price: 3 },
      { code: "D", resourceCode: "B", type: "labor", quantity: 0.7, price: 0.1 },
      { code: "D", resourceCode: "C", type: "other", quantity: 1.15, price: 100 },
    ];
    const r = analysisBreakdown(wb.snapshot().analysis!, "D", NO_ROUNDING);
    expect(r.totals).toEqual({ material: 0.3, labor: 0.07, machine: 0, other: 115 });
    expect(r.unitPrice).toBe(115.37);
    expect(lineAmount(0.1, 0.2, NO_ROUNDING)).toBe(0.02);
  });

  it("số lớn: 15 chữ số phần nguyên tính đúng; 16 chữ số là lỗi tràn, không trả số", () => {
    const ok = analysisBreakdown(
      [{ ...new FakeWorkbook().snapshot().analysis?.[0], code: "B", resourceCode: "A", resourceType: "Vật liệu", quantity: 999999, quantityType: "Double", price: 1000000000, priceType: "Double", rowIndex: 4 } as never],
      "B",
      NO_ROUNDING
    );
    expect(ok.unitPrice).toBe(999999000000000); // 15 chữ số
    const wb = new FakeWorkbook();
    wb.analysis = [{ code: "B", resourceCode: "A", type: "material", quantity: 1000000, price: 1000000000 }]; // 1e15: 16 chữ số
    const big = analysisBreakdown(wb.snapshot().analysis!, "B", NO_ROUNDING);
    expect([big.unitPrice, big.totals, big.issues.map((i) => i.code)]).toEqual([null, null, ["overflow"]]);
  });

  it("giá trị 0 hợp lệ: khối lượng 0 hoặc tài nguyên giá 0 → tính được, có cảnh báo, thành tiền 0", () => {
    const wb = new FakeWorkbook();
    wb.analysis = [
      { code: "Z", resourceCode: "A", type: "material", quantity: 2, price: 0 },
      { code: "Z", resourceCode: "B", type: "labor", quantity: 1, price: 500 },
    ];
    expect(analysisBreakdown(wb.snapshot().analysis!, "Z", NO_ROUNDING)).toMatchObject({ unitPrice: 500, totals: { material: 0, labor: 500 } });
    wb.add({ id: "K0", code: "K0", quantity: 0, unitPrice: 500 });
    const ev = evaluate(wb);
    expect(ev.lines[0].result).toMatchObject({ status: "validWithWarnings", amount: 0, quantity: 0 });
  });

  it("thiếu định mức (dòng phân tích không còn khối phân tích) → invalid analysisMissing", () => {
    const wb = new FakeWorkbook();
    wb.add({ id: "L1", code: "DM-01", quantity: 1, unitPrice: 60000, notes: NOTE_NORM });
    const ev = evaluate(wb, { ...newRecord("Q1", "CQ_Quote_1", T), items: [normRecordItem("L1")] });
    expect(ev.lines[0].result.status).toBe("invalid");
    expect(ev.lines[0].result.issues.map((i) => i.code)).toContain("analysisMissing");
  });
});

describe("luồng đầy đủ: thư viện IndexedDB → định mức → phân tích → báo giá → hồ sơ → mở lại (giai đoạn 18)", () => {
  /** Dựng sheet phân tích giả lập từ đúng các dòng add-in sẽ ghi (ANALYSIS_COLUMNS). */
  function analysisFromRows(rows: (string | number)[][]): AnalysisSpec[] {
    const at = (key: string) => ANALYSIS_COLUMNS.findIndex((c) => c.key === key);
    const text = (v: unknown) => String(v).replace(/^'/, "");
    const typeOf = (label: string) => (Object.entries(TYPE).find(([, l]) => l === label)?.[0] ?? "other") as keyof typeof TYPE;
    return rows.map((r) => ({
      code: text(r[at("code")]),
      resourceCode: text(r[at("resourceCode")]),
      type: typeOf(text(r[at("resourceType")])),
      quantity: r[at("quantity")],
      price: r[at("price")],
    }));
  }

  it("lập báo giá, đổi thư viện, ngừng định mức, xóa giá; báo giá cũ giữ snapshot tới khi người dùng cập nhật", async () => {
    // Thư viện thật (IndexedDB giả lập), dữ liệu giả định.
    const repo = new IndexedDbLibraryRepository(new IDBFactory(), "flow");
    let n = 0;
    let clock = Date.UTC(2026, 9, 27);
    const libs = new LibraryService(repo, { now: () => new Date((clock += 1000)), newId: () => `id-${++n}` });
    const ids: Record<string, string> = {};
    for (const [code, type, unit, price] of [["VA", "material", "kg", "10000"], ["NB", "labor", "công", "40000"], ["MC", "machine", "ca", "80000"]] as const) {
      const r = await libs.saveResource({ code, name: `Thử ${code}`, type, categoryId: "", unit, notes: "" }, null, await libs.load());
      if (!r.ok) throw new Error();
      ids[code] = r.value.id;
      await libs.savePrice(r.value.id, { price, unit, currency: "VND", effectiveFrom: "", effectiveTo: "", supplierId: "", source: "Thử", status: "active", notes: "" }, null, await libs.load());
    }
    const w = await libs.saveWorkItem(
      { code: "CT-F", name: "Công tác luồng", categoryId: "", unit: "m3", description: "", unitPrice: "", currency: "VND", supplierId: "", source: "", effectiveFrom: "", effectiveTo: "", notes: "" },
      null,
      await libs.load()
    );
    if (!w.ok) throw new Error();
    const normSaved = await libs.saveNorm(
      { code: "DM-F", name: "Định mức luồng", unit: "m3", categoryId: "", workItemId: w.value.id, version: "1", effectiveFrom: "", sourceType: "user", source: "", sourceVerified: false, wasteIncluded: false, notes: "" },
      null,
      await libs.load()
    );
    if (!normSaved.ok) throw new Error();
    for (const [code, consumption, waste] of [["VA", "2", "5"], ["NB", "0,5", ""], ["MC", "0,25", ""]] as const) {
      const c = await libs.saveNormComponent(normSaved.value.id, { resourceId: ids[code], consumption, wastePercent: waste, notes: "" }, null, await libs.load());
      if (!c.ok) throw new Error(JSON.stringify(c.errors));
    }
    expect(await libs.setNormStatus(normSaved.value.id, "approved", await libs.load())).toEqual({ ok: true });

    // Chọn định mức, đọc thành phần, áp dụng giá.
    let lib = await libs.load();
    const lines = compositionLines(w.value, lib, "2026-10-27");
    expect(lines.map((l) => [l.resource?.code, l.consumption])).toEqual([["VA", 2.1], ["NB", 0.5], ["MC", 0.25]]);
    const selection = defaultSelection(lines);
    const comp = buildComposition(w.value, lines, selection, NO_ROUNDING);
    expect([comp.ok, comp.preview]).toEqual([true, 61000]);

    // Ghi vào workbook (giả lập công thức Excel): phân tích + dòng báo giá + hồ sơ.
    const { wb, gateway } = setup();
    const svc = new QuotationService(new FakePricing(wb) as unknown as PricingGateway, gateway, {
      now: () => new Date((clock += 1000)),
      newId: () => `L${++n}`,
      loadLibrary: async () => lib,
    });
    wb.analysis = analysisFromRows(comp.rows);
    wb.analysisSource = comp.rows.map((r) => String(r[ANALYSIS_COLUMNS.findIndex((c) => c.key === "source")]).replace(/^'/, ""));
    const breakdown = compositionBreakdown(lines, selection)!;
    expect(breakdown).toEqual({ material: 21000, labor: 20000, machine: 20000, other: 0 });
    wb.add({
      id: "LF",
      code: "CT-F",
      group: "Móng",
      quantity: 10,
      unitPrice: 61000,
      notes: compositionNote(w.value, 3, "VND"),
      breakdown: [21000, 20000, 20000, 0],
    });
    wb.add({ id: "LM", code: "TAY", group: "Móng", quantity: 4, unitPrice: 2500 });
    const item = normItem({ id: "LF", code: "CT-F", name: "Công tác luồng", unit: "m3", now: T }, w.value, lines, selection, comp.rows);
    expect(await svc.registerInsertedLine("CQ_Quote_1", { ...item, writtenBreakdown: breakdown })).toEqual({ saved: true });
    expect(await svc.registerInsertedLine("CQ_Quote_1", manualItem({ id: "LM", code: "TAY", name: "x", unit: "m", now: T }))).toEqual({ saved: true });

    let view = await svc.load("CQ_Quote_1");
    expect(view.evaluation.counts).toEqual({ valid: 2, validWithWarnings: 0, invalid: 0 });
    expect([view.evaluation.total.value, view.evaluation.computedTotal]).toEqual([620000, 620000]);
    expect(view.evaluation.groups).toEqual([{ group: "Móng", amount: 620000, lines: 2, uncomputed: 0 }]);
    expect((await svc.recalculate("CQ_Quote_1", view.evaluation.fingerprint)).status).toBe("done");
    view = await svc.load("CQ_Quote_1");
    expect((await svc.complete("CQ_Quote_1", view.evaluation.fingerprint)).status).toBe("done");

    // Đổi giá trong thư viện (sửa bản ghi giá có sẵn): báo giá giữ 61.000, trạng thái vẫn hoàn tất.
    const priceVA = lib.resourcePrices.find((p) => p.resourceId === ids.VA)!;
    await libs.savePrice(ids.VA, { price: "10500", unit: "kg", currency: "VND", effectiveFrom: "", effectiveTo: "", supplierId: "", source: "Thử", status: "active", notes: "" }, priceVA.id, lib);
    lib = await libs.load();
    view = await svc.load("CQ_Quote_1");
    expect(view.state).toBe("completed");
    expect(wb.cell(0, "Đơn giá")).toBe(61000);
    expect(view.evaluation.lines[0].result.issues.map((i) => i.code)).toEqual(["libraryPriceChanged"]);

    // Định mức chuyển Ngừng dùng (không có phiên bản mới): cảnh báo, báo giá không đổi.
    expect(await libs.setNormStatus(normSaved.value.id, "inactive", lib)).toEqual({ ok: true });
    lib = await libs.load();
    view = await svc.load("CQ_Quote_1");
    expect(view.evaluation.lines[0].result.issues.map((i) => i.code)).toEqual(["normVersionChanged", "libraryPriceChanged"]);
    expect(view.evaluation.lines[0].result.issues[0].message).toContain("Ngừng dùng");

    // Giá đã dùng bị xóa khỏi thư viện: cảnh báo, không có kế hoạch cập nhật cho tài nguyên đó.
    const priceMC = lib.resourcePrices.find((p) => p.resourceId === ids.MC)!;
    await libs.deletePrice(priceMC.id);
    lib = await libs.load();
    view = await svc.load("CQ_Quote_1");
    const issues = view.evaluation.lines[0].result.issues;
    expect(issues.find((i) => i.resourceCode === "MC")?.code).toBe("libraryMissing");
    expect(view.evaluation.lines[0].plan).toMatchObject({ kind: "norm", prices: [{ resourceCode: "VA", newPrice: 10500 }] });
    expect(wb.snapshot().quote.totals?.values[wb.col("Thành tiền")]).toBe(620000);

    // Người dùng chủ động cập nhật: 2,1 × 10.500 + 20.000 + 20.000 = 62.050; × 10 = 620.500; báo giá về nháp.
    const updated = await svc.applyLibraryUpdate("CQ_Quote_1", "LF", view.evaluation.fingerprint);
    expect(updated).toMatchObject({ status: "done", completionCleared: true });
    expect(wb.cell(0, "Đơn giá")).toBe(62050);
    expect(wb.snapshot().quote.totals?.values[wb.col("Thành tiền")]).toBe(630500);

    // Mở lại bằng service mới (đọc lại hồ sơ XML): không mất, không trùng, khớp kết quả.
    const reopened = new QuotationService(new FakePricing(wb) as unknown as PricingGateway, new FakeQuotationGateway(wb), {
      now: () => new Date(),
      newId: () => "X",
      loadLibrary: async () => lib,
    });
    view = await reopened.load("CQ_Quote_1");
    expect(view.state).toBe("draft");
    expect(view.pending).toEqual({ assignIds: 0, removeItems: 0, writeBreakdown: 0 });
    expect(view.evaluation.lines.map((l) => [l.line.lineId, l.result.amount, l.changedSinceLastCalc])).toEqual([
      ["LF", 620500, false],
      ["LM", 10000, false],
    ]);
    const saved = decodeRecord(wb.xml!);
    expect(saved.ok && saved.record.items.map((i) => i.id)).toEqual(["LF", "LM"]);
  });
});

describe("hồ sơ mồ côi (lỗi B1, giai đoạn 18)", () => {
  it("tách hồ sơ khỏi tên bảng: không còn khớp bảng mới cùng tên, dữ liệu giữ nguyên", () => {
    const record = { ...newRecord("Q-old", "CQ_Quote_2", T), status: "completed" as const };
    const xml = encodeRecord(record);
    const detached = detachRecordXml(xml, "2026-10-27T10:00:00.000Z");
    expect(recordTableOf(detached)).toBe("CQ_Quote_2#tách 2026-10-27T10:00:00.000Z");
    const back = decodeRecord(detached);
    expect(back.ok && back.record).toEqual(record);
    // Chỉ đổi thuộc tính của phần tử gốc, không đụng chữ "table=" trong dữ liệu.
    const tricky = encodeRecord({ ...record, items: [manualItem({ id: "x", code: 'table="CQ_Quote_2"', name: "", unit: "", now: T })] });
    const d2 = detachRecordXml(tricky, "N");
    expect(recordTableOf(d2)).toBe("CQ_Quote_2#tách N");
    expect(decodeRecord(d2).ok && (decodeRecord(d2) as { record: QuotationRecord }).record.items[0].workCode).toBe('table="CQ_Quote_2"');
  });
});

describe("hoàn tất báo giá", () => {
  it("chặn khi còn dòng lỗi; hoàn tất khi hợp lệ; sửa sheet sau đó → báo đã sửa; mở lại để sửa", async () => {
    const { wb, service } = setup();
    wb.add({ code: "TC-01", quantity: 2, unitPrice: "" });
    let view = await service.load("CQ_Quote_1");
    await service.recalculate("CQ_Quote_1", view.evaluation.fingerprint);
    view = await service.load("CQ_Quote_1");
    const blocked = await service.complete("CQ_Quote_1", view.evaluation.fingerprint);
    expect(blocked).toMatchObject({ status: "blocked" });
    expect(blocked.status === "blocked" && blocked.reasons).toContain("1 dòng chưa tính được (trạng thái lỗi).");

    wb.setCell(0, "Đơn giá", 1500);
    view = await service.load("CQ_Quote_1");
    expect(await service.complete("CQ_Quote_1", view.evaluation.fingerprint)).toMatchObject({ status: "done" });
    expect((await service.load("CQ_Quote_1")).state).toBe("completed");

    wb.setCell(0, "Khối lượng", 3);
    view = await service.load("CQ_Quote_1");
    expect(view.state).toBe("modifiedAfterCompletion");
    // Tính lại và lưu khi nội dung khác lúc hoàn tất: về nháp.
    expect(await service.recalculate("CQ_Quote_1", view.evaluation.fingerprint)).toMatchObject({ status: "done", completionCleared: true });
    expect((await service.load("CQ_Quote_1")).state).toBe("draft");
    view = await service.load("CQ_Quote_1");
    await service.complete("CQ_Quote_1", view.evaluation.fingerprint);
    expect(await service.reopen("CQ_Quote_1")).toMatchObject({ status: "done" });
    expect((await service.load("CQ_Quote_1")).state).toBe("draft");
  });

  it("đơn giá thành phần bị sửa tay → cảnh báo, không ghi đè; tổng nhóm không cộng dòng chưa tính được", () => {
    const wb = new FakeWorkbook();
    seedNormAnalysis(wb);
    wb.add({ id: "L1", code: "DM-01", group: "Móng", quantity: 1, unitPrice: 60000, notes: NOTE_NORM, breakdown: [1, 2, 3, 4] });
    wb.add({ id: "L2", code: "TC", group: "Móng", quantity: "", unitPrice: 5 });
    wb.add({ id: "L3", code: "TD", group: "Tường", quantity: 2, unitPrice: 5, breakdown: [1, 1, 1, 1] });
    const items = [normRecordItem("L1"), manualItem({ id: "L2", code: "TC", name: "", unit: "", now: T }), manualItem({ id: "L3", code: "TD", name: "", unit: "", now: T })];
    const ev = evaluate(wb, { ...newRecord("Q1", "CQ_Quote_1", T), items });
    expect(ev.lines[0].breakdownWrite).toBeNull();
    expect(ev.lines[0].result.issues.map((i) => i.code)).toContain("breakdownEdited");
    expect(ev.lines[2].result.issues.find((i) => i.code === "breakdownMismatch")?.message).toBe("Tổng đơn giá thành phần (4) khác Đơn giá (5).");
    expect(ev.groups).toEqual([
      { group: "Móng", amount: 60000, lines: 2, uncomputed: 1 },
      { group: "Tường", amount: 10, lines: 2 - 1, uncomputed: 0 },
    ]);
    expect(contentFingerprint(wb.snapshot())).toBe(ev.fingerprint);
  });

  it("đồng bộ thuần: không có thay đổi thì hồ sơ giữ nguyên", () => {
    const wb = new FakeWorkbook();
    wb.add({ id: "L1", code: "A", quantity: 1, unitPrice: 1 });
    const record = { ...newRecord("Q1", "CQ_Quote_1", T), items: [manualItem({ id: "L1", code: "A", name: "", unit: "", now: T })] };
    const result = reconcile(quoteLines(wb.snapshot()).lines, record, { tableName: "CQ_Quote_1", now: T, newId: () => "N" });
    expect(result.changed).toBe(false);
    expect(result.record).toBe(record);
  });
});
