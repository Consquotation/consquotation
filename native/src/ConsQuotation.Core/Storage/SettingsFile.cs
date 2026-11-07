using System;
using System.IO;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Storage
{
    /// <summary>File JSON nhỏ của add-in (trạng thái cấp phép, lần kiểm tra cập nhật), nằm cùng thư mục với thư viện.</summary>
    public static class SettingsFile
    {
        private const int ReadAttempts = 5;

        /// <summary>Đường dẫn file theo thư mục của thư viện, nên biến CONSQUOTATION_LIBRARY cũng cách ly các file này.</summary>
        public static string PathOf(string fileName) =>
            Path.Combine(Path.GetDirectoryName(Path.GetFullPath(LibraryStore.DefaultPath))!, fileName);

        /// <summary>Đọc file; chưa có hoặc nội dung hỏng → null. Lỗi đọc thật (bị khóa quá lâu, không có quyền) ném ra để người gọi không coi là "chưa có".</summary>
        public static JObject? Read(string path)
        {
            for (var attempt = 1; ; attempt++)
            {
                try
                {
                    return File.Exists(path) ? Parse(File.ReadAllText(path, Encoding.UTF8)) : null;
                }
                catch (JsonException)
                {
                    return null;
                }
                catch (IOException) when (attempt < ReadAttempts)
                {
                    // Cửa sổ Excel khác đang thay file trong tích tắc.
                    Thread.Sleep(100);
                }
            }
        }

        /// <summary>Giữ ngày dạng chuỗi: mặc định Newtonsoft đổi chuỗi ISO thành DateTime, đọc ra như chưa từng lưu.</summary>
        private static JObject? Parse(string text)
        {
            using (var reader = new JsonTextReader(new StringReader(text)) { DateParseHandling = DateParseHandling.None })
            {
                return JToken.ReadFrom(reader) as JObject;
            }
        }

        /// <summary>Ghi ra file tạm rồi mới thay file chính, để mất điện giữa chừng không để lại file hỏng.</summary>
        public static void Write(string path, JObject value)
        {
            var temp = $"{path}.{Guid.NewGuid():N}.tmp";
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
                File.WriteAllText(temp, value.ToString(Formatting.Indented), new UTF8Encoding(false));
                if (File.Exists(path))
                {
                    File.Replace(temp, path, null, ignoreMetadataErrors: true);
                }
                else
                {
                    File.Move(temp, path);
                }
            }
            finally
            {
                if (File.Exists(temp))
                {
                    File.Delete(temp);
                }
            }
        }
    }
}
