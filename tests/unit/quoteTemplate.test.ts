import { describe, expect, it } from "vitest";
import {
  DEFAULT_INITIAL_ROWS,
  MAX_INITIAL_ROWS,
  QUOTE_COLUMNS,
  buildQuoteLayout,
  clampInitialRows,
  hasQuoteHeaders,
  quoteColumnFormulas,
  totalRowFormulas,
} from "../../src/domain/quoteTemplate";

describe("cột báo giá mặc định", () => {
  it("đúng 9 cột theo thứ tự trong prompts/02", () => {
    expect(QUOTE_COLUMNS.map((c) => c.header)).toEqual([
      "STT",
      "Mã công tác",
      "Nhóm công tác",
      "Nội dung công việc",
      "Đơn vị tính",
      "Khối lượng",
      "Đơn giá",
      "Thành tiền",
      "Ghi chú",
    ]);
  });
});

describe("buildQuoteLayout", () => {
  it("bố cục: tiêu đề, 7 dòng thông tin, 1 dòng trống, header, N dòng, dòng tổng", () => {
    const layout = buildQuoteLayout(5);
    expect(layout.headerRow).toBe(9);
    expect(layout.firstDataRow).toBe(10);
    expect(layout.dataRowCount).toBe(5);
    expect(layout.totalRow).toBe(15);
    expect(layout.rowCount).toBe(16);
    expect(layout.columnCount).toBe(9);
    expect(layout.infoRows.map((r) => r.row)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("vùng chiếm dụng bao trọn dòng tổng (để kiểm tra ghi đè đủ vùng)", () => {
    const layout = buildQuoteLayout(3);
    expect(layout.totalRow).toBe(layout.rowCount - 1);
  });

  it("giới hạn số dòng ban đầu trong 1–500", () => {
    expect(clampInitialRows(0)).toBe(1);
    expect(clampInitialRows(10_000)).toBe(MAX_INITIAL_ROWS);
    expect(clampInitialRows(Number.NaN)).toBe(DEFAULT_INITIAL_ROWS);
    expect(clampInitialRows(7.9)).toBe(7);
  });
});

describe("công thức", () => {
  const formulas = quoteColumnFormulas("CQ_Quote_1");

  it("Thành tiền để trống khi thiếu khối lượng hoặc đơn giá, dùng structured reference", () => {
    expect(formulas.amount).toBe(
      '=IF(OR([@[Khối lượng]]="",[@[Đơn giá]]=""),"",[@[Khối lượng]]*[@[Đơn giá]])'
    );
  });

  it("Thành tiền không bọc IFERROR — lỗi phải hiện ra, không bị đổi thành 0", () => {
    expect(formulas.amount).not.toMatch(/IFERROR/i);
  });

  it("STT tự đánh số theo vị trí trong bảng", () => {
    expect(formulas.stt).toBe("=ROW()-ROW(CQ_Quote_1[#Headers])");
  });

  it("dòng tổng: nhãn ở Nội dung công việc, SUBTOTAL(109) ở Thành tiền, còn lại trống", () => {
    const total = totalRowFormulas("CQ_Quote_1");
    expect(total).toHaveLength(QUOTE_COLUMNS.length);
    expect(total[3]).toBe("Tổng cộng");
    expect(total[7]).toBe("=SUBTOTAL(109,CQ_Quote_1[Thành tiền])");
    expect(total.filter((v) => v !== "")).toHaveLength(2);
  });

  it("chỉ dùng dấu phẩy en-US làm dấu phân cách đối số (ghi qua Range.formulas)", () => {
    expect(formulas.amount).not.toContain(";");
  });
});

describe("hasQuoteHeaders", () => {
  it("chấp nhận đúng tiêu đề mẫu, từ chối khi bị đổi tên hoặc đổi thứ tự", () => {
    const headers = QUOTE_COLUMNS.map((c) => c.header);
    expect(hasQuoteHeaders(headers)).toBe(true);
    expect(hasQuoteHeaders([...headers.slice(0, 8), "Note"])).toBe(false);
    expect(hasQuoteHeaders([headers[1], headers[0], ...headers.slice(2)])).toBe(false);
    expect(hasQuoteHeaders(headers.slice(0, 8))).toBe(false);
  });
});
