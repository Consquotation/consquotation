import { describe, expect, it } from "vitest";
import { QuoteCheckResult, QuoteSnapshot } from "../../src/domain/pricing/quoteCheck";
import { NO_ROUNDING } from "../../src/domain/pricing/rounding";
import {
  INFO_FIELDS,
  InfoCell,
  InfoKey,
  infoDisplayValue,
  isoToExcelSerial,
  labelMatches,
  planInfoWrites,
  summarizeInfo,
} from "../../src/domain/quoteInfo";
import { QUOTE_COLUMNS, QUOTE_INFO_LABELS } from "../../src/domain/quoteTemplate";
import { quoteFacts, workflowSteps } from "../../src/domain/workflow";
import { excelSerialToIso } from "../../src/domain/library/exchange/cells";

const empty = Object.fromEntries(INFO_FIELDS.map((f) => [f.key, ""])) as Record<InfoKey, string>;

const cell = (key: InfoKey, value: unknown, extra: Partial<InfoCell> = {}): InfoCell => ({
  key,
  found: true,
  address: "D2",
  value,
  text: String(value ?? ""),
  numberFormat: "General",
  ...extra,
});

describe("thông tin báo giá", () => {
  it("đủ 7 mục theo mẫu; 2 mục ngày", () => {
    expect(INFO_FIELDS.map((f) => f.label)).toEqual(QUOTE_INFO_LABELS);
    expect(INFO_FIELDS.filter((f) => f.type === "date").map((f) => f.key)).toEqual(["date", "validUntil"]);
  });

  it("tìm nhãn không phân biệt dấu hai chấm, khoảng trắng, hoa thường", () => {
    expect(labelMatches("Khách hàng:", "Khách hàng:")).toBe(true);
    expect(labelMatches("  khách hàng ", "Khách hàng:")).toBe(true);
    expect(labelMatches("Khách hang:", "Khách hàng:")).toBe(false);
    expect(labelMatches(5, "Khách hàng:")).toBe(false);
  });

  it("ngày ↔ số ngày Excel", () => {
    expect(isoToExcelSerial("2026-06-30")).toBe(46203);
    expect(excelSerialToIso(isoToExcelSerial("2026-10-21"))).toBe("2026-10-21");
    const date = INFO_FIELDS.find((f) => f.key === "date")!;
    expect(infoDisplayValue(date, cell("date", 46203, { numberFormat: "dd/mm/yyyy" }))).toBe("30/06/2026");
    expect(infoDisplayValue(date, cell("date", "30/6/26"))).toBe("30/6/26");
  });

  it("chỉ ghi mục đã đổi; ngày ghi thành số ngày; xóa trống được", () => {
    const current = { ...empty, customer: "Cty A", version: "1" };
    const plan = planInfoWrites({ ...current, customer: "Cty B", date: "21/10/2026", version: "" }, current);
    expect(plan.errors).toEqual([]);
    expect(plan.writes).toEqual([
      { key: "customer", kind: "text", text: "Cty B" },
      { key: "date", kind: "date", serial: isoToExcelSerial("2026-10-21"), iso: "2026-10-21" },
      { key: "version", kind: "clear" },
    ]);
    expect(planInfoWrites(current, current).writes).toEqual([]);
  });

  it("báo lỗi ngày sai và hiệu lực trước ngày lập", () => {
    expect(planInfoWrites({ ...empty, date: "31/02/2026" }, empty).errors[0]).toMatchObject({ key: "date" });
    expect(planInfoWrites({ ...empty, date: "21/10/2026", validUntil: "20/10/2026" }, empty).errors).toEqual([
      { key: "validUntil", message: "Hiệu lực đến phải sau hoặc bằng ngày lập." },
    ]);
  });

  it("tóm tắt: số mục đã điền, nhãn mất, báo giá hết hiệu lực", () => {
    const cells = INFO_FIELDS.map((f) => cell(f.key, ""));
    cells[1] = cell("customer", "Cty A");
    cells[6] = cell("validUntil", isoToExcelSerial("2026-10-01"), { numberFormat: "dd/mm/yyyy" });
    cells[3] = { ...cell("quoteNo", ""), found: false };
    expect(summarizeInfo(cells, "2026-10-21")).toEqual({
      filled: 2,
      total: 7,
      missingLabels: ["quoteNo"],
      expired: "01/10/2026",
    });
    expect(summarizeInfo(cells, "2026-09-30").expired).toBeNull();
  });
});

describe("quy trình báo giá", () => {
  const headers = QUOTE_COLUMNS.map((c) => c.header);
  const row = (values: unknown[]) => ({ values, formulas: values, types: values.map(() => "String") });
  const snapshot = (rows: unknown[][], summaryTotal?: unknown): QuoteSnapshot => ({
    quote: { name: "CQ_Quote_1", sheetName: "S", headers, firstRowIndex: 10, firstColumnIndex: 0, rows: rows.map(row), totals: null },
    summary:
      summaryTotal === undefined
        ? null
        : {
            name: "CQ_Summary_1",
            sheetName: "S",
            headers: ["Khoản mục", "Loại", "Cách tính", "Giá trị", "Số tiền", "Lũy kế"],
            firstRowIndex: 20,
            firstColumnIndex: 3,
            rows: [],
            totals: {
              values: ["Tổng cộng", "", "", "", summaryTotal, ""],
              formulas: [],
              types: ["String", "Empty", "Empty", "Empty", summaryTotal === "#N/A" ? "Error" : "Double", "Empty"],
            },
          },
    analysis: null,
    amountRule: NO_ROUNDING,
  });

  it("đếm dòng công tác, thiếu khối lượng/đơn giá; bỏ qua dòng trống của mẫu", () => {
    const facts = quoteFacts(
      snapshot([
        [1, "A", "", "X", "m3", 1, 2, 2, ""],
        [2, "", "", "Y", "m3", "", 2, "", ""],
        [3, "", "", "Z", "m3", 1, "", "", ""],
        [4, "", "", "", "", "", "", "", ""],
      ])
    );
    expect(facts).toMatchObject({ itemRows: 3, missingQuantity: 1, missingPrice: 1, summary: { kind: "none" } });
    expect(quoteFacts(snapshot([], 1234)).summary).toEqual({ kind: "value", value: 1234 });
    expect(quoteFacts(snapshot([], "#N/A")).summary).toMatchObject({ kind: "error" });
  });

  it("trạng thái từng bước", () => {
    const check = (errors: number): QuoteCheckResult => ({
      issues: Array.from({ length: errors }, () => ({ severity: "error" as const, sheetName: "", address: "", location: "", message: "" })),
      methods: [],
      rowCount: 1,
    });
    const info = { filled: 0, total: 7, missingLabels: [], expired: null };
    const none = workflowSteps({ hasTable: false, headersMatch: false, info: null, facts: null, check: null });
    expect(none.map((s) => s.state)).toEqual(["todo", "optional", "todo", "todo", "todo", "optional", "optional"]);
    const facts = { itemRows: 2, missingQuantity: 0, missingPrice: 1, summary: { kind: "error" as const, error: "#N/A" } };
    const some = workflowSteps({ hasTable: true, headersMatch: true, info: { ...info, expired: "01/10/2026" }, facts, check: check(1) });
    expect(some.map((s) => [s.key, s.state])).toEqual([
      ["template", "done"],
      ["info", "attention"],
      ["items", "done"],
      ["prices", "attention"],
      ["check", "attention"],
      ["summary", "attention"],
      ["finish", "optional"],
    ]);
    const ok = workflowSteps({
      hasTable: true,
      headersMatch: true,
      info: { ...info, filled: 3 },
      facts: { ...facts, missingPrice: 0, summary: { kind: "none" } },
      check: check(0),
    });
    expect(ok.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done", "optional", "optional"]);
  });
});
