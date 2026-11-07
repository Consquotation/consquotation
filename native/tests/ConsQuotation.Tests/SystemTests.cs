using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Licensing;
using ConsQuotation.Core.Storage;
using ConsQuotation.Core.Updates;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ribbon;
using ConsQuotation.SystemUi;
using Newtonsoft.Json.Linq;
using Xunit;
using static ConsQuotation.Tests.Fixtures;

namespace ConsQuotation.Tests
{
    public class AppVersionTests
    {
        private static AppVersion V(string text) => AppVersion.Parse(text)!;

        [Fact]
        public void Doc_duoc_dang_tag_va_bo_chu_v()
        {
            Assert.Equal("2.0.0-alpha.3", V("v2.0.0-alpha.3").Text);
            Assert.True(V("2.0.0-alpha.3").IsPrerelease);
            Assert.False(V("v2.0.0").IsPrerelease);
            Assert.All(new[] { "", "2.0", "2.0.0.0", "bản mới", "v2.0.0-", "latest" }, t => Assert.Null(AppVersion.Parse(t)));
            Assert.Null(AppVersion.Parse(null));
        }

        [Theory]
        [InlineData("2.0.0", "1.13.1")]
        [InlineData("2.0.1", "2.0.0")]
        [InlineData("2.1.0", "2.0.9")]
        [InlineData("10.0.0", "9.9.9")]
        [InlineData("2.0.0", "2.0.0-alpha.3")]
        [InlineData("2.0.0-alpha.10", "2.0.0-alpha.9")]
        [InlineData("2.0.0-beta.1", "2.0.0-alpha.9")]
        [InlineData("2.0.0-alpha.1", "2.0.0-alpha")]
        [InlineData("2.0.0-alpha", "2.0.0-1")]
        public void Thu_tu_theo_SemVer(string higher, string lower)
        {
            Assert.True(V(higher).CompareTo(V(lower)) > 0);
            Assert.True(V(lower).CompareTo(V(higher)) < 0);
        }

        [Fact]
        public void Bang_nhau()
        {
            Assert.Equal(0, V("v2.0.0").CompareTo(V("2.0.0")));
            Assert.Equal(0, V("2.0.0-alpha.3").CompareTo(V("v2.0.0-alpha.3")));
        }
    }

    public class UpdateServiceTests : IDisposable
    {
        private readonly TempDir dir = new TempDir();
        private DateTime now = new DateTime(2026, 11, 7, 8, 0, 0, DateTimeKind.Utc);
        private int calls;

        public void Dispose() => dir.Dispose();

        private static string Release(string tag, bool draft = false, bool prerelease = false, string? url = null, string asset = "auto") =>
            new JObject
            {
                ["tag_name"] = tag,
                ["draft"] = draft,
                ["prerelease"] = prerelease,
                ["html_url"] = url ?? $"{Releases.RepoPage}/tag/{tag}",
                ["assets"] = asset == "" ? new JArray() : new JArray(new JObject { ["name"] = asset == "auto" ? $"ConsQuotation-Setup-{tag.TrimStart('v')}.exe" : asset }),
            }.ToString();

        private static string List(params string[] releases) => "[" + string.Join(",", releases) + "]";

        private UpdateService Service(string version, Func<Task<string>> fetch) =>
            new UpdateService(dir.File(UpdateService.FileName), version, () => { calls++; return fetch(); }, () => now);

        [Fact]
        public void Chon_ban_cao_nhat_khong_phu_thuoc_thu_tu()
        {
            var update = Releases.Newest(List(Release("v2.0.1"), Release("v2.1.0"), Release("v2.0.5")), "2.0.0");
            Assert.Equal("2.1.0", update!.Version);
            Assert.Equal($"{Releases.RepoPage}/tag/v2.1.0", update.PageUrl);
        }

        [Fact]
        public void Khong_bao_ban_bang_hoac_cu_hon()
        {
            Assert.Null(Releases.Newest(List(Release("v2.0.0"), Release("v1.13.1")), "2.0.0"));
            Assert.Null(Releases.Newest("[]", "2.0.0"));
        }

        [Fact]
        public void Ban_chinh_thuc_khong_duoc_bao_ban_thu_nhung_ban_thu_duoc_bao_ca_hai()
        {
            var list = List(Release("v2.1.0-alpha.1", prerelease: true), Release("v2.0.1"));
            Assert.Equal("2.0.1", Releases.Newest(list, "2.0.0")!.Version);
            Assert.Equal("2.1.0-alpha.1", Releases.Newest(list, "2.0.0-alpha.3")!.Version);
            Assert.Equal("2.0.0", Releases.Newest(List(Release("v2.0.0")), "2.0.0-alpha.3")!.Version);
        }

        [Fact]
        public void Bo_ban_nhap_ban_chua_co_bo_cai_va_duong_dan_la()
        {
            Assert.Null(Releases.Newest(List(Release("v3.0.0", draft: true)), "2.0.0"));
            Assert.Null(Releases.Newest(List(Release("v3.0.0", asset: "")), "2.0.0"));
            Assert.Null(Releases.Newest(List(Release("v3.0.0", asset: "khac.zip")), "2.0.0"));
            Assert.Null(Releases.Newest(List(Release("v3.0.0", url: "https://example.com/tai-ve")), "2.0.0"));
            // Tiền tố giống nhưng là miền khác.
            Assert.Null(Releases.Newest(List(Release("v3.0.0", url: Releases.RepoPage + ".example.com/x")), "2.0.0"));
            Assert.Null(Releases.Newest(List(Release("web-build-1")), "2.0.0"));
        }

        [Fact]
        public async Task Co_ban_moi_thi_luu_lai_va_khong_can_hoi_mang_lan_sau()
        {
            var service = Service("2.0.0", () => Task.FromResult(List(Release("v2.0.1"))));
            Assert.True(service.Due);
            Assert.Null(service.LastCheck);
            var result = await service.CheckAsync();
            Assert.Equal(UpdateOutcome.Available, result.Outcome);
            Assert.Equal(now, service.LastCheck);
            Assert.Equal("2.0.1", Service("2.0.0", () => throw new InvalidOperationException()).Known!.Version);
            Assert.Equal(1, calls);
        }

        [Fact]
        public async Task Da_cai_ban_moi_thi_khong_bao_nua()
        {
            await Service("2.0.0", () => Task.FromResult(List(Release("v2.0.1")))).CheckAsync();
            Assert.Null(Service("2.0.1", () => Task.FromResult("[]")).Known);
        }

        [Fact]
        public async Task Toi_da_moi_ngay_mot_lan_ke_ca_khi_loi()
        {
            var service = Service("2.0.0", () => throw new HttpRequestException("mất mạng"));
            var result = await service.CheckAsync();
            Assert.Equal(UpdateOutcome.Failed, result.Outcome);
            Assert.False(service.Due);
            now = now.AddHours(23.9);
            Assert.False(service.Due);
            now = now.AddHours(0.1);
            Assert.True(service.Due);
        }

        [Fact]
        public async Task Dong_ho_bi_chinh_lui_thi_coi_la_den_han()
        {
            var service = Service("2.0.0", () => Task.FromResult("[]"));
            await service.CheckAsync();
            now = now.AddDays(-3);
            Assert.True(service.Due);
        }

        [Fact]
        public async Task Loi_mang_hoac_noi_dung_la_thi_giu_ban_moi_da_biet()
        {
            await Service("2.0.0", () => Task.FromResult(List(Release("v2.0.1")))).CheckAsync();
            foreach (var bad in new Func<Task<string>>[]
            {
                () => throw new HttpRequestException("mất mạng"),
                () => throw new TaskCanceledException(),
                () => Task.FromResult("<html>proxy</html>"),
                () => Task.FromResult("{\"message\":\"API rate limit exceeded\"}"),
            })
            {
                var result = await Service("2.0.0", bad).CheckAsync();
                Assert.Equal(UpdateOutcome.Failed, result.Outcome);
                Assert.Equal("2.0.1", result.Update!.Version);
                Assert.Equal("2.0.1", Service("2.0.0", bad).Known!.Version);
            }
        }

        [Fact]
        public async Task File_luu_hong_hoac_bi_sua_duong_dan_thi_khong_bao()
        {
            var path = dir.File(UpdateService.FileName);
            File.WriteAllText(path, "{hỏng");
            var service = Service("2.0.0", () => Task.FromResult("[]"));
            Assert.Null(service.Known);
            Assert.True(service.Due);
            File.WriteAllText(path, new JObject { ["latest"] = "9.0.0", ["url"] = "https://example.com/x" }.ToString());
            Assert.Null(service.Known);
            await service.CheckAsync();
            Assert.False(service.Due);
        }
    }

    public class LicenseStorageTests : IDisposable
    {
        private readonly TempDir dir = new TempDir();
        private DateTime now = new DateTime(2026, 11, 7, 8, 0, 0, DateTimeKind.Utc);

        public void Dispose() => dir.Dispose();

        private string Path_ => dir.File(FileLicenseStorage.FileName);

        private LicenseService Service(Func<Task<string>>? fetch = null) =>
            new LicenseService(new FileLicenseStorage(Path_), fetch ?? new Func<Task<string>>(() => throw new HttpRequestException()), () => now);

        [Fact]
        public void Lan_dau_bat_dau_dung_thu_va_luu_ra_file()
        {
            var service = Service();
            Assert.Null(service.Peek());
            Assert.False(File.Exists(Path_));
            var state = service.State();
            Assert.Equal(LicenseKind.Trial, state.Kind);
            Assert.Equal(30, state.DaysLeft);
            Assert.True(File.Exists(Path_));
            now = now.AddDays(10);
            Assert.Equal(20, Service().State().DaysLeft);
            Assert.Equal(20, Service().Peek()!.DaysLeft);
        }

        [Fact]
        public void Het_30_ngay_thi_het_han()
        {
            Service().State();
            now = now.AddDays(30);
            Assert.Equal(LicenseKind.Expired, Service().State().Kind);
        }

        [Fact]
        public async Task Kich_hoat_con_nguyen_khi_mo_lai_va_khong_het_han()
        {
            const string email = "test@example.com";
            var code = new string('A', 19) + "2";
            var list = new JObject { ["format"] = License.ListFormat, ["keys"] = new JArray(License.Key(email, code)) }.ToString();
            var result = await Service(() => Task.FromResult(list)).ActivateAsync(" Test@Example.com ", code.ToLowerInvariant());
            Assert.True(result.Ok);
            now = now.AddDays(1000);
            var state = Service().State();
            Assert.Equal(LicenseKind.Licensed, state.Kind);
            Assert.Equal(email, state.Activation!.Email);
            Assert.Equal(code, state.Activation.Code);
        }

        [Fact]
        public void File_hong_hoac_sua_tay_thi_tinh_lai_dung_thu_khong_loi()
        {
            foreach (var text in new[] { "{hỏng", "[]", "{\"trialStart\":\"không phải ngày\"}", "{\"trialStart\":123}" })
            {
                File.WriteAllText(Path_, text);
                Assert.Equal(LicenseKind.Trial, Service().State().Kind);
            }
            File.WriteAllText(Path_, "{\"trialStart\":\"2026-11-01T00:00:00.000Z\",\"activation\":{\"code\":\"X\"}}");
            Assert.Equal(LicenseKind.Trial, Service().State().Kind);
        }

        [Fact]
        public void Khong_ghi_duoc_file_thi_van_dung_thu_duoc()
        {
            // Đường dẫn trỏ vào một file có sẵn như thể là thư mục: không tạo được thư mục, IOException.
            File.WriteAllText(dir.File("chan"), "x");
            var service = new LicenseService(new FileLicenseStorage(Path.Combine(dir.File("chan"), "license.json")), () => throw new HttpRequestException(), () => now);
            Assert.Equal(LicenseKind.Trial, service.State().Kind);
        }

        [Fact]
        public void Ghi_khong_de_lai_file_tam()
        {
            Service().State();
            Service(() => Task.FromResult("")).State();
            Assert.Equal(new[] { FileLicenseStorage.FileName }, Directory.GetFiles(Path.GetDirectoryName(Path_)!).Select(Path.GetFileName));
        }

        [Fact]
        public void Duong_dan_file_cung_thu_muc_voi_thu_vien()
        {
            var saved = Environment.GetEnvironmentVariable(LibraryStore.PathVariable);
            try
            {
                Environment.SetEnvironmentVariable(LibraryStore.PathVariable, dir.File("library.json"));
                Assert.Equal(dir.File("license.json"), SettingsFile.PathOf("license.json"));
                Environment.SetEnvironmentVariable(LibraryStore.PathVariable, null);
                Assert.Equal(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ConsQuotation", "update-check.json"), SettingsFile.PathOf("update-check.json"));
            }
            finally
            {
                Environment.SetEnvironmentVariable(LibraryStore.PathVariable, saved);
            }
        }
    }

    /// <summary>Thẻ Hệ thống chạy thật (không hiện cửa sổ); mạng, trình duyệt và clipboard được thay.</summary>
    public class SystemUiTests : IDisposable
    {
        private const string Email = "test@example.com";
        private readonly string code = new string('A', 19) + "2";
        private readonly TempDir dir = new TempDir();
        private readonly FakePrompts prompts = new FakePrompts();
        private readonly List<string> opened = new List<string>();
        private readonly List<string> copied = new List<string>();
        private DateTime now = new DateTime(2026, 11, 7, 8, 0, 0, DateTimeKind.Utc);
        private Func<Task<string>> licenseList = () => throw new HttpRequestException("mất mạng");
        private Func<Task<string>> releases = () => throw new HttpRequestException("mất mạng");
        private int changes;

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

        private string ValidList() => new JObject { ["format"] = License.ListFormat, ["keys"] = new JArray(License.Key(Email, code)) }.ToString();

        private SystemSession Session()
        {
            var store = new LibraryStore(dir.File("library.json"));
            var library = new LibrarySession(new LibraryService(store, () => now, () => Guid.NewGuid().ToString()), prompts, new FakeWorkbooks(), () => now.ToLocalTime());
            library.Reload();
            var session = new SystemSession(
                new LicenseService(new FileLicenseStorage(dir.File("license.json")), () => licenseList(), () => now),
                new UpdateService(dir.File("update-check.json"), "2.0.0", () => releases(), () => now),
                library)
            {
                Open = opened.Add,
                Copy = copied.Add,
                ExcelVersion = () => Task.FromResult("16.0.20527"),
            };
            session.Changed += () => changes++;
            return session;
        }

        private void Expire(SystemSession session)
        {
            session.License.State();
            now = now.AddDays(31);
        }

        [Fact]
        public void Dung_thu_hien_so_ngay_va_co_form_kich_hoat_khong_co_sao_luu() => Sta(() =>
        {
            var panel = new LicensePanel(Session());
            panel.Reload();
            Assert.Contains("còn 30 ngày", panel.StatusText);
            Assert.True(panel.ShowsRequest);
            Assert.False(panel.ShowsBackup);
            Assert.Contains("Tới: nguyenchikhoa97@gmail.com", panel.MailText);
            Assert.Contains("Phiên bản add-in:", panel.MailText);
        });

        [Fact]
        public void Nut_soan_thu_mo_dung_dia_chi() => Sta(() =>
        {
            var panel = new LicensePanel(Session());
            panel.Reload();
            panel.GmailButton.PerformClick();
            panel.OutlookButton.PerformClick();
            panel.MailAppButton.PerformClick();
            Assert.StartsWith("https://mail.google.com/mail/", opened[0]);
            Assert.StartsWith("https://outlook.live.com/mail/", opened[1]);
            Assert.StartsWith("mailto:nguyenchikhoa97@gmail.com", opened[2]);
            Assert.Contains("Đã mở trang soạn thư", panel.MessageText);
        });

        [Fact]
        public void Khong_mo_duoc_trinh_duyet_thi_bao_cach_khac() => Sta(() =>
        {
            var session = Session();
            session.Open = _ => throw new System.ComponentModel.Win32Exception(1155);
            var panel = new LicensePanel(session);
            panel.Reload();
            panel.GmailButton.PerformClick();
            Assert.Equal(Sys.OpenFailed, panel.MessageText);
        });

        [Fact]
        public void Sao_chep_noi_dung_thu() => Sta(() =>
        {
            var session = Session();
            var panel = new LicensePanel(session);
            panel.Reload();
            panel.CopyButton.PerformClick();
            Assert.Equal(panel.MailText, copied.Single());
            Assert.Equal(Sys.Copied, panel.MessageText);
            session.Copy = _ => throw new ExternalException("clipboard bận");
            panel.CopyButton.PerformClick();
            Assert.Equal(Sys.CopyFailed, panel.MessageText);
        });

        [Fact]
        public void Kich_hoat_loi_bao_dung_ly_do_va_khong_ghi_nhan() => Sta(() =>
        {
            var session = Session();
            var panel = new LicensePanel(session);
            panel.Reload();

            panel.EmailField.Value = "khong-phai-email";
            panel.CodeField.Value = code;
            panel.ActivateButton.PerformClick();
            Assert.Equal(Sys.ActivateError(ActivateFailure.InvalidEmail), panel.MessageText);

            panel.EmailField.Value = Email;
            panel.CodeField.Value = "NGAN";
            panel.ActivateButton.PerformClick();
            Assert.Equal(Sys.ActivateError(ActivateFailure.InvalidCode), panel.MessageText);

            panel.CodeField.Value = code;
            panel.ActivateButton.PerformClick();
            Assert.True(panel.LastWork.IsCompleted);
            Assert.Equal(Sys.ActivateError(ActivateFailure.Unavailable), panel.MessageText);

            licenseList = () => Task.FromResult(new JObject { ["format"] = License.ListFormat, ["keys"] = new JArray() }.ToString());
            panel.ActivateButton.PerformClick();
            Assert.Equal(Sys.ActivateError(ActivateFailure.NotFound), panel.MessageText);

            Assert.Equal(LicenseKind.Trial, session.License.State().Kind);
            Assert.Equal(0, changes);
            Assert.True(panel.ActivateButton.Enabled);
            Assert.Equal(Sys.Activate, panel.ActivateButton.Text);
        });

        [Fact]
        public void Kich_hoat_dung_thi_doi_trang_thai_va_bao_ribbon() => Sta(() =>
        {
            var session = Session();
            licenseList = () => Task.FromResult(ValidList());
            var panel = new LicensePanel(session);
            panel.Reload();
            panel.EmailField.Value = " Test@Example.com ";
            panel.CodeField.Value = code.ToLowerInvariant();
            panel.ActivateButton.PerformClick();
            Assert.Equal(Sys.Activated, panel.MessageText);
            Assert.Contains(Email, panel.StatusText);
            Assert.Contains(code, panel.CodeText);
            Assert.False(panel.ShowsRequest);
            Assert.False(panel.ShowsBackup);
            Assert.Equal("", panel.CodeField.Value);
            Assert.Equal(1, changes);

            var reopened = new LicensePanel(Session());
            reopened.Reload();
            Assert.Contains("Đã cấp phép vĩnh viễn", reopened.StatusText);
        });

        [Fact]
        public void Het_han_thi_hien_sao_luu_va_ghi_duoc_file_khong_doi_thu_vien() => Sta(() =>
        {
            var session = Session();
            Assert.True(session.Library.Service.SaveWorkItem(new WorkItemForm { Code = "CT-01", Name = "Công tác A", Unit = "m3", UnitPrice = "1000" }, null, session.Library.Service.Load()).Ok);
            Expire(session);
            var panel = new LicensePanel(session);
            panel.Reload();
            Assert.Contains("Đã hết 30 ngày dùng thử", panel.StatusText);
            Assert.True(panel.ShowsRequest);
            Assert.True(panel.ShowsBackup);

            prompts.SavePath = null;
            panel.BackupButton.PerformClick();
            Assert.Equal("", panel.MessageText);

            prompts.SavePath = dir.File("sao-luu.json");
            panel.BackupButton.PerformClick();
            Assert.Contains("sao-luu.json", panel.MessageText);
            var parsed = Core.Exchange.Backup.ParseBackupJson(File.ReadAllText(prompts.SavePath));
            Assert.True(parsed.Ok);
            Assert.Contains("Công tác A", File.ReadAllText(prompts.SavePath));

            prompts.SavePath = Path.Combine(dir.File("khong-co-thu-muc"), "x.json");
            panel.BackupButton.PerformClick();
            Assert.Contains(XS.Failed, panel.MessageText);
        });

        [Fact]
        public void Kiem_tra_cap_nhat_tay_hien_du_ba_ket_qua() => Sta(() =>
        {
            var session = Session();
            var panel = new SettingsPanel(session);
            panel.Reload();
            Assert.Equal(Sys.NeverChecked, panel.LastCheckText);
            Assert.False(panel.OffersDownload);

            panel.CheckButton.PerformClick();
            Assert.True(panel.LastWork.IsCompleted);
            Assert.Equal(Sys.CheckFailed, panel.UpdateStatusText);
            Assert.StartsWith("Lần kiểm tra gần nhất:", panel.LastCheckText);

            releases = () => Task.FromResult("[]");
            panel.CheckButton.PerformClick();
            Assert.Equal(Sys.UpToDate, panel.UpdateStatusText);
            Assert.False(panel.OffersDownload);

            var page = $"{Releases.RepoPage}/tag/v2.0.1";
            releases = () => Task.FromResult($"[{{\"tag_name\":\"v2.0.1\",\"html_url\":\"{page}\",\"assets\":[{{\"name\":\"ConsQuotation-Setup-2.0.1.exe\"}}]}}]");
            panel.CheckButton.PerformClick();
            Assert.Equal(Sys.UpdateAvailable("2.0.1"), panel.UpdateStatusText);
            Assert.True(panel.OffersDownload);
            panel.DownloadButton.PerformClick();
            Assert.Equal(page, opened.Single());
            Assert.Equal(3, changes);

            var reopened = new SettingsPanel(Session());
            reopened.Reload();
            Assert.Equal(Sys.UpdateAvailable("2.0.1"), reopened.UpdateStatusText);
        });

        [Fact]
        public void Cai_dat_hien_phien_ban_excel_va_thu_vien() => Sta(() =>
        {
            var session = Session();
            var panel = new SettingsPanel(session);
            panel.Reload();
            Assert.Contains("Excel 16.0.20527", panel.VersionText);
            Assert.Contains(Environment.Is64BitProcess ? "64-bit" : "32-bit", panel.VersionText);
            Assert.Contains("ConsQuotation.Core", panel.VersionText);
            Assert.Contains(LibraryStore.DefaultPath, panel.LibraryFileText);
            Assert.Equal(Sys.LibraryCounts(0, 0, 0), panel.LibraryCountsText);
        });

        [Fact]
        public void File_thu_vien_hong_thi_bao_trong_the_khong_vo_cua_so() => Sta(() =>
        {
            var session = Session();
            File.WriteAllText(dir.File("library.json"), "{hỏng");
            var panel = new SettingsPanel(session);
            panel.Reload();
            Assert.NotEqual(Sys.LibraryCounts(0, 0, 0), panel.LibraryCountsText);
        });

        [Fact]
        public void Tro_giup_mo_duoc_cac_lien_ket() => Sta(() =>
        {
            var panel = new HelpPanel(Session());
            foreach (var button in Buttons(panel))
            {
                button.PerformClick();
            }
            Assert.Equal(new[] { AppInfo.GuideUrl, AppInfo.ReleasesUrl, AppInfo.IssuesUrl }, opened);
        });

        private static IEnumerable<System.Windows.Forms.Button> Buttons(System.Windows.Forms.Control root) =>
            root.Controls.Cast<System.Windows.Forms.Control>().SelectMany(c => (c is System.Windows.Forms.Button b ? new[] { b } : new System.Windows.Forms.Button[0]).Concat(Buttons(c)));

        [Fact]
        public void Nhan_ribbon_theo_trang_thai()
        {
            Assert.Equal("Bản quyền", Sys.LicenseLabel(null));
            Assert.Equal("Dùng thử: còn 7 ngày", Sys.LicenseLabel(new LicenseState { Kind = LicenseKind.Trial, DaysLeft = 7 }));
            Assert.Equal("Hết hạn dùng thử", Sys.LicenseLabel(new LicenseState { Kind = LicenseKind.Expired }));
            Assert.Equal("Đã cấp phép", Sys.LicenseLabel(new LicenseState { Kind = LicenseKind.Licensed }));
        }

        [Fact]
        public void Moi_nut_ribbon_deu_mo_mot_the()
        {
            foreach (var id in RibbonCommands.All.Keys)
            {
                var targets = (LibraryWindow.RibbonSections.ContainsKey(id) ? 1 : 0)
                    + (QuoteUi.QuoteWindow.RibbonSections.ContainsKey(id) ? 1 : 0)
                    + (SystemWindow.RibbonSections.ContainsKey(id) ? 1 : 0);
                Assert.True(targets == 1, id);
            }
        }

        /// <summary>Excel không có Formula2 (Office 2016) cũng phải rơi về nhánh này: thuộc tính thiếu trên đối tượng COM thật ra RuntimeBinderException.</summary>
        [Fact]
        public void Thuoc_tinh_thieu_tren_doi_tuong_COM_ra_loi_ma_nhanh_Formula_bat()
        {
            dynamic dictionary = Activator.CreateInstance(Type.GetTypeFromProgID("Scripting.Dictionary")!)!;
            try
            {
                Assert.Throws<Microsoft.CSharp.RuntimeBinder.RuntimeBinderException>(() => { dictionary.Formula2 = "=1+1"; });
            }
            finally
            {
                Marshal.ReleaseComObject(dictionary);
            }
        }
    }
}
