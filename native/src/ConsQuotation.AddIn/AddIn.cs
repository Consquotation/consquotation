using ExcelDna.Integration;

namespace ConsQuotation
{
    /// <summary>Điểm vào của add-in: Excel-DNA gọi khi Excel nạp và gỡ add-in.</summary>
    public sealed class AddIn : IExcelAddIn
    {
        public void AutoOpen()
        {
            // Giai đoạn N0: chưa có khởi tạo. Ribbon do RibbonController tự đăng ký.
        }

        public void AutoClose()
        {
        }
    }
}
