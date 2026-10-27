/**
 * Mục hồ sơ cho dòng vừa chèn vào báo giá (thủ công, từ thư viện, phân tích định mức): chụp lại nguồn
 * gốc và giá tại lúc chèn để sau này truy vết và phát hiện thư viện đã đổi (ADR-0014).
 */

import * as D from "../pricing/decimal";
import { ANALYSIS_COLUMNS } from "../pricing/analysis";
import type { CompositionLine, PriceSelection } from "../pricing/composition";
import type { WorkItem } from "../library/types";
import { COST_TYPES } from "./lines";
import type { CostType, QuotationComponent, QuotationItemRecord } from "./model";

interface Base {
  id: string;
  code: string;
  name: string;
  unit: string;
  now: string;
}

function base(input: Base): Omit<QuotationItemRecord, "pricingMethod" | "source" | "libraryPrice"> {
  return {
    id: input.id,
    workCode: input.code,
    workName: input.name,
    unit: input.unit,
    components: [],
    result: null,
    writtenBreakdown: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function manualItem(input: Base): QuotationItemRecord {
  return { ...base(input), pricingMethod: "manual", source: null, libraryPrice: null };
}

export function libraryItem(input: Base, workItem: WorkItem): QuotationItemRecord {
  return {
    ...base(input),
    pricingMethod: "library",
    source: { workItemId: workItem.id, normId: null, normCode: "", normVersion: "" },
    libraryPrice:
      workItem.unitPrice === null
        ? null
        : { workItemId: workItem.id, unitPrice: workItem.unitPrice, currency: workItem.currency },
  };
}

const SOURCE_INDEX = ANALYSIS_COLUMNS.findIndex((c) => c.key === "source");

/** Dòng phân tích định mức: snapshot từng thành phần kèm id tài nguyên, id giá đã chọn. */
export function normItem(
  input: Base,
  workItem: WorkItem,
  lines: readonly CompositionLine[],
  selection: PriceSelection,
  analysisRows: readonly (string | number)[][]
): QuotationItemRecord {
  const norm = lines[0]?.norm ?? null;
  const components = lines.map((line, index): QuotationComponent => {
    const option = line.options.find((o) => o.price.id === selection[line.component.id]) ?? null;
    const source = String(analysisRows[index]?.[SOURCE_INDEX] ?? "").replace(/^'/, "");
    const component = line.component;
    return {
      resourceType: line.resource?.type ?? component.resourceTypeSnapshot,
      resourceId: component.resourceId,
      resourceCodeSnapshot: line.resource?.code ?? component.resourceCodeSnapshot,
      resourceNameSnapshot: line.resource?.name ?? component.resourceNameSnapshot,
      unitSnapshot: line.resource?.unit ?? component.resourceUnitSnapshot,
      baseConsumption: component.consumption,
      wasteRate: line.consumption === component.consumption ? 0 : component.wasteRate,
      appliedConsumption: line.consumption,
      priceId: option?.price.id ?? null,
      unitPriceSnapshot: option?.price.price ?? null,
      priceUnitSnapshot: option?.price.unit ?? "",
      currency: option?.price.currency ?? "",
      sourceReference: source,
    };
  });
  return {
    ...base(input),
    pricingMethod: "norm",
    source: {
      workItemId: workItem.id,
      normId: norm?.id ?? null,
      normCode: norm?.code ?? "",
      normVersion: norm?.version ?? "",
    },
    libraryPrice: null,
    components,
  };
}

/**
 * Đơn giá theo loại từ thành phần và giá đã chọn (cùng công thức với sheet phân tích, chưa làm tròn).
 * null khi còn tài nguyên chưa chọn giá (không ghi số thiếu).
 */
export function compositionBreakdown(
  lines: readonly CompositionLine[],
  selection: PriceSelection
): Record<CostType, number> | null {
  if (lines.length === 0) {
    return null;
  }
  const sums: Record<CostType, D.Decimal> = {
    material: D.ZERO,
    labor: D.ZERO,
    machine: D.ZERO,
    other: D.ZERO,
  };
  for (const line of lines) {
    const option = line.options.find((o) => o.price.id === selection[line.component.id]);
    if (!option || !line.resource) {
      return null;
    }
    const type = line.resource.type;
    sums[type] = D.add(
      sums[type],
      D.multiply(D.fromNumber(line.consumption), D.fromNumber(option.price.price))
    );
  }
  return Object.fromEntries(COST_TYPES.map((t) => [t, D.toNumber(sums[t])])) as Record<
    CostType,
    number
  >;
}
