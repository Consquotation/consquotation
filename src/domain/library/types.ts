/**
 * Mô hình thư viện cá nhân (prompts/08_USER_OWNED_LIBRARY.md, ADR-0003).
 * Mỗi người dùng tự tạo dữ liệu; add-in không kèm sẵn định mức, đơn giá hay danh mục nào.
 * Ngày hiệu lực lưu dạng "YYYY-MM-DD" (không có giờ, không phụ thuộc múi giờ).
 */

/**
 * v1: công tác, tài nguyên, giá, định mức; nhóm công tác là chữ tự do.
 * v2 (2026-10-26, ADR-0012): thêm danh mục (nhóm) và nhà cung cấp là bản ghi riêng có id;
 * công tác/tài nguyên trỏ tới danh mục, công tác/giá trỏ tới nhà cung cấp.
 */
export const LIBRARY_SCHEMA_VERSION = 2;

/** Danh mục (nhóm) do người dùng tự tạo. Không có danh mục mặc định. */
export interface Category {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Nhà cung cấp ở mức cơ bản. `contactInfo` là chữ tự do người dùng tự nhập (điện thoại, email…),
 * chỉ lưu trên máy và trong file sao lưu, không gửi đi đâu.
 */
export interface Supplier {
  id: string;
  name: string;
  contactInfo: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Cách xác định đơn giá công tác (prompts/10). Giai đoạn này dùng "direct"; "composition" để dành. */
export type PricingMethod = "direct" | "composition";

export interface WorkItem {
  id: string;
  code: string;
  name: string;
  /** null = chưa phân nhóm. */
  categoryId: string | null;
  unit: string;
  description: string;
  pricingMethod: PricingMethod;
  /** null = chưa có giá (khác với 0). */
  unitPrice: number | null;
  currency: string;
  /** Nhà cung cấp của đơn giá (không bắt buộc). */
  supplierId: string | null;
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
  /** null = chưa phân nhóm. */
  categoryId: string | null;
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
  /** Nhà cung cấp của giá (không bắt buộc). */
  supplierId: string | null;
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
  categories: Category[];
  suppliers: Supplier[];
  workItems: WorkItem[];
  resources: Resource[];
  resourcePrices: ResourcePrice[];
  norms: NormDefinition[];
}

export const EMPTY_LIBRARY: LibrarySnapshot = {
  categories: [],
  suppliers: [],
  workItems: [],
  resources: [],
  resourcePrices: [],
  norms: [],
};

export function isLibraryEmpty(library: LibrarySnapshot): boolean {
  return (
    library.categories.length === 0 &&
    library.suppliers.length === 0 &&
    library.workItems.length === 0 &&
    library.resources.length === 0 &&
    library.resourcePrices.length === 0 &&
    library.norms.length === 0
  );
}

/** Tên thư viện mặc định khi người dùng chưa đặt tên. */
export const DEFAULT_LIBRARY_NAME = "Thư viện của tôi";
export const LIBRARY_NAME_MAX = 80;

/**
 * Chuẩn hóa tên danh mục/nhà cung cấp để phát hiện trùng: bỏ khoảng trắng thừa, không phân biệt
 * hoa thường. GIỮ dấu tiếng Việt: "Cát" và "Cạt" là hai tên khác nhau.
 */
export function normalizeName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("vi-VN");
}
