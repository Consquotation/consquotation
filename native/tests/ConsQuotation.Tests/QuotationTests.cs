using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Quotation;
using Newtonsoft.Json.Linq;
using Xunit;
using static ConsQuotation.Tests.Fixtures;

namespace ConsQuotation.Tests
{
    /// <summary>Workbook giả lập (mô phỏng công thức Excel), chuyển từ tests/unit/quotation.test.ts.</summary>
    internal sealed class FakeQuoteWorkbook : IQuoteGateway
    {
        public sealed class AnalysisSpec
        {
            public string Code = "";
            public string ResourceCode = "";
            public ResourceType Type;
            public object? Quantity;
            public object? Price;
        }

        public List<string> Headers = QuoteTemplate.TemplateColumns.Select(c => c.Header).ToList();
        public List<object?[]> Rows = new List<object?[]>();
        public List<AnalysisSpec> AnalysisRows = new List<AnalysisSpec>();
        public List<string> AnalysisSource = new List<string>();
        public string? Xml;
        public RoundingConfig RoundingRules = Rounding.Default;
        public int Saves;
        public bool FailSave;

        public int Col(string header) => Headers.IndexOf(header);

        public void Add(string code, object? quantity, object? unitPrice, string? id = null, string group = "", string? description = null, string notes = "", object?[]? breakdown = null)
        {
            var row = Headers.Select(_ => (object?)"").ToArray();
            void Set(string h, object? v)
            {
                if (Col(h) >= 0)
                {
                    row[Col(h)] = v;
                }
            }
            Set("Mã công tác", code);
            Set("Nhóm công tác", group);
            Set("Nội dung công việc", description ?? $"Công tác {code}");
            Set("Đơn vị tính", "m3");
            Set("Khối lượng", quantity);
            Set("Đơn giá", unitPrice);
            Set("Ghi chú", notes);
            Set(QuoteTemplate.LineIdHeader, id ?? "");
            var names = new[] { "Đơn giá vật liệu", "Đơn giá nhân công", "Đơn giá máy", "Đơn giá khác" };
            for (var i = 0; i < 4; i++)
            {
                Set(names[i], breakdown?[i] ?? "");
            }
            Rows.Add(row);
        }

        public object? Cell(int row, string header) => Rows[row][Col(header)];

        public void SetCell(int row, string header, object? value)
        {
            Rows[row][Col(header)] = value is string s && s.StartsWith("'") ? s.Substring(1) : value is decimal d ? (double)d : value;
        }

        private object AnalysisUnitPrice(string code)
        {
            var rows = AnalysisRows.Where(a => a.Code == code).ToList();
            if (rows.Any(a => !(a.Quantity is double q && !double.IsInfinity(q)) || !(a.Price is double)))
            {
                return "";
            }
            var sum = rows.Sum(a => (decimal)(double)a.Quantity! * (decimal)(double)a.Price!);
            return (double)Rounding.Apply(sum, RoundingRules.UnitPrice);
        }

        public QuoteSnapshot Snapshot()
        {
            SheetRow Row(object?[] values, object?[]? formulas = null) => new SheetRow(values, formulas ?? values,
                values.Select(v => v is string s && s == "" || v == null ? "Empty" : v is double ? "Double" : "String").ToArray());
            int q = Col("Khối lượng"), p = Col("Đơn giá"), a = Col("Thành tiền"), stt = Col("STT");
            var rows = Rows.Select(r =>
            {
                var values = r.ToArray();
                values[a] = r[q] is double qv && r[p] is double pv ? (double)Rounding.Apply((decimal)qv * (decimal)pv, RoundingRules.Amount) : (object)"";
                var formulas = values.ToArray();
                formulas[a] = QuoteTemplate.AmountFormula(RoundingRules.Amount);
                formulas[stt] = QuoteTemplate.SttFormula("CQ_Quote_1");
                return Row(values, formulas);
            }).ToList();
            var total = rows.Sum(r => r.Values[a] is double d ? d : 0);
            var totalsValues = Headers.Select((_, i) => i == a ? total : i == Col("Nội dung công việc") ? "Tổng cộng" : (object)"").ToArray();
            var totalsFormulas = Headers.Select(h => h == "Thành tiền" ? "=SUBTOTAL(109,[Thành tiền])" : h == "Nội dung công việc" ? "Tổng cộng" : (object)"").ToArray();
            var analysis = AnalysisRows.Select((x, i) =>
            {
                var unitPrice = AnalysisUnitPrice(x.Code);
                return new AnalysisLine
                {
                    Code = x.Code,
                    RowIndex = 4 + i,
                    SheetName = "Phân tích đơn giá",
                    QuantityBlank = Sheet.IsBlank(x.Quantity),
                    PriceBlank = Sheet.IsBlank(x.Price),
                    UnitPrice = unitPrice,
                    UnitPriceType = unitPrice is string ? "Empty" : "Double",
                    PriceAddress = $"I{5 + i}",
                    ResourceCode = x.ResourceCode,
                    ResourceName = $"Tài nguyên {x.ResourceCode}",
                    ResourceType = Composition.ResourceTypeText(x.Type),
                    ResourceUnit = "kg",
                    Quantity = x.Quantity,
                    QuantityType = Sheet.IsBlank(x.Quantity) ? "Empty" : x.Quantity is double ? "Double" : "String",
                    Price = x.Price,
                    PriceType = Sheet.IsBlank(x.Price) ? "Empty" : x.Price is double ? "Double" : "String",
                    Source = i < AnalysisSource.Count ? AnalysisSource[i] : "",
                };
            }).ToList();
            return new QuoteSnapshot
            {
                Quote = new TableSnapshot
                {
                    Name = "CQ_Quote_1",
                    SheetName = "BG",
                    Headers = Headers,
                    FirstRowIndex = 13,
                    Rows = rows,
                    Totals = new SheetRow(totalsValues, totalsFormulas, totalsValues.Select(v => v is double ? "Double" : "String").ToArray()),
                },
                Analysis = AnalysisRows.Count > 0 ? analysis : null,
                AmountRule = RoundingRules.Amount,
            };
        }

        public Task<QuoteSnapshot> ReadQuoteSnapshotAsync(string tableName) => Task.FromResult(Snapshot());
        public Task<RoundingConfig> ReadRoundingAsync() => Task.FromResult(RoundingRules);

        public Task<RecordRead> ReadRecordAsync(string tableName) => Task.FromResult(Xml == null ? RecordRead.None() : QuotationXml.Decode(Xml));

        public Task SaveRecordAsync(QuotationRecord record, string? expectedUpdatedAt)
        {
            if (FailSave)
            {
                throw new InvalidOperationException("Lưu hồ sơ thất bại (giả lập).");
            }
            var current = Xml == null ? RecordRead.None() : QuotationXml.Decode(Xml);
            if ((current.Kind == RecordReadKind.Ok ? current.Record!.UpdatedAt : null) != expectedUpdatedAt)
            {
                throw new RecordChangedException();
            }
            Xml = QuotationXml.Encode(record);
            Saves++;
            return Task.CompletedTask;
        }

        private static bool Same(object? a, object? b)
        {
            if (Sheet.IsBlank(a))
            {
                return Sheet.IsBlank(b);
            }
            return Equals(a, b is decimal d ? (double)d : b);
        }

        public Task WriteLineCellsAsync(string tableName, IReadOnlyList<LineCellWrite> writes, IReadOnlyList<RowGuard> guards)
        {
            foreach (var w in writes)
            {
                if (!Same(Cell(w.Row, w.Header), w.Expected))
                {
                    throw new TargetChangedException();
                }
            }
            foreach (var g in guards)
            {
                foreach (var pair in g.Expected)
                {
                    if (!Same(Cell(g.Row, pair.Key), pair.Value))
                    {
                        throw new TargetChangedException();
                    }
                }
            }
            foreach (var w in writes)
            {
                SetCell(w.Row, w.Header, w.Value);
            }
            return Task.CompletedTask;
        }

        public Task WriteAnalysisCellsAsync(IReadOnlyList<AnalysisCellWrite> writes)
        {
            foreach (var w in writes)
            {
                var i = w.RowIndex - 4;
                if (w.Header == "Đơn giá nguồn")
                {
                    if (!Same(AnalysisRows[i].Price, w.Expected))
                    {
                        throw new TargetChangedException();
                    }
                    AnalysisRows[i].Price = w.Value is decimal d ? (double)d : w.Value;
                }
                else
                {
                    while (AnalysisSource.Count <= i)
                    {
                        AnalysisSource.Add("");
                    }
                    AnalysisSource[i] = (string)w.Value;
                }
            }
            return Task.CompletedTask;
        }

        public Task<ExtensionInspection> InspectExtensionColumnsAsync(string tableName) => Task.FromResult(new ExtensionInspection
        {
            Missing = QuoteTemplate.MissingExtensionColumns(Headers).Select(c => c.Header).ToList(),
        });

        public Task<List<string>> AddExtensionColumnsAsync(string tableName)
        {
            var missing = QuoteTemplate.MissingExtensionColumns(Headers).Select(c => c.Header).ToList();
            Headers.AddRange(missing);
            Rows = Rows.Select(r => r.Concat(missing.Select(_ => (object?)"")).ToArray()).ToList();
            return Task.FromResult(missing);
        }

        // Phần dưới chỉ dùng cho test giao diện (QuoteUiTests).
        public bool TableListed;
        public List<QuoteTableInfo>? TableInfos;
        public OccupiedCells Below = new OccupiedCells();
        public OccupiedCells Occupied = new OccupiedCells();
        public bool ChangedOnAppend;
        public bool ChangedOnInfo;
        public bool LibraryMarked;
        public int TemplatesWritten;
        public AnalysisPrice? ExistingAnalysis;
        public List<InfoWrite> InfoWrites = new List<InfoWrite>();
        private readonly Dictionary<InfoKey, object?> info = new Dictionary<InfoKey, object?>();

        public Task<QuoteTableList> ListQuoteTablesAsync()
        {
            var tables = TableInfos ?? (TableListed
                ? new List<QuoteTableInfo> { new QuoteTableInfo { TableName = "CQ_Quote_1", SheetName = "BG", DataRowCount = Rows.Count, HeadersMatch = true } }
                : new List<QuoteTableInfo>());
            return Task.FromResult(new QuoteTableList { WorkbookName = "Book1.xlsx", Tables = tables });
        }

        private TargetInspection Inspection(TemplateTarget target) => new TargetInspection { Target = target, SheetName = "Sheet1", Address = "A1:N19", Occupied = Occupied, Fingerprint = "fp" };
        public Task<TargetInspection> InspectAtSelectionAsync(int rowCount, int columnCount) => Task.FromResult(Inspection(new TemplateTarget { SheetName = "Sheet1" }));
        public Task<TargetInspection> InspectTargetAsync(TemplateTarget target, int rowCount, int columnCount) => Task.FromResult(Inspection(target));

        public Task<CreatedQuote> WriteTemplateAsync(TemplateTarget target, int initialRows, string expectedFingerprint)
        {
            TemplatesWritten++;
            TableListed = true;
            return Task.FromResult(new CreatedQuote { SheetName = "Sheet1", TableName = "CQ_Quote_1", Address = "A1:N19" });
        }

        public Task<AppendInspection> InspectAppendAsync(string tableName, bool belowSelection) =>
            Task.FromResult(new AppendInspection { TableName = tableName, SheetName = "BG", CellsBelow = Below, Fingerprint = "fp" });

        public Task<AppendedRows> AppendRowsAsync(string tableName, IReadOnlyList<object[]> rows, string expectedFingerprint, int? insertIndex, int? fillIndex, IReadOnlyList<IReadOnlyDictionary<string, object>> extras)
        {
            if (ChangedOnAppend)
            {
                throw new TargetChangedException();
            }
            for (var r = 0; r < rows.Count; r++)
            {
                var aligned = QuoteTemplate.AlignRow(Headers, rows[r], extras[r])!;
                Rows.Add(aligned.Select(cell => cell is decimal d ? (double)d : cell is string s && s.StartsWith("=") ? "" : cell is string t && t.StartsWith("'") ? t.Substring(1) : cell ?? "").ToArray());
            }
            return Task.FromResult(new AppendedRows { TableName = tableName, SheetName = "BG", Address = "A14:N14" });
        }

        public Task<QuoteInfoRead> ReadQuoteInfoAsync(string tableName) => Task.FromResult(new QuoteInfoRead
        {
            SheetName = "BG",
            Fingerprint = "fp",
            Cells = QuoteInfo.Fields.Select((f, i) => new InfoCell
            {
                Key = f.Key,
                Found = true,
                Address = $"D{i + 2}",
                Value = info.TryGetValue(f.Key, out var v) ? v : "",
                NumberFormat = f.IsDate ? QuoteInfo.DateFormat : "General",
            }).ToList(),
        });

        public Task WriteQuoteInfoAsync(string tableName, IReadOnlyList<InfoWrite> writes, string expectedFingerprint)
        {
            if (ChangedOnInfo)
            {
                ChangedOnInfo = false;
                throw new TargetChangedException();
            }
            InfoWrites.AddRange(writes);
            foreach (var w in writes)
            {
                info[w.Key] = w.Kind == InfoWriteKind.Date ? (double)w.Serial : w.Kind == InfoWriteKind.Text ? w.Text : (object)"";
            }
            return Task.CompletedTask;
        }

        public Task<bool> WasLibraryUsedAsync() => Task.FromResult(LibraryMarked);

        public Task MarkLibraryUsedAsync()
        {
            LibraryMarked = true;
            return Task.CompletedTask;
        }

        public Task<AnalysisPrice?> FindAnalysisAsync(string code) => Task.FromResult(ExistingAnalysis);

        public Task<AnalysisWriteResult> WriteAnalysisAsync(string code, IReadOnlyList<object[]> rows)
        {
            if (ExistingAnalysis != null)
            {
                return Task.FromResult(new AnalysisWriteResult { Written = false, SheetName = "Phân tích đơn giá", Price = ExistingAnalysis });
            }
            int At(AnalysisColumnKey key) => Analysis.Columns.ToList().FindIndex(c => c.Key == key);
            string Text(object v) => ((string)v).TrimStart('\'');
            foreach (var r in rows)
            {
                AnalysisRows.Add(new AnalysisSpec
                {
                    Code = Text(r[At(AnalysisColumnKey.Code)]),
                    ResourceCode = Text(r[At(AnalysisColumnKey.ResourceCode)]),
                    Type = LineCalc.CostTypeFromLabel(Text(r[At(AnalysisColumnKey.ResourceType)])) ?? ResourceType.Other,
                    Quantity = r[At(AnalysisColumnKey.Quantity)] is decimal q ? (double)q : (object)"",
                    Price = r[At(AnalysisColumnKey.Price)] is decimal p ? (double)p : (object)"",
                });
            }
            var price = AnalysisUnitPrice(code);
            return Task.FromResult(new AnalysisWriteResult
            {
                Written = true,
                SheetName = "Phân tích đơn giá",
                Price = price is double value ? new AnalysisPrice { Kind = AnalysisPriceKind.Value, Value = value } : new AnalysisPrice { Kind = AnalysisPriceKind.Missing },
            });
        }

        public Task GoToAsync(string sheetName, string address) => Task.CompletedTask;
        public Task SelectQuoteTableAsync(string tableName) => Task.CompletedTask;
        public Task<string> WriteExplanationAsync(ExplanationSheet sheet) => Task.FromResult(sheet.SheetName);

        // N5: làm tròn, tổng hợp, điều khoản, trang in.
        public RoundingConfig? AppliedRounding;
        public SummaryState SummaryOnSheet = new SummaryState();
        public AreaCheck SummaryCheck = new AreaCheck { Address = "D19:I22", Fingerprint = "fs" };
        public bool ChangedOnSummary;
        public int SummaryWrites;
        public bool SummaryRemoved;
        public TermsState TermsOnSheet = new TermsState();
        public AreaCheck TermsCheck = new AreaCheck { Address = "A24:N26", Fingerprint = "ft" };
        public int TermsWrites;
        public List<UnitPriceFix> Fixes = new List<UnitPriceFix>();
        public bool ChangedOnFix;
        public PrintOptions? AppliedPrint;
        public PrintSetupState Print = new PrintSetupState { SheetName = "BG", QuoteArea = "A1:N18", Current = new PrintCurrent { PrintArea = "A1:C3" } };

        public Task<RoundingApplyResult> ApplyRoundingAsync(RoundingConfig config)
        {
            AppliedRounding = config;
            RoundingRules = config;
            return Task.FromResult(new RoundingApplyResult { UpdatedCells = 3, KeptCells = 1 });
        }

        public Task<SummaryState> ReadSummaryAsync(string tableName) => Task.FromResult(SummaryOnSheet);
        public Task<AreaCheck> InspectSummaryAsync(string tableName, int adjustmentCount) => Task.FromResult(SummaryCheck);

        public Task WriteSummaryAsync(string tableName, IReadOnlyList<Adjustment> adjustments, string fingerprint)
        {
            if (ChangedOnSummary)
            {
                throw new TargetChangedException();
            }
            SummaryWrites++;
            SummaryOnSheet = new SummaryState { Exists = true, Adjustments = adjustments.ToList(), Address = "D19:I22" };
            return Task.CompletedTask;
        }

        public Task RemoveSummaryAsync(string tableName)
        {
            SummaryRemoved = true;
            SummaryOnSheet = new SummaryState();
            return Task.CompletedTask;
        }

        public Task<int> SetUnitPricesAsync(IReadOnlyList<UnitPriceFix> fixes)
        {
            if (ChangedOnFix)
            {
                throw new TargetChangedException();
            }
            Fixes.AddRange(fixes);
            return Task.FromResult(fixes.Count);
        }

        public Task<TermsState> ReadTermsAsync(string tableName) => Task.FromResult(TermsOnSheet);
        public Task<AreaCheck> InspectTermsAsync(string tableName, int rowCount) => Task.FromResult(TermsCheck);

        public List<string> TermsClipped = new List<string>();

        public Task<List<string>> WriteTermsAsync(string tableName, IReadOnlyList<TermsSection> sections, string fingerprint)
        {
            TermsWrites++;
            TermsOnSheet = new TermsState { Exists = true, Sections = Terms.ToWrite(sections), Address = "A24:N26" };
            return Task.FromResult(TermsClipped);
        }

        public Task RemoveTermsAsync(string tableName)
        {
            TermsOnSheet = new TermsState();
            return Task.CompletedTask;
        }

        public Task<PrintSetupState> ReadPrintSetupAsync(string tableName) => Task.FromResult(Print);

        public Task<string> ApplyPrintSetupAsync(string tableName, PrintOptions options)
        {
            AppliedPrint = options;
            return Task.FromResult(Print.QuoteArea);
        }
    }

    public class QuotationTests
    {
        private const string NoteNorm = "Phân tích định mức: DM-01; 3 tài nguyên; tiền tệ: VND";
        private const string Q = "CQ_Quote_1";

        private static readonly Resource ResA = Res("rA", ResourceType.Material, "kg", "Vật liệu A", "A");
        private static readonly Resource ResB = Res("rB", ResourceType.Labor, "công", "Nhân công B", "B");
        private static readonly Resource ResC = Res("rC", ResourceType.Machine, "ca", "Máy C", "C");
        private static readonly ResourcePrice[] Prices = { Price("pA", "rA", 10000, "kg"), Price("pB", "rB", 40000, "công"), Price("pC", "rC", 80000, "ca") };
        private static readonly Norm TheNorm = Norm("n1", "DM-01", workItemId: "w1");
        private static readonly WorkItem Work = new WorkItem { Id = "w1", Code = "DM-01", Name = "Công tác thử", Unit = "m3", UnitPrice = 50000, Currency = "VND", CreatedAt = T, UpdatedAt = T };

        private static (FakeQuoteWorkbook Wb, QuotationService Service) Setup(Func<LibrarySnapshot?>? library = null)
        {
            var wb = new FakeQuoteWorkbook();
            var id = 0;
            var clock = new DateTime(2026, 10, 27, 0, 0, 0, DateTimeKind.Utc);
            return (wb, new QuotationService(wb, () => clock = clock.AddSeconds(1), () => $"L{++id}", library ?? (() => null)));
        }

        private static (FakeQuoteWorkbook Wb, QuotationService Service) Setup(LibrarySnapshot library) => Setup(() => library);

        private static void SeedNorm(FakeQuoteWorkbook wb, object? priceA = null, object? quantityA = null)
        {
            wb.AnalysisRows = new List<FakeQuoteWorkbook.AnalysisSpec>
            {
                new FakeQuoteWorkbook.AnalysisSpec { Code = "DM-01", ResourceCode = "A", Type = ResourceType.Material, Quantity = quantityA ?? 2.0, Price = priceA ?? 10000.0 },
                new FakeQuoteWorkbook.AnalysisSpec { Code = "DM-01", ResourceCode = "B", Type = ResourceType.Labor, Quantity = 0.5, Price = 40000.0 },
                new FakeQuoteWorkbook.AnalysisSpec { Code = "DM-01", ResourceCode = "C", Type = ResourceType.Machine, Quantity = 0.25, Price = 80000.0 },
            };
        }

        private static QuotationEvaluation Evaluate(FakeQuoteWorkbook wb, QuotationRecord? record = null, LibrarySnapshot? library = null)
        {
            var snapshot = wb.Snapshot();
            return QuotationEvaluator.Evaluate(snapshot, record, QuoteChecker.Check(snapshot, library), wb.RoundingRules.UnitPrice, library, T);
        }

        private static CompositionLine Line(NormComponent c, Resource resource, ResourcePrice? p, decimal? applied = null) =>
            new CompositionLine(TheNorm, c, applied ?? c.Consumption, resource,
                p == null ? new PriceOption[0] : new[] { new PriceOption(p, Validity.NoDates, p.Unit == resource.Unit, true) }, p?.Id);

        private static LibrarySnapshot Library(IEnumerable<ResourcePrice> prices, IEnumerable<WorkItem>? workItems = null, IEnumerable<Norm>? norms = null)
        {
            var lib = Lib(new[] { ResA, ResB, ResC }, prices, norms ?? new[] { TheNorm });
            lib.WorkItems = (workItems ?? new[] { Work }).ToList();
            return lib;
        }

        private static FromInsert.Identity Who(string id, string code = "DM-01", string name = "Công tác thử", string unit = "m3") =>
            new FromInsert.Identity { Id = id, Code = code, Name = name, Unit = unit, Now = T };

        private static QuotationItemRecord NormItem(string id, decimal wasteA = 0)
        {
            var lines = new[]
            {
                Line(Comp("cA", ResA, 2, wasteA), ResA, Prices[0], wasteA != 0 ? 2 * (1 + wasteA) : 2),
                Line(Comp("cB", ResB, 0.5m), ResB, Prices[1]),
                Line(Comp("cC", ResC, 0.25m), ResC, Prices[2]),
            };
            return FromInsert.FromNorm(Who(id), Work, lines, new Dictionary<string, string> { ["cA"] = "pA", ["cB"] = "pB", ["cC"] = "pC" }, new object[0][]);
        }

        private static QuotationRecord Record(params QuotationItemRecord[] items)
        {
            var record = QuotationXml.NewRecord("Q1", Q, T);
            record.Items = items.ToList();
            return record;
        }

        private static CostBreakdown Breakdown(decimal material, decimal labor, decimal machine, decimal other) =>
            new CostBreakdown { Material = material, Labor = labor, Machine = machine, Other = other };

        private static RoundingConfig WithAmount(RoundingRule rule) => new RoundingConfig(Rounding.NoRounding, rule, Rounding.NoRounding);
        private static RoundingConfig WithUnitPrice(RoundingRule rule) => new RoundingConfig(rule, Rounding.NoRounding, Rounding.NoRounding);

        private static void AssertBreakdown(CostBreakdown? b, decimal material, decimal labor, decimal machine, decimal other)
        {
            Assert.NotNull(b);
            Assert.Equal(new decimal?[] { material, labor, machine, other }, new[] { b!.Material, b.Labor, b.Machine, b.Other });
        }

        [Fact]
        public void Test1_UnitCostByType()
        {
            var wb = new FakeQuoteWorkbook();
            SeedNorm(wb);
            var result = LineCalc.Breakdown(wb.Snapshot().Analysis!, "DM-01", Rounding.NoRounding);
            AssertBreakdown(result.Totals, 20000, 20000, 20000, 0);
            Assert.Equal(60000m, result.UnitPrice);
            Assert.Empty(result.Issues);
        }

        [Fact]
        public void Test2_WasteAppliedAndSnapshot()
        {
            var wb = new FakeQuoteWorkbook();
            SeedNorm(wb, 10000.0, 2.1);
            Assert.Equal(21000m, LineCalc.Breakdown(wb.Snapshot().Analysis!, "DM-01", Rounding.NoRounding).Totals?.Material);
            var c = NormItem("L1", 0.05m).Components[0];
            Assert.Equal(new decimal?[] { 2, 0.05m, 2.1m, 10000 }, new decimal?[] { c.BaseConsumption, c.WasteRate, c.AppliedConsumption, c.UnitPriceSnapshot });
            Assert.Equal("pA", c.PriceId);
            var lines = new[] { Line(Comp("cA", ResA, 2, 0.05m), ResA, Prices[0], 2.1m) };
            AssertBreakdown(FromInsert.CompositionBreakdown(lines, new Dictionary<string, string> { ["cA"] = "pA" }), 21000, 0, 0, 0);
            Assert.Null(FromInsert.CompositionBreakdown(lines, new Dictionary<string, string>()));
        }

        [Fact]
        public void Test3_LineAmount()
        {
            Assert.Equal(600000m, LineCalc.LineAmount(10, 60000, Rounding.NoRounding));
            Assert.Equal(1000.01m, LineCalc.LineAmount(3, 333.335m, new RoundingRule(RoundingMode.Round, 2)));
            var wb = new FakeQuoteWorkbook();
            SeedNorm(wb);
            wb.Add("DM-01", 10.0, 60000.0, "L1", notes: NoteNorm, breakdown: new object?[] { 20000.0, 20000.0, 20000.0, 0.0 });
            var ev = Evaluate(wb, Record(NormItem("L1")), Library(Prices));
            var r = ev.Lines[0].Result;
            Assert.Equal(CalculationStatus.Valid, r.Status);
            Assert.Equal(new decimal?[] { 20000, 20000, 20000, 0, 60000, 10, 600000 }, new[] { r.MaterialCost, r.LaborCost, r.MachineCost, r.OtherCost, r.UnitPrice, r.Quantity, r.Amount });
            Assert.Equal(600000m, ev.TotalValue);
            Assert.Equal(600000m, ev.ComputedTotal);
        }

        [Fact]
        public void Test4_MissingSourcePriceIsInvalidNotZero()
        {
            var wb = new FakeQuoteWorkbook();
            SeedNorm(wb, "");
            wb.Add("DM-01", 10.0, "", "L1", notes: NoteNorm);
            var ev = Evaluate(wb, Record(NormItem("L1")));
            var r = ev.Lines[0].Result;
            Assert.Equal(CalculationStatus.Invalid, r.Status);
            Assert.Null(r.UnitPrice);
            Assert.Null(r.Amount);
            Assert.Null(r.MaterialCost);
            Assert.Contains(r.Issues, i => i.Code == ItemIssueCode.MissingUnitPrice);
            var missing = r.Issues.First(i => i.Code == ItemIssueCode.AnalysisIncomplete);
            Assert.Equal("A", missing.ResourceCode);
            Assert.Contains("\"A\" chưa có đơn giá nguồn", missing.Message);
            Assert.Equal(1, ev.Counts[CalculationStatus.Invalid]);
            Assert.Contains("1 dòng chưa tính được (trạng thái lỗi).", QuotationEvaluator.CompletionBlockers(ev));
        }

        [Fact]
        public void Test5_UnitMismatchIsInvalid()
        {
            var wb = new FakeQuoteWorkbook();
            SeedNorm(wb);
            wb.Add("DM-01", 1.0, 60000.0, "L1", notes: NoteNorm);
            var item = NormItem("L1");
            item.Components[0].PriceUnitSnapshot = "tấn";
            var r = Evaluate(wb, Record(item)).Lines[0].Result;
            Assert.Equal(CalculationStatus.Invalid, r.Status);
            Assert.Equal("Giá của \"A\" tính theo tấn, khác đơn vị hao phí kg.", r.Issues.First(i => i.Code == ItemIssueCode.ComponentUnitMismatch).Message);
        }

        [Fact]
        public async Task Test6_LibraryChange_KeepsSnapshotUntilUserUpdates()
        {
            var lib = Library(new[] { Price("pA", "rA", 12000, "kg"), Prices[1], Prices[2] });
            var (wb, service) = Setup(lib);
            SeedNorm(wb);
            wb.Add("DM-01", 10.0, 60000.0, "L1", notes: NoteNorm, breakdown: new object?[] { 20000.0, 20000.0, 20000.0, 0.0 });
            var written = NormItem("L1");
            written.WrittenBreakdown = Breakdown(20000, 20000, 20000, 0);
            wb.Xml = QuotationXml.Encode(Record(written));

            var view = await service.LoadAsync(Q);
            var line = view.Evaluation.Lines[0];
            Assert.Equal(60000m, line.Result.UnitPrice);
            Assert.Equal(CalculationStatus.ValidWithWarnings, line.Result.Status);
            Assert.Equal("Giá \"A\" trong thư viện đã đổi: 10.000 → 12.000 VND/kg.", line.Result.Issues.First(i => i.Code == ItemIssueCode.LibraryPriceChanged).Message);
            var update = Assert.Single(line.Plan!.Prices!);
            Assert.Equal(("A", 10000m, 12000m), (update.ResourceCode, update.OldPrice!.Value, update.NewPrice));
            Assert.Equal(60000.0, wb.Cell(0, "Đơn giá"));

            var outcome = await service.ApplyLibraryUpdateAsync(Q, "L1", view.Evaluation.Fingerprint);
            Assert.Equal(OutcomeStatus.Done, outcome.Status);
            Assert.Equal((1, 1, 1), (outcome.Value!.AnalysisCells, outcome.Value.UnitPriceCells, outcome.Value.AffectedLines));
            Assert.Equal(12000.0, wb.AnalysisRows[0].Price);
            Assert.Equal(64000.0, wb.Cell(0, "Đơn giá"));
            Assert.Equal(24000.0, wb.Cell(0, "Đơn giá vật liệu"));
            view = await service.LoadAsync(Q);
            var r = view.Evaluation.Lines[0].Result;
            Assert.Equal((CalculationStatus.Valid, 64000m, 640000m), (r.Status, r.UnitPrice!.Value, r.Amount!.Value));
            Assert.Equal(12000m, QuotationXml.Decode(wb.Xml!).Record!.Items[0].Components[0].UnitPriceSnapshot);
        }

        [Fact]
        public async Task Test6_LibraryChangeIsNotSheetChange_UpdateKeepsWasteNote_CompletedBackToDraft()
        {
            var (wb, service) = Setup(Library(Prices));
            SeedNorm(wb, 10000.0, 2.1);
            wb.AnalysisSource = new List<string> { "Thử; VND; hao phí gồm hao hụt 5% (cơ sở 2); định mức DM-01 v1", "", "" };
            wb.Add("DM-01", 1.0, 61000.0, "L1", notes: NoteNorm);
            wb.Xml = QuotationXml.Encode(Record(NormItem("L1", 0.05m)));
            var view = await service.LoadAsync(Q);
            await service.RecalculateAsync(Q, view.Evaluation.Fingerprint);
            view = await service.LoadAsync(Q);
            Assert.Equal(OutcomeStatus.Done, (await service.CompleteAsync(Q, view.Evaluation.Fingerprint)).Status);

            var (changed, changedService) = Setup(Library(new[] { Price("pA", "rA", 11000, "kg"), Prices[1], Prices[2] }));
            changed.Rows = wb.Rows;
            changed.AnalysisRows = wb.AnalysisRows;
            changed.AnalysisSource = wb.AnalysisSource;
            changed.Xml = wb.Xml;
            view = await changedService.LoadAsync(Q);
            Assert.Equal(QuotationState.Completed, view.State);
            Assert.Equal(CalculationStatus.ValidWithWarnings, view.Evaluation.Lines[0].Result.Status);
            Assert.False(view.Evaluation.Lines[0].ChangedSinceLastCalc);

            var outcome = await changedService.ApplyLibraryUpdateAsync(Q, "L1", view.Evaluation.Fingerprint);
            Assert.Equal(OutcomeStatus.Done, outcome.Status);
            Assert.True(outcome.Value!.CompletionCleared);
            Assert.Matches(@"^Thử; VND; hao phí gồm hao hụt 5% \(cơ sở 2\); cập nhật theo thư viện \d\d/10/2026; định mức DM-01 v1$", changed.AnalysisSource[0]);
            Assert.Equal(63100.0, changed.Cell(0, "Đơn giá"));
            Assert.Equal(QuotationState.Draft, (await changedService.LoadAsync(Q)).State);
        }

        [Fact]
        public async Task Test6_LibraryLine_WarnsOnce_UpdatesOnClick()
        {
            var work = Copy(Work);
            work.UnitPrice = 55000;
            var (wb, service) = Setup(Library(Prices, new[] { work }));
            wb.Add("DM-01", 2.0, 50000.0, "L1", notes: "Thư viện: DM-01");
            wb.Xml = QuotationXml.Encode(Record(FromInsert.FromLibrary(Who("L1", name: "x"), Work)));
            var view = await service.LoadAsync(Q);
            var issues = view.Evaluation.Lines[0].Result.Issues;
            Assert.Single(issues, i => i.Code == ItemIssueCode.LibraryPriceChanged);
            Assert.DoesNotContain(issues, i => i.Code == ItemIssueCode.SheetCheck && i.Message.Contains("khác đơn giá hiện tại"));
            Assert.Equal(OutcomeStatus.Done, (await service.ApplyLibraryUpdateAsync(Q, "L1", view.Evaluation.Fingerprint)).Status);
            Assert.Equal(55000.0, wb.Cell(0, "Đơn giá"));
        }

        [Fact]
        public async Task Test7_EditQuantity_AmountChanges_UnitPricesKept()
        {
            var (wb, service) = Setup(Library(Prices));
            SeedNorm(wb);
            wb.Add("DM-01", 10.0, 60000.0, "L1", notes: NoteNorm, breakdown: new object?[] { 20000.0, 20000.0, 20000.0, 0.0 });
            wb.Xml = QuotationXml.Encode(Record(NormItem("L1")));
            var first = await service.LoadAsync(Q);
            Assert.Equal(OutcomeStatus.Done, (await service.RecalculateAsync(Q, first.Evaluation.Fingerprint)).Status);
            wb.SetCell(0, "Khối lượng", 12.5);
            var line = (await service.LoadAsync(Q)).Evaluation.Lines[0];
            var r = line.Result;
            Assert.Equal(new decimal?[] { 12.5m, 60000, 750000, 20000 }, new[] { r.Quantity, r.UnitPrice, r.Amount, r.MaterialCost });
            Assert.Equal(CalculationStatus.Valid, r.Status);
            Assert.True(line.ChangedSinceLastCalc);
            Assert.Null(line.BreakdownWrite);
            Assert.Equal(new object?[] { 10000.0, 40000.0, 80000.0 }, wb.AnalysisRows.Select(a => a.Price).ToArray());
        }

        [Fact]
        public async Task Test8_SaveAndReopen_Consistent()
        {
            var (wb, service) = Setup(Library(Prices));
            SeedNorm(wb);
            wb.Add("DM-01", 10.0, 60000.0, "L1", notes: NoteNorm);
            wb.Add("TC-01", 2.0, 1500.0, description: "Gõ tay");
            Assert.Null(await service.RegisterInsertedLineAsync(Q, NormItem("L1")));
            var before = await service.LoadAsync(Q);
            Assert.Equal((1, 0, 1), (before.PendingAssignIds, before.PendingRemoveItems, before.PendingWriteBreakdown));
            var recalc = await service.RecalculateAsync(Q, before.Evaluation.Fingerprint);
            Assert.Equal(OutcomeStatus.Done, recalc.Status);
            Assert.Equal((1, 0, 0, 1), (recalc.Value!.Assigned, recalc.Value.Copied, recalc.Value.Removed, recalc.Value.BreakdownWritten));
            var reopened = QuotationXml.Decode(wb.Xml!);
            Assert.Equal(RecordReadKind.Ok, reopened.Kind);
            Assert.Equal(QuotationXml.SchemaVersion, reopened.Record!.SchemaVersion);
            var items = reopened.Record.Items;
            Assert.Equal(new[] { QuotationPricingMethod.Norm, QuotationPricingMethod.Manual }, items.Select(i => i.PricingMethod));
            Assert.Equal(new decimal?[] { 600000, 3000 }, items.Select(i => i.Result?.Amount));
            Assert.All(items, i => Assert.Equal(CalculationStatus.Valid, i.Result!.Status));
            Assert.Equal("L1", items[0].Id);
            Assert.Equal(new decimal?[] { 10000, 40000, 80000 }, items[0].Components.Select(c => c.UnitPriceSnapshot));
            AssertBreakdown(items[0].WrittenBreakdown, 20000, 20000, 20000, 0);
            var after = await service.LoadAsync(Q);
            Assert.All(after.Evaluation.Lines, l =>
            {
                Assert.Equal(CalculationStatus.Valid, l.Result.Status);
                Assert.False(l.ChangedSinceLastCalc);
            });
            Assert.Equal((0, 0, 0), (after.PendingAssignIds, after.PendingRemoveItems, after.PendingWriteBreakdown));
            Assert.Equal(2, wb.Saves);
        }

        [Fact]
        public async Task Test9_Sync_AssignsIds_CopiedLineKeepsSource_RemovedLineDropped()
        {
            var (wb, service) = Setup();
            SeedNorm(wb);
            wb.Add("DM-01", 1.0, 60000.0, "L1", notes: NoteNorm);
            wb.Add("DM-01", 3.0, 60000.0, "L1", notes: NoteNorm);
            wb.Add("TC-02", 1.0, 10.0);
            wb.Xml = QuotationXml.Encode(Record(NormItem("L1"), FromInsert.Manual(Who("GONE", "X", "x", "m"))));
            var view = await service.LoadAsync(Q);
            Assert.Equal((2, 1), (view.PendingAssignIds, view.PendingRemoveItems));
            Assert.Contains(view.Evaluation.Lines[1].Result.Issues, i => i.Message.Contains("Mã dòng trùng"));
            var outcome = await service.RecalculateAsync(Q, view.Evaluation.Fingerprint);
            Assert.Equal((1, 1, 1), (outcome.Value!.Assigned, outcome.Value.Copied, outcome.Value.Removed));
            var ids = new[] { 0, 1, 2 }.Select(r => (string)wb.Cell(r, QuoteTemplate.LineIdHeader)!).ToList();
            Assert.Equal("L1", ids[0]);
            Assert.Equal(3, ids.Distinct().Count());
            var saved = QuotationXml.Decode(wb.Xml!).Record!.Items;
            Assert.Equal(ids, saved.Select(i => i.Id));
            Assert.Equal(new[] { QuotationPricingMethod.Norm, QuotationPricingMethod.Norm, QuotationPricingMethod.Manual }, saved.Select(i => i.PricingMethod));
            Assert.Equal(new[] { 3, 3, 0 }, saved.Select(i => i.Components.Count));
        }

        [Fact]
        public async Task Test9_SheetChanged_NothingWritten_SaveFailure_ResyncsNextTime()
        {
            var (wb, service) = Setup();
            wb.Add("TC-01", 1.0, 10.0);
            var view = await service.LoadAsync(Q);
            wb.SetCell(0, "Khối lượng", 2.0);
            Assert.Equal(OutcomeStatus.Changed, (await service.RecalculateAsync(Q, view.Evaluation.Fingerprint)).Status);
            Assert.Equal("", wb.Cell(0, QuoteTemplate.LineIdHeader));
            Assert.Equal(0, wb.Saves);

            var fresh = await service.LoadAsync(Q);
            wb.FailSave = true;
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.RecalculateAsync(Q, fresh.Evaluation.Fingerprint));
            wb.FailSave = false;
            var again = await service.LoadAsync(Q);
            Assert.Equal(QuotationState.NoRecord, again.State);
            var outcome = await service.RecalculateAsync(Q, again.Evaluation.Fingerprint);
            Assert.Equal(OutcomeStatus.Done, outcome.Status);
            Assert.Equal(0, outcome.Value!.Assigned);
            Assert.Equal(new[] { wb.Cell(0, QuoteTemplate.LineIdHeader) }, QuotationXml.Decode(wb.Xml!).Record!.Items.Select(i => (object?)i.Id));
        }

        [Fact]
        public async Task Test9_OldNineColumnTable_BlockedUntilColumnsAdded()
        {
            var (wb, service) = Setup();
            wb.Headers = QuoteTemplate.Columns.Select(c => c.Header).ToList();
            wb.Add("TC-01", 1.0, 10.0);
            var view = await service.LoadAsync(Q);
            Assert.False(view.Evaluation.HasLineIds);
            Assert.Equal(new[] { "Đơn giá vật liệu", "Đơn giá nhân công", "Đơn giá máy", "Đơn giá khác", QuoteTemplate.LineIdHeader }, view.Evaluation.MissingColumns);
            Assert.Equal(OutcomeStatus.Blocked, (await service.RecalculateAsync(Q, view.Evaluation.Fingerprint)).Status);
            Assert.Equal(5, (await service.AddColumnsAsync(Q)).Count);
            var after = await service.LoadAsync(Q);
            var outcome = await service.RecalculateAsync(Q, after.Evaluation.Fingerprint);
            Assert.Equal(OutcomeStatus.Done, outcome.Status);
            Assert.Equal(1, outcome.Value!.Assigned);
        }

        [Fact]
        public void Test10_InvalidData_NoZero()
        {
            var wb = new FakeQuoteWorkbook();
            wb.Add("A1", -1.0, 10.0);
            wb.Add("A2", "1.500", 10.0);
            wb.Add("A3", "", 10.0);
            wb.Add("A4", 2.0, "");
            wb.Add("A5", 0.0, 10.0);
            var ev = Evaluate(wb);
            var errors = ev.Lines.Select(l => l.Result.Issues.Where(i => i.Severity == IssueSeverity.Error).Select(i => i.Code).ToArray()).ToList();
            Assert.Equal(new[] { ItemIssueCode.NegativeQuantity }, errors[0]);
            Assert.Equal(new[] { ItemIssueCode.InvalidQuantity }, errors[1]);
            Assert.Equal(new[] { ItemIssueCode.MissingQuantity }, errors[2]);
            Assert.Equal(new[] { ItemIssueCode.MissingUnitPrice }, errors[3]);
            Assert.Empty(errors[4]);
            Assert.Equal(CalculationStatus.ValidWithWarnings, ev.Lines[4].Result.Status);
            Assert.All(ev.Lines.Take(4), l =>
            {
                Assert.Equal(CalculationStatus.Invalid, l.Result.Status);
                Assert.Null(l.Result.Amount);
                Assert.Null(l.Result.UnitPrice);
            });
            Assert.Equal(0m, ev.Lines[4].Result.Amount);
        }

        [Fact]
        public void Test10_BadAnalysisValues_UnknownType_Overflow()
        {
            var wb = new FakeQuoteWorkbook();
            wb.AnalysisRows = new List<FakeQuoteWorkbook.AnalysisSpec>
            {
                new FakeQuoteWorkbook.AnalysisSpec { Code = "X", ResourceCode = "A", Type = ResourceType.Material, Quantity = double.PositiveInfinity, Price = 1.0 },
                new FakeQuoteWorkbook.AnalysisSpec { Code = "Y", ResourceCode = "B", Type = ResourceType.Material, Quantity = 1.0, Price = "abc" },
            };
            var snap = wb.Snapshot().Analysis!;
            var first = LineCalc.Breakdown(snap, "X", Rounding.NoRounding).Issues[0];
            Assert.Equal((ItemIssueCode.AnalysisError, "A"), (first.Code, first.ResourceCode!));
            Assert.Null(LineCalc.Breakdown(snap, "Y", Rounding.NoRounding).Totals);
            var odd = new AnalysisLine { Code = "Z", ResourceCode = "A", ResourceType = "Nhiên liệu", Quantity = 2.0, QuantityType = "Double", Price = 1.0, PriceType = "Double" };
            var oddResult = LineCalc.Breakdown(new[] { odd }, "Z", Rounding.NoRounding);
            Assert.Equal(2m, oddResult.Totals!.Other);
            Assert.Equal(2m, oddResult.UnitPrice);
            var big = new AnalysisLine { Code = "B", ResourceCode = "A", ResourceType = "Vật liệu", Quantity = 1e10, QuantityType = "Double", Price = 1e10, PriceType = "Double" };
            Assert.Equal(new[] { ItemIssueCode.Overflow }, LineCalc.Breakdown(new[] { big }, "B", Rounding.NoRounding).Issues.Select(i => i.Code));
            Assert.Equal(ResourceType.Machine, LineCalc.CostTypeFromLabel(" máy thi công "));
        }

        [Fact]
        public async Task Test10_RecordBadSchema_Refused_NotOverwritten()
        {
            var record = QuotationXml.NewRecord("Q1", Q, T);
            Assert.Equal(RecordReadKind.Unreadable, QuotationXml.Decode("<quotation/>").Kind);
            Assert.Equal(RecordReadKind.Unreadable, QuotationXml.Decode("<quotation><data>{không phải json</data></quotation>").Kind);
            var newer = record.Shallow();
            newer.SchemaVersion = 99;
            Assert.Equal(RecordReadKind.Unreadable, QuotationXml.Decode(QuotationXml.Encode(newer)).Kind);
            var dup = FromInsert.Manual(Who("D", "", "", ""));
            var twice = record.Shallow();
            twice.Items = new List<QuotationItemRecord> { dup, dup };
            Assert.Equal(RecordReadKind.Unreadable, QuotationXml.Decode(QuotationXml.Encode(twice)).Kind);
            var blank = record.Shallow();
            blank.Items = new List<QuotationItemRecord> { FromInsert.Manual(Who("", "", "", "")) };
            Assert.Equal(RecordReadKind.Unreadable, QuotationXml.Decode(QuotationXml.Encode(blank)).Kind);

            var (wb, service) = Setup();
            wb.Add("TC", 1.0, 1.0);
            wb.Xml = QuotationXml.Encode(newer);
            var view = await service.LoadAsync(Q);
            Assert.Equal(QuotationState.Unreadable, view.State);
            Assert.Equal(OutcomeStatus.Blocked, (await service.RecalculateAsync(Q, view.Evaluation.Fingerprint)).Status);
            // Dòng chưa có trong bảng: không tạo mục mồ côi.
            Assert.NotNull(await service.RegisterInsertedLineAsync(Q, dup));
            Assert.Equal(Q, QuotationXml.TableOf(wb.Xml));
            Assert.Equal(0, wb.Saves);
        }

        [Fact]
        public void Xml_SpecialCharactersRoundTrip()
        {
            var item = FromInsert.Manual(Who("L1", "A&B", "Ống <D100> \"loại 1\" 'x'", "m"));
            var xml = QuotationXml.Encode(Record(item));
            Assert.DoesNotContain("<D100>", xml);
            var back = QuotationXml.Decode(xml.Replace("&lt;D100&gt;", "&#60;D100&#x3E;"));
            Assert.Equal(item.WorkName, back.Record!.Items[0].WorkName);
            Assert.Equal("A&B", back.Record.Items[0].WorkCode);
        }

        [Fact]
        public void Detach_KeepsData_OnlyChangesRootAttribute()
        {
            var record = QuotationXml.NewRecord("Q-old", "CQ_Quote_2", T);
            record.Status = QuotationStatus.Completed;
            var detached = QuotationXml.Detach(QuotationXml.Encode(record), "2026-10-27T10:00:00.000Z");
            Assert.Equal("CQ_Quote_2#tách 2026-10-27T10:00:00.000Z", QuotationXml.TableOf(detached));
            Assert.Equal("Q-old", QuotationXml.Decode(detached).Record!.Id);
            record.Items = new List<QuotationItemRecord> { FromInsert.Manual(Who("x", "table=\"CQ_Quote_2\"", "", "")) };
            var tricky = QuotationXml.Detach(QuotationXml.Encode(record), "N");
            Assert.Equal("CQ_Quote_2#tách N", QuotationXml.TableOf(tricky));
            Assert.Equal("table=\"CQ_Quote_2\"", QuotationXml.Decode(tricky).Record!.Items[0].WorkCode);
        }

        [Fact]
        public void Rounding_UnitPriceLevel_ComponentsKeepUnrounded()
        {
            var wb = new FakeQuoteWorkbook { RoundingRules = WithUnitPrice(new RoundingRule(RoundingMode.Round, -3)) };
            SeedNorm(wb, 10333.0, 2.1);
            var result = LineCalc.Breakdown(wb.Snapshot().Analysis!, "DM-01", wb.RoundingRules.UnitPrice);
            AssertBreakdown(result.Totals, 21699.3m, 20000, 20000, 0);
            Assert.Equal(62000m, result.UnitPrice);
            wb.Add("DM-01", 3.0, 62000.0, "L1", notes: NoteNorm, breakdown: new object?[] { 21699.3, 20000.0, 20000.0, 0.0 });
            var item = NormItem("L1", 0.05m);
            item.WrittenBreakdown = Breakdown(21699.3m, 20000, 20000, 0);
            var r = Evaluate(wb, Record(item)).Lines[0].Result;
            Assert.Equal((CalculationStatus.Valid, 62000m, 186000m, 21699.3m), (r.Status, r.UnitPrice!.Value, r.Amount!.Value, r.MaterialCost!.Value));
            Assert.Empty(r.Issues);
        }

        [Fact]
        public void Rounding_AmountLevel_Modes()
        {
            Assert.Equal(1001m, LineCalc.LineAmount(3, 333.335m, new RoundingRule(RoundingMode.RoundUp, 0)));
            Assert.Equal(1000m, LineCalc.LineAmount(3, 333.335m, new RoundingRule(RoundingMode.RoundDown, 2)));
            Assert.Equal(2.5m, LineCalc.LineAmount(2.5m, 1.01m, new RoundingRule(RoundingMode.Round, 1)));
            Assert.Equal(1010m, LineCalc.LineAmount(1.005m, 1000, new RoundingRule(RoundingMode.Round, -1)));
            var wb = new FakeQuoteWorkbook { RoundingRules = WithAmount(new RoundingRule(RoundingMode.RoundUp, -2)) };
            wb.Add("R1", 3.0, 333.335, "R1");
            var r = Evaluate(wb).Lines[0].Result;
            Assert.NotEqual(CalculationStatus.Invalid, r.Status);
            Assert.Equal(1100m, r.Amount);
        }

        [Fact]
        public void Decimals_NoFloatingPointDrift()
        {
            var wb = new FakeQuoteWorkbook();
            wb.AnalysisRows = new List<FakeQuoteWorkbook.AnalysisSpec>
            {
                new FakeQuoteWorkbook.AnalysisSpec { Code = "D", ResourceCode = "A", Type = ResourceType.Material, Quantity = 0.1, Price = 3.0 },
                new FakeQuoteWorkbook.AnalysisSpec { Code = "D", ResourceCode = "B", Type = ResourceType.Labor, Quantity = 0.7, Price = 0.1 },
                new FakeQuoteWorkbook.AnalysisSpec { Code = "D", ResourceCode = "C", Type = ResourceType.Other, Quantity = 1.15, Price = 100.0 },
            };
            var r = LineCalc.Breakdown(wb.Snapshot().Analysis!, "D", Rounding.NoRounding);
            AssertBreakdown(r.Totals, 0.3m, 0.07m, 0, 115);
            Assert.Equal(115.37m, r.UnitPrice);
            Assert.Equal(0.02m, LineCalc.LineAmount(0.1m, 0.2m, Rounding.NoRounding));
        }

        [Fact]
        public void BigNumbers_15DigitsOk_16IsOverflow()
        {
            AnalysisLine Big(double quantity, double price) => new AnalysisLine { Code = "B", ResourceCode = "A", ResourceType = "Vật liệu", Quantity = quantity, QuantityType = "Double", Price = price, PriceType = "Double", RowIndex = 4 };
            Assert.Equal(999999000000000m, LineCalc.Breakdown(new[] { Big(999999, 1000000000) }, "B", Rounding.NoRounding).UnitPrice);
            var over = LineCalc.Breakdown(new[] { Big(1000000, 1000000000) }, "B", Rounding.NoRounding);
            Assert.Null(over.UnitPrice);
            Assert.Null(over.Totals);
            Assert.Equal(new[] { ItemIssueCode.Overflow }, over.Issues.Select(i => i.Code));
        }

        [Fact]
        public void ZeroValues_Valid_WithWarnings()
        {
            var wb = new FakeQuoteWorkbook();
            wb.AnalysisRows = new List<FakeQuoteWorkbook.AnalysisSpec>
            {
                new FakeQuoteWorkbook.AnalysisSpec { Code = "Z", ResourceCode = "A", Type = ResourceType.Material, Quantity = 2.0, Price = 0.0 },
                new FakeQuoteWorkbook.AnalysisSpec { Code = "Z", ResourceCode = "B", Type = ResourceType.Labor, Quantity = 1.0, Price = 500.0 },
            };
            var b = LineCalc.Breakdown(wb.Snapshot().Analysis!, "Z", Rounding.NoRounding);
            Assert.Equal((500m, 0m, 500m), (b.UnitPrice!.Value, b.Totals!.Material!.Value, b.Totals.Labor!.Value));
            wb.Add("K0", 0.0, 500.0, "K0");
            var r = Evaluate(wb).Lines[0].Result;
            Assert.Equal((CalculationStatus.ValidWithWarnings, 0m, 0m), (r.Status, r.Amount!.Value, r.Quantity!.Value));
        }

        [Fact]
        public void NormLine_WithoutAnalysisBlock_IsInvalid()
        {
            var wb = new FakeQuoteWorkbook();
            wb.Add("DM-01", 1.0, 60000.0, "L1", notes: NoteNorm);
            var r = Evaluate(wb, Record(NormItem("L1"))).Lines[0].Result;
            Assert.Equal(CalculationStatus.Invalid, r.Status);
            Assert.Contains(r.Issues, i => i.Code == ItemIssueCode.AnalysisMissing);
        }

        [Fact]
        public async Task Completion_BlockedThenDone_EditAfter_Reopen()
        {
            var (wb, service) = Setup();
            wb.Add("TC-01", 2.0, "");
            var view = await service.LoadAsync(Q);
            await service.RecalculateAsync(Q, view.Evaluation.Fingerprint);
            view = await service.LoadAsync(Q);
            var blocked = await service.CompleteAsync(Q, view.Evaluation.Fingerprint);
            Assert.Equal(OutcomeStatus.Blocked, blocked.Status);
            Assert.Contains("1 dòng chưa tính được (trạng thái lỗi).", blocked.Reasons);

            wb.SetCell(0, "Đơn giá", 1500.0);
            view = await service.LoadAsync(Q);
            Assert.Equal(OutcomeStatus.Done, (await service.CompleteAsync(Q, view.Evaluation.Fingerprint)).Status);
            Assert.Equal(QuotationState.Completed, (await service.LoadAsync(Q)).State);

            wb.SetCell(0, "Khối lượng", 3.0);
            view = await service.LoadAsync(Q);
            Assert.Equal(QuotationState.ModifiedAfterCompletion, view.State);
            var recalc = await service.RecalculateAsync(Q, view.Evaluation.Fingerprint);
            Assert.True(recalc.Value!.CompletionCleared);
            view = await service.LoadAsync(Q);
            Assert.Equal(QuotationState.Draft, view.State);
            await service.CompleteAsync(Q, view.Evaluation.Fingerprint);
            Assert.Equal(OutcomeStatus.Done, (await service.ReopenAsync(Q)).Status);
            Assert.Equal(QuotationState.Draft, (await service.LoadAsync(Q)).State);
        }

        [Fact]
        public void BreakdownEdited_NotOverwritten_GroupTotalsSkipUncomputed()
        {
            var wb = new FakeQuoteWorkbook();
            SeedNorm(wb);
            wb.Add("DM-01", 1.0, 60000.0, "L1", "Móng", notes: NoteNorm, breakdown: new object?[] { 1.0, 2.0, 3.0, 4.0 });
            wb.Add("TC", "", 5.0, "L2", "Móng");
            wb.Add("TD", 2.0, 5.0, "L3", "Tường", breakdown: new object?[] { 1.0, 1.0, 1.0, 1.0 });
            var ev = Evaluate(wb, Record(NormItem("L1"), FromInsert.Manual(Who("L2", "TC", "", "")), FromInsert.Manual(Who("L3", "TD", "", ""))));
            Assert.Null(ev.Lines[0].BreakdownWrite);
            Assert.Contains(ev.Lines[0].Result.Issues, i => i.Code == ItemIssueCode.BreakdownEdited);
            Assert.Equal("Tổng đơn giá thành phần (4) khác Đơn giá (5).", ev.Lines[2].Result.Issues.First(i => i.Code == ItemIssueCode.BreakdownMismatch).Message);
            Assert.Equal(("Móng", 60000m, 2, 1), (ev.Groups[0].Group, ev.Groups[0].Amount, ev.Groups[0].Lines, ev.Groups[0].Uncomputed));
            Assert.Equal(("Tường", 10m, 1, 0), (ev.Groups[1].Group, ev.Groups[1].Amount, ev.Groups[1].Lines, ev.Groups[1].Uncomputed));
            Assert.Equal(QuoteLineReader.ContentFingerprint(wb.Snapshot()), ev.Fingerprint);
        }

        [Fact]
        public void Reconcile_NoChange_KeepsRecord()
        {
            var wb = new FakeQuoteWorkbook();
            wb.Add("A", 1.0, 1.0, "L1");
            var record = Record(FromInsert.Manual(Who("L1", "A", "", "")));
            var result = Reconciler.Reconcile(QuoteLineReader.Read(wb.Snapshot()).Lines, record, Q, T, () => "N");
            Assert.False(result.Changed);
            Assert.Same(record, result.Record);
        }

        [Fact]
        public async Task FullFlow_LibraryToQuote_ThenLibraryChanges()
        {
            // Thư viện dựng tay (dữ liệu giả định), đi qua đúng Composition rồi tới hồ sơ báo giá.
            var va = Res("rVA", ResourceType.Material, "kg", code: "VA");
            var nb = Res("rNB", ResourceType.Labor, "công", code: "NB");
            var mc = Res("rMC", ResourceType.Machine, "ca", code: "MC");
            var work = new WorkItem { Id = "wF", Code = "CT-F", Name = "Công tác luồng", Unit = "m3", Currency = "VND", CreatedAt = T, UpdatedAt = T };
            var norm = Norm("nF", "DM-F", workItemId: "wF");
            var lib = Lib(new[] { va, nb, mc }, new[] { Price("pVA", "rVA", 10000, "kg"), Price("pNB", "rNB", 40000, "công"), Price("pMC", "rMC", 80000, "ca") }, new[] { norm },
                new[] { Comp("c1", va, 2, 0.05m, "nF"), Comp("c2", nb, 0.5m, 0, "nF"), Comp("c3", mc, 0.25m, 0, "nF") });
            lib.WorkItems = new List<WorkItem> { work };

            var lines = Composition.Lines(work, lib, "2026-10-27");
            Assert.Equal(new[] { 2.1m, 0.5m, 0.25m }, lines.Select(l => l.Consumption));
            var selection = Composition.DefaultSelection(lines);
            var comp = Composition.Build(work, lines, selection, Rounding.NoRounding);
            Assert.True(comp.Ok);
            Assert.Equal(61000m, comp.Preview);

            var (wb, svc) = Setup(() => lib);
            int At(AnalysisColumnKey key) => Analysis.Columns.ToList().FindIndex(c => c.Key == key);
            string Text(object v) => ((string)v).TrimStart('\'');
            wb.AnalysisRows = comp.Rows.Select(r => new FakeQuoteWorkbook.AnalysisSpec
            {
                Code = Text(r[At(AnalysisColumnKey.Code)]),
                ResourceCode = Text(r[At(AnalysisColumnKey.ResourceCode)]),
                Type = LineCalc.CostTypeFromLabel(Text(r[At(AnalysisColumnKey.ResourceType)])) ?? ResourceType.Other,
                Quantity = (double)(decimal)r[At(AnalysisColumnKey.Quantity)],
                Price = (double)(decimal)r[At(AnalysisColumnKey.Price)],
            }).ToList();
            wb.AnalysisSource = comp.Rows.Select(r => Text(r[At(AnalysisColumnKey.Source)])).ToList();
            var breakdown = FromInsert.CompositionBreakdown(lines, selection)!;
            AssertBreakdown(breakdown, 21000, 20000, 20000, 0);
            wb.Add("CT-F", 10.0, 61000.0, "LF", "Móng", notes: Composition.Note(work, 3, "VND"), breakdown: new object?[] { 21000.0, 20000.0, 20000.0, 0.0 });
            wb.Add("TAY", 4.0, 2500.0, "LM", "Móng");
            var item = FromInsert.FromNorm(Who("LF", "CT-F", "Công tác luồng"), work, lines, selection, comp.Rows);
            item.WrittenBreakdown = breakdown;
            Assert.Null(await svc.RegisterInsertedLineAsync(Q, item));
            Assert.Null(await svc.RegisterInsertedLineAsync(Q, FromInsert.Manual(Who("LM", "TAY", "x", "m"))));

            var view = await svc.LoadAsync(Q);
            Assert.Equal(2, view.Evaluation.Counts[CalculationStatus.Valid]);
            Assert.Equal((620000m, 620000m), (view.Evaluation.TotalValue!.Value, view.Evaluation.ComputedTotal));
            var group = Assert.Single(view.Evaluation.Groups);
            Assert.Equal(("Móng", 620000m, 2, 0), (group.Group, group.Amount, group.Lines, group.Uncomputed));
            Assert.Equal(OutcomeStatus.Done, (await svc.RecalculateAsync(Q, view.Evaluation.Fingerprint)).Status);
            view = await svc.LoadAsync(Q);
            Assert.Equal(OutcomeStatus.Done, (await svc.CompleteAsync(Q, view.Evaluation.Fingerprint)).Status);

            // Đổi giá trong thư viện: báo giá giữ 61.000, trạng thái vẫn hoàn tất.
            lib.ResourcePrices[0] = Price("pVA", "rVA", 10500, "kg");
            view = await svc.LoadAsync(Q);
            Assert.Equal(QuotationState.Completed, view.State);
            Assert.Equal(61000.0, wb.Cell(0, "Đơn giá"));
            Assert.Equal(new[] { ItemIssueCode.LibraryPriceChanged }, view.Evaluation.Lines[0].Result.Issues.Select(i => i.Code));

            // Định mức chuyển Ngừng dùng.
            lib.Norms[0] = Norm("nF", "DM-F", status: NormStatus.Inactive, workItemId: "wF");
            view = await svc.LoadAsync(Q);
            var issues = view.Evaluation.Lines[0].Result.Issues;
            Assert.Equal(new[] { ItemIssueCode.NormVersionChanged, ItemIssueCode.LibraryPriceChanged }, issues.Select(i => i.Code));
            Assert.Contains("Ngừng dùng", issues[0].Message);

            // Giá đã dùng bị xóa: cảnh báo, không có kế hoạch cập nhật cho tài nguyên đó.
            lib.ResourcePrices.RemoveAt(2);
            view = await svc.LoadAsync(Q);
            Assert.Equal(ItemIssueCode.LibraryMissing, view.Evaluation.Lines[0].Result.Issues.First(i => i.ResourceCode == "MC").Code);
            var update = Assert.Single(view.Evaluation.Lines[0].Plan!.Prices!);
            Assert.Equal(("VA", 10500m), (update.ResourceCode, update.NewPrice));

            // Người dùng chủ động cập nhật: 2,1 × 10.500 + 20.000 + 20.000 = 62.050; × 10 = 620.500; về nháp.
            var updated = await svc.ApplyLibraryUpdateAsync(Q, "LF", view.Evaluation.Fingerprint);
            Assert.Equal(OutcomeStatus.Done, updated.Status);
            Assert.True(updated.Value!.CompletionCleared);
            Assert.Equal(62050.0, wb.Cell(0, "Đơn giá"));

            view = await svc.LoadAsync(Q);
            Assert.Equal(QuotationState.Draft, view.State);
            Assert.Equal((0, 0, 0), (view.PendingAssignIds, view.PendingRemoveItems, view.PendingWriteBreakdown));
            Assert.Equal(new decimal?[] { 620500, 10000 }, view.Evaluation.Lines.Select(l => l.Result.Amount));
            Assert.All(view.Evaluation.Lines, l => Assert.False(l.ChangedSinceLastCalc));
            Assert.Equal(new[] { "LF", "LM" }, QuotationXml.Decode(wb.Xml!).Record!.Items.Select(i => i.Id));
        }
    }

    /// <summary>Đối chiếu với kết quả do chính mã nguồn bản web sinh ra (Fixtures/web-quotation.json).</summary>
    public class QuotationWebCompatibilityTests
    {
        private static readonly JObject Web = JObject.Parse(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Fixtures", "web-quotation.json")));

        private static object? Raw(JToken token)
        {
            switch (token.Type)
            {
                case JTokenType.Integer:
                case JTokenType.Float:
                    return (double)token;
                case JTokenType.Boolean:
                    return (bool)token;
                case JTokenType.Null:
                    return null;
                default:
                    return (string?)token;
            }
        }

        private static QuoteSnapshot Snapshot(bool withTotals, bool withAnalysis)
        {
            var json = Web["snapshot"]!;
            var quote = json["quote"]!;
            SheetRow Row(JToken values)
            {
                var cells = values.Select(Raw).ToArray();
                return new SheetRow(cells, cells, cells.Select(_ => "String").ToArray());
            }
            return new QuoteSnapshot
            {
                Quote = new TableSnapshot
                {
                    Name = (string)quote["name"]!,
                    Headers = quote["headers"]!.Select(h => (string)h!).ToList(),
                    Rows = quote["rows"]!.Select(r => Row(r["values"]!)).ToList(),
                    Totals = withTotals ? Row(quote["totals"]!["values"]!) : null,
                },
                Analysis = withAnalysis
                    ? json["analysis"]!.Select(a => new AnalysisLine
                    {
                        Code = (string)a["code"]!,
                        ResourceCode = (string)a["resourceCode"]!,
                        Quantity = Raw(a["quantity"]!),
                        Price = Raw(a["price"]!),
                        UnitPrice = Raw(a["unitPrice"]!),
                    }).ToList()
                    : null,
            };
        }

        [Fact]
        public void Fingerprint_MatchesWeb()
        {
            Assert.Equal((string)Web["fingerprint"]!, QuoteLineReader.ContentFingerprint(Snapshot(true, true)));
            Assert.Equal((string)Web["noTotalsFingerprint"]!, QuoteLineReader.ContentFingerprint(Snapshot(false, false)));
        }

        [Fact]
        public void HashText_MatchesWeb()
        {
            foreach (var text in new[] { "", "a", "Đơn giá thành phần", new string('x', 1000) })
            {
                var key = text.Length > 30 ? text.Substring(0, 30) : text;
                Assert.Equal((string)Web["hashes"]![key]!, QuoteLineReader.HashText(text));
            }
        }

        [Fact]
        public void NumberText_MatchesJavaScript()
        {
            foreach (var pair in Web["numbers"]!)
            {
                Assert.Equal((string)pair[1]!, JsText.Number((double)pair[0]!));
            }
        }

        [Fact]
        public void WebRecord_Reads_AndRewritesSameData()
        {
            var xml = (string)Web["xml"]!;
            Assert.Equal("CQ_Quote_1", QuotationXml.TableOf(xml));
            var read = QuotationXml.Decode(xml);
            Assert.Equal(RecordReadKind.Ok, read.Kind);
            var record = read.Record!;
            Assert.Equal((QuotationStatus.Completed, "abc"), (record.Status, record.CompletedFingerprint!));
            var item = record.Items[0];
            Assert.Equal("A&B", item.WorkCode);
            Assert.Equal("Ống <D100> \"loại 1\" 'x'", item.WorkName);
            Assert.Equal(2.1m, item.Components[0].AppliedConsumption);
            Assert.Equal(CalculationStatus.ValidWithWarnings, item.Result!.Status);
            Assert.Equal(ItemIssueCode.LibraryPriceChanged, item.Result.Issues[0].Code);
            Assert.Null(item.Result.Issues[1].Hint);
            Assert.Equal(21000m, item.WrittenBreakdown!.Material);

            // Ghi lại bằng bản native: cùng dữ liệu JSON, và bản web đọc được (đúng tên, kiểu, null như web ghi).
            static JObject Data(string x) => JObject.Parse(System.Text.RegularExpressions.Regex.Match(x, "<data>(.*)</data>", System.Text.RegularExpressions.RegexOptions.Singleline).Groups[1].Value
                .Replace("&lt;", "<").Replace("&gt;", ">").Replace("&amp;", "&"));
            var again = QuotationXml.Encode(record);
            Assert.True(JToken.DeepEquals(Data(xml), Data(again)), Data(again).ToString());
            Assert.Equal(xml.Substring(0, xml.IndexOf("<data>", StringComparison.Ordinal)), again.Substring(0, again.IndexOf("<data>", StringComparison.Ordinal)));
        }

        [Fact]
        public void Formulas_MatchWeb()
        {
            Assert.Equal((string)Web["stt"]!, QuoteTemplate.SttFormula("CQ_Quote_1"));
            Assert.Equal(Web["totalRow"]!.Select(t => (string)t!), QuoteTemplate.TemplateTotalRow("CQ_Quote_1"));
            Assert.Equal((string)Web["lineAmount"]!, Analysis.LineAmountFormula());
            Assert.Equal(Web["templateHeaders"]!.Select(t => (string)t!), QuoteTemplate.TemplateColumns.Select(c => c.Header));
            string Key(RoundingRule rule) => $"{rule.Mode.ToString().Substring(0, 1).ToLowerInvariant()}{rule.Mode.ToString().Substring(1)}:{rule.Digits}";
            Assert.Equal(Web["amountFormulas"]!.Count(), Rounding.AllRules.Count);
            foreach (var rule in Rounding.AllRules)
            {
                Assert.Equal((string)Web["amountFormulas"]![Key(rule)]!, QuoteTemplate.AmountFormula(rule));
                Assert.Equal((string)Web["unitPriceFormulas"]![Key(rule)]!, Analysis.UnitPriceFormula(rule));
                Assert.Equal(rule, QuoteTemplate.InferRule(QuoteTemplate.AmountFormula(rule), r => QuoteTemplate.AmountFormula(r), "CQ_Quote_1"));
            }
            Assert.Equal(Web["sheetNames"]!.Select(t => (string)t!), new[] { Naming.UniqueSheetName("Báo giá", new[] { "báo giá", "Báo giá (2)" }), Naming.UniqueSheetName("History", new string[0]) });
        }
    }

    /// <summary>Chuyển từ tests/unit/quoteService.test.ts, quoteTemplate.test.ts, naming.test.ts, workItemDraft.test.ts.</summary>
    public class QuoteTemplateTests
    {
        private sealed class FakeGateway : IQuoteGateway
        {
            public List<(TemplateTarget Target, int Rows, string Fingerprint)> Writes = new List<(TemplateTarget, int, string)>();
            public List<(int Count, int? Insert, int? Fill)> Appends = new List<(int, int?, int?)>();
            public List<bool> InspectedPositions = new List<bool>();
            public List<string> NewSheetNames = new List<string>();
            public bool ChangedBeforeWrite;
            public TargetInspection Selection = new TargetInspection
            {
                Target = new TemplateTarget { SheetName = "Sheet1", RowIndex = 1, ColumnIndex = 1 },
                SheetName = "Sheet1",
                Address = "B2:J17",
                Fingerprint = "fp-1",
            };
            public AppendInspection Append = new AppendInspection { TableName = "CQ_Quote_1", SheetName = "Báo giá", Fingerprint = "fp-append" };

            public Task<TargetInspection> InspectAtSelectionAsync(int rowCount, int columnCount) => Task.FromResult(Selection);

            public Task<TargetInspection> InspectTargetAsync(TemplateTarget target, int rowCount, int columnCount)
            {
                NewSheetNames.Add(target.BaseName!);
                return Task.FromResult(new TargetInspection { Target = target, SheetName = "Báo giá", Address = "A1:I16", Fingerprint = "fp-1" });
            }

            public Task<CreatedQuote> WriteTemplateAsync(TemplateTarget target, int initialRows, string expectedFingerprint)
            {
                if (ChangedBeforeWrite)
                {
                    throw new TargetChangedException();
                }
                Writes.Add((target, initialRows, expectedFingerprint));
                return Task.FromResult(new CreatedQuote { SheetName = "Báo giá", TableName = "CQ_Quote_1", Address = "A1:I16" });
            }

            public Task<AppendInspection> InspectAppendAsync(string tableName, bool belowSelection)
            {
                InspectedPositions.Add(belowSelection);
                return Task.FromResult(Append);
            }

            public Task<AppendedRows> AppendRowsAsync(string tableName, IReadOnlyList<object[]> rows, string expectedFingerprint, int? insertIndex, int? fillIndex, IReadOnlyList<IReadOnlyDictionary<string, object>> extras)
            {
                if (ChangedBeforeWrite)
                {
                    throw new TargetChangedException();
                }
                Appends.Add((rows.Count, insertIndex, fillIndex));
                return Task.FromResult(new AppendedRows { TableName = tableName, SheetName = "Báo giá", Address = "A16:I16" });
            }

            public Task<QuoteTableList> ListQuoteTablesAsync() => throw new NotSupportedException();
            public Task<QuoteInfoRead> ReadQuoteInfoAsync(string tableName) => throw new NotSupportedException();
            public Task WriteQuoteInfoAsync(string tableName, IReadOnlyList<InfoWrite> writes, string expectedFingerprint) => throw new NotSupportedException();
            public Task<bool> WasLibraryUsedAsync() => throw new NotSupportedException();
            public Task MarkLibraryUsedAsync() => throw new NotSupportedException();
            public Task<RoundingConfig> ReadRoundingAsync() => throw new NotSupportedException();
            public Task<QuoteSnapshot> ReadQuoteSnapshotAsync(string tableName) => throw new NotSupportedException();
            public Task<AnalysisPrice?> FindAnalysisAsync(string code) => throw new NotSupportedException();
            public Task<AnalysisWriteResult> WriteAnalysisAsync(string code, IReadOnlyList<object[]> rows) => throw new NotSupportedException();
            public Task<RecordRead> ReadRecordAsync(string tableName) => throw new NotSupportedException();
            public Task SaveRecordAsync(QuotationRecord record, string? expectedUpdatedAt) => throw new NotSupportedException();
            public Task WriteLineCellsAsync(string tableName, IReadOnlyList<LineCellWrite> writes, IReadOnlyList<RowGuard> guards) => throw new NotSupportedException();
            public Task WriteAnalysisCellsAsync(IReadOnlyList<AnalysisCellWrite> writes) => throw new NotSupportedException();
            public Task<ExtensionInspection> InspectExtensionColumnsAsync(string tableName) => throw new NotSupportedException();
            public Task<List<string>> AddExtensionColumnsAsync(string tableName) => throw new NotSupportedException();
            public Task GoToAsync(string sheetName, string address) => throw new NotSupportedException();
            public Task SelectQuoteTableAsync(string tableName) => throw new NotSupportedException();
            public Task<string> WriteExplanationAsync(ExplanationSheet sheet) => throw new NotSupportedException();
            public Task<RoundingApplyResult> ApplyRoundingAsync(RoundingConfig config) => throw new NotSupportedException();
            public Task<SummaryState> ReadSummaryAsync(string tableName) => throw new NotSupportedException();
            public Task<AreaCheck> InspectSummaryAsync(string tableName, int adjustmentCount) => throw new NotSupportedException();
            public Task WriteSummaryAsync(string tableName, IReadOnlyList<Adjustment> adjustments, string fingerprint) => throw new NotSupportedException();
            public Task RemoveSummaryAsync(string tableName) => throw new NotSupportedException();
            public Task<int> SetUnitPricesAsync(IReadOnlyList<UnitPriceFix> fixes) => throw new NotSupportedException();
            public Task<TermsState> ReadTermsAsync(string tableName) => throw new NotSupportedException();
            public Task<AreaCheck> InspectTermsAsync(string tableName, int rowCount) => throw new NotSupportedException();
            public Task<List<string>> WriteTermsAsync(string tableName, IReadOnlyList<TermsSection> sections, string fingerprint) => throw new NotSupportedException();
            public Task RemoveTermsAsync(string tableName) => throw new NotSupportedException();
            public Task<PrintSetupState> ReadPrintSetupAsync(string tableName) => throw new NotSupportedException();
            public Task<string> ApplyPrintSetupAsync(string tableName, PrintOptions options) => throw new NotSupportedException();
        }

        private static readonly object[] OneRow = { "=ROW()", "BT-01", "", "Đổ bê tông", "m3", 1m, 2m, "=x", "" };
        private static readonly NoExtras None = new NoExtras();

        private sealed class NoExtras : List<IReadOnlyDictionary<string, object>>
        {
        }

        [Fact]
        public async Task Template_NewSheet_ReadyWithoutConfirmation()
        {
            var gateway = new FakeGateway();
            var plan = await QuoteService.PlanTemplateAsync(gateway, true, 5);
            Assert.Equal(PlanStatus.Ready, plan.Status);
            Assert.NotNull(await QuoteService.ExecuteTemplateAsync(gateway, plan, 5, false));
            Assert.Single(gateway.Writes);
        }

        [Fact]
        public async Task Template_EmptyAreaOnExistingSheet_ShowsLocation()
        {
            var gateway = new FakeGateway();
            var plan = await QuoteService.PlanTemplateAsync(gateway, false, 5);
            Assert.Equal(PlanStatus.NeedsLocationConfirmation, plan.Status);
            Assert.Empty(gateway.Writes);
        }

        [Fact]
        public async Task Template_OccupiedArea_NoWriteWithoutConfirmation()
        {
            var gateway = new FakeGateway();
            gateway.Selection.Occupied = new OccupiedCells { Count = 3, Sample = { "B2", "C5", "D9" } };
            var plan = await QuoteService.PlanTemplateAsync(gateway, false, 5);
            Assert.Equal(PlanStatus.NeedsOverwriteConfirmation, plan.Status);
            await Assert.ThrowsAsync<InvalidOperationException>(() => QuoteService.ExecuteTemplateAsync(gateway, plan, 5, false));
            Assert.Empty(gateway.Writes);
            Assert.NotNull(await QuoteService.ExecuteTemplateAsync(gateway, plan, 5, true));
            Assert.Equal("fp-1", gateway.Writes[0].Fingerprint);
        }

        [Fact]
        public async Task Template_Blocked_EvenWithOverwrite()
        {
            var gateway = new FakeGateway();
            gateway.Selection.Occupied = new OccupiedCells { Count = 2 };
            gateway.Selection.Blockers.Add(new TargetBlocker(BlockerKind.Protected));
            gateway.Selection.Blockers.Add(new TargetBlocker(BlockerKind.TableOverlap, new[] { "Table1" }));
            var plan = await QuoteService.PlanTemplateAsync(gateway, false, 5);
            Assert.Equal(PlanStatus.Blocked, plan.Status);
            await Assert.ThrowsAsync<InvalidOperationException>(() => QuoteService.ExecuteTemplateAsync(gateway, plan, 5, true));
            Assert.Empty(gateway.Writes);
        }

        [Fact]
        public async Task Template_WritesToPlannedLocation_NotNewSelection()
        {
            var gateway = new FakeGateway();
            var plan = await QuoteService.PlanTemplateAsync(gateway, false, 5);
            gateway.Selection = new TargetInspection { Target = new TemplateTarget { SheetName = "Sheet2", RowIndex = 40 }, Fingerprint = "x" };
            await QuoteService.ExecuteTemplateAsync(gateway, plan, 5, false);
            Assert.Equal(("Sheet1", 1, 1), (gateway.Writes[0].Target.SheetName, gateway.Writes[0].Target.RowIndex, gateway.Writes[0].Target.ColumnIndex));
        }

        [Fact]
        public async Task Template_ChangedWhileConfirming_ReturnsNull_NoWrite()
        {
            var gateway = new FakeGateway();
            var plan = await QuoteService.PlanTemplateAsync(gateway, false, 5);
            gateway.ChangedBeforeWrite = true;
            Assert.Null(await QuoteService.ExecuteTemplateAsync(gateway, plan, 5, false));
            Assert.Empty(gateway.Writes);
        }

        [Fact]
        public async Task Template_RowCountClamped()
        {
            var gateway = new FakeGateway();
            var plan = await QuoteService.PlanTemplateAsync(gateway, true, 99999);
            await QuoteService.ExecuteTemplateAsync(gateway, plan, 99999, false);
            Assert.Equal(500, gateway.Writes[0].Rows);
        }

        [Fact]
        public async Task Template_SheetNameChosenByUser_DefaultBaoGia()
        {
            var gateway = new FakeGateway();
            await QuoteService.PlanTemplateAsync(gateway, true, 5, "Báo giá nhà xưởng");
            await QuoteService.PlanTemplateAsync(gateway, true, 5);
            Assert.Equal(new[] { "Báo giá nhà xưởng", "Báo giá" }, gateway.NewSheetNames);
        }

        [Fact]
        public async Task Append_NoDataBelow_Ready()
        {
            var gateway = new FakeGateway();
            var plan = await QuoteService.PlanAppendAsync(gateway, "CQ_Quote_1", false);
            Assert.Equal(PlanStatus.Ready, plan.Status);
            Assert.NotNull(await QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow }, false, None));
            Assert.Equal((1, (int?)null, (int?)null), gateway.Appends[0]);
            Assert.Equal(new[] { false }, gateway.InspectedPositions);
        }

        [Fact]
        public async Task Append_DataBelow_NeedsConfirmation()
        {
            var gateway = new FakeGateway();
            gateway.Append.CellsBelow = new OccupiedCells { Count = 4, Sample = { "A20" } };
            var plan = await QuoteService.PlanAppendAsync(gateway, "CQ_Quote_1", false);
            Assert.Equal(PlanStatus.NeedsShiftConfirmation, plan.Status);
            await Assert.ThrowsAsync<InvalidOperationException>(() => QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow }, false, None));
            Assert.Empty(gateway.Appends);
            await QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow }, true, None);
            Assert.Single(gateway.Appends);
        }

        [Fact]
        public async Task Append_HeadersChanged_Blocked()
        {
            var gateway = new FakeGateway();
            gateway.Append.Blockers.Add(new TargetBlocker(BlockerKind.HeadersChanged));
            var plan = await QuoteService.PlanAppendAsync(gateway, "CQ_Quote_1", false);
            Assert.Equal(PlanStatus.Blocked, plan.Status);
            await Assert.ThrowsAsync<InvalidOperationException>(() => QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow }, true, None));
        }

        [Fact]
        public async Task Append_BlankRowAvailable_FillsWithoutAsking_ManyRowsStillAsk()
        {
            var gateway = new FakeGateway();
            gateway.Append.CellsBelow = new OccupiedCells { Count = 1, Sample = { "A40" } };
            gateway.Append.FillIndex = 3;
            var plan = await QuoteService.PlanAppendAsync(gateway, "CQ_Quote_1", false);
            Assert.Equal(PlanStatus.Ready, plan.Status);
            await QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow }, false, None);
            Assert.Equal((1, (int?)null, (int?)3), gateway.Appends[0]);
            await Assert.ThrowsAsync<InvalidOperationException>(() => QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow, OneRow }, false, None));
            await QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow, OneRow }, true, None);
            Assert.Equal((2, (int?)null, (int?)null), gateway.Appends[1]);
        }

        [Fact]
        public async Task Append_ChangedWhileConfirming_ReturnsNull()
        {
            var gateway = new FakeGateway();
            var plan = await QuoteService.PlanAppendAsync(gateway, "CQ_Quote_1", false);
            gateway.ChangedBeforeWrite = true;
            Assert.Null(await QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow }, false, None));
            Assert.Empty(gateway.Appends);
        }

        [Fact]
        public async Task Append_BelowSelection_UsesFixedIndex()
        {
            var gateway = new FakeGateway();
            gateway.Append.InsertIndex = 2;
            var plan = await QuoteService.PlanAppendAsync(gateway, "CQ_Quote_1", true);
            Assert.Equal(new[] { true }, gateway.InspectedPositions);
            await QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow }, false, None);
            Assert.Equal(2, gateway.Appends[0].Insert);
        }

        [Fact]
        public async Task Append_SelectionOutsideTable_Blocked()
        {
            var gateway = new FakeGateway();
            gateway.Append.Blockers.Add(new TargetBlocker(BlockerKind.SelectionOutsideTable));
            var plan = await QuoteService.PlanAppendAsync(gateway, "CQ_Quote_1", true);
            Assert.Equal(PlanStatus.Blocked, plan.Status);
            await Assert.ThrowsAsync<InvalidOperationException>(() => QuoteService.ExecuteAppendAsync(gateway, plan, new[] { OneRow }, true, None));
            Assert.Empty(gateway.Appends);
        }

        [Fact]
        public void Layout_RowsAndColumns()
        {
            var layout = QuoteTemplate.BuildLayout(5);
            Assert.Equal((12, 13, 5, 18, 19, 14), (layout.HeaderRow, layout.FirstDataRow, layout.DataRowCount, layout.TotalRow, layout.RowCount, layout.ColumnCount));
            Assert.Equal(Enumerable.Range(1, 10), layout.InfoRows.Select(r => r.Row));
            var small = QuoteTemplate.BuildLayout(3);
            Assert.Equal(small.TotalRow, small.RowCount - 1);
            Assert.Equal(1, QuoteTemplate.ClampInitialRows(0));
            Assert.Equal(QuoteTemplate.MaxInitialRows, QuoteTemplate.ClampInitialRows(10000));
            Assert.Equal(QuoteTemplate.DefaultInitialRows, QuoteTemplate.ClampInitialRows(double.NaN));
            Assert.Equal(7, QuoteTemplate.ClampInitialRows(7.9));
        }

        [Fact]
        public void Headers_AcceptExtraOrReordered_RefuseRenamedMissingDuplicate()
        {
            var headers = QuoteTemplate.Columns.Select(c => c.Header).ToList();
            Assert.True(QuoteTemplate.HasQuoteHeaders(headers));
            Assert.True(QuoteTemplate.HasQuoteHeaders(headers.Concat(new[] { "Column1" }).ToList()));
            Assert.True(QuoteTemplate.HasQuoteHeaders(new[] { headers[1], headers[0] }.Concat(headers.Skip(2)).ToList()));
            Assert.False(QuoteTemplate.HasQuoteHeaders(headers.Take(8).Concat(new[] { "Note" }).ToList()));
            Assert.False(QuoteTemplate.HasQuoteHeaders(headers.Take(8).ToList()));
            Assert.False(QuoteTemplate.HasQuoteHeaders(headers.Concat(new[] { "Ghi chú" }).ToList()));
        }

        [Fact]
        public void AlignRow_ByHeaderName()
        {
            var headers = QuoteTemplate.Columns.Select(c => c.Header).ToList();
            var row = new object[] { "stt", "code", "group", "desc", "unit", 1m, 2m, "amount", "notes" };
            Assert.Equal(row, QuoteTemplate.AlignRow(headers, row));
            var custom = new[] { "Column1" }.Concat(Enumerable.Reverse(headers)).ToList();
            Assert.Equal(new object?[] { null }.Concat(row.Reverse()), QuoteTemplate.AlignRow(custom, row));
            Assert.Null(QuoteTemplate.AlignRow(headers.Skip(1).ToList(), row));
            var withExtra = headers.Concat(new[] { "Cột riêng", QuoteTemplate.LineIdHeader }).ToList();
            var aligned = QuoteTemplate.AlignRow(withExtra, row, new Dictionary<string, object> { [QuoteTemplate.LineIdHeader] = "L9", ["Không có"] = 1 })!;
            Assert.Equal(new object?[] { null, "L9" }, aligned.Skip(9));
        }

        [Fact]
        public void BlankRows_FlagsAndFill()
        {
            var headers = QuoteTemplate.Columns.Select(c => c.Header).Concat(new[] { "Cột riêng" }).ToList();
            object?[] blank = { "=ROW()-1", "", "", "", "", "", "", "=IF(1,\"\",1)", "", "=X1" };
            object?[] filled = { "=ROW()-1", "", "", "Đào đất", "", "", "", "=IF(1,\"\",1)", "", "" };
            object?[] userColumn = { "=ROW()-1", "", "", "", "", "", "", "", "", "x" };
            Assert.Equal(new[] { true, false, true }, QuoteTemplate.BlankRowFlags(headers, new IReadOnlyList<object?>[] { blank, filled, userColumn }));
            Assert.Equal(new[] { false }, QuoteTemplate.BlankRowFlags(headers, new IReadOnlyList<object?>[] { new object?[] { "", "", "", "", "", "", 0.0, "", "", "" } }));
            Assert.Equal(3, QuoteTemplate.BlankRowToFill(new[] { false, true, false, true, true }, null));
            Assert.Equal(0, QuoteTemplate.BlankRowToFill(new[] { true, true, true }, null));
            Assert.Null(QuoteTemplate.BlankRowToFill(new[] { true, false }, null));
            Assert.Equal(1, QuoteTemplate.BlankRowToFill(new[] { false, true, false }, 1));
            Assert.Equal(1, QuoteTemplate.BlankRowToFill(new[] { false, true, false }, 2));
            Assert.Null(QuoteTemplate.BlankRowToFill(new[] { false, false, false }, 2));
            Assert.Equal(0, QuoteTemplate.BlankRowToFill(new[] { true, true }, 1));
            Assert.Equal(0, QuoteTemplate.BlankRowToFill(new[] { true }, 1));
        }

        [Fact]
        public void Naming_UniqueSheet_Table_Check()
        {
            Assert.Equal("Báo giá", Naming.UniqueSheetName("Báo giá", new[] { "Sheet1" }));
            Assert.Equal("Báo giá (2)", Naming.UniqueSheetName("Báo giá", new[] { "báo giá" }));
            Assert.Equal("Báo giá (3)", Naming.UniqueSheetName("Báo giá", new[] { "Báo giá", "Báo giá (2)" }));
            var longName = "Báo giá công trình nhà xưởng khu A";
            var name = Naming.UniqueSheetName(longName, new[] { longName.Substring(0, 31) });
            Assert.True(name.Length <= 31 && name.EndsWith("(2)"));
            Assert.Equal("Báo giá  A", Naming.SanitizeSheetName("Báo/giá:[A]*?"));
            Assert.Equal("Báo giá", Naming.SanitizeSheetName("'Báo giá'"));
            Assert.Equal("Sheet", Naming.SanitizeSheetName("///"));
            Assert.Equal("CQ_Quote_1", Naming.UniqueQuoteTableName(new string[0]));
            Assert.Equal("CQ_Quote_3", Naming.UniqueQuoteTableName(new[] { "CQ_Quote_1", "cq_quote_2", "Table1" }));
            Assert.Equal("CQ_Quote_1", Naming.UniqueQuoteTableName(new[] { "CQ_Quote_2" }));
            Assert.True(Naming.IsQuoteTableName("CQ_Quote_12"));
            Assert.False(Naming.IsQuoteTableName("CQ_Quote_"));
            Assert.False(Naming.IsQuoteTableName("Table1"));
            Assert.Equal("History (2)", Naming.UniqueSheetName("History", new string[0]));
            Assert.Equal("history (2)", Naming.UniqueSheetName("history", new string[0]));
            var tricky = "x" + new string('x', 28) + "' tail";
            var cut = Naming.UniqueSheetName(tricky, new string[0]);
            Assert.False(cut.EndsWith("'"));
            Assert.True(cut.Length <= 31);
            Assert.Null(Naming.CheckSheetName("  Báo giá A  "));
            foreach (var bad in new[] { "", "Báo/giá", "'Báo giá", new string('x', 32), "HISTORY" })
            {
                Assert.NotNull(Naming.CheckSheetName(bad));
            }
        }

        [Fact]
        public void Draft_LiteralText_Validation_RowOrder()
        {
            foreach (var (text, expected) in new[] { ("007", "'007"), ("1/2", "'1/2"), ("10%", "'10%"), ("", ""), ("=HYPERLINK(\"x\")", "'=HYPERLINK(\"x\")"), ("+1", "'+1"), ("Đào móng", "'Đào móng") })
            {
                Assert.Equal(expected, WorkItemDraft.AsLiteralText(text));
            }
            var empty = WorkItemDraft.Validate(new WorkItemDraftInput(), "CQ_Quote_1");
            Assert.False(empty.Ok);
            Assert.Equal(new[] { DraftFields.Description }, empty.Errors.Select(e => e.Field));

            var blank = WorkItemDraft.Validate(new WorkItemDraftInput { Description = "Đổ bê tông móng" }, "CQ_Quote_1");
            Assert.True(blank.Ok);
            Assert.Equal("", blank.Row[5]);
            Assert.Equal("", blank.Row[6]);

            var full = WorkItemDraft.Validate(new WorkItemDraftInput { Description = "Đổ bê tông móng", Code = "BT-01", Unit = "m3", Quantity = "12,5", UnitPrice = "1500000", Notes = "=SUM(A1)" }, "CQ_Quote_2");
            Assert.Equal("=ROW()-ROW(CQ_Quote_2[#Headers])", full.Row[0]);
            Assert.Equal("'BT-01", full.Row[1]);
            Assert.Equal("'Đổ bê tông móng", full.Row[3]);
            Assert.Equal("'m3", full.Row[4]);
            Assert.Equal(12.5m, full.Row[5]);
            Assert.Equal(1500000m, full.Row[6]);
            Assert.Contains("[@[Khối lượng]]*[@[Đơn giá]]", (string)full.Row[7]);
            Assert.Equal("'=SUM(A1)", full.Row[8]);

            var rounded = WorkItemDraft.Validate(new WorkItemDraftInput { Description = "x", Quantity = "1", UnitPrice = "2" }, "CQ_Quote_1", new RoundingRule(RoundingMode.Round, -3));
            Assert.Equal("=IF(OR([@[Khối lượng]]=\"\",[@[Đơn giá]]=\"\"),\"\",ROUND([@[Khối lượng]]*[@[Đơn giá]],-3))", rounded.Row[7]);

            var bad = WorkItemDraft.Validate(new WorkItemDraftInput { Description = "x", Quantity = "-1", UnitPrice = "1.234,5" }, "CQ_Quote_1");
            Assert.Equal(new[] { DraftFields.Quantity, DraftFields.UnitPrice }, bad.Errors.Select(e => e.Field));
        }

        [Fact]
        public void NormalizeDecimal_FromCell_FifteenDigits()
        {
            Assert.Equal(0.3m, Sheet.ToDecimal(0.30000000000000004));
            Assert.Null(Sheet.ToDecimal("x"));
            Assert.Null(Sheet.ToDecimal(double.NaN));
            Assert.Null(Sheet.ToDecimal(1e30));
            Assert.True(Sheet.SameNumber(0.1 + 0.2, 0.3m));
            Assert.Equal(1.5m, DecimalMath.Normalize(1.50m));
        }

        [Fact]
        public void WorkbookSettings_RoundTrip_BadPartIgnored()
        {
            var settings = new JObject { [WorkbookSettings.LibraryUsedKey] = true };
            var xml = WorkbookSettings.Encode(settings);
            Assert.True(WorkbookSettings.LibraryUsed(WorkbookSettings.Decode(xml)));
            Assert.Null(WorkbookSettings.RoundingOf(WorkbookSettings.Decode(xml)));
            Assert.False(WorkbookSettings.LibraryUsed(WorkbookSettings.Decode("<settings/>")));
            Assert.False(WorkbookSettings.LibraryUsed(WorkbookSettings.Decode("<settings><data>{hỏng</data></settings>")));
            var withRounding = WorkbookSettings.Decode(WorkbookSettings.Encode(new JObject
            {
                [WorkbookSettings.RoundingKey] = new JObject { ["amount"] = new JObject { ["mode"] = "round", ["digits"] = -3 } },
            }));
            var rounding = WorkbookSettings.RoundingOf(withRounding)!;
            Assert.Equal(new RoundingRule(RoundingMode.Round, -3), rounding.Amount);
            Assert.Equal(Rounding.NoRounding, rounding.UnitPrice);
        }

        [Fact]
        public void NormExplanation_LiteralUserText_FormulasAndSummary()
        {
            var a = Res("rA", ResourceType.Material, "kg", "=Tên lạ", "007");
            var result = NormCalc.Calculate(Norm(), new[] { Comp("c1", a, 2, 0.05m) }, Lib(new[] { a }, new[] { Price("p1", "rA", 10000, "kg") }), new CalcOptions("2026-10-27", T));
            var sheet = NormExplanation.Build(Norm(), result, "2026-10-27");
            Assert.Equal("Diễn giải THU-DM-01 v1", sheet.SheetName);
            var first = sheet.Rows[NormExplanation.HeaderRowIndex + 1];
            Assert.Equal("'007", first[2]);
            Assert.Equal("'=Tên lạ", first[3]);
            Assert.Equal("=F7*(1+G7)", first[7]);
            Assert.Equal("=H7*I7", first[9]);
            Assert.Equal(12, sheet.Rows[sheet.SummaryRow].Length);
            Assert.Equal("=SUM(J7:J7)", sheet.Rows[sheet.SummaryRow + 5][9]);
            Assert.Equal(21000m, sheet.Rows[sheet.SummaryRow + 5][10]);
            Assert.StartsWith("=SUMIF(B7:B7,\"Vật liệu\",J7:J7)", (string)sheet.Rows[sheet.SummaryRow + 1][9]!);
        }
    }
}
