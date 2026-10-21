import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  asLiteralText,
  parseDecimalInput,
  validateWorkItemDraft,
} from "../../src/domain/workItemDraft";

describe("parseDecimalInput", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["12", 12],
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["0", 0],
    ["-3", -3],
    ["1 250", 1250],
  ])("'%s' → %s", (text, value) => {
    expect(parseDecimalInput(text)).toEqual({ ok: true, value });
  });

  it.each(["1.234,5", "1,234.5", "1.234.567", "abc", "12a", "1e3", "."])(
    "từ chối '%s' (mơ hồ hoặc không phải số)",
    (text) => {
      expect(parseDecimalInput(text).ok).toBe(false);
    }
  );
});

describe("asLiteralText", () => {
  it("luôn thêm dấu nháy đơn để Excel giữ nguyên chữ (không thành công thức, số, ngày, %)", () => {
    expect(asLiteralText("007")).toBe("'007");
    expect(asLiteralText("1/2")).toBe("'1/2");
    expect(asLiteralText("10%")).toBe("'10%");
    expect(asLiteralText("")).toBe("");
    expect(asLiteralText("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(asLiteralText("+1")).toBe("'+1");
    expect(asLiteralText("-A")).toBe("'-A");
    expect(asLiteralText("@x")).toBe("'@x");
    expect(asLiteralText("Đào móng")).toBe("'Đào móng");
  });
});

describe("validateWorkItemDraft", () => {
  const base = { ...EMPTY_DRAFT, description: "Đổ bê tông móng" };

  it("bắt buộc nội dung công việc", () => {
    const result = validateWorkItemDraft(EMPTY_DRAFT, "CQ_Quote_1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => e.field)).toEqual(["description"]);
  });

  it("khối lượng/đơn giá trống được ghi là ô trống, không phải 0", () => {
    const result = validateWorkItemDraft(base, "CQ_Quote_1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row[5]).toBe("");
      expect(result.row[6]).toBe("");
    }
  });

  it("tạo dòng theo thứ tự cột, với công thức STT và Thành tiền của đúng bảng", () => {
    const result = validateWorkItemDraft(
      { ...base, code: "BT-01", unit: "m3", quantity: "12,5", unitPrice: "1500000", notes: "=SUM(A1)" },
      "CQ_Quote_2"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row[0]).toBe("=ROW()-ROW(CQ_Quote_2[#Headers])");
      expect(result.row[1]).toBe("'BT-01");
      expect(result.row[3]).toBe("'Đổ bê tông móng");
      expect(result.row[4]).toBe("'m3");
      expect(result.row[5]).toBe(12.5);
      expect(result.row[6]).toBe(1500000);
      expect(String(result.row[7])).toContain("[@[Khối lượng]]*[@[Đơn giá]]");
      expect(result.row[8]).toBe("'=SUM(A1)");
    }
  });

  it("Thành tiền theo quy tắc làm tròn của workbook", () => {
    const result = validateWorkItemDraft({ ...base, quantity: "1", unitPrice: "2" }, "CQ_Quote_1", {
      mode: "round",
      digits: -3,
    });
    expect(result.ok && result.row[7]).toBe(
      '=IF(OR([@[Khối lượng]]="",[@[Đơn giá]]=""),"",ROUND([@[Khối lượng]]*[@[Đơn giá]],-3))'
    );
  });

  it("từ chối số âm và số không hợp lệ, gắn lỗi đúng trường", () => {
    const result = validateWorkItemDraft({ ...base, quantity: "-1", unitPrice: "1.234,5" }, "CQ_Quote_1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => e.field)).toEqual(["quantity", "unitPrice"]);
  });
});
