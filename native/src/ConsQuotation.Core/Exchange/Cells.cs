using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;

namespace ConsQuotation.Core.Exchange
{
    /// <summary>
    /// Một ô nguồn. Value: string (CSV, JSON), double (ô số Excel), decimal (số JSON), bool hoặc null.
    /// Text: chữ Excel hiển thị (giữ "007" khi ô số định dạng "000"). Date: ngày ISO nếu ô Excel định dạng ngày.
    /// </summary>
    public sealed class RawCell
    {
        public RawCell(object? value, string? text = null, string? date = null)
        {
            Value = value;
            Text = text;
            Date = date;
        }

        public object? Value { get; }
        public string? Text { get; }
        public string? Date { get; }
    }

    /// <summary>Kết quả đọc một ô: giá trị, hoặc thông báo lỗi.</summary>
    public readonly struct CellParse<T>
    {
        private CellParse(bool ok, T value, string message)
        {
            Ok = ok;
            Value = value;
            Message = message;
        }

        public bool Ok { get; }
        public T Value { get; }
        public string Message { get; }

        public static CellParse<T> Success(T value) => new CellParse<T>(true, value, "");
        public static CellParse<T> Failure(string message) => new CellParse<T>(false, default!, message);
    }

    /// <summary>
    /// Đọc giá trị ô từ file nhập (Excel, CSV, JSON) theo kiểu của trường (prompts/09), chuyển từ cells.ts.
    /// Giữ chữ tiếng Việt (NFC), mã dạng chữ (không mất số 0 đầu), số thập phân và ngày. Giá trị mơ hồ
    /// bị báo lỗi thay vì tự hiểu.
    /// </summary>
    public static class Cells
    {
        private const string DateHint = "Dùng dạng dd/mm/yyyy hoặc yyyy-mm-dd.";

        private static readonly Regex IsoDate = new Regex(@"^\d{4}-\d{2}-\d{2}$");
        private static readonly Regex DmyDate = new Regex(@"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$");

        public static bool IsBlank(RawCell? cell) =>
            cell == null || cell.Value == null || (cell.Value is string s && s.Trim() == "");

        /// <summary>Chữ của số/logic giống JavaScript String(x): 1500, 1.5, true.</summary>
        private static string ScalarText(object value) => value switch
        {
            bool b => b ? "true" : "false",
            decimal d => DecimalMath.Normalize(d).ToString(CultureInfo.InvariantCulture),
            double d => d.ToString("R", CultureInfo.InvariantCulture),
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString() ?? "",
        };

        public static string ParseText(RawCell? cell)
        {
            if (cell?.Value == null)
            {
                return "";
            }
            if (cell.Value is string s)
            {
                return s.Normalize(NormalizationForm.FormC).Trim();
            }
            // Ô số/logic trong Excel: lấy đúng chữ đang hiển thị (ví dụ mã "007").
            return (cell.Text ?? ScalarText(cell.Value)).Normalize(NormalizationForm.FormC).Trim();
        }

        public static CellParse<decimal?> ParseNumber(RawCell? cell)
        {
            if (IsBlank(cell))
            {
                return CellParse<decimal?>.Success(null);
            }
            switch (cell!.Value)
            {
                case decimal d:
                    return CellParse<decimal?>.Success(d);
                case int i:
                    return CellParse<decimal?>.Success(i);
                case long l:
                    return CellParse<decimal?>.Success(l);
                case double d:
                    if (double.IsNaN(d) || double.IsInfinity(d) || Math.Abs(d) >= 7.9e28)
                    {
                        return CellParse<decimal?>.Failure("Số không hợp lệ.");
                    }
                    // Excel lưu số dạng double; đổi sang decimal theo 15 chữ số có nghĩa như Excel hiển thị.
                    return CellParse<decimal?>.Success(DecimalMath.Normalize((decimal)d));
                case bool _:
                    return CellParse<decimal?>.Failure("Cần một số, không phải TRUE/FALSE.");
            }
            var parsed = DecimalInput.Parse(ParseText(cell));
            return parsed.Ok ? CellParse<decimal?>.Success(parsed.Value) : CellParse<decimal?>.Failure(parsed.Message);
        }

        /// <summary>Định dạng số của Excel có phải định dạng ngày (có d hoặc y ngoài phần chữ/ngoặc)?</summary>
        public static bool IsDateNumberFormat(string format)
        {
            var stripped = Regex.Replace(format, "\"[^\"]*\"", "");
            stripped = Regex.Replace(stripped, @"\[[^\]]*\]", "");
            stripped = Regex.Replace(stripped, @"\\.", "");
            return Regex.IsMatch(stripped, "[dy]", RegexOptions.IgnoreCase);
        }

        /// <summary>
        /// Số ngày Excel (hệ 1900) → "YYYY-MM-DD", bỏ phần giờ. Excel coi 1900 là năm nhuận (ngày 60 =
        /// 29/02/1900 không có thật) nên ngày đó không hợp lệ.
        /// </summary>
        public static string? ExcelSerialToIso(double serial)
        {
            if (double.IsNaN(serial) || double.IsInfinity(serial) || serial < 1 || serial >= 2958466)
            {
                return null;
            }
            var day = (int)Math.Floor(serial);
            if (day == 60)
            {
                return null;
            }
            var epoch = day > 60 ? new DateTime(1899, 12, 30) : new DateTime(1899, 12, 31);
            return epoch.AddDays(day).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        /// <summary>Ngày chữ: "2026-06-30" hoặc "30/06/2026" (ngày trước tháng, năm 4 chữ số).</summary>
        public static string? ParseDateText(string text)
        {
            var trimmed = text.Trim();
            if (IsoDate.IsMatch(trimmed))
            {
                return Dates.IsIsoDate(trimmed) ? trimmed : null;
            }
            var dmy = DmyDate.Match(trimmed);
            if (dmy.Success)
            {
                var iso = $"{dmy.Groups[3].Value}-{dmy.Groups[2].Value.PadLeft(2, '0')}-{dmy.Groups[1].Value.PadLeft(2, '0')}";
                return Dates.IsIsoDate(iso) ? iso : null;
            }
            return null;
        }

        public static CellParse<string?> ParseDate(RawCell? cell)
        {
            if (IsBlank(cell))
            {
                return CellParse<string?>.Success(null);
            }
            if (!string.IsNullOrEmpty(cell!.Date))
            {
                return CellParse<string?>.Success(cell.Date);
            }
            if (cell.Value is string s)
            {
                var iso = ParseDateText(s);
                return iso != null ? CellParse<string?>.Success(iso) : CellParse<string?>.Failure($"Ngày không hợp lệ. {DateHint}");
            }
            // Số không mang định dạng ngày: không đoán là ngày.
            return CellParse<string?>.Failure($"Ngày không hợp lệ. {DateHint}");
        }

        private static string EnumKey<TEnum>(TEnum value) where TEnum : struct
        {
            var name = value.ToString()!;
            return char.ToLowerInvariant(name[0]) + name.Substring(1);
        }

        private static CellParse<TEnum?> ParseLabel<TEnum>(RawCell? cell, IReadOnlyDictionary<TEnum, string> labels, string what)
            where TEnum : struct
        {
            var text = ParseText(cell);
            if (text == "")
            {
                return CellParse<TEnum?>.Success(null);
            }
            var normalized = Search.NormalizeForSearch(text);
            foreach (var pair in labels)
            {
                if (normalized == EnumKey(pair.Key) || normalized == Search.NormalizeForSearch(pair.Value))
                {
                    return CellParse<TEnum?>.Success(pair.Key);
                }
            }
            return CellParse<TEnum?>.Failure($"{what} \"{text}\" không hợp lệ. Dùng một trong: {string.Join(", ", labels.Values)}.");
        }

        public static CellParse<ResourceType?> ParseResourceType(RawCell? cell) => ParseLabel(cell, ExchangeSchema.ResourceTypeLabels, "Loại");

        public static CellParse<PriceStatus?> ParsePriceStatus(RawCell? cell) => ParseLabel(cell, ExchangeSchema.PriceStatusLabels, "Trạng thái");

        public static CellParse<NormStatus?> ParseNormStatus(RawCell? cell) => ParseLabel(cell, ExchangeSchema.NormStatusLabels, "Trạng thái");

        public static CellParse<NormSourceType?> ParseNormSourceType(RawCell? cell) => ParseLabel(cell, ExchangeSchema.NormSourceTypeLabels, "Loại nguồn");

        private enum YesNo
        {
            Yes,
            No,
        }

        private static readonly IReadOnlyDictionary<YesNo, string> YesNoLabels = new Dictionary<YesNo, string>
        {
            [YesNo.Yes] = ExchangeSchema.Yes,
            [YesNo.No] = ExchangeSchema.No,
        };

        /// <summary>"Có"/"Không" (không cần dấu), hoặc ô đúng/sai của Excel. Trống = null.</summary>
        public static CellParse<bool?> ParseYesNo(RawCell? cell)
        {
            if (cell?.Value is bool b)
            {
                return CellParse<bool?>.Success(b);
            }
            var parsed = ParseLabel(cell, YesNoLabels, "Giá trị Có/Không");
            if (!parsed.Ok)
            {
                return CellParse<bool?>.Failure(parsed.Message);
            }
            return CellParse<bool?>.Success(parsed.Value == null ? (bool?)null : parsed.Value == YesNo.Yes);
        }
    }
}
