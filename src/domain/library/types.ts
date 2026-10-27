/**
 * Mô hình thư viện cá nhân (prompts/08_USER_OWNED_LIBRARY.md, ADR-0003).
 * Mỗi người dùng tự tạo dữ liệu; add-in không kèm sẵn định mức, đơn giá hay danh mục nào.
 * Ngày hiệu lực lưu dạng "YYYY-MM-DD" (không có giờ, không phụ thuộc múi giờ).
 */

/**
 * v1: công tác, tài nguyên, giá, định mức; nhóm công tác là chữ tự do.
 * v2 (2026-10-26, ADR-0012): thêm danh mục (nhóm) và nhà cung cấp là bản ghi riêng có id;
 * công tác/tài nguyên trỏ tới danh mục, công tác/giá trỏ tới nhà cung cấp.
 * v3 (2026-10-27, ADR-0013): định mức là bản ghi riêng (mã, phiên bản, trạng thái, nguồn) gồm các
 * thành phần tài nguyên có hao hụt và ảnh chụp thông tin tài nguyên; dòng định mức v2 (gắn thẳng
 * vào công tác) được chuyển thành định mức phiên bản "1".
 */
export const LIBRARY_SCHEMA_VERSION = 3;

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

/**
 * Trạng thái phiên bản định mức:
 * - draft (nháp): sửa tự do;
 * - approved (đang dùng): khóa thành phần và hao phí; dùng khi phân tích đơn giá cho báo giá;
 * - inactive (ngừng dùng): giữ lịch sử, không dùng cho báo giá mới.
 * Muốn đổi định mức đang dùng: sao chép thành phiên bản mới (nháp), sửa, rồi chuyển sang đang dùng.
 */
export type NormStatus = "draft" | "approved" | "inactive";

export const NORM_STATUSES: readonly NormStatus[] = ["draft", "approved", "inactive"];

/** Nguồn định mức: người dùng tự xây dựng, hoặc lấy từ tài liệu bên ngoài (ghi mã/tên tài liệu). */
export type NormSourceType = "user" | "document";

/** Định mức hao phí cho 1 đơn vị công tác. Add-in không kèm sẵn định mức nào. */
export interface Norm {
  id: string;
  /** Mã định mức; cùng mã có thể có nhiều phiên bản. */
  code: string;
  name: string;
  /** Đơn vị của công tác (khác đơn vị tài nguyên của từng thành phần). */
  unit: string;
  categoryId: string | null;
  /** Công tác trong thư viện dùng định mức này khi "Phân tích từ định mức" (không bắt buộc). */
  workItemId: string | null;
  version: string;
  /** Ngày áp dụng theo nguồn (YYYY-MM-DD), không bắt buộc. */
  effectiveFrom: string | null;
  sourceType: NormSourceType;
  /** Mã/tên tài liệu, số hiệu, hoặc mô tả nguồn. */
  source: string;
  /** Người dùng đã đối chiếu với tài liệu gốc. Mặc định false = chưa xác minh. */
  sourceVerified: boolean;
  status: NormStatus;
  /** Hao phí trong nguồn đã gồm hao hụt: khi đó add-in không cộng thêm hao hụt (tránh tính trùng). */
  wasteIncluded: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Thành phần tài nguyên của định mức: hao phí `consumption` (theo đơn vị tài nguyên) cho 1 đơn vị
 * công tác, tỷ lệ hao hụt `wasteRate` (0,05 = 5%).
 *
 * Các trường snapshot ghi mã/tên/đơn vị/loại tài nguyên lúc liên kết. Tính toán LUÔN dùng tài nguyên
 * hiện tại trong thư viện; snapshot chỉ để truy vết và để cảnh báo khi tài nguyên bị đổi hoặc bị xóa.
 */
export interface NormComponent {
  id: string;
  normId: string;
  resourceId: string;
  resourceCodeSnapshot: string;
  resourceNameSnapshot: string;
  resourceUnitSnapshot: string;
  resourceTypeSnapshot: ResourceType;
  consumption: number;
  wasteRate: number;
  sortOrder: number;
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
  norms: Norm[];
  normComponents: NormComponent[];
}

export const EMPTY_LIBRARY: LibrarySnapshot = {
  categories: [],
  suppliers: [],
  workItems: [],
  resources: [],
  resourcePrices: [],
  norms: [],
  normComponents: [],
};

export function isLibraryEmpty(library: LibrarySnapshot): boolean {
  return (
    library.categories.length === 0 &&
    library.suppliers.length === 0 &&
    library.workItems.length === 0 &&
    library.resources.length === 0 &&
    library.resourcePrices.length === 0 &&
    library.norms.length === 0 &&
    library.normComponents.length === 0
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
