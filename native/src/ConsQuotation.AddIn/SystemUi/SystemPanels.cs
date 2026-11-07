using System;
using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Licensing;
using ConsQuotation.Core.Storage;
using ConsQuotation.Core.Updates;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ui;
using Newtonsoft.Json.Linq;
using License = ConsQuotation.Core.Licensing.License;

namespace ConsQuotation.SystemUi
{
    /// <summary>Thẻ của cửa sổ Hệ thống: một cột nội dung rộng cố định, cuộn khi cao hơn cửa sổ.</summary>
    internal abstract class SystemPanel : Panel
    {
        protected const int ContentWidth = 620;

        protected SystemPanel(SystemSession session)
        {
            Session = session;
            Dock = DockStyle.Fill;
            AutoScroll = true;
            Padding = new Padding(Ux.Px(10));
            Content = Ux.Stack(Ux.Px(ContentWidth));
            Controls.Add(Content);
        }

        protected SystemSession Session { get; }
        protected TableLayoutPanel Content { get; }

        /// <summary>Việc bất đồng bộ gần nhất; test chờ qua đây.</summary>
        public Task LastWork { get; protected set; } = Task.CompletedTask;

        /// <summary>Đọc lại dữ liệu khi thẻ được mở.</summary>
        public abstract void Reload();

        protected static GroupBox Group(string title, out TableLayoutPanel stack)
        {
            stack = Ux.Stack(Ux.Px(ContentWidth - 24));
            var group = new GroupBox
            {
                Text = title,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                Padding = new Padding(Ux.Px(6)),
                Margin = new Padding(0, Ux.Px(4), 0, Ux.Px(6)),
            };
            group.Controls.Add(stack);
            stack.Location = new Point(Ux.Px(6), Ux.Px(18));
            return group;
        }

        protected static void ShowNotice(Label notice, Color back, Color fore, string? text)
        {
            notice.BackColor = back;
            notice.ForeColor = fore;
            Ux.Show(notice, text);
        }
    }

    /// <summary>Thẻ Bản quyền (LicensePanel của bản web); khi hết hạn dùng thử, đây là thẻ duy nhất còn việc để làm.</summary>
    internal sealed class LicensePanel : SystemPanel
    {
        private readonly Label status;
        private readonly Label codeLine;
        private readonly Label message;
        private readonly GroupBox request;
        private readonly GroupBox activate;
        private readonly GroupBox backup;
        private readonly TextBox mailBox;
        private bool busy;

        public LicensePanel(SystemSession session) : base(session)
        {
            status = Ux.Notice("", SystemColors.ControlText);
            codeLine = Ux.Text("");
            message = Ux.Notice("", SystemColors.ControlText);
            message.Visible = false;
            Content.Controls.Add(status);
            Content.Controls.Add(codeLine);
            Content.Controls.Add(message);

            request = Group(Sys.RequestTitle, out var requestStack);
            requestStack.Controls.Add(Ux.Text(Sys.RequestIntro(License.OwnerEmail)));
            GmailButton = Ux.Button(Sys.ComposeGmail, (_, __) => Compose(License.GmailComposeUrl));
            OutlookButton = Ux.Button(Sys.ComposeOutlook, (_, __) => Compose(License.OutlookComposeUrl));
            MailAppButton = Ux.Button(Sys.ComposeApp, (_, __) => Compose(License.MailtoUrl));
            CopyButton = Ux.Button(Sys.Copy, (_, __) => CopyMail());
            requestStack.Controls.Add(Ux.ButtonRow(GmailButton, OutlookButton, MailAppButton, CopyButton));
            mailBox = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Height = Ux.Px(112),
                Anchor = AnchorStyles.Left | AnchorStyles.Right,
                AccessibleName = Sys.RequestText,
            };
            requestStack.Controls.Add(Ux.Text(Sys.RequestText));
            requestStack.Controls.Add(mailBox);
            Content.Controls.Add(request);

            activate = Group(Sys.ActivateTitle, out var activateStack);
            activateStack.Controls.Add(Ux.Text(Sys.ActivateIntro));
            EmailField = new TextField(Sys.Email, required: true);
            CodeField = new TextField(Sys.Code, required: true);
            activateStack.Controls.Add(EmailField);
            activateStack.Controls.Add(CodeField);
            ActivateButton = Ux.Button(Sys.Activate, (_, __) => LastWork = ActivateAsync());
            activateStack.Controls.Add(Ux.ButtonRow(ActivateButton));
            Content.Controls.Add(activate);

            backup = Group(Sys.BackupTitle, out var backupStack);
            backupStack.Controls.Add(Ux.Text(Sys.BackupIntro));
            BackupButton = Ux.Button(Sys.BackupButton, (_, __) => SaveBackup());
            backupStack.Controls.Add(Ux.ButtonRow(BackupButton));
            Content.Controls.Add(backup);
        }

        public Button GmailButton { get; }
        public Button OutlookButton { get; }
        public Button MailAppButton { get; }
        public Button CopyButton { get; }
        public Button ActivateButton { get; }
        public Button BackupButton { get; }
        public TextField EmailField { get; }
        public TextField CodeField { get; }
        public string StatusText => status.Text;
        public string CodeText => codeLine.Text;
        public string MessageText => message.Text;
        public string MailText => mailBox.Text;

        // Visible của WinForms còn phụ thuộc cửa sổ cha đã hiện chưa, nên test đọc trạng thái qua các cờ này.
        public bool ShowsRequest { get; private set; }
        public bool ShowsBackup { get; private set; }

        public override void Reload()
        {
            if (!busy)
            {
                Apply(Session.License.State());
            }
        }

        private void Apply(LicenseState state)
        {
            switch (state.Kind)
            {
                case LicenseKind.Licensed:
                    ShowNotice(status, Ux.SuccessBack, Ux.SuccessColor, Sys.Licensed(state.Activation!.Email));
                    break;
                case LicenseKind.Trial:
                    ShowNotice(status, Ux.NoticeBack, SystemColors.ControlText, Sys.Trial(state.DaysLeft, License.FormatLocalDate(state.EndsAt)));
                    break;
                default:
                    ShowNotice(status, Ux.ErrorBack, Ux.ErrorColor, Sys.Expired(License.FormatLocalDate(state.EndsAt)));
                    break;
            }
            Ux.Show(codeLine, state.Kind == LicenseKind.Licensed ? Sys.LicensedCode(state.Activation!.Code) : null);
            ShowsRequest = state.Kind != LicenseKind.Licensed;
            ShowsBackup = state.Kind == LicenseKind.Expired;
            request.Visible = ShowsRequest;
            activate.Visible = ShowsRequest;
            backup.Visible = ShowsBackup;
            if (ShowsRequest)
            {
                mailBox.Text = Sys.MailText(License.Request(AppInfo.Version, state.StartedAt));
            }
        }

        private void Say(Color back, Color fore, string text) => ShowNotice(message, back, fore, text);

        private LicenseMail Mail() => License.Request(AppInfo.Version, Session.License.State().StartedAt);

        private void Compose(Func<LicenseMail, string> url)
        {
            try
            {
                Session.Open(url(Mail()));
                Say(Ux.NoticeBack, SystemColors.ControlText, Sys.RequestOpened);
            }
            catch (Exception ex) when (ex is Win32Exception || ex is InvalidOperationException || ex is FileNotFoundException)
            {
                Say(Ux.ErrorBack, Ux.ErrorColor, Sys.OpenFailed);
            }
        }

        private void CopyMail()
        {
            try
            {
                Session.Copy(mailBox.Text);
                Say(Ux.SuccessBack, Ux.SuccessColor, Sys.Copied);
            }
            catch (ExternalException)
            {
                // Chương trình khác đang giữ clipboard.
                Say(Ux.NoticeBack, Ux.WarningColor, Sys.CopyFailed);
            }
        }

        public async Task ActivateAsync()
        {
            if (busy)
            {
                return;
            }
            busy = true;
            ActivateButton.Enabled = false;
            ActivateButton.Text = Sys.Activating;
            Ux.Show(message, null);
            try
            {
                var result = await Session.License.ActivateAsync(EmailField.Value, CodeField.Value);
                if (result.Ok)
                {
                    Apply(result.State!);
                    EmailField.Value = "";
                    CodeField.Value = "";
                    Say(Ux.SuccessBack, Ux.SuccessColor, Sys.Activated);
                    Session.NotifyChanged();
                }
                else
                {
                    Say(Ux.ErrorBack, Ux.ErrorColor, Sys.ActivateError(result.Failure!.Value));
                }
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                Say(Ux.ErrorBack, Ux.ErrorColor, Sys.ActivateSaveFailed);
            }
            finally
            {
                busy = false;
                ActivateButton.Enabled = true;
                ActivateButton.Text = Sys.Activate;
            }
        }

        private void SaveBackup()
        {
            var saved = ExchangePage.WriteJsonBackup(Session.Library, this);
            if (saved.Error != null)
            {
                Say(Ux.ErrorBack, Ux.ErrorColor, saved.Error);
            }
            else if (saved.Done != null)
            {
                Say(Ux.SuccessBack, Ux.SuccessColor, saved.Done);
            }
        }
    }

    /// <summary>Thẻ Cài đặt: phiên bản, nơi lưu thư viện, kiểm tra cập nhật.</summary>
    internal sealed class SettingsPanel : SystemPanel
    {
        private readonly Label version;
        private readonly Label libraryFile;
        private readonly Label libraryCounts;
        private readonly Label lastCheck;
        private readonly Label updateStatus;
        private AvailableUpdate? update;
        private string excel = Sys.ExcelUnknown;
        private bool excelRead;
        private bool checking;

        public SettingsPanel(SystemSession session) : base(session)
        {
            var versionBox = Group(Sys.VersionTitle, out var versionStack);
            version = Ux.Text("");
            versionStack.Controls.Add(version);
            Content.Controls.Add(versionBox);

            var libraryBox = Group(Sys.LibraryTitle, out var libraryStack);
            libraryFile = Ux.Text("");
            libraryCounts = Ux.Text("");
            libraryStack.Controls.Add(libraryFile);
            libraryStack.Controls.Add(libraryCounts);
            libraryStack.Controls.Add(Ux.Text(Sys.LibraryNote, color: SystemColors.GrayText));
            OpenFolderButton = Ux.Button(Sys.OpenFolder, (_, __) => OpenFolder());
            libraryStack.Controls.Add(Ux.ButtonRow(OpenFolderButton));
            Content.Controls.Add(libraryBox);

            var updateBox = Group(Sys.UpdateTitle, out var updateStack);
            updateStack.Controls.Add(Ux.Text(Sys.UpdateIntro));
            lastCheck = Ux.Text("");
            updateStack.Controls.Add(lastCheck);
            updateStatus = Ux.Notice("", SystemColors.ControlText);
            updateStatus.Visible = false;
            updateStack.Controls.Add(updateStatus);
            CheckButton = Ux.Button(Sys.CheckUpdate, (_, __) => LastWork = CheckAsync());
            DownloadButton = Ux.Button(Sys.OpenDownload, (_, __) => OpenDownload());
            DownloadButton.Visible = false;
            updateStack.Controls.Add(Ux.ButtonRow(CheckButton, DownloadButton));
            Content.Controls.Add(updateBox);
        }

        public Button CheckButton { get; }
        public Button DownloadButton { get; }
        public Button OpenFolderButton { get; }
        public string VersionText => version.Text;
        public string LibraryFileText => libraryFile.Text;
        public string LibraryCountsText => libraryCounts.Text;
        public string LastCheckText => lastCheck.Text;
        public string UpdateStatusText => updateStatus.Text;
        public bool OffersDownload => update != null;

        public override void Reload()
        {
            ShowVersion();
            ShowLibrary();
            if (!checking)
            {
                ShowLastCheck();
                ShowUpdate(Session.Updates.Known);
                if (!excelRead)
                {
                    LastWork = ReadExcelAsync();
                }
            }
        }

        private void ShowVersion()
        {
            var components = $"ConsQuotation.Core {typeof(LibraryStore).Assembly.GetName().Version}, Newtonsoft.Json {typeof(JToken).Assembly.GetName().Version}";
            version.Text = Sys.VersionLines(AppInfo.Version, excel, Environment.Is64BitProcess, components);
        }

        private async Task ReadExcelAsync()
        {
            excelRead = true;
            try
            {
                excel = await Session.ExcelVersion();
            }
            catch (Exception ex) when (ex is COMException || ex is Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
                excel = Sys.ExcelUnknown;
            }
            ShowVersion();
        }

        private void ShowLibrary()
        {
            libraryFile.Text = Sys.LibraryFile(LibraryStore.DefaultPath);
            try
            {
                var library = Session.Library.Service.Load();
                libraryCounts.Text = Sys.LibraryCounts(library.WorkItems.Count, library.Resources.Count, library.Norms.Count);
            }
            catch (LibraryStorageException ex)
            {
                libraryCounts.Text = ex.Message;
            }
        }

        private void OpenFolder()
        {
            var folder = Path.GetDirectoryName(Path.GetFullPath(LibraryStore.DefaultPath))!;
            try
            {
                Directory.CreateDirectory(folder);
                Session.Open(folder);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is Win32Exception)
            {
                ShowNotice(updateStatus, Ux.ErrorBack, Ux.ErrorColor, ex.Message);
            }
        }

        private void ShowLastCheck()
        {
            var last = Session.Updates.LastCheck;
            lastCheck.Text = last == null
                ? Sys.NeverChecked
                : Sys.LastChecked(last.Value.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture));
        }

        private void ShowUpdate(AvailableUpdate? available)
        {
            update = available;
            DownloadButton.Visible = available != null;
            if (available != null)
            {
                ShowNotice(updateStatus, Ux.NoticeBack, Ux.WarningColor, Sys.UpdateAvailable(available.Version));
            }
            else
            {
                Ux.Show(updateStatus, null);
            }
        }

        public async Task CheckAsync()
        {
            if (checking)
            {
                return;
            }
            checking = true;
            CheckButton.Enabled = false;
            CheckButton.Text = Sys.Checking;
            try
            {
                var result = await Session.Updates.CheckAsync();
                ShowLastCheck();
                ShowUpdate(result.Update);
                if (result.Outcome == UpdateOutcome.UpToDate)
                {
                    ShowNotice(updateStatus, Ux.SuccessBack, Ux.SuccessColor, Sys.UpToDate);
                }
                else if (result.Outcome == UpdateOutcome.Failed && result.Update == null)
                {
                    ShowNotice(updateStatus, Ux.ErrorBack, Ux.ErrorColor, Sys.CheckFailed);
                }
                Session.NotifyChanged();
            }
            finally
            {
                checking = false;
                CheckButton.Enabled = true;
                CheckButton.Text = Sys.CheckUpdate;
            }
        }

        private void OpenDownload()
        {
            if (update == null)
            {
                return;
            }
            try
            {
                Session.Open(update.PageUrl);
            }
            catch (Exception ex) when (ex is Win32Exception || ex is InvalidOperationException || ex is FileNotFoundException)
            {
                ShowNotice(updateStatus, Ux.ErrorBack, Ux.ErrorColor, Sys.OpenBrowserFailed + update.PageUrl);
            }
        }
    }

    /// <summary>Thẻ Trợ giúp: cách dùng ngắn gọn ngay trong add-in, hướng dẫn đầy đủ trên GitHub.</summary>
    internal sealed class HelpPanel : SystemPanel
    {
        private readonly Label message;

        public HelpPanel(SystemSession session) : base(session)
        {
            Content.Controls.Add(Ux.Text(Sys.HelpIntro));
            Content.Controls.Add(Ux.Text(AppInfo.VersionLine));
            message = Ux.Notice("", Ux.ErrorColor);
            message.Visible = false;
            Content.Controls.Add(message);
            Content.Controls.Add(Ux.ButtonRow(
                Link(Sys.HelpGuide, AppInfo.GuideUrl),
                Link(Sys.HelpReleases, AppInfo.ReleasesUrl),
                Link(Sys.HelpIssues, AppInfo.IssuesUrl)));
            foreach (var (title, lines) in Sys.HelpSections)
            {
                var heading = Ux.Text(title, Ux.Heading);
                heading.Margin = new Padding(Ux.Px(3), Ux.Px(10), Ux.Px(3), Ux.Px(2));
                Content.Controls.Add(heading);
                foreach (var line in lines)
                {
                    Content.Controls.Add(Ux.Text(line));
                }
            }
        }

        private Button Link(string text, string url) => Ux.Button(text, (_, __) =>
        {
            try
            {
                Session.Open(url);
            }
            catch (Exception ex) when (ex is Win32Exception || ex is InvalidOperationException || ex is FileNotFoundException)
            {
                ShowNotice(message, Ux.ErrorBack, Ux.ErrorColor, Sys.OpenBrowserFailed + url);
            }
        });

        public override void Reload()
        {
        }
    }
}
