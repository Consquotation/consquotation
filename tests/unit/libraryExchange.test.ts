import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { LibraryService } from "../../src/application/libraryService";
import {
  analyzeImport,
  changeCount,
  DuplicateMode,
} from "../../src/domain/library/exchange/analyze";
import {
  backupFileName,
  checkBackupMeta,
  datasetFromBackupSheet,
  exportSheets,
  parseBackupJson,
  toBackupJson,
} from "../../src/domain/library/exchange/backup";
import {
  RawCell,
  excelSerialToIso,
  isDateNumberFormat,
  parseDateCell,
  parseDateText,
  parseNumberCell,
  parseTextCell,
} from "../../src/domain/library/exchange/cells";
import { decodeTextFile, detectDelimiter, parseCsv } from "../../src/domain/library/exchange/csv";
import {
  DATASETS,
  DATASET_KINDS,
  EXCHANGE_SCHEMA_VERSION,
  csvTemplate,
} from "../../src/domain/library/exchange/schema";
import {
  ImportDataset,
  MAX_IMPORT_ROWS,
  SourceTable,
  autoMap,
  datasetFromTable,
  detectHeaderRow,
  guessKind,
  headerTexts,
} from "../../src/domain/library/exchange/source";
import { EMPTY_LIBRARY, LibrarySnapshot } from "../../src/domain/library/types";
import { IndexedDbLibraryRepository } from "../../src/storage/indexedDbLibraryRepository";

const T = "2026-10-21T00:00:00.000Z";

/** Bảng nguồn kiểu CSV (mọi ô là chữ). */
function csvTable(text: string, label = 'File "x.csv"'): SourceTable {
  return {
    label,
    firstRowNumber: 1,
    firstColumnIndex: 0,
    rows: parseCsv(text).map((row) => row.map((value): RawCell => ({ value }))),
  };
}

/** Đọc bảng như bước giao diện: nhận diện tiêu đề, đoán loại, tự map. */
function datasetFromCsv(text: string): ImportDataset {
  const table = csvTable(text);
  const headerIndex = detectHeaderRow(table);
  const kind = guessKind(headerTexts(table, headerIndex));
  if (!kind) {
    throw new Error("không nhận ra loại");
  }
  return datasetFromTable(table, headerIndex, kind, autoMap(kind, headerTexts(table, headerIndex)));
}

function analyze(
  datasets: ImportDataset[],
  library: LibrarySnapshot = EMPTY_LIBRARY,
  mode: DuplicateMode = "skip"
) {
  let n = 0;
  return analyzeImport(datasets, library, { mode, now: T, newId: () => `new-${++n}` });
}

function sampleLibrary(): LibrarySnapshot {
  const stamp = { createdAt: "2026-01-02T03:04:05.000Z", updatedAt: "2026-02-03T04:05:06.000Z" };
  return {
    categories: [{ id: "c1", name: "Móng", notes: "nhóm thử", ...stamp }],
    suppliers: [
      { id: "s1", name: "Công ty Thử A", contactInfo: "0901 000 000", notes: "", ...stamp },
    ],
    workItems: [
      {
        id: "w1",
        code: "007",
        name: 'Bê tông lót móng "đá 4x6"',
        categoryId: "c1",
        unit: "m3",
        description: "Dòng 1\nDòng 2",
        pricingMethod: "direct",
        unitPrice: 1234567.891,
        currency: "VND",
        supplierId: "s1",
        source: "Báo giá NCC A",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
        notes: "=SUM(A1)",
        ...stamp,
      },
      {
        id: "w2",
        code: "DD-01",
        name: "Đào đất",
        categoryId: null,
        unit: "m3",
        description: "",
        pricingMethod: "direct",
        unitPrice: null,
        currency: "",
        supplierId: null,
        source: "",
        effectiveFrom: null,
        effectiveTo: null,
        notes: "",
        ...stamp,
      },
    ],
    resources: [
      {
        id: "r1",
        code: "XM",
        name: "Xi măng PCB40",
        type: "material",
        categoryId: "c1",
        unit: "kg",
        notes: "",
        ...stamp,
      },
      {
        id: "r2",
        code: "NC3/7",
        name: "Nhân công 3/7",
        type: "labor",
        categoryId: null,
        unit: "công",
        notes: "ghi chú",
        ...stamp,
      },
    ],
    resourcePrices: [
      {
        id: "p1",
        resourceId: "r1",
        price: 1.5,
        unit: "kg",
        currency: "VND",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        supplierId: "s1",
        source: "TB giá Q1",
        status: "active",
        notes: "",
        ...stamp,
      },
      {
        id: "p2",
        resourceId: "r1",
        price: 1.6,
        unit: "kg",
        currency: "VND",
        effectiveFrom: null,
        effectiveTo: null,
        supplierId: null,
        source: "",
        status: "inactive",
        notes: "cũ",
        ...stamp,
      },
    ],
    norms: [
      {
        id: "n1",
        code: "007",
        name: 'Bê tông lót móng "đá 4x6"',
        unit: "m3",
        categoryId: "c1",
        workItemId: "w1",
        version: "1",
        effectiveFrom: "2026-01-01",
        sourceType: "document",
        source: "Tài liệu thử",
        sourceVerified: false,
        status: "approved",
        wasteIncluded: false,
        notes: "",
        ...stamp,
      },
    ],
    normComponents: [
      {
        id: "nc1",
        normId: "n1",
        resourceId: "r1",
        resourceCodeSnapshot: "XM",
        resourceNameSnapshot: "Xi măng PCB40",
        resourceUnitSnapshot: "kg",
        resourceTypeSnapshot: "material",
        consumption: 0.000123,
        wasteRate: 0.05,
        priceId: "p1",
        sortOrder: 1,
        notes: "",
        ...stamp,
      },
      {
        id: "nc2",
        normId: "n1",
        resourceId: "r2",
        resourceCodeSnapshot: "NC3/7",
        resourceNameSnapshot: "Nhân công 3/7",
        resourceUnitSnapshot: "công",
        resourceTypeSnapshot: "labor",
        consumption: 1.25,
        wasteRate: 0,
        priceId: null,
        sortOrder: 2,
        notes: "x",
        ...stamp,
      },
    ],
  };
}

const withoutStamps = <T extends { id: string; createdAt: string; updatedAt: string }>(
  items: T[]
) => items.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest);

describe("đọc ô", () => {
  it("ngày: ISO, dd/mm/yyyy; từ chối mơ hồ hoặc không có thật", () => {
    expect(parseDateText("2026-06-30")).toBe("2026-06-30");
    expect(parseDateText("30/06/2026")).toBe("2026-06-30");
    expect(parseDateText("1/7/2026")).toBe("2026-07-01");
    expect(parseDateText("31/02/2026")).toBeNull();
    expect(parseDateText("06/30/26")).toBeNull();
    expect(parseDateText("2026/06/30")).toBeNull();
    expect(parseDateCell({ value: 46203 }).ok).toBe(false); // số không có định dạng ngày
    expect(parseDateCell({ value: 46203, date: "2026-06-30" })).toEqual({
      ok: true,
      value: "2026-06-30",
    });
  });

  it("số ngày Excel (hệ 1900) → ISO, kể cả lỗi năm nhuận 1900", () => {
    expect(excelSerialToIso(1)).toBe("1900-01-01");
    expect(excelSerialToIso(59)).toBe("1900-02-28");
    expect(excelSerialToIso(60)).toBeNull();
    expect(excelSerialToIso(61)).toBe("1900-03-01");
    expect(excelSerialToIso(46203.75)).toBe("2026-06-30");
    expect(excelSerialToIso(0)).toBeNull();
  });

  it("nhận diện định dạng ngày của Excel", () => {
    expect(isDateNumberFormat("dd/mm/yyyy")).toBe(true);
    expect(isDateNumberFormat("m/d/yyyy")).toBe(true);
    expect(isDateNumberFormat("General")).toBe(false);
    expect(isDateNumberFormat("#,##0.00")).toBe(false);
    expect(isDateNumberFormat('#,##0 "đ"')).toBe(false);
    expect(isDateNumberFormat("[$-409]#,##0")).toBe(false);
    expect(isDateNumberFormat("h:mm")).toBe(false);
  });

  it("số: giữ thập phân; không đoán dấu phân cách hàng nghìn", () => {
    expect(parseNumberCell({ value: "1,5" })).toEqual({ ok: true, value: 1.5 });
    expect(parseNumberCell({ value: "0.000123" })).toEqual({ ok: true, value: 0.000123 });
    expect(parseNumberCell({ value: 1234567.891 })).toEqual({ ok: true, value: 1234567.891 });
    expect(parseNumberCell({ value: "1.500.000" }).ok).toBe(false);
    expect(parseNumberCell({ value: "abc" }).ok).toBe(false);
    expect(parseNumberCell({ value: true }).ok).toBe(false);
    expect(parseNumberCell({ value: "" })).toEqual({ ok: true, value: null });
  });

  it("chữ: mã số trong Excel lấy đúng chữ hiển thị; chuẩn hóa NFC", () => {
    expect(parseTextCell({ value: 7, text: "007" })).toBe("007");
    expect(parseTextCell({ value: "  BT-01 " })).toBe("BT-01");
    expect(parseTextCell({ value: "Bê tông" })).toBe("Bê tông");
  });
});

describe("đọc file chữ / CSV", () => {
  const enc = (text: string) => new TextEncoder().encode(text);

  it("UTF-8 có/không BOM, UTF-16; từ chối bảng mã khác thay vì làm hỏng tiếng Việt", () => {
    expect(decodeTextFile(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("Mã")]))).toEqual({
      ok: true,
      text: "Mã",
    });
    expect(decodeTextFile(enc("Đơn giá"))).toEqual({ ok: true, text: "Đơn giá" });
    const utf16 = new Uint8Array([
      0xff,
      0xfe,
      ...new Uint8Array(new Uint16Array([..."Mã"].map((c) => c.charCodeAt(0))).buffer),
    ]);
    expect(decodeTextFile(utf16)).toEqual({ ok: true, text: "Mã" });
    // "Mã" theo Windows-1258/1252: 0x4D 0xE3 — không phải UTF-8 hợp lệ.
    expect(decodeTextFile(new Uint8Array([0x4d, 0xe3])).ok).toBe(false);
  });

  it("dấu phân cách , ; tab; nháy kép, xuống dòng trong ô, CRLF", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n")).toBe("\t");
    expect(detectDelimiter('"a,b";c;d\n')).toBe(";");
    expect(parseCsv('Mã;Tên;Đơn giá\r\nBT-01;"Bê tông ""M200""\r\nlót";1,5\r\n')).toEqual([
      ["Mã", "Tên", "Đơn giá"],
      ["BT-01", 'Bê tông "M200"\r\nlót', "1,5"],
    ]);
    expect(parseCsv("sep=;\na;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("nhận diện tiêu đề, loại dữ liệu, map cột", () => {
  it("bỏ qua dòng tiêu đề phụ phía trên và đoán đúng từng loại", () => {
    const table = csvTable(
      "BẢNG GIÁ VẬT TƯ QUÝ 3,,,\n,,,\nma tai nguyen,DON GIA,Đơn vị tính,Tiền tệ\nXM,1500,kg,VND\n"
    );
    expect(detectHeaderRow(table)).toBe(2);
    expect(guessKind(headerTexts(table, 2))).toBe("resourcePrices");
    // Bảng định mức kiểu cũ (v1/v2) được nhận là thành phần định mức.
    expect(guessKind(["Mã công tác", "Mã tài nguyên", "Hao phí"])).toBe("normComponents");
    expect(guessKind(["Mã định mức", "Tên công tác", "Đơn vị tính", "Phiên bản"])).toBe("norms");
    expect(guessKind(["Mã tài nguyên", "Tên tài nguyên", "Đơn vị tính"])).toBe("resources");
    expect(guessKind(["Mã công tác", "Tên công tác", "ĐVT"])).toBe("workItems");
    expect(guessKind(["Cột 1", "Cột 2"])).toBeNull();
  });

  it("tiêu đề có dấu *, khác hoa thường, bí danh", () => {
    expect(
      autoMap("workItems", ["Mã công tác *", "Nội dung công việc", "ĐVT", "Giá"])
    ).toMatchObject({
      code: 0,
      name: 1,
      unit: 2,
      unitPrice: 3,
      category: null,
    });
  });

  it("file mẫu công bố trong docs/templates khớp schema", () => {
    const files: Record<string, string> = {
      categories: "nhom.csv",
      suppliers: "nha-cung-cap.csv",
      normComponents: "thanh-phan-dinh-muc.csv",
      workItems: "cong-tac.csv",
      resources: "tai-nguyen.csv",
      resourcePrices: "gia-tai-nguyen.csv",
      norms: "dinh-muc.csv",
    };
    for (const kind of DATASET_KINDS) {
      const bytes = new Uint8Array(readFileSync(`docs/templates/${files[kind]}`));
      const decoded = decodeTextFile(bytes);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        // Git có thể đổi kiểu xuống dòng khi checkout; so sánh nội dung tiêu đề.
        expect(decoded.text.trimEnd()).toBe(csvTemplate(kind).trimEnd());
      }
    }
  });

  it("file mẫu CSV chứa đúng tiêu đề chuẩn", () => {
    for (const kind of DATASET_KINDS) {
      const headers = parseCsv(csvTemplate(kind))[0];
      expect(guessKind(headers)).toBe(kind);
      expect(Object.values(autoMap(kind, headers)).every((v) => v !== null)).toBe(true);
    }
  });
});

describe("kiểm tra dữ liệu nhập (prompts/09)", () => {
  it("file rỗng / chỉ có tiêu đề: không có gì để nhập", () => {
    expect(detectHeaderRow(csvTable(""))).toBe(-1);
    expect(detectHeaderRow(csvTable(",,\n,,\n"))).toBe(-1);
    const a = analyze([datasetFromCsv("Mã công tác,Tên công tác,Đơn vị tính\n")]);
    expect(changeCount(a.changes)).toBe(0);
    expect(a.summaries[0].total).toBe(0);
  });

  it("header sai: thiếu cột bắt buộc → chặn cả lần nhập", () => {
    const table = csvTable("Mã công tác,Tên,Giá\nBT-01,Bê tông,100\n");
    const ds = datasetFromTable(table, 0, "workItems", autoMap("workItems", headerTexts(table, 0)));
    const a = analyze([ds]);
    expect(a.problems.join()).toContain("Thiếu cột bắt buộc: Tên công tác, Đơn vị tính");
    expect(changeCount(a.changes)).toBe(0);
  });

  it("dữ liệu thiếu, số/ngày sai: báo đúng dòng và cột, không nhập dòng lỗi, không suy diễn", () => {
    const ds = datasetFromCsv(
      [
        "Mã công tác,Tên công tác,Đơn vị tính,Đơn giá,Tiền tệ,Hiệu lực từ ngày,Hiệu lực đến ngày",
        'BT-01,Bê tông,m3,"1500000,5",VND,01/01/2026,31/12/2026',
        "BT-02,Bê tông 2,,100,VND,,",
        "BT-03,Bê tông 3,m3,1.500.000,VND,,",
        "BT-04,Bê tông 4,m3,100,,,",
        "BT-05,Bê tông 5,m3,,,31/02/2026,",
        "BT-06,Bê tông 6,m3,,,2026-12-31,2026-01-01",
        ",,,,,,",
        "BT-07,Bê tông 7,m3,,,,",
      ].join("\n")
    );
    const a = analyze([ds]);
    expect(a.summaries[0]).toMatchObject({ total: 8, added: 2, errors: 5, empty: 1 });
    const msg = (row: number) =>
      a.issues
        .filter((i) => i.rowLabel === `Dòng ${row}`)
        .map((i) => `${i.columnLabel}: ${i.message}`);
    expect(msg(3)).toEqual(["cột C (Đơn vị tính): Thiếu đơn vị tính."]);
    expect(msg(4)[0]).toMatch(/^cột D \(Đơn giá\): Số không hợp lệ/);
    expect(msg(5)).toEqual(["cột E (Tiền tệ): Có đơn giá nhưng thiếu tiền tệ."]);
    expect(msg(6)[0]).toMatch(/^cột F \(Hiệu lực từ ngày\): Ngày không hợp lệ/);
    expect(msg(7)[0]).toMatch(/^cột G \(Hiệu lực đến ngày\): Ngày kết thúc/);
    const bt1 = a.changes.workItems.find((w) => w.code === "BT-01")!;
    expect(bt1).toMatchObject({
      unitPrice: 1500000.5,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
    });
    // Không có đơn giá → để trống (null), không phải 0; không tự điền tiền tệ.
    expect(a.changes.workItems.find((w) => w.code === "BT-07")).toMatchObject({
      unitPrice: null,
      currency: "",
    });
  });

  it("mã trùng trong file: dòng sau báo lỗi, trỏ về dòng đầu", () => {
    const a = analyze([
      datasetFromCsv("Mã công tác,Tên công tác,Đơn vị tính\nBT-01,A,m3\n bt-01 ,B,m3\n"),
    ]);
    expect(a.summaries[0]).toMatchObject({ added: 1, errors: 1 });
    expect(a.issues[0]).toMatchObject({
      rowLabel: "Dòng 3",
      message: 'Mã "bt-01" trùng với dòng 2 trong file.',
    });
  });

  it("trùng với thư viện: mặc định bỏ qua; cập nhật chỉ đổi cột có trong file", () => {
    const lib = sampleLibrary();
    const ds = datasetFromCsv(
      "Mã công tác,Tên công tác,Đơn vị tính,Đơn giá,Tiền tệ\n007,Tên mới,m3,999,VND\nMOI-01,Mới,m2,,\n"
    );
    const skip = analyze([ds], lib, "skip");
    expect(skip.summaries[0]).toMatchObject({ added: 1, duplicates: 1, updated: 0 });
    expect(skip.changes.workItems.map((w) => w.code)).toEqual(["MOI-01"]);

    const update = analyze([ds], lib, "update");
    expect(update.summaries[0]).toMatchObject({ added: 1, duplicates: 1, updated: 1 });
    const updated = update.changes.workItems.find((w) => w.id === "w1")!;
    expect(updated).toMatchObject({ name: "Tên mới", unitPrice: 999, code: "007" });
    // Cột không có trong file giữ nguyên.
    expect(updated).toMatchObject({
      categoryId: "c1",
      supplierId: "s1",
      source: "Báo giá NCC A",
      notes: "=SUM(A1)",
      effectiveTo: "2026-12-31",
    });
    expect(updated.createdAt).toBe(lib.workItems[0].createdAt);
    expect(updated.updatedAt).toBe(T);
  });

  it("giá: không suy đơn vị từ tài nguyên; tham chiếu tài nguyên trong file hoặc thư viện; giá giống hệt là trùng", () => {
    const lib = sampleLibrary();
    const resources = datasetFromCsv(
      "Mã tài nguyên,Tên tài nguyên,Loại,Đơn vị tính\nCAT,Cát vàng,vat lieu,m3\nX,Lạ,Kim loại,kg\n"
    );
    const prices = datasetFromCsv(
      [
        "Mã tài nguyên,Đơn giá,Đơn vị tính,Tiền tệ,Hiệu lực từ ngày,Nguồn,Trạng thái",
        "CAT,250000,m3,VND,,,",
        "CAT,260000,,VND,,,",
        "KHONGCO,1,kg,VND,,,",
        "xm,1.5,KG,vnd,2026-01-01,TB giá Q1,Ngưng dùng",
        "CAT,250000,m3,VND,,,",
      ].join("\n")
    );
    const a = analyze([prices, resources], lib);
    expect(a.summaries.find((s) => s.kind === "resources")).toMatchObject({ added: 1, errors: 1 });
    expect(a.issues.find((i) => i.rowLabel === "Dòng 3" && i.sourceLabel)?.message).toContain(
      'Loại "Kim loại" không hợp lệ'
    );
    const priceSummary = a.summaries.find((s) => s.kind === "resourcePrices")!;
    expect(priceSummary).toMatchObject({ total: 5, added: 1, duplicates: 1, errors: 3 });
    const priceIssues = a.issues.filter(
      (i) => i.columnLabel?.startsWith("cột") && i.sourceLabel && i.message
    );
    expect(priceIssues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        "Thiếu đơn vị tính của giá.",
        'Không có tài nguyên mã "KHONGCO" trong thư viện hoặc trong file.',
        "Giá trùng với dòng 2 trong file.",
      ])
    );
    expect(a.changes.resourcePrices).toHaveLength(1);
    expect(a.changes.resourcePrices[0].resourceId).toBe(a.changes.resources[0].id);

    // Cập nhật: giá giống hệt → đổi trạng thái/ghi chú theo file.
    const upd = analyze([prices, resources], lib, "update");
    expect(upd.changes.resourcePrices.find((p) => p.id === "p1")).toMatchObject({
      status: "inactive",
      price: 1.5,
    });
  });

  it("bảng định mức kiểu cũ: tạo định mức v1 từ công tác; hao phí > 0; tham chiếu phải tồn tại; trùng thành phần", () => {
    const lib = sampleLibrary();
    const ds = datasetFromCsv(
      [
        "Mã công tác,Mã tài nguyên,Hao phí",
        'DD-01,XM,"0,5"',
        "DD-01,NC3/7,0",
        "DD-01,xm,1",
        "007,XM,2",
        "ZZ,XM,1",
      ].join("\n")
    );
    const a = analyze([ds], lib);
    expect(a.summaries[0]).toMatchObject({
      kind: "normComponents",
      added: 1,
      duplicates: 1,
      errors: 3,
    });
    expect(a.changes.norms[0]).toMatchObject({
      code: "DD-01",
      version: "1",
      workItemId: "w2",
      status: "approved",
    });
    expect(a.changes.normComponents[0]).toMatchObject({
      normId: a.changes.norms[0].id,
      resourceId: "r1",
      consumption: 0.5,
      wasteRate: 0,
    });
    expect(a.createdFromReferences.norms).toEqual(["DD-01 v1"]);
    expect(a.issues.map((i) => i.message)).toEqual([
      "Hao phí phải lớn hơn 0.",
      "Thành phần (định mức, tài nguyên) trùng với dòng 2 trong file.",
      'Không có định mức hoặc công tác mã "ZZ" trong thư viện hoặc trong file.',
    ]);
  });

  it("định mức và thành phần v3: phiên bản, trạng thái, hao hụt %; không thêm thành phần vào phiên bản đang dùng", () => {
    const lib = sampleLibrary();
    const norms = datasetFromCsv(
      [
        "Mã định mức,Tên công tác,Đơn vị tính,Phiên bản,Trạng thái,Loại nguồn,Nguồn,Đã đối chiếu nguồn",
        "DM-01,Thử,m3,2,Nháp,Tài liệu,TL-01,Có",
        "007,Trùng mã đang dùng,m3,2,Đang dùng,,,",
      ].join("\n")
    );
    const parts = datasetFromCsv(
      [
        "Mã định mức,Phiên bản,Mã tài nguyên,Hao phí,Hao hụt (%)",
        "DM-01,2,XM,2,5",
        "007,1,THU-R,1,",
        "007,1,NC3/7,1,",
        "DM-01,9,XM,1,",
      ].join("\n")
    );
    const resources = datasetFromCsv(
      ["Mã tài nguyên,Tên tài nguyên,Đơn vị tính", "THU-R,Thử,kg"].join("\n")
    );
    const a = analyze([norms, parts, resources], lib);
    expect(a.changes.norms).toHaveLength(1);
    expect(a.changes.norms[0]).toMatchObject({
      code: "DM-01",
      version: "2",
      status: "draft",
      sourceType: "document",
      sourceVerified: true,
    });
    expect(a.changes.normComponents).toHaveLength(1);
    expect(a.changes.normComponents[0]).toMatchObject({
      consumption: 2,
      wasteRate: 0.05,
      resourceCodeSnapshot: "XM",
    });
    const messages = a.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("đã có phiên bản đang dùng");
    expect(messages).toContain("không còn là nháp");
    expect(a.summaries.find((x) => x.kind === "normComponents")).toMatchObject({
      added: 1,
      duplicates: 1,
      errors: 2,
    });
    expect(messages).toContain('Không có định mức "DM-01" phiên bản "9"');
  });

  it("cập nhật định mức đang dùng: không chuyển liên kết sang công tác đã có định mức đang dùng", () => {
    const lib = sampleLibrary();
    const ds = datasetFromCsv(
      [
        "Mã định mức,Tên công tác,Đơn vị tính,Phiên bản,Trạng thái,Mã công tác liên kết",
        "DM-02,Đào đất thử,m3,1,Đang dùng,DD-01",
        "007,Bê tông lót móng,m3,1,,DD-01",
      ].join("\n")
    );
    const a = analyze([ds], lib, "update");
    expect(a.changes.norms.map((n) => n.code)).toEqual(["DM-02"]);
    expect(a.issues.map((i) => i.message)).toEqual([
      'Công tác liên kết đã dùng định mức "DM-02" phiên bản 1.',
    ]);
    expect(a.summaries[0]).toMatchObject({ added: 1, updated: 0, errors: 1 });

    // Cột "Mã công tác liên kết" được cập nhật khi không xung đột.
    const relink = analyze(
      [
        datasetFromCsv(
          [
            "Mã định mức,Tên công tác,Đơn vị tính,Phiên bản,Mã công tác liên kết",
            "007,Bê tông lót móng,m3,1,DD-01",
          ].join("\n")
        ),
      ],
      lib,
      "update"
    );
    expect(relink.changes.norms[0]).toMatchObject({
      id: "n1",
      workItemId: "w2",
      status: "approved",
    });
  });
});

describe("sao lưu JSON", () => {
  it("round-trip vào thư viện trống: giữ nguyên mọi bản ghi, id và thời điểm", () => {
    const lib = sampleLibrary();
    const json = toBackupJson(lib, {
      exportedAt: T,
      appVersion: "1.3.0",
      libraryName: "Thư viện thử",
    });
    const parsed = parseBackupJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.meta).toEqual({
      schemaVersion: EXCHANGE_SCHEMA_VERSION,
      exportedAt: T,
      appVersion: "1.3.0",
      libraryName: "Thư viện thử",
    });
    const a = analyze(parsed.datasets);
    expect(a.issues).toEqual([]);
    const sort = <X extends { id: string }>(xs: X[]) =>
      [...xs].sort((p, q) => p.id.localeCompare(q.id));
    expect(sort(a.changes.categories)).toEqual(sort(lib.categories));
    expect(sort(a.changes.suppliers)).toEqual(sort(lib.suppliers));
    expect(sort(a.changes.workItems)).toEqual(sort(lib.workItems));
    expect(sort(a.changes.resources)).toEqual(sort(lib.resources));
    expect(sort(a.changes.resourcePrices)).toEqual(sort(lib.resourcePrices));
    expect(sort(a.changes.norms)).toEqual(sort(lib.norms));
    // Thành phần giữ cả giá áp dụng đã chọn (priceId).
    expect(sort(a.changes.normComponents)).toEqual(sort(lib.normComponents));
  });

  it("nhập lại chính bản sao lưu vào thư viện đang có: toàn bộ là trùng, không thêm gì", () => {
    const lib = sampleLibrary();
    const parsed = parseBackupJson(
      toBackupJson(lib, { exportedAt: T, appVersion: "x", libraryName: "Thư viện thử" })
    );
    if (!parsed.ok) throw new Error();
    const a = analyze(parsed.datasets, lib);
    expect(changeCount(a.changes)).toBe(0);
    expect(a.summaries.reduce((n, s) => n + s.duplicates, 0)).toBe(11);
  });

  it("chỉ chứa dữ liệu thư viện", () => {
    const file = JSON.parse(
      toBackupJson(sampleLibrary(), { exportedAt: T, appVersion: "x", libraryName: "Thư viện thử" })
    );
    expect(Object.keys(file)).toEqual([
      "format",
      "schemaVersion",
      "exportedAt",
      "appVersion",
      "library",
      "data",
    ]);
    expect(Object.keys(file.data)).toEqual([
      "categories",
      "suppliers",
      "workItems",
      "resources",
      "resourcePrices",
      "norms",
      "normComponents",
    ]);
  });

  it("từ chối file lạ, sai cú pháp, schema mới hơn; báo tham chiếu hỏng", () => {
    expect(parseBackupJson("{")).toMatchObject({
      ok: false,
      message: expect.stringContaining("cú pháp"),
    });
    expect(parseBackupJson('{"a":1}')).toMatchObject({
      ok: false,
      message: expect.stringContaining("không phải file sao lưu"),
    });
    expect(
      parseBackupJson(
        JSON.stringify({ format: "consquotation-library", schemaVersion: 99, data: {} })
      )
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("mới hơn"),
    });
    const broken = parseBackupJson(
      JSON.stringify({
        format: "consquotation-library",
        schemaVersion: 1,
        data: { norms: [{ id: "n", workItemId: "?", resourceId: "?", quantity: 1 }] },
      })
    );
    if (!broken.ok) throw new Error();
    const a = analyze(broken.datasets);
    expect(a.summaries[0]).toMatchObject({ errors: 1, added: 0 });
    expect(a.issues.map((i) => i.message)).toContain(
      'Tham chiếu công tác id "?" không có trong file.'
    );
  });

  it("tên file có ngày giờ", () => {
    expect(backupFileName(new Date(2026, 9, 21, 9, 5), "json")).toBe(
      "ConsQuotation-thu-vien-2026-10-21-0905.json"
    );
  });
});

describe("xuất workbook", () => {
  const toTable = (name: string, rows: (string | number | null)[][]): SourceTable => ({
    label: `Sheet "${name}"`,
    firstRowNumber: 1,
    firstColumnIndex: 0,
    rows: rows.map((r) => r.map((v): RawCell => ({ value: v === "" ? null : v }))),
  });

  it("round-trip qua các sheet: nội dung giữ nguyên (mã dạng chữ, thập phân, ngày, tiếng Việt)", () => {
    const lib = sampleLibrary();
    const sheets = exportSheets(lib, {
      exportedAt: T,
      appVersion: "x",
      libraryName: "Thư viện thử",
    });
    expect(sheets.map((s) => s.name)).toEqual([
      "Thông tin",
      "Nhóm",
      "Nhà cung cấp",
      "Công tác",
      "Tài nguyên",
      "Giá tài nguyên",
      "Định mức",
      "Thành phần định mức",
    ]);
    expect(checkBackupMeta(toTable("Thông tin", sheets[0].rows).rows)).toEqual({
      kind: "backup",
      schemaVersion: EXCHANGE_SCHEMA_VERSION,
      exportedAt: T,
      libraryName: "Thư viện thử",
    });
    const datasets = DATASET_KINDS.map((kind) =>
      datasetFromBackupSheet(
        kind,
        toTable(
          DATASETS[kind].sheetName,
          sheets.find((s) => s.name === DATASETS[kind].sheetName)!.rows
        )
      )
    );
    const a = analyze(datasets);
    expect(a.issues).toEqual([]);
    expect(a.problems).toEqual([]);
    const byCode = <X extends { code: string }>(xs: X[]) =>
      [...xs].sort((p, q) => p.code.localeCompare(q.code));
    // Dạng bảng tham chiếu nhóm/nhà cung cấp bằng tên: id mới, nhưng trỏ đúng bản ghi cùng tên.
    const names = (snapshot: {
      categories: { id: string; name: string }[];
      suppliers: { id: string; name: string }[];
    }) => {
      const m = new Map([...snapshot.categories, ...snapshot.suppliers].map((x) => [x.id, x.name]));
      return (id: string | null) => (id ? m.get(id) : null);
    };
    const named = names(a.changes);
    const namedLib = names(lib);
    const view = <
      X extends {
        id: string;
        createdAt: string;
        updatedAt: string;
        categoryId?: string | null;
        supplierId?: string | null;
      },
    >(
      xs: X[],
      n: (id: string | null) => string | null | undefined
    ) =>
      withoutStamps(xs).map((x) => ({
        ...x,
        categoryId: n(x.categoryId ?? null),
        supplierId: n(x.supplierId ?? null),
      }));
    expect(view(byCode(a.changes.workItems), named)).toEqual(view(byCode(lib.workItems), namedLib));
    expect(view(byCode(a.changes.resources), named)).toEqual(view(byCode(lib.resources), namedLib));
    expect(withoutStamps(a.changes.categories)).toEqual(withoutStamps(lib.categories));
    expect(withoutStamps(a.changes.suppliers)).toEqual(withoutStamps(lib.suppliers));
    expect(a.changes.resourcePrices.map((p) => [p.price, p.status, p.effectiveFrom])).toEqual(
      expect.arrayContaining([
        [1.5, "active", "2026-01-01"],
        [1.6, "inactive", null],
      ])
    );
    expect(a.changes.norms.map((n) => [n.code, n.version, n.status, n.sourceType])).toEqual([
      ["007", "1", "approved", "document"],
    ]);
    expect(a.changes.normComponents.map((c) => [c.consumption, c.wasteRate, c.sortOrder])).toEqual([
      [0.000123, 0.05, 1],
      [1.25, 0, 2],
    ]);
    // Sheet/CSV không có cột giá áp dụng: chỉ bản sao lưu JSON giữ lựa chọn này.
    expect(a.changes.normComponents.map((c) => c.priceId)).toEqual([null, null]);
  });

  it("thư viện trống → file mẫu chỉ có tiêu đề", () => {
    const sheets = exportSheets(EMPTY_LIBRARY, {
      exportedAt: T,
      appVersion: "x",
      libraryName: "Thư viện thử",
    });
    for (const sheet of sheets.slice(1)) {
      expect(sheet.rows).toHaveLength(1);
    }
  });

  it("workbook thường hoặc schema mới hơn không bị coi là bản xuất hợp lệ", () => {
    expect(checkBackupMeta([[{ value: "Tên" }, { value: "x" }]])).toEqual({ kind: "notBackup" });
    expect(
      checkBackupMeta([
        [{ value: "format" }, { value: "consquotation-library" }],
        [{ value: "schemaVersion" }, { value: 4 }],
      ]).kind
    ).toBe("unsupported");
  });
});

describe("file lớn", () => {
  it(`vượt ${MAX_IMPORT_ROWS} dòng: chặn`, () => {
    const table: SourceTable = {
      label: "x",
      firstRowNumber: 1,
      firstColumnIndex: 0,
      rows: [
        [{ value: "Mã công tác" }, { value: "Tên công tác" }, { value: "Đơn vị tính" }],
        ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => []),
      ],
    };
    const ds = datasetFromTable(table, 0, "workItems", autoMap("workItems", headerTexts(table, 0)));
    expect(ds.problems.join()).toContain("vượt giới hạn");
  });

  it("20.000 công tác + 20.000 giá: kiểm tra trong thời gian ngắn", () => {
    const n = 20_000;
    const works = ["Mã công tác,Tên công tác,Đơn vị tính,Đơn giá,Tiền tệ"];
    const res = ["Mã tài nguyên,Tên tài nguyên,Đơn vị tính"];
    const prices = ["Mã tài nguyên,Đơn giá,Đơn vị tính,Tiền tệ"];
    for (let i = 0; i < n; i++) {
      works.push(`CT-${i},Công tác số ${i},m3,${i}.5,VND`);
      prices.push(`TN-${i % 1000},${i},kg,VND`);
    }
    for (let i = 0; i < 1000; i++) {
      res.push(`TN-${i},Tài nguyên ${i},kg`);
    }
    const started = performance.now();
    const a = analyze([
      datasetFromCsv(works.join("\n")),
      datasetFromCsv(res.join("\n")),
      datasetFromCsv(prices.join("\n")),
    ]);
    const elapsed = performance.now() - started;
    expect(a.issues).toEqual([]);
    expect(changeCount(a.changes)).toBe(n + 1000 + n);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe("ghi kết quả nhập (IndexedDB)", () => {
  function setup() {
    const repo = new IndexedDbLibraryRepository(new IDBFactory(), "exchange-test");
    let id = 0;
    let clock = Date.UTC(2026, 9, 21);
    const service = new LibraryService(repo, {
      now: () => new Date((clock += 1000)),
      newId: () => `id-${++id}`,
    });
    return { repo, service };
  }

  it("nhập trong một giao dịch; lỗi giữa chừng thì không lưu gì", async () => {
    const { repo, service } = setup();
    const lib = sampleLibrary();
    // Bản ghi thứ hai thiếu id (keyPath) → IndexedDB từ chối → toàn bộ giao dịch bị hủy.
    const bad = {
      ...lib,
      normComponents: [
        lib.normComponents[0],
        { ...lib.normComponents[1], id: undefined as unknown as string },
      ],
    };
    await expect(service.applyImport(bad)).rejects.toThrow();
    expect(await repo.loadAll()).toEqual(EMPTY_LIBRARY);

    await service.applyImport(lib);
    const loaded = await repo.loadAll();
    expect(loaded.workItems).toHaveLength(2);
    expect(loaded.norms).toHaveLength(1);
    expect(loaded.normComponents).toHaveLength(2);
  });

  it("mốc sao lưu: chưa sao lưu → sao lưu → thay đổi sau đó", async () => {
    const { service } = setup();
    expect(await service.backupStatus()).toEqual({ lastBackupAt: null, lastChangedAt: null });
    await service.applyImport(sampleLibrary());
    const afterImport = await service.backupStatus();
    expect(afterImport.lastBackupAt).toBeNull();
    expect(afterImport.lastChangedAt).not.toBeNull();
    await service.recordBackup(new Date(Date.UTC(2030, 0, 1)));
    const backedUp = await service.backupStatus();
    expect(backedUp.lastChangedAt! < backedUp.lastBackupAt!).toBe(true);
    await service.setNormStatus("n1", "inactive", await service.load());
    const changed = await service.backupStatus();
    expect(changed.lastChangedAt).not.toBe(afterImport.lastChangedAt);
  });
});
