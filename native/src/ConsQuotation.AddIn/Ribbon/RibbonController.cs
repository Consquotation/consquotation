using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using ConsQuotation.Core.Storage;
using ConsQuotation.LibraryUi;
using ExcelDna.Integration;
using Newtonsoft.Json.Linq;
using ExcelDna.Integration.CustomUI;

namespace ConsQuotation.Ribbon
{
    /// <summary>Ribbon ConsQuotation. Excel-DNA tìm lớp này khi nạp add-in.</summary>
    [ComVisible(true)]
    public class RibbonController : ExcelRibbon
    {
        public const string ResourceName = "ConsQuotation.Ribbon.xml";

        public override string GetCustomUI(string ribbonId) => LoadXml();

        public static string LoadXml()
        {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName))
            using (var reader = new StreamReader(stream!))
            {
                return reader.ReadToEnd();
            }
        }

        /// <summary>Mọi nút ribbon gọi về đây; id nút là mã lệnh.</summary>
        public void OnAction(IRibbonControl control)
        {
            if (LibraryWindow.RibbonSections.TryGetValue(control.Id, out var section))
            {
                LibraryWindow.Show(section, ExcelDnaUtil.WindowHandle);
                return;
            }
            var owner = new ExcelWindow();
            if (control.Id == RibbonCommands.Help)
            {
                MessageBox.Show(owner, $"{AppInfo.AboutText}\n\n{LibraryLine()}", AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            var title = RibbonCommands.All.TryGetValue(control.Id, out var command) ? command.Title : control.Id;
            var stage = command?.Stage ?? "sau";
            MessageBox.Show(
                owner,
                $"Chức năng \"{title}\" đang được chuyển sang bản cài đặt cho Windows và sẽ có ở giai đoạn {stage}.\n\n{AppInfo.VersionLine}",
                AppInfo.Name,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        /// <summary>
        /// Nơi lưu và số bản ghi của thư viện trên máy, kèm phiên bản thư viện mã đã nạp (để chẩn đoán bản
        /// cài thiếu thành phần). Chỉ đọc: file chưa có thì không tạo.
        /// </summary>
        private static string LibraryLine()
        {
            var store = new LibraryStore(LibraryStore.DefaultPath);
            var components = $"Thành phần: ConsQuotation.Core {typeof(LibraryStore).Assembly.GetName().Version}, Newtonsoft.Json {typeof(JToken).Assembly.GetName().Version}.";
            try
            {
                var library = store.LoadAll();
                return $"Thư viện trên máy: {store.FilePath}\n{library.WorkItems.Count} công tác, {library.Resources.Count} tài nguyên, {library.Norms.Count} định mức.\n{components}";
            }
            catch (LibraryStorageException ex)
            {
                return $"{ex.Message}\n{components}";
            }
        }

        /// <summary>Cửa sổ Excel làm cửa sổ cha cho hộp thoại, để hộp thoại nằm trên Excel.</summary>
        private sealed class ExcelWindow : IWin32Window
        {
            public System.IntPtr Handle => ExcelDnaUtil.WindowHandle;
        }
    }
}
