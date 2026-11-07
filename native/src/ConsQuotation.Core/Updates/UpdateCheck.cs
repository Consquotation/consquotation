using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using ConsQuotation.Core.Storage;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Updates
{
    /// <summary>Số phiên bản dạng X.Y.Z hoặc X.Y.Z-alpha.N, so sánh theo quy tắc SemVer (bản thử đứng trước bản chính thức).</summary>
    public sealed class AppVersion : IComparable<AppVersion>
    {
        private static readonly Regex Shape = new Regex(@"^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$");

        private readonly long[] numbers;
        private readonly string[] pre;

        private AppVersion(long[] numbers, string[] pre, string text)
        {
            this.numbers = numbers;
            this.pre = pre;
            Text = text;
        }

        /// <summary>Không có chữ "v" đầu (2.0.0-alpha.3).</summary>
        public string Text { get; }

        public bool IsPrerelease => pre.Length > 0;

        public static AppVersion? Parse(string? text)
        {
            var match = Shape.Match(text ?? "");
            if (!match.Success
                || !long.TryParse(match.Groups[1].Value, out var major)
                || !long.TryParse(match.Groups[2].Value, out var minor)
                || !long.TryParse(match.Groups[3].Value, out var patch))
            {
                return null;
            }
            var pre = match.Groups[4].Success ? match.Groups[4].Value.Split('.') : new string[0];
            return new AppVersion(new[] { major, minor, patch }, pre, text!.TrimStart('v'));
        }

        public int CompareTo(AppVersion? other)
        {
            if (other == null)
            {
                return 1;
            }
            for (var i = 0; i < numbers.Length; i++)
            {
                var c = numbers[i].CompareTo(other.numbers[i]);
                if (c != 0)
                {
                    return c;
                }
            }
            if (pre.Length == 0 || other.pre.Length == 0)
            {
                return other.pre.Length.CompareTo(pre.Length) == 0 ? 0 : pre.Length == 0 ? 1 : -1;
            }
            for (var i = 0; i < Math.Min(pre.Length, other.pre.Length); i++)
            {
                var c = ComparePart(pre[i], other.pre[i]);
                if (c != 0)
                {
                    return c;
                }
            }
            return pre.Length.CompareTo(other.pre.Length);
        }

        private static int ComparePart(string a, string b)
        {
            var aNumber = long.TryParse(a, NumberStyles.None, CultureInfo.InvariantCulture, out var x);
            var bNumber = long.TryParse(b, NumberStyles.None, CultureInfo.InvariantCulture, out var y);
            if (aNumber && bNumber)
            {
                return x.CompareTo(y);
            }
            return aNumber ? -1 : bNumber ? 1 : string.CompareOrdinal(a, b);
        }
    }

    /// <summary>Một bản mới có thể tải.</summary>
    public sealed class AvailableUpdate
    {
        public AvailableUpdate(string version, string pageUrl)
        {
            Version = version;
            PageUrl = pageUrl;
        }

        public string Version { get; }
        public string PageUrl { get; }
    }

    public enum UpdateOutcome
    {
        UpToDate,
        Available,
        Failed,
    }

    public sealed class UpdateResult
    {
        public UpdateOutcome Outcome { get; set; }
        public AvailableUpdate? Update { get; set; }
    }

    /// <summary>Đọc danh sách phát hành của GitHub và chọn bản nên báo cho người dùng.</summary>
    public static class Releases
    {
        public const string RepoPage = "https://github.com/Consquotation/consquotation/releases";
        public const string ApiUrl = "https://api.github.com/repos/Consquotation/consquotation/releases?per_page=30";

        private static readonly Regex InstallerName = new Regex(@"^ConsQuotation-Setup-.+\.exe$");

        /// <summary>
        /// Bản mới nhất cao hơn bản đang chạy. Bỏ bản nháp, bản chưa kèm bộ cài (đang đăng dở) và đường dẫn không
        /// thuộc trang phát hành của sản phẩm. Người dùng bản chính thức không được báo bản thử.
        /// </summary>
        public static AvailableUpdate? Newest(string json, string currentVersion)
        {
            var current = AppVersion.Parse(currentVersion);
            if (current == null || !(JToken.Parse(json) is JArray releases))
            {
                throw new FormatException("Danh sách phát hành không đúng dạng.");
            }
            AppVersion? best = null;
            string? page = null;
            foreach (var release in releases.OfType<JObject>())
            {
                var version = AppVersion.Parse(Text(release, "tag_name"));
                var url = Text(release, "html_url");
                if (version == null
                    || version.CompareTo(current) <= 0
                    || Flag(release, "draft")
                    || (version.IsPrerelease && !current.IsPrerelease)
                    || !url.StartsWith(RepoPage + "/", StringComparison.Ordinal)
                    || !HasInstaller(release))
                {
                    continue;
                }
                if (best == null || version.CompareTo(best) > 0)
                {
                    best = version;
                    page = url;
                }
            }
            return best == null ? null : new AvailableUpdate(best.Text, page!);
        }

        private static string Text(JObject o, string key) => (o[key] as JValue)?.Value as string ?? "";

        private static bool Flag(JObject o, string key) => (o[key] as JValue)?.Value is bool b && b;

        private static bool HasInstaller(JObject release) =>
            release["assets"] is JArray assets && assets.OfType<JObject>().Any(a => InstallerName.IsMatch(Text(a, "name")));
    }

    /// <summary>
    /// Kiểm tra bản mới trên GitHub Releases (docs/NATIVE_PLAN.md): tự động tối đa 1 lần mỗi ngày, người dùng tự
    /// tải và cài đè. Kết quả lần gần nhất lưu ở file để không phải hỏi mạng mỗi lần mở Excel.
    /// </summary>
    public sealed class UpdateService
    {
        public const string FileName = "update-check.json";
        public static readonly TimeSpan Interval = TimeSpan.FromHours(24);

        private readonly string path;
        private readonly string currentVersion;
        private readonly Func<Task<string>> fetchReleases;
        private readonly Func<DateTime> nowUtc;

        public UpdateService(string path, string currentVersion, Func<Task<string>> fetchReleases, Func<DateTime> nowUtc)
        {
            this.path = path;
            this.currentVersion = currentVersion;
            this.fetchReleases = fetchReleases;
            this.nowUtc = nowUtc;
        }

        private JObject? Stored()
        {
            try
            {
                return SettingsFile.Read(path);
            }
            catch (Exception ex) when (ex is System.IO.IOException || ex is UnauthorizedAccessException)
            {
                return null;
            }
        }

        /// <summary>Lần hỏi GitHub gần nhất (kể cả lần lỗi), giờ UTC; null nếu chưa từng.</summary>
        public DateTime? LastCheck
        {
            get
            {
                var text = (Stored()?["lastCheck"] as JValue)?.Value as string;
                return DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var at) ? at : (DateTime?)null;
            }
        }

        /// <summary>Bản mới đã biết từ lần hỏi trước; đã cài bản đó rồi thì null. Chỉ đọc file, không gọi mạng.</summary>
        public AvailableUpdate? Known
        {
            get
            {
                var stored = Stored();
                var version = AppVersion.Parse((stored?["latest"] as JValue)?.Value as string);
                var url = (stored?["url"] as JValue)?.Value as string ?? "";
                var current = AppVersion.Parse(currentVersion);
                if (version == null || current == null || version.CompareTo(current) <= 0 || !url.StartsWith(Releases.RepoPage + "/", StringComparison.Ordinal))
                {
                    return null;
                }
                return new AvailableUpdate(version.Text, url);
            }
        }

        /// <summary>Đến hạn hỏi lại (đồng hồ máy bị chỉnh lùi cũng coi là đến hạn).</summary>
        public bool Due
        {
            get
            {
                var last = LastCheck;
                var now = nowUtc();
                return last == null || now < last.Value || now - last.Value >= Interval;
            }
        }

        /// <summary>Hỏi GitHub. Không ném lỗi mạng: trả về Failed và giữ nguyên bản mới đã biết.</summary>
        public async Task<UpdateResult> CheckAsync()
        {
            AvailableUpdate? update;
            try
            {
                update = Releases.Newest(await fetchReleases().ConfigureAwait(false), currentVersion);
            }
            catch (Exception ex) when (!(ex is OutOfMemoryException))
            {
                var known = Known;
                Save(known?.Version, known?.PageUrl);
                return new UpdateResult { Outcome = UpdateOutcome.Failed, Update = known };
            }
            Save(update?.Version, update?.PageUrl);
            return new UpdateResult { Outcome = update == null ? UpdateOutcome.UpToDate : UpdateOutcome.Available, Update = update };
        }

        private void Save(string? latest, string? url)
        {
            try
            {
                SettingsFile.Write(path, new JObject
                {
                    ["lastCheck"] = nowUtc().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
                    ["latest"] = latest,
                    ["url"] = url,
                });
            }
            catch (Exception ex) when (ex is System.IO.IOException || ex is UnauthorizedAccessException || ex is JsonException)
            {
                // Không ghi được: lần mở Excel sau hỏi lại, không ảnh hưởng gì khác.
            }
        }
    }
}
