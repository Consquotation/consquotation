/**
 * Bộ máy tính đơn giá từ định mức (ADR-0013). Thuần TypeScript: không gọi Office.js, không đọc
 * giao diện, kiểm thử được bằng dữ liệu đầu vào và kết quả mong đợi.
 *
 * Công thức:
 *   Hao phí tính toán  = Hao phí cơ sở × (1 + Tỷ lệ hao hụt)   (bỏ hao hụt nếu định mức đã gồm hao hụt)
 *   Chi phí thành phần = Hao phí tính toán × Đơn giá tài nguyên
 *   Chi phí theo nhóm  = Σ chi phí thành phần cùng loại tài nguyên (vật liệu, nhân công, máy, khác)
 *   Đơn giá tổng hợp   = Σ chi phí mọi thành phần, làm tròn MỘT lần theo quy tắc (nếu có)
 *
 * Số học thập phân chính xác (decimal.ts); không làm tròn từng bước. Dữ liệu thiếu hoặc sai thì kết
 * quả là "invalid" và đơn giá là null, không bao giờ thay bằng 0.
 */

import * as D from "./decimal";
import { NO_ROUNDING, RoundingRule } from "./rounding";
import { validityOn } from "../library/dates";
import { normalizeCode } from "../library/validation";
import {
  LibrarySnapshot,
  Norm,
  NormComponent,
  RESOURCE_TYPES,
  Resource,
  ResourcePrice,
  ResourceType,
} from "../library/types";
import { NORM_CALC_STRINGS as S } from "../../shared/strings.norms.vi";

export type CalcStatus = "valid" | "validWithWarnings" | "invalid";

/** Mã lỗi/cảnh báo ổn định (dùng trong test, tài liệu và để giao diện chỉ đúng chỗ). */
export type CalcIssueCode =
  | "normNotFound"
  | "emptyNorm"
  | "normInactive"
  | "missingWorkUnit"
  | "noResourceLink"
  | "resourceMissing"
  | "resourceUnitChanged"
  | "resourceRenamed"
  | "resourceTypeChanged"
  | "duplicateComponent"
  | "invalidConsumption"
  | "zeroConsumption"
  | "invalidWasteRate"
  | "wasteIgnored"
  | "missingPrice"
  | "ambiguousPrice"
  | "selectedPriceMissing"
  | "priceUnitMismatch"
  | "invalidPrice"
  | "zeroPrice"
  | "inactivePrice"
  | "priceNotInEffect"
  | "currencyMismatch"
  | "overflow";

export interface CalcIssue {
  code: CalcIssueCode;
  severity: "error" | "warning";
  /** Thành phần liên quan (nếu có). */
  componentId?: string;
  message: string;
}

/** Tỷ lệ hao hụt tối đa chấp nhận: 100%. Lớn hơn gần như chắc chắn là nhập nhầm (5 thay cho 0,05). */
export const MAX_WASTE_RATE = 1;
/** Excel giữ 15 chữ số có nghĩa: kết quả có phần nguyên dài hơn bị coi là vượt giới hạn. */
export const MAX_INTEGER_DIGITS = 15;

export interface ComponentResult {
  componentId: string;
  sortOrder: number;
  resourceId: string;
  /** Thông tin tài nguyên hiện tại; tài nguyên đã bị xóa thì lấy theo snapshot. */
  resourceCode: string;
  resourceName: string;
  resourceUnit: string;
  type: ResourceType;
  baseConsumption: number;
  wasteRate: number;
  wasteApplied: boolean;
  /** Hao phí tính toán (chuỗi thập phân chính xác và số để hiển thị). */
  effectiveConsumption: number;
  effectiveConsumptionExact: string;
  priceId: string | null;
  unitPrice: number | null;
  priceUnit: string;
  currency: string;
  priceSource: string;
  amount: number | null;
  amountExact: string | null;
  severity: "ok" | "warning" | "error";
}

export interface NormCalcResult {
  normId: string;
  code: string;
  name: string;
  unit: string;
  version: string;
  status: CalcStatus;
  components: ComponentResult[];
  /** Chi phí theo loại tài nguyên; null khi kết quả không hợp lệ. */
  totalsByType: Record<ResourceType, number | null>;
  /** Đơn giá tổng hợp sau khi làm tròn theo quy tắc; null khi không hợp lệ. */
  unitPrice: number | null;
  /** Tổng chính xác trước khi làm tròn. */
  unitPriceExact: string | null;
  currency: string;
  rounding: RoundingRule;
  issues: CalcIssue[];
  calculatedAt: string;
  /**
   * Dấu vân tay dữ liệu đầu vào (định mức, thành phần, tài nguyên, giá đã dùng). Trước khi dùng kết
   * quả (ví dụ ghi ra Excel), tính lại với thư viện mới đọc: khác vân tay = dữ liệu đã đổi.
   */
  inputFingerprint: string;
}

export interface CalcOptions {
  /** Ngày tính hiệu lực giá (YYYY-MM-DD). */
  today: string;
  /** Thời điểm tính (ISO) ghi vào kết quả. */
  now: string;
  /** componentId → priceId người dùng chọn; không có thì add-in chỉ chọn khi có đúng một giá dùng được. */
  priceSelection?: Record<string, string>;
  /** Quy tắc làm tròn đơn giá tổng hợp; mặc định không làm tròn. */
  rounding?: RoundingRule;
}

/** Giá dùng được để tự chọn: đang dùng, còn hiệu lực (hoặc không ghi hiệu lực), cùng đơn vị tài nguyên. */
export function usablePrices(
  resource: Resource,
  prices: readonly ResourcePrice[],
  today: string
): ResourcePrice[] {
  return prices.filter((p) => {
    if (p.resourceId !== resource.id || p.status !== "active") {
      return false;
    }
    const validity = validityOn(p.effectiveFrom, p.effectiveTo, today);
    return (
      (validity === "active" || validity === "noDates") &&
      normalizeCode(p.unit) === normalizeCode(resource.unit)
    );
  });
}

function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

const emptyTotals = (): Record<ResourceType, number | null> => ({
  material: null,
  labor: null,
  machine: null,
  other: null,
});

/** Tính theo id định mức; định mức không tồn tại trả về kết quả invalid. */
export function calculateNormById(
  normId: string,
  library: Pick<LibrarySnapshot, "norms" | "normComponents" | "resources" | "resourcePrices">,
  options: CalcOptions
): NormCalcResult {
  const norm = library.norms.find((n) => n.id === normId);
  if (!norm) {
    return {
      normId,
      code: "",
      name: "",
      unit: "",
      version: "",
      status: "invalid",
      components: [],
      totalsByType: emptyTotals(),
      unitPrice: null,
      unitPriceExact: null,
      currency: "",
      rounding: options.rounding ?? NO_ROUNDING,
      issues: [{ code: "normNotFound", severity: "error", message: S.normNotFound }],
      calculatedAt: options.now,
      inputFingerprint: "",
    };
  }
  return calculateNorm(
    norm,
    library.normComponents.filter((c) => c.normId === norm.id),
    library,
    options
  );
}

export function calculateNorm(
  norm: Norm,
  components: readonly NormComponent[],
  library: Pick<LibrarySnapshot, "resources" | "resourcePrices">,
  options: CalcOptions
): NormCalcResult {
  const issues: CalcIssue[] = [];
  const rounding = options.rounding ?? NO_ROUNDING;
  const resources = new Map(library.resources.map((r) => [r.id, r]));
  const sorted = [...components].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
  );
  const issue = (
    code: CalcIssueCode,
    severity: "error" | "warning",
    message: string,
    componentId?: string
  ) => issues.push({ code, severity, message, componentId });

  if (sorted.length === 0) {
    issue("emptyNorm", "error", S.emptyNorm);
  }
  if (norm.status === "inactive") {
    issue("normInactive", "warning", S.normInactive(norm.version));
  }
  if (norm.unit.trim() === "") {
    issue("missingWorkUnit", "error", S.missingWorkUnit);
  }

  const seenResources = new Map<string, string>();
  const fingerprintParts: string[] = [
    `${norm.id}|${norm.updatedAt}|${norm.wasteIncluded}|${norm.status}`,
  ];
  const exactAmounts: { type: ResourceType; amount: D.Decimal }[] = [];
  const currencies = new Set<string>();

  const results = sorted.map((component): ComponentResult => {
    const id = component.id;
    let severity: ComponentResult["severity"] = "ok";
    const fail = (code: CalcIssueCode, message: string) => {
      issue(code, "error", message, id);
      severity = "error";
    };
    const warn = (code: CalcIssueCode, message: string) => {
      issue(code, "warning", message, id);
      if (severity === "ok") {
        severity = "warning";
      }
    };
    fingerprintParts.push(`${id}|${component.updatedAt}`);

    const resource = component.resourceId ? resources.get(component.resourceId) : undefined;
    const label = resource?.code || component.resourceCodeSnapshot || S.unnamed;
    if (!component.resourceId) {
      fail("noResourceLink", S.noResourceLink(label));
    } else if (!resource) {
      fail(
        "resourceMissing",
        S.resourceMissing(component.resourceCodeSnapshot, component.resourceNameSnapshot)
      );
    } else {
      fingerprintParts.push(`${resource.id}|${resource.updatedAt}`);
      if (normalizeCode(resource.unit) !== normalizeCode(component.resourceUnitSnapshot)) {
        // Hao phí được khai theo đơn vị cũ: không tự quy đổi đơn vị.
        fail(
          "resourceUnitChanged",
          S.resourceUnitChanged(resource.code, component.resourceUnitSnapshot, resource.unit)
        );
      }
      if (
        resource.code !== component.resourceCodeSnapshot ||
        resource.name !== component.resourceNameSnapshot
      ) {
        warn(
          "resourceRenamed",
          S.resourceRenamed(component.resourceCodeSnapshot, resource.code, resource.name)
        );
      }
      if (resource.type !== component.resourceTypeSnapshot) {
        warn("resourceTypeChanged", S.resourceTypeChanged(resource.code));
      }
      const previous = seenResources.get(resource.id);
      if (previous) {
        fail("duplicateComponent", S.duplicateComponent(resource.code));
      }
      seenResources.set(resource.id, id);
    }

    // Hao phí và hao hụt.
    let base: D.Decimal | null = null;
    if (!Number.isFinite(component.consumption) || component.consumption < 0) {
      fail("invalidConsumption", S.invalidConsumption(label));
    } else {
      base = D.fromNumber(component.consumption);
      if (component.consumption === 0) {
        warn("zeroConsumption", S.zeroConsumption(label));
      }
    }
    let wasteApplied = false;
    let wasteFactor = D.parse("1");
    if (
      !Number.isFinite(component.wasteRate) ||
      component.wasteRate < 0 ||
      component.wasteRate > MAX_WASTE_RATE
    ) {
      fail("invalidWasteRate", S.invalidWasteRate(label));
    } else if (component.wasteRate > 0) {
      if (norm.wasteIncluded) {
        warn("wasteIgnored", S.wasteIgnored(label));
      } else {
        wasteApplied = true;
        wasteFactor = D.add(wasteFactor, D.fromNumber(component.wasteRate));
      }
    }
    const effective = base ? D.multiply(base, wasteFactor) : D.ZERO;

    // Đơn giá tài nguyên.
    let price: ResourcePrice | undefined;
    if (resource) {
      const selectedId = options.priceSelection?.[id];
      if (selectedId) {
        price = library.resourcePrices.find(
          (p) => p.id === selectedId && p.resourceId === resource.id
        );
        if (!price) {
          fail("selectedPriceMissing", S.selectedPriceMissing(resource.code));
        }
      } else {
        const usable = usablePrices(resource, library.resourcePrices, options.today);
        if (usable.length === 1) {
          price = usable[0];
        } else if (usable.length > 1) {
          fail("ambiguousPrice", S.ambiguousPrice(resource.code, usable.length));
        } else {
          fail("missingPrice", S.missingPrice(resource.code));
        }
      }
    }
    let unitPrice: D.Decimal | null = null;
    if (price && resource) {
      fingerprintParts.push(`${price.id}|${price.updatedAt}`);
      if (normalizeCode(price.unit) !== normalizeCode(resource.unit)) {
        fail("priceUnitMismatch", S.priceUnitMismatch(resource.code, price.unit, resource.unit));
      } else if (!Number.isFinite(price.price) || price.price < 0) {
        fail("invalidPrice", S.invalidPrice(resource.code));
      } else {
        unitPrice = D.fromNumber(price.price);
        currencies.add(price.currency.trim());
        if (price.price === 0) {
          warn("zeroPrice", S.zeroPrice(resource.code));
        }
        if (price.status === "inactive") {
          warn("inactivePrice", S.inactivePrice(resource.code));
        }
        const validity = validityOn(price.effectiveFrom, price.effectiveTo, options.today);
        if (validity === "expired" || validity === "notYetEffective") {
          warn("priceNotInEffect", S.priceNotInEffect(resource.code, validity === "expired"));
        }
      }
    }

    const type = resource?.type ?? component.resourceTypeSnapshot;
    const amount =
      base && unitPrice && !issues.some((i) => i.componentId === id && i.severity === "error")
        ? D.multiply(effective, unitPrice)
        : null;
    if (amount) {
      exactAmounts.push({ type, amount });
    }
    return {
      componentId: id,
      sortOrder: component.sortOrder,
      resourceId: component.resourceId,
      resourceCode: resource?.code ?? component.resourceCodeSnapshot,
      resourceName: resource?.name ?? component.resourceNameSnapshot,
      resourceUnit: resource?.unit ?? component.resourceUnitSnapshot,
      type,
      baseConsumption: component.consumption,
      wasteRate: component.wasteRate,
      wasteApplied,
      effectiveConsumption: D.toNumber(effective),
      effectiveConsumptionExact: D.toString(effective),
      priceId: price?.id ?? null,
      unitPrice: unitPrice ? D.toNumber(unitPrice) : null,
      priceUnit: price?.unit ?? "",
      currency: price?.currency ?? "",
      priceSource: price?.source ?? "",
      amount: amount ? D.toNumber(amount) : null,
      amountExact: amount ? D.toString(amount) : null,
      severity,
    };
  });

  if (currencies.size > 1) {
    issue("currencyMismatch", "error", S.currencyMismatch([...currencies].join(", ")));
  }

  const hasError = issues.some((i) => i.severity === "error");
  let unitPrice: number | null = null;
  let unitPriceExact: string | null = null;
  const totalsByType = emptyTotals();
  if (!hasError) {
    const total = D.sum(exactAmounts.map((a) => a.amount));
    const rounded =
      rounding.mode === "none" ? total : D.round(total, rounding.digits, rounding.mode);
    if (D.integerDigits(rounded) > MAX_INTEGER_DIGITS) {
      issue("overflow", "error", S.overflow);
    } else {
      unitPriceExact = D.toString(total);
      unitPrice = D.toNumber(rounded);
      for (const type of RESOURCE_TYPES) {
        totalsByType[type] = D.toNumber(
          D.sum(exactAmounts.filter((a) => a.type === type).map((a) => a.amount))
        );
      }
    }
  }

  const finalError = issues.some((i) => i.severity === "error");
  return {
    normId: norm.id,
    code: norm.code,
    name: norm.name,
    unit: norm.unit,
    version: norm.version,
    status: finalError ? "invalid" : issues.length > 0 ? "validWithWarnings" : "valid",
    components: results,
    totalsByType: finalError ? emptyTotals() : totalsByType,
    unitPrice: finalError ? null : unitPrice,
    unitPriceExact: finalError ? null : unitPriceExact,
    currency: [...currencies][0] ?? "",
    rounding,
    issues,
    calculatedAt: options.now,
    inputFingerprint: hashText(fingerprintParts.join("\n")),
  };
}
