using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using ExcelDna.Integration;
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
            var owner = new ExcelWindow();
            if (control.Id == RibbonCommands.Help)
            {
                MessageBox.Show(owner, AppInfo.AboutText, AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Information);
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

        /// <summary>Cửa sổ Excel làm cửa sổ cha cho hộp thoại, để hộp thoại nằm trên Excel.</summary>
        private sealed class ExcelWindow : IWin32Window
        {
            public System.IntPtr Handle => ExcelDnaUtil.WindowHandle;
        }
    }
}
