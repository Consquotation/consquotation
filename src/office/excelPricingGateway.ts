/* global Excel */

/**
 * Adapter Office.js cho PricingGateway (prompts/10). Cùng quy ước với excelWorkbookGateway:
 * không giữ proxy ra ngoài Excel.run, kiểm tra lại vùng đích trong cùng lượt ghi.
 */

import {
  AnalysisPrice,
  AnalysisWriteResult,
  PricingGateway,
  RoundingApplyResult,
  SummaryAreaCheck,
  SummaryState,
  UnitPriceFix,
} from "../application/pricingGateway";
import { TargetChangedError } from "../application/workbookGateway";
import {
  Adjustment,
  BASE_KIND_LABEL,
  BASE_METHOD_LABEL,
  KIND_LABELS,
  METHOD_LABELS,
  QUOTE_SUBTOTAL_LABEL,
  SUMMARY_FIRST_COLUMN_OFFSET,
  SUMMARY_HEADERS,
  SUMMARY_TOTAL_LABEL,
  parseSummaryRows,
  summaryAmountFormula,
  summaryRows,
  isSummaryTableName,
  quoteTableOfSummary,
  summaryTableName,
  summaryTotalFormula,
} from "../domain/pricing/adjustments";
import {
  ANALYSIS_COLUMNS,
  ANALYSIS_HEADER_ROW,
  ANALYSIS_NOTE,
  ANALYSIS_SHEET_NAME,
  ANALYSIS_TABLE_NAME,
  ANALYSIS_TITLE,
  analysisColumnIndex,
  analysisUnitPriceFormula,
  isAnalysisHeaders,
} from "../domain/pricing/analysis";
import { AnalysisLine, QuoteSnapshot, SheetRow, TableSnapshot } from "../domain/pricing/quoteCheck";
import { ALL_RULES, RoundingConfig, RoundingRule } from "../domain/pricing/rounding";
import { normalizeFormula, sameFormula } from "../domain/pricing/formulaText";
import { isQuoteTableName, uniqueSheetName } from "../domain/naming";
import {
  QUOTE_COLUMNS,
  TOTAL_LABEL,
  hasQuoteHeaders,
  quoteColumnFormulas,
} from "../domain/quoteTemplate";
import { cellAddress, rangeAddress, stripSheetName } from "../shared/a1";
import {
  PRICING_SETTINGS_KEY,
  bestEffort,
  findOccupied,
  hashString,
  isEmptyCell,
  loadSheetNames,
  readRounding,
} from "./excelHelpers";

const SUMMARY_WIDTH = SUMMARY_HEADERS.length;

function priceOf(value: unknown, type: string): AnalysisPrice {
  if (type === "Error") {
    return { kind: "error", error: String(value) };
  }
  if (typeof value === "number") {
    return { kind: "value", value };
  }
  return { kind: "missing" };
}

/** Định dạng số cho cột tiền theo quy tắc: có chữ số thập phân thì hiển thị đủ. */
function moneyFormat(rule: RoundingRule): string {
  return rule.mode !== "none" && rule.digits > 0 ? `#,##0.${"0".repeat(rule.digits)}` : "#,##0";
}

const OUR_MONEY_FORMAT = /^#,##0(\.0+)?$/;

/** Đơn giá công tác của khối có mã `code` (so như phép "=" của Excel: bỏ khoảng trắng, không phân biệt hoa thường). */
function findAnalysisPrice(
  headers: string[],
  values: unknown[][],
  valueTypes: unknown[][],
  code: string
): AnalysisPrice | null {
  const codeColumn = analysisColumnIndex(headers, "code");
  const priceColumn = analysisColumnIndex(headers, "unitPrice");
  const wanted = code.trim().toLocaleLowerCase("vi-VN");
  const row = values.findIndex(
    (r) =>
      String(r[codeColumn] ?? "")
        .trim()
        .toLocaleLowerCase("vi-VN") === wanted
  );
  return row < 0 ? null : priceOf(values[row][priceColumn], String(valueTypes[row][priceColumn]));
}

/**
 * Thay các ô có công thức MẪU (với bất kỳ quy tắc làm tròn nào) bằng công thức mẫu theo quy tắc mới;
 * ô có công thức khác mẫu (bị sửa tay) hoặc hằng số được giữ nguyên.
 * So với mọi biến thể chứ không chỉ quy tắc đã lưu, để lần áp dụng sau tự sửa được chỗ còn lệch.
 */
function rewriteColumn(
  formulas: unknown[][],
  numberFormats: unknown[][],
  build: (rule: RoundingRule) => string,
  newRule: RoundingRule,
  newFormat: string,
  ownTable: string
): { formulas: unknown[][] | null; formats: unknown[][]; updated: number; kept: number } {
  const target = build(newRule);
  const family = new Set(ALL_RULES.map((rule) => normalizeFormula(build(rule), ownTable)));
  const isOurs = (cell: unknown) =>
    typeof cell === "string" && family.has(normalizeFormula(cell, ownTable));
  let updated = 0;
  let kept = 0;
  const next = formulas.map((row) =>
    row.map((cell) => {
      if (isOurs(cell)) {
        if (!sameFormula(cell, target, ownTable)) {
          updated++;
        }
        return target;
      }
      if (typeof cell === "string" && cell.startsWith("=")) {
        kept++;
      }
      return cell;
    })
  );
  const formats = numberFormats.map((row, r) =>
    row.map((format, c) =>
      isOurs(formulas[r][c]) && OUR_MONEY_FORMAT.test(String(format)) ? newFormat : format
    )
  );
  return { formulas: updated > 0 ? next : null, formats, updated, kept };
}

function readRows(range: Excel.Range): SheetRow[] {
  return range.values.map((values, r) => ({
    values,
    formulas: range.formulas[r],
    types: range.valueTypes[r].map(String),
  }));
}

async function loadTableSnapshot(
  context: Excel.RequestContext,
  table: Excel.Table
): Promise<TableSnapshot> {
  table.load("name,showTotals");
  const sheet = table.worksheet;
  sheet.load("name");
  const header = table.getHeaderRowRange();
  header.load("values");
  const body = table.getDataBodyRange();
  body.load("values,formulas,valueTypes,rowIndex,columnIndex");
  await context.sync();
  let totals: SheetRow | null = null;
  if (table.showTotals) {
    const total = table.getTotalRowRange();
    total.load("values,formulas,valueTypes");
    await context.sync();
    totals = readRows(total)[0];
  }
  return {
    name: table.name,
    sheetName: sheet.name,
    headers: (header.values[0] ?? []).map((v) => String(v)),
    firstRowIndex: body.rowIndex,
    firstColumnIndex: body.columnIndex,
    rows: readRows(body),
    totals,
  };
}

interface SummaryArea {
  check: SummaryAreaCheck;
  /** Hàng/cột (từ 0) của ô tiêu đề bảng tổng hợp. */
  top: number;
  left: number;
  quote?: Excel.Table;
  existing?: Excel.Table;
}

async function inspectSummaryArea(
  context: Excel.RequestContext,
  quoteTableName: string,
  adjustmentCount: number
): Promise<SummaryArea> {
  const quote = context.workbook.tables.getItemOrNullObject(quoteTableName);
  quote.load("name,showTotals");
  const existing = context.workbook.tables.getItemOrNullObject(summaryTableName(quoteTableName));
  existing.load("name");
  await context.sync();
  if (quote.isNullObject) {
    return { check: { ok: false, reason: "tableMissing" }, top: 0, left: 0 };
  }
  const sheet = quote.worksheet;
  sheet.load("name");
  sheet.protection.load("protected");
  const header = quote.getHeaderRowRange();
  header.load("values");
  const full = quote.getRange();
  full.load("address,rowIndex,columnIndex,rowCount");
  let existingRange: Excel.Range | undefined;
  if (!existing.isNullObject) {
    existingRange = existing.getRange();
    existingRange.load("address,rowIndex,columnIndex,rowCount,formulas");
  }
  await context.sync();

  const fail = (reason: Exclude<SummaryAreaCheck, { ok: true }>["reason"]): SummaryArea => ({
    check: { ok: false, reason },
    top: 0,
    left: 0,
  });
  if (!hasQuoteHeaders((header.values[0] ?? []).map((v) => String(v)))) {
    return fail("headersChanged");
  }
  if (!quote.showTotals) {
    return fail("noTotals");
  }
  if (sheet.protection.protected) {
    return fail("protected");
  }

  const needed = 1 + (1 + adjustmentCount) + 1;
  const top = existingRange ? existingRange.rowIndex : full.rowIndex + full.rowCount + 1;
  const left = existingRange
    ? existingRange.columnIndex
    : full.columnIndex + SUMMARY_FIRST_COLUMN_OFFSET;
  const ownRows = existingRange ? existingRange.rowCount : 0;
  // Chỉ kiểm tra các hàng mới phải chiếm thêm (vùng của bảng tổng hợp cũ là của add-in).
  let formulas: unknown[][] = [];
  if (needed > ownRows) {
    const extra = sheet.getRangeByIndexes(top + ownRows, left, needed - ownRows, SUMMARY_WIDTH);
    extra.load("formulas");
    await context.sync();
    formulas = extra.formulas as unknown[][];
    const occupied = findOccupied(formulas, top + ownRows, left);
    if (occupied.count > 0) {
      return {
        check: {
          ok: false,
          reason: "occupied",
          address: rangeAddress(top, left, needed, SUMMARY_WIDTH),
          sample: occupied.sample,
        },
        top,
        left,
      };
    }
  }
  return {
    check: {
      ok: true,
      address: rangeAddress(top, left, needed, SUMMARY_WIDTH),
      fingerprint: hashString(
        `${full.address}|${existingRange?.address ?? ""}|${JSON.stringify(existingRange?.formulas ?? [])}|${JSON.stringify(formulas)}`
      ),
    },
    top,
    left,
    quote,
    existing: existing.isNullObject ? undefined : existing,
  };
}

export class ExcelPricingGateway implements PricingGateway {
  async readRounding(): Promise<RoundingConfig> {
    return Excel.run((context) => readRounding(context));
  }

  async applyRounding(config: RoundingConfig): Promise<RoundingApplyResult> {
    return Excel.run(async (context) => {
      const tables = context.workbook.tables;
      tables.load("items/name");
      await context.sync();

      interface Target {
        table: string;
        header: string;
        build: (rule: RoundingRule) => string;
        rule: RoundingRule;
      }
      const wanted: Target[] = [];
      for (const table of tables.items) {
        if (isQuoteTableName(table.name)) {
          wanted.push({
            table: table.name,
            header: "Thành tiền",
            build: (rule) => quoteColumnFormulas(table.name, rule).amount ?? "",
            rule: config.amount,
          });
        } else if (table.name === ANALYSIS_TABLE_NAME) {
          wanted.push({
            table: table.name,
            header: "Đơn giá công tác",
            build: (rule) => analysisUnitPriceFormula(rule),
            rule: config.unitPrice,
          });
        } else if (isSummaryTableName(table.name)) {
          const quoteName = quoteTableOfSummary(table.name);
          wanted.push({
            table: table.name,
            header: "Số tiền",
            build: (rule) => summaryAmountFormula(quoteName, rule),
            rule: config.adjustment,
          });
        }
      }
      const columns = wanted.map((w) => {
        const column = context.workbook.tables
          .getItem(w.table)
          .columns.getItemOrNullObject(w.header);
        column.load("name");
        return column;
      });
      await context.sync();
      const targets = wanted
        .map((w, i) => ({ ...w, column: columns[i] }))
        .filter((t) => !t.column.isNullObject)
        .map((t) => {
          const body = t.column.getDataBodyRange();
          body.load("formulas,numberFormat");
          return { ...t, body };
        });
      await context.sync();

      let updatedCells = 0;
      let keptCells = 0;
      for (const t of targets) {
        const result = rewriteColumn(
          t.body.formulas as unknown[][],
          t.body.numberFormat as unknown[][],
          t.build,
          t.rule,
          moneyFormat(t.rule),
          t.table
        );
        updatedCells += result.updated;
        keptCells += result.kept;
        if (result.formulas) {
          t.body.formulas = result.formulas as string[][];
          t.body.numberFormat = result.formats as string[][];
        }
      }
      context.workbook.settings.add(PRICING_SETTINGS_KEY, { schemaVersion: 1, rounding: config });
      await context.sync();
      return { updatedCells, keptCells };
    });
  }

  async findAnalysis(code: string): Promise<AnalysisPrice | null> {
    return Excel.run(async (context) => {
      const table = context.workbook.tables.getItemOrNullObject(ANALYSIS_TABLE_NAME);
      table.load("name");
      await context.sync();
      if (table.isNullObject) {
        return null;
      }
      const header = table.getHeaderRowRange();
      header.load("values");
      const body = table.getDataBodyRange();
      body.load("values,valueTypes");
      await context.sync();
      const headers = (header.values[0] ?? []).map((v) => String(v));
      if (!isAnalysisHeaders(headers)) {
        return null;
      }
      return findAnalysisPrice(headers, body.values, body.valueTypes, code);
    });
  }

  async writeAnalysis(code: string, rows: (string | number)[][]): Promise<AnalysisWriteResult> {
    return Excel.run(async (context) => {
      const rounding = await readRounding(context);
      const unitPriceIndex = ANALYSIS_COLUMNS.findIndex((c) => c.key === "unitPrice");
      // Công thức đơn giá công tác luôn theo quy tắc làm tròn hiện tại của workbook.
      const data = rows.map((row) =>
        row.map((cell, i) =>
          i === unitPriceIndex ? analysisUnitPriceFormula(rounding.unitPrice) : cell
        )
      );
      const table = context.workbook.tables.getItemOrNullObject(ANALYSIS_TABLE_NAME);
      table.load("name");
      await context.sync();

      if (table.isNullObject) {
        const sheetName = uniqueSheetName(ANALYSIS_SHEET_NAME, await loadSheetNames(context));
        const sheet = context.workbook.worksheets.add(sheetName);
        try {
          const title = sheet.getRange("A1");
          title.values = [[ANALYSIS_TITLE]];
          title.format.font.bold = true;
          title.format.font.size = 14;
          sheet.getRange("A2").values = [[ANALYSIS_NOTE]];
          const width = ANALYSIS_COLUMNS.length;
          sheet.getRangeByIndexes(ANALYSIS_HEADER_ROW, 0, 1, width).values = [
            ANALYSIS_COLUMNS.map((c) => c.header),
          ];
          // Tạo Table TRƯỚC khi ghi: công thức [@[…]] chỉ hợp lệ bên trong Table (ghi trước → Excel từ chối).
          const created = sheet.tables.add(
            sheet.getRangeByIndexes(ANALYSIS_HEADER_ROW, 0, 1 + data.length, width),
            true
          );
          created.name = ANALYSIS_TABLE_NAME;
          await context.sync();
          const body = created.getDataBodyRange();
          body.numberFormat = data.map(() =>
            ANALYSIS_COLUMNS.map((c) => c.numberFormat ?? "General")
          );
          body.values = data;
          ANALYSIS_COLUMNS.forEach((c, i) => {
            sheet.getRangeByIndexes(0, i, 1, 1).format.columnWidth = c.width;
          });
          const first = body.getCell(0, unitPriceIndex);
          first.load("values,valueTypes");
          await context.sync();
          return {
            status: "written",
            sheetName,
            price: priceOf(first.values[0][0], String(first.valueTypes[0][0])),
          };
        } catch (error) {
          // Không để lại sheet dở dang do chính add-in vừa tạo trong lượt này.
          await bestEffort(context, () => {
            context.workbook.worksheets.getItem(sheetName).delete();
          });
          throw error;
        }
      }

      const sheet = table.worksheet;
      sheet.load("name");
      sheet.protection.load("protected");
      const header = table.getHeaderRowRange();
      header.load("values");
      const body = table.getDataBodyRange();
      body.load("values,valueTypes,rowIndex,columnIndex,rowCount,columnCount");
      const used = sheet.getUsedRangeOrNullObject(true);
      used.load("rowIndex,rowCount");
      await context.sync();
      const headers = (header.values[0] ?? []).map((v) => String(v));
      if (!isAnalysisHeaders(headers)) {
        throw new Error(
          `Bảng ${ANALYSIS_TABLE_NAME} trên sheet "${sheet.name}" đã bị đổi tên hoặc xóa cột; add-in không ghi để tránh sai lệch.`
        );
      }
      const priceColumn = analysisColumnIndex(headers, "unitPrice");
      const existing = findAnalysisPrice(headers, body.values, body.valueTypes, code);
      if (existing) {
        return {
          status: "exists",
          sheetName: sheet.name,
          price: existing,
        };
      }
      if (sheet.protection.protected) {
        throw new Error(`Sheet "${sheet.name}" đang được bảo vệ; không thêm được phân tích.`);
      }
      const lastRow = body.rowIndex + body.rowCount - 1;
      const usedLast = used.isNullObject ? -1 : used.rowIndex + used.rowCount - 1;
      if (usedLast > lastRow) {
        const below = sheet.getRangeByIndexes(
          lastRow + 1,
          body.columnIndex,
          usedLast - lastRow,
          body.columnCount
        );
        below.load("formulas");
        await context.sync();
        const occupied = findOccupied(below.formulas as unknown[][], lastRow + 1, body.columnIndex);
        if (occupied.count > 0) {
          throw new Error(
            `Có dữ liệu ngay dưới bảng phân tích (sheet "${sheet.name}", ô ${occupied.sample.join(", ")}). Hãy di chuyển dữ liệu đó rồi thử lại.`
          );
        }
      }
      // Sắp theo thứ tự cột thực tế của bảng (người dùng có thể đổi thứ tự cột).
      const aligned = data.map((row) =>
        headers.map((h) => {
          const i = ANALYSIS_COLUMNS.findIndex((c) => c.header === h);
          return i >= 0 ? row[i] : "";
        })
      );
      table.rows.add(undefined, aligned);
      await context.sync();
      const first = sheet.getRangeByIndexes(lastRow + 1, body.columnIndex + priceColumn, 1, 1);
      first.load("values,valueTypes");
      await context.sync();
      return {
        status: "written",
        sheetName: sheet.name,
        price: priceOf(first.values[0][0], String(first.valueTypes[0][0])),
      };
    });
  }

  async readSummary(quoteTableName: string): Promise<SummaryState> {
    return Excel.run(async (context) => {
      const table = context.workbook.tables.getItemOrNullObject(summaryTableName(quoteTableName));
      table.load("name");
      await context.sync();
      if (table.isNullObject) {
        return { exists: false, adjustments: [], invalidRows: 0, address: "" };
      }
      const body = table.getDataBodyRange();
      body.load("values");
      const range = table.getRange();
      range.load("address");
      await context.sync();
      const parsed = parseSummaryRows(body.values);
      return {
        exists: true,
        adjustments: parsed.adjustments,
        invalidRows: parsed.invalidRows.length,
        address: stripSheetName(range.address),
      };
    });
  }

  async inspectSummary(quoteTableName: string, adjustmentCount: number): Promise<SummaryAreaCheck> {
    return Excel.run(
      async (context) => (await inspectSummaryArea(context, quoteTableName, adjustmentCount)).check
    );
  }

  async writeSummary(
    quoteTableName: string,
    adjustments: Adjustment[],
    fingerprint: string
  ): Promise<void> {
    await Excel.run(async (context) => {
      const area = await inspectSummaryArea(context, quoteTableName, adjustments.length);
      if (!area.check.ok || area.check.fingerprint !== fingerprint || !area.quote) {
        throw new TargetChangedError();
      }
      const rounding = await readRounding(context);
      const sheet = area.quote.worksheet;
      if (area.existing) {
        // Bảng tổng hợp là của add-in: xóa (kèm nội dung) rồi tạo lại đúng chỗ cũ.
        area.existing.delete();
        await context.sync();
      }
      const name = summaryTableName(quoteTableName);
      const rows = summaryRows(quoteTableName, adjustments, rounding.adjustment);
      sheet.getRangeByIndexes(area.top, area.left, 1, SUMMARY_WIDTH).values = [
        [...SUMMARY_HEADERS],
      ];
      // Tạo Table trước rồi mới ghi: công thức [@[…]] chỉ hợp lệ bên trong Table.
      const table = sheet.tables.add(
        sheet.getRangeByIndexes(area.top, area.left, 1 + rows.length, SUMMARY_WIDTH),
        true
      );
      table.name = name;
      await context.sync();
      const body = table.getDataBodyRange();
      const money = moneyFormat(rounding.adjustment);
      body.numberFormat = rows.map(() => [
        "General",
        "General",
        "General",
        "General",
        money,
        money,
      ]);
      body.values = rows;
      await context.sync();

      // Bật dòng tổng: Excel chèn một hàng và đẩy ô bên dưới (trong các cột của bảng) xuống 1 hàng;
      // hàng bị đẩy là hàng trống đã kiểm tra — xóa nó để dữ liệu bên dưới về đúng chỗ (như writeTemplate).
      table.showTotals = true;
      await context.sync();
      const totalRowIndex = area.top + 1 + rows.length;
      const pushed = sheet.getRangeByIndexes(totalRowIndex + 1, area.left, 1, SUMMARY_WIDTH);
      pushed.load("formulas");
      await context.sync();
      if (!(pushed.formulas as unknown[][]).every((row) => row.every(isEmptyCell))) {
        throw new Error(
          "Excel đã chèn dòng tổng nhưng hàng ngay bên dưới không trống như dự kiến; add-in dừng lại."
        );
      }
      pushed.delete(Excel.DeleteShiftDirection.up);
      const totals = table.getTotalRowRange();
      totals.formulas = [[SUMMARY_TOTAL_LABEL, "", "", "", summaryTotalFormula(name), ""]];
      totals.numberFormat = [["General", "General", "General", "General", money, "General"]];
      totals.format.font.bold = true;

      // Danh sách chọn để người dùng sửa trực tiếp trên sheet không gõ sai.
      const lists: [string, string[]][] = [
        ["Loại", [BASE_KIND_LABEL, ...Object.values(KIND_LABELS)]],
        ["Cách tính", [BASE_METHOD_LABEL, ...Object.values(METHOD_LABELS)]],
      ];
      for (const [header, options] of lists) {
        const column = table.columns.getItem(header).getDataBodyRange();
        column.dataValidation.clear();
        column.dataValidation.rule = { list: { inCellDropDown: true, source: options.join(",") } };
        column.dataValidation.errorAlert = {
          showAlert: true,
          style: "Stop",
          title: `${header} không hợp lệ`,
          message: `Chọn một trong: ${options.join(", ")}.`,
        };
      }

      // Tổng thật nằm ở bảng tổng hợp: đổi nhãn dòng tổng của báo giá thành "Cộng" (nếu chưa bị sửa).
      await relabelQuoteTotal(context, area.quote, TOTAL_LABEL, QUOTE_SUBTOTAL_LABEL);
      await context.sync();
    });
  }

  async removeSummary(quoteTableName: string): Promise<void> {
    await Excel.run(async (context) => {
      const table = context.workbook.tables.getItemOrNullObject(summaryTableName(quoteTableName));
      const quote = context.workbook.tables.getItemOrNullObject(quoteTableName);
      table.load("name");
      quote.load("name,showTotals");
      await context.sync();
      if (!table.isNullObject) {
        table.delete();
      }
      if (!quote.isNullObject && quote.showTotals) {
        await relabelQuoteTotal(context, quote, QUOTE_SUBTOTAL_LABEL, TOTAL_LABEL);
      }
      await context.sync();
    });
  }

  async readQuoteSnapshot(quoteTableName: string): Promise<QuoteSnapshot> {
    return Excel.run(async (context) => {
      const quoteTable = context.workbook.tables.getItem(quoteTableName);
      const summaryTable = context.workbook.tables.getItemOrNullObject(
        summaryTableName(quoteTableName)
      );
      summaryTable.load("name");
      const analysisTable = context.workbook.tables.getItemOrNullObject(ANALYSIS_TABLE_NAME);
      analysisTable.load("name");
      await context.sync();
      const rounding = await readRounding(context);
      const quote = await loadTableSnapshot(context, quoteTable);
      const summary = summaryTable.isNullObject
        ? null
        : await loadTableSnapshot(context, summaryTable);
      let analysis: AnalysisLine[] | null = null;
      if (!analysisTable.isNullObject) {
        const a = await loadTableSnapshot(context, analysisTable);
        const i = (key: Parameters<typeof analysisColumnIndex>[1]) =>
          analysisColumnIndex(a.headers, key);
        if (isAnalysisHeaders(a.headers)) {
          analysis = a.rows.map((row, r) => ({
            code: String(row.values[i("code")] ?? "").trim(),
            rowIndex: a.firstRowIndex + r,
            sheetName: a.sheetName,
            quantityBlank: isEmptyCell(row.values[i("quantity")]),
            priceBlank: isEmptyCell(row.values[i("price")]),
            unitPrice: row.values[i("unitPrice")],
            unitPriceType: row.types[i("unitPrice")],
            priceAddress: cellAddress(a.firstRowIndex + r, a.firstColumnIndex + i("price")),
          }));
        }
      }
      return { quote, summary, analysis, amountRule: rounding.amount };
    });
  }

  async setUnitPrices(fixes: UnitPriceFix[]): Promise<number> {
    if (fixes.length === 0) {
      return 0;
    }
    return Excel.run(async (context) => {
      const cells = fixes.map((fix) => {
        const range = context.workbook.worksheets.getItem(fix.sheetName).getRange(fix.address);
        range.load("values");
        return { fix, range };
      });
      await context.sync();
      if (cells.some(({ fix, range }) => range.values[0][0] !== fix.expected)) {
        throw new TargetChangedError();
      }
      for (const { fix, range } of cells) {
        range.values = [[fix.value]];
      }
      await context.sync();
      return cells.length;
    });
  }

  async goTo(sheetName: string, address: string): Promise<void> {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(sheetName);
      sheet.activate();
      sheet.getRange(address).select();
      await context.sync();
    });
  }
}

/** Đổi nhãn ô "Nội dung công việc" ở dòng tổng của bảng báo giá — chỉ khi đang đúng nhãn cũ. */
async function relabelQuoteTotal(
  context: Excel.RequestContext,
  quote: Excel.Table,
  from: string,
  to: string
): Promise<void> {
  const header = quote.getHeaderRowRange();
  header.load("values");
  const totals = quote.getTotalRowRange();
  totals.load("values");
  await context.sync();
  const column = (header.values[0] ?? [])
    .map(String)
    .indexOf(QUOTE_COLUMNS.find((c) => c.key === "description")!.header);
  const totalValues = totals.values;
  if (column >= 0 && totalValues[0][column] === from) {
    totals.getCell(0, column).values = [[to]];
  }
}
