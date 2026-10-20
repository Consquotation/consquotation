import { describe, expect, it } from "vitest";
import {
  isQuoteTableName,
  sanitizeSheetName,
  uniqueQuoteTableName,
  uniqueSheetName,
} from "../../src/domain/naming";

describe("uniqueSheetName", () => {
  it("dùng tên gốc khi chưa có", () => {
    expect(uniqueSheetName("Báo giá", ["Sheet1"])).toBe("Báo giá");
  });

  it("thêm (2), (3)… khi trùng, không phân biệt hoa thường", () => {
    expect(uniqueSheetName("Báo giá", ["báo giá"])).toBe("Báo giá (2)");
    expect(uniqueSheetName("Báo giá", ["Báo giá", "Báo giá (2)"])).toBe("Báo giá (3)");
  });

  it("không vượt 31 ký tự kể cả khi thêm hậu tố", () => {
    const long = "Báo giá công trình nhà xưởng khu A";
    const name = uniqueSheetName(long, [long.slice(0, 31)]);
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name.endsWith("(2)")).toBe(true);
  });
});

describe("sanitizeSheetName", () => {
  it("bỏ ký tự Excel cấm và dấu nháy đầu/cuối", () => {
    expect(sanitizeSheetName("Báo/giá:[A]*?")).toBe("Báo giá  A");
    expect(sanitizeSheetName("'Báo giá'")).toBe("Báo giá");
    expect(sanitizeSheetName("///")).toBe("Sheet");
  });
});

describe("uniqueQuoteTableName", () => {
  it("chọn số nhỏ nhất chưa dùng, tính cả tên đã đặt (defined names)", () => {
    expect(uniqueQuoteTableName([])).toBe("CQ_Quote_1");
    expect(uniqueQuoteTableName(["CQ_Quote_1", "cq_quote_2", "Table1"])).toBe("CQ_Quote_3");
    expect(uniqueQuoteTableName(["CQ_Quote_2"])).toBe("CQ_Quote_1");
  });

  it("nhận diện tên bảng báo giá", () => {
    expect(isQuoteTableName("CQ_Quote_12")).toBe(true);
    expect(isQuoteTableName("CQ_Quote_")).toBe(false);
    expect(isQuoteTableName("Table1")).toBe(false);
  });
});
