using System.Text.RegularExpressions;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Storage;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Quotation
{
    /// <summary>
    /// Cấu hình của workbook do bản native ghi, lưu trong Custom XML Part đi theo file. Workbook settings của bản
    /// web nằm trong vùng lưu của Office.js, COM không đọc được, nên workbook từ bản web không có part này:
    /// quy tắc làm tròn được suy từ công thức trên sheet và "đã dùng thư viện" được suy từ hồ sơ báo giá.
    /// </summary>
    public static class WorkbookSettings
    {
        public const string Namespace = "urn:consquotation:settings";
        public const string LibraryUsedKey = "libraryUsed";
        public const string RoundingKey = "rounding";

        private static readonly Regex Data = new Regex(@"<(?:\w+:)?data(?:\s[^>]*)?>([\s\S]*?)</(?:\w+:)?data>");

        public static string Encode(JObject settings)
        {
            var json = settings.ToString(Formatting.None).Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
            return $"<settings xmlns=\"{Namespace}\"><data>{json}</data></settings>";
        }

        /// <summary>Đọc cấu hình; part hỏng coi như chưa có cấu hình (giá trị suy được từ sheet vẫn dùng được).</summary>
        public static JObject Decode(string xml)
        {
            var match = Data.Match(xml);
            if (!match.Success)
            {
                return new JObject();
            }
            try
            {
                var json = match.Groups[1].Value.Replace("&lt;", "<").Replace("&gt;", ">").Replace("&quot;", "\"").Replace("&apos;", "'").Replace("&amp;", "&");
                return JToken.Parse(json) as JObject ?? new JObject();
            }
            catch (JsonException)
            {
                return new JObject();
            }
        }

        public static bool LibraryUsed(JObject settings) => settings[LibraryUsedKey]?.Type == JTokenType.Boolean && (bool)settings[LibraryUsedKey]!;

        /// <summary>Quy tắc làm tròn đã lưu; null nếu chưa lưu.</summary>
        public static RoundingConfig? RoundingOf(JObject settings)
        {
            if (!(settings[RoundingKey] is JObject rounding))
            {
                return null;
            }
            RoundingRule? Rule(string key)
            {
                try
                {
                    return rounding[key]?.ToObject<RoundingRule>(JsonSerializer.Create(Json.Settings));
                }
                catch (JsonException)
                {
                    return null;
                }
            }
            return Rounding.Normalize(Rule("unitPrice"), Rule("amount"), Rule("adjustment"));
        }
    }
}
