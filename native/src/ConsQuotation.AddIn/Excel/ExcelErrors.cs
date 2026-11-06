using System;
using System.Globalization;
using System.Runtime.InteropServices;
using ConsQuotation.Core.Quotation;

namespace ConsQuotation.Excel
{
    /// <summary>
    /// Đổi lỗi COM thành thông báo tiếng Việt có hướng khắc phục, chuyển từ officeErrors.ts. Chỉ dùng mã lỗi,
    /// không đưa nội dung ô hay dữ liệu báo giá vào thông báo.
    /// </summary>
    internal static class ExcelErrors
    {
        private const int ExcelGeneric = unchecked((int)0x800A03EC);
        private const int CallRejected = unchecked((int)0x80010001);
        private const int ExcelBusy = unchecked((int)0x800AC472);

        /// <summary>Thao tác ghi thất bại khi đã ghi dở: COM ghi từng ô nên một phần có thể đã vào sheet.</summary>
        public const string PartialWriteHint = "Một phần thay đổi có thể đã được ghi trước khi lỗi xảy ra và Ctrl+Z không hoàn tác được thao tác của add-in. Hãy kiểm tra vùng liên quan trên sheet, rồi mở thẻ Công tác để kiểm tra trước khi thử lại.";

        public static string Describe(Exception error)
        {
            if (error is COMException com)
            {
                var code = "0x" + com.ErrorCode.ToString("X8", CultureInfo.InvariantCulture);
                switch (com.ErrorCode)
                {
                    case ExcelGeneric:
                        return $"Excel từ chối thao tác. Sheet hoặc workbook có thể đang được bảo vệ, hoặc vùng ghi đụng vào bảng khác hay ô gộp bên dưới. (Mã lỗi: {code})";
                    case CallRejected:
                    case ExcelBusy:
                        return $"Excel đang bận (có thể đang sửa một ô hoặc mở hộp thoại). Nhấn Enter hoặc Esc trong Excel rồi thử lại. (Mã lỗi: {code})";
                    default:
                        return $"Excel báo lỗi khi thực hiện thao tác. (Mã lỗi: {code})";
                }
            }
            return error.Message;
        }

        public static string DescribeWrite(Exception error)
        {
            var text = Describe(error);
            // Lỗi kiểm tra của add-in xảy ra trước khi ghi nên chưa có gì được ghi.
            return error is COMException ? $"{text} {PartialWriteHint}" : text;
        }

        /// <summary>Lỗi "dữ liệu vừa đổi": không phải sự cố, giao diện báo để người dùng xem lại.</summary>
        public static bool IsChange(Exception error) => error is TargetChangedException || error is RecordChangedException;
    }
}
