using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using ConsQuotation.Core.Licensing;
using ConsQuotation.LibraryUi;
using ConsQuotation.QuoteUi;
using ConsQuotation.SystemUi;
using ExcelDna.Integration;
using ExcelDna.Integration.CustomUI;

namespace ConsQuotation.Ribbon
{
    /// <summary>Ribbon ConsQuotation. Excel-DNA tìm lớp này khi nạp add-in.</summary>
    [ComVisible(true)]
    public class RibbonController : ExcelRibbon
    {
        public const string ResourceName = "ConsQuotation.Ribbon.xml";

        private static IRibbonUI? ribbon;

        public override string GetCustomUI(string ribbonId) => LoadXml();

        public static string LoadXml()
        {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName))
            using (var reader = new StreamReader(stream!))
            {
                return reader.ReadToEnd();
            }
        }

        public void OnRibbonLoad(IRibbonUI ui) => ribbon = ui;

        /// <summary>Nhãn đổi theo trạng thái: nút Bản quyền hiện thời hạn, nút Cài đặt báo có bản mới. Chỉ đọc file, không ghi gì.</summary>
        public string GetLabel(IRibbonControl control)
        {
            try
            {
                return control.Id == RibbonCommands.License
                    ? Sys.LicenseLabel(SystemServices.License.Peek())
                    : SystemServices.Updates.Known != null ? Sys.SettingsUpdateLabel : RibbonCommands.All[control.Id];
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                return RibbonCommands.All[control.Id];
            }
        }

        /// <summary>Mọi nút ribbon gọi về đây; id nút là mã lệnh.</summary>
        public void OnAction(IRibbonControl control)
        {
            var expired = IsExpired();
            ribbon?.InvalidateControl(RibbonCommands.License);
            if (SystemWindow.RibbonSections.TryGetValue(control.Id, out var system))
            {
                ShowSystem(system);
            }
            else if (expired)
            {
                // Hết dùng thử, chưa cấp phép: khóa các chức năng ghi như bản web (ADR-0015); file Excel vẫn dùng bình thường.
                ShowSystem(SystemSection.License);
            }
            else if (LibraryWindow.RibbonSections.TryGetValue(control.Id, out var section))
            {
                LibraryWindow.Show(section, ExcelDnaUtil.WindowHandle);
            }
            else if (QuoteWindow.RibbonSections.TryGetValue(control.Id, out var quoteSection))
            {
                QuoteWindow.Show(quoteSection, ExcelDnaUtil.WindowHandle);
            }
        }

        private static void ShowSystem(SystemSection section) => SystemWindow.Show(section, ExcelDnaUtil.WindowHandle, RefreshLabels);

        /// <summary>Bắt đầu tính dùng thử ở lần bấm đầu tiên. Không đọc được file thì không khóa người dùng vì lỗi của máy.</summary>
        private static bool IsExpired()
        {
            try
            {
                return SystemServices.License.State().Kind == LicenseKind.Expired;
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                return false;
            }
        }

        /// <summary>Gọi được từ mọi luồng: ribbon chỉ cho phép gọi từ luồng chính của Excel.</summary>
        public static void RefreshLabels() => ExcelAsyncUtil.QueueAsMacro(() =>
        {
            try
            {
                ribbon?.InvalidateControl(RibbonCommands.License);
                ribbon?.InvalidateControl(RibbonCommands.Settings);
            }
            catch (COMException)
            {
                // Excel đang đóng: không còn ribbon để cập nhật.
            }
        });
    }
}
