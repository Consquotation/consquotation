/**
 * Use case cấp phép (ADR-0015): trạng thái dùng thử/cấp phép trên máy và kích hoạt bằng email + mã.
 * Lưu trữ và tải danh sách cấp phép là port để test được và để giao diện không gắn với localStorage.
 */

import {
  Activation,
  LicenseState,
  isValidEmail,
  isWellFormedCode,
  licenseKey,
  normalizeCode,
  normalizeEmail,
  parseLicenseList,
  resolveLicenseState,
} from "../domain/license/license";

export interface StoredLicense {
  trialStart: string | null;
  activation: Activation | null;
}

export interface LicenseStorage {
  read(): StoredLicense;
  write(next: StoredLicense): void;
}

export type ActivateResult =
  | { ok: true; state: LicenseState }
  | { ok: false; reason: "invalidEmail" | "invalidCode" | "notFound" | "unavailable" };

export class LicenseService {
  constructor(
    private readonly storage: LicenseStorage,
    /** Tải licenses.json (đã parse JSON); lỗi mạng ném ra. */
    private readonly fetchList: () => Promise<unknown>,
    private readonly now: () => Date
  ) {}

  /** Trạng thái hiện tại; lần đầu gọi trên máy thì bắt đầu tính 30 ngày dùng thử. */
  state(): LicenseState {
    const stored = this.storage.read();
    let trialStart = stored.trialStart;
    if (!trialStart) {
      trialStart = this.now().toISOString();
      this.storage.write({ ...stored, trialStart });
    }
    return resolveLicenseState({ trialStart, activation: stored.activation }, this.now());
  }

  async activate(emailText: string, codeText: string): Promise<ActivateResult> {
    const email = normalizeEmail(emailText);
    const code = normalizeCode(codeText);
    if (!isValidEmail(email)) {
      return { ok: false, reason: "invalidEmail" };
    }
    if (!isWellFormedCode(code)) {
      return { ok: false, reason: "invalidCode" };
    }
    let keys: Set<string> | null;
    try {
      keys = parseLicenseList(await this.fetchList());
    } catch {
      keys = null;
    }
    if (!keys) {
      return { ok: false, reason: "unavailable" };
    }
    if (!keys.has(await licenseKey(email, code))) {
      return { ok: false, reason: "notFound" };
    }
    const stored = this.storage.read();
    this.storage.write({
      trialStart: stored.trialStart ?? this.now().toISOString(),
      activation: { email, code, activatedAt: this.now().toISOString() },
    });
    return { ok: true, state: this.state() };
  }
}
