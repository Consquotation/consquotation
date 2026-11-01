using System;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using Xunit;

namespace ConsQuotation.Tests
{
    /// <summary>
    /// Chuyển phần nghiệp vụ của tests/unit/libraryV2.test.ts và tests/unit/norms.test.ts (kiểm tra form,
    /// tìm kiếm, khóa phiên bản định mức, chuyển trạng thái). Các ca đi qua dịch vụ thư viện và lưu trữ
    /// (nâng cấp schema, nhập/xuất, sao chép phiên bản) chuyển ở giai đoạn N2.
    /// </summary>
    public class LibraryRulesTests
    {
        private const string T = "2026-10-26T00:00:00.000Z";

        private static WorkItemForm Work() => new WorkItemForm { Code = "TH-01", Name = "Thử bê tông", Unit = "m3", UnitPrice = "1250000", Currency = "VND" };

        private static PriceForm PriceForm() => new PriceForm { Price = "1850", Unit = "kg", Currency = "VND", Source = "Báo giá thử" };

        private static WorkItem Item(string id, string code, string name = "", string? categoryId = null, string? supplierId = null, decimal? unitPrice = 100) =>
            new WorkItem { Id = id, Code = code, Name = name, CategoryId = categoryId, SupplierId = supplierId, Unit = "m3", UnitPrice = unitPrice, Currency = "VND", CreatedAt = T, UpdatedAt = T };

        private static readonly LibrarySnapshot Empty = new LibrarySnapshot();

        private static string[] Fields<T>(FormResult<T> r) where T : class => r.Errors.Select(e => e.Field).OrderBy(f => f, StringComparer.Ordinal).ToArray();

        // ---------- kiểm tra dữ liệu đơn giá (libraryV2) ----------

        [Fact]
        public void Ten_tieng_Viet_co_dau_hop_le_thieu_ten_don_vi_bao_dung_truong()
        {
            var form = Work();
            form.Name = "Trồng cây Sao đen, bầu đất Ø40";
            Assert.Equal("Trồng cây Sao đen, bầu đất Ø40", Validation.ValidateWorkItem(form, Empty, null).Value!.Name);
            var bad = Work();
            bad.Name = " ";
            bad.Unit = "";
            Assert.Equal(new[] { "name", "unit" }, Validation.ValidateWorkItem(bad, Empty, null).Errors.Select(e => e.Field).ToArray());
        }

        [Theory]
        [InlineData("0", true)]
        [InlineData("-1", false)]
        [InlineData("1.250.000 VNĐ", false)]
        [InlineData("abc", false)]
        public void Don_gia_0_duoc_luu_am_va_chu_bi_tu_choi(string price, bool ok)
        {
            var form = PriceForm();
            form.Price = price;
            Assert.Equal(ok, Validation.ValidatePrice(form, new Supplier[0]).Ok);
        }

        [Fact]
        public void Ngay_ap_dung_khong_hop_le_bi_tu_choi()
        {
            var price = PriceForm();
            price.EffectiveFrom = "2026-02-30";
            Assert.False(Validation.ValidatePrice(price, new Supplier[0]).Ok);
            var work = Work();
            work.EffectiveFrom = "31/12/2026";
            Assert.False(Validation.ValidateWorkItem(work, Empty, null).Ok);
        }

        [Fact]
        public void Nhom_hoac_nha_cung_cap_khong_ton_tai_bi_tu_choi()
        {
            var form = Work();
            form.CategoryId = "khong-co";
            form.SupplierId = "khong-co";
            Assert.Equal(new[] { "categoryId", "supplierId" }, Fields(Validation.ValidateWorkItem(form, Empty, null)));
            var price = PriceForm();
            price.SupplierId = "khong-co";
            Assert.False(Validation.ValidatePrice(price, new Supplier[0]).Ok);
        }

        [Fact]
        public void Cung_ten_khac_ma_duoc_luu_chi_canh_bao()
        {
            var existing = Item("a", "A-1", "Thử Bê Tông");
            var form = Work();
            form.Code = "A-2";
            Assert.True(Validation.ValidateWorkItem(form, new LibrarySnapshot { WorkItems = { existing } }, null).Ok);
            Assert.Equal(new[] { "A-1" }, Validation.SameNameRecords("thu be tong", new[] { existing }, w => w.Id, w => w.Name, null).Select(x => x.Code).ToArray());
            Assert.Empty(Validation.SameNameRecords("thu be tong", new[] { existing }, w => w.Id, w => w.Name, "a"));
            var issues = LibraryCheck.Issues(new LibrarySnapshot { WorkItems = { existing, Item("b", "A-2", "Thử Bê Tông") } }, "2026-10-26");
            Assert.Equal(2, issues.Count(i => i.Kind == IssueKind.SameName));
        }

        [Fact]
        public void Ten_nhom_chuan_hoa_giu_dau_va_gioi_han_do_dai()
        {
            Assert.Equal("cát vàng", Names.NormalizeName("  Cát   Vàng "));
            Assert.NotEqual(Names.NormalizeName("Cát"), Names.NormalizeName("Cạt"));
            Assert.False(Validation.ValidateCategory(new CategoryForm { Name = new string('x', 121) }, new Category[0], null).Ok);
            Assert.False(Validation.ValidateSupplier(new SupplierForm { Name = "A", ContactInfo = new string('x', 501) }, new Supplier[0], null).Ok);
        }

        [Fact]
        public void Danh_muc_chan_trung_ten_khong_phan_biet_hoa_thuong_khoang_trang_phan_biet_dau()
        {
            var existing = new[] { new Category { Id = "c1", Name = "Móng" } };
            Assert.False(Validation.ValidateCategory(new CategoryForm { Name = "  MÓNG " }, existing, null).Ok);
            Assert.True(Validation.ValidateCategory(new CategoryForm { Name = "Mong" }, existing, null).Ok);
            Assert.True(Validation.ValidateCategory(new CategoryForm { Name = "Móng" }, existing, "c1").Ok);
            Assert.Equal("Móng nhà", Validation.ValidateCategory(new CategoryForm { Name = " Móng   nhà " }, existing, null).Value!.Name);
        }

        [Fact]
        public void Tham_chieu_nhom_nha_cung_cap_hong_duoc_bao()
        {
            var issues = LibraryCheck.Issues(new LibrarySnapshot { WorkItems = { Item("w", "W", "Thử", "mat", "mat") } }, "2026-10-26");
            Assert.Equal(new[] { IssueKind.BrokenCategory, IssueKind.BrokenSupplier }, issues.Select(i => i.Kind).OrderBy(k => k).ToArray());
        }

        // ---------- tìm kiếm, lọc, sắp xếp (libraryV2) ----------

        private static readonly WorkItem[] Items =
        {
            Item("1", "B-2", "Cây Sao đen", "c", "s", 300),
            Item("2", "B-10", "Bê tông", null, null, null),
            Item("3", "A-1", "Đá 1x2", "c", null, 50),
        };

        private static string[] Ids(System.Collections.Generic.IEnumerable<WorkItem> items) => items.Select(i => i.Id).ToArray();

        [Fact]
        public void Loc_chua_phan_nhom_theo_nha_cung_cap_tim_theo_ten_nha_cung_cap()
        {
            var lookup = new NameLookup(new Category[0], new[] { new Supplier { Id = "s", Name = "Vườn ươm Thử" } });
            Assert.Equal(new[] { "2" }, Ids(Search.SearchWorkItems(Items, new ListFilter { CategoryId = ListFilter.None })));
            Assert.Equal(new[] { "1" }, Ids(Search.SearchWorkItems(Items, new ListFilter { SupplierId = "s" })));
            Assert.Equal(new[] { "3", "2" }, Ids(Search.SearchWorkItems(Items, new ListFilter { SupplierId = ListFilter.None })));
            Assert.Equal(new[] { "1" }, Ids(Search.SearchWorkItems(Items, new ListFilter { Query = "vuon uom" }, lookup)));
        }

        [Fact]
        public void Sap_theo_ma_so_tu_nhien_ten_gia()
        {
            Assert.Equal(new[] { "A-1", "B-2", "B-10" }, Search.SearchWorkItems(Items, new ListFilter { Sort = SortKey.Code }).Select(i => i.Code).ToArray());
            Assert.Equal(new[] { "2", "1", "3" }, Ids(Search.SearchWorkItems(Items, new ListFilter { Sort = SortKey.Name })));
            Assert.Equal(new[] { "3", "1", "2" }, Ids(Search.SearchWorkItems(Items, new ListFilter { Sort = SortKey.Price })));
        }

        [Fact]
        public void Tai_nguyen_loc_loai_nha_cung_cap_gia_hien_hanh()
        {
            Resource Res(string id, string code, ResourceType type = ResourceType.Material) =>
                new Resource { Id = id, Code = code, Name = code, Type = type, Unit = "kg" };
            ResourcePrice P(string id, string resourceId, decimal value, string? supplierId = null, string? from = null, PriceStatus status = PriceStatus.Active) =>
                new ResourcePrice { Id = id, ResourceId = resourceId, Price = value, Unit = "kg", Currency = "VND", SupplierId = supplierId, EffectiveFrom = from, Status = status };
            var resources = new[] { Res("r1", "R1"), Res("r2", "R2", ResourceType.Labor), Res("r3", "R3") };
            var prices = new[] { P("p1", "r1", 100, "s"), P("p2", "r3", 5), P("p3", "r3", 7, from: "2026-01-01"), P("p4", "r2", 1, status: PriceStatus.Inactive) };
            Assert.Equal(new[] { "r2" }, Search.SearchResources(resources, prices, new ResourceFilter { Type = ResourceType.Labor }).Select(r => r.Id).ToArray());
            Assert.Equal(new[] { "r1" }, Search.SearchResources(resources, prices, new ResourceFilter { SupplierId = "s" }).Select(r => r.Id).ToArray());
            var r1 = Search.CurrentPrice("r1", prices, "2026-10-26");
            Assert.Equal((1, "p1"), (r1.ActiveCount, r1.Price!.Id));
            var r3 = Search.CurrentPrice("r3", prices, "2026-10-26");
            Assert.Equal((2, (ResourcePrice?)null), (r3.ActiveCount, r3.Price));
            var r2 = Search.CurrentPrice("r2", prices, "2026-10-26");
            Assert.Equal((0, (ResourcePrice?)null), (r2.ActiveCount, r2.Price));
            Assert.Equal(new[] { "r1", "r2", "r3" }, Search.SearchResources(resources, prices, new ResourceFilter { Sort = SortKey.Price }, null, "2026-10-26").Select(r => r.Id).ToArray());
        }

        // ---------- định mức (norms) ----------

        private static NormForm NormForm() => new NormForm { Code = "THU-DM", Name = "Công tác thử", Unit = "m3", Version = "1" };

        [Fact]
        public void Form_dinh_muc_bat_buoc_nguon_tai_lieu_ngay_hop_le()
        {
            var form = NormForm();
            form.Code = "";
            form.Unit = "";
            form.SourceType = NormSourceType.Document;
            form.EffectiveFrom = "2026-02-30";
            Assert.Equal(new[] { "code", "effectiveFrom", "source", "unit" }, Fields(Validation.ValidateNorm(form, Empty, null)));
        }

        [Fact]
        public void Ma_va_phien_ban_khong_trung()
        {
            var lib = new LibrarySnapshot { Norms = { new Norm { Id = "n1", Code = "THU-DM", Version = "1", Unit = "m3" } } };
            var form = NormForm();
            form.Version = " 1 ";
            Assert.Equal(new[] { "version" }, Fields(Validation.ValidateNorm(form, lib, null)));
            Assert.True(Validation.ValidateNorm(form, lib, "n1").Ok);
        }

        [Fact]
        public void Hao_hut_0_den_100_va_da_gom_hao_hut_thi_khong_nhap()
        {
            var lib = new LibrarySnapshot { Resources = { new Resource { Id = "a", Code = "A", Unit = "kg" } } };
            var included = new Norm { Id = "n1", Status = NormStatus.Draft, WasteIncluded = true };
            var r = Validation.ValidateNormComponent(new NormComponentForm { ResourceId = "a", Consumption = "1", WastePercent = "5" }, included, lib, null);
            Assert.Equal("wastePercent", r.Errors[0].Field);
            var plain = new Norm { Id = "n2", Status = NormStatus.Draft };
            Assert.False(Validation.ValidateNormComponent(new NormComponentForm { ResourceId = "a", Consumption = "1", WastePercent = "150" }, plain, lib, null).Ok);
            Assert.Equal(0.033m, DecimalMath.PercentToRate(3.3m));
            Assert.Equal("7", DecimalMath.RateToPercent(0.07m));
            Assert.Equal("", DecimalMath.RateToPercent(0));
        }

        private static LibrarySnapshot ApprovedLib()
        {
            var resource = new Resource { Id = "a", Code = "A", Name = "Thử A", Unit = "kg" };
            return new LibrarySnapshot
            {
                WorkItems = { Item("w1", "W1") },
                Resources = { resource },
                Norms = { new Norm { Id = "n1", Code = "THU-DM", Name = "Công tác thử", Unit = "m3", Version = "1", Status = NormStatus.Approved, WorkItemId = "w1" } },
                NormComponents = { Fixtures.Comp("c1", resource, 1) },
            };
        }

        [Fact]
        public void Dang_dung_khoa_thanh_phan_va_truong_anh_huong_tinh_toan()
        {
            var lib = ApprovedLib();
            var approved = lib.Norms[0];
            Assert.False(Validation.ValidateNormComponent(new NormComponentForm { ResourceId = "a", Consumption = "3" }, approved, lib, "c1").Ok);
            var unitChanged = Validation.ToForm(approved);
            unitChanged.Unit = "m2";
            Assert.Equal(new[] { "unit" }, Fields(Validation.ValidateNorm(unitChanged, lib, approved.Id)));
            var renamed = Validation.ToForm(approved);
            renamed.Name = "Tên mới";
            Assert.True(Validation.ValidateNorm(renamed, lib, approved.Id).Ok);
            Assert.NotNull(Validation.CheckNormStatusChange(approved, NormStatus.Draft, lib));
            Assert.Null(Validation.CheckNormStatusChange(approved, NormStatus.Inactive, lib));
        }

        [Fact]
        public void Mot_phien_ban_dang_dung_cho_moi_ma_va_moi_cong_tac()
        {
            var lib = ApprovedLib();
            var copy = new Norm { Id = "n2", Code = "thu-dm", Unit = "m3", Version = "2", Status = NormStatus.Draft };
            lib.Norms.Add(copy);
            lib.NormComponents.Add(Fixtures.Comp("c2", lib.Resources[0], 1, normId: "n2"));
            Assert.Contains("đang dùng phiên bản 1", Validation.CheckNormStatusChange(copy, NormStatus.Approved, lib));
            lib.Norms[0].Status = NormStatus.Inactive;
            Assert.Null(Validation.CheckNormStatusChange(copy, NormStatus.Approved, lib));

            var other = new Norm { Id = "n3", Code = "KHAC", Unit = "m3", Version = "1", Status = NormStatus.Draft, WorkItemId = "w1" };
            lib.Norms[0].Status = NormStatus.Approved;
            lib.Norms.Add(other);
            lib.NormComponents.Add(Fixtures.Comp("c3", lib.Resources[0], 1, normId: "n3"));
            Assert.Contains("Công tác liên kết đang dùng", Validation.CheckNormStatusChange(other, NormStatus.Approved, lib));
        }

        [Fact]
        public void Khong_chuyen_dang_dung_khi_rong_hoac_tai_nguyen_doi_don_vi()
        {
            var lib = ApprovedLib();
            var draft = new Norm { Id = "n9", Code = "MOI", Unit = "m3", Version = "1", Status = NormStatus.Draft };
            lib.Norms.Add(draft);
            Assert.Equal("Định mức chưa có thành phần nào.", Validation.CheckNormStatusChange(draft, NormStatus.Approved, lib));
            lib.NormComponents.Add(Fixtures.Comp("c9", lib.Resources[0], 1, normId: "n9"));
            Assert.Null(Validation.CheckNormStatusChange(draft, NormStatus.Approved, lib));
            lib.Resources[0].Unit = "tấn";
            Assert.Contains("đã đổi so với lúc liên kết", Validation.CheckNormStatusChange(draft, NormStatus.Approved, lib));
        }
    }
}
