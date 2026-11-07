using System;
using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Quotation;
using Xunit;
using static ConsQuotation.Tests.Fixtures;

namespace ConsQuotation.Tests
{
    /// <summary>Chuyển từ tests/unit/pricing.test.ts (kiểm tra báo giá), print.test.ts, workflow.test.ts.</summary>
    public class QuoteCheckTests
    {
        private static readonly List<string> Headers = QuoteTemplate.Columns.Select(c => c.Header).ToList();
        private static readonly string Amount = QuoteTemplate.AmountFormula(Rounding.NoRounding);
        private const string Stt = "=ROW()-ROW(CQ_Quote_1[#Headers])";

        private static SheetRow Row(params object[] values)
        {
            var cells = values.Select(v => v is int i ? (double)i : v).ToArray();
            return new SheetRow(cells,
                cells.Select((v, i) => i == 7 ? Amount : i == 0 ? Stt : v).ToArray(),
                cells.Select(v => v is double ? "Double" : v is string s && s == "" ? "Empty" : v is string e && e.StartsWith("#") ? "Error" : "String").ToArray());
        }

        private static SheetRow Totals(object? totalFormula = null)
        {
            var values = new object?[] { "", "", "", "Tổng cộng", "", "", "", 100.0, "" };
            var formulas = new object?[] { "", "", "", "Tổng cộng", "", "", "", totalFormula ?? "=SUBTOTAL(109,[Thành tiền])", "" };
            return new SheetRow(values, formulas, new[] { "Empty", "Empty", "Empty", "String", "Empty", "Empty", "Empty", "Double", "Empty" });
        }

        private static TableSnapshot Quote(IEnumerable<SheetRow> rows, SheetRow? totals) => new TableSnapshot
        {
            Name = "CQ_Quote_1",
            SheetName = "Báo giá",
            Headers = Headers,
            FirstRowIndex = 10,
            Rows = rows.ToList(),
            Totals = totals,
        };

        private static QuoteSnapshot Snap(params SheetRow[] rows) => new QuoteSnapshot { Quote = Quote(rows, Totals()) };

        [Fact]
        public void DongTrong_KhongTinhLaCongTac_ChiNhacConDongTrong()
        {
            var result = QuoteChecker.Check(Snap(Row(1, "A", "", "Đào đất", "m3", 2, 50, 100, ""), Row(2, "", "", "", "", "", "", "", "")));
            var issue = Assert.Single(result.Issues);
            Assert.StartsWith("Còn 1 dòng trống trong bảng (hàng 12)", issue.Message);
            Assert.Equal(1, result.RowCount);
            Assert.Equal(PriceMethod.Direct, result.Methods[0].Method);
        }

        [Fact]
        public void PhanBietTrong_Khong_Chu_Loi_ChiDungO()
        {
            var result = QuoteChecker.Check(Snap(
                Row(1, "A", "", "Thiếu KL", "m3", "", 50, "", ""),
                Row(2, "B", "", "Giá 0", "m3", 1, 0, 0, ""),
                Row(3, "C", "", "Giá chữ", "m3", 1, "1.500.000", "#VALUE!", ""),
                Row(4, "D", "", "Chia 0", "m3", 1, "#DIV/0!", "#DIV/0!", "")));
            string First(string address) => result.Issues.First(i => i.Address == address).Message;
            Assert.Contains("Thiếu khối lượng", First("F11"));
            Assert.Contains("bằng 0 (khác với để trống)", First("G12"));
            Assert.Contains("không phải số", First("G13"));
            Assert.Contains("#VALUE!", First("H13"));
            Assert.Contains("#DIV/0!", First("G14"));
            Assert.Contains("chia cho 0", First("G14"));
            Assert.Equal(IssueSeverity.Error, result.Issues.First(i => i.Address == "G14").Severity);
        }

        [Fact]
        public void ThanhTienBiGoDe_HoacKhacQuyTac_TongBiSua()
        {
            var typed = Row(1, "A", "", "X", "m3", 2, 50, 100, "");
            typed.Formulas[7] = 100.0;
            var snapshot = new QuoteSnapshot
            {
                Quote = Quote(new[] { typed, Row(2, "B", "", "Y", "m3", 1, 1, 1, "") }, Totals("=SUM(H11:H12)")),
                AmountRule = new RoundingRule(RoundingMode.Round, 0),
            };
            var messages = QuoteChecker.Check(snapshot).Issues.Select(i => $"{i.Address}: {i.Message}").ToList();
            Assert.Contains("H11: Thành tiền bị gõ đè bằng số, không còn tự tính theo khối lượng × đơn giá.", messages);
            Assert.Contains(messages, m => m.StartsWith("H12: Công thức Thành tiền khác mẫu"));
            Assert.Contains(messages, m => m.StartsWith("H13: Công thức tổng Thành tiền khác mẫu"));
        }

        private static AnalysisLine Line(string code, object unitPrice, bool priceBlank = false) => new AnalysisLine
        {
            Code = code,
            RowIndex = 4,
            SheetName = "Phân tích đơn giá",
            PriceBlank = priceBlank,
            UnitPrice = unitPrice,
            UnitPriceType = unitPrice is string s && s == "" ? "Empty" : unitPrice is double ? "Double" : "Error",
            PriceAddress = "I5",
            ResourceCode = "XM",
            ResourceName = "Xi măng",
            ResourceType = "Vật liệu",
            ResourceUnit = "kg",
            Quantity = 1.0,
            QuantityType = "Double",
            Price = priceBlank ? "" : (object)1.0,
            PriceType = priceBlank ? "Empty" : "Double",
        };

        [Fact]
        public void DonGiaPhanTichLech_DeXuatCapNhat_ThieuSoLieu_CanhBao()
        {
            var note = $"{Composition.NotePrefix} 007 (sheet \"Phân tích đơn giá\")";
            var snapshot = Snap(Row(1, "007", "", "BT", "m3", 1, 700000, 700000, note), Row(2, "009", "", "BT2", "m3", 1, "", "", note.Replace("007", "009")));
            snapshot.Analysis = new List<AnalysisLine> { Line("007", 721000.0), Line("009", "", true) };
            var result = QuoteChecker.Check(snapshot);
            var fix = result.Issues.First(i => i.FixUnitPrice != null);
            Assert.Equal(("G11", 721000.0), (fix.Address, fix.FixUnitPrice!.Value));
            Assert.Equal(700000.0, fix.FixPrevious);
            Assert.Contains("Phân tích mã \"009\": thiếu đơn giá nguồn.", result.Issues.Select(i => i.Message));
            Assert.All(result.Methods, m => Assert.Equal(PriceMethod.Composition, m.Method));
        }

        [Fact]
        public void TongHop_GiaTriTrong_LoaiSai_OTongLoi()
        {
            SheetRow S(object?[] values, string[] types) => new SheetRow(values, values.Select((v, i) => i >= 4 ? "=x" : v).ToArray(), types);
            var snapshot = Snap(Row(1, "A", "", "X", "m3", 1, 100, 100, ""));
            snapshot.Summary = new TableSnapshot
            {
                Name = "CQ_Summary_1",
                SheetName = "Báo giá",
                Headers = Adjustments.Headers.ToList(),
                FirstRowIndex = 20,
                FirstColumnIndex = 3,
                Rows = new List<SheetRow>
                {
                    S(new object?[] { "Cộng giá trị báo giá", "Cộng", "Theo bảng báo giá", "", 100.0, 100.0 }, new[] { "String", "String", "String", "Empty", "Double", "Double" }),
                    S(new object?[] { "Thuế", "Cộng thêm", "% trên lũy kế", "", "", "#N/A" }, new[] { "String", "String", "String", "Empty", "Empty", "Error" }),
                    S(new object?[] { "Phí", "giam tru", "Số tiền", 5.0, "#N/A", "#N/A" }, new[] { "String", "String", "String", "Double", "Error", "Error" }),
                },
                Totals = S(new object?[] { "Tổng cộng", "", "", "", "#N/A", "" }, new[] { "String", "Empty", "Empty", "Empty", "Error", "Empty" }),
            };
            var result = QuoteChecker.Check(snapshot);
            var messages = result.Issues.Select(i => $"{i.Address}: {i.Message}").ToList();
            Assert.Contains(messages, m => m.StartsWith("G22: Tổng hợp \"Thuế\": chưa nhập giá trị"));
            Assert.Contains("E23: Tổng hợp \"Phí\": Loại phải là Giảm trừ hoặc Cộng thêm.", messages);
            Assert.Contains(messages, m => m.StartsWith("H24: Tổng cộng (sau chiết khấu/phụ phí/thuế) lỗi #N/A"));
            Assert.All(result.Issues, i => Assert.False(string.IsNullOrEmpty(i.Hint)));
        }

        [Fact]
        public void ThieuDonVi_GiaTriLonBatThuong_LuonCoHuongKhacPhuc()
        {
            var result = QuoteChecker.Check(new QuoteSnapshot { Quote = Quote(new[] { Row(1, "A", "", "X", "", 2, 2e11, 4e11, ""), Row(2, "B", "", "Y", "m3", 2e7, 1, 2e7, "") }, null) });
            QuoteIssue By(string address) => result.Issues.First(i => i.Address == address);
            Assert.Equal("Thiếu đơn vị tính.", By("E11").Message);
            Assert.Contains("lớn bất thường", By("G11").Message);
            Assert.Contains("lớn bất thường", By("F12").Message);
            Assert.All(result.Issues, i => Assert.False(string.IsNullOrEmpty(i.Hint)));
        }

        [Fact]
        public void ConDongTrong_CoCongTac_CanhBaoKemHang_ChuaCoCongTacThiKhong()
        {
            var blank = Row(2, "", "", "", "", "", "", "", "");
            var result = QuoteChecker.Check(new QuoteSnapshot { Quote = Quote(new[] { Row(1, "A", "", "X", "m3", 1, 2, 2, ""), blank }, null) });
            var issue = result.Issues.First(i => i.Message.StartsWith("Còn 1 dòng trống"));
            Assert.Equal("A12", issue.Address);
            Assert.Contains("Delete › Table Rows", issue.Hint);
            Assert.DoesNotContain(QuoteChecker.Check(new QuoteSnapshot { Quote = Quote(new[] { blank }, null) }).Issues, i => i.Message.StartsWith("Còn"));
        }

        [Fact]
        public void LoiCongThuc_CoHuongKhacPhucTheoLoai()
        {
            var result = QuoteChecker.Check(new QuoteSnapshot { Quote = Quote(new[] { Row(1, "A", "", "X", "m3", 1, "#DIV/0!", "#DIV/0!", "") }, null) });
            Assert.Contains("mẫu số", result.Issues[0].Hint);
        }

        [Fact]
        public void DongTuThuVien_BaoKhiDonGiaKhacHoacMaKhongCon()
        {
            var library = Lib();
            library.WorkItems = new List<WorkItem> { new WorkItem { Id = "w", Code = "BT-01", Unit = "m3", UnitPrice = 1200, Currency = "VND", CreatedAt = T, UpdatedAt = T } };
            var snapshot = new QuoteSnapshot
            {
                Quote = Quote(new[]
                {
                    Row(1, "BT-01", "", "X", "m3", 1, 1000, 1000, "Thư viện: BT-01; nguồn giá: A"),
                    Row(2, "XX", "", "Y", "m3", 1, 5, 5, "Thư viện: XX"),
                    Row(3, "BT-01", "", "Z", "m3", 1, 1200, 1200, "Thư viện: BT-01"),
                }, null),
            };
            var prices = QuoteChecker.Check(snapshot, library).Issues.Where(i => i.Address.StartsWith("G")).Select(i => i.Message);
            Assert.Equal(new[] { "Đơn giá 1.000 khác đơn giá hiện tại trong thư viện 1.200.", "Không còn công tác mã \"XX\" trong thư viện trên máy này." }, prices);
            Assert.DoesNotContain(QuoteChecker.Check(snapshot).Issues, i => i.Address.StartsWith("G"));
        }

        [Fact]
        public void CotMauBiDoi_KhongCrash_BaoLoiChanNeuDungCot()
        {
            var headers = Headers.ToList();
            headers[6] = "1000000";
            var result = QuoteChecker.Check(new QuoteSnapshot
            {
                Quote = new TableSnapshot { Name = "CQ_Quote_4", SheetName = "S", Headers = headers, FirstRowIndex = 10, Rows = new List<SheetRow> { new SheetRow(new object?[] { 1.0, "A", "", "X", "m3", 1.0, 2.0, 2.0, "" }, new object?[0], new string[0]) } },
            });
            var issue = Assert.Single(result.Issues);
            Assert.Equal((IssueSeverity.Error, "A10"), (issue.Severity, issue.Address));
            Assert.Contains("Đơn giá", issue.Message);
        }

        // ---------- Ghi chú và điều khoản ----------

        [Fact]
        public void DieuKhoan_KhongSoanSan_ChiGhiMucCoNoiDung_DungThuTu()
        {
            Assert.Empty(Terms.ToWrite(new TermsSection[0]));
            var rows = Terms.Rows(new[] { new TermsSection(TermsKey.Commercial, "Thanh toán 2 đợt"), new TermsSection(TermsKey.Scope, "  Phần thô  "), new TermsSection(TermsKey.Assumptions, "   ") });
            Assert.Equal(new[] { (Terms.Title, ""), ("Phạm vi công việc:", "'Phần thô"), ("Điều khoản thương mại:", "'Thanh toán 2 đợt") }, rows.Select(r => (r.Label, r.Text)));
        }

        [Fact]
        public void DieuKhoan_GiuXuongDong_ChuDangCongThucGhiDangChu()
        {
            Assert.Equal("Dòng 1\nDòng 2\nDòng 3", Terms.Normalize("Dòng 1\r\nDòng 2\rDòng 3"));
            Assert.Equal("'=SUM(A1)", Terms.Rows(new[] { new TermsSection(TermsKey.Notes, "=SUM(A1)") })[1].Text);
            Assert.Equal("'10%", Terms.Rows(new[] { new TermsSection(TermsKey.Notes, "10%") })[1].Text);
        }

        [Fact]
        public void DieuKhoan_DocLaiTuSheet_KhopNhan_BoQuaDongLa()
        {
            var labels = new object?[] { Terms.Title, "Phạm vi công việc:", "dòng người dùng tự thêm", "ghi chú" };
            var texts = new object?[] { "", "Phần thô", "x", "Giá chưa gồm VAT" };
            Assert.Equal(new[] { (TermsKey.Scope, "Phần thô"), (TermsKey.Notes, "Giá chưa gồm VAT") }, Terms.Parse(labels, texts).Select(s => (s.Key, s.Text)));
        }

        [Fact]
        public void DieuKhoan_GioiHanDoDai_TenVungTheoBang()
        {
            Assert.Single(Terms.Validate(new[] { new TermsSection(TermsKey.Notes, new string('x', 32001)) }));
            Assert.Empty(Terms.Validate(new[] { new TermsSection(TermsKey.Notes, new string('x', 100)) }));
            Assert.Equal("CQ_Terms_7", Naming.TermsNameFor("CQ_Quote_7"));
        }

        // ---------- Trang in ----------

        [Fact]
        public void TrangIn_MacDinh_VungIn_DongDau()
        {
            var options = new PrintOptions();
            Assert.Equal((PageOrientationKind.Portrait, PaperKind.A4, FitKind.Width), (options.Orientation, options.Paper, options.Fit));
            Assert.True(options.RepeatHeader && options.PageNumbers && options.CenterHorizontally && options.WrapLongText);
            Assert.Equal("Trang &P / &N", PrintLayout.PageNumberFooter);
            var area = PrintLayout.Bounding(new[] { new CellRect(0, 0, 1, 9), new CellRect(9, 0, 7, 10), new CellRect(17, 3, 4, 6), new CellRect(22, 0, 3, 10) });
            Assert.Equal((0, 0, 25, 10), (area.RowIndex, area.ColumnIndex, area.RowCount, area.ColumnCount));
            Assert.Equal(0, PrintLayout.QuoteTopRow(9, 0, 1));
            Assert.Equal(3, PrintLayout.QuoteTopRow(9, null, 3));
            Assert.Equal(9, PrintLayout.QuoteTopRow(9, null, null));
            Assert.Equal(9, PrintLayout.QuoteTopRow(9, 12, null));
        }

        // ---------- Đổi quy tắc làm tròn ----------

        [Fact]
        public void DoiQuyTac_ChiGhiCongThucMau_GiuOSuaTayVaHangSo()
        {
            var old = QuoteTemplate.AmountFormula(new RoundingRule(RoundingMode.Round, -3));
            var target = new RoundingRule(RoundingMode.Round, 0);
            var plan = RoundingRewrite.Plan(new object?[] { old, QuoteTemplate.AmountFormula(target), "=F14*G14*2", "1234", "" }, r => QuoteTemplate.AmountFormula(r), target, "CQ_Quote_1");
            Assert.Equal(new[] { 0 }, plan.Updates);
            Assert.Equal(new[] { 0, 1 }, plan.Ours);
            Assert.Equal(1, plan.Kept);
            Assert.False(plan.AllOurs);
            var all = RoundingRewrite.Plan(new object?[] { old, old }, r => QuoteTemplate.AmountFormula(r), target, "CQ_Quote_1");
            Assert.True(all.AllOurs);
            Assert.Equal(2, all.Updates.Count);
        }

        [Fact]
        public void DoiQuyTac_NhanCongThucExcelDaVietLai()
        {
            var expected = Adjustments.AmountFormula("CQ_Quote_1", Rounding.NoRounding);
            var asExcel = expected.Replace("[@[Loại]]", "[@Loại]");
            Assert.NotEqual(expected, asExcel);
            var plan = RoundingRewrite.Plan(new object?[] { asExcel }, r => Adjustments.AmountFormula("CQ_Quote_1", r), Rounding.NoRounding, "CQ_Summary_1");
            Assert.Empty(plan.Updates);
            Assert.Equal(new[] { 0 }, plan.Ours);
        }

        [Fact]
        public void DinhDangTien_TheoQuyTac_NhanCaDangVungMien()
        {
            Assert.Equal("#,##0", RoundingRewrite.MoneyFormat(Rounding.NoRounding));
            Assert.Equal("#,##0", RoundingRewrite.MoneyFormat(new RoundingRule(RoundingMode.Round, -3)));
            Assert.Equal("#,##0.00", RoundingRewrite.MoneyFormat(new RoundingRule(RoundingMode.Round, 2)));
            Assert.True(RoundingRewrite.IsMoneyFormat("#,##0.00"));
            Assert.True(RoundingRewrite.IsMoneyFormat("#.##0,00", ".", ","));
            Assert.True(RoundingRewrite.IsMoneyFormat("#.##0", ".", ","));
            Assert.False(RoundingRewrite.IsMoneyFormat("General", ".", ","));
            Assert.False(RoundingRewrite.IsMoneyFormat("0.00%", ".", ","));
            Assert.False(RoundingRewrite.IsMoneyFormat(null));
        }

        // ---------- Thông tin báo giá và quy trình ----------

        private static InfoCell Cell(InfoKey key, object? value, string format = "General", bool found = true) => new InfoCell
        {
            Key = key,
            Found = found,
            Address = "D2",
            Value = value,
            Text = QuoteLineReader.Text(value),
            NumberFormat = format,
        };

        private static Dictionary<InfoKey, string> Empty() => QuoteInfo.Fields.ToDictionary(f => f.Key, _ => "");

        [Fact]
        public void ThongTin_Nhan_Ngay()
        {
            Assert.Equal(QuoteTemplate.InfoLabels, QuoteInfo.Fields.Select(f => f.Label));
            Assert.Equal(new[] { InfoKey.Date, InfoKey.ValidUntil }, QuoteInfo.Fields.Where(f => f.IsDate).Select(f => f.Key));
            Assert.True(QuoteInfo.LabelMatches("Khách hàng:", "Khách hàng:"));
            Assert.True(QuoteInfo.LabelMatches("  khách hàng ", "Khách hàng:"));
            Assert.False(QuoteInfo.LabelMatches("Khách hang:", "Khách hàng:"));
            Assert.False(QuoteInfo.LabelMatches(5.0, "Khách hàng:"));
            Assert.Equal(46203, QuoteInfo.IsoToExcelSerial("2026-06-30"));
            var date = QuoteInfo.Fields.First(f => f.Key == InfoKey.Date);
            Assert.Equal("30/06/2026", QuoteInfo.DisplayValue(date, Cell(InfoKey.Date, 46203.0, "dd/mm/yyyy")));
            Assert.Equal("30/6/26", QuoteInfo.DisplayValue(date, Cell(InfoKey.Date, "30/6/26")));
            Assert.Equal("30/06/2026", QuoteInfo.DisplayValue(date, Cell(InfoKey.Date, 46203.0, QuoteInfo.DateFormat)));
            Assert.Equal("30/06/2026", QuoteInfo.DisplayValue(date, Cell(InfoKey.Date, 46203.0, "m/d/yyyy")));
        }

        [Fact]
        public void ThongTin_ChiGhiMucDoi_BaoLoiNgay()
        {
            var current = Empty();
            current[InfoKey.Customer] = "Cty A";
            current[InfoKey.Version] = "1";
            var input = new Dictionary<InfoKey, string>(current) { [InfoKey.Customer] = "Cty B", [InfoKey.Date] = "21/10/2026", [InfoKey.Version] = "" };
            var plan = QuoteInfo.PlanWrites(input, current);
            Assert.Empty(plan.Errors);
            Assert.Equal(new[] { (InfoKey.Customer, InfoWriteKind.Text), (InfoKey.Date, InfoWriteKind.Date), (InfoKey.Version, InfoWriteKind.Clear) }, plan.Writes.Select(w => (w.Key, w.Kind)));
            Assert.Equal(QuoteInfo.IsoToExcelSerial("2026-10-21"), plan.Writes[1].Serial);
            Assert.Empty(QuoteInfo.PlanWrites(current, current).Writes);
            var bad = new Dictionary<InfoKey, string>(Empty()) { [InfoKey.Date] = "31/02/2026" };
            Assert.Equal(InfoKey.Date, QuoteInfo.PlanWrites(bad, Empty()).Errors[0].Key);
            var early = new Dictionary<InfoKey, string>(Empty()) { [InfoKey.Date] = "21/10/2026", [InfoKey.ValidUntil] = "20/10/2026" };
            Assert.Equal("Hiệu lực đến phải sau hoặc bằng ngày lập.", Assert.Single(QuoteInfo.PlanWrites(early, Empty()).Errors).Message);
        }

        [Fact]
        public void ThongTin_TomTat_MucDaDien_NhanMat_HetHieuLuc()
        {
            var cells = QuoteInfo.Fields.Select(f => Cell(f.Key, "")).ToList();
            void Set(InfoCell cell) => cells[cells.FindIndex(c => c.Key == cell.Key)] = cell;
            Set(Cell(InfoKey.Customer, "Cty A"));
            Set(Cell(InfoKey.ValidUntil, (double)QuoteInfo.IsoToExcelSerial("2026-10-01"), "dd/mm/yyyy"));
            Set(Cell(InfoKey.QuoteNo, "", found: false));
            Set(Cell(InfoKey.Location, "", found: false));
            var summary = QuoteInfo.Summarize(cells, "2026-10-21");
            Assert.Equal((2, 10, "01/10/2026"), (summary.Filled, summary.Total, summary.Expired!));
            Assert.Equal(new[] { InfoKey.QuoteNo }, summary.MissingLabels);
            Assert.Null(QuoteInfo.Summarize(cells, "2026-09-30").Expired);
        }

        private static QuoteSnapshot FlowSnapshot(IEnumerable<object[]> rows, object? summaryTotal = null)
        {
            var snapshot = new QuoteSnapshot { Quote = new TableSnapshot { Name = "CQ_Quote_1", SheetName = "S", Headers = Headers, Rows = rows.Select(r => Row(r)).ToList() } };
            if (summaryTotal != null)
            {
                var values = new object?[] { "Tổng cộng", "", "", "", summaryTotal, "" };
                snapshot.Summary = new TableSnapshot
                {
                    Name = "CQ_Summary_1",
                    SheetName = "S",
                    Headers = Adjustments.Headers.ToList(),
                    Totals = new SheetRow(values, new object?[6], new[] { "String", "Empty", "Empty", "Empty", summaryTotal is string ? "Error" : "Double", "Empty" }),
                };
            }
            return snapshot;
        }

        [Fact]
        public void QuyTrinh_DemDong_ThieuSoLieu_TongHop()
        {
            var facts = Workflow.Facts(FlowSnapshot(new[]
            {
                new object[] { 1, "A", "", "X", "m3", 1, 2, 2, "" },
                new object[] { 2, "", "", "Y", "m3", "", 2, "", "" },
                new object[] { 3, "", "", "Z", "m3", 1, "", "", "" },
                new object[] { 4, "", "", "", "", "", "", "", "" },
            }));
            Assert.Equal((3, 1, 1, "none"), (facts.ItemRows, facts.MissingQuantity, facts.MissingPrice, facts.SummaryKind));
            var value = Workflow.Facts(FlowSnapshot(new object[0][], 1234.0));
            Assert.Equal(("value", 1234m), (value.SummaryKind, value.SummaryValue));
            Assert.Equal("error", Workflow.Facts(FlowSnapshot(new object[0][], "#N/A")).SummaryKind);
        }

        [Fact]
        public void QuyTrinh_TrangThaiTungBuoc()
        {
            StepKey[] order = (StepKey[])Enum.GetValues(typeof(StepKey));
            QuoteCheckResult Check(int errors) => new QuoteCheckResult { RowCount = 1, Issues = Enumerable.Range(0, errors).Select(_ => new QuoteIssue { Severity = IssueSeverity.Error }).ToList() };
            var none = Workflow.Steps(false, false, null, null, null);
            Assert.Equal(new[] { StepState.Todo, StepState.Optional, StepState.Todo, StepState.Todo, StepState.Todo, StepState.Optional, StepState.Optional }, order.Select(k => none[k]));
            var facts = new QuoteFacts { ItemRows = 2, MissingPrice = 1, SummaryKind = "error", SummaryError = "#N/A" };
            var some = Workflow.Steps(true, true, new InfoSummary { Total = 7, Expired = "01/10/2026" }, facts, Check(1));
            Assert.Equal(new[] { StepState.Done, StepState.Attention, StepState.Done, StepState.Attention, StepState.Attention, StepState.Attention, StepState.Optional }, order.Select(k => some[k]));
            var ok = Workflow.Steps(true, true, new InfoSummary { Total = 7, Filled = 3 }, new QuoteFacts { ItemRows = 2 }, Check(0));
            Assert.Equal(new[] { StepState.Done, StepState.Done, StepState.Done, StepState.Done, StepState.Done, StepState.Optional, StepState.Optional }, order.Select(k => ok[k]));
        }
    }
}
