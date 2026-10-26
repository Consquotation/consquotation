import { validityOn } from "./dates";
import { LibrarySnapshot, Resource, ResourcePrice, ResourceType, WorkItem } from "./types";

/**
 * Chuẩn hóa để tìm kiếm không phân biệt hoa thường và dấu tiếng Việt:
 * "Bê tông" ~ "be tong", "Đào" ~ "dao".
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Tạo bộ so sánh một lần: localeCompare(…, "vi") tạo lại collator mỗi lần gọi, rất chậm khi sắp xếp
// thư viện lớn (đo được ~2,4 s với 20.000 công tác).
const textCollator = new Intl.Collator("vi");
const codeCollator = new Intl.Collator("vi", { numeric: true });

/** So sánh mã (số trong mã theo giá trị: "BT-2" < "BT-10"). */
export const compareCodes = codeCollator.compare;
export const compareText = textCollator.compare;

/** Mọi từ trong truy vấn phải xuất hiện ở ít nhất một trường (mã/tên/nhóm/đơn vị…). */
function matches(fields: string[], terms: string[]): boolean {
  if (terms.length === 0) {
    return true;
  }
  const haystack = fields.map(normalizeForSearch).join(" ");
  return terms.every((term) => haystack.includes(term));
}

function queryTerms(query: string): string[] {
  return normalizeForSearch(query).split(" ").filter(Boolean);
}

export type SortKey = "code" | "name" | "price";

/** Giá trị lọc "chưa phân nhóm" / "không có nhà cung cấp" (khác "" = tất cả). */
export const NONE = "__none__";

export interface ListFilter {
  query: string;
  /** "" = tất cả; NONE = chưa phân nhóm; còn lại là id danh mục. */
  categoryId: string;
  /** "" = tất cả; NONE = không có nhà cung cấp; còn lại là id nhà cung cấp. */
  supplierId: string;
  sort: SortKey;
}

export const DEFAULT_FILTER: ListFilter = {
  query: "",
  categoryId: "",
  supplierId: "",
  sort: "code",
};

/** Tên danh mục/nhà cung cấp theo id, dựng một lần cho mỗi lần thư viện đổi. */
export interface NameLookup {
  category: Map<string, string>;
  supplier: Map<string, string>;
}

export function nameLookup(library: Pick<LibrarySnapshot, "categories" | "suppliers">): NameLookup {
  return {
    category: new Map(library.categories.map((c) => [c.id, c.name])),
    supplier: new Map(library.suppliers.map((s) => [s.id, s.name])),
  };
}

function refMatches(filterValue: string, refs: readonly (string | null)[]): boolean {
  if (filterValue === "") {
    return true;
  }
  if (filterValue === NONE) {
    return refs.every((r) => r === null);
  }
  return refs.includes(filterValue);
}

function compareByCodeThenName(
  a: { code: string; name: string },
  b: { code: string; name: string }
): number {
  return compareCodes(a.code, b.code) || compareText(a.name, b.name);
}

/** Giá tăng dần; chưa có giá (null) luôn ở cuối, rồi theo mã. */
function compareByPrice<T extends { code: string; name: string }>(
  priceOf: (x: T) => number | null
): (a: T, b: T) => number {
  return (a, b) => {
    const pa = priceOf(a);
    const pb = priceOf(b);
    if (pa === null || pb === null) {
      return pa === pb ? compareByCodeThenName(a, b) : pa === null ? 1 : -1;
    }
    return pa - pb || compareByCodeThenName(a, b);
  };
}

function comparator<T extends { code: string; name: string }>(
  sort: SortKey,
  priceOf: (x: T) => number | null
): (a: T, b: T) => number {
  if (sort === "name") {
    return (a, b) => compareText(a.name, b.name) || compareCodes(a.code, b.code);
  }
  if (sort === "price") {
    return compareByPrice(priceOf);
  }
  return compareByCodeThenName;
}

/**
 * Tìm công tác theo mã/tên/nhóm/đơn vị/nhà cung cấp/nguồn (không phân biệt dấu), lọc theo nhóm và
 * nhà cung cấp, sắp xếp theo mã (mặc định), tên hoặc đơn giá.
 */
export function searchWorkItems(
  items: readonly WorkItem[],
  filter: Partial<ListFilter> = {},
  lookup: NameLookup = { category: new Map(), supplier: new Map() }
): WorkItem[] {
  const f = { ...DEFAULT_FILTER, ...filter };
  const terms = queryTerms(f.query);
  return items
    .filter(
      (item) =>
        refMatches(f.categoryId, [item.categoryId]) &&
        refMatches(f.supplierId, [item.supplierId]) &&
        matches(
          [
            item.code,
            item.name,
            lookup.category.get(item.categoryId ?? "") ?? "",
            item.unit,
            lookup.supplier.get(item.supplierId ?? "") ?? "",
            item.source,
          ],
          terms
        )
    )
    .sort(comparator(f.sort, (w) => w.unitPrice));
}

export interface CurrentPrice {
  /** Giá đang dùng và còn hiệu lực hôm nay, CHỈ khi có đúng một giá như vậy. */
  price: ResourcePrice | null;
  /** Số giá đang dùng còn hiệu lực hôm nay (>1: người dùng phải tự chọn khi dùng). */
  activeCount: number;
}

/**
 * Giá hiện hành để hiển thị và sắp xếp. Không tự chọn "giá mới nhất" khi có nhiều giá cùng hiệu lực
 * (prompts/10): khi đó trả price = null và activeCount > 1.
 */
export function currentPrice(
  resourceId: string,
  prices: readonly ResourcePrice[],
  today: string
): CurrentPrice {
  const usable = prices.filter((p) => {
    if (p.resourceId !== resourceId || p.status !== "active") {
      return false;
    }
    const validity = validityOn(p.effectiveFrom, p.effectiveTo, today);
    return validity === "active" || validity === "noDates";
  });
  return { price: usable.length === 1 ? usable[0] : null, activeCount: usable.length };
}

export interface ResourceFilter extends ListFilter {
  /** "" = mọi loại. */
  type: ResourceType | "";
}

export const DEFAULT_RESOURCE_FILTER: ResourceFilter = { ...DEFAULT_FILTER, type: "" };

/**
 * Tìm tài nguyên theo mã/tên/nhóm/đơn vị; lọc theo nhóm, loại và nhà cung cấp (của bất kỳ giá nào);
 * sắp xếp theo mã, tên hoặc giá hiện hành.
 */
export function searchResources(
  resources: readonly Resource[],
  prices: readonly ResourcePrice[],
  filter: Partial<ResourceFilter> = {},
  lookup: NameLookup = { category: new Map(), supplier: new Map() },
  today = ""
): Resource[] {
  const f = { ...DEFAULT_RESOURCE_FILTER, ...filter };
  const terms = queryTerms(f.query);
  const suppliersOf = new Map<string, (string | null)[]>();
  for (const p of prices) {
    suppliersOf.set(p.resourceId, [...(suppliersOf.get(p.resourceId) ?? []), p.supplierId]);
  }
  const priceCache = new Map<string, number | null>();
  const priceOf = (r: Resource): number | null => {
    if (!priceCache.has(r.id)) {
      priceCache.set(r.id, currentPrice(r.id, prices, today).price?.price ?? null);
    }
    return priceCache.get(r.id) ?? null;
  };
  return resources
    .filter(
      (r) =>
        (f.type === "" || r.type === f.type) &&
        refMatches(f.categoryId, [r.categoryId]) &&
        refMatches(f.supplierId, suppliersOf.get(r.id) ?? [null]) &&
        matches([r.code, r.name, lookup.category.get(r.categoryId ?? "") ?? "", r.unit], terms)
    )
    .sort(comparator(f.sort, priceOf));
}

export interface CategoryUsage {
  workItems: number;
  resources: number;
}

/** Số công tác và tài nguyên của từng danh mục; khóa NONE là chưa phân nhóm. */
export function categoryUsage(
  library: Pick<LibrarySnapshot, "workItems" | "resources">
): Map<string, CategoryUsage> {
  const usage = new Map<string, CategoryUsage>();
  const bump = (id: string | null, key: keyof CategoryUsage) => {
    const k = id ?? NONE;
    const current = usage.get(k) ?? { workItems: 0, resources: 0 };
    usage.set(k, { ...current, [key]: current[key] + 1 });
  };
  library.workItems.forEach((w) => bump(w.categoryId, "workItems"));
  library.resources.forEach((r) => bump(r.categoryId, "resources"));
  return usage;
}

export interface SupplierUsage {
  workItems: number;
  prices: number;
}

export function supplierUsage(
  library: Pick<LibrarySnapshot, "workItems" | "resourcePrices">
): Map<string, SupplierUsage> {
  const usage = new Map<string, SupplierUsage>();
  const bump = (id: string | null, key: keyof SupplierUsage) => {
    if (id === null) {
      return;
    }
    const current = usage.get(id) ?? { workItems: 0, prices: 0 };
    usage.set(id, { ...current, [key]: current[key] + 1 });
  };
  library.workItems.forEach((w) => bump(w.supplierId, "workItems"));
  library.resourcePrices.forEach((p) => bump(p.supplierId, "prices"));
  return usage;
}
