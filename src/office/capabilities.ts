/**
 * Bảng requirement set mà ConsQuotation dùng (ADR-0002).
 * Module này không gọi Office.js trực tiếp; hàm kiểm tra được truyền vào để test được.
 */

export interface RequirementSet {
  name: string;
  version: string;
}

/** Mức tối thiểu lúc chạy: dưới mức này add-in hiện thông báo và không thao tác workbook. */
export const RUNTIME_BASELINE: RequirementSet = { name: "ExcelApi", version: "1.8" };

/**
 * Requirement set của từng nhóm API cốt lõi. Chỉ thêm mục khi code thực sự dùng API đó.
 * Nguồn: https://learn.microsoft.com/en-us/javascript/api/requirement-sets/excel/excel-api-requirement-sets
 */
export const FEATURE_REQUIREMENTS = {
  tablesAndRanges: { name: "ExcelApi", version: "1.1" },
  worksheetProtection: { name: "ExcelApi", version: "1.2" },
  nullObjectsAndSettings: { name: "ExcelApi", version: "1.4" },
  worksheetEvents: { name: "ExcelApi", version: "1.7" },
  createWorkbook: { name: "ExcelApi", version: "1.8" },
} as const satisfies Record<string, RequirementSet>;

export type Feature = keyof typeof FEATURE_REQUIREMENTS;

export type IsSetSupported = (name: string, version: string) => boolean;

export type RuntimeSupport = { supported: true } | { supported: false; missing: RequirementSet };

export function checkRuntimeSupport(isSetSupported: IsSetSupported): RuntimeSupport {
  if (isSetSupported(RUNTIME_BASELINE.name, RUNTIME_BASELINE.version)) {
    return { supported: true };
  }
  return { supported: false, missing: RUNTIME_BASELINE };
}

export function isFeatureSupported(feature: Feature, isSetSupported: IsSetSupported): boolean {
  const requirement = FEATURE_REQUIREMENTS[feature];
  return isSetSupported(requirement.name, requirement.version);
}
