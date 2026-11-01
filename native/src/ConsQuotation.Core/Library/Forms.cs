using System.Collections.Generic;

namespace ConsQuotation.Core.Library
{
    // Dữ liệu người dùng gõ trên form (chưa kiểm tra) và kết quả kiểm tra. Tên trường (Field) giữ như
    // bản web (src/domain/library/validation.ts) để giao diện gắn lỗi đúng ô.

    public sealed class FieldError
    {
        public FieldError(string field, string message)
        {
            Field = field;
            Message = message;
        }

        public string Field { get; }
        public string Message { get; }

        public override string ToString() => $"{Field}: {Message}";
    }

    /// <summary>Ok kèm Value, hoặc danh sách lỗi theo trường.</summary>
    public sealed class FormResult<T>
        where T : class
    {
        private FormResult(T? value, IReadOnlyList<FieldError> errors)
        {
            Value = value;
            Errors = errors;
        }

        public bool Ok => Value != null;
        public T? Value { get; }
        public IReadOnlyList<FieldError> Errors { get; }

        public static FormResult<T> Success(T value) => new FormResult<T>(value, new FieldError[0]);
        public static FormResult<T> Failure(IReadOnlyList<FieldError> errors) => new FormResult<T>(null, errors);
    }

    public static class Fields
    {
        public const string Code = "code";
        public const string Name = "name";
        public const string CategoryId = "categoryId";
        public const string Unit = "unit";
        public const string Description = "description";
        public const string UnitPrice = "unitPrice";
        public const string Currency = "currency";
        public const string SupplierId = "supplierId";
        public const string Source = "source";
        public const string EffectiveFrom = "effectiveFrom";
        public const string EffectiveTo = "effectiveTo";
        public const string Notes = "notes";
        public const string Type = "type";
        public const string Price = "price";
        public const string Status = "status";
        public const string ContactInfo = "contactInfo";
        public const string WorkItemId = "workItemId";
        public const string Version = "version";
        public const string SourceType = "sourceType";
        public const string SourceVerified = "sourceVerified";
        public const string WasteIncluded = "wasteIncluded";
        public const string ResourceId = "resourceId";
        public const string Consumption = "consumption";
        public const string WastePercent = "wastePercent";
    }

    public sealed class WorkItemForm
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        /// <summary>id danh mục; "" = chưa phân nhóm.</summary>
        public string CategoryId { get; set; } = "";
        public string Unit { get; set; } = "";
        public string Description { get; set; } = "";
        public string UnitPrice { get; set; } = "";
        public string Currency { get; set; } = "VND";
        /// <summary>id nhà cung cấp; "" = không có.</summary>
        public string SupplierId { get; set; } = "";
        public string Source { get; set; } = "";
        public string EffectiveFrom { get; set; } = "";
        public string EffectiveTo { get; set; } = "";
        public string Notes { get; set; } = "";
    }

    public sealed class ResourceForm
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public ResourceType Type { get; set; } = ResourceType.Material;
        public string CategoryId { get; set; } = "";
        public string Unit { get; set; } = "";
        public string Notes { get; set; } = "";
    }

    public sealed class PriceForm
    {
        public string Price { get; set; } = "";
        public string Unit { get; set; } = "";
        public string Currency { get; set; } = "VND";
        public string EffectiveFrom { get; set; } = "";
        public string EffectiveTo { get; set; } = "";
        public string SupplierId { get; set; } = "";
        public string Source { get; set; } = "";
        public PriceStatus Status { get; set; } = PriceStatus.Active;
        public string Notes { get; set; } = "";
    }

    public sealed class CategoryForm
    {
        public string Name { get; set; } = "";
        public string Notes { get; set; } = "";
    }

    public sealed class SupplierForm
    {
        public string Name { get; set; } = "";
        public string ContactInfo { get; set; } = "";
        public string Notes { get; set; } = "";
    }

    public sealed class NormForm
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string Unit { get; set; } = "";
        public string CategoryId { get; set; } = "";
        public string WorkItemId { get; set; } = "";
        public string Version { get; set; } = "";
        public string EffectiveFrom { get; set; } = "";
        public NormSourceType SourceType { get; set; } = NormSourceType.User;
        public string Source { get; set; } = "";
        public bool SourceVerified { get; set; }
        public bool WasteIncluded { get; set; }
        public string Notes { get; set; } = "";
    }

    public sealed class NormComponentForm
    {
        public string ResourceId { get; set; } = "";
        public string Consumption { get; set; } = "";
        /// <summary>Hao hụt theo phần trăm, ví dụ "5" = 5%; trống = 0.</summary>
        public string WastePercent { get; set; } = "";
        public string Notes { get; set; } = "";
    }

    /// <summary>Thành phần định mức đã kiểm tra.</summary>
    public sealed class NormComponentData
    {
        public string ResourceId { get; set; } = "";
        public decimal Consumption { get; set; }
        public decimal WasteRate { get; set; }
        public string Notes { get; set; } = "";
    }
}
