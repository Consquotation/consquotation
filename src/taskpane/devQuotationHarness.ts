/**
 * Chỉ bản phát triển: các lớp thật của quy trình báo giá (gateway Excel, service, domain) để kịch bản
 * kiểm thử tích hợp tests/integration/quotation.scenarios.js gọi trực tiếp qua DevTools. Bản production
 * không nạp module này (index.tsx chỉ import khi __CQ_BUILD_MODE__ === "development").
 */

export { ExcelWorkbookGateway } from "../office/excelWorkbookGateway";
export { ExcelPricingGateway } from "../office/excelPricingGateway";
export { ExcelQuotationGateway } from "../office/excelQuotationGateway";
export { QuotationService } from "../application/quotationService";
export {
  executeAppend,
  executeTemplate,
  planAppend,
  planTemplate,
} from "../application/quoteService";
export { planInfoWrites } from "../domain/quoteInfo";
export { buildComposition, compositionLines, compositionNote } from "../domain/pricing/composition";
export { checkQuote } from "../domain/pricing/quoteCheck";
export {
  compositionBreakdown,
  libraryItem,
  manualItem,
  normItem,
} from "../domain/quotation/fromInsert";
export { decodeRecord, recordTableOf } from "../domain/quotation/model";
export { BREAKDOWN_COLUMNS, LINE_ID_HEADER, extensionHeader } from "../domain/quoteTemplate";
export { validateWorkItemDraft } from "../domain/workItemDraft";
export { draftFromWorkItem } from "../domain/library/toQuote";
export { DEFAULT_ROUNDING } from "../domain/pricing/rounding";
