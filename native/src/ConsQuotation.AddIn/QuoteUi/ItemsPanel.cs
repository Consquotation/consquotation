using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Quotation;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ui;

namespace ConsQuotation.QuoteUi
{
    /// <summary>Thẻ Công tác (QuotationItemsView của bản web): trạng thái từng dòng, tính lại và lưu, hoàn tất, cập nhật theo thư viện.</summary>
    internal sealed class ItemsPanel : QuotePanel
    {
        private const string All = "all";
        private const string Invalid = "invalid";
        private const string Warnings = "warnings";

        private readonly TablePicker picker;
        private readonly Label noTables;
        private readonly Label state;
        private readonly Label pending;
        private readonly Label blockers;
        private readonly Label columnsNote;
        private readonly Button addColumns;
        private readonly Button recalc;
        private readonly Button complete;
        private readonly Button reopen;
        private readonly Label summary;
        private readonly ComboBox filter;
        private readonly TextBox search;
        private readonly RecordList<LineEvaluation> list;
        private readonly TextBox details;
        private readonly Button goTo;
        private readonly Button update;
        private readonly Label emptyNote;
        private QuotationView? view;

        public ItemsPanel(QuoteSession session) : base(session, fill: true)
        {
            noTables = Ux.Notice(Q.NoTablesCreateFirst, SystemColors.ControlText);
            Body.Controls.Add(noTables);
            picker = new TablePicker(session);
            Body.Controls.Add(picker);
            state = Ux.Text("", Ux.Bold);
            Body.Controls.Add(state);
            pending = Ux.Text("", color: SystemColors.GrayText);
            Body.Controls.Add(pending);
            columnsNote = Ux.Notice("", Ux.WarningColor);
            columnsNote.Visible = false;
            Body.Controls.Add(columnsNote);
            recalc = Ux.Button(Q.Items.Recalc, (_, __) => Recalculate());
            complete = Ux.Button(Q.Items.Complete, (_, __) => Complete());
            reopen = Ux.Button(Q.Items.Reopen, (_, __) => Run(ReopenAsync, writes: true));
            addColumns = Ux.Button(Q.Items.ColumnsAdd, (_, __) => AddColumns());
            Body.Controls.Add(Ux.ButtonRow(recalc, complete, reopen, addColumns, Ux.Button(Q.Refresh, (_, __) => Run(ReloadWithTablesAsync))));
            blockers = Ux.Notice("", Ux.ErrorColor);
            blockers.Visible = false;
            Body.Controls.Add(blockers);
            Body.Controls.Add(Status);
            summary = Ux.Text("");
            Body.Controls.Add(summary);

            filter = Ux.Combo(120);
            filter.Items.AddRange(new object[] { new Choice(All, Q.Items.FilterAll), new Choice(Invalid, Q.Items.FilterInvalid), new Choice(Warnings, Q.Items.FilterWarnings) });
            filter.SelectedIndex = 0;
            filter.AccessibleName = Q.Items.FilterLabel;
            search = new TextBox { Width = Ux.Px(320), AccessibleName = Q.Items.Search, Margin = new Padding(Ux.Px(3)) };
            var searchLabel = Ux.Text(Q.Items.Search);
            searchLabel.Anchor = AnchorStyles.Left;
            var filterLabel = Ux.Text(Q.Items.FilterLabel);
            filterLabel.Anchor = AnchorStyles.Left;
            Body.Controls.Add(Ux.Row(false, filterLabel, filter, searchLabel, search));
            emptyNote = Ux.Text("", color: SystemColors.GrayText);
            emptyNote.Visible = false;
            Body.Controls.Add(emptyNote);

            list = new RecordList<LineEvaluation>(l => l.Line.Row.ToString(System.Globalization.CultureInfo.InvariantCulture),
                new Column<LineEvaluation>(Q.Items.ColRow, 50, l => l.Line.SheetRow.ToString(System.Globalization.CultureInfo.InvariantCulture), HorizontalAlignment.Right),
                new Column<LineEvaluation>(Q.Items.ColCode, 80, l => l.Line.Code),
                new Column<LineEvaluation>(Q.Items.ColDescription, 220, l => l.Line.Description),
                new Column<LineEvaluation>(Q.Items.ColGroup, 90, l => l.Line.Group),
                new Column<LineEvaluation>(Q.Items.ColMethod, 120, l => Q.Items.Methods[l.Method]),
                new Column<LineEvaluation>(Q.Items.ColQuantity, 70, l => CellText(l.Line.Quantity), HorizontalAlignment.Right),
                new Column<LineEvaluation>(Q.Items.ColUnitPrice, 90, l => CellText(l.Line.UnitPrice), HorizontalAlignment.Right),
                new Column<LineEvaluation>(Q.Items.ColAmount, 100, l => CellText(l.Line.Amount), HorizontalAlignment.Right),
                new Column<LineEvaluation>(Q.Items.ColStatus, 90, l => Q.Items.LineStatus[l.Result.Status]))
            {
                RowColor = l => l.Result.Status == CalculationStatus.Invalid ? Ux.ErrorColor : l.Result.Status == CalculationStatus.ValidWithWarnings ? Ux.WarningColor : (Color?)null,
            };
            list.SelectedIndexChanged += (_, __) => ShowDetails();
            list.ItemActivate += (_, __) => Run(GoToAsync);
            Ux.AddFill(Body, list);
            goTo = Ux.Button(Q.Items.GoTo, (_, __) => Run(GoToAsync));
            update = Ux.Button(Q.Items.Update, (_, __) => Run(UpdateAsync, writes: true));
            Body.Controls.Add(Ux.ButtonRow(goTo, update));
            details = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Height = Ux.Px(130),
                Anchor = AnchorStyles.Left | AnchorStyles.Right,
                Margin = new Padding(Ux.Px(3)),
                AccessibleName = "Chi tiết dòng",
                BackColor = SystemColors.Window,
            };
            Body.Controls.Add(details);

            filter.SelectedIndexChanged += (_, __) => ApplyFilter();
            search.TextChanged += (_, __) => ApplyFilter();
            Sync();
            ShowDetails();
        }

        public RecordList<LineEvaluation> Lines => list;
        public Button RecalcButton => recalc;
        public Button CompleteButton => complete;
        public Button ReopenButton => reopen;
        public Button UpdateButton => update;
        public Button AddColumnsButton => addColumns;
        public string StateText => state.Text;
        public string BlockersText => blockers.Text;
        public string DetailsText => details.Text;
        public string SummaryText => summary.Text;
        public QuotationView? View => view;

        public void Recalculate() => Run(RecalculateAsync, writes: true);
        public void Complete() => Run(CompleteAsync, writes: true);
        public void AddColumns() => Run(AddColumnsAsync, writes: true);

        private static string CellText(CellRead cell) =>
            cell.Type == "Error" ? QuoteLineReader.Text(cell.Value)
            : Sheet.IsBlank(cell.Value) ? ""
            : cell.Number != null ? Formats.Quantity(cell.Number.Value)
            : QuoteLineReader.Text(cell.Value);

        private void Sync()
        {
            var has = Session.Tables.Count > 0;
            noTables.Visible = !has;
            picker.Visible = has;
            recalc.Enabled = complete.Enabled = reopen.Enabled = has;
        }

        protected override void OnTablesChanged()
        {
            picker.Rebuild();
            Sync();
        }

        public override Task ReloadAsync()
        {
            Run(LoadAsync);
            return LastWork;
        }

        private async Task ReloadWithTablesAsync()
        {
            await Session.RefreshTablesAsync(true);
            await LoadAsync();
        }

        private async Task LoadAsync()
        {
            var table = Session.SelectedTable;
            if (table == "")
            {
                view = null;
                list.SetItems(new LineEvaluation[0]);
                state.Text = pending.Text = summary.Text = "";
                Ux.Show(blockers, null);
                Ux.Show(columnsNote, null);
                addColumns.Visible = false;
                return;
            }
            view = await Session.Quotation.LoadAsync(table);
            Render();
        }

        private void Render()
        {
            var v = view!;
            var e = v.Evaluation;
            var at = v.State == QuotationState.Completed && v.Record.Record?.CompletedAt != null ? " " + Q.Items.CompletedAt(Dates.FormatDateTime(v.Record.Record.CompletedAt)) : "";
            var hint = v.State == QuotationState.Unreadable ? v.Record.Message : Q.Items.StateHints[v.State];
            state.Text = $"{Q.Items.States[v.State]}. {hint}{at}";
            state.ForeColor = v.State == QuotationState.Unreadable ? Ux.ErrorColor : v.State == QuotationState.ModifiedAfterCompletion ? Ux.WarningColor : SystemColors.ControlText;
            var todo = Q.Items.Pending(v.PendingAssignIds, v.PendingWriteBreakdown, v.PendingRemoveItems);
            pending.Text = todo == "" ? "" : Q.Items.PendingLead + todo + ".";
            pending.Visible = todo != "";
            var missing = e.MissingColumns;
            Ux.Show(columnsNote, missing.Count == 0 ? null : Q.Items.ColumnsBody(missing));
            addColumns.Visible = missing.Count > 0;
            complete.Visible = v.State != QuotationState.Completed;
            reopen.Visible = v.State == QuotationState.Completed || v.State == QuotationState.ModifiedAfterCompletion;
            recalc.Enabled = e.HasLineIds && v.State != QuotationState.Unreadable;
            Ux.Show(blockers, null);
            summary.Text = SummaryLine(e);
            ApplyFilter();
        }

        private static string SummaryLine(QuotationEvaluation e)
        {
            var text = new StringBuilder();
            text.Append(Q.Items.Counts(e.Counts[CalculationStatus.Valid], e.Counts[CalculationStatus.ValidWithWarnings], e.Counts[CalculationStatus.Invalid]));
            text.Append(". ").Append(Q.Items.SummaryTotal).Append(": ");
            text.Append(e.TotalError != null ? Q.Items.TotalError(e.TotalError) : e.TotalValue != null ? Formats.Quantity(e.TotalValue.Value) : Q.Items.Missing);
            text.Append(". ").Append(Q.Items.SummaryComputed).Append(": ").Append(Formats.Quantity(e.ComputedTotal)).Append('.');
            if (e.TotalError == null && e.TotalValue != null && !LineCalc.SameAmount(e.TotalValue.Value, e.ComputedTotal))
            {
                text.Append(' ').Append(Q.Items.Mismatch);
            }
            if (e.Groups.Count > 0)
            {
                text.Append(' ').Append(Q.Items.Groups).Append(": ");
                text.Append(string.Join("; ", e.Groups.Select(g => $"{(g.Group == "" ? Q.Items.NoGroup : g.Group)} {Formats.Quantity(g.Amount)} ({Q.Items.GroupLine(g.Lines, g.Uncomputed)})")));
                text.Append('.');
            }
            text.Append(' ').Append(Q.Items.Rounding).Append(": ").Append(e.RoundingPolicy).Append('.');
            if (e.TableIssues.Count > 0)
            {
                text.Append(' ').Append(Q.Items.TableIssues).Append(": ").Append(string.Join(" ", e.TableIssues.Select(i => i.Message)));
            }
            return text.ToString();
        }

        private void ApplyFilter()
        {
            if (view == null)
            {
                return;
            }
            var which = Ux.SelectedId(filter);
            var query = Search.NormalizeForSearch(search.Text);
            var lines = view.Evaluation.Lines.Where(l =>
                (which == All || which == Invalid && l.Result.Status == CalculationStatus.Invalid || which == Warnings && l.Result.Status == CalculationStatus.ValidWithWarnings) &&
                (query == "" || Search.NormalizeForSearch($"{l.Line.Code} {l.Line.Description} {l.Line.Group}").Contains(query))).ToList();
            list.SetItems(lines);
            emptyNote.Text = view.Evaluation.Lines.Count == 0 ? Q.Items.Empty : lines.Count == 0 ? Q.Items.NoneMatch : "";
            emptyNote.Visible = emptyNote.Text != "";
            ShowDetails();
        }

        private static string Money(decimal? value) => value == null ? Q.Items.Missing : Formats.Quantity(value.Value);

        private void ShowDetails()
        {
            var line = list.Selected;
            goTo.Enabled = line != null;
            update.Enabled = line?.Plan != null;
            details.Text = line == null ? "" : DetailsOf(line);
        }

        private static string DetailsOf(LineEvaluation line)
        {
            var text = new StringBuilder();
            void Add(string value) => text.Append(value).Append("\r\n");
            var r = line.Line;
            Add($"{Q.Items.MoneyLine}: {CellText(r.Quantity)} × {CellText(r.UnitPrice)} = {CellText(r.Amount)}");
            var totals = line.Result;
            Add($"{Q.Items.BreakdownLine}: {Money(totals.MaterialCost)} / {Money(totals.LaborCost)} / {Money(totals.MachineCost)} / {Money(totals.OtherCost)}");
            var item = line.Item;
            if (item == null)
            {
                Add(Q.Items.NoRecordItem);
            }
            else if (!string.IsNullOrEmpty(item.Source?.NormCode))
            {
                Add($"{Q.Items.Source}: {Q.Items.SourceNorm(item.Source!.NormCode, item.Source.NormVersion)}");
            }
            if (line.ChangedSinceLastCalc)
            {
                Add(Q.Items.ChangedSinceLast);
            }
            Add($"{Q.Items.IssuesTitle}:");
            if (totals.Issues.Count == 0)
            {
                Add(Q.Items.NoIssues);
            }
            foreach (var issue in totals.Issues)
            {
                Add($"- {issue.Message}{(string.IsNullOrEmpty(issue.Hint) ? "" : " " + issue.Hint)}");
            }
            if (item != null && item.Components.Count > 0)
            {
                Add($"{Q.Items.Components}:");
                foreach (var c in item.Components)
                {
                    var price = c.UnitPriceSnapshot == null ? Q.Items.Missing : Formats.Quantity(c.UnitPriceSnapshot.Value);
                    var amount = c.UnitPriceSnapshot == null ? Q.Items.Missing : Formats.Quantity(c.AppliedConsumption * c.UnitPriceSnapshot.Value);
                    Add($"- {c.ResourceCodeSnapshot} {c.ResourceNameSnapshot}: {Q.Items.ComponentLine(Formats.Quantity(c.AppliedConsumption), c.UnitSnapshot, price, amount)}. {Q.Items.ComponentSnapshot(Formats.Quantity(c.BaseConsumption), c.WasteRate == 0 ? "" : Core.Numbers.DecimalMath.RateToPercent(c.WasteRate).ToString(System.Globalization.CultureInfo.InvariantCulture), price)}");
                }
            }
            return text.ToString();
        }

        private async Task RecalculateAsync()
        {
            Say(Ux.ErrorColor, null);
            var outcome = await Session.Quotation.RecalculateAsync(Session.SelectedTable, view?.Evaluation.Fingerprint ?? "");
            await AfterAsync(outcome, Q.Items.RecalcDone);
        }

        private async Task CompleteAsync()
        {
            Say(Ux.ErrorColor, null);
            var outcome = await Session.Quotation.CompleteAsync(Session.SelectedTable, view?.Evaluation.Fingerprint ?? "");
            await AfterAsync(outcome, _ => Q.Items.Completed);
        }

        private async Task ReopenAsync()
        {
            Say(Ux.ErrorColor, null);
            var outcome = await Session.Quotation.ReopenAsync(Session.SelectedTable);
            await AfterAsync(outcome, _ => Q.Items.Reopened);
        }

        /// <summary>Tải lại trước rồi mới báo kết quả, để hiện đúng số liệu mới nhất cùng thông báo.</summary>
        private async Task AfterAsync<T>(WriteOutcome<T> outcome, Func<T, string> done) where T : class
        {
            await LoadAsync();
            if (outcome.Status == OutcomeStatus.Changed)
            {
                Say(Ux.WarningColor, Q.Items.Changed);
            }
            else if (outcome.Status == OutcomeStatus.Blocked)
            {
                Ux.Show(blockers, $"{Q.Items.CompleteBlocked} {string.Join(" ", outcome.Reasons)}");
            }
            else
            {
                Say(Ux.SuccessColor, done(outcome.Value!));
            }
        }

        private async Task AddColumnsAsync()
        {
            Say(Ux.ErrorColor, null);
            var table = Session.SelectedTable;
            var inspection = await Session.Quotation.InspectColumnsAsync(table);
            if (inspection.Missing.Count == 0)
            {
                await LoadAsync();
                return;
            }
            if (inspection.SheetProtected)
            {
                Say(Ux.ErrorColor, Q.Items.ColumnsProtected);
                return;
            }
            if (inspection.CellsRight.Count > 0)
            {
                Say(Ux.ErrorColor, Q.Items.ColumnsBlockedRight(inspection.CellsRight.Count, inspection.CellsRight.Sample));
                return;
            }
            if (!Session.Prompts.Confirm(this, Q.Items.ColumnsConfirmTitle, Q.Items.ColumnsConfirmBody(inspection.Missing), Q.Items.ColumnsAdd, Q.Cancel))
            {
                return;
            }
            var added = await Session.Quotation.AddColumnsAsync(table);
            await LoadAsync();
            Say(Ux.SuccessColor, Q.Items.ColumnsAdded(added));
        }

        private Task GoToAsync()
        {
            var line = list.Selected;
            if (line == null || view == null)
            {
                return Task.CompletedTask;
            }
            var address = Sheet.CellAddress(line.Line.SheetRow - 1, view.FirstColumnIndex);
            return Session.Gateway.GoToAsync(view.SheetName, address);
        }

        private async Task UpdateAsync()
        {
            Say(Ux.ErrorColor, null);
            var line = list.Selected;
            var plan = line?.Plan;
            if (line == null || plan == null || view == null || line.Line.LineId == null)
            {
                return;
            }
            var body = plan.Prices == null
                ? Q.Items.UpdateLibrary(Formats.Quantity(plan.OldPrice), Formats.Quantity(plan.NewPrice))
                : Q.Items.UpdateNorm(plan.Prices.Select(p => $"{p.ResourceCode}: {(p.OldPrice == null ? Q.Items.Missing : Formats.Quantity(p.OldPrice.Value))} → {Formats.Quantity(p.NewPrice)} {p.Currency}/{p.PriceUnit}"));
            if (!Session.Prompts.Confirm(this, Q.Items.UpdateTitle, body, Q.Items.Confirm, Q.Cancel))
            {
                return;
            }
            var isLibrary = plan.Prices == null;
            var outcome = await Session.Quotation.ApplyLibraryUpdateAsync(Session.SelectedTable, line.Line.LineId, view.Evaluation.Fingerprint);
            await AfterAsync(outcome, s => isLibrary ? Q.Items.UpdatedLibrary(s.CompletionCleared) : Q.Items.Updated(s));
        }
    }
}
