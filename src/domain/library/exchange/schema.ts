/**
 * Schema trao đổi thư viện (prompts/09, ADR-0004), phiên bản EXCHANGE_SCHEMA_VERSION.
 * Công bố trong docs/LIBRARY_SCHEMA.md; file mẫu trống trong docs/templates/.
 *
 * Dạng bảng (Excel/CSV) tham chiếu giữa các loại bằng MÃ, không bằng id nội bộ:
 * giá → "Mã tài nguyên", định mức → "Mã công tác" + "Mã tài nguyên".
 */

import { normalizeForSearch } from "../search";

export const EXCHANGE_FORMAT = "consquotation-library";
export const EXCHANGE_SCHEMA_VERSION = 1;

/** Sheet chứa thông tin file sao lưu dạng workbook (dòng "format" / "schemaVersion"…). */
export const META_SHEET_NAME = "Thông tin";

export type DatasetKind = "workItems" | "resources" | "resourcePrices" | "norms";

export const DATASET_KINDS: readonly DatasetKind[] = [
  "workItems",
  "resources",
  "resourcePrices",
  "norms",
];

export type FieldType = "text" | "number" | "date" | "resourceType" | "priceStatus";

export interface FieldDef {
  key: string;
  /** Tiêu đề cột chuẩn khi xuất và trong file mẫu. */
  header: string;
  type: FieldType;
  required: boolean;
  /** Tên cột khác được nhận khi tự map (so sánh không dấu, không phân biệt hoa thường). */
  aliases: string[];
  /** Độ rộng cột khi xuất ra Excel. */
  width: number;
}

export interface DatasetDef {
  kind: DatasetKind;
  /** Tên sheet khi xuất workbook và tên gợi ý của file CSV. */
  sheetName: string;
  fields: FieldDef[];
}

const f = (
  key: string,
  header: string,
  type: FieldType,
  required: boolean,
  aliases: string[],
  width = 14
): FieldDef => ({ key, header, type, required, aliases, width });

export const DATASETS: Record<DatasetKind, DatasetDef> = {
  workItems: {
    kind: "workItems",
    sheetName: "Công tác",
    fields: [
      f("code", "Mã công tác", "text", true, ["ma hieu", "ma hieu cong tac", "work item code"]),
      f(
        "name",
        "Tên công tác",
        "text",
        true,
        ["noi dung cong viec", "ten cong viec", "work item name"],
        40
      ),
      f("group", "Nhóm", "text", false, ["nhom cong tac", "group"]),
      f("unit", "Đơn vị tính", "text", true, ["don vi", "dvt", "unit"], 10),
      f("description", "Mô tả", "text", false, ["description"], 30),
      f("unitPrice", "Đơn giá", "number", false, ["gia", "unit price", "price"]),
      f("currency", "Tiền tệ", "text", false, ["currency"], 8),
      f("source", "Nguồn giá", "text", false, ["nguon", "source"], 20),
      f(
        "effectiveFrom",
        "Hiệu lực từ ngày",
        "date",
        false,
        ["hieu luc tu", "tu ngay", "effective from"],
        14
      ),
      f(
        "effectiveTo",
        "Hiệu lực đến ngày",
        "date",
        false,
        ["hieu luc den", "den ngay", "effective to"],
        14
      ),
      f("notes", "Ghi chú", "text", false, ["notes"], 30),
    ],
  },
  resources: {
    kind: "resources",
    sheetName: "Tài nguyên",
    fields: [
      f("code", "Mã tài nguyên", "text", true, ["ma vat tu", "resource code"]),
      f("name", "Tên tài nguyên", "text", true, ["ten vat tu", "resource name"], 40),
      f("type", "Loại", "resourceType", false, ["loai tai nguyen", "type"], 14),
      f("unit", "Đơn vị tính", "text", true, ["don vi", "dvt", "unit"], 10),
      f("notes", "Ghi chú", "text", false, ["notes"], 30),
    ],
  },
  resourcePrices: {
    kind: "resourcePrices",
    sheetName: "Giá tài nguyên",
    fields: [
      f("resourceCode", "Mã tài nguyên", "text", true, ["ma vat tu", "resource code"]),
      f("price", "Đơn giá", "number", true, ["gia", "price"]),
      f("unit", "Đơn vị tính", "text", true, ["don vi", "dvt", "unit"], 10),
      f("currency", "Tiền tệ", "text", true, ["currency"], 8),
      f(
        "effectiveFrom",
        "Hiệu lực từ ngày",
        "date",
        false,
        ["hieu luc tu", "tu ngay", "effective from"],
        14
      ),
      f(
        "effectiveTo",
        "Hiệu lực đến ngày",
        "date",
        false,
        ["hieu luc den", "den ngay", "effective to"],
        14
      ),
      f("source", "Nguồn", "text", false, ["nguon gia", "source"], 20),
      f("status", "Trạng thái", "priceStatus", false, ["status"], 12),
      f("notes", "Ghi chú", "text", false, ["notes"], 30),
    ],
  },
  norms: {
    kind: "norms",
    sheetName: "Định mức",
    fields: [
      f("workItemCode", "Mã công tác", "text", true, [
        "ma hieu",
        "ma hieu cong tac",
        "work item code",
      ]),
      f("resourceCode", "Mã tài nguyên", "text", true, ["ma vat tu", "resource code"]),
      f("quantity", "Hao phí", "number", true, ["dinh muc", "hao phi dinh muc", "quantity"]),
      f("notes", "Ghi chú", "text", false, ["notes"], 30),
    ],
  },
};

/** Chuẩn hóa tiêu đề cột để so khớp: bỏ dấu, hoa thường, dấu *, khoảng trắng thừa. */
export function normalizeHeader(text: string): string {
  return normalizeForSearch(text.replace(/\*/g, " "))
    .replace(/[:.]+$/, "")
    .trim();
}

export function fieldMatchesHeader(field: FieldDef, header: string): boolean {
  const normalized = normalizeHeader(header);
  if (normalized === "") {
    return false;
  }
  return (
    normalizeHeader(field.header) === normalized ||
    field.aliases.some((alias) => normalizeHeader(alias) === normalized)
  );
}

/** Nhãn tiếng Việt được chấp nhận cho Loại tài nguyên / Trạng thái giá (kèm khóa tiếng Anh). */
export const RESOURCE_TYPE_LABELS = {
  material: "Vật liệu",
  labor: "Nhân công",
  machine: "Máy thi công",
  other: "Khác",
} as const;

export const PRICE_STATUS_LABELS = {
  active: "Đang dùng",
  inactive: "Ngưng dùng",
} as const;

/** Dòng tiêu đề CSV mẫu (UTF-8) cho từng loại — giống file trong docs/templates/. */
export function csvTemplate(kind: DatasetKind): string {
  return DATASETS[kind].fields.map((field) => field.header).join(",") + "\r\n";
}
