using ExcelDna.Integration;

namespace ConsQuotation
{
    /// <summary>Điểm vào của add-in: Excel-DNA gọi khi Excel nạp và gỡ add-in.</summary>
    public sealed class AddIn : IExcelAddIn
    {
        public void AutoOpen()
        {
            // Ribbon do RibbonController tự đăng ký; các cửa sổ tạo khi người dùng bấm nút.
            SystemUi.SystemServices.CheckForUpdateInBackground(Ribbon.RibbonController.RefreshLabels);
        }

        public void AutoClose()
        {
            LibraryUi.LibraryWindow.CloseAll();
            QuoteUi.QuoteWindow.CloseAll();
            SystemUi.SystemWindow.CloseAll();
        }
    }
}
