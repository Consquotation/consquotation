using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Quotation;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Excel
{
    /// <summary>
    /// Đọc/ghi báo giá qua COM, chuyển từ excelWorkbookGateway.ts, excelPricingGateway.ts, excelQuotationGateway.ts.
    /// Mỗi phương thức chạy trọn trong một lượt macro trên luồng chính của Excel: kiểm tra lại vùng đích rồi ghi
    /// ngay trong lượt đó nên người dùng không xen vào giữa được.
    /// </summary>
    public sealed partial class ExcelQuoteGateway : IQuoteGateway
    {
        private const int XlSrcRange = 1;
        private const int XlYes = 1;
        private const int XlShiftUp = -4162;
        private const int XlLeft = -4131;
        private const int XlCenter = -4108;
        private const int XlTop = -4160;
        private const int XlThin = 2;
        private const int XlContinuous = 1;
        private const int Gray = 0x808080;
        private const int HeaderFill = 0xF2E1D9; // #D9E1F2 theo thứ tự BGR của Excel.
        private const int SampleLimit = 5;
        private const string NewSheetFingerprint = "new-sheet";
        private const int DispUnknownName = unchecked((int)0x80020006);

        private sealed class InfoScan
        {
            public QuoteInfoRead Read { get; set; } = new QuoteInfoRead();
            public dynamic Sheet { get; set; } = null!;
        }

        private sealed class FoundRecord
        {
            public dynamic? Part { get; set; }
            public RecordRead Read { get; set; } = RecordRead.None();
        }

        private volatile string? targetWorkbook;
        private static bool formula2Supported = true;

        private struct Rect
        {
            public int Row;
            public int Column;
            public int Rows;
            public int Columns;

            public bool Contains(int row, int column) => row >= Row && row < Row + Rows && column >= Column && column < Column + Columns;

            public Rect? Intersect(Rect other)
            {
                var top = Math.Max(Row, other.Row);
                var left = Math.Max(Column, other.Column);
                var bottom = Math.Min(Row + Rows, other.Row + other.Rows);
                var right = Math.Min(Column + Columns, other.Column + other.Columns);
                return bottom > top && right > left ? new Rect { Row = top, Column = left, Rows = bottom - top, Columns = right - left } : (Rect?)null;
            }

            public string Address => Sheet.RangeAddress(Row, Column, Rows, Columns);
        }

        private static Rect RectOf(dynamic range) => new Rect
        {
            Row = (int)range.Row - 1,
            Column = (int)range.Column - 1,
            Rows = (int)range.Rows.Count,
            Columns = (int)range.Columns.Count,
        };

        /// <summary>Workbook báo giá đang làm việc: chốt ở lần liệt kê bảng gần nhất; người dùng có thể đã chuyển sang workbook khác.</summary>
        private dynamic Book(dynamic app)
        {
            var name = targetWorkbook;
            if (name == null)
            {
                dynamic? active = app.ActiveWorkbook;
                if (active == null)
                {
                    throw new WorkbookException("Chưa có workbook nào đang mở trong Excel.");
                }
                return active;
            }
            foreach (dynamic workbook in app.Workbooks)
            {
                if ((string)workbook.Name == name)
                {
                    return workbook;
                }
            }
            throw new WorkbookException($"Workbook \"{name}\" không còn mở. Bấm Làm mới rồi chọn lại.");
        }

        /// <summary>Workbook đang mở trên cùng: dùng cho lệnh từ cửa sổ Thư viện, vốn không gắn với bảng báo giá đang chọn.</summary>
        private static dynamic ActiveBook(dynamic app)
        {
            dynamic? active = app.ActiveWorkbook;
            if (active == null)
            {
                throw new WorkbookException("Chưa có workbook nào đang mở trong Excel.");
            }
            return active;
        }

        private static dynamic? FindSheet(dynamic book, string sheetName)
        {
            foreach (dynamic sheet in book.Worksheets)
            {
                if (string.Equals((string)sheet.Name, sheetName, StringComparison.OrdinalIgnoreCase))
                {
                    return sheet;
                }
            }
            return null;
        }

        private static dynamic? FindTable(dynamic book, string tableName)
        {
            foreach (dynamic sheet in book.Worksheets)
            {
                foreach (dynamic table in sheet.ListObjects)
                {
                    if (string.Equals((string)table.Name, tableName, StringComparison.OrdinalIgnoreCase))
                    {
                        return table;
                    }
                }
            }
            return null;
        }

        private static dynamic RequireTable(dynamic book, string tableName)
        {
            dynamic? table = FindTable(book, tableName);
            if (table == null)
            {
                throw new WorkbookException($"Không tìm thấy bảng \"{tableName}\". Bảng có thể vừa bị đổi tên hoặc xóa; bấm Làm mới rồi thử lại.");
            }
            return table;
        }

        private static dynamic At(dynamic sheet, int row, int column) => sheet.Cells[row + 1, column + 1];

        private static dynamic Area(dynamic sheet, int row, int column, int rows, int columns) =>
            sheet.Range[sheet.Cells[row + 1, column + 1], sheet.Cells[row + rows, column + columns]];

        /// <summary>Tắt vẽ lại màn hình trong lúc ghi nhiều ô.</summary>
        private static T Quiet<T>(object application, Func<T> work)
        {
            dynamic app = application;
            bool updating = app.ScreenUpdating;
            app.ScreenUpdating = false;
            try
            {
                return work();
            }
            finally
            {
                app.ScreenUpdating = updating;
            }
        }

        /// <summary>Bước phụ sau khi đã ghi xong (chuyển tới vùng vừa ghi): lỗi không được làm báo thất bại, kẻo người dùng bấm lại thành ghi trùng.</summary>
        private static void BestEffort(Action step)
        {
            try
            {
                step();
            }
            catch (COMException)
            {
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
            }
        }

        private static string ErrorText(int code)
        {
            switch (code)
            {
                case -2146826281:
                    return "#DIV/0!";
                case -2146826246:
                    return "#N/A";
                case -2146826259:
                    return "#NAME?";
                case -2146826288:
                    return "#NULL!";
                case -2146826252:
                    return "#NUM!";
                case -2146826265:
                    return "#REF!";
                case -2146826273:
                    return "#VALUE!";
                default:
                    return "#ERROR";
            }
        }

        /// <summary>Ô đọc từ Value2 đổi về dạng chung: "" khi trống, chữ "#N/A"… khi lỗi.</summary>
        private static object Value(object? raw) => raw == null ? "" : raw is int code ? ErrorText(code) : raw;

        private static string TypeOf(object? raw)
        {
            switch (raw)
            {
                case null:
                    return "Empty";
                case string s:
                    return s == "" ? "Empty" : "String";
                case double _:
                    return "Double";
                case bool _:
                    return "Boolean";
                case int _:
                    return "Error";
                default:
                    return "String";
            }
        }

        private static List<SheetRow> ReadRows(dynamic range, int rows, int columns)
        {
            object?[,] values = ExcelWorkbookGateway.AsArray(range.Value2, rows, columns);
            object?[,] formulas = ExcelWorkbookGateway.AsArray(range.Formula, rows, columns);
            var result = new List<SheetRow>(rows);
            for (var r = 0; r < rows; r++)
            {
                var rowValues = new object?[columns];
                var rowFormulas = new object?[columns];
                var rowTypes = new string[columns];
                for (var c = 0; c < columns; c++)
                {
                    rowValues[c] = Value(values[r, c]);
                    rowFormulas[c] = formulas[r, c] ?? "";
                    rowTypes[c] = TypeOf(values[r, c]);
                }
                result.Add(new SheetRow(rowValues, rowFormulas, rowTypes));
            }
            return result;
        }

        private static List<string> Headers(dynamic table)
        {
            dynamic? header = table.HeaderRowRange;
            if (header == null)
            {
                throw new WorkbookException($"Bảng \"{(string)table.Name}\" đang tắt dòng tiêu đề. Bật Header Row rồi thử lại.");
            }
            int count = header.Columns.Count;
            object?[,] values = ExcelWorkbookGateway.AsArray(header.Value2, 1, count);
            var list = new List<string>(count);
            for (var c = 0; c < count; c++)
            {
                list.Add(QuoteLineReader.Text(values[0, c]));
            }
            return list;
        }

        /// <summary>Vùng dữ liệu của bảng; null khi bảng không còn dòng nào (Excel chỉ còn dòng nhập mới).</summary>
        private static dynamic? Body(dynamic table) => (int)table.ListRows.Count == 0 ? null : table.DataBodyRange;

        private static TableSnapshot LoadSnapshot(dynamic table)
        {
            List<string> headers = Headers(table);
            dynamic header = table.HeaderRowRange;
            dynamic? body = Body(table);
            int rowCount = table!.ListRows.Count;
            var snapshot = new TableSnapshot
            {
                Name = table.Name,
                SheetName = table.Parent.Name,
                Headers = headers,
                FirstRowIndex = (int)header.Row,
                FirstColumnIndex = (int)header.Column - 1,
                Rows = body == null ? new List<SheetRow>() : ReadRows(body, rowCount, headers.Count),
            };
            if ((bool)table.ShowTotals)
            {
                snapshot.Totals = ReadRows(table.TotalsRowRange, 1, headers.Count)[0];
            }
            return snapshot;
        }

        private static OccupiedCells FindOccupied(object?[,] formulas, int rowIndex, int columnIndex, IReadOnlyList<Rect>? exclude = null)
        {
            var result = new OccupiedCells();
            for (var r = 0; r < formulas.GetLength(0); r++)
            {
                for (var c = 0; c < formulas.GetLength(1); c++)
                {
                    var row = rowIndex + r;
                    var column = columnIndex + c;
                    if (!Sheet.IsBlank(formulas[r, c]) && (exclude == null || !exclude.Any(x => x.Contains(row, column))))
                    {
                        result.Count++;
                        if (result.Sample.Count < SampleLimit)
                        {
                            result.Sample.Add(Sheet.CellAddress(row, column));
                        }
                    }
                }
            }
            return result;
        }

        private static string HashCells(string prefix, object?[,] cells)
        {
            var flat = new List<object?>(cells.Length);
            foreach (var cell in cells)
            {
                flat.Add(cell);
            }
            return QuoteLineReader.HashText(prefix + "|" + JsText.Stringify(flat));
        }

        private static object?[,] Formulas(dynamic sheet, Rect rect) =>
            ExcelWorkbookGateway.AsArray(Area(sheet, rect.Row, rect.Column, rect.Rows, rect.Columns).Formula, rect.Rows, rect.Columns);

        private static List<string> SheetNames(dynamic book)
        {
            var names = new List<string>();
            foreach (dynamic sheet in book.Sheets)
            {
                names.Add((string)sheet.Name);
            }
            return names;
        }

        /// <summary>Tên Table và tên đã đặt: tên Table mới không được trùng. Names của COM gồm cả tên cấp sheet ("Sheet1!Tên").</summary>
        private static List<string> TakenNames(dynamic book)
        {
            var names = new List<string>();
            foreach (dynamic sheet in book.Worksheets)
            {
                foreach (dynamic table in sheet.ListObjects)
                {
                    names.Add((string)table.Name);
                }
            }
            foreach (dynamic name in book.Names)
            {
                string text = name.Name;
                names.Add(text.Substring(text.IndexOf('!') + 1));
            }
            return names;
        }

        /// <summary>Vùng đang chọn nếu là ô trên workbook đang làm việc; null khi đang chọn thứ khác (ví dụ biểu đồ) hoặc đang ở workbook khác.</summary>
        private static (string SheetName, Rect Rect)? Selection(dynamic app, dynamic book)
        {
            dynamic? active = app.ActiveWorkbook;
            if (active == null || (string)active!.Name != (string)book.Name)
            {
                return null;
            }
            try
            {
                // Chỉ Range mới có Areas; vùng chọn nhiều mảnh thì dùng mảnh đầu.
                dynamic first = app.Selection.Areas[1];
                return ((string)first.Worksheet.Name, (Rect)RectOf(first));
            }
            catch (Exception ex) when (ex is Microsoft.CSharp.RuntimeBinder.RuntimeBinderException || ex is COMException)
            {
                return null;
            }
        }

        private static TargetInspection Inspect(dynamic book, TemplateTarget target, int rowCount, int columnCount)
        {
            if (target.IsNewSheet)
            {
                return new TargetInspection
                {
                    Target = target,
                    SheetName = Naming.UniqueSheetName(target.BaseName!, SheetNames(book)),
                    Address = Sheet.RangeAddress(0, 0, rowCount, columnCount),
                    Fingerprint = NewSheetFingerprint,
                };
            }
            var fits = Sheet.FitsInSheet(target.RowIndex, target.ColumnIndex, rowCount, columnCount);
            var inspection = new TargetInspection
            {
                Target = target,
                SheetName = target.SheetName,
                Address = fits ? Sheet.RangeAddress(target.RowIndex, target.ColumnIndex, rowCount, columnCount) : Sheet.CellAddress(target.RowIndex, target.ColumnIndex),
            };
            dynamic? sheet = FindSheet(book, target.SheetName);
            if (sheet == null)
            {
                inspection.Blockers.Add(new TargetBlocker(BlockerKind.SheetMissing));
                return inspection;
            }
            if (!fits)
            {
                inspection.Blockers.Add(new TargetBlocker(BlockerKind.OutOfBounds));
                return inspection;
            }
            var rect = new Rect { Row = target.RowIndex, Column = target.ColumnIndex, Rows = rowCount, Columns = columnCount };
            if ((bool)sheet.ProtectContents)
            {
                inspection.Blockers.Add(new TargetBlocker(BlockerKind.Protected));
            }
            var overlapping = new List<string>();
            foreach (dynamic table in sheet.ListObjects)
            {
                Rect tableRect = RectOf(table.Range);
                if (tableRect.Intersect(rect) != null)
                {
                    overlapping.Add((string)table.Name);
                }
            }
            if (overlapping.Count > 0)
            {
                inspection.Blockers.Add(new TargetBlocker(BlockerKind.TableOverlap, overlapping));
            }
            dynamic range = Area(sheet, rect.Row, rect.Column, rect.Rows, rect.Columns);
            // MergeCells: false = không ô nào gộp; true hoặc DBNull = có.
            if (!(range.MergeCells is bool merged && !merged))
            {
                inspection.Blockers.Add(new TargetBlocker(BlockerKind.MergedCells, MergedAreas(range)));
            }
            object?[,] formulas = Formulas(sheet, rect);
            inspection.Occupied = FindOccupied(formulas, rect.Row, rect.Column);
            inspection.Fingerprint = HashCells($"{target.SheetName}|{rect.Row}|{rect.Column}", formulas);
            return inspection;
        }

        private static List<string> MergedAreas(dynamic range)
        {
            var addresses = new List<string>();
            foreach (dynamic cell in range.Cells)
            {
                if ((bool)cell.MergeCells)
                {
                    string address = RectOf(cell.MergeArea).Address;
                    if (!addresses.Contains(address))
                    {
                        addresses.Add(address);
                        if (addresses.Count >= SampleLimit)
                        {
                            break;
                        }
                    }
                }
            }
            return addresses;
        }

        public Task<QuoteTableList> ListQuoteTablesAsync() => ExcelBridge.Run<QuoteTableList>(app =>
        {
            // Chốt workbook làm việc là workbook đang mở trên cùng lúc làm mới danh sách.
            dynamic? book = app.ActiveWorkbook;
            if (book == null)
            {
                targetWorkbook = null;
                return new QuoteTableList();
            }
            targetWorkbook = book.Name;
            var list = new QuoteTableList { WorkbookName = book.Name };
            (string SheetName, Rect Rect)? selection = Selection(app, book);
            foreach (dynamic sheet in book.Worksheets)
            {
                foreach (dynamic table in sheet.ListObjects)
                {
                    string name = table.Name;
                    if (!Naming.IsQuoteTableName(name))
                    {
                        continue;
                    }
                    var info = new QuoteTableInfo { TableName = name, SheetName = sheet.Name, DataRowCount = table.ListRows.Count };
                    dynamic? header = table.HeaderRowRange;
                    info.HeadersMatch = header != null && QuoteTemplate.HasQuoteHeaders(Headers(table));
                    if (selection != null && selection.Value.SheetName == info.SheetName)
                    {
                        Rect tableRect = RectOf(table.Range);
                        var hit = tableRect.Intersect(selection.Value.Rect);
                        if (hit != null)
                        {
                            info.ContainsSelection = true;
                            info.SelectedSheetRow = hit.Value.Row + hit.Value.Rows;
                        }
                    }
                    list.Tables.Add(info);
                }
            }
            return list;
        });

        public Task<TargetInspection> InspectAtSelectionAsync(int rowCount, int columnCount) => ExcelBridge.Run<TargetInspection>(app =>
        {
            dynamic book = Book(app);
            (string SheetName, Rect Rect)? selection = Selection(app, book);
            if (selection == null)
            {
                throw new WorkbookException("Vùng đang chọn không phải là ô trên workbook này. Hãy chọn một ô trên sheet rồi thử lại.");
            }
            var target = new TemplateTarget { SheetName = selection.Value.SheetName, RowIndex = selection.Value.Rect.Row, ColumnIndex = selection.Value.Rect.Column };
            return Inspect(book, target, rowCount, columnCount);
        });

        public Task<TargetInspection> InspectTargetAsync(TemplateTarget target, int rowCount, int columnCount) =>
            ExcelBridge.Run<TargetInspection>(app => Inspect(Book(app), target, rowCount, columnCount));

        public Task<CreatedQuote> WriteTemplateAsync(TemplateTarget target, int initialRows, string expectedFingerprint) => ExcelBridge.Run<CreatedQuote>(app =>
        {
            dynamic book = Book(app);
            var layout = QuoteTemplate.BuildLayout(initialRows);
            TargetInspection inspection = Inspect(book, target, layout.RowCount, layout.ColumnCount);
            if (inspection.Blockers.Count > 0 || inspection.Fingerprint != expectedFingerprint)
            {
                throw new TargetChangedException();
            }
            return Quiet<CreatedQuote>((object)app, () =>
            {
                string tableName = Naming.UniqueQuoteTableName(TakenNames(book));
                // Tên bảng có thể trùng bảng báo giá đã bị xóa: tách hồ sơ cũ để bảng mới không nhận nhầm. Không xóa hồ sơ.
                DetachOrphanRecords(book, tableName);
                dynamic sheet = target.IsNewSheet ? AddSheet(book, inspection.SheetName) : FindSheet(book, inspection.SheetName)!;
                try
                {
                    return WriteTemplateCells(sheet, target, layout, tableName, inspection.SheetName, ReadRounding(book).Amount);
                }
                catch (Exception) when (target.IsNewSheet)
                {
                    // Không để lại sheet dở dang do chính add-in vừa tạo trong lượt này.
                    DeleteOwnSheet(app, sheet);
                    throw;
                }
            });
        });

        private static dynamic AddSheet(dynamic book, string name)
        {
            dynamic last = book.Sheets[(int)book.Sheets.Count];
            dynamic sheet = book.Worksheets.Add(After: last);
            sheet.Name = name;
            return sheet;
        }

        private static void DeleteOwnSheet(dynamic app, dynamic sheet)
        {
            bool alerts = app.DisplayAlerts;
            app.DisplayAlerts = false;
            try
            {
                BestEffort(() => sheet.Delete());
            }
            finally
            {
                app.DisplayAlerts = alerts;
            }
        }

        private static CreatedQuote WriteTemplateCells(dynamic sheet, TemplateTarget target, QuoteLayout layout, string tableName, string sheetName, RoundingRule amountRule)
        {
            var row0 = target.IsNewSheet ? 0 : target.RowIndex;
            var col0 = target.IsNewSheet ? 0 : target.ColumnIndex;
            dynamic Cell(int row, int column) => At(sheet, row0 + row, col0 + column);

            // Người dùng đã xác nhận ghi đè (hoặc vùng trống): xóa nội dung cũ trong đúng vùng mẫu và đưa định dạng số
            // về General. Màu nền, viền ngoài định dạng số được giữ nguyên.
            dynamic region = Area(sheet, row0, col0, layout.RowCount, layout.ColumnCount);
            region.ClearContents();
            region.NumberFormat = "General";

            dynamic title = Cell(0, 0);
            title.Value2 = QuoteTemplate.Title;
            title.Font.Bold = true;
            title.Font.Size = 14;
            foreach (var info in layout.InfoRows)
            {
                Cell(info.Row, 0).Value2 = info.Label;
            }

            var headerValues = new object[1, layout.ColumnCount];
            for (var c = 0; c < layout.ColumnCount; c++)
            {
                headerValues[0, c] = QuoteTemplate.TemplateColumns[c].Header;
            }
            Area(sheet, row0 + layout.HeaderRow, col0, 1, layout.ColumnCount).Value2 = headerValues;
            // ListObjects.Add qua COM tự co giãn cột theo tiêu đề: trên sheet có sẵn phải trả lại độ rộng cũ của người dùng.
            var widths = new double[layout.ColumnCount];
            for (var c = 0; c < layout.ColumnCount; c++)
            {
                widths[c] = sheet.Columns[col0 + c + 1].ColumnWidth;
            }
            dynamic table = sheet.ListObjects.Add(XlSrcRange, Area(sheet, row0 + layout.HeaderRow, col0, 1 + layout.DataRowCount, layout.ColumnCount), Type.Missing, XlYes);
            table.Name = tableName;

            foreach (var column in QuoteTemplate.TemplateColumns)
            {
                dynamic body = table.ListColumns[column.Header].DataBodyRange;
                var formula = column.Key == QuoteColumnKey.Stt ? QuoteTemplate.SttFormula(tableName)
                    : column.Key == QuoteColumnKey.Amount ? QuoteTemplate.AmountFormula(amountRule)
                    : null;
                if (formula != null)
                {
                    SetFormula(body, formula);
                }
                if (column.NumberFormat != null)
                {
                    body.NumberFormat = column.NumberFormat;
                }
                if (column.Wrap)
                {
                    body.WrapText = true;
                }
            }

            // Bật dòng tổng: Excel chèn một hàng dưới bảng trong phạm vi cột của bảng và đẩy ô bên dưới xuống 1 hàng.
            // Hàng bị đẩy xuống là hàng cuối của vùng mẫu (đã xóa trống): xóa nó, kéo ô bên dưới về đúng vị trí cũ.
            table.ShowTotals = true;
            dynamic pushedDown = Area(sheet, row0 + layout.TotalRow + 1, col0, 1, layout.ColumnCount);
            if (FindOccupied(ExcelWorkbookGateway.AsArray(pushedDown.Formula, 1, layout.ColumnCount), 0, 0).Count > 0)
            {
                throw new WorkbookException("Excel đã chèn dòng tổng nhưng hàng ngay bên dưới không trống như dự kiến; add-in dừng lại và không xóa gì thêm.");
            }
            pushedDown.Delete(XlShiftUp);

            dynamic totals = table.TotalsRowRange;
            var totalRow = QuoteTemplate.TemplateTotalRow(tableName);
            for (var c = 0; c < totalRow.Length; c++)
            {
                dynamic cell = totals.Cells[1, c + 1];
                SetFormula(cell, totalRow[c]);
                cell.NumberFormat = QuoteTemplate.TemplateColumns[c].NumberFormat ?? "General";
            }

            // Độ rộng cột và ẩn cột ảnh hưởng cả cột của sheet: chỉ đặt khi tạo trên sheet mới. Tạo tại ô chọn trên sheet
            // có sẵn thì cột Mã dòng để hiện (chữ xám), người dùng tự ẩn nếu muốn.
            for (var c = 0; c < QuoteTemplate.TemplateColumns.Count; c++)
            {
                var column = QuoteTemplate.TemplateColumns[c];
                if (target.IsNewSheet)
                {
                    dynamic entire = sheet.Columns[c + 1];
                    SetWidth(entire, column.Width);
                    if (column.Hidden)
                    {
                        entire.Hidden = true;
                    }
                }
                else
                {
                    sheet.Columns[col0 + c + 1].ColumnWidth = widths[c];
                    if (column.Hidden)
                    {
                        table.ListColumns[column.Header].Range.Font.Color = Gray;
                    }
                }
            }

            BestEffort(() =>
            {
                if (target.IsNewSheet)
                {
                    sheet.Activate();
                }
                table.Range.Select();
            });
            return new CreatedQuote { SheetName = sheetName, TableName = tableName, Address = Sheet.RangeAddress(row0, col0, layout.RowCount, layout.ColumnCount) };
        }

        /// <summary>Độ rộng cột theo point: ColumnWidth của COM tính bằng số ký tự nên đặt rồi hiệu chỉnh theo độ rộng đo được.</summary>
        private static void SetWidth(dynamic column, double points)
        {
            double chars = Math.Max(0.5, points / 5.25);
            for (var i = 0; i < 3; i++)
            {
                column.ColumnWidth = Math.Min(255, chars);
                double actual = column.Width;
                if (Math.Abs(actual - points) < 0.4)
                {
                    return;
                }
                chars = Math.Max(0.1, chars + (points - actual) / 5.25);
            }
        }

        /// <summary>
        /// Ghi công thức theo ngữ nghĩa mảng động như Office.js (Formula2): Range.Formula làm Excel mới hiện dấu @ trong
        /// công thức STT. Excel chưa có mảng động (2016) không có Formula2 thì dùng Formula.
        /// </summary>
        private static void SetFormula(dynamic range, string formula)
        {
            if (formula2Supported)
            {
                try
                {
                    range.Formula2 = formula;
                    return;
                }
                catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
                {
                    formula2Supported = false;
                }
                catch (COMException ex) when (ex.ErrorCode == DispUnknownName)
                {
                    formula2Supported = false;
                }
            }
            range.Formula = formula;
        }

        public Task<AppendInspection> InspectAppendAsync(string tableName, bool belowSelection) =>
            ExcelBridge.Run<AppendInspection>(app => InspectAppend(app, Book(app), tableName, belowSelection));

        /// <summary>Khối của chính add-in dưới bảng báo giá (bảng tổng hợp, khu vực điều khoản): Excel dời cùng khi chèn dòng nên không phải hỏi.</summary>
        private static List<Rect> OwnBlocks(dynamic book, string quoteTable)
        {
            (Rect? Summary, Rect? Terms) own = OwnRects(book, quoteTable);
            return new[] { own.Summary, own.Terms }.Where(r => r != null).Select(r => r!.Value).ToList();
        }

        private static OccupiedCells CellsBeside(dynamic sheet, Rect whole, bool right, out object?[,] formulas, IReadOnlyList<Rect>? exclude = null)
        {
            formulas = new object?[0, 0];
            ExcelWorkbookGateway.Area? bounds = ExcelWorkbookGateway.Bounds(sheet);
            if (bounds == null)
            {
                return new OccupiedCells();
            }
            var rect = right
                ? new Rect { Row = whole.Row, Column = whole.Column + whole.Columns, Rows = whole.Rows, Columns = bounds.FirstColumn - 1 + bounds.ColumnCount - (whole.Column + whole.Columns) }
                : new Rect { Row = whole.Row + whole.Rows, Column = whole.Column, Rows = bounds.FirstRow - 1 + bounds.RowCount - (whole.Row + whole.Rows), Columns = whole.Columns };
            if (rect.Rows <= 0 || rect.Columns <= 0)
            {
                return new OccupiedCells();
            }
            formulas = Formulas(sheet, rect);
            return FindOccupied(formulas, rect.Row, rect.Column, exclude);
        }

        private static AppendInspection InspectAppend(dynamic app, dynamic book, string tableName, bool belowSelection)
        {
            dynamic? table = FindTable(book, tableName);
            if (table == null)
            {
                return new AppendInspection { TableName = tableName, Blockers = { new TargetBlocker(BlockerKind.TableMissing) } };
            }
            dynamic sheet = table!.Parent;
            string sheetName = sheet.Name;
            List<string> headers = Headers(table);
            Rect full = RectOf(table.Range);
            var inspection = new AppendInspection
            {
                TableName = tableName,
                SheetName = sheetName,
                CellsBelow = CellsBeside(sheet, full, false, out object?[,] belowFormulas, OwnBlocks(book, tableName)),
            };
            if ((bool)sheet.ProtectContents)
            {
                inspection.Blockers.Add(new TargetBlocker(BlockerKind.Protected));
            }
            if (!QuoteTemplate.HasQuoteHeaders(headers))
            {
                inspection.Blockers.Add(new TargetBlocker(BlockerKind.HeadersChanged));
            }
            int rowCount = table!.ListRows.Count;
            var flags = new bool[0];
            dynamic? body = Body(table);
            if (body != null && QuoteTemplate.HasQuoteHeaders(headers))
            {
                List<SheetRow> rows = ReadRows(body, rowCount, headers.Count);
                flags = QuoteTemplate.BlankRowFlags(headers, rows.Select(r => (IReadOnlyList<object?>)r.Formulas).ToList());
            }
            if (belowSelection)
            {
                (string SheetName, Rect Rect)? selection = Selection(app, book);
                var hit = selection != null && selection.Value.SheetName == sheetName ? full.Intersect(selection.Value.Rect) : null;
                if (hit == null)
                {
                    inspection.Blockers.Add(new TargetBlocker(BlockerKind.SelectionOutsideTable));
                }
                else
                {
                    // Tiêu đề → lên đầu; hàng cuối dữ liệu hoặc dòng tổng → cuối bảng.
                    var firstData = full.Row + 1;
                    var last = hit.Value.Row + hit.Value.Rows - 1;
                    var after = last - firstData + 1;
                    inspection.InsertIndex = last < firstData ? 0 : after >= rowCount ? (int?)null : after;
                }
            }
            // Mẫu tạo sẵn vài dòng trống: ghi vào đó thay vì chèn thêm, để không còn dòng trống có STT bị in ra.
            inspection.FillIndex = QuoteTemplate.BlankRowToFill(flags, inspection.InsertIndex);
            // Không đưa vùng chọn vào vân tay: người dùng có thể click chỗ khác khi hộp xác nhận đang mở. Trạng thái trống
            // của từng dòng thì có: nếu người dùng vừa gõ vào dòng trống sắp được ghi, add-in dừng thay vì ghi đè.
            inspection.Fingerprint = HashCells(
                $"{full.Address}|{string.Join("\t", headers)}|{new string(flags.Select(b => b ? '1' : '0').ToArray())}",
                belowFormulas);
            return inspection;
        }

        /// <summary>Ghi một ô: công thức, chữ (kể cả tiền tố ' giữ dạng chữ) hoặc số; null = không ghi.</summary>
        private static void Put(dynamic cell, object? value)
        {
            switch (value)
            {
                case null:
                    return;
                case string text when text.StartsWith("=", StringComparison.Ordinal):
                    SetFormula(cell, text);
                    return;
                case decimal number:
                    cell.Value2 = (double)number;
                    return;
                case double _:
                case string _:
                    cell.Value2 = value;
                    return;
                default:
                    cell.Value2 = Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture);
                    return;
            }
        }

        public Task<AppendedRows> AppendRowsAsync(string tableName, IReadOnlyList<object[]> rows, string expectedFingerprint, int? insertIndex, int? fillIndex, IReadOnlyList<IReadOnlyDictionary<string, object>> extras) => ExcelBridge.Run<AppendedRows>(app =>
        {
            dynamic book = Book(app);
            // Kiểm tra lại bảng (không phụ thuộc vùng chọn hiện tại); vị trí chèn dùng insertIndex đã cố định.
            AppendInspection inspection = InspectAppend(app, book, tableName, false);
            if (inspection.Blockers.Count > 0 || inspection.Fingerprint != expectedFingerprint)
            {
                throw new TargetChangedException();
            }
            dynamic table = RequireTable(book, tableName);
            int before = table.ListRows.Count;
            if (insertIndex != null && (insertIndex < 0 || insertIndex > before) ||
                fillIndex != null && (rows.Count != 1 || fillIndex < 0 || fillIndex >= before))
            {
                throw new TargetChangedException();
            }
            List<string> headers = Headers(table);
            // Công thức Thành tiền theo quy tắc làm tròn hiện tại của workbook (đọc ngay lúc ghi).
            string amountFormula = QuoteTemplate.AmountFormula(ReadRounding(book).Amount);
            var amountIndex = QuoteTemplate.Columns.ToList().FindIndex(c => c.Key == QuoteColumnKey.Amount);
            var withAmount = rows.Select(row => row.Select((cell, i) => i == amountIndex ? amountFormula : cell).ToArray()).ToList();
            var aligned = withAmount.Select((row, i) => QuoteTemplate.AlignRow(headers, row, i < extras.Count ? extras[i] : null)).ToList();
            if (aligned.Any(row => row == null))
            {
                throw new TargetChangedException();
            }
            return Quiet<AppendedRows>((object)app, () =>
            {
                int firstRow;
                if (fillIndex != null)
                {
                    // Dòng trống đã kiểm tra: chỉ ghi các cột mẫu và cột có giá trị, không đụng cột người dùng tự thêm.
                    dynamic body = table.DataBodyRange;
                    NoAutoFill((object)app, () =>
                    {
                        for (var c = 0; c < headers.Count; c++)
                        {
                            Put(body.Cells[fillIndex.Value + 1, c + 1], aligned[0]![c]);
                        }
                    });
                    firstRow = (int)body.Row - 1 + fillIndex.Value;
                }
                else
                {
                    firstRow = -1;
                    for (var i = 0; i < aligned.Count; i++)
                    {
                        // Cột để null: Excel tự điền công thức cột tính toán.
                        dynamic added = insertIndex == null ? table.ListRows.Add() : table.ListRows.Add(insertIndex.Value + 1 + i);
                        dynamic range = added.Range;
                        firstRow = firstRow < 0 ? (int)range.Row - 1 : firstRow;
                        var values = aligned[i]!;
                        NoAutoFill((object)app, () =>
                        {
                            for (var c = 0; c < headers.Count; c++)
                            {
                                Put(range.Cells[1, c + 1], values[c]);
                            }
                        });
                    }
                }
                Rect full = RectOf(table.Range);
                dynamic sheet = table!.Parent;
                BestEffort(() => Area(sheet, firstRow, full.Column, rows.Count, full.Columns).Select());
                return new AppendedRows
                {
                    TableName = tableName,
                    SheetName = sheet.Name,
                    Address = Sheet.RangeAddress(firstRow, full.Column, rows.Count, full.Columns),
                };
            });
        });

        private static InfoScan ScanInfo(dynamic book, string tableName)
        {
            dynamic table = RequireTable(book, tableName);
            dynamic sheet = table!.Parent;
            dynamic header = table.HeaderRowRange;
            int headerRow = (int)header.Row - 1;
            int headerColumn = (int)header.Column - 1;
            var first = Math.Max(0, headerRow - QuoteInfo.ScanRows);
            var count = headerRow - first;
            var read = new QuoteInfoRead
            {
                SheetName = sheet.Name,
                SheetProtected = sheet.ProtectContents,
                Cells = QuoteInfo.Fields.Select(f => new InfoCell { Key = f.Key }).ToList(),
            };
            if (count <= 0)
            {
                return new InfoScan { Read = read, Sheet = sheet };
            }
            var valueColumn = headerColumn + QuoteTemplate.InfoValueColumnOffset;
            object?[,] labels = ExcelWorkbookGateway.AsArray(Area(sheet, first, headerColumn, count, 1).Value2, count, 1);
            dynamic valueRange = Area(sheet, first, valueColumn, count, 1);
            object?[,] values = ExcelWorkbookGateway.AsArray(valueRange.Value2, count, 1);
            object?[,] formulas = ExcelWorkbookGateway.AsArray(valueRange.Formula, count, 1);
            for (var i = 0; i < QuoteInfo.Fields.Count; i++)
            {
                for (var r = 0; r < count; r++)
                {
                    if (QuoteInfo.LabelMatches(labels[r, 0], QuoteInfo.Fields[i].Label))
                    {
                        dynamic cell = At(sheet, first + r, valueColumn);
                        read.Cells[i] = new InfoCell
                        {
                            Key = QuoteInfo.Fields[i].Key,
                            Found = true,
                            Address = Sheet.CellAddress(first + r, valueColumn),
                            Value = Value(values[r, 0]),
                            Text = cell.Text,
                            NumberFormat = cell.NumberFormat,
                        };
                        break;
                    }
                }
            }
            read.Fingerprint = HashCells($"{first}|{HashCells("", labels)}", formulas);
            return new InfoScan { Read = read, Sheet = sheet };
        }

        public Task<QuoteInfoRead> ReadQuoteInfoAsync(string tableName) => ExcelBridge.Run<QuoteInfoRead>(app => ((InfoScan)ScanInfo(Book(app), tableName)).Read);

        public Task WriteQuoteInfoAsync(string tableName, IReadOnlyList<InfoWrite> writes, string expectedFingerprint) => ExcelBridge.Run<bool>(app =>
        {
            InfoScan scan = ScanInfo(Book(app), tableName);
            var read = scan.Read;
            dynamic sheet = scan.Sheet;
            if (read.Fingerprint != expectedFingerprint)
            {
                throw new TargetChangedException();
            }
            foreach (var write in writes)
            {
                var cell = read.Cells.FirstOrDefault(c => c.Key == write.Key);
                if (cell == null || !cell.Found)
                {
                    throw new TargetChangedException();
                }
                dynamic range = sheet.Range[cell.Address];
                if (write.Kind == InfoWriteKind.Clear)
                {
                    range.ClearContents();
                }
                else if (write.Kind == InfoWriteKind.Date)
                {
                    range.NumberFormat = QuoteInfo.DateFormat;
                    // Ngày là số nên Excel căn phải; căn trái cho thẳng hàng với các mục chữ khi in.
                    range.HorizontalAlignment = XlLeft;
                    range.Value2 = (double)write.Serial;
                }
                else
                {
                    range.Value2 = WorkItemDraft.AsLiteralText(write.Text);
                }
            }
            return true;
        });

        private static JObject ReadSettings(dynamic book)
        {
            foreach (dynamic part in book.CustomXMLParts.SelectByNamespace(WorkbookSettings.Namespace))
            {
                return WorkbookSettings.Decode((string)part.XML);
            }
            return new JObject();
        }

        private static void SaveSettings(dynamic book, JObject settings)
        {
            var old = new List<dynamic>();
            foreach (dynamic part in book.CustomXMLParts.SelectByNamespace(WorkbookSettings.Namespace))
            {
                old.Add(part);
            }
            book.CustomXMLParts.Add(WorkbookSettings.Encode(settings));
            foreach (var part in old)
            {
                part.Delete();
            }
        }

        public Task<bool> WasLibraryUsedAsync() => ExcelBridge.Run<bool>(app =>
        {
            dynamic book = ActiveBook(app);
            if (WorkbookSettings.LibraryUsed(ReadSettings(book)))
            {
                return true;
            }
            // Workbook từ bản web: cờ nằm trong vùng lưu của Office.js, suy từ nguồn gốc các dòng trong hồ sơ.
            foreach (dynamic part in book.CustomXMLParts.SelectByNamespace(QuotationXml.Namespace))
            {
                var read = QuotationXml.Decode((string)part.XML);
                if (read.Kind == RecordReadKind.Ok && read.Record!.Items.Any(i => i.Source != null))
                {
                    return true;
                }
            }
            return false;
        });

        public Task MarkLibraryUsedAsync() => ExcelBridge.Run<bool>(app =>
        {
            dynamic book = Book(app);
            JObject settings = ReadSettings(book);
            settings[WorkbookSettings.LibraryUsedKey] = true;
            SaveSettings(book, settings);
            return true;
        });

        private static RoundingRule InferAmountRule(dynamic book)
        {
            var amountHeader = QuoteTemplate.HeaderOf(QuoteColumnKey.Amount);
            foreach (dynamic sheet in book.Worksheets)
            {
                foreach (dynamic table in sheet.ListObjects)
                {
                    string name = table.Name;
                    if (Naming.IsQuoteTableName(name) && (int)table.ListRows.Count > 0 && Headers(table).Contains(amountHeader))
                    {
                        RoundingRule? rule = InferColumnRule(table.ListColumns[amountHeader].DataBodyRange, (Func<RoundingRule, string>)(r => QuoteTemplate.AmountFormula(r)), name);
                        if (rule != null)
                        {
                            return rule;
                        }
                    }
                }
            }
            return Rounding.NoRounding;
        }

        private static RoundingRule? InferColumnRule(dynamic body, Func<RoundingRule, string> build, string ownTable)
        {
            int rows = body.Rows.Count;
            object?[,] formulas = ExcelWorkbookGateway.AsArray(body.Formula, rows, 1);
            for (var r = 0; r < rows; r++)
            {
                var rule = QuoteTemplate.InferRule(formulas[r, 0], build, ownTable);
                if (rule != null)
                {
                    return rule;
                }
            }
            return null;
        }

        private static RoundingRule InferUnitPriceRule(dynamic book)
        {
            dynamic? analysis = FindTable(book, Analysis.TableName);
            var header = Analysis.HeaderOf(AnalysisColumnKey.UnitPrice);
            if (analysis == null || (int)analysis!.ListRows.Count == 0 || !((List<string>)Headers(analysis)).Contains(header))
            {
                return Rounding.NoRounding;
            }
            RoundingRule? rule = InferColumnRule(analysis!.ListColumns[header].DataBodyRange, (Func<RoundingRule, string>)(r => Analysis.UnitPriceFormula(r)), Analysis.TableName);
            return rule ?? Rounding.NoRounding;
        }

        /// <summary>Quy tắc đã lưu (bản native) hoặc suy từ công thức trên sheet (workbook từ bản web).</summary>
        private static RoundingConfig ReadRounding(dynamic book) =>
            WorkbookSettings.RoundingOf(ReadSettings(book)) ??
            new RoundingConfig(InferUnitPriceRule(book), InferAmountRule(book), Rounding.NoRounding);

        public Task<RoundingConfig> ReadRoundingAsync() => ExcelBridge.Run<RoundingConfig>(app => ReadRounding(Book(app)));

        public Task<QuoteSnapshot> ReadQuoteSnapshotAsync(string tableName) => ExcelBridge.Run<QuoteSnapshot>(app =>
        {
            dynamic book = Book(app);
            dynamic quoteTable = RequireTable(book, tableName);
            dynamic? summary = FindTable(book, Adjustments.SummaryTableName(tableName));
            dynamic? analysis = FindTable(book, Analysis.TableName);
            var snapshot = new QuoteSnapshot
            {
                Quote = LoadSnapshot(quoteTable),
                Summary = summary == null ? null : (TableSnapshot)LoadSnapshot(summary),
                AmountRule = ReadRounding(book).Amount,
            };
            if (analysis != null)
            {
                TableSnapshot a = LoadSnapshot(analysis);
                if (Analysis.IsAnalysisHeaders(a.Headers))
                {
                    snapshot.Analysis = ToAnalysisLines(a);
                }
            }
            return snapshot;
        });

        private static List<AnalysisLine> ToAnalysisLines(TableSnapshot a)
        {
            int I(AnalysisColumnKey key) => Analysis.ColumnIndex(a.Headers, key);
            return a.Rows.Select((row, r) =>
            {
                string Text(AnalysisColumnKey key) => QuoteLineReader.Text(row.Values[I(key)]).Trim();
                return new AnalysisLine
                {
                    Code = Text(AnalysisColumnKey.Code),
                    RowIndex = a.FirstRowIndex + r,
                    SheetName = a.SheetName,
                    QuantityBlank = Sheet.IsBlank(row.Values[I(AnalysisColumnKey.Quantity)]),
                    PriceBlank = Sheet.IsBlank(row.Values[I(AnalysisColumnKey.Price)]),
                    UnitPrice = row.Values[I(AnalysisColumnKey.UnitPrice)],
                    UnitPriceType = row.Types[I(AnalysisColumnKey.UnitPrice)],
                    PriceAddress = Sheet.CellAddress(a.FirstRowIndex + r, a.FirstColumnIndex + I(AnalysisColumnKey.Price)),
                    ResourceCode = Text(AnalysisColumnKey.ResourceCode),
                    ResourceName = Text(AnalysisColumnKey.ResourceName),
                    ResourceType = Text(AnalysisColumnKey.ResourceType),
                    ResourceUnit = Text(AnalysisColumnKey.ResourceUnit),
                    Quantity = row.Values[I(AnalysisColumnKey.Quantity)],
                    QuantityType = row.Types[I(AnalysisColumnKey.Quantity)],
                    Price = row.Values[I(AnalysisColumnKey.Price)],
                    PriceType = row.Types[I(AnalysisColumnKey.Price)],
                    Source = QuoteLineReader.Text(row.Values[I(AnalysisColumnKey.Source)]),
                };
            }).ToList();
        }

        private static AnalysisPrice PriceOf(object? raw)
        {
            if (raw is int code)
            {
                return new AnalysisPrice { Kind = AnalysisPriceKind.Error, Error = ErrorText(code) };
            }
            return raw is double value
                ? new AnalysisPrice { Kind = AnalysisPriceKind.Value, Value = value }
                : new AnalysisPrice { Kind = AnalysisPriceKind.Missing };
        }

        /// <summary>Đơn giá công tác của khối có mã này (so như phép "=" của Excel: bỏ khoảng trắng, không phân biệt hoa thường).</summary>
        private static AnalysisPrice? FindAnalysisPrice(dynamic table, IReadOnlyList<string> headers, string code)
        {
            dynamic? body = Body(table);
            if (body == null)
            {
                return null;
            }
            int rows = table.ListRows.Count;
            object?[,] values = ExcelWorkbookGateway.AsArray(body.Value2, rows, headers.Count);
            var codeColumn = Analysis.ColumnIndex(headers, AnalysisColumnKey.Code);
            var priceColumn = Analysis.ColumnIndex(headers, AnalysisColumnKey.UnitPrice);
            var vi = System.Globalization.CultureInfo.GetCultureInfo("vi-VN");
            var wanted = code.Trim().ToLower(vi);
            for (var r = 0; r < rows; r++)
            {
                if (QuoteLineReader.Text(values[r, codeColumn]).Trim().ToLower(vi) == wanted)
                {
                    return PriceOf(values[r, priceColumn]);
                }
            }
            return null;
        }

        public Task<AnalysisPrice?> FindAnalysisAsync(string code) => ExcelBridge.Run<AnalysisPrice?>(app =>
        {
            dynamic? table = FindTable(Book(app), Analysis.TableName);
            if (table == null)
            {
                return null;
            }
            List<string> headers = Headers(table);
            return Analysis.IsAnalysisHeaders(headers) ? (AnalysisPrice?)FindAnalysisPrice(table, headers, code) : null;
        });

        public Task<AnalysisWriteResult> WriteAnalysisAsync(string code, IReadOnlyList<object[]> rows) => ExcelBridge.Run<AnalysisWriteResult>(app =>
        {
            dynamic book = Book(app);
            var unitPriceIndex = Analysis.Columns.ToList().FindIndex(c => c.Key == AnalysisColumnKey.UnitPrice);
            // Công thức đơn giá công tác luôn theo quy tắc làm tròn hiện tại của workbook.
            string formula = Analysis.UnitPriceFormula(ReadRounding(book).UnitPrice);
            var data = rows.Select(row => row.Select((cell, i) => i == unitPriceIndex ? formula : cell).ToArray()).ToList();
            dynamic? table = FindTable(book, Analysis.TableName);
            return Quiet<AnalysisWriteResult>((object)app, () => table == null ? NewAnalysisSheet(app, book, data, unitPriceIndex) : AppendAnalysis(table, code, data));
        });

        private static AnalysisWriteResult NewAnalysisSheet(dynamic app, dynamic book, IReadOnlyList<object[]> data, int unitPriceIndex)
        {
            string sheetName = Naming.UniqueSheetName(Analysis.SheetName, SheetNames(book));
            // Tạo sheet phân tích không được làm người dùng rời khỏi sheet báo giá.
            dynamic? previous = app.ActiveSheet;
            dynamic sheet = AddSheet(book, sheetName);
            try
            {
                dynamic title = sheet.Range["A1"];
                title.Value2 = Analysis.Title;
                title.Font.Bold = true;
                title.Font.Size = 14;
                sheet.Range["A2"].Value2 = Analysis.Note;
                var width = Analysis.Columns.Count;
                var headers = new object[1, width];
                for (var c = 0; c < width; c++)
                {
                    headers[0, c] = Analysis.Columns[c].Header;
                }
                Area(sheet, Analysis.HeaderRow, 0, 1, width).Value2 = headers;
                // Tạo Table trước khi ghi: công thức [@[…]] chỉ hợp lệ bên trong Table.
                dynamic created = sheet.ListObjects.Add(XlSrcRange, Area(sheet, Analysis.HeaderRow, 0, 1 + data.Count, width), Type.Missing, XlYes);
                created.Name = Analysis.TableName;
                dynamic body = created.DataBodyRange;
                for (var c = 0; c < width; c++)
                {
                    if (Analysis.Columns[c].NumberFormat != null)
                    {
                        ((dynamic)created.ListColumns[c + 1]).DataBodyRange.NumberFormat = Analysis.Columns[c].NumberFormat;
                    }
                    SetWidth(sheet.Columns[c + 1], Analysis.Columns[c].Width);
                }
                for (var r = 0; r < data.Count; r++)
                {
                    for (var c = 0; c < width; c++)
                    {
                        Put(body.Cells[r + 1, c + 1], data[r][c]);
                    }
                }
                created.Range.Calculate();
                object? price = body.Cells[1, unitPriceIndex + 1].Value2;
                BestEffort(() => previous?.Activate());
                return new AnalysisWriteResult { Written = true, SheetName = sheetName, Price = PriceOf(price) };
            }
            catch (Exception)
            {
                DeleteOwnSheet(app, sheet);
                throw;
            }
        }

        private static AnalysisWriteResult AppendAnalysis(dynamic table, string code, IReadOnlyList<object[]> data)
        {
            dynamic sheet = table!.Parent;
            string sheetName = sheet.Name;
            List<string> headers = Headers(table);
            if (!Analysis.IsAnalysisHeaders(headers))
            {
                throw new WorkbookException($"Bảng {Analysis.TableName} trên sheet \"{sheetName}\" đã bị đổi tên hoặc xóa cột; add-in không ghi để tránh sai lệch.");
            }
            AnalysisPrice? existing = FindAnalysisPrice(table, headers, code);
            if (existing != null)
            {
                return new AnalysisWriteResult { Written = false, SheetName = sheetName, Price = existing };
            }
            if ((bool)sheet.ProtectContents)
            {
                throw new WorkbookException($"Sheet \"{sheetName}\" đang được bảo vệ; không thêm được phân tích.");
            }
            OccupiedCells below = CellsBeside(sheet, RectOf(table.Range), false, out object?[,] _);
            if (below.Count > 0)
            {
                throw new WorkbookException($"Có dữ liệu ngay dưới bảng phân tích (sheet \"{sheetName}\", ô {string.Join(", ", below.Sample)}). Hãy di chuyển dữ liệu đó rồi thử lại.");
            }
            // Ghi theo thứ tự cột thực tế của bảng; cột người dùng tự thêm để Excel tự điền nếu là cột tính toán.
            var firstRow = 0;
            Dictionary<string, int> columnOf = Analysis.Columns.Select((c, i) => (c.Header, i)).ToDictionary(x => x.Header, x => x.i);
            for (var r = 0; r < data.Count; r++)
            {
                dynamic range = table.ListRows.Add().Range;
                firstRow = r == 0 ? (int)range.Row : firstRow;
                for (var c = 0; c < headers.Count; c++)
                {
                    if (columnOf.TryGetValue(headers[c], out var index))
                    {
                        Put(range.Cells[1, c + 1], data[r][index]);
                    }
                }
            }
            table.Range.Calculate();
            var priceColumn = Analysis.ColumnIndex(headers, AnalysisColumnKey.UnitPrice);
            object? price = sheet.Cells[firstRow, (int)table.Range.Column + priceColumn].Value2;
            return new AnalysisWriteResult { Written = true, SheetName = sheetName, Price = PriceOf(price) };
        }

        private static FoundRecord FindRecord(dynamic book, string tableName)
        {
            foreach (dynamic part in book.CustomXMLParts.SelectByNamespace(QuotationXml.Namespace))
            {
                string xml = part.XML;
                if (QuotationXml.TableOf(xml) == tableName)
                {
                    return new FoundRecord { Part = part, Read = QuotationXml.Decode(xml) };
                }
            }
            return new FoundRecord { Read = RecordRead.None() };
        }

        /// <summary>Hồ sơ còn mang tên một bảng không còn tồn tại được tách khỏi tên đó trước khi tạo bảng mới cùng tên. Không xóa dữ liệu hồ sơ.</summary>
        private static void DetachOrphanRecords(dynamic book, string tableName)
        {
            var now = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
            var matches = new List<dynamic>();
            foreach (dynamic part in book.CustomXMLParts.SelectByNamespace(QuotationXml.Namespace))
            {
                if (QuotationXml.TableOf((string)part.XML) == tableName)
                {
                    matches.Add(part);
                }
            }
            foreach (var part in matches)
            {
                ReplacePart(book, part, QuotationXml.Detach((string)part.XML, now));
            }
        }

        /// <summary>COM không có setXml: thêm part mới, thành công mới xóa part cũ.</summary>
        private static void ReplacePart(dynamic book, dynamic part, string xml)
        {
            book.CustomXMLParts.Add(xml);
            part.Delete();
        }

        public Task<RecordRead> ReadRecordAsync(string tableName) => ExcelBridge.Run<RecordRead>(app => ((FoundRecord)FindRecord(Book(app), tableName)).Read);

        public Task SaveRecordAsync(QuotationRecord record, string? expectedUpdatedAt) => ExcelBridge.Run<bool>(app =>
        {
            dynamic book = Book(app);
            FoundRecord found = FindRecord(book, record.TableName);
            var read = found.Read;
            dynamic? part = found.Part;
            if (read.Kind == RecordReadKind.Unreadable)
            {
                throw new RecordUnreadableException(read.Message);
            }
            var current = read.Kind == RecordReadKind.Ok ? read.Record!.UpdatedAt : null;
            if (current != expectedUpdatedAt)
            {
                throw new RecordChangedException();
            }
            var xml = QuotationXml.Encode(record);
            if (part != null)
            {
                ReplacePart(book, part, xml);
            }
            else
            {
                book.CustomXMLParts.Add(xml);
            }
            // Đọc lại để chắc Excel đã lưu đúng hồ sơ vừa ghi trước khi báo thành công.
            RecordRead after = ((FoundRecord)FindRecord(book, record.TableName)).Read;
            if (after.Kind != RecordReadKind.Ok || after.Record!.Id != record.Id || after.Record.UpdatedAt != record.UpdatedAt)
            {
                throw new RecordChangedException();
            }
            return true;
        });

        /// <summary>Ô trống đọc ra "" hoặc null: coi như nhau. Số so ở double, kể cả số add-in lưu dạng decimal.</summary>
        private static bool SameCell(object? actual, object? expected)
        {
            actual = actual is int code ? ErrorText(code) : actual;
            if (Sheet.IsBlank(actual) || Sheet.IsBlank(expected))
            {
                return Sheet.IsBlank(actual) && Sheet.IsBlank(expected);
            }
            if (expected is decimal number)
            {
                return actual is double d && d == (double)number;
            }
            return Equals(actual, expected);
        }

        /// <summary>Chữ ghi kèm tiền tố ' để Excel giữ nguyên dạng chữ.</summary>
        private static object CellInput(object value) => value is string text && text != "" && !text.StartsWith("'", StringComparison.Ordinal) ? "'" + text : value is decimal number ? (double)number : value;

        private static object? AfterWrite(object value) => value is string text && text.StartsWith("'", StringComparison.Ordinal) ? text.Substring(1) : value;

        public Task WriteLineCellsAsync(string tableName, IReadOnlyList<LineCellWrite> writes, IReadOnlyList<RowGuard> guards)
        {
            if (writes.Count == 0)
            {
                return Task.CompletedTask;
            }
            return ExcelBridge.Run<bool>(app =>
            {
                dynamic? table = FindTable(Book(app), tableName);
                if (table == null || Body(table) == null)
                {
                    throw new TargetChangedException();
                }
                List<string> headers = Headers(table);
                int rowCount = table!.ListRows.Count;
                dynamic body = table.DataBodyRange;
                dynamic CellAt(int row, string header)
                {
                    var column = headers.IndexOf(header);
                    if (column < 0 || row < 0 || row >= rowCount)
                    {
                        throw new TargetChangedException();
                    }
                    return body.Cells[row + 1, column + 1];
                }
                var targets = writes.Select(w => (Write: w, Cell: CellAt(w.Row, w.Header))).ToList();
                foreach (var guard in guards)
                {
                    foreach (var pair in guard.Expected)
                    {
                        if (!SameCell(CellAt(guard.Row, pair.Key).Value2, pair.Value))
                        {
                            throw new TargetChangedException();
                        }
                    }
                }
                if (!targets.All(t => SameCell(t.Cell.Value2, t.Write.Expected)))
                {
                    throw new TargetChangedException();
                }
                return Quiet<bool>((object)app, () =>
                {
                    foreach (var target in targets)
                    {
                        target.Cell.Value2 = CellInput(target.Write.Value);
                    }
                    if (!targets.All(t => SameCell(t.Cell.Value2, AfterWrite(t.Write.Value))))
                    {
                        throw new TargetChangedException();
                    }
                    return true;
                });
            });
        }

        public Task WriteAnalysisCellsAsync(IReadOnlyList<AnalysisCellWrite> writes)
        {
            if (writes.Count == 0)
            {
                return Task.CompletedTask;
            }
            return ExcelBridge.Run<bool>(app =>
            {
                dynamic? table = FindTable(Book(app), Analysis.TableName);
                if (table == null || Body(table) == null)
                {
                    throw new TargetChangedException();
                }
                List<string> headers = Headers(table);
                dynamic sheet = table!.Parent;
                Rect body = RectOf(table.DataBodyRange);
                var targets = writes.Select(w =>
                {
                    var column = headers.IndexOf(w.Header);
                    if (column < 0 || w.RowIndex < body.Row || w.RowIndex >= body.Row + body.Rows)
                    {
                        throw new TargetChangedException();
                    }
                    return (Write: w, Cell: At(sheet, w.RowIndex, body.Column + column));
                }).ToList();
                if (!targets.All(t => SameCell(t.Cell.Value2, t.Write.Expected)))
                {
                    throw new TargetChangedException();
                }
                return Quiet<bool>((object)app, () =>
                {
                    foreach (var target in targets)
                    {
                        target.Cell.Value2 = CellInput(target.Write.Value);
                    }
                    return true;
                });
            });
        }

        public Task<ExtensionInspection> InspectExtensionColumnsAsync(string tableName) => ExcelBridge.Run<ExtensionInspection>(app =>
        {
            dynamic table = RequireTable(Book(app), tableName);
            List<QuoteColumn> missingColumns = QuoteTemplate.MissingExtensionColumns(Headers(table));
            var missing = missingColumns.Select(c => c.Header).ToList();
            return new ExtensionInspection
            {
                Missing = missing,
                CellsRight = missing.Count > 0 ? CellsBeside(table.Parent, RectOf(table.Range), true, out object?[,] _) : new OccupiedCells(),
                SheetProtected = table.Parent.ProtectContents,
            };
        });

        public Task<List<string>> AddExtensionColumnsAsync(string tableName) => ExcelBridge.Run<List<string>>(app =>
        {
            dynamic table = RequireTable(Book(app), tableName);
            dynamic sheet = table!.Parent;
            List<QuoteColumn> missing = QuoteTemplate.MissingExtensionColumns(Headers(table));
            if (missing.Count == 0)
            {
                return new List<string>();
            }
            if ((bool)sheet.ProtectContents)
            {
                throw new WorkbookException($"Sheet \"{(string)sheet.Name}\" đang được bảo vệ; không thêm được cột.");
            }
            OccupiedCells right = CellsBeside(sheet, RectOf(table.Range), true, out object?[,] _);
            if (right.Count > 0)
            {
                throw new WorkbookException($"Có dữ liệu ngay bên phải bảng (ô {string.Join(", ", right.Sample)}); thêm cột sẽ đẩy lệch dữ liệu đó. Hãy di chuyển rồi thử lại.");
            }
            return Quiet<List<string>>((object)app, () =>
            {
                foreach (var column in missing)
                {
                    dynamic added = table.ListColumns.Add();
                    added.Name = column.Header;
                    if (column.NumberFormat != null && (int)table.ListRows.Count > 0)
                    {
                        added.DataBodyRange.NumberFormat = column.NumberFormat;
                    }
                }
                // Cột Mã dòng: ẩn cả cột của sheet chỉ khi ngoài bảng cột đó không có gì; nếu không thì để hiện, chữ xám.
                if (missing.Any(c => c.Header == QuoteTemplate.LineIdHeader))
                {
                    dynamic idColumn = table.ListColumns[QuoteTemplate.LineIdHeader].Range;
                    Rect rect = RectOf(idColumn);
                    object?[,] inColumn = ExcelWorkbookGateway.AsArray(idColumn.EntireColumn.Formula, Sheet.MaxRows, 1);
                    var outside = false;
                    for (var r = 0; r < Sheet.MaxRows && !outside; r++)
                    {
                        outside = !Sheet.IsBlank(inColumn[r, 0]) && (r < rect.Row || r >= rect.Row + rect.Rows);
                    }
                    if (outside)
                    {
                        idColumn.Font.Color = Gray;
                    }
                    else
                    {
                        idColumn.EntireColumn.Hidden = true;
                    }
                }
                return missing.Select(c => c.Header).ToList();
            });
        });

        public Task GoToAsync(string sheetName, string address) => ExcelBridge.Run<bool>(app =>
        {
            dynamic book = Book(app);
            dynamic? sheet = FindSheet(book, sheetName);
            if (sheet == null)
            {
                throw new WorkbookException($"Không tìm thấy sheet \"{sheetName}\". Sheet có thể vừa bị đổi tên hoặc xóa.");
            }
            book.Activate();
            sheet.Activate();
            sheet.Range[address].Select();
            return true;
        });

        public Task SelectQuoteTableAsync(string tableName) => ExcelBridge.Run<bool>(app =>
        {
            dynamic book = Book(app);
            dynamic table = RequireTable(book, tableName);
            book.Activate();
            table.Parent.Activate();
            table.Range.Select();
            return true;
        });

        public Task<string> WriteExplanationAsync(ExplanationSheet explanation) => ExcelBridge.Run<string>(app =>
        {
            dynamic book = ActiveBook(app);
            return Quiet<string>((object)app, () =>
            {
                string name = Naming.UniqueSheetName(explanation.SheetName, SheetNames(book));
                dynamic sheet = AddSheet(book, name);
                try
                {
                    WriteExplanationCells(sheet, explanation);
                }
                catch (Exception)
                {
                    DeleteOwnSheet(app, sheet);
                    throw;
                }
                sheet.Activate();
                return name;
            });
        });

        private static void WriteExplanationCells(dynamic sheet, ExplanationSheet explanation)
        {
            for (var r = 0; r < explanation.Rows.Count; r++)
            {
                for (var c = 0; c < explanation.ColumnCount; c++)
                {
                    Put(At(sheet, r, c), explanation.Rows[r][c]);
                }
            }
            dynamic title = sheet.Range["A1"];
            title.Font.Bold = true;
            title.Font.Size = 14;

            // Bảng thành phần: tiêu đề, viền, định dạng số theo cột.
            dynamic table = Area(sheet, explanation.HeaderRow, 0, explanation.ComponentRows + 1, explanation.ColumnCount);
            StyleHeader(table.Rows[1]);
            Border(table);
            if (explanation.ComponentRows > 0)
            {
                for (var c = 0; c < NormExplanation.Formats.Length; c++)
                {
                    Area(sheet, explanation.HeaderRow + 1, c, explanation.ComponentRows, 1).NumberFormat = NormExplanation.Formats[c];
                }
                dynamic notes = Area(sheet, explanation.HeaderRow + 1, 0, explanation.ComponentRows, explanation.ColumnCount);
                notes.WrapText = true;
                notes.VerticalAlignment = XlTop;
            }
            for (var c = 0; c < NormExplanation.Widths.Length; c++)
            {
                SetWidth(sheet.Columns[c + 1], NormExplanation.Widths[c]);
            }

            // Phần tổng hợp: cột I (nhãn), J (công thức Excel), K (kết quả add-in).
            dynamic summary = Area(sheet, explanation.SummaryRow, 8, explanation.SummaryRows, 3);
            StyleHeader(summary.Rows[1]);
            Border(summary);
            Area(sheet, explanation.SummaryRow + 1, 9, explanation.SummaryRows - 1, 2).NumberFormat = "#,##0";
            summary.Rows[explanation.SummaryRows].Font.Bold = true;
        }

        private static void StyleHeader(dynamic range)
        {
            range.Font.Bold = true;
            range.Font.Color = 0;
            range.Interior.Color = HeaderFill;
            range.HorizontalAlignment = XlCenter;
            range.VerticalAlignment = XlCenter;
            range.WrapText = true;
        }

        private static void Border(dynamic range)
        {
            range.Borders.LineStyle = XlContinuous;
            range.Borders.Weight = XlThin;
            range.Borders.Color = Gray;
        }
    }
}
