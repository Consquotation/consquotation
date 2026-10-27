/**
 * Số thập phân chính xác cho bộ máy tính giá (cộng, nhân, làm tròn). Thuần TypeScript.
 *
 * Vì sao không dùng số dấu phẩy động: 0,1 × 3 = 0,30000000000000004; cộng dồn nhiều thành phần
 * làm lệch đơn giá. Ở đây mỗi số là dãy chữ số nguyên + số chữ số thập phân (scale), phép tính
 * làm trên chuỗi chữ số nên kết quả đúng tuyệt đối.
 *
 * Vì sao không dùng BigInt hay thư viện ngoài: browserslist của dự án gồm Safari 13 (Excel trên Mac
 * đời cũ) không có BigInt; chỉ cần cộng, nhân, làm tròn nên không thêm phụ thuộc (ADR-0013).
 */

export interface Decimal {
  /** Dấu: 1 hoặc -1 (số 0 luôn dương). */
  readonly sign: 1 | -1;
  /** Chữ số nguyên không dấu, không có số 0 thừa ở đầu ("0" cho số 0). */
  readonly digits: string;
  /** Số chữ số thuộc phần thập phân (tính từ cuối `digits`). */
  readonly scale: number;
}

function normalize(sign: 1 | -1, digits: string, scale: number): Decimal {
  let d = digits.replace(/^0+(?=\d)/, "");
  let s = scale;
  // Bỏ số 0 thừa ở cuối phần thập phân.
  while (s > 0 && d.length > 1 && d.endsWith("0")) {
    d = d.slice(0, -1);
    s--;
  }
  if (s > 0 && d === "0") {
    s = 0;
  }
  return { sign: d === "0" ? 1 : sign, digits: d, scale: s };
}

export const ZERO: Decimal = { sign: 1, digits: "0", scale: 0 };

/**
 * Từ số JavaScript hữu hạn. Dùng biểu diễn thập phân ngắn nhất của số (như String(x)), tức đúng
 * giá trị người dùng đã nhập: 0.1 → 0,1 (không phải 0,1000000000000000055…).
 */
export function fromNumber(value: number): Decimal {
  if (!Number.isFinite(value)) {
    throw new RangeError("Số không hữu hạn");
  }
  return parse(String(value));
}

/** Đọc chuỗi dạng "-12.345" hoặc "1.5e-7". */
export function parse(text: string): Decimal {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text.trim());
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new RangeError(`Không đọc được số: ${text}`);
  }
  const sign: 1 | -1 = match[1] === "-" ? -1 : 1;
  const intPart = match[2] || "0";
  const fracPart = match[3] ?? "";
  const exponent = match[4] ? Number(match[4]) : 0;
  let digits = intPart + fracPart;
  let scale = fracPart.length - exponent;
  if (scale < 0) {
    digits += "0".repeat(-scale);
    scale = 0;
  }
  return normalize(sign, digits, scale);
}

function pad(digits: string, scale: number, toScale: number): string {
  return digits + "0".repeat(toScale - scale);
}

/** So sánh độ lớn hai dãy chữ số không dấu cùng độ dài logic. */
function compareMagnitude(a: string, b: string): number {
  const x = a.replace(/^0+(?=\d)/, "");
  const y = b.replace(/^0+(?=\d)/, "");
  if (x.length !== y.length) {
    return x.length > y.length ? 1 : -1;
  }
  return x === y ? 0 : x > y ? 1 : -1;
}

function addDigits(a: string, b: string): string {
  let result = "";
  let carry = 0;
  for (let i = a.length - 1, j = b.length - 1; i >= 0 || j >= 0 || carry; i--, j--) {
    const sum = (i >= 0 ? a.charCodeAt(i) - 48 : 0) + (j >= 0 ? b.charCodeAt(j) - 48 : 0) + carry;
    result = String(sum % 10) + result;
    carry = sum >= 10 ? 1 : 0;
  }
  return result || "0";
}

/** a - b với a ≥ b (không dấu). */
function subtractDigits(a: string, b: string): string {
  let result = "";
  let borrow = 0;
  for (let i = a.length - 1, j = b.length - 1; i >= 0; i--, j--) {
    let diff = a.charCodeAt(i) - 48 - (j >= 0 ? b.charCodeAt(j) - 48 : 0) - borrow;
    borrow = diff < 0 ? 1 : 0;
    if (diff < 0) {
      diff += 10;
    }
    result = String(diff) + result;
  }
  return result.replace(/^0+(?=\d)/, "");
}

export function add(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  const x = pad(a.digits, a.scale, scale);
  const y = pad(b.digits, b.scale, scale);
  if (a.sign === b.sign) {
    return normalize(a.sign, addDigits(x, y), scale);
  }
  const cmp = compareMagnitude(x, y);
  if (cmp === 0) {
    return ZERO;
  }
  return cmp > 0
    ? normalize(a.sign, subtractDigits(x, y), scale)
    : normalize(b.sign, subtractDigits(y, x), scale);
}

export function multiply(a: Decimal, b: Decimal): Decimal {
  const x = a.digits;
  const y = b.digits;
  const result = new Array<number>(x.length + y.length).fill(0);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      const k = i + j + 1;
      const sum = (x.charCodeAt(i) - 48) * (y.charCodeAt(j) - 48) + result[k];
      result[k] = sum % 10;
      result[k - 1] += Math.floor(sum / 10);
    }
  }
  return normalize(a.sign === b.sign ? 1 : -1, result.join(""), a.scale + b.scale);
}

export function sum(values: readonly Decimal[]): Decimal {
  return values.reduce(add, ZERO);
}

export function isNegative(value: Decimal): boolean {
  return value.sign < 0 && value.digits !== "0";
}

export function isZero(value: Decimal): boolean {
  return value.digits === "0";
}

export function compare(a: Decimal, b: Decimal): number {
  const diff = add(a, { ...b, sign: b.sign === 1 ? -1 : 1 });
  return isZero(diff) ? 0 : diff.sign;
}

export function toString(value: Decimal): string {
  const { digits, scale } = value;
  const body =
    scale === 0
      ? digits
      : `${digits.length > scale ? digits.slice(0, -scale) : "0"}.${digits.padStart(scale, "0").slice(-scale)}`;
  return value.sign < 0 ? `-${body}` : body;
}

/** Về số JavaScript (để hiển thị, ghi vào Excel). Có thể mất chữ số sau chữ số có nghĩa thứ 17. */
export function toNumber(value: Decimal): number {
  return Number(toString(value));
}

/** Số chữ số có nghĩa của phần nguyên. */
export function integerDigits(value: Decimal): number {
  return Math.max(0, value.digits.length - value.scale);
}

export type DecimalRoundingMode = "round" | "roundUp" | "roundDown";

/**
 * Làm tròn tới `digits` chữ số thập phân (âm: hàng chục, trăm, nghìn…), cùng nghĩa với hàm Excel:
 * - round: ROUND, 0,5 làm tròn ra xa số 0;
 * - roundUp: ROUNDUP, luôn ra xa số 0;
 * - roundDown: ROUNDDOWN, luôn về phía số 0.
 */
export function round(value: Decimal, digits: number, mode: DecimalRoundingMode): Decimal {
  if (value.scale <= digits) {
    return value;
  }
  const drop = value.scale - digits;
  const padded = value.digits.padStart(drop + 1, "0");
  const kept = padded.slice(0, -drop) || "0";
  const removed = padded.slice(-drop);
  const removedIsZero = /^0*$/.test(removed);
  const awayFromZero =
    mode === "roundUp" ? !removedIsZero : mode === "round" ? removed.charCodeAt(0) >= 53 : false;
  let resultDigits = awayFromZero ? addDigits(kept, "1") : kept;
  let resultScale = digits;
  if (resultScale < 0) {
    resultDigits += "0".repeat(-resultScale);
    resultScale = 0;
  }
  return normalize(value.sign, resultDigits, resultScale);
}
