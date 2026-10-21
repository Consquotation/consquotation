/**
 * Ghi file .xlsx tối giản (SpreadsheetML) cho chức năng xuất thư viện (ADR-0004).
 * - Chữ ghi dạng inline string: không bao giờ bị hiểu là công thức, giữ số 0 đầu của mã.
 * - Số ghi dạng số (đủ độ chính xác của double).
 * - Cột "text" đặt định dạng @ để khi người dùng gõ thêm, Excel vẫn giữ dạng chữ.
 */

import { columnToLetters } from "./a1";
import { createZip } from "./zip";

/* global TextEncoder */

export type XlsxCell = string | number | null;

export interface XlsxColumn {
  width: number;
  text?: boolean;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
  /** Số dòng tiêu đề đầu sheet: in đậm và cố định khi cuộn. */
  headerRows: number;
}

/** Giới hạn ký tự của một ô Excel. */
export const MAX_CELL_TEXT = 32_767;

export class XlsxCellTooLongError extends Error {
  constructor(
    readonly sheetName: string,
    readonly address: string
  ) {
    super(
      `Ô ${address} ở sheet "${sheetName}" dài hơn ${MAX_CELL_TEXT} ký tự, Excel không chứa được.`
    );
    this.name = "XlsxCellTooLongError";
  }
}

const STYLE_TEXT = 1;
const STYLE_HEADER = 2;

function escapeXml(text: string): string {
  return (
    text
      // Ký tự điều khiển không hợp lệ trong XML 1.0 (giữ tab, xuống dòng).
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

function sheetXml(sheet: XlsxSheet, selected: boolean): string {
  const cols = sheet.columns
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"${c.text ? ` style="${STYLE_TEXT}"` : ""}/>`
    )
    .join("");
  const freeze =
    sheet.headerRows > 0
      ? `<pane ySplit="${sheet.headerRows}" topLeftCell="A${sheet.headerRows + 1}" activePane="bottomLeft" state="frozen"/>`
      : "";
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (
            value === null ||
            value === "" ||
            (typeof value === "number" && !Number.isFinite(value))
          ) {
            return "";
          }
          const ref = `${columnToLetters(c)}${r + 1}`;
          const style =
            r < sheet.headerRows ? STYLE_HEADER : sheet.columns[c]?.text ? STYLE_TEXT : 0;
          const s = style ? ` s="${style}"` : "";
          if (typeof value === "number") {
            return `<c r="${ref}"${s}><v>${String(value)}</v></c>`;
          }
          if (value.length > MAX_CELL_TEXT) {
            throw new XlsxCellTooLongError(sheet.name, ref);
          }
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetViews><sheetView workbookViewId="0"${selected ? ` tabSelected="1"` : ""}>${freeze}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows}</sheetData>` +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

export function buildXlsx(sheets: readonly XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) {
    throw new Error("Workbook cần ít nhất một sheet.");
  }
  const encoder = new TextEncoder();
  const xml = (text: string) => encoder.encode(text);

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets
      .map(
        (_s, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("") +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView/></bookViews><sheets>` +
    sheets
      .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map(
        (_s, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return createZip([
    { name: "[Content_Types].xml", data: xml(contentTypes) },
    { name: "_rels/.rels", data: xml(rootRels) },
    { name: "xl/workbook.xml", data: xml(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: xml(workbookRels) },
    { name: "xl/styles.xml", data: xml(STYLES_XML) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: xml(sheetXml(s, i === 0)),
    })),
  ]);
}
