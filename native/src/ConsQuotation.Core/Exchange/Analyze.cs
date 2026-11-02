using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Storage;

namespace ConsQuotation.Core.Exchange
{
    public enum DuplicateMode
    {
        Skip,
        Update,
    }

    public sealed class ImportIssue
    {
        public string SourceLabel { get; set; } = "";
        public string RowLabel { get; set; } = "";
        public string? ColumnLabel { get; set; }
        public string Message { get; set; } = "";
    }

    public sealed class DatasetSummary
    {
        public DatasetKind Kind { get; set; }
        public string SourceLabel { get; set; } = "";
        public int Total { get; set; }
        public int Added { get; set; }
        /// <summary>Trùng với thư viện (đã cập nhật hoặc bỏ qua tùy chế độ).</summary>
        public int Duplicates { get; set; }
        public int Updated { get; set; }
        public int Errors { get; set; }
        public int Empty { get; set; }
    }

    /// <summary>Tên nhóm/nhà cung cấp/định mức chưa có, sẽ được tạo vì được dùng làm tham chiếu.</summary>
    public sealed class CreatedFromReferences
    {
        public List<string> Categories { get; } = new List<string>();
        public List<string> Suppliers { get; } = new List<string>();
        public List<string> Norms { get; } = new List<string>();
    }

    public sealed class ImportAnalysis
    {
        public List<DatasetSummary> Summaries { get; set; } = new List<DatasetSummary>();
        public List<ImportIssue> Issues { get; set; } = new List<ImportIssue>();
        /// <summary>Lỗi chặn cả lần nhập (thiếu cột bắt buộc…).</summary>
        public List<string> Problems { get; set; } = new List<string>();
        public LibrarySnapshot Changes { get; set; } = new LibrarySnapshot();
        public CreatedFromReferences CreatedFromReferences { get; set; } = new CreatedFromReferences();

        public int ChangeCount =>
            Changes.Categories.Count + Changes.Suppliers.Count + Changes.WorkItems.Count + Changes.Resources.Count +
            Changes.ResourcePrices.Count + Changes.Norms.Count + Changes.NormComponents.Count;
    }

    public sealed class AnalyzeOptions
    {
        public AnalyzeOptions(DuplicateMode mode, string now, Func<string> newId)
        {
            Mode = mode;
            Now = now;
            NewId = newId;
        }

        public DuplicateMode Mode { get; }
        /// <summary>Thời điểm nhập (ISO) cho createdAt/updatedAt.</summary>
        public string Now { get; }
        public Func<string> NewId { get; }
    }

    /// <summary>
    /// Kiểm tra dữ liệu nhập và lập danh sách thay đổi (prompts/09), chuyển từ analyze.ts:
    /// - Dòng lỗi không bao giờ được nhập; báo đúng dòng/cột.
    /// - Không tự suy diễn đơn vị hoặc giá bị thiếu.
    /// - Bản ghi trùng với thư viện: mặc định bỏ qua; chỉ cập nhật khi người dùng chọn, và chỉ các trường có
    ///   cột trong file.
    /// - Cột "Nhóm"/"Nhà cung cấp" tham chiếu theo TÊN; tên chưa có thì tạo mới, nhưng chỉ khi dòng hợp lệ
    ///   và thực sự được thêm/cập nhật.
    /// Hàm thuần: không ghi gì; bước ghi dùng Changes trong một lần ghi.
    /// </summary>
    public static class ImportAnalyzer
    {
        private sealed class RowError
        {
            public RowError(string? field, string message)
            {
                Field = field;
                Message = message;
            }

            public string? Field { get; }
            public string Message { get; }
        }

        private static readonly Dictionary<DatasetKind, int> KindOrder = new Dictionary<DatasetKind, int>
        {
            [DatasetKind.Categories] = 0,
            [DatasetKind.Suppliers] = 1,
            [DatasetKind.Resources] = 2,
            [DatasetKind.WorkItems] = 3,
            [DatasetKind.ResourcePrices] = 4,
            [DatasetKind.Norms] = 5,
            [DatasetKind.NormComponents] = 6,
        };

        private static T Read<T>(List<RowError> errors, string field, CellParse<T> parsed, T fallback)
        {
            if (!parsed.Ok)
            {
                errors.Add(new RowError(field, parsed.Message));
                return fallback;
            }
            return parsed.Value;
        }

        private static void RequireText(List<RowError> errors, string field, string value, string label)
        {
            if (value == "")
            {
                errors.Add(new RowError(field, $"Thiếu {label}."));
            }
        }

        private static void CheckPeriod(List<RowError> errors, string? from, string? to)
        {
            if (!string.IsNullOrEmpty(from) && !string.IsNullOrEmpty(to) && string.CompareOrdinal(from, to) > 0)
            {
                errors.Add(new RowError("effectiveTo", "Ngày kết thúc hiệu lực phải sau hoặc bằng ngày bắt đầu."));
            }
        }

        private static string? ValidTimestamp(string? value) =>
            !string.IsNullOrEmpty(value) && DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _) ? value : null;

        /// <summary>Trường "category"/"supplier"… của file tương ứng thuộc tính "categoryId"/"supplierId"… của bản ghi.</summary>
        private static HashSet<string> RecordKeys(IEnumerable<string> mappedFields)
        {
            var keys = new HashSet<string>(mappedFields);
            if (keys.Contains("category")) keys.Add("categoryId");
            if (keys.Contains("supplier")) keys.Add("supplierId");
            if (keys.Contains("wastePercent")) keys.Add("wasteRate");
            if (keys.Contains("workItemCode")) keys.Add("workItemId");
            return keys;
        }

        private static T Clone<T>(T value) where T : class => Json.Deserialize<T>(Json.Serialize(value, indented: false))!;

        private static string CleanName(string name) => Names.CollapseSpaces(name).Trim();

        public static ImportAnalysis Analyze(IReadOnlyList<ImportDataset> datasets, LibrarySnapshot library, AnalyzeOptions options)
        {
            var mode = options.Mode;
            var now = options.Now;
            var result = new ImportAnalysis();
            var changes = result.Changes;
            var created = result.CreatedFromReferences;

            // Trạng thái thư viện sau các thay đổi đã lập (để giá/định mức tham chiếu được dữ liệu vừa nhập).
            var resourceByCode = new Dictionary<string, Resource>();
            foreach (var r in library.Resources)
            {
                if (!resourceByCode.ContainsKey(Names.NormalizeCode(r.Code)))
                {
                    resourceByCode[Names.NormalizeCode(r.Code)] = r;
                }
            }
            var workItemByCode = new Dictionary<string, WorkItem>();
            foreach (var w in library.WorkItems)
            {
                if (!workItemByCode.ContainsKey(Names.NormalizeCode(w.Code)))
                {
                    workItemByCode[Names.NormalizeCode(w.Code)] = w;
                }
            }
            var categoryByName = new Dictionary<string, Category>();
            foreach (var c in library.Categories)
            {
                categoryByName[Names.NormalizeName(c.Name)] = c;
            }
            var supplierByName = new Dictionary<string, Supplier>();
            foreach (var s in library.Suppliers)
            {
                supplierByName[Names.NormalizeName(s.Name)] = s;
            }
            var priceById = new Dictionary<string, ResourcePrice>();
            foreach (var p in library.ResourcePrices)
            {
                priceById[p.Id] = p;
            }
            string PriceKey(string resourceId, decimal price, string unit, string currency, string? from, string? to, string source) =>
                string.Join("|", resourceId, DecimalMath.Normalize(price).ToString(CultureInfo.InvariantCulture), Names.NormalizeCode(unit),
                    Names.NormalizeCode(currency), from ?? "", to ?? "", Search.NormalizeForSearch(source));
            var priceByKey = new Dictionary<string, ResourcePrice>();
            foreach (var p in library.ResourcePrices)
            {
                priceByKey[PriceKey(p.ResourceId, p.Price, p.Unit, p.Currency, p.EffectiveFrom, p.EffectiveTo, p.Source)] = p;
            }
            string NormKey(string code, string version) => $"{Names.NormalizeCode(code)}|{Names.NormalizeCode(version)}";
            var normByKey = new Dictionary<string, Norm>();
            foreach (var n in library.Norms)
            {
                normByKey[NormKey(n.Code, n.Version)] = n;
            }
            // Định mức tạo trong lần nhập này: được thêm thành phần dù trạng thái không phải nháp.
            var newNormIds = new HashSet<string>();
            var componentByPair = new Dictionary<string, NormComponent>();
            foreach (var c in library.NormComponents)
            {
                componentByPair[$"{c.NormId}|{c.ResourceId}"] = c;
            }
            string? ApprovedConflict(string code, string? workItemId)
            {
                foreach (var n in normByKey.Values)
                {
                    if (n.Status != NormStatus.Approved)
                    {
                        continue;
                    }
                    if (Names.NormalizeCode(n.Code) == Names.NormalizeCode(code))
                    {
                        return $"Mã \"{code}\" đã có phiên bản đang dùng ({n.Version}). Nhập phiên bản này ở trạng thái Nháp hoặc Ngừng dùng.";
                    }
                    if (workItemId != null && n.WorkItemId == workItemId)
                    {
                        return $"Công tác liên kết đã dùng định mức \"{n.Code}\" phiên bản {n.Version}.";
                    }
                }
                return null;
            }
            var usedIds = new HashSet<string>(library.Categories.Select(x => x.Id)
                .Concat(library.Suppliers.Select(x => x.Id))
                .Concat(library.WorkItems.Select(x => x.Id))
                .Concat(library.Resources.Select(x => x.Id))
                .Concat(library.ResourcePrices.Select(x => x.Id))
                .Concat(library.Norms.Select(x => x.Id))
                .Concat(library.NormComponents.Select(x => x.Id)));

            string NewId()
            {
                var fresh = options.NewId();
                usedIds.Add(fresh);
                return fresh;
            }
            string TakeId(ImportRow row)
            {
                var id = row.Meta?.Id;
                if (!string.IsNullOrEmpty(id) && !usedIds.Contains(id!))
                {
                    usedIds.Add(id!);
                    return id!;
                }
                return NewId();
            }
            string CreatedAt(ImportRow row) => ValidTimestamp(row.Meta?.CreatedAt) ?? now;
            string UpdatedAt(ImportRow row) => ValidTimestamp(row.Meta?.UpdatedAt) ?? now;

            // id của nhóm theo tên; tạo nhóm mới nếu chưa có (chỉ gọi khi bản ghi thực sự được ghi).
            string? EnsureCategory(string name)
            {
                var cleaned = CleanName(name);
                if (cleaned == "")
                {
                    return null;
                }
                var key = Names.NormalizeName(cleaned);
                if (categoryByName.TryGetValue(key, out var found))
                {
                    return found.Id;
                }
                var category = new Category { Id = NewId(), Name = cleaned, Notes = "", CreatedAt = now, UpdatedAt = now };
                changes.Categories.Add(category);
                categoryByName[key] = category;
                created.Categories.Add(cleaned);
                return category.Id;
            }
            string? EnsureSupplier(string name)
            {
                var cleaned = CleanName(name);
                if (cleaned == "")
                {
                    return null;
                }
                var key = Names.NormalizeName(cleaned);
                if (supplierByName.TryGetValue(key, out var found))
                {
                    return found.Id;
                }
                var supplier = new Supplier { Id = NewId(), Name = cleaned, ContactInfo = "", Notes = "", CreatedAt = now, UpdatedAt = now };
                changes.Suppliers.Add(supplier);
                supplierByName[key] = supplier;
                created.Suppliers.Add(cleaned);
                return supplier.Id;
            }

            // Định mức cho dòng thành phần: theo mã + phiên bản; không ghi phiên bản thì phải có đúng một
            // phiên bản. Bảng kiểu cũ (Mã công tác + Mã tài nguyên + Hao phí): chưa có định mức mã đó mà có
            // công tác cùng mã thì tạo định mức phiên bản "1" từ công tác (liệt kê trong bản xem trước).
            (Norm? Norm, string Message) ResolveNormFor(string code, string version)
            {
                if (version != "")
                {
                    return normByKey.TryGetValue(NormKey(code, version), out var exact)
                        ? (exact, "")
                        : (null, $"Không có định mức \"{code}\" phiên bản \"{version}\" trong thư viện hoặc trong file.");
                }
                var candidates = normByKey.Values.Where(n => Names.NormalizeCode(n.Code) == Names.NormalizeCode(code)).ToList();
                if (candidates.Count == 1)
                {
                    return (candidates[0], "");
                }
                if (candidates.Count > 1)
                {
                    return (null, $"Định mức \"{code}\" có {candidates.Count} phiên bản: ghi rõ cột Phiên bản.");
                }
                if (!workItemByCode.TryGetValue(Names.NormalizeCode(code), out var workItem))
                {
                    return (null, $"Không có định mức hoặc công tác mã \"{code}\" trong thư viện hoặc trong file.");
                }
                var norm = new Norm
                {
                    Id = NewId(),
                    Code = workItem.Code,
                    Name = workItem.Name,
                    Unit = workItem.Unit,
                    CategoryId = workItem.CategoryId,
                    WorkItemId = workItem.Id,
                    Version = "1",
                    EffectiveFrom = null,
                    SourceType = NormSourceType.User,
                    Source = "",
                    SourceVerified = false,
                    Status = ApprovedConflict(workItem.Code, workItem.Id) != null ? NormStatus.Draft : NormStatus.Approved,
                    WasteIncluded = false,
                    Notes = "Tạo khi nhập bảng định mức kiểu cũ (Mã công tác, Mã tài nguyên, Hao phí).",
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                changes.Norms.Add(norm);
                normByKey[NormKey(norm.Code, norm.Version)] = norm;
                newNormIds.Add(norm.Id);
                created.Norms.Add($"{norm.Code} v1");
                return (norm, "");
            }

            var summaries = new Dictionary<ImportDataset, DatasetSummary>();
            foreach (var dataset in datasets.OrderBy(d => KindOrder[d.Kind]))
            {
                var summary = new DatasetSummary { Kind = dataset.Kind, SourceLabel = dataset.SourceLabel, Total = dataset.Rows.Count };
                summaries[dataset] = summary;
                if (dataset.Problems.Count > 0)
                {
                    result.Problems.AddRange(dataset.Problems.Select(p => $"{dataset.SourceLabel}: {p}"));
                    continue;
                }
                var mapped = RecordKeys(dataset.MappedFields);
                var seen = new Dictionary<string, string>();

                void Report(ImportRow row, List<RowError> errors)
                {
                    summary.Errors++;
                    foreach (var e in errors)
                    {
                        result.Issues.Add(new ImportIssue
                        {
                            SourceLabel = dataset.SourceLabel,
                            RowLabel = row.RowLabel,
                            ColumnLabel = e.Field != null && dataset.ColumnLabels.TryGetValue(e.Field, out var label) ? label : null,
                            Message = e.Message,
                        });
                    }
                }
                // Trùng trong chính file: báo lỗi, trỏ về dòng đầu tiên.
                void FirstOccurrence(string key, ImportRow row, List<RowError> errors, string field, string what)
                {
                    if (seen.TryGetValue(key, out var first))
                    {
                        errors.Add(new RowError(field, $"{what} trùng với {first.ToLowerInvariant()} trong file."));
                    }
                    else
                    {
                        seen[key] = row.RowLabel;
                    }
                }

                foreach (var row in dataset.Rows)
                {
                    if (row.PreErrors == null && dataset.MappedFields.All(key => Cells.IsBlank(row.Cell(key))))
                    {
                        summary.Empty++;
                        continue;
                    }
                    var errors = (row.PreErrors ?? new List<PreError>()).Select(e => new RowError(e.Field, e.Message)).ToList();
                    string Text(string key) => Cells.ParseText(row.Cell(key));

                    switch (dataset.Kind)
                    {
                        case DatasetKind.Categories:
                        case DatasetKind.Suppliers:
                        {
                            var isCategory = dataset.Kind == DatasetKind.Categories;
                            var name = Names.CollapseSpaces(Text("name"));
                            RequireText(errors, "name", name, isCategory ? "tên nhóm" : "tên nhà cung cấp");
                            if (name != "")
                            {
                                FirstOccurrence(Names.NormalizeName(name), row, errors, "name", $"Tên \"{name}\"");
                            }
                            if (errors.Count > 0)
                            {
                                Report(row, errors);
                                continue;
                            }
                            var key = Names.NormalizeName(name);
                            if (isCategory)
                            {
                                if (categoryByName.TryGetValue(key, out var existing))
                                {
                                    summary.Duplicates++;
                                    if (mode == DuplicateMode.Update)
                                    {
                                        var updated = Clone(existing);
                                        if (mapped.Contains("name")) updated.Name = name;
                                        if (mapped.Contains("notes")) updated.Notes = Text("notes");
                                        updated.UpdatedAt = now;
                                        changes.Categories.Add(updated);
                                        categoryByName[key] = updated;
                                        summary.Updated++;
                                    }
                                    continue;
                                }
                                var category = new Category { Id = TakeId(row), Name = name, Notes = Text("notes"), CreatedAt = CreatedAt(row), UpdatedAt = UpdatedAt(row) };
                                changes.Categories.Add(category);
                                categoryByName[key] = category;
                            }
                            else
                            {
                                if (supplierByName.TryGetValue(key, out var existing))
                                {
                                    summary.Duplicates++;
                                    if (mode == DuplicateMode.Update)
                                    {
                                        var updated = Clone(existing);
                                        if (mapped.Contains("name")) updated.Name = name;
                                        if (mapped.Contains("contactInfo")) updated.ContactInfo = Text("contactInfo");
                                        if (mapped.Contains("notes")) updated.Notes = Text("notes");
                                        updated.UpdatedAt = now;
                                        changes.Suppliers.Add(updated);
                                        supplierByName[key] = updated;
                                        summary.Updated++;
                                    }
                                    continue;
                                }
                                var supplier = new Supplier
                                {
                                    Id = TakeId(row), Name = name, ContactInfo = Text("contactInfo"), Notes = Text("notes"),
                                    CreatedAt = CreatedAt(row), UpdatedAt = UpdatedAt(row),
                                };
                                changes.Suppliers.Add(supplier);
                                supplierByName[key] = supplier;
                            }
                            summary.Added++;
                            continue;
                        }

                        case DatasetKind.Resources:
                        {
                            var code = Text("code");
                            var name = Text("name");
                            var unit = Text("unit");
                            var type = Read(errors, "type", Cells.ParseResourceType(row.Cell("type")), null);
                            RequireText(errors, "code", code, "mã tài nguyên");
                            RequireText(errors, "name", name, "tên tài nguyên");
                            RequireText(errors, "unit", unit, "đơn vị tính");
                            if (code != "")
                            {
                                FirstOccurrence(Names.NormalizeCode(code), row, errors, "code", $"Mã \"{code}\"");
                            }
                            if (errors.Count > 0)
                            {
                                Report(row, errors);
                                continue;
                            }
                            resourceByCode.TryGetValue(Names.NormalizeCode(code), out var existing);
                            if (existing != null && mode == DuplicateMode.Skip)
                            {
                                summary.Duplicates++;
                                continue;
                            }
                            var categoryId = mapped.Contains("categoryId") ? EnsureCategory(Text("category")) : null;
                            if (existing != null)
                            {
                                summary.Duplicates++;
                                var updated = Clone(existing);
                                if (mapped.Contains("name")) updated.Name = name;
                                if (mapped.Contains("unit")) updated.Unit = unit;
                                if (mapped.Contains("type")) updated.Type = type ?? ResourceType.Other;
                                if (mapped.Contains("categoryId")) updated.CategoryId = categoryId;
                                if (mapped.Contains("notes")) updated.Notes = Text("notes");
                                updated.UpdatedAt = now;
                                changes.Resources.Add(updated);
                                resourceByCode[Names.NormalizeCode(code)] = updated;
                                summary.Updated++;
                                continue;
                            }
                            var resource = new Resource
                            {
                                Id = TakeId(row), Code = code, Name = name, Unit = unit, Type = type ?? ResourceType.Other,
                                CategoryId = categoryId, Notes = Text("notes"), CreatedAt = CreatedAt(row), UpdatedAt = UpdatedAt(row),
                            };
                            changes.Resources.Add(resource);
                            resourceByCode[Names.NormalizeCode(code)] = resource;
                            summary.Added++;
                            continue;
                        }

                        case DatasetKind.WorkItems:
                        {
                            var code = Text("code");
                            var name = Text("name");
                            var unit = Text("unit");
                            var unitPrice = Read(errors, "unitPrice", Cells.ParseNumber(row.Cell("unitPrice")), null);
                            var effectiveFrom = Read(errors, "effectiveFrom", Cells.ParseDate(row.Cell("effectiveFrom")), null);
                            var effectiveTo = Read(errors, "effectiveTo", Cells.ParseDate(row.Cell("effectiveTo")), null);
                            RequireText(errors, "code", code, "mã công tác");
                            RequireText(errors, "name", name, "tên công tác");
                            RequireText(errors, "unit", unit, "đơn vị tính");
                            if (unitPrice != null && unitPrice < 0)
                            {
                                errors.Add(new RowError("unitPrice", "Đơn giá không được âm."));
                            }
                            if (code != "")
                            {
                                FirstOccurrence(Names.NormalizeCode(code), row, errors, "code", $"Mã \"{code}\"");
                            }
                            workItemByCode.TryGetValue(Names.NormalizeCode(code), out var existing);
                            WorkItem candidate;
                            if (existing != null)
                            {
                                candidate = Clone(existing);
                                // Nhóm/nhà cung cấp gán sau khi dòng hợp lệ (có thể tạo bản ghi mới).
                                if (mapped.Contains("name")) candidate.Name = name;
                                if (mapped.Contains("categoryId")) candidate.CategoryId = null;
                                if (mapped.Contains("unit")) candidate.Unit = unit;
                                if (mapped.Contains("description")) candidate.Description = Text("description");
                                if (mapped.Contains("unitPrice")) candidate.UnitPrice = unitPrice;
                                if (mapped.Contains("currency")) candidate.Currency = Text("currency");
                                if (mapped.Contains("supplierId")) candidate.SupplierId = null;
                                if (mapped.Contains("source")) candidate.Source = Text("source");
                                if (mapped.Contains("effectiveFrom")) candidate.EffectiveFrom = effectiveFrom;
                                if (mapped.Contains("effectiveTo")) candidate.EffectiveTo = effectiveTo;
                                if (mapped.Contains("notes")) candidate.Notes = Text("notes");
                            }
                            else
                            {
                                candidate = new WorkItem
                                {
                                    Id = "", Code = code, PricingMethod = PricingMethod.Direct, CreatedAt = now, UpdatedAt = now,
                                    Name = name, CategoryId = null, Unit = unit, Description = Text("description"), UnitPrice = unitPrice,
                                    Currency = Text("currency"), SupplierId = null, Source = Text("source"), EffectiveFrom = effectiveFrom,
                                    EffectiveTo = effectiveTo, Notes = Text("notes"),
                                };
                            }
                            // Ràng buộc chéo kiểm trên bản ghi sau khi ghép (cột không có trong file giữ giá trị cũ).
                            if (candidate.UnitPrice != null && candidate.Currency == "")
                            {
                                errors.Add(new RowError("currency", "Có đơn giá nhưng thiếu tiền tệ."));
                            }
                            CheckPeriod(errors, candidate.EffectiveFrom, candidate.EffectiveTo);
                            if (errors.Count > 0)
                            {
                                Report(row, errors);
                                continue;
                            }
                            if (existing != null && mode == DuplicateMode.Skip)
                            {
                                summary.Duplicates++;
                                continue;
                            }
                            if (mapped.Contains("categoryId"))
                            {
                                candidate.CategoryId = EnsureCategory(Text("category"));
                            }
                            if (mapped.Contains("supplierId"))
                            {
                                candidate.SupplierId = EnsureSupplier(Text("supplier"));
                            }
                            if (existing != null)
                            {
                                summary.Duplicates++;
                                candidate.UpdatedAt = now;
                                changes.WorkItems.Add(candidate);
                                workItemByCode[Names.NormalizeCode(code)] = candidate;
                                summary.Updated++;
                                continue;
                            }
                            candidate.Id = TakeId(row);
                            candidate.CreatedAt = CreatedAt(row);
                            candidate.UpdatedAt = UpdatedAt(row);
                            changes.WorkItems.Add(candidate);
                            workItemByCode[Names.NormalizeCode(code)] = candidate;
                            summary.Added++;
                            continue;
                        }

                        case DatasetKind.ResourcePrices:
                        {
                            var resourceCode = Text("resourceCode");
                            var price = Read(errors, "price", Cells.ParseNumber(row.Cell("price")), null);
                            var unit = Text("unit");
                            var currency = Text("currency");
                            var effectiveFrom = Read(errors, "effectiveFrom", Cells.ParseDate(row.Cell("effectiveFrom")), null);
                            var effectiveTo = Read(errors, "effectiveTo", Cells.ParseDate(row.Cell("effectiveTo")), null);
                            var status = Read(errors, "status", Cells.ParsePriceStatus(row.Cell("status")), null);
                            if (row.PreErrors == null)
                            {
                                RequireText(errors, "resourceCode", resourceCode, "mã tài nguyên");
                            }
                            Resource? resource = null;
                            if (resourceCode != "" && !resourceByCode.TryGetValue(Names.NormalizeCode(resourceCode), out resource))
                            {
                                errors.Add(new RowError("resourceCode", $"Không có tài nguyên mã \"{resourceCode}\" trong thư viện hoặc trong file."));
                            }
                            if (price == null && !errors.Any(e => e.Field == "price"))
                            {
                                errors.Add(new RowError("price", "Thiếu đơn giá."));
                            }
                            else if (price != null && price < 0)
                            {
                                errors.Add(new RowError("price", "Đơn giá không được âm."));
                            }
                            RequireText(errors, "unit", unit, "đơn vị tính của giá");
                            RequireText(errors, "currency", currency, "tiền tệ");
                            CheckPeriod(errors, effectiveFrom, effectiveTo);
                            if (errors.Count > 0 || resource == null || price == null)
                            {
                                Report(row, errors);
                                continue;
                            }
                            var source = Text("source");
                            var key = PriceKey(resource.Id, price.Value, unit, currency, effectiveFrom, effectiveTo, source);
                            // Có id (JSON): trùng theo id. Không có id: giá giống hệt (tài nguyên, đơn giá, đơn vị, tiền tệ, hiệu lực, nguồn).
                            var metaId = row.Meta?.Id;
                            FirstOccurrence(!string.IsNullOrEmpty(metaId) ? $"id:{metaId}" : key, row, errors, "price", "Giá");
                            if (errors.Count > 0)
                            {
                                Report(row, errors);
                                continue;
                            }
                            ResourcePrice? existing = null;
                            if (!string.IsNullOrEmpty(metaId))
                            {
                                priceById.TryGetValue(metaId!, out existing);
                            }
                            if (existing == null)
                            {
                                priceByKey.TryGetValue(key, out existing);
                            }
                            if (existing != null && mode == DuplicateMode.Skip)
                            {
                                summary.Duplicates++;
                                continue;
                            }
                            var supplierId = mapped.Contains("supplierId") ? EnsureSupplier(Text("supplier")) : null;
                            if (existing != null)
                            {
                                summary.Duplicates++;
                                var updated = Clone(existing);
                                updated.ResourceId = resource.Id;
                                if (mapped.Contains("price")) updated.Price = price.Value;
                                if (mapped.Contains("unit")) updated.Unit = unit;
                                if (mapped.Contains("currency")) updated.Currency = currency;
                                if (mapped.Contains("effectiveFrom")) updated.EffectiveFrom = effectiveFrom;
                                if (mapped.Contains("effectiveTo")) updated.EffectiveTo = effectiveTo;
                                if (mapped.Contains("source")) updated.Source = source;
                                if (mapped.Contains("status")) updated.Status = status ?? PriceStatus.Active;
                                if (mapped.Contains("notes")) updated.Notes = Text("notes");
                                if (mapped.Contains("supplierId")) updated.SupplierId = supplierId;
                                updated.UpdatedAt = now;
                                changes.ResourcePrices.Add(updated);
                                summary.Updated++;
                                continue;
                            }
                            var newPrice = new ResourcePrice
                            {
                                Id = TakeId(row), ResourceId = resource.Id, Price = price.Value, Unit = unit, Currency = currency,
                                EffectiveFrom = effectiveFrom, EffectiveTo = effectiveTo, Source = source, Status = status ?? PriceStatus.Active,
                                Notes = Text("notes"), SupplierId = supplierId, CreatedAt = CreatedAt(row), UpdatedAt = UpdatedAt(row),
                            };
                            changes.ResourcePrices.Add(newPrice);
                            priceByKey[key] = newPrice;
                            summary.Added++;
                            continue;
                        }

                        case DatasetKind.Norms:
                        {
                            var code = Text("code");
                            var name = Text("name");
                            var unit = Text("unit");
                            var version = Text("version");
                            if (version == "")
                            {
                                version = "1";
                            }
                            var effectiveFrom = Read(errors, "effectiveFrom", Cells.ParseDate(row.Cell("effectiveFrom")), null);
                            var sourceType = Read(errors, "sourceType", Cells.ParseNormSourceType(row.Cell("sourceType")), null);
                            var sourceVerified = Read(errors, "sourceVerified", Cells.ParseYesNo(row.Cell("sourceVerified")), null);
                            var status = Read(errors, "status", Cells.ParseNormStatus(row.Cell("status")), null);
                            var wasteIncluded = Read(errors, "wasteIncluded", Cells.ParseYesNo(row.Cell("wasteIncluded")), null);
                            RequireText(errors, "code", code, "mã định mức");
                            RequireText(errors, "name", name, "tên công tác");
                            RequireText(errors, "unit", unit, "đơn vị tính");
                            var workItemCode = Text("workItemCode");
                            WorkItem? workItem = null;
                            if (workItemCode != "" && !workItemByCode.TryGetValue(Names.NormalizeCode(workItemCode), out workItem))
                            {
                                errors.Add(new RowError("workItemCode", $"Không có công tác mã \"{workItemCode}\" trong thư viện hoặc trong file."));
                            }
                            if (code != "")
                            {
                                FirstOccurrence(NormKey(code, version), row, errors, "version", $"Định mức \"{code}\" phiên bản \"{version}\"");
                            }
                            if (errors.Count > 0)
                            {
                                Report(row, errors);
                                continue;
                            }
                            normByKey.TryGetValue(NormKey(code, version), out var existing);
                            if (existing != null && mode == DuplicateMode.Skip)
                            {
                                summary.Duplicates++;
                                continue;
                            }
                            var categoryId = mapped.Contains("categoryId") ? EnsureCategory(Text("category")) : null;
                            var workItemId = workItem?.Id;
                            if (existing != null)
                            {
                                // Cập nhật chỉ đổi thông tin mô tả; mã, phiên bản, đơn vị, cờ hao hụt và trạng thái giữ
                                // nguyên (phiên bản đã dùng không bị đổi âm thầm; trạng thái đổi qua giao diện có kiểm tra).
                                var updated = Clone(existing);
                                if (mapped.Contains("name")) updated.Name = name;
                                if (mapped.Contains("categoryId")) updated.CategoryId = categoryId;
                                if (mapped.Contains("effectiveFrom")) updated.EffectiveFrom = effectiveFrom;
                                if (mapped.Contains("sourceType")) updated.SourceType = sourceType ?? NormSourceType.User;
                                if (mapped.Contains("source")) updated.Source = Text("source");
                                if (mapped.Contains("sourceVerified")) updated.SourceVerified = sourceVerified ?? false;
                                if (mapped.Contains("workItemId")) updated.WorkItemId = workItemId;
                                if (mapped.Contains("notes")) updated.Notes = Text("notes");
                                updated.UpdatedAt = now;
                                var linkTaken = updated.Status == NormStatus.Approved && updated.WorkItemId != null && updated.WorkItemId != existing.WorkItemId
                                    ? normByKey.Values.FirstOrDefault(n => n.Id != existing.Id && n.Status == NormStatus.Approved && n.WorkItemId == updated.WorkItemId)
                                    : null;
                                if (linkTaken != null)
                                {
                                    Report(row, new List<RowError>
                                    {
                                        new RowError("workItemCode", $"Công tác liên kết đã dùng định mức \"{linkTaken.Code}\" phiên bản {linkTaken.Version}."),
                                    });
                                    continue;
                                }
                                summary.Duplicates++;
                                changes.Norms.Add(updated);
                                normByKey[NormKey(code, version)] = updated;
                                summary.Updated++;
                                continue;
                            }
                            var nextStatus = status ?? NormStatus.Draft;
                            if (nextStatus == NormStatus.Approved)
                            {
                                var conflict = ApprovedConflict(code, workItemId);
                                if (conflict != null)
                                {
                                    Report(row, new List<RowError> { new RowError("status", conflict) });
                                    continue;
                                }
                            }
                            var norm = new Norm
                            {
                                Id = TakeId(row), Code = code, Version = version, Unit = unit, WasteIncluded = wasteIncluded ?? false,
                                Status = nextStatus, Name = name, CategoryId = categoryId, EffectiveFrom = effectiveFrom,
                                SourceType = sourceType ?? NormSourceType.User, Source = Text("source"), SourceVerified = sourceVerified ?? false,
                                WorkItemId = workItemId, Notes = Text("notes"), CreatedAt = CreatedAt(row), UpdatedAt = UpdatedAt(row),
                            };
                            changes.Norms.Add(norm);
                            normByKey[NormKey(code, version)] = norm;
                            newNormIds.Add(norm.Id);
                            summary.Added++;
                            continue;
                        }

                        default:
                        {
                            // Thành phần định mức.
                            var normCode = Text("normCode");
                            var normVersion = Text("version");
                            var resourceCode = Text("resourceCode");
                            var consumption = Read(errors, "consumption", Cells.ParseNumber(row.Cell("consumption")), null);
                            var wastePercent = Read(errors, "wastePercent", Cells.ParseNumber(row.Cell("wastePercent")), null);
                            var sortOrderNumber = Read(errors, "sortOrder", Cells.ParseNumber(row.Cell("sortOrder")), null);
                            int? sortOrder = null;
                            if (sortOrderNumber != null)
                            {
                                if (sortOrderNumber != decimal.Truncate(sortOrderNumber.Value) || sortOrderNumber < int.MinValue || sortOrderNumber > int.MaxValue)
                                {
                                    errors.Add(new RowError("sortOrder", "Thứ tự phải là số nguyên."));
                                }
                                else
                                {
                                    sortOrder = (int)sortOrderNumber.Value;
                                }
                            }
                            if (row.PreErrors == null)
                            {
                                RequireText(errors, "normCode", normCode, "mã định mức");
                                RequireText(errors, "resourceCode", resourceCode, "mã tài nguyên");
                            }
                            Resource? resource = null;
                            if (resourceCode != "" && !resourceByCode.TryGetValue(Names.NormalizeCode(resourceCode), out resource))
                            {
                                errors.Add(new RowError("resourceCode", $"Không có tài nguyên mã \"{resourceCode}\" trong thư viện hoặc trong file."));
                            }
                            if (consumption == null && !errors.Any(e => e.Field == "consumption"))
                            {
                                errors.Add(new RowError("consumption", "Thiếu hao phí."));
                            }
                            else if (consumption != null && consumption <= 0)
                            {
                                errors.Add(new RowError("consumption", "Hao phí phải lớn hơn 0."));
                            }
                            if (wastePercent != null && (wastePercent < 0 || wastePercent > 100))
                            {
                                errors.Add(new RowError("wastePercent", "Hao hụt từ 0 đến 100 (%)."));
                            }
                            var target = normCode != "" ? ResolveNormFor(normCode, normVersion) : (null, "");
                            if (normCode != "" && target.Norm == null)
                            {
                                errors.Add(new RowError("normCode", target.Message));
                            }
                            var norm = target.Norm;
                            if (norm != null && resource != null)
                            {
                                FirstOccurrence($"{norm.Id}|{resource.Id}", row, errors, "resourceCode", "Thành phần (định mức, tài nguyên)");
                            }
                            if (norm != null && wastePercent > 0 && norm.WasteIncluded)
                            {
                                errors.Add(new RowError("wastePercent", "Định mức ghi hao phí đã gồm hao hụt: để trống hao hụt để không tính trùng."));
                            }
                            if (errors.Count > 0 || norm == null || resource == null || consumption == null)
                            {
                                Report(row, errors);
                                continue;
                            }
                            var editable = norm.Status == NormStatus.Draft || newNormIds.Contains(norm.Id);
                            var wasteRate = wastePercent != null && wastePercent != 0 ? DecimalMath.PercentToRate(wastePercent.Value) : 0m;
                            if (componentByPair.TryGetValue($"{norm.Id}|{resource.Id}", out var existingComponent))
                            {
                                summary.Duplicates++;
                                if (mode == DuplicateMode.Update && editable)
                                {
                                    var updated = Clone(existingComponent);
                                    if (mapped.Contains("consumption")) updated.Consumption = consumption.Value;
                                    if (mapped.Contains("wasteRate")) updated.WasteRate = wasteRate;
                                    if (mapped.Contains("notes")) updated.Notes = Text("notes");
                                    if (mapped.Contains("sortOrder")) updated.SortOrder = sortOrder ?? existingComponent.SortOrder;
                                    updated.UpdatedAt = now;
                                    changes.NormComponents.Add(updated);
                                    summary.Updated++;
                                }
                                continue;
                            }
                            if (!editable)
                            {
                                Report(row, new List<RowError>
                                {
                                    new RowError("normCode", $"Định mức \"{norm.Code}\" phiên bản {norm.Version} không còn là nháp: không thêm thành phần. Sao chép thành phiên bản mới rồi nhập."),
                                });
                                continue;
                            }
                            var siblingsMax = Math.Max(0, componentByPair.Values.Where(c => c.NormId == norm.Id).Select(c => c.SortOrder).DefaultIfEmpty(0).Max());
                            var snapshot = row.Meta?.Snapshot;
                            // Giá đã chọn (JSON) chỉ giữ khi giá đó có trong thư viện hoặc trong file và thuộc đúng tài nguyên.
                            var savedPriceId = row.Meta?.PriceId;
                            ResourcePrice? savedPrice = null;
                            if (!string.IsNullOrEmpty(savedPriceId) && !priceById.TryGetValue(savedPriceId!, out savedPrice))
                            {
                                savedPrice = changes.ResourcePrices.FirstOrDefault(p => p.Id == savedPriceId);
                            }
                            var component = new NormComponent
                            {
                                Id = TakeId(row),
                                NormId = norm.Id,
                                ResourceId = resource.Id,
                                ResourceCodeSnapshot = snapshot?.Code ?? resource.Code,
                                ResourceNameSnapshot = snapshot?.Name ?? resource.Name,
                                ResourceUnitSnapshot = snapshot?.Unit ?? resource.Unit,
                                ResourceTypeSnapshot = snapshot?.Type ?? resource.Type,
                                Consumption = consumption.Value,
                                WasteRate = wasteRate,
                                Notes = Text("notes"),
                                PriceId = savedPrice != null && savedPrice.ResourceId == resource.Id ? savedPrice.Id : null,
                                SortOrder = sortOrder ?? siblingsMax + 1,
                                CreatedAt = CreatedAt(row),
                                UpdatedAt = UpdatedAt(row),
                            };
                            changes.NormComponents.Add(component);
                            componentByPair[$"{norm.Id}|{resource.Id}"] = component;
                            summary.Added++;
                            continue;
                        }
                    }
                }
            }

            // Báo cáo theo thứ tự nguồn người dùng thấy.
            result.Summaries = datasets.Where(summaries.ContainsKey).Select(d => summaries[d]).ToList();
            return result;
        }
    }
}
