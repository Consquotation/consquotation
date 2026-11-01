using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;
using ConsQuotation.Core.Licensing;
using Xunit;

namespace ConsQuotation.Tests
{
    /// <summary>Chuyển từ tests/unit/license.test.ts (phần lệnh cấp phép Node giữ ở bản web).</summary>
    public class LicenseTests
    {
        private static readonly DateTime T0 = new DateTime(2026, 10, 28, 8, 0, 0, DateTimeKind.Utc);
        private const string T0Iso = "2026-10-28T08:00:00.000Z";

        private static DateTime Day(double n) => T0.AddDays(n);

        private static byte[] RandomBytes(int count)
        {
            var bytes = new byte[count];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(bytes);
            }
            return bytes;
        }

        [Fact]
        public void Chuan_hoa_email_va_ma()
        {
            Assert.Equal("nguyen.a@gmail.com", License.NormalizeEmail("  Nguyen.A@Gmail.COM "));
            Assert.Equal("ABCDEFGH23456789ABCD", License.NormalizeCode("abcd-efgh 2345 6789-abcd"));
            Assert.True(License.IsValidEmail("a@b.vn"));
            Assert.All(new[] { "", "a@b", "a b@c.vn", "@c.vn" }, e => Assert.False(License.IsValidEmail(e)));
        }

        [Fact]
        public void Ma_dung_dang()
        {
            Assert.True(License.IsWellFormedCode("ABCDEFGH23456789ABCD"));
            Assert.False(License.IsWellFormedCode("ABCDEFGH23456789ABC")); // 19 ký tự
            Assert.False(License.IsWellFormedCode("ABCDEFGHJKMNPQRSTUVW")); // không có số
            Assert.False(License.IsWellFormedCode("23456789234567892345")); // không có chữ
            foreach (var bad in new[] { "0", "O", "1", "I", "L" })
            {
                Assert.False(License.IsWellFormedCode($"ABCDEFGH2345678{bad}ABCD"));
                Assert.DoesNotContain(bad, License.CodeAlphabet);
            }
        }

        [Fact]
        public void Sinh_ma_dung_dang_khong_trung_du_bang_ky_tu()
        {
            var codes = Enumerable.Range(0, 1000).Select(_ => License.GenerateCode(RandomBytes)).ToList();
            Assert.All(codes, c => Assert.True(License.IsWellFormedCode(c)));
            Assert.Equal(1000, codes.Distinct().Count());
            Assert.Equal(License.CodeAlphabet.Length, string.Concat(codes).Distinct().Count());
        }

        [Fact]
        public void Sinh_ma_bo_byte_tu_248()
        {
            // Nguồn giả: 248 (phải bỏ), 10, 248, 11, … → mã là ký tự thứ 10..29 của bảng.
            var sequence = Enumerable.Range(0, 20).SelectMany(j => new[] { 248, 10 + j }).ToArray();
            var i = 0;
            byte[] Fake(int n) => Enumerable.Range(0, n).Select(_ => (byte)sequence[i++ % sequence.Length]).ToArray();
            Assert.Equal("MNPQRSTUVWXYZ2345678", License.GenerateCode(Fake));
            // 247 không bị bỏ: 247 % 31 = 30 → "9".
            Assert.Equal("A9A9A9A9A9A9A9A9A9A9", License.GenerateCode(n => Enumerable.Range(0, n).Select(k => (byte)(k % 2 == 1 ? 247 : 0)).ToArray()));
        }

        [Theory]
        // Tham chiếu tính bằng node:crypto createHash("sha256") — cùng cách bản web và lệnh cấp phép tính.
        [InlineData("nguoi.thu@example.com", "ABCDEFGH23456789ABCD", "150e7f6c15284cc9bfc8156eabc24125f3620404458dec7b1a26d1ae77a02788")]
        [InlineData("a@b.vn", "ABCDEFGH23456789ABCD", "8382ebefcacf01a5969e9bb1908c3261a0726c03051ffaa55bd7b819a492153b")]
        [InlineData("người.thử@ví-dụ.vn", "MNPQRSTUVWXYZ2345678", "a5bc1810093a0839ce85ccd66cbb17eef222fb21fde8f4b94c5f4383fe2a4f67")]
        public void Khoa_bam_trung_ban_web_va_lenh_cap_phep(string email, string code, string expected)
        {
            Assert.Equal(expected, License.Key(email, code));
        }

        [Fact]
        public void Doc_danh_sach_sai_dinh_dang_la_null()
        {
            Assert.Null(License.ParseList("null"));
            Assert.Null(License.ParseList("không phải JSON"));
            Assert.Null(License.ParseList("{\"format\":\"khac\",\"keys\":[]}"));
            Assert.Null(License.ParseList("{\"format\":\"consquotation-licenses\"}"));
            var k = new string('a', 64);
            var keys = License.ParseList($"{{\"format\":\"consquotation-licenses\",\"version\":1,\"keys\":[\"{k}\",\"xyz\",5]}}");
            Assert.Equal(new[] { k }, keys!.ToArray());
        }

        [Fact]
        public void Dung_thu_30_ngay()
        {
            Assert.Equal(30, License.Resolve(T0Iso, null, T0).DaysLeft);
            var half = License.Resolve(T0Iso, null, Day(29.5));
            Assert.Equal(LicenseKind.Trial, half.Kind);
            Assert.Equal(1, half.DaysLeft);
            var expired = License.Resolve(T0Iso, null, Day(30));
            Assert.Equal(LicenseKind.Expired, expired.Kind);
            Assert.Equal(T0Iso, expired.StartedAt);
            Assert.Equal("2026-11-27T08:00:00.000Z", expired.EndsAt);
        }

        [Fact]
        public void Da_kich_hoat_la_vinh_vien()
        {
            var activation = new Activation { Email = "a@b.vn", Code = "ABCDEFGH23456789ABCD", ActivatedAt = T0Iso };
            var state = License.Resolve(T0Iso, activation, Day(1000));
            Assert.Equal(LicenseKind.Licensed, state.Kind);
            Assert.Same(activation, state.Activation);
        }

        private sealed class MemoryStorage : ILicenseStorage
        {
            public StoredLicense Stored { get; private set; } = new StoredLicense();
            public StoredLicense Read() => Stored;
            public void Write(StoredLicense next) => Stored = next;
        }

        private static (LicenseService Service, MemoryStorage Storage, Action<DateTime> SetNow) Setup(Func<Task<string>> fetch)
        {
            var storage = new MemoryStorage();
            var now = T0;
            return (new LicenseService(storage, fetch, () => now), storage, d => now = d);
        }

        private static Func<Task<string>> List(params string[] keys) =>
            () => Task.FromResult("{\"format\":\"consquotation-licenses\",\"version\":1,\"keys\":[" + string.Join(",", keys.Select(k => $"\"{k}\"")) + "]}");

        [Fact]
        public void Lan_dau_mo_bat_dau_dung_thu_mo_lai_khong_tinh_lai()
        {
            var s = Setup(List());
            var first = s.Service.State();
            Assert.Equal(LicenseKind.Trial, first.Kind);
            Assert.Equal(30, first.DaysLeft);
            Assert.Equal(T0Iso, s.Storage.Stored.TrialStart);
            s.SetNow(Day(10));
            var later = s.Service.State();
            Assert.Equal(20, later.DaysLeft);
            Assert.Equal(T0Iso, later.StartedAt);
            s.SetNow(Day(31));
            Assert.Equal(LicenseKind.Expired, s.Service.State().Kind);
        }

        [Fact]
        public async Task Kich_hoat_dung_email_ma_la_vinh_vien()
        {
            const string email = "nguoi.thu@example.com";
            const string code = "ABCDEFGH23456789ABCD";
            var s = Setup(List(License.Key(email, code)));
            s.Service.State();
            s.SetNow(Day(40)); // đã hết dùng thử
            var result = await s.Service.ActivateAsync(" Nguoi.Thu@Example.com ", "abcd-efgh-2345-6789-abcd");
            Assert.True(result.Ok);
            Assert.Equal(LicenseKind.Licensed, result.State!.Kind);
            Assert.Equal(email, result.State.Activation!.Email);
            Assert.Equal(code, result.State.Activation.Code);
            s.SetNow(Day(4000));
            Assert.Equal(LicenseKind.Licensed, s.Service.State().Kind);
            Assert.Equal("2026-12-07T08:00:00.000Z", s.Storage.Stored.Activation!.ActivatedAt);
        }

        [Fact]
        public async Task Tu_choi_cac_truong_hop_sai()
        {
            var key = License.Key("a@b.vn", "ABCDEFGH23456789ABCD");
            var s = Setup(List(key));
            Assert.Equal(ActivateFailure.InvalidEmail, (await s.Service.ActivateAsync("a@b", "ABCDEFGH23456789ABCD")).Failure);
            Assert.Equal(ActivateFailure.InvalidCode, (await s.Service.ActivateAsync("a@b.vn", "ABCDEFGH2345678")).Failure);
            Assert.Equal(ActivateFailure.NotFound, (await s.Service.ActivateAsync("c@d.vn", "ABCDEFGH23456789ABCD")).Failure);
            Assert.Equal(ActivateFailure.NotFound, (await s.Service.ActivateAsync("a@b.vn", "ABCDEFGH23456789ABCE")).Failure);
            var offline = Setup(() => throw new System.Net.WebException("mạng"));
            Assert.Equal(ActivateFailure.Unavailable, (await offline.Service.ActivateAsync("a@b.vn", "ABCDEFGH23456789ABCD")).Failure);
            var wrongFormat = Setup(() => Task.FromResult("{\"format\":\"sai\"}"));
            Assert.Equal(ActivateFailure.Unavailable, (await wrongFormat.Service.ActivateAsync("a@b.vn", "ABCDEFGH23456789ABCD")).Failure);
            Assert.Null(s.Storage.Stored.Activation);
        }

        [Fact]
        public void Thu_yeu_cau_va_duong_dan_soan_thu()
        {
            var mail = License.Request("1.12.0", T0Iso);
            Assert.Equal(License.OwnerEmail, mail.To);
            Assert.Contains("Phiên bản add-in: 1.12.0", mail.Body);
            Assert.Contains("Bắt đầu dùng thử: 28/10/2026", mail.Body);

            Dictionary<string, string> Query(string url) => new Uri(url).Query.TrimStart('?').Split('&')
                .Select(p => p.Split(new[] { '=' }, 2))
                .ToDictionary(p => p[0], p => Uri.UnescapeDataString(p[1]));

            var gmail = new Uri(License.GmailComposeUrl(mail));
            Assert.Equal("https://mail.google.com", gmail.GetLeftPart(UriPartial.Authority));
            var g = Query(License.GmailComposeUrl(mail));
            Assert.Equal(new[] { License.OwnerEmail, mail.Subject, mail.Body }, new[] { g["to"], g["su"], g["body"] });
            var o = Query(License.OutlookComposeUrl(mail));
            Assert.Equal("https://outlook.live.com", new Uri(License.OutlookComposeUrl(mail)).GetLeftPart(UriPartial.Authority));
            Assert.Equal(new[] { License.OwnerEmail, mail.Subject, mail.Body }, new[] { o["to"], o["subject"], o["body"] });
            var mailto = License.MailtoUrl(mail);
            Assert.StartsWith("mailto:nguyenchikhoa97@gmail.com?subject=", mailto);
            Assert.Equal(mail.Body, Uri.UnescapeDataString(mailto.Split(new[] { "&body=" }, StringSplitOptions.None)[1]));
        }
    }
}
