/**
 * Cấp phép sử dụng (ADR-0015, phương án 1: email + mã, không máy chủ).
 * - Dùng thử đủ tính năng 30 ngày, tính từ lần đầu mở add-in trên máy.
 * - Chủ sản phẩm cấp cho mỗi email một mã 20 ký tự ngẫu nhiên. Danh sách cấp phép công khai
 *   (licenses.json) chỉ chứa SHA-256 của "cq-license-v1|email|mã": không có mã thì không dò được.
 * - Kiểm tra chạy phía máy người dùng: chỉ ngăn người dùng thông thường (đã ghi trong ADR).
 * Thuần TypeScript, không gọi Office.js; băm bằng Web Crypto (có trong trình duyệt và Node).
 */

/* global crypto, TextEncoder */

export const LICENSE_OWNER_EMAIL = "nguyenchikhoa97@gmail.com";
export const TRIAL_DAYS = 30;
export const CODE_LENGTH = 20;
/** Chữ hoa và chữ số, bỏ ký tự dễ nhầm khi đọc/gõ lại: 0/O, 1/I/L. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LICENSE_SALT = "cq-license-v1";
export const LICENSE_LIST_FORMAT = "consquotation-licenses";
const DAY_MS = 86_400_000;

export function normalizeEmail(text: string): string {
  return text.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Người dùng có thể dán mã kèm khoảng trắng, gạch nối hay chữ thường. */
export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[\s-]/g, "");
}

export function isWellFormedCode(code: string): boolean {
  return (
    code.length === CODE_LENGTH &&
    [...code].every((c) => CODE_ALPHABET.includes(c)) &&
    /[A-Z]/.test(code) &&
    /[0-9]/.test(code)
  );
}

/**
 * Mã ngẫu nhiên 20 ký tự, có cả chữ và số. Lấy mẫu loại bỏ (byte ≥ 248 bị bỏ) để mỗi ký tự trong
 * bảng 31 ký tự có xác suất như nhau.
 */
export function generateCode(randomBytes: (count: number) => Uint8Array): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  for (;;) {
    let code = "";
    while (code.length < CODE_LENGTH) {
      for (const byte of randomBytes(32)) {
        if (byte < limit && code.length < CODE_LENGTH) {
          code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        }
      }
    }
    if (isWellFormedCode(code)) {
      return code;
    }
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Khóa ghi trong licenses.json cho một cặp email + mã (đã chuẩn hóa). */
export function licenseKey(email: string, code: string): Promise<string> {
  return sha256Hex(`${LICENSE_SALT}|${email}|${code}`);
}

/** Đọc licenses.json; sai định dạng → null (không coi là "chưa được cấp phép"). */
export function parseLicenseList(json: unknown): Set<string> | null {
  if (
    typeof json !== "object" ||
    json === null ||
    (json as { format?: unknown }).format !== LICENSE_LIST_FORMAT ||
    !Array.isArray((json as { keys?: unknown }).keys)
  ) {
    return null;
  }
  const keys = (json as { keys: unknown[] }).keys;
  return new Set(
    keys.filter((k): k is string => typeof k === "string" && /^[0-9a-f]{64}$/.test(k))
  );
}

export interface Activation {
  email: string;
  code: string;
  activatedAt: string;
}

export type LicenseState =
  | { kind: "licensed"; email: string; code: string; activatedAt: string }
  | { kind: "trial"; startedAt: string; endsAt: string; daysLeft: number }
  | { kind: "expired"; startedAt: string; endedAt: string };

/** Trạng thái theo dữ liệu đã lưu trên máy. Cấp phép vĩnh viễn: đã kích hoạt thì không hết hạn. */
export function resolveLicenseState(
  stored: { trialStart: string; activation: Activation | null },
  now: Date
): LicenseState {
  if (stored.activation) {
    return { kind: "licensed", ...stored.activation };
  }
  const start = new Date(stored.trialStart).getTime();
  const end = start + TRIAL_DAYS * DAY_MS;
  const endsAt = new Date(end).toISOString();
  if (now.getTime() >= end) {
    return { kind: "expired", startedAt: stored.trialStart, endedAt: endsAt };
  }
  return {
    kind: "trial",
    startedAt: stored.trialStart,
    endsAt,
    daysLeft: Math.ceil((end - now.getTime()) / DAY_MS),
  };
}

/** Ngày theo giờ máy người dùng, dạng dd/mm/yyyy (cắt chuỗi ISO UTC có thể lệch một ngày). */
export function formatLocalDate(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Nội dung thư xin cấp phép (người dùng tự gửi từ hộp thư của mình). */
export function licenseRequest(input: { appVersion: string; trialStart: string }): {
  to: string;
  subject: string;
  body: string;
} {
  return {
    to: LICENSE_OWNER_EMAIL,
    subject: "Yêu cầu cấp phép ConsQuotation",
    body: [
      "Chào anh/chị,",
      "",
      "Tôi xin cấp phép sử dụng add-in ConsQuotation cho địa chỉ email gửi thư này.",
      `Phiên bản add-in: ${input.appVersion}`,
      `Bắt đầu dùng thử: ${formatLocalDate(input.trialStart)}`,
      "",
      "Họ tên / đơn vị (nếu muốn ghi):",
    ].join("\n"),
  };
}

/** Trang soạn thư Gmail trên web (mở bằng trình duyệt; không cần ứng dụng thư trên máy). */
export function gmailComposeUrl(mail: { to: string; subject: string; body: string }): string {
  return (
    "https://mail.google.com/mail/?view=cm&fs=1" +
    `&to=${encodeURIComponent(mail.to)}&su=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`
  );
}

/** Trang soạn thư Outlook.com trên web. */
export function outlookComposeUrl(mail: { to: string; subject: string; body: string }): string {
  return (
    "https://outlook.live.com/mail/0/deeplink/compose" +
    `?to=${encodeURIComponent(mail.to)}&subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`
  );
}

export function mailtoUrl(mail: { to: string; subject: string; body: string }): string {
  return `mailto:${mail.to}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
}
