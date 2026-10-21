/**
 * Quy tắc làm tròn (prompts/10): nêu rõ độ chính xác (số chữ số), kiểu làm tròn và cấp làm tròn.
 * Mặc định KHÔNG làm tròn — add-in không tự đặt quy tắc thay người dùng.
 * Làm tròn được thực hiện bằng hàm Excel (ROUND/ROUNDUP/ROUNDDOWN) trong công thức,
 * nên kết quả trên sheet là kết quả của chính Excel.
 */

export type RoundingMode = "none" | "round" | "roundUp" | "roundDown";

export interface RoundingRule {
  mode: RoundingMode;
  /** Số chữ số sau dấu thập phân; âm = làm tròn tới hàng chục/trăm/nghìn (-3 → nghìn). */
  digits: number;
}

/** Cấp làm tròn: nơi áp dụng quy tắc. */
export type RoundingLevel = "unitPrice" | "amount" | "adjustment";

export const ROUNDING_LEVELS: readonly RoundingLevel[] = ["unitPrice", "amount", "adjustment"];

export type RoundingConfig = Record<RoundingLevel, RoundingRule>;

export const NO_ROUNDING: RoundingRule = { mode: "none", digits: 0 };

export const DEFAULT_ROUNDING: RoundingConfig = {
  unitPrice: NO_ROUNDING,
  amount: NO_ROUNDING,
  adjustment: NO_ROUNDING,
};

export const MIN_DIGITS = -9;
export const MAX_DIGITS = 6;

/** Mọi quy tắc hợp lệ — để nhận ra công thức mẫu đã ghi với quy tắc bất kỳ. */
export const ALL_RULES: readonly RoundingRule[] = [
  { mode: "none", digits: 0 },
  ...(["round", "roundUp", "roundDown"] as const).flatMap((mode) =>
    Array.from({ length: MAX_DIGITS - MIN_DIGITS + 1 }, (_v, i) => ({
      mode,
      digits: MIN_DIGITS + i,
    }))
  ),
];

const EXCEL_FUNCTION: Record<Exclude<RoundingMode, "none">, string> = {
  round: "ROUND",
  roundUp: "ROUNDUP",
  roundDown: "ROUNDDOWN",
};

export function isValidRule(rule: unknown): rule is RoundingRule {
  if (typeof rule !== "object" || rule === null) {
    return false;
  }
  const r = rule as Partial<RoundingRule>;
  return (
    (r.mode === "none" || r.mode === "round" || r.mode === "roundUp" || r.mode === "roundDown") &&
    typeof r.digits === "number" &&
    Number.isInteger(r.digits) &&
    r.digits >= MIN_DIGITS &&
    r.digits <= MAX_DIGITS
  );
}

/** Đọc cấu hình đã lưu; phần thiếu/hỏng → không làm tròn (không tự đoán). */
export function normalizeRounding(value: unknown): RoundingConfig {
  const source = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const config = { ...DEFAULT_ROUNDING };
  for (const level of ROUNDING_LEVELS) {
    const rule = source[level];
    config[level] = isValidRule(rule) ? { mode: rule.mode, digits: rule.digits } : NO_ROUNDING;
  }
  return config;
}

/** Bọc biểu thức Excel (không có dấu "=") bằng hàm làm tròn theo quy tắc. */
export function wrapRounding(expression: string, rule: RoundingRule): string {
  if (rule.mode === "none") {
    return expression;
  }
  return `${EXCEL_FUNCTION[rule.mode]}(${expression},${rule.digits})`;
}

/** Mô tả tiếng Việt, ví dụ "Làm tròn (ROUND) tới hàng nghìn". */
export function describeRule(rule: RoundingRule): string {
  if (rule.mode === "none") {
    return "Không làm tròn";
  }
  const how = {
    round: "Làm tròn gần nhất, 0,5 làm tròn ra xa số 0 (ROUND)",
    roundUp: "Luôn làm tròn ra xa số 0 (ROUNDUP)",
    roundDown: "Luôn làm tròn về phía số 0 (ROUNDDOWN)",
  }[rule.mode];
  return `${how} ${describeDigits(rule.digits)}`;
}

export function describeDigits(digits: number): string {
  if (digits > 0) {
    return `tới ${digits} chữ số thập phân`;
  }
  if (digits === 0) {
    return "tới hàng đơn vị";
  }
  const names: Record<number, string> = {
    [-1]: "hàng chục",
    [-2]: "hàng trăm",
    [-3]: "hàng nghìn",
    [-4]: "hàng chục nghìn",
    [-5]: "hàng trăm nghìn",
    [-6]: "hàng triệu",
  };
  return `tới ${names[digits] ?? `10^${-digits}`}`;
}

/**
 * Làm tròn trong add-in, chỉ để HIỂN THỊ TẠM TÍNH trước khi ghi (giá trị thật do Excel tính).
 * Theo đúng ngữ nghĩa ROUND/ROUNDUP/ROUNDDOWN của Excel (đối xứng quanh 0); dùng biểu diễn
 * thập phân để tránh sai số kiểu 1.005 → 1.00.
 */
export function roundLikeExcel(value: number, rule: RoundingRule): number {
  if (rule.mode === "none" || !Number.isFinite(value)) {
    return value;
  }
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // Dịch dấu thập phân bằng ký pháp mũ để tránh nhân với số thực.
  const shift = (x: number, by: number) => {
    const [mantissa, exponent = "0"] = String(x).split("e");
    return Number(`${mantissa}e${Number(exponent) + by}`);
  };
  const scaled = shift(abs, rule.digits);
  const nearest = Number(scaled.toPrecision(15));
  let rounded: number;
  if (rule.mode === "round") {
    rounded = Math.floor(nearest + 0.5);
  } else if (rule.mode === "roundUp") {
    rounded = Math.ceil(nearest);
  } else {
    rounded = Math.floor(nearest);
  }
  const result = sign * shift(rounded, -rule.digits);
  return Object.is(result, -0) ? 0 : result;
}
