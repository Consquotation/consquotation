using System;
using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Library;
using Xunit;

namespace ConsQuotation.Tests
{
    /// <summary>
    /// Chuyển từ tests/unit/libraryDomain.test.ts. Phần "chèn vào báo giá" (draftFromWorkItem) chuyển cùng
    /// luồng báo giá ở giai đoạn N4.
    /// </summary>
    public class LibraryDomainTests
    {
        private const string T = "2026-01-01T00:00:00.000Z";

        private static WorkItem Work(string id, string code, string name = "Công tác", string? categoryId = null, string unit = "m3",
            decimal? unitPrice = 100, string currency = "VND", string? from = null, string? to = null) => new WorkItem
        {
            Id = id, Code = code, Name = name, CategoryId = categoryId, Unit = unit, UnitPrice = unitPrice,
            Currency = currency, EffectiveFrom = from, EffectiveTo = to, CreatedAt = T, UpdatedAt = T,
        };

        private static Resource Resource(string id, string code, string unit = "kg") =>
            new Resource { Id = id, Code = code, Name = "Tài nguyên", Unit = unit, CreatedAt = T, UpdatedAt = T };

        private static ResourcePrice Price(string id, string resourceId, string? from = null, string unit = "kg",
            PriceStatus status = PriceStatus.Active, decimal value = 10) => new ResourcePrice
        {
            Id = id, ResourceId = resourceId, Price = value, Unit = unit, Currency = "VND", EffectiveFrom = from,
            Status = status, CreatedAt = T, UpdatedAt = T,
        };

        private static Norm NormSet(string id, string? workItemId = null) => new Norm
        {
            Id = id, Code = id.ToUpperInvariant(), Name = "Định mức thử", Unit = "m3", Version = "1", WorkItemId = workItemId,
            CreatedAt = T, UpdatedAt = T,
        };

        private static NormComponent Component(string id, string normId, string resourceId) => new NormComponent
        {
            Id = id, NormId = normId, ResourceId = resourceId, ResourceCodeSnapshot = "XM", ResourceNameSnapshot = "Tài nguyên",
            ResourceUnitSnapshot = "kg", Consumption = 1, SortOrder = 1, CreatedAt = T, UpdatedAt = T,
        };

        private static WorkItemForm Form() => new WorkItemForm
        {
            Code = "BT-01", Name = "Bê tông móng", Unit = "m3", UnitPrice = "1500000", Currency = "VND",
            Source = "Báo giá NCC A", EffectiveFrom = "2026-01-01", EffectiveTo = "2026-12-31",
        };

        private static string[] Codes(IEnumerable<WorkItem> items) => items.Select(i => i.Code).ToArray();

        // ---------- dates ----------

        [Fact]
        public void Chi_nhan_ngay_co_that_dang_ISO()
        {
            Assert.True(Dates.IsIsoDate("2026-02-28"));
            Assert.False(Dates.IsIsoDate("2026-02-30"));
            Assert.False(Dates.IsIsoDate("28/02/2026"));
        }

        [Fact]
        public void TodayIso_dung_gio_may_va_dinh_dang_hien_thi()
        {
            Assert.Equal("2026-10-20", Dates.TodayIso(new DateTime(2026, 10, 20, 23, 59, 0)));
            Assert.Equal("20/10/2026", Dates.FormatIsoDate("2026-10-20"));
            Assert.Equal("", Dates.FormatIsoDate(null));
        }

        [Theory]
        [InlineData(null, null, Validity.NoDates)]
        [InlineData("2026-11-01", null, Validity.NotYetEffective)]
        [InlineData(null, "2026-10-19", Validity.Expired)]
        [InlineData("2026-10-01", "2026-10-20", Validity.Active)]
        [InlineData("2026-10-20", "2026-10-20", Validity.Active)]
        public void Hieu_luc_tai_2026_10_20(string? from, string? to, Validity expected)
        {
            Assert.Equal(expected, Dates.ValidityOn(from, to, "2026-10-20"));
        }

        [Fact]
        public void Khoang_hieu_luc_mo()
        {
            Assert.True(Dates.PeriodsOverlap(null, null, "2026-01-01", null));
            Assert.False(Dates.PeriodsOverlap("2026-01-01", "2026-06-30", "2026-07-01", null));
        }

        // ---------- search ----------

        private static readonly WorkItem[] Items =
        {
            Work("1", "BT-02", "Bê tông lót", "c-mong"),
            Work("2", "BT-01", "Bê tông móng", "c-mong"),
            Work("3", "DD-01", "Đào đất hố móng", "c-dat"),
            Work("4", "XT-10", "Xây tường gạch", "c-than", "m2"),
        };

        private static readonly NameLookup Lookup = new NameLookup(new[]
        {
            new Category { Id = "c-mong", Name = "Móng" },
            new Category { Id = "c-dat", Name = "Đất" },
            new Category { Id = "c-than", Name = "Thân" },
        }, new Supplier[0]);

        [Fact]
        public void Tim_khong_phan_biet_dau_va_hoa_thuong_ke_ca_chu_d()
        {
            Assert.Equal("dao dat", Search.NormalizeForSearch("  Đào ĐẤT  "));
            Assert.Equal(new[] { "BT-01", "BT-02" }, Codes(Search.SearchWorkItems(Items, new ListFilter { Query = "be tong" })));
            Assert.Equal(new[] { "DD-01" }, Codes(Search.SearchWorkItems(Items, new ListFilter { Query = "dao dat" })));
        }

        [Fact]
        public void Tim_theo_ma_nhom_don_vi_moi_tu_phai_khop()
        {
            Assert.Equal(new[] { "XT-10" }, Codes(Search.SearchWorkItems(Items, new ListFilter { Query = "xt-10" })));
            Assert.Equal(new[] { "XT-10" }, Codes(Search.SearchWorkItems(Items, new ListFilter { Query = "m2" })));
            Assert.Equal(new[] { "BT-02" }, Codes(Search.SearchWorkItems(Items, new ListFilter { Query = "mong lot" }, Lookup)));
            Assert.Equal(new[] { "XT-10" }, Codes(Search.SearchWorkItems(Items, new ListFilter { Query = "than" }, Lookup)));
        }

        [Fact]
        public void Loc_theo_nhom_va_sap_theo_ma_so_tu_nhien()
        {
            Assert.Equal(new[] { "BT-01", "BT-02" }, Codes(Search.SearchWorkItems(Items, new ListFilter { CategoryId = "c-mong" })));
            var numbered = new[] { Work("a", "BT-10"), Work("b", "BT-2"), Work("c", "BT-1"), Work("d", "AB") };
            Assert.Equal(new[] { "AB", "BT-1", "BT-2", "BT-10" }, Codes(Search.SearchWorkItems(numbered)));
        }

        // ---------- validateWorkItemForm ----------

        private static readonly LibrarySnapshot NoLib = new LibrarySnapshot();

        private static string[] ErrorFields<T>(FormResult<T> r) where T : class => r.Errors.Select(e => e.Field).ToArray();

        [Fact]
        public void Cong_tac_hop_le_phuong_phap_direct()
        {
            var result = Validation.ValidateWorkItem(Form(), NoLib, null);
            Assert.True(result.Ok);
            Assert.Equal(1500000m, result.Value!.UnitPrice);
            Assert.Equal(PricingMethod.Direct, result.Value.PricingMethod);
        }

        [Fact]
        public void Don_gia_trong_la_null_khong_phai_0()
        {
            var form = Form();
            form.UnitPrice = "";
            var result = Validation.ValidateWorkItem(form, NoLib, null);
            Assert.True(result.Ok);
            Assert.Null(result.Value!.UnitPrice);
        }

        [Fact]
        public void Bat_buoc_ma_ten_don_vi_bao_dung_truong()
        {
            var form = Form();
            form.Code = " ";
            form.Name = "";
            form.Unit = "";
            Assert.Equal(new[] { "code", "name", "unit" }, ErrorFields(Validation.ValidateWorkItem(form, NoLib, null)));
        }

        [Fact]
        public void Chan_ma_trung_nhung_cho_sua_chinh_no()
        {
            var lib = new LibrarySnapshot { WorkItems = { Work("x", "bt-01 ") } };
            Assert.False(Validation.ValidateWorkItem(Form(), lib, null).Ok);
            Assert.True(Validation.ValidateWorkItem(Form(), lib, "x").Ok);
            Assert.Equal("bt-01", Names.NormalizeCode(" BT-01 "));
        }

        [Fact]
        public void Kiem_tra_ngay_hieu_luc_va_tien_te()
        {
            var form = Form();
            form.EffectiveFrom = "2026-12-31";
            form.EffectiveTo = "2026-01-01";
            form.Currency = "";
            Assert.Equal(new[] { "currency", "effectiveTo" }, ErrorFields(Validation.ValidateWorkItem(form, NoLib, null)).OrderBy(f => f, StringComparer.Ordinal).ToArray());
            var badDate = Form();
            badDate.EffectiveFrom = "2026-02-30";
            Assert.Equal("effectiveFrom", Validation.ValidateWorkItem(badDate, NoLib, null).Errors[0].Field);
        }

        [Fact]
        public void Tu_choi_don_gia_am_hoac_phan_cach_hang_nghin()
        {
            var negative = Form();
            negative.UnitPrice = "-1";
            Assert.False(Validation.ValidateWorkItem(negative, NoLib, null).Ok);
            var thousands = Form();
            thousands.UnitPrice = "1.500.000";
            Assert.False(Validation.ValidateWorkItem(thousands, NoLib, null).Ok);
        }

        // ---------- tài nguyên, giá, thành phần định mức ----------

        private static LibrarySnapshot ResLib() => new LibrarySnapshot
        {
            WorkItems = { Work("w1", "BT-01") },
            Resources = { Resource("r1", "XM"), Resource("r2", "CAT") },
            Norms = { NormSet("n1", "w1") },
            NormComponents = { Component("c1", "n1", "r1") },
        };

        [Fact]
        public void Tai_nguyen_bat_buoc_va_chan_ma_trung()
        {
            Assert.False(Validation.ValidateResource(new ResourceForm { Code = "xm", Name = "Xi măng", Unit = "kg" }, ResLib(), null).Ok);
            Assert.True(Validation.ValidateResource(new ResourceForm { Code = "DA", Name = "Đá", Unit = "m3" }, ResLib(), null).Ok);
        }

        [Fact]
        public void Gia_bat_buoc_khong_am_nhan_dau_phay_thap_phan()
        {
            Assert.False(Validation.ValidatePrice(new PriceForm { Price = "", Unit = "kg" }, new Supplier[0]).Ok);
            Assert.False(Validation.ValidatePrice(new PriceForm { Price = "-5", Unit = "kg" }, new Supplier[0]).Ok);
            var ok = Validation.ValidatePrice(new PriceForm { Price = "1850,5", Unit = "kg" }, new Supplier[0]);
            Assert.True(ok.Ok);
            Assert.Equal(1850.5m, ok.Value!.Price);
        }

        [Fact]
        public void Thanh_phan_dinh_muc()
        {
            var lib = ResLib();
            var n1 = lib.Norms[0];
            NormComponentForm F(string resourceId, string consumption) => new NormComponentForm { ResourceId = resourceId, Consumption = consumption };
            Assert.False(Validation.ValidateNormComponent(F("r1", "1"), n1, lib, null).Ok);
            Assert.True(Validation.ValidateNormComponent(F("r1", "1"), n1, lib, "c1").Ok);
            Assert.False(Validation.ValidateNormComponent(F("rx", "1"), n1, lib, null).Ok);
            Assert.False(Validation.ValidateNormComponent(F("r2", "0"), n1, lib, null).Ok);
            var ok = Validation.ValidateNormComponent(F("r2", "0,35"), n1, lib, null);
            Assert.True(ok.Ok);
            Assert.Equal(0.35m, ok.Value!.Consumption);
        }

        // ---------- libraryIssues ----------

        private const string Today = "2026-10-20";

        private static IssueKind[] Kinds(IEnumerable<LibraryIssue> issues) => issues.Select(i => i.Kind).ToArray();

        [Fact]
        public void Thu_vien_sach_khong_co_van_de()
        {
            Assert.Empty(LibraryCheck.Issues(new LibrarySnapshot { WorkItems = { Work("1", "A") } }, Today));
        }

        [Fact]
        public void Phat_hien_ma_trung_thieu_gia_het_han_chua_hieu_luc()
        {
            var issues = LibraryCheck.Issues(new LibrarySnapshot
            {
                WorkItems =
                {
                    Work("1", "A"), Work("2", "a"), Work("3", "B", unitPrice: null),
                    Work("4", "C", to: "2026-10-19"), Work("5", "D", from: "2026-11-01"),
                },
            }, Today);
            Assert.Equal(2, issues.Count(i => i.Kind == IssueKind.DuplicateWorkItemCode));
            Assert.Equal("3", issues.First(i => i.Kind == IssueKind.MissingPrice).EntityId);
            Assert.Equal("4", issues.First(i => i.Kind == IssueKind.ExpiredPrice).EntityId);
            Assert.Equal("5", issues.First(i => i.Kind == IssueKind.NotYetEffectivePrice).EntityId);
        }

        [Fact]
        public void Phat_hien_lien_ket_hong_don_vi_khong_khop_gia_chong_thoi_gian()
        {
            var issues = LibraryCheck.Issues(new LibrarySnapshot
            {
                WorkItems = { Work("w1", "W") },
                Resources = { Resource("r1", "XM") },
                ResourcePrices =
                {
                    Price("p1", "r1", "2026-01-01"),
                    Price("p2", "r1", "2026-06-01", "tấn"),
                    Price("p3", "rX"),
                },
                Norms = { NormSet("n1", "w1"), NormSet("n2", "wGone") },
                NormComponents = { Component("c1", "n1", "rGone"), Component("c2", "n2", "r1") },
            }, Today);
            var kinds = Kinds(issues);
            Assert.Contains(IssueKind.BrokenNormResource, kinds);
            Assert.Contains(IssueKind.BrokenNormWorkItem, kinds);
            Assert.Contains(IssueKind.BrokenPriceResource, kinds);
            Assert.Contains(IssueKind.PriceUnitMismatch, kinds);
            Assert.Contains(IssueKind.OverlappingPrices, kinds);
        }

        [Fact]
        public void Gia_ngung_dung_khong_tinh_chong_thoi_gian()
        {
            var issues = LibraryCheck.Issues(new LibrarySnapshot
            {
                Resources = { Resource("r1", "XM") },
                ResourcePrices = { Price("p1", "r1"), Price("p2", "r1", status: PriceStatus.Inactive) },
            }, Today);
            Assert.DoesNotContain(IssueKind.OverlappingPrices, Kinds(issues));
        }

        [Fact]
        public void Canh_bao_gia_bang_0_phan_biet_voi_chua_co_gia()
        {
            var issues = LibraryCheck.Issues(new LibrarySnapshot
            {
                WorkItems = { Work("a", "A", "A", unitPrice: 0) },
                Resources = { new Resource { Id = "r", Code = "R", Name = "R", Unit = "kg" } },
                ResourcePrices = { Price("p", "r", value: 0) },
            }, "2026-10-21");
            Assert.Equal(new[] { IssueEntity.WorkItem, IssueEntity.Price }, issues.Where(i => i.Kind == IssueKind.ZeroPrice).Select(i => i.Entity).ToArray());
            Assert.DoesNotContain(IssueKind.MissingPrice, Kinds(issues));
        }
    }
}
