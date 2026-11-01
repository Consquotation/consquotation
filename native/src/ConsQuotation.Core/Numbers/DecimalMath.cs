using System;

namespace ConsQuotation.Core.Numbers
{
    /// <summary>Cùng nghĩa với hàm Excel ROUND, ROUNDUP, ROUNDDOWN.</summary>
    public enum DecimalRoundingMode
    {
        /// <summary>ROUND: 0,5 làm tròn ra xa số 0.</summary>
        Round,
        /// <summary>ROUNDUP: luôn ra xa số 0.</summary>
        RoundUp,
        /// <summary>ROUNDDOWN: luôn về phía số 0.</summary>
        RoundDown,
    }

    /// <summary>
    /// Số học cho bộ máy tính giá. decimal của .NET là số thập phân cơ số 10 (28–29 chữ số có nghĩa):
    /// 0,1 × 3 = 0,3 đúng tuyệt đối, thay cho bộ số học tự viết của bản web (src/domain/pricing/decimal.ts).
    /// </summary>
    public static class DecimalMath
    {
        private static readonly decimal[] Powers = BuildPowers();

        private static decimal[] BuildPowers()
        {
            var powers = new decimal[29];
            powers[0] = 1m;
            for (var i = 1; i < powers.Length; i++)
            {
                powers[i] = powers[i - 1] * 10m;
            }
            return powers;
        }

        /// <summary>Bỏ số 0 thừa ở cuối phần thập phân (1.500 → 1.5) mà không đổi giá trị.</summary>
        public static decimal Normalize(decimal value) => value / 1.0000000000000000000000000000m;

        /// <summary>Số chữ số thập phân sau khi bỏ số 0 thừa.</summary>
        public static int Scale(decimal value) => (decimal.GetBits(Normalize(value))[3] >> 16) & 0xFF;

        /// <summary>
        /// Làm tròn tới <paramref name="digits"/> chữ số thập phân (âm: hàng chục, trăm, nghìn…), cùng nghĩa
        /// với hàm Excel tương ứng.
        /// </summary>
        public static decimal Round(decimal value, int digits, DecimalRoundingMode mode)
        {
            if (digits >= 0)
            {
                if (digits >= 28 || Scale(value) <= digits)
                {
                    return value;
                }
                return Normalize(RoundAtScale(value, digits, mode));
            }
            var factor = Powers[Math.Min(-digits, 28)];
            return Normalize(RoundAtScale(value / factor, 0, mode) * factor);
        }

        private static decimal RoundAtScale(decimal value, int digits, DecimalRoundingMode mode)
        {
            switch (mode)
            {
                case DecimalRoundingMode.Round:
                    return Math.Round(value, digits, MidpointRounding.AwayFromZero);
                case DecimalRoundingMode.RoundUp:
                {
                    var factor = Powers[digits];
                    var scaled = value * factor;
                    var magnitude = Math.Ceiling(Math.Abs(scaled));
                    return Math.Sign(value) * magnitude / factor;
                }
                default:
                {
                    var factor = Powers[digits];
                    return decimal.Truncate(value * factor) / factor;
                }
            }
        }

        /// <summary>Số chữ số của phần nguyên (0 cho |x| &lt; 1).</summary>
        public static int IntegerDigits(decimal value)
        {
            var integer = decimal.Truncate(Math.Abs(value));
            return integer == 0 ? 0 : integer.ToString(System.Globalization.CultureInfo.InvariantCulture).Length;
        }

        /// <summary>Đổi % sang tỷ lệ: 5 → 0,05; 3,3 → 0,033.</summary>
        public static decimal PercentToRate(decimal percent) => Normalize(percent * 0.01m);

        /// <summary>Tỷ lệ → chữ % để điền ô nhập; 0 → "".</summary>
        public static string RateToPercent(decimal rate) => rate == 0 ? "" : DecimalInput.Format(rate * 100m);
    }
}
