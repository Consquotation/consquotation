using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ui;

namespace ConsQuotation.SystemUi
{
    internal enum SystemSection
    {
        License,
        Settings,
        Help,
    }

    /// <summary>Cửa sổ Hệ thống: cửa sổ nổi, không chặn Excel, cùng luồng giao diện với Thư viện và Báo giá.</summary>
    internal sealed class SystemForm : Form
    {
        private readonly TabControl tabs;
        private readonly Dictionary<SystemSection, TabPage> pages = new Dictionary<SystemSection, TabPage>();
        private readonly Dictionary<TabPage, SystemPanel> panels = new Dictionary<TabPage, SystemPanel>();

        public SystemForm(SystemSession session)
        {
            Text = $"{Sys.WindowTitle} – {AppInfo.Name}";
            Font = Ux.Font;
            StartPosition = FormStartPosition.CenterScreen;
            // Đủ cao để thẻ Bản quyền khi hết hạn (có thêm phần sao lưu) không phải cuộn, trừ màn hình thấp.
            Size = new Size(Ux.Px(700), Math.Min(Ux.Px(780), Screen.PrimaryScreen.WorkingArea.Height));
            MinimumSize = new Size(Ux.Px(700), Ux.Px(420));
            ShowInTaskbar = false;

            tabs = new TabControl { Dock = DockStyle.Fill };
            AddPage(SystemSection.License, Sys.TabLicense, new LicensePanel(session));
            AddPage(SystemSection.Settings, Sys.TabSettings, new SettingsPanel(session));
            AddPage(SystemSection.Help, Sys.TabHelp, new HelpPanel(session));
            Controls.Add(tabs);
            tabs.SelectedIndexChanged += (_, __) => Reload();
        }

        public T Panel<T>() where T : SystemPanel => panels.Values.OfType<T>().Single();

        private void AddPage(SystemSection section, string title, SystemPanel panel)
        {
            var tab = new TabPage(title) { UseVisualStyleBackColor = true };
            tab.Controls.Add(panel);
            tabs.TabPages.Add(tab);
            pages[section] = tab;
            panels[tab] = panel;
        }

        public void SelectSection(SystemSection section)
        {
            if (tabs.SelectedTab == pages[section])
            {
                Reload();
            }
            else
            {
                tabs.SelectedTab = pages[section];
            }
        }

        private void Reload() => panels[tabs.SelectedTab].Reload();

        /// <summary>Chọn thẻ trước khi cửa sổ hiện không phát sinh sự kiện đổi thẻ: đọc dữ liệu cho thẻ đầu tiên ở đây.</summary>
        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Reload();
        }
    }

    /// <summary>Mở (hoặc đưa lên trước) cửa sổ Hệ thống. Chỉ có một cửa sổ cho mỗi phiên Excel.</summary>
    internal static class SystemWindow
    {
        private static SystemForm? form;
        private static SystemSession? session;

        public static readonly IReadOnlyDictionary<string, SystemSection> RibbonSections = new Dictionary<string, SystemSection>
        {
            ["cqSettings"] = SystemSection.Settings,
            ["cqLicense"] = SystemSection.License,
            ["cqHelp"] = SystemSection.Help,
        };

        public static void Show(SystemSection section, IntPtr excelWindow, Action onChanged) => UiThread.Post(() =>
        {
            if (form == null || form.IsDisposed)
            {
                session = new SystemSession(SystemServices.License, SystemServices.Updates, LibraryWindow.SharedSession());
                session.Changed += onChanged;
                form = new SystemForm(session);
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
