import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_CELL_TEXT, XlsxCellTooLongError, buildXlsx } from "../../src/shared/xlsx";
import { createZip, crc32, toBase64 } from "../../src/shared/zip";

/** Đọc lại gói ZIP kiểu STORE (đủ để kiểm chứng file do createZip sinh ra). */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, string>();
  let p = 0;
  while (view.getUint32(p, true) === 0x04034b50) {
    expect(view.getUint16(p + 8, true)).toBe(0);
    const crc = view.getUint32(p + 14, true);
    const size = view.getUint32(p + 18, true);
    const nameLength = view.getUint16(p + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLength));
    const data = bytes.subarray(p + 30 + nameLength, p + 30 + nameLength + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, new TextDecoder().decode(data));
    p += 30 + nameLength + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(files.size);
  return files;
}

describe("zip", () => {
  it("crc32 đúng giá trị chuẩn", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("đọc lại được mọi file đã đóng gói", () => {
    const zip = createZip([
      { name: "a.txt", data: new TextEncoder().encode("Tiếng Việt") },
      { name: "b/c.xml", data: new Uint8Array(0) },
    ]);
    const files = readStoredZip(zip);
    expect(files.get("a.txt")).toBe("Tiếng Việt");
    expect(files.get("b/c.xml")).toBe("");
  });

  it("toBase64 khớp Buffer kể cả dữ liệu lớn hơn một khối", () => {
    const bytes = new Uint8Array(100_000).map((_v, i) => (i * 7) % 256);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("buildXlsx", () => {
  const sheet = {
    name: "Công tác",
    columns: [{ width: 12, text: true }, { width: 30 }, { width: 12 }],
    rows: [
      ["Mã", "Tên", "Đơn giá"],
      ["007", "=SUM(A1:A3) & <b>\"x\"", 1.5],
      ["BT-01", "Bê tông\u0001 lót", null],
    ],
    headerRows: 1,
  };

  it("chữ ghi dạng inline string (không thành công thức), giữ số 0 đầu, escape XML", () => {
    const files = readStoredZip(buildXlsx([sheet]));
    const xml = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(xml).toContain(`<c r="A2" s="1" t="inlineStr"><is><t xml:space="preserve">007</t></is></c>`);
    expect(xml).toContain("=SUM(A1:A3) &amp; &lt;b&gt;&quot;x&quot;");
    expect(xml).not.toContain("<f>");
    expect(xml).toContain(`<c r="C2"><v>1.5</v></c>`);
    expect(xml).toContain("Bê tông lót");
    expect(xml).not.toContain(`r="C3"`);
    expect(files.get("xl/workbook.xml")).toContain(`name="Công tác"`);
    expect([...files.keys()]).toContain("[Content_Types].xml");
  });

  it("báo lỗi rõ khi một ô vượt giới hạn ký tự của Excel", () => {
    const long = { ...sheet, rows: [["x".repeat(MAX_CELL_TEXT + 1)]] , headerRows: 0 };
    expect(() => buildXlsx([long])).toThrow(XlsxCellTooLongError);
  });

  it("ghi file thử để mở bằng Excel thật khi đặt CQ_XLSX_OUT", () => {
    const out = process.env.CQ_XLSX_OUT;
    if (out) {
      writeFileSync(out, buildXlsx([sheet, { ...sheet, name: "Trống", rows: [["Mã"]] }]));
    }
  });
});
