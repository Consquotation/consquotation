using System;
using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Storage;
using Xunit;

namespace ConsQuotation.Tests
{
    /// <summary>
    /// Chuyển từ phần dịch vụ của libraryStorage.test.ts, libraryV2.test.ts và norms.test.ts. Dữ liệu là giả
    /// định, không phải định mức hay đơn giá thực tế.
    /// </summary>
    public class LibraryServiceTests : IDisposable
    {
        private const string T = "2026-10-27T00:00:00.000Z";

        private readonly TempDir dir = new TempDir();
        private readonly LibraryService service;

        public LibraryServiceTests()
        {
            service = NewService(dir.File("library.json"));
        }

        public void Dispose() => dir.Dispose();

        private static LibraryService NewService(string path)
        {
            var id = 0;
            var clock = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);
            return new LibraryService(new LibraryStore(path), () => clock = clock.AddSeconds(1), () => $"id-{++id}");
        }

        private static WorkItemForm Work(string code = "BT-01", string categoryId = "", string supplierId = "", string unitPrice = "1500000") => new WorkItemForm
        {
            Code = code,
            Name = "Bê tông móng",
            CategoryId = categoryId,
            SupplierId = supplierId,
            Unit = "m3",
            UnitPrice = unitPrice,
            Currency = "VND",
        };

        private static ResourceForm Res(string code = "XM", ResourceType type = ResourceType.Material, string unit = "kg", string categoryId = "") => new ResourceForm
        {
            Code = code,
            Name = $"Thử {code}",
            Type = type,
            Unit = unit,
            CategoryId = categoryId,
        };

        private static PriceForm PriceOf(string price, string unit, string source = "Thử", string supplierId = "") => new PriceForm
        {
            Price = price,
            Unit = unit,
            Currency = "VND",
            Source = source,
            SupplierId = supplierId,
            Status = PriceStatus.Active,
        };

        private static NormForm NormOf(string code = "THU-DM", string unit = "m3", string version = "1", string workItemId = "", bool wasteIncluded = false, string name = "Công tác thử") => new NormForm
        {
            Code = code,
            Name = name,
            Unit = unit,
            Version = version,
            WorkItemId = workItemId,
            SourceType = NormSourceType.User,
            WasteIncluded = wasteIncluded,
        };

        private static T Ok<T>(FormResult<T> result) where T : class =>
            result.Value ?? throw new InvalidOperationException(string.Join("; ", result.Errors));

        /// <summary>3 tài nguyên có giá: A 10.000 đ/kg, B 40.000 đ/công, C 80.000 đ/ca.</summary>
        private List<string> Seed()
        {
            var ids = new List<string>();
            foreach (var (code, type, unit, price) in new[]
            {
                ("A", ResourceType.Material, "kg", "10000"),
                ("B", ResourceType.Labor, "công", "40000"),
                ("C", ResourceType.Machine, "ca", "80000"),
            })
            {
                var r = Ok(service.SaveResource(Res(code, type, unit), null, service.Load()));
                Ok(service.SavePrice(r.Id, PriceOf(price, unit), null, service.Load()));
                ids.Add(r.Id);
            }
            return ids;
        }

        private Norm CreateNorm(NormForm? form = null) => Ok(service.SaveNorm(form ?? NormOf(), null, service.Load()));

        private NormComponent AddComponent(string normId, string resourceId, string consumption, string wastePercent = "") =>
            Ok(service.SaveNormComponent(normId, new NormComponentForm { ResourceId = resourceId, Consumption = consumption, WastePercent = wastePercent }, null, service.Load()));

        // ---------- libraryStorage.test.ts ----------

        [Fact]
        public void ThuVienMoiTrong_KhongCoDuLieuMau()
        {
            Assert.True(service.Load().IsEmpty);
        }

        [Fact]
        public void Luu_DocLai_SuaGiuCreatedAt_ChanMaTrung()
        {
            Assert.True(service.SaveWorkItem(Work(), null, service.Load()).Ok);
            var item = service.Load().WorkItems.Single();

            var form = Work();
            form.Name = "Bê tông móng M250";
            var edited = Ok(service.SaveWorkItem(form, item.Id, service.Load()));
            Assert.Equal(item.CreatedAt, edited.CreatedAt);
            Assert.True(string.CompareOrdinal(edited.UpdatedAt, item.UpdatedAt) > 0);
            Assert.Equal(1500000m, service.Load().WorkItems.Single().UnitPrice);

            var dup = Work();
            dup.Name = "Khác";
            Assert.False(service.SaveWorkItem(dup, null, service.Load()).Ok);
            Assert.Single(service.Load().WorkItems);
        }

        [Fact]
        public void DuLieuConSauKhiMoLai()
        {
            service.SaveWorkItem(Work(), null, service.Load());
            Assert.Equal(new[] { "BT-01" }, new LibraryStore(dir.File("library.json")).LoadAll().WorkItems.Select(w => w.Code));
        }

        [Fact]
        public void SaoChepCongTac_MaMoiKhongTrung_DinhMucKhongBiChepTheo()
        {
            var w = Ok(service.SaveWorkItem(Work(), null, service.Load()));
            var r = Ok(service.SaveResource(Res(), null, service.Load()));
            var norm = CreateNorm(NormOf(workItemId: w.Id));
            AddComponent(norm.Id, r.Id, "350");

            var copy = service.CopyWorkItem(w.Id, service.Load());
            Assert.Equal("BT-01 (2)", copy.Code);
            var lib = service.Load();
            Assert.DoesNotContain(lib.Norms, n => n.WorkItemId == copy.Id);
            Assert.Single(lib.Norms);
            Assert.Equal("BT-01 (3)", service.CopyWorkItem(w.Id, lib).Code);
        }

        [Fact]
        public void XoaCongTac_DinhMucDuocGiuVaChiBoLienKet()
        {
            var w = Ok(service.SaveWorkItem(Work(), null, service.Load()));
            var r = Ok(service.SaveResource(Res(), null, service.Load()));
            var norm = CreateNorm(NormOf(workItemId: w.Id));
            AddComponent(norm.Id, r.Id, "1");
            service.DeleteWorkItem(w.Id);
            var lib = service.Load();
            Assert.Empty(lib.WorkItems);
            Assert.Null(lib.Norms.Single().WorkItemId);
            Assert.Single(lib.NormComponents);
            Assert.Single(lib.Resources);
        }

        [Fact]
        public void ChanXoaTaiNguyenDangDuocDinhMucDung_XoaDuocThiXoaKemGia()
        {
            var r = Ok(service.SaveResource(Res(), null, service.Load()));
            Ok(service.SavePrice(r.Id, PriceOf("1850", "kg", "NCC"), null, service.Load()));
            var norm = CreateNorm();
            AddComponent(norm.Id, r.Id, "1");
            var lib = service.Load();

            var blocked = service.DeleteResource(r.Id, lib);
            Assert.False(blocked.Ok);
            Assert.Equal(1, blocked.InUseByNorms);
            Assert.Single(service.Load().Resources);

            service.DeleteNorm(norm.Id, lib);
            lib = service.Load();
            Assert.Empty(lib.NormComponents);
            Assert.True(service.DeleteResource(r.Id, lib).Ok);
            lib = service.Load();
            Assert.Empty(lib.Resources);
            Assert.Empty(lib.ResourcePrices);
        }

        [Fact]
        public void LuuGiaChoTaiNguyenDaXoa_BaoLoi()
        {
            Assert.Throws<InvalidOperationException>(() => service.SavePrice("khong-co", PriceOf("1", "kg"), null, service.Load()));
        }

        [Fact]
        public void UniqueCopyCode_TimHauToChuaDung_KhongPhanBietHoaThuong()
        {
            Assert.Equal("A (2)", LibraryService.UniqueCopyCode("A", new[] { "A" }));
            Assert.Equal("A (3)", LibraryService.UniqueCopyCode("A", new[] { "A", "a (2)" }));
        }

        // ---------- libraryV2.test.ts ----------

        [Fact]
        public void DanhMuc_Them_ChanTrung_DoiTen()
        {
            var a = Ok(service.SaveCategory(new CategoryForm { Name = " Vật  liệu " }, null, service.Load()));
            Assert.Equal("Vật liệu", a.Name);
            var lib = service.Load();
            Assert.False(service.SaveCategory(new CategoryForm { Name = "vật liệu" }, null, lib).Ok);
            Assert.True(service.SaveCategory(new CategoryForm { Name = "Vat lieu" }, null, lib).Ok);
            Assert.False(service.SaveCategory(new CategoryForm { Name = "" }, null, lib).Ok);
            var renamed = Ok(service.SaveCategory(new CategoryForm { Name = "Vật liệu xây dựng" }, a.Id, lib));
            Assert.Equal(a.Id, renamed.Id);
            Assert.Equal("Vật liệu xây dựng", renamed.Name);
            Assert.Equal(a.CreatedAt, renamed.CreatedAt);
        }

        [Fact]
        public void XoaNhomDangDung_ChuyenSangNhomKhacHoacBoPhanNhom()
        {
            var c1 = Ok(service.SaveCategory(new CategoryForm { Name = "Nhóm 1" }, null, service.Load()));
            var c2 = Ok(service.SaveCategory(new CategoryForm { Name = "Nhóm 2" }, null, service.Load()));
            Ok(service.SaveWorkItem(Work(categoryId: c1.Id), null, service.Load()));
            Ok(service.SaveResource(Res(categoryId: c1.Id), null, service.Load()));
            var lib = service.Load();
            var usage = Search.CategoryUsageOf(lib)[c1.Id];
            Assert.Equal((1, 1), (usage.WorkItems, usage.Resources));

            service.DeleteCategory(c1.Id, c2.Id, lib);
            lib = service.Load();
            Assert.Equal(new[] { c2.Id }, lib.Categories.Select(c => c.Id));
            Assert.Equal(c2.Id, lib.WorkItems[0].CategoryId);
            Assert.Equal(c2.Id, lib.Resources[0].CategoryId);

            service.DeleteCategory(c2.Id, null, lib);
            lib = service.Load();
            Assert.Empty(lib.Categories);
            Assert.Single(lib.WorkItems);
            Assert.Null(lib.WorkItems[0].CategoryId);
            var none = Search.CategoryUsageOf(lib)[ListFilter.None];
            Assert.Equal((1, 1), (none.WorkItems, none.Resources));
        }

        [Fact]
        public void KhongChoChuyenSangChinhNhomDangXoaHoacNhomKhongTonTai()
        {
            var c = Ok(service.SaveCategory(new CategoryForm { Name = "X" }, null, service.Load()));
            var lib = service.Load();
            Assert.Throws<InvalidOperationException>(() => service.DeleteCategory(c.Id, c.Id, lib));
            Assert.Throws<InvalidOperationException>(() => service.DeleteCategory(c.Id, "khong-co", lib));
            Assert.Single(service.Load().Categories);
        }

        [Fact]
        public void NhaCungCap_ChanTrung_XoaChiBoLienKet_GiuNguonGia()
        {
            var s = Ok(service.SaveSupplier(new SupplierForm { Name = "Công ty Thử", ContactInfo = "0901 000 000" }, null, service.Load()));
            var lib = service.Load();
            Assert.False(service.SaveSupplier(new SupplierForm { Name = "công ty thử" }, null, lib).Ok);
            Ok(service.SaveWorkItem(Work(supplierId: s.Id), null, lib));
            var r = Ok(service.SaveResource(Res(), null, service.Load()));
            Ok(service.SavePrice(r.Id, PriceOf("1850", "kg", "Báo giá thử", s.Id), null, service.Load()));
            lib = service.Load();
            var usage = Search.SupplierUsageOf(lib)[s.Id];
            Assert.Equal((1, 1), (usage.WorkItems, usage.Prices));

            service.DeleteSupplier(s.Id);
            lib = service.Load();
            Assert.Empty(lib.Suppliers);
            Assert.Null(lib.WorkItems[0].SupplierId);
            Assert.Null(lib.ResourcePrices[0].SupplierId);
            Assert.Equal("Báo giá thử", lib.ResourcePrices[0].Source);
        }

        [Fact]
        public void TenThuVien_MacDinh_ChuanHoa_GioiHanDoDai()
        {
            Assert.Equal(LibrarySchema.DefaultName, LibraryService.CleanLibraryName("   "));
            Assert.Equal("Thư viện Cty A", LibraryService.CleanLibraryName("  Thư  viện   Cty A "));
            Assert.Equal(80, LibraryService.CleanLibraryName(new string('x', 200)).Length);
            Assert.Equal(LibrarySchema.DefaultName, service.LibraryName());
        }

        [Fact]
        public void DuLieuConNguyenKhiMoLai_KeCaTenThuVien()
        {
            var c = Ok(service.SaveCategory(new CategoryForm { Name = "Thử" }, null, service.Load()));
            Ok(service.SaveWorkItem(Work(categoryId: c.Id), null, service.Load()));
            service.SetLibraryName("Thư viện Thử");
            var reopened = NewService(dir.File("library.json"));
            Assert.Equal(c.Id, reopened.Load().WorkItems[0].CategoryId);
            Assert.Equal("Thư viện Thử", reopened.LibraryName());
        }

        [Fact]
        public void MocSaoLuu_ThayDoiSauSaoLuuThiCoLastChangedMoiHon()
        {
            Assert.Null(service.GetBackupStatus().LastChangedAt);
            Ok(service.SaveCategory(new CategoryForm { Name = "X" }, null, service.Load()));
            var changed = service.GetBackupStatus();
            Assert.NotNull(changed.LastChangedAt);
            Assert.Null(changed.LastBackupAt);

            service.RecordBackup(new DateTime(2026, 10, 21, 8, 30, 0, DateTimeKind.Utc));
            Assert.Equal("2026-10-21T08:30:00.000Z", service.GetBackupStatus().LastBackupAt);
        }

        // ---------- norms.test.ts ----------

        [Fact]
        public void DinhMuc_TaoNhap_ThemThanhPhan_Tinh60000_HaoHut5PhanTram61000()
        {
            var ids = Seed();
            var norm = CreateNorm();
            Assert.Equal(NormStatus.Draft, norm.Status);
            AddComponent(norm.Id, ids[0], "2");
            AddComponent(norm.Id, ids[1], "0,5");
            AddComponent(norm.Id, ids[2], "0,25");
            var lib = service.Load();
            var opts = new CalcOptions("2026-10-27", T);
            Assert.Equal(60000m, NormCalc.Calculate(norm, lib.NormComponents, lib, opts).UnitPrice);

            var first = lib.NormComponents.Single(x => x.ResourceId == ids[0]);
            Ok(service.SaveNormComponent(norm.Id, new NormComponentForm { ResourceId = ids[0], Consumption = "2", WastePercent = "5" }, first.Id, lib));
            lib = service.Load();
            Assert.Equal(0.05m, lib.NormComponents.Single(x => x.Id == first.Id).WasteRate);
            Assert.Equal(61000m, NormCalc.Calculate(norm, lib.NormComponents, lib, opts).UnitPrice);
        }

        [Fact]
        public void DangDung_KhoaThanhPhan_SaoChepThanhPhienBanMoiDeSua()
        {
            var a = Seed()[0];
            var norm = CreateNorm();
            AddComponent(norm.Id, a, "1");
            Assert.Null(service.SetNormStatus(norm.Id, NormStatus.Approved, service.Load()));
            var lib = service.Load();
            var approved = lib.Norms[0];

            Assert.False(service.SaveNormComponent(approved.Id, new NormComponentForm { ResourceId = a, Consumption = "3" }, lib.NormComponents[0].Id, lib).Ok);
            Assert.Throws<InvalidOperationException>(() => service.DeleteNormComponent(lib.NormComponents[0].Id, lib));
            Assert.Throws<InvalidOperationException>(() => service.DeleteNorm(approved.Id, lib));
            Assert.Throws<InvalidOperationException>(() => service.MoveNormComponent(lib.NormComponents[0].Id, 1, lib));
            Assert.False(service.SaveNorm(NormOf(unit: "m2"), approved.Id, lib).Ok);
            Assert.True(service.SaveNorm(NormOf(name: "Tên mới"), approved.Id, lib).Ok);
            Assert.Equal(NormStatus.Approved, service.Load().Norms[0].Status);
            Assert.NotNull(service.SetNormStatus(approved.Id, NormStatus.Draft, lib));

            lib = service.Load();
            var copy = service.CopyNormAsNewVersion(approved.Id, lib);
            Assert.Equal(("THU-DM", "2", NormStatus.Draft), (copy.Code, copy.Version, copy.Status));
            lib = service.Load();
            Assert.Single(lib.NormComponents, x => x.NormId == copy.Id);
            Assert.NotNull(service.SetNormStatus(copy.Id, NormStatus.Approved, lib));
            Assert.Null(service.SetNormStatus(approved.Id, NormStatus.Inactive, lib));
            Assert.Null(service.SetNormStatus(copy.Id, NormStatus.Approved, service.Load()));
        }

        [Fact]
        public void KhongChuyenSangDangDung_KhiRong_HoacTaiNguyenDoiDonVi()
        {
            var a = Seed()[0];
            var empty = CreateNorm();
            Assert.NotNull(service.SetNormStatus(empty.Id, NormStatus.Approved, service.Load()));
            AddComponent(empty.Id, a, "1");
            var lib = service.Load();
            Ok(service.SaveResource(Res("A", unit: "tấn"), a, lib));
            lib = service.Load();
            Assert.NotNull(service.SetNormStatus(empty.Id, NormStatus.Approved, lib));

            service.RefreshComponentLink(lib.NormComponents[0].Id, lib);
            lib = service.Load();
            Assert.Equal("tấn", lib.NormComponents[0].ResourceUnitSnapshot);
            Assert.Null(service.SetNormStatus(empty.Id, NormStatus.Approved, lib));
        }

        [Fact]
        public void SapXepThanhPhan_PhienBanTiepTheo_MaVaPhienBanKhongTrung()
        {
            var ids = Seed();
            var norm = CreateNorm();
            AddComponent(norm.Id, ids[0], "1");
            AddComponent(norm.Id, ids[1], "1");
            var third = AddComponent(norm.Id, ids[2], "1");
            service.MoveNormComponent(third.Id, -1, service.Load());
            var lib = service.Load();
            Assert.Equal(new[] { ids[0], ids[2], ids[1] }, lib.NormComponents.OrderBy(x => x.SortOrder).Select(x => x.ResourceId));
            Assert.Equal(new[] { 1, 2, 3 }, lib.NormComponents.Select(x => x.SortOrder).OrderBy(x => x));

            Assert.Equal("2026", LibraryService.NextNormVersion("X", "2024",
                new[] { Fixtures.Norm("a", code: "x", version: "2025"), Fixtures.Norm("b", code: "X", version: "2024") }));
            Assert.Equal("QĐ-01-2", LibraryService.NextNormVersion("X", "QĐ-01", new Norm[0]));
            Assert.False(service.SaveNorm(NormOf(version: " 1 "), null, lib).Ok);
        }

        [Fact]
        public void DaGomHaoHut_KhongNhapHaoHut_HaoHutQua100BiChan()
        {
            var a = Seed()[0];
            var included = CreateNorm(NormOf(wasteIncluded: true));
            var r = service.SaveNormComponent(included.Id, new NormComponentForm { ResourceId = a, Consumption = "1", WastePercent = "5" }, null, service.Load());
            Assert.Equal("wastePercent", r.Errors[0].Field);
            var plain = CreateNorm(NormOf(code: "K"));
            Assert.False(service.SaveNormComponent(plain.Id, new NormComponentForm { ResourceId = a, Consumption = "1", WastePercent = "150" }, null, service.Load()).Ok);
            Assert.Empty(service.Load().NormComponents);
        }

        [Fact]
        public void PhanTichTuDinhMuc_DungPhienBanDangDung_HaoPhiDaCongHaoHut()
        {
            var a = Seed()[0];
            var w = Ok(service.SaveWorkItem(Work("W-1", unitPrice: ""), null, service.Load()));
            var draft = CreateNorm(NormOf(workItemId: w.Id));
            AddComponent(draft.Id, a, "2", "5");
            var lib = service.Load();
            Assert.Empty(Composition.Lines(w, lib, "2026-10-27"));
            Assert.Null(service.SetNormStatus(draft.Id, NormStatus.Approved, lib));
            lib = service.Load();
            var lines = Composition.Lines(w, lib, "2026-10-27");
            Assert.Equal(2.1m, lines[0].Consumption);
            var result = Composition.Build(w, lines, new Dictionary<string, string> { [lines[0].Component.Id] = lines[0].DefaultPriceId! }, Rounding.NoRounding);
            Assert.Equal(21000m, result.Preview);
            Assert.Equal(2.1m, result.Rows[0][7]);
            Assert.Contains("hao hụt 5% (cơ sở 2); định mức THU-DM v1", Convert.ToString(result.Rows[0][11]));
        }

        [Fact]
        public void GiaApDung_LuuCungThanhPhan_DungKhiTinh_NgungDungThiKhoa()
        {
            var ids = Seed();
            var (a, b) = (ids[0], ids[1]);
            Ok(service.SavePrice(a, PriceOf("12000", "kg", "NCC 2"), null, service.Load()));
            var w = Ok(service.SaveWorkItem(Work("W-2", unitPrice: ""), null, service.Load()));
            var norm = CreateNorm(NormOf(workItemId: w.Id));
            var comp = AddComponent(norm.Id, a, "2");
            Assert.Null(comp.PriceId);
            var lib = service.Load();
            var opts = new CalcOptions("2026-10-27", T);
            var before = NormCalc.Calculate(norm, lib.NormComponents, lib, opts);
            Assert.Contains(CalcIssueCode.AmbiguousPrice, before.Issues.Select(i => i.Code));
            Assert.Null(before.UnitPrice);

            var second = lib.ResourcePrices.Single(p => p.Source == "NCC 2");
            service.SetComponentPrice(comp.Id, second.Id, lib);
            lib = service.Load();
            Assert.Equal(second.Id, lib.NormComponents[0].PriceId);
            Assert.Equal(24000m, NormCalc.Calculate(norm, lib.NormComponents, lib, opts).UnitPrice);
            var priceOfB = lib.ResourcePrices.First(p => p.ResourceId == b);
            Assert.Throws<InvalidOperationException>(() => service.SetComponentPrice(comp.Id, priceOfB.Id, lib));
            Ok(service.SaveNormComponent(norm.Id, new NormComponentForm { ResourceId = a, Consumption = "3" }, comp.Id, lib));
            lib = service.Load();
            Assert.Equal(second.Id, lib.NormComponents[0].PriceId);

            Assert.Null(service.SetNormStatus(norm.Id, NormStatus.Approved, lib));
            lib = service.Load();
            Assert.Equal(second.Id, Composition.Lines(w, lib, "2026-10-27")[0].DefaultPriceId);
            service.SetComponentPrice(comp.Id, null, lib);
            lib = service.Load();
            Assert.Null(Composition.Lines(w, lib, "2026-10-27")[0].DefaultPriceId);

            Assert.Null(service.SetNormStatus(norm.Id, NormStatus.Inactive, lib));
            lib = service.Load();
            Assert.Contains("ngừng dùng", Assert.Throws<InvalidOperationException>(() => service.SetComponentPrice(comp.Id, second.Id, lib)).Message);
        }

        [Fact]
        public void GiaApDungBiBoChon_KhiCapNhatLienKetSauKhiTaiNguyenDoiDonVi()
        {
            var a = Seed()[0];
            var norm = CreateNorm();
            var comp = AddComponent(norm.Id, a, "2");
            var lib = service.Load();
            var price = lib.ResourcePrices.First(p => p.ResourceId == a);
            service.SetComponentPrice(comp.Id, price.Id, lib);
            lib = service.Load();
            Assert.True(service.SaveResource(Res("A", unit: "tấn"), a, lib).Ok);
            lib = service.Load();
            service.RefreshComponentLink(comp.Id, lib);
            var updated = service.Load().NormComponents[0];
            Assert.Equal("tấn", updated.ResourceUnitSnapshot);
            Assert.Null(updated.PriceId);
        }

        [Fact]
        public void SaoChepPhienBan_LamMoiAnhChupTheoTaiNguyenHienTai()
        {
            var a = Seed()[0];
            var norm = CreateNorm();
            AddComponent(norm.Id, a, "1");
            Assert.Null(service.SetNormStatus(norm.Id, NormStatus.Approved, service.Load()));
            var lib = service.Load();
            var form = Res("A");
            form.Name = "Tên mới của A";
            Ok(service.SaveResource(form, a, lib));
            var copy = service.CopyNormAsNewVersion(norm.Id, service.Load());
            lib = service.Load();
            Assert.Equal("Tên mới của A", lib.NormComponents.Single(c => c.NormId == copy.Id).ResourceNameSnapshot);
            Assert.Equal("Thử A", lib.NormComponents.Single(c => c.NormId == norm.Id).ResourceNameSnapshot);
        }
    }
}
