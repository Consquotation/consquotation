/**
 * Hồ sơ báo giá (ADR-0014): phần dữ liệu ô Excel không chứa được, lưu ngay trong workbook dưới dạng
 * Custom XML Part. Nguồn sự thật của khối lượng, đơn giá, thành tiền, hao phí và giá nguồn vẫn là sheet;
 * hồ sơ chỉ giữ định danh, nguồn gốc (thư viện, định mức, giá) và snapshot để đối chiếu.
 * Mã báo giá, tên công trình, khách hàng… nằm ở khối thông tin trên sheet, không nhân đôi ở đây.
 * Thuần TypeScript: không gọi Office.js.
 */

import type { ResourceType } from "../library/types";

export const QUOTATION_SCHEMA_VERSION = 1;
/** Namespace của Custom XML Part; dùng để tìm hồ sơ trong workbook. */
export const QUOTATION_XML_NAMESPACE = "urn:consquotation:quotation";
/** Phiên bản quy tắc tính dòng; đổi khi đổi cách tính để biết kết quả cũ tính theo quy tắc nào. */
export const CALCULATION_VERSION = "quote-line-1";

export type QuotationStatus = "draft" | "completed";
export type PricingMethod = "manual" | "library" | "norm";
export type CalculationStatus = "valid" | "validWithWarnings" | "invalid";
export type CostType = ResourceType;

/** Thành phần hao phí của dòng phân tích định mức, chụp lại lúc chèn. */
export interface QuotationComponent {
  resourceType: ResourceType;
  /** id tài nguyên trong thư viện lúc chèn; null nếu không có (dữ liệu khôi phục thiếu nguồn). */
  resourceId: string | null;
  resourceCodeSnapshot: string;
  resourceNameSnapshot: string;
  unitSnapshot: string;
  baseConsumption: number;
  wasteRate: number;
  appliedConsumption: number;
  priceId: string | null;
  unitPriceSnapshot: number | null;
  priceUnitSnapshot: string;
  currency: string;
  sourceReference: string;
}

export interface ItemSource {
  /** Công tác trong thư viện lúc chèn (null = nhập thủ công). */
  workItemId: string | null;
  normId: string | null;
  normCode: string;
  normVersion: string;
}

export interface LibraryPriceSnapshot {
  workItemId: string;
  unitPrice: number;
  currency: string;
}

export type ItemIssueCode =
  | "missingQuantity"
  | "invalidQuantity"
  | "negativeQuantity"
  | "missingUnitPrice"
  | "invalidUnitPrice"
  | "negativeUnitPrice"
  | "amountMismatch"
  | "analysisMissing"
  | "analysisIncomplete"
  | "analysisError"
  | "componentUnitMismatch"
  | "breakdownMismatch"
  | "breakdownEdited"
  | "overflow"
  | "libraryPriceChanged"
  | "libraryMissing"
  | "normVersionChanged"
  | "resourceChanged"
  | "noTrace"
  /** Vấn đề của Kiểm tra báo giá ở dòng này (giữ nguyên mức lỗi/cảnh báo và hướng xử lý). */
  | "sheetCheck";

export interface ItemIssue {
  code: ItemIssueCode;
  severity: "error" | "warning";
  message: string;
  hint?: string;
  /** Tài nguyên liên quan (mã) nếu vấn đề nằm ở một thành phần. */
  resourceCode?: string;
}

/** Kết quả tính của một dòng; null = không tính được (không bao giờ thay bằng 0). */
export interface QuotationPricingResult {
  materialCost: number | null;
  laborCost: number | null;
  machineCost: number | null;
  otherCost: number | null;
  unitPrice: number | null;
  quantity: number | null;
  amount: number | null;
  /** Mô tả quy tắc làm tròn đã dùng, ví dụ "Không làm tròn". */
  roundingPolicy: string;
  status: CalculationStatus;
  issues: ItemIssue[];
  calculatedAt: string;
  calculationVersion: string;
}

export interface QuotationItemRecord {
  /** Trùng giá trị cột "Mã dòng" trên bảng báo giá. */
  id: string;
  pricingMethod: PricingMethod;
  /** Mã, tên, đơn vị lúc chèn (sheet có thể đã sửa sau đó). */
  workCode: string;
  workName: string;
  unit: string;
  source: ItemSource | null;
  libraryPrice: LibraryPriceSnapshot | null;
  components: QuotationComponent[];
  /** Kết quả lần tính gần nhất (để so khi mở lại); null = chưa tính. */
  result: QuotationPricingResult | null;
  /** Đơn giá thành phần add-in đã ghi lên sheet; khác giá trị hiện tại → người dùng đã sửa tay. */
  writtenBreakdown: Record<CostType, number | null> | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationRecord {
  schemaVersion: number;
  id: string;
  tableName: string;
  status: QuotationStatus;
  completedAt: string | null;
  /** Vân tay nội dung bảng lúc hoàn tất; khác lúc kiểm tra → báo giá đã bị sửa sau khi hoàn tất. */
  completedFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuotationItemRecord[];
}

export function newRecord(id: string, tableName: string, now: string): QuotationRecord {
  return {
    schemaVersion: QUOTATION_SCHEMA_VERSION,
    id,
    tableName,
    status: "draft",
    completedAt: null,
    completedFingerprint: null,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
}

// ---------- Lưu dạng XML ----------

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_m, entity: string) => {
    switch (entity) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return String.fromCodePoint(
          entity[1] === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
        );
    }
  });
}

/** XML của Custom XML Part: một phần tử gốc theo namespace, dữ liệu là JSON trong phần tử <data>. */
export function encodeRecord(record: QuotationRecord): string {
  const table = escapeXml(record.tableName).replace(/"/g, "&quot;");
  return (
    `<quotation xmlns="${QUOTATION_XML_NAMESPACE}" schemaVersion="${record.schemaVersion}" table="${table}">` +
    `<data>${escapeXml(JSON.stringify(record))}</data></quotation>`
  );
}

/**
 * Tên bảng báo giá ghi ở thuộc tính của phần tử gốc: tìm được hồ sơ của một bảng kể cả khi phần JSON
 * hỏng hoặc thuộc schema mới hơn (để không tạo hồ sơ thứ hai đè lên).
 */
export function recordTableOf(xml: string): string | null {
  const root = /<(?:\w+:)?quotation\b[^>]*>/.exec(xml);
  const table = root ? /\btable="([^"]*)"/.exec(root[0]) : null;
  return table ? unescapeXml(table[1]) : null;
}

export type DecodeResult =
  | { ok: true; record: QuotationRecord; migrated: boolean }
  | { ok: false; reason: "invalid" | "newer"; message: string };

/**
 * Đọc hồ sơ từ XML. Hồ sơ của phiên bản add-in mới hơn hoặc sai cấu trúc bị từ chối (không đoán),
 * để add-in không ghi đè dữ liệu nó không hiểu.
 */
export function decodeRecord(xml: string): DecodeResult {
  const match = /<(?:\w+:)?data(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?data>/.exec(xml);
  if (!match) {
    return {
      ok: false,
      reason: "invalid",
      message: "Hồ sơ báo giá trong workbook không đúng cấu trúc.",
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(unescapeXml(match[1]));
  } catch {
    return {
      ok: false,
      reason: "invalid",
      message: "Hồ sơ báo giá trong workbook bị hỏng (không đọc được JSON).",
    };
  }
  return migrateRecord(raw);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNumberOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const COST_TYPES: readonly CostType[] = ["material", "labor", "machine", "other"];

function validComponent(c: unknown): boolean {
  return (
    isObject(c) &&
    COST_TYPES.includes(c.resourceType as CostType) &&
    (c.resourceId === null || isString(c.resourceId)) &&
    isString(c.resourceCodeSnapshot) &&
    isString(c.resourceNameSnapshot) &&
    isString(c.unitSnapshot) &&
    typeof c.baseConsumption === "number" &&
    Number.isFinite(c.baseConsumption) &&
    typeof c.wasteRate === "number" &&
    Number.isFinite(c.wasteRate) &&
    typeof c.appliedConsumption === "number" &&
    Number.isFinite(c.appliedConsumption) &&
    (c.priceId === null || isString(c.priceId)) &&
    isNumberOrNull(c.unitPriceSnapshot) &&
    isString(c.priceUnitSnapshot) &&
    isString(c.currency) &&
    isString(c.sourceReference)
  );
}

function validItem(item: unknown): boolean {
  if (!isObject(item)) {
    return false;
  }
  return (
    isString(item.id) &&
    item.id !== "" &&
    ["manual", "library", "norm"].includes(item.pricingMethod as string) &&
    isString(item.workCode) &&
    isString(item.workName) &&
    isString(item.unit) &&
    (item.source === null || isObject(item.source)) &&
    (item.libraryPrice === null || isObject(item.libraryPrice)) &&
    Array.isArray(item.components) &&
    item.components.every(validComponent) &&
    (item.result === null || isObject(item.result)) &&
    (item.writtenBreakdown === null || isObject(item.writtenBreakdown)) &&
    isString(item.createdAt) &&
    isString(item.updatedAt)
  );
}

/** Kiểm tra cấu trúc và nâng cấp hồ sơ lên schema hiện tại. Hiện chỉ có schema 1. */
export function migrateRecord(raw: unknown): DecodeResult {
  if (!isObject(raw) || typeof raw.schemaVersion !== "number") {
    return { ok: false, reason: "invalid", message: "Hồ sơ báo giá thiếu phiên bản schema." };
  }
  if (raw.schemaVersion > QUOTATION_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "newer",
      message: `Hồ sơ báo giá được tạo bởi phiên bản ConsQuotation mới hơn (schema ${raw.schemaVersion}). Hãy cập nhật add-in; add-in không ghi đè hồ sơ này.`,
    };
  }
  const valid =
    raw.schemaVersion >= 1 &&
    isString(raw.id) &&
    isString(raw.tableName) &&
    (raw.status === "draft" || raw.status === "completed") &&
    (raw.completedAt === null || isString(raw.completedAt)) &&
    (raw.completedFingerprint === null || isString(raw.completedFingerprint)) &&
    isString(raw.createdAt) &&
    isString(raw.updatedAt) &&
    Array.isArray(raw.items) &&
    raw.items.every(validItem) &&
    new Set((raw.items as { id: string }[]).map((i) => i.id)).size === raw.items.length;
  if (!valid) {
    return { ok: false, reason: "invalid", message: "Hồ sơ báo giá trong workbook sai cấu trúc." };
  }
  return { ok: true, record: raw as unknown as QuotationRecord, migrated: false };
}
