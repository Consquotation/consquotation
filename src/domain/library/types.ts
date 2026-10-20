/**
 * Mô hình thư viện cá nhân (prompts/08_USER_OWNED_LIBRARY.md, ADR-0003).
 * Mỗi người dùng tự tạo dữ liệu; add-in không kèm sẵn định mức, đơn giá hay danh mục nào.
 * Ngày hiệu lực lưu dạng "YYYY-MM-DD" (không có giờ, không phụ thuộc múi giờ).
 */

export const LIBRARY_SCHEMA_VERSION = 1;

/** Cách xác định đơn giá công tác (prompts/10). Giai đoạn này dùng "direct"; "composition" để dành. */
export type PricingMethod = "direct" | "composition";

export interface WorkItem {
  id: string;
  code: string;
  name: string;
  group: string;
  unit: string;
  description: string;
  pricingMethod: PricingMethod;
  /** null = chưa có giá (khác với 0). */
  unitPrice: number | null;
  currency: string;
  source: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ResourceType = "material" | "labor" | "machine" | "other";

export const RESOURCE_TYPES: readonly ResourceType[] = ["material", "labor", "machine", "other"];

export interface Resource {
  id: string;
  code: string;
  name: string;
  type: ResourceType;
  unit: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type PriceStatus = "active" | "inactive";

/** Đơn giá nguồn của tài nguyên; một tài nguyên có thể có nhiều giá theo thời gian/nguồn. */
export interface ResourcePrice {
  id: string;
  resourceId: string;
  price: number;
  unit: string;
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  source: string;
  status: PriceStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Định mức: hao phí `quantity` (theo đơn vị tài nguyên) cho 1 đơn vị công tác. */
export interface NormDefinition {
  id: string;
  workItemId: string;
  resourceId: string;
  quantity: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibrarySnapshot {
  workItems: WorkItem[];
  resources: Resource[];
  resourcePrices: ResourcePrice[];
  norms: NormDefinition[];
}

export const EMPTY_LIBRARY: LibrarySnapshot = {
  workItems: [],
  resources: [],
  resourcePrices: [],
  norms: [],
};

export function isLibraryEmpty(library: LibrarySnapshot): boolean {
  return (
    library.workItems.length === 0 &&
    library.resources.length === 0 &&
    library.resourcePrices.length === 0 &&
    library.norms.length === 0
  );
}
