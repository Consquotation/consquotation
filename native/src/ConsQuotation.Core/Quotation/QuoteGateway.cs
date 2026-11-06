using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ConsQuotation.Core.Pricing;

namespace ConsQuotation.Core.Quotation
{
    /// <summary>Vị trí ghi mẫu: sheet mới (BaseName) hoặc một ô trên sheet có sẵn.</summary>
    public sealed class TemplateTarget
    {
        public string? BaseName { get; set; }
        public string SheetName { get; set; } = "";
        public int RowIndex { get; set; }
        public int ColumnIndex { get; set; }

        public bool IsNewSheet => BaseName != null;
    }

    public sealed class OccupiedCells
    {
        public int Count { get; set; }
        /// <summary>Tối đa vài địa chỉ đầu tiên để hiển thị.</summary>
        public List<string> Sample { get; set; } = new List<string>();
    }

    public enum BlockerKind
    {
        Protected,
        TableOverlap,
        MergedCells,
        OutOfBounds,
        SheetMissing,
        TableMissing,
        HeadersChanged,
        SelectionOutsideTable,
    }

    public sealed class TargetBlocker
    {
        public TargetBlocker(BlockerKind kind, IReadOnlyList<string>? names = null)
        {
            Kind = kind;
            Names = names ?? new string[0];
        }

        public BlockerKind Kind { get; }
        /// <summary>Tên bảng chồng lấn hoặc địa chỉ ô gộp.</summary>
        public IReadOnlyList<string> Names { get; }
    }

    public sealed class TargetInspection
    {
        public TemplateTarget Target { get; set; } = new TemplateTarget();
        public string SheetName { get; set; } = "";
        public string Address { get; set; } = "";
        public OccupiedCells Occupied { get; set; } = new OccupiedCells();
        public List<TargetBlocker> Blockers { get; set; } = new List<TargetBlocker>();
        /// <summary>Vân tay vùng đích lúc kiểm tra, để phát hiện thay đổi trước khi ghi.</summary>
        public string Fingerprint { get; set; } = "";
    }

    public sealed class CreatedQuote
    {
        public string SheetName { get; set; } = "";
        public string TableName { get; set; } = "";
        public string Address { get; set; } = "";
    }

    public sealed class QuoteTableInfo
    {
        public string TableName { get; set; } = "";
        public string SheetName { get; set; } = "";
        public int DataRowCount { get; set; }
        public bool HeadersMatch { get; set; }
        /// <summary>Vùng đang chọn trong Excel nằm trong bảng này.</summary>
        public bool ContainsSelection { get; set; }
        /// <summary>Số hàng trên sheet (từ 1) của hàng cuối vùng chọn nằm trong bảng.</summary>
        public int? SelectedSheetRow { get; set; }
    }

    public sealed class QuoteTableList
    {
        public string WorkbookName { get; set; } = "";
        public List<QuoteTableInfo> Tables { get; set; } = new List<QuoteTableInfo>();
    }

    public sealed class AppendInspection
    {
        public string TableName { get; set; } = "";
        public string SheetName { get; set; } = "";
        /// <summary>Ô có dữ liệu dưới bảng, trong phạm vi cột của bảng: sẽ bị Excel đẩy xuống khi thêm dòng.</summary>
        public OccupiedCells CellsBelow { get; set; } = new OccupiedCells();
        public List<TargetBlocker> Blockers { get; set; } = new List<TargetBlocker>();
        /// <summary>Chỉ số (từ 0, trong phần dữ liệu) mà dòng mới sẽ chiếm; null = cuối bảng.</summary>
        public int? InsertIndex { get; set; }
        /// <summary>Dòng trống sẽ được ghi vào khi thêm 1 dòng; null = chèn dòng mới.</summary>
        public int? FillIndex { get; set; }
        public string Fingerprint { get; set; } = "";
    }

    public sealed class AppendedRows
    {
        public string TableName { get; set; } = "";
        public string SheetName { get; set; } = "";
        public string Address { get; set; } = "";
    }

    public sealed class QuoteInfoRead
    {
        public string SheetName { get; set; } = "";
        public bool SheetProtected { get; set; }
        public List<InfoCell> Cells { get; set; } = new List<InfoCell>();
        /// <summary>Vân tay vùng nhãn/giá trị lúc đọc: khác lúc ghi → dừng.</summary>
        public string Fingerprint { get; set; } = "";
    }

    public enum AnalysisPriceKind
    {
        Value,
        Missing,
        Error,
    }

    /// <summary>Đơn giá công tác do Excel tính trên sheet phân tích.</summary>
    public sealed class AnalysisPrice
    {
        public AnalysisPriceKind Kind { get; set; }
        public double Value { get; set; }
        public string Error { get; set; } = "";
    }

    public sealed class AnalysisWriteResult
    {
        /// <summary>false: mã đã có phân tích, không ghi thêm và dùng đơn giá hiện có.</summary>
        public bool Written { get; set; }
        public string SheetName { get; set; } = "";
        public AnalysisPrice Price { get; set; } = new AnalysisPrice();
    }

    /// <summary>Ghi một ô của dòng báo giá; Expected là giá trị lúc đọc, khác lúc ghi → dừng, không ghi gì.</summary>
    public sealed class LineCellWrite
    {
        public int Row { get; set; }
        public string Header { get; set; } = "";
        /// <summary>"" = xóa ô; string (ghi với tiền tố ' để giữ dạng chữ) hoặc decimal.</summary>
        public object Value { get; set; } = "";
        public object? Expected { get; set; }
    }

    /// <summary>Điều kiện nhận diện dòng (Mã công tác, Nội dung, Mã dòng) phải còn đúng lúc ghi.</summary>
    public sealed class RowGuard
    {
        public int Row { get; set; }
        public Dictionary<string, object?> Expected { get; set; } = new Dictionary<string, object?>();
    }

    public sealed class AnalysisCellWrite
    {
        /// <summary>Chỉ số hàng trên sheet (từ 0).</summary>
        public int RowIndex { get; set; }
        public string Header { get; set; } = "";
        public object Value { get; set; } = "";
        public object? Expected { get; set; }
    }

    public sealed class ExtensionInspection
    {
        public List<string> Missing { get; set; } = new List<string>();
        /// <summary>Ô có dữ liệu ngay bên phải bảng (sẽ bị đẩy sang phải): có thì không thêm.</summary>
        public OccupiedCells CellsRight { get; set; } = new OccupiedCells();
        public bool SheetProtected { get; set; }
    }

    /// <summary>Vùng đích đã thay đổi kể từ lúc kiểm tra: không ghi gì, cần kiểm tra lại.</summary>
    public sealed class TargetChangedException : Exception
    {
        public TargetChangedException() : base("Vùng đích đã thay đổi kể từ lúc kiểm tra.")
        {
        }
    }

    public sealed class RecordChangedException : Exception
    {
        public RecordChangedException() : base("Hồ sơ báo giá trong workbook vừa thay đổi (có thể ở cửa sổ khác).")
        {
        }
    }

    public sealed class RecordUnreadableException : Exception
    {
        public RecordUnreadableException(string message) : base(message)
        {
        }
    }

    /// <summary>
    /// Cổng giữa nghiệp vụ báo giá và Excel (gộp WorkbookGateway, QuotationGateway và phần đọc của
    /// PricingGateway bản web). Bản thật: ExcelQuoteGateway; test dùng bản giả. Mọi địa chỉ là A1 không kèm tên sheet.
    /// </summary>
    public interface IQuoteGateway
    {
        Task<QuoteTableList> ListQuoteTablesAsync();
        Task<TargetInspection> InspectAtSelectionAsync(int rowCount, int columnCount);
        Task<TargetInspection> InspectTargetAsync(TemplateTarget target, int rowCount, int columnCount);
        /// <summary>Ghi mẫu; kiểm tra lại vân tay trong cùng lượt ghi, khác → TargetChangedException.</summary>
        Task<CreatedQuote> WriteTemplateAsync(TemplateTarget target, int initialRows, string expectedFingerprint);
        Task<AppendInspection> InspectAppendAsync(string tableName, bool belowSelection);
        /// <summary>Ghi 1 dòng vào dòng trống FillIndex, hoặc chèn tại InsertIndex (null = cuối bảng). Hàng theo thứ tự QuoteTemplate.Columns.</summary>
        Task<AppendedRows> AppendRowsAsync(string tableName, IReadOnlyList<object[]> rows, string expectedFingerprint, int? insertIndex, int? fillIndex, IReadOnlyList<IReadOnlyDictionary<string, object>> extras);
        Task<QuoteInfoRead> ReadQuoteInfoAsync(string tableName);
        Task WriteQuoteInfoAsync(string tableName, IReadOnlyList<InfoWrite> writes, string expectedFingerprint);
        Task<bool> WasLibraryUsedAsync();
        Task MarkLibraryUsedAsync();
        Task<RoundingConfig> ReadRoundingAsync();
        Task<QuoteSnapshot> ReadQuoteSnapshotAsync(string tableName);
        Task<AnalysisPrice?> FindAnalysisAsync(string code);
        /// <summary>Thêm khối phân tích (tạo sheet nếu chưa có); không ghi nếu mã đã có phân tích.</summary>
        Task<AnalysisWriteResult> WriteAnalysisAsync(string code, IReadOnlyList<object[]> rows);
        Task<RecordRead> ReadRecordAsync(string tableName);
        /// <summary>Lưu hồ sơ; hồ sơ trong workbook khác expectedUpdatedAt → RecordChangedException; không đọc được → RecordUnreadableException.</summary>
        Task SaveRecordAsync(QuotationRecord record, string? expectedUpdatedAt);
        Task WriteLineCellsAsync(string tableName, IReadOnlyList<LineCellWrite> writes, IReadOnlyList<RowGuard> guards);
        Task WriteAnalysisCellsAsync(IReadOnlyList<AnalysisCellWrite> writes);
        Task<ExtensionInspection> InspectExtensionColumnsAsync(string tableName);
        Task<List<string>> AddExtensionColumnsAsync(string tableName);
        /// <summary>Kích hoạt sheet và chọn ô (chỉ điều hướng).</summary>
        Task GoToAsync(string sheetName, string address);
        Task SelectQuoteTableAsync(string tableName);
        /// <summary>Tạo sheet mới, ghi bảng diễn giải định mức, kích hoạt sheet đó. Trả về tên sheet.</summary>
        Task<string> WriteExplanationAsync(ExplanationSheet sheet);
    }
}
