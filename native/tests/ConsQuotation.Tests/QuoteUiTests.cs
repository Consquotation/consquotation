using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.ExceptionServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Quotation;
using ConsQuotation.Core.Storage;
using ConsQuotation.LibraryUi;
using ConsQuotation.QuoteUi;
using Xunit;
using static ConsQuotation.Tests.Fixtures;

namespace ConsQuotation.Tests
{
    /// <summary>Thẻ báo giá chạy thật (không hiện cửa sổ) trên cổng Excel giả; cổng giả trả kết quả ngay nên mọi việc xong đồng bộ.</summary>
    public class QuoteUiTests : IDisposable
    {
        private const string Q = "CQ_Quote_1";
        private readonly TempDir dir = new TempDir();
        private readonly FakePrompts prompts = new FakePrompts();
        private readonly FakeQuoteWorkbook wb = new FakeQuoteWorkbook { TableListed = true };

        public void Dispose() => dir.Dispose();

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

        private QuoteSession Session(Action<LibrarySnapshot>? seed = null)
        {
            var store = new LibraryStore(dir.File("library.json"));
            if (seed != null)
            {
                store.Update(file => seed(file.Library));
            }
            var ids = 0;
            var library = new LibrarySession(new LibraryService(store, () => new DateTime(2026, 11, 6, 3, 0, 0, DateTimeKind.Utc), () => $"id-{Interlocked.Increment(ref ids)}"),
                prompts, new FakeWorkbooks(), () => new DateTime(2026, 11, 6, 10, 0, 0), wb);
            library.Reload();
            return new QuoteSession(library);
        }

        private static void Done(QuotePanel panel) => Assert.True(panel.LastWork.IsCompleted, "Việc của thẻ chưa xong");

        private static void SeedNorm(LibrarySnapshot library)
        {
            var a = Res("rA", ResourceType.Material, "kg", "Vật liệu A", "VL");
            var b = Res("rB", ResourceType.Labor, "công", "Nhân công B", "NC");
            library.Resources.AddRange(new[] { a, b });
            library.ResourcePrices.AddRange(new[] { Price("pA", "rA", 10000, "kg"), Price("pA2", "rA", 11000, "kg"), Price("pB", "rB", 40000, "công") });
            library.WorkItems.Add(new WorkItem { Id = "w1", Code = "CT-01", Name = "Công tác thử", Unit = "m3", UnitPrice = 50000, Currency = "VND", CreatedAt = T, UpdatedAt = T });
            library.Norms.Add(Norm("n1", "DM-01", workItemId: "w1"));
            library.NormComponents.AddRange(new[] { Comp("c1", a, 2, 0, "n1"), Comp("c2", b, 0.5m, 0, "n1") });
        }

        [Fact]
        public void TheThem_ChuaCoBang_BaoTaoBangTruoc() => Sta(() =>
        {
            wb.TableListed = false;
            var session = Session();
            using (var panel = new AddItemPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                Assert.Equal("", session.SelectedTable);
                Assert.Empty(session.Tables);
                Assert.Empty(wb.Rows);
            }
        });

        [Fact]
        public void TheThem_NhapTay_GhiDongVaHoSo_GiuNhomDonVi() => Sta(() =>
        {
            var session = Session();
            using (var panel = new AddItemPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.Add();
                Done(panel);
                Assert.Equal("Nhập nội dung công việc.", panel.Description.Error);
                Assert.Empty(wb.Rows);

                panel.Code.Value = "007";
                panel.Group.Value = "Móng";
                panel.Description.Value = "Đào đất";
                panel.Unit.Value = "m3";
                panel.Quantity.Value = "12,5";
                panel.UnitPrice.Value = "1000";
                panel.Add();
                Done(panel);
                Assert.StartsWith("Đã thêm công tác tại", panel.StatusText);
                var row = Assert.Single(wb.Rows);
                Assert.Equal("007", row[wb.Col("Mã công tác")]);
                Assert.Equal(12.5, row[wb.Col("Khối lượng")]);
                Assert.Equal(1000.0, row[wb.Col("Đơn giá")]);
                var id = (string)row[wb.Col(QuoteTemplate.LineIdHeader)]!;
                Assert.Matches("^[0-9a-f-]{36}$", id);
                var saved = QuotationXml.Decode(wb.Xml!).Record!;
                Assert.Equal(id, Assert.Single(saved.Items).Id);
                Assert.Equal(QuotationPricingMethod.Manual, saved.Items[0].PricingMethod);
                Assert.Equal(("Móng", "m3", "", ""), (panel.Group.Value, panel.Unit.Value, panel.Code.Value, panel.Quantity.Value));
            }
        });

        [Fact]
        public void TheThem_CoDuLieuDuoiBang_HuyThiKhongGhi() => Sta(() =>
        {
            wb.Below = new OccupiedCells { Count = 2, Sample = { "A30", "B31" } };
            prompts.Answer = (_, __) => false;
            var session = Session();
            using (var panel = new AddItemPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.Description.Value = "Dòng";
                panel.Add();
                Done(panel);
                Assert.Contains("A30, B31", Assert.Single(prompts.Confirms));
                Assert.Empty(wb.Rows);

                prompts.Answer = (_, __) => true;
                panel.Add();
                Done(panel);
                Assert.Single(wb.Rows);
            }
        });

        [Fact]
        public void TheThem_BangDoiLucGhi_BaoKhongGhi() => Sta(() =>
        {
            wb.ChangedOnAppend = true;
            var session = Session();
            using (var panel = new AddItemPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.Description.Value = "Dòng";
                panel.Add();
                Done(panel);
                Assert.StartsWith("Bảng hoặc dữ liệu bên dưới đã thay đổi", panel.StatusText);
                Assert.Equal("Dòng", panel.Description.Value);
            }
        });

        [Fact]
        public void TheThem_TuThuVien_ChupNguonVaGia() => Sta(() =>
        {
            var session = Session(SeedNorm);
            using (var panel = new AddItemPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                var item = session.Library.Library.WorkItems[0];
                panel.Prefill(LibraryPrefill.From(item, session.Library));
                Assert.Contains("CT-01", panel.PrefilledText);
                Assert.Equal(("CT-01", "50000"), (panel.Code.Value, panel.UnitPrice.Value));
                panel.Quantity.Value = "2";
                panel.Add();
                Done(panel);
                var saved = QuotationXml.Decode(wb.Xml!).Record!.Items[0];
                Assert.Equal(QuotationPricingMethod.Library, saved.PricingMethod);
                Assert.Equal(50000m, saved.LibraryPrice!.UnitPrice);
                Assert.True(wb.LibraryMarked);
                Assert.Equal("", panel.PrefilledText);
            }
        });

        [Fact]
        public void TheThem_PhanTichDinhMuc_NhieuGiaPhaiTuChon_GhiPhanTichRoiDong() => Sta(() =>
        {
            var session = Session(SeedNorm);
            using (var panel = new AddItemPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.Prefill(LibraryPrefill.From(session.Library.Library.WorkItems[0], session.Library));
                panel.MethodComposition.Checked = true;
                Assert.False(panel.UnitPrice.Box.Enabled);
                Assert.StartsWith("Phân tích định mức:", panel.Notes.Value);
                // Vật liệu có hai giá: add-in không tự chọn; nhân công có đúng một giá: chọn sẵn.
                Assert.Equal("", panel.Picker.Fields["c1"].Value);
                Assert.Equal("pB", panel.Picker.Fields["c2"].Value);

                panel.Picker.Fields["c1"].Value = "pA";
                panel.Quantity.Value = "3";
                panel.Add();
                Done(panel);
                Assert.Equal(40000.0, wb.Cell(0, "Đơn giá"));
                Assert.Equal(20000.0, wb.Cell(0, "Đơn giá vật liệu"));
                Assert.Equal(20000.0, wb.Cell(0, "Đơn giá nhân công"));
                Assert.Equal(2, wb.AnalysisRows.Count);
                var saved = QuotationXml.Decode(wb.Xml!).Record!.Items[0];
                Assert.Equal(QuotationPricingMethod.Norm, saved.PricingMethod);
                Assert.Equal(new[] { "pA", "pB" }, saved.Components.Select(c => c.PriceId));
                Assert.Equal(20000m, saved.WrittenBreakdown!.Material);
                Assert.Contains("Phân tích đơn giá", panel.StatusText);
            }
        });

        [Fact]
        public void TheThem_MaDaCoPhanTich_DungPhanTichCoSan_KhongGhiThanhPhan() => Sta(() =>
        {
            wb.ExistingAnalysis = new AnalysisPrice { Kind = AnalysisPriceKind.Value, Value = 70000 };
            var session = Session(SeedNorm);
            using (var panel = new AddItemPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.Prefill(LibraryPrefill.From(session.Library.Library.WorkItems[0], session.Library));
                panel.MethodComposition.Checked = true;
                panel.Quantity.Value = "1";
                panel.Add();
                Done(panel);
                Assert.Equal(70000.0, wb.Cell(0, "Đơn giá"));
                Assert.Equal("", wb.Cell(0, "Đơn giá vật liệu"));
                Assert.Empty(wb.AnalysisRows);
                Assert.Null(QuotationXml.Decode(wb.Xml!).Record!.Items[0].WrittenBreakdown);
            }
        });

        [Fact]
        public void TheTao_HuyXacNhan_KhongGhi_XacNhanThiGhi() => Sta(() =>
        {
            prompts.Answer = (_, __) => false;
            wb.Occupied = new OccupiedCells { Count = 1, Sample = { "B2" } };
            var session = Session();
            using (var panel = new CreatePanel(session))
            {
                panel.AtSelection.Checked = true;
                panel.Rows.Value = "9999";
                panel.Create();
                Done(panel);
                Assert.Contains("B2", Assert.Single(prompts.Confirms));
                Assert.Equal(0, wb.TemplatesWritten);
                Assert.Equal("500", panel.Rows.Value);

                prompts.Answer = (_, __) => true;
                panel.Create();
                Done(panel);
                Assert.Equal(1, wb.TemplatesWritten);
                Assert.StartsWith("Đã tạo bảng CQ_Quote_1", panel.StatusText);
            }
        });

        [Fact]
        public void TheTao_TenSheetSai_KhongGoiExcel() => Sta(() =>
        {
            var session = Session();
            using (var panel = new CreatePanel(session))
            {
                panel.SheetName.Value = "Báo/giá";
                panel.Create();
                Done(panel);
                Assert.NotNull(panel.SheetName.Error);
                Assert.Equal(0, wb.TemplatesWritten);
            }
        });

        [Fact]
        public void TheThongTin_LuuChiMucDoi_NgaySai_SheetDoiGiuChuDangSua() => Sta(() =>
        {
            var session = Session();
            using (var panel = new InfoPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.ReloadAsync();
                Done(panel);
                panel.Fields[InfoKey.Date].Value = "32/13/2026";
                panel.SaveNow();
                Done(panel);
                Assert.Equal("Ngày không hợp lệ. Dùng dạng dd/mm/yyyy.", panel.Fields[InfoKey.Date].Error);
                Assert.Empty(wb.InfoWrites);

                panel.Fields[InfoKey.Date].Value = "05/11/2026";
                panel.Fields[InfoKey.Customer].Value = "Khách";
                panel.SaveNow();
                Done(panel);
                Assert.Equal(new[] { InfoKey.Customer, InfoKey.Date }, wb.InfoWrites.Select(w => w.Key));
                Assert.Equal("Đã ghi 2 mục thông tin.", panel.StatusText);

                panel.Fields[InfoKey.Customer].Value = "Khách mới";
                wb.ChangedOnInfo = true;
                panel.SaveNow();
                Done(panel);
                Assert.StartsWith("Thông tin trên sheet vừa thay đổi", panel.StatusText);
                Assert.Equal("Khách mới", panel.Fields[InfoKey.Customer].Value);
            }
        });

        [Fact]
        public void TheCongTac_TinhLai_HoanTat_BiChan_RoiHoanTat() => Sta(() =>
        {
            wb.Add("TC-01", 2.0, "");
            var session = Session();
            using (var panel = new ItemsPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.ReloadAsync();
                Done(panel);
                Assert.StartsWith("Chưa có hồ sơ.", panel.StateText);
                _ = panel.Lines.Handle;
                Assert.Single(panel.Lines.Records);

                panel.Recalculate();
                Done(panel);
                Assert.StartsWith("Đã lưu kết quả tính vào hồ sơ.", panel.StatusText);
                Assert.StartsWith("Nháp.", panel.StateText);

                panel.Complete();
                Done(panel);
                Assert.Contains("1 dòng chưa tính được", panel.BlockersText);

                wb.SetCell(0, "Đơn giá", 1500.0);
                panel.ReloadAsync();
                Done(panel);
                panel.Complete();
                Done(panel);
                Assert.Equal("Đã đánh dấu báo giá hoàn tất.", panel.StatusText);
                Assert.StartsWith("Đã hoàn tất.", panel.StateText);

                wb.SetCell(0, "Khối lượng", 3.0);
                panel.ReloadAsync();
                Done(panel);
                Assert.StartsWith("Đã sửa sau khi hoàn tất.", panel.StateText);
            }
        });

        [Fact]
        public void TheCongTac_SheetDoiSauKhiXem_KhongGhi() => Sta(() =>
        {
            wb.Add("TC-01", 2.0, 10.0);
            var session = Session();
            using (var panel = new ItemsPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.ReloadAsync();
                Done(panel);
                wb.SetCell(0, "Khối lượng", 9.0);
                panel.Recalculate();
                Done(panel);
                Assert.StartsWith("Bảng báo giá hoặc hồ sơ vừa thay đổi", panel.StatusText);
                Assert.Null(wb.Xml);
                Assert.Equal("", wb.Cell(0, QuoteTemplate.LineIdHeader));
            }
        });

        [Fact]
        public void TheCongTac_BangCu_BoSungCot_HuyThiKhongThem() => Sta(() =>
        {
            wb.Headers = QuoteTemplate.Columns.Select(c => c.Header).ToList();
            wb.Add("TC", 1.0, 1.0);
            prompts.Answer = (_, __) => false;
            var session = Session();
            using (var panel = new ItemsPanel(session))
            {
                session.RefreshTablesAsync(true).GetAwaiter().GetResult();
                panel.ReloadAsync();
                Done(panel);
                panel.AddColumns();
                Done(panel);
                Assert.Equal(9, wb.Headers.Count);
                prompts.Answer = (_, __) => true;
                panel.AddColumns();
                Done(panel);
                Assert.Equal(14, wb.Headers.Count);
                Assert.StartsWith("Đã thêm cột:", panel.StatusText);
            }
        });

        [Fact]
        public void PhienBang_TheoVungChon_ChiKhiVungChonChuyenBang() => Sta(() =>
        {
            wb.TableListed = false;
            var session = Session();
            QuoteTableInfo Table(string name, bool selected) => new QuoteTableInfo { TableName = name, SheetName = "S", HeadersMatch = true, ContainsSelection = selected };
            wb.TableInfos = new List<QuoteTableInfo> { Table("CQ_Quote_1", true), Table("CQ_Quote_2", false) };
            session.RefreshTablesAsync(true).GetAwaiter().GetResult();
            Assert.Equal("CQ_Quote_1", session.SelectedTable);
            // Người dùng chọn bảng khác trong ô; vùng chọn trong Excel chưa đổi: giữ lựa chọn.
            session.SelectTable("CQ_Quote_2");
            session.RefreshTablesAsync(true).GetAwaiter().GetResult();
            Assert.Equal("CQ_Quote_2", session.SelectedTable);
            // Vùng chọn chuyển sang bảng khác rồi quay lại: theo vùng chọn.
            wb.TableInfos = new List<QuoteTableInfo> { Table("CQ_Quote_1", false), Table("CQ_Quote_2", true) };
            session.RefreshTablesAsync(true).GetAwaiter().GetResult();
            wb.TableInfos = new List<QuoteTableInfo> { Table("CQ_Quote_1", true), Table("CQ_Quote_2", false) };
            session.RefreshTablesAsync(false).GetAwaiter().GetResult();
            Assert.Equal("CQ_Quote_2", session.SelectedTable);
            session.RefreshTablesAsync(true).GetAwaiter().GetResult();
            Assert.Equal("CQ_Quote_2", session.SelectedTable);
        });

        [Fact]
        public void LoiCom_CoThongBaoTiengViet_KhongLoNoiDungO()
        {
            var com = new System.Runtime.InteropServices.COMException("nội dung lạ", unchecked((int)0x800A03EC));
            var text = Excel.ExcelErrors.DescribeWrite(com);
            Assert.StartsWith("Excel từ chối thao tác.", text);
            Assert.Contains("0x800A03EC", text);
            Assert.Contains("Ctrl+Z", text);
            Assert.DoesNotContain("nội dung lạ", text);
            Assert.Equal("x", Excel.ExcelErrors.DescribeWrite(new Excel.WorkbookException("x")));
            Assert.True(Excel.ExcelErrors.IsChange(new TargetChangedException()));
            Assert.False(Excel.ExcelErrors.IsChange(new InvalidOperationException()));
        }
    }
}
