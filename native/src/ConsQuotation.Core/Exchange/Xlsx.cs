using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using ConsQuotation.Core.Numbers;

namespace ConsQuotation.Core.Exchange
{
    /// <summary>Ô dài hơn giới hạn ký tự của Excel.</summary>
    public sealed class XlsxCellTooLongException : Exception
    {
        public XlsxCellTooLongException(string sheetName, string address)
            : base($"Ô {address} ở sheet \"{sheetName}\" dài hơn {Xlsx.MaxCellText} ký tự, Excel không chứa được.")
        {
        }
    }

    /// <summary>
    /// Ghi file .xlsx tối giản (SpreadsheetML) cho chức năng xuất thư viện (ADR-0004), chuyển từ src/shared/xlsx.ts:
    /// - Chữ ghi dạng inline string: không bao giờ bị hiểu là công thức, giữ số 0 đầu của mã.
    /// - Số ghi dạng số.
    /// - Cột "text" đặt định dạng @ để khi người dùng gõ thêm, Excel vẫn giữ dạng chữ.
    /// Các phần XML giống hệt bản web; chỉ cách nén zip khác.
    /// </summary>
    public static class Xlsx
    {
        public const int MaxCellText = 32_767;

        private const int StyleText = 1;
        private const int StyleHeader = 2;

        // Ký tự điều khiển không hợp lệ trong XML 1.0 (giữ tab, xuống dòng).
        private static readonly Regex InvalidXml = new Regex("[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]");

        private static string EscapeXml(string text) =>
            InvalidXml.Replace(text, "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

        private const string StylesXml =
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
            "<fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/><family val=\"2\"/></font>" +
            "<font><b/><sz val=\"11\"/><name val=\"Calibri\"/><family val=\"2\"/></font></fonts>" +
            "<fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills>" +
            "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>" +
            "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>" +
            "<cellXfs count=\"3\">" +
            "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>" +
            "<xf numFmtId=\"49\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/>" +
            "<xf numFmtId=\"49\" fontId=\"1\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\" applyFont=\"1\"/>" +
            "</cellXfs>" +
            "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>" +
            "</styleSheet>";

        /// <summary>Số như String(x) của JavaScript.</summary>
        private static string? NumberText(object value) => value switch
        {
            decimal d => DecimalMath.Normalize(d).ToString(CultureInfo.InvariantCulture),
            int i => i.ToString(CultureInfo.InvariantCulture),
            long l => l.ToString(CultureInfo.InvariantCulture),
            double d => double.IsNaN(d) || double.IsInfinity(d) ? null : d.ToString("R", CultureInfo.InvariantCulture),
            _ => null,
        };

        public static string SheetXml(ExportSheet sheet, bool selected)
        {
            var xml = new StringBuilder();
            xml.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
            xml.Append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">");
            xml.Append("<sheetViews><sheetView workbookViewId=\"0\"").Append(selected ? " tabSelected=\"1\"" : "").Append('>');
            if (sheet.HeaderRows > 0)
            {
                xml.Append($"<pane ySplit=\"{sheet.HeaderRows}\" topLeftCell=\"A{sheet.HeaderRows + 1}\" activePane=\"bottomLeft\" state=\"frozen\"/>");
            }
            xml.Append("</sheetView></sheetViews>");
            xml.Append("<sheetFormatPr defaultRowHeight=\"15\"/>");
            if (sheet.Columns.Count > 0)
            {
                xml.Append("<cols>");
                for (var i = 0; i < sheet.Columns.Count; i++)
                {
                    var c = sheet.Columns[i];
                    xml.Append($"<col min=\"{i + 1}\" max=\"{i + 1}\" width=\"{c.Width}\" customWidth=\"1\"")
                        .Append(c.Text ? $" style=\"{StyleText}\"" : "").Append("/>");
                }
                xml.Append("</cols>");
            }
            xml.Append("<sheetData>");
            for (var r = 0; r < sheet.Rows.Count; r++)
            {
                xml.Append($"<row r=\"{r + 1}\">");
                var row = sheet.Rows[r];
                for (var c = 0; c < row.Length; c++)
                {
                    var value = row[c];
                    if (value == null || value is string empty && empty == "")
                    {
                        continue;
                    }
                    var number = value is string ? null : NumberText(value);
                    if (value is not string && number == null)
                    {
                        continue;
                    }
                    var reference = $"{Source.ColumnToLetters(c)}{r + 1}";
                    var style = r < sheet.HeaderRows ? StyleHeader : c < sheet.Columns.Count && sheet.Columns[c].Text ? StyleText : 0;
                    var s = style != 0 ? $" s=\"{style}\"" : "";
                    if (number != null)
                    {
                        xml.Append($"<c r=\"{reference}\"{s}><v>{number}</v></c>");
                        continue;
                    }
                    var text = (string)value;
                    if (text.Length > MaxCellText)
                    {
                        throw new XlsxCellTooLongException(sheet.Name, reference);
                    }
                    xml.Append($"<c r=\"{reference}\"{s} t=\"inlineStr\"><is><t xml:space=\"preserve\">{EscapeXml(text)}</t></is></c>");
                }
                xml.Append("</row>");
            }
            xml.Append("</sheetData></worksheet>");
            return xml.ToString();
        }

        /// <summary>Tên và nội dung XML của từng phần trong gói, theo thứ tự ghi.</summary>
        public static List<(string Name, string Xml)> Parts(IReadOnlyList<ExportSheet> sheets)
        {
            if (sheets.Count == 0)
            {
                throw new ArgumentException("Workbook cần ít nhất một sheet.");
            }
            var contentTypes =
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
                string.Concat(sheets.Select((_, i) =>
                    $"<Override PartName=\"/xl/worksheets/sheet{i + 1}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>")) +
                "</Types>";
            var rootRels =
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
                "</Relationships>";
            var workbook =
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
                "<bookViews><workbookView/></bookViews><sheets>" +
                string.Concat(sheets.Select((s, i) => $"<sheet name=\"{EscapeXml(s.Name)}\" sheetId=\"{i + 1}\" r:id=\"rId{i + 1}\"/>")) +
                "</sheets></workbook>";
            var workbookRels =
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                string.Concat(sheets.Select((_, i) =>
                    $"<Relationship Id=\"rId{i + 1}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{i + 1}.xml\"/>")) +
                $"<Relationship Id=\"rId{sheets.Count + 1}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>" +
                "</Relationships>";
            var parts = new List<(string, string)>
            {
                ("[Content_Types].xml", contentTypes),
                ("_rels/.rels", rootRels),
                ("xl/workbook.xml", workbook),
                ("xl/_rels/workbook.xml.rels", workbookRels),
                ("xl/styles.xml", StylesXml),
            };
            parts.AddRange(sheets.Select((s, i) => ($"xl/worksheets/sheet{i + 1}.xml", SheetXml(s, i == 0))));
            return parts;
        }

        public static byte[] Build(IReadOnlyList<ExportSheet> sheets)
        {
            var parts = Parts(sheets);
            var utf8 = new UTF8Encoding(false);
            using (var buffer = new MemoryStream())
            {
                using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
                {
                    foreach (var (name, xml) in parts)
                    {
                        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
                        using (var stream = entry.Open())
                        {
                            var bytes = utf8.GetBytes(xml);
                            stream.Write(bytes, 0, bytes.Length);
                        }
                    }
                }
                return buffer.ToArray();
            }
        }
    }
}
