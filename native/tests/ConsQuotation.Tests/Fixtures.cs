using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Library;

namespace ConsQuotation.Tests
{
    /// <summary>Dữ liệu kiểm thử giả định (không phải định mức hay đơn giá thực tế), giống tests/unit/*.test.ts.</summary>
    internal static class Fixtures
    {
        public const string T = "2026-10-27T00:00:00.000Z";

        public static Resource Res(string id, ResourceType type, string unit, string? name = null, string? code = null) => new Resource
        {
            Id = id,
            Code = code ?? id.ToUpperInvariant(),
            Name = name ?? $"Thử {id}",
            Type = type,
            Unit = unit,
            CreatedAt = T,
            UpdatedAt = T,
        };

        public static ResourcePrice Price(string id, string resourceId, decimal value, string unit,
            string currency = "VND", string? from = null, string? to = null, PriceStatus status = PriceStatus.Active,
            string updatedAt = T, string? supplierId = null, string source = "Thử") => new ResourcePrice
        {
            Id = id,
            ResourceId = resourceId,
            Price = value,
            Unit = unit,
            Currency = currency,
            EffectiveFrom = from,
            EffectiveTo = to,
            SupplierId = supplierId,
            Source = source,
            Status = status,
            CreatedAt = T,
            UpdatedAt = updatedAt,
        };

        public static Norm Norm(string id = "n1", string code = "THU-DM-01", string unit = "m3", NormStatus status = NormStatus.Approved,
            bool wasteIncluded = false, string updatedAt = T, string version = "1", string? workItemId = null) => new Norm
        {
            Id = id,
            Code = code,
            Name = "Thử công tác",
            Unit = unit,
            Version = version,
            WorkItemId = workItemId,
            Status = status,
            WasteIncluded = wasteIncluded,
            CreatedAt = T,
            UpdatedAt = updatedAt,
        };

        public static NormComponent Comp(string id, Resource resource, decimal consumption, decimal wasteRate = 0,
            string normId = "n1", string? priceId = null, int? sortOrder = null, string updatedAt = T) => new NormComponent
        {
            Id = id,
            NormId = normId,
            ResourceId = resource.Id,
            ResourceCodeSnapshot = resource.Code,
            ResourceNameSnapshot = resource.Name,
            ResourceUnitSnapshot = resource.Unit,
            ResourceTypeSnapshot = resource.Type,
            Consumption = consumption,
            WasteRate = wasteRate,
            PriceId = priceId,
            SortOrder = sortOrder ?? (int.TryParse(new string(id.Where(char.IsDigit).ToArray()), out var n) ? n : 0),
            CreatedAt = T,
            UpdatedAt = updatedAt,
        };

        public static LibrarySnapshot Lib(IEnumerable<Resource>? resources = null, IEnumerable<ResourcePrice>? prices = null,
            IEnumerable<Norm>? norms = null, IEnumerable<NormComponent>? components = null) => new LibrarySnapshot
        {
            Resources = (resources ?? new Resource[0]).ToList(),
            ResourcePrices = (prices ?? new ResourcePrice[0]).ToList(),
            Norms = (norms ?? new Norm[0]).ToList(),
            NormComponents = (components ?? new NormComponent[0]).ToList(),
        };

        /// <summary>Bản sao nông (giống {...x} trong TypeScript) để đổi vài trường trong test.</summary>
        public static T Copy<T>(T source) where T : class => (T)typeof(T).GetMethod("MemberwiseClone", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.Invoke(source, null)!;
    }
}
