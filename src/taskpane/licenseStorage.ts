/**
 * Lưu trạng thái cấp phép trên máy (localStorage của add-in, ADR-0015). Xóa cache Office thì mất:
 * dùng thử tính lại từ đầu, người đã được cấp phép nhập lại email + mã.
 */

import { LicenseStorage, StoredLicense } from "../application/licenseService";

/* global localStorage */

const KEY = "consquotation.license.v1";
const EMPTY: StoredLicense = { trialStart: null, activation: null };

export const browserLicenseStorage: LicenseStorage = {
  read(): StoredLicense {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<StoredLicense>) : null;
      return {
        trialStart: typeof parsed?.trialStart === "string" ? parsed.trialStart : null,
        activation:
          parsed?.activation && typeof parsed.activation.email === "string"
            ? parsed.activation
            : null,
      };
    } catch {
      return EMPTY;
    }
  },
  write(next: StoredLicense): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Không lưu được (bộ nhớ bị chặn): lần mở sau coi như lần đầu.
    }
  },
};
