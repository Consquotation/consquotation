using System;
using System.Collections.Generic;
using System.Drawing;
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
    /// <summary>Công tác lấy từ thư viện để điền sẵn form Thêm công tác (LibraryPrefill của bản web).</summary>
    internal sealed class LibraryPrefill
    {
        public WorkItem Item { get; set; } = new WorkItem();
        public WorkItemDraftInput Draft { get; set; } = new WorkItemDraftInput();
        public List<InsertWarning> Warnings { get; set; } = new List<InsertWarning>();
        /// <summary>Thành phần định mức nếu công tác có định mức đang dùng; rỗng thì chỉ có đơn giá thư viện.</summary>
        public List<Core.Pricing.CompositionLine> Lines { get; set; } = new List<Core.Pricing.CompositionLine>();

        public static LibraryPrefill From(WorkItem item, LibrarySession library)
        {
            var snapshot = library.Library;
            var draft = ToQuote.DraftFromWorkItem(item, library.Today, NameLookup.Of(snapshot));
            return new LibraryPrefill
            {
                Item = item,
                Draft = draft.Draft,
                Warnings = draft.Warnings,
                Lines = Core.Pricing.Composition.Lines(item, snapshot, library.Today),
            };
        }
    }

    /// <summary>Trạng thái dùng chung của các thẻ báo giá: danh sách bảng, bảng đang chọn, cổng Excel và dịch vụ hồ sơ.</summary>
    internal sealed class QuoteSession
    {
        public QuoteSession(LibrarySession library)
        {
            Library = library;
            Gateway = library.Quotes ?? throw new ArgumentException("Thiếu cổng Excel cho báo giá.", nameof(library));
            Quotation = new QuotationService(Gateway, () => library.Now().ToUniversalTime(), () => Guid.NewGuid().ToString(), LoadLibrary);
        }

        public LibrarySession Library { get; }
        public IQuoteGateway Gateway { get; }
        public QuotationService Quotation { get; }
        public IPrompts Prompts => Library.Prompts;

        public string WorkbookName { get; private set; } = "";
        public List<QuoteTableInfo> Tables { get; private set; } = new List<QuoteTableInfo>();
        public string SelectedTable { get; private set; } = "";
        private string? lastSelectionTable;
        public bool Busy { get; set; }

        /// <summary>Lượt đọc lại danh sách bảng đang chạy nền: việc người dùng bấm chờ xong rồi mới chạy, không bị bỏ qua.</summary>
        public Task Refreshing { get; set; } = Task.CompletedTask;

        /// <summary>Danh sách bảng hoặc bảng đang chọn vừa đổi.</summary>
        public event Action? TablesChanged;

        /// <summary>Thư viện mới nhất để so với báo giá; không đọc được thì bỏ qua phần so sánh.</summary>
        private LibrarySnapshot? LoadLibrary()
        {
            Library.ReloadIfChangedOutside();
            return Library.LoadError == null ? Library.Library : null;
        }

        /// <summary>Đọc lại danh sách bảng. followSelection: chọn bảng đang chứa vùng chọn; không thì giữ bảng đang làm việc nếu còn.</summary>
        public async Task RefreshTablesAsync(bool followSelection)
        {
            var list = await Gateway.ListQuoteTablesAsync();
            WorkbookName = list.WorkbookName;
            Tables = list.Tables;
            // Vùng chọn vừa chuyển sang bảng khác thì theo nó; vẫn ở bảng cũ thì giữ bảng người dùng đang chọn trong ô.
            var atSelection = Tables.FirstOrDefault(t => t.ContainsSelection)?.TableName;
            SelectedTable = followSelection && atSelection != null && atSelection != lastSelectionTable ? atSelection
                : Tables.Any(t => t.TableName == SelectedTable) ? SelectedTable
                : QuoteService.PreferredTable(Tables, SelectedTable);
            lastSelectionTable = atSelection;
            TablesChanged?.Invoke();
        }

        public void SelectTable(string name)
        {
            if (name != SelectedTable)
            {
                SelectedTable = name;
                TablesChanged?.Invoke();
            }
        }

        public QuoteTableInfo? CurrentTable => Tables.FirstOrDefault(t => t.TableName == SelectedTable);
    }

    /// <summary>Ô chọn bảng báo giá dùng chung cho các thẻ.</summary>
    internal sealed class TablePicker : ChoiceField
    {
        private readonly QuoteSession session;
        private bool updating;

        public TablePicker(QuoteSession session) : base(Q.Table, new Choice[0])
        {
            this.session = session;
            Combo.Width = Ux.Px(420);
            Combo.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            Combo.SelectedIndexChanged += (_, __) =>
            {
                if (!updating)
                {
                    session.SelectTable(Value);
                }
            };
        }

        public void Rebuild()
        {
            updating = true;
            Combo.Items.Clear();
            foreach (var t in session.Tables)
            {
                Combo.Items.Add(new Choice(t.TableName, Q.TableOption(t.TableName, t.SheetName, t.DataRowCount) + (t.HeadersMatch ? "" : Q.HeadersChangedOption)));
            }
            Value = session.SelectedTable;
            updating = false;
        }
    }

    /// <summary>
    /// Thẻ của cửa sổ Báo giá. Mọi việc gọi Excel đi qua Run: chạy một việc một lúc, khóa form trong lúc chạy (một
    /// cú bấm thứ hai không tạo dòng trùng), lỗi hiện tại chỗ.
    /// </summary>
    internal abstract class QuotePanel : UserControl
    {
        protected QuotePanel(QuoteSession session, bool fill = false)
        {
            Session = session;
            Dock = DockStyle.Fill;
            Font = Ux.Font;
            Status = Ux.Notice("", Ux.ErrorColor);
            Status.Visible = false;
            if (fill)
            {
                Body = Ux.FillStack();
                Body.Padding = new Padding(Ux.Px(8));
                Controls.Add(Body);
            }
            else
            {
                var scroller = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(Ux.Px(8)) };
                Body = Ux.Stack(Ux.Px(680));
                scroller.Controls.Add(Body);
                Controls.Add(scroller);
            }
            session.TablesChanged += OnTablesChanged;
        }

        protected QuoteSession Session { get; }
        protected TableLayoutPanel Body { get; }
        protected Label Status { get; }

        /// <summary>Việc gần nhất, để test chờ hết việc bất đồng bộ.</summary>
        public Task LastWork { get; private set; } = Task.CompletedTask;

        public string StatusText => Status.Text;

        protected virtual void OnTablesChanged()
        {
        }

        /// <summary>Thẻ vừa được mở hoặc cửa sổ vừa được kích hoạt lại: đọc lại phần hiển thị.</summary>
        public virtual Task ReloadAsync() => Task.CompletedTask;

        /// <summary>Làm mới danh sách bảng có chuyển theo vùng chọn trong Excel không (thẻ Thông tin đang có chữ chưa lưu: không).</summary>
        public virtual bool FollowSelection => true;

        public void Say(Color color, string? text)
        {
            Status.ForeColor = color;
            Status.BackColor = color == Ux.SuccessColor ? Ux.SuccessBack : color == Ux.ErrorColor ? Ux.ErrorBack : Ux.NoticeBack;
            Ux.Show(Status, text);
        }

        protected void Run(Func<Task> work, bool writes = false) => LastWork = RunCore(work, writes);

        private async Task RunCore(Func<Task> work, bool writes)
        {
            if (Session.Busy)
            {
                return;
            }
            Session.Busy = true;
            Enabled = false;
            UseWaitCursor = true;
            try
            {
                await Session.Refreshing;
                await work();
            }
            catch (Exception ex) when (ExcelErrors.IsChange(ex))
            {
                Say(Ux.WarningColor, Q.UnexpectedChange);
            }
            catch (Exception ex) when (!(ex is OutOfMemoryException))
            {
                Say(Ux.ErrorColor, writes ? ExcelErrors.DescribeWrite(ex) : ExcelErrors.Describe(ex));
            }
            finally
            {
                Session.Busy = false;
                Enabled = true;
                UseWaitCursor = false;
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                Session.TablesChanged -= OnTablesChanged;
            }
            base.Dispose(disposing);
        }
    }
}
