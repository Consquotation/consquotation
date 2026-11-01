using System.Collections.Generic;
using System.Linq;

namespace ConsQuotation.Core.Library
{
    public enum IssueSeverity
    {
        Error,
        Warning,
    }

    public enum IssueKind
    {
        DuplicateWorkItemCode,
        DuplicateResourceCode,
        MissingRequired,
        MissingPrice,
        ZeroPrice,
        ExpiredPrice,
        NotYetEffectivePrice,
        BrokenNormWorkItem,
        BrokenNormResource,
        EmptyNorm,
        DuplicateNormVersion,
        MultipleApprovedNorms,
        NormResourceChanged,
        UnverifiedNormSource,
        BrokenPriceResource,
        OverlappingPrices,
        PriceUnitMismatch,
        BrokenCategory,
        BrokenSupplier,
        SameName,
    }

    public enum IssueEntity
    {
        WorkItem,
        Resource,
        Price,
        Norm,
    }

    public sealed class LibraryIssue
    {
        public LibraryIssue(IssueKind kind, IssueSeverity severity, IssueEntity entity, string entityId, string label, string detail)
        {
            Kind = kind;
            Severity = severity;
            Entity = entity;
            EntityId = entityId;
            Label = label;
            Detail = detail;
        }

        public IssueKind Kind { get; }
        public IssueSeverity Severity { get; }
        /// <summary>Bản ghi liên quan để người dùng tìm và sửa.</summary>
        public IssueEntity Entity { get; }
        public string EntityId { get; }
        /// <summary>Mã hoặc tên hiển thị của bản ghi.</summary>
        public string Label { get; }
        public string Detail { get; }

        public override string ToString() => $"{Kind} {Label}: {Detail}";
    }

    /// <summary>Báo cáo kiểm tra toàn thư viện (prompts/08, 13). Chỉ báo, không tự sửa.</summary>
    public static class LibraryCheck
    {
        public static List<LibraryIssue> Issues(LibrarySnapshot library, string today)
        {
            var issues = new List<LibraryIssue>();
            var workItemIds = new HashSet<string>(library.WorkItems.Select(w => w.Id));
            var resourcesById = library.Resources.GroupBy(r => r.Id).ToDictionary(g => g.Key, g => g.First());

            IEnumerable<List<T>> GroupByCode<T>(IEnumerable<T> items, System.Func<T, string> code) =>
                items.Where(i => Names.NormalizeCode(code(i)) != "")
                    .GroupBy(i => Names.NormalizeCode(code(i)))
                    .Select(g => g.ToList())
                    .Where(list => list.Count > 1);

            foreach (var dupes in GroupByCode(library.WorkItems, w => w.Code))
            {
                foreach (var w in dupes)
                {
                    issues.Add(new LibraryIssue(IssueKind.DuplicateWorkItemCode, IssueSeverity.Error, IssueEntity.WorkItem, w.Id, w.Code,
                        $"Mã công tác \"{w.Code}\" bị trùng ({dupes.Count} công tác)."));
                }
            }
            foreach (var dupes in GroupByCode(library.Resources, r => r.Code))
            {
                foreach (var r in dupes)
                {
                    issues.Add(new LibraryIssue(IssueKind.DuplicateResourceCode, IssueSeverity.Error, IssueEntity.Resource, r.Id, r.Code,
                        $"Mã tài nguyên \"{r.Code}\" bị trùng ({dupes.Count} tài nguyên)."));
                }
            }

            foreach (var w in library.WorkItems)
            {
                var missing = Missing(w.Code, w.Name, w.Unit);
                if (missing.Count > 0)
                {
                    issues.Add(new LibraryIssue(IssueKind.MissingRequired, IssueSeverity.Error, IssueEntity.WorkItem, w.Id,
                        FirstNonEmpty(w.Code, w.Name, w.Id), $"Công tác thiếu {string.Join(", ", missing)}."));
                }
                if (w.PricingMethod == PricingMethod.Direct && w.UnitPrice == null)
                {
                    issues.Add(new LibraryIssue(IssueKind.MissingPrice, IssueSeverity.Warning, IssueEntity.WorkItem, w.Id, w.Code,
                        "Công tác chưa có đơn giá."));
                }
                if (w.UnitPrice == 0)
                {
                    issues.Add(new LibraryIssue(IssueKind.ZeroPrice, IssueSeverity.Warning, IssueEntity.WorkItem, w.Id, w.Code,
                        "Đơn giá bằng 0 (khác với chưa có giá) — kiểm tra lại; nếu chưa có giá hãy để trống."));
                }
                var validity = Dates.ValidityOn(w.EffectiveFrom, w.EffectiveTo, today);
                if (w.UnitPrice != null && validity == Validity.Expired)
                {
                    issues.Add(new LibraryIssue(IssueKind.ExpiredPrice, IssueSeverity.Warning, IssueEntity.WorkItem, w.Id, w.Code,
                        $"Đơn giá hết hiệu lực sau ngày {Dates.FormatIsoDate(w.EffectiveTo)}."));
                }
                if (w.UnitPrice != null && validity == Validity.NotYetEffective)
                {
                    issues.Add(new LibraryIssue(IssueKind.NotYetEffectivePrice, IssueSeverity.Warning, IssueEntity.WorkItem, w.Id, w.Code,
                        $"Đơn giá chỉ có hiệu lực từ ngày {Dates.FormatIsoDate(w.EffectiveFrom)}."));
                }
            }

            foreach (var r in library.Resources)
            {
                var missing = Missing(r.Code, r.Name, r.Unit);
                if (missing.Count > 0)
                {
                    issues.Add(new LibraryIssue(IssueKind.MissingRequired, IssueSeverity.Error, IssueEntity.Resource, r.Id,
                        FirstNonEmpty(r.Code, r.Name, r.Id), $"Tài nguyên thiếu {string.Join(", ", missing)}."));
                }
            }

            // Định mức (ADR-0013).
            string NormLabel(Norm n) => $"{n.Code} v{n.Version}";
            var normsById = library.Norms.GroupBy(n => n.Id).ToDictionary(g => g.Key, g => g.First());
            foreach (var n in library.Norms)
            {
                if (n.WorkItemId != null && !workItemIds.Contains(n.WorkItemId))
                {
                    issues.Add(new LibraryIssue(IssueKind.BrokenNormWorkItem, IssueSeverity.Warning, IssueEntity.Norm, n.Id, NormLabel(n),
                        "Định mức liên kết với công tác không còn tồn tại."));
                }
                if (!library.NormComponents.Any(c => c.NormId == n.Id))
                {
                    issues.Add(new LibraryIssue(IssueKind.EmptyNorm, IssueSeverity.Warning, IssueEntity.Norm, n.Id, NormLabel(n),
                        "Định mức chưa có thành phần nào."));
                }
                if (library.Norms.Any(o => o.Id != n.Id && Validation.SameNormVersion(o.Code, o.Version, n.Code, n.Version)))
                {
                    issues.Add(new LibraryIssue(IssueKind.DuplicateNormVersion, IssueSeverity.Error, IssueEntity.Norm, n.Id, NormLabel(n),
                        "Trùng mã định mức và phiên bản với định mức khác."));
                }
                if (n.Status == NormStatus.Approved && library.Norms.Any(o =>
                        o.Id != n.Id && o.Status == NormStatus.Approved &&
                        (Names.NormalizeCode(o.Code) == Names.NormalizeCode(n.Code) || (n.WorkItemId != null && o.WorkItemId == n.WorkItemId))))
                {
                    issues.Add(new LibraryIssue(IssueKind.MultipleApprovedNorms, IssueSeverity.Error, IssueEntity.Norm, n.Id, NormLabel(n),
                        "Có nhiều phiên bản đang dùng cho cùng mã định mức hoặc cùng công tác."));
                }
                if (n.SourceType == NormSourceType.Document && !n.SourceVerified && n.Status == NormStatus.Approved)
                {
                    issues.Add(new LibraryIssue(IssueKind.UnverifiedNormSource, IssueSeverity.Warning, IssueEntity.Norm, n.Id, NormLabel(n),
                        "Định mức lấy từ tài liệu nhưng chưa đánh dấu đã đối chiếu với tài liệu gốc."));
                }
            }
            foreach (var c in library.NormComponents)
            {
                var label = normsById.TryGetValue(c.NormId, out var owner) ? NormLabel(owner) : c.NormId;
                if (!resourcesById.TryGetValue(c.ResourceId, out var resource))
                {
                    issues.Add(new LibraryIssue(IssueKind.BrokenNormResource, IssueSeverity.Error, IssueEntity.Norm, c.NormId, label,
                        $"Thành phần \"{c.ResourceCodeSnapshot}\" trỏ tới tài nguyên không còn tồn tại."));
                }
                else if (Names.NormalizeCode(resource.Unit) != Names.NormalizeCode(c.ResourceUnitSnapshot) ||
                         resource.Code != c.ResourceCodeSnapshot || resource.Name != c.ResourceNameSnapshot)
                {
                    issues.Add(new LibraryIssue(IssueKind.NormResourceChanged, IssueSeverity.Warning, IssueEntity.Norm, c.NormId, label,
                        $"Tài nguyên \"{resource.Code}\" đã đổi mã, tên hoặc đơn vị so với lúc liên kết."));
                }
            }

            foreach (var p in library.ResourcePrices)
            {
                if (!resourcesById.TryGetValue(p.ResourceId, out var resource))
                {
                    issues.Add(new LibraryIssue(IssueKind.BrokenPriceResource, IssueSeverity.Error, IssueEntity.Price, p.Id, p.Id,
                        "Giá trỏ tới tài nguyên không còn tồn tại."));
                    continue;
                }
                if (p.Price == 0)
                {
                    issues.Add(new LibraryIssue(IssueKind.ZeroPrice, IssueSeverity.Warning, IssueEntity.Price, p.Id, resource.Code,
                        $"Giá của \"{resource.Code}\" bằng 0 — kiểm tra lại."));
                }
                if (Names.NormalizeCode(p.Unit) != Names.NormalizeCode(resource.Unit))
                {
                    issues.Add(new LibraryIssue(IssueKind.PriceUnitMismatch, IssueSeverity.Warning, IssueEntity.Price, p.Id, resource.Code,
                        $"Đơn vị của giá ({p.Unit}) khác đơn vị tài nguyên ({resource.Unit})."));
                }
                if (p.Status == PriceStatus.Active && Dates.ValidityOn(p.EffectiveFrom, p.EffectiveTo, today) == Validity.Expired)
                {
                    issues.Add(new LibraryIssue(IssueKind.ExpiredPrice, IssueSeverity.Warning, IssueEntity.Price, p.Id, resource.Code,
                        $"Giá đang dùng của \"{resource.Code}\" đã hết hiệu lực sau ngày {Dates.FormatIsoDate(p.EffectiveTo)}."));
                }
            }

            // Tham chiếu danh mục/nhà cung cấp hỏng (chỉ xảy ra với dữ liệu sửa tay hoặc lỗi lưu trữ).
            var categoryIds = new HashSet<string>(library.Categories.Select(c => c.Id));
            var supplierIds = new HashSet<string>(library.Suppliers.Select(s => s.Id));
            var refs = library.WorkItems.Select(w => (Entity: IssueEntity.WorkItem, w.Id, Label: w.Code, w.CategoryId, w.SupplierId))
                .Concat(library.Resources.Select(r => (Entity: IssueEntity.Resource, r.Id, Label: r.Code, r.CategoryId, SupplierId: (string?)null)))
                .Concat(library.ResourcePrices.Select(p => (Entity: IssueEntity.Price, p.Id,
                    Label: resourcesById.TryGetValue(p.ResourceId, out var res) ? res.Code : p.Id, CategoryId: (string?)null, p.SupplierId)));
            foreach (var r in refs)
            {
                if (!string.IsNullOrEmpty(r.CategoryId) && !categoryIds.Contains(r.CategoryId!))
                {
                    issues.Add(new LibraryIssue(IssueKind.BrokenCategory, IssueSeverity.Warning, r.Entity, r.Id, r.Label,
                        "Trỏ tới nhóm không còn tồn tại; hãy chọn lại nhóm."));
                }
                if (!string.IsNullOrEmpty(r.SupplierId) && !supplierIds.Contains(r.SupplierId!))
                {
                    issues.Add(new LibraryIssue(IssueKind.BrokenSupplier, IssueSeverity.Warning, r.Entity, r.Id, r.Label,
                        "Trỏ tới nhà cung cấp không còn tồn tại; hãy chọn lại."));
                }
            }

            // Cùng tên (không phân biệt dấu, hoa thường) nhưng khác bản ghi: chỉ cảnh báo, không gộp.
            void SameNames<T>(IEnumerable<T> items, System.Func<T, string> id, System.Func<T, string> code, System.Func<T, string> name, IssueEntity entity, string what)
            {
                var groups = items.Where(i => Search.NormalizeForSearch(name(i)) != "")
                    .GroupBy(i => Search.NormalizeForSearch(name(i)))
                    .Where(g => g.Count() > 1);
                foreach (var list in groups)
                {
                    foreach (var item in list)
                    {
                        var others = string.Join(", ", list.Where(x => id(x) != id(item)).Select(code));
                        issues.Add(new LibraryIssue(IssueKind.SameName, IssueSeverity.Warning, entity, id(item), code(item),
                            $"{what} cùng tên \"{name(item)}\" với mã {others}: kiểm tra có bị nhập trùng không."));
                    }
                }
            }
            SameNames(library.WorkItems, w => w.Id, w => w.Code, w => w.Name, IssueEntity.WorkItem, "Công tác");
            SameNames(library.Resources, r => r.Id, r => r.Code, r => r.Name, IssueEntity.Resource, "Tài nguyên");

            // Nhiều giá đang dùng có thời gian hiệu lực chồng nhau: add-in không tự chọn giá nào là đúng.
            foreach (var r in library.Resources)
            {
                var active = library.ResourcePrices.Where(p => p.ResourceId == r.Id && p.Status == PriceStatus.Active).ToList();
                var overlapping = active.Where((p, i) => active.Where((q, j) => i != j)
                    .Any(q => Dates.PeriodsOverlap(p.EffectiveFrom, p.EffectiveTo, q.EffectiveFrom, q.EffectiveTo))).ToList();
                if (overlapping.Count > 1)
                {
                    issues.Add(new LibraryIssue(IssueKind.OverlappingPrices, IssueSeverity.Warning, IssueEntity.Resource, r.Id, r.Code,
                        $"Có {overlapping.Count} giá đang dùng với thời gian hiệu lực chồng nhau; hãy tự xác định giá áp dụng."));
                }
            }

            return issues;
        }

        private static List<string> Missing(string code, string name, string unit)
        {
            var missing = new List<string>();
            if (code.Trim() == "")
            {
                missing.Add("mã");
            }
            if (name.Trim() == "")
            {
                missing.Add("tên");
            }
            if (unit.Trim() == "")
            {
                missing.Add("đơn vị tính");
            }
            return missing;
        }

        private static string FirstNonEmpty(params string[] values) => values.FirstOrDefault(v => v != "") ?? "";
    }
}
