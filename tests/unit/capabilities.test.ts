import { describe, expect, it } from "vitest";
import {
  FEATURE_REQUIREMENTS,
  RUNTIME_BASELINE,
  checkRuntimeSupport,
  isFeatureSupported,
} from "../../src/office/capabilities";

/** Giả lập Office.context.requirements.isSetSupported cho một Excel hỗ trợ tới ExcelApi `max`. */
function excelUpTo(max: string) {
  const [maxMajor, maxMinor] = max.split(".").map(Number);
  return (name: string, version: string) => {
    if (name !== "ExcelApi") {
      return false;
    }
    const [major, minor] = version.split(".").map(Number);
    return major < maxMajor || (major === maxMajor && minor <= maxMinor);
  };
}

describe("checkRuntimeSupport", () => {
  it("đạt khi Excel hỗ trợ đúng mức tối thiểu ExcelApi 1.8 (Office 2019)", () => {
    expect(checkRuntimeSupport(excelUpTo("1.8"))).toEqual({ supported: true });
  });

  it("đạt với Excel Microsoft 365 hiện tại", () => {
    expect(checkRuntimeSupport(excelUpTo("1.21"))).toEqual({ supported: true });
  });

  it("không đạt với Excel 2016 volume (chỉ ExcelApi 1.1) và chỉ ra requirement còn thiếu", () => {
    expect(checkRuntimeSupport(excelUpTo("1.1"))).toEqual({ supported: false, missing: RUNTIME_BASELINE });
  });
});

describe("isFeatureSupported", () => {
  it("mọi tính năng cốt lõi đều nằm trong mức tối thiểu lúc chạy", () => {
    const baseline = excelUpTo(RUNTIME_BASELINE.version);
    for (const feature of Object.keys(FEATURE_REQUIREMENTS) as (keyof typeof FEATURE_REQUIREMENTS)[]) {
      expect(isFeatureSupported(feature, baseline), feature).toBe(true);
    }
  });

  it("createWorkbook không khả dụng dưới ExcelApi 1.8", () => {
    expect(isFeatureSupported("createWorkbook", excelUpTo("1.7"))).toBe(false);
  });
});
