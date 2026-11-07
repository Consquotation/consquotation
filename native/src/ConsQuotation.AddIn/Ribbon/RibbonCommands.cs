using System.Collections.Generic;

namespace ConsQuotation.Ribbon
{
    /// <summary>Danh mục lệnh của ribbon: id nút → tên lệnh. Mỗi lệnh mở một thẻ của cửa sổ Báo giá, Thư viện hoặc Hệ thống.</summary>
    public static class RibbonCommands
    {
        public const string Settings = "cqSettings";
        public const string License = "cqLicense";

        public static readonly IReadOnlyDictionary<string, string> All = new Dictionary<string, string>
        {
            ["cqOpen"] = "Mở ConsQuotation",
            ["cqCreateQuote"] = "Tạo bảng báo giá",
            ["cqQuoteInfo"] = "Thông tin công trình",
            ["cqAddItem"] = "Thêm công tác",
            ["cqItems"] = "Công tác",
            ["cqPricing"] = "Tính giá",
            ["cqPrint"] = "In ấn",
            ["cqLibrary"] = "Thư viện của tôi",
            ["cqResources"] = "Tài nguyên",
            ["cqNorms"] = "Định mức",
            ["cqCatalog"] = "Danh mục",
            ["cqLibraryCheck"] = "Kiểm tra thư viện",
            ["cqExchange"] = "Nhập/Xuất và sao lưu",
            [Settings] = "Cài đặt",
            [License] = "Bản quyền",
            ["cqHelp"] = "Trợ giúp",
        };
    }
}
