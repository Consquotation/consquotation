/**
 * Ngày hiệu lực dạng "YYYY-MM-DD". So sánh chuỗi là đủ vì định dạng cố định độ dài.
 * "today" luôn được truyền vào để test được và không phụ thuộc giờ hệ thống.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Ngày hôm nay theo giờ máy, dạng YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatIsoDate(value: string | null): string {
  if (!value || !isIsoDate(value)) {
    return "";
  }
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

/** Thời điểm ISO (có giờ) → "dd/mm/yyyy hh:mm" theo giờ máy; chuỗi không hợp lệ giữ nguyên. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Tình trạng hiệu lực tại ngày `today`:
 * - "noDates": không ghi ngày hiệu lực (không tự suy diễn là còn hay hết hạn)
 * - "notYetEffective": chưa đến ngày bắt đầu
 * - "active": trong khoảng hiệu lực
 * - "expired": đã qua ngày kết thúc
 */
export type Validity = "noDates" | "notYetEffective" | "active" | "expired";

export function validityOn(
  effectiveFrom: string | null,
  effectiveTo: string | null,
  today: string
): Validity {
  if (!effectiveFrom && !effectiveTo) {
    return "noDates";
  }
  if (effectiveFrom && today < effectiveFrom) {
    return "notYetEffective";
  }
  if (effectiveTo && today > effectiveTo) {
    return "expired";
  }
  return "active";
}

/** Hai khoảng hiệu lực (null = không giới hạn phía đó) có giao nhau không. */
export function periodsOverlap(
  a: { effectiveFrom: string | null; effectiveTo: string | null },
  b: { effectiveFrom: string | null; effectiveTo: string | null }
): boolean {
  const aStart = a.effectiveFrom ?? "0000-01-01";
  const aEnd = a.effectiveTo ?? "9999-12-31";
  const bStart = b.effectiveFrom ?? "0000-01-01";
  const bEnd = b.effectiveTo ?? "9999-12-31";
  return aStart <= bEnd && bStart <= aEnd;
}
