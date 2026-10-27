/**
 * Đánh giá từng dòng công tác của báo giá (giai đoạn 17): trạng thái tính toán valid /
 * validWithWarnings / invalid, đơn giá theo loại tài nguyên, đối chiếu với Excel và với thư viện.
 * Dựa trên dữ liệu ĐỌC LẠI từ sheet (prompts/07) cộng hồ sơ báo giá (ADR-0014).
 *
 * Quy tắc trạng thái:
 * - invalid: dòng không tính được thành tiền hợp lệ (thiếu/sai khối lượng hoặc đơn giá, ô lỗi, phân
 *   tích thiếu số liệu, đơn vị giá khác đơn vị tài nguyên) hoặc Kiểm tra báo giá báo lỗi ở dòng đó;
 * - validWithWarnings: tính được nhưng có cảnh báo (giá trị 0, thư viện đã đổi, đơn giá lệch phân
 *   tích, đơn giá thành phần bị sửa tay…);
 * - valid: không có vấn đề.
 * Cảnh báo của Kiểm tra báo giá giữ nguyên mức cảnh báo; "thiếu khối lượng/đơn giá" được diễn đạt
 * lại thành lỗi của dòng vì dòng đó không có thành tiền (không phải đổi mức tùy tiện).
 */

import { cellAddress } from "../../shared/a1";
import * as D from "../pricing/decimal";
import type { QuoteCheckResult, QuoteIssue, QuoteSnapshot } from "../pricing/quoteCheck";
import { NO_ROUNDING, RoundingRule, describeRule } from "../pricing/rounding";
import { QUOTE_COLUMNS } from "../quoteTemplate";
import type { LibrarySnapshot } from "../library/types";
import {
  BreakdownResult,
  analysisBreakdown,
  analysisRowsFor,
  lineAmount,
  sameAmount,
} from "./calculate";
import { LibraryUpdatePlan, libraryDrift } from "./drift";
import { COST_TYPES, CellRead, QuoteLine, contentFingerprint, isBlank, quoteLines } from "./lines";
import {
  CALCULATION_VERSION,
  CalculationStatus,
  CostType,
  ItemIssue,
  PricingMethod,
  QuotationItemRecord,
  QuotationPricingResult,
  QuotationRecord,
} from "./model";
import { inferMethod } from "./reconcile";

export interface LineEvaluation {
  line: QuoteLine;
  item: QuotationItemRecord | null;
  method: PricingMethod;
  result: QuotationPricingResult;
  /** Đơn giá theo loại tính từ sheet phân tích (chỉ dòng phân tích định mức). */
  breakdown: BreakdownResult | null;
  /** Giá trị add-in sẽ ghi vào 4 cột đơn giá thành phần khi lưu ("" = xóa); null = không ghi. */
  breakdownWrite: Record<CostType, number | ""> | null;
  /** Cập nhật làm được theo thư viện hiện tại (người dùng phải bấm). */
  plan: LibraryUpdatePlan | null;
  /** Kết quả khác lần tính trước đã lưu trong hồ sơ (dữ liệu bị sửa sau lần lưu). */
  changedSinceLastCalc: boolean;
}

export interface GroupTotal {
  group: string;
  amount: number;
  lines: number;
  /** Số dòng chưa có thành tiền hợp lệ (không cộng vào tổng nhóm). */
  uncomputed: number;
}

export interface QuotationEvaluation {
  lines: LineEvaluation[];
  counts: Record<CalculationStatus, number>;
  /** Ô tổng Thành tiền của bảng do Excel tính. */
  total: { value: number | null; error: string | null };
  /** Tổng thành tiền các dòng tính được (add-in cộng, để đối chiếu). */
  computedTotal: number;
  groups: GroupTotal[];
  /** Vấn đề không gắn với dòng (dòng tổng, bảng tổng hợp, cấu trúc bảng). */
  tableIssues: QuoteIssue[];
  fingerprint: string;
  hasLineIds: boolean;
  hasBreakdown: boolean;
  missingColumns: string[];
  roundingPolicy: string;
}

export interface EvaluateInput {
  snapshot: QuoteSnapshot;
  record: QuotationRecord | null;
  check: QuoteCheckResult;
  unitPriceRule?: RoundingRule;
  library?: LibrarySnapshot;
  now: string;
}

const RE_EXPRESSED: ReadonlySet<string> = new Set(["blank", "notNumber", "negative"]);

function numberOf(cell: CellRead): number | null {
  return cell.type !== "Error" && typeof cell.value === "number" && Number.isFinite(cell.value)
    ? cell.value
    : null;
}

function valueIssue(
  cell: CellRead,
  what: "quantity" | "unitPrice",
  method: PricingMethod
): ItemIssue | null {
  const label = what === "quantity" ? "khối lượng" : "đơn giá";
  if (cell.type === "Error") {
    return null; // Kiểm tra báo giá đã báo lỗi ô.
  }
  if (isBlank(cell.value)) {
    return {
      code: what === "quantity" ? "missingQuantity" : "missingUnitPrice",
      severity: "error",
      message: `Thiếu ${label}: dòng chưa tính được thành tiền.`,
      hint:
        what === "quantity"
          ? "Nhập khối lượng vào bảng báo giá."
          : method === "norm"
            ? "Xem các tài nguyên còn thiếu đơn giá nguồn bên dưới, bổ sung rồi bấm Tính lại."
            : "Nhập đơn giá, hoặc chèn lại công tác từ thư viện.",
    };
  }
  if (typeof cell.value !== "number" || !Number.isFinite(cell.value)) {
    return {
      code: what === "quantity" ? "invalidQuantity" : "invalidUnitPrice",
      severity: "error",
      message: `${label[0].toUpperCase()}${label.slice(1)} "${String(cell.value)}" không phải số.`,
      hint: "Gõ lại dạng số, không dùng dấu phân cách hàng nghìn.",
    };
  }
  if (cell.value < 0) {
    return {
      code: what === "quantity" ? "negativeQuantity" : "negativeUnitPrice",
      severity: "error",
      message: `${label[0].toUpperCase()}${label.slice(1)} âm.`,
      hint: "Nhập giá trị không âm; khoản giảm trừ đưa vào phần Tổng hợp (tab Tính giá).",
    };
  }
  return null;
}

function cellEquals(cell: CellRead, written: number | null): boolean {
  return written === null ? isBlank(cell.value) : cell.value === written;
}

function emptyResult(
  now: string,
  policy: string
): Omit<QuotationPricingResult, "status" | "issues"> {
  return {
    materialCost: null,
    laborCost: null,
    machineCost: null,
    otherCost: null,
    unitPrice: null,
    quantity: null,
    amount: null,
    roundingPolicy: policy,
    calculatedAt: now,
    calculationVersion: CALCULATION_VERSION,
  };
}

export function evaluateQuotation(input: EvaluateInput): QuotationEvaluation {
  const { snapshot, record, check, library, now } = input;
  const unitPriceRule = input.unitPriceRule ?? NO_ROUNDING;
  const amountRule = snapshot.amountRule;
  const read = quoteLines(snapshot);
  const items = new Map((record?.items ?? []).map((item) => [item.id, item]));
  const roundingPolicy = `Đơn giá: ${describeRule(unitPriceRule)}; thành tiền: ${describeRule(amountRule)}`;
  const amountColumn = read.columnIndex(QUOTE_COLUMNS.find((c) => c.key === "amount")!.header);
  const seenIds = new Set<string>();

  const lines = read.lines.map((line): LineEvaluation => {
    const duplicate = line.lineId !== null && seenIds.has(line.lineId);
    if (line.lineId !== null) {
      seenIds.add(line.lineId);
    }
    const item = line.lineId !== null && !duplicate ? (items.get(line.lineId) ?? null) : null;
    const method = item?.pricingMethod ?? inferMethod(line.notes);
    const issues: ItemIssue[] = [];
    const rowIssues = check.issues.filter((i) => i.row === line.row);
    const amountAddress = cellAddress(
      snapshot.quote.firstRowIndex + line.row,
      snapshot.quote.firstColumnIndex + amountColumn
    );

    for (const issue of rowIssues) {
      if (
        issue.code &&
        RE_EXPRESSED.has(issue.code) &&
        (issue.column === "quantity" || issue.column === "unitPrice")
      ) {
        continue;
      }
      if (
        method === "norm" &&
        (issue.code === "analysisMissing" || issue.code === "analysisIncomplete")
      ) {
        continue;
      }
      if (
        item?.libraryPrice &&
        (issue.code === "libraryDiffers" || issue.code === "libraryMissing")
      ) {
        continue;
      }
      issues.push({
        code: "sheetCheck",
        severity: issue.severity,
        message: issue.message,
        hint: issue.hint,
      });
    }

    for (const what of ["quantity", "unitPrice"] as const) {
      const problem = valueIssue(line[what], what, method);
      if (problem) {
        issues.push(problem);
      }
    }

    let breakdown: BreakdownResult | null = null;
    if (method === "norm") {
      const rows = analysisRowsFor(snapshot.analysis ?? [], line.code);
      breakdown = analysisBreakdown(rows, line.code, unitPriceRule);
      issues.push(...breakdown.issues);
      const excel = rows.find(
        (r) => r.unitPriceType !== "Error" && typeof r.unitPrice === "number"
      );
      if (
        breakdown.unitPrice !== null &&
        excel &&
        !sameAmount(breakdown.unitPrice, excel.unitPrice as number)
      ) {
        issues.push({
          code: "analysisError",
          severity: "warning",
          message: `Đơn giá add-in tính (${breakdown.unitPrice}) khác đơn giá Excel tính trên sheet phân tích (${String(excel.unitPrice)}).`,
          hint: "Kiểm tra công thức cột Đơn giá công tác trên sheet phân tích có bị sửa tay không.",
        });
      }
      for (const component of item?.components ?? []) {
        if (
          component.priceId &&
          component.priceUnitSnapshot.trim().toLocaleLowerCase("vi-VN") !==
            component.unitSnapshot.trim().toLocaleLowerCase("vi-VN")
        ) {
          issues.push({
            code: "componentUnitMismatch",
            severity: "error",
            resourceCode: component.resourceCodeSnapshot,
            message: `Giá của "${component.resourceCodeSnapshot}" tính theo ${component.priceUnitSnapshot}, khác đơn vị hao phí ${component.unitSnapshot}.`,
            hint: "Add-in không quy đổi đơn vị. Chọn giá cùng đơn vị với tài nguyên rồi chèn lại.",
          });
        }
      }
      if (item && item.components.length === 0) {
        issues.push({
          code: "noTrace",
          severity: "warning",
          message:
            "Dòng không có dữ liệu truy vết thành phần (id tài nguyên, id giá): không kiểm tra được thay đổi của thư viện.",
          hint: "Dữ liệu này chỉ có khi chèn bằng bản có hồ sơ báo giá. Chèn lại công tác nếu cần truy vết.",
        });
      }
    }

    // Cột đơn giá thành phần.
    let breakdownWrite: Record<CostType, number | ""> | null = null;
    if (line.breakdown) {
      const cells = line.breakdown;
      const written = item?.writtenBreakdown ?? null;
      const writtenByAddIn =
        written !== null && COST_TYPES.every((t) => cellEquals(cells[t], written[t]));
      const allBlank = COST_TYPES.every((t) => isBlank(cells[t].value));
      if (method === "norm" && breakdown?.totals) {
        const expected = breakdown.totals;
        const matches = COST_TYPES.every((t) => {
          const v = numberOf(cells[t]);
          return v !== null && sameAmount(v, expected[t]);
        });
        if (!matches) {
          if (allBlank || writtenByAddIn) {
            breakdownWrite = { ...expected };
          } else {
            issues.push({
              code: "breakdownEdited",
              severity: "warning",
              message: "Đơn giá thành phần trên bảng đã bị sửa tay, khác kết quả phân tích.",
              hint: "Xóa 4 ô đơn giá thành phần của dòng này rồi bấm Tính lại và lưu để add-in ghi lại.",
            });
          }
        }
      } else if (method === "norm") {
        if (!allBlank && writtenByAddIn) {
          // Phân tích chưa đủ số liệu: xóa số cũ do add-in ghi để không hiển thị số đã lỗi thời.
          breakdownWrite = { material: "", labor: "", machine: "", other: "" };
        }
      } else if (!allBlank) {
        const values = COST_TYPES.map((t) => numberOf(cells[t]));
        const unitPrice = numberOf(line.unitPrice);
        if (values.some((v, i) => v === null && !isBlank(cells[COST_TYPES[i]].value))) {
          issues.push({
            code: "breakdownMismatch",
            severity: "warning",
            message: "Đơn giá thành phần có ô không phải số.",
            hint: "Nhập số hoặc để trống.",
          });
        } else if (unitPrice !== null) {
          const sum = D.toNumber(D.sum(values.map((v) => D.fromNumber(v ?? 0))));
          if (!sameAmount(sum, unitPrice, unitPriceRule)) {
            issues.push({
              code: "breakdownMismatch",
              severity: "warning",
              message: `Tổng đơn giá thành phần (${sum}) khác Đơn giá (${unitPrice}).`,
              hint: "Sửa đơn giá thành phần cho khớp, hoặc để trống nếu không tách được.",
            });
          }
        }
      }
    }

    // Thành tiền đối chiếu với Khối lượng × Đơn giá (theo quy tắc làm tròn cấp thành tiền).
    const quantity = numberOf(line.quantity);
    const unitPrice = numberOf(line.unitPrice);
    const amount = numberOf(line.amount);
    if (
      quantity !== null &&
      unitPrice !== null &&
      quantity >= 0 &&
      unitPrice >= 0 &&
      amount !== null &&
      !rowIssues.some((i) => i.address === amountAddress)
    ) {
      const expected = lineAmount(quantity, unitPrice, amountRule);
      if (!sameAmount(amount, expected, amountRule)) {
        issues.push({
          code: "amountMismatch",
          severity: "warning",
          message: `Thành tiền ${amount} khác Khối lượng × Đơn giá = ${expected}.`,
          hint: "Kiểm tra công thức Thành tiền của dòng này.",
        });
      }
    }

    let plan: LibraryUpdatePlan | null = null;
    if (item && library) {
      const drift = libraryDrift(item, library);
      issues.push(...drift.issues);
      plan = drift.plan;
    }
    if (read.hasLineIds && (line.lineId === null || duplicate)) {
      issues.push({
        code: "noTrace",
        severity: "warning",
        message: duplicate
          ? "Mã dòng trùng với một dòng phía trên (dòng được sao chép)."
          : "Dòng chưa có Mã dòng (gõ trực tiếp trong Excel).",
        hint: "Bấm Tính lại và lưu để add-in gán mã và ghi vào hồ sơ báo giá.",
      });
    }

    const status: CalculationStatus = issues.some((i) => i.severity === "error")
      ? "invalid"
      : issues.length > 0
        ? "validWithWarnings"
        : "valid";
    const valid = status !== "invalid";
    const totals = valid ? (breakdown?.totals ?? null) : null;
    const result: QuotationPricingResult = {
      ...emptyResult(now, roundingPolicy),
      materialCost: totals?.material ?? null,
      laborCost: totals?.labor ?? null,
      machineCost: totals?.machine ?? null,
      otherCost: totals?.other ?? null,
      // Dòng invalid không lưu số (không để số lỗi thời hay số 0 bị hiểu là kết quả hợp lệ).
      unitPrice: valid ? unitPrice : null,
      quantity,
      amount: valid ? amount : null,
      status,
      issues,
    };
    const previous = item?.result ?? null;
    // Chỉ so số liệu trên sheet; trạng thái có thể đổi chỉ vì thư viện đổi (sheet không đổi).
    const changedSinceLastCalc =
      previous !== null &&
      (previous.unitPrice !== result.unitPrice ||
        previous.amount !== result.amount ||
        previous.quantity !== result.quantity);
    return {
      line,
      item,
      method,
      result,
      breakdown,
      breakdownWrite,
      plan,
      changedSinceLastCalc,
    };
  });

  const counts: Record<CalculationStatus, number> = { valid: 0, validWithWarnings: 0, invalid: 0 };
  const groups = new Map<string, { amount: D.Decimal; lines: number; uncomputed: number }>();
  let computed = D.ZERO;
  for (const evaluation of lines) {
    counts[evaluation.result.status]++;
    const key = evaluation.line.group;
    const group = groups.get(key) ?? { amount: D.ZERO, lines: 0, uncomputed: 0 };
    group.lines++;
    if (evaluation.result.amount === null) {
      group.uncomputed++;
    } else {
      const value = D.fromNumber(evaluation.result.amount);
      group.amount = D.add(group.amount, value);
      computed = D.add(computed, value);
    }
    groups.set(key, group);
  }

  const totalsRow = snapshot.quote.totals;
  let total: QuotationEvaluation["total"] = { value: null, error: null };
  if (totalsRow && amountColumn >= 0) {
    const value = totalsRow.values[amountColumn];
    total =
      totalsRow.types[amountColumn] === "Error"
        ? { value: null, error: String(value) }
        : { value: typeof value === "number" ? value : null, error: null };
  }

  return {
    lines,
    counts,
    total,
    computedTotal: D.toNumber(computed),
    groups: [...groups.entries()].map(([group, g]) => ({
      group,
      amount: D.toNumber(g.amount),
      lines: g.lines,
      uncomputed: g.uncomputed,
    })),
    tableIssues: check.issues.filter((i) => i.row === undefined),
    fingerprint: contentFingerprint(snapshot),
    hasLineIds: read.hasLineIds,
    hasBreakdown: read.hasBreakdown,
    missingColumns: read.missingColumns,
    roundingPolicy,
  };
}

/** Lý do chưa thể đánh dấu hoàn tất; mảng rỗng = hoàn tất được. */
export function completionBlockers(evaluation: QuotationEvaluation): string[] {
  const blockers: string[] = [];
  if (!evaluation.hasLineIds) {
    blockers.push("Bảng chưa có cột Mã dòng: bấm Bổ sung cột quản lý theo dòng trước.");
  }
  if (evaluation.lines.length === 0) {
    blockers.push("Báo giá chưa có công tác nào.");
  }
  if (evaluation.counts.invalid > 0) {
    blockers.push(`${evaluation.counts.invalid} dòng chưa tính được (trạng thái lỗi).`);
  }
  const tableErrors = evaluation.tableIssues.filter((i) => i.severity === "error");
  if (tableErrors.length > 0) {
    blockers.push(`${tableErrors.length} lỗi ở dòng tổng hoặc bảng tổng hợp.`);
  }
  if (evaluation.total.error) {
    blockers.push(`Ô tổng Thành tiền đang lỗi ${evaluation.total.error}.`);
  }
  if (evaluation.lines.some((l) => l.line.lineId === null || l.item === null)) {
    blockers.push("Có dòng chưa có trong hồ sơ: bấm Tính lại và lưu trước.");
  }
  return blockers;
}
