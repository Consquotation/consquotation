using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Pricing;

namespace ConsQuotation.Core.Quotation
{
    public enum PlanStatus
    {
        Blocked,
        /// <summary>Vùng đích có dữ liệu: chỉ ghi khi người dùng xác nhận ghi đè.</summary>
        NeedsOverwriteConfirmation,
        /// <summary>Vùng trống trên sheet có sẵn: hiển thị vị trí ghi để người dùng xác nhận.</summary>
        NeedsLocationConfirmation,
        /// <summary>Có dữ liệu dưới bảng sẽ bị đẩy xuống: cần xác nhận.</summary>
        NeedsShiftConfirmation,
        Ready,
    }

    public sealed class TemplatePlan
    {
        public PlanStatus Status { get; set; }
        public TargetInspection Inspection { get; set; } = new TargetInspection();
    }

    public sealed class AppendPlan
    {
        public PlanStatus Status { get; set; }
        public AppendInspection Inspection { get; set; } = new AppendInspection();
    }

    /// <summary>
    /// Tạo bảng báo giá và thêm dòng công tác, chuyển từ src/application/quoteService.ts: kiểm tra vùng đích →
    /// hỏi xác nhận khi cần → ghi, và kiểm tra lại ngay khi ghi. Kết quả null = workbook đã đổi, không ghi gì.
    /// </summary>
    public static class QuoteService
    {
        public static async Task<TemplatePlan> PlanTemplateAsync(IQuoteGateway gateway, bool newSheet, int initialRows, string sheetBaseName = Naming.DefaultQuoteSheetName)
        {
            var layout = QuoteTemplate.BuildLayout(initialRows);
            var inspection = newSheet
                ? await gateway.InspectTargetAsync(new TemplateTarget { BaseName = sheetBaseName }, layout.RowCount, layout.ColumnCount)
                : await gateway.InspectAtSelectionAsync(layout.RowCount, layout.ColumnCount);
            var status = inspection.Blockers.Count > 0 ? PlanStatus.Blocked
                : inspection.Occupied.Count > 0 ? PlanStatus.NeedsOverwriteConfirmation
                : !inspection.Target.IsNewSheet ? PlanStatus.NeedsLocationConfirmation
                : PlanStatus.Ready;
            return new TemplatePlan { Status = status, Inspection = inspection };
        }

        public static async Task<CreatedQuote?> ExecuteTemplateAsync(IQuoteGateway gateway, TemplatePlan plan, int initialRows, bool overwriteConfirmed)
        {
            if (plan.Status == PlanStatus.Blocked)
            {
                throw new InvalidOperationException("Không thể ghi vào vùng đích đang bị chặn.");
            }
            if (plan.Status == PlanStatus.NeedsOverwriteConfirmation && !overwriteConfirmed)
            {
                throw new InvalidOperationException("Cần xác nhận ghi đè trước khi ghi vào vùng có dữ liệu.");
            }
            try
            {
                return await gateway.WriteTemplateAsync(plan.Inspection.Target, QuoteTemplate.BuildLayout(initialRows).DataRowCount, plan.Inspection.Fingerprint);
            }
            catch (TargetChangedException)
            {
                return null;
            }
        }

        public static async Task<AppendPlan> PlanAppendAsync(IQuoteGateway gateway, string tableName, bool belowSelection)
        {
            var inspection = await gateway.InspectAppendAsync(tableName, belowSelection);
            var status = inspection.Blockers.Count > 0 ? PlanStatus.Blocked
                : inspection.CellsBelow.Count > 0 && inspection.FillIndex == null ? PlanStatus.NeedsShiftConfirmation
                : PlanStatus.Ready;
            return new AppendPlan { Status = status, Inspection = inspection };
        }

        public static async Task<AppendedRows?> ExecuteAppendAsync(IQuoteGateway gateway, AppendPlan plan, IReadOnlyList<object[]> rows, bool shiftConfirmed, IReadOnlyList<IReadOnlyDictionary<string, object>> extras)
        {
            if (plan.Status == PlanStatus.Blocked)
            {
                throw new InvalidOperationException("Không thể thêm dòng vào bảng đang bị chặn.");
            }
            // Chỉ ghi vào dòng trống khi thêm đúng 1 dòng; nhiều dòng thì chèn như thường.
            var fillIndex = rows.Count == 1 ? plan.Inspection.FillIndex : null;
            if (fillIndex == null && plan.Inspection.CellsBelow.Count > 0 && !shiftConfirmed)
            {
                throw new InvalidOperationException("Cần xác nhận trước khi đẩy dữ liệu bên dưới bảng xuống.");
            }
            try
            {
                return await gateway.AppendRowsAsync(plan.Inspection.TableName, rows, plan.Inspection.Fingerprint, plan.Inspection.InsertIndex, fillIndex, extras);
            }
            catch (TargetChangedException)
            {
                return null;
            }
        }

        /// <summary>Ưu tiên bảng đang chứa vùng chọn, rồi lựa chọn hiện tại, rồi bảng đúng mẫu đầu tiên.</summary>
        public static string PreferredTable(IReadOnlyList<QuoteTableInfo> list, string current) =>
            (list.FirstOrDefault(t => t.ContainsSelection)
             ?? list.FirstOrDefault(t => t.TableName == current)
             ?? list.FirstOrDefault(t => t.HeadersMatch)
             ?? list.FirstOrDefault())?.TableName ?? "";
    }

    public enum QuotationState
    {
        NoRecord,
        Draft,
        Completed,
        ModifiedAfterCompletion,
        Unreadable,
    }

    public sealed class QuotationView
    {
        public string TableName { get; set; } = "";
        public string SheetName { get; set; } = "";
        public int FirstColumnIndex { get; set; }
        public RecordRead Record { get; set; } = RecordRead.None();
        public QuotationEvaluation Evaluation { get; set; } = new QuotationEvaluation();
        public QuoteCheckResult Check { get; set; } = new QuoteCheckResult();
        public QuotationState State { get; set; }
        public int PendingAssignIds { get; set; }
        public int PendingRemoveItems { get; set; }
        public int PendingWriteBreakdown { get; set; }
        public List<string> Blockers { get; set; } = new List<string>();
    }

    public enum OutcomeStatus
    {
        Done,
        /// <summary>Workbook đã đổi so với lúc xem: không ghi gì (hoặc dừng ở bước kiểm tra), cần xem lại.</summary>
        Changed,
        Blocked,
    }

    public sealed class WriteOutcome<T> where T : class
    {
        public OutcomeStatus Status { get; set; }
        public T? Value { get; set; }
        public List<string> Reasons { get; set; } = new List<string>();

        public static WriteOutcome<T> Done(T value) => new WriteOutcome<T> { Status = OutcomeStatus.Done, Value = value };
        public static WriteOutcome<T> Changed() => new WriteOutcome<T> { Status = OutcomeStatus.Changed };
        public static WriteOutcome<T> Blocked(params string[] reasons) => new WriteOutcome<T> { Status = OutcomeStatus.Blocked, Reasons = reasons.ToList() };
    }

    public sealed class RecalcSummary
    {
        public int Assigned { get; set; }
        public int Copied { get; set; }
        public int Removed { get; set; }
        public int BreakdownWritten { get; set; }
        /// <summary>Báo giá đang "hoàn tất" bị đưa về nháp vì nội dung đã đổi.</summary>
        public bool CompletionCleared { get; set; }
    }

    public sealed class LibraryUpdateSummary
    {
        public int AnalysisCells { get; set; }
        public int UnitPriceCells { get; set; }
        public int AffectedLines { get; set; }
        public bool CompletionCleared { get; set; }
    }

    /// <summary>
    /// Quản lý báo giá theo dòng, chuyển từ src/application/quotationService.ts. Nguồn dữ liệu: bảng báo giá và sheet
    /// phân tích (đọc lại mỗi lần) cộng hồ sơ trong workbook. Không có giao dịch giữa ô Excel và hồ sơ: luôn ghi ô
    /// trước (có kiểm tra giá trị cũ), lưu hồ sơ sau; lỗi ở bước sau thì lần Tính lại và lưu kế tiếp đồng bộ lại.
    /// </summary>
    public sealed class QuotationService
    {
        private sealed class Workspace
        {
            public QuoteSnapshot Snapshot { get; set; } = new QuoteSnapshot();
            public RoundingRule UnitPriceRule { get; set; } = Rounding.NoRounding;
            public RecordRead Record { get; set; } = RecordRead.None();
            public LibrarySnapshot? Library { get; set; }
        }

        private readonly IQuoteGateway gateway;
        private readonly Func<DateTime> nowUtc;
        private readonly Func<string> newId;
        private readonly Func<LibrarySnapshot?> loadLibrary;

        public QuotationService(IQuoteGateway gateway, Func<DateTime> nowUtc, Func<string> newId, Func<LibrarySnapshot?> loadLibrary)
        {
            this.gateway = gateway;
            this.nowUtc = nowUtc;
            this.newId = newId;
            this.loadLibrary = loadLibrary;
        }

        private static readonly string UnitPriceHeader = QuoteTemplate.HeaderOf(QuoteColumnKey.UnitPrice);
        private static readonly string AnalysisPriceHeader = Analysis.HeaderOf(AnalysisColumnKey.Price);
        private static readonly string AnalysisSourceHeader = Analysis.HeaderOf(AnalysisColumnKey.Source);

        private string Stamp() => nowUtc().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        private async Task<Workspace> ReadAsync(string tableName, bool withLibrary = true)
        {
            var snapshot = await gateway.ReadQuoteSnapshotAsync(tableName);
            var rounding = await gateway.ReadRoundingAsync();
            var record = await gateway.ReadRecordAsync(tableName);
            LibrarySnapshot? library = null;
            if (withLibrary)
            {
                try
                {
                    library = loadLibrary();
                }
                catch (Exception ex) when (ex is Storage.LibraryStorageException || ex is System.IO.IOException)
                {
                    // Không đọc được thư viện: vẫn đánh giá được báo giá, chỉ bỏ phần so sánh thư viện.
                }
            }
            return new Workspace { Snapshot = snapshot, UnitPriceRule = rounding.UnitPrice, Record = record, Library = library };
        }

        private (QuoteCheckResult Check, QuotationEvaluation Evaluation) Evaluate(Workspace ws, QuotationRecord? record)
        {
            var check = QuoteChecker.Check(ws.Snapshot, ws.Library);
            return (check, QuotationEvaluator.Evaluate(ws.Snapshot, record, check, ws.UnitPriceRule, ws.Library, Stamp()));
        }

        public async Task<QuotationView> LoadAsync(string tableName)
        {
            var ws = await ReadAsync(tableName);
            var record = ws.Record.Kind == RecordReadKind.Ok ? ws.Record.Record : null;
            var (check, evaluation) = Evaluate(ws, record);
            // Chạy thử (không ghi) để báo trước số việc sẽ làm; mã tạm chỉ cần khác nhau.
            var dryRunId = 0;
            var dryRun = Reconciler.Reconcile(QuoteLineReader.Read(ws.Snapshot).Lines, record, tableName, Stamp(), () => $"dry-run-{++dryRunId}");
            QuotationState state;
            if (ws.Record.Kind == RecordReadKind.Unreadable)
            {
                state = QuotationState.Unreadable;
            }
            else if (record == null)
            {
                state = QuotationState.NoRecord;
            }
            else if (record.Status == QuotationStatus.Completed)
            {
                state = record.CompletedFingerprint == evaluation.Fingerprint ? QuotationState.Completed : QuotationState.ModifiedAfterCompletion;
            }
            else
            {
                state = QuotationState.Draft;
            }
            var blockers = QuotationEvaluator.CompletionBlockers(evaluation);
            if (ws.Record.Kind == RecordReadKind.Unreadable)
            {
                blockers.Insert(0, ws.Record.Message);
            }
            return new QuotationView
            {
                TableName = tableName,
                SheetName = ws.Snapshot.Quote.SheetName,
                FirstColumnIndex = ws.Snapshot.Quote.FirstColumnIndex,
                Record = ws.Record,
                Evaluation = evaluation,
                Check = check,
                State = state,
                PendingAssignIds = evaluation.HasLineIds ? dryRun.Assignments.Count : 0,
                PendingRemoveItems = dryRun.Removed.Count,
                PendingWriteBreakdown = evaluation.Lines.Count(l => l.BreakdownWrite != null),
                Blockers = blockers,
            };
        }

        /// <summary>Ghi kết quả tính mới nhất vào hồ sơ và lưu; đưa báo giá về nháp nếu nội dung khác lúc hoàn tất.</summary>
        private async Task<bool> PersistAsync(string tableName, QuotationRecord record, string? expectedUpdatedAt)
        {
            var ws = await ReadAsync(tableName);
            var evaluation = Evaluate(ws, record).Evaluation;
            var now = Stamp();
            var byId = evaluation.Lines.Where(l => l.Item != null).GroupBy(l => l.Item!.Id).ToDictionary(g => g.Key, g => g.Last());
            var next = record.Shallow();
            next.Items = record.Items.Select(item =>
            {
                if (!byId.TryGetValue(item.Id, out var line))
                {
                    return item;
                }
                var copy = item.Shallow();
                copy.Result = line.Result;
                copy.WrittenBreakdown = WrittenBreakdownOf(line, item);
                copy.UpdatedAt = now;
                return copy;
            }).ToList();
            next.UpdatedAt = now;
            var completionCleared = record.Status == QuotationStatus.Completed && record.CompletedFingerprint != evaluation.Fingerprint;
            if (completionCleared)
            {
                next.Status = QuotationStatus.Draft;
                next.CompletedAt = null;
                next.CompletedFingerprint = null;
            }
            await gateway.SaveRecordAsync(next, expectedUpdatedAt);
            return completionCleared;
        }

        private static async Task<WriteOutcome<T>> GuardedAsync<T>(Func<Task<WriteOutcome<T>>> task) where T : class
        {
            try
            {
                return await task();
            }
            catch (Exception ex) when (ex is TargetChangedException || ex is RecordChangedException)
            {
                return WriteOutcome<T>.Changed();
            }
        }

        /// <summary>
        /// Tính lại và lưu: gán Mã dòng cho dòng chưa có/dòng sao chép, ghi đơn giá thành phần cho dòng phân tích,
        /// cập nhật hồ sơ (bỏ mục của dòng đã xóa), lưu kết quả tính của từng dòng.
        /// </summary>
        public Task<WriteOutcome<RecalcSummary>> RecalculateAsync(string tableName, string expectedFingerprint) => GuardedAsync(async () =>
        {
            var ws = await ReadAsync(tableName);
            if (ws.Record.Kind == RecordReadKind.Unreadable)
            {
                return WriteOutcome<RecalcSummary>.Blocked(ws.Record.Message);
            }
            var current = ws.Record.Kind == RecordReadKind.Ok ? ws.Record.Record : null;
            var expectedUpdatedAt = current?.UpdatedAt;
            var first = Evaluate(ws, current).Evaluation;
            if (first.Fingerprint != expectedFingerprint)
            {
                return WriteOutcome<RecalcSummary>.Changed();
            }
            if (!first.HasLineIds)
            {
                return WriteOutcome<RecalcSummary>.Blocked("Bảng chưa có cột Mã dòng: bấm Bổ sung cột quản lý theo dòng trước.");
            }
            var lines = QuoteLineReader.Read(ws.Snapshot).Lines;
            var rec = Reconciler.Reconcile(lines, current, tableName, Stamp(), newId);
            if (rec.Assignments.Count > 0)
            {
                var byRow = lines.ToDictionary(l => l.Row);
                await gateway.WriteLineCellsAsync(tableName,
                    rec.Assignments.Select(a => new LineCellWrite { Row = a.Row, Header = QuoteTemplate.LineIdHeader, Value = a.LineId, Expected = byRow[a.Row].LineId ?? "" }).ToList(),
                    rec.Assignments.Select(a => IdentityGuard(ws.Snapshot, byRow[a.Row])).ToList());
            }

            // Đơn giá thành phần theo dữ liệu vừa ghi mã dòng.
            var ws2 = await ReadAsync(tableName);
            var second = Evaluate(ws2, rec.Record).Evaluation;
            var breakdown = BreakdownCellWrites(second.Lines);
            if (breakdown.Writes.Count > 0)
            {
                await gateway.WriteLineCellsAsync(tableName, breakdown.Writes, breakdown.Guards);
            }
            var cleared = await PersistAsync(tableName, rec.Record, expectedUpdatedAt);
            return WriteOutcome<RecalcSummary>.Done(new RecalcSummary
            {
                Assigned = rec.Assignments.Count(a => !a.Duplicate),
                Copied = rec.Copied,
                Removed = rec.Removed.Count,
                BreakdownWritten = breakdown.Lines,
                CompletionCleared = cleared,
            });
        });

        /// <summary>Đánh dấu hoàn tất: chỉ khi không còn dòng lỗi, lỗi bảng, và hồ sơ đã đồng bộ với sheet.</summary>
        public Task<WriteOutcome<string>> CompleteAsync(string tableName, string expectedFingerprint) => GuardedAsync(async () =>
        {
            var ws = await ReadAsync(tableName);
            if (ws.Record.Kind != RecordReadKind.Ok)
            {
                return WriteOutcome<string>.Blocked(ws.Record.Kind == RecordReadKind.Unreadable ? ws.Record.Message : "Báo giá chưa có hồ sơ: bấm Tính lại và lưu trước.");
            }
            var record = ws.Record.Record!;
            var evaluation = Evaluate(ws, record).Evaluation;
            if (evaluation.Fingerprint != expectedFingerprint)
            {
                return WriteOutcome<string>.Changed();
            }
            var blockers = QuotationEvaluator.CompletionBlockers(evaluation);
            if (blockers.Count > 0)
            {
                return WriteOutcome<string>.Blocked(blockers.ToArray());
            }
            var now = Stamp();
            var byId = evaluation.Lines.Where(l => l.Item != null).ToDictionary(l => l.Item!.Id);
            var next = record.Shallow();
            next.Status = QuotationStatus.Completed;
            next.CompletedAt = now;
            next.CompletedFingerprint = evaluation.Fingerprint;
            next.UpdatedAt = now;
            next.Items = record.Items.Select(item =>
            {
                if (!byId.TryGetValue(item.Id, out var line))
                {
                    return item;
                }
                var copy = item.Shallow();
                copy.Result = line.Result;
                copy.UpdatedAt = now;
                return copy;
            }).ToList();
            await gateway.SaveRecordAsync(next, record.UpdatedAt);
            return WriteOutcome<string>.Done(now);
        });

        /// <summary>Mở lại để sửa: trạng thái về nháp (không đổi dữ liệu trên sheet).</summary>
        public Task<WriteOutcome<string>> ReopenAsync(string tableName) => GuardedAsync(async () =>
        {
            var read = await gateway.ReadRecordAsync(tableName);
            if (read.Kind != RecordReadKind.Ok)
            {
                return WriteOutcome<string>.Blocked(read.Kind == RecordReadKind.Unreadable ? read.Message : "Báo giá chưa có hồ sơ.");
            }
            var now = Stamp();
            var next = read.Record!.Shallow();
            next.Status = QuotationStatus.Draft;
            next.CompletedAt = null;
            next.CompletedFingerprint = null;
            next.UpdatedAt = now;
            await gateway.SaveRecordAsync(next, read.Record.UpdatedAt);
            return WriteOutcome<string>.Done(now);
        });

        /// <summary>
        /// Cập nhật một dòng theo thư viện hiện tại (người dùng chủ động bấm): dòng lấy từ thư viện ghi đơn giá mới
        /// vào ô Đơn giá; dòng phân tích ghi giá nguồn mới lên sheet phân tích (dùng chung mọi dòng cùng mã), rồi ghi
        /// đơn giá công tác do Excel tính lại vào các dòng cùng mã.
        /// </summary>
        public Task<WriteOutcome<LibraryUpdateSummary>> ApplyLibraryUpdateAsync(string tableName, string lineId, string expectedFingerprint) => GuardedAsync(async () =>
        {
            var ws = await ReadAsync(tableName);
            if (ws.Record.Kind != RecordReadKind.Ok)
            {
                return WriteOutcome<LibraryUpdateSummary>.Blocked("Báo giá chưa có hồ sơ: bấm Tính lại và lưu trước.");
            }
            var record = ws.Record.Record!;
            var evaluation = Evaluate(ws, record).Evaluation;
            if (evaluation.Fingerprint != expectedFingerprint)
            {
                return WriteOutcome<LibraryUpdateSummary>.Changed();
            }
            var target = evaluation.Lines.FirstOrDefault(l => l.Line.LineId == lineId && l.Item != null);
            var plan = target?.Plan;
            if (target == null || plan == null)
            {
                return WriteOutcome<LibraryUpdateSummary>.Blocked("Dòng này không có thay đổi nào từ thư viện để cập nhật.");
            }
            var now = Stamp();

            if (plan.Prices == null)
            {
                await gateway.WriteLineCellsAsync(tableName,
                    new[] { new LineCellWrite { Row = target.Line.Row, Header = UnitPriceHeader, Value = plan.NewPrice, Expected = target.Line.UnitPrice.Value } },
                    new[] { IdentityGuard(ws.Snapshot, target.Line) });
                var libraryRecord = record.Shallow();
                libraryRecord.UpdatedAt = now;
                libraryRecord.Items = record.Items.Select(item =>
                {
                    if (item.Id != lineId || item.LibraryPrice == null)
                    {
                        return item;
                    }
                    var copy = item.Shallow();
                    copy.LibraryPrice = new LibraryPriceSnapshot { WorkItemId = item.LibraryPrice.WorkItemId, UnitPrice = plan.NewPrice, Currency = item.LibraryPrice.Currency };
                    copy.UpdatedAt = now;
                    return copy;
                }).ToList();
                var clearedLibrary = await PersistAsync(tableName, libraryRecord, record.UpdatedAt);
                return WriteOutcome<LibraryUpdateSummary>.Done(new LibraryUpdateSummary { UnitPriceCells = 1, AffectedLines = 1, CompletionCleared = clearedLibrary });
            }

            // Dòng phân tích: giá nguồn trên sheet phân tích.
            var rows = LineCalc.RowsFor(ws.Snapshot.Analysis ?? new List<AnalysisLine>(), target.Line.Code);
            var analysisWrites = new List<AnalysisCellWrite>();
            foreach (var update in plan.Prices)
            {
                foreach (var r in rows.Where(r => Names.NormalizeCode(r.ResourceCode) == Names.NormalizeCode(update.ResourceCode)))
                {
                    analysisWrites.Add(new AnalysisCellWrite { RowIndex = r.RowIndex, Header = AnalysisPriceHeader, Value = update.NewPrice, Expected = r.Price });
                    analysisWrites.Add(new AnalysisCellWrite { RowIndex = r.RowIndex, Header = AnalysisSourceHeader, Value = UpdatedSource(update, target.Item!, now), Expected = r.Source });
                }
            }
            if (analysisWrites.Count == 0)
            {
                return WriteOutcome<LibraryUpdateSummary>.Blocked("Không tìm thấy dòng tài nguyên tương ứng trên sheet phân tích (có thể đã bị sửa mã).");
            }
            await gateway.WriteAnalysisCellsAsync(analysisWrites);

            // Excel đã tính lại đơn giá công tác: ghi vào mọi dòng báo giá cùng mã.
            var ws2 = await ReadAsync(tableName, false);
            var code = Names.NormalizeCode(target.Line.Code);
            var fresh = LineCalc.RowsFor(ws2.Snapshot.Analysis ?? new List<AnalysisLine>(), target.Line.Code).FirstOrDefault(r => r.UnitPriceType != "Error");
            var freshLines = QuoteLineReader.Read(ws2.Snapshot).Lines;
            var sameCode = freshLines.Where(l => Names.NormalizeCode(l.Code) == code && Reconciler.InferMethod(l.Notes) == QuotationPricingMethod.Norm).ToList();
            var unitPriceCells = 0;
            if (fresh?.UnitPrice is double freshPrice)
            {
                var targets = sameCode.Where(l => !(l.UnitPrice.Value is double v && v == freshPrice)).ToList();
                if (targets.Count > 0)
                {
                    await gateway.WriteLineCellsAsync(tableName,
                        targets.Select(l => new LineCellWrite { Row = l.Row, Header = UnitPriceHeader, Value = freshPrice, Expected = l.UnitPrice.Value }).ToList(),
                        targets.Select(l => IdentityGuard(ws2.Snapshot, l)).ToList());
                    unitPriceCells = targets.Count;
                }
            }

            // Snapshot giá trong hồ sơ của mọi dòng dùng chung khối phân tích.
            var sharing = new HashSet<string>(freshLines.Where(l => Names.NormalizeCode(l.Code) == code && l.LineId != null).Select(l => l.LineId!));
            var nextRecord = record.Shallow();
            nextRecord.UpdatedAt = now;
            nextRecord.Items = record.Items.Select(item =>
            {
                if (!sharing.Contains(item.Id) || item.PricingMethod != QuotationPricingMethod.Norm)
                {
                    return item;
                }
                var copy = item.Shallow();
                copy.UpdatedAt = now;
                copy.Components = item.Components.Select(component =>
                {
                    var update = plan.Prices.FirstOrDefault(p => Names.NormalizeCode(p.ResourceCode) == Names.NormalizeCode(component.ResourceCodeSnapshot));
                    if (update == null)
                    {
                        return component;
                    }
                    var changed = component.Shallow();
                    changed.PriceId = update.PriceId;
                    changed.UnitPriceSnapshot = update.NewPrice;
                    changed.Currency = update.Currency;
                    changed.SourceReference = UpdatedSource(update, item, now);
                    return changed;
                }).ToList();
                return copy;
            }).ToList();
            // Đơn giá thành phần của các dòng này được ghi lại theo phân tích mới.
            var ws3 = await ReadAsync(tableName, false);
            var third = Evaluate(ws3, nextRecord).Evaluation;
            var breakdown = BreakdownCellWrites(third.Lines.Where(l => l.Item != null && sharing.Contains(l.Item.Id)).ToList());
            if (breakdown.Writes.Count > 0)
            {
                await gateway.WriteLineCellsAsync(tableName, breakdown.Writes, breakdown.Guards);
            }
            var cleared = await PersistAsync(tableName, nextRecord, record.UpdatedAt);
            return WriteOutcome<LibraryUpdateSummary>.Done(new LibraryUpdateSummary
            {
                AnalysisCells = analysisWrites.Count / 2,
                UnitPriceCells = unitPriceCells,
                AffectedLines = sharing.Count,
                CompletionCleared = cleared,
            });
        });

        /// <summary>
        /// Ghi nhận dòng vừa chèn (sau khi ghi sheet thành công). Lỗi ở đây không làm mất dòng đã ghi; lần Tính lại và
        /// lưu kế tiếp sẽ tạo mục hồ sơ từ sheet. Trả về null = đã lưu; "notOnSheet" = bảng cũ không có cột Mã dòng;
        /// chữ khác = lý do không lưu được.
        /// </summary>
        public async Task<string?> RegisterInsertedLineAsync(string tableName, QuotationItemRecord item)
        {
            try
            {
                // Bảng cũ không có cột Mã dòng: không tạo mục hồ sơ mồ côi.
                var lines = QuoteLineReader.Read(await gateway.ReadQuoteSnapshotAsync(tableName)).Lines;
                if (!lines.Any(l => l.LineId == item.Id))
                {
                    return "notOnSheet";
                }
                var read = await gateway.ReadRecordAsync(tableName);
                if (read.Kind == RecordReadKind.Unreadable)
                {
                    return read.Message;
                }
                var now = Stamp();
                var next = (read.Kind == RecordReadKind.Ok ? read.Record! : QuotationXml.NewRecord(newId(), tableName, now)).Shallow();
                next.Items = next.Items.Where(i => i.Id != item.Id).Concat(new[] { item }).ToList();
                next.UpdatedAt = now;
                // Thêm dòng làm nội dung khác lúc hoàn tất: về nháp.
                if (next.Status == QuotationStatus.Completed)
                {
                    next.Status = QuotationStatus.Draft;
                    next.CompletedAt = null;
                    next.CompletedFingerprint = null;
                }
                await gateway.SaveRecordAsync(next, read.Kind == RecordReadKind.Ok ? read.Record!.UpdatedAt : null);
                return null;
            }
            catch (Exception ex) when (!(ex is OutOfMemoryException))
            {
                return ex.Message;
            }
        }

        public Task<ExtensionInspection> InspectColumnsAsync(string tableName) => gateway.InspectExtensionColumnsAsync(tableName);

        public Task<List<string>> AddColumnsAsync(string tableName) => gateway.AddExtensionColumnsAsync(tableName);

        private static RowGuard IdentityGuard(QuoteSnapshot snapshot, QuoteLine line)
        {
            var guard = new RowGuard { Row = line.Row };
            foreach (var header in new[] { QuoteTemplate.HeaderOf(QuoteColumnKey.Code), QuoteTemplate.HeaderOf(QuoteColumnKey.Description), QuoteTemplate.LineIdHeader })
            {
                var index = snapshot.Quote.Headers.IndexOf(header);
                if (index >= 0)
                {
                    guard.Expected[header] = snapshot.Quote.Rows[line.Row].Values[index];
                }
            }
            return guard;
        }

        private sealed class BreakdownWrites
        {
            public List<LineCellWrite> Writes { get; } = new List<LineCellWrite>();
            public List<RowGuard> Guards { get; } = new List<RowGuard>();
            public int Lines { get; set; }
        }

        private static BreakdownWrites BreakdownCellWrites(IEnumerable<LineEvaluation> lines)
        {
            var result = new BreakdownWrites();
            foreach (var l in lines)
            {
                if (l.BreakdownWrite == null || l.Line.Breakdown == null || l.Line.LineId == null)
                {
                    continue;
                }
                result.Lines++;
                foreach (var t in QuoteLineReader.CostTypes)
                {
                    result.Writes.Add(new LineCellWrite
                    {
                        Row = l.Line.Row,
                        Header = QuoteTemplate.BreakdownHeader(t),
                        Value = l.BreakdownWrite[t] ?? (object)"",
                        Expected = l.Line.Breakdown[t].Value,
                    });
                }
                result.Guards.Add(new RowGuard { Row = l.Line.Row, Expected = new Dictionary<string, object?> { [QuoteTemplate.LineIdHeader] = l.Line.LineId } });
            }
            return result;
        }

        /// <summary>Giá trị đơn giá thành phần trên sheet do add-in ghi (để nhận ra người dùng sửa tay về sau).</summary>
        private static CostBreakdown? WrittenBreakdownOf(LineEvaluation line, QuotationItemRecord item)
        {
            var cells = line.Line.Breakdown;
            if (cells == null || item.PricingMethod != QuotationPricingMethod.Norm)
            {
                return item.WrittenBreakdown;
            }
            if (line.BreakdownWrite != null)
            {
                return line.BreakdownWrite.Copy();
            }
            var totals = line.Breakdown?.Totals;
            if (totals != null && QuoteLineReader.CostTypes.All(t => cells[t].Number == totals[t]))
            {
                return totals.Copy();
            }
            return item.WrittenBreakdown;
        }

        /// <summary>Chữ "Nguồn giá" sau khi cập nhật theo thư viện; giữ ghi chú hao hụt như lúc chèn.</summary>
        private static string UpdatedSource(ComponentPriceUpdate update, QuotationItemRecord item, string now)
        {
            var day = string.Join("/", now.Substring(0, 10).Split('-').Reverse());
            var component = item.Components.FirstOrDefault(c => Names.NormalizeCode(c.ResourceCodeSnapshot) == Names.NormalizeCode(update.ResourceCode));
            var parts = new List<string> { update.Source != "" ? update.Source : "Không ghi nguồn", update.Currency };
            if (component != null && component.AppliedConsumption != component.BaseConsumption)
            {
                parts.Add($"hao phí gồm hao hụt {DecimalMath.RateToPercent(component.WasteRate)}% (cơ sở {DecimalInput.Format(component.BaseConsumption)})");
            }
            parts.Add($"cập nhật theo thư viện {day}");
            if (!string.IsNullOrEmpty(item.Source?.NormCode))
            {
                parts.Add($"định mức {item.Source!.NormCode} v{item.Source.NormVersion}");
            }
            return string.Join("; ", parts);
        }
    }

    public sealed class ExplanationSheet
    {
        public string SheetName { get; set; } = "";
        /// <summary>Ma trận ghi bằng chế độ công thức, bắt đầu tại A1; ô là string, int, decimal hoặc null.</summary>
        public List<object?[]> Rows { get; set; } = new List<object?[]>();
        public int ColumnCount { get; set; }
        public int HeaderRow { get; set; }
        public int ComponentRows { get; set; }
        public int SummaryRow { get; set; }
        public int SummaryRows { get; set; }
    }

    /// <summary>
    /// Bảng diễn giải đơn giá từ định mức để xuất ra sheet mới, chuyển từ src/domain/pricing/normExplanation.ts:
    /// mỗi dòng thành phần có công thức Excel để truy vết; phần tổng hợp có cả công thức và kết quả add-in để đối chiếu.
    /// </summary>
    public static class NormExplanation
    {
        public static readonly string[] Headers =
        {
            "STT", "Loại", "Mã tài nguyên", "Tên tài nguyên", "Đơn vị", "Hao phí cơ sở", "Hao hụt",
            "Hao phí tính toán", "Đơn giá", "Thành tiền", "Nguồn giá", "Ghi chú kiểm tra",
        };

        public static readonly string[] Formats =
        {
            "General", "General", "General", "General", "General", "General", "0.00%", "General", "#,##0", "#,##0", "General", "General",
        };

        public static readonly int[] Widths = { 30, 70, 75, 180, 50, 70, 55, 80, 85, 95, 150, 200 };

        public const int HeaderRowIndex = 5;
        private const string Formula = "Hao phí tính toán = hao phí cơ sở × (1 + hao hụt); thành tiền = hao phí tính toán × đơn giá; đơn giá tổng hợp = tổng thành tiền.";

        private static string StatusText(NormStatus status) => status == NormStatus.Draft ? "Nháp" : status == NormStatus.Approved ? "Đang dùng" : "Ngừng dùng";

        private static string SourceText(Norm norm) => norm.SourceType == NormSourceType.Document
            ? $"Tài liệu: {norm.Source}{(norm.SourceVerified ? " (đã đối chiếu)" : " (chưa đối chiếu)")}"
            : "Người dùng tự xây dựng";

        private static string TotalLabel(ResourceType type) =>
            type == ResourceType.Material ? "Chi phí vật liệu"
            : type == ResourceType.Labor ? "Chi phí nhân công"
            : type == ResourceType.Machine ? "Chi phí máy thi công"
            : "Chi phí tài nguyên khác";

        public static ExplanationSheet Build(Norm norm, NormCalcResult result, string today)
        {
            var width = Headers.Length;
            object?[] Line(string text)
            {
                var row = new object?[width];
                row[0] = text;
                return row;
            }
            var rows = new List<object?[]>
            {
                Line("DIỄN GIẢI ĐƠN GIÁ TỪ ĐỊNH MỨC"),
                Line($"Định mức {norm.Code} phiên bản {norm.Version}: {norm.Name}. Đơn vị công tác: {norm.Unit}."),
                Line($"Trạng thái: {StatusText(norm.Status)}. Nguồn: {SourceText(norm)}. {(norm.WasteIncluded ? "Hao phí đã gồm hao hụt." : "")}".Trim()),
                Line($"Giá theo hiệu lực ngày {Dates.FormatIsoDate(today)}. {Formula} Không làm tròn. Dữ liệu do người dùng cung cấp; ConsQuotation không xác nhận tính pháp lý."),
                new object?[width],
                Headers.Cast<object?>().ToArray(),
            };
            var first = HeaderRowIndex + 2; // số hàng Excel (từ 1) của thành phần đầu tiên
            for (var i = 0; i < result.Components.Count; i++)
            {
                var c = result.Components[i];
                var r = first + i;
                var issues = string.Join(" ", result.Issues.Where(x => x.ComponentId == c.ComponentId).Select(x => x.Message));
                rows.Add(new object?[]
                {
                    i + 1,
                    Composition.ResourceTypeText(c.Type),
                    WorkItemDraft.AsLiteralText(c.ResourceCode),
                    WorkItemDraft.AsLiteralText(c.ResourceName),
                    WorkItemDraft.AsLiteralText(c.ResourceUnit),
                    c.BaseConsumption,
                    c.WasteApplied ? c.WasteRate : 0m,
                    $"=F{r}*(1+G{r})",
                    c.UnitPrice,
                    c.UnitPrice == null ? null : $"=H{r}*I{r}",
                    WorkItemDraft.AsLiteralText(c.PriceSource),
                    issues == "" ? null : WorkItemDraft.AsLiteralText(issues),
                });
            }
            var last = first + Math.Max(result.Components.Count, 1) - 1;
            rows.Add(new object?[width]);
            var summaryRow = rows.Count;
            object?[] SumRow(string label, string formula, object? value)
            {
                var row = new object?[width];
                row[8] = label;
                row[9] = formula;
                row[10] = value;
                return row;
            }
            var header = new object?[width];
            header[8] = "Tổng hợp";
            header[9] = "Công thức Excel";
            header[10] = "Kết quả add-in";
            rows.Add(header);
            foreach (var type in QuoteLineReader.CostTypes)
            {
                // SUMIF với tiêu chí là chữ cố định, cộng thành tiền cùng loại.
                rows.Add(SumRow(TotalLabel(type), $"=SUMIF(B{first}:B{last},\"{Composition.ResourceTypeText(type)}\",J{first}:J{last})", result.TotalsByType[type]));
            }
            rows.Add(SumRow($"Đơn giá tổng hợp (cho 1 {norm.Unit}){(result.Currency != "" ? $" ({result.Currency})" : "")}", $"=SUM(J{first}:J{last})", result.UnitPrice));
            var warnings = result.Issues.Where(i => i.ComponentId == null).Select(i => i.Message).ToList();
            if (warnings.Count > 0)
            {
                rows.Add(new object?[width]);
                rows.Add(Line($"Lỗi và cảnh báo: {string.Join(" ", warnings)}"));
            }
            return new ExplanationSheet
            {
                SheetName = $"Diễn giải {norm.Code} v{norm.Version}",
                Rows = rows,
                ColumnCount = width,
                HeaderRow = HeaderRowIndex,
                ComponentRows = result.Components.Count,
                SummaryRow = summaryRow,
                SummaryRows = QuoteLineReader.CostTypes.Length + 2,
            };
        }
    }

    public enum StepKey
    {
        Template,
        Info,
        Items,
        Prices,
        Check,
        Summary,
        Finish,
    }

    public enum StepState
    {
        Done,
        Todo,
        Attention,
        Optional,
    }

    public sealed class QuoteFacts
    {
        public int ItemRows { get; set; }
        public int MissingQuantity { get; set; }
        public int MissingPrice { get; set; }
        /// <summary>"none", "value" hoặc "error".</summary>
        public string SummaryKind { get; set; } = "none";
        public decimal SummaryValue { get; set; }
        public string SummaryError { get; set; } = "";
    }

    /// <summary>Tình trạng các bước của quy trình báo giá, tính từ dữ liệu đọc lại từ workbook, chuyển từ src/domain/workflow.ts.</summary>
    public static class Workflow
    {
        public static QuoteFacts Facts(QuoteSnapshot snapshot)
        {
            var quote = snapshot.Quote;
            int Col(QuoteColumnKey key) => quote.Headers.IndexOf(QuoteTemplate.HeaderOf(key));
            var meaningful = new[] { QuoteColumnKey.Code, QuoteColumnKey.Description, QuoteColumnKey.Quantity, QuoteColumnKey.UnitPrice, QuoteColumnKey.Notes }.Select(Col).ToArray();
            var rows = quote.Rows.Where(row => meaningful.Any(c => c >= 0 && !Sheet.IsBlank(row.Values[c]))).ToList();
            var facts = new QuoteFacts
            {
                ItemRows = rows.Count,
                MissingQuantity = rows.Count(r => Sheet.IsBlank(r.Values[Col(QuoteColumnKey.Quantity)])),
                MissingPrice = rows.Count(r => Sheet.IsBlank(r.Values[Col(QuoteColumnKey.UnitPrice)])),
            };
            var summary = snapshot.Summary;
            if (summary?.Totals != null)
            {
                var amount = summary.Headers.IndexOf("Số tiền");
                var value = summary.Totals.Values[amount];
                var number = Sheet.ToDecimal(value);
                if (summary.Totals.Types[amount] == "Error")
                {
                    facts.SummaryKind = "error";
                    facts.SummaryError = QuoteChecker.ExplainError(value);
                }
                else if (number != null)
                {
                    facts.SummaryKind = "value";
                    facts.SummaryValue = number.Value;
                }
                else
                {
                    facts.SummaryKind = "error";
                    facts.SummaryError = "(trống)";
                }
            }
            return facts;
        }

        public static Dictionary<StepKey, StepState> Steps(bool hasTable, bool headersMatch, InfoSummary? info, QuoteFacts? facts, QuoteCheckResult? check)
        {
            var errors = check?.Issues.Count(i => i.Severity == IssueSeverity.Error) ?? 0;
            var warnings = check?.Issues.Count(i => i.Severity == IssueSeverity.Warning) ?? 0;
            var hasItems = facts != null && facts.ItemRows > 0;
            return new Dictionary<StepKey, StepState>
            {
                [StepKey.Template] = !hasTable ? StepState.Todo : headersMatch ? StepState.Done : StepState.Attention,
                [StepKey.Info] = info == null ? StepState.Optional
                    : info.Expired != null || info.MissingLabels.Count > 0 ? StepState.Attention
                    : info.Filled > 0 ? StepState.Done : StepState.Optional,
                [StepKey.Items] = hasItems ? StepState.Done : StepState.Todo,
                [StepKey.Prices] = !hasItems ? StepState.Todo : facts!.MissingQuantity + facts.MissingPrice > 0 ? StepState.Attention : StepState.Done,
                [StepKey.Check] = check == null || facts?.ItemRows == 0 ? StepState.Todo : errors + warnings > 0 ? StepState.Attention : StepState.Done,
                [StepKey.Summary] = facts == null || facts.SummaryKind == "none" ? StepState.Optional : facts.SummaryKind == "error" ? StepState.Attention : StepState.Done,
                [StepKey.Finish] = StepState.Optional,
            };
        }
    }
}
