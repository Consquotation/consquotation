// Khai báo kiểu cho scripts/license-grant.mjs (để unit test đối chiếu với src/domain/license).
export const CODE_LENGTH: number;
export const CODE_ALPHABET: string;
export const LICENSE_SALT: string;
export const LICENSE_LIST_FORMAT: string;
export function normalizeEmail(text: string): string;
export function isValidEmail(email: string): boolean;
export function generateCode(bytes?: (count: number) => Uint8Array): string;
export function licenseKey(email: string, code: string): string;
export function readLedger(path: string): Map<string, string>;
export function replyMail(email: string, code: string): { subject: string; body: string; gmail: string };
export function addKey(listPath: string, key: string): number;
