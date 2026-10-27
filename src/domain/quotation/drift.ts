/**
 * So snapshot của dòng báo giá với thư viện hiện tại (giai đoạn 17, mục 5–6 yêu cầu). Chỉ BÁO và lập
 * kế hoạch cập nhật; báo giá không đổi cho tới khi người dùng chủ động bấm cập nhật (snapshot bảo vệ
 * báo giá cũ khỏi thay đổi thư viện).
 */

import { normalizeCode } from "../library/validation";
import type { LibrarySnapshot } from "../library/types";
import type { ItemIssue, QuotationItemRecord } from "./model";

export interface ComponentPriceUpdate {
  componentIndex: number;
  resourceCode: string;
  priceId: string;
  oldPrice: number | null;
  newPrice: number;
  currency: string;
  priceUnit: string;
  source: string;
}

export type LibraryUpdatePlan =
  | { kind: "norm"; prices: ComponentPriceUpdate[] }
  | { kind: "library"; workItemId: string; oldPrice: number; newPrice: number; currency: string };

export interface DriftResult {
  issues: ItemIssue[];
  /** Cập nhật làm được theo thư viện hiện tại; null nếu không có gì để cập nhật hoặc không an toàn. */
  plan: LibraryUpdatePlan | null;
}

const money = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 9 });

export function libraryDrift(item: QuotationItemRecord, library: LibrarySnapshot): DriftResult {
  const issues: ItemIssue[] = [];
  if (item.pricingMethod === "library" && item.libraryPrice) {
    const snapshot = item.libraryPrice;
    const workItem = library.workItems.find((w) => w.id === snapshot.workItemId);
    if (!workItem) {
      issues.push({
        code: "libraryMissing",
        severity: "warning",
        message: `Công tác "${item.workCode}" không còn trong thư viện trên máy này.`,
        hint: "Báo giá giữ đơn giá đã chèn. Kiểm tra lại thư viện nếu cần truy vết.",
      });
      return { issues, plan: null };
    }
    if (workItem.unitPrice !== null && workItem.unitPrice !== snapshot.unitPrice) {
      const sameCurrency = workItem.currency.trim() === snapshot.currency.trim();
      issues.push({
        code: "libraryPriceChanged",
        severity: "warning",
        message: `Đơn giá trong thư viện đã đổi: ${money(snapshot.unitPrice)} → ${money(workItem.unitPrice)} ${workItem.currency}.`,
        hint: sameCurrency
          ? "Báo giá vẫn giữ giá lúc chèn. Bấm Cập nhật theo thư viện nếu muốn dùng giá mới."
          : "Tiền tệ đã đổi; add-in không quy đổi. Sửa tay nếu cần.",
      });
      return {
        issues,
        plan: sameCurrency
          ? {
              kind: "library",
              workItemId: workItem.id,
              oldPrice: snapshot.unitPrice,
              newPrice: workItem.unitPrice,
              currency: workItem.currency,
            }
          : null,
      };
    }
    return { issues, plan: null };
  }

  if (item.pricingMethod !== "norm" || item.components.length === 0) {
    return { issues, plan: null };
  }
  const source = item.source;
  if (source?.normId) {
    const norm = library.norms.find((n) => n.id === source.normId);
    const approved = library.norms.find(
      (n) => normalizeCode(n.code) === normalizeCode(source.normCode) && n.status === "approved"
    );
    if (!norm) {
      issues.push({
        code: "normVersionChanged",
        severity: "warning",
        message: `Định mức ${source.normCode} v${source.normVersion} không còn trong thư viện.`,
        hint: "Báo giá giữ hao phí đã chèn trên sheet phân tích.",
      });
    } else if (approved && approved.id !== norm.id) {
      issues.push({
        code: "normVersionChanged",
        severity: "warning",
        message: `Định mức ${source.normCode} đang dùng phiên bản ${approved.version}; dòng này lập theo phiên bản ${source.normVersion}.`,
        hint: "Hao phí không tự đổi. Muốn dùng phiên bản mới, xóa khối phân tích cũ của mã này rồi chèn lại công tác.",
      });
    }
  }

  const prices: ComponentPriceUpdate[] = [];
  item.components.forEach((component, index) => {
    const resource = component.resourceId
      ? library.resources.find((r) => r.id === component.resourceId)
      : undefined;
    if (component.resourceId && !resource) {
      issues.push({
        code: "libraryMissing",
        severity: "warning",
        resourceCode: component.resourceCodeSnapshot,
        message: `Tài nguyên "${component.resourceCodeSnapshot}" không còn trong thư viện.`,
        hint: "Báo giá giữ đơn giá nguồn đã chèn.",
      });
      return;
    }
    if (resource && normalizeCode(resource.unit) !== normalizeCode(component.unitSnapshot)) {
      issues.push({
        code: "resourceChanged",
        severity: "warning",
        resourceCode: component.resourceCodeSnapshot,
        message: `Đơn vị của tài nguyên "${resource.code}" trong thư viện đã đổi từ "${component.unitSnapshot}" sang "${resource.unit}".`,
        hint: "Add-in không quy đổi đơn vị và không cập nhật giá của tài nguyên này.",
      });
      return;
    }
    if (!component.priceId) {
      return;
    }
    const price = library.resourcePrices.find((p) => p.id === component.priceId);
    if (!price) {
      issues.push({
        code: "libraryMissing",
        severity: "warning",
        resourceCode: component.resourceCodeSnapshot,
        message: `Giá đã dùng cho "${component.resourceCodeSnapshot}" không còn trong thư viện.`,
        hint: "Báo giá giữ đơn giá nguồn đã chèn.",
      });
      return;
    }
    if (normalizeCode(price.unit) !== normalizeCode(component.priceUnitSnapshot)) {
      issues.push({
        code: "componentUnitMismatch",
        severity: "warning",
        resourceCode: component.resourceCodeSnapshot,
        message: `Giá của "${component.resourceCodeSnapshot}" trong thư viện đã đổi đơn vị từ "${component.priceUnitSnapshot}" sang "${price.unit}".`,
        hint: "Add-in không quy đổi đơn vị; giá này không được cập nhật tự động.",
      });
      return;
    }
    if (price.price !== component.unitPriceSnapshot) {
      const sameCurrency = price.currency.trim() === component.currency.trim();
      issues.push({
        code: "libraryPriceChanged",
        severity: "warning",
        resourceCode: component.resourceCodeSnapshot,
        message: `Giá "${component.resourceCodeSnapshot}" trong thư viện đã đổi: ${component.unitPriceSnapshot === null ? "(trống)" : money(component.unitPriceSnapshot)} → ${money(price.price)} ${price.currency}/${price.unit}.`,
        hint: sameCurrency
          ? "Báo giá vẫn giữ giá lúc chèn. Bấm Cập nhật theo thư viện nếu muốn dùng giá mới."
          : "Tiền tệ đã đổi; add-in không quy đổi.",
      });
      if (sameCurrency) {
        prices.push({
          componentIndex: index,
          resourceCode: component.resourceCodeSnapshot,
          priceId: price.id,
          oldPrice: component.unitPriceSnapshot,
          newPrice: price.price,
          currency: price.currency,
          priceUnit: price.unit,
          source: price.source,
        });
      }
    }
  });
  return { issues, plan: prices.length > 0 ? { kind: "norm", prices } : null };
}
