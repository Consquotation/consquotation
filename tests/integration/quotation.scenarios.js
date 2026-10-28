// Kịch bản kiểm thử tích hợp quy trình lập báo giá trên Excel thật (giai đoạn 18).
// Chạy bên trong task pane của bản phát triển (npm start) qua DevTools:
//   node tests/integration/run-in-taskpane.mjs tests/integration/quotation.scenarios.js
// Đây là thân của một hàm async; giá trị trả về là kết quả từng tình huống.
//
// Dùng lớp thật: ExcelWorkbookGateway, ExcelPricingGateway, ExcelQuotationGateway, QuotationService.
// Thư viện là dữ liệu giả định TRONG BỘ NHỚ (không ghi IndexedDB). Mọi sheet do kịch bản tạo có tên bắt
// đầu bằng "CQ IT BG", mọi mã công tác/tài nguyên bắt đầu bằng "CQIT-". Kịch bản dừng nếu workbook đã
// có những thứ này, và dọn sạch khi kết thúc (sheet, dòng phân tích, hồ sơ báo giá của các bảng đã tạo).
// Nên chạy trong workbook tạm do npm start mở.

const H = window.__CQ_DEV_QUOTATION__;
if (!H) {
  return { fatal: "Không thấy window.__CQ_DEV_QUOTATION__ — cần bản phát triển (npm start) và task pane đã tải xong." };
}
const NS = "urn:consquotation:quotation";
const PREFIX = "CQ IT BG";
const results = [];
const run = (fn) => Excel.run(fn);
const T = new Date().toISOString();
const today = T.slice(0, 10);
const newId = () => crypto.randomUUID();

async function check(name, fn) {
  const started = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Math.round(performance.now() - started), detail });
  } catch (error) {
    results.push({ name, ok: false, error: `${error.name}: ${error.code ?? ""} ${error.message}` });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: mong đợi ${e}, nhận ${a}`);
}

// ---------- An toàn: không đụng dữ liệu có sẵn ----------
const before = await run(async (ctx) => {
  const sheets = ctx.workbook.worksheets;
  sheets.load("items/name");
  const tables = ctx.workbook.tables;
  tables.load("items/name");
  const analysis = ctx.workbook.tables.getItemOrNullObject("CQ_Analysis");
  analysis.load("name");
  await ctx.sync();
  let analysisCodes = [];
  if (!analysis.isNullObject) {
    const body = analysis.getDataBodyRange();
    body.load("values");
    await ctx.sync();
    analysisCodes = body.values.map((r) => String(r[0]));
  }
  return {
    sheets: sheets.items.map((s) => s.name),
    tables: tables.items.map((t) => t.name),
    hasAnalysis: !analysis.isNullObject,
    analysisCodes,
  };
});
if (before.sheets.some((s) => s.startsWith(PREFIX)) || before.analysisCodes.some((c) => c.startsWith("CQIT-"))) {
  return { fatal: `Workbook đã có sheet "${PREFIX}…" hoặc mã CQIT- trên sheet phân tích. Dừng để không ghi đè.` };
}
const createdTables = [];

// ---------- Thư viện giả định trong bộ nhớ ----------
const stamp = { createdAt: T, updatedAt: T };
const resource = (id, code, type, unit) => ({ id, code, name: `Thử ${code}`, type, categoryId: null, unit, notes: "", ...stamp });
const price = (id, resourceId, value, unit, extra = {}) => ({
  id, resourceId, price: value, unit, currency: "VND", effectiveFrom: null, effectiveTo: null, supplierId: null,
  source: "Giá thử CQIT", status: "active", notes: "", ...stamp, ...extra,
});
const norm = (id, version, status) => ({
  id, code: "CQIT-DM", name: "Định mức thử CQIT", unit: "m3", categoryId: null, workItemId: "w-norm", version,
  effectiveFrom: null, sourceType: "user", source: "", sourceVerified: false, status, wasteIncluded: false, notes: "", ...stamp,
});
const component = (id, normId, r, consumption, wasteRate, priceId = null) => ({
  id, normId, resourceId: r.id, resourceCodeSnapshot: r.code, resourceNameSnapshot: r.name, resourceUnitSnapshot: r.unit,
  resourceTypeSnapshot: r.type, consumption, wasteRate, priceId, sortOrder: 1, notes: "", ...stamp,
});
const RA = resource("r-a", "CQIT-A", "material", "kg");
const RB = resource("r-b", "CQIT-B", "labor", "công");
const RC = resource("r-c", "CQIT-C", "machine", "ca");
const WORK_NORM = {
  id: "w-norm", code: "CQIT-DM", name: "Công tác thử có định mức", categoryId: null, unit: "m3", description: "",
  pricingMethod: "composition", unitPrice: null, currency: "VND", supplierId: null, source: "", effectiveFrom: null,
  effectiveTo: null, notes: "", ...stamp,
};
const lib = {
  categories: [], suppliers: [], workItems: [WORK_NORM], resources: [RA, RB, RC],
  resourcePrices: [
    price("p-a", "r-a", 10000, "kg"),
    price("p-a2", "r-a", 11000, "kg", { source: "Giá thử thứ hai" }),
    price("p-a-ton", "r-a", 9000000, "tấn"),
    price("p-b", "r-b", 40000, "công"),
    price("p-c", "r-c", 80000, "ca"),
  ],
  norms: [norm("n1", "1", "approved")],
  normComponents: [
    component("c-a", "n1", RA, 2, 0.05, "p-a"), // hao hụt 5%; giá áp dụng đã lưu: 10.000
    component("c-b", "n1", RB, 0.5, 0),
    component("c-c", "n1", RC, 0.25, 0),
  ],
};

const gw = new H.ExcelWorkbookGateway();
const pricing = new H.ExcelPricingGateway();
const qg = new H.ExcelQuotationGateway();
const service = () =>
  new H.QuotationService(pricing, qg, { now: () => new Date(), newId, loadLibrary: async () => lib });
let svc = service();

async function createQuote(baseName) {
  const plan = await H.planTemplate(gw, "newSheet", 5, baseName);
  assert(plan.status === "ready", `kế hoạch tạo bảng: ${plan.status}`);
  const result = await H.executeTemplate(gw, plan, 5, { overwrite: false });
  assert(result.status === "created", "không tạo được bảng");
  createdTables.push(result.quote.tableName);
  return result.quote;
}

async function appendLine(tableName, draft, extras, item) {
  const validation = H.validateWorkItemDraft(draft, tableName);
  assert(validation.ok, "dữ liệu công tác không hợp lệ: " + JSON.stringify(validation.errors));
  const plan = await H.planAppend(gw, tableName, { kind: "end" });
  assert(plan.status === "ready", `thêm dòng: ${plan.status}`);
  const appended = await H.executeAppend(gw, plan, [validation.row], { shift: false }, [extras]);
  assert(appended.status === "appended", "không thêm được dòng");
  const registered = await svc.registerInsertedLine(tableName, item);
  assert(registered.saved, "không ghi nhận được hồ sơ: " + registered.reason);
  return appended.rows;
}

async function tableValues(tableName) {
  return run(async (ctx) => {
    const t = ctx.workbook.tables.getItem(tableName);
    const h = t.getHeaderRowRange();
    h.load("values");
    const b = t.getDataBodyRange();
    b.load("values");
    const total = t.getTotalRowRange();
    total.load("values");
    await ctx.sync();
    const headers = h.values[0].map(String);
    const col = (name) => headers.indexOf(name);
    const rows = b.values.filter((r) => r[col("Mã công tác")] !== "");
    return { headers, rows, col, total: total.values[0][col("Thành tiền")] };
  });
}

async function setCell(tableName, code, header, value) {
  await run(async (ctx) => {
    const t = ctx.workbook.tables.getItem(tableName);
    const h = t.getHeaderRowRange();
    h.load("values");
    const b = t.getDataBodyRange();
    b.load("values");
    await ctx.sync();
    const headers = h.values[0].map(String);
    const r = b.values.findIndex((row) => row[headers.indexOf("Mã công tác")] === code);
    assert(r >= 0, `không thấy dòng ${code}`);
    b.getCell(r, headers.indexOf(header)).values = [[value]];
    await ctx.sync();
  });
}

async function records() {
  return run(async (ctx) => {
    const parts = ctx.workbook.customXmlParts.getByNamespace(NS);
    parts.load("items/id");
    await ctx.sync();
    const xmls = parts.items.map((p) => p.getXml());
    await ctx.sync();
    return xmls.map((x) => ({ table: H.recordTableOf(x.value), decoded: H.decodeRecord(x.value), size: x.value.length }));
  });
}

const lineOf = (view, code) => view.evaluation.lines.find((l) => l.line.code === code);
let A; // bảng báo giá chính
let normLineId;

// ======================= Luồng 12 bước =======================

await check("1. Khởi tạo báo giá: bảng 14 cột, Mã dòng ẩn", async () => {
  A = await createQuote(`${PREFIX} A`);
  const info = await run(async (ctx) => {
    const t = ctx.workbook.tables.getItem(A.tableName);
    const h = t.getHeaderRowRange();
    h.load("values");
    const id = t.columns.getItem(H.LINE_ID_HEADER).getRange();
    id.load("columnHidden");
    await ctx.sync();
    return { columns: h.values[0].length, hidden: id.columnHidden };
  });
  eq(info, { columns: 14, hidden: true }, "cấu trúc bảng");
  return A;
});

await check("2. Nhập thông tin công trình (ghi khối thông tin, đọc lại)", async () => {
  const read = await gw.readQuoteInfo(A.tableName);
  const current = Object.fromEntries(read.cells.map((c) => [c.key, typeof c.value === "string" ? c.value : ""]));
  const input = {
    ...current,
    issuer: "Đơn vị thử CQIT",
    preparedBy: "Người lập thử",
    customer: "Khách hàng thử",
    project: "Công trình thử CQIT",
    location: "Địa điểm thử",
    package: "Gói thầu thử",
    quoteNo: "CQIT-BG-01",
    date: "27/10/2026",
    version: "1",
    validUntil: "26/11/2026",
  };
  const plan = H.planInfoWrites(input, current);
  eq(plan.errors, [], "lỗi thông tin");
  await gw.writeQuoteInfo(A.tableName, plan.writes, read.fingerprint);
  const after = await gw.readQuoteInfo(A.tableName);
  const text = Object.fromEntries(after.cells.map((c) => [c.key, c.text]));
  eq([text.customer, text.location, text.package, text.preparedBy, text.quoteNo, text.date, text.validUntil],
    ["Khách hàng thử", "Địa điểm thử", "Gói thầu thử", "Người lập thử", "CQIT-BG-01", "27/10/2026", "26/11/2026"], "thông tin đọc lại");
  return `${plan.writes.length} mục`;
});

await check("3. Thêm công tác nhập tay (Mã dòng + hồ sơ)", async () => {
  const id = newId();
  await appendLine(
    A.tableName,
    { code: "CQIT-TAY", group: "Hoàn thiện", description: "Công tác nhập tay thử", unit: "m2", quantity: "2", unitPrice: "1500", notes: "" },
    { [H.LINE_ID_HEADER]: id },
    H.manualItem({ id, code: "CQIT-TAY", name: "Công tác nhập tay thử", unit: "m2", now: T })
  );
  const v = await tableValues(A.tableName);
  const row = v.rows.find((r) => r[v.col("Mã công tác")] === "CQIT-TAY");
  eq([row[v.col("Khối lượng")], row[v.col("Đơn giá")], row[v.col("Thành tiền")], row[v.col(H.LINE_ID_HEADER)]], [2, 1500, 3000, id], "dòng nhập tay");
});

let lines;
await check("4–5. Chọn định mức đang dùng, đọc thành phần, giá áp dụng", async () => {
  lines = H.compositionLines(WORK_NORM, lib, today);
  eq(lines.map((l) => [l.resource.code, l.resource.type, l.consumption]), [["CQIT-A", "material", 2.1], ["CQIT-B", "labor", 0.5], ["CQIT-C", "machine", 0.25]], "thành phần");
  // CQIT-A có 2 giá dùng được → chọn sẵn giá đã lưu trong định mức; giá theo tấn không dùng được.
  eq(lines.map((l) => l.defaultPriceId), ["p-a", "p-b", "p-c"], "giá chọn sẵn");
  eq(lines[0].options.filter((o) => o.usable).map((o) => o.price.id).sort(), ["p-a", "p-a2"], "giá dùng được của A");
  return "3 thành phần";
});

let written;
let selection;
await check("6. Tính đơn giá công tác (add-in và Excel cùng ra 61.000)", async () => {
  selection = Object.fromEntries(lines.map((l) => [l.component.id, l.defaultPriceId]));
  const comp = H.buildComposition(WORK_NORM, lines, selection, H.DEFAULT_ROUNDING.unitPrice);
  eq([comp.ok, comp.preview], [true, 61000], "tạm tính"); // 2,1×10.000 + 0,5×40.000 + 0,25×80.000
  written = await pricing.writeAnalysis(WORK_NORM.code, comp.rows);
  eq([written.status, written.price], ["written", { kind: "value", value: 61000 }], "đơn giá do Excel tính");
  return written.sheetName;
});

await check("7–8. Nhập khối lượng, ghi dòng phân tích (đơn giá thành phần)", async () => {
  normLineId = newId();
  const breakdown = H.compositionBreakdown(lines, selection);
  eq(breakdown, { material: 21000, labor: 20000, machine: 20000, other: 0 }, "đơn giá theo loại");
  const extras = { [H.LINE_ID_HEADER]: normLineId };
  for (const t of ["material", "labor", "machine", "other"]) extras[H.extensionHeader(H.BREAKDOWN_COLUMNS[t])] = breakdown[t];
  const comp = H.buildComposition(WORK_NORM, lines, selection, H.DEFAULT_ROUNDING.unitPrice);
  const item = H.normItem({ id: normLineId, code: WORK_NORM.code, name: WORK_NORM.name, unit: "m3", now: T }, WORK_NORM, lines, selection, comp.rows);
  await appendLine(
    A.tableName,
    { code: WORK_NORM.code, group: "", description: WORK_NORM.name, unit: "m3", quantity: "10", unitPrice: "61000", notes: H.compositionNote(WORK_NORM, 3, "VND") },
    extras,
    { ...item, writtenBreakdown: breakdown }
  );
});

await check("9. Thành tiền và tổng hợp (Excel và add-in khớp)", async () => {
  const v = await tableValues(A.tableName);
  const row = v.rows.find((r) => r[v.col("Mã công tác")] === WORK_NORM.code);
  eq(["Đơn giá vật liệu", "Đơn giá nhân công", "Đơn giá máy", "Đơn giá khác", "Đơn giá", "Thành tiền"].map((h) => row[v.col(h)]), [21000, 20000, 20000, 0, 61000, 610000], "dòng phân tích");
  eq(v.total, 613000, "tổng Excel");
  const view = await svc.load(A.tableName);
  eq([view.evaluation.counts, view.evaluation.computedTotal, view.evaluation.total.value], [{ valid: 2, validWithWarnings: 0, invalid: 0 }, 613000, 613000], "đánh giá");
  eq(lineOf(view, WORK_NORM.code).result.materialCost, 21000, "chi phí vật liệu");
  eq(view.evaluation.groups.map((g) => [g.group, g.amount]), [["Hoàn thiện", 3000], ["", 610000]], "tổng theo nhóm");
});

await check("10. Ghi/cập nhật workbook: Tính lại và lưu; sửa khối lượng trong Excel", async () => {
  let view = await svc.load(A.tableName);
  const first = await svc.recalculate(A.tableName, view.evaluation.fingerprint);
  eq(first.status, "done", "tính lại");
  await setCell(A.tableName, WORK_NORM.code, "Khối lượng", 12);
  view = await svc.load(A.tableName);
  const line = lineOf(view, WORK_NORM.code);
  eq([line.result.quantity, line.result.unitPrice, line.result.amount, line.changedSinceLastCalc], [12, 61000, 732000, true], "sau khi sửa khối lượng");
  const second = await svc.recalculate(A.tableName, view.evaluation.fingerprint);
  eq(second.status, "done", "lưu lại");
});

await check("11. Lưu: hồ sơ XML trong workbook", async () => {
  const mine = (await records()).filter((r) => r.table === A.tableName);
  eq(mine.length, 1, "số hồ sơ của bảng");
  const record = mine[0].decoded.record;
  eq(record.items.map((i) => [i.pricingMethod, i.result.status, i.result.amount]).sort(), [["manual", "valid", 3000], ["norm", "valid", 732000]], "kết quả lưu");
  const n = record.items.find((i) => i.pricingMethod === "norm");
  eq(n.components.map((c) => [c.resourceCodeSnapshot, c.baseConsumption, c.wasteRate, c.appliedConsumption, c.priceId, c.unitPriceSnapshot]),
    [["CQIT-A", 2, 0.05, 2.1, "p-a", 10000], ["CQIT-B", 0.5, 0, 0.5, "p-b", 40000], ["CQIT-C", 0.25, 0, 0.25, "p-c", 80000]], "snapshot thành phần");
  return `${mine[0].size} ký tự`;
});

await check("12. Mở lại (service và gateway mới đọc từ workbook): dữ liệu khớp, không có việc chờ", async () => {
  svc = service();
  const view = await svc.load(A.tableName);
  eq(view.pending, { assignIds: 0, removeItems: 0, writeBreakdown: 0 }, "việc chờ");
  eq(view.evaluation.lines.map((l) => [l.line.code, l.result.status, l.result.amount, l.changedSinceLastCalc]),
    [["CQIT-TAY", "valid", 3000, false], [WORK_NORM.code, "valid", 732000, false]], "dòng sau khi mở lại");
  const done = await svc.complete(A.tableName, view.evaluation.fingerprint);
  eq(done.status, "done", "hoàn tất");
  eq((await svc.load(A.tableName)).state, "completed", "trạng thái");
});

// ======================= Toàn vẹn dữ liệu =======================

await check("Thư viện đổi giá: báo giá giữ snapshot; cập nhật khi người dùng yêu cầu", async () => {
  lib.resourcePrices = lib.resourcePrices.map((p) => (p.id === "p-a" ? { ...p, price: 12000, updatedAt: new Date().toISOString() } : p));
  let view = await svc.load(A.tableName);
  const line = lineOf(view, WORK_NORM.code);
  eq([view.state, line.result.status, line.result.unitPrice], ["completed", "validWithWarnings", 61000], "trước khi cập nhật");
  assert(line.result.issues.some((i) => i.code === "libraryPriceChanged"), "thiếu cảnh báo giá đổi");
  const v0 = await tableValues(A.tableName);
  eq(v0.rows.find((r) => r[v0.col("Mã công tác")] === WORK_NORM.code)[v0.col("Đơn giá")], 61000, "Excel chưa đổi");
  const outcome = await svc.applyLibraryUpdate(A.tableName, normLineId, view.evaluation.fingerprint);
  eq([outcome.status, outcome.completionCleared], ["done", true], "cập nhật");
  const v = await tableValues(A.tableName);
  const row = v.rows.find((r) => r[v.col("Mã công tác")] === WORK_NORM.code);
  // 2,1 × 12.000 + 20.000 + 20.000 = 65.200; × 12 = 782.400
  eq([row[v.col("Đơn giá vật liệu")], row[v.col("Đơn giá")], row[v.col("Thành tiền")]], [25200, 65200, 782400], "sau cập nhật");
  view = await svc.load(A.tableName);
  eq([view.state, lineOf(view, WORK_NORM.code).result.status], ["draft", "valid"], "trạng thái sau cập nhật");
});

await check("Định mức ngừng dùng, có phiên bản mới; tài nguyên bị xóa khỏi thư viện", async () => {
  lib.norms = [norm("n1", "1", "inactive"), norm("n2", "2", "approved")];
  lib.resources = lib.resources.filter((r) => r.id !== "r-c");
  const view = await svc.load(A.tableName);
  const issues = lineOf(view, WORK_NORM.code).result.issues;
  assert(issues.some((i) => i.code === "normVersionChanged" && i.message.includes("phiên bản 2")), "thiếu cảnh báo phiên bản định mức");
  assert(issues.some((i) => i.code === "libraryMissing" && i.resourceCode === "CQIT-C"), "thiếu cảnh báo tài nguyên bị xóa");
  const v = await tableValues(A.tableName);
  eq(v.rows.find((r) => r[v.col("Mã công tác")] === WORK_NORM.code)[v.col("Đơn giá")], 65200, "báo giá không tự đổi");
  lib.norms = [norm("n1", "1", "approved")];
  lib.resources = [RA, RB, RC];
  return issues.map((i) => i.code);
});

let B;
await check("Nhiều báo giá độc lập: hồ sơ riêng, không ảnh hưởng nhau", async () => {
  const recordA = (await records()).find((r) => r.table === A.tableName).decoded.record;
  B = await createQuote(`${PREFIX} B`);
  const id = newId();
  await appendLine(B.tableName,
    { code: "CQIT-B1", group: "", description: "Dòng của báo giá B", unit: "m", quantity: "4", unitPrice: "250", notes: "" },
    { [H.LINE_ID_HEADER]: id }, H.manualItem({ id, code: "CQIT-B1", name: "Dòng của báo giá B", unit: "m", now: T }));
  const view = await svc.load(B.tableName);
  eq((await svc.recalculate(B.tableName, view.evaluation.fingerprint)).status, "done", "tính lại B");
  const all = await records();
  const a2 = all.find((r) => r.table === A.tableName).decoded.record;
  const b = all.find((r) => r.table === B.tableName).decoded.record;
  eq(a2.updatedAt, recordA.updatedAt, "hồ sơ A không đổi");
  assert(a2.id !== b.id, "hai báo giá trùng id");
  eq(b.items.map((i) => i.id), [id], "mục của B");
  assert(!a2.items.some((i) => i.id === id), "dòng của B lọt vào A");
});

await check("Xóa bảng rồi tạo bảng mới trùng tên: không nhận nhầm hồ sơ cũ (lỗi B1), hồ sơ cũ được giữ", async () => {
  const oldName = B.tableName;
  await run(async (ctx) => {
    ctx.workbook.worksheets.getItem(B.sheetName).delete();
    await ctx.sync();
  });
  const C = await createQuote(`${PREFIX} C`);
  eq(C.tableName, oldName, "tên bảng mới dùng lại tên cũ");
  const view = await svc.load(C.tableName);
  eq([view.state, view.evaluation.lines.length], ["noRecord", 0], "bảng mới");
  const kept = (await records()).filter((r) => r.table && r.table.startsWith(oldName + "#tách"));
  eq(kept.length, 1, "hồ sơ cũ được tách, không bị xóa");
  return C;
});

// ======================= Tình huống Excel =======================

await check("Sheet đổi tên: bảng và hồ sơ vẫn dùng được", async () => {
  await run(async (ctx) => {
    ctx.workbook.worksheets.getItem(A.sheetName).name = `${PREFIX} A đổi tên`;
    await ctx.sync();
  });
  A.sheetName = `${PREFIX} A đổi tên`;
  const view = await svc.load(A.tableName);
  eq([view.sheetName, view.state, view.evaluation.lines.length], [A.sheetName, "draft", 2], "sau khi đổi tên sheet");
});

await check("Bảng không tồn tại: báo lỗi, không tạo gì", async () => {
  const partsBefore = (await records()).length;
  let error = null;
  try {
    await svc.load("CQ_Quote_999");
  } catch (e) {
    error = e;
  }
  assert(error && error.code === "ItemNotFound", "mong đợi ItemNotFound, nhận " + (error && (error.code || error.message)));
  let error2 = null;
  try {
    await svc.recalculate("CQ_Quote_999", "x");
  } catch (e) {
    error2 = e;
  }
  assert(error2 && error2.code === "ItemNotFound", "tính lại trên bảng không tồn tại");
  eq((await records()).length, partsBefore, "không tạo hồ sơ mới");
});

await check("Phạm vi ghi không hợp lệ: dòng ngoài bảng, cột không có → dừng, không ghi", async () => {
  for (const write of [
    { row: 999, header: "Khối lượng", value: 1, expected: "" },
    { row: 0, header: "Cột không có", value: 1, expected: "" },
  ]) {
    let error = null;
    try {
      await qg.writeLineCells(A.tableName, [write], []);
    } catch (e) {
      error = e;
    }
    eq(error && error.name, "TargetChangedError", `ghi ${write.header}`);
  }
});

await check("Ô sai kiểu và ô trống: dòng Lỗi đúng mã, Hoàn tất bị chặn", async () => {
  await setCell(A.tableName, "CQIT-TAY", "Khối lượng", "'abc");
  let view = await svc.load(A.tableName);
  const line = lineOf(view, "CQIT-TAY");
  eq([line.result.status, line.result.amount], ["invalid", null], "dòng chữ");
  assert(line.result.issues.some((i) => i.code === "invalidQuantity"), "thiếu mã invalidQuantity");
  const blocked = await svc.complete(A.tableName, view.evaluation.fingerprint);
  eq(blocked.status, "blocked", "hoàn tất");
  await setCell(A.tableName, "CQIT-TAY", "Khối lượng", "");
  view = await svc.load(A.tableName);
  assert(lineOf(view, "CQIT-TAY").result.issues.some((i) => i.code === "missingQuantity"), "thiếu mã missingQuantity");
  await setCell(A.tableName, "CQIT-TAY", "Khối lượng", 2);
});

await check("Thiếu giá nguồn trên sheet phân tích: dòng Lỗi, chỉ đúng tài nguyên, không thành 0", async () => {
  const restore = await run(async (ctx) => {
    const b = ctx.workbook.tables.getItem("CQ_Analysis").getDataBodyRange();
    b.load("values");
    await ctx.sync();
    const i = b.values.findIndex((r) => r[0] === WORK_NORM.code && r[3] === "CQIT-B");
    const v = b.values[i][8];
    b.getCell(i, 8).values = [[""]];
    await ctx.sync();
    return { i, v };
  });
  const view = await svc.load(A.tableName);
  const r = lineOf(view, WORK_NORM.code).result;
  eq([r.status, r.unitPrice, r.amount, r.laborCost], ["invalid", null, null, null], "kết quả");
  assert(r.issues.some((i) => i.code === "analysisIncomplete" && i.resourceCode === "CQIT-B"), "không chỉ đúng tài nguyên");
  await run(async (ctx) => {
    ctx.workbook.tables.getItem("CQ_Analysis").getDataBodyRange().getCell(restore.i, 8).values = [[restore.v]];
    await ctx.sync();
  });
});

await check("Cấu trúc bảng sai (đổi tên cột Khối lượng): báo lỗi cấu trúc, chặn hoàn tất", async () => {
  await run(async (ctx) => {
    ctx.workbook.tables.getItem(A.tableName).columns.getItem("Khối lượng").name = "KL";
    await ctx.sync();
  });
  const view = await svc.load(A.tableName);
  assert(view.evaluation.tableIssues.some((i) => i.severity === "error" && i.message.includes("Khối lượng")), "không báo cột bị đổi tên");
  eq((await svc.complete(A.tableName, view.evaluation.fingerprint)).status, "blocked", "hoàn tất");
  await run(async (ctx) => {
    ctx.workbook.tables.getItem(A.tableName).columns.getItem("KL").name = "Khối lượng";
    await ctx.sync();
  });
});

await check("Bấm lặp: 5 vòng × 3 lần Tính lại cùng lúc (3 service riêng như 3 task pane) → ô và hồ sơ luôn khớp", async () => {
  const outcomes = [];
  for (let round = 1; round <= 5; round++) {
  // Dòng gõ tay (chưa có Mã dòng) → mọi lần đều muốn gán mã.
  await run(async (ctx) => {
    const t = ctx.workbook.tables.getItem(A.tableName);
    const h = t.getHeaderRowRange();
    h.load("values");
    await ctx.sync();
    const headers = h.values[0].map(String);
    const row = headers.map(() => null);
    row[headers.indexOf("Mã công tác")] = `'CQIT-GO${round}`;
    row[headers.indexOf("Nội dung công việc")] = "Gõ tay trong Excel";
    row[headers.indexOf("Khối lượng")] = 1;
    row[headers.indexOf("Đơn giá")] = 100;
    t.rows.add(null, [row]);
    await ctx.sync();
  });
  const view = await svc.load(A.tableName);
  const results = await Promise.all(
    [svc, service(), service()].map((s) => s.recalculate(A.tableName, view.evaluation.fingerprint).catch((e) => ({ status: "error:" + e.name })))
  );
  outcomes.push(results.map((o) => o.status).join("/"));
  // Sau các lần chạy song song, một lần Tính lại bình thường phải đưa mọi thứ về trạng thái khớp.
  const settle = await svc.load(A.tableName);
  if (settle.pending.assignIds + settle.pending.removeItems > 0) {
    eq((await svc.recalculate(A.tableName, settle.evaluation.fingerprint)).status, "done", "đồng bộ lại");
  }
  const v = await tableValues(A.tableName);
  const ids = v.rows.map((r) => r[v.col(H.LINE_ID_HEADER)]);
  eq(new Set(ids).size, ids.length, `vòng ${round}: Mã dòng không trùng`);
  assert(ids.every((x) => x !== ""), `vòng ${round}: còn dòng chưa có mã`);
  const record = (await records()).find((r) => r.table === A.tableName).decoded.record;
  eq(record.items.map((i) => i.id).sort(), [...ids].sort(), `vòng ${round}: mục hồ sơ khớp dòng`);
  const norm = record.items.find((i) => i.pricingMethod === "norm");
  eq(norm && norm.components.length, 3, `vòng ${round}: dòng phân tích giữ snapshot`);
  }
  return outcomes;
});

await check("Không ghi đè vùng ngoài bảng: ô bên phải có dữ liệu → không thêm cột; chèn dòng cần xác nhận", async () => {
  const C = createdTables[createdTables.length - 1];
  const info = await run(async (ctx) => {
    const t = ctx.workbook.tables.getItem(C);
    const r = t.getRange();
    r.load("rowIndex,columnIndex,rowCount,columnCount");
    t.worksheet.load("name");
    await ctx.sync();
    return { sheet: t.worksheet.name, right: r.columnIndex + r.columnCount, top: r.rowIndex, bottom: r.rowIndex + r.rowCount, left: r.columnIndex };
  });
  // Cách mép bảng một cột: ô sát mép sẽ được Excel tự nới bảng để bao vào (đã kiểm chứng).
  await run(async (ctx) => {
    const s = ctx.workbook.worksheets.getItem(info.sheet);
    s.getCell(info.top + 2, info.right + 1).values = [["ghi chú của người dùng"]];
    s.getCell(info.bottom + 1, info.left + 1).values = [["dữ liệu dưới bảng"]];
    await ctx.sync();
  });
  // Bảng mới đã đủ cột: kiểm tra trên một bảng thiếu cột sẽ bị chặn bởi ô bên phải.
  await run(async (ctx) => {
    ctx.workbook.tables.getItem(C).columns.getItem("Đơn giá khác").delete();
    await ctx.sync();
  });
  const inspection = await qg.inspectExtensionColumns(C);
  eq([inspection.missing, inspection.cellsRight.count > 0], [["Đơn giá khác"], true], "kiểm tra cột");
  let error = null;
  try {
    await qg.addExtensionColumns(C);
  } catch (e) {
    error = e;
  }
  assert(error, "thêm cột lẽ ra phải bị chặn");
  const plan = await H.planAppend(gw, C, { kind: "end" });
  // Mẫu có dòng trống nên thêm 1 dòng không đẩy dữ liệu; thêm nhiều dòng thì cần xác nhận.
  eq([plan.status, plan.inspection.cellsBelow.count > 0], ["ready", true], "kế hoạch thêm dòng");
  const still = await run(async (ctx) => {
    const s = ctx.workbook.worksheets.getItem(info.sheet);
    // Cột "Đơn giá khác" đã bị xóa nên ô của người dùng lùi một cột về bên trái.
    const a = s.getCell(info.top + 2, info.right);
    a.load("values");
    await ctx.sync();
    return a.values[0][0];
  });
  eq(still, "ghi chú của người dùng", "ô của người dùng còn nguyên");
  return error.message;
});

await check("Dữ liệu lớn: 300 dòng gõ trong Excel, Tính lại và lưu", async () => {
  const D = await createQuote(`${PREFIX} D`);
  await run(async (ctx) => {
    const t = ctx.workbook.tables.getItem(D.tableName);
    const h = t.getHeaderRowRange();
    h.load("values");
    await ctx.sync();
    const headers = h.values[0].map(String);
    const rows = Array.from({ length: 300 }, (_v, i) => {
      const row = headers.map(() => null);
      row[headers.indexOf("Mã công tác")] = `'CQIT-L${i + 1}`;
      row[headers.indexOf("Nội dung công việc")] = `Dòng lớn ${i + 1}`;
      row[headers.indexOf("Nhóm công tác")] = `Nhóm ${(i % 5) + 1}`;
      row[headers.indexOf("Đơn vị tính")] = "m2";
      row[headers.indexOf("Khối lượng")] = (i % 7) + 0.5;
      row[headers.indexOf("Đơn giá")] = 1000 + i;
      return row;
    });
    t.rows.add(null, rows);
    await ctx.sync();
  });
  const t0 = performance.now();
  const view = await svc.load(D.tableName);
  const loadMs = Math.round(performance.now() - t0);
  eq([view.evaluation.lines.length, view.pending.assignIds], [300, 300], "đọc 300 dòng");
  const t1 = performance.now();
  eq((await svc.recalculate(D.tableName, view.evaluation.fingerprint)).status, "done", "tính lại");
  const recalcMs = Math.round(performance.now() - t1);
  const after = await svc.load(D.tableName);
  // Tổng tính độc lập: Σ ((i % 7) + 0,5) × (1000 + i), i = 0..299
  let expected = 0;
  for (let i = 0; i < 300; i++) expected += ((i % 7) + 0.5) * (1000 + i);
  eq([after.evaluation.counts.valid, after.evaluation.computedTotal, after.evaluation.total.value], [300, expected, expected], "tổng");
  const size = (await records()).find((r) => r.table === D.tableName).size;
  return { loadMs, recalcMs, recordChars: size };
});

// ---------- Dọn dẹp ----------
const cleanup = await run(async (ctx) => {
  const sheets = ctx.workbook.worksheets;
  sheets.load("items/name");
  await ctx.sync();
  const mine = sheets.items.filter((s) => s.name.startsWith(PREFIX));
  mine.forEach((s) => s.delete());
  const parts = ctx.workbook.customXmlParts.getByNamespace(NS);
  parts.load("items/id");
  await ctx.sync();
  const xmls = parts.items.map((p) => ({ p, x: p.getXml() }));
  await ctx.sync();
  let removed = 0;
  for (const { p, x } of xmls) {
    const table = H.recordTableOf(x.value) || "";
    if (createdTables.some((name) => table === name || table.startsWith(name + "#tách"))) {
      p.delete();
      removed++;
    }
  }
  const analysis = ctx.workbook.tables.getItemOrNullObject("CQ_Analysis");
  analysis.load("name");
  await ctx.sync();
  if (!analysis.isNullObject) {
    if (!before.hasAnalysis) {
      analysis.worksheet.delete();
    } else {
      const body = analysis.getDataBodyRange();
      body.load("values");
      await ctx.sync();
      body.values
        .map((r, i) => (String(r[0]).startsWith("CQIT-") ? i : -1))
        .filter((i) => i >= 0)
        .reverse()
        .forEach((i) => analysis.rows.getItemAt(i).delete());
    }
  }
  await ctx.sync();
  return { sheets: mine.length, records: removed };
});

const failed = results.filter((r) => !r.ok).length;
return { passed: results.length - failed, failed, cleanup, results };
