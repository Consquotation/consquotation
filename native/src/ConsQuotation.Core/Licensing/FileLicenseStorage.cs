using System;
using System.Globalization;
using ConsQuotation.Core.Storage;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Licensing
{
    /// <summary>
    /// Lưu trạng thái cấp phép ở %APPDATA%\ConsQuotation\license.json, thay localStorage của bản web. Xóa file
    /// thì dùng thử tính lại từ đầu, người đã được cấp phép nhập lại email + mã.
    /// </summary>
    public sealed class FileLicenseStorage : ILicenseStorage
    {
        public const string FileName = "license.json";

        private readonly string path;

        public FileLicenseStorage(string path) => this.path = path;

        public StoredLicense Read()
        {
            var root = SettingsFile.Read(path);
            var activation = root?["activation"] as JObject;
            var email = (activation?["email"] as JValue)?.Value as string;
            var trialStart = (root?["trialStart"] as JValue)?.Value as string;
            return new StoredLicense
            {
                // Sai dạng ngày (file bị sửa tay) coi như chưa có, không để lỗi đọc ngày chặn add-in.
                TrialStart = DateTime.TryParse(trialStart, CultureInfo.InvariantCulture, DateTimeStyles.None, out _) ? trialStart : null,
                Activation = string.IsNullOrEmpty(email) ? null : new Activation
                {
                    Email = email!,
                    Code = (activation!["code"] as JValue)?.Value as string ?? "",
                    ActivatedAt = (activation["activatedAt"] as JValue)?.Value as string ?? "",
                },
            };
        }

        public void Write(StoredLicense next)
        {
            var root = new JObject { ["trialStart"] = next.TrialStart };
            if (next.Activation != null)
            {
                root["activation"] = new JObject
                {
                    ["email"] = next.Activation.Email,
                    ["code"] = next.Activation.Code,
                    ["activatedAt"] = next.Activation.ActivatedAt,
                };
            }
            SettingsFile.Write(path, root);
        }
    }
}
