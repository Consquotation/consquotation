/**
 * Tình trạng các bước của quy trình báo giá (prompts/07), tính từ dữ liệu ĐỌC LẠI từ workbook
 * mỗi lần (không lưu trạng thái nháp/đã kiểm tra/đã phát hành — chưa có yêu cầu và logic rõ ràng).
 */

import { QuoteCheckResult, QuoteSnapshot, explainError } from "./pricing/quoteCheck";
import { InfoSummary } from "./quoteInfo";
import { QUOTE_COLUMNS, QuoteColumnKey } from "./quoteTemplate";

export type StepKey = "template" | "info" | "items" | "prices" | "check" | "summary" | "finish";
export type StepState = "done" | "todo" | "attention" | "optional";

export interface StepStatus {
  key: StepKey;
  state: StepState;
}

export interface QuoteFacts {
  itemRows: number;
  missingQuantity: number;
  missingPrice: number;
  summary: { kind: "none" } | { kind: "value"; value: number } | { kind: "error"; error: string };
}

function isBlank(value: unknown): boolean {
  return value === "" || value === null || value === undefined;
}

/** Số liệu cho các bước 5–6 và phần tổng hợp, đọc từ ảnh chụp bảng. */
export function quoteFacts(snapshot: QuoteSnapshot): QuoteFacts {
  const { quote, summary } = snapshot;
  const col = (key: QuoteColumnKey) =>
    quote.headers.indexOf(QUOTE_COLUMNS.find((c) => c.key === key)!.header);
  const meaningful = (["code", "description", "quantity", "unitPrice", "notes"] as const).map(col);
  const rows = quote.rows.filter((row) => meaningful.some((c) => !isBlank(row.values[c])));
  let summaryFact: QuoteFacts["summary"] = { kind: "none" };
  if (summary?.totals) {
    const amount = summary.headers.indexOf("Số tiền");
    const value = summary.totals.values[amount];
    summaryFact =
      summary.totals.types[amount] === "Error"
        ? { kind: "error", error: explainError(value) }
        : typeof value === "number"
          ? { kind: "value", value }
          : { kind: "error", error: "(trống)" };
  }
  return {
    itemRows: rows.length,
    missingQuantity: rows.filter((r) => isBlank(r.values[col("quantity")])).length,
    missingPrice: rows.filter((r) => isBlank(r.values[col("unitPrice")])).length,
    summary: summaryFact,
  };
}

export function workflowSteps(input: {
  hasTable: boolean;
  headersMatch: boolean;
  info: InfoSummary | null;
  facts: QuoteFacts | null;
  check: QuoteCheckResult | null;
}): StepStatus[] {
  const { hasTable, headersMatch, info, facts, check } = input;
  const errors = check?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warnings = check?.issues.filter((i) => i.severity === "warning").length ?? 0;
  return [
    { key: "template", state: !hasTable ? "todo" : headersMatch ? "done" : "attention" },
    {
      key: "info",
      state: !info
        ? "optional"
        : info.expired || info.missingLabels.length > 0
          ? "attention"
          : info.filled > 0
            ? "done"
            : "optional",
    },
    { key: "items", state: !facts || facts.itemRows === 0 ? "todo" : "done" },
    {
      key: "prices",
      state:
        !facts || facts.itemRows === 0
          ? "todo"
          : facts.missingQuantity + facts.missingPrice > 0
            ? "attention"
            : "done",
    },
    {
      key: "check",
      state:
        !check || facts?.itemRows === 0 ? "todo" : errors + warnings > 0 ? "attention" : "done",
    },
    {
      key: "summary",
      state:
        !facts || facts.summary.kind === "none"
          ? "optional"
          : facts.summary.kind === "error"
            ? "attention"
            : "done",
    },
    { key: "finish", state: "optional" },
  ];
}
