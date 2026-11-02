using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Storage;
using ConsQuotation.Ui;

namespace ConsQuotation.LibraryUi
{
    /// <summary>Khung chung của hộp thoại sửa bản ghi: nội dung rộng cố định, dòng báo lỗi lưu, nút ở cuối.</summary>
    internal abstract class EditorDialog : Form
    {
        protected EditorDialog(LibrarySession session, string title, int width = 600)
        {
            Session = session;
            Text = title;
            Font = Ux.Font;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Body = Ux.Stack(Ux.Px(width));
            Body.Padding = new Padding(Ux.Px(10));
            Failure = Ux.Text("", color: Ux.ErrorColor);
            Failure.Visible = false;
            Controls.Add(Body);
        }

        protected LibrarySession Session { get; }
        protected TableLayoutPanel Body { get; }
        /// <summary>Lỗi khi ghi file thư viện (khác lỗi từng ô).</summary>
        protected Label Failure { get; }

        protected void ShowFailure(string? message)
        {
            Failure.Text = message == null ? "" : $"{S.SaveFailed}: {message}";
            Failure.Visible = message != null;
        }

        /// <summary>Hiện lỗi của từng ô; ô không có lỗi thì xóa lỗi cũ.</summary>
        protected static void ShowErrors(IReadOnlyList<FieldError> errors, IReadOnlyDictionary<string, FieldBox> fields)
        {
            foreach (var pair in fields)
            {
                var message = errors.FirstOrDefault(e => e.Field == pair.Key)?.Message;
                if (pair.Value is RefField reference)
                {
                    reference.SetError(message);
                }
                else
                {
                    pair.Value.Error = message;
                }
            }
        }

        /// <summary>Chạy thao tác ghi; lỗi lưu trữ hoặc vi phạm ràng buộc thì báo trong hộp thoại, không đóng.</summary>
        protected bool Guard(Action action)
        {
            ShowFailure(null);
            try
            {
                action();
                return true;
            }
            catch (Exception ex) when (ex is LibraryStorageException || ex is InvalidOperationException || ex is IOException)
            {
                ShowFailure(ex.Message);
                return false;
            }
        }

        protected static IEnumerable<(string, string)> Options(IEnumerable<Category> items) => items.Select(c => (c.Id, c.Name));
        protected static IEnumerable<(string, string)> Options(IEnumerable<Supplier> items) => items.Select(s => (s.Id, s.Name));
    }

    /// <summary>
    /// Tạo nhóm/nhà cung cấp người dùng vừa gõ trong form ("+ … mới") trước khi lưu bản ghi chính, chuyển từ
    /// newRefs.ts. Trả về thư viện đã có bản ghi mới để bước kiểm tra tham chiếu chạy đúng.
    /// </summary>
    internal static class NewRefs
    {
        internal sealed class Result
        {
            public LibrarySnapshot Library { get; set; } = new LibrarySnapshot();
            public string? CategoryId { get; set; }
            public string? SupplierId { get; set; }
            /// <summary>Ô bị lỗi (Fields.CategoryId/SupplierId) và thông báo; null = tạo được.</summary>
            public FieldError? Error { get; set; }
            public bool Created => CategoryId != null || SupplierId != null;
        }

        public static Result Create(LibraryService service, LibrarySnapshot library, string? category, string? supplier)
        {
            var current = library;
            var result = new Result();
            if (category != null)
            {
                var saved = service.SaveCategory(new CategoryForm { Name = category }, null, current);
                if (!saved.Ok)
                {
                    return new Result { Error = new FieldError(Fields.CategoryId, saved.Errors[0].Message) };
                }
                current = With(current, s => s.Categories = new List<Category>(current.Categories) { saved.Value! });
                result.CategoryId = saved.Value!.Id;
            }
            if (supplier != null)
            {
                var saved = service.SaveSupplier(new SupplierForm { Name = supplier }, null, current);
                if (!saved.Ok)
                {
                    result.Error = new FieldError(Fields.SupplierId, saved.Errors[0].Message);
                    return result;
                }
                current = With(current, s => s.Suppliers = new List<Supplier>(current.Suppliers) { saved.Value! });
                result.SupplierId = saved.Value!.Id;
            }
            result.Library = current;
            return result;
        }

        private static LibrarySnapshot With(LibrarySnapshot source, Action<LibrarySnapshot> change)
        {
            var copy = new LibrarySnapshot
            {
                Categories = source.Categories,
                Suppliers = source.Suppliers,
                WorkItems = source.WorkItems,
                Resources = source.Resources,
                ResourcePrices = source.ResourcePrices,
                Norms = source.Norms,
                NormComponents = source.NormComponents,
            };
            change(copy);
            return copy;
        }
    }

    /// <summary>Thêm/sửa công tác (WorkItemEditor của bản web), kèm danh sách định mức liên kết.</summary>
    internal sealed class WorkItemDialog : EditorDialog
    {
        private readonly WorkItem? editing;

        public WorkItemDialog(LibrarySession session, WorkItem? editing)
            : base(session, editing == null ? S.NewWorkItem : S.EditWorkItem(editing.Code))
        {
            this.editing = editing;
            var library = session.Library;
            Code = new TextField(S.WiCode, required: true);
            NameField = new TextField(S.WiName, required: true);
            Group = new RefField(S.WiGroup, Options(library.Categories), S.NoneCategory, S.NewCategory, S.NewCategoryName);
            Unit = new TextField(S.WiUnit, required: true);
            UnitPrice = new TextField(S.WiUnitPrice, hint: S.PriceHint);
            Currency = new TextField(S.WiCurrency);
            SupplierField = new RefField(S.WiSupplier, Options(library.Suppliers), S.NoneSupplier, S.NewSupplier, S.NewSupplierName);
            Source = new TextField(S.WiSource);
            From = new DateField(S.WiEffectiveFrom);
            To = new DateField(S.WiEffectiveTo);
            Description = new TextField(S.WiDescription, multiline: true);
            Notes = new TextField(S.WiNotes, multiline: true);

            var grid = Ux.Grid();
            grid.Controls.AddRange(new Control[] { Code, NameField, Group, Unit, UnitPrice, Currency, SupplierField, Source, From, To });
            Body.Controls.Add(grid);
            Body.Controls.Add(Description);
            Body.Controls.Add(Notes);
            Body.Controls.Add(Failure);
            SaveButton = Ux.Button(S.SaveWorkItem, (_, __) => Save());
            var cancel = Ux.Button(S.Cancel, (_, __) => DialogResult = DialogResult.Cancel);
            Body.Controls.Add(Ux.ButtonRow(SaveButton, cancel));
            AcceptButton = SaveButton;
            CancelButton = cancel;

            Body.Controls.Add(Ux.Text(S.LinkedNormsTitle, Ux.Bold));
            var linked = editing == null
                ? new List<Norm>()
                : library.Norms.Where(n => n.WorkItemId == editing.Id)
                    .OrderBy(n => n.Code, Comparer<string>.Create(Search.CompareCodes))
                    .ThenBy(n => n.Version, Comparer<string>.Create(Search.CompareCodes)).ToList();
            if (linked.Count == 0)
            {
                Body.Controls.Add(Ux.Text(S.NoneLinked, color: System.Drawing.SystemColors.GrayText));
            }
            foreach (var norm in linked)
            {
                Body.Controls.Add(Ux.Text(S.LinkedLine(norm.Code, norm.Version, NS.Status[norm.Status])));
            }
            Body.Controls.Add(Ux.Text(S.ManageInTab, color: System.Drawing.SystemColors.GrayText));

            var form = editing == null ? new WorkItemForm() : Validation.ToForm(editing);
            Code.Value = form.Code;
            NameField.Value = form.Name;
            Group.Value = form.CategoryId;
            Unit.Value = form.Unit;
            UnitPrice.Value = form.UnitPrice;
            Currency.Value = form.Currency;
            SupplierField.Value = form.SupplierId;
            Source.Value = form.Source;
            From.Value = form.EffectiveFrom;
            To.Value = form.EffectiveTo;
            Description.Value = form.Description;
            Notes.Value = form.Notes;
            NameField.Box.TextChanged += (_, __) => UpdateSameName();
            UpdateSameName();
        }

        public TextField Code { get; }
        public TextField NameField { get; }
        public RefField Group { get; }
        public TextField Unit { get; }
        public TextField UnitPrice { get; }
        public TextField Currency { get; }
        public RefField SupplierField { get; }
        public TextField Source { get; }
        public DateField From { get; }
        public DateField To { get; }
        public TextField Description { get; }
        public TextField Notes { get; }
        public Button SaveButton { get; }
        public WorkItem? Saved { get; private set; }

        private void UpdateSameName()
        {
            var same = Validation.SameNameRecords(NameField.Value, Session.Library.WorkItems, w => w.Id, w => w.Name, editing?.Id);
            NameField.Warning = same.Count > 0 ? S.SameName(string.Join(", ", same.Select(w => w.Code))) : null;
        }

        private WorkItemForm ReadForm() => new WorkItemForm
        {
            Code = Code.Value,
            Name = NameField.Value,
            CategoryId = Group.Value,
            Unit = Unit.Value,
            Description = Description.Value,
            UnitPrice = UnitPrice.Value,
            Currency = Currency.Value,
            SupplierId = SupplierField.Value,
            Source = Source.Value,
            EffectiveFrom = From.Value,
            EffectiveTo = To.Value,
            Notes = Notes.Value,
        };

        private Dictionary<string, FieldBox> FieldMap() => new Dictionary<string, FieldBox>
        {
            [Fields.Code] = Code,
            [Fields.Name] = NameField,
            [Fields.CategoryId] = Group,
            [Fields.Unit] = Unit,
            [Fields.UnitPrice] = UnitPrice,
            [Fields.Currency] = Currency,
            [Fields.SupplierId] = SupplierField,
            [Fields.EffectiveFrom] = From,
            [Fields.EffectiveTo] = To,
        };

        public void Save() => Guard(() =>
        {
            var refs = NewRefs.Create(Session.Service, Session.Library,
                Group.Creating ? Group.NewName : null, SupplierField.Creating ? SupplierField.NewName : null);
            if (refs.Created)
            {
                // Giữ lựa chọn vừa tạo nếu bước lưu công tác báo lỗi (không mất dữ liệu đang nhập).
                Session.Reload();
                Group.Reset(Options(Session.Library.Categories), refs.CategoryId ?? Group.Value);
                SupplierField.Reset(Options(Session.Library.Suppliers), refs.SupplierId ?? SupplierField.Value);
            }
            if (refs.Error != null)
            {
                ShowErrors(new[] { refs.Error }, FieldMap());
                return;
            }
            var result = Session.Service.SaveWorkItem(ReadForm(), editing?.Id, refs.Created ? Session.Library : refs.Library);
            if (!result.Ok)
            {
                ShowErrors(result.Errors, FieldMap());
                return;
            }
            Saved = result.Value;
            Session.Reload();
            Session.Notify(S.Saved(Saved!.Code));
            DialogResult = DialogResult.OK;
        });
    }

    /// <summary>Thêm/sửa tài nguyên và các giá nguồn của nó (ResourceEditor của bản web).</summary>
    internal sealed class ResourceDialog : EditorDialog
    {
        private Resource? editing;
        private readonly Label pricesSaveFirst;
        private readonly Label pricesEmpty;
        private readonly Label noAutoPick;
        private readonly Control pricesPanel;

        public ResourceDialog(LibrarySession session, Resource? editing)
            : base(session, editing == null ? S.NewResource : S.EditResource(editing.Code), 640)
        {
            this.editing = editing;
            var library = session.Library;
            Code = new TextField(S.ResCode, required: true);
            NameField = new TextField(S.ResName, required: true);
            Kind = new ChoiceField(S.ResType, S.ResourceTypeOrder.Select(t => new Choice(t.ToString(), S.ResourceTypes[t])));
            Group = new RefField(S.ResCategory, Options(library.Categories), S.NoneCategory, S.NewCategory, S.NewCategoryName);
            Unit = new TextField(S.ResUnit, required: true);
            Notes = new TextField(S.ResNotes, multiline: true);
            var grid = Ux.Grid();
            grid.Controls.AddRange(new Control[] { Code, NameField, Kind, Group, Unit });
            Body.Controls.Add(grid);
            Body.Controls.Add(Notes);
            Body.Controls.Add(Failure);
            SaveButton = Ux.Button(S.SaveResource, (_, __) => Save());
            var close = Ux.Button(S.Close, (_, __) => DialogResult = this.editing == null ? DialogResult.Cancel : DialogResult.OK);
            Body.Controls.Add(Ux.ButtonRow(SaveButton, close));
            AcceptButton = SaveButton;
            CancelButton = close;

            Body.Controls.Add(Ux.Text(S.PricesTitle, Ux.Bold));
            pricesSaveFirst = Ux.Text(S.PricesSaveFirst, color: System.Drawing.SystemColors.GrayText);
            Body.Controls.Add(pricesSaveFirst);
            noAutoPick = Ux.Notice(S.NoAutoPick, Ux.WarningColor);
            pricesEmpty = Ux.Text(S.PricesEmpty, color: System.Drawing.SystemColors.GrayText);
            Prices = new RecordList<ResourcePrice>(p => p.Id,
                new Column<ResourcePrice>(S.PrPrice, 150, p => $"{Formats.Money(p.Price, p.Currency)} / {p.Unit}", HorizontalAlignment.Right),
                new Column<ResourcePrice>(S.PrStatus, 80, p => S.PriceStatuses[p.Status]),
                new Column<ResourcePrice>(S.ColEffective, 160, p => Formats.Period(p.EffectiveFrom, p.EffectiveTo)),
                new Column<ResourcePrice>(S.ColValidity, 100, p => S.Validities[Dates.ValidityOn(p.EffectiveFrom, p.EffectiveTo, Session.Today)]),
                new Column<ResourcePrice>(S.PrSupplier, 130, p => Session.Library.Suppliers.FirstOrDefault(x => x.Id == p.SupplierId)?.Name ?? ""),
                new Column<ResourcePrice>(S.PrSource, 120, p => p.Source))
            { Height = Ux.Px(150), Dock = DockStyle.Fill };
            var addPrice = Ux.Button(S.AddPrice, (_, __) => EditPrice(null));
            var editPrice = Ux.Button(S.Edit, (_, __) => EditPrice(Prices.Selected));
            var deletePrice = Ux.Button(S.Delete, (_, __) => DeletePrice());
            Prices.ItemActivate += (_, __) => EditPrice(Prices.Selected);
            Prices.DeleteRequested += DeletePrice;
            Prices.SelectedIndexChanged += (_, __) => editPrice.Enabled = deletePrice.Enabled = Prices.Selected != null;
            var panel = Ux.Stack();
            panel.Dock = DockStyle.Fill;
            panel.Controls.Add(noAutoPick);
            panel.Controls.Add(pricesEmpty);
            panel.Controls.Add(Prices);
            panel.Controls.Add(Ux.ButtonRow(addPrice, editPrice, deletePrice));
            pricesPanel = panel;
            Body.Controls.Add(panel);

            var form = editing == null ? new ResourceForm() : Validation.ToForm(editing);
            Code.Value = form.Code;
            NameField.Value = form.Name;
            Kind.Value = form.Type.ToString();
            Group.Value = form.CategoryId;
            Unit.Value = form.Unit;
            Notes.Value = form.Notes;
            NameField.Box.TextChanged += (_, __) => UpdateSameName();
            UpdateSameName();
            RefreshPrices();
        }

        public TextField Code { get; }
        public TextField NameField { get; }
        public ChoiceField Kind { get; }
        public RefField Group { get; }
        public TextField Unit { get; }
        public TextField Notes { get; }
        public Button SaveButton { get; }
        public RecordList<ResourcePrice> Prices { get; }
        public Resource? Editing => editing;

        /// <summary>Hộp thoại giá mở từ nút Thêm giá/Sửa; test thay để không phải bấm.</summary>
        public Func<ResourceDialog, Resource, ResourcePrice?, bool> OpenPriceDialog { get; set; } = (owner, resource, price) =>
        {
            using (var dialog = new PriceDialog(owner.Session, resource, price))
            {
                return dialog.ShowDialog(owner) == DialogResult.OK;
            }
        };

        private void UpdateSameName()
        {
            var same = Validation.SameNameRecords(NameField.Value, Session.Library.Resources, r => r.Id, r => r.Name, editing?.Id);
            NameField.Warning = same.Count > 0 ? S.SameName(string.Join(", ", same.Select(r => r.Code))) : null;
        }

        private void RefreshPrices()
        {
            pricesSaveFirst.Visible = editing == null;
            pricesPanel.Visible = editing != null;
            if (editing == null)
            {
                return;
            }
            var prices = Session.Library.ResourcePrices.Where(p => p.ResourceId == editing.Id)
                .OrderByDescending(p => p.EffectiveFrom ?? "", StringComparer.Ordinal).ToList();
            noAutoPick.Visible = prices.Count(p => p.Status == PriceStatus.Active) > 1;
            pricesEmpty.Visible = prices.Count == 0;
            Prices.Visible = prices.Count > 0;
            Prices.SetItems(prices);
        }

        private Dictionary<string, FieldBox> FieldMap() => new Dictionary<string, FieldBox>
        {
            [Fields.Code] = Code,
            [Fields.Name] = NameField,
            [Fields.CategoryId] = Group,
            [Fields.Unit] = Unit,
        };

        public void Save() => Guard(() =>
        {
            var refs = NewRefs.Create(Session.Service, Session.Library, Group.Creating ? Group.NewName : null, null);
            if (refs.Created)
            {
                Session.Reload();
                Group.Reset(Options(Session.Library.Categories), refs.CategoryId!);
            }
            if (refs.Error != null)
            {
                ShowErrors(new[] { refs.Error }, FieldMap());
                return;
            }
            var form = new ResourceForm
            {
                Code = Code.Value,
                Name = NameField.Value,
                Type = (ResourceType)Enum.Parse(typeof(ResourceType), Kind.Value),
                CategoryId = Group.Value,
                Unit = Unit.Value,
                Notes = Notes.Value,
            };
            var result = Session.Service.SaveResource(form, editing?.Id, refs.Created ? Session.Library : refs.Library);
            if (!result.Ok)
            {
                ShowErrors(result.Errors, FieldMap());
                return;
            }
            var isNew = editing == null;
            editing = result.Value!;
            Session.Reload();
            Session.Notify(S.Saved(editing.Code));
            if (!isNew)
            {
                DialogResult = DialogResult.OK;
                return;
            }
            // Tài nguyên mới: ở lại để thêm giá ngay.
            ShowErrors(new FieldError[0], FieldMap());
            Text = S.EditResource(editing.Code);
            RefreshPrices();
        });

        private void EditPrice(ResourcePrice? price)
        {
            if (editing == null || OpenPriceDialog(this, editing, price) == false)
            {
                return;
            }
            RefreshPrices();
        }

        private void DeletePrice()
        {
            var price = Prices.Selected;
            if (price == null || !Session.Prompts.Confirm(this, S.DeletePriceTitle, S.DeletePriceBody, S.Delete, S.Cancel))
            {
                return;
            }
            if (Guard(() => Session.Service.DeletePrice(price.Id)))
            {
                Session.Reload();
                RefreshPrices();
            }
        }
    }

    /// <summary>Thêm/sửa một giá nguồn của tài nguyên (PricesSection của bản web).</summary>
    internal sealed class PriceDialog : EditorDialog
    {
        private readonly Resource resource;
        private readonly ResourcePrice? editing;

        public PriceDialog(LibrarySession session, Resource resource, ResourcePrice? editing)
            : base(session, $"{(editing == null ? S.AddPrice : S.EditPrice)}: {resource.Code}", 520)
        {
            this.resource = resource;
            this.editing = editing;
            Price = new TextField(S.PrPrice, required: true);
            Unit = new TextField(S.PrUnit, required: true);
            Currency = new TextField(S.PrCurrency, required: true);
            SupplierField = new RefField(S.PrSupplier, Options(session.Library.Suppliers), S.NoneSupplier, S.NewSupplier, S.NewSupplierName);
            Source = new TextField(S.PrSource);
            From = new DateField(S.PrEffectiveFrom);
            To = new DateField(S.PrEffectiveTo);
            Status = new ChoiceField(S.PrStatus, new[]
            {
                new Choice(PriceStatus.Active.ToString(), S.PriceStatuses[PriceStatus.Active]),
                new Choice(PriceStatus.Inactive.ToString(), S.PriceStatuses[PriceStatus.Inactive]),
            });
            Notes = new TextField(S.PrNotes);
            var grid = Ux.Grid();
            grid.Controls.AddRange(new Control[] { Price, Unit, Currency, SupplierField, Source, From, To, Status });
            Body.Controls.Add(grid);
            Body.Controls.Add(Notes);
            Body.Controls.Add(Failure);
            SaveButton = Ux.Button(editing == null ? S.AddPrice : S.SavePrice, (_, __) => Save());
            var cancel = Ux.Button(S.Cancel, (_, __) => DialogResult = DialogResult.Cancel);
            Body.Controls.Add(Ux.ButtonRow(SaveButton, cancel));
            AcceptButton = SaveButton;
            CancelButton = cancel;

            var form = editing == null ? new PriceForm { Unit = resource.Unit } : Validation.ToForm(editing);
            Price.Value = form.Price;
            Unit.Value = form.Unit;
            Currency.Value = form.Currency;
            SupplierField.Value = form.SupplierId;
            Source.Value = form.Source;
            From.Value = form.EffectiveFrom;
            To.Value = form.EffectiveTo;
            Status.Value = form.Status.ToString();
            Notes.Value = form.Notes;
        }

        public TextField Price { get; }
        public TextField Unit { get; }
        public TextField Currency { get; }
        public RefField SupplierField { get; }
        public TextField Source { get; }
        public DateField From { get; }
        public DateField To { get; }
        public ChoiceField Status { get; }
        public TextField Notes { get; }
        public Button SaveButton { get; }

        private Dictionary<string, FieldBox> FieldMap() => new Dictionary<string, FieldBox>
        {
            [Fields.Price] = Price,
            [Fields.Unit] = Unit,
            [Fields.Currency] = Currency,
            [Fields.SupplierId] = SupplierField,
            [Fields.EffectiveFrom] = From,
            [Fields.EffectiveTo] = To,
        };

        public void Save() => Guard(() =>
        {
            var refs = NewRefs.Create(Session.Service, Session.Library, null, SupplierField.Creating ? SupplierField.NewName : null);
            if (refs.Created)
            {
                Session.Reload();
                SupplierField.Reset(Options(Session.Library.Suppliers), refs.SupplierId!);
            }
            if (refs.Error != null)
            {
                ShowErrors(new[] { refs.Error }, FieldMap());
                return;
            }
            var form = new PriceForm
            {
                Price = Price.Value,
                Unit = Unit.Value,
                Currency = Currency.Value,
                EffectiveFrom = From.Value,
                EffectiveTo = To.Value,
                SupplierId = SupplierField.Value,
                Source = Source.Value,
                Status = (PriceStatus)Enum.Parse(typeof(PriceStatus), Status.Value),
                Notes = Notes.Value,
            };
            var result = Session.Service.SavePrice(resource.Id, form, editing?.Id, refs.Created ? Session.Library : refs.Library);
            if (!result.Ok)
            {
                ShowErrors(result.Errors, FieldMap());
                return;
            }
            Session.Reload();
            DialogResult = DialogResult.OK;
        });
    }

    /// <summary>Thêm/sửa nhóm (CategoriesSection của bản web).</summary>
    internal sealed class CategoryDialog : EditorDialog
    {
        private readonly Category? editing;

        public CategoryDialog(LibrarySession session, Category? editing)
            : base(session, editing == null ? S.NewCategoryTitle : S.EditCategoryTitle(editing.Name), 420)
        {
            this.editing = editing;
            NameField = new TextField(S.CategoryName, required: true) { Value = editing?.Name ?? "" };
            Notes = new TextField(S.CategoryNotes) { Value = editing?.Notes ?? "" };
            Body.Controls.Add(NameField);
            Body.Controls.Add(Notes);
            Body.Controls.Add(Failure);
            SaveButton = Ux.Button(S.Save, (_, __) => Save());
            var cancel = Ux.Button(S.Cancel, (_, __) => DialogResult = DialogResult.Cancel);
            Body.Controls.Add(Ux.ButtonRow(SaveButton, cancel));
            AcceptButton = SaveButton;
            CancelButton = cancel;
        }

        public TextField NameField { get; }
        public TextField Notes { get; }
        public Button SaveButton { get; }

        public void Save() => Guard(() =>
        {
            var result = Session.Service.SaveCategory(new CategoryForm { Name = NameField.Value, Notes = Notes.Value }, editing?.Id, Session.Library);
            if (!result.Ok)
            {
                ShowErrors(result.Errors, new Dictionary<string, FieldBox> { [Fields.Name] = NameField, [Fields.Notes] = Notes });
                return;
            }
            Session.Reload();
            Session.Notify(S.Saved(result.Value!.Name));
            DialogResult = DialogResult.OK;
        });
    }

    /// <summary>Thêm/sửa nhà cung cấp (SuppliersSection của bản web).</summary>
    internal sealed class SupplierDialog : EditorDialog
    {
        private readonly Supplier? editing;

        public SupplierDialog(LibrarySession session, Supplier? editing)
            : base(session, editing == null ? S.NewSupplierTitle : S.EditSupplierTitle(editing.Name), 460)
        {
            this.editing = editing;
            NameField = new TextField(S.SupplierName, required: true) { Value = editing?.Name ?? "" };
            Contact = new TextField(S.SupplierContact, multiline: true) { Value = editing?.ContactInfo ?? "" };
            Notes = new TextField(S.SupplierNotes) { Value = editing?.Notes ?? "" };
            Body.Controls.Add(NameField);
            Body.Controls.Add(Contact);
            Body.Controls.Add(Notes);
            Body.Controls.Add(Failure);
            SaveButton = Ux.Button(S.Save, (_, __) => Save());
            var cancel = Ux.Button(S.Cancel, (_, __) => DialogResult = DialogResult.Cancel);
            Body.Controls.Add(Ux.ButtonRow(SaveButton, cancel));
            AcceptButton = SaveButton;
            CancelButton = cancel;
        }

        public TextField NameField { get; }
        public TextField Contact { get; }
        public TextField Notes { get; }
        public Button SaveButton { get; }

        public void Save() => Guard(() =>
        {
            var form = new SupplierForm { Name = NameField.Value, ContactInfo = Contact.Value, Notes = Notes.Value };
            var result = Session.Service.SaveSupplier(form, editing?.Id, Session.Library);
            if (!result.Ok)
            {
                ShowErrors(result.Errors, new Dictionary<string, FieldBox>
                {
                    [Fields.Name] = NameField,
                    [Fields.ContactInfo] = Contact,
                    [Fields.Notes] = Notes,
                });
                return;
            }
            Session.Reload();
            Session.Notify(S.Saved(result.Value!.Name));
            DialogResult = DialogResult.OK;
        });
    }

    /// <summary>Đổi tên thư viện (tên ghi vào file sao lưu và workbook xuất).</summary>
    internal sealed class RenameDialog : EditorDialog
    {
        public RenameDialog(LibrarySession session) : base(session, S.Rename, 420)
        {
            NameField = new TextField(S.NameLabel) { Value = session.LibraryName };
            Body.Controls.Add(NameField);
            Body.Controls.Add(Failure);
            SaveButton = Ux.Button(S.Save, (_, __) => Save());
            var cancel = Ux.Button(S.Cancel, (_, __) => DialogResult = DialogResult.Cancel);
            Body.Controls.Add(Ux.ButtonRow(SaveButton, cancel));
            AcceptButton = SaveButton;
            CancelButton = cancel;
        }

        public TextField NameField { get; }
        public Button SaveButton { get; }

        public void Save() => Guard(() =>
        {
            Session.Service.SetLibraryName(NameField.Value);
            Session.Reload();
            DialogResult = DialogResult.OK;
        });
    }
}
