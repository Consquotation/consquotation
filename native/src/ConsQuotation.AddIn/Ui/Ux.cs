using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using ConsQuotation.Core.Library;

namespace ConsQuotation.Ui
{
    /// <summary>Phông, khoảng cách và các khối dựng giao diện kiểu hộp thoại Windows cổ điển.</summary>
    internal static class Ux
    {
        public static readonly Font Font = SystemFonts.MessageBoxFont;
        public static readonly Font Bold = new Font(Font, FontStyle.Bold);
        public static readonly Font Heading = new Font(Font.FontFamily, Font.SizeInPoints + 1.5f, FontStyle.Bold);

        public static readonly Color ErrorColor = Color.FromArgb(164, 38, 44);
        public static readonly Color WarningColor = Color.FromArgb(138, 90, 0);
        public static readonly Color SuccessColor = Color.FromArgb(16, 124, 16);
        public static readonly Color NoticeBack = Color.FromArgb(255, 244, 206);

        private static readonly float Scale = ReadScale();

        private static float ReadScale()
        {
            using (var g = Graphics.FromHwnd(IntPtr.Zero))
            {
                return g.DpiX / 96f;
            }
        }

        /// <summary>Kích thước thiết kế ở 96 DPI → điểm ảnh thật.</summary>
        public static int Px(int logical) => (int)Math.Round(logical * Scale);

        /// <summary>Khối xếp dọc một cột. Có width thì rộng cố định (chữ dài tự xuống dòng).</summary>
        public static TableLayoutPanel Stack(int? width = null)
        {
            var panel = new TableLayoutPanel
            {
                ColumnCount = 1,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                GrowStyle = TableLayoutPanelGrowStyle.AddRows,
                Margin = new Padding(0),
            };
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            KeepOrder(panel);
            if (width != null)
            {
                panel.MinimumSize = new Size(width.Value, 0);
                panel.MaximumSize = new Size(width.Value, 0);
            }
            return panel;
        }

        /// <summary>
        /// Khối một cột: hàng của mỗi control = thứ tự của nó. Không gán thì TableLayoutPanel giữ ô đã xếp từ trước,
        /// control ẩn rồi hiện lại có thể nhảy lên trên control đứng trước nó.
        /// </summary>
        public static void KeepOrder(TableLayoutPanel panel)
        {
            void Reflow()
            {
                for (var i = 0; i < panel.Controls.Count; i++)
                {
                    panel.SetCellPosition(panel.Controls[i], new TableLayoutPanelCellPosition(0, i));
                }
            }
            panel.ControlAdded += (_, __) => Reflow();
            panel.ControlRemoved += (_, __) => Reflow();
        }

        /// <summary>Khối xếp dọc lấp đầy chỗ chứa; control thêm bằng AddFill chiếm phần cao còn lại.</summary>
        public static TableLayoutPanel FillStack()
        {
            var panel = Stack();
            panel.AutoSize = false;
            panel.Dock = DockStyle.Fill;
            return panel;
        }

        public static void AddFill(TableLayoutPanel stack, Control control)
        {
            while (stack.RowStyles.Count < stack.Controls.Count)
            {
                stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            }
            stack.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            control.Dock = DockStyle.Fill;
            stack.Controls.Add(control);
        }

        /// <summary>Lưới hai cột đều nhau cho các ô nhập.</summary>
        public static TableLayoutPanel Grid(int columns = 2)
        {
            var panel = new TableLayoutPanel
            {
                ColumnCount = columns,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                // Neo thay vì Dock: Dock làm lưới bị kéo theo chiều cao khối cha đo ở bề rộng khác, phần thừa dồn
                // vào hàng cuối.
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                Margin = new Padding(0),
            };
            for (var i = 0; i < columns; i++)
            {
                panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / columns));
            }
            return panel;
        }

        /// <summary>Đoạn chữ tự xuống dòng theo bề rộng khối chứa.</summary>
        public static Label Text(string text, Font? font = null, Color? color = null) => new Label
        {
            Text = text,
            AutoSize = true,
            Anchor = AnchorStyles.Left | AnchorStyles.Right,
            Font = font ?? Font,
            ForeColor = color ?? SystemColors.ControlText,
            Margin = new Padding(Px(3), Px(3), Px(3), Px(3)),
            UseMnemonic = false,
        };

        public static Button Button(string text, EventHandler onClick)
        {
            var button = new Button
            {
                Text = text,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowOnly,
                MinimumSize = new Size(Px(80), Px(25)),
                UseMnemonic = false,
                Margin = new Padding(Px(3)),
            };
            button.Click += onClick;
            return button;
        }

        public static FlowLayoutPanel ButtonRow(params Control[] controls) => Row(true, controls);

        /// <summary>
        /// Hàng control. wrap = false cho hàng ô lọc: hàng tự xuống dòng bị đo ở bề rộng tạm hẹp nên khối cha để
        /// dư chỗ trống.
        /// </summary>
        public static FlowLayoutPanel Row(bool wrap, params Control[] controls)
        {
            var row = new FlowLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                WrapContents = wrap,
                Anchor = AnchorStyles.Left | AnchorStyles.Right,
                Margin = new Padding(0),
            };
            row.Controls.AddRange(controls);
            return row;
        }

        public static Label Notice(string text, Color color) => new Label
        {
            Text = text,
            AutoSize = true,
            Anchor = AnchorStyles.Left | AnchorStyles.Right,
            ForeColor = color,
            BackColor = NoticeBack,
            Padding = new Padding(Px(6)),
            Margin = new Padding(Px(3)),
            UseMnemonic = false,
        };

        /// <summary>Đặt chữ và hiện/ẩn theo chữ (rỗng = ẩn). Trạng thái đọc lại bằng Text, không bằng Visible.</summary>
        public static void Show(Label label, string? text)
        {
            label.Text = text ?? "";
            label.Visible = label.Text != "";
        }

        public static ComboBox Combo(int width = 180) => new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = Px(width),
            Margin = new Padding(Px(3)),
        };

        /// <summary>Chọn mục có Id trong ComboBox (mục là Choice); không thấy thì chọn mục đầu.</summary>
        public static void SelectId(ComboBox combo, string id)
        {
            var index = combo.Items.Cast<Choice>().ToList().FindIndex(c => c.Id == id);
            combo.SelectedIndex = index >= 0 ? index : combo.Items.Count > 0 ? 0 : -1;
        }

        public static string SelectedId(ComboBox combo) => (combo.SelectedItem as Choice)?.Id ?? "";
    }

    /// <summary>Một lựa chọn trong ComboBox: giá trị (Id) và chữ hiển thị.</summary>
    internal sealed class Choice
    {
        public Choice(string id, string text)
        {
            Id = id;
            Text = text;
        }

        public string Id { get; }
        public string Text { get; }
        public override string ToString() => Text;
    }

    /// <summary>Ô nhập có nhãn, gợi ý, lưu ý và dòng lỗi tiếng Việt ngay dưới ô (như TextField của bản web).</summary>
    internal class FieldBox : TableLayoutPanel
    {
        private readonly Label error;
        private readonly Label warning;

        public FieldBox(string label, Control editor, bool required = false, string? hint = null)
        {
            ColumnCount = 1;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Dock = DockStyle.Fill;
            Margin = new Padding(Ux.Px(3), Ux.Px(2), Ux.Px(3), Ux.Px(4));
            ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Ux.KeepOrder(this);
            Caption = Ux.Text(required ? label + " *" : label);
            Caption.Margin = new Padding(0, Ux.Px(2), 0, 0);
            // Nhãn ô ngắn, không cho xuống dòng: khi lưới đo kích thước với bề rộng tạm rất hẹp, nhãn xuống dòng
            // từng chữ làm hàng cao gấp đôi (thấy ở ô ngày).
            Caption.Anchor = AnchorStyles.Left;
            Controls.Add(Caption);
            Editor = editor;
            // Tên cho trình đọc màn hình (và UI Automation) là nhãn của ô.
            editor.AccessibleName = label;
            editor.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            editor.Margin = new Padding(0, Ux.Px(2), 0, 0);
            Controls.Add(editor);
            if (hint != null)
            {
                Controls.Add(Note(hint, SystemColors.GrayText));
            }
            warning = Note("", Ux.WarningColor);
            warning.Visible = false;
            Controls.Add(warning);
            error = Note("", Ux.ErrorColor);
            error.Visible = false;
            Controls.Add(error);
        }

        /// <summary>
        /// Dòng gợi ý/lưu ý/lỗi dưới ô: xuống dòng ở bề rộng cố định. Nếu xuống dòng theo bề rộng khối cha, lượt đo
        /// kích thước (bề rộng tạm khác bề rộng thật) làm lưới cao dư và dồn khoảng trống vào hàng cuối.
        /// </summary>
        private static Label Note(string text, Color color)
        {
            var label = Ux.Text(text, color: color);
            label.Anchor = AnchorStyles.Left;
            label.MaximumSize = new Size(Ux.Px(280), 0);
            label.Margin = new Padding(0, Ux.Px(1), 0, 0);
            return label;
        }

        public Label Caption { get; }
        public Control Editor { get; }

        // Visible của WinForms còn phụ thuộc cửa sổ cha đã hiện chưa, nên trạng thái đọc theo nội dung chữ.
        public string? Error
        {
            get => error.Text == "" ? null : error.Text;
            set
            {
                error.Text = value ?? "";
                error.Visible = !string.IsNullOrEmpty(value);
            }
        }

        public string? Warning
        {
            get => warning.Text == "" ? null : warning.Text;
            set
            {
                warning.Text = value ?? "";
                warning.Visible = !string.IsNullOrEmpty(value);
            }
        }

        /// <summary>Thêm control phụ ngay dưới ô chính (trước dòng lỗi).</summary>
        protected void AddBelowEditor(Control control)
        {
            Controls.Add(control);
            Controls.SetChildIndex(control, Controls.IndexOf(Editor) + 1);
            for (var i = 0; i < Controls.Count; i++)
            {
                SetCellPosition(Controls[i], new TableLayoutPanelCellPosition(0, i));
            }
        }
    }

    internal sealed class TextField : FieldBox
    {
        public TextField(string label, bool required = false, string? hint = null, bool multiline = false)
            : base(label, new TextBox { Multiline = multiline, AcceptsReturn = multiline, ScrollBars = multiline ? ScrollBars.Vertical : ScrollBars.None }, required, hint)
        {
            if (multiline)
            {
                Box.Height = Ux.Px(54);
            }
        }

        public TextBox Box => (TextBox)Editor;

        public string Value
        {
            get => Box.Text;
            set => Box.Text = value;
        }
    }

    /// <summary>Ô ngày: bỏ đánh dấu = không ghi ngày. Giá trị dạng yyyy-mm-dd như ô date của bản web.</summary>
    internal sealed class DateField : FieldBox
    {
        public DateField(string label)
            : base(label, new DateTimePicker { ShowCheckBox = true, Format = DateTimePickerFormat.Custom, CustomFormat = "dd/MM/yyyy" })
        {
            Picker.Checked = false;
        }

        public DateTimePicker Picker => (DateTimePicker)Editor;

        public string Value
        {
            get => Picker.Checked ? Picker.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "";
            set
            {
                if (Dates.IsIsoDate(value))
                {
                    Picker.Value = DateTime.ParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture);
                    Picker.Checked = true;
                }
                else
                {
                    Picker.Checked = false;
                }
            }
        }
    }

    internal sealed class ChoiceField : FieldBox
    {
        public ChoiceField(string label, IEnumerable<Choice> choices, string? hint = null)
            : base(label, Ux.Combo(), false, hint)
        {
            Combo.Items.AddRange(choices.Cast<object>().ToArray());
            if (Combo.Items.Count > 0)
            {
                Combo.SelectedIndex = 0;
            }
        }

        public ComboBox Combo => (ComboBox)Editor;

        public string Value
        {
            get => Ux.SelectedId(Combo);
            set => Ux.SelectId(Combo, value);
        }
    }

    /// <summary>
    /// Ô chọn nhóm hoặc nhà cung cấp. "" = không chọn. Có newLabel thì thêm lựa chọn tạo mới; khi chọn, hiện ô
    /// nhập tên mới (form tạo bản ghi lúc lưu), như RefSelect của bản web.
    /// </summary>
    internal sealed class RefField : FieldBox
    {
        public const string NewRef = "__new__";

        private readonly TextField? newName;

        public RefField(string label, IEnumerable<(string Id, string Name)> options, string noneLabel,
            string? newLabel = null, string? newNameLabel = null, string? hint = null, bool sortByName = true)
            : base(label, Ux.Combo(), false, hint)
        {
            this.noneLabel = noneLabel;
            this.newLabel = newLabel;
            this.sortByName = sortByName;
            if (newLabel != null)
            {
                newName = new TextField(newNameLabel ?? label, required: true) { Visible = false, Margin = new Padding(0) };
                AddBelowEditor(newName);
                Combo.SelectedIndexChanged += (_, __) => newName.Visible = Value == NewRef;
            }
            Reset(options, "");
        }

        private readonly string noneLabel;
        private readonly string? newLabel;
        private readonly bool sortByName;

        /// <summary>Nạp lại danh sách (ví dụ sau khi vừa tạo nhóm mới) và chọn id.</summary>
        public void Reset(IEnumerable<(string Id, string Name)> options, string selectedId)
        {
            Combo.Items.Clear();
            Combo.Items.Add(new Choice("", noneLabel));
            var list = sortByName ? options.OrderBy(o => o.Name, Comparer<string>.Create(Search.CompareText)) : options;
            foreach (var (id, name) in list)
            {
                Combo.Items.Add(new Choice(id, name));
            }
            if (newLabel != null)
            {
                Combo.Items.Add(new Choice(NewRef, newLabel));
            }
            Value = selectedId;
            if (!Creating)
            {
                NewName = "";
            }
        }

        public ComboBox Combo => (ComboBox)Editor;

        public string Value
        {
            get => Ux.SelectedId(Combo);
            set => Ux.SelectId(Combo, value ?? "");
        }

        public bool Creating => Value == NewRef;

        public string NewName
        {
            get => newName?.Value ?? "";
            set
            {
                if (newName != null)
                {
                    newName.Value = value;
                }
            }
        }

        /// <summary>Đang tạo mới thì lỗi hiện dưới ô tên mới, ngược lại dưới ô chọn.</summary>
        public void SetError(string? message)
        {
            if (Creating && newName != null)
            {
                newName.Error = message;
                Error = null;
            }
            else
            {
                Error = message;
                if (newName != null)
                {
                    newName.Error = null;
                }
            }
        }
    }

    /// <summary>Cột của RecordList: tiêu đề, độ rộng (96 DPI), canh lề và chữ của từng bản ghi.</summary>
    internal sealed class Column<T>
    {
        public Column(string header, int width, Func<T, string> text, HorizontalAlignment align = HorizontalAlignment.Left)
        {
            Header = header;
            Width = width;
            Text = text;
            Align = align;
        }

        public string Header { get; }
        public int Width { get; }
        public Func<T, string> Text { get; }
        public HorizontalAlignment Align { get; }
    }

    /// <summary>
    /// Danh sách bảng (ListView ảo): chỉ dựng các dòng đang hiện, chạy được với hàng chục nghìn bản ghi. Giữ
    /// dòng đang chọn theo khóa khi nạp lại. Enter/nháy đúp = mở; phím Delete = xóa.
    /// </summary>
    internal sealed class RecordList<T> : ListView where T : class
    {
        private readonly List<Column<T>> columns;
        private readonly Func<T, string> key;
        private List<T> items = new List<T>();

        public RecordList(Func<T, string> key, params Column<T>[] columns)
        {
            this.key = key;
            this.columns = columns.ToList();
            View = View.Details;
            FullRowSelect = true;
            GridLines = true;
            HideSelection = false;
            MultiSelect = false;
            VirtualMode = true;
            Font = Ux.Font;
            foreach (var c in columns)
            {
                Columns.Add(c.Header, Ux.Px(c.Width), c.Align);
            }
            RetrieveVirtualItem += (_, e) =>
            {
                var item = items[e.ItemIndex];
                var row = new ListViewItem(this.columns[0].Text(item)) { UseItemStyleForSubItems = true };
                for (var i = 1; i < this.columns.Count; i++)
                {
                    row.SubItems.Add(this.columns[i].Text(item));
                }
                var color = RowColor?.Invoke(item);
                if (color != null)
                {
                    row.ForeColor = color.Value;
                }
                e.Item = row;
            };
            KeyDown += (_, e) =>
            {
                if (e.KeyCode == Keys.Delete && Selected != null)
                {
                    DeleteRequested?.Invoke();
                    e.Handled = true;
                }
            };
        }

        public Func<T, Color?>? RowColor { get; set; }

        public event Action? DeleteRequested;

        public IReadOnlyList<T> Records => items;

        public T? Selected => SelectedIndices.Count > 0 && SelectedIndices[0] < items.Count ? items[SelectedIndices[0]] : null;

        public void SetItems(IEnumerable<T> list)
        {
            var keep = Selected == null ? null : key(Selected);
            SelectedIndices.Clear();
            items = list.ToList();
            VirtualListSize = items.Count;
            Invalidate();
            if (keep != null)
            {
                Select(keep);
            }
            else
            {
                OnSelectedIndexChanged(EventArgs.Empty);
            }
        }

        public void Select(string id)
        {
            var index = items.FindIndex(i => key(i) == id);
            SelectedIndices.Clear();
            if (index >= 0)
            {
                SelectedIndices.Add(index);
                EnsureVisible(index);
            }
            OnSelectedIndexChanged(EventArgs.Empty);
        }
    }
}
