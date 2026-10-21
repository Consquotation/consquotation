import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT_OPTIONS,
  PAGE_NUMBER_FOOTER,
  boundingRect,
  quoteTopRow,
  zoomFor,
} from "../../src/domain/printLayout";
import { QUOTE_COLUMNS } from "../../src/domain/quoteTemplate";
import {
  TERMS_SECTIONS,
  TERMS_TITLE,
  normalizeTermsText,
  parseTermsBlock,
  termsNameFor,
  termsRows,
  termsToWrite,
  validateTerms,
} from "../../src/domain/terms";

describe("ghi chú và điều khoản", () => {
  it("không có nội dung soạn sẵn; chỉ ghi mục có nội dung, theo thứ tự chuẩn", () => {
    expect(termsToWrite([])).toEqual([]);
    const rows = termsRows([
      { key: "commercial", text: "Thanh toán 2 đợt" },
      { key: "scope", text: "  Phần thô  " },
      { key: "assumptions", text: "   " },
    ]);
    expect(rows).toEqual([
      { label: TERMS_TITLE, text: "" },
      { label: "Phạm vi công việc:", text: "'Phần thô" },
      { label: "Điều khoản thương mại:", text: "'Thanh toán 2 đợt" },
    ]);
  });

  it("giữ xuống dòng; chữ dạng công thức/số/% được ghi dạng chữ", () => {
    expect(normalizeTermsText("Dòng 1\r\nDòng 2\rDòng 3")).toBe("Dòng 1\nDòng 2\nDòng 3");
    expect(termsRows([{ key: "notes", text: "=SUM(A1)" }])[1].text).toBe("'=SUM(A1)");
    expect(termsRows([{ key: "notes", text: "10%" }])[1].text).toBe("'10%");
  });

  it("đọc lại từ sheet: khớp nhãn, bỏ qua dòng lạ và tiêu đề", () => {
    const labels = [TERMS_TITLE, "Phạm vi công việc:", "dòng người dùng tự thêm", "ghi chú"];
    const texts = ["", "Phần thô", "x", "Giá chưa gồm VAT"];
    expect(parseTermsBlock(labels, texts)).toEqual([
      { key: "scope", text: "Phần thô" },
      { key: "notes", text: "Giá chưa gồm VAT" },
    ]);
  });

  it("giới hạn độ dài ô Excel; tên vùng theo bảng", () => {
    expect(validateTerms([{ key: "notes", text: "x".repeat(32_001) }])).toHaveLength(1);
    expect(validateTerms([{ key: "notes", text: "x".repeat(100) }])).toEqual([]);
    expect(termsNameFor("CQ_Quote_7")).toBe("CQ_Terms_7");
    expect(TERMS_SECTIONS.map((s) => s.key)).toEqual(["scope", "assumptions", "exclusions", "commercial", "notes"]);
  });
});

describe("thiết lập trang in", () => {
  it("mặc định: A4 dọc, vừa chiều ngang, lặp tiêu đề, số trang, xuống dòng", () => {
    expect(DEFAULT_PRINT_OPTIONS).toEqual({
      orientation: "portrait",
      paper: "a4",
      fit: "width",
      repeatHeader: true,
      pageNumbers: true,
      centerHorizontally: true,
      wrapLongText: true,
    });
    expect(PAGE_NUMBER_FOOTER).toBe("Trang &P / &N");
  });

  it("co giãn theo lựa chọn", () => {
    expect(zoomFor("width")).toEqual({ horizontalFitToPages: 1, verticalFitToPages: 0 });
    expect(zoomFor("page")).toEqual({ horizontalFitToPages: 1, verticalFitToPages: 1 });
    expect(zoomFor("none")).toEqual({ scale: 100 });
  });

  it("vùng in bao tiêu đề, bảng, tổng hợp và ghi chú", () => {
    const area = boundingRect([
      { rowIndex: 0, columnIndex: 0, rowCount: 1, columnCount: 9 },
      { rowIndex: 9, columnIndex: 0, rowCount: 7, columnCount: 10 },
      { rowIndex: 17, columnIndex: 3, rowCount: 4, columnCount: 6 },
      { rowIndex: 22, columnIndex: 0, rowCount: 3, columnCount: 10 },
    ]);
    expect(area).toEqual({ rowIndex: 0, columnIndex: 0, rowCount: 25, columnCount: 10 });
  });

  it("dòng đầu của báo giá: tiêu đề → nhãn thông tin → dòng tiêu đề bảng (mẫu đã bị sửa)", () => {
    expect(quoteTopRow(9, 0, 1)).toBe(0);
    expect(quoteTopRow(9, null, 3)).toBe(3);
    expect(quoteTopRow(9, null, null)).toBe(9);
    expect(quoteTopRow(9, 12, null)).toBe(9);
  });

  it("mẫu mới: cột chữ dài tự xuống dòng", () => {
    expect(QUOTE_COLUMNS.filter((c) => c.wrap).map((c) => c.key)).toEqual(["description", "notes"]);
  });
});
