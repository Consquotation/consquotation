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

export function recordError(operation: string, error: unknown): void {
  const entry: DiagnosticEntry = {
    at: new Date().toISOString(),
    operation,
    code: errorCode(error),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
  // Để chẩn đoán trong DevTools; cùng mức an toàn: chỉ mã lỗi.
  console.warn(`[ConsQuotation] ${operation}: ${entry.code}`);
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
