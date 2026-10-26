import { describe, expect, it } from "vitest";
import { STRINGS } from "../../src/shared/strings.vi";

describe("dòng trạng thái đã tải", () => {
  it("ghi nền tảng bằng tên người dùng hiểu, phiên bản và bản dev", () => {
    expect(STRINGS.readyStatus("PC", "1.8.0", true)).toBe(
      "Đã tải xong · Đã kết nối Excel trên Windows · Bản 1.8.0 (dev)"
    );
    expect(STRINGS.readyStatus("OfficeOnline", "1.8.0", false)).toBe(
      "Đã tải xong · Đã kết nối Excel trên web · Bản 1.8.0"
    );
  });

  it("nền tảng lạ: giữ nguyên giá trị Office trả về", () => {
    expect(STRINGS.readyStatus("Android", "1.8.0", false)).toContain("Excel trên Android");
  });
});
