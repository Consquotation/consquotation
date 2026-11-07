using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using ConsQuotation.Core.Pricing;

namespace ConsQuotation.Core.Quotation
{
    public enum TermsKey
    {
        Scope,
        Assumptions,
        Exclusions,
        Commercial,
        Notes,
    }

    public sealed class TermsSection
    {
        public TermsSection(TermsKey key, string text)
        {
            Key = key;
            Text = text;
        }

        public TermsKey Key { get; }
        public string Text { get; }
    }

    public sealed class TermsRow
    {
        public TermsRow(string label, string text)
        {
            Label = label;
            Text = text;
        }

        public string Label { get; }
        public string Text { get; }
    }

    /// <summary>
    /// Khu vực "Ghi chú và điều khoản" dưới bảng báo giá, chuyển từ src/domain/terms.ts. Người dùng tự nhập nội
    /// dung; add-in không soạn sẵn điều khoản nào. Nhãn ở cột đầu của bảng, nội dung ở cột "Nội dung công việc".
    /// Vùng được đánh dấu bằng tên CQ_Terms_n để tìm lại sau khi dòng bị dời.
    /// </summary>
    public static class Terms
    {
        public const string Title = "GHI CHÚ VÀ ĐIỀU KHOẢN";
        public const int TextColumnOffset = 3;
        public const int MaxLength = 32000;

        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

        public static readonly IReadOnlyList<KeyValuePair<TermsKey, string>> Sections = new[]
        {
            new KeyValuePair<TermsKey, string>(TermsKey.Scope, "Phạm vi công việc:"),
            new KeyValuePair<TermsKey, string>(TermsKey.Assumptions, "Giả định:"),
            new KeyValuePair<TermsKey, string>(TermsKey.Exclusions, "Phần loại trừ:"),
            new KeyValuePair<TermsKey, string>(TermsKey.Commercial, "Điều khoản thương mại:"),
            new KeyValuePair<TermsKey, string>(TermsKey.Notes, "Ghi chú:"),
        };

        public static string LabelOf(TermsKey key) => Sections.First(s => s.Key == key).Value;

        /// <summary>Chuẩn hóa xuống dòng (Excel dùng \n trong ô).</summary>
        public static string Normalize(string text) => text.Replace("\r\n", "\n").Replace('\r', '\n').Trim();

        public static List<TermsKey> Validate(IEnumerable<TermsSection> sections) =>
            sections.Where(s => Normalize(s.Text).Length > MaxLength).Select(s => s.Key).ToList();

        /// <summary>Các mục có nội dung, theo thứ tự chuẩn. Mục để trống không được ghi.</summary>
        public static List<TermsSection> ToWrite(IReadOnlyCollection<TermsSection> sections) => Sections
            .Select(def => sections.FirstOrDefault(s => s.Key == def.Key))
            .Where(s => s != null && Normalize(s.Text) != "")
            .Select(s => new TermsSection(s!.Key, Normalize(s.Text)))
            .ToList();

        /// <summary>Hai cột ghi vào sheet; dòng đầu là tiêu đề. Chữ có tiền tố ' để Excel không hiểu "=…", "10%" thành công thức, số.</summary>
        public static List<TermsRow> Rows(IReadOnlyCollection<TermsSection> sections)
        {
            var rows = new List<TermsRow> { new TermsRow(Title, "") };
            rows.AddRange(ToWrite(sections).Select(s => new TermsRow(LabelOf(s.Key), WorkItemDraft.AsLiteralText(s.Text))));
            return rows;
        }

        /// <summary>Đọc lại từ sheet (người dùng có thể đã sửa trực tiếp). Nhãn không khớp thì bỏ qua.</summary>
        public static List<TermsSection> Parse(IReadOnlyList<object?> labels, IReadOnlyList<object?> texts)
        {
            string Key(object? value)
            {
                var text = QuoteLineReader.Text(value).Trim();
                return (text.EndsWith(":") ? text.Substring(0, text.Length - 1) : text).ToLower(Vi);
            }
            var result = new List<TermsSection>();
            for (var i = 0; i < labels.Count; i++)
            {
                var label = Key(labels[i]);
                foreach (var def in Sections)
                {
                    if (Key(def.Value) == label && result.All(r => r.Key != def.Key))
                    {
                        result.Add(new TermsSection(def.Key, QuoteLineReader.Text(texts[i])));
                    }
                }
            }
            return result;
        }
    }

    public enum PageOrientationKind
    {
        Portrait,
        Landscape,
    }

    public enum PaperKind
    {
        A4,
        A3,
        Letter,
    }

    /// <summary>Width: vừa 1 trang theo chiều ngang (nhiều trang dọc); Page: cả báo giá trong 1 trang; None: 100%.</summary>
    public enum FitKind
    {
        Width,
        Page,
        None,
    }

    public sealed class PrintOptions
    {
        public PageOrientationKind Orientation { get; set; } = PageOrientationKind.Portrait;
        public PaperKind Paper { get; set; } = PaperKind.A4;
        public FitKind Fit { get; set; } = FitKind.Width;
        public bool RepeatHeader { get; set; } = true;
        public bool PageNumbers { get; set; } = true;
        public bool CenterHorizontally { get; set; } = true;
        /// <summary>Xuống dòng cho cột Nội dung công việc và Ghi chú (tránh bị cắt chữ khi in).</summary>
        public bool WrapLongText { get; set; } = true;
    }

    /// <summary>Hình chữ nhật ô, chỉ số tính từ 0.</summary>
    public sealed class CellRect
    {
        public CellRect(int rowIndex, int columnIndex, int rowCount, int columnCount)
        {
            RowIndex = rowIndex;
            ColumnIndex = columnIndex;
            RowCount = rowCount;
            ColumnCount = columnCount;
        }

        public int RowIndex { get; }
        public int ColumnIndex { get; }
        public int RowCount { get; }
        public int ColumnCount { get; }
    }

    /// <summary>Thiết lập trang in, chuyển từ src/domain/printLayout.ts. Xem trước, in, xuất PDF dùng chức năng có sẵn của Excel.</summary>
    public static class PrintLayout
    {
        public const string PageNumberFooter = "Trang &P / &N";

        /// <summary>Hình chữ nhật nhỏ nhất bao các khối (mẫu, bảng, tổng hợp, ghi chú).</summary>
        public static CellRect Bounding(IReadOnlyCollection<CellRect> rects)
        {
            var top = rects.Min(r => r.RowIndex);
            var left = rects.Min(r => r.ColumnIndex);
            var bottom = rects.Max(r => r.RowIndex + r.RowCount);
            var right = rects.Max(r => r.ColumnIndex + r.ColumnCount);
            return new CellRect(top, left, bottom - top, right - left);
        }

        /// <summary>Dòng đầu của báo giá: tiêu đề "BẢNG BÁO GIÁ" nếu còn ở phía trên, rồi tới nhãn thông tin đầu tiên, cuối cùng là dòng tiêu đề bảng.</summary>
        public static int QuoteTopRow(int headerRow, int? titleRow, int? firstInfoRow)
        {
            if (titleRow != null && titleRow < headerRow)
            {
                return titleRow.Value;
            }
            return firstInfoRow != null && firstInfoRow < headerRow ? firstInfoRow.Value : headerRow;
        }
    }

    public sealed class ColumnRewrite
    {
        /// <summary>Chỉ số các ô có công thức mẫu đang khác quy tắc mới, cần ghi lại.</summary>
        public List<int> Updates { get; } = new List<int>();
        /// <summary>Chỉ số các ô có công thức mẫu (kể cả không đổi): định dạng tiền của chúng đi theo quy tắc mới.</summary>
        public List<int> Ours { get; } = new List<int>();
        /// <summary>Số ô có công thức khác mẫu (bị sửa tay): giữ nguyên.</summary>
        public int Kept { get; set; }
        /// <summary>Mọi ô của cột đều là công thức mẫu: ghi cả cột để Excel cập nhật luôn công thức của cột tính toán.</summary>
        public bool AllOurs { get; set; }
    }

    /// <summary>Đổi quy tắc làm tròn trên các công thức đã ghi, chuyển từ rewriteColumn của excelPricingGateway.ts.</summary>
    public static class RoundingRewrite
    {
        /// <summary>Định dạng số cho cột tiền theo quy tắc: có chữ số thập phân thì hiển thị đủ.</summary>
        public static string MoneyFormat(RoundingRule rule) =>
            rule.Mode != RoundingMode.None && rule.Digits > 0 ? "#,##0." + new string('0', rule.Digits) : "#,##0";

        /// <summary>
        /// Định dạng tiền do add-in đặt. COM có thể trả định dạng theo vùng miền của máy (#.##0 khi dấu chấm là dấu
        /// hàng nghìn) nên so cả hai dạng.
        /// </summary>
        public static bool IsMoneyFormat(string? format, string thousands = ",", string decimalSeparator = ".")
        {
            if (format == null)
            {
                return false;
            }
            return Regex.IsMatch(format, @"^#,##0(\.0+)?$") ||
                   Regex.IsMatch(format, $"^#{Regex.Escape(thousands)}##0({Regex.Escape(decimalSeparator)}0+)?$");
        }

        /// <summary>
        /// So với mọi biến thể quy tắc chứ không chỉ quy tắc đã lưu, để lần áp dụng sau tự sửa được chỗ còn lệch. Ô có
        /// công thức khác mẫu hoặc hằng số được giữ nguyên.
        /// </summary>
        public static ColumnRewrite Plan(IReadOnlyList<object?> formulas, Func<RoundingRule, string> build, RoundingRule newRule, string ownTable)
        {
            var target = build(newRule);
            var family = new HashSet<string>(Rounding.AllRules.Select(rule => FormulaText.Normalize(build(rule), ownTable)));
            var plan = new ColumnRewrite();
            for (var i = 0; i < formulas.Count; i++)
            {
                if (formulas[i] is string text && family.Contains(FormulaText.Normalize(text, ownTable)))
                {
                    plan.Ours.Add(i);
                    if (!FormulaText.Same(text, target, ownTable))
                    {
                        plan.Updates.Add(i);
                    }
                }
                else if (formulas[i] is string other && other.StartsWith("=", StringComparison.Ordinal))
                {
                    plan.Kept++;
                }
            }
            plan.AllOurs = formulas.Count > 0 && plan.Ours.Count == formulas.Count;
            return plan;
        }
    }

    public sealed class RoundingApplyResult
    {
        public int UpdatedCells { get; set; }
        public int KeptCells { get; set; }
    }

    public sealed class SummaryState
    {
        public bool Exists { get; set; }
        public List<Adjustment> Adjustments { get; set; } = new List<Adjustment>();
        /// <summary>Số dòng có Loại, Cách tính hoặc Giá trị không hợp lệ trên sheet.</summary>
        public int InvalidRows { get; set; }
        public string Address { get; set; } = "";
    }

    public enum AreaBlock
    {
        None,
        TableMissing,
        HeadersChanged,
        NoTotals,
        Protected,
        Occupied,
    }

    /// <summary>Kết quả kiểm tra vùng sẽ ghi bảng tổng hợp hoặc khu vực điều khoản.</summary>
    public sealed class AreaCheck
    {
        public AreaBlock Block { get; set; }
        public bool Ok => Block == AreaBlock.None;
        public string Address { get; set; } = "";
        public string Fingerprint { get; set; } = "";
        public List<string> Sample { get; set; } = new List<string>();
    }

    public sealed class UnitPriceFix
    {
        public string SheetName { get; set; } = "";
        public string Address { get; set; } = "";
        /// <summary>Giá trị lúc kiểm tra; khác lúc ghi thì dừng.</summary>
        public object? Expected { get; set; }
        public double Value { get; set; }
    }

    public sealed class TermsState
    {
        public bool Exists { get; set; }
        public List<TermsSection> Sections { get; set; } = new List<TermsSection>();
        public string Address { get; set; } = "";
    }

    public sealed class PrintCurrent
    {
        public string PrintArea { get; set; } = "";
        public string TitleRows { get; set; } = "";
        public PageOrientationKind? Orientation { get; set; }
        public PaperKind? Paper { get; set; }
        public int? PaperCode { get; set; }
        public int? FitWide { get; set; }
        public int? FitTall { get; set; }
        public int? Scale { get; set; }
        public string Footer { get; set; } = "";
    }

    public sealed class PrintSetupState
    {
        public string SheetName { get; set; } = "";
        /// <summary>Vùng sẽ đặt làm vùng in: từ tiêu đề tới hết khu vực điều khoản.</summary>
        public string QuoteArea { get; set; } = "";
        public bool SheetProtected { get; set; }
        public PrintCurrent Current { get; set; } = new PrintCurrent();
    }
}
