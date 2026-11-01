using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace ConsQuotation.Core.Pricing
{
    public enum AdjustmentKind
    {
        Deduct,
        Add,
    }

    public enum AdjustmentMethod
    {
        PercentOfRunning,
        PercentOfBase,
        Fixed,
    }

    public sealed class Adjustment
    {
        public Adjustment(string name, AdjustmentKind kind, AdjustmentMethod method, decimal? value)
        {
            Name = name;
            Kind = kind;
            Method = method;
            Value = value;
        }

        public string Name { get; }
        public AdjustmentKind Kind { get; }
        public AdjustmentMethod Method { get; }
        /// <summary>Tỷ lệ % (8 = 8%) hoặc số tiền; null = chưa nhập (khác 0).</summary>
        public decimal? Value { get; }
    }

    public sealed class AdjustmentError
    {
        public AdjustmentError(int index, string field, string message)
        {
            Index = index;
            Field = field;
            Message = message;
        }

        public int Index { get; }
        /// <summary>"name" hoặc "value".</summary>
        public string Field { get; }
        public string Message { get; }
    }

    public sealed class ParsedSummary
    {
        public List<Adjustment> Adjustments { get; } = new List<Adjustment>();
        /// <summary>Dòng có Loại/Cách tính không hợp lệ (người dùng sửa trực tiếp trên sheet).</summary>
        public List<int> InvalidRows { get; } = new List<int>();
    }

    /// <summary>
    /// Bảng tổng hợp sau bảng báo giá: chiết khấu, phụ phí, thuế… do NGƯỜI DÙNG cấu hình (prompts/10),
    /// không có khoản hay tỷ lệ mặc định; thứ tự áp dụng = thứ tự dòng. Bảng Excel CQ_Summary_n đặt dưới
    /// dòng tổng của CQ_Quote_n; mọi phép tính là công thức Excel. Giá trị trống → Số tiền trống → Lũy kế
    /// và Tổng cộng báo #N/A (không bỏ qua âm thầm). Chuyển từ src/domain/pricing/adjustments.ts.
    /// </summary>
    public static class Adjustments
    {
        public static readonly IReadOnlyList<string> Headers = new[] { "Khoản mục", "Loại", "Cách tính", "Giá trị", "Số tiền", "Lũy kế" };

        /// <summary>Bảng tổng hợp chiếm các cột "Nội dung công việc" … "Ghi chú" (chỉ số 3..8) của bảng báo giá.</summary>
        public const int FirstColumnOffset = 3;

        public const string BaseKindLabel = "Cộng";
        public const string BaseMethodLabel = "Theo bảng báo giá";
        public const string BaseRowLabel = "Cộng giá trị báo giá";
        public const string TotalLabel = "Tổng cộng";
        /// <summary>Nhãn dòng tổng của bảng báo giá khi có bảng tổng hợp (tổng thật nằm ở bảng tổng hợp).</summary>
        public const string QuoteSubtotalLabel = "Cộng";

        public static string KindLabel(AdjustmentKind kind) => kind == AdjustmentKind.Deduct ? "Giảm trừ" : "Cộng thêm";

        public static string MethodLabel(AdjustmentMethod method) =>
            method == AdjustmentMethod.PercentOfRunning ? "% trên lũy kế"
            : method == AdjustmentMethod.PercentOfBase ? "% trên giá trị báo giá"
            : "Số tiền";

        private static readonly Regex SummaryName = new Regex(@"^CQ_Summary_\d+$");

        public static bool IsSummaryTableName(string name) => SummaryName.IsMatch(name);

        public static string QuoteTableOfSummary(string summaryName) => Regex.Replace(summaryName, "^CQ_Summary_", "CQ_Quote_");

        public static string SummaryTableName(string quoteTableName) => Regex.Replace(quoteTableName, "^CQ_Quote_", "CQ_Summary_");

        private const string HName = "[@[Khoản mục]]";
        private const string HKind = "[@[Loại]]";
        private const string HMethod = "[@[Cách tính]]";
        private const string HValue = "[@[Giá trị]]";
        private const string HAmount = "[@[Số tiền]]";
        private const string HRunning = "[@[Lũy kế]]";

        /// <summary>Ô tổng Thành tiền của bảng báo giá; ô trống bị coi là lỗi (Excel coi ô trống là 0).</summary>
        private static string BaseExpression(string quoteTableName)
        {
            var total = $"{quoteTableName}[[#Totals],[Thành tiền]]";
            return $"IF({total}=\"\",NA(),{total})";
        }

        public static string AmountFormula(string quoteTableName, RoundingRule rule)
        {
            var baseExpr = BaseExpression(quoteTableName);
            var sign = $"IF({HKind}=\"{KindLabel(AdjustmentKind.Deduct)}\",-1,IF({HKind}=\"{KindLabel(AdjustmentKind.Add)}\",1,NA()))";
            var previous = $"OFFSET({HRunning},-1,0)";
            var magnitude =
                $"IF({HMethod}=\"{MethodLabel(AdjustmentMethod.Fixed)}\",{HValue}," +
                $"IF({HMethod}=\"{MethodLabel(AdjustmentMethod.PercentOfRunning)}\",{HValue}/100*{previous}," +
                $"IF({HMethod}=\"{MethodLabel(AdjustmentMethod.PercentOfBase)}\",{HValue}/100*{baseExpr},NA())))";
            return $"=IF({HMethod}=\"{BaseMethodLabel}\",{baseExpr}," +
                   $"IF({HValue}=\"\",\"\",{Rounding.Wrap($"{sign}*{magnitude}", rule)}))";
        }

        public static string RunningFormula() =>
            $"=IF({HAmount}=\"\",NA(),IF({HMethod}=\"{BaseMethodLabel}\",{HAmount},OFFSET({HRunning},-1,0)+{HAmount}))";

        public static string TotalFormula(string summaryName)
        {
            var running = $"{summaryName}[Lũy kế]";
            return $"=IF(COUNTBLANK({running})>0,NA(),INDEX({running},ROWS({running})))";
        }

        /// <summary>Các dòng ghi vào bảng tổng hợp (dòng cơ sở + từng khoản), theo thứ tự cột Headers.</summary>
        public static List<object[]> Rows(string quoteTableName, IEnumerable<Adjustment> adjustments, RoundingRule rule)
        {
            var amount = AmountFormula(quoteTableName, rule);
            var running = RunningFormula();
            var rows = new List<object[]> { new object[] { BaseRowLabel, BaseKindLabel, BaseMethodLabel, "", amount, running } };
            foreach (var a in adjustments)
            {
                // Tiền tố ' để Excel giữ nguyên chữ (không hiểu "10%" thành số…).
                rows.Add(new object[] { "'" + a.Name, KindLabel(a.Kind), MethodLabel(a.Method), a.Value.HasValue ? (object)a.Value.Value : "", amount, running });
            }
            return rows;
        }

        public static List<AdjustmentError> Validate(IReadOnlyList<Adjustment> adjustments)
        {
            var errors = new List<AdjustmentError>();
            for (var index = 0; index < adjustments.Count; index++)
            {
                var a = adjustments[index];
                if (a.Name.Trim() == "")
                {
                    errors.Add(new AdjustmentError(index, "name", "Nhập tên khoản mục."));
                }
                if (a.Value.HasValue)
                {
                    if (a.Value < 0)
                    {
                        errors.Add(new AdjustmentError(index, "value", "Giá trị phải là số không âm."));
                    }
                    else if (a.Method != AdjustmentMethod.Fixed && a.Kind == AdjustmentKind.Deduct && a.Value > 100)
                    {
                        errors.Add(new AdjustmentError(index, "value", "Tỷ lệ giảm trừ không được lớn hơn 100%."));
                    }
                }
            }
            return errors;
        }

        /// <summary>Đọc lại cấu hình hiện có từ chính bảng tổng hợp trên sheet (nguồn sự thật là workbook).</summary>
        public static ParsedSummary Parse(IEnumerable<IReadOnlyList<object?>> rows)
        {
            var parsed = new ParsedSummary();
            var index = 0;
            foreach (var row in rows)
            {
                object Cell(int i) => i < row.Count && row[i] != null ? row[i]! : "";
                var name = Cell(0);
                var kindText = Convert.ToString(Cell(1), System.Globalization.CultureInfo.InvariantCulture);
                var methodText = Convert.ToString(Cell(2), System.Globalization.CultureInfo.InvariantCulture);
                var value = Cell(3);
                if (methodText == BaseMethodLabel)
                {
                    index++;
                    continue;
                }
                AdjustmentKind? kind = kindText == KindLabel(AdjustmentKind.Deduct) ? AdjustmentKind.Deduct
                    : kindText == KindLabel(AdjustmentKind.Add) ? AdjustmentKind.Add : (AdjustmentKind?)null;
                var method = new[] { AdjustmentMethod.PercentOfRunning, AdjustmentMethod.PercentOfBase, AdjustmentMethod.Fixed }
                    .Cast<AdjustmentMethod?>()
                    .FirstOrDefault(m => MethodLabel(m!.Value) == methodText);
                var isEmpty = value is string s && s == "";
                var number = AsDecimal(value);
                if (kind == null || method == null || (!isEmpty && number == null))
                {
                    parsed.InvalidRows.Add(index);
                    index++;
                    continue;
                }
                parsed.Adjustments.Add(new Adjustment(Convert.ToString(name, System.Globalization.CultureInfo.InvariantCulture) ?? "", kind.Value, method.Value, isEmpty ? null : number));
                index++;
            }
            return parsed;
        }

        private static decimal? AsDecimal(object value)
        {
            switch (value)
            {
                case decimal d:
                    return d;
                case double x when !double.IsNaN(x) && !double.IsInfinity(x):
                    return (decimal)x;
                case int i:
                    return i;
                case long l:
                    return l;
                default:
                    return null;
            }
        }
    }
}
