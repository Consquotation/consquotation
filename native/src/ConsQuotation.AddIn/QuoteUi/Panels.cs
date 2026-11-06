using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Quotation;
using ConsQuotation.Excel;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ui;

namespace ConsQuotation.QuoteUi
{
    /// <summary>Thẻ Tổng quan: workbook hiện tại, các bảng báo giá và tình trạng từng bước (WorkflowPanel, QuoteTablesPanel của bản web).</summary>
    internal sealed class OverviewPanel : QuotePanel
    {
        private readonly Label workbook;
        private readonly Label noTables;
        private readonly TablePicker picker;
        private readonly RecordList<StepRow> steps;
        private readonly Label checkedAt;
        private readonly Action<QuoteSection> open;

        internal sealed class StepRow
        {
            public StepKey Key { get; set; }
            public StepState State { get; set; }
            public string Detail { get; set; } = "";
        }

        public OverviewPanel(QuoteSession session, Action<QuoteSection> open) : base(session, fill: true)
        {
            this.open = open;
            Body.Controls.Add(Ux.Text(Q.Flow.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.Flow.Intro));
            workbook = Ux.Text("", Ux.Bold);
            Body.Controls.Add(workbook);
            noTables = Ux.Notice(Q.Flow.NoTables, SystemColors.ControlText);
            Body.Controls.Add(noTables);
            picker = new TablePicker(session);
            Body.Controls.Add(picker);
            Body.Controls.Add(Ux.ButtonRow(
                Ux.Button(Q.Flow.Recheck, (_, __) => Run(RefreshAsync)),
                Ux.Button(Q.Flow.GoTo, (_, __) => Run(GoToAsync)),
                Ux.Button(Q.Flow.ActionCreate, (_, __) => open(QuoteSection.Create)),
                Ux.Button(Q.Flow.ActionInfo, (_, __) => open(QuoteSection.Info)),
                Ux.Button(Q.Flow.ActionAdd, (_, __) => open(QuoteSection.Add)),
                Ux.Button(Q.Flow.ActionItems, (_, __) => open(QuoteSection.Items))));
            Body.Controls.Add(Status);
            steps = new RecordList<StepRow>(s => s.Key.ToString(),
                new Column<StepRow>("Bước", 240, s => Q.Flow.Steps[s.Key]),
                new Column<StepRow>(Q.Flow.Status, 80, s => Q.Flow.States[s.State]),
                new Column<StepRow>("Chi tiết", 420, s => s.Detail))
            {
                RowColor = s => s.State == StepState.Attention ? Ux.WarningColor : s.State == StepState.Done ? Ux.SuccessColor : (Color?)null,
            };
            Ux.AddFill(Body, steps);
            checkedAt = Ux.Text("", color: SystemColors.GrayText);
            Body.Controls.Add(checkedAt);
            Body.Controls.Add(Ux.Text(Q.Flow.NoStatus, color: SystemColors.GrayText));
        }

        public RecordList<StepRow> Steps => steps;
        public string WorkbookText => workbook.Text;

        protected override void OnTablesChanged()
        {
            workbook.Text = $"{Q.Flow.Workbook}: {(Session.WorkbookName == "" ? Q.Flow.NoWorkbook : Session.WorkbookName)}";
            picker.Rebuild();
            noTables.Visible = Session.Tables.Count == 0;
            picker.Visible = Session.Tables.Count > 0;
        }

        private async Task RefreshAsync()
        {
            await Session.RefreshTablesAsync(true);
            await ReloadCoreAsync();
        }

        private Task GoToAsync() => Session.SelectedTable == "" ? Task.CompletedTask : Session.Gateway.SelectQuoteTableAsync(Session.SelectedTable);

        public override Task ReloadAsync()
        {
            Run(ReloadCoreAsync);
            return LastWork;
        }

        private async Task ReloadCoreAsync()
        {
            Say(Ux.ErrorColor, null);
            var table = Session.CurrentTable;
            QuoteFacts? facts = null;
            InfoSummary? info = null;
            QuoteCheckResult? check = null;
            if (table != null)
            {
                var snapshot = await Session.Gateway.ReadQuoteSnapshotAsync(table.TableName);
                facts = Workflow.Facts(snapshot);
                check = QuoteChecker.Check(snapshot, Session.Library.LoadError == null ? Session.Library.Library : null);
                var read = await Session.Gateway.ReadQuoteInfoAsync(table.TableName);
                info = QuoteInfo.Summarize(read.Cells, Session.Library.Today);
            }
            var states = Workflow.Steps(table != null, table?.HeadersMatch ?? false, info, facts, check);
            var errors = check?.Issues.Count(i => i.Severity == IssueSeverity.Error) ?? 0;
            var warnings = check?.Issues.Count(i => i.Severity == IssueSeverity.Warning) ?? 0;
            string Detail(StepKey key)
            {
                switch (key)
                {
                    case StepKey.Template:
                        return table == null ? Q.Flow.DetailNoTable : !table.HeadersMatch ? Q.Flow.DetailHeadersChanged : Q.Flow.DetailTable(table.TableName, table.SheetName);
                    case StepKey.Info:
                        return info == null ? "" : Q.Flow.DetailInfo(info.Filled, info.Total) +
                            (info.MissingLabels.Count > 0 ? " " + Q.Flow.DetailInfoMissing(info.MissingLabels.Count) : "") +
                            (info.Expired != null ? " " + Q.Info.Expired(info.Expired) : "");
                    case StepKey.Items:
                        return Q.Flow.DetailItems(facts?.ItemRows ?? 0);
                    case StepKey.Prices:
                        return facts == null ? "" : Q.Flow.DetailPrices(facts.MissingQuantity, facts.MissingPrice);
                    case StepKey.Check:
                        return check == null ? "" : Q.Flow.DetailCheck(errors, warnings);
                    case StepKey.Summary:
                        return facts == null || facts.SummaryKind == "none" ? Q.Flow.DetailSummaryNone
                            : facts.SummaryKind == "error" ? Q.Flow.DetailSummaryError(facts.SummaryError)
                            : Q.Flow.DetailSummaryTotal(Formats.Quantity(facts.SummaryValue));
                    default:
                        return Q.Flow.DetailFinish;
                }
            }
            steps.SetItems(((StepKey[])Enum.GetValues(typeof(StepKey))).Select(k => new StepRow { Key = k, State = states[k], Detail = Detail(k) }));
            checkedAt.Text = Q.Flow.CheckedAt(Session.Library.Now().ToString("HH:mm:ss", CultureInfo.InvariantCulture));
        }
    }

    /// <summary>Thẻ Tạo bảng (CreateQuotePanel của bản web).</summary>
    internal sealed class CreatePanel : QuotePanel
    {
        public CreatePanel(QuoteSession session) : base(session)
        {
            Body.Controls.Add(Ux.Text(Q.Create.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.Create.Description));
            Body.Controls.Add(Ux.Text(Q.Create.Placement, Ux.Bold));
            NewSheet = new RadioButton { Text = Q.Create.NewSheet, AutoSize = true, Checked = true, Margin = new Padding(Ux.Px(3)) };
            AtSelection = new RadioButton { Text = Q.Create.AtSelection, AutoSize = true, Margin = new Padding(Ux.Px(3)) };
            var radios = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Margin = new Padding(0) };
            radios.Controls.AddRange(new Control[] { NewSheet, AtSelection });
            Body.Controls.Add(radios);
            SheetName = new TextField(Q.Create.SheetName, required: true, hint: Q.Create.SheetNameHint) { Value = Naming.DefaultQuoteSheetName };
            SheetName.Box.MaxLength = Naming.SheetNameMax;
            Body.Controls.Add(SheetName);
            Rows = new TextField(Q.Create.InitialRows) { Value = QuoteTemplate.DefaultInitialRows.ToString(CultureInfo.InvariantCulture) };
            Body.Controls.Add(Rows);
            Submit = Ux.Button(Q.Create.Submit, (_, __) => Create());
            Body.Controls.Add(Ux.ButtonRow(Submit));
            Body.Controls.Add(Status);
            NewSheet.CheckedChanged += (_, __) => SheetName.Visible = NewSheet.Checked;
            SheetName.Box.TextChanged += (_, __) => SheetName.Error = NewSheet.Checked ? Naming.CheckSheetName(SheetName.Value) : null;
        }

        public RadioButton NewSheet { get; }
        public RadioButton AtSelection { get; }
        public TextField SheetName { get; }
        public TextField Rows { get; }
        public Button Submit { get; }

        public void Create() => Run(SubmitAsync, writes: true);

        private int InitialRows => double.TryParse(Rows.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? QuoteTemplate.ClampInitialRows(n) : QuoteTemplate.DefaultInitialRows;

        private async Task SubmitAsync()
        {
            Say(Ux.ErrorColor, null);
            var newSheet = NewSheet.Checked;
            if (newSheet && Naming.CheckSheetName(SheetName.Value) != null)
            {
                SheetName.Error = Naming.CheckSheetName(SheetName.Value);
                return;
            }
            var rows = InitialRows;
            Rows.Value = rows.ToString(CultureInfo.InvariantCulture);
            var plan = await QuoteService.PlanTemplateAsync(Session.Gateway, newSheet, rows, newSheet ? SheetName.Value.Trim() : Naming.DefaultQuoteSheetName);
            var where = Q.Where(plan.Inspection.SheetName, plan.Inspection.Address);
            if (plan.Status == PlanStatus.Blocked)
            {
                Say(Ux.ErrorColor, $"{Q.Create.BlockedTitle}. {where}: {Q.Blockers(plan.Inspection.Blockers)}");
                return;
            }
            var overwrite = plan.Status == PlanStatus.NeedsOverwriteConfirmation;
            if (plan.Status != PlanStatus.Ready)
            {
                var confirmed = overwrite
                    ? Session.Prompts.Confirm(this, Q.Create.ConfirmOverwriteTitle, Q.Create.ConfirmOverwriteBody(where, plan.Inspection.Occupied.Count, plan.Inspection.Occupied.Sample), Q.Create.ConfirmOverwrite, Q.Cancel)
                    : Session.Prompts.Confirm(this, Q.Create.ConfirmLocationTitle, Q.Create.ConfirmLocationBody(where), Q.Create.ConfirmCreate, Q.Cancel);
                if (!confirmed)
                {
                    return;
                }
            }
            var created = await QuoteService.ExecuteTemplateAsync(Session.Gateway, plan, rows, overwrite);
            if (created == null)
            {
                Say(Ux.WarningColor, Q.Create.Changed);
                return;
            }
            Say(Ux.SuccessColor, Q.Create.Created(created.TableName, Q.Where(created.SheetName, created.Address)));
            await Session.RefreshTablesAsync(true);
        }
    }

    /// <summary>Thẻ Thông tin (QuoteInfoPanel của bản web): đọc/ghi trực tiếp khối thông tin trên sheet.</summary>
    internal sealed class InfoPanel : QuotePanel
    {
        private readonly TablePicker picker;
        private readonly Label noTables;
        private readonly Label protectedNote;
        private readonly Label expired;
        private readonly TableLayoutPanel grid;
        private readonly Button save;
        private readonly Button reload;
        private readonly Dictionary<InfoKey, TextField> fields = new Dictionary<InfoKey, TextField>();
        private QuoteInfoRead? read;
        private Dictionary<InfoKey, string> current = new Dictionary<InfoKey, string>();
        private string loadedTable = "";

        public InfoPanel(QuoteSession session) : base(session)
        {
            Body.Controls.Add(Ux.Text(Q.Info.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.Info.Intro));
            noTables = Ux.Notice(Q.NoTablesCreateFirst, SystemColors.ControlText);
            Body.Controls.Add(noTables);
            picker = new TablePicker(session);
            Body.Controls.Add(picker);
            protectedNote = Ux.Notice(Q.Info.Protected, Ux.WarningColor);
            protectedNote.Visible = false;
            Body.Controls.Add(protectedNote);
            expired = Ux.Notice("", Ux.WarningColor);
            expired.Visible = false;
            Body.Controls.Add(expired);
            grid = Ux.Grid();
            foreach (var field in QuoteInfo.Fields)
            {
                var box = new TextField(field.Label.TrimEnd(':'));
                fields[field.Key] = box;
                grid.Controls.Add(box);
            }
            Body.Controls.Add(grid);
            save = Ux.Button(Q.Info.Save, (_, __) => SaveNow());
            reload = Ux.Button(Q.Info.Reload, (_, __) => Run(() => LoadAsync(null)));
            Body.Controls.Add(Ux.ButtonRow(save, reload));
            Body.Controls.Add(Status);
            Sync();
        }

        public IReadOnlyDictionary<InfoKey, TextField> Fields => fields;
        public Button Save => save;

        public void SaveNow() => Run(SaveAsync, writes: true);

        public override bool FollowSelection => read == null || fields.All(p => !current.TryGetValue(p.Key, out var value) || p.Value.Value == value);

        private void Sync()
        {
            var has = Session.Tables.Count > 0;
            noTables.Visible = !has;
            picker.Visible = grid.Visible = save.Visible = reload.Visible = has;
        }

        protected override void OnTablesChanged()
        {
            picker.Rebuild();
            Sync();
        }

        public override Task ReloadAsync()
        {
            // Giữ chữ người dùng đang gõ: cùng bảng thì không đọc đè khi chỉ chuyển qua lại giữa các cửa sổ.
            if (Session.SelectedTable != loadedTable)
            {
                Run(() => LoadAsync(null));
            }
            return LastWork;
        }

        private async Task LoadAsync(IReadOnlyDictionary<InfoKey, string>? edited)
        {
            Say(Ux.ErrorColor, null);
            loadedTable = Session.SelectedTable;
            if (loadedTable == "")
            {
                read = null;
                return;
            }
            var info = await Session.Gateway.ReadQuoteInfoAsync(loadedTable);
            read = info;
            current = QuoteInfo.Fields.ToDictionary(f => f.Key, f => QuoteInfo.DisplayValue(f, info.Cells.First(c => c.Key == f.Key)));
            foreach (var field in QuoteInfo.Fields)
            {
                var box = fields[field.Key];
                var cell = info.Cells.First(c => c.Key == field.Key);
                var optionalMissing = !cell.Found && field.AddedLater;
                box.Value = edited != null && edited.TryGetValue(field.Key, out var value) ? value : current[field.Key];
                box.Box.Enabled = cell.Found && !info.SheetProtected;
                box.Error = null;
                box.Warning = optionalMissing ? Q.Info.AddedLater(field.Label)
                    : !cell.Found ? Q.Info.NotFound
                    : null;
            }
            protectedNote.Visible = info.SheetProtected;
            save.Enabled = !info.SheetProtected;
            var summary = QuoteInfo.Summarize(info.Cells, Session.Library.Today);
            Ux.Show(expired, summary.Expired == null ? null : Q.Info.Expired(summary.Expired));
        }

        private async Task SaveAsync()
        {
            Say(Ux.ErrorColor, null);
            if (read == null)
            {
                return;
            }
            var input = fields.ToDictionary(p => p.Key, p => p.Value.Value);
            var plan = QuoteInfo.PlanWrites(input, current);
            foreach (var box in fields.Values)
            {
                box.Error = null;
            }
            foreach (var error in plan.Errors)
            {
                fields[error.Key].Error = error.Message;
            }
            if (plan.Errors.Count > 0)
            {
                Say(Ux.ErrorColor, Q.Info.Errors);
                return;
            }
            if (plan.Writes.Count == 0)
            {
                Say(SystemColors.ControlText, Q.Info.NoChange);
                return;
            }
            try
            {
                await Session.Gateway.WriteQuoteInfoAsync(loadedTable, plan.Writes, read.Fingerprint);
                await LoadAsync(null);
                Say(Ux.SuccessColor, Q.Info.Saved(plan.Writes.Count));
            }
            catch (TargetChangedException)
            {
                var edited = QuoteInfo.Fields.Where(f => input[f.Key] != current[f.Key]).ToDictionary(f => f.Key, f => input[f.Key]);
                await LoadAsync(edited);
                Say(Ux.WarningColor, Q.Info.Changed);
            }
        }
    }

    /// <summary>Hộp chọn công tác từ thư viện, có ô tìm kiếm (không cần gõ dấu).</summary>
    internal sealed class PickWorkItemDialog : Form
    {
        private readonly LibrarySession session;
        private readonly TextBox query;
        private readonly RecordList<WorkItem> list;
        private readonly Button ok;
        private readonly NameLookup lookup;

        public PickWorkItemDialog(LibrarySession session)
        {
            this.session = session;
            lookup = NameLookup.Of(session.Library);
            Text = Q.Add.PickTitle;
            Font = Ux.Font;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            Size = new Size(Ux.Px(720), Ux.Px(480));
            MinimumSize = new Size(Ux.Px(480), Ux.Px(320));
            var root = Ux.FillStack();
            root.Padding = new Padding(Ux.Px(8));
            query = new TextBox { Width = Ux.Px(420), AccessibleName = Q.Add.PickSearch };
            root.Controls.Add(Ux.Text(Q.Add.PickSearch));
            root.Controls.Add(query);
            list = new RecordList<WorkItem>(w => w.Id,
                new Column<WorkItem>(S.ColCode, 90, w => w.Code),
                new Column<WorkItem>(S.WiName, 280, w => w.Name),
                new Column<WorkItem>(S.ColUnit, 60, w => w.Unit),
                new Column<WorkItem>(S.ColPrice, 130, w => Formats.Money(w.UnitPrice, w.Currency), HorizontalAlignment.Right));
            list.ItemActivate += (_, __) => Accept();
            list.SelectedIndexChanged += (_, __) => ok!.Enabled = list.Selected != null;
            Ux.AddFill(root, list);
            ok = Ux.Button(Q.Add.PickOk, (_, __) => Accept());
            ok.Enabled = false;
            var cancel = Ux.Button(Q.Cancel, (_, __) => DialogResult = DialogResult.Cancel);
            root.Controls.Add(Ux.ButtonRow(ok, cancel));
            Controls.Add(root);
            CancelButton = cancel;
            AcceptButton = ok;
            query.TextChanged += (_, __) => Apply();
            Apply();
        }

        public WorkItem? Picked { get; private set; }

        private void Apply() => list.SetItems(Search.SearchWorkItems(session.Library.WorkItems, new ListFilter { Query = query.Text }, lookup));

        private void Accept()
        {
            if (list.Selected != null)
            {
                Picked = list.Selected;
                DialogResult = DialogResult.OK;
            }
        }
    }
}
