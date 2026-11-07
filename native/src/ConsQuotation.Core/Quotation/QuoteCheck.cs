using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Pricing;

namespace ConsQuotation.Core.Quotation
{
    /// <summary>
    /// Một dòng đọc từ sheet. Values: string, double, bool hoặc "" (ô trống), ô lỗi là chữ "#N/A"… Formulas:
    /// chữ công thức hoặc hằng. Types: "Empty", "String", "Double", "Boolean", "Error".
    /// </summary>
    public sealed class SheetRow
    {
        public SheetRow(object?[] values, object?[] formulas, string[] types)
        {
            Values = values;
            Formulas = formulas;
            Types = types;
        }

        public object?[] Values { get; }
        public object?[] Formulas { get; }
        public string[] Types { get; }
    }

    public sealed class TableSnapshot
    {
        public string Name { get; set; } = "";
        public string SheetName { get; set; } = "";
        public List<string> Headers { get; set; } = new List<string>();
        /// <summary>Chỉ số hàng/cột (từ 0) trên sheet của ô dữ liệu đầu tiên.</summary>
        public int FirstRowIndex { get; set; }
        public int FirstColumnIndex { get; set; }
        public List<SheetRow> Rows { get; set; } = new List<SheetRow>();
        /// <summary>Dòng tổng; null nếu bảng không bật dòng tổng.</summary>
        public SheetRow? Totals { get; set; }
    }

    public sealed class AnalysisLine
    {
        public string Code { get; set; } = "";
        public int RowIndex { get; set; }
        public string SheetName { get; set; } = "";
        public bool QuantityBlank { get; set; }
        public bool PriceBlank { get; set; }
        public object? UnitPrice { get; set; }
        public string UnitPriceType { get; set; } = "Empty";
        public string PriceAddress { get; set; } = "";
        public string ResourceCode { get; set; } = "";
        public string ResourceName { get; set; } = "";
        public string ResourceType { get; set; } = "";
        public string ResourceUnit { get; set; } = "";
        public object? Quantity { get; set; }
        public string QuantityType { get; set; } = "Empty";
        public object? Price { get; set; }
        public string PriceType { get; set; } = "Empty";
        public string Source { get; set; } = "";
    }

    public sealed class QuoteSnapshot
    {
        public TableSnapshot Quote { get; set; } = new TableSnapshot();
        public TableSnapshot? Summary { get; set; }
        public List<AnalysisLine>? Analysis { get; set; }
        public RoundingRule AmountRule { get; set; } = Rounding.NoRounding;
    }

    public enum QuoteIssueCode
    {
        CellError,
        Blank,
        NotNumber,
        Negative,
        Zero,
        Abnormal,
        LibraryMissing,
        LibraryDiffers,
        AnalysisMissing,
        AnalysisError,
        AnalysisIncomplete,
        AnalysisDiffers,
    }

    public sealed class QuoteIssue
    {
        public IssueSeverity Severity { get; set; }
        public string SheetName { get; set; } = "";
        /// <summary>Địa chỉ A1 (không kèm tên sheet) để "Đi tới".</summary>
        public string Address { get; set; } = "";
        public string Location { get; set; } = "";
        public string Message { get; set; } = "";
        public string? Hint { get; set; }
        /// <summary>Đề xuất đơn giá theo sheet phân tích; chỉ áp dụng sau khi người dùng xác nhận.</summary>
        public double? FixUnitPrice { get; set; }
        public object? FixPrevious { get; set; }
        /// <summary>Chỉ số dòng dữ liệu của bảng báo giá (từ 0) nếu vấn đề thuộc một dòng công tác.</summary>
        public int? Row { get; set; }
        public QuoteIssueCode? Code { get; set; }
        public QuoteColumnKey? Column { get; set; }
    }

    public enum PriceMethod
    {
        Direct,
        Library,
        Composition,
        Formula,
        Missing,
    }

    public sealed class RowMethod
    {
        public int Row { get; set; }
        public string Location { get; set; } = "";
        public string Address { get; set; } = "";
        public string Code { get; set; } = "";
        public PriceMethod Method { get; set; }
        public string Source { get; set; } = "";
    }

    public sealed class QuoteCheckResult
    {
        public List<QuoteIssue> Issues { get; set; } = new List<QuoteIssue>();
        public List<RowMethod> Methods { get; set; } = new List<RowMethod>();
        public int RowCount { get; set; }
    }

    /// <summary>
    /// Kiểm tra bảng báo giá trên dữ liệu đọc trực tiếp từ sheet, chuyển từ src/domain/pricing/quoteCheck.ts.
    /// Phân biệt trống, 0 và lỗi; chỉ ra đúng ô; không sửa gì, chỉ đề xuất để người dùng xác nhận.
    /// </summary>
    public static class QuoteChecker
    {
        public const double AbnormalUnitPrice = 1e11;
        public const double AbnormalQuantity = 1e7;

        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");
        private static readonly Regex LibraryNote = new Regex(@"^Thư viện:\s*([^;]+)");

        private static readonly Dictionary<string, string> ErrorExplanations = new Dictionary<string, string>
        {
            ["#DIV/0!"] = "chia cho 0",
            ["#VALUE!"] = "sai kiểu dữ liệu (ví dụ chữ trong phép tính)",
            ["#REF!"] = "tham chiếu tới ô/cột đã bị xóa",
            ["#NAME?"] = "sai tên hàm hoặc tên cột",
            ["#N/A"] = "không có giá trị (thiếu số liệu hoặc không tìm thấy)",
            ["#NUM!"] = "số không hợp lệ",
            ["#NULL!"] = "vùng tham chiếu không giao nhau",
            ["#SPILL!"] = "kết quả mảng bị chặn",
            ["#CALC!"] = "lỗi tính toán",
        };

        private static readonly Dictionary<string, string> ErrorHints = new Dictionary<string, string>
        {
            ["#DIV/0!"] = "Kiểm tra ô làm mẫu số trong công thức (đang bằng 0 hoặc trống).",
            ["#VALUE!"] = "Một ô trong phép tính đang là chữ: gõ lại dạng số.",
            ["#REF!"] = "Công thức trỏ tới ô/cột đã bị xóa: gõ lại công thức hoặc khôi phục cột.",
            ["#NAME?"] = "Kiểm tra tên hàm/tên cột trong công thức; không đổi tên các cột của bảng báo giá.",
            ["#N/A"] = "Thiếu số liệu ở nơi công thức tham chiếu (ví dụ giá trị trong phần Tổng hợp hoặc ô tổng).",
        };

        public static string ErrorHint(object? value) => ErrorHints.TryGetValue(Convert.ToString(value, CultureInfo.InvariantCulture) ?? "", out var hint) ? hint : "Sửa công thức tại ô này.";

        public static string ExplainError(object? value)
        {
            var code = Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
            return ErrorExplanations.TryGetValue(code, out var text) ? $"{code}: {text}" : code;
        }

        private static string ShowNumber(object? value)
        {
            if (Sheet.IsBlank(value))
            {
                return "(trống)";
            }
            return value is double d ? d.ToString("#,##0.#########", Vi) : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
        }

        private static bool IsFormula(object? formula) => formula is string s && s.StartsWith("=", StringComparison.Ordinal);

        private static string Upper(string label) => char.ToUpper(label[0], Vi) + label.Substring(1);

        private static string Text(object? value) => value == null ? "" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";

        public static QuoteCheckResult Check(QuoteSnapshot snapshot, LibrarySnapshot? library = null)
        {
            var quote = snapshot.Quote;
            var summary = snapshot.Summary;
            var analysis = snapshot.Analysis;
            var result = new QuoteCheckResult();
            var issues = result.Issues;
            int Index(QuoteColumnKey key) => quote.Headers.IndexOf(QuoteTemplate.HeaderOf(key));

            QuoteIssue At(TableSnapshot table, int r, int c, bool totals = false)
            {
                var row = totals ? table.FirstRowIndex + table.Rows.Count : table.FirstRowIndex + r;
                return new QuoteIssue
                {
                    SheetName = table.SheetName,
                    Address = Sheet.CellAddress(row, table.FirstColumnIndex + c),
                    Location = $"Dòng {row + 1}",
                    Row = table == quote && !totals ? r : (int?)null,
                };
            }

            void Push(IssueSeverity severity, QuoteIssue place, string message, string? hint = null, QuoteIssueCode? code = null, QuoteColumnKey? column = null, double? fix = null, object? previous = null)
            {
                place.Severity = severity;
                place.Message = message;
                place.Hint = hint;
                place.Code = code;
                place.Column = column;
                place.FixUnitPrice = fix;
                place.FixPrevious = previous;
                issues.Add(place);
            }

            // Cột mẫu bị đổi tên/xóa/trùng: không đoán cột nào là khối lượng/đơn giá, báo lỗi chặn rõ ràng.
            var broken = QuoteTemplate.Columns.Where(column => quote.Headers.Count(h => h == column.Header) != 1).ToList();
            if (broken.Count > 0)
            {
                issues.Add(new QuoteIssue
                {
                    Severity = IssueSeverity.Error,
                    SheetName = quote.SheetName,
                    Address = Sheet.CellAddress(Math.Max(0, quote.FirstRowIndex - 1), quote.FirstColumnIndex),
                    Location = $"Dòng {quote.FirstRowIndex}",
                    Message = $"Bảng {quote.Name} đã bị đổi tên, xóa hoặc trùng cột mẫu: {string.Join(", ", broken.Select(c => c.Header))}.",
                    Hint = "Đổi lại đúng tên các cột ở dòng tiêu đề bảng: add-in dựa vào tên cột để biết ô nào là khối lượng, đơn giá, thành tiền.",
                });
                result.RowCount = quote.Rows.Count;
                return result;
            }

            var libraryByCode = new Dictionary<string, WorkItem>();
            foreach (var item in library?.WorkItems ?? new List<WorkItem>())
            {
                libraryByCode[Names.NormalizeCode(item.Code)] = item;
            }
            var expectedAmount = QuoteTemplate.AmountFormula(snapshot.AmountRule);
            var analysisByCode = new Dictionary<string, AnalysisLine>();
            foreach (var line in analysis ?? new List<AnalysisLine>())
            {
                var key = Names.NormalizeCode(line.Code);
                if (!analysisByCode.ContainsKey(key))
                {
                    analysisByCode[key] = line;
                }
            }
            var usedCodes = new HashSet<string>();

            int cCode = Index(QuoteColumnKey.Code), cDescription = Index(QuoteColumnKey.Description), cUnit = Index(QuoteColumnKey.Unit),
                cQuantity = Index(QuoteColumnKey.Quantity), cUnitPrice = Index(QuoteColumnKey.UnitPrice), cAmount = Index(QuoteColumnKey.Amount), cNotes = Index(QuoteColumnKey.Notes);

            for (var r = 0; r < quote.Rows.Count; r++)
            {
                var row = quote.Rows[r];
                object? Value(int col) => row.Values[col];
                if (new[] { cCode, cDescription, cQuantity, cUnitPrice, cNotes }.All(col => Sheet.IsBlank(Value(col))))
                {
                    continue;
                }
                result.RowCount++;
                var code = Text(Value(cCode)).Trim();
                var notes = Text(Value(cNotes));

                // Lỗi công thức ở bất kỳ cột nào.
                for (var col = 0; col < row.Types.Length; col++)
                {
                    if (row.Types[col] == "Error")
                    {
                        Push(IssueSeverity.Error, At(quote, r, col), $"{quote.Headers[col]}: lỗi {ExplainError(row.Values[col])}.", ErrorHint(row.Values[col]), QuoteIssueCode.CellError);
                    }
                }

                if (Sheet.IsBlank(Value(cDescription)))
                {
                    Push(IssueSeverity.Warning, At(quote, r, cDescription), "Thiếu nội dung công việc.", "Nhập nội dung công việc để báo giá rõ ràng.");
                }
                if (Sheet.IsBlank(Value(cUnit)) && !Sheet.IsBlank(Value(cQuantity)))
                {
                    Push(IssueSeverity.Warning, At(quote, r, cUnit), "Thiếu đơn vị tính.", "Nhập đơn vị tính (ví dụ m3, m2, công) để khối lượng có nghĩa.");
                }

                foreach (var (key, col, label) in new[] { (QuoteColumnKey.Quantity, cQuantity, "khối lượng"), (QuoteColumnKey.UnitPrice, cUnitPrice, "đơn giá") })
                {
                    if (row.Types[col] == "Error")
                    {
                        continue;
                    }
                    var v = Value(col);
                    if (Sheet.IsBlank(v))
                    {
                        Push(IssueSeverity.Warning, At(quote, r, col), $"Thiếu {label}: Thành tiền để trống và không được cộng vào tổng.",
                            "Nhập số vào ô này; khi chưa có số liệu thì tổng báo giá chưa đầy đủ.", QuoteIssueCode.Blank, key);
                    }
                    else if (!(v is double number))
                    {
                        Push(IssueSeverity.Error, At(quote, r, col), $"{Upper(label)} \"{Text(v)}\" không phải số (có thể bị gõ dạng chữ, ví dụ 1.500.000).",
                            "Gõ lại dạng số: chỉ chữ số và tối đa một dấu thập phân, không dùng dấu phân cách hàng nghìn.", QuoteIssueCode.NotNumber, key);
                    }
                    else if (number < 0)
                    {
                        Push(IssueSeverity.Error, At(quote, r, col), $"{Upper(label)} âm.",
                            "Nhập giá trị không âm; khoản giảm trừ hãy đưa vào phần Tổng hợp (tab Tính giá).", QuoteIssueCode.Negative, key);
                    }
                    else if (number == 0)
                    {
                        Push(IssueSeverity.Warning, At(quote, r, col), $"{Upper(label)} bằng 0 (khác với để trống): kiểm tra lại.",
                            "Nếu chưa có số liệu, hãy để trống thay vì nhập 0.", QuoteIssueCode.Zero, key);
                    }
                    else if (number >= (key == QuoteColumnKey.UnitPrice ? AbnormalUnitPrice : AbnormalQuantity))
                    {
                        Push(IssueSeverity.Warning, At(quote, r, col), $"{Upper(label)} {ShowNumber(v)} lớn bất thường.",
                            "Kiểm tra lại số chữ số và đơn vị tính (ví dụ nhập nhầm đồng thành nghìn đồng).", QuoteIssueCode.Abnormal, key);
                    }
                }

                // Thành tiền phải là công thức của mẫu (theo quy tắc làm tròn hiện tại).
                var amountFormula = row.Formulas[cAmount];
                const string copyHint = "Sao chép ô Thành tiền của một dòng khác xuống ô này để lấy lại công thức.";
                if (!IsFormula(amountFormula))
                {
                    Push(IssueSeverity.Warning, At(quote, r, cAmount),
                        Sheet.IsBlank(amountFormula) ? "Thành tiền không có công thức." : "Thành tiền bị gõ đè bằng số, không còn tự tính theo khối lượng × đơn giá.", copyHint);
                }
                else if (!FormulaText.Same(amountFormula, expectedAmount, quote.Name))
                {
                    Push(IssueSeverity.Warning, At(quote, r, cAmount), "Công thức Thành tiền khác mẫu (bị sửa tay, hoặc chưa theo quy tắc làm tròn hiện tại).",
                        "Nếu không cố ý sửa: bấm Áp dụng quy tắc làm tròn (tab Tính giá) để ghi lại công thức mẫu, hoặc sao chép từ dòng khác.");
                }

                // Phương pháp và nguồn đơn giá.
                PriceMethod method;
                if (notes.StartsWith(Composition.NotePrefix, StringComparison.Ordinal))
                {
                    method = PriceMethod.Composition;
                }
                else if (IsFormula(row.Formulas[cUnitPrice]))
                {
                    method = PriceMethod.Formula;
                }
                else if (Sheet.IsBlank(Value(cUnitPrice)))
                {
                    method = PriceMethod.Missing;
                }
                else if (notes.StartsWith("Thư viện:", StringComparison.Ordinal))
                {
                    method = PriceMethod.Library;
                }
                else
                {
                    method = PriceMethod.Direct;
                }
                var place = At(quote, r, cUnitPrice);
                result.Methods.Add(new RowMethod
                {
                    Row = r,
                    Location = place.Location,
                    Address = place.Address,
                    Code = code,
                    Method = method,
                    Source = method == PriceMethod.Library || method == PriceMethod.Composition ? notes : "",
                });

                if (method == PriceMethod.Library && library != null)
                {
                    var note = LibraryNote.Match(notes);
                    var libCode = note.Success ? note.Groups[1].Value.Trim() : code;
                    if (!libraryByCode.TryGetValue(Names.NormalizeCode(libCode), out var item))
                    {
                        Push(IssueSeverity.Warning, At(quote, r, cUnitPrice), $"Không còn công tác mã \"{libCode}\" trong thư viện trên máy này.",
                            "Báo giá không bị ảnh hưởng (đơn giá là bản sao). Nếu cần truy vết, kiểm tra lại thư viện hoặc khôi phục từ bản sao lưu.", QuoteIssueCode.LibraryMissing);
                    }
                    else if (item.UnitPrice != null && Value(cUnitPrice) is double price && !Sheet.SameNumber(price, item.UnitPrice.Value))
                    {
                        Push(IssueSeverity.Warning, At(quote, r, cUnitPrice), $"Đơn giá {ShowNumber(price)} khác đơn giá hiện tại trong thư viện {ShowNumber((double)item.UnitPrice.Value)}.",
                            "Báo giá giữ đơn giá tại lúc chèn. Nếu muốn dùng giá mới, sửa ô Đơn giá hoặc chèn lại công tác từ thư viện.", QuoteIssueCode.LibraryDiffers);
                    }
                }

                if (method == PriceMethod.Composition)
                {
                    usedCodes.Add(Names.NormalizeCode(code));
                    if (!analysisByCode.TryGetValue(Names.NormalizeCode(code), out var line))
                    {
                        Push(IssueSeverity.Warning, At(quote, r, cUnitPrice), $"Không tìm thấy phân tích cho mã \"{code}\" trên sheet phân tích (có thể đã bị xóa hoặc đổi mã).",
                            "Chèn lại công tác từ thư viện với phương pháp Phân tích, hoặc nhập đơn giá trực tiếp.", QuoteIssueCode.AnalysisMissing);
                    }
                    else if (line.UnitPriceType == "Error")
                    {
                        Push(IssueSeverity.Error, new QuoteIssue { SheetName = line.SheetName, Address = line.PriceAddress, Location = $"Dòng {line.RowIndex + 1}", Row = r },
                            $"Phân tích mã \"{code}\": Đơn giá công tác lỗi {ExplainError(line.UnitPrice)}.",
                            "Sửa ô lỗi trên sheet Phân tích đơn giá (một ô lỗi ở bất kỳ dòng nào làm mọi đơn giá phân tích báo lỗi).", QuoteIssueCode.AnalysisError);
                    }
                    else if (Sheet.IsBlank(line.UnitPrice))
                    {
                        Push(IssueSeverity.Warning, At(quote, r, cUnitPrice), $"Phân tích mã \"{code}\" còn thiếu hao phí hoặc đơn giá nguồn: chưa có đơn giá.",
                            "Nhập hao phí/đơn giá nguồn còn trống trên sheet Phân tích đơn giá, rồi kiểm tra lại để cập nhật.", QuoteIssueCode.AnalysisIncomplete);
                    }
                    else if (line.UnitPrice is double analysed && !(Value(cUnitPrice) is double current && current == analysed))
                    {
                        Push(IssueSeverity.Warning, At(quote, r, cUnitPrice), $"Đơn giá {ShowNumber(Value(cUnitPrice))} khác kết quả phân tích {ShowNumber(analysed)}.",
                            "Bấm Cập nhật đơn giá theo sheet phân tích (cần xác nhận), hoặc sửa tay.", QuoteIssueCode.AnalysisDiffers, fix: analysed, previous: Value(cUnitPrice));
                    }
                }
            }

            // Dòng tổng của bảng báo giá.
            if (quote.Totals == null)
            {
                Push(IssueSeverity.Warning, At(quote, 0, cDescription, true), "Bảng không bật dòng tổng (Table Design › Total Row).", "Chọn một ô trong bảng › Table Design › đánh dấu Total Row.");
            }
            else if (quote.Totals.Types[cAmount] == "Error")
            {
                Push(IssueSeverity.Error, At(quote, 0, cAmount, true), $"Tổng Thành tiền lỗi {ExplainError(quote.Totals.Values[cAmount])}.",
                    "Lỗi ở tổng thường do một dòng có lỗi: sửa các dòng báo lỗi phía trên trước.");
            }
            else if (!FormulaText.Same(quote.Totals.Formulas[cAmount], QuoteTemplate.AmountTotalFormula(quote.Name), quote.Name))
            {
                Push(IssueSeverity.Warning, At(quote, 0, cAmount, true), "Công thức tổng Thành tiền khác mẫu (bị sửa tay).",
                    "Nếu không cố ý sửa: chọn ô tổng › chọn Sum trong danh sách của dòng tổng (Excel ghi lại SUBTOTAL).");
            }

            // Dòng trống (mẫu tạo sẵn) còn lại khi đã có công tác: vẫn được in ra kèm số thứ tự.
            if (result.RowCount > 0)
            {
                var inputColumns = new[] { QuoteColumnKey.Code, QuoteColumnKey.Group, QuoteColumnKey.Description, QuoteColumnKey.Unit, QuoteColumnKey.Quantity, QuoteColumnKey.UnitPrice, QuoteColumnKey.Notes }
                    .Select(Index).Where(col => col >= 0).ToList();
                var blankRows = Enumerable.Range(0, quote.Rows.Count).Where(r => inputColumns.All(col => Sheet.IsBlank(quote.Rows[r].Values[col]))).ToList();
                if (blankRows.Count > 0)
                {
                    var sheetRows = blankRows.Select(r => quote.FirstRowIndex + r + 1).ToList();
                    Push(IssueSeverity.Warning, At(quote, blankRows[0], Math.Max(0, Index(QuoteColumnKey.Stt))),
                        $"Còn {blankRows.Count} dòng trống trong bảng (hàng {string.Join(", ", sheetRows.Take(5))}{(sheetRows.Count > 5 ? "…" : "")}): khi in vẫn hiện số thứ tự.",
                        "Nếu không dùng: chọn các dòng đó › chuột phải › Delete › Table Rows. Khi thêm công tác, add-in ghi vào dòng trống trước.");
                }
            }

            // Dòng phân tích thiếu số liệu của các mã đang dùng.
            foreach (var line in analysis ?? new List<AnalysisLine>())
            {
                if (usedCodes.Contains(Names.NormalizeCode(line.Code)) && (line.QuantityBlank || line.PriceBlank))
                {
                    Push(IssueSeverity.Warning, new QuoteIssue { SheetName = line.SheetName, Address = line.PriceAddress, Location = $"Dòng {line.RowIndex + 1}" },
                        $"Phân tích mã \"{line.Code}\": thiếu {(line.QuantityBlank ? "hao phí" : "đơn giá nguồn")}.",
                        "Nhập số còn trống trên sheet Phân tích đơn giá (nút Đi tới), rồi bấm Kiểm tra lại.");
                }
            }

            if (summary != null)
            {
                CheckSummary(summary, At, Push);
            }
            return result;
        }

        private static void CheckSummary(TableSnapshot summary, Func<TableSnapshot, int, int, bool, QuoteIssue> at,
            Action<IssueSeverity, QuoteIssue, string, string?, QuoteIssueCode?, QuoteColumnKey?, double?, object?> push)
        {
            const string reapply = "Sửa trong tab Tính giá › Tổng hợp rồi bấm Áp dụng: add-in ghi lại bảng tổng hợp và công thức.";
            var cascade = "Thường do tổng bảng báo giá hoặc một khoản phía trên bị lỗi: sửa các lỗi đó trước. Nếu vẫn lỗi: " + reapply;
            int S(string name) => summary.Headers.IndexOf(name);
            void Add(IssueSeverity severity, QuoteIssue place, string message, string hint) => push(severity, place, message, hint, null, null, null, null);
            var kinds = new[] { Adjustments.KindLabel(AdjustmentKind.Deduct), Adjustments.KindLabel(AdjustmentKind.Add) };
            var methods = ((AdjustmentMethod[])Enum.GetValues(typeof(AdjustmentMethod))).Select(Adjustments.MethodLabel).ToList();
            for (var r = 0; r < summary.Rows.Count; r++)
            {
                var row = summary.Rows[r];
                var name = Text(row.Values[S("Khoản mục")]);
                var methodText = Text(row.Values[S("Cách tính")]);
                for (var col = 0; col < row.Types.Length; col++)
                {
                    if (row.Types[col] == "Error")
                    {
                        Add(IssueSeverity.Error, at(summary, r, col, false), $"Tổng hợp \"{name}\", {summary.Headers[col]}: lỗi {ExplainError(row.Values[col])}.", cascade);
                    }
                }
                if (methodText == Adjustments.BaseMethodLabel)
                {
                    continue;
                }
                if (!kinds.Contains(Text(row.Values[S("Loại")])))
                {
                    Add(IssueSeverity.Error, at(summary, r, S("Loại"), false), $"Tổng hợp \"{name}\": Loại phải là {string.Join(" hoặc ", kinds)}.", reapply);
                }
                if (!methods.Contains(methodText))
                {
                    Add(IssueSeverity.Error, at(summary, r, S("Cách tính"), false), $"Tổng hợp \"{name}\": Cách tính không hợp lệ.", reapply);
                }
                var v = row.Values[S("Giá trị")];
                if (Sheet.IsBlank(v))
                {
                    Add(IssueSeverity.Warning, at(summary, r, S("Giá trị"), false), $"Tổng hợp \"{name}\": chưa nhập giá trị, Tổng cộng chưa tính được.", "Nhập giá trị tại cột Giá trị, hoặc trong tab Tính giá › Tổng hợp.");
                }
                else if (!(v is double))
                {
                    Add(IssueSeverity.Error, at(summary, r, S("Giá trị"), false), $"Tổng hợp \"{name}\": giá trị \"{Text(v)}\" không phải số.", "Gõ lại dạng số (ví dụ 8 nghĩa là 8%), không kèm ký hiệu % hay dấu phân cách hàng nghìn.");
                }
                foreach (var header in new[] { "Số tiền", "Lũy kế" })
                {
                    if (!IsFormula(row.Formulas[S(header)]))
                    {
                        Add(IssueSeverity.Warning, at(summary, r, S(header), false), $"Tổng hợp \"{name}\": {header} không còn là công thức.", reapply);
                    }
                }
            }
            if (summary.Totals != null && summary.Totals.Types[S("Số tiền")] == "Error")
            {
                Add(IssueSeverity.Error, at(summary, 0, S("Số tiền"), true), $"Tổng cộng (sau chiết khấu/phụ phí/thuế) lỗi {ExplainError(summary.Totals.Values[S("Số tiền")])}.", cascade);
            }
        }
    }
}
