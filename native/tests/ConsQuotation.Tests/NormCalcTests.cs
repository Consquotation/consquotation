using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Pricing;
using Xunit;
using static ConsQuotation.Tests.Fixtures;

namespace ConsQuotation.Tests
{
    /// <summary>Chuyển từ tests/unit/normCalc.test.ts.</summary>
    public class NormCalcTests
    {
        private static readonly CalcOptions Opts = new CalcOptions("2026-10-27", T);

        private static CalcOptions With(IReadOnlyDictionary<string, string>? selection = null, RoundingRule? rounding = null) =>
            new CalcOptions("2026-10-27", T) { PriceSelection = selection, Rounding = rounding };

        private static readonly Resource A = Res("a", ResourceType.Material, "kg");
        private static readonly Resource B = Res("b", ResourceType.Labor, "công");
        private static readonly Resource C = Res("c", ResourceType.Machine, "ca");
        private static readonly ResourcePrice[] Prices =
            { Price("pa", "a", 10000, "kg"), Price("pb", "b", 40000, "công"), Price("pc", "c", 80000, "ca") };

        private static LibrarySnapshot LibAbc(IEnumerable<ResourcePrice>? prices = null) => Lib(new[] { A, B, C }, prices ?? Prices);

        private static string[] Codes(NormCalcResult r) => r.Issues.Select(i => i.Code.ToString()).ToArray();

        [Fact]
        public void So_thap_phan_chinh_xac_cong_nhan()
        {
            Assert.Equal(0.3m, 0.1m + 0.2m);
            Assert.Equal(0.3m, 0.1m * 3m);
            Assert.Equal(1296296.28555m, 1.05m * 1234567.891m);
            Assert.Equal(-2.75m, -5m + 2.25m);
            Assert.Equal("0.00000015", DecimalInput.Format(0.00000015m));
        }

        [Theory]
        [InlineData("2.5", 0, DecimalRoundingMode.Round, "3")]
        [InlineData("-2.5", 0, DecimalRoundingMode.Round, "-3")]
        [InlineData("1.005", 2, DecimalRoundingMode.Round, "1.01")]
        [InlineData("1.001", 2, DecimalRoundingMode.RoundUp, "1.01")]
        [InlineData("-1.009", 2, DecimalRoundingMode.RoundDown, "-1")]
        [InlineData("1234567.4", -3, DecimalRoundingMode.Round, "1235000")]
        [InlineData("1234", -3, DecimalRoundingMode.RoundDown, "1000")]
        [InlineData("999.5", 0, DecimalRoundingMode.Round, "1000")]
        [InlineData("12", 2, DecimalRoundingMode.Round, "12")]
        [InlineData("-1234.5", -2, DecimalRoundingMode.RoundUp, "-1300")]
        public void Lam_tron_giong_Excel(string value, int digits, DecimalRoundingMode mode, string expected)
        {
            var result = DecimalMath.Round(decimal.Parse(value, System.Globalization.CultureInfo.InvariantCulture), digits, mode);
            Assert.Equal(expected, DecimalInput.Format(result));
        }

        [Fact]
        public void Ca_chuan_60000_va_tong_theo_nhom()
        {
            var r = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 2), Comp("c2", B, 0.5m), Comp("c3", C, 0.25m) }, LibAbc(), Opts);
            Assert.Equal(CalcStatus.Valid, r.Status);
            Assert.Equal(new decimal?[] { 20000, 20000, 20000 }, r.Components.Select(c => c.Amount).ToArray());
            Assert.Equal(20000m, r.TotalsByType[ResourceType.Material]);
            Assert.Equal(20000m, r.TotalsByType[ResourceType.Labor]);
            Assert.Equal(20000m, r.TotalsByType[ResourceType.Machine]);
            Assert.Equal(0m, r.TotalsByType[ResourceType.Other]);
            Assert.Equal(60000m, r.UnitPrice);
            Assert.Equal("VND", r.Currency);
        }

        [Fact]
        public void Hao_hut_5_phan_tram()
        {
            var r = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 2, 0.05m), Comp("c2", B, 0.5m), Comp("c3", C, 0.25m) }, LibAbc(), Opts);
            Assert.Equal(2.1m, r.Components[0].EffectiveConsumption);
            Assert.True(r.Components[0].WasteApplied);
            Assert.Equal(21000m, r.Components[0].Amount);
            Assert.Equal(61000m, r.UnitPrice);
        }

        [Fact]
        public void Dinh_muc_da_gom_hao_hut_khong_cong_them()
        {
            var r = NormCalc.Calculate(Norm(wasteIncluded: true), new[] { Comp("c1", A, 2, 0.05m) }, LibAbc(), Opts);
            Assert.Equal(CalcStatus.ValidWithWarnings, r.Status);
            Assert.Equal(2m, r.Components[0].EffectiveConsumption);
            Assert.False(r.Components[0].WasteApplied);
            Assert.Equal(20000m, r.Components[0].Amount);
            Assert.Equal(new[] { "WasteIgnored" }, Codes(r));
        }

        [Fact]
        public void Giu_do_chinh_xac_chi_lam_tron_mot_lan()
        {
            var a2 = Res("a2", ResourceType.Material, "kg");
            var exact = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1), Comp("c2", a2, 1) },
                Lib(new[] { A, a2 }, new[] { Price("pa", "a", 0.1m, "kg"), Price("pa2", "a2", 0.2m, "kg") }), Opts);
            Assert.Equal(0.3m, exact.UnitPriceExact);
            Assert.Equal(0.3m, exact.UnitPrice);
            var many = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1.2345m) },
                Lib(new[] { A }, new[] { Price("pa", "a", 1234.5678m, "kg") }), With(rounding: new RoundingRule(RoundingMode.Round, 0)));
            Assert.Equal(1524.0739491m, many.UnitPriceExact);
            Assert.Equal(1524m, many.UnitPrice);
            Assert.Equal(1524.0739491m, many.Components[0].Amount);
        }

        [Fact]
        public void Khong_cong_trung_cung_tai_nguyen()
        {
            var r = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1), Comp("c2", A, 1) }, LibAbc(), Opts);
            Assert.Equal(CalcStatus.Invalid, r.Status);
            Assert.Null(r.UnitPrice);
            Assert.Contains("DuplicateComponent", Codes(r));
        }

        [Fact]
        public void Rong_thieu_tai_nguyen_thieu_gia_la_invalid_don_gia_null()
        {
            var empty = NormCalc.Calculate(Norm(), new NormComponent[0], LibAbc(), Opts);
            Assert.Equal(CalcStatus.Invalid, empty.Status);
            Assert.Null(empty.UnitPrice);
            Assert.Null(empty.TotalsByType[ResourceType.Material]);

            var missing = NormCalc.Calculate(Norm(), new[] { Comp("c1", Res("x", ResourceType.Material, "kg"), 1) }, LibAbc(), Opts);
            Assert.Equal(CalcIssueCode.ResourceMissing, missing.Issues[0].Code);
            Assert.Equal("c1", missing.Issues[0].ComponentId);

            var noPrice = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1) }, Lib(new[] { A }), Opts);
            Assert.Equal(CalcIssueCode.MissingPrice, noPrice.Issues[0].Code);
            Assert.Null(noPrice.Components[0].Amount);

            var unlinked = Comp("c1", A, 1);
            unlinked.ResourceId = "";
            Assert.Equal(CalcIssueCode.NoResourceLink, NormCalc.Calculate(Norm(), new[] { unlinked }, LibAbc(), Opts).Issues[0].Code);
        }

        [Fact]
        public void Don_gia_0_canh_bao_don_gia_am_la_loi()
        {
            var zero = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 2) }, Lib(new[] { A }, new[] { Price("pa", "a", 0, "kg") }), Opts);
            Assert.Equal(CalcStatus.ValidWithWarnings, zero.Status);
            Assert.Equal(0m, zero.UnitPrice);
            Assert.Equal(CalcIssueCode.ZeroPrice, zero.Issues[0].Code);
            var negative = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 2) }, Lib(new[] { A }, new[] { Price("pa", "a", -1, "kg") }), Opts);
            Assert.Contains("InvalidPrice", Codes(negative));
            // Bản web còn kiểm NaN; decimal không chứa được NaN, số hỏng bị chặn ở bước nhập file (N2).
        }

        [Fact]
        public void Hao_phi_0_canh_bao_hao_phi_am_la_loi()
        {
            var zero = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 0) }, LibAbc(), Opts);
            Assert.Equal(CalcStatus.ValidWithWarnings, zero.Status);
            Assert.Equal(0m, zero.UnitPrice);
            Assert.Equal(CalcIssueCode.InvalidConsumption, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, -1) }, LibAbc(), Opts).Issues[0].Code);
        }

        [Fact]
        public void Hao_hut_am_hoac_vuot_100_la_loi()
        {
            Assert.Equal(CalcIssueCode.InvalidWasteRate, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1, -0.01m) }, LibAbc(), Opts).Issues[0].Code);
            Assert.Equal(CalcIssueCode.InvalidWasteRate, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1, 5) }, LibAbc(), Opts).Issues[0].Code);
            Assert.Equal(20000m, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1, 1) }, LibAbc(), Opts).UnitPrice);
        }

        [Fact]
        public void Don_vi_khong_tuong_thich()
        {
            var ton = Lib(new[] { A }, new[] { Price("pa", "a", 1, "tấn") });
            Assert.Equal(CalcIssueCode.PriceUnitMismatch,
                NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1) }, ton, With(new Dictionary<string, string> { ["c1"] = "pa" })).Issues[0].Code);
            // Không tự chọn giá khác đơn vị.
            Assert.Equal(CalcIssueCode.MissingPrice, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1) }, ton, Opts).Issues[0].Code);
            var changed = Comp("c1", A, 1);
            changed.ResourceUnitSnapshot = "bao";
            Assert.Equal(CalcIssueCode.ResourceUnitChanged, NormCalc.Calculate(Norm(), new[] { changed }, LibAbc(), Opts).Issues[0].Code);
        }

        [Fact]
        public void Tai_nguyen_doi_ma_ten_canh_bao_dung_du_lieu_hien_tai()
        {
            var renamed = Comp("c1", A, 1);
            renamed.ResourceCodeSnapshot = "CU";
            renamed.ResourceNameSnapshot = "Tên cũ";
            var r = NormCalc.Calculate(Norm(), new[] { renamed }, LibAbc(), Opts);
            Assert.Equal(CalcStatus.ValidWithWarnings, r.Status);
            Assert.Equal("A", r.Components[0].ResourceCode);
            Assert.Equal(CalcIssueCode.ResourceRenamed, r.Issues[0].Code);
        }

        [Fact]
        public void Nhieu_gia_khong_tu_chon()
        {
            var lib = Lib(new[] { A }, new[] { Price("p1", "a", 100, "kg"), Price("p2", "a", 120, "kg") });
            Assert.Equal(CalcIssueCode.AmbiguousPrice, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1) }, lib, Opts).Issues[0].Code);
            Assert.Equal(120m, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1) }, lib, With(new Dictionary<string, string> { ["c1"] = "p2" })).UnitPrice);
            Assert.Equal(CalcIssueCode.SelectedPriceMissing,
                NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1) }, lib, With(new Dictionary<string, string> { ["c1"] = "p9" })).Issues[0].Code);
        }

        [Fact]
        public void Gia_het_hieu_luc_hoac_ngung_dung_chi_dung_khi_nguoi_dung_chon()
        {
            var lib = Lib(new[] { A }, new[] { Price("p1", "a", 100, "kg", to: "2026-01-01", status: PriceStatus.Inactive) });
            Assert.Equal(CalcIssueCode.MissingPrice, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1) }, lib, Opts).Issues[0].Code);
            var chosen = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1) }, lib, With(new Dictionary<string, string> { ["c1"] = "p1" }));
            Assert.Equal(CalcStatus.ValidWithWarnings, chosen.Status);
            Assert.Equal(new[] { "InactivePrice", "PriceNotInEffect" }, Codes(chosen).OrderBy(c => c).ToArray());
        }

        [Fact]
        public void Khac_tien_te_ngung_dung_thieu_don_vi()
        {
            var lib = Lib(new[] { A, B }, new[] { Price("pa", "a", 1, "kg"), Price("pb", "b", 1, "công", currency: "USD") });
            Assert.Contains("CurrencyMismatch", Codes(NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1), Comp("c2", B, 1) }, lib, Opts)));
            Assert.Equal(CalcIssueCode.NormInactive, NormCalc.Calculate(Norm(status: NormStatus.Inactive), new[] { Comp("c1", A, 1) }, LibAbc(), Opts).Issues[0].Code);
            Assert.Equal(CalcIssueCode.MissingWorkUnit, NormCalc.Calculate(Norm(unit: " "), new[] { Comp("c1", A, 1) }, LibAbc(), Opts).Issues[0].Code);
        }

        [Fact]
        public void So_rat_lon_vuot_15_chu_so_la_loi()
        {
            var big = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 1e9m) }, Lib(new[] { A }, new[] { Price("pa", "a", 1e9m, "kg") }), Opts);
            Assert.Equal(CalcIssueCode.Overflow, big.Issues[0].Code);
            var ok = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 123456.789m) }, Lib(new[] { A }, new[] { Price("pa", "a", 9876543.21m, "kg") }), Opts);
            Assert.Equal(1219326311126.35269m, ok.UnitPriceExact);
        }

        [Fact]
        public void Phien_ban_khong_ton_tai_la_invalid()
        {
            var r = NormCalc.CalculateById("khong-co", LibAbc(), Opts);
            Assert.Equal(CalcStatus.Invalid, r.Status);
            Assert.Null(r.UnitPrice);
            Assert.Equal(CalcIssueCode.NormNotFound, r.Issues[0].Code);
        }

        [Fact]
        public void Van_tay_doi_khi_gia_doi()
        {
            var before = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 2) }, LibAbc(), Opts);
            var after = NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 2) },
                LibAbc(new[] { Price("pa", "a", 11000, "kg", updatedAt: "2026-10-28T00:00:00.000Z") }), Opts);
            Assert.NotEqual(before.InputFingerprint, after.InputFingerprint);
            Assert.Equal(22000m, after.UnitPrice);
            Assert.Equal(before.InputFingerprint, NormCalc.Calculate(Norm(), new[] { Comp("c1", A, 2) }, LibAbc(), Opts).InputFingerprint);
        }

        [Fact]
        public void Van_tay_cung_thuat_toan_voi_ban_web()
        {
            // Giá trị tham chiếu tính bằng chính hashText() của bản web (Node), gồm chữ Việt và chuỗi đủ dài để tràn số 32-bit.
            Assert.Equal("1505", NormCalc.HashText(""));
            Assert.Equal("2b606", NormCalc.HashText("a"));
            Assert.Equal("a3c3ed84", NormCalc.HashText("n1|2026-10-27T00:00:00.000Z|false|approved\nc1|x"));
            Assert.Equal("592d48f8", NormCalc.HashText("Bê tông đá 1x2 — thử"));
        }

        [Fact]
        public void Kiem_tra_lai_truoc_khi_xuat()
        {
            const string later = "2026-10-28T00:00:00.000Z";
            var norm = Norm();
            var parts = new[] { Comp("c1", A, 2), Comp("c2", B, 0.5m) };
            LibrarySnapshot Fresh(IEnumerable<Norm>? norms = null, IEnumerable<NormComponent>? comps = null,
                IEnumerable<Resource>? resources = null, IEnumerable<ResourcePrice>? prices = null) =>
                Lib(resources ?? new[] { A, B, C }, prices ?? Prices, norms ?? new[] { norm }, comps ?? parts);
            var shown = NormCalc.Calculate(norm, parts, LibAbc(), Opts);
            var same = NormCalc.Recheck(shown, Fresh(), Opts);
            Assert.NotNull(same);
            Assert.Equal(40000m, same!.Value.Result.UnitPrice);
            Assert.Same(norm, same.Value.Norm);
            // Giá đổi ở cửa sổ khác.
            Assert.Null(NormCalc.Recheck(shown, Fresh(prices: new[] { Price("pa", "a", 11000, "kg", updatedAt: later), Prices[1], Prices[2] }), Opts));
            // Thêm giá thứ hai cho A: không còn tự chọn được giá.
            Assert.Null(NormCalc.Recheck(shown, Fresh(prices: Prices.Concat(new[] { Price("pa2", "a", 12000, "kg") })), Opts));
            // Tài nguyên đổi tên, định mức đổi, thành phần bị xóa hoặc đổi giá áp dụng.
            var renamed = Copy(A);
            renamed.Name = "Tên mới";
            renamed.UpdatedAt = later;
            Assert.Null(NormCalc.Recheck(shown, Fresh(resources: new[] { renamed, B, C }), Opts));
            Assert.Null(NormCalc.Recheck(shown, Fresh(norms: new[] { Norm(updatedAt: later) }), Opts));
            Assert.Null(NormCalc.Recheck(shown, Fresh(comps: new[] { parts[0] }), Opts));
            var repriced = Copy(parts[0]);
            repriced.PriceId = "pa";
            repriced.UpdatedAt = later;
            Assert.Null(NormCalc.Recheck(shown, Fresh(comps: new[] { repriced, parts[1] }), Opts));
            // Định mức bị xóa.
            Assert.Null(NormCalc.Recheck(shown, Fresh(norms: new Norm[0]), Opts));
            // Giá của tài nguyên không dùng trong định mức đổi thì vẫn xuất được.
            Assert.NotNull(NormCalc.Recheck(shown, Fresh(prices: new[] { Prices[0], Prices[1], Price("pc", "c", 1, "ca", updatedAt: later) }), Opts));
        }

        [Fact]
        public void Thu_tu_theo_sortOrder_200_thanh_phan_tinh_nhanh()
        {
            var resources = Enumerable.Range(0, 200).Select(i => Res($"r{i}", ResourceType.Material, "kg")).ToList();
            var prices = resources.Select((r, i) => Price($"p{i}", r.Id, 1000 + i, "kg")).ToList();
            var parts = resources.Select((r, i) => Comp($"c{200 - i}", r, 0.1m, sortOrder: 200 - i)).ToList();
            var watch = Stopwatch.StartNew();
            var result = NormCalc.Calculate(Norm(), parts, Lib(resources, prices), Opts);
            Assert.True(watch.ElapsedMilliseconds < 500, $"{watch.ElapsedMilliseconds} ms");
            Assert.Equal(1, result.Components[0].SortOrder);
            Assert.Equal(21990m, result.UnitPriceExact);
        }
    }
}
