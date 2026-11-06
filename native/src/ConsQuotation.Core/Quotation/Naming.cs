using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace ConsQuotation.Core.Quotation
{
    /// <summary>
    /// Đặt tên sheet và Excel Table không trùng, chuyển từ src/domain/naming.ts. So sánh không phân biệt hoa
    /// thường vì Excel coi "Báo giá" và "báo giá" là trùng.
    /// </summary>
    public static class Naming
    {
        public const int SheetNameMax = 31;
        public const string DefaultQuoteSheetName = "Báo giá";
        public const string QuoteTablePrefix = "CQ_Quote_";

        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");
        private static readonly Regex InvalidSheetChars = new Regex(@"[\[\]:*?/\\]");
        private static readonly Regex QuoteTable = new Regex($"^{QuoteTablePrefix}\\d+$", RegexOptions.IgnoreCase);

        private static HashSet<string> LowerSet(IEnumerable<string> names) => new HashSet<string>(names.Select(n => n.ToLower(Vi)));

        public static string SanitizeSheetName(string name)
        {
            var cleaned = InvalidSheetChars.Replace(name, " ").Trim('\'').Trim();
            return cleaned.Length > 0 ? cleaned : "Sheet";
        }

        /// <summary>"Báo giá", "Báo giá (2)"…: cắt phần gốc để không vượt 31 ký tự, không trùng tên dành riêng History.</summary>
        public static string UniqueSheetName(string baseName, IEnumerable<string> existing)
        {
            var taken = LowerSet(existing.Concat(new[] { "history" }));
            var root = SanitizeSheetName(baseName);
            for (var n = 1; ; n++)
            {
                var suffix = n == 1 ? "" : $" ({n})";
                var head = root.Substring(0, Math.Min(root.Length, SheetNameMax - suffix.Length)).TrimEnd('\'', ' ');
                var candidate = (head.Length > 0 ? head : "Sheet") + suffix;
                if (!taken.Contains(candidate.ToLower(Vi)))
                {
                    return candidate;
                }
            }
        }

        /// <summary>Kiểm tra tên sheet người dùng gõ; null = hợp lệ. Tên trùng sheet có sẵn vẫn hợp lệ (add-in thêm (2), (3)…).</summary>
        public static string? CheckSheetName(string input)
        {
            var name = input.Trim();
            if (name == "")
            {
                return "Nhập tên sheet.";
            }
            if (InvalidSheetChars.IsMatch(name))
            {
                return "Tên sheet không được chứa các ký tự [ ] : * ? / \\";
            }
            if (name.StartsWith("'") || name.EndsWith("'"))
            {
                return "Tên sheet không được bắt đầu hoặc kết thúc bằng dấu nháy đơn.";
            }
            if (name.Length > SheetNameMax)
            {
                return $"Tên sheet tối đa {SheetNameMax} ký tự.";
            }
            return name.ToLower(Vi) == "history" ? $"Excel không cho phép đặt tên sheet là \"{name}\"." : null;
        }

        /// <summary>CQ_Quote_n với n nhỏ nhất chưa dùng; tên Table phải khác mọi Table và tên đã đặt trong workbook.</summary>
        public static string UniqueQuoteTableName(IEnumerable<string> existingNames)
        {
            var taken = LowerSet(existingNames);
            for (var n = 1; ; n++)
            {
                var candidate = $"{QuoteTablePrefix}{n}";
                if (!taken.Contains(candidate.ToLower(Vi)))
                {
                    return candidate;
                }
            }
        }

        public static bool IsQuoteTableName(string name) => QuoteTable.IsMatch(name);

        public static string TermsNameFor(string quoteTableName) => Regex.Replace(quoteTableName, "^CQ_Quote_", "CQ_Terms_");
    }
}
