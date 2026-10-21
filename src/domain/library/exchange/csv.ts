/**
 * Đọc file chữ do người dùng chọn (CSV, JSON). Chỉ nhận UTF-8 (có/không BOM) hoặc UTF-16
 * có BOM; không đoán bảng mã khác để tránh hỏng tiếng Việt (prompts/09).
 */

/* global TextDecoder */

export type DecodeResult = { ok: true; text: string } | { ok: false; message: string };

export function decodeTextFile(bytes: Uint8Array): DecodeResult {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { ok: true, text: new TextDecoder("utf-16le").decode(bytes.subarray(2)) };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { ok: true, text: new TextDecoder("utf-16be").decode(bytes.subarray(2)) };
  }
  const start =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start)),
    };
  } catch {
    return {
      ok: false,
      message:
        'File không phải UTF-8 nên tiếng Việt có thể bị hỏng. Trong Excel, hãy lưu lại bằng File › Save As › "CSV UTF-8 (Comma delimited)".',
    };
  }
}

const DELIMITERS = [",", ";", "\t"] as const;

/** Chọn dấu phân cách xuất hiện nhiều nhất (ngoài dấu nháy) ở dòng đầu có dữ liệu. */
export function detectDelimiter(text: string): string {
  const sep = /^sep=(.)\r?\n/i.exec(text);
  if (sep) {
    return sep[1];
  }
  let line = "";
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (line.trim() !== "") {
        break;
      }
      line = "";
      continue;
    }
    if (!inQuotes) {
      line += ch;
    }
  }
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = line.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Phân tích CSV theo RFC 4180 (dấu nháy kép, xuống dòng trong ô). Mọi ô trả về dạng chữ. */
export function parseCsv(text: string): string[][] {
  let body = text;
  const delimiter = detectDelimiter(body);
  body = body.replace(/^sep=.\r?\n/i, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") {
        i++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
