using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using ConsQuotation.Core.Library;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Storage
{
    /// <summary>Lỗi lưu trữ đã diễn giải sang tiếng Việt (người dùng đọc được), kèm lỗi gốc để chẩn đoán.</summary>
    public sealed class LibraryStorageException : Exception
    {
        public LibraryStorageException(string message, Exception? inner = null) : base(message, inner)
        {
        }
    }

    /// <summary>Nội dung file thư viện trên máy.</summary>
    public sealed class StoreFile
    {
        public const string FormatName = "consquotation-library-store";

        /// <summary>Không đặt mặc định: file JSON khác (không có trường này) phải bị nhận ra và không bị ghi đè.</summary>
        public string? Format { get; set; }
        public int SchemaVersion { get; set; } = LibrarySchema.Version;
        /// <summary>Tên thư viện, mốc sao lưu… (giá trị JSON tùy loại).</summary>
        public Dictionary<string, JToken?> Settings { get; set; } = new Dictionary<string, JToken?>();
        public LibrarySnapshot Library { get; set; } = new LibrarySnapshot();
    }

    /// <summary>
    /// Thư viện cá nhân lưu thành MỘT file JSON trên máy (docs/NATIVE_PLAN.md), thay IndexedDB của bản web:
    /// không mất khi xóa cache Office. Mỗi lần ghi: giữ khóa dùng chung toàn máy (nhiều cửa sổ Excel), đọc
    /// lại file mới nhất, sửa, ghi ra file tạm rồi thay file chính và giữ bản trước (.bak). File hỏng thì
    /// báo lỗi, KHÔNG ghi đè, để người dùng còn khôi phục.
    /// </summary>
    public sealed class LibraryStore
    {
        private static readonly TimeSpan LockTimeout = TimeSpan.FromSeconds(15);

        private readonly string path;
        private readonly string mutexName;

        public LibraryStore(string path)
        {
            this.path = path;
            // Một khóa cho mỗi file, cùng tên ở mọi tiến trình Excel (string.GetHashCode không bảo đảm điều này).
            mutexName = @"Local\ConsQuotation.Library." + StableHash(Path.GetFullPath(path).ToLowerInvariant());
        }

        /// <summary>Biến môi trường chỉ file thư viện khác (kiểm thử trên Excel thật không đụng thư viện của người dùng).</summary>
        public const string PathVariable = "CONSQUOTATION_LIBRARY";

        /// <summary>%APPDATA%\ConsQuotation\library.json, hoặc file trong biến CONSQUOTATION_LIBRARY nếu có.</summary>
        public static string DefaultPath =>
            Environment.GetEnvironmentVariable(PathVariable) is string custom && custom.Trim() != ""
                ? custom.Trim()
                : System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ConsQuotation", "library.json");

        public string FilePath => path;
        public string BackupPath => path + ".bak";

        private static string StableHash(string text)
        {
            using (var sha = System.Security.Cryptography.SHA256.Create())
            {
                var digest = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(text));
                return string.Concat(digest.Take(8).Select(b => b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture)));
            }
        }

        /// <summary>Đọc toàn bộ thư viện (file chưa có → thư viện trống).</summary>
        public LibrarySnapshot LoadAll() => Read().Library;

        public JToken? GetSetting(string key) => Read().Settings.TryGetValue(key, out var value) ? value : null;

        /// <summary>
        /// Đọc file hiện tại. Cũng giữ khóa: đọc lúc cửa sổ khác đang thay file có thể gặp file vắng mặt hoặc
        /// đang bị khóa trong tích tắc.
        /// </summary>
        public StoreFile Read() => WithLock(ReadLocked);

        private StoreFile ReadLocked()
        {
            string? text = null;
            for (var attempt = 1; text == null; attempt++)
            {
                try
                {
                    if (!File.Exists(path))
                    {
                        return new StoreFile();
                    }
                    text = ReadShared(path);
                }
                catch (IOException) when (attempt < ReadAttempts)
                {
                    // Chương trình khác (diệt virus, đồng bộ đám mây) có thể mở file trong chốc lát.
                    Thread.Sleep(50 * attempt);
                }
                catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
                {
                    throw new LibraryStorageException($"Không đọc được file thư viện \"{path}\": {ex.Message}", ex);
                }
            }
            return Parse(text);
        }

        private const int ReadAttempts = 5;

        private static string ReadShared(string file)
        {
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var reader = new StreamReader(stream, System.Text.Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }

        private StoreFile Parse(string text)
        {
            StoreFile? file;
            try
            {
                file = Json.Deserialize<StoreFile>(text);
            }
            catch (JsonException ex)
            {
                throw new LibraryStorageException(
                    $"File thư viện \"{path}\" bị hỏng nên không đọc được. Add-in không ghi đè file này. Hãy khôi phục từ bản sao lưu (.json) hoặc từ file \"{BackupPath}\".",
                    ex);
            }
            if (file == null || file.Format != StoreFile.FormatName)
            {
                throw new LibraryStorageException($"File \"{path}\" không phải file thư viện ConsQuotation. Add-in không ghi đè file này.");
            }
            if (file.SchemaVersion > LibrarySchema.Version)
            {
                throw new LibraryStorageException(
                    $"File thư viện được tạo bởi phiên bản ConsQuotation mới hơn (schema {file.SchemaVersion}). Hãy cập nhật add-in; add-in không ghi để tránh mất dữ liệu.");
            }
            Normalize(file.Library);
            return file;
        }

        /// <summary>Đọc phòng thủ: danh sách thiếu (file sửa tay) coi là rỗng.</summary>
        private static void Normalize(LibrarySnapshot library)
        {
            library.Categories ??= new List<Category>();
            library.Suppliers ??= new List<Supplier>();
            library.WorkItems ??= new List<WorkItem>();
            library.Resources ??= new List<Resource>();
            library.ResourcePrices ??= new List<ResourcePrice>();
            library.Norms ??= new List<Norm>();
            library.NormComponents ??= new List<NormComponent>();
        }

        /// <summary>
        /// Sửa thư viện trong một "giao dịch": khóa, đọc bản mới nhất, chạy <paramref name="mutate"/>, ghi
        /// nguyên tử. <paramref name="mutate"/> ném lỗi thì file giữ nguyên.
        /// </summary>
        public void Update(Action<StoreFile> mutate) => WithLock(() =>
        {
            var file = ReadLocked();
            mutate(file);
            Write(file);
            return true;
        });

        /// <summary>Khóa dùng chung toàn máy cho file này (mọi tiến trình Excel).</summary>
        private T WithLock<T>(Func<T> action)
        {
            using (var mutex = new Mutex(false, mutexName))
            {
                var owned = false;
                try
                {
                    try
                    {
                        owned = mutex.WaitOne(LockTimeout);
                    }
                    catch (AbandonedMutexException)
                    {
                        // Cửa sổ khác thoát giữa chừng: khóa vẫn thuộc về mình; file vẫn là bản ghi trọn vẹn gần nhất.
                        owned = true;
                    }
                    if (!owned)
                    {
                        throw new LibraryStorageException("Thư viện đang được ghi ở cửa sổ Excel khác quá lâu. Hãy thử lại.");
                    }
                    return action();
                }
                finally
                {
                    if (owned)
                    {
                        mutex.ReleaseMutex();
                    }
                }
            }
        }

        public void SetSetting(string key, JToken? value) => Update(file => file.Settings[key] = value);

        private void Write(StoreFile file)
        {
            var temp = path + ".tmp";
            try
            {
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(path))!);
                file.Format = StoreFile.FormatName;
                file.SchemaVersion = LibrarySchema.Version;
                File.WriteAllText(temp, Json.Serialize(file, indented: false), new System.Text.UTF8Encoding(false));
                if (File.Exists(path))
                {
                    File.Replace(temp, path, BackupPath, ignoreMetadataErrors: true);
                }
                else
                {
                    File.Move(temp, path);
                }
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                TryDelete(temp);
                throw new LibraryStorageException($"Không ghi được file thư viện \"{path}\" (ổ đĩa đầy, không có quyền ghi hoặc file đang bị khóa): {ex.Message}", ex);
            }
        }

        private static void TryDelete(string file)
        {
            try
            {
                if (File.Exists(file))
                {
                    File.Delete(file);
                }
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        // ---------- Thao tác có ràng buộc (giống LibraryRepository của bản web) ----------

        private static void Put<T>(List<T> list, T item, Func<T, string> id)
        {
            var index = list.FindIndex(x => id(x) == id(item));
            if (index >= 0)
            {
                list[index] = item;
            }
            else
            {
                list.Add(item);
            }
        }

        public void PutCategory(Category category) => Update(f => Put(f.Library.Categories, category, c => c.Id));

        /// <summary>Chuyển công tác/tài nguyên của danh mục sang <paramref name="reassignTo"/> (null = bỏ phân nhóm) rồi xóa nó.</summary>
        public void DeleteCategory(string id, string? reassignTo, string now) => Update(f =>
        {
            foreach (var w in f.Library.WorkItems.Where(w => w.CategoryId == id))
            {
                w.CategoryId = reassignTo;
                w.UpdatedAt = now;
            }
            foreach (var r in f.Library.Resources.Where(r => r.CategoryId == id))
            {
                r.CategoryId = reassignTo;
                r.UpdatedAt = now;
            }
            f.Library.Categories.RemoveAll(c => c.Id == id);
        });

        public void PutSupplier(Supplier supplier) => Update(f => Put(f.Library.Suppliers, supplier, s => s.Id));

        /// <summary>Bỏ liên kết nhà cung cấp ở mọi công tác/giá (giữ nguyên "Nguồn giá") rồi xóa nó.</summary>
        public void DeleteSupplier(string id, string now) => Update(f =>
        {
            foreach (var w in f.Library.WorkItems.Where(w => w.SupplierId == id))
            {
                w.SupplierId = null;
                w.UpdatedAt = now;
            }
            foreach (var p in f.Library.ResourcePrices.Where(p => p.SupplierId == id))
            {
                p.SupplierId = null;
                p.UpdatedAt = now;
            }
            f.Library.Suppliers.RemoveAll(s => s.Id == id);
        });

        public void PutWorkItem(WorkItem item) => Update(f => Put(f.Library.WorkItems, item, w => w.Id));

        /// <summary>Xóa công tác; định mức liên kết KHÔNG bị xóa, chỉ bỏ liên kết (giữ lịch sử).</summary>
        public void DeleteWorkItem(string id, string now) => Update(f =>
        {
            foreach (var n in f.Library.Norms.Where(n => n.WorkItemId == id))
            {
                n.WorkItemId = null;
                n.UpdatedAt = now;
            }
            f.Library.WorkItems.RemoveAll(w => w.Id == id);
        });

        public void PutResource(Resource resource) => Update(f => Put(f.Library.Resources, resource, r => r.Id));

        /// <summary>Xóa tài nguyên cùng mọi giá của nó (nghiệp vụ phải chặn trước nếu định mức còn dùng).</summary>
        public void DeleteResource(string id) => Update(f =>
        {
            f.Library.ResourcePrices.RemoveAll(p => p.ResourceId == id);
            f.Library.Resources.RemoveAll(r => r.Id == id);
        });

        public void PutPrice(ResourcePrice price) => Update(f => Put(f.Library.ResourcePrices, price, p => p.Id));

        public void DeletePrice(string id) => Update(f => f.Library.ResourcePrices.RemoveAll(p => p.Id == id));

        /// <summary>Ghi định mức cùng các thành phần (nếu có) trong một lần ghi.</summary>
        public void PutNorm(Norm norm, IEnumerable<NormComponent>? components = null) => Update(f =>
        {
            Put(f.Library.Norms, norm, n => n.Id);
            foreach (var c in components ?? Enumerable.Empty<NormComponent>())
            {
                Put(f.Library.NormComponents, c, x => x.Id);
            }
        });

        /// <summary>Xóa định mức cùng mọi thành phần (nghiệp vụ chỉ cho xóa bản nháp).</summary>
        public void DeleteNorm(string id) => Update(f =>
        {
            f.Library.NormComponents.RemoveAll(c => c.NormId == id);
            f.Library.Norms.RemoveAll(n => n.Id == id);
        });

        public void PutNormComponent(NormComponent component, Norm norm) => PutNorm(norm, new[] { component });

        public void DeleteNormComponent(string id, Norm norm) => Update(f =>
        {
            f.Library.NormComponents.RemoveAll(c => c.Id == id);
            Put(f.Library.Norms, norm, n => n.Id);
        });

        /// <summary>Ghi mọi bản ghi nhập trong MỘT lần ghi (ADR-0004); id đã có được thay thế.</summary>
        public void ApplyImport(LibrarySnapshot changes) => Update(f =>
        {
            foreach (var x in changes.Categories) Put(f.Library.Categories, x, c => c.Id);
            foreach (var x in changes.Suppliers) Put(f.Library.Suppliers, x, s => s.Id);
            foreach (var x in changes.WorkItems) Put(f.Library.WorkItems, x, w => w.Id);
            foreach (var x in changes.Resources) Put(f.Library.Resources, x, r => r.Id);
            foreach (var x in changes.ResourcePrices) Put(f.Library.ResourcePrices, x, p => p.Id);
            foreach (var x in changes.Norms) Put(f.Library.Norms, x, n => n.Id);
            foreach (var x in changes.NormComponents) Put(f.Library.NormComponents, x, c => c.Id);
        });
    }
}
