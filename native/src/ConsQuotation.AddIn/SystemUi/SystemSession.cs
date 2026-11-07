using System;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Licensing;
using ConsQuotation.Core.Storage;
using ConsQuotation.Core.Updates;
using ConsQuotation.Excel;
using ConsQuotation.LibraryUi;

namespace ConsQuotation.SystemUi
{
    /// <summary>Phụ thuộc của cửa sổ Hệ thống: cấp phép, cập nhật, thư viện và các việc ra ngoài add-in (test thay được).</summary>
    internal sealed class SystemSession
    {
        public SystemSession(LicenseService license, UpdateService updates, LibrarySession library)
        {
            License = license;
            Updates = updates;
            Library = library;
        }

        public LicenseService License { get; }
        public UpdateService Updates { get; }
        public LibrarySession Library { get; }

        /// <summary>Mở đường dẫn bằng chương trình mặc định của Windows; lỗi ném ra.</summary>
        public Action<string> Open { get; set; } = target => Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
        public Action<string> Copy { get; set; } = Clipboard.SetText;
        public Func<Task<string>> ExcelVersion { get; set; } = () => ExcelBridge.Run<string>(app => $"{app.Version}.{app.Build}");
        public Func<DateTime> NowUtc { get; set; } = () => DateTime.UtcNow;

        /// <summary>Báo khi trạng thái cấp phép hoặc bản mới đổi, để ribbon cập nhật nhãn.</summary>
        public event Action? Changed;

        public void NotifyChanged() => Changed?.Invoke();
    }

    /// <summary>Dịch vụ dùng chung cả phiên Excel và kết nối mạng thật của add-in.</summary>
    internal static class SystemServices
    {
        /// <summary>Cùng danh sách cấp phép với bản web, nên mã đã cấp vẫn dùng được.</summary>
        public const string LicenseListUrl = "https://consquotation.github.io/consquotation/licenses.json";

        private static readonly TimeSpan AutoCheckDelay = TimeSpan.FromSeconds(10);
        private static readonly Lazy<HttpClient> Http = new Lazy<HttpClient>(CreateHttp);

        public static readonly LicenseService License = new LicenseService(
            new FileLicenseStorage(SettingsFile.PathOf(FileLicenseStorage.FileName)),
            () => Get(LicenseListUrl),
            () => DateTime.UtcNow);

        public static readonly UpdateService Updates = new UpdateService(
            SettingsFile.PathOf(UpdateService.FileName),
            AppInfo.Version,
            () => Get(Releases.ApiUrl),
            () => DateTime.UtcNow);

        private static HttpClient CreateHttp()
        {
            // Excel không khai báo phiên bản .NET đích nên miền ứng dụng có thể chưa bật TLS 1.2 mà GitHub bắt buộc.
            // Thiết lập này chỉ ảnh hưởng miền ứng dụng của ConsQuotation, các add-in khác không bị đổi.
            var protocols = ServicePointManager.SecurityProtocol;
            if (protocols != SecurityProtocolType.SystemDefault && (protocols & SecurityProtocolType.Tls12) == 0)
            {
                ServicePointManager.SecurityProtocol = protocols | SecurityProtocolType.Tls12;
            }
            // Máy ở công ty thường qua proxy cần đăng nhập Windows.
            var client = new HttpClient(new HttpClientHandler { DefaultProxyCredentials = CredentialCache.DefaultCredentials })
            {
                Timeout = TimeSpan.FromSeconds(20),
            };
            // GitHub từ chối yêu cầu không có User-Agent.
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue(AppInfo.Name, AppInfo.Version));
            client.DefaultRequestHeaders.CacheControl = new CacheControlHeaderValue { NoCache = true };
            return client;
        }

        private static async Task<string> Get(string url)
        {
            using (var response = await Http.Value.GetAsync(url).ConfigureAwait(false))
            {
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            }
        }

        /// <summary>Hỏi bản mới ngầm sau khi Excel mở xong, nếu đã đủ 24 giờ từ lần trước. Mọi lỗi đều im lặng.</summary>
        public static void CheckForUpdateInBackground(Action onDone)
        {
            Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(AutoCheckDelay).ConfigureAwait(false);
                    if (Updates.Due)
                    {
                        await Updates.CheckAsync().ConfigureAwait(false);
                        onDone();
                    }
                }
                catch (Exception ex) when (!(ex is OutOfMemoryException))
                {
                    Debug.WriteLine(ex);
                }
            });
        }
    }
}
