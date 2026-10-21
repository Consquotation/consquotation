/**
 * Id ngẫu nhiên cho bản ghi thư viện. `crypto.randomUUID` chỉ có từ Safari 15.4 / Chrome 92
 * (prompts/14: Excel trên Mac cũ hơn); dự phòng bằng `crypto.getRandomValues` (UUID v4).
 */

/* global crypto */

export function randomId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
