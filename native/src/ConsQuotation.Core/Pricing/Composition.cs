using System;
using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;

namespace ConsQuotation.Core.Pricing
{
    public sealed class PriceOption
    {
        public PriceOption(ResourcePrice price, Validity validity, bool unitMatches, bool usable)
        {
            Price = price;
            Validity = validity;
            UnitMatches = unitMatches;
            Usable = usable;
        }

        public ResourcePrice Price { get; }
        public Validity Validity { get; }
        /// <summary>Đơn vị của giá trùng đơn vị tài nguyên.</summary>
        public bool UnitMatches { get; }
        /// <summary>Đang dùng, còn hiệu lực (hoặc không ghi hiệu lực) và cùng đơn vị.</summary>
        public bool Usable { get; }
    }

    public sealed class CompositionLine
    {
        public CompositionLine(Norm norm, NormComponent component, decimal consumption, Resource? resource, IReadOnlyList<PriceOption> options, string? defaultPriceId)
        {
            Norm = norm;
            Component = component;
            Consumption = consumption;
            Resource = resource;
            Options = options;
            DefaultPriceId = defaultPriceId;
        }

        public Norm Norm { get; }
        public NormComponent Component { get; }
        /// <summary>Hao phí tính toán = hao phí cơ sở × (1 + hao hụt), trừ khi định mức đã gồm hao hụt.</summary>
        public decimal Consumption { get; }
        public Resource? Resource { get; }
        public IReadOnlyList<PriceOption> Options { get; }
        /// <summary>Chọn sẵn khi chỉ có đúng một giá dùng được (hoặc giá đã lưu vẫn dùng được); null = người dùng chọn.</summary>
        public string? DefaultPriceId { get; }
    }

    public sealed class CompositionResult
    {
        public bool Ok => Errors.Count == 0;
        public List<string> Errors { get; } = new List<string>();
        public List<string> Warnings { get; } = new List<string>();
        /// <summary>Tiền tệ chung của các giá đã chọn ("" nếu chưa chọn giá nào).</summary>
        public string Currency { get; set; } = "";
        /// <summary>Tạm tính trong add-in (để hiển thị); giá trị ghi vào báo giá do Excel tính. null = còn thiếu.</summary>
        public decimal? Preview { get; set; }
        public int MissingCount { get; set; }
        /// <summary>Các dòng ghi vào bảng phân tích theo thứ tự Analysis.Columns (string hoặc decimal).</summary>
        public List<object[]> Rows { get; } = new List<object[]>();
    }

    /// <summary>
    /// Đơn giá phân tích cấu thành từ định mức + giá tài nguyên do người dùng nhập (prompts/10), chuyển từ
    /// src/domain/pricing/composition.ts. Add-in chỉ chọn sẵn giá khi tài nguyên có ĐÚNG MỘT giá dùng được;
    /// giá khác đơn vị không chọn được; không chọn giá → đơn giá công tác để trống (không phải 0).
    /// </summary>
    public static class Composition
    {
        /// <summary>Dấu hiệu trong Ghi chú để nhận ra dòng báo giá lấy đơn giá từ sheet phân tích.</summary>
        public const string NotePrefix = "Phân tích định mức:";

        public static string ResourceTypeText(ResourceType type) =>
            type == ResourceType.Material ? "Vật liệu"
            : type == ResourceType.Labor ? "Nhân công"
            : type == ResourceType.Machine ? "Máy thi công"
            : "Khác";

        /// <summary>Phiên bản định mức đang dùng của công tác (mỗi công tác tối đa một phiên bản đang dùng).</summary>
        public static Norm? ApprovedNormFor(WorkItem item, LibrarySnapshot library) =>
            library.Norms.FirstOrDefault(n => n.WorkItemId == item.Id && n.Status == NormStatus.Approved);

        public static decimal EffectiveConsumption(Norm norm, NormComponent component) =>
            norm.WasteIncluded || !(component.WasteRate > 0)
                ? component.Consumption
                : DecimalMath.Normalize(component.Consumption * (1m + component.WasteRate));

        public static List<CompositionLine> Lines(WorkItem item, LibrarySnapshot library, string today)
        {
            var norm = ApprovedNormFor(item, library);
            if (norm == null)
            {
                return new List<CompositionLine>();
            }
            var resources = library.Resources.GroupBy(r => r.Id).ToDictionary(g => g.Key, g => g.First());
            return library.NormComponents
                .Where(c => c.NormId == norm.Id)
                .Select((c, index) => (c, index))
                .OrderBy(x => x.c.SortOrder)
                .ThenBy(x => x.c.CreatedAt, StringComparer.Ordinal)
                .ThenBy(x => x.index)
                .Select(x =>
                {
                    var component = x.c;
                    resources.TryGetValue(component.ResourceId, out var resource);
                    var options = library.ResourcePrices
                        .Where(p => p.ResourceId == component.ResourceId)
                        .Select((price, index) =>
                        {
                            var validity = Dates.ValidityOn(price.EffectiveFrom, price.EffectiveTo, today);
                            var unitMatches = resource != null && Names.NormalizeCode(price.Unit) == Names.NormalizeCode(resource.Unit);
                            var usable = unitMatches && price.Status == PriceStatus.Active &&
                                         (validity == Validity.Active || validity == Validity.NoDates);
                            return (Option: new PriceOption(price, validity, unitMatches, usable), index);
                        })
                        // Dùng được trước; trong cùng nhóm, giá có hiệu lực mới hơn trước.
                        .OrderBy(o => o.Option.Usable ? 0 : 1)
                        .ThenByDescending(o => o.Option.Price.EffectiveFrom ?? "", StringComparer.Ordinal)
                        .ThenBy(o => o.index)
                        .Select(o => o.Option)
                        .ToList();
                    var usableOptions = options.Where(o => o.Usable).ToList();
                    // Giá đã chọn trong định mức được dùng làm mặc định nếu vẫn dùng được.
                    var saved = usableOptions.FirstOrDefault(o => o.Price.Id == component.PriceId);
                    var defaultPriceId = saved != null ? saved.Price.Id : usableOptions.Count == 1 ? usableOptions[0].Price.Id : null;
                    return new CompositionLine(norm, component, EffectiveConsumption(norm, component), resource, options, defaultPriceId);
                })
                .ToList();
        }

        /// <summary>componentId → priceId đã chọn ("" = để trống, nhập sau trên sheet).</summary>
        public static Dictionary<string, string> DefaultSelection(IEnumerable<CompositionLine> lines) =>
            lines.ToDictionary(l => l.Component.Id, l => l.DefaultPriceId ?? "");

        /// <summary>Chữ ghi vào ô: tiền tố ' để Excel giữ nguyên ("007" không thành 7, "1/2" không thành ngày).</summary>
        private static string Text(string value) => value == "" ? "" : "'" + value;

        private static string SourceText(ResourcePrice price)
        {
            var parts = new List<string> { price.Source != "" ? price.Source : "Không ghi nguồn" };
            if (!string.IsNullOrEmpty(price.EffectiveFrom) || !string.IsNullOrEmpty(price.EffectiveTo))
            {
                var from = Dates.FormatIsoDate(price.EffectiveFrom);
                var to = Dates.FormatIsoDate(price.EffectiveTo);
                parts.Add($"hiệu lực {(from != "" ? from : "…")} – {(to != "" ? to : "…")}");
            }
            parts.Add(price.Currency);
            return string.Join("; ", parts);
        }

        public static CompositionResult Build(WorkItem item, IReadOnlyList<CompositionLine> lines, IReadOnlyDictionary<string, string> selection, RoundingRule unitPriceRule)
        {
            var result = new CompositionResult();
            if (lines.Count == 0)
            {
                result.Errors.Add($"Công tác \"{item.Code}\" chưa có định mức trong thư viện.");
            }
            var chosen = lines.Select(line =>
            {
                var id = selection.TryGetValue(line.Component.Id, out var value) ? value : "";
                return (Line: line, Option: line.Options.FirstOrDefault(o => o.Price.Id == id));
            }).ToList();
            foreach (var (line, option) in chosen)
            {
                if (line.Resource == null)
                {
                    result.Errors.Add("Định mức trỏ tới tài nguyên không còn tồn tại. Hãy sửa định mức trong thư viện.");
                }
                else if (option != null && !option.UnitMatches)
                {
                    result.Errors.Add($"Giá chọn cho \"{line.Resource.Code}\" có đơn vị {option.Price.Unit}, khác đơn vị tài nguyên {line.Resource.Unit}.");
                }
                else if (option != null && option.Price.Status == PriceStatus.Inactive)
                {
                    result.Warnings.Add($"Giá chọn cho \"{line.Resource.Code}\" đang ở trạng thái Ngưng dùng.");
                }
                else if (option != null && (option.Validity == Validity.Expired || option.Validity == Validity.NotYetEffective))
                {
                    result.Warnings.Add($"Giá chọn cho \"{line.Resource.Code}\" {(option.Validity == Validity.Expired ? "đã hết hiệu lực" : "chưa có hiệu lực")}.");
                }
            }
            var currencies = chosen.Where(c => c.Option != null).Select(c => c.Option!.Price.Currency.Trim()).Distinct().ToList();
            if (currencies.Count > 1)
            {
                result.Errors.Add($"Các giá đã chọn khác tiền tệ ({string.Join(", ", currencies)}). Hãy chọn giá cùng một tiền tệ.");
            }
            result.MissingCount = chosen.Count(c => c.Option == null);
            if (result.MissingCount > 0 && lines.Count > 0)
            {
                result.Warnings.Add(
                    $"{result.MissingCount} tài nguyên chưa chọn giá: đơn giá công tác sẽ để trống cho tới khi bạn nhập \"Đơn giá nguồn\" trên sheet \"{Analysis.SheetName}\".");
            }
            if (result.MissingCount == 0 && lines.Count > 0)
            {
                var sum = chosen.Sum(c => c.Line.Consumption * c.Option!.Price.Price);
                result.Preview = DecimalMath.Normalize(Rounding.Apply(sum, unitPriceRule));
            }

            var lineAmount = Analysis.LineAmountFormula();
            var unitPrice = Analysis.UnitPriceFormula(unitPriceRule);
            foreach (var (line, option) in chosen)
            {
                result.Rows.Add(Analysis.Columns.Select(column => (object)(column.Key switch
                {
                    AnalysisColumnKey.Code => Text(item.Code),
                    AnalysisColumnKey.Name => Text(item.Name),
                    AnalysisColumnKey.Unit => Text(item.Unit),
                    AnalysisColumnKey.ResourceCode => Text(line.Resource?.Code ?? ""),
                    AnalysisColumnKey.ResourceName => Text(line.Resource?.Name ?? ""),
                    AnalysisColumnKey.ResourceType => line.Resource != null ? ResourceTypeText(line.Resource.Type) : "",
                    AnalysisColumnKey.ResourceUnit => Text(line.Resource?.Unit ?? ""),
                    AnalysisColumnKey.Quantity => line.Consumption,
                    AnalysisColumnKey.Price => option != null ? (object)option.Price.Price : "",
                    AnalysisColumnKey.LineAmount => lineAmount,
                    AnalysisColumnKey.UnitPrice => unitPrice,
                    _ => Text(SourceCell(line, option)),
                })).ToArray());
            }
            result.Currency = currencies.FirstOrDefault() ?? "";
            return result;
        }

        private static string SourceCell(CompositionLine line, PriceOption? option)
        {
            var source = option != null ? SourceText(option.Price) : "Chưa chọn giá: nhập Đơn giá nguồn";
            var waste = line.Consumption != line.Component.Consumption
                ? $"; hao phí gồm hao hụt {DecimalInput.Format(line.Component.WasteRate * 100m)}% (cơ sở {DecimalInput.Format(line.Component.Consumption)})"
                : "";
            return $"{source}{waste}; định mức {line.Norm.Code} v{line.Norm.Version}";
        }

        public static string Note(WorkItem item, int resourceCount, string currency)
        {
            // Ngắn gọn để ít dòng khi in; chi tiết nằm ở sheet phân tích.
            var parts = new List<string> { $"{NotePrefix} {item.Code}", $"{resourceCount} tài nguyên" };
            if (currency != "")
            {
                parts.Add($"tiền tệ: {currency}");
            }
            return string.Join("; ", parts);
        }
    }
}
