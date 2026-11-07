using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Quotation;

namespace ConsQuotation.QuoteUi
{
    /// <summary>Chữ giao diện cửa sổ Báo giá, chuyển từ strings.vi.ts, strings.workflow.vi.ts, strings.quotation.vi.ts, strings.pricing.vi.ts.</summary>
    internal static class Q
    {
        public const string WindowTitle = "Báo giá";
        public const string TabOverview = "Tổng quan";
        public const string TabCreate = "Tạo bảng";
        public const string TabInfo = "Thông tin";
        public const string TabAdd = "Thêm công tác";
        public const string TabItems = "Công tác";
        public const string TabCheck = "Kiểm tra";
        public const string TabSummary = "Tổng hợp";
        public const string TabRounding = "Làm tròn";
        public const string TabTerms = "Ghi chú";
        public const string TabPrint = "Trang in";
        public const string Cancel = "Hủy";
        public const string Refresh = "Làm mới";
        public const string Table = "Bảng báo giá";
        public const string NoTablesCreateFirst = "Workbook chưa có bảng báo giá nào. Hãy tạo bảng trước.";
        public const string HeadersChangedOption = ", tiêu đề cột đã bị đổi";
        public const string UnexpectedChange = "Workbook vừa thay đổi nên add-in chưa ghi gì. Hãy thử lại.";

        public static string TableOption(string table, string sheet, int rows) => $"{table}: sheet \"{sheet}\" ({rows} dòng)";
        public static string Where(string sheet, string address) => Sheet.QualifiedAddress(sheet, address);

        public static string Blocker(TargetBlocker blocker)
        {
            switch (blocker.Kind)
            {
                case BlockerKind.Protected:
                    return "Sheet đang được bảo vệ (Protect). Bỏ bảo vệ sheet hoặc chọn vị trí khác.";
                case BlockerKind.TableOverlap:
                    return $"Vùng đích chồng lên Excel Table có sẵn: {string.Join(", ", blocker.Names)}. Chọn vị trí khác.";
                case BlockerKind.MergedCells:
                    return $"Vùng đích có ô gộp ({string.Join(", ", blocker.Names)}). Bỏ gộp ô hoặc chọn vị trí khác.";
                case BlockerKind.OutOfBounds:
                    return "Mẫu báo giá vượt quá giới hạn hàng/cột của sheet. Chọn ô ở vị trí cao hơn hoặc bên trái hơn.";
                case BlockerKind.SheetMissing:
                    return "Sheet không còn tồn tại (có thể vừa bị đổi tên hoặc xóa).";
                case BlockerKind.TableMissing:
                    return "Bảng không còn tồn tại (có thể vừa bị đổi tên hoặc xóa). Bấm Làm mới.";
                case BlockerKind.HeadersChanged:
                    return "Tiêu đề cột của bảng đã bị đổi so với mẫu nên add-in không chắc ghi đúng cột. Khôi phục tiêu đề cột hoặc gõ trực tiếp trong Excel.";
                default:
                    return "Vùng đang chọn không nằm trong bảng đã chọn. Chọn một ô trong bảng trên Excel, hoặc chọn vị trí Cuối bảng.";
            }
        }

        public static string Blockers(IEnumerable<TargetBlocker> blockers) => string.Join(" ", blockers.Select(Blocker));

        internal static class Create
        {
            public const string Title = "Tạo bảng báo giá";
            public const string Description = "Tạo khối thông tin báo giá và một Excel Table với các cột STT, Mã công tác, Nhóm công tác, Nội dung công việc, Đơn vị tính, Khối lượng, đơn giá thành phần, Đơn giá, Thành tiền, Ghi chú. Thành tiền = Khối lượng × Đơn giá (để trống khi thiếu một trong hai).";
            public const string Placement = "Vị trí tạo";
            public const string NewSheet = "Sheet mới (khuyến nghị, không ảnh hưởng dữ liệu có sẵn)";
            public const string AtSelection = "Tại ô đang chọn trên sheet hiện tại";
            public const string SheetName = "Tên sheet mới";
            public const string SheetNameHint = "Nếu trùng tên sheet có sẵn, add-in tự thêm (2), (3)…";
            public const string InitialRows = "Số dòng công tác ban đầu (1–500)";
            public const string Submit = "Tạo bảng báo giá";
            public const string ConfirmLocationTitle = "Tạo bảng báo giá tại vị trí này?";
            public const string ConfirmOverwriteTitle = "Vùng đích đang có dữ liệu";
            public const string ConfirmCreate = "Tạo bảng";
            public const string ConfirmOverwrite = "Ghi đè";
            public const string Changed = "Workbook đã thay đổi trong lúc chờ xác nhận nên add-in chưa ghi gì. Hãy bấm Tạo bảng báo giá để kiểm tra lại.";
            public const string BlockedTitle = "Không thể tạo bảng tại vị trí này";

            public static string ConfirmLocationBody(string where) =>
                $"Add-in sẽ ghi vào vùng {where}. Vùng này hiện đang trống. Lưu ý: không hoàn tác được bằng Ctrl+Z; nếu tạo nhầm, hãy xóa bảng thủ công.";

            public static string ConfirmOverwriteBody(string where, int count, IEnumerable<string> sample) =>
                $"Vùng {where} có {count} ô đang có dữ liệu (ví dụ: {string.Join(", ", sample)}). Nếu tiếp tục, nội dung các ô này sẽ bị xóa và thay bằng mẫu báo giá. Thao tác này không hoàn tác được bằng Ctrl+Z. Nếu cần giữ dữ liệu, hãy hủy và chọn vị trí khác.";

            public static string Created(string table, string where) => $"Đã tạo bảng {table} tại {where}.";
        }

        internal static class Info
        {
            public const string Title = "Thông tin báo giá";
            public const string Intro = "Các mục trong khối thông tin phía trên bảng báo giá. Tất cả đều tùy chọn. Add-in đọc trực tiếp từ sheet mỗi lần mở; bạn vẫn có thể gõ thẳng trên sheet.";
            public const string DateHint = "dd/mm/yyyy, ghi thành ngày của Excel";
            public const string NotFound = "Không tìm thấy nhãn này phía trên bảng (có thể đã bị xóa hoặc sửa).";
            public const string Save = "Lưu thông tin";
            public const string Reload = "Tải lại từ sheet";
            public const string NoChange = "Không có thay đổi để ghi.";
            public const string Changed = "Thông tin trên sheet vừa thay đổi kể từ lúc tải. Add-in chưa ghi gì: các mục bạn đã sửa được giữ, các mục khác đã lấy giá trị mới trên sheet. Kiểm tra lại rồi bấm Lưu.";
            public const string Protected = "Sheet đang được bảo vệ, không ghi được thông tin. Bỏ bảo vệ (Review › Unprotect Sheet) rồi bấm Tải lại từ sheet.";
            public const string Errors = "Hãy sửa các lỗi được đánh dấu.";

            public static string AddedLater(string label) => $"Mục mới từ bản 1.11.0; sheet này chưa có. Muốn dùng, gõ nhãn \"{label}\" vào cột đầu của khối thông tin rồi tải lại.";
            public static string Saved(int n) => $"Đã ghi {n} mục thông tin.";
            public static string Expired(string date) => $"Báo giá đã hết hiệu lực từ {date}.";
        }

        internal static class Add
        {
            public const string Title = "Thêm công tác";
            public const string Description = "Thêm một dòng vào bảng báo giá đã chọn: nhập trực tiếp, lấy từ thư viện hoặc phân tích từ định mức. Bạn cũng có thể gõ trực tiếp vào bảng trong Excel.";
            public const string FromLibrary = "Chọn từ thư viện…";
            public const string Code = "Mã công tác";
            public const string Group = "Nhóm công tác";
            public const string Description2 = "Nội dung công việc";
            public const string Unit = "Đơn vị tính";
            public const string Quantity = "Khối lượng";
            public const string UnitPrice = "Đơn giá";
            public const string Notes = "Ghi chú";
            public const string NumberHint = "Để trống nếu chưa có. Dùng . hoặc , làm dấu thập phân, không dùng dấu phân cách hàng nghìn.";
            public const string Position = "Vị trí chèn";
            public const string PositionEnd = "Cuối bảng";
            public const string PositionBelow = "Ngay dưới dòng đang chọn trong bảng";
            public const string PositionBelowOutside = "Vùng đang chọn không nằm trong bảng này. Chọn một ô trong bảng trên Excel rồi bấm Làm mới, hoặc chọn Cuối bảng.";
            public const string PositionEndHint = "Sẽ ghi vào dòng trống đầu tiên ở cuối bảng (nếu còn); nếu không, chèn dòng mới ngay trên dòng Tổng cộng.";
            public const string Submit = "Thêm vào bảng";
            public const string ConfirmShiftTitle = "Dữ liệu bên dưới bảng sẽ bị đẩy xuống";
            public const string ConfirmShift = "Vẫn thêm dòng";
            public const string Changed = "Bảng hoặc dữ liệu bên dưới đã thay đổi trong lúc chờ xác nhận nên add-in chưa ghi gì. Hãy bấm Thêm vào bảng để kiểm tra lại.";
            public const string BlockedTitle = "Không thể thêm dòng vào bảng này";
            public const string Method = "Cách xác định đơn giá";
            public const string MethodLibrary = "Đơn giá trong thư viện";
            public const string MethodLibraryNone = "Đơn giá trong thư viện (chưa có)";
            public const string MissingPrice = "Công tác chưa có đơn giá trong thư viện: ô Đơn giá sẽ để trống.";
            public const string PickTitle = "Chọn công tác từ thư viện";
            public const string PickSearch = "Tìm theo mã, tên, nhóm, đơn vị, nhà cung cấp (không cần gõ dấu)";
            public const string PickOk = "Chọn";
            public const string PickEmpty = "Thư viện chưa có công tác nào. Mở Thư viện của tôi để thêm.";

            public static string PositionBelowAt(int row) => $"Sẽ thêm ngay dưới hàng {row} (dòng đang chọn). Nếu dòng đang chọn hoặc dòng ngay dưới còn trống, add-in ghi vào dòng trống đó thay vì chèn thêm. Chọn ở hàng tiêu đề thì lên đầu bảng; chọn ở dòng tổng thì xuống cuối bảng.";
            public static string ConfirmShiftBody(int count, IEnumerable<string> sample) => $"Bên dưới bảng (trong phạm vi các cột của bảng) có {count} ô đang có dữ liệu (ví dụ: {string.Join(", ", sample)}). Khi thêm dòng, Excel sẽ đẩy các ô này xuống, không xóa dữ liệu, nhưng chúng có thể lệch hàng so với cột khác. Thao tác không hoàn tác được bằng Ctrl+Z.";
            public static string Added(string where) => $"Đã thêm công tác tại {where}.";
            public static string MethodComposition(int n) => $"Phân tích từ định mức ({n} tài nguyên)";
            public static string Prefilled(string code) => $"Đã lấy công tác \"{code}\" từ thư viện. Kiểm tra, nhập Khối lượng rồi bấm Thêm vào bảng. Dòng báo giá là bản sao: sửa thư viện sau này không làm đổi báo giá.";
            public static string Expired(string date) => $"Đơn giá đã hết hiệu lực sau ngày {date}. Hãy kiểm tra lại trước khi dùng.";
            public static string NotYetEffective(string date) => $"Đơn giá chỉ có hiệu lực từ ngày {date}.";
        }

        internal static class Comp
        {
            public const string Title = "Chọn giá tài nguyên";
            public const string Intro = "Đơn giá = Σ (hao phí × đơn giá nguồn). Add-in ghi chi tiết vào sheet \"Phân tích đơn giá\" bằng công thức Excel để truy vết; dòng báo giá nhận kết quả dạng giá trị.";
            public const string NoPrice = "Chưa chọn (nhập sau trên sheet phân tích)";
            public const string OnlyValid = "Chọn sẵn vì là giá duy nhất đang dùng, còn hiệu lực và đúng đơn vị. Hãy kiểm tra lại.";
            public const string MustChoose = "Có nhiều giá: hãy tự chọn giá áp dụng (add-in không tự chọn giá mới nhất).";
            public const string NoOptions = "Tài nguyên chưa có giá nào dùng được trong thư viện.";
            public const string MissingResource = "(tài nguyên không còn tồn tại)";
            public const string PreviewMissing = "Chưa tính được: còn tài nguyên chưa chọn giá.";
            public const string ExistsMissing = "chưa đủ số liệu";
            public const string UnitPriceLocked = "Lấy từ sheet phân tích";
            public const string AddedMissing = "Phân tích còn thiếu đơn giá nguồn nên Đơn giá trong báo giá để trống. Nhập đơn giá nguồn trên sheet phân tích, rồi vào thẻ Công tác để kiểm tra.";
            public const string AnalysisWrittenButChanged = "Đã ghi phân tích nhưng bảng báo giá vừa thay đổi nên chưa thêm dòng. Hãy bấm Thêm lần nữa: phân tích có sẵn sẽ được dùng lại.";

            public static string Quantity(string q, string unit) => $"Hao phí {q} {unit}";
            public static string Preview(string value, string currency, string rule) => $"Tạm tính: {value}{(currency != "" ? " " + currency : "")} ({rule}). Giá trị ghi vào báo giá do Excel tính trên sheet phân tích.";
            public static string Exists(string code, string price) => $"Mã \"{code}\" đã có phân tích trên sheet (đơn giá {price}). Add-in sẽ dùng phân tích có sẵn; lựa chọn giá bên dưới không được áp dụng. Muốn phân tích lại: xóa các dòng của mã này trên sheet \"Phân tích đơn giá\" rồi thêm lại.";
            public static string AnalysisSheet(string sheet) => $"Chi tiết phân tích ở sheet \"{sheet}\".";
            public static string AddedError(string error) => $"Đơn giá phân tích đang lỗi ({error}) nên Đơn giá trong báo giá để trống. Kiểm tra sheet phân tích.";
            public static string ExistsUsed(string code) => $"Mã \"{code}\" vừa có phân tích trên sheet (được thêm ở nơi khác) nên add-in đã dùng phân tích có sẵn thay cho lựa chọn giá của bạn.";
        }

        internal static class Flow
        {
            public const string Title = "Quy trình báo giá";
            public const string Intro = "Tình trạng từng bước, đọc trực tiếp từ workbook mỗi lần kiểm tra.";
            public const string Workbook = "Workbook";
            public const string NoWorkbook = "(không có workbook đang mở)";
            public const string TablesTitle = "Bảng báo giá trong workbook";
            public const string NoTables = "Chưa có bảng báo giá nào. Bấm Tạo bảng báo giá để bắt đầu.";
            public const string Sheet = "Sheet";
            public const string Rows = "Số dòng";
            public const string Status = "Tình trạng";
            public const string HeadersChanged = "Tiêu đề cột đã bị đổi";
            public const string HeadersOk = "Đúng mẫu";
            public const string GoTo = "Đi tới bảng";
            public const string Recheck = "Kiểm tra lại";
            public const string ActionCreate = "Tạo bảng báo giá";
            public const string ActionInfo = "Nhập thông tin";
            public const string ActionAdd = "Thêm công tác";
            public const string ActionItems = "Xem công tác";
            public const string ActionCheck = "Kiểm tra báo giá";
            public const string ActionSummary = "Thiết lập tổng hợp";
            public const string ActionPrint = "Thiết lập trang in";
            public const string NoStatus = "Workbook là nguồn sự thật: mỗi lần kiểm tra đều đọc lại dữ liệu hiện tại.";

            public static readonly IReadOnlyDictionary<StepState, string> States = new Dictionary<StepState, string>
            {
                [StepState.Done] = "Xong",
                [StepState.Todo] = "Chưa làm",
                [StepState.Attention] = "Cần xem",
                [StepState.Optional] = "Tùy chọn",
            };

            public static readonly IReadOnlyDictionary<StepKey, string> Steps = new Dictionary<StepKey, string>
            {
                [StepKey.Template] = "1–3. Mẫu báo giá và vị trí ghi",
                [StepKey.Info] = "4. Thông tin báo giá",
                [StepKey.Items] = "5. Công tác",
                [StepKey.Prices] = "6. Khối lượng và đơn giá",
                [StepKey.Check] = "7–8. Tính toán và kiểm tra",
                [StepKey.Summary] = "Tổng hợp (chiết khấu, phụ phí, thuế)",
                [StepKey.Finish] = "9. Lưu, in, xuất PDF",
            };

            public const string DetailNoTable = "Chưa có bảng báo giá trong workbook.";
            public const string DetailHeadersChanged = "Bảng đã bị đổi tên cột mẫu: add-in không ghi vào bảng này.";
            public const string DetailSummaryNone = "Không có (không bắt buộc).";
            public const string DetailFinish = "Ghi chú, điều khoản và trang in ở các thẻ Ghi chú, Trang in. Lưu bằng Excel (Ctrl+S); in hoặc xuất PDF bằng File › Print / File › Export. ConsQuotation không tự gửi báo giá cho ai.";

            public static string DetailTable(string name, string sheet) => $"Đang dùng {name} (sheet \"{sheet}\"). Add-in kiểm tra và hỏi trước khi ghi vào vùng có dữ liệu.";
            public static string DetailInfo(int filled, int total) => $"Đã điền {filled}/{total} mục (không bắt buộc).";
            public static string DetailInfoMissing(int n) => $"{n} nhãn không còn trên sheet.";
            public static string DetailItems(int n) => n == 0 ? "Chưa có dòng công tác nào." : $"{n} dòng công tác.";
            public static string DetailPrices(int quantity, int price) => quantity + price == 0 ? "Mọi dòng đã có khối lượng và đơn giá." : $"{quantity} dòng thiếu khối lượng, {price} dòng thiếu đơn giá.";
            public static string DetailCheck(int errors, int warnings) => errors + warnings == 0 ? "Không phát hiện vấn đề." : $"{errors} lỗi, {warnings} cảnh báo.";
            public static string DetailSummaryTotal(string total) => $"Tổng cộng sau điều chỉnh: {total}.";
            public static string DetailSummaryError(string error) => $"Tổng cộng đang lỗi {error}.";
            public static string CheckedAt(string time) => $"Kiểm tra lúc {time}. Nếu bạn sửa sheet sau đó, hãy bấm Kiểm tra lại.";
        }

        internal static class Check
        {
            public const string Title = "Kiểm tra báo giá";
            public const string Intro = "Đọc trực tiếp bảng báo giá trên sheet: lỗi công thức, thiếu hoặc sai dữ liệu, đơn giá bằng 0, công thức bị sửa tay, đơn giá lệch sheet phân tích, phần tổng hợp. Add-in chỉ báo; mọi sửa đổi đều do bạn xác nhận.";
            public const string Run = "Kiểm tra";
            public const string GoTo = "Đi tới ô";
            public const string Error = "Lỗi";
            public const string Warning = "Cảnh báo";
            public const string ColSeverity = "Mức";
            public const string ColCell = "Ô";
            public const string ColWhere = "Vị trí";
            public const string ColMessage = "Nội dung";
            public const string CircularNote = "Tham chiếu vòng: Excel tự cảnh báo trên thanh trạng thái; add-in không đọc được trạng thái này.";
            public const string FixTitle = "Cập nhật đơn giá theo phân tích?";
            public const string Changed = "Bảng báo giá vừa thay đổi kể từ lúc kiểm tra; chưa ghi gì. Hãy kiểm tra lại.";
            public const string MethodsTitle = "Phương pháp đơn giá";
            public const string Confirm = "Đồng ý";

            public static readonly IReadOnlyDictionary<PriceMethod, string> Methods = new Dictionary<PriceMethod, string>
            {
                [PriceMethod.Direct] = "Nhập trực tiếp",
                [PriceMethod.Library] = "Thư viện",
                [PriceMethod.Composition] = "Phân tích định mức",
                [PriceMethod.Formula] = "Công thức tự nhập",
                [PriceMethod.Missing] = "Chưa có đơn giá",
            };

            public static string Ok(int rows) => $"Không phát hiện vấn đề nào ({rows} dòng công tác).";
            public static string Counts(int errors, int warnings, int rows) => $"{rows} dòng công tác: {errors} lỗi, {warnings} cảnh báo.";
            public static string Hint(string text) => $"Cách sửa: {text}";
            public static string CheckedAt(string time) => $"Kết quả lúc {time}. Nếu bạn sửa sheet sau đó, hãy bấm Kiểm tra lại; add-in không dùng kết quả cũ để ghi.";
            public static string FixAll(int n) => $"Cập nhật {n} đơn giá theo sheet phân tích";
            public static string FixBody(int n) => $"Ghi {n} đơn giá từ sheet \"Phân tích đơn giá\" vào bảng báo giá (thay giá trị hiện có). Thao tác không hoàn tác được bằng Ctrl+Z.";
            public static string Fixed(int n) => $"Đã cập nhật {n} đơn giá.";
        }

        internal static class Sum
        {
            public const string Title = "Tổng hợp: chiết khấu, phụ phí, thuế";
            public const string Intro = "Các khoản áp dụng theo thứ tự từ trên xuống, tính bằng công thức Excel trong bảng ngay dưới bảng báo giá. Add-in không có khoản hay tỷ lệ mặc định nào: bạn tự nhập theo hợp đồng hoặc quy định áp dụng.";
            public const string None = "Bảng này chưa có phần tổng hợp. Thêm khoản mục rồi bấm Áp dụng.";
            public const string Add = "Thêm khoản mục";
            public const string Kind = "Loại";
            public const string KindDeduct = "Giảm trừ (−)";
            public const string KindAdd = "Cộng thêm (+)";
            public const string Method = "Cách tính";
            public const string MethodRunning = "% trên lũy kế (giá trị sau các khoản phía trên)";
            public const string MethodBase = "% trên giá trị báo giá (trước mọi khoản)";
            public const string MethodFixed = "Số tiền cố định";
            public const string Value = "Giá trị";
            public const string ValueHint = "Tỷ lệ % (8 nghĩa là 8%) hoặc số tiền. Để trống nếu chưa có: tổng sẽ báo thiếu.";
            public const string MoveUp = "Lên";
            public const string MoveDown = "Xuống";
            public const string Remove = "Bỏ";
            public const string Apply = "Áp dụng";
            public const string RemoveTable = "Xóa bảng tổng hợp";
            public const string ConfirmTitle = "Ghi bảng tổng hợp?";
            public const string RemoveTitle = "Xóa bảng tổng hợp?";
            public const string RemoveBody = "Xóa bảng tổng hợp (chiết khấu, phụ phí, thuế) của bảng báo giá này. Thao tác không hoàn tác được bằng Ctrl+Z.";
            public const string Changed = "Workbook đã thay đổi trong lúc chờ xác nhận nên add-in chưa ghi gì. Hãy bấm Áp dụng để kiểm tra lại.";
            public const string Written = "Đã ghi bảng tổng hợp.";
            public const string Removed = "Đã xóa bảng tổng hợp.";
            public const string Errors = "Hãy sửa các lỗi được đánh dấu.";
            public const string ChangedOnSheet = "Bảng tổng hợp trên sheet vừa được sửa sau khi tải. Add-in chưa ghi gì và đã tải lại giá trị mới nhất; hãy xem lại rồi bấm Áp dụng.";

            public static string Name(int n) => $"Khoản mục {n}";
            public static string Existing(string address) => $"Đang có bảng tổng hợp tại {address}. Sửa bên dưới rồi bấm Áp dụng để ghi lại (giá trị bạn sửa trực tiếp trên sheet đã được đọc vào đây).";
            public static string InvalidRows(int n) => $"{n} dòng trên sheet có Loại, Cách tính hoặc Giá trị không hợp lệ và sẽ bị bỏ khi ghi lại.";
            public static string ConfirmBody(string address, int n) => $"Ghi bảng tổng hợp {n} khoản mục tại {address}. Vùng này đã được kiểm tra là trống (hoặc là bảng tổng hợp cũ của add-in).";

            public static string Blocked(AreaCheck check)
            {
                switch (check.Block)
                {
                    case AreaBlock.TableMissing:
                        return "Không tìm thấy bảng báo giá (có thể vừa bị xóa hoặc đổi tên). Bấm Làm mới.";
                    case AreaBlock.HeadersChanged:
                        return "Bảng báo giá đã bị đổi tên cột mẫu.";
                    case AreaBlock.NoTotals:
                        return "Bảng báo giá không bật dòng tổng (Table Design › Total Row) nên không có giá trị để tổng hợp.";
                    case AreaBlock.Protected:
                        return "Sheet đang được bảo vệ. Bỏ bảo vệ (Review › Unprotect Sheet) rồi thử lại.";
                    default:
                        return $"Vùng cần cho bảng tổng hợp (dưới dòng tổng của bảng báo giá) đang có dữ liệu ở {string.Join(", ", check.Sample)}. Add-in không ghi đè: hãy di chuyển dữ liệu đó rồi thử lại.";
                }
            }
        }

        internal static class Round
        {
            public const string Title = "Quy tắc làm tròn (workbook này)";
            public const string Intro = "Mặc định không làm tròn. Làm tròn bằng hàm Excel trong công thức, áp dụng cho cả workbook và lưu trong file.";
            public const string Mode = "Kiểu làm tròn";
            public const string Digits = "Độ chính xác";
            public const string Apply = "Áp dụng quy tắc làm tròn";
            public const string ConfirmTitle = "Áp dụng quy tắc làm tròn?";
            public const string ConfirmBody = "Add-in cập nhật công thức Thành tiền của mọi bảng báo giá, đơn giá công tác trên sheet phân tích và các khoản tổng hợp theo quy tắc mới. Ô có công thức bị sửa tay được giữ nguyên. Đơn giá đã ghi trong bảng báo giá không tự đổi: chạy Kiểm tra để cập nhật. Thao tác không hoàn tác được bằng Ctrl+Z.";

            public static readonly IReadOnlyDictionary<RoundingLevel, string> Levels = new Dictionary<RoundingLevel, string>
            {
                [RoundingLevel.UnitPrice] = "Đơn giá phân tích (sheet Phân tích đơn giá)",
                [RoundingLevel.Amount] = "Thành tiền từng dòng báo giá",
                [RoundingLevel.Adjustment] = "Khoản chiết khấu, phụ phí, thuế",
            };

            public static readonly IReadOnlyDictionary<RoundingLevel, string> LevelHints = new Dictionary<RoundingLevel, string>
            {
                [RoundingLevel.UnitPrice] = "Đơn giá nhập trực tiếp hoặc lấy từ thư viện không bị làm tròn.",
                [RoundingLevel.Amount] = "Thành tiền = làm tròn(Khối lượng × Đơn giá). Tổng là tổng các Thành tiền đã làm tròn.",
                [RoundingLevel.Adjustment] = "Mỗi khoản được làm tròn trước khi cộng dồn.",
            };

            public static readonly IReadOnlyList<KeyValuePair<RoundingMode, string>> Modes = new[]
            {
                new KeyValuePair<RoundingMode, string>(RoundingMode.None, "Không làm tròn"),
                new KeyValuePair<RoundingMode, string>(RoundingMode.Round, "Gần nhất, 0,5 ra xa số 0 (ROUND)"),
                new KeyValuePair<RoundingMode, string>(RoundingMode.RoundUp, "Luôn ra xa số 0 (ROUNDUP)"),
                new KeyValuePair<RoundingMode, string>(RoundingMode.RoundDown, "Luôn về phía số 0 (ROUNDDOWN)"),
            };

            public static readonly IReadOnlyList<KeyValuePair<int, string>> DigitOptions = new[]
            {
                new KeyValuePair<int, string>(-6, "Hàng triệu"),
                new KeyValuePair<int, string>(-3, "Hàng nghìn"),
                new KeyValuePair<int, string>(-2, "Hàng trăm"),
                new KeyValuePair<int, string>(-1, "Hàng chục"),
                new KeyValuePair<int, string>(0, "Hàng đơn vị (0 chữ số thập phân)"),
                new KeyValuePair<int, string>(1, "1 chữ số thập phân"),
                new KeyValuePair<int, string>(2, "2 chữ số thập phân"),
                new KeyValuePair<int, string>(3, "3 chữ số thập phân"),
                new KeyValuePair<int, string>(4, "4 chữ số thập phân"),
            };

            public static string Applied(int updated, int kept) => $"Đã áp dụng: cập nhật {updated} ô công thức{(kept > 0 ? $"; giữ nguyên {kept} ô có công thức bị sửa tay" : "")}. Hãy chạy Kiểm tra nếu có đơn giá phân tích.";
            public static string Current(string text) => $"Hiện tại: {text}.";
        }

        internal static class TermsText
        {
            public const string Title = "Ghi chú và điều khoản";
            public const string Intro = "Chọn mục cần có và tự nhập nội dung: add-in không soạn sẵn điều khoản nào. Khu vực được ghi ngay dưới bảng báo giá (hoặc dưới bảng tổng hợp), nhãn ở cột đầu, nội dung ở cột Nội dung công việc. Mục để trống không được ghi.";
            public const string None = "Bảng này chưa có khu vực ghi chú và điều khoản.";
            public const string Apply = "Ghi khu vực ghi chú";
            public const string Remove = "Xóa khu vực ghi chú";
            public const string ConfirmTitle = "Ghi khu vực ghi chú và điều khoản?";
            public const string RemoveTitle = "Xóa khu vực ghi chú và điều khoản?";
            public const string RemoveBody = "Xóa nội dung khu vực ghi chú và điều khoản của bảng này. Không hoàn tác được bằng Ctrl+Z.";
            public const string Written = "Đã ghi khu vực ghi chú và điều khoản.";
            public const string Removed = "Đã xóa khu vực ghi chú và điều khoản.";
            public const string Nothing = "Chưa có mục nào có nội dung.";
            public const string ChangedOnSheet = "Khu vực ghi chú trên sheet vừa được sửa sau khi tải. Add-in chưa ghi gì và đã tải lại nội dung mới nhất; hãy xem lại rồi bấm Ghi.";
            public const string TooLong = "Nội dung quá dài (tối đa 32.000 ký tự).";

            public static string Existing(string address) => $"Đang có khu vực ghi chú tại {address} (nội dung bên dưới đọc từ sheet).";
            public static string Clipped(IEnumerable<string> labels) => $"Đã ghi, nhưng mục {string.Join(", ", labels)} dài quá chiều cao hàng tối đa của Excel: chữ vẫn đủ trong ô nhưng phần cuối không hiện và không in được. Hãy rút ngắn hoặc tách bớt ra mục khác.";
            public static string ConfirmBody(string address, int n) => $"Ghi {n} mục tại {address}. Vùng này đã được kiểm tra là trống (hoặc là khu vực cũ của add-in).";

            public static string Blocked(AreaCheck check)
            {
                switch (check.Block)
                {
                    case AreaBlock.TableMissing:
                        return "Không tìm thấy bảng báo giá (có thể vừa bị xóa hoặc đổi tên). Bấm Làm mới.";
                    case AreaBlock.Protected:
                        return "Sheet đang được bảo vệ. Bỏ bảo vệ (Review › Unprotect Sheet) rồi thử lại.";
                    default:
                        return $"Vùng cần cho khu vực ghi chú đang có dữ liệu ({string.Join(", ", check.Sample)}). Add-in không ghi đè: hãy di chuyển dữ liệu đó rồi thử lại.";
                }
            }
        }

        internal static class PrintText
        {
            public const string Title = "Thiết lập trang in";
            public const string Intro = "Add-in đặt vùng in, khổ giấy và co giãn cho sheet báo giá. Xem trước, in và xuất PDF dùng chức năng có sẵn của Excel.";
            public const string Protected = "Sheet đang được bảo vệ: không đặt được thiết lập in. Bỏ bảo vệ (Review › Unprotect Sheet) rồi quay lại thẻ này.";
            public const string Orientation = "Hướng giấy";
            public const string Portrait = "Dọc";
            public const string Landscape = "Ngang";
            public const string Paper = "Khổ giấy";
            public const string Fit = "Co giãn";
            public const string FitWidth = "Vừa chiều ngang 1 trang (khuyên dùng cho bảng dài)";
            public const string FitPage = "Thu cả báo giá vào 1 trang";
            public const string FitNone = "Không co giãn (100%)";
            public const string RepeatHeader = "Lặp dòng tiêu đề bảng trên mỗi trang";
            public const string PageNumbers = "Đánh số trang ở chân trang (\"Trang x / y\")";
            public const string Center = "Căn giữa theo chiều ngang";
            public const string Wrap = "Xuống dòng cho cột Nội dung công việc và Ghi chú (tránh bị cắt chữ khi in)";
            public const string Apply = "Áp dụng thiết lập in";
            public const string ConfirmTitle = "Áp dụng thiết lập trang in?";
            public const string GuideTitle = "Xem trước, in và xuất PDF trong Excel";
            public const string NoPrinterHint = "Excel cần có một máy in mặc định để đọc thiết lập trang in (ví dụ Microsoft Print to PDF).";

            public static readonly IReadOnlyList<string> Guide = new[]
            {
                "Xem trước và in: File › Print (Ctrl+P). Kiểm tra ngắt trang ở khung xem trước bên phải.",
                "Xuất PDF: File › Export › Create PDF/XPS, hoặc File › Save As và chọn loại PDF.",
                "Chỉnh ngắt trang: View › Page Break Preview, kéo đường ngắt màu xanh.",
                "Khi co giãn để vừa trang, Excel có thể ngắt chữ khác màn hình làm dòng cuối của ô bị cắt: kiểm tra bản xem trước và kéo cao dòng đó nếu cần.",
            };

            public static string Area(string area, string sheet) => $"Vùng báo giá sẽ in: {area} trên sheet \"{sheet}\".";
            public static string ConfirmBody(string area, string old) => $"Đặt vùng in {area}{(old != "" && old != area ? $" (thay vùng in hiện có {old})" : "")} cùng các thiết lập đã chọn cho sheet này.";
            public static string Applied(string area) => $"Đã đặt thiết lập in, vùng in {area}. Xem trước bằng File › Print (Ctrl+P).";

            public static string CurrentText(PrintCurrent c)
            {
                const string none = "chưa đặt";
                var fit = c.Scale != null ? $"{c.Scale}%" : c.FitWide != null ? $"vừa {c.FitWide} trang ngang{(c.FitTall != null ? $", {c.FitTall} trang dọc" : "")}" : none;
                var paper = c.Paper != null ? c.Paper.ToString() : c.PaperCode != null ? $"mã {c.PaperCode}" : none;
                var orientation = c.Orientation == PageOrientationKind.Landscape ? Landscape : c.Orientation == PageOrientationKind.Portrait ? Portrait : none;
                return $"Hiện có trên sheet: vùng in {(c.PrintArea != "" ? c.PrintArea : none)}; dòng lặp lại {(c.TitleRows != "" ? c.TitleRows : none)}; hướng giấy {orientation}; khổ giấy {paper}; co giãn {fit}; chân trang {(c.Footer != "" ? c.Footer : none)}.";
            }
        }

        internal static class Items
        {
            public const string Title = "Công tác trong báo giá";
            public const string Intro = "Mỗi dòng có trạng thái tính toán, đơn giá theo vật liệu, nhân công, máy, khác và nguồn gốc (thư viện, định mức, giá). Số liệu đọc lại từ sheet mỗi lần tải.";
            public const string Recalc = "Tính lại và lưu";
            public const string Complete = "Đánh dấu hoàn tất";
            public const string Reopen = "Mở lại để sửa";
            public const string CompleteBlocked = "Chưa hoàn tất được:";
            public const string Completed = "Đã đánh dấu báo giá hoàn tất.";
            public const string Reopened = "Báo giá đã về trạng thái nháp.";
            public const string Changed = "Bảng báo giá hoặc hồ sơ vừa thay đổi so với lúc bạn xem. Add-in không ghi gì; đã tải lại để bạn xem lại.";
            public const string PendingLead = "Lần lưu tới sẽ: ";
            public const string ColumnsTitle = "Bảng chưa có cột quản lý theo dòng";
            public const string ColumnsAdd = "Bổ sung cột quản lý theo dòng";
            public const string ColumnsConfirmTitle = "Thêm cột vào bảng báo giá?";
            public const string ColumnsProtected = "Sheet đang được bảo vệ; bỏ bảo vệ sheet rồi thử lại.";
            public const string ColRow = "Hàng";
            public const string ColCode = "Mã";
            public const string ColDescription = "Nội dung";
            public const string ColGroup = "Nhóm";
            public const string ColMethod = "Phương pháp";
            public const string ColQuantity = "Khối lượng";
            public const string ColUnitPrice = "Đơn giá";
            public const string ColAmount = "Thành tiền";
            public const string ColStatus = "Trạng thái";
            public const string SummaryTotal = "Tổng thành tiền (ô tổng của bảng)";
            public const string SummaryComputed = "Tổng các dòng tính được (add-in cộng)";
            public const string Mismatch = "Hai số tổng khác nhau: có dòng chưa tính được, hoặc ô tổng bị sửa.";
            public const string Groups = "Theo nhóm công tác";
            public const string NoGroup = "(Chưa ghi nhóm)";
            public const string Rounding = "Quy tắc làm tròn";
            public const string TableIssues = "Vấn đề của dòng tổng và bảng tổng hợp";
            public const string FilterLabel = "Hiện";
            public const string FilterAll = "Tất cả";
            public const string FilterInvalid = "Lỗi";
            public const string FilterWarnings = "Có cảnh báo";
            public const string Search = "Tìm theo mã, nội dung, nhóm (không cần gõ dấu)";
            public const string Empty = "Bảng chưa có dòng công tác nào.";
            public const string NoneMatch = "Không có dòng nào khớp bộ lọc.";
            public const string MoneyLine = "Khối lượng × Đơn giá = Thành tiền";
            public const string BreakdownLine = "Đơn giá vật liệu / nhân công / máy / khác";
            public const string Missing = "(trống)";
            public const string GoTo = "Đi tới dòng";
            public const string IssuesTitle = "Lỗi và cảnh báo";
            public const string NoIssues = "Không có vấn đề.";
            public const string Source = "Nguồn";
            public const string NoRecordItem = "Dòng chưa có trong hồ sơ.";
            public const string Components = "Thành phần hao phí (snapshot trong hồ sơ)";
            public const string ChangedSinceLast = "Khác lần tính đã lưu trước đó (dữ liệu trên sheet đã đổi).";
            public const string Update = "Cập nhật theo thư viện";
            public const string UpdateTitle = "Cập nhật theo thư viện?";
            public const string Confirm = "Cập nhật";
            public const string LibraryUnavailable = "Không đọc được thư viện trên máy này; phần so với thư viện bị bỏ qua.";

            public static readonly IReadOnlyDictionary<QuotationState, string> States = new Dictionary<QuotationState, string>
            {
                [QuotationState.NoRecord] = "Chưa có hồ sơ",
                [QuotationState.Draft] = "Nháp",
                [QuotationState.Completed] = "Đã hoàn tất",
                [QuotationState.ModifiedAfterCompletion] = "Đã sửa sau khi hoàn tất",
                [QuotationState.Unreadable] = "Hồ sơ không đọc được",
            };

            public static readonly IReadOnlyDictionary<QuotationState, string> StateHints = new Dictionary<QuotationState, string>
            {
                [QuotationState.NoRecord] = "Bấm Tính lại và lưu để tạo hồ sơ (lưu trong workbook, đi cùng file).",
                [QuotationState.Draft] = "Đang soạn. Sửa trên sheet hoặc qua add-in, rồi bấm Tính lại và lưu.",
                [QuotationState.Completed] = "Nội dung đang khớp với lúc hoàn tất.",
                [QuotationState.ModifiedAfterCompletion] = "Bảng đã bị sửa sau khi hoàn tất. Kiểm tra lại rồi hoàn tất lại, hoặc Tính lại và lưu để về nháp.",
                [QuotationState.Unreadable] = "",
            };

            public static readonly IReadOnlyDictionary<CalculationStatus, string> LineStatus = new Dictionary<CalculationStatus, string>
            {
                [CalculationStatus.Valid] = "Hợp lệ",
                [CalculationStatus.ValidWithWarnings] = "Có cảnh báo",
                [CalculationStatus.Invalid] = "Lỗi",
            };

            public static readonly IReadOnlyDictionary<QuotationPricingMethod, string> Methods = new Dictionary<QuotationPricingMethod, string>
            {
                [QuotationPricingMethod.Manual] = "Nhập trực tiếp",
                [QuotationPricingMethod.Library] = "Từ thư viện",
                [QuotationPricingMethod.Norm] = "Phân tích định mức",
            };

            public static string CompletedAt(string at) => $"Hoàn tất lúc {at}.";

            public static string Pending(int ids, int breakdown, int removed) => string.Join(", ", new[]
            {
                ids > 0 ? $"gán Mã dòng cho {ids} dòng" : "",
                breakdown > 0 ? $"ghi đơn giá thành phần {breakdown} dòng" : "",
                removed > 0 ? $"bỏ {removed} mục hồ sơ của dòng đã xóa" : "",
            }.Where(s => s != ""));

            public static string RecalcDone(RecalcSummary s) => string.Join(" ", new[]
            {
                "Đã lưu kết quả tính vào hồ sơ.",
                s.Assigned > 0 ? $"Gán mã {s.Assigned} dòng." : "",
                s.Copied > 0 ? $"{s.Copied} dòng sao chép nhận mã mới." : "",
                s.Removed > 0 ? $"Bỏ {s.Removed} mục của dòng đã xóa." : "",
                s.BreakdownWritten > 0 ? $"Ghi đơn giá thành phần {s.BreakdownWritten} dòng." : "",
                s.CompletionCleared ? "Nội dung đã khác lúc hoàn tất nên báo giá về nháp." : "",
            }.Where(t => t != ""));

            public static string ColumnsBody(IEnumerable<string> missing) => $"Bảng tạo trước bản 1.11.0 thiếu các cột: {string.Join(", ", missing)}. Không có cột Mã dòng thì không theo dõi được từng dòng khi bạn chèn, xóa, sắp xếp hay sao chép.";
            public static string ColumnsConfirmBody(IReadOnlyCollection<string> missing) => $"Add-in thêm {missing.Count} cột vào bên phải bảng: {string.Join(", ", missing)}. Cột Mã dòng được ẩn nếu cột đó của sheet không có dữ liệu khác. Dữ liệu hiện có không đổi.";
            public static string ColumnsBlockedRight(int count, IEnumerable<string> sample) => $"Có {count} ô có dữ liệu ngay bên phải bảng ({string.Join(", ", sample)}); thêm cột sẽ đẩy chúng lệch hàng. Hãy dời các ô đó rồi thử lại.";
            public static string ColumnsAdded(IEnumerable<string> headers) => $"Đã thêm cột: {string.Join(", ", headers)}.";
            public static string Counts(int valid, int warnings, int invalid) => $"{valid} hợp lệ · {warnings} có cảnh báo · {invalid} lỗi";
            public static string TotalError(string error) => $"Ô tổng đang lỗi {error}";
            public static string GroupLine(int lines, int uncomputed) => uncomputed > 0 ? $"{lines} dòng, {uncomputed} chưa tính được" : $"{lines} dòng";
            public static string SourceNorm(string code, string version) => $"định mức {code} v{version}";
            public static string ComponentLine(string applied, string unit, string price, string amount) => $"{applied} {unit} × {price} = {amount}";
            public static string ComponentSnapshot(string baseValue, string waste, string price) => $"Lúc chèn: hao phí cơ sở {baseValue}{(waste != "" ? $", hao hụt {waste}%" : "")}, giá {price}";
            public static string UpdateLibrary(string oldPrice, string newPrice) => $"Ghi đơn giá {newPrice} (thay {oldPrice}) vào ô Đơn giá của dòng này.";
            public static string UpdateNorm(IEnumerable<string> lines) => $"Ghi giá mới lên sheet phân tích: {string.Join("; ", lines)}. Khối phân tích dùng chung cho mọi dòng cùng mã công tác; đơn giá của các dòng đó cũng được cập nhật.";
            public static string Updated(LibraryUpdateSummary s) => $"Đã cập nhật {s.AnalysisCells} giá nguồn trên sheet phân tích và {s.UnitPriceCells} ô đơn giá ({s.AffectedLines} dòng dùng chung khối phân tích).{(s.CompletionCleared ? " Nội dung đã khác lúc hoàn tất nên báo giá về nháp." : "")}";
            public static string UpdatedLibrary(bool completionCleared) => $"Đã cập nhật đơn giá theo thư viện.{(completionCleared ? " Nội dung đã khác lúc hoàn tất nên báo giá về nháp." : "")}";
            public static string RegisterFailed(string reason) => $"Dòng đã được ghi vào bảng, nhưng chưa lưu được vào hồ sơ báo giá ({reason}). Mở thẻ Công tác và bấm Tính lại và lưu.";
        }
    }
}
