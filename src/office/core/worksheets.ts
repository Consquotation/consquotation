/* global Excel */

/**
 * Workbook và Worksheet: đọc thông tin, tìm, tạo, đổi tên (quy ước chung: core/run.ts).
 * Không xóa sheet. Đổi tên chỉ khi nơi gọi chủ động yêu cầu; add-in không tự đổi tên sheet
 * có sẵn của người dùng.
 */

import { ExcelOpError } from "../../domain/excel/errors";
import { checkSheetNameInput, sameName, uniqueSheetName } from "../../domain/naming";
import { EXCEL_ERRORS } from "../../shared/strings.excel.vi";
import { stripSheetName } from "../../shared/a1";
import { supports } from "../excelHelpers";

export interface WorkbookInfo {
  /** Tên file nếu Excel cho biết (ExcelApi 1.7); null với workbook chưa lưu trên một số nền tảng. */
  name: string | null;
  /** null: Excel này không cho biết. */
  readOnly: boolean | null;
  structureProtected: boolean | null;
  activeSheet: string;
  sheetCount: number;
}

/**
 * Thông tin workbook hiện hành. Không lấy đường dẫn file: Office.js không bảo đảm có đường dẫn
 * trên mọi nền tảng và add-in không cần nó.
 */
export async function readWorkbookInfo(context: Excel.RequestContext): Promise<WorkbookInfo> {
  const workbook = context.workbook;
  const hasInfo = supports("1.7");
  const hasReadOnly = supports("1.8");
  if (hasInfo) {
    workbook.load("name");
    workbook.protection.load("protected");
  }
  if (hasReadOnly) {
    workbook.load("readOnly");
  }
  const active = workbook.worksheets.getActiveWorksheet();
  active.load("name");
  const sheets = workbook.worksheets;
  sheets.load("items/name");
  await context.sync();
  return {
    name: hasInfo && workbook.name ? workbook.name : null,
    readOnly: hasReadOnly ? workbook.readOnly : null,
    structureProtected: hasInfo ? workbook.protection.protected : null,
    activeSheet: active.name,
    sheetCount: sheets.items.length,
  };
}

export interface WorksheetInfo {
  name: string;
  position: number;
  visibility: string;
  protected: boolean;
}

export async function listWorksheets(context: Excel.RequestContext): Promise<WorksheetInfo[]> {
  const sheets = context.workbook.worksheets;
  sheets.load("items/name,items/position,items/visibility,items/protection/protected");
  await context.sync();
  return sheets.items.map((sheet) => ({
    name: sheet.name,
    position: sheet.position,
    visibility: String(sheet.visibility),
    protected: sheet.protection.protected,
  }));
}

export interface ActiveSheetInfo {
  name: string;
  protected: boolean;
  /** Vùng có dữ liệu (A1, không kèm tên sheet); null nếu sheet trống. */
  usedAddress: string | null;
}

export async function readActiveWorksheet(context: Excel.RequestContext): Promise<ActiveSheetInfo> {
  const sheet = context.workbook.worksheets.getActiveWorksheet();
  sheet.load("name,protection/protected");
  const used = sheet.getUsedRangeOrNullObject(true);
  used.load("address");
  await context.sync();
  return {
    name: sheet.name,
    protected: sheet.protection.protected,
    usedAddress: used.isNullObject ? null : stripSheetName(used.address),
  };
}

/** Tìm sheet theo tên (Excel không phân biệt hoa thường). null nếu không có. */
export async function findWorksheet(
  context: Excel.RequestContext,
  name: string
): Promise<Excel.Worksheet | null> {
  const sheet = context.workbook.worksheets.getItemOrNullObject(name);
  sheet.load("name");
  await context.sync();
  return sheet.isNullObject ? null : sheet;
}

export async function requireWorksheet(
  context: Excel.RequestContext,
  name: string
): Promise<Excel.Worksheet> {
  const sheet = await findWorksheet(context, name);
  if (!sheet) {
    throw new ExcelOpError("sheetNotFound", EXCEL_ERRORS.sheetNotFound(name));
  }
  return sheet;
}

/** Ném "protected" nếu sheet đang bị bảo vệ. Gọi trước mọi thao tác ghi vào ô. */
export async function assertSheetEditable(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet
): Promise<void> {
  sheet.load("name,protection/protected");
  await context.sync();
  if (sheet.protection.protected) {
    throw new ExcelOpError("protected", EXCEL_ERRORS.sheetProtected(sheet.name));
  }
}

/** Ném "protected" nếu cấu trúc workbook bị khóa (không thêm/đổi tên sheet được). */
async function assertStructureEditable(context: Excel.RequestContext): Promise<void> {
  if (!supports("1.7")) {
    return; // Không đọc được; nếu bị khóa, Excel sẽ báo AccessDenied khi ghi.
  }
  const protection = context.workbook.protection;
  protection.load("protected");
  await context.sync();
  if (protection.protected) {
    throw new ExcelOpError("protected", EXCEL_ERRORS.workbookProtected);
  }
}

function validSheetName(name: string): string {
  const check = checkSheetNameInput(name);
  if (!check.ok) {
    throw new ExcelOpError("invalidName", EXCEL_ERRORS.invalidSheetName(check.message));
  }
  return check.name;
}

export type IfSheetExists =
  /** Báo lỗi "sheetExists". */
  | "error"
  /** Dùng lại sheet có sẵn (idempotent: chạy lặp không tạo trùng). */
  | "reuse"
  /** Tạo sheet mới tên "Tên (2)", "Tên (3)"… */
  | "suffix";

export interface CreatedWorksheet {
  name: string;
  created: boolean;
}

/** Tạo sheet ở cuối workbook. Không kích hoạt sheet; nơi gọi tự quyết định. */
export async function createWorksheet(
  context: Excel.RequestContext,
  requestedName: string,
  ifExists: IfSheetExists = "error"
): Promise<CreatedWorksheet> {
  const name = validSheetName(requestedName);
  const sheets = context.workbook.worksheets;
  sheets.load("items/name");
  await context.sync();
  const existing = sheets.items.map((s) => s.name);
  const match = existing.find((n) => sameName(n, name));
  if (match !== undefined) {
    if (ifExists === "reuse") {
      return { name: match, created: false };
    }
    if (ifExists === "error") {
      throw new ExcelOpError("sheetExists", EXCEL_ERRORS.sheetExists(match));
    }
  }
  await assertStructureEditable(context);
  const finalName = match === undefined ? name : uniqueSheetName(name, existing);
  const sheet = sheets.add(finalName);
  sheet.load("name");
  await context.sync();
  return { name: sheet.name, created: true };
}

/**
 * Đổi tên sheet. Chỉ dùng khi người dùng yêu cầu rõ ràng cho sheet đó.
 * Cho phép đổi chỉ hoa/thường của chính sheet đó; trùng sheet khác thì báo "sheetExists".
 */
export async function renameWorksheet(
  context: Excel.RequestContext,
  from: string,
  to: string
): Promise<string> {
  const newName = validSheetName(to);
  const sheet = await requireWorksheet(context, from);
  const sheets = context.workbook.worksheets;
  sheets.load("items/name");
  await context.sync();
  const clash = sheets.items.find((s) => s.name !== sheet.name && sameName(s.name, newName));
  if (clash) {
    throw new ExcelOpError("sheetExists", EXCEL_ERRORS.sheetExists(clash.name));
  }
  await assertStructureEditable(context);
  sheet.name = newName;
  sheet.load("name");
  await context.sync();
  return sheet.name;
}
