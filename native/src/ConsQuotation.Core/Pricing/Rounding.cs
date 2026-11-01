using System.Collections.Generic;
using ConsQuotation.Core.Numbers;

namespace ConsQuotation.Core.Pricing
{
    public enum RoundingMode
    {
        None,
        Round,
        RoundUp,
        RoundDown,
    }

    /// <summary>Cấp làm tròn: nơi áp dụng quy tắc.</summary>
    public enum RoundingLevel
    {
        UnitPrice,
        Amount,
        Adjustment,
    }

    /// <summary>
    /// Quy tắc làm tròn (prompts/10): kiểu làm tròn và số chữ số (âm = hàng chục/trăm/nghìn). Mặc định
    /// KHÔNG làm tròn — add-in không tự đặt quy tắc thay người dùng. Trên sheet, làm tròn bằng hàm Excel
    /// (ROUND/ROUNDUP/ROUNDDOWN) trong công thức.
    /// </summary>
    public sealed class RoundingRule
    {
        public RoundingRule(RoundingMode mode, int digits)
        {
            Mode = mode;
            Digits = digits;
        }

        public RoundingMode Mode { get; }
        public int Digits { get; }

        public override bool Equals(object? obj) => obj is RoundingRule r && r.Mode == Mode && r.Digits == Digits;
        public override int GetHashCode() => ((int)Mode * 397) ^ Digits;
        public override string ToString() => $"{Mode}({Digits})";
    }

    /// <summary>Quy tắc cho từng cấp: đơn giá, thành tiền, khoản điều chỉnh.</summary>
    public sealed class RoundingConfig
    {
        public RoundingConfig(RoundingRule unitPrice, RoundingRule amount, RoundingRule adjustment)
        {
            UnitPrice = unitPrice;
            Amount = amount;
            Adjustment = adjustment;
        }

        public RoundingRule UnitPrice { get; }
        public RoundingRule Amount { get; }
        public RoundingRule Adjustment { get; }

        public RoundingRule this[RoundingLevel level] =>
            level == RoundingLevel.UnitPrice ? UnitPrice : level == RoundingLevel.Amount ? Amount : Adjustment;
    }

    public static class Rounding
    {
        public const int MinDigits = -9;
        public const int MaxDigits = 6;

        public static readonly RoundingRule NoRounding = new RoundingRule(RoundingMode.None, 0);

        public static readonly RoundingConfig Default = new RoundingConfig(NoRounding, NoRounding, NoRounding);

        public static readonly RoundingLevel[] Levels = { RoundingLevel.UnitPrice, RoundingLevel.Amount, RoundingLevel.Adjustment };

        /// <summary>Mọi quy tắc hợp lệ — để nhận ra công thức mẫu đã ghi với quy tắc bất kỳ.</summary>
        public static readonly IReadOnlyList<RoundingRule> AllRules = BuildAllRules();

        private static List<RoundingRule> BuildAllRules()
        {
            var rules = new List<RoundingRule> { NoRounding };
            foreach (var mode in new[] { RoundingMode.Round, RoundingMode.RoundUp, RoundingMode.RoundDown })
            {
                for (var digits = MinDigits; digits <= MaxDigits; digits++)
                {
                    rules.Add(new RoundingRule(mode, digits));
                }
            }
            return rules;
        }

        public static bool IsValid(RoundingRule? rule) =>
            rule != null && rule.Digits >= MinDigits && rule.Digits <= MaxDigits;

        /// <summary>Cấu hình đã lưu; phần thiếu/hỏng → không làm tròn (không tự đoán).</summary>
        public static RoundingConfig Normalize(RoundingRule? unitPrice, RoundingRule? amount, RoundingRule? adjustment) =>
            new RoundingConfig(
                IsValid(unitPrice) ? unitPrice! : NoRounding,
                IsValid(amount) ? amount! : NoRounding,
                IsValid(adjustment) ? adjustment! : NoRounding);

        private static string ExcelFunction(RoundingMode mode) =>
            mode == RoundingMode.Round ? "ROUND" : mode == RoundingMode.RoundUp ? "ROUNDUP" : "ROUNDDOWN";

        /// <summary>Bọc biểu thức Excel (không có dấu "=") bằng hàm làm tròn theo quy tắc.</summary>
        public static string Wrap(string expression, RoundingRule rule) =>
            rule.Mode == RoundingMode.None ? expression : $"{ExcelFunction(rule.Mode)}({expression},{rule.Digits})";

        /// <summary>Mô tả tiếng Việt, ví dụ "Làm tròn gần nhất … (ROUND) tới hàng nghìn".</summary>
        public static string Describe(RoundingRule rule)
        {
            if (rule.Mode == RoundingMode.None)
            {
                return "Không làm tròn";
            }
            var how = rule.Mode == RoundingMode.Round
                ? "Làm tròn gần nhất, 0,5 làm tròn ra xa số 0 (ROUND)"
                : rule.Mode == RoundingMode.RoundUp
                    ? "Luôn làm tròn ra xa số 0 (ROUNDUP)"
                    : "Luôn làm tròn về phía số 0 (ROUNDDOWN)";
            return $"{how} {DescribeDigits(rule.Digits)}";
        }

        private static readonly Dictionary<int, string> PlaceNames = new Dictionary<int, string>
        {
            [-1] = "hàng chục",
            [-2] = "hàng trăm",
            [-3] = "hàng nghìn",
            [-4] = "hàng chục nghìn",
            [-5] = "hàng trăm nghìn",
            [-6] = "hàng triệu",
        };

        public static string DescribeDigits(int digits)
        {
            if (digits > 0)
            {
                return $"tới {digits} chữ số thập phân";
            }
            if (digits == 0)
            {
                return "tới hàng đơn vị";
            }
            return $"tới {(PlaceNames.TryGetValue(digits, out var name) ? name : $"10^{-digits}")}";
        }

        /// <summary>
        /// Làm tròn trong add-in theo đúng ngữ nghĩa ROUND/ROUNDUP/ROUNDDOWN của Excel (đối xứng quanh 0),
        /// để hiển thị tạm tính trước khi ghi; giá trị trên sheet do Excel tính.
        /// </summary>
        public static decimal Apply(decimal value, RoundingRule rule)
        {
            if (rule.Mode == RoundingMode.None)
            {
                return value;
            }
            var mode = rule.Mode == RoundingMode.Round
                ? DecimalRoundingMode.Round
                : rule.Mode == RoundingMode.RoundUp ? DecimalRoundingMode.RoundUp : DecimalRoundingMode.RoundDown;
            return DecimalMath.Round(value, rule.Digits, mode);
        }
    }
}
