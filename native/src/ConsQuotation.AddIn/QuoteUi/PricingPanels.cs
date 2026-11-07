using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Quotation;
using ConsQuotation.Excel;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ui;

namespace ConsQuotation.QuoteUi
{
    /// <summary>Thẻ Kiểm tra (QuoteCheckPanel của bản web): đọc trực tiếp sheet, chỉ báo; sửa cần xác nhận.</summary>
    internal sealed class CheckPanel : QuotePanel
    {
        internal sealed class IssueRow
        {
            public int Index { get; set; }
            public QuoteIssue Issue { get; set; } = new QuoteIssue();
        }

        private readonly TablePicker picker;
        private readonly Label noTables;
        private readonly Label summary;
        private readonly Label methods;
        private readonly Label checkedAt;
        private readonly Button run;
        private readonly Button goTo;
        private readonly Button fix;
        private readonly RecordList<IssueRow> list;
        private readonly TextBox details;
        private QuoteCheckResult? result;
        private string checkedTable = "";

        public CheckPanel(QuoteSession session) : base(session, fill: true)
        {
            Body.Controls.Add(Ux.Text(Q.Check.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.Check.Intro));
            noTables = Ux.Notice(Q.NoTablesCreateFirst, SystemColors.ControlText);
            Body.Controls.Add(noTables);
            picker = new TablePicker(session);
            Body.Controls.Add(picker);
            run = Ux.Button(Q.Check.Run, (_, __) => Check());
            goTo = Ux.Button(Q.Check.GoTo, (_, __) => Run(GoToAsync));
            fix = Ux.Button(Q.Check.FixAll(0), (_, __) => ApplyFixes());
            fix.Visible = false;
            Body.Controls.Add(Ux.ButtonRow(run, goTo, fix));
            Body.Controls.Add(Status);
            summary = Ux.Text("", Ux.Bold);
            Body.Controls.Add(summary);
            list = new RecordList<IssueRow>(r => r.Index.ToString(CultureInfo.InvariantCulture),
                new Column<IssueRow>(Q.Check.ColSeverity, 70, r => r.Issue.Severity == IssueSeverity.Error ? Q.Check.Error : Q.Check.Warning),
                new Column<IssueRow>(Q.Check.ColCell, 70, r => r.Issue.Address),
                new Column<IssueRow>(Q.Check.ColWhere, 150, r => r.Issue.Location),
                new Column<IssueRow>(Q.Check.ColMessage, 620, r => r.Issue.Message))
            {
                RowColor = r => r.Issue.Severity == IssueSeverity.Error ? Ux.ErrorColor : Ux.WarningColor,
            };
            list.SelectedIndexChanged += (_, __) => ShowDetails();
            list.ItemActivate += (_, __) => Run(GoToAsync);
            Ux.AddFill(Body, list);
            details = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Height = Ux.Px(56),
                Anchor = AnchorStyles.Left | AnchorStyles.Right,
                Margin = new Padding(Ux.Px(3)),
                AccessibleName = "Chi tiết vấn đề",
                BackColor = SystemColors.Window,
            };
            Body.Controls.Add(details);
            methods = Ux.Text("");
            Body.Controls.Add(methods);
            checkedAt = Ux.Text("", color: SystemColors.GrayText);
            Body.Controls.Add(checkedAt);
            Sync();
            ShowDetails();
        }

        public RecordList<IssueRow> Issues => list;
        public string SummaryText => summary.Text;
        public string MethodsText => methods.Text;
        public string DetailsText => details.Text;
        public Button FixButton => fix;

        public void Check() => Run(CheckAsync);
        public void ApplyFixes() => Run(ApplyFixesAsync, writes: true);

        private void Sync()
        {
            var has = Session.Tables.Count > 0;
            noTables.Visible = !has;
            picker.Visible = has;
            run.Enabled = has;
        }

        protected override void OnTablesChanged()
        {
            picker.Rebuild();
            Sync();
        }

        /// <summary>Tự kiểm tra khi mở thẻ với bảng khác; sau đó chỉ kiểm tra khi người dùng bấm, kết quả ghi rõ giờ.</summary>
        public override Task ReloadAsync()
        {
            if (Session.SelectedTable != "" && Session.SelectedTable != checkedTable)
            {
                Check();
            }
            return LastWork;
        }

        private async Task CheckAsync()
        {
            checkedTable = Session.SelectedTable;
            if (checkedTable == "")
            {
                return;
            }
            var snapshot = await Session.Gateway.ReadQuoteSnapshotAsync(checkedTable);
            Session.Library.ReloadIfChangedOutside();
            var library = Session.Library.LoadError == null ? Session.Library.Library : null;
            Show(snapshot, QuoteChecker.Check(snapshot, library));
        }

        private void Show(QuoteSnapshot snapshot, QuoteCheckResult check)
        {
            result = check;
            var errors = check.Issues.Count(i => i.Severity == IssueSeverity.Error);
            var warnings = check.Issues.Count(i => i.Severity == IssueSeverity.Warning);
            summary.Text = check.Issues.Count == 0 ? Q.Check.Ok(check.RowCount) : Q.Check.Counts(errors, warnings, check.RowCount);
            summary.ForeColor = errors > 0 ? Ux.ErrorColor : warnings > 0 ? Ux.WarningColor : Ux.SuccessColor;
            list.SetItems(check.Issues.Select((issue, i) => new IssueRow { Index = i, Issue = issue }));
            var fixes = check.Issues.Count(i => i.FixUnitPrice != null);
            fix.Visible = fixes > 0;
            fix.Text = Q.Check.FixAll(fixes);
            var counts = check.Methods.GroupBy(m => m.Method).Select(g => $"{Q.Check.Methods[g.Key]}: {g.Count()}");
            methods.Text = $"{Q.Check.MethodsTitle}: {string.Join(" · ", counts)}";
            checkedAt.Text = $"{Q.Check.CheckedAt(Session.Library.Now().ToString("HH:mm:ss", CultureInfo.InvariantCulture))} {Q.Check.CircularNote}";
            ShowDetails();
        }

        private void ShowDetails()
        {
            var row = list.Selected;
            goTo.Enabled = row != null;
            details.Text = row == null ? "" : row.Issue.Message + (string.IsNullOrEmpty(row.Issue.Hint) ? "" : $"\r\n{Q.Check.Hint(row.Issue.Hint!)}");
        }

        private Task GoToAsync()
        {
            var row = list.Selected;
            return row == null ? Task.CompletedTask : Session.Gateway.GoToAsync(row.Issue.SheetName, row.Issue.Address);
        }

        private async Task ApplyFixesAsync()
        {
            Say(Ux.ErrorColor, null);
            var fixes = (result?.Issues ?? new List<QuoteIssue>()).Where(i => i.FixUnitPrice != null)
                .Select(i => new UnitPriceFix { SheetName = i.SheetName, Address = i.Address, Expected = i.FixPrevious, Value = i.FixUnitPrice!.Value }).ToList();
            if (fixes.Count == 0 || !Session.Prompts.Confirm(this, Q.Check.FixTitle, Q.Check.FixBody(fixes.Count), Q.Check.Confirm, Q.Cancel))
            {
                return;
            }
            string message;
            var color = Ux.SuccessColor;
            try
            {
                message = Q.Check.Fixed(await Session.Gateway.SetUnitPricesAsync(fixes));
            }
            catch (TargetChangedException)
            {
                message = Q.Check.Changed;
                color = Ux.WarningColor;
            }
            await CheckAsync();
            Say(color, message);
        }
    }

    /// <summary>Thẻ Tổng hợp (SummaryPanel của bản web): chiết khấu, phụ phí, thuế theo thứ tự áp dụng. Không có khoản hay tỷ lệ mặc định.</summary>
    internal sealed class SummaryPanel : QuotePanel
    {
        internal sealed class Draft
        {
            public string Name = "";
            public AdjustmentKind Kind = AdjustmentKind.Add;
            public AdjustmentMethod Method = AdjustmentMethod.PercentOfRunning;
            public string Value = "";
        }

        internal sealed class DraftRow
        {
            public TextField Name = null!;
            public ChoiceField Kind = null!;
            public ChoiceField Method = null!;
            public TextField Value = null!;
        }

        private readonly TablePicker picker;
        private readonly Label noTables;
        private readonly Label current;
        private readonly Label invalidRows;
        private readonly TableLayoutPanel rows;
        private readonly Button add;
        private readonly Button apply;
        private readonly Button remove;
        private readonly List<DraftRow> rowControls = new List<DraftRow>();
        private SummaryState? state;
        private string loadedTable = "";

        public SummaryPanel(QuoteSession session) : base(session)
        {
            Body.Controls.Add(Ux.Text(Q.Sum.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.Sum.Intro));
            noTables = Ux.Notice(Q.NoTablesCreateFirst, SystemColors.ControlText);
            Body.Controls.Add(noTables);
            picker = new TablePicker(session);
            Body.Controls.Add(picker);
            current = Ux.Text("");
            Body.Controls.Add(current);
            invalidRows = Ux.Notice("", Ux.WarningColor);
            invalidRows.Visible = false;
            Body.Controls.Add(invalidRows);
            rows = Ux.Stack();
            rows.Dock = DockStyle.Fill;
            Body.Controls.Add(rows);
            add = Ux.Button(Q.Sum.Add, (_, __) => AddDraft());
            apply = Ux.Button(Q.Sum.Apply, (_, __) => ApplyNow());
            remove = Ux.Button(Q.Sum.RemoveTable, (_, __) => RemoveNow());
            remove.Visible = false;
            Body.Controls.Add(Ux.ButtonRow(add, apply, remove));
            Body.Controls.Add(Status);
            Sync();
        }

        public IReadOnlyList<DraftRow> Rows => rowControls;
        public Button RemoveButton => remove;

        public void ApplyNow() => Run(ApplyAsync, writes: true);
        public void RemoveNow() => Run(RemoveAsync, writes: true);

        public override bool FollowSelection => !Dirty;

        private bool Dirty
        {
            get
            {
                var saved = (state?.Adjustments ?? new List<Adjustment>()).Select(Key);
                return !saved.SequenceEqual(ReadDrafts().Select(d => $"{d.Name}|{d.Kind}|{d.Method}|{d.Value}"));
            }
        }

        private static string ValueText(decimal? value) => value == null ? "" : DecimalInput.Format(value.Value);

        private static string Key(Adjustment a) => $"{a.Name}|{a.Kind}|{a.Method}|{ValueText(a.Value)}";

        private void Sync()
        {
            var has = Session.Tables.Count > 0;
            noTables.Visible = !has;
            picker.Visible = rows.Visible = add.Visible = apply.Visible = has;
        }

        protected override void OnTablesChanged()
        {
            picker.Rebuild();
            Sync();
        }

        public override Task ReloadAsync()
        {
            // Giữ các khoản đang sửa dở khi chỉ chuyển qua lại giữa các cửa sổ.
            if (Session.SelectedTable != loadedTable || !Dirty)
            {
                Run(LoadAsync);
            }
            return LastWork;
        }

        private async Task LoadAsync()
        {
            loadedTable = Session.SelectedTable;
            if (loadedTable == "")
            {
                state = null;
                ShowDrafts(new List<Draft>());
                return;
            }
            state = await Session.Gateway.ReadSummaryAsync(loadedTable);
            current.Text = state.Exists ? Q.Sum.Existing(state.Address) : Q.Sum.None;
            Ux.Show(invalidRows, state.InvalidRows > 0 ? Q.Sum.InvalidRows(state.InvalidRows) : null);
            remove.Visible = state.Exists;
            // Không đổi gì thì không dựng lại các ô: giữ con trỏ khi người dùng vừa quay lại cửa sổ.
            if (Dirty)
            {
                ShowDrafts(state.Adjustments.Select(a => new Draft { Name = a.Name, Kind = a.Kind, Method = a.Method, Value = ValueText(a.Value) }).ToList());
            }
        }

        private List<Draft> ReadDrafts() => rowControls.Select(r => new Draft
        {
            Name = r.Name.Value,
            Kind = (AdjustmentKind)Enum.Parse(typeof(AdjustmentKind), r.Kind.Value),
            Method = (AdjustmentMethod)Enum.Parse(typeof(AdjustmentMethod), r.Method.Value),
            Value = r.Value.Value,
        }).ToList();

        private void ShowDrafts(List<Draft> drafts)
        {
            rows.SuspendLayout();
            rows.Controls.Clear();
            rowControls.Clear();
            for (var i = 0; i < drafts.Count; i++)
            {
                var index = i;
                var d = drafts[i];
                var row = new DraftRow
                {
                    Name = new TextField(Q.Sum.Name(i + 1), required: true) { Value = d.Name },
                    Kind = new ChoiceField($"{Q.Sum.Kind} {i + 1}", new[] { new Choice(AdjustmentKind.Deduct.ToString(), Q.Sum.KindDeduct), new Choice(AdjustmentKind.Add.ToString(), Q.Sum.KindAdd) }),
                    Method = new ChoiceField($"{Q.Sum.Method} {i + 1}", new[]
                    {
                        new Choice(AdjustmentMethod.PercentOfRunning.ToString(), Q.Sum.MethodRunning),
                        new Choice(AdjustmentMethod.PercentOfBase.ToString(), Q.Sum.MethodBase),
                        new Choice(AdjustmentMethod.Fixed.ToString(), Q.Sum.MethodFixed),
                    }),
                    Value = new TextField($"{Q.Sum.Value} {i + 1}", hint: Q.Sum.ValueHint) { Value = d.Value },
                };
                row.Kind.Value = d.Kind.ToString();
                row.Method.Value = d.Method.ToString();
                row.Method.Combo.DropDownWidth = Ux.Px(340);
                var grid = Ux.Grid();
                grid.Controls.AddRange(new Control[] { row.Name, row.Value, row.Kind, row.Method });
                rows.Controls.Add(grid);
                var up = Ux.Button($"{Q.Sum.MoveUp} {i + 1}", (_, __) => MoveDraft(index, -1));
                up.Enabled = i > 0;
                var down = Ux.Button($"{Q.Sum.MoveDown} {i + 1}", (_, __) => MoveDraft(index, 1));
                down.Enabled = i < drafts.Count - 1;
                rows.Controls.Add(Ux.ButtonRow(up, down, Ux.Button($"{Q.Sum.Remove} {i + 1}", (_, __) => RemoveDraft(index))));
                rowControls.Add(row);
            }
            rows.ResumeLayout();
        }

        public void AddDraft()
        {
            var drafts = ReadDrafts();
            drafts.Add(new Draft());
            ShowDrafts(drafts);
        }

        public void MoveDraft(int index, int delta)
        {
            var drafts = ReadDrafts();
            var item = drafts[index];
            drafts.RemoveAt(index);
            drafts.Insert(index + delta, item);
            ShowDrafts(drafts);
        }

        public void RemoveDraft(int index)
        {
            var drafts = ReadDrafts();
            drafts.RemoveAt(index);
            ShowDrafts(drafts);
        }

        private async Task ApplyAsync()
        {
            Say(Ux.ErrorColor, null);
            var table = loadedTable;
            var adjustments = new List<Adjustment>();
            var hasError = false;
            foreach (var row in rowControls)
            {
                row.Name.Error = null;
                var parsed = DecimalInput.Parse(row.Value.Value);
                row.Value.Error = parsed.Ok ? null : parsed.Message;
                hasError |= !parsed.Ok;
                adjustments.Add(new Adjustment(row.Name.Value.Trim(),
                    (AdjustmentKind)Enum.Parse(typeof(AdjustmentKind), row.Kind.Value),
                    (AdjustmentMethod)Enum.Parse(typeof(AdjustmentMethod), row.Method.Value),
                    parsed.Ok ? parsed.Value : null));
            }
            foreach (var error in Adjustments.Validate(adjustments))
            {
                if (error.Field == "name")
                {
                    rowControls[error.Index].Name.Error = error.Message;
                }
                else
                {
                    rowControls[error.Index].Value.Error = error.Message;
                }
                hasError = true;
            }
            if (hasError)
            {
                Say(Ux.ErrorColor, Q.Sum.Errors);
                return;
            }
            // Người dùng có thể đã sửa bảng tổng hợp trực tiếp trên sheet: khác lần đọc trước thì tải lại, không ghi đè.
            var now = await Session.Gateway.ReadSummaryAsync(table);
            if (now.Exists != (state?.Exists ?? false) || !now.Adjustments.Select(Key).SequenceEqual((state?.Adjustments ?? new List<Adjustment>()).Select(Key)))
            {
                await LoadAsync();
                Say(Ux.WarningColor, Q.Sum.ChangedOnSheet);
                return;
            }
            var check = await Session.Gateway.InspectSummaryAsync(table, adjustments.Count);
            if (!check.Ok)
            {
                Say(Ux.ErrorColor, Q.Sum.Blocked(check));
                return;
            }
            if (!Session.Prompts.Confirm(this, Q.Sum.ConfirmTitle, Q.Sum.ConfirmBody(check.Address, adjustments.Count), Q.Check.Confirm, Q.Cancel))
            {
                return;
            }
            try
            {
                await Session.Gateway.WriteSummaryAsync(table, adjustments, check.Fingerprint);
            }
            catch (TargetChangedException)
            {
                Say(Ux.WarningColor, Q.Sum.Changed);
                return;
            }
            await LoadAsync();
            Say(Ux.SuccessColor, Q.Sum.Written);
        }

        private async Task RemoveAsync()
        {
            Say(Ux.ErrorColor, null);
            if (!Session.Prompts.Confirm(this, Q.Sum.RemoveTitle, Q.Sum.RemoveBody, Q.Sum.RemoveTable, Q.Cancel))
            {
                return;
            }
            await Session.Gateway.RemoveSummaryAsync(loadedTable);
            await LoadAsync();
            Say(Ux.SuccessColor, Q.Sum.Removed);
        }
    }

    /// <summary>Thẻ Làm tròn (RoundingPanel của bản web): quy tắc cho cả workbook, lưu trong file.</summary>
    internal sealed class RoundingPanel : QuotePanel
    {
        private sealed class LevelRow
        {
            public ChoiceField Mode = null!;
            public ChoiceField Digits = null!;
            public Label Current = null!;
        }

        private readonly Dictionary<RoundingLevel, LevelRow> levels = new Dictionary<RoundingLevel, LevelRow>();
        private readonly Button apply;
        private RoundingConfig? saved;

        public RoundingPanel(QuoteSession session) : base(session)
        {
            Body.Controls.Add(Ux.Text(Q.Round.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.Round.Intro));
            foreach (var level in Rounding.Levels)
            {
                Body.Controls.Add(Ux.Text(Q.Round.Levels[level], Ux.Bold));
                var row = new LevelRow
                {
                    Mode = new ChoiceField($"{Q.Round.Mode}: {Q.Round.Levels[level]}", Q.Round.Modes.Select(m => new Choice(m.Key.ToString(), m.Value))),
                    Digits = new ChoiceField($"{Q.Round.Digits}: {Q.Round.Levels[level]}", Q.Round.DigitOptions.Select(d => new Choice(d.Key.ToString(CultureInfo.InvariantCulture), d.Value))),
                    Current = Ux.Text("", color: SystemColors.GrayText),
                };
                row.Mode.Combo.SelectedIndexChanged += (_, __) => row.Digits.Combo.Enabled = row.Mode.Value != RoundingMode.None.ToString();
                var grid = Ux.Grid();
                grid.Controls.AddRange(new Control[] { row.Mode, row.Digits });
                Body.Controls.Add(grid);
                Body.Controls.Add(row.Current);
                levels[level] = row;
            }
            apply = Ux.Button(Q.Round.Apply, (_, __) => ApplyNow());
            Body.Controls.Add(Ux.ButtonRow(apply));
            Body.Controls.Add(Status);
        }

        public void ApplyNow() => Run(ApplyAsync, writes: true);

        public void Set(RoundingLevel level, RoundingMode mode, int digits)
        {
            levels[level].Mode.Value = mode.ToString();
            levels[level].Digits.Value = digits.ToString(CultureInfo.InvariantCulture);
        }

        public RoundingRule Rule(RoundingLevel level)
        {
            var mode = (RoundingMode)Enum.Parse(typeof(RoundingMode), levels[level].Mode.Value);
            return mode == RoundingMode.None ? Rounding.NoRounding : new RoundingRule(mode, int.Parse(levels[level].Digits.Value, CultureInfo.InvariantCulture));
        }

        private bool Dirty => saved != null && Rounding.Levels.Any(l => !Rule(l).Equals(saved[l]));

        public override Task ReloadAsync()
        {
            if (!Dirty)
            {
                Run(LoadAsync);
            }
            return LastWork;
        }

        private async Task LoadAsync()
        {
            Show(await Session.Gateway.ReadRoundingAsync());
        }

        private void Show(RoundingConfig config)
        {
            saved = config;
            foreach (var level in Rounding.Levels)
            {
                var row = levels[level];
                var rule = config[level];
                // Công thức sẵn có có thể dùng độ chính xác ngoài danh sách gợi ý: thêm vào để không đọc sai.
                var digits = rule.Digits.ToString(CultureInfo.InvariantCulture);
                if (rule.Mode != RoundingMode.None && row.Digits.Combo.Items.Cast<Choice>().All(c => c.Id != digits))
                {
                    row.Digits.Combo.Items.Add(new Choice(digits, Rounding.DescribeDigits(rule.Digits)));
                }
                row.Mode.Value = rule.Mode.ToString();
                row.Digits.Value = rule.Mode == RoundingMode.None ? "0" : digits;
                row.Digits.Combo.Enabled = rule.Mode != RoundingMode.None;
                row.Current.Text = $"{Q.Round.Current(Rounding.Describe(rule))} {Q.Round.LevelHints[level]}";
            }
        }

        private async Task ApplyAsync()
        {
            Say(Ux.ErrorColor, null);
            if (!Session.Prompts.Confirm(this, Q.Round.ConfirmTitle, Q.Round.ConfirmBody, Q.Check.Confirm, Q.Cancel))
            {
                return;
            }
            var config = new RoundingConfig(Rule(RoundingLevel.UnitPrice), Rule(RoundingLevel.Amount), Rule(RoundingLevel.Adjustment));
            var result = await Session.Gateway.ApplyRoundingAsync(config);
            Show(config);
            Say(Ux.SuccessColor, Q.Round.Applied(result.UpdatedCells, result.KeptCells));
        }
    }

    /// <summary>Thẻ Ghi chú (TermsPanel của bản web). Add-in không soạn sẵn điều khoản nào.</summary>
    internal sealed class TermsPanel : QuotePanel
    {
        private readonly TablePicker picker;
        private readonly Label noTables;
        private readonly Label current;
        private readonly Button save;
        private readonly Button remove;
        private readonly Dictionary<TermsKey, TextField> fields = new Dictionary<TermsKey, TextField>();
        private TermsState? state;
        private string loadedTable = "";

        public TermsPanel(QuoteSession session) : base(session)
        {
            Body.Controls.Add(Ux.Text(Q.TermsText.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.TermsText.Intro));
            noTables = Ux.Notice(Q.NoTablesCreateFirst, SystemColors.ControlText);
            Body.Controls.Add(noTables);
            picker = new TablePicker(session);
            Body.Controls.Add(picker);
            current = Ux.Text("");
            Body.Controls.Add(current);
            foreach (var section in Terms.Sections)
            {
                var box = new TextField(section.Value.TrimEnd(':'), multiline: true);
                box.Box.MaxLength = 0;
                box.Box.Height = Ux.Px(64);
                fields[section.Key] = box;
                Body.Controls.Add(box);
            }
            save = Ux.Button(Q.TermsText.Apply, (_, __) => SaveNow());
            remove = Ux.Button(Q.TermsText.Remove, (_, __) => RemoveNow());
            remove.Visible = false;
            Body.Controls.Add(Ux.ButtonRow(save, remove));
            Body.Controls.Add(Status);
            Sync();
        }

        public IReadOnlyDictionary<TermsKey, TextField> Fields => fields;

        public void SaveNow() => Run(SaveAsync, writes: true);
        public void RemoveNow() => Run(RemoveAsync, writes: true);

        public override bool FollowSelection => !Dirty;

        private List<TermsSection> Input() => Terms.Sections.Select(s => new TermsSection(s.Key, fields[s.Key].Value)).ToList();

        private static IEnumerable<string> Keys(IReadOnlyCollection<TermsSection> sections) => Terms.ToWrite(sections).Select(s => $"{s.Key}|{s.Text}");

        private bool Dirty => !Keys(Input()).SequenceEqual(Keys(state?.Sections ?? new List<TermsSection>()));

        private void Sync()
        {
            var has = Session.Tables.Count > 0;
            noTables.Visible = !has;
            picker.Visible = save.Visible = has;
            foreach (var box in fields.Values)
            {
                box.Visible = has;
            }
        }

        protected override void OnTablesChanged()
        {
            picker.Rebuild();
            Sync();
        }

        public override Task ReloadAsync()
        {
            if (Session.SelectedTable != loadedTable || !Dirty)
            {
                Run(LoadAsync);
            }
            return LastWork;
        }

        private async Task LoadAsync()
        {
            loadedTable = Session.SelectedTable;
            if (loadedTable == "")
            {
                state = null;
                return;
            }
            state = await Session.Gateway.ReadTermsAsync(loadedTable);
            current.Text = state.Exists ? Q.TermsText.Existing(state.Address) : Q.TermsText.None;
            remove.Visible = state.Exists;
            foreach (var section in Terms.Sections)
            {
                var text = (state.Sections.FirstOrDefault(s => s.Key == section.Key)?.Text ?? "").Replace("\r\n", "\n").Replace("\n", "\r\n");
                if (fields[section.Key].Value != text)
                {
                    fields[section.Key].Value = text;
                }
                fields[section.Key].Error = null;
            }
        }

        private async Task SaveAsync()
        {
            Say(Ux.ErrorColor, null);
            var table = loadedTable;
            var input = Input();
            foreach (var box in fields.Values)
            {
                box.Error = null;
            }
            var invalid = Terms.Validate(input);
            foreach (var key in invalid)
            {
                fields[key].Error = Q.TermsText.TooLong;
            }
            if (invalid.Count > 0)
            {
                return;
            }
            if (Terms.ToWrite(input).Count == 0)
            {
                if (state?.Exists == true)
                {
                    await RemoveAsync();
                }
                else
                {
                    Say(SystemColors.ControlText, Q.TermsText.Nothing);
                }
                return;
            }
            // Người dùng có thể đã sửa khu vực này trực tiếp trên sheet: khác lần đọc trước thì tải lại, không ghi đè.
            var now = await Session.Gateway.ReadTermsAsync(table);
            if (now.Exists != (state?.Exists ?? false) || !Keys(now.Sections).SequenceEqual(Keys(state?.Sections ?? new List<TermsSection>())))
            {
                await LoadAsync();
                Say(Ux.WarningColor, Q.TermsText.ChangedOnSheet);
                return;
            }
            var rows = Terms.Rows(input);
            var check = await Session.Gateway.InspectTermsAsync(table, rows.Count);
            if (!check.Ok)
            {
                Say(Ux.ErrorColor, Q.TermsText.Blocked(check));
                return;
            }
            if (!Session.Prompts.Confirm(this, Q.TermsText.ConfirmTitle, Q.TermsText.ConfirmBody(check.Address, Terms.ToWrite(input).Count), Q.Check.Confirm, Q.Cancel))
            {
                return;
            }
            List<string> clipped;
            try
            {
                clipped = await Session.Gateway.WriteTermsAsync(table, input, check.Fingerprint);
            }
            catch (TargetChangedException)
            {
                Say(Ux.WarningColor, Q.TermsText.ChangedOnSheet);
                return;
            }
            await LoadAsync();
            if (clipped.Count > 0)
            {
                Say(Ux.WarningColor, Q.TermsText.Clipped(clipped));
            }
            else
            {
                Say(Ux.SuccessColor, Q.TermsText.Written);
            }
        }

        private async Task RemoveAsync()
        {
            Say(Ux.ErrorColor, null);
            if (!Session.Prompts.Confirm(this, Q.TermsText.RemoveTitle, Q.TermsText.RemoveBody, Q.TermsText.Remove, Q.Cancel))
            {
                return;
            }
            await Session.Gateway.RemoveTermsAsync(loadedTable);
            await LoadAsync();
            Say(Ux.SuccessColor, Q.TermsText.Removed);
        }
    }

    /// <summary>Thẻ Trang in (PrintSetupPanel của bản web). Xem trước, in, xuất PDF dùng chức năng có sẵn của Excel.</summary>
    internal sealed class PrintPanel : QuotePanel
    {
        private readonly TablePicker picker;
        private readonly Label noTables;
        private readonly Label protectedNote;
        private readonly Label area;
        private readonly Label current;
        private readonly Button apply;
        private PrintSetupState? state;

        public PrintPanel(QuoteSession session) : base(session)
        {
            Body.Controls.Add(Ux.Text(Q.PrintText.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.PrintText.Intro));
            noTables = Ux.Notice(Q.NoTablesCreateFirst, SystemColors.ControlText);
            Body.Controls.Add(noTables);
            picker = new TablePicker(session);
            Body.Controls.Add(picker);
            protectedNote = Ux.Notice(Q.PrintText.Protected, Ux.WarningColor);
            protectedNote.Visible = false;
            Body.Controls.Add(protectedNote);
            area = Ux.Text("", Ux.Bold);
            Body.Controls.Add(area);
            current = Ux.Text("", color: SystemColors.GrayText);
            Body.Controls.Add(current);
            Orientation = new ChoiceField(Q.PrintText.Orientation, new[] { new Choice(PageOrientationKind.Portrait.ToString(), Q.PrintText.Portrait), new Choice(PageOrientationKind.Landscape.ToString(), Q.PrintText.Landscape) });
            Paper = new ChoiceField(Q.PrintText.Paper, new[] { new Choice(PaperKind.A4.ToString(), "A4"), new Choice(PaperKind.A3.ToString(), "A3"), new Choice(PaperKind.Letter.ToString(), "Letter") });
            Fit = new ChoiceField(Q.PrintText.Fit, new[] { new Choice(FitKind.Width.ToString(), Q.PrintText.FitWidth), new Choice(FitKind.Page.ToString(), Q.PrintText.FitPage), new Choice(FitKind.None.ToString(), Q.PrintText.FitNone) });
            Fit.Combo.Width = Ux.Px(340);
            Fit.Combo.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            var grid = Ux.Grid();
            grid.Controls.AddRange(new Control[] { Orientation, Paper });
            Body.Controls.Add(grid);
            Body.Controls.Add(Fit);
            RepeatHeader = Check(Q.PrintText.RepeatHeader);
            PageNumbers = Check(Q.PrintText.PageNumbers);
            Center = Check(Q.PrintText.Center);
            Wrap = Check(Q.PrintText.Wrap);
            apply = Ux.Button(Q.PrintText.Apply, (_, __) => ApplyNow());
            Body.Controls.Add(Ux.ButtonRow(apply));
            Body.Controls.Add(Status);
            Body.Controls.Add(Ux.Text(Q.PrintText.GuideTitle, Ux.Bold));
            Body.Controls.Add(Ux.Text(string.Join("\n", Q.PrintText.Guide)));
            Sync();
        }

        public ChoiceField Orientation { get; }
        public ChoiceField Paper { get; }
        public ChoiceField Fit { get; }
        public CheckBox RepeatHeader { get; }
        public CheckBox PageNumbers { get; }
        public CheckBox Center { get; }
        public CheckBox Wrap { get; }
        public string AreaText => area.Text;

        public void ApplyNow() => Run(ApplyAsync, writes: true);

        private CheckBox Check(string text)
        {
            var box = new CheckBox { Text = text, AutoSize = true, Checked = true, Margin = new Padding(Ux.Px(3)) };
            Body.Controls.Add(box);
            return box;
        }

        private void Sync()
        {
            var has = Session.Tables.Count > 0;
            noTables.Visible = !has;
            picker.Visible = apply.Visible = has;
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

        private async Task LoadAsync()
        {
            if (Session.SelectedTable == "")
            {
                return;
            }
            try
            {
                state = await Session.Gateway.ReadPrintSetupAsync(Session.SelectedTable);
            }
            catch (System.Runtime.InteropServices.COMException ex)
            {
                Say(Ux.ErrorColor, $"{ExcelErrors.Describe(ex)} {Q.PrintText.NoPrinterHint}");
                return;
            }
            area.Text = Q.PrintText.Area(state.QuoteArea, state.SheetName);
            protectedNote.Visible = state.SheetProtected;
            apply.Enabled = !state.SheetProtected;
            current.Text = Q.PrintText.CurrentText(state.Current);
        }

        private async Task ApplyAsync()
        {
            Say(Ux.ErrorColor, null);
            if (state == null)
            {
                await LoadAsync();
            }
            if (state == null || state.SheetProtected)
            {
                return;
            }
            var old = state.Current.PrintArea;
            if (!Session.Prompts.Confirm(this, Q.PrintText.ConfirmTitle, Q.PrintText.ConfirmBody(state.QuoteArea, old), Q.Check.Confirm, Q.Cancel))
            {
                return;
            }
            var options = new PrintOptions
            {
                Orientation = (PageOrientationKind)Enum.Parse(typeof(PageOrientationKind), Orientation.Value),
                Paper = (PaperKind)Enum.Parse(typeof(PaperKind), Paper.Value),
                Fit = (FitKind)Enum.Parse(typeof(FitKind), Fit.Value),
                RepeatHeader = RepeatHeader.Checked,
                PageNumbers = PageNumbers.Checked,
                CenterHorizontally = Center.Checked,
                WrapLongText = Wrap.Checked,
            };
            var printArea = await Session.Gateway.ApplyPrintSetupAsync(Session.SelectedTable, options);
            await LoadAsync();
            Say(Ux.SuccessColor, Q.PrintText.Applied(printArea));
        }
    }
}
