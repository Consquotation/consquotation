/**
 * Kiểm tra bảng báo giá trên dữ liệu ĐỌC TRỰC TIẾP từ sheet (prompts/07, 10):
 * người dùng có thể sửa worksheet bất kỳ lúc nào nên không dựa vào trạng thái lưu tạm.
 * - Phân biệt trống, 0 và lỗi; chỉ ra đúng ô.
 * - Không sửa gì; chỉ đề xuất (ví dụ cập nhật đơn giá theo sheet phân tích) để người dùng xác nhận.
 * Tham chiếu vòng: Excel tự cảnh báo; Office.js không cho đọc trạng thái này nên add-in không kiểm tra.
 */

import { cellAddress } from "../../shared/a1";
import {
  QUOTE_COLUMNS,
  QuoteColumnKey,
  quoteColumnFormulas,
  totalRowFormulas,
} from "../quoteTemplate";
import { normalizeCode } from "../library/validation";
import { BASE_METHOD_LABEL, KIND_LABELS, METHOD_LABELS, SUMMARY_HEADERS } from "./adjustments";
import { COMPOSITION_NOTE_PREFIX } from "./composition";
import { sameFormula } from "./formulaText";
import { RoundingRule } from "./rounding";

export interface SheetRow {
  values: unknown[];
  formulas: unknown[];
  /** valueTypes của Excel: "Empty" | "String" | "Double" | "Boolean" | "Error" | … */
  types: string[];
}

export interface TableSnapshot {
  name: string;
  sheetName: string;
  headers: string[];
  /** Chỉ số hàng/cột (từ 0) trên sheet của ô dữ liệu đầu tiên. */
  firstRowIndex: number;
  firstColumnIndex: number;
  rows: SheetRow[];
  /** Dòng tổng; null nếu bảng không bật dòng tổng. */
  totals: SheetRow | null;
}

export interface AnalysisLine {
  code: string;
  rowIndex: number;
  sheetName: string;
  quantityBlank: boolean;
  priceBlank: boolean;
  /** Giá trị ô Đơn giá công tác do Excel tính. */
  unitPrice: unknown;
  unitPriceType: string;
  priceAddress: string;
}

export interface QuoteSnapshot {
  quote: TableSnapshot;
  summary: TableSnapshot | null;
  analysis: AnalysisLine[] | null;
  amountRule: RoundingRule;
}

export type IssueSeverity = "error" | "warning";

export interface QuoteIssue {
  severity: IssueSeverity;
  sheetName: string;
  /** Địa chỉ A1 (không kèm tên sheet) để "Đi tới". */
  address: string;
  /** "Dòng 12" — số hàng trên sheet. */
  location: string;
  message: string;
  /** Đề xuất sửa có thể áp dụng sau khi người dùng xác nhận. */
  fix?: { kind: "setUnitPrice"; value: number; previous: unknown };
}

export type PriceMethod = "direct" | "library" | "composition" | "formula" | "missing";

export interface RowMethod {
  location: string;
  address: string;
  code: string;
  method: PriceMethod;
  /** Ghi chú truy vết (nguồn giá) nếu có. */
  source: string;
}

export interface QuoteCheckResult {
  issues: QuoteIssue[];
  methods: RowMethod[];
  /** Số dòng công tác có dữ liệu (bỏ qua dòng trống). */
  rowCount: number;
}

const ERROR_EXPLANATIONS: Record<string, string> = {
  "#DIV/0!": "chia cho 0",
  "#VALUE!": "sai kiểu dữ liệu (ví dụ chữ trong phép tính)",
  "#REF!": "tham chiếu tới ô/cột đã bị xóa",
  "#NAME?": "sai tên hàm hoặc tên cột",
  "#N/A": "không có giá trị (thiếu số liệu hoặc không tìm thấy)",
  "#NUM!": "số không hợp lệ",
  "#NULL!": "vùng tham chiếu không giao nhau",
  "#SPILL!": "kết quả mảng bị chặn",
  "#CALC!": "lỗi tính toán",
};

export function explainError(value: unknown): string {
  const code = String(value);
  return ERROR_EXPLANATIONS[code] ? `${code} — ${ERROR_EXPLANATIONS[code]}` : code;
}

/** Số hiển thị theo kiểu Việt Nam (1.234,5); ô trống hiển thị "trống". */
function showNumber(value: unknown): string {
  if (isBlank(value)) {
    return "(trống)";
  }
  return typeof value === "number"
    ? value.toLocaleString("vi-VN", { maximumFractionDigits: 9 })
    : String(value);
}

function isBlank(value: unknown): boolean {
  return value === "" || value === null || value === undefined;
}

function isFormula(formula: unknown): boolean {
  return typeof formula === "string" && formula.startsWith("=");
}

function headerOf(key: QuoteColumnKey): string {
  return QUOTE_COLUMNS.find((c) => c.key === key)!.header;
}

export function checkQuote(snapshot: QuoteSnapshot): QuoteCheckResult {
  const { quote, summary, analysis, amountRule } = snapshot;
  const issues: QuoteIssue[] = [];
  const methods: RowMethod[] = [];
  const index = (key: QuoteColumnKey) => quote.headers.indexOf(headerOf(key));
  const at = (table: TableSnapshot, r: number, c: number, totals = false) => {
    const row = totals ? table.firstRowIndex + table.rows.length : table.firstRowIndex + r;
    return {
      sheetName: table.sheetName,
      address: cellAddress(row, table.firstColumnIndex + c),
      location: `Dòng ${row + 1}`,
    };
  };
  const push = (
    severity: IssueSeverity,
    place: ReturnType<typeof at>,
    message: string,
    fix?: QuoteIssue["fix"]
  ) => issues.push({ severity, ...place, message, fix });

  const expectedAmount = quoteColumnFormulas(quote.name, amountRule).amount;
  const analysisByCode = new Map<string, AnalysisLine>();
  for (const line of analysis ?? []) {
    if (!analysisByCode.has(normalizeCode(line.code))) {
      analysisByCode.set(normalizeCode(line.code), line);
    }
  }
  const usedCodes = new Set<string>();

  const c = {
    code: index("code"),
    description: index("description"),
    quantity: index("quantity"),
    unitPrice: index("unitPrice"),
    amount: index("amount"),
    notes: index("notes"),
  };
  let rowCount = 0;

  quote.rows.forEach((row, r) => {
    const value = (col: number) => row.values[col];
    const meaningful = [c.code, c.description, c.quantity, c.unitPrice, c.notes].some(
      (col) => !isBlank(value(col))
    );
    if (!meaningful) {
      return;
    }
    rowCount++;
    const code = String(value(c.code) ?? "").trim();
    const notes = String(value(c.notes) ?? "");

    // Lỗi công thức ở bất kỳ cột nào.
    row.types.forEach((type, col) => {
      if (type === "Error") {
        push(
          "error",
          at(quote, r, col),
          `${quote.headers[col]}: lỗi ${explainError(row.values[col])}.`
        );
      }
    });

    if (isBlank(value(c.description))) {
      push("warning", at(quote, r, c.description), "Thiếu nội dung công việc.");
    }

    for (const [key, label] of [
      ["quantity", "khối lượng"],
      ["unitPrice", "đơn giá"],
    ] as const) {
      const col = c[key];
      const type = row.types[col];
      if (type === "Error") {
        continue;
      }
      const v = value(col);
      if (isBlank(v)) {
        push(
          "warning",
          at(quote, r, col),
          `Thiếu ${label}: Thành tiền để trống và không được cộng vào tổng.`
        );
      } else if (typeof v !== "number") {
        push(
          "error",
          at(quote, r, col),
          `${label[0].toUpperCase()}${label.slice(1)} "${String(v)}" không phải số (có thể bị gõ dạng chữ, ví dụ 1.500.000).`
        );
      } else if (v < 0) {
        push("error", at(quote, r, col), `${label[0].toUpperCase()}${label.slice(1)} âm.`);
      } else if (v === 0) {
        push(
          "warning",
          at(quote, r, col),
          `${label[0].toUpperCase()}${label.slice(1)} bằng 0 (khác với để trống) — kiểm tra lại.`
        );
      }
    }

    // Thành tiền phải là công thức của mẫu (theo quy tắc làm tròn hiện tại).
    const amountFormula = row.formulas[c.amount];
    if (!isFormula(amountFormula)) {
      if (!isBlank(amountFormula)) {
        push(
          "warning",
          at(quote, r, c.amount),
          "Thành tiền bị gõ đè bằng số, không còn tự tính theo khối lượng × đơn giá."
        );
      } else {
        push("warning", at(quote, r, c.amount), "Thành tiền không có công thức.");
      }
    } else if (!sameFormula(amountFormula, expectedAmount ?? "", quote.name)) {
      push(
        "warning",
        at(quote, r, c.amount),
        "Công thức Thành tiền khác mẫu (bị sửa tay, hoặc chưa theo quy tắc làm tròn hiện tại)."
      );
    }

    // Phương pháp và nguồn đơn giá.
    const priceFormula = row.formulas[c.unitPrice];
    let method: PriceMethod;
    if (notes.startsWith(COMPOSITION_NOTE_PREFIX)) {
      method = "composition";
    } else if (isFormula(priceFormula)) {
      method = "formula";
    } else if (isBlank(value(c.unitPrice))) {
      method = "missing";
    } else if (notes.startsWith("Thư viện:")) {
      method = "library";
    } else {
      method = "direct";
    }
    const place = at(quote, r, c.unitPrice);
    methods.push({
      location: place.location,
      address: place.address,
      code,
      method,
      source: method === "library" || method === "composition" ? notes : "",
    });

    if (method === "composition") {
      usedCodes.add(normalizeCode(code));
      const line = analysisByCode.get(normalizeCode(code));
      if (!line) {
        push(
          "warning",
          place,
          `Không tìm thấy phân tích cho mã "${code}" trên sheet phân tích (có thể đã bị xóa hoặc đổi mã).`
        );
      } else if (line.unitPriceType === "Error") {
        push(
          "error",
          {
            sheetName: line.sheetName,
            address: line.priceAddress,
            location: `Dòng ${line.rowIndex + 1}`,
          },
          `Phân tích mã "${code}": Đơn giá công tác lỗi ${explainError(line.unitPrice)}.`
        );
      } else if (isBlank(line.unitPrice)) {
        push(
          "warning",
          place,
          `Phân tích mã "${code}" còn thiếu hao phí hoặc đơn giá nguồn — chưa có đơn giá.`
        );
      } else if (typeof line.unitPrice === "number" && value(c.unitPrice) !== line.unitPrice) {
        push(
          "warning",
          place,
          `Đơn giá ${showNumber(value(c.unitPrice))} khác kết quả phân tích ${showNumber(line.unitPrice)}.`,
          { kind: "setUnitPrice", value: line.unitPrice, previous: value(c.unitPrice) }
        );
      }
    }
  });

  // Dòng tổng của bảng báo giá.
  if (!quote.totals) {
    push(
      "warning",
      at(quote, 0, c.description, true),
      "Bảng không bật dòng tổng (Table Design › Total Row)."
    );
  } else {
    const expected = totalRowFormulas(quote.name)[
      QUOTE_COLUMNS.findIndex((x) => x.key === "amount")
    ];
    const formula = quote.totals.formulas[c.amount];
    if (quote.totals.types[c.amount] === "Error") {
      push(
        "error",
        at(quote, 0, c.amount, true),
        `Tổng Thành tiền lỗi ${explainError(quote.totals.values[c.amount])}.`
      );
    } else if (!sameFormula(formula, expected, quote.name)) {
      push(
        "warning",
        at(quote, 0, c.amount, true),
        "Công thức tổng Thành tiền khác mẫu (bị sửa tay)."
      );
    }
  }

  // Dòng phân tích thiếu số liệu của các mã đang dùng.
  for (const line of analysis ?? []) {
    if (usedCodes.has(normalizeCode(line.code)) && (line.quantityBlank || line.priceBlank)) {
      push(
        "warning",
        {
          sheetName: line.sheetName,
          address: line.priceAddress,
          location: `Dòng ${line.rowIndex + 1}`,
        },
        `Phân tích mã "${line.code}": thiếu ${line.quantityBlank ? "hao phí" : "đơn giá nguồn"}.`
      );
    }
  }

  // Bảng tổng hợp (chiết khấu, phụ phí, thuế).
  if (summary) {
    const s = (name: (typeof SUMMARY_HEADERS)[number]) => summary.headers.indexOf(name);
    summary.rows.forEach((row, r) => {
      const name = String(row.values[s("Khoản mục")] ?? "");
      const methodText = String(row.values[s("Cách tính")] ?? "");
      row.types.forEach((type, col) => {
        if (type === "Error") {
          push(
            "error",
            at(summary, r, col),
            `Tổng hợp "${name}" — ${summary.headers[col]}: lỗi ${explainError(row.values[col])}.`
          );
        }
      });
      if (methodText === BASE_METHOD_LABEL) {
        return;
      }
      if (!Object.values(KIND_LABELS).includes(String(row.values[s("Loại")] ?? ""))) {
        push(
          "error",
          at(summary, r, s("Loại")),
          `Tổng hợp "${name}": Loại phải là ${Object.values(KIND_LABELS).join(" hoặc ")}.`
        );
      }
      if (!Object.values(METHOD_LABELS).includes(methodText)) {
        push(
          "error",
          at(summary, r, s("Cách tính")),
          `Tổng hợp "${name}": Cách tính không hợp lệ.`
        );
      }
      const v = row.values[s("Giá trị")];
      if (isBlank(v)) {
        push(
          "warning",
          at(summary, r, s("Giá trị")),
          `Tổng hợp "${name}": chưa nhập giá trị — Tổng cộng chưa tính được.`
        );
      } else if (typeof v !== "number") {
        push(
          "error",
          at(summary, r, s("Giá trị")),
          `Tổng hợp "${name}": giá trị "${String(v)}" không phải số.`
        );
      }
      for (const header of ["Số tiền", "Lũy kế"] as const) {
        if (!isFormula(row.formulas[s(header)])) {
          push(
            "warning",
            at(summary, r, s(header)),
            `Tổng hợp "${name}": ${header} không còn là công thức.`
          );
        }
      }
    });

    if (summary.totals) {
      const amountColumn = s("Số tiền");
      if (summary.totals.types[amountColumn] === "Error") {
        push(
          "error",
          at(summary, 0, amountColumn, true),
          `Tổng cộng (sau chiết khấu/phụ phí/thuế) lỗi ${explainError(summary.totals.values[amountColumn])}.`
        );
      }
    }
  }

  return { issues, methods, rowCount };
}
