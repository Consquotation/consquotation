import { WorkItem, Resource } from "./types";

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

/** Mọi từ trong truy vấn phải xuất hiện ở ít nhất một trường (mã/tên/nhóm/đơn vị…). */
function matches(fields: string[], query: string): boolean {
  const terms = normalizeForSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) {
    return true;
  }
  const haystack = fields.map(normalizeForSearch).join(" ");
  return terms.every((term) => haystack.includes(term));
}

/** Tìm theo mã/tên/nhóm/đơn vị (prompts/08). Thứ tự giữ ổn định: theo mã rồi tên. */
export function searchWorkItems(items: readonly WorkItem[], query: string, group = ""): WorkItem[] {
  return items
    .filter(
      (item) =>
        (group === "" || item.group === group) &&
        matches([item.code, item.name, item.group, item.unit], query)
    )
    .sort(compareByCodeThenName);
}

export function searchResources(items: readonly Resource[], query: string): Resource[] {
  return items
    .filter((item) => matches([item.code, item.name, item.unit], query))
    .sort(compareByCodeThenName);
}

export function distinctGroups(items: readonly WorkItem[]): string[] {
  return [...new Set(items.map((item) => item.group).filter((g) => g.trim() !== ""))].sort((a, b) =>
    a.localeCompare(b, "vi")
  );
}

function compareByCodeThenName(
  a: { code: string; name: string },
  b: { code: string; name: string }
): number {
  return (
    a.code.localeCompare(b.code, "vi", { numeric: true }) || a.name.localeCompare(b.name, "vi")
  );
}
