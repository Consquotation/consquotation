using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Storage;
using ConsQuotation.Ui;

namespace ConsQuotation.LibraryUi
{
    /// <summary>Mở hộp thoại sửa bản ghi; dùng chung cho các thẻ và cho thẻ Kiểm tra (nháy đúp để tới bản ghi).</summary>
    internal static class Editors
    {
        public static void WorkItem(IWin32Window owner, LibrarySession session, WorkItem? item)
        {
            using (var dialog = new WorkItemDialog(session, item))
            {
                dialog.ShowDialog(owner);
            }
        }

        public static void Resource(IWin32Window owner, LibrarySession session, Resource? resource)
        {
            using (var dialog = new ResourceDialog(session, resource))
            {
                dialog.ShowDialog(owner);
            }
        }

        public static void Norm(IWin32Window owner, LibrarySession session, string? normId)
        {
            using (var dialog = new NormDialog(session, normId))
            {
                dialog.ShowDialog(owner);
            }
        }

        public static void Open(IWin32Window owner, LibrarySession session, LibraryIssue issue)
        {
            var library = session.Library;
            switch (issue.Entity)
            {
                case IssueEntity.WorkItem:
                    var item = library.WorkItems.FirstOrDefault(w => w.Id == issue.EntityId);
                    if (item != null)
                    {
                        WorkItem(owner, session, item);
                    }
                    break;
                case IssueEntity.Resource:
                    var resource = library.Resources.FirstOrDefault(r => r.Id == issue.EntityId);
                    if (resource != null)
                    {
                        Resource(owner, session, resource);
                    }
                    break;
                case IssueEntity.Price:
                    var price = library.ResourcePrices.FirstOrDefault(p => p.Id == issue.EntityId);
                    var owning = price == null ? null : library.Resources.FirstOrDefault(r => r.Id == price.ResourceId);
                    if (owning != null)
                    {
                        Resource(owner, session, owning);
                    }
                    break;
                case IssueEntity.Norm:
                    if (library.Norms.Any(n => n.Id == issue.EntityId))
                    {
                        Norm(owner, session, issue.EntityId);
                    }
                    break;
            }
        }
    }

    /// <summary>Thẻ của cửa sổ Thư viện: vẽ lại mỗi khi thư viện thay đổi.</summary>
    internal abstract class LibraryPage : UserControl
    {
        protected LibraryPage(LibrarySession session)
        {
            Session = session;
            Font = Ux.Font;
            Dock = DockStyle.Fill;
            Padding = new Padding(Ux.Px(6));
            Root = Ux.FillStack();
            Controls.Add(Root);
            session.Changed += OnLibraryChanged;
        }

        protected LibrarySession Session { get; }
        protected TableLayoutPanel Root { get; }

        private void OnLibraryChanged()
        {
            if (!IsDisposed)
            {
                RefreshView();
            }
        }

        public abstract void RefreshView();

        /// <summary>Chạy thao tác ghi; lỗi lưu trữ hoặc vi phạm ràng buộc thì báo bằng hộp thông báo.</summary>
        protected bool Guard(Action action)
        {
            try
            {
                action();
                return true;
            }
            catch (Exception ex) when (ex is LibraryStorageException || ex is InvalidOperationException || ex is IOException)
            {
                Session.Prompts.ShowError(this, $"{S.ActionFailed}: {ex.Message}");
                return false;
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                Session.Changed -= OnLibraryChanged;
            }
            base.Dispose(disposing);
        }

        protected static string Join(params string?[] parts) => string.Join(" · ", parts.Where(p => !string.IsNullOrEmpty(p)));

        protected static Comparer<string> Codes { get; } = Comparer<string>.Create(Search.CompareCodes);
        protected static Comparer<string> Names { get; } = Comparer<string>.Create(Search.CompareText);
    }

    /// <summary>Ô tìm kiếm và bộ lọc nhóm/loại/nhà cung cấp/sắp xếp (ListFilters của bản web). Gõ tìm có trễ 200 ms.</summary>
    internal sealed class FilterBar : TableLayoutPanel
    {
        private readonly Timer debounce = new Timer { Interval = 200 };
        private readonly FieldBox groupBox;
        private readonly FieldBox supplierBox;

        public FilterBar(bool showType, string searchLabel = S.Search)
        {
            ColumnCount = 1;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Dock = DockStyle.Fill;
            Margin = new Padding(0);
            ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Ux.KeepOrder(this);
            Query = new TextBox();
            var search = new FieldBox(searchLabel, Query);
            Controls.Add(search);
            // Bốn ô trên một hàng vừa cửa sổ nhỏ nhất (760 px).
            Group = Ux.Combo(160);
            Kind = Ux.Combo(130);
            Supplier = Ux.Combo(160);
            SortBy = Ux.Combo(130);
            groupBox = Small(S.Group, Group);
            supplierBox = Small(S.Supplier, Supplier);
            var row = Ux.Row(false, groupBox);
            if (showType)
            {
                Kind.Items.Add(new Choice("", S.AllTypes));
                foreach (var t in S.ResourceTypeOrder)
                {
                    Kind.Items.Add(new Choice(t.ToString(), S.ResourceTypes[t]));
                }
                Kind.SelectedIndex = 0;
                row.Controls.Add(Small(S.Type, Kind));
            }
            row.Controls.Add(supplierBox);
            SortBy.Items.AddRange(new object[]
            {
                new Choice(nameof(SortKey.Code), S.SortCode),
                new Choice(nameof(SortKey.Name), S.SortName),
                new Choice(nameof(SortKey.Price), S.SortPrice),
            });
            SortBy.SelectedIndex = 0;
            row.Controls.Add(Small(S.Sort, SortBy));
            Controls.Add(row);

            debounce.Tick += (_, __) =>
            {
                debounce.Stop();
                Changed?.Invoke();
            };
            Query.TextChanged += (_, __) =>
            {
                debounce.Stop();
                debounce.Start();
            };
            foreach (var combo in new[] { Group, Kind, Supplier, SortBy })
            {
                combo.SelectedIndexChanged += (_, __) => Changed?.Invoke();
            }
        }

        private static FieldBox Small(string label, Control editor) => new FieldBox(label, editor) { Dock = DockStyle.None };

        public TextBox Query { get; }
        public ComboBox Group { get; }
        public ComboBox Kind { get; }
        public ComboBox Supplier { get; }
        public ComboBox SortBy { get; }

        public event Action? Changed;

        /// <summary>Nạp danh sách nhóm/nhà cung cấp, giữ lựa chọn cũ. Ô nào không có dữ liệu để lọc thì ẩn.</summary>
        public void SetOptions(IEnumerable<Category> categories, IEnumerable<Supplier> suppliers)
        {
            Fill(Group, groupBox, S.AllGroups, S.NoGroup, categories.Select(c => (c.Id, c.Name)));
            Fill(Supplier, supplierBox, S.AllSuppliers, S.NoSupplier, suppliers.Select(s => (s.Id, s.Name)));
        }

        private void Fill(ComboBox combo, Control box, string all, string none, IEnumerable<(string Id, string Name)> options)
        {
            var keep = Ux.SelectedId(combo);
            var list = options.OrderBy(o => o.Name, Comparer<string>.Create(Search.CompareText)).ToList();
            combo.BeginUpdate();
            combo.Items.Clear();
            combo.Items.Add(new Choice("", all));
            combo.Items.Add(new Choice(ListFilter.None, none));
            foreach (var (id, name) in list)
            {
                combo.Items.Add(new Choice(id, name));
            }
            combo.EndUpdate();
            box.Visible = list.Count > 0;
            Ux.SelectId(combo, list.Count > 0 ? keep : "");
        }

        public ResourceFilter Filter() => new ResourceFilter
        {
            Query = Query.Text,
            CategoryId = Ux.SelectedId(Group),
            SupplierId = Ux.SelectedId(Supplier),
            Sort = (SortKey)Enum.Parse(typeof(SortKey), Ux.SelectedId(SortBy)),
            Type = Ux.SelectedId(Kind) is var t && t != "" ? (ResourceType?)Enum.Parse(typeof(ResourceType), t) : null,
        };

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                debounce.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    /// <summary>Thẻ Công tác (WorkItemsPanel của bản web).</summary>
    internal sealed class WorkItemsPage : LibraryPage
    {
        private readonly Label empty;
        private readonly Label count;
        private readonly Button edit;
        private readonly Button copy;
        private readonly Button delete;
        private Dictionary<string, int> normCounts = new Dictionary<string, int>();
        private NameLookup lookup = NameLookup.Empty;

        public WorkItemsPage(LibrarySession session) : base(session)
        {
            var add = Ux.Button(S.AddWorkItem, (_, __) => Editors.WorkItem(this, Session, null));
            edit = Ux.Button(S.Edit, (_, __) => EditSelected());
            copy = Ux.Button(S.Copy, (_, __) => CopySelected());
            delete = Ux.Button(S.Delete, (_, __) => DeleteSelected());
            Root.Controls.Add(Ux.ButtonRow(add, edit, copy, delete));
            empty = Ux.Notice(S.WorkItemsEmpty, SystemColors.ControlText);
            Root.Controls.Add(empty);
            Filters = new FilterBar(showType: false);
            Filters.Changed += Apply;
            Root.Controls.Add(Filters);
            count = Ux.Text("");
            Root.Controls.Add(count);
            List = new RecordList<WorkItem>(w => w.Id,
                new Column<WorkItem>(S.ColCode, 90, w => w.Code),
                new Column<WorkItem>(S.WiName, 260, w => w.Name),
                new Column<WorkItem>(S.ColUnit, 60, w => w.Unit),
                new Column<WorkItem>(S.ColPrice, 130, w => Formats.Money(w.UnitPrice, w.Currency), HorizontalAlignment.Right),
                new Column<WorkItem>(S.Group, 120, w => w.CategoryId == null ? S.NoGroup : lookup.CategoryName(w.CategoryId)),
                new Column<WorkItem>(S.Supplier, 130, w => lookup.SupplierName(w.SupplierId)),
                new Column<WorkItem>(S.ColSource, 120, w => w.Source),
                new Column<WorkItem>(S.ColEffective, 150, w => Formats.Period(w.EffectiveFrom, w.EffectiveTo)),
                new Column<WorkItem>(S.ColValidity, 100, w => w.UnitPrice == null ? "" : S.Validities[Dates.ValidityOn(w.EffectiveFrom, w.EffectiveTo, Session.Today)]),
                new Column<WorkItem>(S.ColNorms, 120, w => normCounts.TryGetValue(w.Id, out var n) && n > 0 ? S.LinkedCount(n) : ""));
            List.ItemActivate += (_, __) => EditSelected();
            List.DeleteRequested += DeleteSelected;
            List.SelectedIndexChanged += (_, __) => edit.Enabled = copy.Enabled = delete.Enabled = List.Selected != null;
            Ux.AddFill(Root, List);
            RefreshView();
        }

        public FilterBar Filters { get; }
        public RecordList<WorkItem> List { get; }

        public override void RefreshView()
        {
            var library = Session.Library;
            lookup = NameLookup.Of(library);
            normCounts = library.Norms.Where(n => n.WorkItemId != null).GroupBy(n => n.WorkItemId!).ToDictionary(g => g.Key, g => g.Count());
            var hasItems = library.WorkItems.Count > 0;
            empty.Visible = !hasItems;
            Filters.Visible = count.Visible = hasItems;
            Filters.SetOptions(library.Categories, library.Suppliers);
            Apply();
        }

        public void Apply()
        {
            var results = Search.SearchWorkItems(Session.Library.WorkItems, Filters.Filter(), lookup);
            count.Text = results.Count == 0 && Session.Library.WorkItems.Count > 0
                ? $"{S.Count(0, Session.Library.WorkItems.Count)} · {S.NoResults}"
                : S.Count(results.Count, Session.Library.WorkItems.Count);
            List.SetItems(results);
        }

        private void EditSelected()
        {
            if (List.Selected != null)
            {
                Editors.WorkItem(this, Session, List.Selected);
            }
        }

        public void CopySelected()
        {
            var item = List.Selected;
            if (item == null)
            {
                return;
            }
            WorkItem? created = null;
            if (Guard(() => created = Session.Service.CopyWorkItem(item.Id, Session.Library)))
            {
                Session.Reload();
                Session.Notify(S.Copied(created!.Code));
                List.Select(created.Id);
            }
        }

        public void DeleteSelected()
        {
            var item = List.Selected;
            if (item == null)
            {
                return;
            }
            var norms = normCounts.TryGetValue(item.Id, out var n) ? n : 0;
            if (!Session.Prompts.Confirm(this, S.DeleteWorkItemTitle, S.DeleteWorkItemBody(item.Code, item.Name, norms), S.Delete, S.Cancel))
            {
                return;
            }
            if (Guard(() => Session.Service.DeleteWorkItem(item.Id)))
            {
                Session.Reload();
                Session.Notify(S.Deleted(item.Code));
            }
        }
    }

    /// <summary>Thẻ Tài nguyên (ResourcesPanel của bản web).</summary>
    internal sealed class ResourcesPage : LibraryPage
    {
        private readonly Label empty;
        private readonly Label count;
        private readonly Button edit;
        private readonly Button delete;
        private Dictionary<string, int> priceCounts = new Dictionary<string, int>();
        private NameLookup lookup = NameLookup.Empty;

        public ResourcesPage(LibrarySession session) : base(session)
        {
            var add = Ux.Button(S.AddResource, (_, __) => Editors.Resource(this, Session, null));
            edit = Ux.Button(S.Edit, (_, __) => EditSelected());
            delete = Ux.Button(S.Delete, (_, __) => DeleteSelected());
            Root.Controls.Add(Ux.ButtonRow(add, edit, delete));
            empty = Ux.Notice(S.ResourcesEmpty, SystemColors.ControlText);
            Root.Controls.Add(empty);
            Filters = new FilterBar(showType: true);
            Filters.Changed += Apply;
            Root.Controls.Add(Filters);
            count = Ux.Text("");
            Root.Controls.Add(count);
            List = new RecordList<Resource>(r => r.Id,
                new Column<Resource>(S.ColCode, 90, r => r.Code),
                new Column<Resource>(S.ResName, 260, r => r.Name),
                new Column<Resource>(S.ResType, 100, r => S.ResourceTypes[r.Type]),
                new Column<Resource>(S.Group, 120, r => r.CategoryId == null ? S.NoGroup : lookup.CategoryName(r.CategoryId)),
                new Column<Resource>(S.ColUnit, 60, r => r.Unit),
                new Column<Resource>(S.ColCurrentPrice, 260, PriceText),
                new Column<Resource>(S.PricesTitle, 80, r => S.PriceCount(priceCounts.TryGetValue(r.Id, out var n) ? n : 0)));
            List.ItemActivate += (_, __) => EditSelected();
            List.DeleteRequested += DeleteSelected;
            List.SelectedIndexChanged += (_, __) => edit.Enabled = delete.Enabled = List.Selected != null;
            Ux.AddFill(Root, List);
            RefreshView();
        }

        public FilterBar Filters { get; }
        public RecordList<Resource> List { get; }

        private string PriceText(Resource r)
        {
            var current = Search.CurrentPrice(r.Id, Session.Library.ResourcePrices, Session.Today);
            if (current.Price != null)
            {
                return S.CurrentPrice($"{Formats.Money(current.Price.Price, current.Price.Currency)} / {current.Price.Unit}");
            }
            if (current.ActiveCount > 1)
            {
                return S.ManyActive(current.ActiveCount);
            }
            return (priceCounts.TryGetValue(r.Id, out var n) ? n : 0) == 0 ? S.PriceCount(0) : S.NoActive;
        }

        public override void RefreshView()
        {
            var library = Session.Library;
            lookup = NameLookup.Of(library);
            priceCounts = library.ResourcePrices.GroupBy(p => p.ResourceId).ToDictionary(g => g.Key, g => g.Count());
            var hasItems = library.Resources.Count > 0;
            empty.Visible = !hasItems;
            Filters.Visible = count.Visible = hasItems;
            Filters.SetOptions(library.Categories, library.Suppliers);
            Apply();
        }

        public void Apply()
        {
            var library = Session.Library;
            var results = Search.SearchResources(library.Resources, library.ResourcePrices, Filters.Filter(), lookup, Session.Today);
            count.Text = results.Count == 0 && library.Resources.Count > 0
                ? $"{S.Count(0, library.Resources.Count)} · {S.NoResults}"
                : S.Count(results.Count, library.Resources.Count);
            List.SetItems(results);
        }

        private void EditSelected()
        {
            if (List.Selected != null)
            {
                Editors.Resource(this, Session, List.Selected);
            }
        }

        public void DeleteSelected()
        {
            var resource = List.Selected;
            if (resource == null)
            {
                return;
            }
            // Đang được định mức dùng → báo ngay, không hỏi "Xóa?" rồi mới chặn.
            var inUse = Session.Library.NormComponents.Count(c => c.ResourceId == resource.Id);
            if (inUse > 0)
            {
                Session.Prompts.ShowError(this, S.ResourceInUse(inUse));
                return;
            }
            var prices = priceCounts.TryGetValue(resource.Id, out var n) ? n : 0;
            if (!Session.Prompts.Confirm(this, S.DeleteResourceTitle, S.DeleteResourceBody(resource.Code, resource.Name, prices), S.Delete, S.Cancel))
            {
                return;
            }
            DeleteResourceResult? result = null;
            if (!Guard(() => result = Session.Service.DeleteResource(resource.Id, Session.Library)))
            {
                return;
            }
            if (!result!.Ok)
            {
                Session.Prompts.ShowError(this, S.ResourceInUse(result.InUseByNorms));
                return;
            }
            Session.Reload();
            Session.Notify(S.Deleted(resource.Code));
        }
    }

    /// <summary>Thẻ Định mức (NormsPanel của bản web).</summary>
    internal sealed class NormsPage : LibraryPage
    {
        private readonly Label empty;
        private readonly Label count;
        private readonly Control filters;
        private readonly FieldBox groupBox;
        private readonly Button open;
        private readonly Button copy;
        private readonly Button delete;
        private readonly Timer debounce = new Timer { Interval = 200 };
        private Dictionary<string, int> componentCounts = new Dictionary<string, int>();

        public NormsPage(LibrarySession session) : base(session)
        {
            Root.Controls.Add(Ux.Text(NS.Intro, color: SystemColors.GrayText));
            var add = Ux.Button(NS.Add, (_, __) => Editors.Norm(this, Session, null));
            open = Ux.Button(NS.Open, (_, __) => OpenSelected());
            copy = Ux.Button(NS.CopyVersion, (_, __) => CopySelected());
            delete = Ux.Button(S.Delete, (_, __) => DeleteSelected());
            Root.Controls.Add(Ux.ButtonRow(add, open, copy, delete));
            empty = Ux.Notice(NS.Empty, SystemColors.ControlText);
            Root.Controls.Add(empty);

            Query = new TextBox();
            Group = Ux.Combo();
            Status = Ux.Combo(140);
            Status.Items.Add(new Choice("", NS.AllStatuses));
            foreach (var status in new[] { NormStatus.Draft, NormStatus.Approved, NormStatus.Inactive })
            {
                Status.Items.Add(new Choice(status.ToString(), NS.Status[status]));
            }
            Status.SelectedIndex = 0;
            groupBox = new FieldBox(S.Group, Group) { Dock = DockStyle.None };
            var panel = Ux.Stack();
            panel.Dock = DockStyle.Fill;
            panel.Controls.Add(new FieldBox(NS.Search, Query));
            panel.Controls.Add(Ux.Row(false, groupBox, new FieldBox(NS.StatusFilter, Status) { Dock = DockStyle.None }));
            filters = panel;
            Root.Controls.Add(panel);
            count = Ux.Text("");
            Root.Controls.Add(count);

            List = new RecordList<Norm>(n => n.Id,
                new Column<Norm>(NS.ColCode, 90, n => n.Code),
                new Column<Norm>(NS.ColVersion, 70, n => n.Version),
                new Column<Norm>(NS.FName, 240, n => n.Name),
                new Column<Norm>(S.ColUnit, 60, n => n.Unit),
                new Column<Norm>(NS.ColStatus, 90, n => NS.Status[n.Status]),
                new Column<Norm>(NS.ColComponents, 80, n => (componentCounts.TryGetValue(n.Id, out var c) ? c : 0).ToString(), HorizontalAlignment.Right),
                new Column<Norm>(S.Group, 120, n => n.CategoryId == null ? S.NoGroup : NameLookup.Of(Session.Library).CategoryName(n.CategoryId)),
                new Column<Norm>(NS.ColSource, 200, n => n.SourceType == NormSourceType.Document ? NS.SourceDocument(n.Source, n.SourceVerified) : NS.SourceUser),
                new Column<Norm>(NS.ColWorkItem, 120, n => Session.Library.WorkItems.FirstOrDefault(w => w.Id == n.WorkItemId)?.Code ?? ""));
            List.ItemActivate += (_, __) => OpenSelected();
            List.DeleteRequested += DeleteSelected;
            List.SelectedIndexChanged += (_, __) => UpdateButtons();
            Ux.AddFill(Root, List);

            debounce.Tick += (_, __) =>
            {
                debounce.Stop();
                Apply();
            };
            Query.TextChanged += (_, __) =>
            {
                debounce.Stop();
                debounce.Start();
            };
            Group.SelectedIndexChanged += (_, __) => Apply();
            Status.SelectedIndexChanged += (_, __) => Apply();
            RefreshView();
        }

        public TextBox Query { get; }
        public ComboBox Group { get; }
        public ComboBox Status { get; }
        public RecordList<Norm> List { get; }

        private void UpdateButtons()
        {
            var norm = List.Selected;
            open.Enabled = copy.Enabled = norm != null;
            delete.Enabled = norm?.Status == NormStatus.Draft;
        }

        public override void RefreshView()
        {
            var library = Session.Library;
            componentCounts = library.NormComponents.GroupBy(c => c.NormId).ToDictionary(g => g.Key, g => g.Count());
            var hasItems = library.Norms.Count > 0;
            empty.Visible = !hasItems;
            filters.Visible = count.Visible = hasItems;
            var keep = Ux.SelectedId(Group);
            Group.BeginUpdate();
            Group.Items.Clear();
            Group.Items.Add(new Choice("", S.AllGroups));
            Group.Items.Add(new Choice(ListFilter.None, S.NoGroup));
            foreach (var c in library.Categories.OrderBy(c => c.Name, Names))
            {
                Group.Items.Add(new Choice(c.Id, c.Name));
            }
            Group.EndUpdate();
            groupBox.Visible = library.Categories.Count > 0;
            Ux.SelectId(Group, library.Categories.Count > 0 ? keep : "");
            Apply();
        }

        public void Apply()
        {
            var library = Session.Library;
            var terms = Search.NormalizeForSearch(Query.Text).Split(' ').Where(t => t != "").ToList();
            var category = Ux.SelectedId(Group);
            var status = Ux.SelectedId(Status);
            var results = library.Norms.Where(n =>
                {
                    if (status != "" && n.Status.ToString() != status)
                    {
                        return false;
                    }
                    if (category == ListFilter.None ? n.CategoryId != null : category != "" && n.CategoryId != category)
                    {
                        return false;
                    }
                    var haystack = Search.NormalizeForSearch($"{n.Code} {n.Name} {n.Version}");
                    return terms.All(t => haystack.Contains(t));
                })
                .OrderBy(n => n.Code, Codes).ThenBy(n => n.Version, Codes).ToList();
            count.Text = results.Count == 0 && library.Norms.Count > 0
                ? $"{S.Count(0, library.Norms.Count)} · {S.NoResults}"
                : S.Count(results.Count, library.Norms.Count);
            List.SetItems(results);
            UpdateButtons();
        }

        private void OpenSelected()
        {
            if (List.Selected != null)
            {
                Editors.Norm(this, Session, List.Selected.Id);
            }
        }

        /// <summary>Mở phiên bản vừa tạo; null = mở hộp thoại định mức. Test thay để không phải bấm.</summary>
        public Action<string>? OpenNorm { get; set; }

        public void CopySelected()
        {
            var norm = List.Selected;
            if (norm == null)
            {
                return;
            }
            Norm? created = null;
            if (Guard(() => created = Session.Service.CopyNormAsNewVersion(norm.Id, Session.Library)))
            {
                Session.Reload();
                Session.Notify(NS.Copied(created!.Code, created.Version));
                List.Select(created.Id);
                (OpenNorm ?? (id => Editors.Norm(this, Session, id)))(created.Id);
            }
        }

        public void DeleteSelected()
        {
            var norm = List.Selected;
            if (norm == null || norm.Status != NormStatus.Draft)
            {
                return;
            }
            var components = componentCounts.TryGetValue(norm.Id, out var c) ? c : 0;
            if (!Session.Prompts.Confirm(this, NS.DeleteTitle, NS.DeleteBody(norm.Code, norm.Version, components), S.Delete, S.Cancel))
            {
                return;
            }
            if (Guard(() => Session.Service.DeleteNorm(norm.Id, Session.Library)))
            {
                Session.Reload();
                Session.Notify(S.Deleted($"{norm.Code} v{norm.Version}"));
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                debounce.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    /// <summary>Thẻ Danh mục: nhóm (dùng chung cho công tác và tài nguyên) và nhà cung cấp (CatalogPanel của bản web).</summary>
    internal sealed class CatalogPage : LibraryPage
    {
        private readonly Label categoriesTitle;
        private readonly Label categoriesEmpty;
        private readonly Label unassigned;
        private readonly Label suppliersTitle;
        private readonly Label suppliersEmpty;
        private Dictionary<string, CategoryUsage> categoryUsage = new Dictionary<string, CategoryUsage>();
        private Dictionary<string, SupplierUsage> supplierUsage = new Dictionary<string, SupplierUsage>();

        public CatalogPage(LibrarySession session) : base(session)
        {
            var split = new TableLayoutPanel { ColumnCount = 2, Dock = DockStyle.Fill, Margin = new Padding(0) };
            split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            split.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            var left = Ux.FillStack();
            categoriesTitle = Ux.Text("", Ux.Bold);
            left.Controls.Add(categoriesTitle);
            left.Controls.Add(Ux.Text(S.CategoriesIntro, color: SystemColors.GrayText));
            Button editCategory = null!, deleteCategory = null!;
            left.Controls.Add(Ux.ButtonRow(
                Ux.Button(S.AddCategory, (_, __) => EditCategory(null)),
                editCategory = Ux.Button(S.Edit, (_, __) => EditCategory(Categories!.Selected)),
                deleteCategory = Ux.Button(S.Delete, (_, __) => DeleteCategory())));
            categoriesEmpty = Ux.Text(S.CategoriesEmpty);
            left.Controls.Add(categoriesEmpty);
            unassigned = Ux.Text("", color: SystemColors.GrayText);
            left.Controls.Add(unassigned);
            Categories = new RecordList<Category>(c => c.Id,
                new Column<Category>(S.CategoryName, 180, c => c.Name),
                new Column<Category>(S.ColWorkItems, 70, c => Usage(c.Id).WorkItems.ToString(), HorizontalAlignment.Right),
                new Column<Category>(S.ColResources, 80, c => Usage(c.Id).Resources.ToString(), HorizontalAlignment.Right),
                new Column<Category>(S.ColNotes, 200, c => c.Notes));
            Categories.ItemActivate += (_, __) => EditCategory(Categories.Selected);
            Categories.DeleteRequested += DeleteCategory;
            Categories.SelectedIndexChanged += (_, __) => editCategory.Enabled = deleteCategory.Enabled = Categories.Selected != null;
            Ux.AddFill(left, Categories);

            var right = Ux.FillStack();
            suppliersTitle = Ux.Text("", Ux.Bold);
            right.Controls.Add(suppliersTitle);
            right.Controls.Add(Ux.Text(S.SuppliersIntro, color: SystemColors.GrayText));
            Button editSupplier = null!, deleteSupplier = null!;
            right.Controls.Add(Ux.ButtonRow(
                Ux.Button(S.AddSupplier, (_, __) => EditSupplier(null)),
                editSupplier = Ux.Button(S.Edit, (_, __) => EditSupplier(Suppliers!.Selected)),
                deleteSupplier = Ux.Button(S.Delete, (_, __) => DeleteSupplier())));
            suppliersEmpty = Ux.Text(S.SuppliersEmpty);
            right.Controls.Add(suppliersEmpty);
            Suppliers = new RecordList<Supplier>(s => s.Id,
                new Column<Supplier>(S.SupplierName, 180, s => s.Name),
                new Column<Supplier>(S.ColWorkItems, 70, s => SupplierUse(s.Id).WorkItems.ToString(), HorizontalAlignment.Right),
                new Column<Supplier>(S.ColPrices, 60, s => SupplierUse(s.Id).Prices.ToString(), HorizontalAlignment.Right),
                new Column<Supplier>(S.ColContact, 180, s => s.ContactInfo.Replace("\r", " ").Replace("\n", " ")),
                new Column<Supplier>(S.ColNotes, 150, s => s.Notes));
            Suppliers.ItemActivate += (_, __) => EditSupplier(Suppliers.Selected);
            Suppliers.DeleteRequested += DeleteSupplier;
            Suppliers.SelectedIndexChanged += (_, __) => editSupplier.Enabled = deleteSupplier.Enabled = Suppliers.Selected != null;
            Ux.AddFill(right, Suppliers);

            split.Controls.Add(left, 0, 0);
            split.Controls.Add(right, 1, 0);
            Ux.AddFill(Root, split);
            RefreshView();
        }

        public RecordList<Category> Categories { get; }
        public RecordList<Supplier> Suppliers { get; }

        /// <summary>Hộp thoại sửa nhóm/nhà cung cấp; test thay để không phải bấm.</summary>
        public Func<IWin32Window, Form, DialogResult> ShowDialogFor { get; set; } = (owner, dialog) => dialog.ShowDialog(owner);

        private CategoryUsage Usage(string id) => categoryUsage.TryGetValue(id, out var u) ? u : new CategoryUsage();
        private SupplierUsage SupplierUse(string id) => supplierUsage.TryGetValue(id, out var u) ? u : new SupplierUsage();

        public override void RefreshView()
        {
            var library = Session.Library;
            categoryUsage = Search.CategoryUsageOf(library);
            supplierUsage = Search.SupplierUsageOf(library);
            categoriesTitle.Text = S.CategoriesTitle(library.Categories.Count);
            categoriesEmpty.Visible = library.Categories.Count == 0;
            var none = Usage(ListFilter.None);
            unassigned.Text = S.Unassigned(none.WorkItems, none.Resources);
            unassigned.Visible = none.WorkItems > 0 || none.Resources > 0;
            Categories.SetItems(library.Categories.OrderBy(c => c.Name, Names));
            suppliersTitle.Text = S.SuppliersTitle(library.Suppliers.Count);
            suppliersEmpty.Visible = library.Suppliers.Count == 0;
            Suppliers.SetItems(library.Suppliers.OrderBy(s => s.Name, Names));
        }

        private void EditCategory(Category? category)
        {
            using (var dialog = new CategoryDialog(Session, category))
            {
                ShowDialogFor(this, dialog);
            }
        }

        private void EditSupplier(Supplier? supplier)
        {
            using (var dialog = new SupplierDialog(Session, supplier))
            {
                ShowDialogFor(this, dialog);
            }
        }

        public void DeleteCategory()
        {
            var category = Categories.Selected;
            if (category == null)
            {
                return;
            }
            var usage = Usage(category.Id);
            string? moveTo = null;
            if (usage.WorkItems + usage.Resources > 0)
            {
                var combo = Ux.Combo(260);
                combo.Items.Add(new Choice("", S.Unassign));
                foreach (var c in Session.Library.Categories.Where(c => c.Id != category.Id).OrderBy(c => c.Name, Names))
                {
                    combo.Items.Add(new Choice(c.Id, c.Name));
                }
                combo.SelectedIndex = 0;
                var field = new FieldBox(S.MoveTo, combo);
                if (!Session.Prompts.Confirm(this, S.DeleteCategoryTitle, S.DeleteCategoryUsed(category.Name, usage.WorkItems, usage.Resources),
                    S.DeleteCategoryConfirm, S.Cancel, field))
                {
                    return;
                }
                moveTo = Ux.SelectedId(combo) is var id && id != "" ? id : null;
            }
            else if (!Session.Prompts.Confirm(this, S.DeleteCategoryTitle, S.DeleteCategoryUnused(category.Name), S.DeleteCategoryConfirm, S.Cancel))
            {
                return;
            }
            if (Guard(() => Session.Service.DeleteCategory(category.Id, moveTo, Session.Library)))
            {
                Session.Reload();
                Session.Notify(S.Deleted(category.Name));
            }
        }

        public void DeleteSupplier()
        {
            var supplier = Suppliers.Selected;
            if (supplier == null)
            {
                return;
            }
            var usage = SupplierUse(supplier.Id);
            if (!Session.Prompts.Confirm(this, S.DeleteSupplierTitle, S.DeleteSupplierBody(supplier.Name, usage.WorkItems, usage.Prices), S.Delete, S.Cancel))
            {
                return;
            }
            if (Guard(() => Session.Service.DeleteSupplier(supplier.Id)))
            {
                Session.Reload();
                Session.Notify(S.Deleted(supplier.Name));
            }
        }
    }

    /// <summary>Thẻ Kiểm tra: báo cáo toàn thư viện, chỉ liệt kê, không tự sửa (LibraryCheckPanel của bản web).</summary>
    internal sealed class CheckPage : LibraryPage
    {
        private readonly Label ok;
        private readonly Label summary;
        private readonly Label hint;

        public CheckPage(LibrarySession session) : base(session)
        {
            Root.Controls.Add(Ux.Text(S.CheckDescription));
            Root.Controls.Add(Ux.ButtonRow(Ux.Button(S.CheckRun, (_, __) => Session.Reload())));
            ok = Ux.Notice(S.CheckOk, Ux.SuccessColor);
            Root.Controls.Add(ok);
            summary = Ux.Text("", Ux.Bold);
            Root.Controls.Add(summary);
            hint = Ux.Text(S.CheckOpenHint, color: SystemColors.GrayText);
            Root.Controls.Add(hint);
            List = new RecordList<LibraryIssue>(i => $"{i.Kind}|{i.EntityId}|{i.Detail}",
                new Column<LibraryIssue>(S.ColSeverity, 90, i => i.Severity == IssueSeverity.Error ? S.CheckError : S.CheckWarning),
                new Column<LibraryIssue>(S.ColRecord, 200, i => i.Label),
                new Column<LibraryIssue>(S.ColDetail, 560, i => i.Detail))
            {
                RowColor = i => i.Severity == IssueSeverity.Error ? Ux.ErrorColor : Ux.WarningColor,
            };
            List.ItemActivate += (_, __) =>
            {
                if (List.Selected != null)
                {
                    Editors.Open(this, Session, List.Selected);
                }
            };
            Ux.AddFill(Root, List);
            RefreshView();
        }

        public RecordList<LibraryIssue> List { get; }

        public override void RefreshView()
        {
            var all = LibraryCheck.Issues(Session.Library, Session.Today);
            var issues = all.Where(i => i.Severity == IssueSeverity.Error).Concat(all.Where(i => i.Severity == IssueSeverity.Warning)).ToList();
            var errors = issues.Count(i => i.Severity == IssueSeverity.Error);
            ok.Visible = issues.Count == 0;
            summary.Visible = hint.Visible = List.Visible = issues.Count > 0;
            summary.Text = $"{S.CheckErrors(errors)} · {S.CheckWarnings(issues.Count - errors)}";
            List.SetItems(issues);
        }
    }
}
