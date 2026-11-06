using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Quotation;
using ConsQuotation.LibraryUi;
using ConsQuotation.Ui;

namespace ConsQuotation.QuoteUi
{
    /// <summary>Chọn giá cho từng tài nguyên của định mức (CompositionPicker của bản web).</summary>
    internal sealed class CompositionPicker : TableLayoutPanel
    {
        private readonly Dictionary<string, ChoiceField> fields = new Dictionary<string, ChoiceField>();
        private readonly TableLayoutPanel rows;
        private readonly Label existing;
        private readonly Label preview;
        private readonly Label errors;

        public CompositionPicker()
        {
            ColumnCount = 1;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Dock = DockStyle.Fill;
            Margin = new Padding(0);
            ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Ux.KeepOrder(this);
            Controls.Add(Ux.Text(Q.Comp.Title, Ux.Bold));
            Controls.Add(Ux.Text(Q.Comp.Intro));
            existing = Ux.Notice("", Ux.WarningColor);
            existing.Visible = false;
            Controls.Add(existing);
            rows = Ux.Stack();
            rows.Dock = DockStyle.Fill;
            Controls.Add(rows);
            preview = Ux.Text("", Ux.Bold);
            Controls.Add(preview);
            errors = Ux.Text("", color: Ux.ErrorColor);
            errors.Visible = false;
            Controls.Add(errors);
        }

        public event Action? SelectionChanged;

        public IReadOnlyDictionary<string, ChoiceField> Fields => fields;

        public Dictionary<string, string> Selection() =>
            fields.Where(p => p.Value.Value != "").ToDictionary(p => p.Key, p => p.Value.Value);

        public void Show(IReadOnlyList<CompositionLine> lines, IReadOnlyDictionary<string, string> selection, string today)
        {
            rows.SuspendLayout();
            rows.Controls.Clear();
            fields.Clear();
            foreach (var line in lines)
            {
                var resource = line.Resource;
                var name = resource != null ? $"{resource.Code}: {resource.Name}" : $"{line.Component.ResourceCodeSnapshot} {Q.Comp.MissingResource}";
                var label = $"{name}. {Q.Comp.Quantity(Formats.Quantity(line.Consumption), resource?.Unit ?? line.Component.ResourceUnitSnapshot)}";
                var usable = line.Options.Where(o => o.UnitMatches).ToList();
                var choices = new[] { new Choice("", Q.Comp.NoPrice) }.Concat(usable.Select(o => new Choice(o.Price.Id,
                    $"{Formats.Quantity(o.Price.Price)} {o.Price.Currency}/{o.Price.Unit} · {S.PriceStatuses[o.Price.Status]} · {S.Validities[o.Validity]}{(o.Price.Source != "" ? " · " + o.Price.Source : "")}")));
                var hint = usable.Count == 0 ? Q.Comp.NoOptions
                    : line.DefaultPriceId != null ? Q.Comp.OnlyValid
                    : usable.Count > 1 ? Q.Comp.MustChoose
                    : null;
                var field = new ChoiceField(label, choices, hint);
                field.Combo.Width = Ux.Px(520);
                field.Combo.Anchor = AnchorStyles.Top | AnchorStyles.Left;
                field.Combo.DropDownWidth = Ux.Px(640);
                field.Value = selection.TryGetValue(line.Component.Id, out var id) ? id : "";
                field.Combo.SelectedIndexChanged += (_, __) => SelectionChanged?.Invoke();
                fields[line.Component.Id] = field;
                rows.Controls.Add(field);
            }
            rows.ResumeLayout();
        }

        public void ShowResult(CompositionResult? result, RoundingRule rule, AnalysisPrice? existingPrice, string code)
        {
            var hasExisting = existingPrice != null;
            Ux.Show(existing, !hasExisting ? null : Q.Comp.Exists(code,
                existingPrice!.Kind == AnalysisPriceKind.Value ? Formats.Quantity((decimal)existingPrice.Value)
                : existingPrice.Kind == AnalysisPriceKind.Error ? existingPrice.Error
                : Q.Comp.ExistsMissing));
            rows.Enabled = !hasExisting;
            preview.Text = hasExisting || result == null ? ""
                : result.Preview != null ? Q.Comp.Preview(Formats.Quantity(result.Preview.Value), result.Currency, Rounding.Describe(rule))
                : Q.Comp.PreviewMissing;
            preview.Visible = preview.Text != "";
            Ux.Show(errors, hasExisting || result == null ? null : string.Join(" ", result.Errors));
        }
    }

    /// <summary>Thẻ Thêm công tác (AddWorkItemPanel của bản web): nhập trực tiếp, từ thư viện hoặc phân tích từ định mức.</summary>
    internal sealed class AddItemPanel : QuotePanel
    {
        private static readonly int UnitPriceIndex = QuoteTemplate.Columns.ToList().FindIndex(c => c.Key == QuoteColumnKey.UnitPrice);
        private static readonly int NotesIndex = QuoteTemplate.Columns.ToList().FindIndex(c => c.Key == QuoteColumnKey.Notes);

        private readonly TablePicker picker;
        private readonly Label noTables;
        private readonly Label prefilled;
        private readonly Panel form;
        private readonly Label positionHint;
        private readonly TableLayoutPanel methodBox;
        private readonly RadioButton methodLibrary;
        private readonly RadioButton methodComposition;
        private readonly CompositionPicker composition;
        private LibraryPrefill? fromLibrary;
        private RoundingConfig rounding = Rounding.Default;
        private AnalysisPrice? existingAnalysis;

        public AddItemPanel(QuoteSession session) : base(session)
        {
            Body.Controls.Add(Ux.Text(Q.Add.Title, Ux.Heading));
            Body.Controls.Add(Ux.Text(Q.Add.Description));
            noTables = Ux.Notice(Q.NoTablesCreateFirst, SystemColors.ControlText);
            Body.Controls.Add(noTables);

            var stack = Ux.Stack();
            stack.Dock = DockStyle.Fill;
            form = new Panel { AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Dock = DockStyle.Fill, Margin = new Padding(0) };
            form.Controls.Add(stack);
            Body.Controls.Add(form);

            picker = new TablePicker(session);
            stack.Controls.Add(picker);
            stack.Controls.Add(Ux.ButtonRow(
                Ux.Button(Q.Add.FromLibrary, (_, __) => PickFromLibrary()),
                Ux.Button(Q.Refresh, (_, __) => Run(() => Session.RefreshTablesAsync(true)))));
            prefilled = Ux.Notice("", SystemColors.ControlText);
            prefilled.Visible = false;
            stack.Controls.Add(prefilled);

            stack.Controls.Add(Ux.Text(Q.Add.Position, Ux.Bold));
            PositionEnd = new RadioButton { Text = Q.Add.PositionEnd, AutoSize = true, Checked = true, Margin = new Padding(Ux.Px(3)) };
            PositionBelow = new RadioButton { Text = Q.Add.PositionBelow, AutoSize = true, Margin = new Padding(Ux.Px(3)) };
            var positions = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Margin = new Padding(0) };
            positions.Controls.AddRange(new Control[] { PositionEnd, PositionBelow });
            stack.Controls.Add(positions);
            positionHint = Ux.Text("", color: SystemColors.GrayText);
            stack.Controls.Add(positionHint);
            PositionEnd.CheckedChanged += (_, __) => ShowPositionHint();

            methodBox = Ux.Stack();
            methodBox.Dock = DockStyle.Fill;
            methodBox.Controls.Add(Ux.Text(Q.Add.Method, Ux.Bold));
            methodLibrary = new RadioButton { Text = Q.Add.MethodLibrary, AutoSize = true, Margin = new Padding(Ux.Px(3)) };
            methodComposition = new RadioButton { Text = "", AutoSize = true, Margin = new Padding(Ux.Px(3)) };
            var methods = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Margin = new Padding(0) };
            methods.Controls.AddRange(new Control[] { methodLibrary, methodComposition });
            methodBox.Controls.Add(methods);
            methodBox.Visible = false;
            stack.Controls.Add(methodBox);
            methodComposition.CheckedChanged += (_, __) => ApplyMethod();

            composition = new CompositionPicker { Visible = false };
            composition.SelectionChanged += RefreshComposition;
            stack.Controls.Add(composition);

            Code = new TextField(Q.Add.Code);
            Group = new TextField(Q.Add.Group);
            Description = new TextField(Q.Add.Description2, required: true);
            Unit = new TextField(Q.Add.Unit);
            Quantity = new TextField(Q.Add.Quantity, hint: Q.Add.NumberHint);
            UnitPrice = new TextField(Q.Add.UnitPrice, hint: Q.Add.NumberHint);
            Notes = new TextField(Q.Add.Notes);
            var grid = Ux.Grid();
            grid.Controls.AddRange(new Control[] { Code, Group, Unit, Quantity, UnitPrice });
            stack.Controls.Add(Description);
            stack.Controls.Add(grid);
            stack.Controls.Add(Notes);
            Submit = Ux.Button(Q.Add.Submit, (_, __) => Add());
            stack.Controls.Add(Ux.ButtonRow(Submit));
            Body.Controls.Add(Status);
            Sync();
        }

        public RadioButton PositionEnd { get; }
        public RadioButton PositionBelow { get; }
        public TextField Code { get; }
        public TextField Group { get; }
        public TextField Description { get; }
        public TextField Unit { get; }
        public TextField Quantity { get; }
        public TextField UnitPrice { get; }
        public TextField Notes { get; }
        public Button Submit { get; }
        public CompositionPicker Picker => composition;
        public RadioButton MethodLibrary => methodLibrary;
        public RadioButton MethodComposition => methodComposition;
        public string PrefilledText => prefilled.Text;

        public void Add() => Run(SubmitAsync, writes: true);

        private bool UsingComposition => fromLibrary != null && fromLibrary.Lines.Count > 0 && methodComposition.Checked;

        private void Sync()
        {
            var has = Session.Tables.Count > 0;
            noTables.Visible = !has;
            form.Visible = has;
        }

        protected override void OnTablesChanged()
        {
            picker.Rebuild();
            Sync();
            // Mỗi khi vùng chọn đổi: đang chọn ô trong bảng thì chèn ngay dưới dòng đó; không thì cuối bảng.
            var table = Session.CurrentTable;
            PositionBelow.Checked = table?.ContainsSelection == true;
            PositionEnd.Checked = !PositionBelow.Checked;
            ShowPositionHint();
        }

        private void ShowPositionHint()
        {
            var row = Session.CurrentTable?.SelectedSheetRow;
            positionHint.Text = PositionEnd.Checked ? Q.Add.PositionEndHint : row != null ? Q.Add.PositionBelowAt(row.Value) : Q.Add.PositionBelowOutside;
            positionHint.ForeColor = !PositionEnd.Checked && row == null ? Ux.WarningColor : SystemColors.GrayText;
        }

        private void PickFromLibrary()
        {
            Session.Library.ReloadIfChangedOutside();
            if (Session.Library.Library.WorkItems.Count == 0)
            {
                Say(SystemColors.ControlText, Q.Add.PickEmpty);
                return;
            }
            using (var dialog = new PickWorkItemDialog(Session.Library))
            {
                if (dialog.ShowDialog(this) == DialogResult.OK && dialog.Picked != null)
                {
                    Prefill(LibraryPrefill.From(dialog.Picked, Session.Library));
                }
            }
        }

        private static string Warning(InsertWarning warning) =>
            warning.Kind == InsertWarningKind.MissingPrice ? Q.Add.MissingPrice
            : warning.Kind == InsertWarningKind.Expired ? Q.Add.Expired(Dates.FormatIsoDate(warning.Date))
            : Q.Add.NotYetEffective(Dates.FormatIsoDate(warning.Date));

        /// <summary>Bấm "Chèn vào báo giá" ở thư viện: điền sẵn form; người dùng nhập Khối lượng rồi bấm Thêm.</summary>
        public void Prefill(LibraryPrefill prefill)
        {
            fromLibrary = prefill;
            existingAnalysis = null;
            ShowDraft(prefill.Draft);
            Say(Ux.ErrorColor, null);
            var messages = new[] { Q.Add.Prefilled(prefill.Item.Code) }.Concat(prefill.Warnings.Select(Warning));
            Ux.Show(prefilled, string.Join(" ", messages));
            prefilled.ForeColor = prefill.Warnings.Count > 0 ? Ux.WarningColor : SystemColors.ControlText;
            var lines = prefill.Lines;
            methodBox.Visible = lines.Count > 0;
            if (lines.Count > 0)
            {
                methodLibrary.Text = prefill.Item.UnitPrice == null ? Q.Add.MethodLibraryNone : Q.Add.MethodLibrary;
                methodComposition.Text = Q.Add.MethodComposition(lines.Count);
                composition.Show(lines, Composition.DefaultSelection(lines), Session.Library.Today);
                // Người dùng tự chọn cách xác định đơn giá; mặc định phân tích khi thư viện chưa có đơn giá.
                methodComposition.Checked = prefill.Item.UnitPrice == null;
                methodLibrary.Checked = !methodComposition.Checked;
                ApplyMethod();
                Run(LoadCompositionContextAsync);
            }
            else
            {
                methodLibrary.Checked = true;
                ApplyMethod();
            }
        }

        private async Task LoadCompositionContextAsync()
        {
            rounding = await Session.Gateway.ReadRoundingAsync();
            existingAnalysis = await Session.Gateway.FindAnalysisAsync(fromLibrary!.Item.Code);
            RefreshComposition();
        }

        private void ShowDraft(WorkItemDraftInput draft)
        {
            Code.Value = draft.Code;
            Group.Value = draft.Group;
            Description.Value = draft.Description;
            Unit.Value = draft.Unit;
            Quantity.Value = draft.Quantity;
            UnitPrice.Value = draft.UnitPrice;
            Notes.Value = draft.Notes;
            foreach (var field in new[] { Description, Quantity, UnitPrice })
            {
                field.Error = null;
            }
        }

        private void ApplyMethod()
        {
            var source = fromLibrary;
            var using_ = UsingComposition;
            composition.Visible = using_;
            UnitPrice.Box.Enabled = !using_;
            UnitPrice.Warning = using_ ? Q.Comp.UnitPriceLocked : null;
            if (source == null || source.Lines.Count == 0)
            {
                return;
            }
            // Ô Đơn giá và ghi chú truy vết đổi theo phương pháp: hiển thị rõ phương pháp và nguồn giá.
            UnitPrice.Value = using_ ? "" : source.Draft.UnitPrice;
            Notes.Value = using_ ? Composition.Note(source.Item, source.Lines.Count, "") : source.Draft.Notes;
            RefreshComposition();
        }

        private CompositionResult? BuildComposition()
        {
            var source = fromLibrary;
            return source == null || source.Lines.Count == 0 ? null : Composition.Build(source.Item, source.Lines, composition.Selection(), rounding.UnitPrice);
        }

        private void RefreshComposition()
        {
            if (fromLibrary != null)
            {
                composition.ShowResult(BuildComposition(), rounding.UnitPrice, existingAnalysis, fromLibrary.Item.Code);
            }
        }

        private WorkItemDraftInput Draft() => new WorkItemDraftInput
        {
            Code = Code.Value,
            Group = Group.Value,
            Description = Description.Value,
            Unit = Unit.Value,
            Quantity = Quantity.Value,
            UnitPrice = UsingComposition ? "" : UnitPrice.Value,
            Notes = Notes.Value,
        };

        private async Task SubmitAsync()
        {
            Say(Ux.ErrorColor, null);
            var result = UsingComposition ? BuildComposition() : null;
            if (UsingComposition && existingAnalysis == null && result != null && !result.Ok)
            {
                Say(Ux.ErrorColor, string.Join(" ", result.Errors));
                return;
            }
            var table = Session.SelectedTable;
            var input = Draft();
            var validation = WorkItemDraft.Validate(input, table);
            Description.Error = validation.Errors.FirstOrDefault(e => e.Field == DraftFields.Description)?.Message;
            Quantity.Error = validation.Errors.FirstOrDefault(e => e.Field == DraftFields.Quantity)?.Message;
            UnitPrice.Error = validation.Errors.FirstOrDefault(e => e.Field == DraftFields.UnitPrice)?.Message;
            if (!validation.Ok)
            {
                return;
            }
            var plan = await QuoteService.PlanAppendAsync(Session.Gateway, table, PositionBelow.Checked);
            if (plan.Status == PlanStatus.Blocked)
            {
                Say(Ux.ErrorColor, $"{Q.Add.BlockedTitle}. {Q.Blockers(plan.Inspection.Blockers)}");
                return;
            }
            if (plan.Status == PlanStatus.NeedsShiftConfirmation &&
                !Session.Prompts.Confirm(this, Q.Add.ConfirmShiftTitle, Q.Add.ConfirmShiftBody(plan.Inspection.CellsBelow.Count, plan.Inspection.CellsBelow.Sample), Q.Add.ConfirmShift, Q.Cancel))
            {
                return;
            }
            await ExecuteAsync(plan, validation.Row, input, result);
        }

        private async Task ExecuteAsync(AppendPlan plan, object[] baseRow, WorkItemDraftInput input, CompositionResult? compositionResult)
        {
            // Mã dòng ổn định (không phụ thuộc số hàng Excel) và mục hồ sơ chụp nguồn gốc của dòng.
            var lineId = Guid.NewGuid().ToString();
            var extras = new Dictionary<string, object> { [QuoteTemplate.LineIdHeader] = lineId };
            var identity = new FromInsert.Identity
            {
                Id = lineId,
                Code = input.Code.Trim(),
                Name = input.Description.Trim(),
                Unit = input.Unit.Trim(),
                Now = Session.Library.Now().ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture),
            };
            var source = fromLibrary;
            var withComposition = compositionResult != null && source != null;
            var item = source != null && !withComposition ? FromInsert.FromLibrary(identity, source.Item) : FromInsert.Manual(identity);
            CostBreakdown? breakdown = null;
            var row = baseRow;
            var notes = new List<string>();
            var incomplete = false;
            if (withComposition)
            {
                // Ghi phân tích (hoặc dùng phân tích có sẵn) rồi lấy đơn giá do chính Excel tính.
                var written = await Session.Gateway.WriteAnalysisAsync(source!.Item.Code, compositionResult!.Rows);
                var selection = composition.Selection();
                var price = written.Price;
                item = FromInsert.FromNorm(identity, source.Item, source.Lines, selection, compositionResult.Rows);
                // Đơn giá theo loại chỉ ghi khi khối phân tích vừa được ghi từ chính các thành phần này và đủ giá.
                breakdown = written.Written && price.Kind == AnalysisPriceKind.Value ? FromInsert.CompositionBreakdown(source.Lines, selection) : null;
                if (breakdown != null)
                {
                    foreach (var type in QuoteLineReader.CostTypes)
                    {
                        extras[QuoteTemplate.BreakdownHeader(type)] = breakdown[type]!.Value;
                    }
                }
                row = baseRow.ToArray();
                row[UnitPriceIndex] = price.Kind == AnalysisPriceKind.Value ? price.Value : (object)"";
                row[NotesIndex] = WorkItemDraft.AsLiteralText(Composition.Note(source.Item, source.Lines.Count, compositionResult.Currency));
                incomplete = price.Kind != AnalysisPriceKind.Value;
                notes.Add(Q.Comp.AnalysisSheet(written.SheetName));
                if (!written.Written && existingAnalysis == null)
                {
                    notes.Add(Q.Comp.ExistsUsed(source.Item.Code));
                }
                if (price.Kind == AnalysisPriceKind.Missing)
                {
                    notes.Add(Q.Comp.AddedMissing);
                }
                else if (price.Kind == AnalysisPriceKind.Error)
                {
                    notes.Add(Q.Comp.AddedError(price.Error));
                }
            }
            var result = await QuoteService.ExecuteAppendAsync(Session.Gateway, plan, new[] { row }, plan.Status == PlanStatus.NeedsShiftConfirmation, new IReadOnlyDictionary<string, object>[] { extras });
            if (result == null)
            {
                Say(Ux.WarningColor, withComposition ? Q.Comp.AnalysisWrittenButChanged : Q.Add.Changed);
                return;
            }
            item.WrittenBreakdown = breakdown;
            var registered = await Session.Quotation.RegisterInsertedLineAsync(result.TableName, item);
            // Bảng cũ chưa có cột Mã dòng: không có hồ sơ theo dòng, không cần báo.
            var registerNote = registered != null && registered != "notOnSheet" ? Q.Items.RegisterFailed(registered) : "";
            var message = string.Join(" ", new[] { Q.Add.Added(Q.Where(result.SheetName, result.Address)) }.Concat(notes).Concat(new[] { registerNote }).Where(t => t != ""));
            Say(incomplete || registerNote != "" ? Ux.WarningColor : Ux.SuccessColor, message);

            // Giữ Nhóm công tác và Đơn vị tính: thường lặp lại ở dòng kế tiếp.
            ShowDraft(new WorkItemDraftInput { Group = Group.Value, Unit = Unit.Value });
            if (source != null)
            {
                fromLibrary = null;
                existingAnalysis = null;
                Ux.Show(prefilled, null);
                methodBox.Visible = false;
                methodLibrary.Checked = true;
                ApplyMethod();
                // Đánh dấu workbook đã dùng thư viện để cảnh báo nếu sau này thư viện trên máy trống bất thường.
                try
                {
                    await Session.Gateway.MarkLibraryUsedAsync();
                }
                catch (System.Runtime.InteropServices.COMException)
                {
                    // Chỉ là dấu hiệu phụ; dòng đã ghi xong.
                }
            }
            await Session.RefreshTablesAsync(false);
        }
    }
}
