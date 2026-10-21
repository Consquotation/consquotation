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
import type { LibrarySnapshot } from "../library/types";

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
  /** Hướng khắc phục cụ thể (prompts/13). */
  hint?: string;
  /** Đề xuất sửa có thể áp dụng sau khi người dùng xác nhận. */
  fix?: { kind: "setUnitPrice"; value: number; previous: unknown };
}

/** Ngưỡng cảnh báo "giá trị bất thường" (không chặn): thường do thừa chữ số hoặc nhầm đơn vị. */
export const ABNORMAL_UNIT_PRICE = 1e11;
export const ABNORMAL_QUANTITY = 1e7;

export interface CheckOptions {
  /** Thư viện hiện tại (nếu có) để so đơn giá các dòng lấy từ thư viện. */
  library?: LibrarySnapshot;
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

const ERROR_HINTS: Record<string, string> = {
  "#DIV/0!": "Kiểm tra ô làm mẫu số trong công thức (đang bằng 0 hoặc trống).",
  "#VALUE!": "Một ô trong phép tính đang là chữ — gõ lại dạng số.",
  "#REF!": "Công thức trỏ tới ô/cột đã bị xóa — gõ lại công thức hoặc khôi phục cột.",
  "#NAME?": "Kiểm tra tên hàm/tên cột trong công thức; không đổi tên các cột của bảng báo giá.",
  "#N/A":
    "Thiếu số liệu ở nơi công thức tham chiếu (ví dụ giá trị trong phần Tổng hợp hoặc ô tổng).",
};

export function errorHint(value: unknown): string {
  return ERROR_HINTS[String(value)] ?? "Sửa công thức tại ô này.";
}

const LIBRARY_NOTE = /^Thư viện:\s*([^;]+)/;

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

export function checkQuote(snapshot: QuoteSnapshot, options: CheckOptions = {}): QuoteCheckResult {
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
    extra: { hint?: string; fix?: QuoteIssue["fix"] } = {}
  ) => issues.push({ severity, ...place, message, ...extra });
  const libraryByCode = new Map(
    (options.library?.workItems ?? []).map((w) => [normalizeCode(w.code), w])
  );

  // Cột mẫu bị đổi tên/xóa/trùng: không đoán cột nào là khối lượng/đơn giá — báo lỗi chặn rõ ràng
  // thay vì kiểm tra sai (prompts/13: sheet/range không còn như mong đợi).
  const brokenColumns = QUOTE_COLUMNS.filter(
    (column) => quote.headers.filter((h) => h === column.header).length !== 1
  );
  if (brokenColumns.length > 0) {
    return {
      issues: [
        {
          severity: "error",
          sheetName: quote.sheetName,
          address: cellAddress(Math.max(0, quote.firstRowIndex - 1), quote.firstColumnIndex),
          location: `Dòng ${quote.firstRowIndex}`,
          message: `Bảng ${quote.name} đã bị đổi tên, xóa hoặc trùng cột mẫu: ${brokenColumns.map((c) => c.header).join(", ")}.`,
          hint: "Đổi lại đúng tên các cột ở dòng tiêu đề bảng — add-in dựa vào tên cột để biết ô nào là khối lượng, đơn giá, thành tiền.",
        },
      ],
      methods: [],
      rowCount: quote.rows.length,
    };
  }

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
    unit: index("unit"),
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
          `${quote.headers[col]}: lỗi ${explainError(row.values[col])}.`,
          { hint: errorHint(row.values[col]) }
        );
      }
    });

    if (isBlank(value(c.description))) {
      push("warning", at(quote, r, c.description), "Thiếu nội dung công việc.", {
        hint: "Nhập nội dung công việc để báo giá rõ ràng.",
      });
    }
    if (isBlank(value(c.unit)) && !isBlank(value(c.quantity))) {
      push("warning", at(quote, r, c.unit), "Thiếu đơn vị tính.", {
        hint: "Nhập đơn vị tính (ví dụ m3, m2, công) để khối lượng có nghĩa.",
      });
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
          `Thiếu ${label}: Thành tiền để trống và không được cộng vào tổng.`,
          { hint: "Nhập số vào ô này; khi chưa có số liệu thì tổng báo giá chưa đầy đủ." }
        );
      } else if (typeof v !== "number") {
        push(
          "error",
          at(quote, r, col),
          `${label[0].toUpperCase()}${label.slice(1)} "${String(v)}" không phải số (có thể bị gõ dạng chữ, ví dụ 1.500.000).`,
          {
            hint: "Gõ lại dạng số: chỉ chữ số và tối đa một dấu thập phân, không dùng dấu phân cách hàng nghìn.",
          }
        );
      } else if (v < 0) {
        push("error", at(quote, r, col), `${label[0].toUpperCase()}${label.slice(1)} âm.`, {
          hint: "Nhập giá trị không âm; khoản giảm trừ hãy đưa vào phần Tổng hợp (tab Tính giá).",
        });
      } else if (v === 0) {
        push(
          "warning",
          at(quote, r, col),
          `${label[0].toUpperCase()}${label.slice(1)} bằng 0 (khác với để trống) — kiểm tra lại.`,
          { hint: "Nếu chưa có số liệu, hãy để trống thay vì nhập 0." }
        );
      } else if (v >= (key === "unitPrice" ? ABNORMAL_UNIT_PRICE : ABNORMAL_QUANTITY)) {
        push(
          "warning",
          at(quote, r, col),
          `${label[0].toUpperCase()}${label.slice(1)} ${showNumber(v)} lớn bất thường.`,
          {
            hint: "Kiểm tra lại số chữ số và đơn vị tính (ví dụ nhập nhầm đồng thành nghìn đồng).",
          }
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
          "Thành tiền bị gõ đè bằng số, không còn tự tính theo khối lượng × đơn giá.",
          { hint: "Sao chép ô Thành tiền của một dòng khác xuống ô này để lấy lại công thức." }
        );
      } else {
        push("warning", at(quote, r, c.amount), "Thành tiền không có công thức.", {
          hint: "Sao chép ô Thành tiền của một dòng khác xuống ô này để lấy lại công thức.",
        });
      }
    } else if (!sameFormula(amountFormula, expectedAmount ?? "", quote.name)) {
      push(
        "warning",
        at(quote, r, c.amount),
        "Công thức Thành tiền khác mẫu (bị sửa tay, hoặc chưa theo quy tắc làm tròn hiện tại).",
        {
          hint: "Nếu không cố ý sửa: bấm Áp dụng quy tắc làm tròn (tab Tính giá) để ghi lại công thức mẫu, hoặc sao chép từ dòng khác.",
        }
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

    if (method === "library" && options.library) {
      const libCode = LIBRARY_NOTE.exec(notes)?.[1]?.trim() ?? code;
      const item = libraryByCode.get(normalizeCode(libCode));
      if (!item) {
        push("warning", place, `Không còn công tác mã "${libCode}" trong thư viện trên máy này.`, {
          hint: "Báo giá không bị ảnh hưởng (đơn giá là bản sao). Nếu cần truy vết, kiểm tra lại thư viện hoặc khôi phục từ bản sao lưu.",
        });
      } else if (
        item.unitPrice !== null &&
        typeof value(c.unitPrice) === "number" &&
        item.unitPrice !== value(c.unitPrice)
      ) {
        push(
          "warning",
          place,
          `Đơn giá ${showNumber(value(c.unitPrice))} khác đơn giá hiện tại trong thư viện ${showNumber(item.unitPrice)}.`,
          {
            hint: "Báo giá giữ đơn giá tại lúc chèn. Nếu muốn dùng giá mới, sửa ô Đơn giá hoặc chèn lại công tác từ thư viện.",
          }
        );
      }
    }

    if (method === "composition") {
      usedCodes.add(normalizeCode(code));
      const line = analysisByCode.get(normalizeCode(code));
      if (!line) {
        push(
          "warning",
          place,
          `Không tìm thấy phân tích cho mã "${code}" trên sheet phân tích (có thể đã bị xóa hoặc đổi mã).`,
          {
            hint: "Chèn lại công tác từ thư viện với phương pháp Phân tích, hoặc nhập đơn giá trực tiếp.",
          }
        );
      } else if (line.unitPriceType === "Error") {
        push(
          "error",
          {
            sheetName: line.sheetName,
            address: line.priceAddress,
            location: `Dòng ${line.rowIndex + 1}`,
          },
          `Phân tích mã "${code}": Đơn giá công tác lỗi ${explainError(line.unitPrice)}.`,
          {
            hint: "Sửa ô lỗi trên sheet Phân tích đơn giá (một ô lỗi ở bất kỳ dòng nào làm mọi đơn giá phân tích báo lỗi).",
          }
        );
      } else if (isBlank(line.unitPrice)) {
        push(
          "warning",
          place,
          `Phân tích mã "${code}" còn thiếu hao phí hoặc đơn giá nguồn — chưa có đơn giá.`,
          {
            hint: "Nhập hao phí/đơn giá nguồn còn trống trên sheet Phân tích đơn giá, rồi kiểm tra lại để cập nhật.",
          }
        );
      } else if (typeof line.unitPrice === "number" && value(c.unitPrice) !== line.unitPrice) {
        push(
          "warning",
          place,
          `Đơn giá ${showNumber(value(c.unitPrice))} khác kết quả phân tích ${showNumber(line.unitPrice)}.`,
          {
            hint: "Bấm Cập nhật đơn giá theo sheet phân tích (cần xác nhận), hoặc sửa tay.",
            fix: { kind: "setUnitPrice", value: line.unitPrice, previous: value(c.unitPrice) },
          }
        );
      }
    }
  });

  // Dòng tổng của bảng báo giá.
  if (!quote.totals) {
    push(
      "warning",
      at(quote, 0, c.description, true),
      "Bảng không bật dòng tổng (Table Design › Total Row).",
      { hint: "Chọn một ô trong bảng › Table Design › đánh dấu Total Row." }
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
        `Tổng Thành tiền lỗi ${explainError(quote.totals.values[c.amount])}.`,
        { hint: "Lỗi ở tổng thường do một dòng có lỗi — sửa các dòng báo lỗi phía trên trước." }
      );
    } else if (!sameFormula(formula, expected, quote.name)) {
      push(
        "warning",
        at(quote, 0, c.amount, true),
        "Công thức tổng Thành tiền khác mẫu (bị sửa tay).",
        {
          hint: "Nếu không cố ý sửa: chọn ô tổng › chọn Sum trong danh sách của dòng tổng (Excel ghi lại SUBTOTAL).",
        }
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
          `Tổng hợp "${name}": chưa nhập giá trị — Tổng cộng chưa tính được.`,
          { hint: "Nhập giá trị tại cột Giá trị, hoặc trong tab Tính giá › Tổng hợp." }
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
