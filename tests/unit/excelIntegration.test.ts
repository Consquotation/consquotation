import { describe, expect, it } from "vitest";
import { lettersToColumn, parseRangeAddress } from "../../src/shared/a1";
import {
  checkTableName,
  isOwnedTableName,
  sameName,
  uniqueTableName,
} from "../../src/domain/naming";
import { ExcelOpError, isExcelOpError } from "../../src/domain/excel/errors";
import {
  assertShape,
  checkMatrix,
  summarizeRead,
  toFormulaCells,
  toValueCells,
} from "../../src/domain/excel/matrix";
import {
  TableSchema,
  alignToHeaders,
  checkSchema,
  headerProblems,
  matchHeaders,
  validateRecord,
} from "../../src/domain/excel/tableSchema";
import { QUOTE_LINE_SCHEMA } from "../../src/domain/excel/quoteLineSchema";
import { NUMBER_FORMATS, clampWidth } from "../../src/domain/excel/formatRules";
import { QUOTE_COLUMNS } from "../../src/domain/quoteTemplate";
import { INFO_DATE_FORMAT } from "../../src/domain/quoteInfo";
import {
  LAB_TABLE_NAME,
  compareReadBack,
  labSampleAddress,
  labSampleMatrix,
} from "../../src/domain/excel/labSample";
import { describeOfficeError } from "../../src/office/officeErrors";
import {
  clearDiagnostics,
  diagnosticEntries,
  errorLocation,
  recordError,
} from "../../src/shared/diagnostics";

/** Bắt ExcelOpError và trả về kind (undefined nếu không ném). */
function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (isExcelOpError(error)) {
      return error.kind;
    }
    throw error;
  }
  return undefined;
}

describe("parseRangeAddress", () => {
  it("đọc ô đơn, vùng, ký hiệu $ và góc theo thứ tự ngược", () => {
    expect(parseRangeAddress("B3")).toEqual({
      rowIndex: 2,
      columnIndex: 1,
      rowCount: 1,
      columnCount: 1,
    });
    expect(parseRangeAddress("$B$2:$L$7")).toEqual({
      rowIndex: 1,
      columnIndex: 1,
      rowCount: 6,
      columnCount: 11,
    });
    expect(parseRangeAddress("d10:a1")).toEqual({
      rowIndex: 0,
      columnIndex: 0,
      rowCount: 10,
      columnCount: 4,
    });
    expect(parseRangeAddress("XFD1048576")).toEqual({
      rowIndex: 1048575,
      columnIndex: 16383,
      rowCount: 1,
      columnCount: 1,
    });
  });

  it("từ chối địa chỉ có tên sheet, cả cột/cả hàng, nhiều vùng, vượt giới hạn hoặc sai dạng", () => {
    for (const bad of [
      "Sheet1!A1",
      "A:A",
      "1:1",
      "A1,B2",
      "XFE1",
      "A0",
      "A1048577",
      "",
      "A1:B2:C3",
      "Tên",
    ]) {
      expect(parseRangeAddress(bad), bad).toBeNull();
    }
  });

  it("lettersToColumn", () => {
    expect(lettersToColumn("A")).toBe(0);
    expect(lettersToColumn("AA")).toBe(26);
    expect(lettersToColumn("XFD")).toBe(16383);
    expect(lettersToColumn("XFE")).toBe(-1);
    expect(lettersToColumn("A1")).toBe(-1);
  });
});

describe("tên Table", () => {
  it("chấp nhận tên hợp lệ, kể cả chữ có dấu", () => {
    expect(checkTableName("CQ_Test_Lab")).toEqual({ ok: true, name: "CQ_Test_Lab" });
    expect(checkTableName("  CQ_Báo_giá.1 ").ok).toBe(true);
    expect(checkTableName("_bảng").ok).toBe(true);
  });

  it("từ chối tên rỗng, có khoảng trắng, bắt đầu bằng số, ký tự cấm, giống địa chỉ ô, R/C, quá dài", () => {
    for (const bad of [
      "",
      "CQ Test",
      "1Bang",
      "CQ-Test",
      "CQ#1",
      "A1",
      "xfd100",
      "R1C1",
      "r",
      "C",
      "x".repeat(256),
    ]) {
      expect(checkTableName(bad).ok, bad).toBe(false);
    }
  });

  it("tên duy nhất không phân biệt hoa thường; bảng của add-in nhận theo tiền tố CQ_", () => {
    expect(uniqueTableName("CQ_Test", ["cq_test", "CQ_TEST_2"])).toBe("CQ_Test_3");
    expect(uniqueTableName("CQ_Test", ["Khác"])).toBe("CQ_Test");
    expect(isOwnedTableName("cq_Quote_1")).toBe(true);
    expect(isOwnedTableName("Table1")).toBe(false);
    expect(sameName("Báo Giá", "báo giá")).toBe(true);
  });
});

describe("checkMatrix và assertShape", () => {
  it("trả về kích thước của ma trận hợp lệ (chữ, số, 0, đúng/sai, ô trống)", () => {
    expect(checkMatrix([["a", 0, true, null, ""]])).toEqual({ rowCount: 1, columnCount: 5 });
  });

  it("báo invalidData với ma trận rỗng, lệch hàng, NaN, Infinity, Date, undefined, object", () => {
    const cases: unknown[] = [
      [],
      [[]],
      "abc",
      [["a", "b"], ["c"]],
      [[NaN]],
      [[Infinity]],
      [[new Date(2026, 0, 1)]],
      [[undefined]],
      [[{ x: 1 }]],
      [["x".repeat(32_768)]],
    ];
    for (const matrix of cases) {
      expect(
        kindOf(() => checkMatrix(matrix)),
        JSON.stringify(matrix)?.slice(0, 40)
      ).toBe("invalidData");
    }
  });

  it("báo tooLarge trước khi duyệt từng ô", () => {
    expect(kindOf(() => checkMatrix([[1, 2, 3]], 2))).toBe("tooLarge");
  });

  it("kích thước khác vùng đích thì báo sizeMismatch, không cắt bớt", () => {
    expect(
      kindOf(() =>
        assertShape({ rowCount: 2, columnCount: 3 }, { rowCount: 2, columnCount: 4 }, "A1:D2")
      )
    ).toBe("sizeMismatch");
    expect(
      kindOf(() =>
        assertShape({ rowCount: 2, columnCount: 3 }, { rowCount: 2, columnCount: 3 }, "A1:C2")
      )
    ).toBeUndefined();
  });
});

describe("chuẩn bị ô để ghi", () => {
  it("chế độ values: chữ luôn là chữ (kể cả '=…', '007', '1/2', '10%', 'TRUE'); số và 0 giữ nguyên", () => {
    expect(toValueCells([["007", "=1+1", "1/2", "10%", "TRUE", 0, 1.5, true, null, ""]])).toEqual([
      ["'007", "'=1+1", "'1/2", "'10%", "'TRUE", 0, 1.5, true, "", ""],
    ]);
  });

  it("null giữ nguyên ô khi nullAs = null (thêm dòng vào Table có cột tính toán)", () => {
    expect(toValueCells([[null, "a"]], null)).toEqual([[null, "'a"]]);
  });

  it("chế độ formulas: '=…' là công thức Excel, chuỗi khác vẫn là chữ", () => {
    expect(toFormulaCells([["=SUM(A1:A3)", "Đường", 0]])).toEqual([["=SUM(A1:A3)", "'Đường", 0]]);
  });

  it("công thức rỗng hoặc quá dài bị từ chối", () => {
    expect(kindOf(() => toFormulaCells([["="]]))).toBe("invalidData");
    expect(kindOf(() => toFormulaCells([["=" + "1+".repeat(5000) + "1"]]))).toBe("invalidData");
  });
});

describe("summarizeRead", () => {
  const origin = { rowIndex: 1, columnIndex: 1 };

  it("nhận ô lỗi theo valueTypes; chữ '#N/A' người dùng gõ không bị coi là lỗi", () => {
    const summary = summarizeRead(
      [["#DIV/0!", "#N/A", "", 0]],
      [["=1/0", "#N/A", "", 0]],
      [["Error", "String", "Empty", "Double"]],
      origin
    );
    expect(summary.errorCount).toBe(1);
    expect(summary.errorCells).toEqual([{ address: "B2", error: "#DIV/0!" }]);
    expect(summary.emptyCells).toBe(1);
    expect(summary.formulaCells).toBe(1);
  });

  it("thiếu valueTypes: chỉ ô công thức có giá trị lỗi mới là lỗi", () => {
    const summary = summarizeRead([["#REF!", "#REF!"]], [["=A1", "#REF!"]], undefined, origin);
    expect(summary.errorCount).toBe(1);
  });
});

describe("schema bảng", () => {
  it("schema dòng báo giá tham khảo hợp lệ và có đủ 11 trường", () => {
    expect(checkSchema(QUOTE_LINE_SCHEMA)).toEqual([]);
    expect(QUOTE_LINE_SCHEMA.columns.map((c) => c.header)).toEqual([
      "STT",
      "Mã công tác",
      "Tên công tác",
      "Đơn vị tính",
      "Khối lượng",
      "Đơn giá vật liệu",
      "Đơn giá nhân công",
      "Đơn giá máy thi công",
      "Đơn giá tổng hợp",
      "Thành tiền",
      "Ghi chú",
    ]);
  });

  it("checkSchema phát hiện khóa trùng, tiêu đề trùng (không phân biệt hoa thường), tiêu đề trống", () => {
    const bad: TableSchema = {
      title: "x",
      columns: [
        { key: "a", header: "Mã", kind: "code", required: false },
        { key: "a", header: "mã", kind: "code", required: false },
        { key: "c", header: " ", kind: "text", required: false },
        { key: "d", header: "Tiền", kind: "money", required: true, computed: true },
      ],
    };
    expect(checkSchema(bad)).toHaveLength(4);
  });

  it("validateRecord: bắt buộc, sai kiểu (không tự đổi '12' thành 12), âm, cột công thức, trường lạ", () => {
    const result = validateRecord(QUOTE_LINE_SCHEMA, {
      quantity: "12",
      laborPrice: -1,
      amount: 100,
      bogus: 1,
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const keys = result.errors.map((e) => e.key).sort();
      expect(keys).toEqual(["amount", "bogus", "description", "laborPrice", "quantity"]);
    }
  });

  it("validateRecord tạo dòng đúng thứ tự cột; ô trống là null (không phải 0); số 0 giữ là 0", () => {
    const result = validateRecord(QUOTE_LINE_SCHEMA, {
      code: "007",
      description: "Thử",
      quantity: 0,
      materialPrice: 1234.5,
    });
    expect(result).toEqual({
      ok: true,
      row: [null, "007", "Thử", null, 0, 1234.5, null, null, null, null, null],
    });
  });

  it("cột ngày nhận số sê-ri, không nhận chuỗi ngày", () => {
    const schema: TableSchema = {
      title: "x",
      columns: [{ key: "d", header: "Ngày", kind: "date", required: true }],
    };
    expect(validateRecord(schema, { d: 46000 }).ok).toBe(true);
    expect(validateRecord(schema, { d: "01/01/2026" }).ok).toBe(false);
    expect(validateRecord(schema, { d: 0 }).ok).toBe(false);
  });

  it("headerProblems: trùng không phân biệt hoa thường và tiêu đề trống", () => {
    expect(headerProblems(["STT", "stt", "Ghi chú"])).toHaveLength(1);
    expect(headerProblems(["STT", ""])).toHaveLength(1);
    expect(headerProblems(["A", "B"])).toEqual([]);
  });

  it("matchHeaders/alignToHeaders: cột đổi chỗ, cột người dùng tự thêm nhận null, báo cột thiếu", () => {
    const schema: TableSchema<"a" | "b" | "c"> = {
      title: "x",
      columns: [
        { key: "a", header: "Mã", kind: "code", required: false },
        { key: "b", header: "Tên", kind: "text", required: false },
        { key: "c", header: "Tiền", kind: "money", required: false },
      ],
    };
    const headers = ["tên", "Cột của tôi", "Mã"];
    const match = matchHeaders(schema, headers);
    expect(match.indexByKey).toEqual({ a: 2, b: 0 });
    expect(match.missing.map((c) => c.key)).toEqual(["c"]);
    expect(match.extra).toEqual(["Cột của tôi"]);
    expect(alignToHeaders(schema, ["M1", "T1", 5], headers)).toEqual(["T1", null, "M1"]);
  });
});

describe("quy tắc định dạng", () => {
  it("định dạng tiền và ngày trùng với mẫu báo giá đang dùng (không lệch giữa hai nơi)", () => {
    const money = QUOTE_COLUMNS.filter((c) => c.key === "unitPrice" || c.key === "amount");
    money.forEach((c) => expect(c.numberFormat).toBe(NUMBER_FORMATS.money));
    expect(NUMBER_FORMATS.date).toBe(INFO_DATE_FORMAT);
  });

  it("clampWidth", () => {
    expect(clampWidth(500, 30, 300)).toBe(300);
    expect(clampWidth(10, 30, 300)).toBe(30);
    expect(clampWidth(80, 30, 300)).toBe(80);
  });
});

describe("dữ liệu kiểm thử Excel", () => {
  it("vùng mẫu B2:L7 khớp kích thước ma trận; ma trận qua được kiểm tra và chuyển đổi công thức", () => {
    const matrix = labSampleMatrix();
    expect(labSampleAddress()).toBe("B2:L7");
    expect(checkMatrix(matrix)).toEqual({ rowCount: 6, columnCount: 11 });
    expect(() => toFormulaCells(matrix)).not.toThrow();
    expect(checkTableName(LAB_TABLE_NAME).ok).toBe(true);
    expect(isOwnedTableName(LAB_TABLE_NAME)).toBe(true);
  });

  it("dữ liệu mẫu ghi rõ là dữ liệu thử", () => {
    const descriptions = labSampleMatrix()
      .slice(1)
      .map((row) => String(row[2]));
    descriptions.forEach((d) => expect(d.startsWith("Thử")).toBe(true));
  });

  it("compareReadBack: khớp khi Excel trả đúng; chỉ ra ô khác", () => {
    const matrix = labSampleMatrix();
    const values = matrix.map((row) => row.map((v) => (v === null ? "" : v)));
    const formulas = matrix.map((row) => row.map((v) => (v === null ? "" : v)));
    const origin = { rowIndex: 1, columnIndex: 1 };
    expect(compareReadBack(matrix, values, formulas, origin)).toEqual([]);
    values[2][1] = 7; // "007" bị Excel đổi thành số 7
    formulas[1][0] = "=ROW()-3";
    expect(compareReadBack(matrix, values, formulas, origin)).toEqual(["B3", "C4"]);
  });
});

describe("thông báo lỗi và nhật ký", () => {
  it("lỗi kiểm tra hiện đúng câu tiếng Việt và được ghi vào nhật ký theo loại", () => {
    clearDiagnostics();
    const error = new ExcelOpError("sizeMismatch", "Kích thước không khớp.");
    expect(describeOfficeError(error)).toBe("Kích thước không khớp.");
    const entries = diagnosticEntries();
    expect(entries[entries.length - 1]?.code).toBe("sizeMismatch");
  });

  it("chỉ lấy vị trí API từ debugInfo, không lấy câu lệnh có thể chứa dữ liệu ô", () => {
    const officeError = {
      code: "InvalidArgument",
      debugInfo: { errorLocation: "Range.values", statement: "range.values = [['Khách hàng A']]" },
    };
    expect(errorLocation(officeError)).toBe("Range.values");
    clearDiagnostics();
    recordError("thử", officeError);
    recordError("thử lại", officeError);
    const entries = diagnosticEntries();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain("Khách hàng");
    expect(entries[0].location).toBe("Range.values");
  });
});
