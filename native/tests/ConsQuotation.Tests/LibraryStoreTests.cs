using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Storage;
using Newtonsoft.Json.Linq;
using Xunit;
using static ConsQuotation.Tests.Fixtures;

namespace ConsQuotation.Tests
{
    /// <summary>Thư mục tạm riêng cho mỗi test (không đụng thư viện thật trong %APPDATA%).</summary>
    public sealed class TempDir : IDisposable
    {
        public TempDir()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "cq-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public string File(string name) => System.IO.Path.Combine(Path, name);

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
            }
        }
    }

    public class LibraryStoreTests : IDisposable
    {
        private readonly TempDir dir = new TempDir();

        public void Dispose() => dir.Dispose();

        private LibraryStore NewStore() => new LibraryStore(dir.File("library.json"));

        [Fact]
        public void FileChuaCo_ThuVienTrong_KhongTaoFile()
        {
            var store = NewStore();
            Assert.True(store.LoadAll().IsEmpty);
            Assert.Null(store.GetSetting("lastBackupAt"));
            Assert.False(File.Exists(store.FilePath));
        }

        [Fact]
        public void GhiRoiDocLai_CungTenTruongVaGiaTriVoiBanWeb()
        {
            var store = NewStore();
            var r = Res("r1", ResourceType.Material, "kg", name: "Xi măng PCB40");
            store.PutResource(r);
            store.PutPrice(Price("p1", "r1", 1850.50m, "kg"));
            store.PutNorm(Norm(), new[] { Comp("c1", r, 0.3m, 0.05m) });

            var json = File.ReadAllText(store.FilePath, Encoding.UTF8);
            // Tên trường camelCase, kiểu liệt kê là chữ, số ghi gọn như JavaScript, giữ trường null.
            Assert.Contains("\"format\":\"consquotation-library-store\"", json);
            Assert.Contains("\"schemaVersion\":3", json);
            Assert.Contains("\"type\":\"material\"", json);
            Assert.Contains("\"price\":1850.5,", json);
            Assert.Contains("\"status\":\"approved\"", json);
            Assert.Contains("\"wasteRate\":0.05,", json);
            Assert.Contains("\"categoryId\":null", json);
            Assert.Contains("Xi măng PCB40", json);
            Assert.DoesNotContain("isEmpty", json);

            var lib = new LibraryStore(store.FilePath).LoadAll();
            Assert.Equal("Xi măng PCB40", lib.Resources.Single().Name);
            Assert.Equal(1850.5m, lib.ResourcePrices.Single().Price);
            Assert.Equal(0.3m, lib.NormComponents.Single().Consumption);
            Assert.Equal(0.05m, lib.NormComponents.Single().WasteRate);
            Assert.Equal(NormStatus.Approved, lib.Norms.Single().Status);
            Assert.Null(lib.Resources.Single().CategoryId);
        }

        [Fact]
        public void SoThapPhanDocChinhXac_KhongQuaDouble()
        {
            File.WriteAllText(dir.File("library.json"),
                "{\"format\":\"consquotation-library-store\",\"schemaVersion\":3,\"settings\":{},\"library\":{\"resourcePrices\":[" +
                "{\"id\":\"p\",\"resourceId\":\"r\",\"price\":12345678901234567.123,\"unit\":\"kg\",\"currency\":\"VND\",\"effectiveFrom\":null,\"effectiveTo\":null,\"supplierId\":null,\"source\":\"\",\"status\":\"active\",\"notes\":\"\",\"createdAt\":\"x\",\"updatedAt\":\"x\"}]}}");
            Assert.Equal(12345678901234567.123m, NewStore().LoadAll().ResourcePrices.Single().Price);
        }

        [Fact]
        public void DanhSachThieuHoacNull_CoiLaRong()
        {
            File.WriteAllText(dir.File("library.json"),
                "{\"format\":\"consquotation-library-store\",\"schemaVersion\":3,\"library\":{\"workItems\":null}}");
            var store = NewStore();
            var lib = store.LoadAll();
            Assert.True(lib.IsEmpty);
            store.PutCategory(new Category { Id = "c", Name = "Móng", CreatedAt = T, UpdatedAt = T });
            Assert.Single(store.LoadAll().Categories);
        }

        [Fact]
        public void MoiLanGhi_GiuBanTruocTrongFileBak()
        {
            var store = NewStore();
            store.PutCategory(new Category { Id = "c1", Name = "Một", CreatedAt = T, UpdatedAt = T });
            Assert.False(File.Exists(store.BackupPath));
            store.PutCategory(new Category { Id = "c2", Name = "Hai", CreatedAt = T, UpdatedAt = T });

            Assert.True(File.Exists(store.BackupPath));
            Assert.Equal(new[] { "c1" }, new LibraryStore(store.BackupPath).LoadAll().Categories.Select(c => c.Id));
            Assert.Equal(new[] { "c1", "c2" }, store.LoadAll().Categories.Select(c => c.Id));
            Assert.False(File.Exists(store.FilePath + ".tmp"));
        }

        [Fact]
        public void FileHong_BaoLoiTiengViet_KhongGhiDe()
        {
            const string broken = "{\"format\":\"consquotation-library-store\",\"library\":{\"workItems\":[";
            File.WriteAllText(dir.File("library.json"), broken);
            var store = NewStore();

            var load = Assert.Throws<LibraryStorageException>(() => store.LoadAll());
            Assert.Contains("bị hỏng", load.Message);
            Assert.Throws<LibraryStorageException>(() => store.PutCategory(new Category { Id = "c", Name = "X", CreatedAt = T, UpdatedAt = T }));
            Assert.Equal(broken, File.ReadAllText(store.FilePath));
            Assert.False(File.Exists(store.BackupPath));
        }

        [Fact]
        public void FileKhongPhaiThuVien_KhongGhiDe()
        {
            const string other = "{\"hello\":1}";
            File.WriteAllText(dir.File("library.json"), other);
            var store = NewStore();
            var ex = Assert.Throws<LibraryStorageException>(() => store.SetSetting("libraryName", "X"));
            Assert.Contains("không phải file thư viện", ex.Message);
            Assert.Equal(other, File.ReadAllText(store.FilePath));
        }

        [Fact]
        public void FileCuaPhienBanMoiHon_BaoLoi_KhongGhiDe()
        {
            const string future = "{\"format\":\"consquotation-library-store\",\"schemaVersion\":99,\"settings\":{},\"library\":{}}";
            File.WriteAllText(dir.File("library.json"), future);
            var store = NewStore();
            Assert.Contains("phiên bản ConsQuotation mới hơn", Assert.Throws<LibraryStorageException>(() => store.LoadAll()).Message);
            Assert.Throws<LibraryStorageException>(() => store.SetSetting("libraryName", "X"));
            Assert.Equal(future, File.ReadAllText(store.FilePath));
        }

        [Fact]
        public void ThaoTacLoiGiuaChung_FileGiuNguyen()
        {
            var store = NewStore();
            store.PutCategory(new Category { Id = "c1", Name = "Một", CreatedAt = T, UpdatedAt = T });
            var before = File.ReadAllText(store.FilePath);
            Assert.Throws<InvalidOperationException>(() => store.Update(f =>
            {
                f.Library.Categories.Clear();
                throw new InvalidOperationException("thử");
            }));
            Assert.Equal(before, File.ReadAllText(store.FilePath));
        }

        [Fact]
        public void Settings_LuuDocDuoc()
        {
            var store = NewStore();
            store.SetSetting("lastBackupAt", "2026-10-20");
            Assert.Equal("2026-10-20", (string)new LibraryStore(store.FilePath).GetSetting("lastBackupAt")!);
            store.SetSetting("lastBackupAt", JValue.CreateNull());
            Assert.Equal(JTokenType.Null, store.GetSetting("lastBackupAt")!.Type);
        }

        [Fact]
        public void HaiCuaSoGhiXenKe_KhongMatDuLieuCuaNhau()
        {
            // Hai đối tượng cùng file như hai cửa sổ Excel: mỗi lần ghi đọc lại bản mới nhất.
            var a = NewStore();
            var b = NewStore();
            a.PutCategory(new Category { Id = "a", Name = "A", CreatedAt = T, UpdatedAt = T });
            b.PutSupplier(new Supplier { Id = "s", Name = "S", CreatedAt = T, UpdatedAt = T });
            a.SetSetting("libraryName", "Thư viện");
            var lib = b.LoadAll();
            Assert.Single(lib.Categories);
            Assert.Single(lib.Suppliers);
        }

        [Fact]
        public void GhiDongThoiNhieuLuong_KhongMatBanGhiNao()
        {
            var path = dir.File("library.json");
            Parallel.For(0, 4, new ParallelOptions { MaxDegreeOfParallelism = 4 }, t =>
            {
                var store = new LibraryStore(path);
                for (var i = 0; i < 25; i++)
                {
                    store.PutCategory(new Category { Id = $"c{t}-{i}", Name = $"Nhóm {t}-{i}", CreatedAt = T, UpdatedAt = T });
                }
            });
            Assert.Equal(100, new LibraryStore(path).LoadAll().Categories.Select(c => c.Id).Distinct().Count());
        }

        [Fact]
        public async Task DocTrongLucCuaSoKhacDangGhi_KhongLoiVaKhongThayThuVienTrong()
        {
            var path = dir.File("library.json");
            var writer = new LibraryStore(path);
            writer.PutCategory(new Category { Id = "c0", Name = "Nhóm 0", CreatedAt = T, UpdatedAt = T });
            var done = false;
            var counts = new System.Collections.Concurrent.ConcurrentBag<int>();
            var reader = Task.Run(() =>
            {
                var store = new LibraryStore(path);
                while (!System.Threading.Volatile.Read(ref done))
                {
                    counts.Add(store.LoadAll().Categories.Count);
                }
            });
            for (var i = 1; i <= 150; i++)
            {
                writer.PutCategory(new Category { Id = $"c{i}", Name = $"Nhóm {i}", CreatedAt = T, UpdatedAt = T });
            }
            System.Threading.Volatile.Write(ref done, true);
            await reader;
            Assert.NotEmpty(counts);
            Assert.DoesNotContain(0, counts);
        }

        [Fact]
        public void ThuMucChuaCo_TuTao()
        {
            var store = new LibraryStore(Path.Combine(dir.Path, "a", "b", "library.json"));
            store.SetSetting("libraryName", "X");
            Assert.True(File.Exists(store.FilePath));
        }

        [Fact]
        public void XoaCoRangBuoc_GiongBanWeb()
        {
            var store = NewStore();
            var r = Res("r1", ResourceType.Material, "kg");
            store.PutCategory(new Category { Id = "c1", Name = "Một", CreatedAt = T, UpdatedAt = T });
            store.PutSupplier(new Supplier { Id = "s1", Name = "NCC", CreatedAt = T, UpdatedAt = T });
            store.PutWorkItem(new WorkItem { Id = "w1", Code = "W", Name = "W", Unit = "m3", CategoryId = "c1", SupplierId = "s1", CreatedAt = T, UpdatedAt = T });
            var res = Copy(r);
            res.CategoryId = "c1";
            store.PutResource(res);
            store.PutPrice(Price("p1", "r1", 1, "kg", supplierId: "s1", source: "BG"));
            store.PutNorm(Norm(workItemId: "w1"), new[] { Comp("c1", r, 1) });

            store.DeleteCategory("c1", null, "now");
            store.DeleteSupplier("s1", "now");
            store.DeleteWorkItem("w1", "now");
            var lib = store.LoadAll();
            Assert.Empty(lib.Categories);
            Assert.Null(lib.Resources.Single().CategoryId);
            Assert.Equal("now", lib.Resources.Single().UpdatedAt);
            Assert.Null(lib.ResourcePrices.Single().SupplierId);
            Assert.Equal("BG", lib.ResourcePrices.Single().Source);
            Assert.Empty(lib.WorkItems);
            Assert.Null(lib.Norms.Single().WorkItemId);

            store.DeleteNorm("n1");
            store.DeleteResource("r1");
            lib = store.LoadAll();
            Assert.Empty(lib.NormComponents);
            Assert.Empty(lib.Resources);
            Assert.Empty(lib.ResourcePrices);
        }
    }
}
