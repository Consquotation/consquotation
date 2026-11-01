using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace ConsQuotation.Core.Library
{
    /// <summary>Tình trạng hiệu lực tại một ngày.</summary>
    public enum Validity
    {
        /// <summary>Không ghi ngày hiệu lực (không tự suy diễn là còn hay hết hạn).</summary>
        NoDates,
        NotYetEffective,
        Active,
        Expired,
    }

    /// <summary>
    /// Ngày hiệu lực dạng "YYYY-MM-DD"; so sánh chuỗi là đủ vì định dạng cố định độ dài.
    /// "Hôm nay" luôn được truyền vào để test được và không phụ thuộc giờ hệ thống.
    /// </summary>
    public static class Dates
    {
        private static readonly Regex IsoDate = new Regex(@"^\d{4}-\d{2}-\d{2}$");

        public static bool IsIsoDate(string value)
        {
            if (!IsoDate.IsMatch(value))
            {
                return false;
            }
            return DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
        }

        /// <summary>Ngày theo giờ máy, dạng YYYY-MM-DD.</summary>
        public static string TodayIso(DateTime now) => now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        /// <summary>"YYYY-MM-DD" → "dd/mm/yyyy"; null hoặc sai định dạng → "".</summary>
        public static string FormatIsoDate(string? value)
        {
            if (string.IsNullOrEmpty(value) || !IsIsoDate(value!))
            {
                return "";
            }
            var parts = value!.Split('-');
            return $"{parts[2]}/{parts[1]}/{parts[0]}";
        }

        /// <summary>Thời điểm ISO (có giờ) → "dd/mm/yyyy hh:mm" theo giờ máy; chuỗi không hợp lệ giữ nguyên.</summary>
        public static string FormatDateTime(string iso)
        {
            if (!DateTimeOffset.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var at))
            {
                return iso;
            }
            return at.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
        }

        public static Validity ValidityOn(string? effectiveFrom, string? effectiveTo, string today)
        {
            if (string.IsNullOrEmpty(effectiveFrom) && string.IsNullOrEmpty(effectiveTo))
            {
                return Validity.NoDates;
            }
            if (!string.IsNullOrEmpty(effectiveFrom) && string.CompareOrdinal(today, effectiveFrom) < 0)
            {
                return Validity.NotYetEffective;
            }
            if (!string.IsNullOrEmpty(effectiveTo) && string.CompareOrdinal(today, effectiveTo) > 0)
            {
                return Validity.Expired;
            }
            return Validity.Active;
        }

        /// <summary>Hai khoảng hiệu lực (null = không giới hạn phía đó) có giao nhau không.</summary>
        public static bool PeriodsOverlap(string? aFrom, string? aTo, string? bFrom, string? bTo)
        {
            var aStart = string.IsNullOrEmpty(aFrom) ? "0000-01-01" : aFrom!;
            var aEnd = string.IsNullOrEmpty(aTo) ? "9999-12-31" : aTo!;
            var bStart = string.IsNullOrEmpty(bFrom) ? "0000-01-01" : bFrom!;
            var bEnd = string.IsNullOrEmpty(bTo) ? "9999-12-31" : bTo!;
            return string.CompareOrdinal(aStart, bEnd) <= 0 && string.CompareOrdinal(bStart, aEnd) <= 0;
        }
    }
}
