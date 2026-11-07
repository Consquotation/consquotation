using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Excel;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ui;

namespace ConsQuotation.QuoteUi
{
    internal enum QuoteSection
    {
        Overview,
        Create,
        Info,
        Add,
        Items,
        Check,
        Summary,
        Rounding,
        Terms,
        Print,
    }

    /// <summary>
    /// Cửa sổ Báo giá: cửa sổ nổi, không chặn Excel, cùng luồng giao diện với cửa sổ Thư viện. Dữ liệu đọc lại khi
    /// mở thẻ, khi bấm nút và khi quay lại cửa sổ, không dò Excel theo chu kỳ.
    /// </summary>
    internal sealed class QuoteForm : Form
    {
        private readonly QuoteSession session;
        private readonly TabControl tabs;
        private readonly Dictionary<QuoteSection, QuotePanel> panels = new Dictionary<QuoteSection, QuotePanel>();
        private readonly Dictionary<QuoteSection, TabPage> pages = new Dictionary<QuoteSection, TabPage>();
        private bool ready;
        private bool refreshPending;

        public QuoteForm(QuoteSession session)
        {
            this.session = session;
            Text = $"{Q.WindowTitle} – {AppInfo.Name}";
            Font = Ux.Font;
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(Ux.Px(980), Ux.Px(720));
            MinimumSize = new Size(Ux.Px(760), Ux.Px(520));
            ShowInTaskbar = false;

            tabs = new TabControl { Dock = DockStyle.Fill };
            AddPage(QuoteSection.Overview, Q.TabOverview, new OverviewPanel(session, SelectSection));
            AddPage(QuoteSection.Create, Q.TabCreate, new CreatePanel(session));
            AddPage(QuoteSection.Info, Q.TabInfo, new InfoPanel(session));
            AddPage(QuoteSection.Add, Q.TabAdd, new AddItemPanel(session));
            AddPage(QuoteSection.Items, Q.TabItems, new ItemsPanel(session));
            AddPage(QuoteSection.Check, Q.TabCheck, new CheckPanel(session));
            AddPage(QuoteSection.Summary, Q.TabSummary, new SummaryPanel(session));
            AddPage(QuoteSection.Rounding, Q.TabRounding, new RoundingPanel(session));
            AddPage(QuoteSection.Terms, Q.TabTerms, new TermsPanel(session));
            AddPage(QuoteSection.Print, Q.TabPrint, new PrintPanel(session));
            Controls.Add(tabs);
            session.Idle += async () =>
            {
                if (refreshPending)
                {
                    await RefreshAsync();
                }
            };
            tabs.SelectedIndexChanged += async (_, __) =>
            {
                if (ready)
                {
                    await RefreshAsync();
                }
            };
        }

        public T Panel<T>() where T : QuotePanel => panels.Values.OfType<T>().Single();

        private QuotePanel CurrentPanel => panels.First(p => pages[p.Key] == tabs.SelectedTab).Value;

        public TabControl Tabs => tabs;

        private void AddPage(QuoteSection section, string title, QuotePanel panel)
        {
            var tab = new TabPage(title) { UseVisualStyleBackColor = true };
            tab.Controls.Add(panel);
            tabs.TabPages.Add(tab);
            pages[section] = tab;
            panels[section] = panel;
        }

        public void SelectSection(QuoteSection section)
        {
            tabs.SelectedTab = pages[section];
        }

        /// <summary>Đọc lại danh sách bảng và phần thẻ đang mở.</summary>
        public async Task RefreshAsync()
        {
            if (session.Busy)
            {
                // Người dùng đổi thẻ trong lúc thẻ khác đang chạy: đọc lại ngay khi việc đó xong.
                refreshPending = true;
                return;
            }
            refreshPending = false;
            var refresh = RefreshTablesAsync();
            session.Refreshing = refresh;
            await refresh;
            await CurrentPanel.ReloadAsync();
        }

        private async Task RefreshTablesAsync()
        {
            try
            {
                await session.RefreshTablesAsync(CurrentPanel.FollowSelection);
            }
            catch (Exception ex) when (!(ex is OutOfMemoryException))
            {
                // Không bật hộp lỗi khi cửa sổ vừa được kích hoạt: báo ngay trên thẻ đang mở.
                CurrentPanel.Say(Ux.ErrorColor, ExcelErrors.Describe(ex));
            }
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            ready = true;
            await RefreshAsync();
        }

        protected override async void OnActivated(EventArgs e)
        {
            base.OnActivated(e);
            if (ready)
            {
                await RefreshAsync();
            }
        }
    }

    /// <summary>Mở (hoặc đưa lên trước) cửa sổ Báo giá. Chỉ có một cửa sổ cho mỗi phiên Excel.</summary>
    internal static class QuoteWindow
    {
        private static QuoteForm? form;

        public static readonly IReadOnlyDictionary<string, QuoteSection> RibbonSections = new Dictionary<string, QuoteSection>
        {
            ["cqOpen"] = QuoteSection.Overview,
            ["cqCreateQuote"] = QuoteSection.Create,
            ["cqQuoteInfo"] = QuoteSection.Info,
            ["cqAddItem"] = QuoteSection.Add,
            ["cqItems"] = QuoteSection.Items,
            ["cqPricing"] = QuoteSection.Check,
            ["cqPrint"] = QuoteSection.Terms,
        };

        public static void Show(QuoteSection section, IntPtr excelWindow) => UiThread.Post(() => Ensure(excelWindow, section));

        private static QuoteForm Ensure(IntPtr excelWindow, QuoteSection section)
        {
            if (form == null || form.IsDisposed)
            {
                form = new QuoteForm(new QuoteSession(LibraryWindow.SharedSession()));
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
            return form;
        }

        /// <summary>Từ cửa sổ Thư viện (đã ở luồng giao diện): điền sẵn công tác vào thẻ Thêm công tác.</summary>
        public static void InsertFromLibrary(WorkItem item, IntPtr excelWindow)
        {
            var window = Ensure(excelWindow, QuoteSection.Add);
            window.Panel<AddItemPanel>().Prefill(LibraryPrefill.From(item, LibraryWindow.SharedSession()));
        }

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
