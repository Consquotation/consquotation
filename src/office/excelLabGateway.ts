/* global Excel */

/**
 * Adapter Office.js của khu vực Kiểm thử Excel: ghép các hàm của src/office/core/ thành từng bước
 * thử. Chỉ ghi vào sheet LAB_SHEET_NAME và bảng LAB_TABLE_NAME.
 */

import {
  ExcelLabGateway,
  LabActiveInfo,
  LabReadBack,
  LabSampleInspection,
  LabSheet,
} from "../application/excelLabGateway";
import { ExcelOpError } from "../domain/excel/errors";
import {
  LAB_EXPECTED_ERRORS,
  LAB_SHEET_NAME,
  LAB_TABLE_NAME,
  compareReadBack,
  labSampleAddress,
  labSampleMatrix,
} from "../domain/excel/labSample";
import { QUOTE_LINE_SCHEMA } from "../domain/excel/quoteLineSchema";
import { sameName } from "../domain/naming";
import { EXCEL_LAB_STRINGS } from "../shared/strings.excel.vi";
import {
  createTable,
  createWorksheet,
  findTable,
  findWorksheet,
  formatTableBySchema,
  inspectRange,
  listWorksheets,
  readActiveWorksheet,
  readRange,
  readTable,
  readWorkbookInfo,
  runExcel,
  writeRange,
} from "./core";

const MISMATCH_LIMIT = 8;

async function requireLabSheet(context: Excel.RequestContext): Promise<void> {
  if (!(await findWorksheet(context, LAB_SHEET_NAME))) {
    throw new ExcelOpError("sheetNotFound", EXCEL_LAB_STRINGS.missingSheet);
  }
}

export class ExcelLabGatewayImpl implements ExcelLabGateway {
  readActive(): Promise<LabActiveInfo> {
    return runExcel("kiểm thử: đọc sheet hiện hành", async (context) => {
      const workbook = await readWorkbookInfo(context);
      const sheet = await readActiveWorksheet(context);
      return {
        workbookName: workbook.name,
        readOnly: workbook.readOnly,
        structureProtected: workbook.structureProtected,
        sheetCount: workbook.sheetCount,
        activeSheet: sheet.name,
        sheetProtected: sheet.protected,
        usedAddress: sheet.usedAddress,
      };
    });
  }

  listSheets(): Promise<{ sheets: LabSheet[]; activeSheet: string }> {
    return runExcel("kiểm thử: liệt kê sheet", async (context) => {
      const sheets = await listWorksheets(context);
      const active = context.workbook.worksheets.getActiveWorksheet();
      active.load("name");
      await context.sync();
      return {
        sheets: sheets.map((s) => ({
          name: s.name,
          visibility: s.visibility,
          protected: s.protected,
        })),
        activeSheet: active.name,
      };
    });
  }

  ensureSheet(): Promise<{ name: string; created: boolean }> {
    return runExcel("kiểm thử: tạo sheet", async (context) => {
      const result = await createWorksheet(context, LAB_SHEET_NAME, "reuse");
      context.workbook.worksheets.getItem(result.name).activate();
      await context.sync();
      return result;
    });
  }

  inspectSample(): Promise<LabSampleInspection> {
    return runExcel("kiểm thử: kiểm tra vùng mẫu", async (context) => {
      await requireLabSheet(context);
      const inspection = await inspectRange(context, {
        sheetName: LAB_SHEET_NAME,
        address: labSampleAddress(),
      });
      return {
        address: inspection.address,
        occupiedCount: inspection.occupied.count,
        fingerprint: inspection.fingerprint,
        isTable: inspection.overlappingTables.some((t) => sameName(t, LAB_TABLE_NAME)),
      };
    });
  }

  writeSample(expectedFingerprint?: string): Promise<{ address: string }> {
    return runExcel("kiểm thử: ghi dữ liệu mẫu", async (context) => {
      await requireLabSheet(context);
      if (await findTable(context, LAB_TABLE_NAME)) {
        throw new ExcelOpError("unavailable", EXCEL_LAB_STRINGS.tableBlocksRewrite);
      }
      return writeRange(
        context,
        { sheetName: LAB_SHEET_NAME, address: labSampleAddress() },
        labSampleMatrix(),
        { mode: "formulas", expectedFingerprint }
      );
    });
  }

  createTable(): Promise<{ name: string; address: string; created: boolean }> {
    return runExcel("kiểm thử: tạo bảng", async (context) => {
      await requireLabSheet(context);
      if (await findTable(context, LAB_TABLE_NAME)) {
        const existing = await readTable(context, LAB_TABLE_NAME);
        return { name: existing.name, address: existing.address, created: false };
      }
      const address = labSampleAddress();
      const inspection = await inspectRange(context, { sheetName: LAB_SHEET_NAME, address });
      if (inspection.occupied.count === 0) {
        throw new ExcelOpError("invalidData", EXCEL_LAB_STRINGS.missingSample);
      }
      const table = await createTable(context, {
        sheetName: LAB_SHEET_NAME,
        address,
        name: LAB_TABLE_NAME,
      });
      return { name: table.name, address: table.address, created: true };
    });
  }

  formatTable(): Promise<{ name: string }> {
    return runExcel("kiểm thử: định dạng bảng", async (context) => {
      if (!(await findTable(context, LAB_TABLE_NAME))) {
        throw new ExcelOpError("tableNotFound", EXCEL_LAB_STRINGS.missingTable);
      }
      await formatTableBySchema(context, LAB_TABLE_NAME, QUOTE_LINE_SCHEMA);
      return { name: LAB_TABLE_NAME };
    });
  }

  readBack(): Promise<LabReadBack> {
    return runExcel("kiểm thử: đọc lại", async (context) => {
      await requireLabSheet(context);
      const table = (await findTable(context, LAB_TABLE_NAME))
        ? await readTable(context, LAB_TABLE_NAME)
        : null;
      // Có bảng: đọc cả bảng (kể cả khi người dùng thêm dòng). Chưa có: đọc vùng mẫu.
      const address = table ? table.address : labSampleAddress();
      const read = await readRange(context, { sheetName: LAB_SHEET_NAME, address });
      if (
        read.summary.formulaCells === 0 &&
        read.summary.emptyCells === read.rowCount * read.columnCount
      ) {
        throw new ExcelOpError("invalidData", EXCEL_LAB_STRINGS.missingSample);
      }
      const mismatches = compareReadBack(labSampleMatrix(), read.values, read.formulas, read);
      return {
        address: read.address,
        rowCount: read.rowCount,
        columnCount: read.columnCount,
        emptyCells: read.summary.emptyCells,
        formulaCells: read.summary.formulaCells,
        errorCount: read.summary.errorCount,
        expectedErrors: LAB_EXPECTED_ERRORS,
        mismatches: mismatches.slice(0, MISMATCH_LIMIT),
      };
    });
  }
}
