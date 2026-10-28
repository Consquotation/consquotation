// Cấp phép ConsQuotation cho một email (ADR-0015). Chạy trên máy chủ sản phẩm:
//   npm run license:grant -- <email>
// Việc lệnh làm:
// 1. Sinh mã 20 ký tự ngẫu nhiên cho email (email đã cấp thì dùng lại mã cũ, không sinh mã mới).
// 2. Thêm SHA-256("cq-license-v1|email|mã") vào licenses.json (không ghi email hay mã gốc vào repo).
// 3. Ghi email + mã vào sổ cấp phép trên máy, NGOÀI repo (mặc định %USERPROFILE%\ConsQuotation-licenses).
// 4. In nội dung thư trả lời và đường dẫn soạn thư Gmail.
// Sau đó: gửi thư, rồi commit và push licenses.json để GitHub Pages cập nhật.
//
// Cách băm và bảng ký tự phải khớp src/domain/license/license.ts (có unit test đối chiếu).

/* global console, process */

import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CODE_LENGTH = 20;
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LICENSE_SALT = "cq-license-v1";
export const LICENSE_LIST_FORMAT = "consquotation-licenses";

export const normalizeEmail = (text) => text.trim().toLowerCase();
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function generateCode(bytes = randomBytes) {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  for (;;) {
    let code = "";
    while (code.length < CODE_LENGTH) {
      for (const byte of bytes(32)) {
        if (byte < limit && code.length < CODE_LENGTH) {
          code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        }
      }
    }
    if (/[A-Z]/.test(code) && /[0-9]/.test(code)) {
      return code;
    }
  }
}

export const licenseKey = (email, code) =>
  createHash("sha256").update(`${LICENSE_SALT}|${email}|${code}`, "utf8").digest("hex");

/** Đọc sổ cấp phép (CSV: ngày,email,mã) → Map email → mã. */
export function readLedger(path) {
  const ledger = new Map();
  if (!existsSync(path)) {
    return ledger;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/).slice(1)) {
    const [, email, code] = line.split(",");
    if (email && code) {
      ledger.set(email, code);
    }
  }
  return ledger;
}

export function replyMail(email, code) {
  const subject = "Mã cấp phép ConsQuotation";
  const body = [
    "Chào anh/chị,",
    "",
    `Yêu cầu cấp phép ConsQuotation cho email ${email} đã được chấp nhận.`,
    "",
    `Mã cấp phép: ${code}`,
    "",
    "Cách kích hoạt: mở ConsQuotation trong Excel › tab Cài đặt › mục Cấp phép, nhập đúng email này và mã ở trên, rồi bấm Kích hoạt.",
    "Mã dùng vĩnh viễn cho email này. Trên máy khác, nhập lại cùng email và mã một lần.",
    "Vui lòng không chia sẻ mã cho người khác.",
  ].join("\n");
  const gmail =
    "https://mail.google.com/mail/?view=cm&fs=1" +
    `&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, gmail };
}

/** Thêm khóa vào danh sách (không trùng); tạo file nếu chưa có. */
export function addKey(listPath, key) {
  const list = existsSync(listPath)
    ? JSON.parse(readFileSync(listPath, "utf8"))
    : { format: LICENSE_LIST_FORMAT, version: 1, keys: [] };
  if (list.format !== LICENSE_LIST_FORMAT || !Array.isArray(list.keys)) {
    throw new Error(`${listPath} không đúng định dạng danh sách cấp phép.`);
  }
  if (!list.keys.includes(key)) {
    list.keys.push(key);
  }
  writeFileSync(listPath, JSON.stringify(list, null, 2) + "\n", "utf8");
  return list.keys.length;
}

function main(argv) {
  const args = argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : fallback;
  };
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const listPath = option("--list", join(repoRoot, "licenses.json"));
  const ledgerPath = option("--ledger", join(homedir(), "ConsQuotation-licenses", "ledger.csv"));
  const email = normalizeEmail(args[0] ?? "");
  if (!isValidEmail(email)) {
    console.error("Dùng: npm run license:grant -- <email>");
    process.exit(1);
  }
  const ledger = readLedger(ledgerPath);
  const existing = ledger.get(email);
  const code = existing ?? generateCode();
  if (!existing) {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    if (!existsSync(ledgerPath)) {
      writeFileSync(ledgerPath, "ngay,email,ma\n", "utf8");
    }
    appendFileSync(
      ledgerPath,
      `${new Date().toISOString().slice(0, 10)},${email},${code}\n`,
      "utf8"
    );
  }
  const total = addKey(listPath, licenseKey(email, code));
  const mail = replyMail(email, code);
  console.log(
    existing ? `Email ${email} đã được cấp trước đó; dùng lại mã cũ.` : `Đã cấp phép cho ${email}.`
  );
  console.log(`Mã cấp phép: ${code}`);
  console.log(`Danh sách: ${listPath} (${total} tài khoản)`);
  console.log(`Sổ cấp phép (ngoài repo): ${ledgerPath}`);
  console.log("\n--- Thư trả lời ---");
  console.log(`Tới: ${email}\nTiêu đề: ${mail.subject}\n\n${mail.body}`);
  console.log("\n--- Mở để soạn trong Gmail ---");
  console.log(mail.gmail);
  console.log(
    "\nBước tiếp: gửi thư, rồi commit + push licenses.json (GitHub Pages cập nhật sau vài phút)."
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv);
}
