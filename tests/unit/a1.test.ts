import { describe, expect, it } from "vitest";
import {
  MAX_COLUMNS,
  MAX_ROWS,
  cellAddress,
  columnToLetters,
  fitsInSheet,
  qualifiedAddress,
  rangeAddress,
  stripSheetName,
} from "../../src/shared/a1";

describe("columnToLetters", () => {
  it.each([
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [701, "ZZ"],
    [702, "AAA"],
    [MAX_COLUMNS - 1, "XFD"],
  ])("cột %i → %s", (index, letters) => {
    expect(columnToLetters(index)).toBe(letters);
  });

  it("từ chối chỉ số ngoài giới hạn", () => {
    expect(() => columnToLetters(-1)).toThrow(RangeError);
    expect(() => columnToLetters(MAX_COLUMNS)).toThrow(RangeError);
  });
});

describe("địa chỉ ô và vùng", () => {
  it("tạo địa chỉ ô và vùng", () => {
    expect(cellAddress(0, 0)).toBe("A1");
    expect(rangeAddress(1, 1, 1, 1)).toBe("B2");
    expect(rangeAddress(1, 1, 16, 9)).toBe("B2:J17");
  });

  it("bỏ tên sheet khỏi địa chỉ Office.js, kể cả tên có dấu nháy và dấu chấm than", () => {
    expect(stripSheetName("'Báo giá'!A1:I16")).toBe("A1:I16");
    expect(stripSheetName("Sheet1!C3")).toBe("C3");
    expect(stripSheetName("C3")).toBe("C3");
  });

  it("đặt tên sheet trong dấu nháy và nhân đôi dấu nháy bên trong", () => {
    expect(qualifiedAddress("Báo giá", "A1")).toBe("'Báo giá'!A1");
    expect(qualifiedAddress("Nhà O'Hara", "B2")).toBe("'Nhà O''Hara'!B2");
  });

  it("kiểm tra vùng nằm trong giới hạn sheet", () => {
    expect(fitsInSheet(0, 0, 16, 9)).toBe(true);
    expect(fitsInSheet(MAX_ROWS - 16, 0, 16, 9)).toBe(true);
    expect(fitsInSheet(MAX_ROWS - 15, 0, 16, 9)).toBe(false);
    expect(fitsInSheet(0, MAX_COLUMNS - 8, 16, 9)).toBe(false);
  });
});
