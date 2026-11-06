using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Quotation;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Storage;
using ConsQuotation.Ui;

namespace ConsQuotation.LibraryUi
{
    /// <summary>
    /// Một phiên bản định mức (NormEditor của bản web): thông tin, trạng thái, thành phần tài nguyên, giá áp dụng
    /// và kết quả tính đơn giá. Phiên bản không còn là nháp thì thành phần và hao phí bị khóa.
    /// </summary>
    internal sealed class NormDialog : Form
    {
        private readonly LibrarySession session;
        private string? normId;
        private string? editingComponentId;
        private bool suppressPriceChange;
        private NormCalcResult? result;

        private readonly Label title;
        private readonly Label status;
        private readonly Button approve;
        private readonly Button deactivate;
        private readonly Button copyVersion;
        private readonly Label statusMessage;
        private readonly Label lockedNote;
        private readonly Label failure;
        private readonly Control componentsSection;
        private readonly Label componentsTitle;
        private readonly Label componentsEmpty;
        private readonly Label selectHint;
        private readonly Label componentIssues;
        private readonly FlowLayoutPanel componentActions;
        private readonly Button moveUp;
        private readonly Button moveDown;
        private readonly Button refreshLink;
        private readonly Control componentForm;
        private readonly Label needResources;
        private readonly Button cancelEdit;
        private readonly Label resultStatus;
        private readonly TableLayoutPanel totals;
        private readonly Label generalIssues;
        private readonly Label exportNote;

        public NormDialog(LibrarySession session, string? normId)
        {
            this.session = session;
            this.normId = normId;
            Font = Ux.Font;
            Text = NS.NewTitle;
            ShowInTaskbar = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            Size = new Size(Ux.Px(940), Ux.Px(760));
            MinimumSize = new Size(Ux.Px(700), Ux.Px(480));

            var scroller = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(Ux.Px(10)) };
            var body = Ux.Stack();
            body.Dock = DockStyle.Top;
            scroller.Controls.Add(body);
            Controls.Add(scroller);

            title = Ux.Text("", Ux.Heading);
            status = Ux.Text("", Ux.Bold);
            body.Controls.Add(Ux.ButtonRow(title, status));
            approve = Ux.Button(NS.Approve, (_, __) => ChangeStatus(NormStatus.Approved));
            deactivate = Ux.Button(NS.Deactivate, (_, __) => ChangeStatus(NormStatus.Inactive));
            copyVersion = Ux.Button(NS.CopyVersion, (_, __) => CopyVersion());
            body.Controls.Add(Ux.ButtonRow(approve, deactivate, copyVersion));
            statusMessage = Ux.Notice("", Ux.WarningColor);
            body.Controls.Add(statusMessage);
            lockedNote = Ux.Notice(NS.LockedNote, SystemColors.ControlText);
            body.Controls.Add(lockedNote);
            failure = Ux.Text("", color: Ux.ErrorColor);
            failure.Visible = false;
            body.Controls.Add(failure);

            // ---------- Thông tin phiên bản ----------
            Code = new TextField(NS.FCode, required: true);
            Version = new TextField(NS.FVersion, required: true);
            NameField = new TextField(NS.FName, required: true);
            Unit = new TextField(NS.FUnit, required: true);
            Group = new RefField(NS.FCategory, session.Library.Categories.Select(c => (c.Id, c.Name)), S.NoneCategory);
            WorkItem = new RefField(NS.FWorkItem, Enumerable.Empty<(string, string)>(), NS.FNoWorkItem, hint: NS.FWorkItemHint, sortByName: false);
            EffectiveFrom = new DateField(NS.FEffectiveFrom);
            SourceType = new ChoiceField(NS.FSourceType, new[]
            {
                new Choice(NormSourceType.User.ToString(), NS.FSourceUser),
                new Choice(NormSourceType.Document.ToString(), NS.FSourceDocument),
            });
            var grid = Ux.Grid();
            grid.Controls.AddRange(new Control[] { Code, Version, NameField, Unit, Group, WorkItem, EffectiveFrom, SourceType });
            body.Controls.Add(grid);
            Source = new TextField(NS.FSource);
            body.Controls.Add(Source);
            SourceVerified = new CheckBox { Text = NS.FSourceVerified, AutoSize = true, Margin = new Padding(Ux.Px(3)) };
            body.Controls.Add(SourceVerified);
            WasteIncluded = new FieldBox("", new CheckBox { Text = NS.FWasteIncluded, AutoSize = true });
            WasteIncluded.Caption.Visible = false;
            body.Controls.Add(WasteIncluded);
            Notes = new TextField(NS.FNotes, multiline: true);
            body.Controls.Add(Notes);
            SaveButton = Ux.Button(NS.Save, (_, __) => SaveHeader());
            body.Controls.Add(Ux.ButtonRow(SaveButton));

            // ---------- Thành phần ----------
            var components = Ux.Stack();
            components.Dock = DockStyle.Top;
            componentsTitle = Ux.Text("", Ux.Bold);
            components.Controls.Add(componentsTitle);
            componentsEmpty = Ux.Text(NS.ComponentsEmpty, color: SystemColors.GrayText);
            components.Controls.Add(componentsEmpty);
            Components = new RecordList<ComponentResult>(c => c.ComponentId,
                new Column<ComponentResult>(NS.ColOrder, 30, c => (result!.Components.IndexOf(c) + 1).ToString(), HorizontalAlignment.Right),
                new Column<ComponentResult>(NS.ColType, 90, c => Composition.ResourceTypeText(c.Type)),
                new Column<ComponentResult>(NS.ColCode, 80, c => c.ResourceCode),
                new Column<ComponentResult>(NS.ColName, 190, c => c.ResourceName),
                new Column<ComponentResult>(NS.ColUnit, 50, c => c.ResourceUnit),
                new Column<ComponentResult>(NS.ColBase, 80, c => Formats.Quantity(c.BaseConsumption), HorizontalAlignment.Right),
                new Column<ComponentResult>(NS.ColWaste, 70, c => c.WasteApplied ? DecimalMath.RateToPercent(c.WasteRate) : "", HorizontalAlignment.Right),
                new Column<ComponentResult>(NS.ColEffective, 110, c => Formats.Quantity(c.EffectiveConsumption), HorizontalAlignment.Right),
                new Column<ComponentResult>(NS.ColPrice, 120, c => c.UnitPrice == null ? "" : $"{Formats.Money(c.UnitPrice, c.Currency)}/{c.PriceUnit}", HorizontalAlignment.Right),
                new Column<ComponentResult>(NS.ColAmount, 120, c => c.Amount == null ? NS.CUnpriced : Formats.Money(c.Amount, c.Currency), HorizontalAlignment.Right),
                new Column<ComponentResult>(NS.ColIssues, 220, c => string.Join(" ", IssuesOf(c).Select(i => i.Message))))
            {
                Height = Ux.Px(200),
                Dock = DockStyle.Top,
                RowColor = c => c.Severity == ComponentSeverity.Error ? Ux.ErrorColor : c.Severity == ComponentSeverity.Warning ? Ux.WarningColor : (Color?)null,
            };
            Components.SelectedIndexChanged += (_, __) => ShowSelectedComponent();
            Components.ItemActivate += (_, __) => StartEditSelected();
            Components.DeleteRequested += DeleteSelectedComponent;
            components.Controls.Add(Components);
            selectHint = Ux.Text(NS.CSelectHint, color: SystemColors.GrayText);
            components.Controls.Add(selectHint);
            componentIssues = Ux.Text("");
            components.Controls.Add(componentIssues);
            PriceChoice = new ChoiceField(NS.CChoosePrice, new Choice[0], NS.CChoosePriceHint);
            PriceChoice.Combo.Width = Ux.Px(420);
            PriceChoice.Combo.SelectedIndexChanged += (_, __) => PriceChanged();
            components.Controls.Add(PriceChoice);
            moveUp = Ux.Button(NS.CUp, (_, __) => MoveComponent(-1));
            moveDown = Ux.Button(NS.CDown, (_, __) => MoveComponent(1));
            refreshLink = Ux.Button(NS.CRefresh, (_, __) => RefreshLink());
            componentActions = Ux.ButtonRow(Ux.Button(NS.CEdit, (_, __) => StartEditSelected()), moveUp, moveDown, refreshLink,
                Ux.Button(NS.CRemove, (_, __) => DeleteSelectedComponent()));
            components.Controls.Add(componentActions);

            needResources = Ux.Text(NS.CNeedResources, color: SystemColors.GrayText);
            components.Controls.Add(needResources);
            ResourceChoice = new ChoiceField(NS.CResource, new Choice[0]);
            ResourceChoice.Caption.Text = NS.CResource + " *";
            ResourceChoice.Combo.Width = Ux.Px(420);
            Consumption = new TextField(NS.CConsumption, required: true, hint: NS.CConsumptionHint);
            Waste = new TextField(NS.CWastePercent, hint: NS.CWasteHint);
            ComponentNotes = new TextField(NS.CNotes);
            var formBox = new GroupBox { Text = NS.CAdd, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Dock = DockStyle.Top, Padding = new Padding(Ux.Px(8)) };
            var formStack = Ux.Stack();
            formStack.Dock = DockStyle.Top;
            formStack.Controls.Add(ResourceChoice);
            var amounts = Ux.Grid();
            amounts.Controls.AddRange(new Control[] { Consumption, Waste });
            formStack.Controls.Add(amounts);
            formStack.Controls.Add(ComponentNotes);
            SaveComponentButton = Ux.Button(NS.CAdd, (_, __) => SaveComponent());
            cancelEdit = Ux.Button(NS.CCancelEdit, (_, __) => ResetComponentForm());
            cancelEdit.Visible = false;
            formStack.Controls.Add(Ux.ButtonRow(SaveComponentButton, cancelEdit));
            formBox.Controls.Add(formStack);
            componentForm = formBox;
            components.Controls.Add(formBox);

            // ---------- Kết quả tính ----------
            components.Controls.Add(Ux.Text(NS.ResultTitle, Ux.Bold));
            resultStatus = Ux.Notice("", SystemColors.ControlText);
            components.Controls.Add(resultStatus);
            totals = new TableLayoutPanel { ColumnCount = 2, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Margin = new Padding(Ux.Px(3)) };
            totals.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            totals.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            components.Controls.Add(totals);
            components.Controls.Add(Ux.Text(NS.Formula, color: SystemColors.GrayText));
            components.Controls.Add(Ux.Text(NS.Rounding, color: SystemColors.GrayText));
            generalIssues = Ux.Notice("", SystemColors.ControlText);
            components.Controls.Add(generalIssues);
            ExportButton = Ux.Button(NS.ExportExcel, async (_, __) => await ExportAsync());
            ExportButton.Visible = session.Quotes != null;
            exportNote = Ux.Text("");
            exportNote.Visible = false;
            components.Controls.Add(Ux.ButtonRow(ExportButton));
            components.Controls.Add(exportNote);
            componentsSection = components;
            body.Controls.Add(components);

            var close = Ux.Button(S.Close, (_, __) => Close());
            CancelButton = close;
            var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(Ux.Px(6)) };
            bottom.Controls.Add(close);
            Controls.Add(bottom);

            LoadHeader();
            RefreshComponents();
        }

        public TextField Code { get; }
        public TextField Version { get; }
        public TextField NameField { get; }
        public TextField Unit { get; }
        public RefField Group { get; }
        public RefField WorkItem { get; }
        public DateField EffectiveFrom { get; }
        public ChoiceField SourceType { get; }
        public TextField Source { get; }
        public CheckBox SourceVerified { get; }
        public FieldBox WasteIncluded { get; }
        public TextField Notes { get; }
        public Button SaveButton { get; }
        public RecordList<ComponentResult> Components { get; }
        public ChoiceField PriceChoice { get; }
        public ChoiceField ResourceChoice { get; }
        public TextField Consumption { get; }
        public TextField Waste { get; }
        public TextField ComponentNotes { get; }
        public Button SaveComponentButton { get; }

        public Norm? Editing => normId == null ? null : session.Library.Norms.FirstOrDefault(n => n.Id == normId);
        public NormCalcResult? Result => result;
        public string StatusMessage => statusMessage.Text;
        public string FailureText => failure.Text;
        public Button ExportButton { get; }
        public string ExportNote => exportNote.Text;

        private CheckBox WasteBox => (CheckBox)WasteIncluded.Editor;

        private bool Guard(Action action)
        {
            Ux.Show(failure, null);
            try
            {
                action();
                return true;
            }
            catch (Exception ex) when (ex is LibraryStorageException || ex is InvalidOperationException || ex is IOException)
            {
                Ux.Show(failure, $"{S.ActionFailed}: {ex.Message}");
                return false;
            }
        }

        /// <summary>Đổ thông tin phiên bản vào form (khi mở, khi vừa tạo, khi chuyển sang phiên bản mới).</summary>
        private void LoadHeader()
        {
            var library = session.Library;
            var editing = Editing;
            WorkItem.Reset(library.WorkItems.OrderBy(w => w.Code, Comparer<string>.Create(Search.CompareCodes)).Select(w => (w.Id, $"{w.Code}: {w.Name}")), "");
            Group.Reset(library.Categories.Select(c => (c.Id, c.Name)), "");
            var form = editing == null ? new NormForm { Version = "1" } : Validation.ToForm(editing);
            Code.Value = form.Code;
            Version.Value = form.Version;
            NameField.Value = form.Name;
            Unit.Value = form.Unit;
            Group.Value = form.CategoryId;
            WorkItem.Value = form.WorkItemId;
            EffectiveFrom.Value = form.EffectiveFrom;
            SourceType.Value = form.SourceType.ToString();
            Source.Value = form.Source;
            SourceVerified.Checked = form.SourceVerified;
            WasteBox.Checked = form.WasteIncluded;
            Notes.Value = form.Notes;
            ShowHeaderErrors(new FieldError[0]);
            Ux.Show(statusMessage, null);
            UpdateState();
        }

        /// <summary>Tiêu đề, nhãn trạng thái, nút đổi trạng thái và khóa ô theo trạng thái hiện tại.</summary>
        private void UpdateState()
        {
            var editing = Editing;
            Text = title.Text = editing == null ? NS.NewTitle : NS.EditTitle(editing.Code, editing.Version);
            status.Text = editing == null ? "" : NS.Status[editing.Status];
            status.Visible = editing != null;
            approve.Visible = editing != null && editing.Status != NormStatus.Approved;
            deactivate.Visible = editing?.Status == NormStatus.Approved;
            copyVersion.Visible = editing != null;
            var locked = editing != null && editing.Status != NormStatus.Draft;
            lockedNote.Visible = locked;
            Code.Box.Enabled = Version.Box.Enabled = Unit.Box.Enabled = WasteBox.Enabled = !locked;
            componentsSection.Visible = editing != null;
        }

        private void ShowHeaderErrors(IReadOnlyList<FieldError> errors)
        {
            string? For(string field) => errors.FirstOrDefault(e => e.Field == field)?.Message;
            Code.Error = For(Fields.Code);
            Version.Error = For(Fields.Version);
            NameField.Error = For(Fields.Name);
            Unit.Error = For(Fields.Unit);
            Group.SetError(For(Fields.CategoryId));
            WorkItem.SetError(For(Fields.WorkItemId));
            EffectiveFrom.Error = For(Fields.EffectiveFrom);
            Source.Error = For(Fields.Source);
            WasteIncluded.Error = For(Fields.WasteIncluded);
        }

        public void SaveHeader() => Guard(() =>
        {
            var form = new NormForm
            {
                Code = Code.Value,
                Name = NameField.Value,
                Unit = Unit.Value,
                CategoryId = Group.Value,
                WorkItemId = WorkItem.Value,
                Version = Version.Value,
                EffectiveFrom = EffectiveFrom.Value,
                SourceType = (NormSourceType)Enum.Parse(typeof(NormSourceType), SourceType.Value),
                Source = Source.Value,
                SourceVerified = SourceVerified.Checked,
                WasteIncluded = WasteBox.Checked,
                Notes = Notes.Value,
            };
            Ux.Show(statusMessage, null);
            var saved = session.Service.SaveNorm(form, normId, session.Library);
            if (!saved.Ok)
            {
                ShowHeaderErrors(saved.Errors);
                return;
            }
            ShowHeaderErrors(new FieldError[0]);
            session.Reload();
            session.Notify(NS.SavedNorm(saved.Value!.Code, saved.Value.Version));
            var isNew = normId == null;
            normId = saved.Value.Id;
            UpdateState();
            if (isNew)
            {
                RefreshComponents();
            }
        });

        public void ChangeStatus(NormStatus next)
        {
            var editing = Editing;
            if (editing == null)
            {
                return;
            }
            Ux.Show(statusMessage, null);
            string? reason = null;
            if (!Guard(() => reason = session.Service.SetNormStatus(editing.Id, next, session.Library)))
            {
                return;
            }
            if (reason != null)
            {
                Ux.Show(statusMessage, reason);
                return;
            }
            session.Reload();
            session.Notify(next == NormStatus.Approved ? NS.Approved(editing.Code, editing.Version) : NS.Deactivated(editing.Code, editing.Version));
            UpdateState();
            RefreshComponents();
        }

        public void CopyVersion()
        {
            var editing = Editing;
            if (editing == null)
            {
                return;
            }
            Norm? created = null;
            if (Guard(() => created = session.Service.CopyNormAsNewVersion(editing.Id, session.Library)))
            {
                session.Reload();
                session.Notify(NS.Copied(created!.Code, created.Version));
                normId = created.Id;
                LoadHeader();
                ResetComponentForm();
                RefreshComponents();
            }
        }

        private List<NormComponent> OwnComponents() => session.Library.NormComponents.Where(c => c.NormId == normId).ToList();

        private IEnumerable<CalcIssue> IssuesOf(ComponentResult c) => result?.Issues.Where(i => i.ComponentId == c.ComponentId) ?? Enumerable.Empty<CalcIssue>();

        /// <summary>Tính lại và vẽ lại danh sách thành phần, ô thêm thành phần và kết quả.</summary>
        private void RefreshComponents()
        {
            var editing = Editing;
            if (editing == null)
            {
                result = null;
                return;
            }
            var library = session.Library;
            var own = OwnComponents();
            result = NormCalc.Calculate(editing, own, library,
                new CalcOptions(session.Today, DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture)));
            componentsTitle.Text = NS.ComponentsTitle(own.Count);
            componentsEmpty.Visible = own.Count == 0;
            Components.Visible = own.Count > 0;
            Components.SetItems(result.Components);

            var editable = editing.Status == NormStatus.Draft;
            var resources = library.Resources.OrderBy(r => r.Code, Comparer<string>.Create(Search.CompareCodes)).ToList();
            needResources.Visible = editable && resources.Count == 0;
            componentForm.Visible = editable && resources.Count > 0;
            var keep = ResourceChoice.Value;
            ResourceChoice.Combo.Items.Clear();
            ResourceChoice.Combo.Items.Add(new Choice("", NS.CChooseResource));
            foreach (var r in resources)
            {
                ResourceChoice.Combo.Items.Add(new Choice(r.Id, $"{r.Code}: {r.Name} ({r.Unit}, {Composition.ResourceTypeText(r.Type)})"));
            }
            ResourceChoice.Value = keep;

            resultStatus.Text = $"{(result.Status == CalcStatus.Valid ? NS.Valid : result.Status == CalcStatus.ValidWithWarnings ? NS.ValidWithWarnings : NS.Invalid)}. {NS.DateNote(Dates.FormatIsoDate(session.Today))}";
            resultStatus.ForeColor = result.Status == CalcStatus.Valid ? Ux.SuccessColor : result.Status == CalcStatus.ValidWithWarnings ? Ux.WarningColor : Ux.ErrorColor;
            totals.SuspendLayout();
            totals.Controls.Clear();
            string Money(decimal? value) => value == null ? NS.Missing : Formats.Money(value, result.Currency);
            foreach (var type in S.ResourceTypeOrder)
            {
                totals.Controls.Add(Ux.Text(NS.Totals[type]));
                var amount = Ux.Text(Money(result.TotalsByType[type]));
                amount.TextAlign = ContentAlignment.MiddleRight;
                totals.Controls.Add(amount);
            }
            totals.Controls.Add(Ux.Text(NS.UnitPrice(editing.Unit), Ux.Bold));
            var unitPrice = Ux.Text(Money(result.UnitPrice), Ux.Bold);
            unitPrice.TextAlign = ContentAlignment.MiddleRight;
            totals.Controls.Add(unitPrice);
            totals.ResumeLayout();
            var general = result.Issues.Where(i => i.ComponentId == null).Select(i => i.Message).ToList();
            generalIssues.Text = $"{NS.IssuesTitle}: {string.Join(" ", general)}";
            generalIssues.ForeColor = resultStatus.ForeColor;
            generalIssues.Visible = general.Count > 0;
            ShowSelectedComponent();
        }

        /// <summary>Xuất bảng diễn giải: kiểm tra lại đầu vào ngay trước khi ghi, dữ liệu vừa đổi thì không xuất.</summary>
        private async Task ExportAsync()
        {
            exportNote.ForeColor = Ux.WarningColor;
            if (result == null || result.Status == CalcStatus.Invalid)
            {
                Ux.Show(exportNote, NS.ExportInvalid);
                return;
            }
            ExportButton.Enabled = false;
            try
            {
                var today = session.Today;
                var check = NormCalc.Recheck(result, session.Service.Load(), new CalcOptions(today, DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture)));
                if (check == null)
                {
                    session.Reload();
                    Ux.Show(exportNote, NS.ChangedMeanwhile);
                    return;
                }
                var sheet = await session.Quotes!.WriteExplanationAsync(NormExplanation.Build(check.Value.Norm, check.Value.Result, today));
                exportNote.ForeColor = Ux.SuccessColor;
                Ux.Show(exportNote, NS.Exported(sheet));
            }
            catch (Exception ex) when (ex is Excel.WorkbookException || ex is System.Runtime.InteropServices.COMException || ex is LibraryStorageException)
            {
                exportNote.ForeColor = Ux.ErrorColor;
                Ux.Show(exportNote, Excel.ExcelErrors.DescribeWrite(ex));
            }
            finally
            {
                ExportButton.Enabled = true;
            }
        }

        private NormComponent? SelectedComponent() =>
            Components.Selected == null ? null : session.Library.NormComponents.FirstOrDefault(c => c.Id == Components.Selected.ComponentId);

        /// <summary>Lỗi/cảnh báo, giá áp dụng và các nút của thành phần đang chọn.</summary>
        private void ShowSelectedComponent()
        {
            var row = Components.Selected;
            var component = SelectedComponent();
            var editing = Editing;
            selectHint.Visible = row == null && Components.Visible;
            var issues = row == null ? new List<CalcIssue>() : IssuesOf(row).ToList();
            componentIssues.Text = string.Join("\n", issues.Select(i => (i.Severity == CalcSeverity.Error ? NS.IssueError : NS.IssueWarning) + i.Message));
            componentIssues.ForeColor = issues.Any(i => i.Severity == CalcSeverity.Error) ? Ux.ErrorColor : Ux.WarningColor;
            componentIssues.Visible = issues.Count > 0;

            var resource = row == null ? null : session.Library.Resources.FirstOrDefault(r => r.Id == row.ResourceId);
            var prices = resource == null ? new List<ResourcePrice>() : session.Library.ResourcePrices.Where(p => p.ResourceId == resource.Id).ToList();
            suppressPriceChange = true;
            PriceChoice.Combo.Items.Clear();
            PriceChoice.Combo.Items.Add(new Choice("", NS.CAutoPrice));
            foreach (var p in prices)
            {
                PriceChoice.Combo.Items.Add(new Choice(p.Id, NS.PriceOption(Formats.Money(p.Price, p.Currency), p.Unit, S.PriceStatuses[p.Status], p.Source)));
            }
            PriceChoice.Value = component?.PriceId ?? "";
            suppressPriceChange = false;
            PriceChoice.Visible = component != null && prices.Count > 0;
            PriceChoice.Combo.Enabled = editing?.Status != NormStatus.Inactive;

            var editable = editing?.Status == NormStatus.Draft && component != null;
            componentActions.Visible = editable;
            if (editable && row != null)
            {
                var index = result!.Components.IndexOf(row);
                moveUp.Enabled = index > 0;
                moveDown.Enabled = index < result.Components.Count - 1;
                refreshLink.Visible = resource != null && (resource.Code != component!.ResourceCodeSnapshot || resource.Name != component.ResourceNameSnapshot
                    || resource.Unit != component.ResourceUnitSnapshot || resource.Type != component.ResourceTypeSnapshot);
            }
        }

        private void AfterComponentChange()
        {
            session.Reload();
            RefreshComponents();
        }

        private void PriceChanged()
        {
            var component = SelectedComponent();
            if (suppressPriceChange || component == null)
            {
                return;
            }
            var priceId = PriceChoice.Value == "" ? null : PriceChoice.Value;
            if (priceId == component.PriceId)
            {
                return;
            }
            if (Guard(() => session.Service.SetComponentPrice(component.Id, priceId, session.Library)))
            {
                AfterComponentChange();
            }
        }

        public void MoveComponent(int direction)
        {
            var component = SelectedComponent();
            if (component != null && Guard(() => session.Service.MoveNormComponent(component.Id, direction, session.Library)))
            {
                AfterComponentChange();
            }
        }

        private void RefreshLink()
        {
            var component = SelectedComponent();
            if (component != null && Guard(() => session.Service.RefreshComponentLink(component.Id, session.Library)))
            {
                AfterComponentChange();
            }
        }

        public void DeleteSelectedComponent()
        {
            var component = SelectedComponent();
            if (component == null || Editing?.Status != NormStatus.Draft)
            {
                return;
            }
            if (!session.Prompts.Confirm(this, NS.CDeleteTitle, NS.CDeleteBody(component.ResourceCodeSnapshot), NS.CRemove, S.Cancel))
            {
                return;
            }
            if (Guard(() => session.Service.DeleteNormComponent(component.Id, session.Library)))
            {
                if (editingComponentId == component.Id)
                {
                    ResetComponentForm();
                }
                AfterComponentChange();
            }
        }

        public void StartEditSelected()
        {
            var component = SelectedComponent();
            if (component == null || Editing?.Status != NormStatus.Draft)
            {
                return;
            }
            editingComponentId = component.Id;
            ResourceChoice.Value = component.ResourceId;
            Consumption.Value = DecimalInput.Format(component.Consumption);
            Waste.Value = DecimalMath.RateToPercent(component.WasteRate);
            ComponentNotes.Value = component.Notes;
            ShowComponentErrors(new FieldError[0]);
            ((GroupBox)componentForm).Text = NS.CUpdate;
            SaveComponentButton.Text = NS.CUpdate;
            cancelEdit.Visible = true;
            Consumption.Box.Focus();
        }

        private void ResetComponentForm()
        {
            editingComponentId = null;
            ResourceChoice.Value = "";
            Consumption.Value = "";
            Waste.Value = "";
            ComponentNotes.Value = "";
            ShowComponentErrors(new FieldError[0]);
            ((GroupBox)componentForm).Text = NS.CAdd;
            SaveComponentButton.Text = NS.CAdd;
            cancelEdit.Visible = false;
        }

        private void ShowComponentErrors(IReadOnlyList<FieldError> errors)
        {
            string? For(string field) => errors.FirstOrDefault(e => e.Field == field)?.Message;
            ResourceChoice.Error = For(Fields.ResourceId);
            Consumption.Error = For(Fields.Consumption);
            Waste.Error = For(Fields.WastePercent);
        }

        public void SaveComponent()
        {
            if (normId == null)
            {
                return;
            }
            var form = new NormComponentForm
            {
                ResourceId = ResourceChoice.Value,
                Consumption = Consumption.Value,
                WastePercent = Waste.Value,
                Notes = ComponentNotes.Value,
            };
            FormResult<NormComponent>? saved = null;
            if (!Guard(() => saved = session.Service.SaveNormComponent(normId, form, editingComponentId, session.Library)))
            {
                return;
            }
            if (!saved!.Ok)
            {
                ShowComponentErrors(saved.Errors);
                return;
            }
            ResetComponentForm();
            AfterComponentChange();
        }
    }
}
