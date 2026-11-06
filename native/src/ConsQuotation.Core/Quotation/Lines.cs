using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Pricing;

namespace ConsQuotation.Core.Quotation
{
    public sealed class CellRead
    {
        public CellRead(object? value, string type, object? formula)
        {
            Value = value;
            Type = type;
            Formula = formula;
        }

        public object? Value { get; }
        public string Type { get; }
        public object? Formula { get; }

        public decimal? Number => Type != "Error" ? Sheet.ToDecimal(Value) : null;
    }

    public sealed class QuoteLine
    {
        /// <summary>Chỉ số dòng dữ liệu trong bảng (từ 0).</summary>
        public int Row { get; set; }
        /// <summary>Số hàng trên sheet (từ 1), để hiển thị và "Đi tới".</summary>
        public int SheetRow { get; set; }
        public string? LineId { get; set; }
        public string Code { get; set; } = "";
        public string Group { get; set; } = "";
        public string Description { get; set; } = "";
        public string Unit { get; set; } = "";
        public string Notes { get; set; } = "";
        public CellRead Quantity { get; set; } = new CellRead("", "Empty", "");
        public CellRead UnitPrice { get; set; } = new CellRead("", "Empty", "");
        public CellRead Amount { get; set; } = new CellRead("", "Empty", "");
        /// <summary>null khi bảng không có đủ 4 cột đơn giá thành phần.</summary>
        public Dictionary<ResourceType, CellRead>? Breakdown { get; set; }
    }

    public sealed class QuoteLines
    {
        public List<QuoteLine> Lines { get; set; } = new List<QuoteLine>();
        public bool HasLineIds { get; set; }
        public bool HasBreakdown { get; set; }
        public List<string> MissingColumns { get; set; } = new List<string>();
    }

    /// <summary>
    /// Đọc các dòng công tác từ ảnh chụp bảng, chuyển từ src/domain/quotation/lines.ts. Cột được tìm theo
    /// tên, nên bảng có thêm cột riêng hoặc đổi thứ tự cột vẫn đọc đúng.
    /// </summary>
    public static class QuoteLineReader
    {
        public static readonly ResourceType[] CostTypes = { ResourceType.Material, ResourceType.Labor, ResourceType.Machine, ResourceType.Other };

        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

        private static CellRead Cell(SheetRow row, int index) =>
            index < 0 ? new CellRead("", "Empty", "") : new CellRead(row.Values[index], row.Types[index], row.Formulas[index]);

        public static string Text(object? value) => value == null ? "" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";

        /// <summary>Các dòng có dữ liệu (cùng quy tắc với Kiểm tra báo giá: bỏ qua dòng trống của mẫu).</summary>
        public static QuoteLines Read(QuoteSnapshot snapshot)
        {
            var quote = snapshot.Quote;
            int Col(QuoteColumnKey key) => quote.Headers.IndexOf(QuoteTemplate.HeaderOf(key));
            var idCol = quote.Headers.IndexOf(QuoteTemplate.LineIdHeader);
            var breakdownCols = CostTypes.Select(t => quote.Headers.IndexOf(QuoteTemplate.BreakdownHeader(t))).ToArray();
            var hasBreakdown = breakdownCols.All(i => i >= 0);
            var meaningful = new[] { QuoteColumnKey.Code, QuoteColumnKey.Description, QuoteColumnKey.Quantity, QuoteColumnKey.UnitPrice, QuoteColumnKey.Notes }.Select(Col).ToArray();
            string Field(SheetRow row, QuoteColumnKey key)
            {
                var col = Col(key);
                return col < 0 ? "" : Text(row.Values[col]).Trim();
            }
            var result = new QuoteLines
            {
                HasLineIds = idCol >= 0,
                HasBreakdown = hasBreakdown,
                MissingColumns = QuoteTemplate.MissingExtensionColumns(quote.Headers).Select(c => c.Header).ToList(),
            };
            for (var r = 0; r < quote.Rows.Count; r++)
            {
                var row = quote.Rows[r];
                if (!meaningful.Any(c => c >= 0 && !Sheet.IsBlank(row.Values[c])))
                {
                    continue;
                }
                var id = idCol >= 0 ? Text(row.Values[idCol]).Trim() : "";
                result.Lines.Add(new QuoteLine
                {
                    Row = r,
                    SheetRow = quote.FirstRowIndex + r + 1,
                    LineId = id == "" ? null : id,
                    Code = Field(row, QuoteColumnKey.Code),
                    Group = Field(row, QuoteColumnKey.Group),
                    Description = Field(row, QuoteColumnKey.Description),
                    Unit = Field(row, QuoteColumnKey.Unit),
                    Notes = Col(QuoteColumnKey.Notes) < 0 ? "" : Text(row.Values[Col(QuoteColumnKey.Notes)]),
                    Quantity = Cell(row, Col(QuoteColumnKey.Quantity)),
                    UnitPrice = Cell(row, Col(QuoteColumnKey.UnitPrice)),
                    Amount = Cell(row, Col(QuoteColumnKey.Amount)),
                    Breakdown = hasBreakdown ? CostTypes.Select((t, i) => (t, i)).ToDictionary(x => x.t, x => Cell(row, breakdownCols[x.i])) : null,
                });
            }
            return result;
        }

        /// <summary>Băm djb2 (32 bit) để so nhanh nội dung; không dùng cho bảo mật. Cùng kết quả với bản web.</summary>
        public static string HashText(string text)
        {
            var hash = 5381;
            foreach (var c in text)
            {
                hash = unchecked((hash << 5) + hash + c);
            }
            return unchecked((uint)hash).ToString("x8", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Vân tay nội dung báo giá: giá trị mọi ô của bảng, dòng tổng, các dòng phân tích của các mã đang dùng.
        /// Ghi giá trị theo đúng JSON.stringify của JavaScript để báo giá hoàn tất ở bản web vẫn khớp ở bản này.
        /// </summary>
        public static string ContentFingerprint(QuoteSnapshot snapshot)
        {
            var quote = snapshot.Quote;
            var codeCol = quote.Headers.IndexOf(QuoteTemplate.HeaderOf(QuoteColumnKey.Code));
            var codes = new HashSet<string>(quote.Rows.Select(r => Text(codeCol < 0 ? null : r.Values[codeCol]).Trim().ToLower(Vi)));
            var parts = new List<string> { quote.Name, JsText.Stringify(quote.Headers.Cast<object?>()) };
            parts.AddRange(quote.Rows.Select(r => JsText.Stringify(r.Values)));
            parts.Add(quote.Totals == null ? "null" : JsText.Stringify(quote.Totals.Values));
            foreach (var a in snapshot.Analysis ?? new List<AnalysisLine>())
            {
                if (codes.Contains(a.Code.ToLower(Vi)))
                {
                    parts.Add(JsText.Stringify(new[] { a.Code, a.ResourceCode, a.Quantity, a.Price, a.UnitPrice }));
                }
            }
            return HashText(string.Join("\n", parts));
        }
    }

    /// <summary>Ghi giá trị ô giống JSON.stringify và String(number) của JavaScript.</summary>
    public static class JsText
    {
        public static string Stringify(IEnumerable<object?> values) => "[" + string.Join(",", values.Select(Value)) + "]";

        private static string Value(object? value)
        {
            switch (value)
            {
                case null:
                    return "null";
                case bool b:
                    return b ? "true" : "false";
                case double d:
                    return Number(d);
                case string s:
                    return Quote(s);
                default:
                    return Quote(Convert.ToString(value, CultureInfo.InvariantCulture) ?? "");
            }
        }

        private static string Quote(string text)
        {
            var result = new StringBuilder("\"");
            foreach (var c in text)
            {
                switch (c)
                {
                    case '"':
                        result.Append("\\\"");
                        break;
                    case '\\':
                        result.Append("\\\\");
                        break;
                    case '\b':
                        result.Append("\\b");
                        break;
                    case '\f':
                        result.Append("\\f");
                        break;
                    case '\n':
                        result.Append("\\n");
                        break;
                    case '\r':
                        result.Append("\\r");
                        break;
                    case '\t':
                        result.Append("\\t");
                        break;
                    default:
                        if (c < 0x20)
                        {
                            result.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            result.Append(c);
                        }
                        break;
                }
            }
            return result.Append('"').ToString();
        }

        /// <summary>Dạng ngắn nhất đọc lại đúng số, theo quy tắc Number::toString của ECMAScript.</summary>
        public static string Number(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
            {
                return "null";
            }
            if (value == 0)
            {
                return "0";
            }
            var sign = value < 0 ? "-" : "";
            var abs = Math.Abs(value);
            var scientific = "";
            for (var precision = 1; precision <= 17; precision++)
            {
                scientific = abs.ToString("E" + (precision - 1), CultureInfo.InvariantCulture);
                try
                {
                    if (double.Parse(scientific, CultureInfo.InvariantCulture) == abs)
                    {
                        break;
                    }
                }
                catch (OverflowException)
                {
                    // Số gần giới hạn double, làm tròn ít chữ số thì vượt miền: thử thêm chữ số.
                }
            }
            var e = scientific.IndexOf('E');
            var digits = scientific.Substring(0, e).Replace(".", "").TrimEnd('0');
            digits = digits == "" ? "0" : digits;
            var n = int.Parse(scientific.Substring(e + 1), CultureInfo.InvariantCulture) + 1;
            var k = digits.Length;
            if (k <= n && n <= 21)
            {
                return sign + digits + new string('0', n - k);
            }
            if (0 < n && n <= 21)
            {
                return sign + digits.Substring(0, n) + "." + digits.Substring(n);
            }
            if (-6 < n && n <= 0)
            {
                return sign + "0." + new string('0', -n) + digits;
            }
            var exponent = n - 1;
            var exponentText = (exponent >= 0 ? "+" : "-") + Math.Abs(exponent).ToString(CultureInfo.InvariantCulture);
            return sign + (k == 1 ? digits : digits[0] + "." + digits.Substring(1)) + "e" + exponentText;
        }
    }

    public sealed class IdAssignment
    {
        public int Row { get; set; }
        public string LineId { get; set; } = "";
        public bool Duplicate { get; set; }
    }

    public sealed class ReconcileResult
    {
        public QuotationRecord Record { get; set; } = new QuotationRecord();
        public List<IdAssignment> Assignments { get; set; } = new List<IdAssignment>();
        public int Added { get; set; }
        public int Copied { get; set; }
        public List<string> Removed { get; set; } = new List<string>();
        public bool Changed { get; set; }
    }

    /// <summary>
    /// Đồng bộ hồ sơ với các dòng trên sheet, chuyển từ src/domain/quotation/reconcile.ts. Sheet là nguồn sự
    /// thật: dòng gõ tay chưa có Mã dòng được gán mã mới; dòng sao chép (trùng mã) nhận mã mới và nguồn của
    /// dòng đầu; mục hồ sơ không còn dòng nào trên sheet bị bỏ.
    /// </summary>
    public static class Reconciler
    {
        /// <summary>Phương pháp đơn giá đoán theo ghi chú truy vết mà add-in ghi khi chèn.</summary>
        public static QuotationPricingMethod InferMethod(string notes) =>
            notes.StartsWith(Composition.NotePrefix, StringComparison.Ordinal) ? QuotationPricingMethod.Norm
            : notes.StartsWith("Thư viện:", StringComparison.Ordinal) ? QuotationPricingMethod.Library
            : QuotationPricingMethod.Manual;

        public static QuotationItemRecord ItemFromLine(QuoteLine line, string id, string now) => new QuotationItemRecord
        {
            Id = id,
            PricingMethod = InferMethod(line.Notes),
            WorkCode = line.Code,
            WorkName = line.Description,
            Unit = line.Unit,
            CreatedAt = now,
            UpdatedAt = now,
        };

        public static ReconcileResult Reconcile(IReadOnlyList<QuoteLine> lines, QuotationRecord? current, string tableName, string now, Func<string> makeId)
        {
            var used = new HashSet<string>(lines.Where(l => l.LineId != null).Select(l => l.LineId!));
            used.UnionWith((current?.Items ?? new List<QuotationItemRecord>()).Select(i => i.Id));
            string NewId()
            {
                for (var attempt = 0; attempt < 1000; attempt++)
                {
                    var id = makeId();
                    if (used.Add(id))
                    {
                        return id;
                    }
                }
                throw new InvalidOperationException("Không tạo được Mã dòng mới không trùng.");
            }
            var baseRecord = current ?? QuotationXml.NewRecord(NewId(), tableName, now);
            var byId = baseRecord.Items.ToDictionary(i => i.Id);
            var seen = new HashSet<string>();
            var items = new List<QuotationItemRecord>();
            var result = new ReconcileResult();
            foreach (var line in lines)
            {
                if (line.LineId != null && seen.Add(line.LineId))
                {
                    if (byId.TryGetValue(line.LineId, out var existing))
                    {
                        items.Add(existing);
                    }
                    else
                    {
                        // Mã có trên sheet nhưng không có trong hồ sơ (hồ sơ chưa lưu được, hoặc dòng dán từ workbook khác).
                        items.Add(ItemFromLine(line, line.LineId, now));
                        result.Added++;
                    }
                    continue;
                }
                var id = NewId();
                if (line.LineId != null)
                {
                    if (byId.TryGetValue(line.LineId, out var original))
                    {
                        var copy = Storage.Json.Deserialize<QuotationItemRecord>(Storage.Json.Serialize(original, indented: false))!;
                        copy.Id = id;
                        copy.Result = null;
                        copy.CreatedAt = now;
                        copy.UpdatedAt = now;
                        items.Add(copy);
                    }
                    else
                    {
                        items.Add(ItemFromLine(line, id, now));
                    }
                    result.Assignments.Add(new IdAssignment { Row = line.Row, LineId = id, Duplicate = true });
                    result.Copied++;
                }
                else
                {
                    items.Add(ItemFromLine(line, id, now));
                    result.Assignments.Add(new IdAssignment { Row = line.Row, LineId = id });
                    result.Added++;
                }
            }
            var kept = new HashSet<string>(items.Select(i => i.Id));
            result.Removed = baseRecord.Items.Where(i => !kept.Contains(i.Id)).Select(i => i.Id).ToList();
            result.Changed = current == null || result.Assignments.Count > 0 || result.Removed.Count > 0 || result.Added > 0;
            if (result.Changed)
            {
                var next = baseRecord.Shallow();
                next.Items = items;
                next.UpdatedAt = now;
                result.Record = next;
            }
            else
            {
                result.Record = baseRecord;
            }
            return result;
        }
    }

    public sealed class BreakdownResult
    {
        /// <summary>Đơn giá từng loại; null khi còn thiếu số liệu hoặc lỗi.</summary>
        public CostBreakdown? Totals { get; set; }
        /// <summary>Đơn giá công tác sau quy tắc làm tròn cấp đơn giá; null khi không tính được.</summary>
        public decimal? UnitPrice { get; set; }
        public int ResourceCount { get; set; }
        public List<ItemIssue> Issues { get; set; } = new List<ItemIssue>();
    }

    /// <summary>
    /// Tính đơn giá công tác theo loại tài nguyên từ khối phân tích trên sheet, chuyển từ
    /// src/domain/quotation/calculate.ts. Số học thập phân; không làm tròn từng bước; thiếu số liệu → null,
    /// không 0. Dùng để ghi cột đơn giá thành phần và đối chiếu với kết quả do Excel tính.
    /// </summary>
    public static class LineCalc
    {
        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

        /// <summary>Loại tài nguyên theo nhãn trên sheet; null nếu không nhận ra.</summary>
        public static ResourceType? CostTypeFromLabel(string label)
        {
            var key = label.Trim().ToLower(Vi);
            foreach (var t in QuoteLineReader.CostTypes)
            {
                if (Composition.ResourceTypeText(t).ToLower(Vi) == key)
                {
                    return t;
                }
            }
            return null;
        }

        public static List<AnalysisLine> RowsFor(IEnumerable<AnalysisLine> analysis, string code)
        {
            var key = Names.NormalizeCode(code);
            return analysis.Where(a => Names.NormalizeCode(a.Code) == key).ToList();
        }

        private enum CellState
        {
            Blank,
            Error,
            Text,
            Number,
        }

        private static (CellState State, decimal Value) NumberCell(object? value, string type)
        {
            if (type == "Error")
            {
                return (CellState.Error, 0);
            }
            if (Sheet.IsBlank(value))
            {
                return (CellState.Blank, 0);
            }
            var number = Sheet.ToDecimal(value);
            return number == null ? (CellState.Text, 0m) : (CellState.Number, number.Value);
        }

        public static BreakdownResult Breakdown(IReadOnlyList<AnalysisLine> rows, string code, RoundingRule unitPriceRule)
        {
            var result = new BreakdownResult { ResourceCount = rows.Count };
            if (rows.Count == 0)
            {
                result.Issues.Add(new ItemIssue
                {
                    Code = ItemIssueCode.AnalysisMissing,
                    Severity = IssueSeverity.Error,
                    Message = $"Không có khối phân tích cho mã \"{code}\" trên sheet \"Phân tích đơn giá\".",
                    Hint = "Chèn lại công tác từ thư viện với cách xác định đơn giá Phân tích từ định mức, hoặc nhập đơn giá trực tiếp.",
                });
                return result;
            }
            var sums = QuoteLineReader.CostTypes.ToDictionary(t => t, _ => 0m);
            var complete = true;
            try
            {
                foreach (var row in rows)
                {
                    var label = row.ResourceCode != "" ? row.ResourceCode : $"dòng {row.RowIndex + 1}";
                    var quantity = NumberCell(row.Quantity, row.QuantityType);
                    var price = NumberCell(row.Price, row.PriceType);
                    foreach (var (cell, what) in new[] { (quantity, "hao phí"), (price, "đơn giá nguồn") })
                    {
                        if (cell.State == CellState.Blank)
                        {
                            complete = false;
                            result.Issues.Add(new ItemIssue
                            {
                                Code = ItemIssueCode.AnalysisIncomplete,
                                Severity = IssueSeverity.Error,
                                ResourceCode = row.ResourceCode,
                                Message = $"Tài nguyên \"{label}\" chưa có {what} trên sheet phân tích (dòng {row.RowIndex + 1}).",
                                Hint = what == "đơn giá nguồn"
                                    ? "Thêm giá cho tài nguyên trong thư viện rồi cập nhật, hoặc nhập Đơn giá nguồn trên sheet phân tích."
                                    : "Nhập hao phí trên sheet phân tích.",
                            });
                        }
                        else if (cell.State == CellState.Error || cell.State == CellState.Text)
                        {
                            complete = false;
                            result.Issues.Add(new ItemIssue
                            {
                                Code = ItemIssueCode.AnalysisError,
                                Severity = IssueSeverity.Error,
                                ResourceCode = row.ResourceCode,
                                Message = $"Tài nguyên \"{label}\": {what} trên sheet phân tích {(cell.State == CellState.Error ? "đang lỗi" : "không phải số")} (dòng {row.RowIndex + 1}).",
                                Hint = "Sửa ô này trên sheet Phân tích đơn giá.",
                            });
                        }
                        else if (cell.Value < 0)
                        {
                            complete = false;
                            result.Issues.Add(new ItemIssue
                            {
                                Code = ItemIssueCode.AnalysisError,
                                Severity = IssueSeverity.Error,
                                ResourceCode = row.ResourceCode,
                                Message = $"Tài nguyên \"{label}\": {what} âm (dòng {row.RowIndex + 1}).",
                                Hint = "Nhập giá trị không âm trên sheet phân tích.",
                            });
                        }
                    }
                    if (quantity.State != CellState.Number || price.State != CellState.Number || quantity.Value < 0 || price.Value < 0)
                    {
                        continue;
                    }
                    var type = CostTypeFromLabel(row.ResourceType);
                    if (type == null)
                    {
                        result.Issues.Add(new ItemIssue
                        {
                            Code = ItemIssueCode.AnalysisError,
                            Severity = IssueSeverity.Warning,
                            ResourceCode = row.ResourceCode,
                            Message = $"Tài nguyên \"{label}\" có loại \"{row.ResourceType}\" không nhận ra; tính vào đơn giá khác.",
                            Hint = "Ghi cột Loại là Vật liệu, Nhân công, Máy thi công hoặc Khác.",
                        });
                        type = ResourceType.Other;
                    }
                    sums[type.Value] += quantity.Value * price.Value;
                }
                if (!complete)
                {
                    return result;
                }
                var rounded = Rounding.Apply(sums.Values.Sum(), unitPriceRule);
                if (DecimalMath.IntegerDigits(rounded) <= NormCalc.MaxIntegerDigits)
                {
                    result.Totals = new CostBreakdown();
                    foreach (var t in QuoteLineReader.CostTypes)
                    {
                        result.Totals[t] = DecimalMath.Normalize(sums[t]);
                    }
                    result.UnitPrice = DecimalMath.Normalize(rounded);
                    return result;
                }
            }
            catch (OverflowException)
            {
                // Tích vượt miền decimal: báo như vượt 15 chữ số.
            }
            result.Issues.Add(new ItemIssue
            {
                Code = ItemIssueCode.Overflow,
                Severity = IssueSeverity.Error,
                Message = "Đơn giá vượt quá 15 chữ số, giới hạn chính xác của Excel.",
                Hint = "Kiểm tra lại hao phí và đơn giá nguồn trên sheet phân tích.",
            });
            return result;
        }

        /// <summary>Thành tiền = Khối lượng × Đơn giá, làm tròn một lần theo quy tắc cấp thành tiền.</summary>
        public static decimal LineAmount(decimal quantity, decimal unitPrice, RoundingRule amountRule) =>
            DecimalMath.Normalize(Rounding.Apply(quantity * unitPrice, amountRule));

        /// <summary>
        /// Hai số coi là bằng nhau: lệch không quá nửa bước làm tròn đang dùng (nếu có) hoặc 1e-9 tương đối (sai
        /// số biểu diễn số thực của Excel).
        /// </summary>
        public static bool SameAmount(decimal a, decimal b, RoundingRule? rule = null)
        {
            var scale = Math.Max(1m, Math.Max(Math.Abs(a), Math.Abs(b)));
            decimal tolerance;
            if (rule != null && rule.Mode != RoundingMode.None)
            {
                tolerance = 1m;
                for (var i = 0; i < Math.Abs(rule.Digits); i++)
                {
                    tolerance = rule.Digits > 0 ? tolerance / 10m : tolerance * 10m;
                }
            }
            else
            {
                tolerance = 1e-9m * scale;
            }
            return Math.Abs(a - b) <= tolerance;
        }
    }

    public sealed class ComponentPriceUpdate
    {
        public int ComponentIndex { get; set; }
        public string ResourceCode { get; set; } = "";
        public string PriceId { get; set; } = "";
        public decimal? OldPrice { get; set; }
        public decimal NewPrice { get; set; }
        public string Currency { get; set; } = "";
        public string PriceUnit { get; set; } = "";
        public string Source { get; set; } = "";
    }

    /// <summary>Cập nhật theo thư viện: Prices != null là dòng phân tích định mức, ngược lại là dòng lấy từ thư viện.</summary>
    public sealed class LibraryUpdatePlan
    {
        public List<ComponentPriceUpdate>? Prices { get; set; }
        public string WorkItemId { get; set; } = "";
        public decimal OldPrice { get; set; }
        public decimal NewPrice { get; set; }
        public string Currency { get; set; } = "";
    }

    public sealed class DriftResult
    {
        public List<ItemIssue> Issues { get; } = new List<ItemIssue>();
        public LibraryUpdatePlan? Plan { get; set; }
    }

    /// <summary>
    /// So snapshot của dòng báo giá với thư viện hiện tại, chuyển từ src/domain/quotation/drift.ts. Chỉ báo và
    /// lập kế hoạch; báo giá không đổi cho tới khi người dùng chủ động bấm cập nhật.
    /// </summary>
    public static class LibraryDrift
    {
        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

        private static string Money(decimal value) => value.ToString("#,##0.#########", Vi);

        private static ItemIssue Warn(ItemIssueCode code, string message, string hint, string? resource = null) => new ItemIssue
        {
            Code = code,
            Severity = IssueSeverity.Warning,
            Message = message,
            Hint = hint,
            ResourceCode = resource,
        };

        public static DriftResult Check(QuotationItemRecord item, LibrarySnapshot library)
        {
            var result = new DriftResult();
            if (item.PricingMethod == QuotationPricingMethod.Library && item.LibraryPrice != null)
            {
                var snapshot = item.LibraryPrice;
                var workItem = library.WorkItems.FirstOrDefault(w => w.Id == snapshot.WorkItemId);
                if (workItem == null)
                {
                    result.Issues.Add(Warn(ItemIssueCode.LibraryMissing, $"Công tác \"{item.WorkCode}\" không còn trong thư viện trên máy này.",
                        "Báo giá giữ đơn giá đã chèn. Kiểm tra lại thư viện nếu cần truy vết."));
                    return result;
                }
                if (workItem.UnitPrice != null && workItem.UnitPrice != snapshot.UnitPrice)
                {
                    var sameCurrency = workItem.Currency.Trim() == snapshot.Currency.Trim();
                    result.Issues.Add(Warn(ItemIssueCode.LibraryPriceChanged, $"Đơn giá trong thư viện đã đổi: {Money(snapshot.UnitPrice)} → {Money(workItem.UnitPrice.Value)} {workItem.Currency}.",
                        sameCurrency ? "Báo giá vẫn giữ giá lúc chèn. Bấm Cập nhật theo thư viện nếu muốn dùng giá mới." : "Tiền tệ đã đổi; add-in không quy đổi. Sửa tay nếu cần."));
                    if (sameCurrency)
                    {
                        result.Plan = new LibraryUpdatePlan { WorkItemId = workItem.Id, OldPrice = snapshot.UnitPrice, NewPrice = workItem.UnitPrice.Value, Currency = workItem.Currency };
                    }
                }
                return result;
            }

            if (item.PricingMethod != QuotationPricingMethod.Norm || item.Components.Count == 0)
            {
                return result;
            }
            var source = item.Source;
            if (!string.IsNullOrEmpty(source?.NormId))
            {
                var norm = library.Norms.FirstOrDefault(n => n.Id == source!.NormId);
                var approved = library.Norms.FirstOrDefault(n => Names.NormalizeCode(n.Code) == Names.NormalizeCode(source!.NormCode) && n.Status == NormStatus.Approved);
                if (norm == null)
                {
                    result.Issues.Add(Warn(ItemIssueCode.NormVersionChanged, $"Định mức {source!.NormCode} v{source.NormVersion} không còn trong thư viện.", "Báo giá giữ hao phí đã chèn trên sheet phân tích."));
                }
                else if (norm.Status == NormStatus.Inactive && approved == null)
                {
                    result.Issues.Add(Warn(ItemIssueCode.NormVersionChanged, $"Định mức {source!.NormCode} v{source.NormVersion} đã chuyển sang Ngừng dùng và chưa có phiên bản đang dùng khác.",
                        "Báo giá giữ hao phí đã chèn. Kiểm tra lại định mức trong thư viện nếu cần."));
                }
                else if (approved != null && approved.Id != norm.Id)
                {
                    result.Issues.Add(Warn(ItemIssueCode.NormVersionChanged, $"Định mức {source!.NormCode} đang dùng phiên bản {approved.Version}; dòng này lập theo phiên bản {source.NormVersion}.",
                        "Hao phí không tự đổi. Muốn dùng phiên bản mới, xóa khối phân tích cũ của mã này rồi chèn lại công tác."));
                }
            }

            var prices = new List<ComponentPriceUpdate>();
            for (var index = 0; index < item.Components.Count; index++)
            {
                var component = item.Components[index];
                var resource = component.ResourceId != null ? library.Resources.FirstOrDefault(r => r.Id == component.ResourceId) : null;
                if (!string.IsNullOrEmpty(component.ResourceId) && resource == null)
                {
                    result.Issues.Add(Warn(ItemIssueCode.LibraryMissing, $"Tài nguyên \"{component.ResourceCodeSnapshot}\" không còn trong thư viện.", "Báo giá giữ đơn giá nguồn đã chèn.", component.ResourceCodeSnapshot));
                    continue;
                }
                if (resource != null && Names.NormalizeCode(resource.Unit) != Names.NormalizeCode(component.UnitSnapshot))
                {
                    result.Issues.Add(Warn(ItemIssueCode.ResourceChanged, $"Đơn vị của tài nguyên \"{resource.Code}\" trong thư viện đã đổi từ \"{component.UnitSnapshot}\" sang \"{resource.Unit}\".",
                        "Add-in không quy đổi đơn vị và không cập nhật giá của tài nguyên này.", component.ResourceCodeSnapshot));
                    continue;
                }
                if (string.IsNullOrEmpty(component.PriceId))
                {
                    continue;
                }
                var price = library.ResourcePrices.FirstOrDefault(p => p.Id == component.PriceId);
                if (price == null)
                {
                    result.Issues.Add(Warn(ItemIssueCode.LibraryMissing, $"Giá đã dùng cho \"{component.ResourceCodeSnapshot}\" không còn trong thư viện.", "Báo giá giữ đơn giá nguồn đã chèn.", component.ResourceCodeSnapshot));
                    continue;
                }
                if (Names.NormalizeCode(price.Unit) != Names.NormalizeCode(component.PriceUnitSnapshot))
                {
                    result.Issues.Add(Warn(ItemIssueCode.ComponentUnitMismatch, $"Giá của \"{component.ResourceCodeSnapshot}\" trong thư viện đã đổi đơn vị từ \"{component.PriceUnitSnapshot}\" sang \"{price.Unit}\".",
                        "Add-in không quy đổi đơn vị; giá này không được cập nhật tự động.", component.ResourceCodeSnapshot));
                    continue;
                }
                if (price.Price != component.UnitPriceSnapshot)
                {
                    var sameCurrency = price.Currency.Trim() == component.Currency.Trim();
                    var old = component.UnitPriceSnapshot == null ? "(trống)" : Money(component.UnitPriceSnapshot.Value);
                    result.Issues.Add(Warn(ItemIssueCode.LibraryPriceChanged, $"Giá \"{component.ResourceCodeSnapshot}\" trong thư viện đã đổi: {old} → {Money(price.Price)} {price.Currency}/{price.Unit}.",
                        sameCurrency ? "Báo giá vẫn giữ giá lúc chèn. Bấm Cập nhật theo thư viện nếu muốn dùng giá mới." : "Tiền tệ đã đổi; add-in không quy đổi.", component.ResourceCodeSnapshot));
                    if (sameCurrency)
                    {
                        prices.Add(new ComponentPriceUpdate
                        {
                            ComponentIndex = index,
                            ResourceCode = component.ResourceCodeSnapshot,
                            PriceId = price.Id,
                            OldPrice = component.UnitPriceSnapshot,
                            NewPrice = price.Price,
                            Currency = price.Currency,
                            PriceUnit = price.Unit,
                            Source = price.Source,
                        });
                    }
                }
            }
            if (prices.Count > 0)
            {
                result.Plan = new LibraryUpdatePlan { Prices = prices };
            }
            return result;
        }
    }

    /// <summary>
    /// Mục hồ sơ cho dòng vừa chèn vào báo giá, chuyển từ src/domain/quotation/fromInsert.ts: chụp lại nguồn gốc
    /// và giá tại lúc chèn để truy vết và phát hiện thư viện đã đổi.
    /// </summary>
    public static class FromInsert
    {
        public sealed class Identity
        {
            public string Id { get; set; } = "";
            public string Code { get; set; } = "";
            public string Name { get; set; } = "";
            public string Unit { get; set; } = "";
            public string Now { get; set; } = "";
        }

        private static QuotationItemRecord Base(Identity input, QuotationPricingMethod method) => new QuotationItemRecord
        {
            Id = input.Id,
            PricingMethod = method,
            WorkCode = input.Code,
            WorkName = input.Name,
            Unit = input.Unit,
            CreatedAt = input.Now,
            UpdatedAt = input.Now,
        };

        public static QuotationItemRecord Manual(Identity input) => Base(input, QuotationPricingMethod.Manual);

        public static QuotationItemRecord FromLibrary(Identity input, WorkItem workItem)
        {
            var item = Base(input, QuotationPricingMethod.Library);
            item.Source = new ItemSource { WorkItemId = workItem.Id };
            item.LibraryPrice = workItem.UnitPrice == null ? null : new LibraryPriceSnapshot { WorkItemId = workItem.Id, UnitPrice = workItem.UnitPrice.Value, Currency = workItem.Currency };
            return item;
        }

        private static readonly int SourceIndex = Analysis.Columns.ToList().FindIndex(c => c.Key == AnalysisColumnKey.Source);

        /// <summary>Dòng phân tích định mức: snapshot từng thành phần kèm id tài nguyên, id giá đã chọn.</summary>
        public static QuotationItemRecord FromNorm(Identity input, WorkItem workItem, IReadOnlyList<CompositionLine> lines, IReadOnlyDictionary<string, string> selection, IReadOnlyList<object[]> analysisRows)
        {
            var item = Base(input, QuotationPricingMethod.Norm);
            var norm = lines.Count > 0 ? lines[0].Norm : null;
            item.Source = new ItemSource { WorkItemId = workItem.Id, NormId = norm?.Id, NormCode = norm?.Code ?? "", NormVersion = norm?.Version ?? "" };
            item.Components = lines.Select((line, index) =>
            {
                var chosen = selection.TryGetValue(line.Component.Id, out var id) ? id : "";
                var option = line.Options.FirstOrDefault(o => o.Price.Id == chosen);
                var source = index < analysisRows.Count ? Convert.ToString(analysisRows[index][SourceIndex], CultureInfo.InvariantCulture) ?? "" : "";
                var component = line.Component;
                return new QuotationComponent
                {
                    ResourceType = line.Resource?.Type ?? component.ResourceTypeSnapshot,
                    ResourceId = component.ResourceId,
                    ResourceCodeSnapshot = line.Resource?.Code ?? component.ResourceCodeSnapshot,
                    ResourceNameSnapshot = line.Resource?.Name ?? component.ResourceNameSnapshot,
                    UnitSnapshot = line.Resource?.Unit ?? component.ResourceUnitSnapshot,
                    BaseConsumption = component.Consumption,
                    WasteRate = line.Consumption == component.Consumption ? 0 : component.WasteRate,
                    AppliedConsumption = line.Consumption,
                    PriceId = option?.Price.Id,
                    UnitPriceSnapshot = option?.Price.Price,
                    PriceUnitSnapshot = option?.Price.Unit ?? "",
                    Currency = option?.Price.Currency ?? "",
                    SourceReference = source.StartsWith("'", StringComparison.Ordinal) ? source.Substring(1) : source,
                };
            }).ToList();
            return item;
        }

        /// <summary>Đơn giá theo loại từ thành phần và giá đã chọn; null khi còn tài nguyên chưa chọn giá.</summary>
        public static CostBreakdown? CompositionBreakdown(IReadOnlyList<CompositionLine> lines, IReadOnlyDictionary<string, string> selection)
        {
            if (lines.Count == 0)
            {
                return null;
            }
            var sums = QuoteLineReader.CostTypes.ToDictionary(t => t, _ => 0m);
            foreach (var line in lines)
            {
                var chosen = selection.TryGetValue(line.Component.Id, out var id) ? id : "";
                var option = line.Options.FirstOrDefault(o => o.Price.Id == chosen);
                if (option == null || line.Resource == null)
                {
                    return null;
                }
                sums[line.Resource.Type] += line.Consumption * option.Price.Price;
            }
            var result = new CostBreakdown();
            foreach (var t in QuoteLineReader.CostTypes)
            {
                result[t] = DecimalMath.Normalize(sums[t]);
            }
            return result;
        }
    }
}
