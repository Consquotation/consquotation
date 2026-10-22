/**
 * Use case tạo bảng báo giá và thêm dòng công tác (giai đoạn 2).
 * Nguyên tắc: kiểm tra vùng đích → hỏi xác nhận khi cần → ghi, và kiểm tra lại ngay khi ghi
 * (prompts/06_WORKBOOK_INTEGRATION.md, 07_QUOTATION_WORKFLOW.md).
 */

import { DEFAULT_QUOTE_SHEET_NAME } from "../domain/naming";
import { buildQuoteLayout } from "../domain/quoteTemplate";
import {
  AppendInspection,
  AppendedRows,
  CreatedQuote,
  InsertPosition,
  TargetChangedError,
  TargetInspection,
  WorkbookGateway,
} from "./workbookGateway";

export type Placement = "newSheet" | "atSelection";

export type TemplatePlan =
  | { status: "blocked"; inspection: TargetInspection }
  /** Vùng đích có dữ liệu: chỉ ghi khi người dùng xác nhận ghi đè. */
  | { status: "needsOverwriteConfirmation"; inspection: TargetInspection }
  /** Vùng trống trên sheet có sẵn: hiển thị vị trí ghi để người dùng xác nhận. */
  | { status: "needsLocationConfirmation"; inspection: TargetInspection }
  /** Sheet mới: không ảnh hưởng dữ liệu có sẵn, ghi được ngay. */
  | { status: "ready"; inspection: TargetInspection };

export async function planTemplate(
  gateway: WorkbookGateway,
  placement: Placement,
  initialRows: number,
  sheetBaseName: string = DEFAULT_QUOTE_SHEET_NAME
): Promise<TemplatePlan> {
  const layout = buildQuoteLayout(initialRows);
  const inspection =
    placement === "newSheet"
      ? await gateway.inspectTarget(
          { kind: "newSheet", baseName: sheetBaseName },
          layout.rowCount,
          layout.columnCount
        )
      : await gateway.inspectAtSelection(layout.rowCount, layout.columnCount);

  if (inspection.blockers.length > 0) {
    return { status: "blocked", inspection };
  }
  if (inspection.occupied.count > 0) {
    return { status: "needsOverwriteConfirmation", inspection };
  }
  if (inspection.target.kind === "atCell") {
    return { status: "needsLocationConfirmation", inspection };
  }
  return { status: "ready", inspection };
}

export type TemplateResult =
  | { status: "created"; quote: CreatedQuote }
  /** Workbook đã thay đổi sau khi kiểm tra: không ghi gì, cần kiểm tra lại. */
  | { status: "changed" };

export async function executeTemplate(
  gateway: WorkbookGateway,
  plan: TemplatePlan,
  initialRows: number,
  confirmation: { overwrite: boolean }
): Promise<TemplateResult> {
  if (plan.status === "blocked") {
    throw new Error("Không thể ghi vào vùng đích đang bị chặn.");
  }
  if (plan.status === "needsOverwriteConfirmation" && !confirmation.overwrite) {
    throw new Error("Cần xác nhận ghi đè trước khi ghi vào vùng có dữ liệu.");
  }
  try {
    const quote = await gateway.writeTemplate(
      plan.inspection.target,
      buildQuoteLayout(initialRows).dataRowCount,
      plan.inspection.fingerprint
    );
    return { status: "created", quote };
  } catch (error) {
    if (error instanceof TargetChangedError) {
      return { status: "changed" };
    }
    throw error;
  }
}

export type AppendPlan =
  | { status: "blocked"; inspection: AppendInspection }
  /** Có dữ liệu dưới bảng sẽ bị đẩy xuống: cần xác nhận. Ghi vào dòng trống thì không đẩy gì. */
  | { status: "needsShiftConfirmation"; inspection: AppendInspection }
  | { status: "ready"; inspection: AppendInspection };

export async function planAppend(
  gateway: WorkbookGateway,
  tableName: string,
  position: InsertPosition = { kind: "end" }
): Promise<AppendPlan> {
  const inspection = await gateway.inspectAppend(tableName, position);
  if (inspection.blockers.length > 0) {
    return { status: "blocked", inspection };
  }
  if (inspection.cellsBelow.count > 0 && inspection.fillIndex === null) {
    return { status: "needsShiftConfirmation", inspection };
  }
  return { status: "ready", inspection };
}

export type AppendResult = { status: "appended"; rows: AppendedRows } | { status: "changed" };

export async function executeAppend(
  gateway: WorkbookGateway,
  plan: AppendPlan,
  rows: (string | number)[][],
  confirmation: { shift: boolean }
): Promise<AppendResult> {
  if (plan.status === "blocked") {
    throw new Error("Không thể thêm dòng vào bảng đang bị chặn.");
  }
  // Chỉ ghi vào dòng trống khi thêm đúng 1 dòng; nhiều dòng thì chèn như thường (cần xác nhận nếu đẩy dữ liệu).
  const fillIndex = rows.length === 1 ? plan.inspection.fillIndex : null;
  if (fillIndex === null && plan.inspection.cellsBelow.count > 0 && !confirmation.shift) {
    throw new Error("Cần xác nhận trước khi đẩy dữ liệu bên dưới bảng xuống.");
  }
  try {
    const appended = await gateway.appendRows(
      plan.inspection.tableName,
      rows,
      plan.inspection.fingerprint,
      plan.inspection.insertIndex,
      fillIndex
    );
    return { status: "appended", rows: appended };
  } catch (error) {
    if (error instanceof TargetChangedError) {
      return { status: "changed" };
    }
    throw error;
  }
}
