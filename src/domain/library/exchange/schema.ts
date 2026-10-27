/**
 * Schema trao đổi thư viện (prompts/09, ADR-0004), phiên bản EXCHANGE_SCHEMA_VERSION.
 * Công bố trong docs/LIBRARY_SCHEMA.md; file mẫu trống trong docs/templates/.
 *
 * Dạng bảng (Excel/CSV) tham chiếu giữa các loại bằng MÃ, không bằng id nội bộ:
 * giá → "Mã tài nguyên", định mức → "Mã công tác" + "Mã tài nguyên".
 * Nhóm và nhà cung cấp tham chiếu bằng TÊN (cột "Nhóm", "Nhà cung cấp").
 *
 * v1: công tác, tài nguyên, giá, định mức. v2 (ADR-0012): thêm "Nhóm" (danh mục), "Nhà cung cấp",
 * cột Nhóm cho tài nguyên, cột Nhà cung cấp cho công tác và giá. File v1 vẫn nhập được.
 * v3 (ADR-0013): "Định mức" là bản ghi định mức (mã, phiên bản, trạng thái, nguồn…); thành phần nằm ở
 * "Thành phần định mức" (tham chiếu Mã định mức + Phiên bản). Bảng định mức kiểu v1/v2 (Mã công tác,
 * Mã tài nguyên, Hao phí) vẫn nhập được: mỗi mã công tác thành một định mức phiên bản "1".
 */

import { normalizeForSearch } from "../search";

export const EXCHANGE_FORMAT = "consquotation-library";
export const EXCHANGE_SCHEMA_VERSION = 3;

/** Sheet chứa thông tin file sao lưu dạng workbook (dòng "format" / "schemaVersion"…). */
export const META_SHEET_NAME = "Thông tin";

export type DatasetKind =
  | "categories"
  | "suppliers"
  | "workItems"
  | "resources"
  | "resourcePrices"
  | "norms"
  | "normComponents";

export const DATASET_KINDS: readonly DatasetKind[] = [
  "categories",
  "suppliers",
  "workItems",
  "resources",
  "resourcePrices",
  "norms",
  "normComponents",
];

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "resourceType"
  | "priceStatus"
  | "normStatus"
  | "normSourceType"
  | "yesNo";

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
  categories: {
    kind: "categories",
    sheetName: "Nhóm",
    fields: [
      // Không nhận tên cột "Nhóm" ở đây: đó là cột tham chiếu trên sheet công tác/tài nguyên.
      f("name", "Tên nhóm", "text", true, ["ten danh muc", "danh muc", "category name"], 30),
      f("notes", "Ghi chú", "text", false, ["notes"], 40),
    ],
  },
  suppliers: {
    kind: "suppliers",
    sheetName: "Nhà cung cấp",
    fields: [
      f("name", "Tên nhà cung cấp", "text", true, ["ten ncc", "supplier name"], 30),
      f("contactInfo", "Liên hệ", "text", false, ["thong tin lien he", "contact"], 40),
      f("notes", "Ghi chú", "text", false, ["notes"], 40),
    ],
  },
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
      f("category", "Nhóm", "text", false, ["nhom cong tac", "group", "danh muc", "category"]),
      f("unit", "Đơn vị tính", "text", true, ["don vi", "dvt", "unit"], 10),
      f("description", "Mô tả", "text", false, ["description"], 30),
      f("unitPrice", "Đơn giá", "number", false, ["gia", "unit price", "price"]),
      f("currency", "Tiền tệ", "text", false, ["currency"], 8),
      f("supplier", "Nhà cung cấp", "text", false, ["ncc", "supplier"], 20),
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
      f("category", "Nhóm", "text", false, ["danh muc", "category"]),
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
      f("supplier", "Nhà cung cấp", "text", false, ["ncc", "supplier"], 20),
      f("source", "Nguồn", "text", false, ["nguon gia", "source"], 20),
      f("status", "Trạng thái", "priceStatus", false, ["status"], 12),
      f("notes", "Ghi chú", "text", false, ["notes"], 30),
    ],
  },
  norms: {
    kind: "norms",
    sheetName: "Định mức",
    fields: [
      f("code", "Mã định mức", "text", true, ["ma dm", "norm code"]),
      f("name", "Tên công tác", "text", true, ["noi dung cong viec", "ten cong viec"], 40),
      f("unit", "Đơn vị tính", "text", true, ["don vi", "dvt", "unit"], 10),
      f("category", "Nhóm", "text", false, ["danh muc", "category"]),
      f("version", "Phiên bản", "text", false, ["version"], 10),
      f("effectiveFrom", "Ngày áp dụng", "date", false, ["hieu luc tu", "effective from"], 14),
      f("sourceType", "Loại nguồn", "normSourceType", false, ["source type"], 14),
      f("source", "Nguồn", "text", false, ["tai lieu", "so hieu", "source"], 30),
      f("sourceVerified", "Đã đối chiếu nguồn", "yesNo", false, ["da xac minh", "verified"], 12),
      f("status", "Trạng thái", "normStatus", false, ["status"], 12),
      f("wasteIncluded", "Hao phí đã gồm hao hụt", "yesNo", false, ["da gom hao hut"], 12),
      f("workItemCode", "Mã công tác liên kết", "text", false, ["cong tac lien ket"], 14),
      f("notes", "Ghi chú", "text", false, ["notes"], 30),
    ],
  },
  normComponents: {
    kind: "normComponents",
    // Bảng định mức kiểu cũ (Mã công tác, Mã tài nguyên, Hao phí) khớp loại này nhờ bí danh.
    sheetName: "Thành phần định mức",
    fields: [
      f("normCode", "Mã định mức", "text", true, [
        "ma cong tac",
        "ma hieu",
        "ma hieu cong tac",
        "work item code",
        "norm code",
      ]),
      f("version", "Phiên bản", "text", false, ["version"], 10),
      f("resourceCode", "Mã tài nguyên", "text", true, ["ma vat tu", "resource code"]),
      f("consumption", "Hao phí", "number", true, ["dinh muc", "hao phi dinh muc", "quantity"]),
      f("wastePercent", "Hao hụt (%)", "number", false, ["hao hut", "ty le hao hut", "waste"], 10),
      f("sortOrder", "Thứ tự", "number", false, ["stt", "order"], 8),
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

export const NORM_STATUS_LABELS = {
  draft: "Nháp",
  approved: "Đang dùng",
  inactive: "Ngừng dùng",
} as const;

export const NORM_SOURCE_TYPE_LABELS = {
  user: "Người dùng",
  document: "Tài liệu",
} as const;

export const YES_NO_LABELS = {
  yes: "Có",
  no: "Không",
} as const;

/** Dòng tiêu đề CSV mẫu (UTF-8) cho từng loại — giống file trong docs/templates/. */
export function csvTemplate(kind: DatasetKind): string {
  return DATASETS[kind].fields.map((field) => field.header).join(",") + "\r\n";
}
