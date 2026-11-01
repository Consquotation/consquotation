using System.Linq;
using System.Xml.Linq;
using ConsQuotation.Ribbon;
using Xunit;

namespace ConsQuotation.Tests
{
    public class RibbonTests
    {
        private static readonly XNamespace Ns = "http://schemas.microsoft.com/office/2009/07/customui";

        private static XDocument Ribbon() => XDocument.Parse(RibbonController.LoadXml());

        /// <summary>Tên imageMso đã kiểm trên Excel 16.0.20527 (tên sai thì Excel để trống icon, không báo lỗi).</summary>
        private static readonly string[] VerifiedImages =
        {
            "Calculator", "TableInsert", "PropertySheet", "TableRowsInsertBelowExcel", "ViewsDatasheetView",
            "AutoSum", "FilePrintPreview", "BlogCategories", "ClipArtInsert", "FunctionWizard",
            "DatabaseRelationships", "Bullets", "DataValidation", "ImportExcel", "ApplicationOptionsDialog",
            "AdpPrimaryKey", "Help",
        };

        [Fact]
        public void Co_5_nhom_theo_dung_thu_tu_nhu_ban_web()
        {
            var groups = Ribbon().Descendants(Ns + "group").Select(g => (string)g.Attribute("label")).ToArray();
            Assert.Equal(new[] { "Báo giá", "Lập và tính giá", "Thư viện", "Hệ thống", "Trợ giúp" }, groups);
        }

        [Fact]
        public void Moi_nut_deu_co_lenh_va_goi_OnAction()
        {
            var buttons = Ribbon().Descendants(Ns + "button").ToArray();
            Assert.Equal(RibbonCommands.All.Count, buttons.Length);
            foreach (var button in buttons)
            {
                var id = (string)button.Attribute("id");
                Assert.True(RibbonCommands.All.ContainsKey(id), id);
                Assert.Equal("OnAction", (string)button.Attribute("onAction"));
            }
        }

        [Fact]
        public void Icon_chi_dung_ten_imageMso_da_kiem_chung()
        {
            var images = Ribbon().Descendants().Select(e => (string)e.Attribute("imageMso")).Where(i => i != null);
            Assert.All(images, image => Assert.Contains(image, VerifiedImages));
        }

        [Fact]
        public void Id_khong_trung()
        {
            var ids = Ribbon().Descendants().Select(e => (string)e.Attribute("id")).Where(i => i != null).ToArray();
            Assert.Equal(ids.Length, ids.Distinct().Count());
        }

        [Fact]
        public void Phien_ban_khong_kem_ma_commit()
        {
            Assert.Matches(@"^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$", AppInfo.Version);
        }
    }
}
