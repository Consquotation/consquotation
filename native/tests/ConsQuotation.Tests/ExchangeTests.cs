using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using ConsQuotation.Core.Exchange;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Storage;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Xunit;

namespace ConsQuotation.Tests
{
    /// <summary>
    /// Chuyển từ libraryExchange.test.ts và phần nhập của libraryV2.test.ts. Hai file trong Fixtures/ được
    /// sinh bằng chính mã bản web (toBackupJson, exportSheets) từ cùng thư viện thử ở SampleLibrary().
    /// </summary>
    public class ExchangeTests
    {
        private const string T = "2026-10-21T00:00:00.000Z";

        private static SourceTable CsvTable(string text, string label = "File \"x.csv\"") => SourceTable.FromCsv(label, Csv.Parse(text));

        /// <summary>Đọc bảng như bước giao diện: nhận diện tiêu đề, đoán loại, tự map.</summary>
        private static ImportDataset DatasetFromCsv(string text)
        {
            var table = CsvTable(text);
            var headerIndex = Source.DetectHeaderRow(table);
            var headers = Source.HeaderTexts(table, headerIndex);
            var kind = Source.GuessKind(headers) ?? throw new InvalidOperationException("không nhận ra loại");
            return Source.DatasetFromTable(table, headerIndex, kind, Source.AutoMap(kind, headers));
        }

        private static ImportAnalysis Analyze(IReadOnlyList<ImportDataset> datasets, LibrarySnapshot? library = null,
            DuplicateMode mode = DuplicateMode.Skip, string idPrefix = "new-")
        {
            var n = 0;
            return ImportAnalyzer.Analyze(datasets, library ?? new LibrarySnapshot(), new AnalyzeOptions(mode, T, () => $"{idPrefix}{++n}"));
        }

        private static string Lines(params string[] lines) => string.Join("\n", lines);

        private static string J(object value) => Json.Serialize(value, indented: false);

        private static JToken Parse(string json)
        {
            using (var reader = new JsonTextReader(new StringReader(json)) { FloatParseHandling = FloatParseHandling.Decimal, DateParseHandling = DateParseHandling.None })
            {
                return JToken.ReadFrom(reader);
            }
        }

        private static string Fixture(string name) =>
            File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Fixtures", name), Encoding.UTF8);

        internal static LibrarySnapshot SampleLibrary()
        {
            const string c = "2026-01-02T03:04:05.000Z";
            const string u = "2026-02-03T04:05:06.000Z";
            return new LibrarySnapshot
            {
                Categories = { new Category { Id = "c1", Name = "Móng", Notes = "nhóm thử", CreatedAt = c, UpdatedAt = u } },
                Suppliers = { new Supplier { Id = "s1", Name = "Công ty Thử A", ContactInfo = "0901 000 000", Notes = "", CreatedAt = c, UpdatedAt = u } },
                WorkItems =
                {
                    new WorkItem
                    {
                        Id = "w1", Code = "007", Name = "Bê tông lót móng \"đá 4x6\"", CategoryId = "c1", Unit = "m3", Description = "Dòng 1\nDòng 2",
                        PricingMethod = PricingMethod.Direct, UnitPrice = 1234567.891m, Currency = "VND", SupplierId = "s1", Source = "Báo giá NCC A",
                        EffectiveFrom = "2026-01-01", EffectiveTo = "2026-12-31", Notes = "=SUM(A1)", CreatedAt = c, UpdatedAt = u,
                    },
                    new WorkItem
                    {
                        Id = "w2", Code = "DD-01", Name = "Đào đất", CategoryId = null, Unit = "m3", Description = "", PricingMethod = PricingMethod.Direct,
                        UnitPrice = null, Currency = "", SupplierId = null, Source = "", EffectiveFrom = null, EffectiveTo = null, Notes = "", CreatedAt = c, UpdatedAt = u,
                    },
                },
                Resources =
                {
                    new Resource { Id = "r1", Code = "XM", Name = "Xi măng PCB40", Type = ResourceType.Material, CategoryId = "c1", Unit = "kg", Notes = "", CreatedAt = c, UpdatedAt = u },
                    new Resource { Id = "r2", Code = "NC3/7", Name = "Nhân công 3/7", Type = ResourceType.Labor, CategoryId = null, Unit = "công", Notes = "ghi chú", CreatedAt = c, UpdatedAt = u },
                },
                ResourcePrices =
                {
                    new ResourcePrice
                    {
                        Id = "p1", ResourceId = "r1", Price = 1.5m, Unit = "kg", Currency = "VND", EffectiveFrom = "2026-01-01", EffectiveTo = null,
                        SupplierId = "s1", Source = "TB giá Q1", Status = PriceStatus.Active, Notes = "", CreatedAt = c, UpdatedAt = u,
                    },
                    new ResourcePrice
                    {
                        Id = "p2", ResourceId = "r1", Price = 1.6m, Unit = "kg", Currency = "VND", EffectiveFrom = null, EffectiveTo = null,
                        SupplierId = null, Source = "", Status = PriceStatus.Inactive, Notes = "cũ", CreatedAt = c, UpdatedAt = u,
                    },
                },
                Norms =
                {
                    new Norm
                    {
                        Id = "n1", Code = "007", Name = "Bê tông lót móng \"đá 4x6\"", Unit = "m3", CategoryId = "c1", WorkItemId = "w1", Version = "1",
                        EffectiveFrom = "2026-01-01", SourceType = NormSourceType.Document, Source = "Tài liệu thử", SourceVerified = false,
                        Status = NormStatus.Approved, WasteIncluded = false, Notes = "", CreatedAt = c, UpdatedAt = u,
                    },
                },
                NormComponents =
                {
                    new NormComponent
                    {
                        Id = "nc1", NormId = "n1", ResourceId = "r1", ResourceCodeSnapshot = "XM", ResourceNameSnapshot = "Xi măng PCB40",
                        ResourceUnitSnapshot = "kg", ResourceTypeSnapshot = ResourceType.Material, Consumption = 0.000123m, WasteRate = 0.05m,
                        PriceId = "p1", SortOrder = 1, Notes = "", CreatedAt = c, UpdatedAt = u,
                    },
                    new NormComponent
                    {
                        Id = "nc2", NormId = "n1", ResourceId = "r2", ResourceCodeSnapshot = "NC3/7", ResourceNameSnapshot = "Nhân công 3/7",
                        ResourceUnitSnapshot = "công", ResourceTypeSnapshot = ResourceType.Labor, Consumption = 1.25m, WasteRate = 0,
                        PriceId = null, SortOrder = 2, Notes = "x", CreatedAt = c, UpdatedAt = u,
                    },
                },
            };
        }

        private static readonly BackupMeta Meta = new BackupMeta { ExportedAt = T, AppVersion = "1.13.1", LibraryName = "Thư viện thử" };

        // ---------- Đọc ô ----------

        [Fact]
        public void Ngay_IsoVaDdMmYyyy_TuChoiMoHoHoacKhongCoThat()
        {
            Assert.Equal("2026-06-30", Cells.ParseDateText("2026-06-30"));
            Assert.Equal("2026-06-30", Cells.ParseDateText("30/06/2026"));
            Assert.Equal("2026-07-01", Cells.ParseDateText("1/7/2026"));
            Assert.Null(Cells.ParseDateText("31/02/2026"));
            Assert.Null(Cells.ParseDateText("06/30/26"));
            Assert.Null(Cells.ParseDateText("2026/06/30"));
            Assert.False(Cells.ParseDate(new RawCell(46203d)).Ok);
            var dated = Cells.ParseDate(new RawCell(46203d, date: "2026-06-30"));
            Assert.True(dated.Ok);
            Assert.Equal("2026-06-30", dated.Value);
        }

        [Fact]
        public void SoNgayExcel_KeCaLoiNamNhuan1900()
        {
            Assert.Equal("1900-01-01", Cells.ExcelSerialToIso(1));
            Assert.Equal("1900-02-28", Cells.ExcelSerialToIso(59));
            Assert.Null(Cells.ExcelSerialToIso(60));
            Assert.Equal("1900-03-01", Cells.ExcelSerialToIso(61));
            Assert.Equal("2026-06-30", Cells.ExcelSerialToIso(46203.75));
            Assert.Null(Cells.ExcelSerialToIso(0));
        }

        [Fact]
        public void NhanDienDinhDangNgayCuaExcel()
        {
            Assert.True(Cells.IsDateNumberFormat("dd/mm/yyyy"));
            Assert.True(Cells.IsDateNumberFormat("m/d/yyyy"));
            Assert.False(Cells.IsDateNumberFormat("General"));
            Assert.False(Cells.IsDateNumberFormat("#,##0.00"));
            Assert.False(Cells.IsDateNumberFormat("#,##0 \"đ\""));
            Assert.False(Cells.IsDateNumberFormat("[$-409]#,##0"));
            Assert.False(Cells.IsDateNumberFormat("h:mm"));
        }

        [Fact]
        public void So_GiuThapPhan_KhongDoanDauPhanCachHangNghin()
        {
            Assert.Equal(1.5m, Cells.ParseNumber(new RawCell("1,5")).Value);
            Assert.Equal(0.000123m, Cells.ParseNumber(new RawCell("0.000123")).Value);
            Assert.Equal(1234567.891m, Cells.ParseNumber(new RawCell(1234567.891d)).Value);
            Assert.Equal(0.1m, Cells.ParseNumber(new RawCell(0.1d)).Value);
            Assert.False(Cells.ParseNumber(new RawCell("1.500.000")).Ok);
            Assert.False(Cells.ParseNumber(new RawCell("abc")).Ok);
            Assert.False(Cells.ParseNumber(new RawCell(true)).Ok);
            Assert.False(Cells.ParseNumber(new RawCell(double.NaN)).Ok);
            var blank = Cells.ParseNumber(new RawCell(""));
            Assert.True(blank.Ok);
            Assert.Null(blank.Value);
        }

        [Fact]
        public void Chu_MaSoTrongExcelLayDungChuHienThi_ChuanHoaNfc()
        {
            Assert.Equal("007", Cells.ParseText(new RawCell(7d, text: "007")));
            Assert.Equal("BT-01", Cells.ParseText(new RawCell("  BT-01 ")));
            Assert.Equal("Bê tông", Cells.ParseText(new RawCell("Bê tông")));
            Assert.Equal("1.5", Cells.ParseText(new RawCell(1.5d)));
            Assert.Equal("true", Cells.ParseText(new RawCell(true)));
        }

        [Fact]
        public void CoKhong_VaNhanTiengAnh()
        {
            Assert.Equal(true, Cells.ParseYesNo(new RawCell("co")).Value);
            Assert.Equal(false, Cells.ParseYesNo(new RawCell("Không")).Value);
            Assert.Equal(true, Cells.ParseYesNo(new RawCell(true)).Value);
            Assert.False(Cells.ParseYesNo(new RawCell("ừ")).Ok);
            Assert.Equal(ResourceType.Machine, Cells.ParseResourceType(new RawCell("machine")).Value);
            Assert.Equal(ResourceType.Machine, Cells.ParseResourceType(new RawCell("may thi cong")).Value);
            Assert.Equal("Loại \"Kim loại\" không hợp lệ. Dùng một trong: Vật liệu, Nhân công, Máy thi công, Khác.",
                Cells.ParseResourceType(new RawCell("Kim loại")).Message);
        }

        // ---------- File chữ / CSV ----------

        [Fact]
        public void Utf8VaUtf16_TuChoiBangMaKhac()
        {
            var ma = Encoding.UTF8.GetBytes("Mã");
            Assert.Equal("Mã", Csv.DecodeTextFile(new byte[] { 0xef, 0xbb, 0xbf }.Concat(ma).ToArray()).Text);
            Assert.Equal("Đơn giá", Csv.DecodeTextFile(Encoding.UTF8.GetBytes("Đơn giá")).Text);
            Assert.Equal("Mã", Csv.DecodeTextFile(new byte[] { 0xff, 0xfe }.Concat(Encoding.Unicode.GetBytes("Mã")).ToArray()).Text);
            Assert.Equal("Mã", Csv.DecodeTextFile(new byte[] { 0xfe, 0xff }.Concat(Encoding.BigEndianUnicode.GetBytes("Mã")).ToArray()).Text);
            // "Mã" theo Windows-1258/1252: 0x4D 0xE3, không phải UTF-8 hợp lệ.
            var bad = Csv.DecodeTextFile(new byte[] { 0x4d, 0xe3 });
            Assert.False(bad.Ok);
            Assert.Contains("CSV UTF-8", bad.Message);
        }

        [Fact]
        public void DauPhanCach_NhayKep_XuongDongTrongO_Crlf()
        {
            Assert.Equal(';', Csv.DetectDelimiter("a;b;c\n1;2;3"));
            Assert.Equal('\t', Csv.DetectDelimiter("a\tb\n"));
            Assert.Equal(';', Csv.DetectDelimiter("\"a,b\";c;d\n"));
            var rows = Csv.Parse("Mã;Tên;Đơn giá\r\nBT-01;\"Bê tông \"\"M200\"\"\r\nlót\";1,5\r\n");
            Assert.Equal(2, rows.Count);
            Assert.Equal(new[] { "Mã", "Tên", "Đơn giá" }, rows[0]);
            Assert.Equal(new[] { "BT-01", "Bê tông \"M200\"\r\nlót", "1,5" }, rows[1]);
            var sep = Csv.Parse("sep=;\na;b\n1;2");
            Assert.Equal(new[] { "a", "b" }, sep[0]);
            Assert.Equal(new[] { "1", "2" }, sep[1]);
        }

        // ---------- Tiêu đề, loại dữ liệu, map cột ----------

        [Fact]
        public void BoQuaDongTieuDePhu_DoanDungTungLoai()
        {
            var table = CsvTable("BẢNG GIÁ VẬT TƯ QUÝ 3,,,\n,,,\nma tai nguyen,DON GIA,Đơn vị tính,Tiền tệ\nXM,1500,kg,VND\n");
            Assert.Equal(2, Source.DetectHeaderRow(table));
            Assert.Equal(DatasetKind.ResourcePrices, Source.GuessKind(Source.HeaderTexts(table, 2)));
            Assert.Equal(DatasetKind.NormComponents, Source.GuessKind(new[] { "Mã công tác", "Mã tài nguyên", "Hao phí" }));
            Assert.Equal(DatasetKind.Norms, Source.GuessKind(new[] { "Mã định mức", "Tên công tác", "Đơn vị tính", "Phiên bản" }));
            Assert.Equal(DatasetKind.Resources, Source.GuessKind(new[] { "Mã tài nguyên", "Tên tài nguyên", "Đơn vị tính" }));
            Assert.Equal(DatasetKind.WorkItems, Source.GuessKind(new[] { "Mã công tác", "Tên công tác", "ĐVT" }));
            Assert.Null(Source.GuessKind(new[] { "Cột 1", "Cột 2" }));
        }

        [Fact]
        public void TieuDeCoDauSao_KhacHoaThuong_BiDanh()
        {
            var map = Source.AutoMap(DatasetKind.WorkItems, new[] { "Mã công tác *", "Nội dung công việc", "ĐVT", "Giá" });
            Assert.Equal(0, map["code"]);
            Assert.Equal(1, map["name"]);
            Assert.Equal(2, map["unit"]);
            Assert.Equal(3, map["unitPrice"]);
            Assert.Null(map["category"]);
        }

        [Fact]
        public void FileMauCongBoTrongDocsTemplates_KhopSchema()
        {
            var files = new Dictionary<DatasetKind, string>
            {
                [DatasetKind.Categories] = "nhom.csv",
                [DatasetKind.Suppliers] = "nha-cung-cap.csv",
                [DatasetKind.NormComponents] = "thanh-phan-dinh-muc.csv",
                [DatasetKind.WorkItems] = "cong-tac.csv",
                [DatasetKind.Resources] = "tai-nguyen.csv",
                [DatasetKind.ResourcePrices] = "gia-tai-nguyen.csv",
                [DatasetKind.Norms] = "dinh-muc.csv",
            };
            foreach (var kind in ExchangeSchema.Kinds)
            {
                var bytes = File.ReadAllBytes(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Templates", files[kind]));
                var decoded = Csv.DecodeTextFile(bytes);
                Assert.True(decoded.Ok);
                Assert.Equal(ExchangeSchema.CsvTemplate(kind).TrimEnd(), decoded.Text!.TrimEnd());
            }
        }

        [Fact]
        public void FileMauCsv_ChuaDungTieuDeChuan()
        {
            foreach (var kind in ExchangeSchema.Kinds)
            {
                var headers = Csv.Parse(ExchangeSchema.CsvTemplate(kind))[0];
                Assert.Equal(kind, Source.GuessKind(headers));
                Assert.All(Source.AutoMap(kind, headers).Values, v => Assert.NotNull(v));
            }
        }

        [Fact]
        public void ChuCotExcel()
        {
            Assert.Equal("A", Source.ColumnToLetters(0));
            Assert.Equal("Z", Source.ColumnToLetters(25));
            Assert.Equal("AA", Source.ColumnToLetters(26));
            Assert.Equal("XFD", Source.ColumnToLetters(16383));
        }

        // ---------- Kiểm tra dữ liệu nhập (prompts/09) ----------

        [Fact]
        public void FileRong_ChiCoTieuDe_KhongCoGiDeNhap()
        {
            Assert.Equal(-1, Source.DetectHeaderRow(CsvTable("")));
            Assert.Equal(-1, Source.DetectHeaderRow(CsvTable(",,\n,,\n")));
            var a = Analyze(new[] { DatasetFromCsv("Mã công tác,Tên công tác,Đơn vị tính\n") });
            Assert.Equal(0, a.ChangeCount);
            Assert.Equal(0, a.Summaries[0].Total);
        }

        [Fact]
        public void ThieuCotBatBuoc_ChanCaLanNhap()
        {
            var table = CsvTable("Mã công tác,Tên,Giá\nBT-01,Bê tông,100\n");
            var ds = Source.DatasetFromTable(table, 0, DatasetKind.WorkItems, Source.AutoMap(DatasetKind.WorkItems, Source.HeaderTexts(table, 0)));
            var a = Analyze(new[] { ds });
            Assert.Contains("Thiếu cột bắt buộc: Tên công tác, Đơn vị tính", string.Join(",", a.Problems));
            Assert.Equal(0, a.ChangeCount);
        }

        [Fact]
        public void DuLieuThieu_SoNgaySai_BaoDungDongVaCot_KhongSuyDien()
        {
            var ds = DatasetFromCsv(Lines(
                "Mã công tác,Tên công tác,Đơn vị tính,Đơn giá,Tiền tệ,Hiệu lực từ ngày,Hiệu lực đến ngày",
                "BT-01,Bê tông,m3,\"1500000,5\",VND,01/01/2026,31/12/2026",
                "BT-02,Bê tông 2,,100,VND,,",
                "BT-03,Bê tông 3,m3,1.500.000,VND,,",
                "BT-04,Bê tông 4,m3,100,,,",
                "BT-05,Bê tông 5,m3,,,31/02/2026,",
                "BT-06,Bê tông 6,m3,,,2026-12-31,2026-01-01",
                ",,,,,,",
                "BT-07,Bê tông 7,m3,,,,"));
            var a = Analyze(new[] { ds });
            var s = a.Summaries[0];
            Assert.Equal((8, 2, 5, 1), (s.Total, s.Added, s.Errors, s.Empty));
            List<string> Msg(int row) => a.Issues.Where(i => i.RowLabel == $"Dòng {row}").Select(i => $"{i.ColumnLabel}: {i.Message}").ToList();
            Assert.Equal(new[] { "cột C (Đơn vị tính): Thiếu đơn vị tính." }, Msg(3));
            Assert.StartsWith("cột D (Đơn giá): Số không hợp lệ", Msg(4)[0]);
            Assert.Equal(new[] { "cột E (Tiền tệ): Có đơn giá nhưng thiếu tiền tệ." }, Msg(5));
            Assert.StartsWith("cột F (Hiệu lực từ ngày): Ngày không hợp lệ", Msg(6)[0]);
            Assert.StartsWith("cột G (Hiệu lực đến ngày): Ngày kết thúc", Msg(7)[0]);
            var bt1 = a.Changes.WorkItems.Single(w => w.Code == "BT-01");
            Assert.Equal((1500000.5m, "2026-01-01", "2026-12-31"), (bt1.UnitPrice!.Value, bt1.EffectiveFrom, bt1.EffectiveTo));
            // Không có đơn giá → để trống (null), không phải 0; không tự điền tiền tệ.
            var bt7 = a.Changes.WorkItems.Single(w => w.Code == "BT-07");
            Assert.Null(bt7.UnitPrice);
            Assert.Equal("", bt7.Currency);
        }

        [Fact]
        public void MaTrungTrongFile_DongSauBaoLoi_TroVeDongDau()
        {
            var a = Analyze(new[] { DatasetFromCsv("Mã công tác,Tên công tác,Đơn vị tính\nBT-01,A,m3\n bt-01 ,B,m3\n") });
            Assert.Equal((1, 1), (a.Summaries[0].Added, a.Summaries[0].Errors));
            Assert.Equal("Dòng 3", a.Issues[0].RowLabel);
            Assert.Equal("Mã \"bt-01\" trùng với dòng 2 trong file.", a.Issues[0].Message);
        }

        [Fact]
        public void TrungVoiThuVien_MacDinhBoQua_CapNhatChiDoiCotCoTrongFile()
        {
            var lib = SampleLibrary();
            var ds = DatasetFromCsv("Mã công tác,Tên công tác,Đơn vị tính,Đơn giá,Tiền tệ\n007,Tên mới,m3,999,VND\nMOI-01,Mới,m2,,\n");
            var skip = Analyze(new[] { ds }, lib, DuplicateMode.Skip);
            Assert.Equal((1, 1, 0), (skip.Summaries[0].Added, skip.Summaries[0].Duplicates, skip.Summaries[0].Updated));
            Assert.Equal(new[] { "MOI-01" }, skip.Changes.WorkItems.Select(w => w.Code));

            var update = Analyze(new[] { ds }, lib, DuplicateMode.Update);
            Assert.Equal((1, 1, 1), (update.Summaries[0].Added, update.Summaries[0].Duplicates, update.Summaries[0].Updated));
            var updated = update.Changes.WorkItems.Single(w => w.Id == "w1");
            Assert.Equal(("Tên mới", 999m, "007"), (updated.Name, updated.UnitPrice!.Value, updated.Code));
            // Cột không có trong file giữ nguyên.
            Assert.Equal(("c1", "s1", "Báo giá NCC A", "=SUM(A1)", "2026-12-31"),
                (updated.CategoryId, updated.SupplierId, updated.Source, updated.Notes, updated.EffectiveTo));
            Assert.Equal(lib.WorkItems[0].CreatedAt, updated.CreatedAt);
            Assert.Equal(T, updated.UpdatedAt);
            // Thư viện đầu vào không bị sửa.
            Assert.Equal("Bê tông lót móng \"đá 4x6\"", lib.WorkItems[0].Name);
        }

        [Fact]
        public void Gia_KhongSuyDonVi_ThamChieuTaiNguyen_GiaGiongHetLaTrung()
        {
            var lib = SampleLibrary();
            var resources = DatasetFromCsv("Mã tài nguyên,Tên tài nguyên,Loại,Đơn vị tính\nCAT,Cát vàng,vat lieu,m3\nX,Lạ,Kim loại,kg\n");
            var prices = DatasetFromCsv(Lines(
                "Mã tài nguyên,Đơn giá,Đơn vị tính,Tiền tệ,Hiệu lực từ ngày,Nguồn,Trạng thái",
                "CAT,250000,m3,VND,,,",
                "CAT,260000,,VND,,,",
                "KHONGCO,1,kg,VND,,,",
                "xm,1.5,KG,vnd,2026-01-01,TB giá Q1,Ngưng dùng",
                "CAT,250000,m3,VND,,,"));
            var a = Analyze(new[] { prices, resources }, lib);
            var res = a.Summaries.Single(s => s.Kind == DatasetKind.Resources);
            Assert.Equal((1, 1), (res.Added, res.Errors));
            Assert.Contains("Loại \"Kim loại\" không hợp lệ", a.Issues.First(i => i.RowLabel == "Dòng 3").Message);
            var ps = a.Summaries.Single(s => s.Kind == DatasetKind.ResourcePrices);
            Assert.Equal((5, 1, 1, 3), (ps.Total, ps.Added, ps.Duplicates, ps.Errors));
            var messages = a.Issues.Where(i => i.ColumnLabel != null && i.ColumnLabel.StartsWith("cột")).Select(i => i.Message).ToList();
            Assert.Contains("Thiếu đơn vị tính của giá.", messages);
            Assert.Contains("Không có tài nguyên mã \"KHONGCO\" trong thư viện hoặc trong file.", messages);
            Assert.Contains("Giá trùng với dòng 2 trong file.", messages);
            Assert.Single(a.Changes.ResourcePrices);
            Assert.Equal(a.Changes.Resources[0].Id, a.Changes.ResourcePrices[0].ResourceId);

            var upd = Analyze(new[] { prices, resources }, lib, DuplicateMode.Update);
            var p1 = upd.Changes.ResourcePrices.Single(p => p.Id == "p1");
            Assert.Equal((PriceStatus.Inactive, 1.5m), (p1.Status, p1.Price));
        }

        [Fact]
        public void BangDinhMucKieuCu_TaoDinhMucV1TuCongTac()
        {
            var lib = SampleLibrary();
            var ds = DatasetFromCsv(Lines("Mã công tác,Mã tài nguyên,Hao phí", "DD-01,XM,\"0,5\"", "DD-01,NC3/7,0", "DD-01,xm,1", "007,XM,2", "ZZ,XM,1"));
            var a = Analyze(new[] { ds }, lib);
            var s = a.Summaries[0];
            Assert.Equal((DatasetKind.NormComponents, 1, 1, 3), (s.Kind, s.Added, s.Duplicates, s.Errors));
            var norm = a.Changes.Norms[0];
            Assert.Equal(("DD-01", "1", "w2", NormStatus.Approved), (norm.Code, norm.Version, norm.WorkItemId, norm.Status));
            var comp = a.Changes.NormComponents[0];
            Assert.Equal((norm.Id, "r1", 0.5m, 0m), (comp.NormId, comp.ResourceId, comp.Consumption, comp.WasteRate));
            Assert.Equal(new[] { "DD-01 v1" }, a.CreatedFromReferences.Norms);
            Assert.Equal(new[]
            {
                "Hao phí phải lớn hơn 0.",
                "Thành phần (định mức, tài nguyên) trùng với dòng 2 trong file.",
                "Không có định mức hoặc công tác mã \"ZZ\" trong thư viện hoặc trong file.",
            }, a.Issues.Select(i => i.Message));
        }

        [Fact]
        public void DinhMucVaThanhPhanV3_KhongThemThanhPhanVaoPhienBanDangDung()
        {
            var lib = SampleLibrary();
            var norms = DatasetFromCsv(Lines(
                "Mã định mức,Tên công tác,Đơn vị tính,Phiên bản,Trạng thái,Loại nguồn,Nguồn,Đã đối chiếu nguồn",
                "DM-01,Thử,m3,2,Nháp,Tài liệu,TL-01,Có",
                "007,Trùng mã đang dùng,m3,2,Đang dùng,,,"));
            var parts = DatasetFromCsv(Lines(
                "Mã định mức,Phiên bản,Mã tài nguyên,Hao phí,Hao hụt (%)",
                "DM-01,2,XM,2,5",
                "007,1,THU-R,1,",
                "007,1,NC3/7,1,",
                "DM-01,9,XM,1,"));
            var resources = DatasetFromCsv(Lines("Mã tài nguyên,Tên tài nguyên,Đơn vị tính", "THU-R,Thử,kg"));
            var a = Analyze(new[] { norms, parts, resources }, lib);
            var n = Assert.Single(a.Changes.Norms);
            Assert.Equal(("DM-01", "2", NormStatus.Draft, NormSourceType.Document, true), (n.Code, n.Version, n.Status, n.SourceType, n.SourceVerified));
            var c = Assert.Single(a.Changes.NormComponents);
            Assert.Equal((2m, 0.05m, "XM"), (c.Consumption, c.WasteRate, c.ResourceCodeSnapshot));
            var messages = string.Join(" | ", a.Issues.Select(i => i.Message));
            Assert.Contains("đã có phiên bản đang dùng", messages);
            Assert.Contains("không còn là nháp", messages);
            var s = a.Summaries.Single(x => x.Kind == DatasetKind.NormComponents);
            Assert.Equal((1, 1, 2), (s.Added, s.Duplicates, s.Errors));
            Assert.Contains("Không có định mức \"DM-01\" phiên bản \"9\"", messages);
        }

        [Fact]
        public void CapNhatDinhMucDangDung_KhongChuyenLienKetSangCongTacDaCoDinhMucDangDung()
        {
            var lib = SampleLibrary();
            var ds = DatasetFromCsv(Lines(
                "Mã định mức,Tên công tác,Đơn vị tính,Phiên bản,Trạng thái,Mã công tác liên kết",
                "DM-02,Đào đất thử,m3,1,Đang dùng,DD-01",
                "007,Bê tông lót móng,m3,1,,DD-01"));
            var a = Analyze(new[] { ds }, lib, DuplicateMode.Update);
            Assert.Equal(new[] { "DM-02" }, a.Changes.Norms.Select(n => n.Code));
            Assert.Equal(new[] { "Công tác liên kết đã dùng định mức \"DM-02\" phiên bản 1." }, a.Issues.Select(i => i.Message));
            Assert.Equal((1, 0, 1), (a.Summaries[0].Added, a.Summaries[0].Updated, a.Summaries[0].Errors));

            var relink = Analyze(new[]
            {
                DatasetFromCsv(Lines("Mã định mức,Tên công tác,Đơn vị tính,Phiên bản,Mã công tác liên kết", "007,Bê tông lót móng,m3,1,DD-01")),
            }, lib, DuplicateMode.Update);
            var r = relink.Changes.Norms[0];
            Assert.Equal(("n1", "w2", NormStatus.Approved), (r.Id, r.WorkItemId, r.Status));
        }

        [Fact]
        public void ThuTuKhongNguyen_BaoLoi()
        {
            var lib = SampleLibrary();
            var a = Analyze(new[] { DatasetFromCsv(Lines("Mã định mức,Phiên bản,Mã tài nguyên,Hao phí,Thứ tự", "007,1,XM,1,\"1,5\"")) }, lib);
            Assert.Equal("Thứ tự phải là số nguyên.", a.Issues.Single().Message);
        }

        // ---------- Cột Nhóm / Nhà cung cấp (libraryV2.test.ts) ----------

        private static ImportAnalysis Run(string text, LibrarySnapshot? library = null, DuplicateMode mode = DuplicateMode.Skip) =>
            Analyze(new[] { DatasetFromCsv(text) }, library, mode, "n");

        private static WorkItem Item(string id, string code, string name, string? supplierId = null) => new WorkItem
        {
            Id = id, Code = code, Name = name, Unit = "m3", Currency = "VND", SupplierId = supplierId, CreatedAt = T, UpdatedAt = T,
        };

        [Fact]
        public void TaoNhomNhaCungCapChuaCo_ChiChoDongHopLe_GopTenKhacHoaThuong()
        {
            var a = Run("Mã công tác,Tên công tác,Nhóm,Đơn vị tính,Nhà cung cấp\nT1,Thử 1,Cây xanh,cây,NCC Thử\nT2,Thử 2,cây  xanh,cây,\nT3,,Nhóm từ dòng lỗi,cây,NCC lỗi\n");
            Assert.Equal((2, 1), (a.Summaries[0].Added, a.Summaries[0].Errors));
            Assert.Equal(new[] { "Cây xanh" }, a.CreatedFromReferences.Categories);
            Assert.Equal(new[] { "NCC Thử" }, a.CreatedFromReferences.Suppliers);
            Assert.Empty(a.CreatedFromReferences.Norms);
            Assert.All(a.Changes.WorkItems, w => Assert.Equal(a.Changes.Categories[0].Id, w.CategoryId));
            Assert.Null(a.Changes.WorkItems[1].SupplierId);
        }

        [Fact]
        public void DongTrungBiBoQua_KhongTaoNhomMoi()
        {
            var lib = new LibrarySnapshot { WorkItems = { Item("w", "T1", "Cũ") } };
            var a = Run("Mã công tác,Tên công tác,Nhóm,Đơn vị tính\nT1,Mới,Nhóm mới,m3\n", lib);
            Assert.Equal((1, 0), (a.Summaries[0].Duplicates, a.Summaries[0].Added));
            Assert.Empty(a.Changes.Categories);
        }

        [Fact]
        public void NhomDaCoDuocDungLai_CapNhatChiDoiCotCoTrongFile()
        {
            var lib = new LibrarySnapshot
            {
                Categories = { new Category { Id = "c", Name = "Móng", CreatedAt = T, UpdatedAt = T } },
                WorkItems = { Item("w", "T1", "Cũ", supplierId: "s") },
            };
            var a = Run("Mã công tác,Tên công tác,Nhóm,Đơn vị tính\nT1,Mới,móng,m3\n", lib, DuplicateMode.Update);
            Assert.Empty(a.Changes.Categories);
            var w = a.Changes.WorkItems[0];
            Assert.Equal(("w", "Mới", "c", "s"), (w.Id, w.Name, w.CategoryId, w.SupplierId));
        }

        [Fact]
        public void NhapDanhSachNhomVaNhaCungCap_TrungTrongFileBaoLoi()
        {
            var cats = Run("Tên nhóm,Ghi chú\nVật liệu,\nvật liệu,\nNhân công,thử\n");
            Assert.Equal((DatasetKind.Categories, 2, 1), (cats.Summaries[0].Kind, cats.Summaries[0].Added, cats.Summaries[0].Errors));
            var sups = Run("Tên nhà cung cấp,Liên hệ\nNCC Thử,0901\n");
            Assert.Equal(("NCC Thử", "0901"), (sups.Changes.Suppliers[0].Name, sups.Changes.Suppliers[0].ContactInfo));
        }

        [Fact]
        public void SaoLuuV1_NhomDangChuThanhDanhMuc()
        {
            var v1 = "{\"format\":\"consquotation-library\",\"schemaVersion\":1,\"data\":{\"workItems\":[{\"id\":\"w\",\"code\":\"A\",\"name\":\"A\",\"group\":\"Móng\",\"unit\":\"m3\",\"unitPrice\":1,\"currency\":\"VND\",\"createdAt\":\"" + T + "\",\"updatedAt\":\"" + T + "\"}]}}";
            var parsed = Backup.ParseBackupJson(v1);
            Assert.True(parsed.Ok, parsed.Message);
            var a = ImportAnalyzer.Analyze(parsed.Datasets, new LibrarySnapshot(), new AnalyzeOptions(DuplicateMode.Skip, T, () => "c-new"));
            Assert.Empty(a.Issues);
            Assert.Equal(new[] { "Móng" }, a.Changes.Categories.Select(c => c.Name));
            var w = a.Changes.WorkItems[0];
            Assert.Equal(("w", "c-new", (string?)null, 1m), (w.Id, w.CategoryId, w.SupplierId, w.UnitPrice!.Value));
        }

        [Fact]
        public void SaoLuuV2_IdNhomKhongCoTrongFileBiBaoLoi()
        {
            var v2 = "{\"format\":\"consquotation-library\",\"schemaVersion\":2,\"data\":{\"categories\":[],\"workItems\":[{\"id\":\"w\",\"code\":\"A\",\"name\":\"A\",\"categoryId\":\"mat\",\"unit\":\"m3\"}]}}";
            var parsed = Backup.ParseBackupJson(v2);
            Assert.True(parsed.Ok);
            var a = ImportAnalyzer.Analyze(parsed.Datasets, new LibrarySnapshot(), new AnalyzeOptions(DuplicateMode.Skip, T, () => "x"));
            Assert.Contains("Tham chiếu nhóm id \"mat\" không có trong file.", a.Issues.Select(i => i.Message));
        }

        [Fact]
        public void KhoiPhucVaoThuVienDaCoNhomCungTen_DungLaiNhomDo()
        {
            var fileLib = new LibrarySnapshot
            {
                Categories = { new Category { Id = "c-file", Name = "Móng", CreatedAt = T, UpdatedAt = T } },
                WorkItems = { Item("w-file", "A", "A") },
            };
            fileLib.WorkItems[0].CategoryId = "c-file";
            var parsed = Backup.ParseBackupJson(Backup.ToBackupJson(fileLib, new BackupMeta { ExportedAt = T, AppVersion = "x", LibraryName = "Thử" }));
            Assert.True(parsed.Ok);
            var current = new LibrarySnapshot { Categories = { new Category { Id = "c-here", Name = "móng", CreatedAt = T, UpdatedAt = T } } };
            var a = ImportAnalyzer.Analyze(parsed.Datasets, current, new AnalyzeOptions(DuplicateMode.Skip, T, () => "x"));
            Assert.Empty(a.Changes.Categories);
            Assert.Equal("c-here", a.Changes.WorkItems[0].CategoryId);
        }

        // ---------- Sao lưu JSON ----------

        [Fact]
        public void SaoLuuJson_GiongHetFileCuaBanWeb()
        {
            var native = Parse(Backup.ToBackupJson(SampleLibrary(), Meta));
            var web = Parse(Fixture("web-backup-v3.json"));
            Assert.True(JToken.DeepEquals(web, native), "Khác bản web:\n" + native.ToString(Formatting.Indented));
            // Thứ tự khóa cũng giống bản web.
            Assert.Equal(new[] { "format", "schemaVersion", "exportedAt", "appVersion", "library", "data" }, ((JObject)native).Properties().Select(p => p.Name));
            Assert.Equal(new[] { "categories", "suppliers", "workItems", "resources", "resourcePrices", "norms", "normComponents" },
                ((JObject)native["data"]!).Properties().Select(p => p.Name));
        }

        [Fact]
        public void DocFileSaoLuuCuaBanWeb_VaoThuVienTrong_GiuNguyenMoiBanGhi()
        {
            var parsed = Backup.ParseBackupJson(Fixture("web-backup-v3.json"));
            Assert.True(parsed.Ok, parsed.Message);
            Assert.Equal((ExchangeSchema.Version, T, "1.13.1", "Thư viện thử"),
                (parsed.Meta.SchemaVersion, parsed.Meta.ExportedAt, parsed.Meta.AppVersion, parsed.Meta.LibraryName));
            var a = Analyze(parsed.Datasets);
            Assert.Empty(a.Issues);
            var lib = SampleLibrary();
            string Sorted<TItem>(IEnumerable<TItem> items, Func<TItem, string> id) => J(items.OrderBy(id, StringComparer.Ordinal).ToList());
            Assert.Equal(Sorted(lib.Categories, x => x.Id), Sorted(a.Changes.Categories, x => x.Id));
            Assert.Equal(Sorted(lib.Suppliers, x => x.Id), Sorted(a.Changes.Suppliers, x => x.Id));
            Assert.Equal(Sorted(lib.WorkItems, x => x.Id), Sorted(a.Changes.WorkItems, x => x.Id));
            Assert.Equal(Sorted(lib.Resources, x => x.Id), Sorted(a.Changes.Resources, x => x.Id));
            Assert.Equal(Sorted(lib.ResourcePrices, x => x.Id), Sorted(a.Changes.ResourcePrices, x => x.Id));
            Assert.Equal(Sorted(lib.Norms, x => x.Id), Sorted(a.Changes.Norms, x => x.Id));
            // Thành phần giữ cả giá áp dụng đã chọn (priceId).
            Assert.Equal(Sorted(lib.NormComponents, x => x.Id), Sorted(a.Changes.NormComponents, x => x.Id));
        }

        [Fact]
        public void NhapLaiChinhBanSaoLuuVaoThuVienDangCo_ToanBoLaTrung()
        {
            var lib = SampleLibrary();
            var parsed = Backup.ParseBackupJson(Backup.ToBackupJson(lib, Meta));
            Assert.True(parsed.Ok);
            var a = Analyze(parsed.Datasets, lib);
            Assert.Equal(0, a.ChangeCount);
            Assert.Equal(11, a.Summaries.Sum(s => s.Duplicates));
        }

        [Fact]
        public void TuChoiFileLa_SaiCuPhap_SchemaMoiHon_BaoThamChieuHong()
        {
            Assert.Contains("cú pháp", Backup.ParseBackupJson("{").Message);
            Assert.Contains("cú pháp", Backup.ParseBackupJson("{} rác").Message);
            Assert.Contains("không phải file sao lưu", Backup.ParseBackupJson("{\"a\":1}").Message);
            Assert.Contains("không phải file sao lưu", Backup.ParseBackupJson("[1]").Message);
            Assert.Contains("sai schemaVersion", Backup.ParseBackupJson("{\"format\":\"consquotation-library\",\"schemaVersion\":\"3\"}").Message);
            Assert.Contains("mới hơn", Backup.ParseBackupJson("{\"format\":\"consquotation-library\",\"schemaVersion\":99,\"data\":{}}").Message);
            Assert.True(Backup.ParseBackupJson("﻿{\"format\":\"consquotation-library\",\"schemaVersion\":3.0,\"data\":{}}").Ok);
            var broken = Backup.ParseBackupJson("{\"format\":\"consquotation-library\",\"schemaVersion\":1,\"data\":{\"norms\":[{\"id\":\"n\",\"workItemId\":\"?\",\"resourceId\":\"?\",\"quantity\":1}]}}");
            Assert.True(broken.Ok);
            var a = Analyze(broken.Datasets);
            Assert.Equal((1, 0), (a.Summaries[0].Errors, a.Summaries[0].Added));
            Assert.Contains("Tham chiếu công tác id \"?\" không có trong file.", a.Issues.Select(i => i.Message));
        }

        [Fact]
        public void TenFileCoNgayGio()
        {
            Assert.Equal("ConsQuotation-thu-vien-2026-10-21-0905.json", Backup.BackupFileName(new DateTime(2026, 10, 21, 9, 5, 0), "json"));
        }

        // ---------- Xuất workbook ----------

        private static SourceTable ToTable(string name, IEnumerable<object?[]> rows) => new SourceTable
        {
            Label = $"Sheet \"{name}\"",
            Rows = rows.Select(r => r.Select(v => (RawCell?)new RawCell(v is string s && s == "" ? null : v)).ToList()).ToList(),
        };

        [Fact]
        public void SheetXuat_GiongHetBanWeb()
        {
            var native = Parse(J(Backup.ExportSheets(SampleLibrary(), Meta)));
            var web = Parse(Fixture("web-export-sheets.json"));
            Assert.True(JToken.DeepEquals(web, native), "Khác bản web:\n" + native.ToString(Formatting.Indented));
        }

        [Fact]
        public void XuatRoiDocLaiQuaCacSheet_NoiDungGiuNguyen()
        {
            var lib = SampleLibrary();
            var sheets = Backup.ExportSheets(lib, Meta);
            Assert.Equal(new[] { "Thông tin", "Nhóm", "Nhà cung cấp", "Công tác", "Tài nguyên", "Giá tài nguyên", "Định mức", "Thành phần định mức" },
                sheets.Select(s => s.Name));
            var check = Backup.CheckBackupMeta(ToTable("Thông tin", sheets[0].Rows).Rows);
            Assert.Equal((WorkbookBackupKind.Backup, ExchangeSchema.Version, T, "Thư viện thử"), (check.Kind, check.SchemaVersion, check.ExportedAt, check.LibraryName));
            var datasets = ExchangeSchema.Kinds.Select(kind => Backup.DatasetFromBackupSheet(kind,
                ToTable(ExchangeSchema.Datasets[kind].SheetName, sheets.Single(s => s.Name == ExchangeSchema.Datasets[kind].SheetName).Rows))).ToList();
            var a = Analyze(datasets);
            Assert.Empty(a.Issues);
            Assert.Empty(a.Problems);

            // Dạng bảng tham chiếu nhóm/nhà cung cấp bằng tên: id mới, nhưng trỏ đúng bản ghi cùng tên.
            Func<string?, string?> Names(LibrarySnapshot s)
            {
                var m = s.Categories.Select(x => (x.Id, x.Name)).Concat(s.Suppliers.Select(x => (x.Id, x.Name))).ToDictionary(x => x.Id, x => x.Name);
                return id => id == null ? null : m.TryGetValue(id, out var n) ? n : null;
            }
            string View(IEnumerable<WorkItem> items, Func<string?, string?> n) => J(items.OrderBy(x => x.Code, StringComparer.Ordinal).Select(x =>
                new { x.Code, x.Name, Category = n(x.CategoryId), x.Unit, x.Description, x.PricingMethod, x.UnitPrice, x.Currency, Supplier = n(x.SupplierId), x.Source, x.EffectiveFrom, x.EffectiveTo, x.Notes }));
            string ViewR(IEnumerable<Resource> items, Func<string?, string?> n) => J(items.OrderBy(x => x.Code, StringComparer.Ordinal).Select(x =>
                new { x.Code, x.Name, x.Type, Category = n(x.CategoryId), x.Unit, x.Notes }));
            Assert.Equal(View(lib.WorkItems, Names(lib)), View(a.Changes.WorkItems, Names(a.Changes)));
            Assert.Equal(ViewR(lib.Resources, Names(lib)), ViewR(a.Changes.Resources, Names(a.Changes)));
            Assert.Equal(J(lib.Categories.Select(x => new { x.Name, x.Notes })), J(a.Changes.Categories.Select(x => new { x.Name, x.Notes })));
            Assert.Equal(J(lib.Suppliers.Select(x => new { x.Name, x.ContactInfo, x.Notes })), J(a.Changes.Suppliers.Select(x => new { x.Name, x.ContactInfo, x.Notes })));
            var prices = a.Changes.ResourcePrices.Select(p => (p.Price, p.Status, p.EffectiveFrom)).ToList();
            Assert.Contains((1.5m, PriceStatus.Active, (string?)"2026-01-01"), prices);
            Assert.Contains((1.6m, PriceStatus.Inactive, (string?)null), prices);
            Assert.Equal(new[] { ("007", "1", NormStatus.Approved, NormSourceType.Document) },
                a.Changes.Norms.Select(n => (n.Code, n.Version, n.Status, n.SourceType)));
            Assert.Equal(new[] { (0.000123m, 0.05m, 1), (1.25m, 0m, 2) }, a.Changes.NormComponents.Select(c => (c.Consumption, c.WasteRate, c.SortOrder)));
            // Sheet/CSV không có cột giá áp dụng: chỉ bản sao lưu JSON giữ lựa chọn này.
            Assert.All(a.Changes.NormComponents, c => Assert.Null(c.PriceId));
        }

        [Fact]
        public void ThuVienTrong_FileMauChiCoTieuDe()
        {
            foreach (var sheet in Backup.ExportSheets(new LibrarySnapshot(), Meta).Skip(1))
            {
                Assert.Single(sheet.Rows);
            }
        }

        [Fact]
        public void WorkbookThuongHoacSchemaMoiHon_KhongPhaiBanXuatHopLe()
        {
            Assert.Equal(WorkbookBackupKind.NotBackup, Backup.CheckBackupMeta(new[] { new RawCell?[] { new RawCell("Tên"), new RawCell("x") } }).Kind);
            Assert.Equal(WorkbookBackupKind.Unsupported, Backup.CheckBackupMeta(new[]
            {
                new RawCell?[] { new RawCell("format"), new RawCell("consquotation-library") },
                new RawCell?[] { new RawCell("schemaVersion"), new RawCell(4d) },
            }).Kind);
        }

        [Fact]
        public void WorkbookSchema1Va2_SheetDinhMucDocNhuThanhPhan()
        {
            var v2 = Backup.BackupSheetKinds(2);
            Assert.DoesNotContain(v2, x => x.SheetName == "Thành phần định mức");
            Assert.Contains((DatasetKind.NormComponents, "Định mức"), v2);
            Assert.Equal(7, Backup.BackupSheetKinds(3).Count);
        }

        // ---------- File lớn ----------

        [Fact]
        public void VuotGioiHanDong_Chan()
        {
            var table = new SourceTable { Label = "x" };
            table.Rows.Add(new List<RawCell?> { new RawCell("Mã công tác"), new RawCell("Tên công tác"), new RawCell("Đơn vị tính") });
            for (var i = 0; i <= Source.MaxImportRows; i++)
            {
                table.Rows.Add(new List<RawCell?>());
            }
            var ds = Source.DatasetFromTable(table, 0, DatasetKind.WorkItems, Source.AutoMap(DatasetKind.WorkItems, Source.HeaderTexts(table, 0)));
            Assert.Contains("vượt giới hạn", string.Join(",", ds.Problems));
        }

        [Fact]
        public void HaiMuoiNghinCongTacVaGia_KiemTraTrongThoiGianNgan()
        {
            const int n = 20_000;
            var works = new StringBuilder("Mã công tác,Tên công tác,Đơn vị tính,Đơn giá,Tiền tệ\n");
            var res = new StringBuilder("Mã tài nguyên,Tên tài nguyên,Đơn vị tính\n");
            var prices = new StringBuilder("Mã tài nguyên,Đơn giá,Đơn vị tính,Tiền tệ\n");
            for (var i = 0; i < n; i++)
            {
                works.Append($"CT-{i},Công tác số {i},m3,{i}.5,VND\n");
                prices.Append($"TN-{i % 1000},{i},kg,VND\n");
            }
            for (var i = 0; i < 1000; i++)
            {
                res.Append($"TN-{i},Tài nguyên {i},kg\n");
            }
            var watch = Stopwatch.StartNew();
            var a = Analyze(new[] { DatasetFromCsv(works.ToString()), DatasetFromCsv(res.ToString()), DatasetFromCsv(prices.ToString()) });
            watch.Stop();
            Assert.Empty(a.Issues);
            Assert.Equal(n + 1000 + n, a.ChangeCount);
            Assert.True(watch.ElapsedMilliseconds < 5000, $"{watch.ElapsedMilliseconds} ms");
        }
    }

    /// <summary>Ghi kết quả nhập vào file thư viện (phần cuối libraryExchange.test.ts).</summary>
    public class ImportApplyTests : IDisposable
    {
        private readonly TempDir dir = new TempDir();

        public void Dispose() => dir.Dispose();

        private LibraryService NewService()
        {
            var id = 0;
            var clock = new DateTime(2026, 10, 21, 0, 0, 0, DateTimeKind.Utc);
            return new LibraryService(new LibraryStore(dir.File("library.json")), () => clock = clock.AddSeconds(1), () => $"id-{++id}");
        }

        [Fact]
        public void NhapMotLanGhi_DocLaiDayDu()
        {
            var service = NewService();
            service.ApplyImport(ExchangeTests.SampleLibrary());
            var loaded = new LibraryStore(dir.File("library.json")).LoadAll();
            Assert.Equal(2, loaded.WorkItems.Count);
            Assert.Single(loaded.Norms);
            Assert.Equal(2, loaded.NormComponents.Count);
            Assert.Equal(1234567.891m, loaded.WorkItems.Single(w => w.Id == "w1").UnitPrice);
        }

        [Fact]
        public void MocSaoLuu_ChuaSaoLuu_SaoLuu_ThayDoiSauDo()
        {
            var service = NewService();
            var initial = service.GetBackupStatus();
            Assert.Null(initial.LastBackupAt);
            Assert.Null(initial.LastChangedAt);
            service.ApplyImport(ExchangeTests.SampleLibrary());
            var afterImport = service.GetBackupStatus();
            Assert.Null(afterImport.LastBackupAt);
            Assert.NotNull(afterImport.LastChangedAt);
            service.RecordBackup(new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc));
            var backedUp = service.GetBackupStatus();
            Assert.True(string.CompareOrdinal(backedUp.LastChangedAt, backedUp.LastBackupAt) < 0);
            Assert.Null(service.SetNormStatus("n1", NormStatus.Inactive, service.Load()));
            Assert.NotEqual(afterImport.LastChangedAt, service.GetBackupStatus().LastChangedAt);
        }

        [Fact]
        public void PhanTichQuaDichVu_DungDongHoVaIdCuaDichVu()
        {
            var service = NewService();
            var a = service.AnalyzeImport(new[] { Source.DatasetFromTable(SourceTable.FromCsv("x", Csv.Parse("Tên nhóm\nMóng\n")), 0,
                DatasetKind.Categories, new Dictionary<string, int?> { ["name"] = 0 }) }, service.Load(), DuplicateMode.Skip);
            var c = Assert.Single(a.Changes.Categories);
            Assert.Equal(("id-1", "2026-10-21T00:00:01.000Z"), (c.Id, c.CreatedAt));
        }
    }
}
