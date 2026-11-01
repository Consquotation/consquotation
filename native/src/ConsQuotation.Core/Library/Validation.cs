using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Numbers;

namespace ConsQuotation.Core.Library
{
    /// <summary>
    /// Kiểm tra dữ liệu thư viện (prompts/08, 13): lỗi chặn khi lưu. Không tự sửa, không tự điền giá trị
    /// thiếu. Kết quả Ok là bản ghi chưa có id và thời điểm tạo/sửa (dịch vụ thư viện điền khi lưu).
    /// Chuyển từ src/domain/library/validation.ts; thông báo giữ nguyên.
    /// </summary>
    public static class Validation
    {
        public const int NameMax = 120;
        public const int ContactMax = 500;

        private const string LockedFieldMessage =
            "Phiên bản đang dùng hoặc ngừng dùng đã khóa trường này. Hãy sao chép thành phiên bản mới để sửa.";

        private static (string? From, string? To) CheckDates(string from, string to, string fromField, string toField, List<FieldError> errors)
        {
            var effectiveFrom = from.Trim() == "" ? null : from.Trim();
            var effectiveTo = to.Trim() == "" ? null : to.Trim();
            if (effectiveFrom != null && !Dates.IsIsoDate(effectiveFrom))
            {
                errors.Add(new FieldError(fromField, "Ngày không hợp lệ."));
            }
            if (effectiveTo != null && !Dates.IsIsoDate(effectiveTo))
            {
                errors.Add(new FieldError(toField, "Ngày không hợp lệ."));
            }
            if (effectiveFrom != null && effectiveTo != null && Dates.IsIsoDate(effectiveFrom) && Dates.IsIsoDate(effectiveTo) &&
                string.CompareOrdinal(effectiveFrom, effectiveTo) > 0)
            {
                errors.Add(new FieldError(toField, "Ngày kết thúc hiệu lực phải sau hoặc bằng ngày bắt đầu."));
            }
            return (effectiveFrom, effectiveTo);
        }

        private static string Required(string value, string field, string label, List<FieldError> errors)
        {
            var trimmed = value.Trim();
            if (trimmed == "")
            {
                errors.Add(new FieldError(field, $"Nhập {label}."));
            }
            return trimmed;
        }

        /// <summary>Tham chiếu danh mục/nhà cung cấp trên form: "" = không chọn; phải trỏ tới bản ghi còn tồn tại.</summary>
        private static string? CheckRef(string id, IEnumerable<string> existingIds, string field, string what, List<FieldError> errors)
        {
            if (id == "")
            {
                return null;
            }
            if (!existingIds.Contains(id))
            {
                errors.Add(new FieldError(field, $"{what} đã chọn không còn tồn tại. Hãy chọn lại."));
                return null;
            }
            return id;
        }

        /// <summary>
        /// Bản ghi cùng tên (không phân biệt dấu, hoa thường) nhưng là bản ghi khác: chỉ để CẢNH BÁO "có khả
        /// năng trùng", không chặn và không tự gộp.
        /// </summary>
        public static List<T> SameNameRecords<T>(string name, IEnumerable<T> items, System.Func<T, string> id, System.Func<T, string> nameOf, string? editingId)
        {
            var key = Search.NormalizeForSearch(name);
            if (key == "")
            {
                return new List<T>();
            }
            return items.Where(x => id(x) != editingId && Search.NormalizeForSearch(nameOf(x)) == key).ToList();
        }

        // ---------- Công tác ----------

        public static FormResult<WorkItem> ValidateWorkItem(WorkItemForm form, LibrarySnapshot library, string? editingId)
        {
            var errors = new List<FieldError>();
            var code = Required(form.Code, Fields.Code, "mã công tác", errors);
            var name = Required(form.Name, Fields.Name, "tên công tác", errors);
            var unit = Required(form.Unit, Fields.Unit, "đơn vị tính", errors);
            if (code != "" && library.WorkItems.Any(w => w.Id != editingId && Names.NormalizeCode(w.Code) == Names.NormalizeCode(code)))
            {
                errors.Add(new FieldError(Fields.Code, $"Mã \"{code}\" đã có trong thư viện."));
            }
            var price = DecimalInput.Parse(form.UnitPrice);
            decimal? unitPrice = null;
            if (!price.Ok)
            {
                errors.Add(new FieldError(Fields.UnitPrice, price.Message));
            }
            else if (price.Value != null && price.Value < 0)
            {
                errors.Add(new FieldError(Fields.UnitPrice, "Đơn giá không được âm."));
            }
            else
            {
                unitPrice = price.Value;
            }
            var currency = form.Currency.Trim();
            if (unitPrice != null && currency == "")
            {
                errors.Add(new FieldError(Fields.Currency, "Nhập đơn vị tiền tệ cho đơn giá."));
            }
            var dates = CheckDates(form.EffectiveFrom, form.EffectiveTo, Fields.EffectiveFrom, Fields.EffectiveTo, errors);
            var categoryId = CheckRef(form.CategoryId, library.Categories.Select(c => c.Id), Fields.CategoryId, "Nhóm", errors);
            var supplierId = CheckRef(form.SupplierId, library.Suppliers.Select(s => s.Id), Fields.SupplierId, "Nhà cung cấp", errors);
            if (errors.Count > 0)
            {
                return FormResult<WorkItem>.Failure(errors);
            }
            return FormResult<WorkItem>.Success(new WorkItem
            {
                Code = code,
                Name = name,
                CategoryId = categoryId,
                Unit = unit,
                Description = form.Description.Trim(),
                PricingMethod = PricingMethod.Direct,
                UnitPrice = unitPrice,
                Currency = currency,
                SupplierId = supplierId,
                Source = form.Source.Trim(),
                EffectiveFrom = dates.From,
                EffectiveTo = dates.To,
                Notes = form.Notes.Trim(),
            });
        }

        public static WorkItemForm ToForm(WorkItem item) => new WorkItemForm
        {
            Code = item.Code,
            Name = item.Name,
            CategoryId = item.CategoryId ?? "",
            Unit = item.Unit,
            Description = item.Description,
            UnitPrice = item.UnitPrice == null ? "" : DecimalInput.Format(item.UnitPrice.Value),
            Currency = item.Currency,
            SupplierId = item.SupplierId ?? "",
            Source = item.Source,
            EffectiveFrom = item.EffectiveFrom ?? "",
            EffectiveTo = item.EffectiveTo ?? "",
            Notes = item.Notes,
        };

        // ---------- Tài nguyên ----------

        public static FormResult<Resource> ValidateResource(ResourceForm form, LibrarySnapshot library, string? editingId)
        {
            var errors = new List<FieldError>();
            var code = Required(form.Code, Fields.Code, "mã tài nguyên", errors);
            var name = Required(form.Name, Fields.Name, "tên tài nguyên", errors);
            var unit = Required(form.Unit, Fields.Unit, "đơn vị tính", errors);
            if (code != "" && library.Resources.Any(r => r.Id != editingId && Names.NormalizeCode(r.Code) == Names.NormalizeCode(code)))
            {
                errors.Add(new FieldError(Fields.Code, $"Mã \"{code}\" đã có trong thư viện."));
            }
            var categoryId = CheckRef(form.CategoryId, library.Categories.Select(c => c.Id), Fields.CategoryId, "Nhóm", errors);
            if (errors.Count > 0)
            {
                return FormResult<Resource>.Failure(errors);
            }
            return FormResult<Resource>.Success(new Resource
            {
                Code = code,
                Name = name,
                Type = form.Type,
                CategoryId = categoryId,
                Unit = unit,
                Notes = form.Notes.Trim(),
            });
        }

        public static ResourceForm ToForm(Resource resource) => new ResourceForm
        {
            Code = resource.Code,
            Name = resource.Name,
            Type = resource.Type,
            CategoryId = resource.CategoryId ?? "",
            Unit = resource.Unit,
            Notes = resource.Notes,
        };

        // ---------- Giá tài nguyên ----------

        /// <summary>Kết quả Ok là giá chưa có id và ResourceId.</summary>
        public static FormResult<ResourcePrice> ValidatePrice(PriceForm form, IEnumerable<Supplier> suppliers)
        {
            var errors = new List<FieldError>();
            var parsed = DecimalInput.Parse(form.Price);
            var price = 0m;
            if (!parsed.Ok)
            {
                errors.Add(new FieldError(Fields.Price, parsed.Message));
            }
            else if (parsed.Value == null)
            {
                errors.Add(new FieldError(Fields.Price, "Nhập đơn giá."));
            }
            else if (parsed.Value < 0)
            {
                errors.Add(new FieldError(Fields.Price, "Đơn giá không được âm."));
            }
            else
            {
                price = parsed.Value.Value;
            }
            var unit = Required(form.Unit, Fields.Unit, "đơn vị tính", errors);
            var currency = Required(form.Currency, Fields.Currency, "đơn vị tiền tệ", errors);
            var dates = CheckDates(form.EffectiveFrom, form.EffectiveTo, Fields.EffectiveFrom, Fields.EffectiveTo, errors);
            var supplierId = CheckRef(form.SupplierId, suppliers.Select(s => s.Id), Fields.SupplierId, "Nhà cung cấp", errors);
            if (errors.Count > 0)
            {
                return FormResult<ResourcePrice>.Failure(errors);
            }
            return FormResult<ResourcePrice>.Success(new ResourcePrice
            {
                Price = price,
                Unit = unit,
                Currency = currency,
                EffectiveFrom = dates.From,
                EffectiveTo = dates.To,
                SupplierId = supplierId,
                Source = form.Source.Trim(),
                Status = form.Status,
                Notes = form.Notes.Trim(),
            });
        }

        public static PriceForm ToForm(ResourcePrice price) => new PriceForm
        {
            Price = DecimalInput.Format(price.Price),
            Unit = price.Unit,
            Currency = price.Currency,
            EffectiveFrom = price.EffectiveFrom ?? "",
            EffectiveTo = price.EffectiveTo ?? "",
            SupplierId = price.SupplierId ?? "",
            Source = price.Source,
            Status = price.Status,
            Notes = price.Notes,
        };

        // ---------- Danh mục và nhà cung cấp ----------

        private static void UniqueName(string name, IEnumerable<(string Id, string Name)> existing, string? editingId, string field, string what, List<FieldError> errors)
        {
            if (name.Length > NameMax)
            {
                errors.Add(new FieldError(field, $"Tên tối đa {NameMax} ký tự."));
            }
            if (name != "" && existing.Any(x => x.Id != editingId && Names.NormalizeName(x.Name) == Names.NormalizeName(name)))
            {
                errors.Add(new FieldError(field, $"Đã có {what} tên \"{name}\"."));
            }
        }

        public static FormResult<Category> ValidateCategory(CategoryForm form, IEnumerable<Category> existing, string? editingId)
        {
            var errors = new List<FieldError>();
            var name = Required(Names.CollapseSpaces(form.Name), Fields.Name, "tên nhóm", errors);
            UniqueName(name, existing.Select(c => (c.Id, c.Name)), editingId, Fields.Name, "nhóm", errors);
            if (errors.Count > 0)
            {
                return FormResult<Category>.Failure(errors);
            }
            return FormResult<Category>.Success(new Category { Name = name, Notes = form.Notes.Trim() });
        }

        public static FormResult<Supplier> ValidateSupplier(SupplierForm form, IEnumerable<Supplier> existing, string? editingId)
        {
            var errors = new List<FieldError>();
            var name = Required(Names.CollapseSpaces(form.Name), Fields.Name, "tên nhà cung cấp", errors);
            UniqueName(name, existing.Select(s => (s.Id, s.Name)), editingId, Fields.Name, "nhà cung cấp", errors);
            var contactInfo = form.ContactInfo.Trim();
            if (contactInfo.Length > ContactMax)
            {
                errors.Add(new FieldError(Fields.ContactInfo, $"Thông tin liên hệ tối đa {ContactMax} ký tự."));
            }
            if (errors.Count > 0)
            {
                return FormResult<Supplier>.Failure(errors);
            }
            return FormResult<Supplier>.Success(new Supplier { Name = name, ContactInfo = contactInfo, Notes = form.Notes.Trim() });
        }

        // ---------- Định mức (ADR-0013) ----------

        public static NormForm ToForm(Norm norm) => new NormForm
        {
            Code = norm.Code,
            Name = norm.Name,
            Unit = norm.Unit,
            CategoryId = norm.CategoryId ?? "",
            WorkItemId = norm.WorkItemId ?? "",
            Version = norm.Version,
            EffectiveFrom = norm.EffectiveFrom ?? "",
            SourceType = norm.SourceType,
            Source = norm.Source,
            SourceVerified = norm.SourceVerified,
            WasteIncluded = norm.WasteIncluded,
            Notes = norm.Notes,
        };

        /// <summary>Cùng mã định mức và cùng phiên bản (không phân biệt hoa thường, khoảng trắng hai đầu).</summary>
        public static bool SameNormVersion(string codeA, string versionA, string codeB, string versionB) =>
            Names.NormalizeCode(codeA) == Names.NormalizeCode(codeB) && Names.NormalizeCode(versionA) == Names.NormalizeCode(versionB);

        private static Norm? ApprovedForWorkItem(IEnumerable<Norm> norms, string workItemId, string exceptId) =>
            norms.FirstOrDefault(n => n.Id != exceptId && n.Status == NormStatus.Approved && n.WorkItemId == workItemId);

        /// <summary>Kết quả Ok là định mức chưa có id, trạng thái và thời điểm (dịch vụ giữ trạng thái hiện có).</summary>
        public static FormResult<Norm> ValidateNorm(NormForm form, LibrarySnapshot library, string? editingId)
        {
            var errors = new List<FieldError>();
            var code = Required(form.Code, Fields.Code, "mã định mức", errors);
            var name = Required(form.Name, Fields.Name, "tên công tác", errors);
            var unit = Required(form.Unit, Fields.Unit, "đơn vị tính của công tác", errors);
            var version = Required(form.Version, Fields.Version, "phiên bản", errors);
            if (code != "" && version != "" && library.Norms.Any(n => n.Id != editingId && SameNormVersion(n.Code, n.Version, code, version)))
            {
                errors.Add(new FieldError(Fields.Version, $"Định mức \"{code}\" đã có phiên bản \"{version}\"."));
            }
            var effectiveFrom = form.EffectiveFrom.Trim() == "" ? null : form.EffectiveFrom.Trim();
            if (effectiveFrom != null && !Dates.IsIsoDate(effectiveFrom))
            {
                errors.Add(new FieldError(Fields.EffectiveFrom, "Ngày không hợp lệ."));
            }
            var categoryId = CheckRef(form.CategoryId, library.Categories.Select(c => c.Id), Fields.CategoryId, "Nhóm", errors);
            var workItemId = CheckRef(form.WorkItemId, library.WorkItems.Select(w => w.Id), Fields.WorkItemId, "Công tác", errors);
            if (form.SourceType == NormSourceType.Document && form.Source.Trim() == "")
            {
                errors.Add(new FieldError(Fields.Source, "Nhập mã hoặc tên tài liệu nguồn."));
            }
            var existing = editingId == null ? null : library.Norms.FirstOrDefault(n => n.Id == editingId);
            if (existing != null && existing.Status != NormStatus.Draft)
            {
                // Trường ảnh hưởng kết quả tính hoặc định danh phiên bản: khóa khi không còn là nháp.
                if (Names.NormalizeCode(existing.Code) != Names.NormalizeCode(form.Code.Trim()))
                {
                    errors.Add(new FieldError(Fields.Code, LockedFieldMessage));
                }
                if (Names.NormalizeCode(existing.Version) != Names.NormalizeCode(form.Version.Trim()))
                {
                    errors.Add(new FieldError(Fields.Version, LockedFieldMessage));
                }
                if (Names.NormalizeCode(existing.Unit) != Names.NormalizeCode(form.Unit.Trim()))
                {
                    errors.Add(new FieldError(Fields.Unit, LockedFieldMessage));
                }
                if (existing.WasteIncluded != form.WasteIncluded)
                {
                    errors.Add(new FieldError(Fields.WasteIncluded, LockedFieldMessage));
                }
                if (existing.Status == NormStatus.Approved && workItemId != null && workItemId != existing.WorkItemId)
                {
                    var other = ApprovedForWorkItem(library.Norms, workItemId, existing.Id);
                    if (other != null)
                    {
                        errors.Add(new FieldError(Fields.WorkItemId, $"Công tác này đã dùng định mức \"{other.Code}\" phiên bản {other.Version}."));
                    }
                }
            }
            if (errors.Count > 0)
            {
                return FormResult<Norm>.Failure(errors);
            }
            return FormResult<Norm>.Success(new Norm
            {
                Code = code,
                Name = name,
                Unit = unit,
                CategoryId = categoryId,
                WorkItemId = workItemId,
                Version = version,
                EffectiveFrom = effectiveFrom,
                SourceType = form.SourceType,
                Source = form.Source.Trim(),
                SourceVerified = form.SourceVerified,
                WasteIncluded = form.WasteIncluded,
                Notes = form.Notes.Trim(),
            });
        }

        /// <summary>
        /// Chuyển trạng thái phiên bản. Nháp hoặc ngừng dùng → đang dùng: phải có thành phần, mọi thành phần
        /// trỏ tới tài nguyên còn tồn tại, cùng đơn vị lúc liên kết, không trùng tài nguyên, hao phí &gt; 0; mỗi
        /// mã và mỗi công tác chỉ một phiên bản đang dùng. Đang dùng → ngừng dùng: luôn được. Không quay lại
        /// nháp. Trả về null nếu được phép, ngược lại là thông báo lý do.
        /// </summary>
        public static string? CheckNormStatusChange(Norm norm, NormStatus next, LibrarySnapshot library)
        {
            if (next == norm.Status)
            {
                return null;
            }
            if (next == NormStatus.Draft)
            {
                return "Phiên bản đã dùng không quay lại nháp được. Hãy sao chép thành phiên bản mới.";
            }
            if (next == NormStatus.Inactive)
            {
                return norm.Status == NormStatus.Approved
                    ? null
                    : "Chỉ phiên bản đang dùng mới chuyển sang ngừng dùng; bản nháp có thể xóa.";
            }
            var components = library.NormComponents.Where(c => c.NormId == norm.Id).ToList();
            if (components.Count == 0)
            {
                return "Định mức chưa có thành phần nào.";
            }
            var resources = library.Resources.GroupBy(r => r.Id).ToDictionary(g => g.Key, g => g.First());
            var seen = new HashSet<string>();
            foreach (var c in components)
            {
                if (!resources.TryGetValue(c.ResourceId, out var resource))
                {
                    return $"Thành phần \"{c.ResourceCodeSnapshot}\" trỏ tới tài nguyên không còn tồn tại.";
                }
                if (Names.NormalizeCode(resource.Unit) != Names.NormalizeCode(c.ResourceUnitSnapshot))
                {
                    return $"Đơn vị của \"{resource.Code}\" đã đổi so với lúc liên kết. Kiểm tra hao phí và cập nhật liên kết trước.";
                }
                if (!seen.Add(c.ResourceId))
                {
                    return $"Tài nguyên \"{resource.Code}\" xuất hiện nhiều lần.";
                }
                if (c.Consumption <= 0)
                {
                    return $"Hao phí của \"{resource.Code}\" phải lớn hơn 0.";
                }
            }
            var sameCode = library.Norms.FirstOrDefault(n =>
                n.Id != norm.Id && n.Status == NormStatus.Approved && Names.NormalizeCode(n.Code) == Names.NormalizeCode(norm.Code));
            if (sameCode != null)
            {
                return $"Mã \"{norm.Code}\" đang dùng phiên bản {sameCode.Version}. Chuyển phiên bản đó sang ngừng dùng trước.";
            }
            if (norm.WorkItemId != null)
            {
                var other = ApprovedForWorkItem(library.Norms, norm.WorkItemId, norm.Id);
                if (other != null)
                {
                    return $"Công tác liên kết đang dùng định mức \"{other.Code}\" phiên bản {other.Version}. Chuyển định mức đó sang ngừng dùng trước.";
                }
            }
            return null;
        }

        public static FormResult<NormComponentData> ValidateNormComponent(NormComponentForm form, Norm norm, LibrarySnapshot library, string? editingId)
        {
            var errors = new List<FieldError>();
            if (norm.Status != NormStatus.Draft)
            {
                errors.Add(new FieldError(Fields.ResourceId,
                    "Phiên bản đang dùng hoặc ngừng dùng đã khóa thành phần. Hãy sao chép thành phiên bản mới để sửa."));
            }
            if (!library.Resources.Any(r => r.Id == form.ResourceId))
            {
                errors.Add(new FieldError(Fields.ResourceId, "Chọn tài nguyên trong thư viện."));
            }
            else if (library.NormComponents.Any(c => c.NormId == norm.Id && c.ResourceId == form.ResourceId && c.Id != editingId))
            {
                errors.Add(new FieldError(Fields.ResourceId, "Tài nguyên này đã có trong định mức."));
            }
            var parsed = DecimalInput.Parse(form.Consumption);
            var consumption = 0m;
            if (!parsed.Ok)
            {
                errors.Add(new FieldError(Fields.Consumption, parsed.Message));
            }
            else if (parsed.Value == null)
            {
                errors.Add(new FieldError(Fields.Consumption, "Nhập hao phí."));
            }
            else if (parsed.Value <= 0)
            {
                errors.Add(new FieldError(Fields.Consumption, "Hao phí phải lớn hơn 0."));
            }
            else
            {
                consumption = parsed.Value.Value;
            }
            var waste = DecimalInput.Parse(form.WastePercent);
            var wasteRate = 0m;
            if (!waste.Ok)
            {
                errors.Add(new FieldError(Fields.WastePercent, waste.Message));
            }
            else if (waste.Value != null)
            {
                if (waste.Value < 0 || waste.Value > 100)
                {
                    errors.Add(new FieldError(Fields.WastePercent, "Hao hụt từ 0 đến 100 (%)."));
                }
                else if (waste.Value > 0 && norm.WasteIncluded)
                {
                    errors.Add(new FieldError(Fields.WastePercent,
                        "Định mức ghi hao phí đã gồm hao hụt: để trống hao hụt để không tính trùng."));
                }
                else
                {
                    wasteRate = DecimalMath.PercentToRate(waste.Value.Value);
                }
            }
            if (errors.Count > 0)
            {
                return FormResult<NormComponentData>.Failure(errors);
            }
            return FormResult<NormComponentData>.Success(new NormComponentData
            {
                ResourceId = form.ResourceId,
                Consumption = consumption,
                WasteRate = wasteRate,
                Notes = form.Notes.Trim(),
            });
        }
    }
}
