using System;
using System.Collections.Generic;
using ConsQuotation.Core.Licensing;

namespace ConsQuotation.SystemUi
{
    /// <summary>Chữ của cửa sổ Hệ thống. Phần cấp phép giữ đúng câu chữ bản web (strings.license.vi.ts).</summary>
    internal static class Sys
    {
        public const string WindowTitle = "Hệ thống";
        public const string TabLicense = "Bản quyền";
        public const string TabSettings = "Cài đặt";
        public const string TabHelp = "Trợ giúp";

        public static string Trial(int daysLeft, string endsOn) => $"Đang dùng thử đủ tính năng: còn {daysLeft} ngày (đến {endsOn}).";
        public static string Expired(string endedOn) => $"Đã hết 30 ngày dùng thử (từ {endedOn}). Gửi yêu cầu cấp phép, hoặc nhập email và mã đã nhận để tiếp tục dùng.";
        public static string Licensed(string email) => $"Đã cấp phép vĩnh viễn cho {email}.";
        public static string LicensedCode(string code) => $"Mã cấp phép: {code}";

        public const string RequestTitle = "Xin cấp phép";
        public static string RequestIntro(string owner) => $"Chọn nơi soạn thư: thư soạn sẵn gửi tới {owner}, bạn chỉ cần bấm Gửi từ hộp thư của mình. Mã cấp phép sẽ được gửi lại cho đúng địa chỉ email gửi thư.";
        public const string ComposeGmail = "Soạn bằng Gmail";
        public const string ComposeOutlook = "Soạn bằng Outlook.com";
        public const string ComposeApp = "Mở ứng dụng thư";
        public const string RequestOpened = "Đã mở trang soạn thư. Nếu không thấy, bấm Sao chép nội dung rồi dán vào hộp thư bạn đang dùng, gửi tới địa chỉ ở trên.";
        public const string OpenFailed = "Không mở được. Hãy bấm Sao chép nội dung rồi dán vào hộp thư bạn đang dùng.";
        public const string RequestText = "Nội dung yêu cầu";
        public const string Copy = "Sao chép nội dung";
        public const string Copied = "Đã sao chép.";
        public const string CopyFailed = "Không sao chép được; hãy chọn nội dung trong ô và sao chép thủ công.";
        public static string MailText(LicenseMail mail) => $"Tới: {mail.To}\r\nTiêu đề: {mail.Subject}\r\n\r\n{mail.Body.Replace("\n", "\r\n")}";

        public const string ActivateTitle = "Kích hoạt";
        public const string ActivateIntro = "Nhập đúng email đã gửi yêu cầu và mã 20 ký tự trong thư trả lời. Trên máy khác, nhập lại cùng email và mã một lần.";
        public const string Email = "Email";
        public const string Code = "Mã cấp phép (20 ký tự)";
        public const string Activate = "Kích hoạt";
        public const string Activating = "Đang kiểm tra…";
        public const string Activated = "Đã kích hoạt. Cảm ơn bạn!";
        public const string ActivateSaveFailed = "Mã hợp lệ nhưng không lưu được trên máy này (ổ đĩa đầy hoặc không có quyền ghi). Hãy kiểm tra rồi kích hoạt lại.";

        public static string ActivateError(ActivateFailure failure)
        {
            switch (failure)
            {
                case ActivateFailure.InvalidEmail:
                    return "Email không hợp lệ.";
                case ActivateFailure.InvalidCode:
                    return "Mã phải gồm đúng 20 ký tự chữ và số (không có 0, O, 1, I, L). Kiểm tra lại mã trong thư.";
                case ActivateFailure.NotFound:
                    return "Email và mã không khớp với danh sách cấp phép. Kiểm tra lại email (đúng địa chỉ đã gửi yêu cầu) và mã. Nếu vừa được cấp, chờ vài phút rồi thử lại.";
                default:
                    return "Không tải được danh sách cấp phép (cần kết nối Internet). Kiểm tra mạng rồi thử lại.";
            }
        }

        public const string BackupTitle = "Sao lưu thư viện";
        public const string BackupIntro = "Báo giá nằm trong file Excel nên vẫn mở, sửa, in bằng Excel bình thường. Thư viện của bạn vẫn sao lưu được ra file .json.";
        public const string BackupButton = "Lưu bản sao lưu (.json)";

        /// <summary>Nhãn nút Bản quyền trên ribbon.</summary>
        public static string LicenseLabel(LicenseState? state)
        {
            if (state == null)
            {
                return TabLicense;
            }
            switch (state.Kind)
            {
                case LicenseKind.Licensed:
                    return "Đã cấp phép";
                case LicenseKind.Trial:
                    return $"Dùng thử: còn {state.DaysLeft} ngày";
                default:
                    return "Hết hạn dùng thử";
            }
        }

        public const string SettingsUpdateLabel = "Cài đặt (có bản mới)";

        public const string VersionTitle = "Phiên bản";
        public static string VersionLines(string version, string excel, bool is64Bit, string components) =>
            $"ConsQuotation {version}\r\nExcel {excel}, {(is64Bit ? "64" : "32")}-bit\r\nThành phần: {components}";
        public const string ExcelUnknown = "(không đọc được)";

        public const string LibraryTitle = "Thư viện trên máy";
        public static string LibraryFile(string path) => $"Nơi lưu: {path}";
        public static string LibraryCounts(int items, int resources, int norms) => $"{items} công tác, {resources} tài nguyên, {norms} định mức.";
        public const string LibraryNote = "Mỗi lần ghi, add-in giữ một bản trước đó (file .bak cùng thư mục). Gỡ cài đặt không xóa thư mục này. Sao lưu ra file .json ở Thư viện › Nhập/Xuất và sao lưu.";
        public const string OpenFolder = "Mở thư mục";

        public const string UpdateTitle = "Cập nhật";
        public const string UpdateIntro = "Add-in hỏi trang phát hành trên GitHub tối đa 1 lần mỗi ngày, không gửi dữ liệu nào của bạn. Khi có bản mới, nút Cài đặt trên ribbon đổi thành \"Cài đặt (có bản mới)\". Add-in không tự cài: bạn tải file .exe, đóng Excel rồi chạy file đó để cài đè. Thư viện và cấp phép giữ nguyên.";
        public const string CheckUpdate = "Kiểm tra cập nhật";
        public const string Checking = "Đang kiểm tra…";
        public const string NeverChecked = "Chưa kiểm tra lần nào.";
        public static string LastChecked(string when) => $"Lần kiểm tra gần nhất: {when}.";
        public const string UpToDate = "Bạn đang dùng bản mới nhất.";
        public const string CheckFailed = "Không kiểm tra được (cần kết nối Internet tới github.com). Kiểm tra mạng rồi thử lại.";
        public static string UpdateAvailable(string version) => $"Có bản mới: {version}.";
        public const string OpenDownload = "Mở trang tải";
        public const string OpenBrowserFailed = "Không mở được trình duyệt. Hãy tự mở địa chỉ: ";

        public const string HelpIntro = "ConsQuotation lập báo giá thi công xây dựng ngay trong Excel. Excel vẫn là bảng tính chính: báo giá nằm trong workbook, lưu và in bằng Excel.";
        public const string HelpGuide = "Hướng dẫn đầy đủ";
        public const string HelpReleases = "Trang phát hành";
        public const string HelpIssues = "Báo lỗi";

        public static readonly IReadOnlyList<(string Title, string[] Lines)> HelpSections = new (string, string[])[]
        {
            ("Quy trình báo giá", new[]
            {
                "1. Mở workbook, bấm Tạo bảng báo giá: trên sheet mới hoặc tại ô đang chọn. Add-in hỏi trước khi ghi vào vùng có dữ liệu.",
                "2. Thông tin công trình: tùy chọn, có thể gõ thẳng trên sheet.",
                "3. Thêm công tác: nhập trực tiếp, lấy từ thư viện hoặc phân tích từ định mức.",
                "4. Công tác: xem từng dòng, nguồn giá, trạng thái; tính lại và lưu.",
                "5. Tính giá: Kiểm tra báo lỗi và cảnh báo, nút Đi tới chọn đúng ô; Tổng hợp cho chiết khấu, phụ phí, thuế; Làm tròn áp dụng cho cả workbook.",
                "6. In ấn: Ghi chú do bạn tự nhập, Trang in cho vùng in và khổ giấy.",
                "7. Lưu bằng Ctrl+S. Xem trước và in bằng File › Print, xuất PDF bằng File › Export.",
            }),
            ("Thư viện của tôi", new[]
            {
                "Công tác, tài nguyên, giá theo ngày hiệu lực và định mức do bạn tự tạo. Add-in không kèm sẵn dữ liệu nào.",
                "Tìm kiếm không cần gõ dấu. Chèn vào báo giá chép giá trị: sửa thư viện sau đó không làm đổi báo giá cũ.",
                "Chuyển từ bản web: ở bản web tải bản sao lưu .json, rồi vào Thư viện › Nhập/Xuất và sao lưu ở đây để nhập.",
            }),
            ("Lưu ý khi ghi vào workbook", new[]
            {
                "Thao tác ghi của add-in không hoàn tác được bằng Ctrl+Z. Tạo bảng trên sheet mới là cách an toàn nhất.",
                "Thành tiền để trống khi thiếu khối lượng hoặc đơn giá. Lỗi công thức hiện ra ở tổng, không bị đổi thành 0.",
                "Báo giá làm bằng bản web mở và làm tiếp được ở đây.",
            }),
            ("Yêu cầu", new[]
            {
                "Excel 2016 trở lên trên Windows, bản 32-bit hoặc 64-bit. Không chạy trên Excel web và Mac.",
            }),
            ("Dữ liệu của bạn", new[]
            {
                "Add-in không gửi workbook hay thư viện đi đâu. Thư viện lưu trong file trên máy này, báo giá nằm trong workbook.",
                "Add-in chỉ kết nối mạng để tải danh sách cấp phép khi bạn bấm Kích hoạt và hỏi phiên bản mới trên GitHub.",
            }),
        };
    }
}
