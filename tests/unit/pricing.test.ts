import { describe, expect, it } from "vitest";
import {
  Adjustment,
  isSummaryTableName,
  quoteTableOfSummary,
  parseSummaryRows,
  summaryAmountFormula,
  summaryRows,
  summaryTableName,
  summaryTotalFormula,
  validateAdjustments,
} from "../../src/domain/pricing/adjustments";
import { analysisLineAmountFormula, analysisUnitPriceFormula } from "../../src/domain/pricing/analysis";
import { sameFormula } from "../../src/domain/pricing/formulaText";
import {
  COMPOSITION_NOTE_PREFIX,
  buildComposition,
  compositionLines,
  defaultSelection,
} from "../../src/domain/pricing/composition";
import { QuoteSnapshot, SheetRow, TableSnapshot, checkQuote } from "../../src/domain/pricing/quoteCheck";
import {
  ALL_RULES,
  DEFAULT_ROUNDING,
  NO_ROUNDING,
  describeRule,
  normalizeRounding,
  roundLikeExcel,
  wrapRounding,
} from "../../src/domain/pricing/rounding";
import { LibrarySnapshot } from "../../src/domain/library/types";
import { QUOTE_COLUMNS, quoteColumnFormulas, totalRowFormulas } from "../../src/domain/quoteTemplate";

describe("làm tròn", () => {
  it("mặc định không làm tròn; cấu hình hỏng → không làm tròn (không đoán)", () => {
    expect(normalizeRounding(undefined)).toEqual(DEFAULT_ROUNDING);
    expect(normalizeRounding({ amount: { mode: "round", digits: 99 } }).amount).toEqual(NO_ROUNDING);
    expect(normalizeRounding({ amount: { mode: "round", digits: -3 } }).amount).toEqual({ mode: "round", digits: -3 });
  });

  it("bọc bằng hàm Excel theo kiểu làm tròn", () => {
    expect(wrapRounding("A*B", NO_ROUNDING)).toBe("A*B");
    expect(wrapRounding("A*B", { mode: "round", digits: 0 })).toBe("ROUND(A*B,0)");
    expect(wrapRounding("A*B", { mode: "roundUp", digits: -3 })).toBe("ROUNDUP(A*B,-3)");
    expect(wrapRounding("A*B", { mode: "roundDown", digits: 2 })).toBe("ROUNDDOWN(A*B,2)");
  });

  it("tạm tính giống ROUND/ROUNDUP/ROUNDDOWN của Excel (đối xứng quanh 0, không lỗi số thực)", () => {
    expect(roundLikeExcel(1.005, { mode: "round", digits: 2 })).toBe(1.01);
    expect(roundLikeExcel(2.5, { mode: "round", digits: 0 })).toBe(3);
    expect(roundLikeExcel(-2.5, { mode: "round", digits: 0 })).toBe(-3);
    expect(roundLikeExcel(1234567.5, { mode: "round", digits: -3 })).toBe(1235000);
    expect(roundLikeExcel(1001, { mode: "roundUp", digits: -3 })).toBe(2000);
    expect(roundLikeExcel(-1001, { mode: "roundUp", digits: -3 })).toBe(-2000);
    expect(roundLikeExcel(1999.99, { mode: "roundDown", digits: 0 })).toBe(1999);
    expect(roundLikeExcel(0.1 + 0.2, { mode: "round", digits: 1 })).toBe(0.3);
    expect(roundLikeExcel(5, NO_ROUNDING)).toBe(5);
  });

  it("mô tả rõ độ chính xác và kiểu làm tròn", () => {
    expect(describeRule({ mode: "round", digits: -3 })).toContain("hàng nghìn");
    expect(describeRule({ mode: "round", digits: -3 })).toContain("ROUND");
    expect(describeRule({ mode: "roundDown", digits: 2 })).toContain("2 chữ số thập phân");
    expect(describeRule(NO_ROUNDING)).toBe("Không làm tròn");
  });

  it("công thức Thành tiền: trống khi thiếu số liệu; làm tròn ở cấp Thành tiền", () => {
    expect(quoteColumnFormulas("CQ_Quote_1").amount).toBe(
      '=IF(OR([@[Khối lượng]]="",[@[Đơn giá]]=""),"",[@[Khối lượng]]*[@[Đơn giá]])'
    );
    expect(quoteColumnFormulas("CQ_Quote_1", { mode: "round", digits: 0 }).amount).toBe(
      '=IF(OR([@[Khối lượng]]="",[@[Đơn giá]]=""),"",ROUND([@[Khối lượng]]*[@[Đơn giá]],0))'
    );
  });
});

describe("bảng tổng hợp (chiết khấu, phụ phí, thuế)", () => {
  const vat: Adjustment = { name: "Thuế GTGT", kind: "add", method: "percentOfRunning", value: 8 };
  const discount: Adjustment = { name: "Chiết khấu", kind: "deduct", method: "percentOfRunning", value: 5 };

  it("không có khoản nào mặc định; dòng đầu là giá trị báo giá", () => {
    const rows = summaryRows("CQ_Quote_2", [], NO_ROUNDING);
    expect(rows).toHaveLength(1);
    expect(rows[0].slice(0, 3)).toEqual(["Cộng giá trị báo giá", "Cộng", "Theo bảng báo giá"]);
  });

  it("thứ tự áp dụng = thứ tự dòng; tên ghi dạng chữ", () => {
    const rows = summaryRows("CQ_Quote_2", [discount, vat], NO_ROUNDING);
    expect(rows.map((r) => r[0])).toEqual(["Cộng giá trị báo giá", "'Chiết khấu", "'Thuế GTGT"]);
    expect(rows[2].slice(1, 4)).toEqual(["Cộng thêm", "% trên lũy kế", 8]);
    expect(summaryRows("CQ_Quote_2", [{ ...vat, value: null }], NO_ROUNDING)[1][3]).toBe("");
  });

  it("công thức: lỗi khi ô tổng báo giá trống hoặc loại/cách tính sai; làm tròn từng khoản", () => {
    const f = summaryAmountFormula("CQ_Quote_2", { mode: "round", digits: 0 });
    expect(f).toContain('IF(CQ_Quote_2[[#Totals],[Thành tiền]]="",NA(),CQ_Quote_2[[#Totals],[Thành tiền]])');
    expect(f).toContain('IF([@[Giá trị]]="",""');
    expect(f).toContain("ROUND(IF([@[Loại]]=");
    expect(f).toContain("NA()))");
    expect(f).toContain("OFFSET([@[Lũy kế]],-1,0)");
    expect(summaryTotalFormula("CQ_Summary_2")).toBe(
      "=IF(COUNTBLANK(CQ_Summary_2[Lũy kế])>0,NA(),INDEX(CQ_Summary_2[Lũy kế],ROWS(CQ_Summary_2[Lũy kế])))"
    );
    expect(summaryTableName("CQ_Quote_12")).toBe("CQ_Summary_12");
    expect(isSummaryTableName("CQ_Summary_12")).toBe(true);
    expect(isSummaryTableName("CQ_Summary_d")).toBe(false);
    expect(quoteTableOfSummary("CQ_Summary_12")).toBe("CQ_Quote_12");
  });

  it("đọc lại cấu hình từ sheet; dòng sai bị đánh dấu", () => {
    const parsed = parseSummaryRows([
      ["Cộng giá trị báo giá", "Cộng", "Theo bảng báo giá", "", 100, 100],
      ["Chiết khấu", "Giảm trừ", "% trên lũy kế", 5, -5, 95],
      ["Phí", "giam tru", "Số tiền", 10, "#N/A", "#N/A"],
      ["Thuế", "Cộng thêm", "% trên lũy kế", "", "", "#N/A"],
    ]);
    expect(parsed.adjustments).toEqual([
      { name: "Chiết khấu", kind: "deduct", method: "percentOfRunning", value: 5 },
      { name: "Thuế", kind: "add", method: "percentOfRunning", value: null },
    ]);
    expect(parsed.invalidRows).toEqual([2]);
  });

  it("kiểm tra: tên bắt buộc, giá trị không âm, giảm trừ % ≤ 100", () => {
    expect(validateAdjustments([discount, vat])).toEqual([]);
    expect(
      validateAdjustments([
        { ...discount, name: " " },
        { ...discount, value: -1 },
        { ...discount, value: 120 },
        { ...vat, value: 120 },
      ]).map((e) => [e.index, e.field])
    ).toEqual([
      [0, "name"],
      [1, "value"],
      [2, "value"],
    ]);
  });
});

describe("phân tích đơn giá từ định mức", () => {
  const stamp = { createdAt: "", updatedAt: "" };
  const library: LibrarySnapshot = {
    categories: [],
    suppliers: [],
    workItems: [
      {
        id: "w1", code: "007", name: "Bê tông lót", categoryId: null, supplierId: null, unit: "m3", description: "",
        pricingMethod: "direct", unitPrice: null, currency: "", source: "", effectiveFrom: null,
        effectiveTo: null, notes: "", ...stamp,
      },
    ],
    resources: [
      { id: "xm", code: "XM", name: "Xi măng", type: "material", categoryId: null, unit: "kg", notes: "", ...stamp },
      { id: "nc", code: "NC", name: "Nhân công", type: "labor", categoryId: null, unit: "công", notes: "", ...stamp },
      { id: "ca", code: "CAT", name: "Cát", type: "material", categoryId: null, unit: "m3", notes: "", ...stamp },
    ],
    resourcePrices: [
      { id: "p1", resourceId: "xm", price: 1500, unit: "kg", currency: "VND", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", supplierId: null, source: "NCC A", status: "active", notes: "", ...stamp },
      { id: "p2", resourceId: "xm", price: 1.5, unit: "tấn", currency: "VND", effectiveFrom: null, effectiveTo: null, supplierId: null, source: "", status: "active", notes: "", ...stamp },
      { id: "p3", resourceId: "nc", price: 300000, unit: "công", currency: "VND", effectiveFrom: null, effectiveTo: null, supplierId: null, source: "", status: "active", notes: "", ...stamp },
      { id: "p4", resourceId: "nc", price: 320000, unit: "công", currency: "VND", effectiveFrom: "2026-07-01", effectiveTo: null, supplierId: null, source: "", status: "active", notes: "", ...stamp },
      { id: "p5", resourceId: "ca", price: 10, unit: "m3", currency: "USD", effectiveFrom: null, effectiveTo: null, supplierId: null, source: "", status: "active", notes: "", ...stamp },
    ],
    norms: [
      { id: "n1", workItemId: "w1", resourceId: "xm", quantity: 230.5, notes: "", ...stamp },
      { id: "n2", workItemId: "w1", resourceId: "nc", quantity: 1.25, notes: "", ...stamp },
    ],
  };
  const item = library.workItems[0];
  const today = "2026-10-21";

  it("chỉ chọn sẵn khi có đúng một giá dùng được; nhiều giá → người dùng tự chọn", () => {
    const lines = compositionLines(item, library, today);
    const xm = lines.find((l) => l.norm.id === "n1")!;
    const nc = lines.find((l) => l.norm.id === "n2")!;
    expect(xm.defaultPriceId).toBe("p1");
    expect(xm.options.find((o) => o.price.id === "p2")!.unitMatches).toBe(false);
    expect(nc.defaultPriceId).toBeNull();
    expect(defaultSelection(lines)).toEqual({ n1: "p1", n2: "" });
  });

  it("thiếu giá → đơn giá để trống (không phải 0), vẫn ghi dòng phân tích để nhập sau", () => {
    const lines = compositionLines(item, library, today);
    const result = buildComposition(item, lines, defaultSelection(lines), NO_ROUNDING);
    expect(result.ok).toBe(true);
    expect(result.preview).toBeNull();
    expect(result.missingCount).toBe(1);
    expect(result.rows).toHaveLength(2);
    const nc = result.rows[1];
    expect(nc[8]).toBe("");
    expect(nc[11]).toBe("'Chưa chọn giá — nhập Đơn giá nguồn");
  });

  it("đủ giá → tạm tính theo quy tắc làm tròn; mã/chữ ghi dạng chữ; công thức Excel cho từng dòng", () => {
    const lines = compositionLines(item, library, today);
    const result = buildComposition(item, lines, { n1: "p1", n2: "p3" }, { mode: "round", digits: -3 });
    expect(result.preview).toBe(721000); // 230,5×1500 + 1,25×300000 = 720750
    expect(result.currency).toBe("VND");
    const row = result.rows[0];
    expect(row.slice(0, 7)).toEqual(["'007", "'Bê tông lót", "'m3", "'XM", "'Xi măng", "Vật liệu", "'kg"]);
    expect(row[7]).toBe(230.5);
    expect(row[8]).toBe(1500);
    expect(row[9]).toBe(analysisLineAmountFormula());
    expect(row[10]).toBe(analysisUnitPriceFormula({ mode: "round", digits: -3 }));
    expect(String(row[11])).toContain("NCC A; hiệu lực 01/01/2026 – 31/12/2026; VND");
  });

  it("chặn giá khác đơn vị và giá khác tiền tệ", () => {
    const lines = compositionLines(item, library, today);
    expect(buildComposition(item, lines, { n1: "p2", n2: "p3" }, NO_ROUNDING).errors.join()).toContain("khác đơn vị");
    const withSand = { ...library, norms: [...library.norms, { id: "n3", workItemId: "w1", resourceId: "ca", quantity: 1, notes: "", ...stamp }] };
    const lines2 = compositionLines(item, withSand, today);
    expect(buildComposition(item, lines2, { n1: "p1", n2: "p3", n3: "p5" }, NO_ROUNDING).errors.join()).toContain("khác tiền tệ");
  });

  it("so khớp mã chính xác bằng SUMPRODUCT (không dùng tiêu chí COUNTIFS)", () => {
    const f = analysisUnitPriceFormula(NO_ROUNDING);
    expect(f).not.toMatch(/COUNTIFS|SUMIFS/);
    expect(f).toBe(
      '=IF(SUMPRODUCT(--(CQ_Analysis[Mã công tác]=[@[Mã công tác]]),--(CQ_Analysis[Thành tiền]=""))>0,"",SUMPRODUCT(--(CQ_Analysis[Mã công tác]=[@[Mã công tác]]),CQ_Analysis[Thành tiền]))'
    );
  });
});

describe("so sánh công thức đọc lại từ Excel", () => {
  it("Excel rút gọn tham chiếu tới chính bảng chứa ô", () => {
    expect(sameFormula("=SUBTOTAL(109,[Thành tiền])", "=SUBTOTAL(109,CQ_Quote_1[Thành tiền])", "CQ_Quote_1")).toBe(true);
    expect(sameFormula("=ROW()-ROW(CQ_Quote_1[#Headers])", "=ROW()-ROW(CQ_Quote_1[#Headers])", "CQ_Quote_1")).toBe(true);
    expect(sameFormula("=SUBTOTAL(109,[Thành tiền])", "=SUBTOTAL(109,CQ_Quote_2[Thành tiền])", "CQ_Quote_1")).toBe(false);
    expect(sameFormula(100, "=1", "T")).toBe(false);
  });
});

describe("kiểm tra báo giá", () => {
  const headers = QUOTE_COLUMNS.map((c) => c.header);
  const amount = quoteColumnFormulas("CQ_Quote_1").amount!;
  const row = (values: unknown[], overrides: Partial<SheetRow> = {}): SheetRow => ({
    values,
    formulas: values.map((v, i) => (i === 7 ? amount : i === 0 ? "=ROW()-ROW(CQ_Quote_1[#Headers])" : v)),
    types: values.map((v) => (typeof v === "number" ? "Double" : v === "" ? "Empty" : String(v).startsWith("#") ? "Error" : "String")),
    ...overrides,
  });
  const totals: SheetRow = {
    values: ["", "", "", "Tổng cộng", "", "", "", 100, ""],
    // Dạng Excel trả về: tham chiếu tới chính bảng bị rút gọn.
    formulas: totalRowFormulas("CQ_Quote_1").map((f) => f.replace("CQ_Quote_1[", "[")),
    types: ["Empty", "Empty", "Empty", "String", "Empty", "Empty", "Empty", "Double", "Empty"],
  };
  const quote = (rows: SheetRow[], t: SheetRow | null = totals): TableSnapshot => ({
    name: "CQ_Quote_1",
    sheetName: "Báo giá",
    headers,
    firstRowIndex: 10,
    firstColumnIndex: 0,
    rows,
    totals: t,
  });
  const snap = (q: TableSnapshot, extra: Partial<QuoteSnapshot> = {}): QuoteSnapshot => ({
    quote: q,
    summary: null,
    analysis: null,
    amountRule: NO_ROUNDING,
    ...extra,
  });

  it("dòng trống không tính là công tác (chỉ nhắc còn dòng trống); dòng đủ dữ liệu không có vấn đề", () => {
    const result = checkQuote(snap(quote([row([1, "A", "", "Đào đất", "m3", 2, 50, 100, ""]), row([2, "", "", "", "", "", "", "", ""])])));
    expect(result.issues.map((i) => i.message)).toEqual(["Còn 1 dòng trống trong bảng (hàng 12) — khi in vẫn hiện số thứ tự."]);
    expect(result.rowCount).toBe(1);
    expect(result.methods[0].method).toBe("direct");
  });

  it("phân biệt trống, 0, chữ và lỗi; chỉ đúng ô", () => {
    const result = checkQuote(
      snap(
        quote([
          row([1, "A", "", "Thiếu KL", "m3", "", 50, "", ""]),
          row([2, "B", "", "Giá 0", "m3", 1, 0, 0, ""]),
          row([3, "C", "", "Giá chữ", "m3", 1, "1.500.000", "#VALUE!", ""]),
          row([4, "D", "", "Chia 0", "m3", 1, "#DIV/0!", "#DIV/0!", ""]),
        ])
      )
    );
    const msg = (address: string) => result.issues.filter((i) => i.address === address).map((i) => i.message);
    expect(msg("F11")[0]).toContain("Thiếu khối lượng");
    expect(msg("G12")[0]).toContain("bằng 0 (khác với để trống)");
    expect(msg("G13")[0]).toContain("không phải số");
    expect(msg("H13")[0]).toContain("#VALUE!");
    expect(msg("G14")[0]).toContain("#DIV/0! — chia cho 0");
    expect(result.issues.find((i) => i.address === "G14")!.severity).toBe("error");
  });

  it("Thành tiền bị gõ đè hoặc khác quy tắc làm tròn hiện tại; tổng bị sửa", () => {
    const typed = row([1, "A", "", "X", "m3", 2, 50, 100, ""]);
    typed.formulas[7] = 100;
    const result = checkQuote(
      snap(quote([typed, row([2, "B", "", "Y", "m3", 1, 1, 1, ""])], { ...totals, formulas: totals.formulas.map((f, i) => (i === 7 ? "=SUM(H11:H12)" : f)) }), {
        amountRule: { mode: "round", digits: 0 },
      })
    );
    const messages = result.issues.map((i) => `${i.address}: ${i.message}`);
    expect(messages).toContain("H11: Thành tiền bị gõ đè bằng số, không còn tự tính theo khối lượng × đơn giá.");
    expect(messages.some((m) => m.startsWith("H12: Công thức Thành tiền khác mẫu"))).toBe(true);
    expect(messages.some((m) => m.startsWith("H13: Công thức tổng Thành tiền khác mẫu"))).toBe(true);
  });

  it("đơn giá phân tích lệch sheet phân tích → đề xuất cập nhật; phân tích thiếu số liệu → cảnh báo", () => {
    const note = `${COMPOSITION_NOTE_PREFIX} 007 (sheet "Phân tích đơn giá")`;
    const line = (code: string, unitPrice: unknown, priceBlank = false) => ({
      code, rowIndex: 4, sheetName: "Phân tích đơn giá", quantityBlank: false, priceBlank,
      unitPrice, unitPriceType: unitPrice === "" ? "Empty" : typeof unitPrice === "number" ? "Double" : "Error", priceAddress: "I5",
    });
    const q = quote([
      row([1, "007", "", "BT", "m3", 1, 700000, 700000, note]),
      row([2, "009", "", "BT2", "m3", 1, "", "", note.replace("007", "009")]),
    ]);
    const result = checkQuote(snap(q, { analysis: [line("007", 721000), line("009", "", true)] }));
    const fix = result.issues.find((i) => i.fix);
    expect(fix).toMatchObject({ address: "G11", fix: { kind: "setUnitPrice", value: 721000, previous: 700000 } });
    expect(result.issues.map((i) => i.message)).toContain('Phân tích mã "009": thiếu đơn giá nguồn.');
    expect(result.methods.map((m) => m.method)).toEqual(["composition", "composition"]);
  });

  it("tổng hợp: giá trị trống, loại sai, ô tổng lỗi", () => {
    const summary: TableSnapshot = {
      name: "CQ_Summary_1",
      sheetName: "Báo giá",
      headers: ["Khoản mục", "Loại", "Cách tính", "Giá trị", "Số tiền", "Lũy kế"],
      firstRowIndex: 20,
      firstColumnIndex: 3,
      rows: [
        { values: ["Cộng giá trị báo giá", "Cộng", "Theo bảng báo giá", "", 100, 100], formulas: ["", "", "", "", "=x", "=y"], types: ["String", "String", "String", "Empty", "Double", "Double"] },
        { values: ["Thuế", "Cộng thêm", "% trên lũy kế", "", "", "#N/A"], formulas: ["", "", "", "", "=x", "=y"], types: ["String", "String", "String", "Empty", "Empty", "Error"] },
        { values: ["Phí", "giam tru", "Số tiền", 5, "#N/A", "#N/A"], formulas: ["", "", "", 5, "=x", "=y"], types: ["String", "String", "String", "Double", "Error", "Error"] },
      ],
      totals: { values: ["Tổng cộng", "", "", "", "#N/A", ""], formulas: ["Tổng cộng", "", "", "", "=x", ""], types: ["String", "Empty", "Empty", "Empty", "Error", "Empty"] },
    };
    const result = checkQuote(snap(quote([row([1, "A", "", "X", "m3", 1, 100, 100, ""])]), { summary }));
    const messages = result.issues.map((i) => `${i.address}: ${i.message}`);
    expect(messages).toContain('G22: Tổng hợp "Thuế": chưa nhập giá trị — Tổng cộng chưa tính được.');
    expect(messages).toContain('E23: Tổng hợp "Phí": Loại phải là Giảm trừ hoặc Cộng thêm.');
    expect(messages.some((m) => m.startsWith("H24: Tổng cộng (sau chiết khấu/phụ phí/thuế) lỗi #N/A"))).toBe(true);
    expect(result.issues.every((i) => i.hint && i.hint.length > 0)).toBe(true);
  });
});

describe("công thức mẫu với Excel đã viết lại", () => {
  it("Excel bỏ ngoặc tên cột không có dấu cách: [@[Loại]] → [@Loại]", () => {
    const expected = summaryAmountFormula("CQ_Quote_1", NO_ROUNDING);
    const asExcelStores = expected.replace(/\[@\[Loại\]\]/g, "[@Loại]");
    expect(asExcelStores).not.toBe(expected);
    expect(sameFormula(asExcelStores, expected, "CQ_Summary_1")).toBe(true);
    expect(sameFormula("=[@[Khối lượng]]", "=[@Khối lượng]", "T")).toBe(false);
  });

  it("đủ mọi biến thể quy tắc để nhận ra công thức mẫu cũ", () => {
    expect(ALL_RULES).toHaveLength(1 + 3 * 16);
    expect(ALL_RULES).toContainEqual({ mode: "roundDown", digits: -9 });
    expect(ALL_RULES).toContainEqual({ mode: "roundUp", digits: 6 });
  });
});

describe("kiểm tra báo giá — bổ sung prompts/13", () => {
  const headers = QUOTE_COLUMNS.map((c) => c.header);
  const amount = quoteColumnFormulas("CQ_Quote_1").amount!;
  const row = (values: unknown[]): SheetRow => ({
    values,
    formulas: values.map((v, i) => (i === 7 ? amount : v)),
    types: values.map((v) => (typeof v === "number" ? "Double" : v === "" ? "Empty" : String(v).startsWith("#") ? "Error" : "String")),
  });
  const snap = (rows: SheetRow[]): QuoteSnapshot => ({
    quote: { name: "CQ_Quote_1", sheetName: "S", headers, firstRowIndex: 10, firstColumnIndex: 0, rows, totals: null },
    summary: null,
    analysis: null,
    amountRule: NO_ROUNDING,
  });
  const stamp = { createdAt: "", updatedAt: "" };
  const library: LibrarySnapshot = {
    categories: [],
    suppliers: [],
    workItems: [
      { id: "w", code: "BT-01", name: "", categoryId: null, supplierId: null, unit: "m3", description: "", pricingMethod: "direct", unitPrice: 1200, currency: "VND", source: "", effectiveFrom: null, effectiveTo: null, notes: "", ...stamp },
    ],
    resources: [],
    resourcePrices: [],
    norms: [],
  };

  it("thiếu đơn vị tính; giá trị lớn bất thường; mọi vấn đề có hướng khắc phục", () => {
    const result = checkQuote(snap([row([1, "A", "", "X", "", 2, 2e11, 4e11, ""]), row([2, "B", "", "Y", "m3", 2e7, 1, 2e7, ""])]));
    const by = (address: string) => result.issues.find((i) => i.address === address)!;
    expect(by("E11").message).toBe("Thiếu đơn vị tính.");
    expect(by("G11").message).toContain("lớn bất thường");
    expect(by("F12").message).toContain("lớn bất thường");
    expect(result.issues.every((i) => i.hint && i.hint.length > 0)).toBe(true);
  });

  it("còn dòng trống của mẫu khi đã có công tác: cảnh báo kèm hàng; bảng chưa có công tác thì không", () => {
    const blank = row([2, "", "", "", "", "", "", "", ""]);
    const result = checkQuote(snap([row([1, "A", "", "X", "m3", 1, 2, 2, ""]), blank]));
    const issue = result.issues.find((i) => i.message.startsWith("Còn 1 dòng trống"));
    expect(issue?.address).toBe("A12");
    expect(issue?.hint).toContain("Delete › Table Rows");
    expect(checkQuote(snap([blank])).issues.filter((i) => i.message.startsWith("Còn"))).toEqual([]);
  });

  it("lỗi công thức có hướng khắc phục theo loại lỗi", () => {
    const result = checkQuote(snap([row([1, "A", "", "X", "m3", 1, "#DIV/0!", "#DIV/0!", ""])]));
    expect(result.issues[0].hint).toContain("mẫu số");
  });

  it("dòng lấy từ thư viện: báo khi đơn giá khác thư viện hiện tại hoặc mã không còn", () => {
    const rows = [
      row([1, "BT-01", "", "X", "m3", 1, 1000, 1000, "Thư viện: BT-01; nguồn giá: A"]),
      row([2, "XX", "", "Y", "m3", 1, 5, 5, "Thư viện: XX"]),
      row([3, "BT-01", "", "Z", "m3", 1, 1200, 1200, "Thư viện: BT-01"]),
    ];
    const result = checkQuote(snap(rows), { library });
    const priceIssues = result.issues.filter((i) => i.address.startsWith("G"));
    expect(priceIssues.map((i) => i.message)).toEqual([
      "Đơn giá 1.000 khác đơn giá hiện tại trong thư viện 1.200.",
      'Không còn công tác mã "XX" trong thư viện trên máy này.',
    ]);
    // Không có thư viện → không so.
    expect(checkQuote(snap(rows)).issues.filter((i) => i.address.startsWith("G"))).toEqual([]);
  });
});

describe("kiểm tra báo giá — cột mẫu bị đổi (lỗi tìm thấy khi chạy regression)", () => {
  it("không crash; báo lỗi chặn nêu đúng cột", () => {
    const headers = QUOTE_COLUMNS.map((c) => c.header);
    headers[6] = "1000000";
    const result = checkQuote({
      quote: { name: "CQ_Quote_4", sheetName: "S", headers, firstRowIndex: 10, firstColumnIndex: 0, rows: [{ values: [1, "A", "", "X", "m3", 1, 2, 2, ""], formulas: [], types: [] }], totals: null },
      summary: null,
      analysis: null,
      amountRule: NO_ROUNDING,
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: "error", address: "A10" });
    expect(result.issues[0].message).toContain("Đơn giá");
  });
});
