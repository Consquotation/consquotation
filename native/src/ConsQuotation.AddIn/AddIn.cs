using ExcelDna.Integration;

namespace ConsQuotation
{
    /// <summary>Điểm vào của add-in: Excel-DNA gọi khi Excel nạp và gỡ add-in.</summary>
    public sealed class AddIn : IExcelAddIn
    {
        public void AutoOpen()
        {
            // Ribbon do RibbonController tự đăng ký; cửa sổ Thư viện tạo khi người dùng bấm nút.
        }

        public void AutoClose()
        {
            LibraryUi.LibraryWindow.CloseAll();
        }
    }
}
