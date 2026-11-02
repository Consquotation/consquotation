using System.Collections.Generic;
using System.Linq;
using ConsQuotation.Core.Library;

namespace ConsQuotation.Core.Exchange
{
    /// <summary>Bảng nguồn: một sheet Excel hoặc một file CSV.</summary>
    public sealed class SourceTable
    {
        /// <summary>Mô tả nguồn cho báo cáo, ví dụ: Sheet "Công tác" hoặc File "gia.csv".</summary>
        public string Label { get; set; } = "";
        /// <summary>Số thứ tự dòng (tính từ 1) trên sheet/file của Rows[0].</summary>
        public int FirstRowNumber { get; set; } = 1;
        /// <summary>Chỉ số cột (tính từ 0) của cột đầu tiên.</summary>
        public int FirstColumnIndex { get; set; }
        public List<List<RawCell?>> Rows { get; set; } = new List<List<RawCell?>>();

        /// <summary>Bảng từ CSV: mọi ô là chữ.</summary>
        public static SourceTable FromCsv(string label, IEnumerable<IEnumerable<string>> rows) => new SourceTable
        {
            Label = label,
            Rows = rows.Select(r => r.Select(text => (RawCell?)new RawCell(text)).ToList()).ToList(),
        };
    }

    /// <summary>Ảnh chụp tài nguyên của thành phần định mức trong file JSON v3.</summary>
    public sealed class SnapshotMeta
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string Unit { get; set; } = "";
        public ResourceType Type { get; set; } = ResourceType.Other;
    }

    /// <summary>Có ở file sao lưu JSON: giữ id và thời điểm tạo/sửa gốc khi khôi phục.</summary>
    public sealed class ImportMeta
    {
        public string? Id { get; set; }
        public string? CreatedAt { get; set; }
        public string? UpdatedAt { get; set; }
        public SnapshotMeta? Snapshot { get; set; }
        /// <summary>JSON v3: giá áp dụng đã chọn của thành phần định mức (id giá).</summary>
        public string? PriceId { get; set; }
    }

    public sealed class PreError
    {
        public PreError(string? field, string message)
        {
            Field = field;
            Message = message;
        }

        public string? Field { get; }
        public string Message { get; }
    }

    public sealed class ImportRow
    {
        /// <summary>"Dòng 7" (sheet/CSV) hoặc "Bản ghi 3" (JSON).</summary>
        public string RowLabel { get; set; } = "";
        public Dictionary<string, RawCell?> Cells { get; set; } = new Dictionary<string, RawCell?>();
        public ImportMeta? Meta { get; set; }
        /// <summary>Lỗi phát hiện khi đọc nguồn (ví dụ JSON tham chiếu id không có trong file); null = không có.</summary>
        public List<PreError>? PreErrors { get; set; }

        public RawCell? Cell(string key) => Cells.TryGetValue(key, out var cell) ? cell : null;
    }

    public sealed class ImportDataset
    {
        public DatasetKind Kind { get; set; }
        public string SourceLabel { get; set; } = "";
        /// <summary>Trường có cột nguồn. Khi cập nhật bản ghi trùng, chỉ các trường này được thay đổi.</summary>
        public List<string> MappedFields { get; set; } = new List<string>();
        /// <summary>Nhãn cột của từng trường để chỉ ra chỗ lỗi, ví dụ: cột D (Đơn giá).</summary>
        public Dictionary<string, string> ColumnLabels { get; set; } = new Dictionary<string, string>();
        public List<ImportRow> Rows { get; set; } = new List<ImportRow>();
        /// <summary>Lỗi của cả bộ dữ liệu (thiếu cột bắt buộc, quá nhiều dòng…): chặn nhập.</summary>
        public List<string> Problems { get; set; } = new List<string>();
    }

    /// <summary>
    /// Từ bảng nguồn tới bộ dữ liệu nhập (prompts/09), chuyển từ source.ts: nhận diện dòng tiêu đề, đoán
    /// loại dữ liệu, tự map cột theo tên. Người dùng luôn xem và sửa được.
    /// </summary>
    public static class Source
    {
        /// <summary>Số dòng tối đa của một bộ dữ liệu nhập (prompts/17).</summary>
        public const int MaxImportRows = 50_000;
        /// <summary>Từ ngưỡng này hiển thị cảnh báo nhập lâu (ADR-0004).</summary>
        public const int LargeImportRows = 5_000;
        /// <summary>Chỉ tìm dòng tiêu đề trong vài chục dòng đầu.</summary>
        private const int HeaderScanRows = 30;

        public static List<string> HeaderTexts(SourceTable table, int headerIndex) =>
            headerIndex >= 0 && headerIndex < table.Rows.Count
                ? table.Rows[headerIndex].Select(Cells.ParseText).ToList()
                : new List<string>();

        private static double ScoreKind(DatasetKind kind, IReadOnlyList<string> headers)
        {
            var fields = ExchangeSchema.Datasets[kind].Fields;
            var matched = fields.Where(field => headers.Any(h => ExchangeSchema.FieldMatchesHeader(field, h))).ToList();
            var required = fields.Count(field => field.Required);
            var requiredMatched = matched.Count(field => field.Required);
            if (requiredMatched == 0)
            {
                return 0;
            }
            // Ưu tiên loại có đủ cột bắt buộc, sau đó loại khớp nhiều cột hơn.
            return (double)requiredMatched / required * 100 + matched.Count;
        }

        /// <summary>Loại dữ liệu khớp tiêu đề nhất; null nếu không khớp cột bắt buộc nào.</summary>
        public static DatasetKind? GuessKind(IReadOnlyList<string> headers)
        {
            DatasetKind? best = null;
            double bestScore = 0;
            foreach (var kind in ExchangeSchema.Kinds)
            {
                var score = ScoreKind(kind, headers);
                if (score > bestScore)
                {
                    best = kind;
                    bestScore = score;
                }
            }
            return best;
        }

        /// <summary>
        /// Dòng tiêu đề: dòng (trong 30 dòng đầu) khớp nhiều tên cột nhất; không khớp dòng nào thì lấy dòng
        /// đầu tiên có dữ liệu. -1 nếu bảng trống.
        /// </summary>
        public static int DetectHeaderRow(SourceTable table)
        {
            var best = -1;
            double bestScore = 0;
            var firstNonEmpty = -1;
            var limit = System.Math.Min(table.Rows.Count, HeaderScanRows);
            for (var r = 0; r < limit; r++)
            {
                var row = table.Rows[r];
                if (row.All(Cells.IsBlank))
                {
                    continue;
                }
                if (firstNonEmpty < 0)
                {
                    firstNonEmpty = r;
                }
                var headers = row.Select(Cells.ParseText).ToList();
                var score = ExchangeSchema.Kinds.Max(kind => ScoreKind(kind, headers));
                if (score > bestScore)
                {
                    best = r;
                    bestScore = score;
                }
            }
            return best >= 0 ? best : firstNonEmpty;
        }

        /// <summary>Map mỗi trường với cột đầu tiên có tên khớp; mỗi cột dùng cho tối đa một trường.</summary>
        public static Dictionary<string, int?> AutoMap(DatasetKind kind, IReadOnlyList<string> headers)
        {
            var used = new HashSet<int>();
            var mapping = new Dictionary<string, int?>();
            foreach (var field in ExchangeSchema.Datasets[kind].Fields)
            {
                var index = -1;
                for (var i = 0; i < headers.Count; i++)
                {
                    if (!used.Contains(i) && ExchangeSchema.FieldMatchesHeader(field, headers[i]))
                    {
                        index = i;
                        break;
                    }
                }
                mapping[field.Key] = index >= 0 ? index : (int?)null;
                if (index >= 0)
                {
                    used.Add(index);
                }
            }
            return mapping;
        }

        /// <summary>Chỉ số cột (từ 0) → chữ cột Excel: 0 → A, 26 → AA.</summary>
        public static string ColumnToLetters(int index)
        {
            var letters = "";
            for (var n = index + 1; n > 0; n = (n - 1) / 26)
            {
                letters = (char)('A' + (n - 1) % 26) + letters;
            }
            return letters;
        }

        public static string ColumnLabel(SourceTable table, int headerIndex, int column)
        {
            var letter = ColumnToLetters(table.FirstColumnIndex + column);
            var headers = HeaderTexts(table, headerIndex);
            var header = column < headers.Count ? headers[column] : "";
            return header != "" ? $"cột {letter} ({header})" : $"cột {letter}";
        }

        public static ImportDataset DatasetFromTable(SourceTable table, int headerIndex, DatasetKind kind, IReadOnlyDictionary<string, int?> mapping)
        {
            var def = ExchangeSchema.Datasets[kind];
            int? Column(string key) => mapping.TryGetValue(key, out var c) ? c : null;
            var problems = new List<string>();
            var missing = def.Fields.Where(field => field.Required && Column(field.Key) == null).ToList();
            if (missing.Count > 0)
            {
                problems.Add($"Thiếu cột bắt buộc: {string.Join(", ", missing.Select(field => field.Header))}.");
            }
            var columns = mapping.Values.Where(c => c != null).Select(c => c!.Value).ToList();
            if (columns.Distinct().Count() != columns.Count)
            {
                problems.Add("Một cột nguồn đang được map cho nhiều trường.");
            }
            var dataRows = headerIndex < 0 ? new List<List<RawCell?>>() : table.Rows.Skip(headerIndex + 1).ToList();
            if (dataRows.Count > MaxImportRows)
            {
                problems.Add($"Có {dataRows.Count} dòng, vượt giới hạn {MaxImportRows} dòng mỗi lần nhập. Hãy chia nhỏ file.");
            }

            var mappedFields = def.Fields.Where(field => Column(field.Key) != null).Select(field => field.Key).ToList();
            var columnLabels = mappedFields.ToDictionary(key => key, key => ColumnLabel(table, headerIndex, Column(key)!.Value));
            var rows = dataRows.Select((row, i) => new ImportRow
            {
                RowLabel = $"Dòng {table.FirstRowNumber + headerIndex + 1 + i}",
                Cells = mappedFields.ToDictionary(key => key, key =>
                {
                    var c = Column(key)!.Value;
                    return c < row.Count ? row[c] : null;
                }),
            }).ToList();
            return new ImportDataset
            {
                Kind = kind,
                SourceLabel = table.Label,
                MappedFields = mappedFields,
                ColumnLabels = columnLabels,
                Rows = rows,
                Problems = problems,
            };
        }
    }
}
