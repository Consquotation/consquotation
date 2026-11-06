using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Pricing;

namespace ConsQuotation.Core.Quotation
{
    public sealed class LineEvaluation
    {
        public QuoteLine Line { get; set; } = new QuoteLine();
        public QuotationItemRecord? Item { get; set; }
        public QuotationPricingMethod Method { get; set; }
        public QuotationPricingResult Result { get; set; } = new QuotationPricingResult();
        /// <summary>Đơn giá theo loại tính từ sheet phân tích (chỉ dòng phân tích định mức).</summary>
        public BreakdownResult? Breakdown { get; set; }
        /// <summary>Giá trị sẽ ghi vào 4 cột đơn giá thành phần khi lưu (null trong bản ghi = xóa ô); null = không ghi.</summary>
        public CostBreakdown? BreakdownWrite { get; set; }
        public LibraryUpdatePlan? Plan { get; set; }
        /// <summary>Kết quả khác lần tính trước đã lưu trong hồ sơ (dữ liệu bị sửa sau lần lưu).</summary>
        public bool ChangedSinceLastCalc { get; set; }
    }

    public sealed class GroupTotal
    {
        public string Group { get; set; } = "";
        public decimal Amount { get; set; }
        public int Lines { get; set; }
        public int Uncomputed { get; set; }
    }

    public sealed class QuotationEvaluation
    {
        public List<LineEvaluation> Lines { get; set; } = new List<LineEvaluation>();
        public Dictionary<CalculationStatus, int> Counts { get; set; } = new Dictionary<CalculationStatus, int>();
        /// <summary>Ô tổng Thành tiền của bảng do Excel tính.</summary>
        public decimal? TotalValue { get; set; }
        public string? TotalError { get; set; }
        public decimal ComputedTotal { get; set; }
        public List<GroupTotal> Groups { get; set; } = new List<GroupTotal>();
        public List<QuoteIssue> TableIssues { get; set; } = new List<QuoteIssue>();
        public string Fingerprint { get; set; } = "";
        public bool HasLineIds { get; set; }
        public bool HasBreakdown { get; set; }
        public List<string> MissingColumns { get; set; } = new List<string>();
        public string RoundingPolicy { get; set; } = "";
    }

    /// <summary>
    /// Đánh giá từng dòng công tác của báo giá, chuyển từ src/domain/quotation/evaluate.ts. invalid: dòng không
    /// tính được thành tiền hợp lệ; validWithWarnings: tính được nhưng có cảnh báo; valid: không có vấn đề.
    /// </summary>
    public static class QuotationEvaluator
    {
        private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

        private static string Plain(decimal value) => DecimalMath.Normalize(value).ToString(CultureInfo.InvariantCulture);

        private static string Upper(string label) => char.ToUpper(label[0], Vi) + label.Substring(1);

        private static ItemIssue? ValueIssue(CellRead cell, bool isQuantity, QuotationPricingMethod method)
        {
            var label = isQuantity ? "khối lượng" : "đơn giá";
            if (cell.Type == "Error")
            {
                return null; // Kiểm tra báo giá đã báo lỗi ô.
            }
            if (Sheet.IsBlank(cell.Value))
            {
                return new ItemIssue
                {
                    Code = isQuantity ? ItemIssueCode.MissingQuantity : ItemIssueCode.MissingUnitPrice,
                    Severity = IssueSeverity.Error,
                    Message = $"Thiếu {label}: dòng chưa tính được thành tiền.",
                    Hint = isQuantity ? "Nhập khối lượng vào bảng báo giá."
                        : method == QuotationPricingMethod.Norm ? "Xem các tài nguyên còn thiếu đơn giá nguồn bên dưới, bổ sung rồi bấm Tính lại."
                        : "Nhập đơn giá, hoặc chèn lại công tác từ thư viện.",
                };
            }
            if (cell.Number == null)
            {
                return new ItemIssue
                {
                    Code = isQuantity ? ItemIssueCode.InvalidQuantity : ItemIssueCode.InvalidUnitPrice,
                    Severity = IssueSeverity.Error,
                    Message = $"{Upper(label)} \"{QuoteLineReader.Text(cell.Value)}\" không phải số.",
                    Hint = "Gõ lại dạng số, không dùng dấu phân cách hàng nghìn.",
                };
            }
            if (cell.Number < 0)
            {
                return new ItemIssue
                {
                    Code = isQuantity ? ItemIssueCode.NegativeQuantity : ItemIssueCode.NegativeUnitPrice,
                    Severity = IssueSeverity.Error,
                    Message = $"{Upper(label)} âm.",
                    Hint = "Nhập giá trị không âm; khoản giảm trừ đưa vào phần Tổng hợp (tab Tính giá).",
                };
            }
            return null;
        }

        private static bool CellEquals(CellRead cell, decimal? written) =>
            written == null ? Sheet.IsBlank(cell.Value) : cell.Number == written;

        public static QuotationEvaluation Evaluate(QuoteSnapshot snapshot, QuotationRecord? record, QuoteCheckResult check, RoundingRule? unitPriceRule, LibrarySnapshot? library, string now)
        {
            var priceRule = unitPriceRule ?? Rounding.NoRounding;
            var amountRule = snapshot.AmountRule;
            var read = QuoteLineReader.Read(snapshot);
            var items = (record?.Items ?? new List<QuotationItemRecord>()).ToDictionary(i => i.Id);
            var roundingPolicy = $"Đơn giá: {Rounding.Describe(priceRule)}; thành tiền: {Rounding.Describe(amountRule)}";
            var amountColumn = snapshot.Quote.Headers.IndexOf(QuoteTemplate.HeaderOf(QuoteColumnKey.Amount));
            var seenIds = new HashSet<string>();
            var lines = new List<LineEvaluation>();

            foreach (var line in read.Lines)
            {
                var duplicate = line.LineId != null && !seenIds.Add(line.LineId);
                var item = line.LineId != null && !duplicate && items.TryGetValue(line.LineId, out var found) ? found : null;
                var method = item?.PricingMethod ?? Reconciler.InferMethod(line.Notes);
                var issues = new List<ItemIssue>();
                var rowIssues = check.Issues.Where(i => i.Row == line.Row).ToList();
                var amountAddress = Sheet.CellAddress(snapshot.Quote.FirstRowIndex + line.Row, snapshot.Quote.FirstColumnIndex + amountColumn);

                foreach (var issue in rowIssues)
                {
                    if ((issue.Code == QuoteIssueCode.Blank || issue.Code == QuoteIssueCode.NotNumber || issue.Code == QuoteIssueCode.Negative) &&
                        (issue.Column == QuoteColumnKey.Quantity || issue.Column == QuoteColumnKey.UnitPrice))
                    {
                        continue;
                    }
                    if (method == QuotationPricingMethod.Norm && (issue.Code == QuoteIssueCode.AnalysisMissing || issue.Code == QuoteIssueCode.AnalysisIncomplete))
                    {
                        continue;
                    }
                    if (item?.LibraryPrice != null && (issue.Code == QuoteIssueCode.LibraryDiffers || issue.Code == QuoteIssueCode.LibraryMissing))
                    {
                        continue;
                    }
                    issues.Add(new ItemIssue { Code = ItemIssueCode.SheetCheck, Severity = issue.Severity, Message = issue.Message, Hint = issue.Hint });
                }

                foreach (var isQuantity in new[] { true, false })
                {
                    var problem = ValueIssue(isQuantity ? line.Quantity : line.UnitPrice, isQuantity, method);
                    if (problem != null)
                    {
                        issues.Add(problem);
                    }
                }

                BreakdownResult? breakdown = null;
                if (method == QuotationPricingMethod.Norm)
                {
                    var rows = LineCalc.RowsFor(snapshot.Analysis ?? new List<AnalysisLine>(), line.Code);
                    breakdown = LineCalc.Breakdown(rows, line.Code, priceRule);
                    issues.AddRange(breakdown.Issues);
                    var excel = rows.FirstOrDefault(r => r.UnitPriceType != "Error" && r.UnitPrice is double);
                    var excelPrice = excel == null ? null : Sheet.ToDecimal(excel.UnitPrice);
                    if (breakdown.UnitPrice != null && excelPrice != null && !LineCalc.SameAmount(breakdown.UnitPrice.Value, excelPrice.Value))
                    {
                        issues.Add(new ItemIssue
                        {
                            Code = ItemIssueCode.AnalysisError,
                            Severity = IssueSeverity.Warning,
                            Message = $"Đơn giá add-in tính ({Plain(breakdown.UnitPrice.Value)}) khác đơn giá Excel tính trên sheet phân tích ({Plain(excelPrice.Value)}).",
                            Hint = "Kiểm tra công thức cột Đơn giá công tác trên sheet phân tích có bị sửa tay không.",
                        });
                    }
                    foreach (var component in item?.Components ?? new List<QuotationComponent>())
                    {
                        if (!string.IsNullOrEmpty(component.PriceId) && component.PriceUnitSnapshot.Trim().ToLower(Vi) != component.UnitSnapshot.Trim().ToLower(Vi))
                        {
                            issues.Add(new ItemIssue
                            {
                                Code = ItemIssueCode.ComponentUnitMismatch,
                                Severity = IssueSeverity.Error,
                                ResourceCode = component.ResourceCodeSnapshot,
                                Message = $"Giá của \"{component.ResourceCodeSnapshot}\" tính theo {component.PriceUnitSnapshot}, khác đơn vị hao phí {component.UnitSnapshot}.",
                                Hint = "Add-in không quy đổi đơn vị. Chọn giá cùng đơn vị với tài nguyên rồi chèn lại.",
                            });
                        }
                    }
                    if (item != null && item.Components.Count == 0)
                    {
                        issues.Add(new ItemIssue
                        {
                            Code = ItemIssueCode.NoTrace,
                            Severity = IssueSeverity.Warning,
                            Message = "Dòng không có dữ liệu truy vết thành phần (id tài nguyên, id giá): không kiểm tra được thay đổi của thư viện.",
                            Hint = "Dữ liệu này chỉ có khi chèn bằng bản có hồ sơ báo giá. Chèn lại công tác nếu cần truy vết.",
                        });
                    }
                }

                // Cột đơn giá thành phần.
                CostBreakdown? breakdownWrite = null;
                if (line.Breakdown != null)
                {
                    var cells = line.Breakdown;
                    var written = item?.WrittenBreakdown;
                    var writtenByAddIn = written != null && QuoteLineReader.CostTypes.All(t => CellEquals(cells[t], written[t]));
                    var allBlank = QuoteLineReader.CostTypes.All(t => Sheet.IsBlank(cells[t].Value));
                    if (method == QuotationPricingMethod.Norm && breakdown?.Totals != null)
                    {
                        var expected = breakdown.Totals;
                        var matches = QuoteLineReader.CostTypes.All(t => cells[t].Number != null && LineCalc.SameAmount(cells[t].Number!.Value, expected[t]!.Value));
                        if (!matches)
                        {
                            if (allBlank || writtenByAddIn)
                            {
                                breakdownWrite = expected.Copy();
                            }
                            else
                            {
                                issues.Add(new ItemIssue
                                {
                                    Code = ItemIssueCode.BreakdownEdited,
                                    Severity = IssueSeverity.Warning,
                                    Message = "Đơn giá thành phần trên bảng đã bị sửa tay, khác kết quả phân tích.",
                                    Hint = "Xóa 4 ô đơn giá thành phần của dòng này rồi bấm Tính lại và lưu để add-in ghi lại.",
                                });
                            }
                        }
                    }
                    else if (method == QuotationPricingMethod.Norm)
                    {
                        if (!allBlank && writtenByAddIn)
                        {
                            // Phân tích chưa đủ số liệu: xóa số cũ do add-in ghi để không hiển thị số đã lỗi thời.
                            breakdownWrite = new CostBreakdown();
                        }
                    }
                    else if (!allBlank)
                    {
                        if (QuoteLineReader.CostTypes.Any(t => cells[t].Number == null && !Sheet.IsBlank(cells[t].Value)))
                        {
                            issues.Add(new ItemIssue
                            {
                                Code = ItemIssueCode.BreakdownMismatch,
                                Severity = IssueSeverity.Warning,
                                Message = "Đơn giá thành phần có ô không phải số.",
                                Hint = "Nhập số hoặc để trống.",
                            });
                        }
                        else if (line.UnitPrice.Number != null)
                        {
                            var sum = DecimalMath.Normalize(QuoteLineReader.CostTypes.Sum(t => cells[t].Number ?? 0m));
                            if (!LineCalc.SameAmount(sum, line.UnitPrice.Number.Value, priceRule))
                            {
                                issues.Add(new ItemIssue
                                {
                                    Code = ItemIssueCode.BreakdownMismatch,
                                    Severity = IssueSeverity.Warning,
                                    Message = $"Tổng đơn giá thành phần ({Plain(sum)}) khác Đơn giá ({Plain(line.UnitPrice.Number.Value)}).",
                                    Hint = "Sửa đơn giá thành phần cho khớp, hoặc để trống nếu không tách được.",
                                });
                            }
                        }
                    }
                }

                // Thành tiền đối chiếu với Khối lượng × Đơn giá.
                var quantity = line.Quantity.Number;
                var unitPrice = line.UnitPrice.Number;
                var amount = line.Amount.Number;
                if (quantity != null && unitPrice != null && quantity >= 0 && unitPrice >= 0 && amount != null && !rowIssues.Any(i => i.Address == amountAddress))
                {
                    try
                    {
                        var expected = LineCalc.LineAmount(quantity.Value, unitPrice.Value, amountRule);
                        if (!LineCalc.SameAmount(amount.Value, expected, amountRule))
                        {
                            issues.Add(new ItemIssue
                            {
                                Code = ItemIssueCode.AmountMismatch,
                                Severity = IssueSeverity.Warning,
                                Message = $"Thành tiền {Plain(amount.Value)} khác Khối lượng × Đơn giá = {Plain(expected)}.",
                                Hint = "Kiểm tra công thức Thành tiền của dòng này.",
                            });
                        }
                    }
                    catch (OverflowException)
                    {
                        // Tích vượt miền decimal: số lớn bất thường đã được Kiểm tra báo giá cảnh báo.
                    }
                }

                LibraryUpdatePlan? plan = null;
                if (item != null && library != null)
                {
                    var drift = LibraryDrift.Check(item, library);
                    issues.AddRange(drift.Issues);
                    plan = drift.Plan;
                }
                if (read.HasLineIds && (line.LineId == null || duplicate))
                {
                    issues.Add(new ItemIssue
                    {
                        Code = ItemIssueCode.NoTrace,
                        Severity = IssueSeverity.Warning,
                        Message = duplicate ? "Mã dòng trùng với một dòng phía trên (dòng được sao chép)." : "Dòng chưa có Mã dòng (gõ trực tiếp trong Excel).",
                        Hint = "Bấm Tính lại và lưu để add-in gán mã và ghi vào hồ sơ báo giá.",
                    });
                }

                var status = issues.Any(i => i.Severity == IssueSeverity.Error) ? CalculationStatus.Invalid
                    : issues.Count > 0 ? CalculationStatus.ValidWithWarnings : CalculationStatus.Valid;
                var valid = status != CalculationStatus.Invalid;
                var totals = valid ? breakdown?.Totals : null;
                var result = new QuotationPricingResult
                {
                    MaterialCost = totals?.Material,
                    LaborCost = totals?.Labor,
                    MachineCost = totals?.Machine,
                    OtherCost = totals?.Other,
                    // Dòng invalid không lưu số (không để số lỗi thời hay số 0 bị hiểu là kết quả hợp lệ).
                    UnitPrice = valid ? unitPrice : null,
                    Quantity = quantity,
                    Amount = valid ? amount : null,
                    RoundingPolicy = roundingPolicy,
                    Status = status,
                    Issues = issues,
                    CalculatedAt = now,
                    CalculationVersion = QuotationXml.CalculationVersion,
                };
                var previous = item?.Result;
                lines.Add(new LineEvaluation
                {
                    Line = line,
                    Item = item,
                    Method = method,
                    Result = result,
                    Breakdown = breakdown,
                    BreakdownWrite = breakdownWrite,
                    Plan = plan,
                    // Chỉ so số liệu trên sheet; trạng thái có thể đổi chỉ vì thư viện đổi.
                    ChangedSinceLastCalc = previous != null && (previous.UnitPrice != result.UnitPrice || previous.Amount != result.Amount || previous.Quantity != result.Quantity),
                });
            }

            var evaluation = new QuotationEvaluation
            {
                Lines = lines,
                Counts = new Dictionary<CalculationStatus, int> { [CalculationStatus.Valid] = 0, [CalculationStatus.ValidWithWarnings] = 0, [CalculationStatus.Invalid] = 0 },
                TableIssues = check.Issues.Where(i => i.Row == null).ToList(),
                Fingerprint = QuoteLineReader.ContentFingerprint(snapshot),
                HasLineIds = read.HasLineIds,
                HasBreakdown = read.HasBreakdown,
                MissingColumns = read.MissingColumns,
                RoundingPolicy = roundingPolicy,
            };
            var order = new List<string>();
            var groups = new Dictionary<string, GroupTotal>();
            var computed = 0m;
            foreach (var l in lines)
            {
                evaluation.Counts[l.Result.Status]++;
                var key = l.Line.Group;
                if (!groups.TryGetValue(key, out var group))
                {
                    group = new GroupTotal { Group = key };
                    groups[key] = group;
                    order.Add(key);
                }
                group.Lines++;
                if (l.Result.Amount == null)
                {
                    group.Uncomputed++;
                }
                else
                {
                    group.Amount += l.Result.Amount.Value;
                    computed += l.Result.Amount.Value;
                }
            }
            evaluation.ComputedTotal = DecimalMath.Normalize(computed);
            evaluation.Groups = order.Select(k => groups[k]).ToList();
            foreach (var group in evaluation.Groups)
            {
                group.Amount = DecimalMath.Normalize(group.Amount);
            }
            var totalsRow = snapshot.Quote.Totals;
            if (totalsRow != null && amountColumn >= 0)
            {
                if (totalsRow.Types[amountColumn] == "Error")
                {
                    evaluation.TotalError = QuoteLineReader.Text(totalsRow.Values[amountColumn]);
                }
                else
                {
                    evaluation.TotalValue = Sheet.ToDecimal(totalsRow.Values[amountColumn]);
                }
            }
            return evaluation;
        }

        /// <summary>Lý do chưa thể đánh dấu hoàn tất; rỗng = hoàn tất được.</summary>
        public static List<string> CompletionBlockers(QuotationEvaluation evaluation)
        {
            var blockers = new List<string>();
            if (!evaluation.HasLineIds)
            {
                blockers.Add("Bảng chưa có cột Mã dòng: bấm Bổ sung cột quản lý theo dòng trước.");
            }
            if (evaluation.Lines.Count == 0)
            {
                blockers.Add("Báo giá chưa có công tác nào.");
            }
            if (evaluation.Counts[CalculationStatus.Invalid] > 0)
            {
                blockers.Add($"{evaluation.Counts[CalculationStatus.Invalid]} dòng chưa tính được (trạng thái lỗi).");
            }
            var tableErrors = evaluation.TableIssues.Count(i => i.Severity == IssueSeverity.Error);
            if (tableErrors > 0)
            {
                blockers.Add($"{tableErrors} lỗi ở dòng tổng hoặc bảng tổng hợp.");
            }
            if (evaluation.TotalError != null)
            {
                blockers.Add($"Ô tổng Thành tiền đang lỗi {evaluation.TotalError}.");
            }
            if (evaluation.Lines.Any(l => l.Line.LineId == null || l.Item == null))
            {
                blockers.Add("Có dòng chưa có trong hồ sơ: bấm Tính lại và lưu trước.");
            }
            return blockers;
        }
    }
}
