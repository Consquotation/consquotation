using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using ConsQuotation.Core.Exchange;
using Xunit;

namespace ConsQuotation.Tests
{
    /// <summary>
    /// Bộ ghi .xlsx khi xuất thư viện. Fixtures/web-export.xlsx do buildXlsx của bản web sinh từ
    /// web-export-sheets.json (chính nội dung ExportSheets đã đối chiếu ở N2).
    /// </summary>
    public class XlsxTests
    {
        private const string T = "2026-10-21T00:00:00.000Z";

        private static Dictionary<string, string> ReadParts(byte[] bytes)
        {
            using (var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read))
            {
                return zip.Entries.ToDictionary(e => e.FullName, e =>
                {
                    using (var reader = new StreamReader(e.Open(), Encoding.UTF8))
                    {
                        return reader.ReadToEnd();
                    }
                });
            }
        }

        [Fact]
        public void MoiPhanXml_GiongHetFileCuaBanWeb()
        {
            var sheets = Backup.ExportSheets(ExchangeTests.SampleLibrary(),
                new BackupMeta { ExportedAt = T, AppVersion = "1.13.1", LibraryName = "Thư viện thử" });
            var native = ReadParts(Xlsx.Build(sheets));
            var web = ReadParts(File.ReadAllBytes(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Fixtures", "web-export.xlsx")));
            Assert.Equal(web.Keys.OrderBy(k => k, StringComparer.Ordinal), native.Keys.OrderBy(k => k, StringComparer.Ordinal));
            foreach (var name in web.Keys)
            {
                var (a, b) = (web[name], native[name]);
                var at = Enumerable.Range(0, Math.Min(a.Length, b.Length)).FirstOrDefault(i => a[i] != b[i]);
                Assert.True(a == b, $"Phần {name} khác bản web tại ký tự {at}:\nweb:    {Around(a, at)}\nnative: {Around(b, at)}");
            }
        }

        private static string Around(string text, int at) => text.Substring(Math.Max(0, at - 60), Math.Min(140, text.Length - Math.Max(0, at - 60)));

        private static ExportSheet Sheet(params object?[][] rows) => new ExportSheet
        {
            Name = "A&B",
            Columns = new List<ExportColumn> { new ExportColumn(10, true), new ExportColumn(12, false) },
            Rows = rows.ToList(),
            HeaderRows = 1,
        };

        [Fact]
        public void Chu_GhiDangInlineString_KhongThanhCongThuc_GiuSo0Dau()
        {
            var xml = Xlsx.SheetXml(Sheet(new object?[] { "Mã", "Giá" }, new object?[] { "=SUM(A1)", 1850.5m }, new object?[] { "007", null }), true);
            Assert.Contains("<c r=\"A1\" s=\"2\" t=\"inlineStr\"><is><t xml:space=\"preserve\">Mã</t></is></c>", xml);
            Assert.Contains("<c r=\"A2\" s=\"1\" t=\"inlineStr\"><is><t xml:space=\"preserve\">=SUM(A1)</t></is></c>", xml);
            Assert.Contains("<c r=\"B2\"><v>1850.5</v></c>", xml);
            Assert.Contains("<t xml:space=\"preserve\">007</t>", xml);
            Assert.Contains("<pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/>", xml);
            Assert.DoesNotContain("r=\"B3\"", xml);
        }

        [Fact]
        public void KyTuDieuKhien_BiBo_KyTuDacBiet_DuocThoat()
        {
            var xml = Xlsx.SheetXml(Sheet(new object?[] { "a\u0001b<c>&d\te\n" }), false);
            Assert.Contains("<t xml:space=\"preserve\">ab&lt;c&gt;&amp;d\te\n</t>", xml);
            Assert.DoesNotContain("tabSelected", xml);
        }

        [Fact]
        public void ODaiQuaGioiHan_BaoDungSheetVaO()
        {
            var ex = Assert.Throws<XlsxCellTooLongException>(() => Xlsx.Build(new[] { Sheet(new object?[] { "x", new string('a', Xlsx.MaxCellText + 1) }) }));
            Assert.Equal($"Ô B1 ở sheet \"A&B\" dài hơn {Xlsx.MaxCellText} ký tự, Excel không chứa được.", ex.Message);
            Xlsx.Build(new[] { Sheet(new object?[] { new string('a', Xlsx.MaxCellText) }) });
        }

        [Fact]
        public void TenSheet_DuocThoatTrongWorkbookXml()
        {
            var workbook = Xlsx.Parts(new[] { Sheet() }).Single(p => p.Name == "xl/workbook.xml").Xml;
            Assert.Contains("<sheet name=\"A&amp;B\" sheetId=\"1\" r:id=\"rId1\"/>", workbook);
        }
    }
}
