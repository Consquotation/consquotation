using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;

namespace ConsQuotation.Core.Pricing
{
    public enum CalcStatus
    {
        Valid,
        ValidWithWarnings,
        Invalid,
    }

    public enum CalcSeverity
    {
        Error,
        Warning,
    }

    public enum ComponentSeverity
    {
        Ok,
        Warning,
        Error,
    }

    /// <summary>Mã lỗi/cảnh báo ổn định (dùng trong test, tài liệu và để giao diện chỉ đúng chỗ).</summary>
    public enum CalcIssueCode
    {
        NormNotFound,
        EmptyNorm,
        NormInactive,
        MissingWorkUnit,
        NoResourceLink,
        ResourceMissing,
        ResourceUnitChanged,
        ResourceRenamed,
        ResourceTypeChanged,
        DuplicateComponent,
        InvalidConsumption,
        ZeroConsumption,
        InvalidWasteRate,
        WasteIgnored,
        MissingPrice,
        AmbiguousPrice,
        SelectedPriceMissing,
        PriceUnitMismatch,
        InvalidPrice,
        ZeroPrice,
        InactivePrice,
        PriceNotInEffect,
        CurrencyMismatch,
        Overflow,
    }

    public sealed class CalcIssue
    {
        public CalcIssue(CalcIssueCode code, CalcSeverity severity, string message, string? componentId)
        {
            Code = code;
            Severity = severity;
            Message = message;
            ComponentId = componentId;
        }

        public CalcIssueCode Code { get; }
        public CalcSeverity Severity { get; }
        /// <summary>Thành phần liên quan (nếu có).</summary>
        public string? ComponentId { get; }
        public string Message { get; }

        public override string ToString() => $"{Code}: {Message}";
    }

    public sealed class ComponentResult
    {
        public string ComponentId { get; set; } = "";
        public int SortOrder { get; set; }
        public string ResourceId { get; set; } = "";
        /// <summary>Thông tin tài nguyên hiện tại; tài nguyên đã bị xóa thì lấy theo snapshot.</summary>
        public string ResourceCode { get; set; } = "";
        public string ResourceName { get; set; } = "";
        public string ResourceUnit { get; set; } = "";
        public ResourceType Type { get; set; }
        public decimal BaseConsumption { get; set; }
        public decimal WasteRate { get; set; }
        public bool WasteApplied { get; set; }
        /// <summary>Hao phí tính toán = hao phí cơ sở × (1 + hao hụt), chính xác.</summary>
        public decimal EffectiveConsumption { get; set; }
        public string? PriceId { get; set; }
        public decimal? UnitPrice { get; set; }
        public string PriceUnit { get; set; } = "";
        public string Currency { get; set; } = "";
        public string PriceSource { get; set; } = "";
        public decimal? Amount { get; set; }
        public ComponentSeverity Severity { get; set; }
    }

    public sealed class NormCalcResult
    {
        public string NormId { get; set; } = "";
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string Unit { get; set; } = "";
        public string Version { get; set; } = "";
        public CalcStatus Status { get; set; }
        public List<ComponentResult> Components { get; set; } = new List<ComponentResult>();
        /// <summary>Chi phí theo loại tài nguyên; mọi giá trị null khi kết quả không hợp lệ.</summary>
        public Dictionary<ResourceType, decimal?> TotalsByType { get; set; } = NormCalc.EmptyTotals();
        /// <summary>Đơn giá tổng hợp sau khi làm tròn theo quy tắc; null khi không hợp lệ.</summary>
        public decimal? UnitPrice { get; set; }
        /// <summary>Tổng chính xác trước khi làm tròn.</summary>
        public decimal? UnitPriceExact { get; set; }
        public string Currency { get; set; } = "";
        public RoundingRule Rounding { get; set; } = Pricing.Rounding.NoRounding;
        public List<CalcIssue> Issues { get; set; } = new List<CalcIssue>();
        public string CalculatedAt { get; set; } = "";
        /// <summary>
        /// Dấu vân tay dữ liệu đầu vào (định mức, thành phần, tài nguyên, giá đã dùng). Trước khi dùng kết
        /// quả, tính lại với thư viện mới đọc: khác vân tay = dữ liệu đã đổi.
        /// </summary>
        public string InputFingerprint { get; set; } = "";
    }

    public sealed class CalcOptions
    {
        public CalcOptions(string today, string now)
        {
            Today = today;
            Now = now;
        }

        /// <summary>Ngày tính hiệu lực giá (YYYY-MM-DD).</summary>
        public string Today { get; }
        /// <summary>Thời điểm tính (ISO) ghi vào kết quả.</summary>
        public string Now { get; }
        /// <summary>componentId → priceId người dùng chọn; không có thì chỉ chọn khi có đúng một giá dùng được.</summary>
        public IReadOnlyDictionary<string, string>? PriceSelection { get; set; }
        /// <summary>Quy tắc làm tròn đơn giá tổng hợp; mặc định không làm tròn.</summary>
        public RoundingRule? Rounding { get; set; }
    }

    /// <summary>
    /// Bộ máy tính đơn giá từ định mức (ADR-0013), chuyển từ src/domain/pricing/normCalc.ts.
    /// Hao phí tính toán = hao phí cơ sở × (1 + hao hụt) (bỏ hao hụt nếu định mức đã gồm hao hụt);
    /// chi phí thành phần = hao phí tính toán × đơn giá tài nguyên; đơn giá tổng hợp = Σ chi phí, làm tròn
    /// MỘT lần theo quy tắc (nếu có). Dữ liệu thiếu hoặc sai thì kết quả "invalid" và đơn giá null,
    /// không bao giờ thay bằng 0.
    /// </summary>
    public static class NormCalc
    {
        /// <summary>Tỷ lệ hao hụt tối đa chấp nhận: 100%. Lớn hơn gần như chắc chắn là nhập nhầm.</summary>
        public const decimal MaxWasteRate = 1m;

        /// <summary>Excel giữ 15 chữ số có nghĩa: kết quả có phần nguyên dài hơn bị coi là vượt giới hạn.</summary>
        public const int MaxIntegerDigits = 15;

        private static readonly ResourceType[] ResourceTypes =
            { ResourceType.Material, ResourceType.Labor, ResourceType.Machine, ResourceType.Other };

        public static Dictionary<ResourceType, decimal?> EmptyTotals() =>
            ResourceTypes.ToDictionary(t => t, t => (decimal?)null);

        /// <summary>Giá dùng được để tự chọn: đang dùng, còn hiệu lực (hoặc không ghi hiệu lực), cùng đơn vị tài nguyên.</summary>
        public static List<ResourcePrice> UsablePrices(Resource resource, IEnumerable<ResourcePrice> prices, string today) =>
            prices.Where(p =>
            {
                if (p.ResourceId != resource.Id || p.Status != PriceStatus.Active)
                {
                    return false;
                }
                var validity = Dates.ValidityOn(p.EffectiveFrom, p.EffectiveTo, today);
                return (validity == Validity.Active || validity == Validity.NoDates) &&
                       Names.NormalizeCode(p.Unit) == Names.NormalizeCode(resource.Unit);
            }).ToList();

        /// <summary>Băm djb2 32-bit, cùng thuật toán với bản web (chuỗi hex không đệm số 0).</summary>
        internal static string HashText(string text)
        {
            unchecked
            {
                var hash = 5381;
                foreach (var ch in text)
                {
                    hash = (hash << 5) + hash + ch;
                }
                return ((uint)hash).ToString("x", CultureInfo.InvariantCulture);
            }
        }

        /// <summary>Tính theo id định mức; định mức không tồn tại trả về kết quả invalid.</summary>
        public static NormCalcResult CalculateById(string normId, LibrarySnapshot library, CalcOptions options)
        {
            var norm = library.Norms.FirstOrDefault(n => n.Id == normId);
            if (norm == null)
            {
                return new NormCalcResult
                {
                    NormId = normId,
                    Status = CalcStatus.Invalid,
                    Rounding = options.Rounding ?? Rounding.NoRounding,
                    Issues = { new CalcIssue(CalcIssueCode.NormNotFound, CalcSeverity.Error, NormCalcStrings.NormNotFound, null) },
                    CalculatedAt = options.Now,
                };
            }
            return Calculate(norm, library.NormComponents.Where(c => c.NormId == norm.Id), library, options);
        }

        /// <summary>
        /// Kiểm tra lại ngay trước khi ghi kết quả ra Excel: tính lại với thư viện vừa đọc. Trả về định mức và
        /// kết quả mới khi vân tay đầu vào trùng lần hiển thị; null khi định mức đã bị xóa hoặc dữ liệu đã đổi.
        /// </summary>
        public static (Norm Norm, NormCalcResult Result)? Recheck(NormCalcResult shown, LibrarySnapshot fresh, CalcOptions options)
        {
            var norm = fresh.Norms.FirstOrDefault(n => n.Id == shown.NormId);
            if (norm == null)
            {
                return null;
            }
            var result = Calculate(norm, fresh.NormComponents.Where(c => c.NormId == norm.Id), fresh, options);
            return result.InputFingerprint == shown.InputFingerprint ? (norm, result) : ((Norm, NormCalcResult)?)null;
        }

        public static NormCalcResult Calculate(Norm norm, IEnumerable<NormComponent> components, LibrarySnapshot library, CalcOptions options)
        {
            var issues = new List<CalcIssue>();
            var rounding = options.Rounding ?? Rounding.NoRounding;
            var resources = library.Resources.GroupBy(r => r.Id).ToDictionary(g => g.Key, g => g.First());
            var sorted = components
                .Select((c, index) => (c, index))
                .OrderBy(x => x.c.SortOrder)
                .ThenBy(x => x.c.CreatedAt, StringComparer.Ordinal)
                .ThenBy(x => x.index)
                .Select(x => x.c)
                .ToList();

            void Issue(CalcIssueCode code, CalcSeverity severity, string message, string? componentId = null) =>
                issues.Add(new CalcIssue(code, severity, message, componentId));

            if (sorted.Count == 0)
            {
                Issue(CalcIssueCode.EmptyNorm, CalcSeverity.Error, NormCalcStrings.EmptyNorm);
            }
            if (norm.Status == NormStatus.Inactive)
            {
                Issue(CalcIssueCode.NormInactive, CalcSeverity.Warning, NormCalcStrings.NormInactiveText(norm.Version));
            }
            if (norm.Unit.Trim() == "")
            {
                Issue(CalcIssueCode.MissingWorkUnit, CalcSeverity.Error, NormCalcStrings.MissingWorkUnit);
            }

            var seenResources = new HashSet<string>();
            var fingerprint = new List<string>
            {
                $"{norm.Id}|{norm.UpdatedAt}|{(norm.WasteIncluded ? "true" : "false")}|{StatusText(norm.Status)}",
            };
            var exactAmounts = new List<(ResourceType Type, decimal Amount)>();
            var currencies = new List<string>();

            var results = new List<ComponentResult>();
            foreach (var component in sorted)
            {
                var id = component.Id;
                var severity = ComponentSeverity.Ok;
                void Fail(CalcIssueCode code, string message)
                {
                    Issue(code, CalcSeverity.Error, message, id);
                    severity = ComponentSeverity.Error;
                }
                void Warn(CalcIssueCode code, string message)
                {
                    Issue(code, CalcSeverity.Warning, message, id);
                    if (severity == ComponentSeverity.Ok)
                    {
                        severity = ComponentSeverity.Warning;
                    }
                }
                fingerprint.Add($"{id}|{component.UpdatedAt}");

                Resource? resource = null;
                if (component.ResourceId != "")
                {
                    resources.TryGetValue(component.ResourceId, out resource);
                }
                var label = !string.IsNullOrEmpty(resource?.Code) ? resource!.Code
                    : component.ResourceCodeSnapshot != "" ? component.ResourceCodeSnapshot : NormCalcStrings.Unnamed;
                if (component.ResourceId == "")
                {
                    Fail(CalcIssueCode.NoResourceLink, NormCalcStrings.NoResourceLink(label));
                }
                else if (resource == null)
                {
                    Fail(CalcIssueCode.ResourceMissing, NormCalcStrings.ResourceMissing(component.ResourceCodeSnapshot, component.ResourceNameSnapshot));
                }
                else
                {
                    fingerprint.Add($"{resource.Id}|{resource.UpdatedAt}");
                    if (Names.NormalizeCode(resource.Unit) != Names.NormalizeCode(component.ResourceUnitSnapshot))
                    {
                        // Hao phí được khai theo đơn vị cũ: không tự quy đổi đơn vị.
                        Fail(CalcIssueCode.ResourceUnitChanged,
                            NormCalcStrings.ResourceUnitChanged(resource.Code, component.ResourceUnitSnapshot, resource.Unit));
                    }
                    if (resource.Code != component.ResourceCodeSnapshot || resource.Name != component.ResourceNameSnapshot)
                    {
                        Warn(CalcIssueCode.ResourceRenamed,
                            NormCalcStrings.ResourceRenamed(component.ResourceCodeSnapshot, resource.Code, resource.Name));
                    }
                    if (resource.Type != component.ResourceTypeSnapshot)
                    {
                        Warn(CalcIssueCode.ResourceTypeChanged, NormCalcStrings.ResourceTypeChanged(resource.Code));
                    }
                    if (!seenResources.Add(resource.Id))
                    {
                        Fail(CalcIssueCode.DuplicateComponent, NormCalcStrings.DuplicateComponent(resource.Code));
                    }
                }

                // Hao phí và hao hụt.
                decimal? baseConsumption = null;
                if (component.Consumption < 0)
                {
                    Fail(CalcIssueCode.InvalidConsumption, NormCalcStrings.InvalidConsumption(label));
                }
                else
                {
                    baseConsumption = component.Consumption;
                    if (component.Consumption == 0)
                    {
                        Warn(CalcIssueCode.ZeroConsumption, NormCalcStrings.ZeroConsumption(label));
                    }
                }
                var wasteApplied = false;
                var wasteFactor = 1m;
                if (component.WasteRate < 0 || component.WasteRate > MaxWasteRate)
                {
                    Fail(CalcIssueCode.InvalidWasteRate, NormCalcStrings.InvalidWasteRate(label));
                }
                else if (component.WasteRate > 0)
                {
                    if (norm.WasteIncluded)
                    {
                        Warn(CalcIssueCode.WasteIgnored, NormCalcStrings.WasteIgnored(label));
                    }
                    else
                    {
                        wasteApplied = true;
                        wasteFactor += component.WasteRate;
                    }
                }
                var effective = baseConsumption.HasValue ? baseConsumption.Value * wasteFactor : 0m;

                // Đơn giá tài nguyên.
                ResourcePrice? price = null;
                if (resource != null)
                {
                    string? selectedId = null;
                    if (options.PriceSelection != null && options.PriceSelection.TryGetValue(id, out var chosen))
                    {
                        selectedId = chosen;
                    }
                    selectedId ??= component.PriceId;
                    if (!string.IsNullOrEmpty(selectedId))
                    {
                        price = library.ResourcePrices.FirstOrDefault(p => p.Id == selectedId && p.ResourceId == resource.Id);
                        if (price == null)
                        {
                            Fail(CalcIssueCode.SelectedPriceMissing, NormCalcStrings.SelectedPriceMissing(resource.Code));
                        }
                    }
                    else
                    {
                        var usable = UsablePrices(resource, library.ResourcePrices, options.Today);
                        if (usable.Count == 1)
                        {
                            price = usable[0];
                        }
                        else if (usable.Count > 1)
                        {
                            Fail(CalcIssueCode.AmbiguousPrice, NormCalcStrings.AmbiguousPrice(resource.Code, usable.Count));
                        }
                        else
                        {
                            Fail(CalcIssueCode.MissingPrice, NormCalcStrings.MissingPrice(resource.Code));
                        }
                    }
                }
                decimal? unitPrice = null;
                if (price != null && resource != null)
                {
                    fingerprint.Add($"{price.Id}|{price.UpdatedAt}");
                    if (Names.NormalizeCode(price.Unit) != Names.NormalizeCode(resource.Unit))
                    {
                        Fail(CalcIssueCode.PriceUnitMismatch, NormCalcStrings.PriceUnitMismatch(resource.Code, price.Unit, resource.Unit));
                    }
                    else if (price.Price < 0)
                    {
                        Fail(CalcIssueCode.InvalidPrice, NormCalcStrings.InvalidPrice(resource.Code));
                    }
                    else
                    {
                        unitPrice = price.Price;
                        var currency = price.Currency.Trim();
                        if (!currencies.Contains(currency))
                        {
                            currencies.Add(currency);
                        }
                        if (price.Price == 0)
                        {
                            Warn(CalcIssueCode.ZeroPrice, NormCalcStrings.ZeroPrice(resource.Code));
                        }
                        if (price.Status == PriceStatus.Inactive)
                        {
                            Warn(CalcIssueCode.InactivePrice, NormCalcStrings.InactivePrice(resource.Code));
                        }
                        var validity = Dates.ValidityOn(price.EffectiveFrom, price.EffectiveTo, options.Today);
                        if (validity == Validity.Expired || validity == Validity.NotYetEffective)
                        {
                            Warn(CalcIssueCode.PriceNotInEffect, NormCalcStrings.PriceNotInEffect(resource.Code, validity == Validity.Expired));
                        }
                    }
                }

                var type = resource?.Type ?? component.ResourceTypeSnapshot;
                decimal? amount = baseConsumption.HasValue && unitPrice.HasValue &&
                                  !issues.Any(i => i.ComponentId == id && i.Severity == CalcSeverity.Error)
                    ? effective * unitPrice.Value
                    : (decimal?)null;
                if (amount.HasValue)
                {
                    exactAmounts.Add((type, amount.Value));
                }
                results.Add(new ComponentResult
                {
                    ComponentId = id,
                    SortOrder = component.SortOrder,
                    ResourceId = component.ResourceId,
                    ResourceCode = resource?.Code ?? component.ResourceCodeSnapshot,
                    ResourceName = resource?.Name ?? component.ResourceNameSnapshot,
                    ResourceUnit = resource?.Unit ?? component.ResourceUnitSnapshot,
                    Type = type,
                    BaseConsumption = component.Consumption,
                    WasteRate = component.WasteRate,
                    WasteApplied = wasteApplied,
                    EffectiveConsumption = DecimalMath.Normalize(effective),
                    PriceId = price?.Id,
                    UnitPrice = unitPrice,
                    PriceUnit = price?.Unit ?? "",
                    Currency = price?.Currency ?? "",
                    PriceSource = price?.Source ?? "",
                    Amount = amount.HasValue ? DecimalMath.Normalize(amount.Value) : (decimal?)null,
                    Severity = severity,
                });
            }

            if (currencies.Count > 1)
            {
                Issue(CalcIssueCode.CurrencyMismatch, CalcSeverity.Error, NormCalcStrings.CurrencyMismatch(string.Join(", ", currencies)));
            }

            decimal? total = null;
            decimal? rounded = null;
            var totalsByType = EmptyTotals();
            if (!issues.Any(i => i.Severity == CalcSeverity.Error))
            {
                var sum = exactAmounts.Sum(a => a.Amount);
                var roundedSum = Rounding.Apply(sum, rounding);
                if (DecimalMath.IntegerDigits(roundedSum) > MaxIntegerDigits)
                {
                    Issue(CalcIssueCode.Overflow, CalcSeverity.Error, NormCalcStrings.Overflow);
                }
                else
                {
                    total = DecimalMath.Normalize(sum);
                    rounded = DecimalMath.Normalize(roundedSum);
                    foreach (var type in ResourceTypes)
                    {
                        totalsByType[type] = DecimalMath.Normalize(exactAmounts.Where(a => a.Type == type).Sum(a => a.Amount));
                    }
                }
            }

            var finalError = issues.Any(i => i.Severity == CalcSeverity.Error);
            return new NormCalcResult
            {
                NormId = norm.Id,
                Code = norm.Code,
                Name = norm.Name,
                Unit = norm.Unit,
                Version = norm.Version,
                Status = finalError ? CalcStatus.Invalid : issues.Count > 0 ? CalcStatus.ValidWithWarnings : CalcStatus.Valid,
                Components = results,
                TotalsByType = finalError ? EmptyTotals() : totalsByType,
                UnitPrice = finalError ? null : rounded,
                UnitPriceExact = finalError ? null : total,
                Currency = currencies.FirstOrDefault() ?? "",
                Rounding = rounding,
                Issues = issues,
                CalculatedAt = options.Now,
                InputFingerprint = HashText(string.Join("\n", fingerprint)),
            };
        }

        private static string StatusText(NormStatus status) =>
            status == NormStatus.Draft ? "draft" : status == NormStatus.Approved ? "approved" : "inactive";
    }

    /// <summary>Thông báo của bộ máy tính định mức (src/shared/strings.norms.vi.ts, NORM_CALC_STRINGS).</summary>
    public static class NormCalcStrings
    {
        public const string Unnamed = "(thành phần chưa có tài nguyên)";
        public const string NormNotFound = "Không tìm thấy phiên bản định mức này. Có thể nó vừa bị xóa.";
        public const string EmptyNorm = "Định mức chưa có thành phần nào. Thêm ít nhất một tài nguyên.";
        public const string MissingWorkUnit = "Định mức chưa có đơn vị tính của công tác.";
        public const string Overflow = "Kết quả vượt quá 15 chữ số, giới hạn chính xác của Excel. Kiểm tra lại hao phí và đơn giá.";

        public static string NormInactiveText(string version) =>
            $"Phiên bản {version} đang ở trạng thái Ngừng dùng. Kết quả chỉ để tham khảo.";

        public static string NoResourceLink(string label) => $"Thành phần {label} chưa liên kết tài nguyên trong thư viện.";

        public static string ResourceMissing(string code, string name) =>
            $"Tài nguyên \"{code}{(name != "" ? $": {name}" : "")}\" (lúc liên kết) không còn trong thư viện. Hãy liên kết lại hoặc xóa thành phần.";

        public static string ResourceUnitChanged(string code, string from, string to) =>
            $"Đơn vị của tài nguyên \"{code}\" đã đổi từ \"{from}\" sang \"{to}\". Hao phí đang khai theo đơn vị cũ; add-in không tự quy đổi. Kiểm tra hao phí rồi bấm Cập nhật liên kết.";

        public static string ResourceRenamed(string oldCode, string code, string name) =>
            $"Tài nguyên liên kết (lúc liên kết mã \"{oldCode}\") nay là \"{code}: {name}\". Kiểm tra đúng tài nguyên rồi bấm Cập nhật liên kết.";

        public static string ResourceTypeChanged(string code) =>
            $"Loại của tài nguyên \"{code}\" đã đổi so với lúc liên kết; chi phí được tính vào nhóm theo loại hiện tại.";

        public static string DuplicateComponent(string code) =>
            $"Tài nguyên \"{code}\" xuất hiện nhiều lần trong định mức. Gộp thành một thành phần để không cộng trùng.";

        public static string InvalidConsumption(string label) => $"Hao phí của {label} không hợp lệ (phải là số không âm).";

        public static string ZeroConsumption(string label) => $"Hao phí của {label} bằng 0: thành phần không đóng góp chi phí.";

        public static string InvalidWasteRate(string label) => $"Tỷ lệ hao hụt của {label} không hợp lệ (từ 0% đến 100%).";

        public static string WasteIgnored(string label) =>
            $"{label} có tỷ lệ hao hụt nhưng định mức ghi \"hao phí đã gồm hao hụt\": add-in không cộng thêm để tránh tính trùng.";

        public static string MissingPrice(string code) =>
            $"Tài nguyên \"{code}\" chưa có giá đang dùng, còn hiệu lực, cùng đơn vị. Thêm giá hoặc chọn giá cụ thể.";

        public static string AmbiguousPrice(string code, int count) =>
            $"Tài nguyên \"{code}\" có {count} giá dùng được; add-in không tự chọn. Hãy chọn giá áp dụng.";

        public static string SelectedPriceMissing(string code) => $"Giá đã chọn cho \"{code}\" không còn tồn tại. Hãy chọn lại.";

        public static string PriceUnitMismatch(string code, string priceUnit, string unit) =>
            $"Giá chọn cho \"{code}\" tính theo \"{priceUnit}\", khác đơn vị tài nguyên \"{unit}\". Add-in không tự quy đổi đơn vị.";

        public static string InvalidPrice(string code) => $"Đơn giá của \"{code}\" không hợp lệ (phải là số không âm).";

        public static string ZeroPrice(string code) => $"Đơn giá của \"{code}\" bằng 0. Kiểm tra lại.";

        public static string InactivePrice(string code) => $"Giá chọn cho \"{code}\" đang ở trạng thái Ngưng dùng.";

        public static string PriceNotInEffect(string code, bool expired) =>
            $"Giá chọn cho \"{code}\" {(expired ? "đã hết hiệu lực" : "chưa có hiệu lực")} vào ngày tính.";

        public static string CurrencyMismatch(string list) =>
            $"Các giá dùng khác tiền tệ ({list}). Add-in không quy đổi tiền tệ; chọn giá cùng một tiền tệ.";
    }
}
