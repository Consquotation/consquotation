using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Exchange;
using ConsQuotation.Core.Library;

namespace ConsQuotation.LibraryUi
{
    /// <summary>
    /// Chuỗi giao diện "Thư viện của tôi", chuyển từ src/shared/strings.library.vi.ts. Chỉ đổi các câu nói về nơi
    /// lưu (bản web lưu IndexedDB, bản Windows lưu file trên máy).
    /// </summary>
    internal static class S
    {
        public const string Title = "Thư viện của tôi";
        public const string LoadFailed = "Không mở được thư viện";
        public const string Retry = "Thử lại";

        public const string TabWorkItems = "Công tác";
        public const string TabResources = "Tài nguyên";
        public const string TabNorms = "Định mức";
        public const string TabCatalog = "Danh mục";
        public const string TabCheck = "Kiểm tra";
        public const string TabExchange = "Nhập/Xuất";

        public const string Search = "Tìm theo mã, tên, nhóm, đơn vị, nhà cung cấp (không cần gõ dấu)";
        public const string AllGroups = "Tất cả nhóm";
        public const string NoGroup = "Chưa phân nhóm";
        public const string Group = "Nhóm";
        public const string Supplier = "Nhà cung cấp";
        public const string AllSuppliers = "Tất cả";
        public const string NoSupplier = "Không có nhà cung cấp";
        public const string Type = "Loại";
        public const string AllTypes = "Tất cả loại";
        public const string Sort = "Sắp xếp";
        public const string SortCode = "Theo mã";
        public const string SortName = "Theo tên";
        public const string SortPrice = "Theo đơn giá";

        public const string NoneCategory = "— Chưa phân nhóm —";
        public const string NewCategory = "+ Nhóm mới…";
        public const string NewCategoryName = "Tên nhóm mới";
        public const string NoneSupplier = "— Không có —";
        public const string NewSupplier = "+ Nhà cung cấp mới…";
        public const string NewSupplierName = "Tên nhà cung cấp mới";

        public static string SameName(string codes) => $"Đã có bản ghi cùng tên: {codes}. Kiểm tra có bị nhập trùng không (vẫn lưu được).";
        public const string ActionFailed = "Thao tác thất bại";
        public static string Count(int shown, int total) => shown == total ? $"{total} mục" : $"{shown} / {total} mục";
        public const string NoResults = "Không có mục nào khớp tìm kiếm.";

        public const string Add = "Thêm";
        public const string Edit = "Sửa";
        public const string Copy = "Sao chép";
        public const string Delete = "Xóa";
        public const string Save = "Lưu";
        public const string SaveWorkItem = "Lưu công tác";
        public const string SaveResource = "Lưu tài nguyên";
        public const string SavePrice = "Lưu giá";
        public const string Cancel = "Hủy";
        public const string Close = "Đóng";

        public static string Saved(string label) => $"Đã lưu \"{label}\".";
        public static string Copied(string code) => $"Đã sao chép thành \"{code}\".";
        public static string Deleted(string label) => $"Đã xóa \"{label}\".";
        public const string SaveFailed = "Lưu thất bại";

        // ---------- Công tác ----------
        public const string WorkItemsEmpty = "Thư viện chưa có công tác nào. Bấm Thêm công tác để bắt đầu.";
        public const string AddWorkItem = "Thêm công tác";
        public const string NewWorkItem = "Công tác mới";
        public static string EditWorkItem(string code) => $"Sửa công tác {code}";
        public const string WiCode = "Mã công tác";
        public const string WiName = "Tên công tác";
        public const string WiGroup = "Nhóm";
        public const string WiUnit = "Đơn vị tính";
        public const string WiDescription = "Mô tả";
        public const string WiUnitPrice = "Đơn giá";
        public const string WiCurrency = "Tiền tệ";
        public const string WiSupplier = "Nhà cung cấp";
        public const string WiSource = "Nguồn giá";
        public const string WiEffectiveFrom = "Hiệu lực từ ngày";
        public const string WiEffectiveTo = "Hiệu lực đến ngày";
        public const string WiNotes = "Ghi chú";
        public const string PriceHint = "Để trống nếu chưa có giá (không phải 0). Dùng . hoặc , làm dấu thập phân.";
        public const string NoPrice = "Chưa có giá";
        public const string DeleteWorkItemTitle = "Xóa công tác?";
        public static string DeleteWorkItemBody(string code, string name, int norms) =>
            $"Xóa công tác \"{code}: {name}\"{(norms > 0 ? $" cùng {norms} dòng định mức" : "")} khỏi thư viện. Các báo giá đã chèn công tác này không bị thay đổi. Thao tác không hoàn tác được.";

        public const string LinkedNormsTitle = "Định mức liên kết";
        public const string NoneLinked = "Chưa có định mức nào liên kết với công tác này.";
        public static string LinkedLine(string code, string version, string status) => $"{code} phiên bản {version}: {status}";
        public const string ManageInTab = "Tạo, sửa định mức ở tab \"Định mức\" và chọn công tác liên kết. Khi chèn vào báo giá, add-in dùng phiên bản Đang dùng.";
        public static string LinkedCount(int n) => $"{n} phiên bản định mức";

        // ---------- Tài nguyên ----------
        public const string ResourcesEmpty = "Thư viện chưa có tài nguyên nào. Tài nguyên (vật liệu, nhân công, máy…) dùng cho định mức và giá nguồn.";
        public const string AddResource = "Thêm tài nguyên";
        public const string NewResource = "Tài nguyên mới";
        public static string EditResource(string code) => $"Sửa tài nguyên {code}";
        public const string ResCode = "Mã tài nguyên";
        public const string ResName = "Tên tài nguyên";
        public const string ResType = "Loại";
        public const string ResCategory = "Nhóm";
        public const string ResUnit = "Đơn vị tính";
        public const string ResNotes = "Ghi chú";

        public static readonly IReadOnlyDictionary<ResourceType, string> ResourceTypes = new Dictionary<ResourceType, string>
        {
            [ResourceType.Material] = "Vật liệu",
            [ResourceType.Labor] = "Nhân công",
            [ResourceType.Machine] = "Máy thi công",
            [ResourceType.Other] = "Khác",
        };

        public static readonly ResourceType[] ResourceTypeOrder = { ResourceType.Material, ResourceType.Labor, ResourceType.Machine, ResourceType.Other };

        public static string PriceCount(int n) => n == 0 ? "chưa có giá" : $"{n} giá";
        public static string CurrentPrice(string price) => $"giá hiện hành {price}";
        public static string ManyActive(int n) => $"{n} giá đang dùng còn hiệu lực, tự chọn khi dùng";
        public const string NoActive = "chưa có giá còn hiệu lực";
        public const string DeleteResourceTitle = "Xóa tài nguyên?";
        public static string DeleteResourceBody(string code, string name, int prices) =>
            $"Xóa tài nguyên \"{code}: {name}\"{(prices > 0 ? $" cùng {prices} giá" : "")} khỏi thư viện. Thao tác không hoàn tác được.";
        public static string ResourceInUse(int n) => $"Không thể xóa: tài nguyên đang được dùng trong {n} định mức. Hãy xóa các định mức đó trước.";

        // ---------- Giá nguồn ----------
        public const string PricesTitle = "Giá nguồn";
        public const string PricesEmpty = "Chưa có giá. Thêm giá kèm nguồn và ngày hiệu lực để dễ truy vết.";
        public const string PricesSaveFirst = "Lưu tài nguyên trước, sau đó mở lại để thêm giá.";
        public const string AddPrice = "Thêm giá";
        public const string EditPrice = "Sửa giá";
        public const string PrPrice = "Đơn giá";
        public const string PrUnit = "Đơn vị tính của giá";
        public const string PrCurrency = "Tiền tệ";
        public const string PrEffectiveFrom = "Hiệu lực từ ngày";
        public const string PrEffectiveTo = "Hiệu lực đến ngày";
        public const string PrSupplier = "Nhà cung cấp";
        public const string PrSource = "Nguồn";
        public const string PrStatus = "Trạng thái";
        public const string PrNotes = "Ghi chú";
        public static readonly IReadOnlyDictionary<PriceStatus, string> PriceStatuses = new Dictionary<PriceStatus, string>
        {
            [PriceStatus.Active] = "Đang dùng",
            [PriceStatus.Inactive] = "Ngưng dùng",
        };
        public const string NoAutoPick = "ConsQuotation không tự chọn giá mới nhất là giá đúng. Khi có nhiều giá, bạn tự quyết định giá nào áp dụng.";
        public const string DeletePriceTitle = "Xóa giá?";
        public const string DeletePriceBody = "Xóa giá này khỏi thư viện. Thao tác không hoàn tác được.";

        public static readonly IReadOnlyDictionary<Validity, string> Validities = new Dictionary<Validity, string>
        {
            [Validity.NoDates] = "Không ghi hiệu lực",
            [Validity.NotYetEffective] = "Chưa hiệu lực",
            [Validity.Active] = "Còn hiệu lực",
            [Validity.Expired] = "Hết hạn",
        };

        // ---------- Kiểm tra ----------
        public const string CheckDescription = "Tìm mã trùng, dữ liệu thiếu, liên kết hỏng, giá hết hạn và nhiều giá chồng thời gian. Add-in chỉ báo, không tự sửa.";
        public const string CheckRun = "Kiểm tra lại";
        public const string CheckOk = "Không phát hiện vấn đề nào.";
        public static string CheckErrors(int n) => $"{n} lỗi";
        public static string CheckWarnings(int n) => $"{n} cảnh báo";
        public const string CheckError = "Lỗi";
        public const string CheckWarning = "Cảnh báo";
        public const string CheckOpenHint = "Nháy đúp một dòng để mở bản ghi liên quan.";
        public const string ColSeverity = "Mức độ";
        public const string ColRecord = "Bản ghi";
        public const string ColDetail = "Chi tiết";

        // ---------- Tổng quan ----------
        public const string Rename = "Đổi tên";
        public const string NameLabel = "Tên thư viện";
        public static string Stats(int w, int r, int p, int n, int c, int s) =>
            $"{w} công tác · {r} tài nguyên · {p} giá · {n} định mức · {c} nhóm · {s} nhà cung cấp";
        public static string LastChanged(string at) => $"Cập nhật gần nhất: {at}";
        public const string NeverChanged = "Chưa có thay đổi nào";
        public static string Storage(string path) => $"Lưu trong file trên máy này: {path}. Không đồng bộ giữa các máy; hãy sao lưu định kỳ.";
        public const string QuickExchange = "Nhập / Xuất / Sao lưu";

        // ---------- Nhóm ----------
        public static string CategoriesTitle(int n) => $"Nhóm ({n})";
        public const string CategoriesIntro = "Nhóm dùng chung cho công tác và tài nguyên (ví dụ do bạn tự đặt: vật liệu, cây xanh, vận chuyển). Không có nhóm mặc định.";
        public const string AddCategory = "Thêm nhóm";
        public const string CategoriesEmpty = "Chưa có nhóm nào.";
        public const string CategoryName = "Tên nhóm";
        public const string CategoryNotes = "Ghi chú";
        public const string NewCategoryTitle = "Nhóm mới";
        public static string EditCategoryTitle(string name) => $"Sửa nhóm \"{name}\"";
        public static string Unassigned(int w, int r) => $"Chưa phân nhóm: {w} công tác · {r} tài nguyên";
        public const string DeleteCategoryTitle = "Xóa nhóm?";
        public static string DeleteCategoryUnused(string name) => $"Xóa nhóm \"{name}\". Nhóm đang không có công tác hay tài nguyên nào.";
        public static string DeleteCategoryUsed(string name, int w, int r) =>
            $"Nhóm \"{name}\" đang có {w} công tác và {r} tài nguyên. Các bản ghi này KHÔNG bị xóa; hãy chọn nơi chuyển chúng tới.";
        public const string MoveTo = "Chuyển công tác/tài nguyên sang";
        public const string Unassign = "Bỏ phân nhóm";
        public const string DeleteCategoryConfirm = "Xóa nhóm";
        public const string ColWorkItems = "Công tác";
        public const string ColResources = "Tài nguyên";
        public const string ColPrices = "Giá";

        // ---------- Nhà cung cấp ----------
        public static string SuppliersTitle(int n) => $"Nhà cung cấp ({n})";
        public const string SuppliersIntro = "Thông tin cơ bản để ghi nguồn giá. Thông tin liên hệ chỉ lưu trên máy này và trong file sao lưu của bạn.";
        public const string AddSupplier = "Thêm nhà cung cấp";
        public const string SuppliersEmpty = "Chưa có nhà cung cấp nào.";
        public const string SupplierName = "Tên nhà cung cấp";
        public const string SupplierContact = "Liên hệ (điện thoại, email, địa chỉ…)";
        public const string SupplierNotes = "Ghi chú";
        public const string NewSupplierTitle = "Nhà cung cấp mới";
        public static string EditSupplierTitle(string name) => $"Sửa nhà cung cấp \"{name}\"";
        public const string DeleteSupplierTitle = "Xóa nhà cung cấp?";
        public static string DeleteSupplierBody(string name, int w, int p) =>
            $"Xóa nhà cung cấp \"{name}\".{(w + p > 0 ? $" {w} công tác và {p} giá đang ghi nhà cung cấp này sẽ chỉ bị bỏ liên kết (giá và nguồn giá giữ nguyên)." : "")} Thao tác không hoàn tác được.";

        // ---------- Cột danh sách ----------
        public const string ColCode = "Mã";
        public const string ColName = "Tên";
        public const string ColUnit = "Đơn vị";
        public const string ColPrice = "Đơn giá";
        public const string ColSource = "Nguồn giá";
        public const string ColEffective = "Hiệu lực";
        public const string ColValidity = "Tình trạng";
        public const string ColNorms = "Định mức";
        public const string ColCurrentPrice = "Giá";
        public const string ColNotes = "Ghi chú";
        public const string ColContact = "Liên hệ";
    }

    /// <summary>Chuỗi giao diện định mức, chuyển từ NORM_UI (src/shared/strings.norms.vi.ts).</summary>
    internal static class NS
    {
        public const string Intro = "Định mức hao phí do bạn tự nhập hoặc lấy từ tài liệu. ConsQuotation không kèm sẵn định mức nào và không xác nhận tính pháp lý của định mức.";
        public const string Add = "Thêm định mức";
        public const string Empty = "Chưa có định mức nào.";
        public const string Search = "Tìm theo mã, tên (không cần gõ dấu)";
        public const string StatusFilter = "Trạng thái";
        public const string AllStatuses = "Tất cả";
        public static readonly IReadOnlyDictionary<NormStatus, string> Status = new Dictionary<NormStatus, string>
        {
            [NormStatus.Draft] = "Nháp",
            [NormStatus.Approved] = "Đang dùng",
            [NormStatus.Inactive] = "Ngừng dùng",
        };
        public static string LinkedTo(string code) => $"công tác {code}";
        public const string SourceUser = "Người dùng tự xây dựng";
        public static string SourceDocument(string source, bool verified) => $"Tài liệu: {source}{(verified ? " (đã đối chiếu)" : " (chưa đối chiếu)")}";
        public const string Open = "Mở";
        public const string CopyVersion = "Sao chép thành phiên bản mới";
        public static string Copied(string code, string version) => $"Đã tạo phiên bản nháp {version} của {code}.";
        public const string Approve = "Chuyển sang đang dùng";
        public const string Deactivate = "Ngừng dùng";
        public static string Approved(string code, string version) => $"{code} phiên bản {version} đang dùng.";
        public static string Deactivated(string code, string version) => $"{code} phiên bản {version} đã ngừng dùng.";
        public const string DeleteTitle = "Xóa bản nháp định mức?";
        public static string DeleteBody(string code, string version, int components) =>
            $"Xóa định mức {code} phiên bản {version} cùng {components} thành phần. Chỉ bản nháp xóa được. Thao tác không hoàn tác được.";
        public const string NewTitle = "Định mức mới";
        public static string EditTitle(string code, string version) => $"Định mức {code} phiên bản {version}";
        public const string LockedNote = "Phiên bản này không còn là nháp nên thành phần và hao phí đã khóa. Muốn sửa, hãy sao chép thành phiên bản mới.";
        public const string FCode = "Mã định mức";
        public const string FName = "Tên công tác";
        public const string FUnit = "Đơn vị tính";
        public const string FCategory = "Nhóm";
        public const string FWorkItem = "Công tác liên kết";
        public const string FWorkItemHint = "Dùng khi phân tích đơn giá";
        public const string FNoWorkItem = "— Không liên kết —";
        public const string FVersion = "Phiên bản";
        public const string FEffectiveFrom = "Ngày áp dụng";
        public const string FSourceType = "Nguồn định mức";
        public const string FSourceUser = "Người dùng tự xây dựng";
        public const string FSourceDocument = "Tài liệu bên ngoài";
        public const string FSource = "Mã hoặc tên tài liệu, số hiệu, ghi chú nguồn";
        public const string FSourceVerified = "Đã đối chiếu với tài liệu gốc";
        public const string FWasteIncluded = "Hao phí trong nguồn đã gồm hao hụt (không cộng thêm)";
        public const string FNotes = "Ghi chú";
        public const string Save = "Lưu định mức";
        public static string SavedNorm(string code, string version) => $"Đã lưu {code} phiên bản {version}.";

        public static string ComponentsTitle(int n) => $"Thành phần tài nguyên ({n})";
        public const string ComponentsEmpty = "Chưa có thành phần. Thêm tài nguyên từ thư viện.";
        public const string CResource = "Tài nguyên";
        public const string CChooseResource = "Chọn tài nguyên…";
        public const string CConsumption = "Hao phí cơ sở";
        public const string CConsumptionHint = "Cho 1 đơn vị công tác";
        public const string CWastePercent = "Hao hụt (%)";
        public const string CWasteHint = "Để trống nếu không có. 5 nghĩa là 5%.";
        public const string CNotes = "Ghi chú";
        public const string CAdd = "Thêm thành phần";
        public const string CUpdate = "Lưu thành phần";
        public const string CCancelEdit = "Hủy sửa";
        public const string CEdit = "Sửa";
        public const string CUp = "Lên";
        public const string CDown = "Xuống";
        public const string CRemove = "Xóa";
        public const string CRefresh = "Cập nhật liên kết";
        public const string CNeedResources = "Thư viện chưa có tài nguyên. Thêm ở tab Tài nguyên trước.";
        public const string CDeleteTitle = "Xóa thành phần?";
        public static string CDeleteBody(string code) => $"Xóa thành phần \"{code}\" khỏi bản nháp định mức này.";
        public const string CUnpriced = "chưa tính được thành tiền";
        public const string CChoosePrice = "Giá áp dụng";
        public const string CChoosePriceHint = "Lưu cùng định mức và làm giá mặc định khi phân tích đơn giá trong báo giá.";
        public const string CAutoPrice = "— Tự chọn (khi chỉ có một giá dùng được) —";
        public static string PriceOption(string price, string unit, string status, string source) =>
            $"{price}/{unit} · {status}{(source != "" ? $" · {source}" : "")}";
        public const string CSelectHint = "Chọn một thành phần trong danh sách để sửa, đổi thứ tự hoặc chọn giá áp dụng.";

        public const string ColOrder = "#";
        public const string ColType = "Loại";
        public const string ColCode = "Mã";
        public const string ColName = "Tài nguyên";
        public const string ColUnit = "ĐV";
        public const string ColBase = "Hao phí";
        public const string ColWaste = "Hao hụt %";
        public const string ColEffective = "Hao phí tính toán";
        public const string ColPrice = "Đơn giá";
        public const string ColAmount = "Thành tiền";
        public const string ColIssues = "Lỗi/cảnh báo";
        public const string ColVersion = "Phiên bản";
        public const string ColStatus = "Trạng thái";
        public const string ColComponents = "Thành phần";
        public const string ColSource = "Nguồn";
        public const string ColWorkItem = "Công tác liên kết";

        public const string ResultTitle = "Kết quả tính";
        public const string Valid = "Hợp lệ";
        public const string ValidWithWarnings = "Tính được, có cảnh báo";
        public const string Invalid = "Chưa tính được";
        public static readonly IReadOnlyDictionary<ResourceType, string> Totals = new Dictionary<ResourceType, string>
        {
            [ResourceType.Material] = "Chi phí vật liệu",
            [ResourceType.Labor] = "Chi phí nhân công",
            [ResourceType.Machine] = "Chi phí máy thi công",
            [ResourceType.Other] = "Chi phí tài nguyên khác",
        };
        public static string UnitPrice(string unit) => $"Đơn giá tổng hợp (cho 1 {unit})";
        public const string Missing = "Chưa tính được";
        public const string Rounding = "Giữ đủ phần lẻ, không làm tròn. Khi dùng trong báo giá, quy tắc làm tròn của workbook được áp dụng.";
        public static string DateNote(string date) => $"Giá tài nguyên lấy theo hiệu lực ngày {date}.";
        public const string Formula = "Hao phí tính toán = hao phí cơ sở × (1 + hao hụt); thành tiền = hao phí tính toán × đơn giá; đơn giá tổng hợp = tổng thành tiền.";
        public const string IssuesTitle = "Lỗi và cảnh báo";
        public const string IssueError = "Lỗi: ";
        public const string IssueWarning = "Cảnh báo: ";
    }

    /// <summary>Chuỗi Nhập/Xuất và sao lưu, chuyển từ src/shared/strings.exchange.vi.ts.</summary>
    internal static class XS
    {
        public static readonly IReadOnlyDictionary<DatasetKind, string> Kinds = new Dictionary<DatasetKind, string>
        {
            [DatasetKind.Categories] = "Nhóm",
            [DatasetKind.Suppliers] = "Nhà cung cấp",
            [DatasetKind.WorkItems] = "Công tác",
            [DatasetKind.Resources] = "Tài nguyên",
            [DatasetKind.ResourcePrices] = "Giá tài nguyên",
            [DatasetKind.Norms] = "Định mức",
            [DatasetKind.NormComponents] = "Thành phần định mức",
        };

        public const string BackupTitle = "Sao lưu và xuất";
        public const string BackupDescription = "Thư viện chỉ nằm trên máy này. Hãy sao lưu thường xuyên và chép file sang nơi an toàn (OneDrive, ổ đĩa ngoài).";
        public const string Json = "Lưu bản sao lưu (.json)…";
        public const string JsonHint = "Bản sao lưu đầy đủ nhất, dùng để khôi phục hoặc chuyển máy.";
        public const string Workbook = "Xuất ra workbook Excel";
        public const string WorkbookHint = "Mở workbook mới, mỗi loại dữ liệu một sheet: xem, sửa hoặc lưu làm bản sao lưu.";
        public const string Template = "Mở file mẫu trống";
        public const string TemplateHint = "Workbook chỉ có tiêu đề cột theo schema, để điền dữ liệu rồi nhập.";
        public static string JsonDone(string path) => $"Đã lưu bản sao lưu vào \"{path}\". Hãy chép file sang nơi an toàn.";
        public const string WorkbookDone = "Excel đã mở workbook mới chứa thư viện. Hãy lưu bằng File › Save As: workbook chưa được lưu sẽ mất khi đóng.";
        public const string TemplateDone = "Excel đã mở workbook mẫu trống. Điền dữ liệu, rồi dùng phần Nhập bên dưới.";
        public const string Failed = "Không xuất được";
        public const string JsonFilter = "Bản sao lưu ConsQuotation (*.json)|*.json";

        public const string StatusNever = "Thư viện chưa được sao lưu lần nào. Dữ liệu sẽ mất nếu máy hỏng, cài lại Windows hoặc đổi máy.";
        public static string StatusStale(string at) => $"Thư viện đã thay đổi sau lần sao lưu/xuất gần nhất ({at}).";
        public static string StatusOk(string at) => $"Lần sao lưu/xuất gần nhất: {at}.";
        public const string BackupNow = "Sao lưu ngay";

        public const string ImportTitle = "Nhập vào thư viện";
        public const string ImportDescription = "Nhập từ file sao lưu (.json), file CSV, hoặc một sheet trong workbook đang mở. Luôn có bước xem trước; không ghi gì khi bạn chưa xác nhận.";
        public const string ChooseFile = "Chọn file (.json, .csv)…";
        public const string FileHint = "File .xlsx: mở file đó trong Excel trước, rồi dùng \"Đọc từ workbook đang mở\". CSV phải lưu dạng UTF-8.";
        public const string OpenFilter = "Sao lưu hoặc CSV (*.json;*.csv;*.txt)|*.json;*.csv;*.txt|Tất cả file (*.*)|*.*";
        public const string FromWorkbook = "Đọc từ workbook đang mở";
        public static string WorkbookLabel(string name) => $"Workbook: {name}";
        public const string Sheet = "Sheet";
        public const string RefreshSheets = "Làm mới danh sách sheet";
        public const string ReadSheet = "Đọc sheet";
        public const string Table = "Hoặc một Excel Table";
        public const string TableHint = "Đọc đúng vùng của bảng (tiêu đề + dữ liệu). Add-in chỉ đọc, không sửa bảng.";
        public static string TableOption(string name, string sheet, int rows) => $"{name} (sheet \"{sheet}\", {rows} dòng)";
        public const string ReadTable = "Đọc bảng";
        public static string SheetSize(string name, int rows, int cols) => rows == 0 ? $"{name} (trống)" : $"{name} ({rows} dòng × {cols} cột)";
        public static string BackupDetected(string exportedAt, string libraryName) =>
            $"Workbook này là bản xuất thư viện ConsQuotation{(libraryName != "" ? $" \"{libraryName}\"" : "")}{(exportedAt != "" ? $" (xuất lúc {exportedAt})" : "")}.";
        public static string BackupFileLabel(string fileName, string libraryName) =>
            libraryName != "" ? $"File \"{fileName}\" (thư viện \"{libraryName}\")" : $"File \"{fileName}\"";
        public static string CreatedRefs(IReadOnlyList<string> categories, IReadOnlyList<string> suppliers) =>
            string.Join("; ", new[]
            {
                categories.Count > 0 ? $"{categories.Count} nhóm mới: {string.Join(", ", categories)}" : "",
                suppliers.Count > 0 ? $"{suppliers.Count} nhà cung cấp mới: {string.Join(", ", suppliers)}" : "",
            }.Where(s => s != "")) + ". Các tên này có trong cột Nhóm/Nhà cung cấp nhưng chưa có trong thư viện; add-in sẽ tạo khi nhập.";
        public const string ReadBackup = "Đọc toàn bộ bản xuất";
        public const string Reading = "Đang đọc dữ liệu…";
        public const string ReadFailed = "Không đọc được nguồn dữ liệu";
        public static string TooBig(int mb) => $"File lớn hơn {mb} MB. Hãy chia nhỏ file.";
        public const string XlsxNotSupported = "Add-in không đọc trực tiếp file .xlsx. Hãy mở file đó trong Excel, rồi dùng \"Đọc từ workbook đang mở\".";
        public const string EmptySource = "Nguồn không có dữ liệu.";
        public const string FileUnreadable = "Không đọc được file. File có thể đã bị di chuyển, bị xóa hoặc đang bị ứng dụng khác khóa. Hãy chọn lại.";
        public static string SheetTooLarge(int total, int max) => $"Sheet có {total} dòng, vượt giới hạn {max} dòng mỗi lần nhập. Hãy chia nhỏ dữ liệu.";

        public static string SourceRead(string label, int rows) => $"Đã đọc {label}: {rows} dòng.";
        public const string HeaderRow = "Dòng tiêu đề";
        public const string HeaderRowHint = "Số dòng (trên sheet/file) chứa tên cột. Add-in tự nhận diện; sửa nếu sai.";
        public const string Kind = "Loại dữ liệu";
        public const string ChooseKind = "Chọn loại dữ liệu…";
        public const string KindUnknown = "Không nhận ra loại dữ liệu từ tên cột. Hãy chọn loại và map cột.";
        public const string MappingTitle = "Map cột";
        public const string NotMapped = "— Không nhập —";
        public const string Preview = "Xem trước (5 dòng đầu)";

        public const string DuplicateMode = "Bản ghi trùng với thư viện";
        public const string Skip = "Bỏ qua (giữ nguyên dữ liệu trong thư viện)";
        public const string Update = "Cập nhật theo file (chỉ các cột có trong file)";
        public const string UpdateHint = "Trùng: công tác/tài nguyên cùng mã; giá giống hệt (cùng tài nguyên, đơn giá, đơn vị, tiền tệ, hiệu lực, nguồn); định mức cùng mã và phiên bản; thành phần cùng định mức (mã, phiên bản) và tài nguyên.";
        public static string LargeWarning(int rows) => $"Nhập {rows} dòng có thể mất vài giây.";
        public const string SummaryTitle = "Kết quả kiểm tra";
        public const string ColSource = "Nguồn";
        public const string ColKind = "Loại";
        public const string ColTotal = "Tổng";
        public const string ColAdded = "Mới";
        public const string ColDuplicates = "Trùng";
        public const string ColErrors = "Lỗi";
        public const string ColEmpty = "Dòng trống";
        public const string ProblemsTitle = "Không thể nhập";
        public static string IssuesTitle(int n) => $"{n} lỗi: các dòng này sẽ không được nhập";
        public static string IssuesSkipped(int n) => $"{n} dòng lỗi đã được bỏ qua (không nhập)";
        public const string Importing = "Đang ghi vào thư viện…";
        public static string MoreIssues(int n) => $"… và {n} lỗi khác.";
        public const string NothingToImport = "Không có bản ghi mới hoặc cần cập nhật.";
        public static string Submit(int n) => $"Nhập {n} bản ghi vào thư viện";
        public const string Cancel = "Hủy";
        public const string ConfirmTitle = "Nhập vào thư viện?";
        public static string ConfirmBody(int added, int updated, int skipped, int errors, int newCategories, int newSuppliers) =>
            string.Join(", ", new[]
            {
                $"Thêm mới {added} bản ghi",
                newCategories > 0 ? $"tạo {newCategories} nhóm mới" : null,
                newSuppliers > 0 ? $"tạo {newSuppliers} nhà cung cấp mới" : null,
                updated > 0 ? $"cập nhật {updated} bản ghi đã có" : null,
                skipped > 0 ? $"bỏ qua {skipped} bản ghi trùng" : null,
                errors > 0 ? $"bỏ qua {errors} dòng lỗi" : null,
            }.Where(s => s != null)) + ". Thao tác không hoàn tác được; nếu cần, hãy sao lưu trước.";
        public const string Confirm = "Nhập";
        public const string ChangedMeanwhile = "Thư viện vừa thay đổi (ví dụ ở cửa sổ Excel khác) nên kết quả kiểm tra đã khác. Hãy xem lại rồi bấm Nhập lần nữa.";
        public static string Done(int added, int updated) => $"Đã nhập: thêm {added}, cập nhật {updated} bản ghi. Không có dòng lỗi nào được nhập.";
        public const string ImportFailed = "Nhập thất bại: thư viện giữ nguyên, không có dữ liệu nào được ghi.";
        public const string Another = "Nhập nguồn khác";
    }
}
