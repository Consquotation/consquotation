using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace ConsQuotation.Core.Pricing
{
    public enum AnalysisColumnKey
    {
        Code,
        Name,
        Unit,
        ResourceCode,
        ResourceName,
        ResourceType,
        ResourceUnit,
        Quantity,
        Price,
        LineAmount,
        UnitPrice,
        Source,
    }

    public sealed class AnalysisColumn
    {
        public AnalysisColumn(AnalysisColumnKey key, string header, int width, string? numberFormat = null)
        {
            Key = key;
            Header = header;
            Width = width;
            NumberFormat = numberFormat;
        }

        public AnalysisColumnKey Key { get; }
        public string Header { get; }
        /// <summary>Độ rộng cột theo điểm (points).</summary>
        public int Width { get; }
        public string? NumberFormat { get; }
    }

    /// <summary>
    /// Sheet "Phân tích đơn giá" (prompts/10): một Excel Table CQ_Analysis cho cả workbook; mỗi công tác
    /// là một khối dòng (một dòng/tài nguyên). Tên bảng, tên cột và công thức giống hệt bản web
    /// (src/domain/pricing/analysis.ts) để workbook tạo ở bản nào cũng mở được ở bản kia.
    /// </summary>
    public static class Analysis
    {
        public const string TableName = "CQ_Analysis";
        public const string SheetName = "Phân tích đơn giá";
        public const string Title = "PHÂN TÍCH ĐƠN GIÁ";
        public const string Note =
            "Đơn giá công tác = Σ (Hao phí × Đơn giá nguồn) của các dòng cùng mã. Sửa hao phí/đơn giá nguồn tại đây rồi dùng ConsQuotation › Kiểm tra báo giá để cập nhật bảng báo giá.";

        /// <summary>Hàng (tính từ 0) của dòng tiêu đề cột trên sheet phân tích.</summary>
        public const int HeaderRow = 3;

        public static readonly IReadOnlyList<AnalysisColumn> Columns = new[]
        {
            new AnalysisColumn(AnalysisColumnKey.Code, "Mã công tác", 80),
            new AnalysisColumn(AnalysisColumnKey.Name, "Tên công tác", 200),
            new AnalysisColumn(AnalysisColumnKey.Unit, "Đơn vị công tác", 60),
            new AnalysisColumn(AnalysisColumnKey.ResourceCode, "Mã tài nguyên", 80),
            new AnalysisColumn(AnalysisColumnKey.ResourceName, "Tên tài nguyên", 180),
            new AnalysisColumn(AnalysisColumnKey.ResourceType, "Loại", 80),
            new AnalysisColumn(AnalysisColumnKey.ResourceUnit, "Đơn vị", 50),
            new AnalysisColumn(AnalysisColumnKey.Quantity, "Hao phí", 70, "General"),
            new AnalysisColumn(AnalysisColumnKey.Price, "Đơn giá nguồn", 90, "#,##0"),
            new AnalysisColumn(AnalysisColumnKey.LineAmount, "Thành tiền", 100, "#,##0"),
            new AnalysisColumn(AnalysisColumnKey.UnitPrice, "Đơn giá công tác", 100, "#,##0"),
            new AnalysisColumn(AnalysisColumnKey.Source, "Nguồn giá", 220),
        };

        public static string HeaderOf(AnalysisColumnKey key) => Columns.First(c => c.Key == key).Header;

        private static string Col(AnalysisColumnKey key) => $"{TableName}[{HeaderOf(key)}]";
        private static string Here(AnalysisColumnKey key) => $"[@[{HeaderOf(key)}]]";

        /// <summary>Thành tiền = Hao phí × Đơn giá nguồn; trống khi thiếu số liệu.</summary>
        public static string LineAmountFormula() =>
            $"=IF(OR({Here(AnalysisColumnKey.Quantity)}=\"\",{Here(AnalysisColumnKey.Price)}=\"\"),\"\",{Here(AnalysisColumnKey.Quantity)}*{Here(AnalysisColumnKey.Price)})";

        /// <summary>
        /// Đơn giá công tác = tổng Thành tiền của khối cùng mã; trống nếu còn dòng thiếu số liệu. So khớp mã
        /// bằng "=" trong SUMPRODUCT, không dùng COUNTIFS/SUMIFS (coi "007" và "7" là một, hiểu * ? ~ là ký tự đại diện).
        /// </summary>
        public static string UnitPriceFormula(RoundingRule rule)
        {
            var sameCode = $"--({Col(AnalysisColumnKey.Code)}={Here(AnalysisColumnKey.Code)})";
            var missing = $"SUMPRODUCT({sameCode},--({Col(AnalysisColumnKey.LineAmount)}=\"\"))";
            var total = $"SUMPRODUCT({sameCode},{Col(AnalysisColumnKey.LineAmount)})";
            return $"=IF({missing}>0,\"\",{Rounding.Wrap(total, rule)})";
        }

        public static bool IsAnalysisHeaders(IReadOnlyList<string> headers) =>
            Columns.All(c => headers.Count(h => h == c.Header) == 1);

        public static int ColumnIndex(IReadOnlyList<string> headers, AnalysisColumnKey key)
        {
            var header = HeaderOf(key);
            for (var i = 0; i < headers.Count; i++)
            {
                if (headers[i] == header)
                {
                    return i;
                }
            }
            return -1;
        }
    }

    /// <summary>
    /// So sánh công thức đọc lại từ Excel với công thức mẫu. Excel tự viết lại tham chiếu có cấu trúc:
    /// bỏ tên bảng khi tham chiếu chính bảng chứa ô ("CQ_Analysis[Mã công tác]" → "[Mã công tác]"), bỏ
    /// ngoặc quanh tên cột không có dấu cách ("[@[Loại]]" → "[@Loại]"). Chuẩn hóa cả hai phía rồi mới so.
    /// </summary>
    public static class FormulaText
    {
        private static readonly Regex SimpleColumn = new Regex(@"\[@\[([^\][\s]+)\]\]");

        public static string Normalize(string formula, string ownTable) =>
            SimpleColumn.Replace(formula.Replace(ownTable + "[", "["), "[@$1]");

        public static bool Same(object? actual, string expected, string ownTable) =>
            actual is string text && Normalize(text, ownTable) == Normalize(expected, ownTable);
    }
}
