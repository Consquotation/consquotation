using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Licensing
{
    public sealed class Activation
    {
        public string Email { get; set; } = "";
        public string Code { get; set; } = "";
        public string ActivatedAt { get; set; } = "";
    }

    public enum LicenseKind
    {
        Licensed,
        Trial,
        Expired,
    }

    public sealed class LicenseState
    {
        public LicenseKind Kind { get; set; }
        /// <summary>Licensed: email, mã và thời điểm kích hoạt.</summary>
        public Activation? Activation { get; set; }
        /// <summary>Trial/Expired: thời điểm bắt đầu dùng thử (ISO).</summary>
        public string StartedAt { get; set; } = "";
        /// <summary>Trial: hết hạn lúc; Expired: đã hết hạn lúc (ISO).</summary>
        public string EndsAt { get; set; } = "";
        public int DaysLeft { get; set; }
    }

    public sealed class LicenseMail
    {
        public LicenseMail(string to, string subject, string body)
        {
            To = to;
            Subject = subject;
            Body = body;
        }

        public string To { get; }
        public string Subject { get; }
        public string Body { get; }
    }

    /// <summary>
    /// Cấp phép sử dụng (ADR-0015, email + mã, không máy chủ), chuyển từ src/domain/license/license.ts.
    /// Dùng thử 30 ngày tính từ lần đầu mở trên máy; danh sách cấp phép công khai chỉ chứa SHA-256 của
    /// "cq-license-v1|email|mã" nên mã đã cấp cho bản web vẫn dùng được ở bản Windows.
    /// </summary>
    public static class License
    {
        public const string OwnerEmail = "nguyenchikhoa97@gmail.com";
        public const int TrialDays = 30;
        public const int CodeLength = 20;
        /// <summary>Chữ hoa và chữ số, bỏ ký tự dễ nhầm: 0/O, 1/I/L.</summary>
        public const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        public const string Salt = "cq-license-v1";
        public const string ListFormat = "consquotation-licenses";

        private static readonly Regex EmailShape = new Regex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$");
        private static readonly Regex Hex64 = new Regex("^[0-9a-f]{64}$");

        public static string NormalizeEmail(string text) => text.Trim().ToLowerInvariant();

        public static bool IsValidEmail(string email) => EmailShape.IsMatch(email);

        /// <summary>Người dùng có thể dán mã kèm khoảng trắng, gạch nối hay chữ thường.</summary>
        public static string NormalizeCode(string text) => Regex.Replace(text.ToUpperInvariant(), @"[\s-]", "");

        public static bool IsWellFormedCode(string code) =>
            code.Length == CodeLength &&
            code.All(c => CodeAlphabet.IndexOf(c) >= 0) &&
            code.Any(c => c >= 'A' && c <= 'Z') &&
            code.Any(c => c >= '0' && c <= '9');

        /// <summary>
        /// Mã ngẫu nhiên 20 ký tự có cả chữ và số. Lấy mẫu loại bỏ (byte ≥ 248 bị bỏ) để mỗi ký tự trong bảng
        /// 31 ký tự có xác suất như nhau.
        /// </summary>
        public static string GenerateCode(Func<int, byte[]> randomBytes)
        {
            var limit = 256 - (256 % CodeAlphabet.Length);
            while (true)
            {
                var code = new StringBuilder();
                while (code.Length < CodeLength)
                {
                    foreach (var b in randomBytes(32))
                    {
                        if (b < limit && code.Length < CodeLength)
                        {
                            code.Append(CodeAlphabet[b % CodeAlphabet.Length]);
                        }
                    }
                }
                var text = code.ToString();
                if (IsWellFormedCode(text))
                {
                    return text;
                }
            }
        }

        /// <summary>Khóa ghi trong licenses.json cho một cặp email + mã (đã chuẩn hóa): SHA-256 hex chữ thường.</summary>
        public static string Key(string email, string code)
        {
            using (var sha = SHA256.Create())
            {
                var digest = sha.ComputeHash(Encoding.UTF8.GetBytes($"{Salt}|{email}|{code}"));
                return string.Concat(digest.Select(b => b.ToString("x2", CultureInfo.InvariantCulture)));
            }
        }

        /// <summary>Đọc nội dung licenses.json; sai định dạng → null (không coi là "chưa được cấp phép").</summary>
        public static HashSet<string>? ParseList(string json)
        {
            JToken root;
            try
            {
                root = JToken.Parse(json);
            }
            catch (Newtonsoft.Json.JsonException)
            {
                return null;
            }
            if (!(root is JObject obj) || (string?)(obj["format"] as JValue) != ListFormat || !(obj["keys"] is JArray keys))
            {
                return null;
            }
            return new HashSet<string>(keys.OfType<JValue>()
                .Where(k => k.Type == JTokenType.String && Hex64.IsMatch((string)k!))
                .Select(k => (string)k!));
        }

        private static string Iso(DateTime utc) => utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        /// <summary>Trạng thái theo dữ liệu đã lưu. Cấp phép vĩnh viễn: đã kích hoạt thì không hết hạn.</summary>
        public static LicenseState Resolve(string trialStart, Activation? activation, DateTime nowUtc)
        {
            if (activation != null)
            {
                return new LicenseState { Kind = LicenseKind.Licensed, Activation = activation };
            }
            var start = DateTime.Parse(trialStart, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
            var end = start.AddDays(TrialDays);
            if (nowUtc >= end)
            {
                return new LicenseState { Kind = LicenseKind.Expired, StartedAt = trialStart, EndsAt = Iso(end) };
            }
            return new LicenseState
            {
                Kind = LicenseKind.Trial,
                StartedAt = trialStart,
                EndsAt = Iso(end),
                DaysLeft = (int)Math.Ceiling((end - nowUtc).TotalMilliseconds / 86_400_000d),
            };
        }

        /// <summary>Ngày theo giờ máy người dùng, dạng dd/mm/yyyy.</summary>
        public static string FormatLocalDate(string iso)
        {
            var at = DateTime.Parse(iso, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
            return at.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        }

        /// <summary>Nội dung thư xin cấp phép (người dùng tự gửi từ hộp thư của mình).</summary>
        public static LicenseMail Request(string appVersion, string trialStart) => new LicenseMail(
            OwnerEmail,
            "Yêu cầu cấp phép ConsQuotation",
            string.Join("\n", new[]
            {
                "Chào anh/chị,",
                "",
                "Tôi xin cấp phép sử dụng add-in ConsQuotation cho địa chỉ email gửi thư này.",
                $"Phiên bản add-in: {appVersion}",
                $"Bắt đầu dùng thử: {FormatLocalDate(trialStart)}",
                "",
                "Họ tên / đơn vị (nếu muốn ghi):",
            }));

        /// <summary>Trang soạn thư Gmail trên web (mở bằng trình duyệt; không cần ứng dụng thư).</summary>
        public static string GmailComposeUrl(LicenseMail mail) =>
            "https://mail.google.com/mail/?view=cm&fs=1" +
            $"&to={Uri.EscapeDataString(mail.To)}&su={Uri.EscapeDataString(mail.Subject)}&body={Uri.EscapeDataString(mail.Body)}";

        /// <summary>Trang soạn thư Outlook.com trên web.</summary>
        public static string OutlookComposeUrl(LicenseMail mail) =>
            "https://outlook.live.com/mail/0/deeplink/compose" +
            $"?to={Uri.EscapeDataString(mail.To)}&subject={Uri.EscapeDataString(mail.Subject)}&body={Uri.EscapeDataString(mail.Body)}";

        public static string MailtoUrl(LicenseMail mail) =>
            $"mailto:{mail.To}?subject={Uri.EscapeDataString(mail.Subject)}&body={Uri.EscapeDataString(mail.Body)}";
    }
}
