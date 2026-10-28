import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LicenseService,
  LicenseStorage,
  StoredLicense,
} from "../../src/application/licenseService";
import {
  CODE_ALPHABET,
  LICENSE_OWNER_EMAIL,
  generateCode,
  gmailComposeUrl,
  isValidEmail,
  isWellFormedCode,
  licenseKey,
  licenseRequest,
  mailtoUrl,
  outlookComposeUrl,
  normalizeCode,
  normalizeEmail,
  parseLicenseList,
  resolveLicenseState,
} from "../../src/domain/license/license";
// Lệnh cấp phép của chủ sản phẩm (Node): phải sinh khóa giống hệt add-in.
import * as grant from "../../scripts/license-grant.mjs";

const T0 = new Date("2026-10-28T08:00:00.000Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);
const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

describe("email và mã", () => {
  it("chuẩn hóa: email chữ thường bỏ khoảng trắng; mã chữ hoa, bỏ khoảng trắng và gạch nối", () => {
    expect(normalizeEmail("  Nguyen.A@Gmail.COM ")).toBe("nguyen.a@gmail.com");
    expect(normalizeCode("abcd-efgh 2345 6789-abcd")).toBe("ABCDEFGH23456789ABCD");
    expect(isValidEmail("a@b.vn")).toBe(true);
    expect(["", "a@b", "a b@c.vn", "@c.vn"].map(isValidEmail)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("mã đúng dạng: 20 ký tự trong bảng, có cả chữ và số; không nhận ký tự dễ nhầm 0, O, 1, I, L", () => {
    expect(isWellFormedCode("ABCDEFGH23456789ABCD")).toBe(true);
    expect(isWellFormedCode("ABCDEFGH23456789ABC")).toBe(false); // 19 ký tự
    expect(isWellFormedCode("ABCDEFGHJKMNPQRSTUVW")).toBe(false); // không có số
    expect(isWellFormedCode("23456789234567892345")).toBe(false); // không có chữ
    for (const bad of ["0", "O", "1", "I", "L"]) {
      expect(isWellFormedCode(`ABCDEFGH2345678${bad}ABCD`)).toBe(false);
      expect(CODE_ALPHABET).not.toContain(bad);
    }
  });

  it("sinh mã: luôn đúng dạng, 1.000 mã không trùng nhau, mọi ký tự trong bảng đều xuất hiện", () => {
    const codes = Array.from({ length: 1000 }, () => generateCode(randomBytes));
    expect(codes.every(isWellFormedCode)).toBe(true);
    expect(new Set(codes).size).toBe(1000);
    expect(new Set(codes.join("")).size).toBe(CODE_ALPHABET.length);
  });

  it("sinh mã bỏ byte ≥ 248 (để mỗi ký tự có xác suất như nhau)", () => {
    // Nguồn giả: 248 (phải bỏ), 10, 248, 11, … → mã là ký tự thứ 10..29 của bảng.
    const sequence = Array.from({ length: 20 }, (_v, j) => [248, 10 + j]).flat();
    let i = 0;
    const fake = (n: number) =>
      Uint8Array.from({ length: n }, () => sequence[i++ % sequence.length]);
    expect(generateCode(fake)).toBe("MNPQRSTUVWXYZ2345678");
    // 247 không bị bỏ: 247 % 31 = 30 → "9".
    expect(generateCode(() => Uint8Array.from({ length: 32 }, (_v, k) => (k % 2 ? 247 : 0)))).toBe(
      "A9A9A9A9A9A9A9A9A9A9"
    );
  });

  it('khóa băm = SHA-256("cq-license-v1|email|mã"), khớp giữa add-in và lệnh cấp phép', async () => {
    const email = "nguoi.thu@example.com";
    const code = "ABCDEFGH23456789ABCD";
    const independent = createHash("sha256").update(`cq-license-v1|${email}|${code}`).digest("hex");
    expect(await licenseKey(email, code)).toBe(independent);
    expect(grant.licenseKey(email, code)).toBe(independent);
    // Lệnh cấp phép dùng cùng bảng ký tự và cùng quy tắc.
    expect(grant.CODE_ALPHABET).toBe(CODE_ALPHABET);
    expect(Array.from({ length: 200 }, () => grant.generateCode()).every(isWellFormedCode)).toBe(
      true
    );
    expect(grant.normalizeEmail(" A@B.VN ")).toBe(normalizeEmail(" A@B.VN "));
  });

  it("đọc danh sách: sai định dạng → null; bỏ phần tử không phải SHA-256", () => {
    expect(parseLicenseList(null)).toBeNull();
    expect(parseLicenseList({ format: "khac", keys: [] })).toBeNull();
    expect(parseLicenseList({ format: "consquotation-licenses" })).toBeNull();
    const k = "a".repeat(64);
    expect([
      ...parseLicenseList({ format: "consquotation-licenses", version: 1, keys: [k, "xyz", 5] })!,
    ]).toEqual([k]);
  });
});

describe("dùng thử 30 ngày", () => {
  const start = T0.toISOString();
  it("ngày 0: còn 30 ngày; ngày 29,5: còn 1 ngày; đúng ngày 30: hết hạn", () => {
    expect(resolveLicenseState({ trialStart: start, activation: null }, T0)).toMatchObject({
      kind: "trial",
      daysLeft: 30,
    });
    expect(resolveLicenseState({ trialStart: start, activation: null }, day(29.5))).toMatchObject({
      kind: "trial",
      daysLeft: 1,
    });
    expect(resolveLicenseState({ trialStart: start, activation: null }, day(30))).toEqual({
      kind: "expired",
      startedAt: start,
      endedAt: day(30).toISOString(),
    });
  });

  it("đã kích hoạt: vĩnh viễn, kể cả sau khi hết dùng thử", () => {
    const activation = { email: "a@b.vn", code: "ABCDEFGH23456789ABCD", activatedAt: start };
    expect(resolveLicenseState({ trialStart: start, activation }, day(1000))).toEqual({
      kind: "licensed",
      ...activation,
    });
  });
});

describe("LicenseService", () => {
  function setup(keys: string[] | Error | unknown = []) {
    let stored: StoredLicense = { trialStart: null, activation: null };
    const storage: LicenseStorage = { read: () => stored, write: (next) => (stored = next) };
    let now = T0;
    const service = new LicenseService(
      storage,
      async () => {
        if (keys instanceof Error) throw keys;
        return Array.isArray(keys) ? { format: "consquotation-licenses", version: 1, keys } : keys;
      },
      () => now
    );
    return { service, stored: () => stored, setNow: (d: Date) => (now = d) };
  }

  it("lần đầu mở: bắt đầu dùng thử và lưu ngày bắt đầu; mở lại không tính lại", () => {
    const s = setup();
    expect(s.service.state()).toMatchObject({ kind: "trial", daysLeft: 30 });
    expect(s.stored().trialStart).toBe(T0.toISOString());
    s.setNow(day(10));
    expect(s.service.state()).toMatchObject({
      kind: "trial",
      daysLeft: 20,
      startedAt: T0.toISOString(),
    });
    s.setNow(day(31));
    expect(s.service.state().kind).toBe("expired");
  });

  it("kích hoạt đúng email + mã (gõ chữ thường, có gạch nối) → cấp phép vĩnh viễn, lưu trên máy", async () => {
    const email = "nguoi.thu@example.com";
    const code = "ABCDEFGH23456789ABCD";
    const s = setup([await licenseKey(email, code)]);
    s.service.state();
    s.setNow(day(40)); // đã hết dùng thử
    const result = await s.service.activate(" Nguoi.Thu@Example.com ", "abcd-efgh-2345-6789-abcd");
    expect(result).toMatchObject({ ok: true, state: { kind: "licensed", email, code } });
    s.setNow(day(4000));
    expect(s.service.state().kind).toBe("licensed");
    expect(s.stored().activation).toMatchObject({
      email,
      code,
      activatedAt: day(40).toISOString(),
    });
  });

  it("từ chối: email sai dạng, mã sai dạng, mã của email khác, danh sách không tải được", async () => {
    const key = await licenseKey("a@b.vn", "ABCDEFGH23456789ABCD");
    const s = setup([key]);
    expect(await s.service.activate("a@b", "ABCDEFGH23456789ABCD")).toEqual({
      ok: false,
      reason: "invalidEmail",
    });
    expect(await s.service.activate("a@b.vn", "ABCDEFGH2345678")).toEqual({
      ok: false,
      reason: "invalidCode",
    });
    expect(await s.service.activate("c@d.vn", "ABCDEFGH23456789ABCD")).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(await s.service.activate("a@b.vn", "ABCDEFGH23456789ABCE")).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(
      await setup(new Error("mạng")).service.activate("a@b.vn", "ABCDEFGH23456789ABCD")
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(
      await setup({ format: "sai" }).service.activate("a@b.vn", "ABCDEFGH23456789ABCD")
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(s.stored().activation).toBeNull();
  });
});

describe("thư yêu cầu và lệnh cấp phép", () => {
  it("thư yêu cầu gửi tới chủ sản phẩm, có phiên bản và ngày bắt đầu dùng thử; mailto mã hóa đúng", () => {
    const mail = licenseRequest({ appVersion: "1.12.0", trialStart: "2026-10-28T08:00:00.000Z" });
    expect(mail.to).toBe(LICENSE_OWNER_EMAIL);
    expect(mail.body).toContain("Phiên bản add-in: 1.12.0");
    expect(mail.body).toContain("Bắt đầu dùng thử: 28/10/2026");
    const gmail = new URL(gmailComposeUrl(mail));
    expect([
      gmail.origin,
      gmail.searchParams.get("to"),
      gmail.searchParams.get("su"),
      gmail.searchParams.get("body"),
    ]).toEqual(["https://mail.google.com", LICENSE_OWNER_EMAIL, mail.subject, mail.body]);
    const outlook = new URL(outlookComposeUrl(mail));
    expect([
      outlook.origin,
      outlook.searchParams.get("to"),
      outlook.searchParams.get("subject"),
      outlook.searchParams.get("body"),
    ]).toEqual(["https://outlook.live.com", LICENSE_OWNER_EMAIL, mail.subject, mail.body]);
    const url = mailtoUrl(mail);
    expect(url.startsWith("mailto:nguyenchikhoa97@gmail.com?subject=")).toBe(true);
    expect(decodeURIComponent(url.split("&body=")[1])).toBe(mail.body);
  });

  it("lệnh cấp phép: thêm khóa không trùng; sổ cấp phép đọc lại được; thư trả lời có mã và link Gmail", () => {
    const dir = mkdtempSync(join(tmpdir(), "cq-license-"));
    const list = join(dir, "licenses.json");
    const key = grant.licenseKey("a@b.vn", "ABCDEFGH23456789ABCD");
    expect(grant.addKey(list, key)).toBe(1);
    expect(grant.addKey(list, key)).toBe(1);
    expect(JSON.parse(readFileSync(list, "utf8"))).toEqual({
      format: "consquotation-licenses",
      version: 1,
      keys: [key],
    });
    const ledger = join(dir, "ledger.csv");
    writeFileSync(ledger, "ngay,email,ma\n2026-10-28,a@b.vn,ABCDEFGH23456789ABCD\n");
    expect(grant.readLedger(ledger).get("a@b.vn")).toBe("ABCDEFGH23456789ABCD");
    const reply = grant.replyMail("a@b.vn", "ABCDEFGH23456789ABCD");
    expect(reply.body).toContain("Mã cấp phép: ABCDEFGH23456789ABCD");
    expect(reply.gmail).toContain("to=a%40b.vn");
    writeFileSync(list, JSON.stringify({ format: "khac", keys: [] }));
    expect(() => grant.addKey(list, key)).toThrow("không đúng định dạng");
  });
});
