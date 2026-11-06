using System.Collections.Generic;

namespace ConsQuotation.Ribbon
{
    /// <summary>
    /// Danh mục lệnh của ribbon: id nút → tên lệnh và giai đoạn sẽ có chức năng (docs/NATIVE_PLAN.md).
    /// Lệnh chưa có chức năng báo "đang chuyển sang bản Windows"; lệnh Thư viện (N3) và Báo giá (N4) mở cửa sổ tương ứng.
    /// </summary>
    public static class RibbonCommands
    {
        public sealed class Command
        {
            public Command(string title, string stage)
            {
                Title = title;
                Stage = stage;
            }

            public string Title { get; }

            /// <summary>Giai đoạn kế hoạch sẽ làm chức năng này (N1–N6).</summary>
            public string Stage { get; }
        }

        public const string Help = "cqHelp";

        public static readonly IReadOnlyDictionary<string, Command> All = new Dictionary<string, Command>
        {
            ["cqOpen"] = new Command("Mở ConsQuotation", "N4"),
            ["cqCreateQuote"] = new Command("Tạo bảng báo giá", "N4"),
            ["cqQuoteInfo"] = new Command("Thông tin công trình", "N4"),
            ["cqAddItem"] = new Command("Thêm công tác", "N4"),
            ["cqItems"] = new Command("Công tác", "N4"),
            ["cqPricing"] = new Command("Tính giá", "N5"),
            ["cqPrint"] = new Command("In ấn", "N5"),
            ["cqLibrary"] = new Command("Thư viện của tôi", "N3"),
            ["cqResources"] = new Command("Tài nguyên", "N3"),
            ["cqNorms"] = new Command("Định mức", "N3"),
            ["cqCatalog"] = new Command("Danh mục", "N3"),
            ["cqLibraryCheck"] = new Command("Kiểm tra thư viện", "N3"),
            ["cqExchange"] = new Command("Nhập/Xuất và sao lưu", "N3"),
            ["cqSettings"] = new Command("Cài đặt", "N6"),
            ["cqLicense"] = new Command("Bản quyền", "N6"),
            [Help] = new Command("Trợ giúp", "N6"),
        };
    }
}
