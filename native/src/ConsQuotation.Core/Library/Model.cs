using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace ConsQuotation.Core.Library
{
    // Mô hình thư viện cá nhân, cùng schema v3 với bản web (src/domain/library/types.ts, ADR-0003,
    // ADR-0012, ADR-0013) để dùng chung file sao lưu .json. Người dùng tự tạo mọi dữ liệu; add-in không
    // kèm sẵn định mức, đơn giá hay danh mục nào. Ngày hiệu lực là chuỗi "YYYY-MM-DD" (không giờ, không
    // múi giờ); thời điểm tạo/sửa là chuỗi ISO. Số tiền, hao phí dùng decimal (cơ số 10, không sai số).

    public static class LibrarySchema
    {
        /// <summary>v1: công tác, tài nguyên, giá, định mức; v2: danh mục và nhà cung cấp; v3: định mức có phiên bản.</summary>
        public const int Version = 3;

        public const string DefaultName = "Thư viện của tôi";
        public const int NameMax = 80;
    }

    /// <summary>Danh mục (nhóm) do người dùng tự tạo.</summary>
    public sealed class Category
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Notes { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";
    }

    /// <summary>Nhà cung cấp; ContactInfo là chữ tự do, chỉ lưu trên máy và trong file sao lưu.</summary>
    public sealed class Supplier
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string ContactInfo { get; set; } = "";
        public string Notes { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";
    }

    public enum PricingMethod
    {
        Direct,
        Composition,
    }

    public sealed class WorkItem
    {
        public string Id { get; set; } = "";
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        /// <summary>null = chưa phân nhóm.</summary>
        public string? CategoryId { get; set; }
        public string Unit { get; set; } = "";
        public string Description { get; set; } = "";
        public PricingMethod PricingMethod { get; set; } = PricingMethod.Direct;
        /// <summary>null = chưa có giá (khác với 0).</summary>
        public decimal? UnitPrice { get; set; }
        public string Currency { get; set; } = "";
        public string? SupplierId { get; set; }
        public string Source { get; set; } = "";
        public string? EffectiveFrom { get; set; }
        public string? EffectiveTo { get; set; }
        public string Notes { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";
    }

    public enum ResourceType
    {
        Material,
        Labor,
        Machine,
        Other,
    }

    public sealed class Resource
    {
        public string Id { get; set; } = "";
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public ResourceType Type { get; set; } = ResourceType.Material;
        public string? CategoryId { get; set; }
        public string Unit { get; set; } = "";
        public string Notes { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";
    }

    public enum PriceStatus
    {
        Active,
        Inactive,
    }

    /// <summary>Đơn giá nguồn của tài nguyên; một tài nguyên có thể có nhiều giá theo thời gian/nguồn.</summary>
    public sealed class ResourcePrice
    {
        public string Id { get; set; } = "";
        public string ResourceId { get; set; } = "";
        public decimal Price { get; set; }
        public string Unit { get; set; } = "";
        public string Currency { get; set; } = "";
        public string? EffectiveFrom { get; set; }
        public string? EffectiveTo { get; set; }
        public string? SupplierId { get; set; }
        public string Source { get; set; } = "";
        public PriceStatus Status { get; set; } = PriceStatus.Active;
        public string Notes { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";
    }

    /// <summary>
    /// Nháp: sửa tự do. Đang dùng: khóa thành phần và hao phí, dùng khi phân tích đơn giá. Ngừng dùng:
    /// giữ lịch sử, không dùng cho báo giá mới.
    /// </summary>
    public enum NormStatus
    {
        Draft,
        Approved,
        Inactive,
    }

    public enum NormSourceType
    {
        User,
        Document,
    }

    /// <summary>Định mức hao phí cho 1 đơn vị công tác.</summary>
    public sealed class Norm
    {
        public string Id { get; set; } = "";
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        /// <summary>Đơn vị của công tác (khác đơn vị tài nguyên của từng thành phần).</summary>
        public string Unit { get; set; } = "";
        public string? CategoryId { get; set; }
        public string? WorkItemId { get; set; }
        public string Version { get; set; } = "";
        public string? EffectiveFrom { get; set; }
        public NormSourceType SourceType { get; set; } = NormSourceType.User;
        public string Source { get; set; } = "";
        public bool SourceVerified { get; set; }
        public NormStatus Status { get; set; } = NormStatus.Draft;
        /// <summary>Hao phí trong nguồn đã gồm hao hụt: không cộng thêm hao hụt.</summary>
        public bool WasteIncluded { get; set; }
        public string Notes { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";
    }

    /// <summary>
    /// Thành phần tài nguyên của định mức: hao phí cho 1 đơn vị công tác, tỷ lệ hao hụt (0,05 = 5%).
    /// Snapshot ghi mã/tên/đơn vị/loại lúc liên kết; tính toán luôn dùng tài nguyên hiện tại.
    /// </summary>
    public sealed class NormComponent
    {
        public string Id { get; set; } = "";
        public string NormId { get; set; } = "";
        public string ResourceId { get; set; } = "";
        public string ResourceCodeSnapshot { get; set; } = "";
        public string ResourceNameSnapshot { get; set; } = "";
        public string ResourceUnitSnapshot { get; set; } = "";
        public ResourceType ResourceTypeSnapshot { get; set; } = ResourceType.Material;
        public decimal Consumption { get; set; }
        public decimal WasteRate { get; set; }
        /// <summary>Giá người dùng chọn khi tài nguyên có nhiều giá; null = chỉ tự lấy khi có đúng một giá dùng được.</summary>
        public string? PriceId { get; set; }
        public int SortOrder { get; set; }
        public string Notes { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";
    }

    public sealed class LibrarySnapshot
    {
        public List<Category> Categories { get; set; } = new List<Category>();
        public List<Supplier> Suppliers { get; set; } = new List<Supplier>();
        public List<WorkItem> WorkItems { get; set; } = new List<WorkItem>();
        public List<Resource> Resources { get; set; } = new List<Resource>();
        public List<ResourcePrice> ResourcePrices { get; set; } = new List<ResourcePrice>();
        public List<Norm> Norms { get; set; } = new List<Norm>();
        public List<NormComponent> NormComponents { get; set; } = new List<NormComponent>();

        [JsonIgnore]
        public bool IsEmpty =>
            Categories.Count == 0 && Suppliers.Count == 0 && WorkItems.Count == 0 && Resources.Count == 0 &&
            ResourcePrices.Count == 0 && Norms.Count == 0 && NormComponents.Count == 0;
    }

    public static class Names
    {
        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");
        private static readonly Regex Spaces = new Regex(@"\s+");

        /// <summary>
        /// Chuẩn hóa tên danh mục/nhà cung cấp để phát hiện trùng: bỏ khoảng trắng thừa, không phân biệt
        /// hoa thường, GIỮ dấu tiếng Việt ("Cát" và "Cạt" là hai tên khác nhau).
        /// </summary>
        public static string NormalizeName(string name) =>
            Spaces.Replace(name.Normalize(NormalizationForm.FormC), " ").Trim().ToLower(Vi);

        /// <summary>Mã so sánh không phân biệt hoa thường và khoảng trắng hai đầu.</summary>
        public static string NormalizeCode(string code) => code.Trim().ToLower(Vi);

        internal static string CollapseSpaces(string text) => Spaces.Replace(text, " ");
    }
}
