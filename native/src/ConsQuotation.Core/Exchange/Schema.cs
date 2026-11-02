using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using ConsQuotation.Core.Library;

namespace ConsQuotation.Core.Exchange
{
    /// <summary>Bảy loại dữ liệu trao đổi, theo đúng thứ tự của bản web (DATASET_KINDS).</summary>
    public enum DatasetKind
    {
        Categories,
        Suppliers,
        WorkItems,
        Resources,
        ResourcePrices,
        Norms,
        NormComponents,
    }

    public enum FieldType
    {
        Text,
        Number,
        Date,
        ResourceType,
        PriceStatus,
        NormStatus,
        NormSourceType,
        YesNo,
    }

    public sealed class FieldDef
    {
        public FieldDef(string key, string header, FieldType type, bool required, string[] aliases, int width = 14)
        {
            Key = key;
            Header = header;
            Type = type;
            Required = required;
            Aliases = aliases;
            Width = width;
        }

        public string Key { get; }
        /// <summary>Tiêu đề cột chuẩn khi xuất và trong file mẫu.</summary>
        public string Header { get; }
        public FieldType Type { get; }
        public bool Required { get; }
        /// <summary>Tên cột khác được nhận khi tự map (so sánh không dấu, không phân biệt hoa thường).</summary>
        public IReadOnlyList<string> Aliases { get; }
        /// <summary>Độ rộng cột khi xuất ra Excel.</summary>
        public int Width { get; }
    }

    public sealed class DatasetDef
    {
        public DatasetDef(DatasetKind kind, string sheetName, FieldDef[] fields)
        {
            Kind = kind;
            SheetName = sheetName;
            Fields = fields;
        }

        public DatasetKind Kind { get; }
        /// <summary>Tên sheet khi xuất workbook và tên gợi ý của file CSV.</summary>
        public string SheetName { get; }
        public IReadOnlyList<FieldDef> Fields { get; }
    }

    /// <summary>
    /// Schema trao đổi thư viện (prompts/09, ADR-0004), chuyển từ src/domain/library/exchange/schema.ts.
    /// Dạng bảng tham chiếu giữa các loại bằng MÃ (giá → Mã tài nguyên; thành phần → Mã định mức + Phiên
    /// bản + Mã tài nguyên), nhóm và nhà cung cấp bằng TÊN. v1/v2 vẫn nhập được (xem bản web).
    /// </summary>
    public static class ExchangeSchema
    {
        public const string Format = "consquotation-library";
        public const int Version = 3;

        /// <summary>Sheet chứa thông tin file sao lưu dạng workbook.</summary>
        public const string MetaSheetName = "Thông tin";

        public static readonly IReadOnlyList<DatasetKind> Kinds = new[]
        {
            DatasetKind.Categories, DatasetKind.Suppliers, DatasetKind.WorkItems, DatasetKind.Resources,
            DatasetKind.ResourcePrices, DatasetKind.Norms, DatasetKind.NormComponents,
        };

        /// <summary>Tên loại trong file JSON: "workItems", "resourcePrices"…</summary>
        public static string Key(this DatasetKind kind)
        {
            var name = kind.ToString();
            return char.ToLowerInvariant(name[0]) + name.Substring(1);
        }

        private static FieldDef F(string key, string header, FieldType type, bool required, string[] aliases, int width = 14) =>
            new FieldDef(key, header, type, required, aliases, width);

        public static readonly IReadOnlyDictionary<DatasetKind, DatasetDef> Datasets = new Dictionary<DatasetKind, DatasetDef>
        {
            [DatasetKind.Categories] = new DatasetDef(DatasetKind.Categories, "Nhóm", new[]
            {
                // Không nhận tên cột "Nhóm" ở đây: đó là cột tham chiếu trên sheet công tác/tài nguyên.
                F("name", "Tên nhóm", FieldType.Text, true, new[] { "ten danh muc", "danh muc", "category name" }, 30),
                F("notes", "Ghi chú", FieldType.Text, false, new[] { "notes" }, 40),
            }),
            [DatasetKind.Suppliers] = new DatasetDef(DatasetKind.Suppliers, "Nhà cung cấp", new[]
            {
                F("name", "Tên nhà cung cấp", FieldType.Text, true, new[] { "ten ncc", "supplier name" }, 30),
                F("contactInfo", "Liên hệ", FieldType.Text, false, new[] { "thong tin lien he", "contact" }, 40),
                F("notes", "Ghi chú", FieldType.Text, false, new[] { "notes" }, 40),
            }),
            [DatasetKind.WorkItems] = new DatasetDef(DatasetKind.WorkItems, "Công tác", new[]
            {
                F("code", "Mã công tác", FieldType.Text, true, new[] { "ma hieu", "ma hieu cong tac", "work item code" }),
                F("name", "Tên công tác", FieldType.Text, true, new[] { "noi dung cong viec", "ten cong viec", "work item name" }, 40),
                F("category", "Nhóm", FieldType.Text, false, new[] { "nhom cong tac", "group", "danh muc", "category" }),
                F("unit", "Đơn vị tính", FieldType.Text, true, new[] { "don vi", "dvt", "unit" }, 10),
                F("description", "Mô tả", FieldType.Text, false, new[] { "description" }, 30),
                F("unitPrice", "Đơn giá", FieldType.Number, false, new[] { "gia", "unit price", "price" }),
                F("currency", "Tiền tệ", FieldType.Text, false, new[] { "currency" }, 8),
                F("supplier", "Nhà cung cấp", FieldType.Text, false, new[] { "ncc", "supplier" }, 20),
                F("source", "Nguồn giá", FieldType.Text, false, new[] { "nguon", "source" }, 20),
                F("effectiveFrom", "Hiệu lực từ ngày", FieldType.Date, false, new[] { "hieu luc tu", "tu ngay", "effective from" }, 14),
                F("effectiveTo", "Hiệu lực đến ngày", FieldType.Date, false, new[] { "hieu luc den", "den ngay", "effective to" }, 14),
                F("notes", "Ghi chú", FieldType.Text, false, new[] { "notes" }, 30),
            }),
            [DatasetKind.Resources] = new DatasetDef(DatasetKind.Resources, "Tài nguyên", new[]
            {
                F("code", "Mã tài nguyên", FieldType.Text, true, new[] { "ma vat tu", "resource code" }),
                F("name", "Tên tài nguyên", FieldType.Text, true, new[] { "ten vat tu", "resource name" }, 40),
                F("type", "Loại", FieldType.ResourceType, false, new[] { "loai tai nguyen", "type" }, 14),
                F("category", "Nhóm", FieldType.Text, false, new[] { "danh muc", "category" }),
                F("unit", "Đơn vị tính", FieldType.Text, true, new[] { "don vi", "dvt", "unit" }, 10),
                F("notes", "Ghi chú", FieldType.Text, false, new[] { "notes" }, 30),
            }),
            [DatasetKind.ResourcePrices] = new DatasetDef(DatasetKind.ResourcePrices, "Giá tài nguyên", new[]
            {
                F("resourceCode", "Mã tài nguyên", FieldType.Text, true, new[] { "ma vat tu", "resource code" }),
                F("price", "Đơn giá", FieldType.Number, true, new[] { "gia", "price" }),
                F("unit", "Đơn vị tính", FieldType.Text, true, new[] { "don vi", "dvt", "unit" }, 10),
                F("currency", "Tiền tệ", FieldType.Text, true, new[] { "currency" }, 8),
                F("effectiveFrom", "Hiệu lực từ ngày", FieldType.Date, false, new[] { "hieu luc tu", "tu ngay", "effective from" }, 14),
                F("effectiveTo", "Hiệu lực đến ngày", FieldType.Date, false, new[] { "hieu luc den", "den ngay", "effective to" }, 14),
                F("supplier", "Nhà cung cấp", FieldType.Text, false, new[] { "ncc", "supplier" }, 20),
                F("source", "Nguồn", FieldType.Text, false, new[] { "nguon gia", "source" }, 20),
                F("status", "Trạng thái", FieldType.PriceStatus, false, new[] { "status" }, 12),
                F("notes", "Ghi chú", FieldType.Text, false, new[] { "notes" }, 30),
            }),
            [DatasetKind.Norms] = new DatasetDef(DatasetKind.Norms, "Định mức", new[]
            {
                F("code", "Mã định mức", FieldType.Text, true, new[] { "ma dm", "norm code" }),
                F("name", "Tên công tác", FieldType.Text, true, new[] { "noi dung cong viec", "ten cong viec" }, 40),
                F("unit", "Đơn vị tính", FieldType.Text, true, new[] { "don vi", "dvt", "unit" }, 10),
                F("category", "Nhóm", FieldType.Text, false, new[] { "danh muc", "category" }),
                F("version", "Phiên bản", FieldType.Text, false, new[] { "version" }, 10),
                F("effectiveFrom", "Ngày áp dụng", FieldType.Date, false, new[] { "hieu luc tu", "effective from" }, 14),
                F("sourceType", "Loại nguồn", FieldType.NormSourceType, false, new[] { "source type" }, 14),
                F("source", "Nguồn", FieldType.Text, false, new[] { "tai lieu", "so hieu", "source" }, 30),
                F("sourceVerified", "Đã đối chiếu nguồn", FieldType.YesNo, false, new[] { "da xac minh", "verified" }, 12),
                F("status", "Trạng thái", FieldType.NormStatus, false, new[] { "status" }, 12),
                F("wasteIncluded", "Hao phí đã gồm hao hụt", FieldType.YesNo, false, new[] { "da gom hao hut" }, 12),
                F("workItemCode", "Mã công tác liên kết", FieldType.Text, false, new[] { "cong tac lien ket" }, 14),
                F("notes", "Ghi chú", FieldType.Text, false, new[] { "notes" }, 30),
            }),
            // Bảng định mức kiểu cũ (Mã công tác, Mã tài nguyên, Hao phí) khớp loại này nhờ bí danh.
            [DatasetKind.NormComponents] = new DatasetDef(DatasetKind.NormComponents, "Thành phần định mức", new[]
            {
                F("normCode", "Mã định mức", FieldType.Text, true, new[] { "ma cong tac", "ma hieu", "ma hieu cong tac", "work item code", "norm code" }),
                F("version", "Phiên bản", FieldType.Text, false, new[] { "version" }, 10),
                F("resourceCode", "Mã tài nguyên", FieldType.Text, true, new[] { "ma vat tu", "resource code" }),
                F("consumption", "Hao phí", FieldType.Number, true, new[] { "dinh muc", "hao phi dinh muc", "quantity" }),
                F("wastePercent", "Hao hụt (%)", FieldType.Number, false, new[] { "hao hut", "ty le hao hut", "waste" }, 10),
                F("sortOrder", "Thứ tự", FieldType.Number, false, new[] { "stt", "order" }, 8),
                F("notes", "Ghi chú", FieldType.Text, false, new[] { "notes" }, 30),
            }),
        };

        private static readonly Regex TrailingPunctuation = new Regex(@"[:.]+$");

        /// <summary>Chuẩn hóa tiêu đề cột để so khớp: bỏ dấu, hoa thường, dấu *, khoảng trắng thừa.</summary>
        public static string NormalizeHeader(string text) =>
            TrailingPunctuation.Replace(Search.NormalizeForSearch(text.Replace("*", " ")), "").Trim();

        public static bool FieldMatchesHeader(FieldDef field, string header)
        {
            var normalized = NormalizeHeader(header);
            if (normalized == "")
            {
                return false;
            }
            return NormalizeHeader(field.Header) == normalized || field.Aliases.Any(alias => NormalizeHeader(alias) == normalized);
        }

        // Nhãn tiếng Việt được chấp nhận (kèm khóa tiếng Anh như trong file JSON).
        public static readonly IReadOnlyDictionary<ResourceType, string> ResourceTypeLabels = new Dictionary<ResourceType, string>
        {
            [ResourceType.Material] = "Vật liệu",
            [ResourceType.Labor] = "Nhân công",
            [ResourceType.Machine] = "Máy thi công",
            [ResourceType.Other] = "Khác",
        };

        public static readonly IReadOnlyDictionary<PriceStatus, string> PriceStatusLabels = new Dictionary<PriceStatus, string>
        {
            [PriceStatus.Active] = "Đang dùng",
            [PriceStatus.Inactive] = "Ngưng dùng",
        };

        public static readonly IReadOnlyDictionary<NormStatus, string> NormStatusLabels = new Dictionary<NormStatus, string>
        {
            [NormStatus.Draft] = "Nháp",
            [NormStatus.Approved] = "Đang dùng",
            [NormStatus.Inactive] = "Ngừng dùng",
        };

        public static readonly IReadOnlyDictionary<NormSourceType, string> NormSourceTypeLabels = new Dictionary<NormSourceType, string>
        {
            [NormSourceType.User] = "Người dùng",
            [NormSourceType.Document] = "Tài liệu",
        };

        public const string Yes = "Có";
        public const string No = "Không";

        /// <summary>Dòng tiêu đề CSV mẫu (UTF-8) cho từng loại, giống file trong docs/templates/.</summary>
        public static string CsvTemplate(DatasetKind kind) => string.Join(",", Datasets[kind].Fields.Select(f => f.Header)) + "\r\n";
    }
}
