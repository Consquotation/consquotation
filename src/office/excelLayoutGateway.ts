/* global Excel */

/**
 * Adapter Office.js cho LayoutGateway (prompts/11): khu vực ghi chú/điều khoản và thiết lập trang in.
 * Vị trí các khối luôn được tính lại từ sheet (bảng, bảng tổng hợp, tên CQ_Terms_n), không lưu tạm.
 */

import {
  LayoutGateway,
  PrintSetupState,
  TermsAreaCheck,
  TermsState,
} from "../application/layoutGateway";
import { TargetChangedError } from "../application/workbookGateway";
import { labelMatches } from "../domain/quoteInfo";
import {
  PAGE_NUMBER_FOOTER,
  PrintOptions,
  Rect,
  boundingRect,
  quoteTopRow,
  zoomFor,
} from "../domain/printLayout";
import { QUOTE_COLUMNS, QUOTE_INFO_LABELS, QUOTE_TITLE } from "../domain/quoteTemplate";
import {
  TERMS_TEXT_COLUMN_OFFSET,
  TermsSection,
  parseTermsBlock,
  termsNameFor,
  termsRows,
  termsToWrite,
} from "../domain/terms";
import { rangeAddress, stripSheetName } from "../shared/a1";
import { CellRect, findOccupied, hashString, ownBlocksBelow, supports } from "./excelHelpers";

const SCAN_ROWS_ABOVE = 15;

interface Geometry {
  table: Excel.Table;
  sheet: Excel.Worksheet;
  sheetName: string;
  sheetProtected: boolean;
  headerRow: number;
  left: number;
  width: number;
  /** Hàng (từ 0) ngay sau dòng cuối của bảng báo giá (kể cả dòng tổng). */
  tableBottom: number;
  top: number;
  quote: Rect;
  summary?: CellRect;
  terms?: CellRect;
}

async function geometry(
  context: Excel.RequestContext,
  quoteTableName: string
): Promise<Geometry | null> {
  const table = context.workbook.tables.getItemOrNullObject(quoteTableName);
  table.load("name");
  await context.sync();
  if (table.isNullObject) {
    return null;
  }
  const sheet = context.workbook.tables.getItem(quoteTableName).worksheet;
  sheet.load("name");
  sheet.protection.load("protected");
  const full = table.getRange();
  full.load("rowIndex,columnIndex,rowCount,columnCount");
  await context.sync();
  const first = Math.max(0, full.rowIndex - SCAN_ROWS_ABOVE);
  let titleRow: number | null = null;
  let firstInfoRow: number | null = null;
  if (full.rowIndex > first) {
    const above = sheet.getRangeByIndexes(first, full.columnIndex, full.rowIndex - first, 1);
    above.load("values");
    await context.sync();
    const values = above.values.map((row) => row[0]);
    const t = values.findIndex((v) => v === QUOTE_TITLE);
    titleRow = t >= 0 ? first + t : null;
    const i = values.findIndex((v) => QUOTE_INFO_LABELS.some((label) => labelMatches(v, label)));
    firstInfoRow = i >= 0 ? first + i : null;
  }
  const own = await ownBlocksBelow(context, quoteTableName);
  const top = quoteTopRow(full.rowIndex, titleRow, firstInfoRow);
  return {
    table,
    sheet,
    sheetName: sheet.name,
    sheetProtected: sheet.protection.protected,
    headerRow: full.rowIndex,
    left: full.columnIndex,
    width: full.columnCount,
    tableBottom: full.rowIndex + full.rowCount,
    top,
    quote: {
      rowIndex: full.rowIndex,
      columnIndex: full.columnIndex,
      rowCount: full.rowCount,
      columnCount: full.columnCount,
    },
    summary: own.summary,
    terms: own.terms,
  };
}

interface TermsArea {
  check: TermsAreaCheck;
  geo?: Geometry;
  top: number;
}

async function inspectTermsArea(
  context: Excel.RequestContext,
  quoteTableName: string,
  rowCount: number
): Promise<TermsArea> {
  const geo = await geometry(context, quoteTableName);
  if (!geo) {
    return { check: { ok: false, reason: "tableMissing" }, top: 0 };
  }
  if (geo.sheetProtected) {
    return { check: { ok: false, reason: "protected" }, top: 0, geo };
  }
  const above = geo.summary ? geo.summary.rowIndex + geo.summary.rowCount : geo.tableBottom;
  const top = geo.terms ? geo.terms.rowIndex : above + 1;
  const ownRows = geo.terms?.rowCount ?? 0;
  let existing: unknown[][] = [];
  if (geo.terms) {
    const range = geo.sheet.getRangeByIndexes(
      geo.terms.rowIndex,
      geo.left,
      geo.terms.rowCount,
      geo.width
    );
    range.load("formulas");
    await context.sync();
    existing = range.formulas as unknown[][];
  }
  let extra: unknown[][] = [];
  if (rowCount > ownRows) {
    const range = geo.sheet.getRangeByIndexes(
      top + ownRows,
      geo.left,
      rowCount - ownRows,
      geo.width
    );
    range.load("formulas");
    await context.sync();
    extra = range.formulas as unknown[][];
    const occupied = findOccupied(extra, top + ownRows, geo.left);
    if (occupied.count > 0) {
      return { check: { ok: false, reason: "occupied", sample: occupied.sample }, top, geo };
    }
  }
  return {
    check: {
      ok: true,
      address: rangeAddress(top, geo.left, rowCount, geo.width),
      fingerprint: hashString(
        `${top}|${geo.left}|${geo.width}|${JSON.stringify(existing)}|${JSON.stringify(extra)}`
      ),
    },
    top,
    geo,
  };
}

/** Xóa nội dung và định dạng add-in đã đặt cho khu vực điều khoản cũ (vùng của add-in). */
function clearTermsBlock(sheet: Excel.Worksheet, rect: CellRect): void {
  const range = sheet.getRangeByIndexes(
    rect.rowIndex,
    rect.columnIndex,
    rect.rowCount,
    rect.columnCount
  );
  range.clear(Excel.ClearApplyTo.contents);
  range.format.wrapText = false;
  range.format.font.bold = false;
  range.format.autofitRows();
}

export class ExcelLayoutGateway implements LayoutGateway {
  async readTerms(quoteTableName: string): Promise<TermsState> {
    return Excel.run(async (context) => {
      const geo = await geometry(context, quoteTableName);
      if (!geo?.terms) {
        return { exists: false, sections: [], address: "" };
      }
      const range = geo.sheet.getRangeByIndexes(
        geo.terms.rowIndex,
        geo.left,
        geo.terms.rowCount,
        geo.width
      );
      range.load("values,address");
      await context.sync();
      const values = range.values;
      return {
        exists: true,
        sections: parseTermsBlock(
          values.map((row) => row[0]),
          values.map((row) => row[TERMS_TEXT_COLUMN_OFFSET])
        ),
        address: stripSheetName(range.address),
      };
    });
  }

  async inspectTerms(quoteTableName: string, rowCount: number): Promise<TermsAreaCheck> {
    return Excel.run(
      async (context) => (await inspectTermsArea(context, quoteTableName, rowCount)).check
    );
  }

  async writeTerms(
    quoteTableName: string,
    sections: TermsSection[],
    fingerprint: string
  ): Promise<void> {
    if (termsToWrite(sections).length === 0) {
      await this.removeTerms(quoteTableName);
      return;
    }
    await Excel.run(async (context) => {
      const rows = termsRows(sections);
      const area = await inspectTermsArea(context, quoteTableName, rows.length);
      if (!area.check.ok || area.check.fingerprint !== fingerprint || !area.geo) {
        throw new TargetChangedError();
      }
      const { sheet, left, width, terms } = area.geo;
      if (terms) {
        clearTermsBlock(sheet, terms);
      }
      const labels = sheet.getRangeByIndexes(area.top, left, rows.length, 1);
      labels.values = rows.map((r) => [r.label]);
      labels.format.font.bold = true;
      labels.format.verticalAlignment = Excel.VerticalAlignment.top;
      const texts = sheet.getRangeByIndexes(
        area.top,
        left + TERMS_TEXT_COLUMN_OFFSET,
        rows.length,
        1
      );
      texts.values = rows.map((r) => [r.text]);
      texts.format.wrapText = true;
      texts.format.verticalAlignment = Excel.VerticalAlignment.top;
      const block = sheet.getRangeByIndexes(area.top, left, rows.length, width);
      const name = termsNameFor(quoteTableName);
      const old = context.workbook.names.getItemOrNullObject(name);
      await context.sync();
      if (!old.isNullObject) {
        old.delete();
      }
      context.workbook.names.add(name, block, "Khu vực ghi chú/điều khoản của ConsQuotation");
      block.format.autofitRows();
      await context.sync();
    });
  }

  async removeTerms(quoteTableName: string): Promise<void> {
    await Excel.run(async (context) => {
      const geo = await geometry(context, quoteTableName);
      if (!geo?.terms) {
        return;
      }
      if (geo.sheetProtected) {
        throw new Error(`Sheet "${geo.sheetName}" đang được bảo vệ.`);
      }
      clearTermsBlock(geo.sheet, geo.terms);
      context.workbook.names.getItem(termsNameFor(quoteTableName)).delete();
      await context.sync();
    });
  }

  async readPrintSetup(quoteTableName: string): Promise<PrintSetupState> {
    return Excel.run(async (context) => {
      const geo = await geometry(context, quoteTableName);
      if (!geo) {
        throw new Error("Không tìm thấy bảng báo giá.");
      }
      const area = boundingRect(
        [
          { rowIndex: geo.top, columnIndex: geo.left, rowCount: 1, columnCount: geo.width },
          geo.quote,
          geo.summary,
          geo.terms,
        ].filter((r): r is Rect => r !== undefined)
      );
      const state: PrintSetupState = {
        supported: supports("1.9"),
        sheetName: geo.sheetName,
        quoteArea: rangeAddress(area.rowIndex, area.columnIndex, area.rowCount, area.columnCount),
        headerRow: geo.headerRow,
        current: null,
      };
      if (!state.supported) {
        return state;
      }
      const layout = geo.sheet.pageLayout;
      layout.load("orientation,paperSize,zoom");
      const printArea = layout.getPrintAreaOrNullObject();
      printArea.load("address");
      const titles = layout.getPrintTitleRowsOrNullObject();
      titles.load("address");
      const footer = layout.headersFooters.defaultForAllPages;
      footer.load("centerFooter");
      await context.sync();
      state.current = {
        printArea: printArea.isNullObject ? null : stripSheetName(printArea.address),
        titleRows: titles.isNullObject ? null : stripSheetName(titles.address),
        orientation: layout.orientation ?? null,
        paper: layout.paperSize ?? null,
        fitWide: layout.zoom?.horizontalFitToPages ?? null,
        fitTall: layout.zoom?.verticalFitToPages ?? null,
        scale: layout.zoom?.scale ?? null,
        footer: footer.centerFooter || null,
      };
      return state;
    });
  }

  async applyPrintSetup(
    quoteTableName: string,
    options: PrintOptions
  ): Promise<{ printArea: string }> {
    if (!supports("1.9")) {
      throw new Error("Excel này chưa hỗ trợ thiết lập trang in qua add-in (cần ExcelApi 1.9).");
    }
    const state = await this.readPrintSetup(quoteTableName);
    await Excel.run(async (context) => {
      const table = context.workbook.tables.getItem(quoteTableName);
      const sheet = context.workbook.tables.getItem(quoteTableName).worksheet;
      const layout = sheet.pageLayout;
      layout.setPrintArea(sheet.getRange(state.quoteArea));
      if (options.repeatHeader) {
        const row = state.headerRow + 1;
        layout.setPrintTitleRows(`$${row}:$${row}`);
      }
      layout.orientation =
        options.orientation === "landscape"
          ? Excel.PageOrientation.landscape
          : Excel.PageOrientation.portrait;
      layout.paperSize =
        options.paper === "a3"
          ? Excel.PaperType.a3
          : options.paper === "letter"
            ? Excel.PaperType.letter
            : Excel.PaperType.a4;
      layout.zoom = zoomFor(options.fit);
      layout.centerHorizontally = options.centerHorizontally;
      const footer = layout.headersFooters.defaultForAllPages;
      if (options.pageNumbers) {
        footer.centerFooter = PAGE_NUMBER_FOOTER;
      } else if (state.current?.footer === PAGE_NUMBER_FOOTER) {
        // Chỉ gỡ chân trang do add-in đặt; chân trang người dùng tự đặt được giữ nguyên.
        footer.centerFooter = "";
      }
      if (options.wrapLongText) {
        // Cột chữ dài: xuống dòng để khi in không bị cắt (đã kiểm chứng: không xuống dòng thì PDF cắt chữ).
        const columns = (["description", "notes"] as const).map((key) => {
          const header = QUOTE_COLUMNS.find((c) => c.key === key)!.header;
          const column = table.columns.getItemOrNullObject(header);
          column.load("name");
          return column;
        });
        await context.sync();
        for (const column of columns) {
          if (!column.isNullObject) {
            column.getDataBodyRange().format.wrapText = true;
          }
        }
        // Dòng tiêu đề cũng xuống dòng: cột người dùng tự thêm thường hẹp (đã thấy tiêu đề bị cắt trong PDF).
        table.getHeaderRowRange().format.wrapText = true;
        table.getHeaderRowRange().format.autofitRows();
        table.getDataBodyRange().format.autofitRows();
      }
      await context.sync();
    });
    return { printArea: state.quoteArea };
  }
}
