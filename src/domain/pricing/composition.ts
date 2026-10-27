/**
 * Đơn giá phân tích cấu thành từ định mức + giá tài nguyên do người dùng nhập (prompts/10).
 * - Người dùng chọn giá cho từng tài nguyên. Add-in chỉ chọn sẵn khi tài nguyên có ĐÚNG MỘT giá
 *   đang dùng, còn hiệu lực và cùng đơn vị (không tự chọn "giá mới nhất là giá đúng" — prompts/08).
 * - Giá khác đơn vị tài nguyên không chọn được (hao phí tính theo đơn vị tài nguyên).
 * - Không chọn giá → dòng phân tích để trống đơn giá nguồn; đơn giá công tác để trống (không phải 0).
 * - Định mức dùng: phiên bản ĐANG DÙNG liên kết với công tác (ADR-0013). Hao phí ghi lên sheet là
 *   hao phí tính toán (đã cộng hao hụt nếu có), tính bằng số học thập phân như bộ máy tính.
 */

import { formatIsoDate, validityOn, Validity } from "../library/dates";
import { normalizeCode } from "../library/validation";
import * as D from "./decimal";
import {
  LibrarySnapshot,
  Norm,
  NormComponent,
  Resource,
  ResourcePrice,
  ResourceType,
  WorkItem,
} from "../library/types";
import { RoundingRule, roundLikeExcel } from "./rounding";
import {
  ANALYSIS_COLUMNS,
  ANALYSIS_SHEET_NAME,
  analysisLineAmountFormula,
  analysisUnitPriceFormula,
} from "./analysis";

export const RESOURCE_TYPE_TEXT: Record<ResourceType, string> = {
  material: "Vật liệu",
  labor: "Nhân công",
  machine: "Máy thi công",
  other: "Khác",
};

export interface PriceOption {
  price: ResourcePrice;
  validity: Validity;
  /** Đơn vị của giá trùng đơn vị tài nguyên. */
  unitMatches: boolean;
  /** Đang dùng, còn hiệu lực (hoặc không ghi hiệu lực) và cùng đơn vị. */
  usable: boolean;
}

export interface CompositionLine {
  norm: Norm;
  component: NormComponent;
  /** Hao phí tính toán = hao phí cơ sở × (1 + hao hụt), trừ khi định mức đã gồm hao hụt. */
  consumption: number;
  resource: Resource | null;
  options: PriceOption[];
  /** Chọn sẵn khi chỉ có đúng một giá dùng được; null = người dùng phải chọn. */
  defaultPriceId: string | null;
}

/** Phiên bản định mức đang dùng của công tác (mỗi công tác tối đa một phiên bản đang dùng). */
export function approvedNormFor(
  item: WorkItem,
  library: Pick<LibrarySnapshot, "norms">
): Norm | null {
  return library.norms.find((n) => n.workItemId === item.id && n.status === "approved") ?? null;
}

export function effectiveConsumption(norm: Norm, component: NormComponent): number {
  if (norm.wasteIncluded || !(component.wasteRate > 0)) {
    return component.consumption;
  }
  return D.toNumber(
    D.multiply(
      D.fromNumber(component.consumption),
      D.add(D.parse("1"), D.fromNumber(component.wasteRate))
    )
  );
}

export function compositionLines(
  item: WorkItem,
  library: LibrarySnapshot,
  today: string
): CompositionLine[] {
  const norm = approvedNormFor(item, library);
  if (!norm) {
    return [];
  }
  const resources = new Map(library.resources.map((r) => [r.id, r]));
  return library.normComponents
    .filter((c) => c.normId === norm.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map((component) => {
      const resource = resources.get(component.resourceId) ?? null;
      const options = library.resourcePrices
        .filter((p) => p.resourceId === component.resourceId)
        .map((price): PriceOption => {
          const validity = validityOn(price.effectiveFrom, price.effectiveTo, today);
          const unitMatches =
            resource !== null && normalizeCode(price.unit) === normalizeCode(resource.unit);
          return {
            price,
            validity,
            unitMatches,
            usable:
              unitMatches &&
              price.status === "active" &&
              (validity === "active" || validity === "noDates"),
          };
        })
        .sort(
          (a, b) =>
            Number(b.usable) - Number(a.usable) ||
            (b.price.effectiveFrom ?? "").localeCompare(a.price.effectiveFrom ?? "")
        );
      const usable = options.filter((o) => o.usable);
      // Giá đã chọn trong định mức được dùng làm mặc định nếu vẫn dùng được.
      const saved = usable.find((o) => o.price.id === component.priceId);
      return {
        norm,
        component,
        consumption: effectiveConsumption(norm, component),
        resource,
        options,
        defaultPriceId: saved ? saved.price.id : usable.length === 1 ? usable[0].price.id : null,
      };
    });
}

/** componentId → priceId đã chọn ("" = để trống, nhập sau trên sheet). */
export type PriceSelection = Record<string, string>;

export function defaultSelection(lines: readonly CompositionLine[]): PriceSelection {
  return Object.fromEntries(lines.map((l) => [l.component.id, l.defaultPriceId ?? ""]));
}

export interface CompositionResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Tiền tệ chung của các giá đã chọn ("" nếu chưa chọn giá nào). */
  currency: string;
  /** Tạm tính trong add-in (để hiển thị); giá trị ghi vào báo giá do Excel tính. null = còn thiếu. */
  preview: number | null;
  missingCount: number;
  /** Các dòng ghi vào bảng phân tích, theo thứ tự ANALYSIS_COLUMNS. */
  rows: (string | number)[][];
}

/** Chữ ghi vào ô: tiền tố ' để Excel giữ nguyên ("007" không thành 7, "1/2" không thành ngày). */
function text(value: string): string {
  return value === "" ? "" : `'${value}`;
}

function sourceText(price: ResourcePrice): string {
  const parts = [price.source || "Không ghi nguồn"];
  if (price.effectiveFrom || price.effectiveTo) {
    parts.push(
      `hiệu lực ${formatIsoDate(price.effectiveFrom) || "…"} – ${formatIsoDate(price.effectiveTo) || "…"}`
    );
  }
  parts.push(price.currency);
  return parts.join("; ");
}

export function buildComposition(
  item: WorkItem,
  lines: readonly CompositionLine[],
  selection: PriceSelection,
  unitPriceRule: RoundingRule
): CompositionResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (lines.length === 0) {
    errors.push(`Công tác "${item.code}" chưa có định mức trong thư viện.`);
  }
  const chosen = lines.map((line) => {
    const id = selection[line.component.id] ?? "";
    const option = line.options.find((o) => o.price.id === id) ?? null;
    return { line, option };
  });
  for (const { line, option } of chosen) {
    if (!line.resource) {
      errors.push(
        "Định mức trỏ tới tài nguyên không còn tồn tại. Hãy sửa định mức trong thư viện."
      );
    } else if (option && !option.unitMatches) {
      errors.push(
        `Giá chọn cho "${line.resource.code}" có đơn vị ${option.price.unit}, khác đơn vị tài nguyên ${line.resource.unit}.`
      );
    } else if (option && option.price.status === "inactive") {
      warnings.push(`Giá chọn cho "${line.resource.code}" đang ở trạng thái Ngưng dùng.`);
    } else if (option && (option.validity === "expired" || option.validity === "notYetEffective")) {
      warnings.push(
        `Giá chọn cho "${line.resource.code}" ${option.validity === "expired" ? "đã hết hiệu lực" : "chưa có hiệu lực"}.`
      );
    }
  }
  const currencies = [
    ...new Set(chosen.filter((c) => c.option).map((c) => c.option!.price.currency.trim())),
  ];
  if (currencies.length > 1) {
    errors.push(
      `Các giá đã chọn khác tiền tệ (${currencies.join(", ")}). Hãy chọn giá cùng một tiền tệ.`
    );
  }
  const missingCount = chosen.filter((c) => !c.option).length;
  if (missingCount > 0 && lines.length > 0) {
    warnings.push(
      `${missingCount} tài nguyên chưa chọn giá: đơn giá công tác sẽ để trống cho tới khi bạn nhập "Đơn giá nguồn" trên sheet "${ANALYSIS_SHEET_NAME}".`
    );
  }

  let preview: number | null = null;
  if (missingCount === 0 && lines.length > 0) {
    const sum = D.toNumber(
      D.sum(
        chosen.map((c) =>
          D.multiply(D.fromNumber(c.line.consumption), D.fromNumber(c.option!.price.price))
        )
      )
    );
    preview = roundLikeExcel(sum, unitPriceRule);
  }

  const lineAmount = analysisLineAmountFormula();
  const unitPrice = analysisUnitPriceFormula(unitPriceRule);
  const rows = chosen.map(({ line, option }) =>
    ANALYSIS_COLUMNS.map((column): string | number => {
      switch (column.key) {
        case "code":
          return text(item.code);
        case "name":
          return text(item.name);
        case "unit":
          return text(item.unit);
        case "resourceCode":
          return text(line.resource?.code ?? "");
        case "resourceName":
          return text(line.resource?.name ?? "");
        case "resourceType":
          return line.resource ? RESOURCE_TYPE_TEXT[line.resource.type] : "";
        case "resourceUnit":
          return text(line.resource?.unit ?? "");
        case "quantity":
          return line.consumption;
        case "price":
          return option ? option.price.price : "";
        case "lineAmount":
          return lineAmount;
        case "unitPrice":
          return unitPrice;
        case "source": {
          const base = option ? sourceText(option.price) : "Chưa chọn giá: nhập Đơn giá nguồn";
          const waste =
            line.consumption !== line.component.consumption
              ? `; hao phí gồm hao hụt ${D.toString(D.multiply(D.fromNumber(line.component.wasteRate), D.parse("100")))}% (cơ sở ${line.component.consumption})`
              : "";
          return text(`${base}${waste}; định mức ${line.norm.code} v${line.norm.version}`);
        }
      }
    })
  );

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    currency: currencies[0] ?? "",
    preview,
    missingCount,
    rows,
  };
}

/** Dấu hiệu trong Ghi chú để nhận ra dòng báo giá lấy đơn giá từ sheet phân tích. */
export const COMPOSITION_NOTE_PREFIX = "Phân tích định mức:";

export function compositionNote(item: WorkItem, resourceCount: number, currency: string): string {
  // Ngắn gọn để ít dòng khi in; chi tiết nằm ở sheet phân tích.
  const parts = [`${COMPOSITION_NOTE_PREFIX} ${item.code}`, `${resourceCount} tài nguyên`];
  if (currency) {
    parts.push(`tiền tệ: ${currency}`);
  }
  return parts.join("; ");
}
