using System;
using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Pricing;

namespace ConsQuotation.Core.Quotation
{
    public enum QuoteColumnKey
    {
        Stt,
        Code,
        Group,
        Description,
        Unit,
        Quantity,
        UnitPrice,
        Amount,
        Notes,
        MaterialPrice,
        LaborPrice,
        MachinePrice,
        OtherPrice,
        LineId,
    }

    public sealed class QuoteColumn
    {
        public QuoteColumn(QuoteColumnKey key, string header, int width, string? numberFormat = null, bool wrap = false, bool hidden = false)
        {
            Key = key;
            Header = header;
            Width = width;
            NumberFormat = numberFormat;
            Wrap = wrap;
            Hidden = hidden;
        }

        public QuoteColumnKey Key { get; }
        public string Header { get; }
        /// <summary>Độ rộng gợi ý (point); chỉ áp dụng khi tạo trên sheet mới.</summary>
        public int Width { get; }
        /// <summary>Định dạng số Excel (mã en-US). Không làm tròn giá trị.</summary>
        public string? NumberFormat { get; }
        /// <summary>Xuống dòng trong ô: chữ dài không bị cắt khi in.</summary>
        public bool Wrap { get; }
        /// <summary>Ẩn cột khi tạo trên sheet mới (cột kỹ thuật, không in).</summary>
        public bool Hidden { get; }
    }

    public sealed class InfoRow
    {
        public InfoRow(int row, string label)
        {
            Row = row;
            Label = label;
        }

        public int Row { get; }
        public string Label { get; }
    }

    public sealed class QuoteLayout
    {
        public int RowCount { get; set; }
        public int ColumnCount { get; set; }
        public List<InfoRow> InfoRows { get; set; } = new List<InfoRow>();
        public int HeaderRow { get; set; }
        public int FirstDataRow { get; set; }
        public int DataRowCount { get; set; }
        public int TotalRow { get; set; }
    }

    /// <summary>
    /// Mẫu bảng báo giá, chuyển từ src/domain/quoteTemplate.ts; tên cột và công thức giống hệt để workbook
    /// tạo ở bản nào cũng mở được ở bản kia. Bố cục tính từ ô neo: hàng 0 tiêu đề, hàng 1..10 khối thông
    /// tin (nhãn ở cột 0, giá trị ở cột 3), một hàng trống, tiêu đề cột của Table, N dòng công tác, dòng tổng.
    /// </summary>
    public static class QuoteTemplate
    {
        public const string Title = "BẢNG BÁO GIÁ";
        public const string LineIdHeader = "Mã dòng";
        public const string TotalLabel = "Tổng cộng";
        public const int InfoValueColumnOffset = 3;
        public const int DefaultInitialRows = 5;
        public const int MaxInitialRows = 500;

        /// <summary>9 cột bắt buộc của mẫu.</summary>
        public static readonly IReadOnlyList<QuoteColumn> Columns = new[]
        {
            new QuoteColumn(QuoteColumnKey.Stt, "STT", 36),
            new QuoteColumn(QuoteColumnKey.Code, "Mã công tác", 80),
            new QuoteColumn(QuoteColumnKey.Group, "Nhóm công tác", 100),
            new QuoteColumn(QuoteColumnKey.Description, "Nội dung công việc", 260, wrap: true),
            new QuoteColumn(QuoteColumnKey.Unit, "Đơn vị tính", 60),
            new QuoteColumn(QuoteColumnKey.Quantity, "Khối lượng", 70, "General"),
            new QuoteColumn(QuoteColumnKey.UnitPrice, "Đơn giá", 90, "#,##0"),
            new QuoteColumn(QuoteColumnKey.Amount, "Thành tiền", 100, "#,##0"),
            new QuoteColumn(QuoteColumnKey.Notes, "Ghi chú", 120, wrap: true),
        };

        /// <summary>Cột mở rộng từ bản 1.11.0: bảng cũ có thể không có; nhận theo tên cột, chỉ dùng khi có.</summary>
        public static readonly IReadOnlyList<QuoteColumn> ExtensionColumns = new[]
        {
            new QuoteColumn(QuoteColumnKey.MaterialPrice, "Đơn giá vật liệu", 80, "#,##0"),
            new QuoteColumn(QuoteColumnKey.LaborPrice, "Đơn giá nhân công", 80, "#,##0"),
            new QuoteColumn(QuoteColumnKey.MachinePrice, "Đơn giá máy", 80, "#,##0"),
            new QuoteColumn(QuoteColumnKey.OtherPrice, "Đơn giá khác", 80, "#,##0"),
            new QuoteColumn(QuoteColumnKey.LineId, LineIdHeader, 60, hidden: true),
        };

        private static QuoteColumn Column(QuoteColumnKey key) => Columns.Concat(ExtensionColumns).First(c => c.Key == key);

        /// <summary>Thứ tự cột của bảng tạo mới.</summary>
        public static readonly IReadOnlyList<QuoteColumn> TemplateColumns = new[]
        {
            QuoteColumnKey.Stt, QuoteColumnKey.Code, QuoteColumnKey.Group, QuoteColumnKey.Description, QuoteColumnKey.Unit,
            QuoteColumnKey.Quantity, QuoteColumnKey.MaterialPrice, QuoteColumnKey.LaborPrice, QuoteColumnKey.MachinePrice,
            QuoteColumnKey.OtherPrice, QuoteColumnKey.UnitPrice, QuoteColumnKey.Amount, QuoteColumnKey.Notes, QuoteColumnKey.LineId,
        }.Select(Column).ToArray();

        public static readonly IReadOnlyList<string> InfoLabels = new[]
        {
            "Đơn vị lập:", "Người lập:", "Khách hàng:", "Dự án:", "Địa điểm:",
            "Hạng mục/gói thầu:", "Mã báo giá:", "Ngày lập:", "Phiên bản:", "Hiệu lực đến:",
        };

        private static readonly int HeaderRowOffset = 1 + InfoLabels.Count + 1;

        public static string HeaderOf(QuoteColumnKey key) => Column(key).Header;

        public static string BreakdownHeader(Library.ResourceType type) => HeaderOf(BreakdownColumn(type));

        public static QuoteColumnKey BreakdownColumn(Library.ResourceType type) =>
            type == Library.ResourceType.Material ? QuoteColumnKey.MaterialPrice
            : type == Library.ResourceType.Labor ? QuoteColumnKey.LaborPrice
            : type == Library.ResourceType.Machine ? QuoteColumnKey.MachinePrice
            : QuoteColumnKey.OtherPrice;

        /// <summary>Cột mở rộng chưa có trong bảng (bảng cũ), theo thứ tự cần thêm.</summary>
        public static List<QuoteColumn> MissingExtensionColumns(IReadOnlyCollection<string> headers) =>
            ExtensionColumns.Where(c => !headers.Contains(c.Header)).ToList();

        private static string ThisRow(QuoteColumnKey key) => $"[@[{HeaderOf(key)}]]";

        /// <summary>Công thức cột STT: tự đánh số, người dùng có thể gõ đè.</summary>
        public static string SttFormula(string tableName) => $"=ROW()-ROW({tableName}[#Headers])";

        /// <summary>
        /// Công thức Thành tiền: trống khi thiếu khối lượng hoặc đơn giá, không đổi lỗi thành 0. Làm tròn (nếu
        /// có quy tắc) bằng hàm Excel, ở cấp từng dòng.
        /// </summary>
        public static string AmountFormula(RoundingRule rule)
        {
            var quantity = ThisRow(QuoteColumnKey.Quantity);
            var unitPrice = ThisRow(QuoteColumnKey.UnitPrice);
            return $"=IF(OR({quantity}=\"\",{unitPrice}=\"\"),\"\",{Rounding.Wrap($"{quantity}*{unitPrice}", rule)})";
        }

        /// <summary>Công thức tổng Thành tiền: SUBTOTAL(109, …) bỏ qua dòng bị lọc ẩn.</summary>
        public static string AmountTotalFormula(string tableName) => $"=SUBTOTAL(109,{tableName}[{HeaderOf(QuoteColumnKey.Amount)}])";

        /// <summary>Dòng tổng của bảng tạo mới, theo thứ tự TemplateColumns.</summary>
        public static string[] TemplateTotalRow(string tableName) => TemplateColumns.Select(c =>
            c.Key == QuoteColumnKey.Description ? TotalLabel
            : c.Key == QuoteColumnKey.Amount ? AmountTotalFormula(tableName)
            : "").ToArray();

        public static int ClampInitialRows(double requested)
        {
            if (double.IsNaN(requested) || double.IsInfinity(requested))
            {
                return DefaultInitialRows;
            }
            return (int)Math.Min(MaxInitialRows, Math.Max(1, Math.Floor(requested)));
        }

        public static QuoteLayout BuildLayout(int initialRows)
        {
            var dataRowCount = ClampInitialRows(initialRows);
            var firstDataRow = HeaderRowOffset + 1;
            return new QuoteLayout
            {
                RowCount = HeaderRowOffset + 1 + dataRowCount + 1,
                ColumnCount = TemplateColumns.Count,
                InfoRows = InfoLabels.Select((label, i) => new InfoRow(1 + i, label)).ToList(),
                HeaderRow = HeaderRowOffset,
                FirstDataRow = firstDataRow,
                DataRowCount = dataRowCount,
                TotalRow = firstDataRow + dataRowCount,
            };
        }

        /// <summary>
        /// Bảng dùng được khi có đủ 9 cột mẫu, mỗi tên đúng một lần. Người dùng được thêm cột riêng hoặc đổi
        /// thứ tự cột.
        /// </summary>
        public static bool HasQuoteHeaders(IReadOnlyList<string> headers) =>
            Columns.All(c => headers.Count(h => h == c.Header) == 1);

        /// <summary>
        /// Sắp một dòng theo thứ tự Columns sang thứ tự cột thực tế của bảng. Cột không có giá trị nhận null =
        /// không ghi, để Excel tự điền nếu là cột tính toán. Trả về null nếu thiếu cột mẫu.
        /// </summary>
        public static object?[]? AlignRow(IReadOnlyList<string> headers, IReadOnlyList<object> templateRow, IReadOnlyDictionary<string, object>? extras = null)
        {
            if (!HasQuoteHeaders(headers) || templateRow.Count != Columns.Count)
            {
                return null;
            }
            return headers.Select(header =>
            {
                for (var i = 0; i < Columns.Count; i++)
                {
                    if (Columns[i].Header == header)
                    {
                        return templateRow[i];
                    }
                }
                return extras != null && extras.TryGetValue(header, out var value) ? value : null;
            }).ToArray();
        }

        private static readonly QuoteColumnKey[] InputColumnKeys = Columns.Select(c => c.Key)
            .Where(k => k != QuoteColumnKey.Stt && k != QuoteColumnKey.Amount).ToArray();

        /// <summary>Dòng trống = mọi cột nhập liệu của mẫu đều trống; cột người dùng tự thêm không được xét.</summary>
        public static bool[] BlankRowFlags(IReadOnlyList<string> headers, IReadOnlyList<IReadOnlyList<object?>> formulas)
        {
            var columns = InputColumnKeys.Select(k => headers.ToList().IndexOf(HeaderOf(k))).Where(i => i >= 0).ToArray();
            return formulas.Select(row => columns.All(i => Sheet.IsBlank(row[i]))).ToArray();
        }

        /// <summary>
        /// Dòng trống sẽ được ghi vào thay vì chèn dòng mới. Cuối bảng: dòng đầu của khối dòng trống liền nhau ở
        /// cuối. Dưới dòng chọn (insertIndex = dòng chọn + 1): dòng chọn nếu trống, không thì dòng ngay dưới nếu
        /// trống. null = chèn dòng mới.
        /// </summary>
        public static int? BlankRowToFill(IReadOnlyList<bool> flags, int? insertIndex)
        {
            if (insertIndex != null)
            {
                var index = insertIndex.Value;
                if (index > 0 && flags[index - 1])
                {
                    return index - 1;
                }
                return index < flags.Count && flags[index] ? index : (int?)null;
            }
            var start = flags.Count;
            while (start > 0 && flags[start - 1])
            {
                start--;
            }
            return start < flags.Count ? start : (int?)null;
        }

        /// <summary>Quy tắc làm tròn suy từ công thức mẫu đọc trên sheet; không khớp mẫu nào → null.</summary>
        public static RoundingRule? InferRule(object? formula, Func<RoundingRule, string> build, string ownTable) =>
            Rounding.AllRules.FirstOrDefault(rule => FormulaText.Same(formula, build(rule), ownTable));
    }

    /// <summary>Địa chỉ ô kiểu A1 và các hàm nhỏ về ô đọc từ sheet. Chỉ số hàng/cột tính từ 0.</summary>
    public static class Sheet
    {
        public const int MaxRows = 1_048_576;
        public const int MaxColumns = 16_384;

        public static bool IsBlank(object? value) => value == null || value is string s && s == "";

        /// <summary>Số trong ô (Excel lưu double) sang decimal; không phải số hoặc quá lớn → null.</summary>
        public static decimal? ToDecimal(object? value)
        {
            if (!(value is double d) || double.IsNaN(d) || double.IsInfinity(d) || Math.Abs(d) >= 7.9e28)
            {
                return null;
            }
            return Numbers.DecimalMath.Normalize((decimal)d);
        }

        /// <summary>Số trong ô bằng số add-in lưu (so theo 15 chữ số có nghĩa như Excel hiển thị).</summary>
        public static bool SameNumber(object? cell, decimal value) => ToDecimal(cell) == value;

        public static string CellAddress(int rowIndex, int columnIndex) => $"{Exchange.Source.ColumnToLetters(columnIndex)}{rowIndex + 1}";

        public static string RangeAddress(int rowIndex, int columnIndex, int rowCount, int columnCount)
        {
            var start = CellAddress(rowIndex, columnIndex);
            return rowCount == 1 && columnCount == 1 ? start : $"{start}:{CellAddress(rowIndex + rowCount - 1, columnIndex + columnCount - 1)}";
        }

        public static string QualifiedAddress(string sheetName, string address) => $"'{sheetName.Replace("'", "''")}'!{address}";

        public static bool FitsInSheet(int rowIndex, int columnIndex, int rowCount, int columnCount) =>
            rowIndex + rowCount <= MaxRows && columnIndex + columnCount <= MaxColumns;
    }
}
