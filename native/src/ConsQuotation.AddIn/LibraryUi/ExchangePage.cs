using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using ConsQuotation.Core.Exchange;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Storage;
using ConsQuotation.Excel;
using ConsQuotation.Ui;

namespace ConsQuotation.LibraryUi
{
    /// <summary>
    /// Thẻ Nhập/Xuất (ExchangePanel, ImportSection, ImportReview của bản web): sao lưu .json, xuất workbook, file
    /// mẫu; nhập từ .json, CSV, sheet hoặc Excel Table của workbook đang mở. Luôn xem trước, chỉ ghi khi xác nhận.
    /// </summary>
    internal sealed class ExchangePage : LibraryPage
    {
        private const int MaxFileMb = 20;
        /// <summary>Đọc thêm vài dòng ngoài giới hạn để còn chỗ cho dòng tiêu đề/ghi chú phía trên.</summary>
        private const int SheetReadMargin = 50;

        private readonly Label backupNotice;
        private readonly TableLayoutPanel import;
        private readonly Control content;
        private bool busy;
        private WorkbookInfo? workbook;
        private bool workbookRequested;

        public ExchangePage(LibrarySession session) : base(session)
        {
            // Hai cột: sao lưu/xuất hẹp bên trái, nhập bên phải (có thanh cuộn riêng) để bước xem trước không bị
            // đẩy xuống dưới.
            var columns = new TableLayoutPanel { ColumnCount = 2, Margin = new Padding(0) };
            columns.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, Ux.Px(320)));
            columns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            columns.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            var backup = new GroupBox { Text = XS.BackupTitle, Dock = DockStyle.Fill, Padding = new Padding(Ux.Px(8)) };
            var backupStack = Ux.Stack();
            backupStack.Dock = DockStyle.Top;
            backupStack.Controls.Add(Ux.Text(XS.BackupDescription));
            backupNotice = Ux.Notice("", Ux.SuccessColor);
            backupNotice.Visible = false;
            backupStack.Controls.Add(backupNotice);
            JsonButton = Ux.Button(XS.Json, async (_, __) => await Exclusive(SaveJson));
            WorkbookButton = Ux.Button(XS.Workbook, async (_, __) => await Exclusive(() => ExportWorkbook(empty: false)));
            TemplateButton = Ux.Button(XS.Template, async (_, __) => await Exclusive(() => ExportWorkbook(empty: true)));
            backupStack.Controls.Add(Action(JsonButton, XS.JsonHint));
            backupStack.Controls.Add(Action(WorkbookButton, XS.WorkbookHint));
            backupStack.Controls.Add(Action(TemplateButton, XS.TemplateHint));
            backup.Controls.Add(backupStack);
            columns.Controls.Add(backup, 0, 0);

            var importBox = new GroupBox { Text = XS.ImportTitle, Dock = DockStyle.Fill, Padding = new Padding(Ux.Px(8)) };
            var scroller = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
            import = Ux.Stack();
            import.Dock = DockStyle.Top;
            scroller.Controls.Add(import);
            importBox.Controls.Add(scroller);
            columns.Controls.Add(importBox, 1, 0);
            Ux.AddFill(Root, columns);
            content = columns;
            ShowSource();
            VisibleChanged += async (_, __) =>
            {
                // Chỉ hỏi Excel khi người dùng mở thẻ này lần đầu.
                if (Visible && !workbookRequested && Step == ImportStep.Source)
                {
                    await LoadWorkbook();
                }
            };
        }

        public Button JsonButton { get; }
        public Button WorkbookButton { get; }
        public Button TemplateButton { get; }
        public string BackupNoticeText => backupNotice.Text;

        public enum ImportStep
        {
            Source,
            Table,
            Multi,
            Done,
        }

        public ImportStep Step { get; private set; }
        /// <summary>Lỗi của bước nhập đang hiện (đọc nguồn, ghi thư viện); "" = không có.</summary>
        public string ImportError { get; private set; } = "";
        public ImportReviewPanel? Review { get; private set; }
        public TableStepPanel? TableStep { get; private set; }

        public override void RefreshView()
        {
            Review?.LibraryChanged();
        }

        private static Control Action(Button button, string hint)
        {
            var stack = Ux.Stack();
            stack.Controls.Add(button);
            stack.Controls.Add(Ux.Text(hint, color: SystemColors.GrayText));
            stack.Anchor = AnchorStyles.Left | AnchorStyles.Right;
            return stack;
        }

        /// <summary>Không cho chạy hai thao tác cùng lúc (bấm đúp, bấm nút khác khi đang đọc Excel).</summary>
        private async Task Exclusive(Func<Task> task)
        {
            if (busy)
            {
                return;
            }
            busy = true;
            UseWaitCursor = true;
            // Làm mờ các nút để người dùng thấy đang bận (bấm lúc này sẽ không có tác dụng).
            content.Enabled = false;
            try
            {
                await task();
            }
            finally
            {
                busy = false;
                UseWaitCursor = false;
                content.Enabled = true;
            }
        }

        private void ShowBackupNotice(string text, bool error)
        {
            backupNotice.ForeColor = error ? Ux.ErrorColor : Ux.SuccessColor;
            Ux.Show(backupNotice, text);
        }

        private static BackupMeta Meta(LibrarySession session, DateTime utc) => new BackupMeta
        {
            ExportedAt = utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
            AppVersion = AppInfo.Version,
            LibraryName = session.Service.LibraryName(),
        };

        private static string Downloads => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");

        public Task SaveJson()
        {
            var saved = WriteJsonBackup(Session, this);
            if (saved.Error != null)
            {
                ShowBackupNotice(saved.Error, error: true);
            }
            else if (saved.Done != null)
            {
                ShowBackupNotice(saved.Done, error: false);
            }
            return Task.CompletedTask;
        }

        /// <summary>
        /// Đọc lại thư viện từ file, ghi .json vào nơi người dùng chọn và ghi mốc sao lưu. Trả về câu báo xong hoặc
        /// câu báo lỗi; người dùng hủy thì cả hai đều null. Thẻ Bản quyền cũng dùng khi hết hạn dùng thử.
        /// </summary>
        internal static (string? Done, string? Error) WriteJsonBackup(LibrarySession session, IWin32Window owner)
        {
            try
            {
                var path = session.Prompts.SaveFile(owner, Backup.BackupFileName(session.Now(), "json"), XS.JsonFilter, Downloads);
                if (path == null)
                {
                    return (null, null);
                }
                var now = DateTime.UtcNow;
                var current = session.Service.Load();
                File.WriteAllText(path, Backup.ToBackupJson(current, Meta(session, now)), new UTF8Encoding(false));
                session.Service.RecordBackup(now);
                session.Reload();
                return (XS.JsonDone(path), null);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is LibraryStorageException)
            {
                return (null, $"{XS.Failed}: {ex.Message}");
            }
        }

        public async Task ExportWorkbook(bool empty)
        {
            try
            {
                var now = DateTime.UtcNow;
                var data = empty ? new LibrarySnapshot() : Session.Service.Load();
                var bytes = Xlsx.Build(Backup.ExportSheets(data, Meta(Session, now)));
                await Session.Workbooks.OpenNewWorkbookAsync(bytes, empty ? "MauThuVien" : "ThuVien");
                if (!empty)
                {
                    Session.Service.RecordBackup(now);
                    Session.Reload();
                }
                ShowBackupNotice(empty ? XS.TemplateDone : XS.WorkbookDone, error: false);
            }
            catch (Exception ex)
            {
                ShowBackupNotice($"{XS.Failed}: {ex.Message}", error: true);
            }
        }

        // ---------- Nhập ----------

        private void SetImport(params Control[] controls)
        {
            import.SuspendLayout();
            foreach (Control c in import.Controls.Cast<Control>().ToList())
            {
                import.Controls.Remove(c);
                c.Dispose();
            }
            Review = null;
            TableStep = null;
            if (ImportError != "")
            {
                import.Controls.Add(Ux.Notice(ImportError, Ux.ErrorColor));
            }
            import.Controls.AddRange(controls);
            import.ResumeLayout();
        }

        private void SetError(string message)
        {
            ImportError = message;
            if (Step == ImportStep.Source)
            {
                ShowSource();
            }
        }

        public void ShowSource()
        {
            Step = ImportStep.Source;
            var controls = new List<Control>
            {
                Ux.Text(XS.ImportDescription),
                Ux.ButtonRow(Ux.Button(XS.ChooseFile, async (_, __) => await Exclusive(ChooseFile))),
                Ux.Text(XS.FileHint, color: SystemColors.GrayText),
                Ux.Text(XS.FromWorkbook, Ux.Bold),
            };
            if (!workbookRequested)
            {
                controls.Add(Ux.Text(XS.Reading, color: SystemColors.GrayText));
            }
            else if (workbook != null)
            {
                controls.Add(Ux.Text(XS.WorkbookLabel(workbook.WorkbookName)));
                if (workbook.Backup != null)
                {
                    var exportedAt = workbook.Backup.ExportedAt == "" ? "" : Dates.FormatDateTime(workbook.Backup.ExportedAt);
                    controls.Add(Ux.Notice(XS.BackupDetected(exportedAt, workbook.Backup.LibraryName), SystemColors.ControlText));
                    controls.Add(Ux.ButtonRow(Ux.Button(XS.ReadBackup, async (_, __) => await Exclusive(ReadBackupWorkbook))));
                }
                var sheets = Ux.Combo(320);
                sheets.Items.AddRange(workbook.Sheets.Select(s => (object)new Choice(s.Name, XS.SheetSize(s.Name, s.RowCount, s.ColumnCount))).ToArray());
                Ux.SelectId(sheets, workbook.ActiveSheet);
                SheetChoice = sheets;
                controls.Add(Ux.ButtonRow(new FieldBox(XS.Sheet, sheets) { Dock = DockStyle.None },
                    Ux.Button(XS.ReadSheet, async (_, __) => await Exclusive(() => ReadSheet(Ux.SelectedId(sheets))))));
                if (workbook.Tables.Count > 0)
                {
                    var tables = Ux.Combo(320);
                    tables.Items.AddRange(workbook.Tables.Select(t => (object)new Choice(t.Name, XS.TableOption(t.Name, t.SheetName, t.RowCount))).ToArray());
                    tables.SelectedIndex = 0;
                    controls.Add(Ux.ButtonRow(new FieldBox(XS.Table, tables, hint: XS.TableHint) { Dock = DockStyle.None },
                        Ux.Button(XS.ReadTable, async (_, __) => await Exclusive(() => ReadTable(Ux.SelectedId(tables))))));
                }
            }
            controls.Add(Ux.ButtonRow(Ux.Button(XS.RefreshSheets, async (_, __) => await Exclusive(LoadWorkbook))));
            SetImport(controls.ToArray());
        }

        public ComboBox? SheetChoice { get; private set; }

        public async Task LoadWorkbook()
        {
            workbookRequested = true;
            try
            {
                workbook = await Session.Workbooks.ListAsync();
                ImportError = "";
            }
            catch (Exception ex)
            {
                workbook = null;
                ImportError = ex is WorkbookException ? ex.Message : $"{XS.ReadFailed}: {ex.Message}";
            }
            if (Step == ImportStep.Source && !IsDisposed)
            {
                ShowSource();
            }
        }

        private Task ChooseFile()
        {
            var path = Session.Prompts.OpenFile(this, XS.OpenFilter);
            if (path != null)
            {
                ReadFile(path);
            }
            return Task.CompletedTask;
        }

        /// <summary>Đọc file .json hoặc .csv người dùng chọn (onFileChosen của bản web).</summary>
        public void ReadFile(string path)
        {
            ImportError = "";
            var name = Path.GetFileName(path);
            var lower = name.ToLowerInvariant();
            if (lower.EndsWith(".xlsx") || lower.EndsWith(".xls") || lower.EndsWith(".xlsm"))
            {
                SetError(XS.XlsxNotSupported);
                return;
            }
            byte[] bytes;
            try
            {
                if (new FileInfo(path).Length > MaxFileMb * 1024L * 1024L)
                {
                    SetError(XS.TooBig(MaxFileMb));
                    return;
                }
                bytes = File.ReadAllBytes(path);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                // File bị xóa/di chuyển sau khi chọn, hoặc đang bị ứng dụng khác khóa.
                SetError(XS.FileUnreadable);
                return;
            }
            var decoded = Csv.DecodeTextFile(bytes);
            if (!decoded.Ok)
            {
                SetError(decoded.Message);
                return;
            }
            var text = decoded.Text!;
            if (text.Trim() == "")
            {
                SetError(XS.EmptySource);
                return;
            }
            if (lower.EndsWith(".json") || text.TrimStart().StartsWith("{"))
            {
                var backup = Backup.ParseBackupJson(text);
                if (!backup.Ok)
                {
                    SetError(backup.Message!);
                    return;
                }
                if (backup.Datasets.Count == 0)
                {
                    SetError(XS.EmptySource);
                    return;
                }
                ShowMulti(XS.BackupFileLabel(name, backup.Meta.LibraryName), backup.Datasets);
                return;
            }
            var table = SourceTable.FromCsv($"File \"{name}\"", Csv.Parse(text));
            if (Source.DetectHeaderRow(table) < 0)
            {
                SetError(XS.EmptySource);
                return;
            }
            ShowTable(table);
        }

        internal async Task ReadSheet(string sheetName)
        {
            if (workbook == null || sheetName == "")
            {
                return;
            }
            ImportError = "";
            try
            {
                var read = await Session.Workbooks.ReadSheetAsync(workbook.WorkbookName, sheetName, Source.MaxImportRows + SheetReadMargin);
                AcceptRead(read, Source.MaxImportRows + SheetReadMargin);
            }
            catch (Exception ex)
            {
                SetError(ex is WorkbookException ? ex.Message : $"{XS.ReadFailed}: {ex.Message}");
            }
        }

        internal async Task ReadTable(string tableName)
        {
            if (workbook == null || tableName == "")
            {
                return;
            }
            ImportError = "";
            try
            {
                var read = await Session.Workbooks.ReadTableAsync(workbook.WorkbookName, tableName, Source.MaxImportRows + SheetReadMargin);
                AcceptRead(read, Source.MaxImportRows + SheetReadMargin);
            }
            catch (Exception ex)
            {
                SetError(ex is WorkbookException ? ex.Message : $"{XS.ReadFailed}: {ex.Message}");
            }
        }

        private void AcceptRead(SheetRead read, int limit)
        {
            if (read.TotalRows > limit)
            {
                SetError(XS.SheetTooLarge(read.TotalRows, Source.MaxImportRows));
                return;
            }
            if (Source.DetectHeaderRow(read.Table) < 0)
            {
                SetError(XS.EmptySource);
                return;
            }
            ShowTable(read.Table);
        }

        internal async Task ReadBackupWorkbook()
        {
            if (workbook?.Backup == null)
            {
                return;
            }
            ImportError = "";
            try
            {
                var datasets = new List<ImportDataset>();
                // Bản xuất schema 1–2: sheet "Định mức" là dòng định mức kiểu cũ (ADR-0013).
                foreach (var (kind, sheetName) in Backup.BackupSheetKinds(workbook.Backup.SchemaVersion))
                {
                    if (!workbook.Sheets.Any(s => s.Name == sheetName))
                    {
                        continue;
                    }
                    var read = await Session.Workbooks.ReadSheetAsync(workbook.WorkbookName, sheetName, Source.MaxImportRows + 1);
                    var dataset = Backup.DatasetFromBackupSheet(kind, read.Table);
                    if (read.TotalRows > Source.MaxImportRows + 1)
                    {
                        dataset.Problems.Add(XS.SheetTooLarge(read.TotalRows, Source.MaxImportRows));
                    }
                    datasets.Add(dataset);
                }
                if (datasets.All(d => d.Rows.Count == 0))
                {
                    SetError(XS.EmptySource);
                    return;
                }
                ShowMulti("Workbook", datasets.Where(d => d.Rows.Count > 0).ToList());
            }
            catch (Exception ex)
            {
                SetError(ex is WorkbookException ? ex.Message : $"{XS.ReadFailed}: {ex.Message}");
            }
        }

        private void ShowMulti(string label, List<ImportDataset> datasets)
        {
            Step = ImportStep.Multi;
            ImportError = "";
            var review = new ImportReviewPanel(Session, datasets, ResetImport, ShowDone);
            SetImport(Ux.Text(XS.SourceRead(label, datasets.Sum(d => d.Rows.Count))), review);
            Review = review;
        }

        private void ShowTable(SourceTable table)
        {
            Step = ImportStep.Table;
            ImportError = "";
            var step = new TableStepPanel(Session, table, ResetImport, ShowDone);
            SetImport(step);
            TableStep = step;
            Review = step.Review;
            step.ReviewChanged += () => Review = step.Review;
        }

        private void ShowDone(ImportReviewPanel.Report report)
        {
            Step = ImportStep.Done;
            ImportError = "";
            SetImport(
                Ux.Notice(XS.Done(report.Added, report.Updated), Ux.SuccessColor),
                ImportReviewPanel.Details(report.Analysis, done: true),
                Ux.ButtonRow(Ux.Button(XS.Another, (_, __) => ResetImport())));
        }

        public void ResetImport()
        {
            ImportError = "";
            workbook = null;
            workbookRequested = false;
            ShowSource();
            if (Visible)
            {
                _ = Exclusive(LoadWorkbook);
            }
        }
    }

    /// <summary>Nhận diện dòng tiêu đề → chọn loại dữ liệu → map cột → xem trước → kiểm tra (TableStep của bản web).</summary>
    internal sealed class TableStepPanel : TableLayoutPanel
    {
        private const int PreviewRows = 5;

        private readonly LibrarySession session;
        private readonly SourceTable table;
        private readonly Action onCancel;
        private readonly Action<ImportReviewPanel.Report> onImported;
        private readonly TableLayoutPanel mappingHost;
        private readonly TableLayoutPanel resultHost;
        private readonly Label kindUnknown;
        private readonly Label sourceRead;
        private int headerIndex;
        private DatasetKind? kind;
        private Dictionary<string, int?> mapping = new Dictionary<string, int?>();

        public TableStepPanel(LibrarySession session, SourceTable table, Action onCancel, Action<ImportReviewPanel.Report> onImported)
        {
            this.session = session;
            this.table = table;
            this.onCancel = onCancel;
            this.onImported = onImported;
            ColumnCount = 1;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Dock = DockStyle.Top;
            Margin = new Padding(0);
            ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Ux.KeepOrder(this);

            headerIndex = Source.DetectHeaderRow(table);
            kind = Source.GuessKind(Headers());
            mapping = kind == null ? new Dictionary<string, int?>() : Source.AutoMap(kind.Value, Headers());

            sourceRead = Ux.Text("");
            Controls.Add(sourceRead);
            HeaderRow = new TextBox { Width = Ux.Px(80), Text = (table.FirstRowNumber + headerIndex).ToString(CultureInfo.InvariantCulture) };
            HeaderRow.TextChanged += (_, __) => ChangeHeader(HeaderRow.Text);
            Kind = Ux.Combo(220);
            Kind.Items.Add(new Choice("", XS.ChooseKind));
            foreach (var k in ExchangeSchema.Kinds)
            {
                Kind.Items.Add(new Choice(k.ToString(), XS.Kinds[k]));
            }
            Ux.SelectId(Kind, kind?.ToString() ?? "");
            Kind.SelectedIndexChanged += (_, __) =>
            {
                var id = Ux.SelectedId(Kind);
                kind = id == "" ? (DatasetKind?)null : (DatasetKind)Enum.Parse(typeof(DatasetKind), id);
                mapping = kind == null ? new Dictionary<string, int?>() : Source.AutoMap(kind.Value, Headers());
                BuildMapping();
            };
            Controls.Add(Ux.ButtonRow(
                new FieldBox(XS.HeaderRow, HeaderRow, hint: XS.HeaderRowHint) { Dock = DockStyle.None, Width = Ux.Px(300) },
                new FieldBox(XS.Kind, Kind) { Dock = DockStyle.None }));
            kindUnknown = Ux.Notice(XS.KindUnknown, Ux.WarningColor);
            Controls.Add(kindUnknown);
            mappingHost = Ux.Stack();
            mappingHost.Dock = DockStyle.Top;
            Controls.Add(mappingHost);
            resultHost = Ux.Stack();
            resultHost.Dock = DockStyle.Top;
            Controls.Add(resultHost);
            BuildMapping();
        }

        public TextBox HeaderRow { get; }
        public ComboBox Kind { get; }
        public Dictionary<string, ComboBox> MappingCombos { get; } = new Dictionary<string, ComboBox>();
        public ImportReviewPanel? Review { get; private set; }
        public ImportDataset? Dataset { get; private set; }
        public ListView? Preview { get; private set; }
        public event Action? ReviewChanged;

        private List<string> Headers() => headerIndex >= 0 ? Source.HeaderTexts(table, headerIndex) : new List<string>();

        private void ChangeHeader(string text)
        {
            if (!int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number))
            {
                return;
            }
            var index = number - table.FirstRowNumber;
            if (index < 0 || index >= table.Rows.Count)
            {
                return;
            }
            headerIndex = index;
            var headers = Headers();
            kind ??= Source.GuessKind(headers);
            mapping = kind == null ? new Dictionary<string, int?>() : Source.AutoMap(kind.Value, headers);
            Ux.SelectId(Kind, kind?.ToString() ?? "");
            BuildMapping();
        }

        private string ColumnName(int c, IReadOnlyList<string> headers) =>
            $"{Source.ColumnToLetters(table.FirstColumnIndex + c)}{(c < headers.Count && headers[c] != "" ? $" · {headers[c]}" : "")}";

        private void BuildMapping()
        {
            sourceRead.Text = XS.SourceRead(table.Label, Math.Max(0, table.Rows.Count - headerIndex - 1));
            kindUnknown.Visible = kind == null;
            mappingHost.SuspendLayout();
            foreach (Control c in mappingHost.Controls.Cast<Control>().ToList())
            {
                mappingHost.Controls.Remove(c);
                c.Dispose();
            }
            MappingCombos.Clear();
            if (kind != null)
            {
                mappingHost.Controls.Add(Ux.Text(XS.MappingTitle, Ux.Bold));
                var grid = new TableLayoutPanel { ColumnCount = 2, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Margin = new Padding(0) };
                grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
                grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
                var headers = Headers();
                var columnCount = table.Rows.Count == 0 ? 0 : table.Rows.Max(r => r.Count);
                foreach (var field in ExchangeSchema.Datasets[kind.Value].Fields)
                {
                    var label = Ux.Text(field.Required ? field.Header + " *" : field.Header);
                    label.Anchor = AnchorStyles.Left;
                    var combo = Ux.Combo(260);
                    combo.Items.Add(new Choice("", XS.NotMapped));
                    for (var c = 0; c < columnCount; c++)
                    {
                        combo.Items.Add(new Choice(c.ToString(CultureInfo.InvariantCulture), ColumnName(c, headers)));
                    }
                    Ux.SelectId(combo, mapping.TryGetValue(field.Key, out var col) && col != null ? col.Value.ToString(CultureInfo.InvariantCulture) : "");
                    var key = field.Key;
                    combo.SelectedIndexChanged += (_, __) =>
                    {
                        var id = Ux.SelectedId(combo);
                        mapping = new Dictionary<string, int?>(mapping) { [key] = id == "" ? (int?)null : int.Parse(id, CultureInfo.InvariantCulture) };
                        BuildResult();
                    };
                    MappingCombos[key] = combo;
                    grid.Controls.Add(label);
                    grid.Controls.Add(combo);
                }
                mappingHost.Controls.Add(grid);
            }
            mappingHost.ResumeLayout();
            BuildResult();
        }

        /// <summary>Xem trước và bước kiểm tra theo map cột hiện tại.</summary>
        private void BuildResult()
        {
            resultHost.SuspendLayout();
            foreach (Control c in resultHost.Controls.Cast<Control>().ToList())
            {
                resultHost.Controls.Remove(c);
                c.Dispose();
            }
            Dataset = kind == null ? null : Source.DatasetFromTable(table, headerIndex, kind.Value, mapping);
            Preview = null;
            Review = null;
            if (Dataset != null && Dataset.MappedFields.Count > 0)
            {
                resultHost.Controls.Add(Ux.Text(XS.Preview, Ux.Bold));
                var fields = ExchangeSchema.Datasets[Dataset.Kind].Fields;
                var preview = new ListView { View = View.Details, GridLines = true, FullRowSelect = true, Height = Ux.Px(130), Dock = DockStyle.Top, HeaderStyle = ColumnHeaderStyle.Nonclickable };
                preview.Columns.Add("", Ux.Px(70));
                foreach (var key in Dataset.MappedFields)
                {
                    preview.Columns.Add(fields.First(f => f.Key == key).Header, Ux.Px(120));
                }
                foreach (var row in Dataset.Rows.Take(PreviewRows))
                {
                    var item = new ListViewItem(row.RowLabel);
                    foreach (var key in Dataset.MappedFields)
                    {
                        var cell = row.Cell(key);
                        item.SubItems.Add(cell?.Date ?? Cells.ParseText(cell));
                    }
                    preview.Items.Add(item);
                }
                resultHost.Controls.Add(preview);
                Preview = preview;
            }
            if (Dataset != null)
            {
                Review = new ImportReviewPanel(session, new List<ImportDataset> { Dataset }, onCancel, onImported);
                resultHost.Controls.Add(Review);
            }
            else
            {
                resultHost.Controls.Add(Ux.ButtonRow(Ux.Button(XS.Cancel, (_, __) => onCancel())));
            }
            resultHost.ResumeLayout();
            ReviewChanged?.Invoke();
        }
    }

    /// <summary>
    /// Kết quả kiểm tra → chọn cách xử lý trùng → xác nhận (ImportReview của bản web). Trước khi ghi, kiểm tra lại
    /// với thư viện mới đọc: khác kết quả đã hiển thị thì dừng.
    /// </summary>
    internal sealed class ImportReviewPanel : TableLayoutPanel
    {
        internal sealed class Report
        {
            public ImportAnalysis Analysis { get; set; } = new ImportAnalysis();
            public int Added { get; set; }
            public int Updated { get; set; }
        }

        private readonly LibrarySession session;
        private readonly IReadOnlyList<ImportDataset> datasets;
        private readonly Action<Report> onImported;
        private readonly TableLayoutPanel host;
        private readonly RadioButton skip;
        private readonly RadioButton update;
        private LibrarySnapshot baseLibrary;
        private string error = "";

        public ImportReviewPanel(LibrarySession session, IReadOnlyList<ImportDataset> datasets, Action onCancel, Action<Report> onImported)
        {
            this.session = session;
            this.datasets = datasets;
            this.onImported = onImported;
            baseLibrary = session.Library;
            ColumnCount = 1;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Dock = DockStyle.Top;
            Margin = new Padding(0);
            ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Ux.KeepOrder(this);
            Controls.Add(Ux.Text(XS.SummaryTitle, Ux.Bold));
            host = Ux.Stack();
            host.Dock = DockStyle.Top;
            Controls.Add(host);
            skip = new RadioButton { Text = XS.Skip, AutoSize = true, Checked = true };
            update = new RadioButton { Text = XS.Update, AutoSize = true };
            skip.CheckedChanged += (_, __) =>
            {
                if (skip.Checked)
                {
                    Rebuild();
                }
            };
            update.CheckedChanged += (_, __) =>
            {
                if (update.Checked)
                {
                    Rebuild();
                }
            };
            var modes = Ux.Stack();
            modes.Controls.Add(skip);
            modes.Controls.Add(update);
            ModeBox = new FieldBox(XS.DuplicateMode, modes, hint: XS.UpdateHint);
            Controls.Add(ModeBox);
            SubmitButton = Ux.Button("", (_, __) => Submit());
            CancelButton = Ux.Button(XS.Cancel, (_, __) => onCancel());
            Controls.Add(Ux.ButtonRow(SubmitButton, CancelButton));
            Rebuild();
        }

        public FieldBox ModeBox { get; }
        public Button SubmitButton { get; }
        public Button CancelButton { get; }
        public RadioButton UpdateMode => update;
        public ImportAnalysis Analysis { get; private set; } = new ImportAnalysis();
        public string Error => error;

        private DuplicateMode Mode => update.Checked ? DuplicateMode.Update : DuplicateMode.Skip;

        private ImportAnalysis Analyze(LibrarySnapshot library) => session.Service.AnalyzeImport(datasets, library, Mode);

        /// <summary>Thư viện vừa đổi (cửa sổ này hoặc cửa sổ Excel khác): phân tích lại trên bản mới.</summary>
        public void LibraryChanged()
        {
            baseLibrary = session.Library;
            Rebuild();
        }

        private static (int Total, int Added, int Updated, int Duplicates, int Errors) Totals(ImportAnalysis analysis) => (
            analysis.Summaries.Sum(s => s.Total),
            analysis.Summaries.Sum(s => s.Added),
            analysis.Summaries.Sum(s => s.Updated),
            analysis.Summaries.Sum(s => s.Duplicates),
            analysis.Summaries.Sum(s => s.Errors));

        /// <summary>Bảng tổng hợp + danh sách lỗi theo dòng/cột (dùng cả trước khi nhập và trong báo cáo).</summary>
        public static Control Details(ImportAnalysis analysis, bool done)
        {
            var stack = Ux.Stack();
            stack.Dock = DockStyle.Top;
            var summary = new ListView { View = View.Details, GridLines = true, FullRowSelect = true, Dock = DockStyle.Top, HeaderStyle = ColumnHeaderStyle.Nonclickable };
            summary.Columns.Add(XS.ColSource, Ux.Px(220));
            summary.Columns.Add(XS.ColKind, Ux.Px(140));
            foreach (var header in new[] { XS.ColTotal, XS.ColAdded, XS.ColDuplicates, XS.ColErrors, XS.ColEmpty })
            {
                summary.Columns.Add(header, Ux.Px(70), HorizontalAlignment.Right);
            }
            foreach (var s in analysis.Summaries)
            {
                summary.Items.Add(new ListViewItem(new[]
                {
                    s.SourceLabel, XS.Kinds[s.Kind], s.Total.ToString(), s.Added.ToString(), s.Duplicates.ToString(), s.Errors.ToString(), s.Empty.ToString(),
                }));
            }
            summary.Height = Ux.Px(28) + Ux.Px(19) * Math.Max(1, analysis.Summaries.Count);
            stack.Controls.Add(summary);
            if (analysis.Issues.Count > 0)
            {
                var errors = Totals(analysis).Errors;
                stack.Controls.Add(Ux.Text(done ? XS.IssuesSkipped(errors) : XS.IssuesTitle(errors), Ux.Bold, Ux.WarningColor));
                var lines = analysis.Issues.Take(MaxIssuesShown).Select(i =>
                    $"{string.Join(", ", new[] { i.SourceLabel, i.RowLabel, i.ColumnLabel }.Where(x => !string.IsNullOrEmpty(x)))}: {i.Message}").ToList();
                if (analysis.Issues.Count > MaxIssuesShown)
                {
                    lines.Add(XS.MoreIssues(analysis.Issues.Count - MaxIssuesShown));
                }
                stack.Controls.Add(new TextBox
                {
                    Multiline = true,
                    ReadOnly = true,
                    ScrollBars = ScrollBars.Vertical,
                    Dock = DockStyle.Top,
                    Height = Ux.Px(110),
                    Text = string.Join(Environment.NewLine, lines),
                });
            }
            return stack;
        }

        private const int MaxIssuesShown = 100;

        private void Rebuild()
        {
            Analysis = Analyze(baseLibrary);
            var t = Totals(Analysis);
            var changes = Analysis.ChangeCount;
            var blocked = Analysis.Problems.Count > 0;
            host.SuspendLayout();
            foreach (Control c in host.Controls.Cast<Control>().ToList())
            {
                host.Controls.Remove(c);
                c.Dispose();
            }
            if (blocked)
            {
                host.Controls.Add(Ux.Notice($"{XS.ProblemsTitle}:\n{string.Join("\n", Analysis.Problems.Select(p => "• " + p))}", Ux.ErrorColor));
            }
            else
            {
                host.Controls.Add(Details(Analysis, done: false));
                var created = Analysis.CreatedFromReferences;
                if (created.Categories.Count > 0 || created.Suppliers.Count > 0)
                {
                    host.Controls.Add(Ux.Notice(XS.CreatedRefs(created.Categories, created.Suppliers), SystemColors.ControlText));
                }
                if (t.Total > Source.LargeImportRows)
                {
                    host.Controls.Add(Ux.Text(XS.LargeWarning(t.Total)));
                }
            }
            if (error != "")
            {
                host.Controls.Add(Ux.Notice(error, Ux.ErrorColor));
            }
            if (!blocked && changes == 0)
            {
                host.Controls.Add(Ux.Text(XS.NothingToImport));
            }
            host.ResumeLayout();
            ModeBox.Visible = !blocked;
            SubmitButton.Text = XS.Submit(changes);
            SubmitButton.Enabled = !blocked && changes > 0;
        }

        public void Submit()
        {
            var t = Totals(Analysis);
            var created = Analysis.CreatedFromReferences;
            if (!session.Prompts.Confirm(this, XS.ConfirmTitle,
                XS.ConfirmBody(t.Added, t.Updated, t.Duplicates - t.Updated, t.Errors, created.Categories.Count, created.Suppliers.Count),
                XS.Confirm, XS.Cancel))
            {
                return;
            }
            error = "";
            Cursor.Current = Cursors.WaitCursor;
            try
            {
                var fresh = session.Service.Load();
                var recheck = Analyze(fresh);
                if (Json.Serialize(new object[] { recheck.Summaries, recheck.CreatedFromReferences }, indented: false) !=
                    Json.Serialize(new object[] { Analysis.Summaries, Analysis.CreatedFromReferences }, indented: false))
                {
                    baseLibrary = fresh;
                    error = XS.ChangedMeanwhile;
                    Rebuild();
                    return;
                }
                session.Service.ApplyImport(recheck.Changes);
                var after = Totals(recheck);
                // Chuyển sang báo cáo trước khi đọc lại thư viện để bảng kiểm tra này không phân tích lại vô ích.
                onImported(new Report { Analysis = recheck, Added = after.Added, Updated = after.Updated });
                session.Reload();
            }
            catch (Exception ex) when (ex is LibraryStorageException || ex is IOException || ex is InvalidOperationException)
            {
                error = $"{XS.ImportFailed} {ex.Message}";
                Rebuild();
            }
            finally
            {
                Cursor.Current = Cursors.Default;
            }
        }
    }
}
