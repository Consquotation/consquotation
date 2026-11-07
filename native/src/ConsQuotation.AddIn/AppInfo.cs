using System.Reflection;

namespace ConsQuotation
{
    /// <summary>Tên, phiên bản và đường dẫn phát hành của add-in.</summary>
    public static class AppInfo
    {
        public const string Name = "ConsQuotation";
        public const string ReleasesUrl = Core.Updates.Releases.RepoPage;
        public const string IssuesUrl = "https://github.com/Consquotation/consquotation/issues";
        public const string GuideUrl = "https://github.com/Consquotation/consquotation/blob/master/docs/native/USER_GUIDE.md";

        /// <summary>Phiên bản đầy đủ (ví dụ 2.0.0-alpha.1), lấy từ thuộc tính build.</summary>
        public static string Version
        {
            get
            {
                var informational = typeof(AppInfo).Assembly
                    .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";
                // SDK .NET có thể nối "+<mã commit>" vào sau; chỉ giữ số phiên bản.
                var plus = informational.IndexOf('+');
                return plus >= 0 ? informational.Substring(0, plus) : informational;
            }
        }

        public static string VersionLine => $"Phiên bản {Version}{(Version.Contains("-") ? " (bản thử)" : "")}.";
    }
}
