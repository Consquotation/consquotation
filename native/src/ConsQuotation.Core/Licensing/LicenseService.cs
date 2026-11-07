using System;
using System.Globalization;
using System.Threading.Tasks;

namespace ConsQuotation.Core.Licensing
{
    public sealed class StoredLicense
    {
        public string? TrialStart { get; set; }
        public Activation? Activation { get; set; }
    }

    /// <summary>Nơi lưu trạng thái cấp phép trên máy (cài đặt ở add-in; test dùng bộ nhớ).</summary>
    public interface ILicenseStorage
    {
        StoredLicense Read();
        void Write(StoredLicense next);
    }

    public enum ActivateFailure
    {
        InvalidEmail,
        InvalidCode,
        NotFound,
        Unavailable,
    }

    public sealed class ActivateResult
    {
        private ActivateResult(LicenseState? state, ActivateFailure? failure)
        {
            State = state;
            Failure = failure;
        }

        public bool Ok => State != null;
        public LicenseState? State { get; }
        public ActivateFailure? Failure { get; }

        public static ActivateResult Success(LicenseState state) => new ActivateResult(state, null);
        public static ActivateResult Fail(ActivateFailure reason) => new ActivateResult(null, reason);
    }

    /// <summary>
    /// Use case cấp phép (ADR-0015): trạng thái dùng thử/cấp phép trên máy và kích hoạt bằng email + mã,
    /// chuyển từ src/application/licenseService.ts.
    /// </summary>
    public sealed class LicenseService
    {
        private readonly ILicenseStorage storage;
        private readonly Func<Task<string>> fetchList;
        private readonly Func<DateTime> nowUtc;

        /// <param name="fetchList">Tải nội dung licenses.json; lỗi mạng ném ra.</param>
        public LicenseService(ILicenseStorage storage, Func<Task<string>> fetchList, Func<DateTime> nowUtc)
        {
            this.storage = storage;
            this.fetchList = fetchList;
            this.nowUtc = nowUtc;
        }

        private string NowIso() => nowUtc().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        /// <summary>Trạng thái hiện tại; lần đầu gọi trên máy thì bắt đầu tính 30 ngày dùng thử.</summary>
        public LicenseState State()
        {
            var stored = storage.Read();
            var trialStart = stored.TrialStart;
            if (string.IsNullOrEmpty(trialStart))
            {
                trialStart = NowIso();
                try
                {
                    storage.Write(new StoredLicense { TrialStart = trialStart, Activation = stored.Activation });
                }
                catch (Exception ex) when (ex is System.IO.IOException || ex is UnauthorizedAccessException)
                {
                    // Không lưu được: lần mở sau coi như lần đầu (như bản web), không chặn người dùng.
                }
            }
            return License.Resolve(trialStart!, stored.Activation, nowUtc());
        }

        /// <summary>Trạng thái để hiển thị, không ghi gì; null khi chưa bắt đầu dùng thử.</summary>
        public LicenseState? Peek()
        {
            var stored = storage.Read();
            return stored.Activation == null && string.IsNullOrEmpty(stored.TrialStart)
                ? null
                : License.Resolve(stored.TrialStart ?? NowIso(), stored.Activation, nowUtc());
        }

        public async Task<ActivateResult> ActivateAsync(string emailText, string codeText)
        {
            var email = License.NormalizeEmail(emailText);
            var code = License.NormalizeCode(codeText);
            if (!License.IsValidEmail(email))
            {
                return ActivateResult.Fail(ActivateFailure.InvalidEmail);
            }
            if (!License.IsWellFormedCode(code))
            {
                return ActivateResult.Fail(ActivateFailure.InvalidCode);
            }
            System.Collections.Generic.HashSet<string>? keys;
            try
            {
                keys = License.ParseList(await fetchList().ConfigureAwait(false));
            }
            catch (Exception)
            {
                // Mất mạng, máy chủ lỗi… đều là "không tải được danh sách", không phải "chưa được cấp phép".
                keys = null;
            }
            if (keys == null)
            {
                return ActivateResult.Fail(ActivateFailure.Unavailable);
            }
            if (!keys.Contains(License.Key(email, code)))
            {
                return ActivateResult.Fail(ActivateFailure.NotFound);
            }
            var stored = storage.Read();
            storage.Write(new StoredLicense
            {
                TrialStart = string.IsNullOrEmpty(stored.TrialStart) ? NowIso() : stored.TrialStart,
                Activation = new Activation { Email = email, Code = code, ActivatedAt = NowIso() },
            });
            return ActivateResult.Success(State());
        }
    }
}
