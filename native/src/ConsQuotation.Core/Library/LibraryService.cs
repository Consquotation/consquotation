using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using ConsQuotation.Core.Exchange;
using ConsQuotation.Core.Storage;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Library
{
    /// <summary>Mốc sao lưu (ADR-0003): nhắc người dùng khi thư viện thay đổi sau lần sao lưu gần nhất.</summary>
    public sealed class BackupStatus
    {
        public string? LastBackupAt { get; set; }
        public string? LastChangedAt { get; set; }
    }

    /// <summary>Kết quả xóa tài nguyên: null = đã xóa; ngược lại là số định mức còn dùng tài nguyên.</summary>
    public sealed class DeleteResourceResult
    {
        public bool Ok => InUseByNorms == 0;
        public int InUseByNorms { get; set; }
    }

    /// <summary>
    /// Use case quản lý thư viện cá nhân (prompts/08), chuyển từ src/application/libraryService.ts. Kiểm
    /// tra dữ liệu trước khi lưu, giữ ràng buộc giữa các bản ghi, không tự bịa dữ liệu. Thao tác vi phạm
    /// ràng buộc ném InvalidOperationException với thông báo tiếng Việt.
    /// </summary>
    public sealed class LibraryService
    {
        private const string LastBackupKey = "lastBackupAt";
        private const string LastChangedKey = "lastChangedAt";
        private const string LibraryNameKey = "libraryName";

        private static readonly Regex Spaces = new Regex(@"\s+");
        private static readonly Regex Numeric = new Regex(@"^\d+$");

        private readonly LibraryStore store;
        private readonly Func<DateTime> nowUtc;
        private readonly Func<string> newId;

        public LibraryService(LibraryStore store, Func<DateTime> nowUtc, Func<string> newId)
        {
            this.store = store;
            this.nowUtc = nowUtc;
            this.newId = newId;
        }

        public LibraryStore Store => store;

        public LibrarySnapshot Load() => store.LoadAll();

        private string Stamp() => nowUtc().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        /// <summary>Ghi mốc "thư viện vừa thay đổi". Lỗi ở đây không làm hỏng thao tác chính đã lưu.</summary>
        private void Touch()
        {
            try
            {
                store.SetSetting(LastChangedKey, Stamp());
            }
            catch (LibraryStorageException)
            {
                // Chỉ ảnh hưởng lời nhắc sao lưu.
            }
        }

        // ---------- Tên thư viện, mốc sao lưu ----------

        /// <summary>Tên hợp lệ: bỏ khoảng trắng thừa, tối đa 80 ký tự; trống → tên mặc định.</summary>
        public static string CleanLibraryName(string name)
        {
            var cleaned = Spaces.Replace(name, " ").Trim();
            if (cleaned.Length > LibrarySchema.NameMax)
            {
                cleaned = cleaned.Substring(0, LibrarySchema.NameMax).Trim();
            }
            return cleaned == "" ? LibrarySchema.DefaultName : cleaned;
        }

        public string LibraryName() => CleanLibraryName(store.GetSetting(LibraryNameKey)?.Type == JTokenType.String ? (string)store.GetSetting(LibraryNameKey)! : "");

        public string SetLibraryName(string name)
        {
            var cleaned = CleanLibraryName(name);
            store.SetSetting(LibraryNameKey, cleaned);
            Touch();
            return cleaned;
        }

        public BackupStatus GetBackupStatus()
        {
            var file = store.Read();
            string? Text(string key) => file.Settings.TryGetValue(key, out var v) && v?.Type == JTokenType.String ? (string)v! : null;
            return new BackupStatus { LastBackupAt = Text(LastBackupKey), LastChangedAt = Text(LastChangedKey) };
        }

        /// <summary>Gọi sau khi file sao lưu đã được ghi ra.</summary>
        public void RecordBackup(DateTime atUtc) =>
            store.SetSetting(LastBackupKey, atUtc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture));

        // ---------- Hàm phụ ----------

        /// <summary>Ảnh chụp thông tin tài nguyên lưu cùng thành phần định mức (ADR-0013).</summary>
        public static void ApplySnapshot(NormComponent component, Resource resource)
        {
            component.ResourceCodeSnapshot = resource.Code;
            component.ResourceNameSnapshot = resource.Name;
            component.ResourceUnitSnapshot = resource.Unit;
            component.ResourceTypeSnapshot = resource.Type;
        }

        /// <summary>Phiên bản tiếp theo chưa dùng của cùng mã: "1" → "2"; "2024" → "2025"; "A" → "A-2".</summary>
        public static string NextNormVersion(string code, string version, IEnumerable<Norm> norms)
        {
            var taken = new HashSet<string>(norms.Where(n => Names.NormalizeCode(n.Code) == Names.NormalizeCode(code))
                .Select(n => Names.NormalizeCode(n.Version)));
            var numeric = Numeric.IsMatch(version.Trim());
            var start = numeric ? long.Parse(version.Trim(), CultureInfo.InvariantCulture) + 1 : 2;
            for (var n = start; ; n++)
            {
                var candidate = numeric ? n.ToString(CultureInfo.InvariantCulture) : $"{version.Trim()}-{n}";
                if (!taken.Contains(Names.NormalizeCode(candidate)))
                {
                    return candidate;
                }
            }
        }

        /// <summary>"BT-01" → "BT-01 (2)", "BT-01 (3)"… sao cho không trùng mã nào trong thư viện.</summary>
        public static string UniqueCopyCode(string code, IEnumerable<string> existingCodes)
        {
            var taken = new HashSet<string>(existingCodes.Select(Names.NormalizeCode));
            for (var n = 2; ; n++)
            {
                var candidate = $"{code} ({n})";
                if (!taken.Contains(Names.NormalizeCode(candidate)))
                {
                    return candidate;
                }
            }
        }

        private static T Clone<T>(T value) where T : class => Json.Deserialize<T>(Json.Serialize(value, indented: false))!;

        // ---------- Công tác ----------

        public FormResult<WorkItem> SaveWorkItem(WorkItemForm form, string? editingId, LibrarySnapshot library)
        {
            var result = Validation.ValidateWorkItem(form, library, editingId);
            if (!result.Ok)
            {
                return result;
            }
            var existing = editingId == null ? null : library.WorkItems.FirstOrDefault(w => w.Id == editingId);
            var now = Stamp();
            var item = result.Value!;
            // Giữ phương pháp định giá đã có khi sửa.
            item.PricingMethod = existing?.PricingMethod ?? item.PricingMethod;
            item.Id = existing?.Id ?? newId();
            item.CreatedAt = existing?.CreatedAt ?? now;
            item.UpdatedAt = now;
            store.PutWorkItem(item);
            Touch();
            return FormResult<WorkItem>.Success(item);
        }

        /// <summary>Sao chép công tác với mã mới không trùng (định mức là bản ghi riêng, không chép theo).</summary>
        public WorkItem CopyWorkItem(string id, LibrarySnapshot library)
        {
            var source = library.WorkItems.FirstOrDefault(w => w.Id == id) ?? throw new InvalidOperationException("Công tác không còn tồn tại.");
            var now = Stamp();
            var copy = Clone(source);
            copy.Id = newId();
            copy.Code = UniqueCopyCode(source.Code, library.WorkItems.Select(w => w.Code));
            copy.CreatedAt = now;
            copy.UpdatedAt = now;
            store.PutWorkItem(copy);
            Touch();
            return copy;
        }

        /// <summary>Xóa công tác; định mức liên kết được giữ lại và chỉ bị bỏ liên kết.</summary>
        public void DeleteWorkItem(string id)
        {
            store.DeleteWorkItem(id, Stamp());
            Touch();
        }

        // ---------- Tài nguyên và giá ----------

        public FormResult<Resource> SaveResource(ResourceForm form, string? editingId, LibrarySnapshot library)
        {
            var result = Validation.ValidateResource(form, library, editingId);
            if (!result.Ok)
            {
                return result;
            }
            var existing = editingId == null ? null : library.Resources.FirstOrDefault(r => r.Id == editingId);
            var now = Stamp();
            var resource = result.Value!;
            resource.Id = existing?.Id ?? newId();
            resource.CreatedAt = existing?.CreatedAt ?? now;
            resource.UpdatedAt = now;
            store.PutResource(resource);
            Touch();
            return FormResult<Resource>.Success(resource);
        }

        /// <summary>Chặn xóa tài nguyên đang được định mức sử dụng; giá của tài nguyên được xóa cùng.</summary>
        public DeleteResourceResult DeleteResource(string id, LibrarySnapshot library)
        {
            var normCount = library.NormComponents.Count(c => c.ResourceId == id);
            if (normCount > 0)
            {
                return new DeleteResourceResult { InUseByNorms = normCount };
            }
            store.DeleteResource(id);
            Touch();
            return new DeleteResourceResult();
        }

        public FormResult<ResourcePrice> SavePrice(string resourceId, PriceForm form, string? editingId, LibrarySnapshot library)
        {
            if (!library.Resources.Any(r => r.Id == resourceId))
            {
                throw new InvalidOperationException("Tài nguyên không còn tồn tại.");
            }
            var result = Validation.ValidatePrice(form, library.Suppliers);
            if (!result.Ok)
            {
                return result;
            }
            var existing = editingId == null ? null : library.ResourcePrices.FirstOrDefault(p => p.Id == editingId);
            var now = Stamp();
            var price = result.Value!;
            price.Id = existing?.Id ?? newId();
            price.ResourceId = resourceId;
            price.CreatedAt = existing?.CreatedAt ?? now;
            price.UpdatedAt = now;
            store.PutPrice(price);
            Touch();
            return FormResult<ResourcePrice>.Success(price);
        }

        public void DeletePrice(string id)
        {
            store.DeletePrice(id);
            Touch();
        }

        // ---------- Định mức (ADR-0013) ----------

        private static Norm RequireNorm(string id, LibrarySnapshot library) =>
            library.Norms.FirstOrDefault(n => n.Id == id) ?? throw new InvalidOperationException("Định mức không còn tồn tại.");

        private static void RequireDraft(Norm norm)
        {
            if (norm.Status != NormStatus.Draft)
            {
                throw new InvalidOperationException("Phiên bản đang dùng hoặc ngừng dùng đã khóa. Hãy sao chép thành phiên bản mới để sửa.");
            }
        }

        private static NormComponent RequireComponent(string id, LibrarySnapshot library) =>
            library.NormComponents.FirstOrDefault(c => c.Id == id) ?? throw new InvalidOperationException("Thành phần không còn tồn tại.");

        private static Norm Touched(Norm norm, string now)
        {
            var copy = Clone(norm);
            copy.UpdatedAt = now;
            return copy;
        }

        /// <summary>Tạo định mức mới (luôn là nháp) hoặc sửa thông tin định mức.</summary>
        public FormResult<Norm> SaveNorm(NormForm form, string? editingId, LibrarySnapshot library)
        {
            var result = Validation.ValidateNorm(form, library, editingId);
            if (!result.Ok)
            {
                return result;
            }
            var existing = editingId == null ? null : RequireNorm(editingId, library);
            var now = Stamp();
            var norm = result.Value!;
            norm.Status = existing?.Status ?? NormStatus.Draft;
            norm.Id = existing?.Id ?? newId();
            norm.CreatedAt = existing?.CreatedAt ?? now;
            norm.UpdatedAt = now;
            store.PutNorm(norm);
            Touch();
            return FormResult<Norm>.Success(norm);
        }

        /// <summary>Đổi trạng thái; trả về null nếu được, ngược lại là lý do.</summary>
        public string? SetNormStatus(string id, NormStatus status, LibrarySnapshot library)
        {
            var norm = RequireNorm(id, library);
            var reason = Validation.CheckNormStatusChange(norm, status, library);
            if (reason != null)
            {
                return reason;
            }
            var updated = Touched(norm, Stamp());
            updated.Status = status;
            store.PutNorm(updated);
            Touch();
            return null;
        }

        /// <summary>
        /// Sao chép thành phiên bản mới (nháp), kèm mọi thành phần. Ảnh chụp tài nguyên làm mới theo thư viện
        /// hiện tại (tài nguyên đã bị xóa thì giữ ảnh chụp cũ để còn cảnh báo).
        /// </summary>
        public Norm CopyNormAsNewVersion(string id, LibrarySnapshot library)
        {
            var source = RequireNorm(id, library);
            var now = Stamp();
            var copy = Clone(source);
            copy.Id = newId();
            copy.Version = NextNormVersion(source.Code, source.Version, library.Norms);
            copy.Status = NormStatus.Draft;
            copy.CreatedAt = now;
            copy.UpdatedAt = now;
            var resources = library.Resources.GroupBy(r => r.Id).ToDictionary(g => g.Key, g => g.First());
            var components = library.NormComponents.Where(c => c.NormId == source.Id).Select(c =>
            {
                var clone = Clone(c);
                if (resources.TryGetValue(c.ResourceId, out var resource))
                {
                    ApplySnapshot(clone, resource);
                }
                clone.Id = newId();
                clone.NormId = copy.Id;
                clone.CreatedAt = now;
                clone.UpdatedAt = now;
                return clone;
            }).ToList();
            store.PutNorm(copy, components);
            Touch();
            return copy;
        }

        /// <summary>Chỉ xóa được bản nháp; phiên bản đã dùng thì chuyển sang ngừng dùng để giữ lịch sử.</summary>
        public void DeleteNorm(string id, LibrarySnapshot library)
        {
            RequireDraft(RequireNorm(id, library));
            store.DeleteNorm(id);
            Touch();
        }

        public FormResult<NormComponent> SaveNormComponent(string normId, NormComponentForm form, string? editingId, LibrarySnapshot library)
        {
            var norm = RequireNorm(normId, library);
            var result = Validation.ValidateNormComponent(form, norm, library, editingId);
            if (!result.Ok)
            {
                return FormResult<NormComponent>.Failure(result.Errors);
            }
            var data = result.Value!;
            var resource = library.Resources.First(r => r.Id == data.ResourceId);
            var siblings = library.NormComponents.Where(c => c.NormId == normId).ToList();
            var existing = editingId == null ? null : siblings.FirstOrDefault(c => c.Id == editingId);
            if (editingId != null && existing == null)
            {
                throw new InvalidOperationException("Thành phần không còn tồn tại.");
            }
            var now = Stamp();
            var component = new NormComponent
            {
                Id = existing?.Id ?? newId(),
                NormId = normId,
                ResourceId = resource.Id,
                Consumption = data.Consumption,
                WasteRate = data.WasteRate,
                // Giá đã chọn chỉ còn ý nghĩa khi vẫn là cùng tài nguyên.
                PriceId = existing != null && existing.ResourceId == resource.Id ? existing.PriceId : null,
                SortOrder = existing?.SortOrder ?? (siblings.Count == 0 ? 0 : Math.Max(0, siblings.Max(c => c.SortOrder))) + 1,
                Notes = data.Notes,
                CreatedAt = existing?.CreatedAt ?? now,
                UpdatedAt = now,
            };
            ApplySnapshot(component, resource);
            store.PutNormComponent(component, Touched(norm, now));
            Touch();
            return FormResult<NormComponent>.Success(component);
        }

        public void DeleteNormComponent(string id, LibrarySnapshot library)
        {
            var component = RequireComponent(id, library);
            var norm = RequireNorm(component.NormId, library);
            RequireDraft(norm);
            store.DeleteNormComponent(id, Touched(norm, Stamp()));
            Touch();
        }

        /// <summary>Đổi chỗ thành phần với thành phần liền trước (-1) hoặc liền sau (+1).</summary>
        public void MoveNormComponent(string id, int direction, LibrarySnapshot library)
        {
            var component = RequireComponent(id, library);
            var norm = RequireNorm(component.NormId, library);
            RequireDraft(norm);
            var siblings = library.NormComponents.Where(c => c.NormId == norm.Id)
                .Select((c, i) => (c, i))
                .OrderBy(x => x.c.SortOrder).ThenBy(x => x.c.CreatedAt, StringComparer.Ordinal).ThenBy(x => x.i)
                .Select(x => x.c).ToList();
            var index = siblings.FindIndex(c => c.Id == id);
            var target = index + direction;
            if (target < 0 || target >= siblings.Count)
            {
                return;
            }
            var now = Stamp();
            // Đánh lại số thứ tự liên tục để hai thành phần trùng sortOrder cũng đổi chỗ được.
            var orders = siblings.Select((c, i) => i + 1).ToArray();
            orders[index] = index + 1 + direction;
            orders[target] = index + 1;
            var reordered = siblings.Select((c, i) =>
            {
                var clone = Clone(c);
                clone.SortOrder = orders[i];
                clone.UpdatedAt = now;
                return clone;
            }).ToList();
            store.PutNorm(Touched(norm, now), reordered);
            Touch();
        }

        /// <summary>Làm mới ảnh chụp theo tài nguyên hiện tại sau khi người dùng đã kiểm tra.</summary>
        public void RefreshComponentLink(string id, LibrarySnapshot library)
        {
            var component = RequireComponent(id, library);
            var norm = RequireNorm(component.NormId, library);
            RequireDraft(norm);
            var resource = library.Resources.FirstOrDefault(r => r.Id == component.ResourceId)
                ?? throw new InvalidOperationException("Tài nguyên đã bị xóa: hãy chọn tài nguyên khác cho thành phần này.");
            var now = Stamp();
            // Đổi đơn vị thì giá đã chọn (theo đơn vị cũ) không còn dùng được: bỏ chọn để người dùng chọn lại.
            var unitChanged = Names.NormalizeCode(resource.Unit) != Names.NormalizeCode(component.ResourceUnitSnapshot);
            var updated = Clone(component);
            ApplySnapshot(updated, resource);
            updated.PriceId = unitChanged ? null : component.PriceId;
            updated.UpdatedAt = now;
            store.PutNormComponent(updated, Touched(norm, now));
            Touch();
        }

        /// <summary>
        /// Chọn giá áp dụng cho thành phần (null = add-in tự lấy khi chỉ có một giá dùng được). Đổi được ở bản
        /// nháp và phiên bản đang dùng (giá đổi theo thời gian, hao phí thì không); ngừng dùng giữ nguyên.
        /// </summary>
        public void SetComponentPrice(string id, string? priceId, LibrarySnapshot library)
        {
            var component = RequireComponent(id, library);
            var norm = RequireNorm(component.NormId, library);
            if (norm.Status == NormStatus.Inactive)
            {
                throw new InvalidOperationException("Phiên bản ngừng dùng đã khóa, không đổi giá áp dụng.");
            }
            if (priceId != null && !library.ResourcePrices.Any(p => p.Id == priceId && p.ResourceId == component.ResourceId))
            {
                throw new InvalidOperationException("Giá đã chọn không còn trong thư viện. Hãy tải lại và chọn lại.");
            }
            if (priceId == component.PriceId)
            {
                return;
            }
            var now = Stamp();
            var updated = Clone(component);
            updated.PriceId = priceId;
            updated.UpdatedAt = now;
            store.PutNormComponent(updated, Touched(norm, now));
            Touch();
        }

        // ---------- Danh mục ----------

        public FormResult<Category> SaveCategory(CategoryForm form, string? editingId, LibrarySnapshot library)
        {
            var result = Validation.ValidateCategory(form, library.Categories, editingId);
            if (!result.Ok)
            {
                return result;
            }
            var existing = editingId == null ? null : library.Categories.FirstOrDefault(c => c.Id == editingId);
            if (editingId != null && existing == null)
            {
                throw new InvalidOperationException("Nhóm không còn tồn tại.");
            }
            var now = Stamp();
            var category = result.Value!;
            category.Id = existing?.Id ?? newId();
            category.CreatedAt = existing?.CreatedAt ?? now;
            category.UpdatedAt = now;
            store.PutCategory(category);
            Touch();
            return FormResult<Category>.Success(category);
        }

        /// <summary>Xóa danh mục; công tác/tài nguyên của nó chuyển sang <paramref name="reassignTo"/> hoặc bỏ phân nhóm.</summary>
        public void DeleteCategory(string id, string? reassignTo, LibrarySnapshot library)
        {
            if (reassignTo == id)
            {
                throw new InvalidOperationException("Không thể chuyển sang chính nhóm đang xóa.");
            }
            if (reassignTo != null && !library.Categories.Any(c => c.Id == reassignTo))
            {
                throw new InvalidOperationException("Nhóm đích không còn tồn tại.");
            }
            store.DeleteCategory(id, reassignTo, Stamp());
            Touch();
        }

        // ---------- Nhà cung cấp ----------

        public FormResult<Supplier> SaveSupplier(SupplierForm form, string? editingId, LibrarySnapshot library)
        {
            var result = Validation.ValidateSupplier(form, library.Suppliers, editingId);
            if (!result.Ok)
            {
                return result;
            }
            var existing = editingId == null ? null : library.Suppliers.FirstOrDefault(s => s.Id == editingId);
            if (editingId != null && existing == null)
            {
                throw new InvalidOperationException("Nhà cung cấp không còn tồn tại.");
            }
            var now = Stamp();
            var supplier = result.Value!;
            supplier.Id = existing?.Id ?? newId();
            supplier.CreatedAt = existing?.CreatedAt ?? now;
            supplier.UpdatedAt = now;
            store.PutSupplier(supplier);
            Touch();
            return FormResult<Supplier>.Success(supplier);
        }

        /// <summary>Xóa nhà cung cấp; công tác/giá đang trỏ tới nó chỉ bị bỏ liên kết.</summary>
        public void DeleteSupplier(string id)
        {
            store.DeleteSupplier(id, Stamp());
            Touch();
        }

        // ---------- Nhập ----------

        public ImportAnalysis AnalyzeImport(IReadOnlyList<ImportDataset> datasets, LibrarySnapshot library, DuplicateMode mode) =>
            ImportAnalyzer.Analyze(datasets, library, new AnalyzeOptions(mode, Stamp(), newId));

        /// <summary>Ghi kết quả nhập trong một lần ghi: lỗi thì thư viện giữ nguyên.</summary>
        public void ApplyImport(LibrarySnapshot changes)
        {
            store.ApplyImport(changes);
            Touch();
        }
    }
}
