using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using ConsQuotation.Core.Exchange;
using ConsQuotation.Core.Library;

namespace ConsQuotation.Core.Quotation
{
    public enum InfoKey
    {
        Issuer,
        PreparedBy,
        Customer,
        Project,
        Location,
        Package,
        QuoteNo,
        Date,
        Version,
        ValidUntil,
    }

    public sealed class InfoField
    {
        public InfoField(InfoKey key, string label, bool isDate, bool addedLater)
        {
            Key = key;
            Label = label;
            IsDate = isDate;
            AddedLater = addedLater;
        }

        public InfoKey Key { get; }
        public string Label { get; }
        public bool IsDate { get; }
        /// <summary>Mục thêm ở bản 1.11.0: sheet tạo trước đó không có nhãn này, không coi là khối thông tin hỏng.</summary>
        public bool AddedLater { get; }
    }

    /// <summary>Ô giá trị của một mục, đọc trực tiếp từ sheet.</summary>
    public sealed class InfoCell
    {
        public InfoKey Key { get; set; }
        public bool Found { get; set; }
        public string Address { get; set; } = "";
        public object? Value { get; set; }
        public string Text { get; set; } = "";
        public string NumberFormat { get; set; } = "General";
    }

    public enum InfoWriteKind
    {
        Clear,
        Text,
        Date,
    }

    public sealed class InfoWrite
    {
        public InfoKey Key { get; set; }
        public InfoWriteKind Kind { get; set; }
        public string Text { get; set; } = "";
        public int Serial { get; set; }
    }

    public sealed class InfoError
    {
        public InfoError(InfoKey key, string message)
        {
            Key = key;
            Message = message;
        }

        public InfoKey Key { get; }
        public string Message { get; }
    }

    public sealed class InfoPlan
    {
        public List<InfoWrite> Writes { get; } = new List<InfoWrite>();
        public List<InfoError> Errors { get; } = new List<InfoError>();
    }

    public sealed class InfoSummary
    {
        public int Filled { get; set; }
        public int Total { get; set; }
        public List<InfoKey> MissingLabels { get; set; } = new List<InfoKey>();
        /// <summary>Ngày hiệu lực đã qua (dd/mm/yyyy); null nếu chưa hết hạn.</summary>
        public string? Expired { get; set; }
    }

    /// <summary>
    /// Khối "Thông tin báo giá" phía trên bảng, chuyển từ src/domain/quoteInfo.ts. Nguồn sự thật là chính
    /// sheet: add-in tìm nhãn mỗi lần đọc. Mọi mục đều tùy chọn. Ngày ghi thành ngày thật của Excel.
    /// </summary>
    public static class QuoteInfo
    {
        /// <summary>Đuôi ";@" giữ định dạng cố định; "dd/mm/yyyy" trơn bị Excel đổi thành ngày ngắn của hệ thống.</summary>
        public const string DateFormat = "dd/mm/yyyy;@";
        /// <summary>Số dòng phía trên tiêu đề bảng được dò tìm nhãn.</summary>
        public const int ScanRows = 15;

        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");
        private static readonly InfoKey[] Keys = (InfoKey[])Enum.GetValues(typeof(InfoKey));

        public static readonly IReadOnlyList<InfoField> Fields = QuoteTemplate.InfoLabels.Select((label, i) => new InfoField(
            Keys[i],
            label,
            Keys[i] == InfoKey.Date || Keys[i] == InfoKey.ValidUntil,
            Keys[i] == InfoKey.PreparedBy || Keys[i] == InfoKey.Location || Keys[i] == InfoKey.Package)).ToArray();

        public static bool LabelMatches(object? cellValue, string label)
        {
            string Normalize(string s)
            {
                var trimmed = s.Trim();
                return (trimmed.EndsWith(":") ? trimmed.Substring(0, trimmed.Length - 1) : trimmed).Trim().ToLower(Vi);
            }
            return cellValue is string text && Normalize(text) == Normalize(label);
        }

        /// <summary>Giá trị hiển thị trong form: ngày → dd/mm/yyyy; còn lại → chữ Excel hiển thị.</summary>
        public static string DisplayValue(InfoField field, InfoCell cell)
        {
            if (field.IsDate && cell.Value is double serial && Cells.IsDateNumberFormat(cell.NumberFormat))
            {
                return Dates.FormatIsoDate(Cells.ExcelSerialToIso(serial));
            }
            if (cell.Value is string text)
            {
                return text;
            }
            return Sheet.IsBlank(cell.Value) ? "" : cell.Text;
        }

        /// <summary>ISO → số ngày Excel (hệ 1900), cho ngày từ 01/03/1900.</summary>
        public static int IsoToExcelSerial(string iso) =>
            (int)Math.Round((DateTime.ParseExact(iso, "yyyy-MM-dd", CultureInfo.InvariantCulture) - new DateTime(1899, 12, 30)).TotalDays);

        /// <summary>
        /// Từ giá trị người dùng nhập → các thay đổi cần ghi (chỉ mục đã đổi so với sheet). Ngày: dd/mm/yyyy
        /// hoặc yyyy-mm-dd; "Hiệu lực đến" không được trước "Ngày lập".
        /// </summary>
        public static InfoPlan PlanWrites(IReadOnlyDictionary<InfoKey, string> input, IReadOnlyDictionary<InfoKey, string> current)
        {
            var plan = new InfoPlan();
            var isoOf = new Dictionary<InfoKey, string>();
            string Get(IReadOnlyDictionary<InfoKey, string> values, InfoKey key) => values.TryGetValue(key, out var v) ? v.Trim() : "";
            foreach (var field in Fields)
            {
                var text = Get(input, field.Key);
                if (field.IsDate && text != "")
                {
                    var iso = Cells.ParseDateText(text);
                    if (iso == null)
                    {
                        plan.Errors.Add(new InfoError(field.Key, "Ngày không hợp lệ. Dùng dạng dd/mm/yyyy."));
                        continue;
                    }
                    isoOf[field.Key] = iso;
                }
                if (text == Get(current, field.Key))
                {
                    continue;
                }
                if (text == "")
                {
                    plan.Writes.Add(new InfoWrite { Key = field.Key, Kind = InfoWriteKind.Clear });
                }
                else if (field.IsDate)
                {
                    plan.Writes.Add(new InfoWrite { Key = field.Key, Kind = InfoWriteKind.Date, Serial = IsoToExcelSerial(isoOf[field.Key]) });
                }
                else
                {
                    plan.Writes.Add(new InfoWrite { Key = field.Key, Kind = InfoWriteKind.Text, Text = text });
                }
            }
            if (isoOf.TryGetValue(InfoKey.Date, out var date) && isoOf.TryGetValue(InfoKey.ValidUntil, out var until) && string.CompareOrdinal(until, date) < 0)
            {
                plan.Errors.Add(new InfoError(InfoKey.ValidUntil, "Hiệu lực đến phải sau hoặc bằng ngày lập."));
            }
            return plan;
        }

        public static InfoSummary Summarize(IReadOnlyList<InfoCell> cells, string today)
        {
            InfoField Field(InfoKey key) => Fields.First(f => f.Key == key);
            string Display(InfoCell cell) => DisplayValue(Field(cell.Key), cell).Trim();
            string? expired = null;
            var validUntil = cells.FirstOrDefault(c => c.Key == InfoKey.ValidUntil);
            if (validUntil?.Found == true)
            {
                var iso = Cells.ParseDateText(Display(validUntil));
                if (iso != null && string.CompareOrdinal(iso, today) < 0)
                {
                    expired = Dates.FormatIsoDate(iso);
                }
            }
            return new InfoSummary
            {
                Filled = cells.Count(c => c.Found && Display(c) != ""),
                Total = Fields.Count,
                MissingLabels = cells.Where(c => !c.Found && !Field(c.Key).AddedLater).Select(c => c.Key).ToList(),
                Expired = expired,
            };
        }
    }
}
