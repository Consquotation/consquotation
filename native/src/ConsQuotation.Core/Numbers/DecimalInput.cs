using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace ConsQuotation.Core.Numbers
{
    /// <summary>Kết quả đọc số người dùng gõ: Ok với Value (null = để trống) hoặc lỗi kèm thông báo.</summary>
    public sealed class DecimalParse
    {
        private DecimalParse(bool ok, decimal? value, string message)
        {
            Ok = ok;
            Value = value;
            Message = message;
        }

        public bool Ok { get; }
        public decimal? Value { get; }
        public string Message { get; }

        public static DecimalParse Success(decimal? value) => new DecimalParse(true, value, "");
        public static DecimalParse Failure(string message) => new DecimalParse(false, null, message);
    }

    public static class DecimalInput
    {
        private static readonly Regex Spaces = new Regex(@"\s+");
        private static readonly Regex Shape = new Regex(@"^-?\d+([.,]\d+)?$");

        public const string InvalidMessage =
            "Số không hợp lệ. Chỉ dùng chữ số và tối đa một dấu thập phân (. hoặc ,), không dùng dấu phân cách hàng nghìn.";

        /// <summary>
        /// Đọc số người dùng gõ. Chấp nhận một dấu thập phân là "." hoặc ","; không chấp nhận dấu phân cách
        /// hàng nghìn vì "1.234" có thể là 1,234 hoặc 1234 tùy locale. Rỗng → Value = null.
        /// </summary>
        public static DecimalParse Parse(string text)
        {
            var trimmed = Spaces.Replace(text.Trim(), "");
            if (trimmed == "")
            {
                return DecimalParse.Success(null);
            }
            if (!Shape.IsMatch(trimmed))
            {
                return DecimalParse.Failure(InvalidMessage);
            }
            try
            {
                return DecimalParse.Success(decimal.Parse(trimmed.Replace(',', '.'), NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture));
            }
            catch (OverflowException)
            {
                return DecimalParse.Failure("Số quá lớn.");
            }
        }

        /// <summary>Số → chữ để điền lại vào ô nhập (dấu chấm thập phân, bỏ số 0 thừa ở cuối).</summary>
        public static string Format(decimal value) => DecimalMath.Normalize(value).ToString(CultureInfo.InvariantCulture);
    }
}
