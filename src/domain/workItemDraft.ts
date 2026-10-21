/**
 * Công tác nhập thủ công trước khi ghi vào bảng báo giá.
 * Không tự suy diễn giá trị thiếu: ô trống được ghi là trống, không phải 0 (prompts/10, 13).
 */

import { NO_ROUNDING, RoundingRule } from "./pricing/rounding";
import { QUOTE_COLUMNS, quoteColumnFormulas } from "./quoteTemplate";

export interface WorkItemDraftInput {
  code: string;
  group: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  notes: string;
}

export type DraftField = keyof WorkItemDraftInput;

export interface DraftError {
  field: DraftField;
  message: string;
}

export type DecimalParse = { ok: true; value: number | null } | { ok: false; message: string };

/**
 * Đọc số người dùng gõ. Chấp nhận một dấu thập phân là "." hoặc ",";
 * không chấp nhận dấu phân cách hàng nghìn vì "1.234" có thể là 1,234 hoặc 1234 tùy locale.
 */
export function parseDecimalInput(text: string): DecimalParse {
  const trimmed = text.trim().replace(/\s+/g, "");
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  if (!/^-?\d+([.,]\d+)?$/.test(trimmed)) {
    return {
      ok: false,
      message:
        "Số không hợp lệ. Chỉ dùng chữ số và tối đa một dấu thập phân (. hoặc ,), không dùng dấu phân cách hàng nghìn.",
    };
  }
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value)) {
    return { ok: false, message: "Số quá lớn." };
  }
  return { ok: true, value };
}

/**
 * Excel tự "hiểu" chữ ghi qua Range.values: "=…" thành công thức, "007" thành số 7, "1/2" hoặc
 * "1-2" thành ngày, "10%" thành 0,1, "TRUE" thành giá trị logic (đã kiểm chứng trên Excel 16.0.20430).
 * Luôn thêm dấu nháy đơn (quote prefix) để Excel lưu đúng nguyên văn dưới dạng chữ
 * (prompts/09: giữ mã; prompts/15: không chạy công thức). Dấu nháy không hiện trong ô.
 */
export function asLiteralText(text: string): string {
  return text === "" ? "" : `'${text}`;
}

export type DraftValidation =
  { ok: true; row: (string | number)[] } | { ok: false; errors: DraftError[] };

/**
 * Kiểm tra công tác và tạo một dòng giá trị theo thứ tự QUOTE_COLUMNS.
 * Cột STT và Thành tiền nhận công thức của bảng.
 */
export function validateWorkItemDraft(
  input: WorkItemDraftInput,
  tableName: string,
  amountRule: RoundingRule = NO_ROUNDING
): DraftValidation {
  const errors: DraftError[] = [];

  if (input.description.trim() === "") {
    errors.push({ field: "description", message: "Nhập nội dung công việc." });
  }

  const quantity = parseDecimalInput(input.quantity);
  if (!quantity.ok) {
    errors.push({ field: "quantity", message: quantity.message });
  } else if (quantity.value !== null && quantity.value < 0) {
    errors.push({ field: "quantity", message: "Khối lượng không được âm." });
  }

  const unitPrice = parseDecimalInput(input.unitPrice);
  if (!unitPrice.ok) {
    errors.push({ field: "unitPrice", message: unitPrice.message });
  } else if (unitPrice.value !== null && unitPrice.value < 0) {
    errors.push({ field: "unitPrice", message: "Đơn giá không được âm." });
  }

  if (errors.length > 0 || !quantity.ok || !unitPrice.ok) {
    return { ok: false, errors };
  }

  const formulas = quoteColumnFormulas(tableName, amountRule);
  const row = QUOTE_COLUMNS.map((column): string | number => {
    switch (column.key) {
      case "stt":
        return formulas.stt ?? "";
      case "amount":
        return formulas.amount ?? "";
      case "code":
        return asLiteralText(input.code.trim());
      case "group":
        return asLiteralText(input.group.trim());
      case "description":
        return asLiteralText(input.description.trim());
      case "unit":
        return asLiteralText(input.unit.trim());
      case "quantity":
        return quantity.value ?? "";
      case "unitPrice":
        return unitPrice.value ?? "";
      case "notes":
        return asLiteralText(input.notes.trim());
    }
  });
  return { ok: true, row };
}

export const EMPTY_DRAFT: WorkItemDraftInput = {
  code: "",
  group: "",
  description: "",
  unit: "",
  quantity: "",
  unitPrice: "",
  notes: "",
};
