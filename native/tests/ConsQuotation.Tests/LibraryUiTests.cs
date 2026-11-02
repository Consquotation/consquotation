using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Exchange;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Storage;
using ConsQuotation.Excel;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ui;
using Xunit;

namespace ConsQuotation.Tests
{
    /// <summary>Hộp thoại giả: trả lời xác nhận theo cấu hình và ghi lại mọi thông báo.</summary>
    internal sealed class FakePrompts : IPrompts
    {
        public Func<string, Control?, bool> Answer { get; set; } = (_, __) => true;
        public List<string> Confirms { get; } = new List<string>();
        public List<string> Errors { get; } = new List<string>();
        public string? SavePath { get; set; }
        public string? OpenPath { get; set; }

        public bool Confirm(IWin32Window owner, string title, string body, string confirmLabel, string cancelLabel, Control? extra = null)
        {
            Confirms.Add(body);
            return Answer(body, extra);
        }

        public void ShowError(IWin32Window owner, string text) => Errors.Add(text);
        public void ShowInfo(IWin32Window owner, string text) { }
        public string? SaveFile(IWin32Window owner, string fileName, string filter, string initialDirectory) => SavePath;
        public string? OpenFile(IWin32Window owner, string filter) => OpenPath;
    }

    /// <summary>Excel giả: workbook đang mở là các bảng cho sẵn; ghi lại workbook được mở mới.</summary>
    internal sealed class FakeWorkbooks : IWorkbookGateway
    {
        public WorkbookInfo Info { get; set; } = new WorkbookInfo { WorkbookName = "Book1" };
        public Dictionary<string, SheetRead> Sheets { get; } = new Dictionary<string, SheetRead>();
        public List<(byte[] Bytes, string Name)> Opened { get; } = new List<(byte[], string)>();

        public Task<WorkbookInfo> ListAsync() => Task.FromResult(Info);
        public Task<SheetRead> ReadSheetAsync(string workbookName, string sheetName, int maxRows) => Task.FromResult(Sheets[sheetName]);
        public Task<SheetRead> ReadTableAsync(string workbookName, string tableName, int maxRows) => Task.FromResult(Sheets[tableName]);

        public Task OpenNewWorkbookAsync(byte[] xlsx, string baseName)
        {
            Opened.Add((xlsx, baseName));
            return Task.CompletedTask;
        }
    }

    /// <summary>
    /// Giao diện Thư viện chạy thật (không hiện cửa sổ) trên luồng STA với file thư viện tạm; kiểm tra dữ liệu
    /// ghi xuống file sau mỗi thao tác như người dùng bấm.
    /// </summary>
    public class LibraryUiTests : IDisposable
    {
        private const string Today = "2026-11-02";
        private readonly TempDir dir = new TempDir();
        private readonly FakePrompts prompts = new FakePrompts();
        private readonly FakeWorkbooks workbooks = new FakeWorkbooks();
        private int ids;

        public void Dispose() => dir.Dispose();

        private string StorePath => dir.File("library.json");

        private LibraryService NewService() =>
            new LibraryService(new LibraryStore(StorePath), () => new DateTime(2026, 11, 2, 3, 0, 0, DateTimeKind.Utc), () => $"id-{Interlocked.Increment(ref ids)}");

        private LibrarySession Session()
        {
            var session = new LibrarySession(NewService(), prompts, workbooks, () => new DateTime(2026, 11, 2, 10, 0, 0));
            session.Reload();
            return session;
        }

        private LibrarySnapshot Saved() => new LibraryStore(StorePath).LoadAll();

        /// <summary>WinForms cần luồng STA; lỗi trong luồng được ném lại cho xUnit.</summary>
        private static void Sta(Action action)
        {
            ExceptionDispatchInfo? error = null;
            var thread = new Thread(() =>
            {
                try
                {
                    action();
                }
                catch (Exception ex)
                {
                    error = ExceptionDispatchInfo.Capture(ex);
                }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            thread.Join();
            error?.Throw();
        }

        private static void Pick<T>(RecordList<T> list, string id) where T : class
        {
            _ = list.Handle;
            list.Select(id);
            Assert.NotNull(list.Selected);
        }

        private void Seed(Action<LibraryService, LibrarySnapshot> seed)
        {
            var service = NewService();
            seed(service, service.Load());
        }

        private static WorkItemForm Item(string code, string name, string price = "") =>
            new WorkItemForm { Code = code, Name = name, Unit = "m3", UnitPrice = price };

        // ---------- Công tác ----------

        [Fact]
        public void CongTac_LuuHopLe_TaoLuonNhomMoi_VaBaoDaLuu() => Sta(() =>
        {
            var session = Session();
            var notices = new List<string>();
            session.Notice += notices.Add;
            using (var dialog = new WorkItemDialog(session, null))
            {
                dialog.Code.Value = "BT01";
                dialog.NameField.Value = "Bê tông lót móng";
                dialog.Unit.Value = "m3";
                dialog.UnitPrice.Value = "1234567,5";
                dialog.Group.Value = RefField.NewRef;
                dialog.Group.NewName = "Bê tông";
                dialog.From.Value = "2026-01-01";
                dialog.Save();
                Assert.Equal(DialogResult.OK, dialog.DialogResult);
            }
            var lib = Saved();
            var item = Assert.Single(lib.WorkItems);
            var category = Assert.Single(lib.Categories);
            Assert.Equal(("BT01", 1234567.5m, category.Id, "2026-01-01", "VND"), (item.Code, item.UnitPrice!.Value, item.CategoryId!, item.EffectiveFrom!, item.Currency));
            Assert.Equal("Bê tông", category.Name);
            Assert.Equal(new[] { "Đã lưu \"BT01\"." }, notices);
            Assert.Single(session.Library.WorkItems);
        });

        [Fact]
        public void CongTac_ThieuDuLieu_HienLoiTungO_KhongGhiGi() => Sta(() =>
        {
            var session = Session();
            using (var dialog = new WorkItemDialog(session, null))
            {
                dialog.NameField.Value = "Đào đất";
                dialog.UnitPrice.Value = "abc";
                dialog.Save();
                Assert.Equal(DialogResult.None, dialog.DialogResult);
                Assert.NotNull(dialog.Code.Error);
                Assert.NotNull(dialog.Unit.Error);
                Assert.NotNull(dialog.UnitPrice.Error);
                Assert.Null(dialog.NameField.Error);
            }
            Assert.False(File.Exists(StorePath));
        });

        [Fact]
        public void CongTac_NhomMoiTaoXongNhungCongTacLoi_GiuNhomVuaTaoDangChon() => Sta(() =>
        {
            var session = Session();
            using (var dialog = new WorkItemDialog(session, null))
            {
                dialog.Group.Value = RefField.NewRef;
                dialog.Group.NewName = "Nhóm A";
                dialog.Save();
                var category = Assert.Single(Saved().Categories);
                Assert.Equal(category.Id, dialog.Group.Value);
                Assert.False(dialog.Group.Creating);
                Assert.NotNull(dialog.Code.Error);
                Assert.Empty(Saved().WorkItems);
            }
        });

        [Fact]
        public void CongTac_TenTrung_CanhBaoNhungVanLuuDuoc() => Sta(() =>
        {
            Seed((s, lib) => s.SaveWorkItem(Item("DD01", "Đào đất"), null, lib));
            var session = Session();
            using (var dialog = new WorkItemDialog(session, null))
            {
                dialog.NameField.Value = "  đào   ĐẤT ";
                Assert.Equal(S.SameName("DD01"), dialog.NameField.Warning);
                dialog.Code.Value = "DD02";
                dialog.Unit.Value = "m3";
                dialog.Save();
                Assert.Equal(DialogResult.OK, dialog.DialogResult);
            }
            Assert.Equal(2, Saved().WorkItems.Count);
        });

        [Fact]
        public void TheCongTac_TimKhongDau_SaoChep_Xoa() => Sta(() =>
        {
            Seed((s, lib) =>
            {
                s.SaveWorkItem(Item("DD01", "Đào đất"), null, lib);
                s.SaveWorkItem(Item("BT01", "Bê tông", "1500"), null, s.Load());
            });
            var session = Session();
            using (var page = new WorkItemsPage(session))
            {
                Assert.Equal(new[] { "BT01", "DD01" }, page.List.Records.Select(w => w.Code));
                page.Filters.Query.Text = "dao dat";
                page.Apply();
                Assert.Equal("DD01", Assert.Single(page.List.Records).Code);

                Pick(page.List, page.List.Records[0].Id);
                page.CopySelected();
                Assert.Equal(3, Saved().WorkItems.Count);
                Assert.Equal(2, Saved().WorkItems.Count(w => w.Name == "Đào đất"));

                prompts.Answer = (_, __) => false;
                page.DeleteSelected();
                Assert.Equal(3, Saved().WorkItems.Count);
                prompts.Answer = (_, __) => true;
                var target = page.List.Selected!;
                page.DeleteSelected();
                Assert.DoesNotContain(Saved().WorkItems, w => w.Id == target.Id);
                Assert.Contains(S.DeleteWorkItemBody(target.Code, target.Name, 0), prompts.Confirms);
            }
        });

        // ---------- Tài nguyên và giá ----------

        [Fact]
        public void TaiNguyen_LuuMoi_ODaiDeThemGia_ThemGia() => Sta(() =>
        {
            var session = Session();
            using (var dialog = new ResourceDialog(session, null))
            {
                dialog.Code.Value = "VL01";
                dialog.NameField.Value = "Xi măng PCB40";
                dialog.Kind.Value = ResourceType.Material.ToString();
                dialog.Unit.Value = "kg";
                dialog.Save();
                Assert.Equal(DialogResult.None, dialog.DialogResult);
                Assert.NotNull(dialog.Editing);
                Assert.Equal(S.EditResource("VL01"), dialog.Text);

                using (var price = new PriceDialog(session, dialog.Editing!, null))
                {
                    Assert.Equal("kg", price.Unit.Value);
                    price.Price.Value = "1850,5";
                    price.SupplierField.Value = RefField.NewRef;
                    price.SupplierField.NewName = "Công ty A";
                    price.Save();
                    Assert.Equal(DialogResult.OK, price.DialogResult);
                }
            }
            var lib = Saved();
            var p = Assert.Single(lib.ResourcePrices);
            Assert.Equal((1850.5m, "kg", "VND", Assert.Single(lib.Suppliers).Id), (p.Price, p.Unit, p.Currency, p.SupplierId!));
        });

        [Fact]
        public void Gia_KhongHopLe_HienLoi() => Sta(() =>
        {
            Seed((s, lib) => s.SaveResource(new ResourceForm { Code = "VL01", Name = "Cát", Unit = "m3" }, null, lib));
            var session = Session();
            using (var price = new PriceDialog(session, session.Library.Resources[0], null))
            {
                price.Price.Value = "";
                price.From.Value = "2026-12-31";
                price.To.Value = "2026-01-01";
                price.Save();
                Assert.NotNull(price.Price.Error);
                Assert.NotNull(price.To.Error);
            }
            Assert.Empty(Saved().ResourcePrices);
        });

        [Fact]
        public void TheTaiNguyen_DangDungTrongDinhMuc_ChanXoaNgayKhongHoi() => Sta(() =>
        {
            Seed((s, lib) =>
            {
                var r = s.SaveResource(new ResourceForm { Code = "VL01", Name = "Cát", Unit = "m3" }, null, lib).Value!;
                var n = s.SaveNorm(new NormForm { Code = "DM01", Name = "Trát", Unit = "m2", Version = "1" }, null, s.Load()).Value!;
                s.SaveNormComponent(n.Id, new NormComponentForm { ResourceId = r.Id, Consumption = "0.02" }, null, s.Load());
            });
            var session = Session();
            using (var page = new ResourcesPage(session))
            {
                Pick(page.List, session.Library.Resources[0].Id);
                page.DeleteSelected();
                Assert.Empty(prompts.Confirms);
                Assert.Equal(new[] { S.ResourceInUse(1) }, prompts.Errors);
                Assert.Single(Saved().Resources);
            }
        });

        // ---------- Định mức ----------

        [Fact]
        public void DinhMuc_TaoMoi_ThemThanhPhan_TinhDonGia_DuyetRoiKhoa_SaoChepPhienBan() => Sta(() =>
        {
            Seed((s, lib) =>
            {
                var r = s.SaveResource(new ResourceForm { Code = "VL01", Name = "Xi măng", Unit = "kg" }, null, lib).Value!;
                s.SavePrice(r.Id, new PriceForm { Price = "2000", Unit = "kg" }, null, s.Load());
            });
            var session = Session();
            using (var dialog = new NormDialog(session, null))
            {
                Assert.Equal("1", dialog.Version.Value);
                dialog.Code.Value = "DM01";
                dialog.NameField.Value = "Xây tường";
                dialog.Unit.Value = "m3";
                dialog.SaveHeader();
                Assert.NotNull(dialog.Editing);
                Assert.Equal(NS.EditTitle("DM01", "1"), dialog.Text);

                dialog.ResourceChoice.Value = session.Library.Resources[0].Id;
                dialog.Consumption.Value = "2";
                dialog.Waste.Value = "5";
                dialog.SaveComponent();
                var component = Assert.Single(Saved().NormComponents);
                Assert.Equal((2m, 0.05m), (component.Consumption, component.WasteRate));
                Assert.Equal(4200m, dialog.Result!.UnitPrice);
                Assert.Equal("", dialog.Consumption.Value);

                dialog.ChangeStatus(NormStatus.Approved);
                Assert.Equal(NormStatus.Approved, Saved().Norms.Single().Status);
                Assert.False(dialog.Code.Box.Enabled);
                Assert.True(dialog.NameField.Box.Enabled);

                dialog.CopyVersion();
                Assert.Equal(("2", NormStatus.Draft), (dialog.Editing!.Version, dialog.Editing.Status));
                Assert.True(dialog.Code.Box.Enabled);
                Assert.Equal(2, Saved().NormComponents.Count);
            }
        });

        [Fact]
        public void DinhMuc_DuyetKhiChuaCoThanhPhan_BaoLyDo_GiuNhap() => Sta(() =>
        {
            Seed((s, lib) => s.SaveNorm(new NormForm { Code = "DM01", Name = "Trát", Unit = "m2", Version = "1" }, null, lib));
            var session = Session();
            using (var dialog = new NormDialog(session, session.Library.Norms[0].Id))
            {
                dialog.ChangeStatus(NormStatus.Approved);
                Assert.NotEqual("", dialog.StatusMessage);
            }
            Assert.Equal(NormStatus.Draft, Saved().Norms.Single().Status);
        });

        [Fact]
        public void DinhMuc_TrungMaVaPhienBan_HienLoiOPhienBan() => Sta(() =>
        {
            Seed((s, lib) => s.SaveNorm(new NormForm { Code = "DM01", Name = "Trát", Unit = "m2", Version = "1" }, null, lib));
            var session = Session();
            using (var dialog = new NormDialog(session, null))
            {
                dialog.Code.Value = "dm01";
                dialog.NameField.Value = "Trát 2";
                dialog.Unit.Value = "m2";
                dialog.SaveHeader();
                Assert.Null(dialog.Editing);
                Assert.NotNull(dialog.Version.Error);
            }
            Assert.Single(Saved().Norms);
        });

        // ---------- Danh mục ----------

        [Fact]
        public void XoaNhomDangDung_ChuyenBanGhiSangNhomKhac() => Sta(() =>
        {
            Seed((s, lib) =>
            {
                var a = s.SaveCategory(new CategoryForm { Name = "A" }, null, lib).Value!;
                s.SaveCategory(new CategoryForm { Name = "B" }, null, s.Load());
                s.SaveWorkItem(new WorkItemForm { Code = "X", Name = "X", Unit = "m", CategoryId = a.Id }, null, s.Load());
            });
            var session = Session();
            var b = session.Library.Categories.Single(c => c.Name == "B");
            prompts.Answer = (_, extra) =>
            {
                var combo = (ComboBox)((FieldBox)extra!).Editor;
                Ux.SelectId(combo, b.Id);
                return true;
            };
            using (var page = new CatalogPage(session))
            {
                Pick(page.Categories, session.Library.Categories.Single(c => c.Name == "A").Id);
                page.DeleteCategory();
            }
            var lib2 = Saved();
            Assert.Equal("B", Assert.Single(lib2.Categories).Name);
            Assert.Equal(b.Id, lib2.WorkItems.Single().CategoryId);
            Assert.Equal(S.DeleteCategoryUsed("A", 1, 0), Assert.Single(prompts.Confirms));
        });

        [Fact]
        public void TheKiemTra_LietKeLoiTruocCanhBao() => Sta(() =>
        {
            var session = Session();
            using (var page = new CheckPage(session))
            {
                Assert.Empty(page.List.Records);
            }
            Seed((s, lib) =>
            {
                s.SaveWorkItem(new WorkItemForm { Code = "A", Name = "A", Unit = "m", UnitPrice = "0" }, null, lib);
                s.SaveWorkItem(new WorkItemForm { Code = "B", Name = "B", Unit = "m", UnitPrice = "10", EffectiveTo = "2020-01-01" }, null, s.Load());
            });
            session.Reload();
            using (var page = new CheckPage(session))
            {
                var issues = LibraryCheck.Issues(session.Library, Today);
                Assert.Equal(issues.Count, page.List.Records.Count);
                var severities = page.List.Records.Select(i => i.Severity).ToList();
                Assert.Equal(severities.OrderBy(x => x == IssueSeverity.Error ? 0 : 1), severities);
            }
        });

        // ---------- Sao lưu và xuất ----------

        [Fact]
        public void SaoLuuJson_GhiFileVaMocSaoLuu() => Sta(() =>
        {
            Seed((s, lib) => s.SaveWorkItem(Item("BT01", "Bê tông", "1500"), null, lib));
            var session = Session();
            prompts.SavePath = dir.File("backup.json");
            using (var page = new ExchangePage(session))
            {
                page.SaveJson().Wait();
                Assert.Equal(XS.JsonDone(prompts.SavePath), page.BackupNoticeText);
            }
            var parsed = Backup.ParseBackupJson(File.ReadAllText(prompts.SavePath, Encoding.UTF8));
            Assert.True(parsed.Ok, parsed.Message);
            Assert.Equal("BT01", Cells.ParseText(parsed.Datasets.Single(d => d.Kind == DatasetKind.WorkItems).Rows[0].Cell("code")));
            Assert.Equal(AppInfo.Version, parsed.Meta.AppVersion);
            Assert.NotNull(NewService().GetBackupStatus().LastBackupAt);
            Assert.False(File.ReadAllBytes(prompts.SavePath).Take(3).SequenceEqual(new byte[] { 0xEF, 0xBB, 0xBF }));
        });

        [Fact]
        public void XuatWorkbook_MoWorkbookMoi_FileMauKhongGhiMocSaoLuu() => Sta(() =>
        {
            Seed((s, lib) => s.SaveWorkItem(Item("BT01", "Bê tông", "1500"), null, lib));
            var session = Session();
            using (var page = new ExchangePage(session))
            {
                page.ExportWorkbook(empty: true).Wait();
                Assert.Null(NewService().GetBackupStatus().LastBackupAt);
                page.ExportWorkbook(empty: false).Wait();
                Assert.Equal(XS.WorkbookDone, page.BackupNoticeText);
            }
            Assert.Equal(new[] { "MauThuVien", "ThuVien" }, workbooks.Opened.Select(o => o.Name));
            Assert.NotNull(NewService().GetBackupStatus().LastBackupAt);
            using (var zip = new ZipArchive(new MemoryStream(workbooks.Opened[1].Bytes)))
            using (var reader = new StreamReader(zip.GetEntry("xl/worksheets/sheet4.xml")!.Open()))
            {
                Assert.Contains(">BT01<", reader.ReadToEnd());
            }
        });

        // ---------- Nhập ----------

        [Fact]
        public void NhapCsv_XemTruoc_XacNhan_GhiVaoThuVien() => Sta(() =>
        {
            var csv = dir.File("cong-tac.csv");
            File.WriteAllText(csv, "Mã công tác,Tên công tác,Đơn vị tính,Đơn giá,Tiền tệ,Nhóm\r\nBT01,Bê tông,m3,1500,VND,Bê tông\r\nDD01,Đào đất,m3,,,\r\n,Thiếu mã,m3,,,\r\n", new UTF8Encoding(true));
            var session = Session();
            using (var page = new ExchangePage(session))
            {
                page.ReadFile(csv);
                Assert.Equal(ExchangePage.ImportStep.Table, page.Step);
                Assert.Equal(DatasetKind.WorkItems.ToString(), Ux.SelectedId(page.TableStep!.Kind));
                Assert.NotNull(page.TableStep.Preview);
                var review = page.Review!;
                // 2 công tác hợp lệ + 1 nhóm mới; dòng thiếu mã bị báo lỗi, không nhập.
                Assert.Equal(3, review.Analysis.ChangeCount);
                Assert.Single(review.Analysis.Issues);
                Assert.Equal(XS.Submit(3), review.SubmitButton.Text);
                review.Submit();
                Assert.Equal(ExchangePage.ImportStep.Done, page.Step);
                Assert.Contains("tạo 1 nhóm mới", prompts.Confirms.Single());
            }
            var lib = Saved();
            Assert.Equal(new[] { "BT01", "DD01" }, lib.WorkItems.Select(w => w.Code).OrderBy(c => c));
            Assert.Equal("Bê tông", Assert.Single(lib.Categories).Name);
        });

        [Fact]
        public void NhapCsv_BoMapCotBatBuoc_KhongChoNhap() => Sta(() =>
        {
            var csv = dir.File("cong-tac.csv");
            File.WriteAllText(csv, "Mã công tác,Tên công tác,Đơn vị tính\nBT01,Bê tông,m3\n", new UTF8Encoding(false));
            var session = Session();
            using (var page = new ExchangePage(session))
            {
                page.ReadFile(csv);
                Ux.SelectId(page.TableStep!.MappingCombos["code"], "");
                Assert.NotEmpty(page.Review!.Analysis.Problems);
                Assert.False(page.Review.SubmitButton.Enabled);
            }
        });

        [Fact]
        public void NhapFileSaoLuuCuaBanWeb_KhoiPhucDuThuVien() => Sta(() =>
        {
            var session = Session();
            using (var page = new ExchangePage(session))
            {
                page.ReadFile(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Fixtures", "web-backup-v3.json"));
                Assert.Equal(ExchangePage.ImportStep.Multi, page.Step);
                page.Review!.Submit();
                Assert.Equal(ExchangePage.ImportStep.Done, page.Step);
            }
            var expected = ExchangeTests.SampleLibrary();
            var lib = Saved();
            Assert.Equal(
                (expected.Categories.Count, expected.Suppliers.Count, expected.WorkItems.Count, expected.Resources.Count, expected.ResourcePrices.Count, expected.Norms.Count, expected.NormComponents.Count),
                (lib.Categories.Count, lib.Suppliers.Count, lib.WorkItems.Count, lib.Resources.Count, lib.ResourcePrices.Count, lib.Norms.Count, lib.NormComponents.Count));
        });

        [Fact]
        public void NhapFile_KhongHopLe_BaoLoiTaiBuocChonNguon() => Sta(() =>
        {
            var session = Session();
            using (var page = new ExchangePage(session))
            {
                page.ReadFile(dir.File("thu-vien.xlsx"));
                Assert.Equal(XS.XlsxNotSupported, page.ImportError);
                page.ReadFile(dir.File("khong-co.csv"));
                Assert.Equal(XS.FileUnreadable, page.ImportError);
                File.WriteAllText(dir.File("la.json"), "{\"hello\":1}");
                page.ReadFile(dir.File("la.json"));
                Assert.Equal("Đây không phải file sao lưu thư viện ConsQuotation.", page.ImportError);
                Assert.Equal(ExchangePage.ImportStep.Source, page.Step);
            }
        });

        [Fact]
        public void NhapTuSheet_DocQuaExcel_GiuChuHienThiCuaOSo() => Sta(() =>
        {
            var table = new SourceTable
            {
                Label = "Sheet \"Giá\"",
                FirstRowNumber = 3,
                Rows = new List<List<RawCell?>>
                {
                    new List<RawCell?> { new RawCell("Mã tài nguyên"), new RawCell("Tên tài nguyên"), new RawCell("Loại"), new RawCell("Đơn vị tính") },
                    new List<RawCell?> { new RawCell(7.0, "007"), new RawCell("Cát vàng"), new RawCell("Vật liệu"), new RawCell("m3") },
                },
            };
            workbooks.Info = new WorkbookInfo { WorkbookName = "Gia.xlsx", ActiveSheet = "Giá", Sheets = { new SheetSummary { Name = "Giá", RowCount = 2, ColumnCount = 4 } } };
            workbooks.Sheets["Giá"] = new SheetRead { Table = table, TotalRows = 2 };
            var session = Session();
            using (var page = new ExchangePage(session))
            {
                page.LoadWorkbook().Wait();
                Assert.Equal("Giá", Ux.SelectedId(page.SheetChoice!));
                page.ReadSheet("Giá").Wait();
                Assert.Equal(ExchangePage.ImportStep.Table, page.Step);
                page.Review!.Submit();
            }
            Assert.Equal("007", Saved().Resources.Single().Code);
        });

        [Fact]
        public void NhapTuSheet_QuaGioiHanDong_BaoLoi() => Sta(() =>
        {
            workbooks.Info = new WorkbookInfo { WorkbookName = "Lon.xlsx", Sheets = { new SheetSummary { Name = "S", RowCount = 60000, ColumnCount = 3 } } };
            workbooks.Sheets["S"] = new SheetRead { Table = new SourceTable(), TotalRows = 60000 };
            var session = Session();
            using (var page = new ExchangePage(session))
            {
                page.LoadWorkbook().Wait();
                page.ReadSheet("S").Wait();
                Assert.Equal(XS.SheetTooLarge(60000, Source.MaxImportRows), page.ImportError);
            }
        });

        [Fact]
        public void Nhap_ThuVienDoiGiuaChung_DungLaiKhongGhi() => Sta(() =>
        {
            var csv = dir.File("cong-tac.csv");
            File.WriteAllText(csv, "Mã công tác,Tên công tác,Đơn vị tính\nBT01,Bê tông,m3\n", new UTF8Encoding(false));
            var session = Session();
            using (var page = new ExchangePage(session))
            {
                page.ReadFile(csv);
                // Cửa sổ Excel khác vừa thêm đúng công tác này.
                Seed((s, lib) => s.SaveWorkItem(Item("BT01", "Bê tông khác"), null, lib));
                page.Review!.Submit();
                Assert.Equal(XS.ChangedMeanwhile, page.Review.Error);
                Assert.Equal(ExchangePage.ImportStep.Table, page.Step);
            }
            Assert.Equal("Bê tông khác", Saved().WorkItems.Single().Name);
        });

        // ---------- Cửa sổ ----------

        [Fact]
        public void CuaSo_TongQuan_NhacSaoLuu_SauSaoLuuThiHet() => Sta(() =>
        {
            Seed((s, lib) => s.SaveWorkItem(Item("BT01", "Bê tông"), null, lib));
            var session = Session();
            using (var form = new LibraryForm(session))
            {
                Assert.Equal(6, form.Tabs.TabPages.Count);
                Assert.Equal(XS.StatusNever, form.BackupStatusText);
                session.Service.RecordBackup(new DateTime(2026, 11, 2, 4, 0, 0, DateTimeKind.Utc));
                session.Reload();
                Assert.StartsWith("Lần sao lưu/xuất gần nhất", form.BackupStatusText);
                form.SelectSection(LibrarySection.Norms);
                Assert.Equal(S.TabNorms, form.Tabs.SelectedTab.Text);
            }
        });

        [Fact]
        public void CuaSo_FileThuVienHong_BaoLoi_KhongGhiDe() => Sta(() =>
        {
            File.WriteAllText(StorePath, "{ hỏng");
            var session = Session();
            using (var form = new LibraryForm(session))
            {
                Assert.StartsWith(S.LoadFailed, form.LoadErrorText);
                Assert.False(form.Tabs.Enabled);
            }
            Assert.Equal("{ hỏng", File.ReadAllText(StorePath));
        });
    }
}
