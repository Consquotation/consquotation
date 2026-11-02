using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ConsQuotation.Ui
{
    /// <summary>
    /// Luồng giao diện riêng của add-in (STA, có vòng lặp thông điệp WinForms). Cửa sổ chạy ở đây không chặn
    /// Excel, phím Tab/Enter hoạt động như hộp thoại Windows thường. Mọi thao tác với Excel từ luồng này phải
    /// đi qua ExcelBridge (luồng chính của Excel).
    /// </summary>
    internal static class UiThread
    {
        private static readonly object Gate = new object();
        private static SynchronizationContext? context;

        /// <summary>Lỗi không bắt ở luồng giao diện; mặc định hiện hộp thông báo thay vì làm sập Excel.</summary>
        public static Action<Exception> OnError { get; set; } = ex =>
            MessageBox.Show($"Lỗi không mong muốn: {ex.Message}", AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);

        /// <summary>Chạy action trên luồng giao diện (không chờ).</summary>
        public static void Post(Action action)
        {
            EnsureStarted().Post(_ =>
            {
                try
                {
                    action();
                }
                catch (Exception ex)
                {
                    OnError(ex);
                }
            }, null);
        }

        private static SynchronizationContext EnsureStarted()
        {
            lock (Gate)
            {
                if (context != null)
                {
                    return context;
                }
                using (var ready = new ManualResetEventSlim())
                {
                    var thread = new Thread(() =>
                    {
                        // WinForms trên .NET Framework không theo DPI từng màn hình: để Windows phóng ảnh cửa sổ
                        // theo DPI hệ thống thay vì vẽ sai kích thước khi Excel chạy chế độ per-monitor.
                        TrySetSystemDpiAwareness();
                        Application.EnableVisualStyles();
                        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException, threadScope: true);
                        Application.ThreadException += (_, e) => OnError(e.Exception);
                        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
                        context = SynchronizationContext.Current;
                        ready.Set();
                        Application.Run();
                    })
                    {
                        Name = "ConsQuotation UI",
                        // Không giữ tiến trình Excel khi người dùng thoát Excel.
                        IsBackground = true,
                    };
                    thread.SetApartmentState(ApartmentState.STA);
                    thread.Start();
                    ready.Wait();
                }
                return context!;
            }
        }

        [DllImport("user32.dll")]
        private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

        private static void TrySetSystemDpiAwareness()
        {
            try
            {
                // DPI_AWARENESS_CONTEXT_SYSTEM_AWARE = -2 (Windows 10 1607 trở lên).
                SetThreadDpiAwarenessContext(new IntPtr(-2));
            }
            catch (EntryPointNotFoundException)
            {
                // Windows cũ hơn: giữ mặc định của tiến trình.
            }
        }
    }
}
