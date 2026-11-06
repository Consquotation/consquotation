using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Ui;

namespace ConsQuotation.LibraryUi
{
    /// <summary>Các phần của cửa sổ Thư viện (như LibrarySection của bản web).</summary>
    internal enum LibrarySection
    {
        WorkItems,
        Resources,
        Norms,
        Catalog,
        Check,
        Exchange,
    }

    /// <summary>
    /// Cửa sổ "Thư viện của tôi" (LibraryView của bản web): cửa sổ nổi, không chặn Excel, chạy trên luồng giao
    /// diện riêng. Trên cùng là tên thư viện, số liệu và lời nhắc sao lưu; bên dưới là các thẻ.
    /// </summary>
    internal sealed class LibraryForm : Form
    {
        private readonly LibrarySession session;
        private readonly Label libraryName;
        private readonly Label stats;
        private readonly Label lastChanged;
        private readonly Label storage;
        private readonly Label backupStatus;
        private readonly Button backupNow;
        private readonly Label loadError;
        private readonly Label emptyButUsed;
        private readonly Button retry;
        private readonly TabControl tabs;
        private readonly ToolStripStatusLabel notice;
        private readonly Dictionary<LibrarySection, TabPage> pages = new Dictionary<LibrarySection, TabPage>();
        private bool showReminder;

        public LibraryForm(LibrarySession session)
        {
            this.session = session;
            Text = $"{S.Title} – {AppInfo.Name}";
            Font = Ux.Font;
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(Ux.Px(1080), Ux.Px(720));
            MinimumSize = new Size(Ux.Px(760), Ux.Px(520));
            ShowInTaskbar = false;
            KeyPreview = true;

            var root = Ux.FillStack();
            root.Padding = new Padding(Ux.Px(8), Ux.Px(6), Ux.Px(8), 0);

            libraryName = Ux.Text("", Ux.Heading);
            libraryName.Anchor = AnchorStyles.Left;
            var rename = Ux.Button(S.Rename, (_, __) => Rename());
            root.Controls.Add(Ux.ButtonRow(libraryName, rename));
            stats = Ux.Text("");
            root.Controls.Add(stats);
            lastChanged = Ux.Text("", color: SystemColors.GrayText);
            root.Controls.Add(lastChanged);
            storage = Ux.Text("", color: SystemColors.GrayText);
            root.Controls.Add(storage);
            root.Controls.Add(Ux.ButtonRow(
                Ux.Button(S.AddWorkItem, (_, __) => { SelectSection(LibrarySection.WorkItems); Editors.WorkItem(this, session, null); }),
                Ux.Button(S.AddResource, (_, __) => { SelectSection(LibrarySection.Resources); Editors.Resource(this, session, null); }),
                Ux.Button(S.QuickExchange, (_, __) => SelectSection(LibrarySection.Exchange))));
            backupStatus = Ux.Notice("", Ux.WarningColor);
            backupNow = Ux.Button(XS.BackupNow, (_, __) => SelectSection(LibrarySection.Exchange));
            root.Controls.Add(Ux.ButtonRow(backupStatus, backupNow));
            loadError = Ux.Notice("", Ux.ErrorColor);
            retry = Ux.Button(S.Retry, (_, __) => session.Reload());
            root.Controls.Add(Ux.ButtonRow(loadError, retry));
            emptyButUsed = Ux.Notice("", Ux.WarningColor);
            emptyButUsed.Visible = false;
            root.Controls.Add(emptyButUsed);

            tabs = new TabControl { Dock = DockStyle.Fill, Margin = new Padding(0, Ux.Px(6), 0, 0) };
            AddPage(LibrarySection.WorkItems, S.TabWorkItems, new WorkItemsPage(session));
            AddPage(LibrarySection.Resources, S.TabResources, new ResourcesPage(session));
            AddPage(LibrarySection.Norms, S.TabNorms, new NormsPage(session));
            AddPage(LibrarySection.Catalog, S.TabCatalog, new CatalogPage(session));
            AddPage(LibrarySection.Check, S.TabCheck, new CheckPage(session));
            AddPage(LibrarySection.Exchange, S.TabExchange, new ExchangePage(session));
            Ux.AddFill(root, tabs);

            var status = new StatusStrip { SizingGrip = true };
            notice = new ToolStripStatusLabel { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
            status.Items.Add(notice);
            Controls.Add(root);
            Controls.Add(status);

            session.Changed += Render;
            session.Notice += ShowNotice;
            session.Reload();
        }

        public TabControl Tabs => tabs;
        public string NoticeText => notice.Text;
        public string BackupStatusText => showReminder ? backupStatus.Text : "";
        public string LoadErrorText => loadError.Text;

        public T Page<T>() where T : Control => pages.Values.Select(p => p.Controls[0]).OfType<T>().Single();

        private void AddPage(LibrarySection section, string title, Control page)
        {
            var tab = new TabPage(title) { UseVisualStyleBackColor = true };
            tab.Controls.Add(page);
            tabs.TabPages.Add(tab);
            pages[section] = tab;
        }

        public void SelectSection(LibrarySection section) => tabs.SelectedTab = pages[section];

        private void ShowNotice(string text) => notice.Text = text;

        private void Rename()
        {
            using (var dialog = new RenameDialog(session))
            {
                dialog.ShowDialog(this);
            }
        }

        /// <summary>Vẽ lại phần tổng quan sau mỗi lần đọc thư viện.</summary>
        private void Render()
        {
            var library = session.Library;
            libraryName.Text = session.LibraryName;
            stats.Text = S.Stats(library.WorkItems.Count, library.Resources.Count, library.ResourcePrices.Count, library.Norms.Count,
                library.Categories.Count, library.Suppliers.Count);
            lastChanged.Text = session.Backup.LastChangedAt != null ? S.LastChanged(Dates.FormatDateTime(session.Backup.LastChangedAt)) : S.NeverChanged;
            storage.Text = S.Storage(session.Service.Store.FilePath);

            // Nhắc sao lưu (ADR-0003): chưa sao lưu lần nào, hoặc thư viện đã đổi sau lần sao lưu gần nhất.
            var lastBackup = session.Backup.LastBackupAt;
            var changed = session.Backup.LastChangedAt;
            var stale = lastBackup != null && changed != null && string.CompareOrdinal(changed, lastBackup) > 0;
            showReminder = session.LoadError == null && !library.IsEmpty;
            if (lastBackup != null && !stale)
            {
                backupStatus.Text = XS.StatusOk(Dates.FormatDateTime(lastBackup));
                backupStatus.ForeColor = SystemColors.GrayText;
                backupStatus.BackColor = SystemColors.Control;
                backupNow.Visible = false;
            }
            else
            {
                backupStatus.Text = lastBackup == null ? XS.StatusNever : XS.StatusStale(Dates.FormatDateTime(lastBackup));
                backupStatus.ForeColor = Ux.WarningColor;
                backupStatus.BackColor = Ux.NoticeBack;
                backupNow.Visible = showReminder;
            }
            backupStatus.Visible = showReminder;

            CheckEmptyButUsed();
            loadError.Text = session.LoadError == null ? "" : $"{S.LoadFailed}: {session.LoadError}";
            loadError.Visible = retry.Visible = session.LoadError != null;
            tabs.Enabled = session.LoadError == null;
        }

        /// <summary>Thư viện trống mà workbook đang mở từng dùng thư viện: có thể đang ở máy khác, nhắc khôi phục trước khi nhập lại.</summary>
        private async void CheckEmptyButUsed()
        {
            Ux.Show(emptyButUsed, null);
            if (session.Quotes == null || session.LoadError != null || !session.Library.IsEmpty)
            {
                return;
            }
            try
            {
                if (await session.Quotes.WasLibraryUsedAsync() && session.Library.IsEmpty && !IsDisposed)
                {
                    Ux.Show(emptyButUsed, S.EmptyButUsed);
                }
            }
            catch (Exception ex) when (ex is Excel.WorkbookException || ex is System.Runtime.InteropServices.COMException)
            {
                // Không có workbook đang mở hoặc Excel đang bận: bỏ qua lời nhắc phụ này.
            }
        }

        protected override void OnActivated(EventArgs e)
        {
            base.OnActivated(e);
            // Thư viện có thể vừa được sửa ở cửa sổ Excel khác (cùng file trên máy).
            session.ReloadIfChangedOutside();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            session.Changed -= Render;
            session.Notice -= ShowNotice;
            base.OnFormClosed(e);
        }
    }

    /// <summary>Mở (hoặc đưa lên trước) cửa sổ Thư viện từ nút ribbon. Chỉ có một cửa sổ cho mỗi phiên Excel.</summary>
    internal static class LibraryWindow
    {
        private static LibraryForm? form;
        private static LibrarySession? shared;

        /// <summary>Phiên thư viện dùng chung cho cửa sổ Thư viện và cửa sổ Báo giá (cùng luồng giao diện).</summary>
        public static LibrarySession SharedSession() => shared ?? (shared = LibrarySession.CreateDefault());

        public static readonly IReadOnlyDictionary<string, LibrarySection> RibbonSections = new Dictionary<string, LibrarySection>
        {
            ["cqLibrary"] = LibrarySection.WorkItems,
            ["cqResources"] = LibrarySection.Resources,
            ["cqNorms"] = LibrarySection.Norms,
            ["cqCatalog"] = LibrarySection.Catalog,
            ["cqLibraryCheck"] = LibrarySection.Check,
            ["cqExchange"] = LibrarySection.Exchange,
        };

        /// <summary>Gọi từ luồng chính của Excel; excelWindow là cửa sổ Excel làm cửa sổ chủ (cửa sổ nổi luôn trên Excel).</summary>
        public static void Show(LibrarySection section, IntPtr excelWindow) => UiThread.Post(() =>
        {
            if (form == null || form.IsDisposed)
            {
                var session = SharedSession();
                session.InsertToQuote = item => QuoteUi.QuoteWindow.InsertFromLibrary(item, excelWindow);
                form = new LibraryForm(session);
                form.SelectSection(section);
                form.Show(new OwnerWindow(excelWindow));
            }
            else
            {
                form.SelectSection(section);
                if (form.WindowState == FormWindowState.Minimized)
                {
                    form.WindowState = FormWindowState.Normal;
                }
            }
            form.Activate();
        });

        /// <summary>Đóng cửa sổ khi add-in bị gỡ.</summary>
        public static void CloseAll()
        {
            if (form == null)
            {
                return;
            }
            UiThread.Post(() =>
            {
                if (form != null && !form.IsDisposed)
                {
                    form.Close();
                }
                form = null;
            });
        }

        private sealed class OwnerWindow : IWin32Window
        {
            public OwnerWindow(IntPtr handle) => Handle = handle;
            public IntPtr Handle { get; }
        }
    }
}
