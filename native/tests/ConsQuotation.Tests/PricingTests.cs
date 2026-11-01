using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Pricing;
using Xunit;

namespace ConsQuotation.Tests
{
    /// <summary>
    /// Chuyển từ tests/unit/pricing.test.ts: làm tròn, bảng tổng hợp, phân tích đơn giá, so khớp công thức.
    /// Phần "kiểm tra báo giá" (quoteCheck) và công thức mẫu bảng báo giá chuyển ở giai đoạn N4–N5.
    /// </summary>
    public class PricingTests
    {
        private static RoundingRule R(RoundingMode mode, int digits) => new RoundingRule(mode, digits);

        // ---------- làm tròn ----------

        [Fact]
        public void Mac_dinh_khong_lam_tron_cau_hinh_hong_khong_doan()
        {
            var config = Rounding.Normalize(null, null, null);
            Assert.Equal(Rounding.NoRounding, config.UnitPrice);
            Assert.Equal(Rounding.NoRounding, Rounding.Normalize(null, R(RoundingMode.Round, 99), null).Amount);
            Assert.Equal(R(RoundingMode.Round, -3), Rounding.Normalize(null, R(RoundingMode.Round, -3), null).Amount);
        }

        [Fact]
        public void Boc_bang_ham_Excel()
        {
            Assert.Equal("A*B", Rounding.Wrap("A*B", Rounding.NoRounding));
            Assert.Equal("ROUND(A*B,0)", Rounding.Wrap("A*B", R(RoundingMode.Round, 0)));
            Assert.Equal("ROUNDUP(A*B,-3)", Rounding.Wrap("A*B", R(RoundingMode.RoundUp, -3)));
            Assert.Equal("ROUNDDOWN(A*B,2)", Rounding.Wrap("A*B", R(RoundingMode.RoundDown, 2)));
        }

        [Fact]
        public void Tam_tinh_giong_Excel()
        {
            Assert.Equal(1.01m, Rounding.Apply(1.005m, R(RoundingMode.Round, 2)));
            Assert.Equal(3m, Rounding.Apply(2.5m, R(RoundingMode.Round, 0)));
            Assert.Equal(-3m, Rounding.Apply(-2.5m, R(RoundingMode.Round, 0)));
            Assert.Equal(1235000m, Rounding.Apply(1234567.5m, R(RoundingMode.Round, -3)));
            Assert.Equal(2000m, Rounding.Apply(1001m, R(RoundingMode.RoundUp, -3)));
            Assert.Equal(-2000m, Rounding.Apply(-1001m, R(RoundingMode.RoundUp, -3)));
            Assert.Equal(1999m, Rounding.Apply(1999.99m, R(RoundingMode.RoundDown, 0)));
            Assert.Equal(0.3m, Rounding.Apply(0.1m + 0.2m, R(RoundingMode.Round, 1)));
            Assert.Equal(5m, Rounding.Apply(5m, Rounding.NoRounding));
        }

        [Fact]
        public void Mo_ta_ro_do_chinh_xac_va_kieu_lam_tron()
        {
            Assert.Contains("hàng nghìn", Rounding.Describe(R(RoundingMode.Round, -3)));
            Assert.Contains("ROUND", Rounding.Describe(R(RoundingMode.Round, -3)));
            Assert.Contains("2 chữ số thập phân", Rounding.Describe(R(RoundingMode.RoundDown, 2)));
            Assert.Equal("Không làm tròn", Rounding.Describe(Rounding.NoRounding));
        }

        [Fact]
        public void Du_moi_bien_the_quy_tac()
        {
            Assert.Equal(1 + 3 * 16, Rounding.AllRules.Count);
            Assert.Contains(R(RoundingMode.RoundDown, -9), Rounding.AllRules);
            Assert.Contains(R(RoundingMode.RoundUp, 6), Rounding.AllRules);
        }

        // ---------- bảng tổng hợp ----------

        private static readonly Adjustment Vat = new Adjustment("Thuế GTGT", AdjustmentKind.Add, AdjustmentMethod.PercentOfRunning, 8);
        private static readonly Adjustment Discount = new Adjustment("Chiết khấu", AdjustmentKind.Deduct, AdjustmentMethod.PercentOfRunning, 5);

        [Fact]
        public void Khong_co_khoan_mac_dinh_dong_dau_la_gia_tri_bao_gia()
        {
            var rows = Adjustments.Rows("CQ_Quote_2", new Adjustment[0], Rounding.NoRounding);
            Assert.Single(rows);
            Assert.Equal(new object[] { "Cộng giá trị báo giá", "Cộng", "Theo bảng báo giá" }, rows[0].Take(3).ToArray());
        }

        [Fact]
        public void Thu_tu_ap_dung_theo_dong_ten_ghi_dang_chu()
        {
            var rows = Adjustments.Rows("CQ_Quote_2", new[] { Discount, Vat }, Rounding.NoRounding);
            Assert.Equal(new object[] { "Cộng giá trị báo giá", "'Chiết khấu", "'Thuế GTGT" }, rows.Select(r => r[0]).ToArray());
            Assert.Equal(new object[] { "Cộng thêm", "% trên lũy kế", 8m }, rows[2].Skip(1).Take(3).ToArray());
            var empty = new Adjustment(Vat.Name, Vat.Kind, Vat.Method, null);
            Assert.Equal("", Adjustments.Rows("CQ_Quote_2", new[] { empty }, Rounding.NoRounding)[1][3]);
        }

        [Fact]
        public void Cong_thuc_tong_hop()
        {
            var f = Adjustments.AmountFormula("CQ_Quote_2", R(RoundingMode.Round, 0));
            Assert.Contains("IF(CQ_Quote_2[[#Totals],[Thành tiền]]=\"\",NA(),CQ_Quote_2[[#Totals],[Thành tiền]])", f);
            Assert.Contains("IF([@[Giá trị]]=\"\",\"\"", f);
            Assert.Contains("ROUND(IF([@[Loại]]=", f);
            Assert.Contains("NA()))", f);
            Assert.Contains("OFFSET([@[Lũy kế]],-1,0)", f);
            Assert.Equal("=IF(COUNTBLANK(CQ_Summary_2[Lũy kế])>0,NA(),INDEX(CQ_Summary_2[Lũy kế],ROWS(CQ_Summary_2[Lũy kế])))",
                Adjustments.TotalFormula("CQ_Summary_2"));
            Assert.Equal("CQ_Summary_12", Adjustments.SummaryTableName("CQ_Quote_12"));
            Assert.True(Adjustments.IsSummaryTableName("CQ_Summary_12"));
            Assert.False(Adjustments.IsSummaryTableName("CQ_Summary_d"));
            Assert.Equal("CQ_Quote_12", Adjustments.QuoteTableOfSummary("CQ_Summary_12"));
        }

        [Fact]
        public void Doc_lai_cau_hinh_tu_sheet_dong_sai_bi_danh_dau()
        {
            // Excel trả số dạng double qua COM.
            var parsed = Adjustments.Parse(new IReadOnlyList<object?>[]
            {
                new object?[] { "Cộng giá trị báo giá", "Cộng", "Theo bảng báo giá", "", 100d, 100d },
                new object?[] { "Chiết khấu", "Giảm trừ", "% trên lũy kế", 5d, -5d, 95d },
                new object?[] { "Phí", "giam tru", "Số tiền", 10d, "#N/A", "#N/A" },
                new object?[] { "Thuế", "Cộng thêm", "% trên lũy kế", "", "", "#N/A" },
            });
            Assert.Equal(2, parsed.Adjustments.Count);
            Assert.Equal(("Chiết khấu", AdjustmentKind.Deduct, AdjustmentMethod.PercentOfRunning, (decimal?)5m),
                (parsed.Adjustments[0].Name, parsed.Adjustments[0].Kind, parsed.Adjustments[0].Method, parsed.Adjustments[0].Value));
            Assert.Equal(("Thuế", AdjustmentKind.Add, AdjustmentMethod.PercentOfRunning, (decimal?)null),
                (parsed.Adjustments[1].Name, parsed.Adjustments[1].Kind, parsed.Adjustments[1].Method, parsed.Adjustments[1].Value));
            Assert.Equal(new[] { 2 }, parsed.InvalidRows.ToArray());
        }

        [Fact]
        public void Kiem_tra_khoan_muc()
        {
            Assert.Empty(Adjustments.Validate(new[] { Discount, Vat }));
            var errors = Adjustments.Validate(new[]
            {
                new Adjustment(" ", Discount.Kind, Discount.Method, Discount.Value),
                new Adjustment(Discount.Name, Discount.Kind, Discount.Method, -1),
                new Adjustment(Discount.Name, Discount.Kind, Discount.Method, 120),
                new Adjustment(Vat.Name, Vat.Kind, Vat.Method, 120),
            });
            Assert.Equal(new[] { (0, "name"), (1, "value"), (2, "value") }, errors.Select(e => (e.Index, e.Field)).ToArray());
        }

        // ---------- phân tích đơn giá từ định mức ----------

        private static NormComponent NormComponent(string id, string resourceId, decimal consumption, int sortOrder)
        {
            var snapshots = new Dictionary<string, (string, string, string, ResourceType)>
            {
                ["xm"] = ("XM", "Xi măng", "kg", ResourceType.Material),
                ["nc"] = ("NC", "Nhân công", "công", ResourceType.Labor),
                ["ca"] = ("CAT", "Cát", "m3", ResourceType.Material),
            };
            var (code, name, unit, type) = snapshots[resourceId];
            return new NormComponent
            {
                Id = id, NormId = "nset", ResourceId = resourceId, ResourceCodeSnapshot = code, ResourceNameSnapshot = name,
                ResourceUnitSnapshot = unit, ResourceTypeSnapshot = type, Consumption = consumption, SortOrder = sortOrder,
            };
        }

        private static LibrarySnapshot CompositionLibrary() => new LibrarySnapshot
        {
            WorkItems = { new WorkItem { Id = "w1", Code = "007", Name = "Bê tông lót", Unit = "m3", UnitPrice = null } },
            Resources =
            {
                new Resource { Id = "xm", Code = "XM", Name = "Xi măng", Type = ResourceType.Material, Unit = "kg" },
                new Resource { Id = "nc", Code = "NC", Name = "Nhân công", Type = ResourceType.Labor, Unit = "công" },
                new Resource { Id = "ca", Code = "CAT", Name = "Cát", Type = ResourceType.Material, Unit = "m3" },
            },
            ResourcePrices =
            {
                new ResourcePrice { Id = "p1", ResourceId = "xm", Price = 1500, Unit = "kg", Currency = "VND", EffectiveFrom = "2026-01-01", EffectiveTo = "2026-12-31", Source = "NCC A" },
                new ResourcePrice { Id = "p2", ResourceId = "xm", Price = 1.5m, Unit = "tấn", Currency = "VND" },
                new ResourcePrice { Id = "p3", ResourceId = "nc", Price = 300000, Unit = "công", Currency = "VND" },
                new ResourcePrice { Id = "p4", ResourceId = "nc", Price = 320000, Unit = "công", Currency = "VND", EffectiveFrom = "2026-07-01" },
                new ResourcePrice { Id = "p5", ResourceId = "ca", Price = 10, Unit = "m3", Currency = "USD" },
            },
            Norms = { new Norm { Id = "nset", Code = "007", Name = "Bê tông lót", Unit = "m3", WorkItemId = "w1", Version = "1", Status = NormStatus.Approved } },
            NormComponents = { NormComponent("n1", "xm", 230.5m, 1), NormComponent("n2", "nc", 1.25m, 2) },
        };

        private const string Today = "2026-10-21";

        [Fact]
        public void Chi_chon_san_khi_co_dung_mot_gia_dung_duoc()
        {
            var library = CompositionLibrary();
            var lines = Composition.Lines(library.WorkItems[0], library, Today);
            var xm = lines.First(l => l.Component.Id == "n1");
            var nc = lines.First(l => l.Component.Id == "n2");
            Assert.Equal("p1", xm.DefaultPriceId);
            Assert.False(xm.Options.First(o => o.Price.Id == "p2").UnitMatches);
            Assert.Null(nc.DefaultPriceId);
            Assert.Equal(new Dictionary<string, string> { ["n1"] = "p1", ["n2"] = "" }, Composition.DefaultSelection(lines));
        }

        [Fact]
        public void Thieu_gia_don_gia_de_trong_van_ghi_dong_phan_tich()
        {
            var library = CompositionLibrary();
            var lines = Composition.Lines(library.WorkItems[0], library, Today);
            var result = Composition.Build(library.WorkItems[0], lines, Composition.DefaultSelection(lines), Rounding.NoRounding);
            Assert.True(result.Ok);
            Assert.Null(result.Preview);
            Assert.Equal(1, result.MissingCount);
            Assert.Equal(2, result.Rows.Count);
            Assert.Equal("", result.Rows[1][8]);
            Assert.Equal("'Chưa chọn giá: nhập Đơn giá nguồn; định mức 007 v1", result.Rows[1][11]);
        }

        [Fact]
        public void Du_gia_tam_tinh_theo_quy_tac_lam_tron()
        {
            var library = CompositionLibrary();
            var lines = Composition.Lines(library.WorkItems[0], library, Today);
            var rule = R(RoundingMode.Round, -3);
            var result = Composition.Build(library.WorkItems[0], lines, new Dictionary<string, string> { ["n1"] = "p1", ["n2"] = "p3" }, rule);
            Assert.Equal(721000m, result.Preview); // 230,5×1500 + 1,25×300000 = 720750
            Assert.Equal("VND", result.Currency);
            var row = result.Rows[0];
            Assert.Equal(new object[] { "'007", "'Bê tông lót", "'m3", "'XM", "'Xi măng", "Vật liệu", "'kg" }, row.Take(7).ToArray());
            Assert.Equal(230.5m, row[7]);
            Assert.Equal(1500m, row[8]);
            Assert.Equal(Analysis.LineAmountFormula(), row[9]);
            Assert.Equal(Analysis.UnitPriceFormula(rule), row[10]);
            Assert.Contains("NCC A; hiệu lực 01/01/2026 – 31/12/2026; VND", (string)row[11]);
        }

        [Fact]
        public void Chan_gia_khac_don_vi_va_khac_tien_te()
        {
            var library = CompositionLibrary();
            var item = library.WorkItems[0];
            var lines = Composition.Lines(item, library, Today);
            Assert.Contains("khác đơn vị", string.Join(",", Composition.Build(item, lines, new Dictionary<string, string> { ["n1"] = "p2", ["n2"] = "p3" }, Rounding.NoRounding).Errors));
            library.NormComponents.Add(NormComponent("n3", "ca", 1, 3));
            var lines2 = Composition.Lines(item, library, Today);
            Assert.Contains("khác tiền tệ", string.Join(",", Composition.Build(item, lines2, new Dictionary<string, string> { ["n1"] = "p1", ["n2"] = "p3", ["n3"] = "p5" }, Rounding.NoRounding).Errors));
        }

        [Fact]
        public void So_khop_ma_chinh_xac_bang_SUMPRODUCT()
        {
            var f = Analysis.UnitPriceFormula(Rounding.NoRounding);
            Assert.DoesNotContain("COUNTIFS", f);
            Assert.DoesNotContain("SUMIFS", f);
            Assert.Equal(
                "=IF(SUMPRODUCT(--(CQ_Analysis[Mã công tác]=[@[Mã công tác]]),--(CQ_Analysis[Thành tiền]=\"\"))>0,\"\",SUMPRODUCT(--(CQ_Analysis[Mã công tác]=[@[Mã công tác]]),CQ_Analysis[Thành tiền]))",
                f);
        }

        // ---------- so sánh công thức đọc lại từ Excel ----------

        [Fact]
        public void Excel_rut_gon_tham_chieu_toi_chinh_bang()
        {
            Assert.True(FormulaText.Same("=SUBTOTAL(109,[Thành tiền])", "=SUBTOTAL(109,CQ_Quote_1[Thành tiền])", "CQ_Quote_1"));
            Assert.True(FormulaText.Same("=ROW()-ROW(CQ_Quote_1[#Headers])", "=ROW()-ROW(CQ_Quote_1[#Headers])", "CQ_Quote_1"));
            Assert.False(FormulaText.Same("=SUBTOTAL(109,[Thành tiền])", "=SUBTOTAL(109,CQ_Quote_2[Thành tiền])", "CQ_Quote_1"));
            Assert.False(FormulaText.Same(100d, "=1", "T"));
        }

        [Fact]
        public void Excel_bo_ngoac_ten_cot_khong_co_dau_cach()
        {
            var expected = Adjustments.AmountFormula("CQ_Quote_1", Rounding.NoRounding);
            var asExcelStores = expected.Replace("[@[Loại]]", "[@Loại]");
            Assert.NotEqual(expected, asExcelStores);
            Assert.True(FormulaText.Same(asExcelStores, expected, "CQ_Summary_1"));
            Assert.False(FormulaText.Same("=[@[Khối lượng]]", "=[@Khối lượng]", "T"));
        }
    }
}
