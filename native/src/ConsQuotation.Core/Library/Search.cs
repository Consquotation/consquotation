using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace ConsQuotation.Core.Library
{
    public enum SortKey
    {
        Code,
        Name,
        Price,
    }

    public class ListFilter
    {
        /// <summary>Giá trị lọc "chưa phân nhóm" / "không có nhà cung cấp" (khác "" = tất cả).</summary>
        public const string None = "__none__";

        public string Query { get; set; } = "";
        /// <summary>"" = tất cả; None = chưa phân nhóm; còn lại là id danh mục.</summary>
        public string CategoryId { get; set; } = "";
        /// <summary>"" = tất cả; None = không có nhà cung cấp; còn lại là id nhà cung cấp.</summary>
        public string SupplierId { get; set; } = "";
        public SortKey Sort { get; set; } = SortKey.Code;
    }

    public sealed class ResourceFilter : ListFilter
    {
        /// <summary>null = mọi loại.</summary>
        public ResourceType? Type { get; set; }
    }

    /// <summary>Tên danh mục/nhà cung cấp theo id, dựng một lần cho mỗi lần thư viện đổi.</summary>
    public sealed class NameLookup
    {
        public NameLookup(IEnumerable<Category> categories, IEnumerable<Supplier> suppliers)
        {
            Category = categories.GroupBy(c => c.Id).ToDictionary(g => g.Key, g => g.First().Name);
            Supplier = suppliers.GroupBy(s => s.Id).ToDictionary(g => g.Key, g => g.First().Name);
        }

        public static NameLookup Empty => new NameLookup(new Category[0], new Supplier[0]);

        public static NameLookup Of(LibrarySnapshot library) => new NameLookup(library.Categories, library.Suppliers);

        public IReadOnlyDictionary<string, string> Category { get; }
        public IReadOnlyDictionary<string, string> Supplier { get; }

        public string CategoryName(string? id) => id != null && Category.TryGetValue(id, out var name) ? name : "";
        public string SupplierName(string? id) => id != null && Supplier.TryGetValue(id, out var name) ? name : "";
    }

    /// <summary>Giá hiện hành để hiển thị và sắp xếp.</summary>
    public sealed class CurrentPrice
    {
        public CurrentPrice(ResourcePrice? price, int activeCount)
        {
            Price = price;
            ActiveCount = activeCount;
        }

        /// <summary>Giá đang dùng và còn hiệu lực hôm nay, CHỈ khi có đúng một giá như vậy.</summary>
        public ResourcePrice? Price { get; }

        /// <summary>Số giá đang dùng còn hiệu lực hôm nay (>1: người dùng phải tự chọn khi dùng).</summary>
        public int ActiveCount { get; }
    }

    public sealed class CategoryUsage
    {
        public int WorkItems { get; set; }
        public int Resources { get; set; }
    }

    public sealed class SupplierUsage
    {
        public int WorkItems { get; set; }
        public int Prices { get; set; }
    }

    public static class Search
    {
        private static readonly CompareInfo ViCompare = CultureInfo.GetCultureInfo("vi-VN").CompareInfo;

        /// <summary>
        /// Chuẩn hóa để tìm kiếm không phân biệt hoa thường và dấu tiếng Việt: "Bê tông" ~ "be tong",
        /// "Đào" ~ "dao".
        /// </summary>
        public static string NormalizeForSearch(string text)
        {
            var decomposed = text.Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder(decomposed.Length);
            foreach (var ch in decomposed)
            {
                // Bỏ dấu kết hợp U+0300–U+036F (cùng phạm vi với bản web).
                if (ch >= '̀' && ch <= 'ͯ')
                {
                    continue;
                }
                builder.Append(ch == 'đ' ? 'd' : ch == 'Đ' ? 'D' : ch);
            }
            return Names.CollapseSpaces(builder.ToString().ToLowerInvariant()).Trim();
        }

        /// <summary>So sánh chữ theo tiếng Việt.</summary>
        public static int CompareText(string a, string b) => ViCompare.Compare(a, b, CompareOptions.None);

        /// <summary>So sánh mã: số trong mã theo giá trị ("BT-2" &lt; "BT-10"), phần chữ theo tiếng Việt.</summary>
        public static int CompareCodes(string a, string b)
        {
            int i = 0, j = 0;
            while (i < a.Length && j < b.Length)
            {
                var digitA = char.IsDigit(a[i]);
                var digitB = char.IsDigit(b[j]);
                var endA = Run(a, i, digitA);
                var endB = Run(b, j, digitB);
                var chunkA = a.Substring(i, endA - i);
                var chunkB = b.Substring(j, endB - j);
                int cmp;
                if (digitA && digitB)
                {
                    cmp = CompareNumberText(chunkA, chunkB);
                }
                else
                {
                    cmp = ViCompare.Compare(chunkA, chunkB, CompareOptions.None);
                }
                if (cmp != 0)
                {
                    return cmp;
                }
                i = endA;
                j = endB;
            }
            return (a.Length - i).CompareTo(b.Length - j);
        }

        private static int Run(string text, int start, bool digits)
        {
            var end = start;
            while (end < text.Length && char.IsDigit(text[end]) == digits)
            {
                end++;
            }
            return end;
        }

        private static int CompareNumberText(string a, string b)
        {
            var x = a.TrimStart('0');
            var y = b.TrimStart('0');
            if (x.Length != y.Length)
            {
                return x.Length.CompareTo(y.Length);
            }
            var cmp = string.CompareOrdinal(x, y);
            return cmp != 0 ? Math.Sign(cmp) : a.Length.CompareTo(b.Length);
        }

        private static string[] QueryTerms(string query) =>
            NormalizeForSearch(query).Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);

        /// <summary>Mọi từ trong truy vấn phải xuất hiện ở ít nhất một trường.</summary>
        private static bool Matches(IEnumerable<string> fields, string[] terms)
        {
            if (terms.Length == 0)
            {
                return true;
            }
            var haystack = string.Join(" ", fields.Select(NormalizeForSearch));
            return terms.All(term => haystack.Contains(term));
        }

        private static bool RefMatches(string filterValue, IEnumerable<string?> refs)
        {
            if (filterValue == "")
            {
                return true;
            }
            if (filterValue == ListFilter.None)
            {
                return refs.All(r => r == null);
            }
            return refs.Contains(filterValue);
        }

        private static int CompareByCodeThenName(string codeA, string nameA, string codeB, string nameB)
        {
            var cmp = CompareCodes(codeA, codeB);
            return cmp != 0 ? cmp : CompareText(nameA, nameB);
        }

        private static Comparison<T> Comparator<T>(SortKey sort, Func<T, string> code, Func<T, string> name, Func<T, decimal?> priceOf)
        {
            if (sort == SortKey.Name)
            {
                return (a, b) =>
                {
                    var cmp = CompareText(name(a), name(b));
                    return cmp != 0 ? cmp : CompareCodes(code(a), code(b));
                };
            }
            if (sort == SortKey.Price)
            {
                // Giá tăng dần; chưa có giá luôn ở cuối, rồi theo mã.
                return (a, b) =>
                {
                    var pa = priceOf(a);
                    var pb = priceOf(b);
                    if (pa == null || pb == null)
                    {
                        if (pa == null && pb == null)
                        {
                            return CompareByCodeThenName(code(a), name(a), code(b), name(b));
                        }
                        return pa == null ? 1 : -1;
                    }
                    var cmp = pa.Value.CompareTo(pb.Value);
                    return cmp != 0 ? cmp : CompareByCodeThenName(code(a), name(a), code(b), name(b));
                };
            }
            return (a, b) => CompareByCodeThenName(code(a), name(a), code(b), name(b));
        }

        private static List<T> StableSort<T>(IEnumerable<T> items, Comparison<T> comparison)
        {
            // List.Sort không ổn định; giữ thứ tự gốc khi bằng nhau như Array.prototype.sort.
            return items
                .Select((item, index) => (item, index))
                .OrderBy(x => x, Comparer<(T item, int index)>.Create((x, y) =>
                {
                    var cmp = comparison(x.item, y.item);
                    return cmp != 0 ? cmp : x.index.CompareTo(y.index);
                }))
                .Select(x => x.item)
                .ToList();
        }

        /// <summary>
        /// Tìm công tác theo mã/tên/nhóm/đơn vị/nhà cung cấp/nguồn (không phân biệt dấu), lọc theo nhóm và
        /// nhà cung cấp, sắp xếp theo mã (mặc định), tên hoặc đơn giá.
        /// </summary>
        public static List<WorkItem> SearchWorkItems(IEnumerable<WorkItem> items, ListFilter? filter = null, NameLookup? lookup = null)
        {
            var f = filter ?? new ListFilter();
            var names = lookup ?? NameLookup.Empty;
            var terms = QueryTerms(f.Query);
            var found = items.Where(item =>
                RefMatches(f.CategoryId, new[] { item.CategoryId }) &&
                RefMatches(f.SupplierId, new[] { item.SupplierId }) &&
                Matches(new[]
                {
                    item.Code, item.Name, names.CategoryName(item.CategoryId), item.Unit,
                    names.SupplierName(item.SupplierId), item.Source,
                }, terms));
            return StableSort(found, Comparator<WorkItem>(f.Sort, w => w.Code, w => w.Name, w => w.UnitPrice));
        }

        /// <summary>
        /// Giá hiện hành. Không tự chọn "giá mới nhất" khi có nhiều giá cùng hiệu lực (prompts/10): khi đó
        /// Price = null và ActiveCount &gt; 1.
        /// </summary>
        public static CurrentPrice CurrentPrice(string resourceId, IEnumerable<ResourcePrice> prices, string today)
        {
            var usable = prices.Where(p =>
            {
                if (p.ResourceId != resourceId || p.Status != PriceStatus.Active)
                {
                    return false;
                }
                var validity = Dates.ValidityOn(p.EffectiveFrom, p.EffectiveTo, today);
                return validity == Validity.Active || validity == Validity.NoDates;
            }).ToList();
            return new CurrentPrice(usable.Count == 1 ? usable[0] : null, usable.Count);
        }

        /// <summary>
        /// Tìm tài nguyên theo mã/tên/nhóm/đơn vị; lọc theo nhóm, loại và nhà cung cấp (của bất kỳ giá nào);
        /// sắp xếp theo mã, tên hoặc giá hiện hành.
        /// </summary>
        public static List<Resource> SearchResources(
            IEnumerable<Resource> resources,
            IReadOnlyCollection<ResourcePrice> prices,
            ResourceFilter? filter = null,
            NameLookup? lookup = null,
            string today = "")
        {
            var f = filter ?? new ResourceFilter();
            var names = lookup ?? NameLookup.Empty;
            var terms = QueryTerms(f.Query);
            var suppliersOf = prices.GroupBy(p => p.ResourceId).ToDictionary(g => g.Key, g => g.Select(p => p.SupplierId).ToList());
            var priceCache = new Dictionary<string, decimal?>();
            decimal? PriceOf(Resource r)
            {
                if (!priceCache.TryGetValue(r.Id, out var value))
                {
                    value = CurrentPrice(r.Id, prices, today).Price?.Price;
                    priceCache[r.Id] = value;
                }
                return value;
            }
            var found = resources.Where(r =>
                (f.Type == null || r.Type == f.Type) &&
                RefMatches(f.CategoryId, new[] { r.CategoryId }) &&
                RefMatches(f.SupplierId, suppliersOf.TryGetValue(r.Id, out var list) ? list : new List<string?> { null }) &&
                Matches(new[] { r.Code, r.Name, names.CategoryName(r.CategoryId), r.Unit }, terms));
            return StableSort(found, Comparator<Resource>(f.Sort, r => r.Code, r => r.Name, PriceOf));
        }

        /// <summary>Số công tác và tài nguyên của từng danh mục; khóa ListFilter.None là chưa phân nhóm.</summary>
        public static Dictionary<string, CategoryUsage> CategoryUsageOf(LibrarySnapshot library)
        {
            var usage = new Dictionary<string, CategoryUsage>();
            CategoryUsage Get(string? id)
            {
                var key = id ?? ListFilter.None;
                if (!usage.TryGetValue(key, out var current))
                {
                    current = new CategoryUsage();
                    usage[key] = current;
                }
                return current;
            }
            foreach (var w in library.WorkItems)
            {
                Get(w.CategoryId).WorkItems++;
            }
            foreach (var r in library.Resources)
            {
                Get(r.CategoryId).Resources++;
            }
            return usage;
        }

        public static Dictionary<string, SupplierUsage> SupplierUsageOf(LibrarySnapshot library)
        {
            var usage = new Dictionary<string, SupplierUsage>();
            SupplierUsage? Get(string? id)
            {
                if (id == null)
                {
                    return null;
                }
                if (!usage.TryGetValue(id, out var current))
                {
                    current = new SupplierUsage();
                    usage[id] = current;
                }
                return current;
            }
            foreach (var w in library.WorkItems)
            {
                var u = Get(w.SupplierId);
                if (u != null)
                {
                    u.WorkItems++;
                }
            }
            foreach (var p in library.ResourcePrices)
            {
                var u = Get(p.SupplierId);
                if (u != null)
                {
                    u.Prices++;
                }
            }
            return usage;
        }
    }
}
