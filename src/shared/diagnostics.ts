/**
 * Nhật ký lỗi kỹ thuật an toàn (prompts/13): KHÔNG nuốt lỗi im lặng nhưng cũng KHÔNG lưu dữ liệu
 * nhạy cảm. Chỉ ghi thời điểm, thao tác và mã/tên lỗi — không ghi thông điệp gốc (có thể chứa
 * nội dung ô, tên khách hàng…), không gửi đi đâu, chỉ tồn tại trong phiên task pane hiện tại.
 */

/* global console */

export interface DiagnosticEntry {
  at: string;
  operation: string;
  /** Mã lỗi Office (ví dụ AccessDenied) hoặc tên lỗi JS (ví dụ QuotaExceededError). */
  code: string;
  /** Vị trí lỗi do Office.js báo (debugInfo.errorLocation, ví dụ "Range.values"); không chứa dữ liệu ô. */
  location?: string;
}

const MAX_ENTRIES = 50;
const entries: DiagnosticEntry[] = [];
const listeners = new Set<() => void>();

/** Chỉ lấy mã/tên — không bao giờ lấy message. */
export function errorCode(error: unknown): string {
  const e = error as { code?: unknown; name?: unknown } | null;
  if (e && typeof e.code === "string" && e.code) {
    return e.code;
  }
  if (e && typeof e.name === "string" && e.name) {
    return e.name;
  }
  return typeof error;
}

/** Chỉ lấy debugInfo.errorLocation (tên API), không lấy debugInfo.statement (có thể chứa giá trị ô). */
export function errorLocation(error: unknown): string | undefined {
  const info = (error as { debugInfo?: { errorLocation?: unknown } } | null)?.debugInfo;
  return typeof info?.errorLocation === "string" && info.errorLocation
    ? info.errorLocation
    : undefined;
}

/** Lỗi đã ghi (theo đối tượng lỗi): lớp ngoài không ghi lặp cùng một lỗi. */
const recorded = new WeakSet<object>();

export function recordError(operation: string, error: unknown): void {
  if (typeof error === "object" && error !== null) {
    if (recorded.has(error)) {
      return;
    }
    recorded.add(error);
  }
  const location = errorLocation(error);
  const entry: DiagnosticEntry = {
    at: new Date().toISOString(),
    operation,
    code: errorCode(error),
    ...(location ? { location } : {}),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
  // Để chẩn đoán trong DevTools; cùng mức an toàn: chỉ mã lỗi.
  console.warn(`[ConsQuotation] ${operation}: ${entry.code}${location ? ` @ ${location}` : ""}`);
  listeners.forEach((listener) => listener());
}

export function diagnosticEntries(): readonly DiagnosticEntry[] {
  return [...entries];
}

export function clearDiagnostics(): void {
  entries.length = 0;
  listeners.forEach((listener) => listener());
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
