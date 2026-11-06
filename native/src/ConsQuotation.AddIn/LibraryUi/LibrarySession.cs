using System;
using System.Globalization;
using System.IO;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Quotation;
using ConsQuotation.Core.Storage;
using ConsQuotation.Excel;
using ConsQuotation.Ui;

namespace ConsQuotation.LibraryUi
{
    /// <summary>Hiển thị số và tiền như toLocaleString("vi-VN", tối đa 6 chữ số lẻ) của bản web.</summary>
    internal static class Formats
    {
        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

        public static string Quantity(decimal value) => value.ToString("#,##0.######", Vi);

        public static string Money(decimal? value, string currency) =>
            value == null ? S.NoPrice : Quantity(value.Value) + (currency != "" ? " " + currency : "");

        /// <summary>"01/01/2026 – 31/12/2026", một đầu để trống thì ghi "…"; không có ngày nào thì "".</summary>
        public static string Period(string? from, string? to)
        {
            if (string.IsNullOrEmpty(from) && string.IsNullOrEmpty(to))
            {
                return "";
            }
            var a = Dates.FormatIsoDate(from);
            var b = Dates.FormatIsoDate(to);
            return $"{(a == "" ? "…" : a)} – {(b == "" ? "…" : b)}";
        }
    }

    /// <summary>
    /// Phiên làm việc của cửa sổ Thư viện: dịch vụ, bản thư viện đang hiển thị và các phụ thuộc bên ngoài
    /// (hộp thoại, Excel, đồng hồ) để test thay được. Sau mỗi lần ghi gọi Reload để mọi thẻ cập nhật.
    /// </summary>
    internal sealed class LibrarySession
    {
        private DateTime lastWrite;

        public LibrarySession(LibraryService service, IPrompts prompts, IWorkbookGateway workbooks, Func<DateTime> now, IQuoteGateway? quotes = null)
        {
            Quotes = quotes;
            Service = service;
            Prompts = prompts;
            Workbooks = workbooks;
            Now = now;
        }

        public static LibrarySession CreateDefault() => new LibrarySession(
            new LibraryService(new LibraryStore(LibraryStore.DefaultPath), () => DateTime.UtcNow, () => Guid.NewGuid().ToString()),
            new DialogPrompts(),
            new ExcelWorkbookGateway(),
            () => DateTime.Now,
            new ExcelQuoteGateway());

        public LibraryService Service { get; }
        public IPrompts Prompts { get; }
        public IWorkbookGateway Workbooks { get; }
        /// <summary>Đọc/ghi báo giá trong workbook (chèn công tác, xuất diễn giải); null trong test không cần Excel.</summary>
        public IQuoteGateway? Quotes { get; }
        /// <summary>Giờ máy (ngày hiệu lực, tên file sao lưu).</summary>
        public Func<DateTime> Now { get; }

        public LibrarySnapshot Library { get; private set; } = new LibrarySnapshot();
        public string LibraryName { get; private set; } = LibrarySchema.DefaultName;
        public BackupStatus Backup { get; private set; } = new BackupStatus();
        /// <summary>Lỗi đọc file thư viện (hỏng, của phiên bản mới hơn…); null = đọc được.</summary>
        public string? LoadError { get; private set; }

        public string Today => Dates.TodayIso(Now());

        /// <summary>Chèn công tác đang chọn vào báo giá (mở thẻ Thêm công tác); null khi không có cửa sổ Báo giá.</summary>
        public Action<WorkItem>? InsertToQuote { get; set; }

        public event Action? Changed;

        /// <summary>Thông báo ngắn ("Đã lưu …") hiện ở thanh trạng thái của cửa sổ Thư viện.</summary>
        public event Action<string>? Notice;

        public void Notify(string text) => Notice?.Invoke(text);

        /// <summary>Đọc lại thư viện từ file và báo các thẻ vẽ lại.</summary>
        public void Reload()
        {
            try
            {
                Library = Service.Load();
                LibraryName = Service.LibraryName();
                Backup = Service.GetBackupStatus();
                LoadError = null;
            }
            catch (LibraryStorageException ex)
            {
                Library = new LibrarySnapshot();
                LoadError = ex.Message;
            }
            lastWrite = FileTime();
            Changed?.Invoke();
        }

        /// <summary>File thư viện đã bị ghi từ nơi khác (cửa sổ Excel khác) kể từ lần đọc gần nhất thì đọc lại.</summary>
        public void ReloadIfChangedOutside()
        {
            if (FileTime() != lastWrite)
            {
                Reload();
            }
        }

        private DateTime FileTime()
        {
            try
            {
                return File.GetLastWriteTimeUtc(Service.Store.FilePath);
            }
            catch (IOException)
            {
                return DateTime.MinValue;
            }
        }
    }
}
