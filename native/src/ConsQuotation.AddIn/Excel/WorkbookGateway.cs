using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using ConsQuotation.Core.Exchange;
using ExcelDna.Integration;

namespace ConsQuotation.Excel
{
    public sealed class SheetSummary
    {
        public string Name { get; set; } = "";
        public int RowCount { get; set; }
        public int ColumnCount { get; set; }
    }

    public sealed class TableSummary
    {
        public string Name { get; set; } = "";
        public string SheetName { get; set; } = "";
        public int RowCount { get; set; }
    }

    /// <summary>Workbook đang mở trong Excel: danh sách sheet, Excel Table và thông tin bản xuất (nếu có).</summary>
    public sealed class WorkbookInfo
    {
        public string WorkbookName { get; set; } = "";
        public string ActiveSheet { get; set; } = "";
        public List<SheetSummary> Sheets { get; set; } = new List<SheetSummary>();
        public List<TableSummary> Tables { get; set; } = new List<TableSummary>();
        /// <summary>Sheet "Thông tin" của bản xuất thư viện ConsQuotation; null nếu không phải.</summary>
        public WorkbookBackupCheck? Backup { get; set; }
    }

    public sealed class SheetRead
    {
        public SourceTable Table { get; set; } = new SourceTable();
        /// <summary>Số dòng của vùng có dữ liệu (có thể nhiều hơn số dòng đã đọc).</summary>
        public int TotalRows { get; set; }
    }

    /// <summary>Đọc workbook đang mở và mở workbook mới. Giao diện chỉ dùng interface này (test thay bằng bản giả).</summary>
    public interface IWorkbookGateway
    {
        Task<WorkbookInfo> ListAsync();
        Task<SheetRead> ReadSheetAsync(string workbookName, string sheetName, int maxRows);
        Task<SheetRead> ReadTableAsync(string workbookName, string tableName, int maxRows);
        /// <summary>Mở workbook mới, chưa lưu, có nội dung của file .xlsx đã dựng.</summary>
        Task OpenNewWorkbookAsync(byte[] xlsx, string baseName);
    }

    /// <summary>Lỗi đọc/ghi workbook có thông báo tiếng Việt cho người dùng.</summary>
    public sealed class WorkbookException : Exception
    {
        public WorkbookException(string message) : base(message)
        {
        }
    }

    /// <summary>
    /// Đọc/ghi workbook qua mô hình đối tượng COM của Excel, chuyển từ excelWorkbookGateway.ts. Chỉ đọc khi
    /// nhập; không sửa sheet hay bảng của người dùng. Mọi lệnh chạy trên luồng chính của Excel (ExcelBridge).
    /// </summary>
    public sealed class ExcelWorkbookGateway : IWorkbookGateway
    {
        private const int XlFormulas = -4123;
        private const int XlPart = 2;
        private const int XlByRows = 1;
        private const int XlByColumns = 2;
        private const int XlNext = 1;
        private const int XlPrevious = 2;
        private const int MetaRows = 20;

        public Task<WorkbookInfo> ListAsync() => ExcelBridge.Run<WorkbookInfo>(app =>
        {
            dynamic? workbook = app.ActiveWorkbook;
            if (workbook == null)
            {
                throw new WorkbookException("Chưa có workbook nào đang mở trong Excel.");
            }
            var info = new WorkbookInfo { WorkbookName = workbook.Name, ActiveSheet = ActiveSheetName(workbook) };
            foreach (dynamic sheet in workbook.Worksheets)
            {
                var bounds = Bounds(sheet);
                info.Sheets.Add(new SheetSummary
                {
                    Name = sheet.Name,
                    RowCount = bounds?.RowCount ?? 0,
                    ColumnCount = bounds?.ColumnCount ?? 0,
                });
                foreach (dynamic table in sheet.ListObjects)
                {
                    info.Tables.Add(new TableSummary { Name = table.Name, SheetName = sheet.Name, RowCount = table.ListRows.Count });
                }
            }
            if (info.Sheets.Exists(s => s.Name == ExchangeSchema.MetaSheetName))
            {
                var meta = ReadUsed(workbook.Worksheets[ExchangeSchema.MetaSheetName], ExchangeSchema.MetaSheetName, MetaRows);
                var check = Backup.CheckBackupMeta(meta.Table.Rows);
                info.Backup = check.Kind == WorkbookBackupKind.Backup ? check : null;
            }
            return info;
        });

        public Task<SheetRead> ReadSheetAsync(string workbookName, string sheetName, int maxRows) => ExcelBridge.Run<SheetRead>(app =>
        {
            dynamic workbook = FindWorkbook(app, workbookName);
            dynamic? sheet = null;
            foreach (dynamic s in workbook.Worksheets)
            {
                if ((string)s.Name == sheetName)
                {
                    sheet = s;
                }
            }
            if (sheet == null)
            {
                throw new WorkbookException($"Không tìm thấy sheet \"{sheetName}\". Bấm Làm mới danh sách sheet rồi chọn lại.");
            }
            return ReadUsed(sheet, sheetName, maxRows);
        });

        public Task<SheetRead> ReadTableAsync(string workbookName, string tableName, int maxRows) => ExcelBridge.Run<SheetRead>(app =>
        {
            dynamic workbook = FindWorkbook(app, workbookName);
            foreach (dynamic sheet in workbook.Worksheets)
            {
                foreach (dynamic table in sheet.ListObjects)
                {
                    if ((string)table.Name != tableName)
                    {
                        continue;
                    }
                    // Cả bảng (tiêu đề + dữ liệu, không gồm dòng tổng) để nhận diện dòng tiêu đề như với sheet.
                    dynamic header = table.HeaderRowRange;
                    if (header == null)
                    {
                        throw new WorkbookException($"Bảng \"{tableName}\" đang tắt dòng tiêu đề. Bật Header Row rồi đọc lại.");
                    }
                    int rowCount = (int)table.ListRows.Count + 1;
                    return ReadArea(sheet, (int)header.Row, (int)header.Column, rowCount, (int)header.Columns.Count, maxRows,
                        $"Bảng \"{tableName}\" (sheet \"{(string)sheet.Name}\")");
                }
            }
            throw new WorkbookException($"Không tìm thấy bảng \"{tableName}\". Bấm Làm mới danh sách sheet rồi chọn lại.");
        });

        public async Task OpenNewWorkbookAsync(byte[] xlsx, string baseName)
        {
            // Mở file làm mẫu (Workbooks.Add): Excel tạo workbook mới chưa lưu, giống Excel.createWorkbook của bản web.
            var folder = Path.Combine(Path.GetTempPath(), "ConsQuotation", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            var path = Path.Combine(folder, baseName + ".xlsx");
            File.WriteAllBytes(path, xlsx);
            try
            {
                await ExcelBridge.Run(app =>
                {
                    app.Workbooks.Add(path);
                    return true;
                });
            }
            finally
            {
                try
                {
                    Directory.Delete(folder, recursive: true);
                }
                catch (IOException)
                {
                    // File tạm còn bị giữ: để Windows dọn thư mục Temp.
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
        }

        private static string ActiveSheetName(dynamic workbook)
        {
            try
            {
                return workbook.ActiveSheet.Name;
            }
            catch (Exception)
            {
                return "";
            }
        }

        private static dynamic FindWorkbook(dynamic app, string name)
        {
            foreach (dynamic workbook in app.Workbooks)
            {
                if ((string)workbook.Name == name)
                {
                    return workbook;
                }
            }
            throw new WorkbookException($"Workbook \"{name}\" không còn mở. Bấm Làm mới danh sách sheet.");
        }

        internal sealed class Area
        {
            public int FirstRow { get; set; }
            public int FirstColumn { get; set; }
            public int RowCount { get; set; }
            public int ColumnCount { get; set; }
        }

        private static dynamic? Find(dynamic cells, dynamic after, int order, int direction) =>
            cells.Find(What: "*", After: after, LookIn: XlFormulas, LookAt: XlPart, SearchOrder: order, SearchDirection: direction, MatchCase: false);

        /// <summary>
        /// Vùng có dữ liệu (ô có giá trị hoặc công thức), như getUsedRange(valuesOnly) của bản web. UsedRange của
        /// COM gồm cả ô chỉ có định dạng nên không dùng.
        /// </summary>
        internal static Area? Bounds(dynamic sheet)
        {
            dynamic cells = sheet.Cells;
            dynamic first = cells[1, 1];
            dynamic lastRow = Find(cells, first, XlByRows, XlPrevious);
            if (lastRow == null)
            {
                return null;
            }
            dynamic lastColumn = Find(cells, first, XlByColumns, XlPrevious);
            dynamic end = cells[(int)cells.Rows.Count, (int)cells.Columns.Count];
            dynamic firstRow = Find(cells, end, XlByRows, XlNext);
            dynamic firstColumn = Find(cells, end, XlByColumns, XlNext);
            var area = new Area { FirstRow = firstRow.Row, FirstColumn = firstColumn.Column };
            area.RowCount = (int)lastRow.Row - area.FirstRow + 1;
            area.ColumnCount = (int)lastColumn.Column - area.FirstColumn + 1;
            return area;
        }

        private static SheetRead ReadUsed(dynamic sheet, string sheetName, int maxRows)
        {
            var label = $"Sheet \"{sheetName}\"";
            var bounds = Bounds(sheet);
            if (bounds == null)
            {
                return new SheetRead { Table = new SourceTable { Label = label } };
            }
            return ReadArea(sheet, bounds.FirstRow, bounds.FirstColumn, bounds.RowCount, bounds.ColumnCount, maxRows, label);
        }

        /// <summary>
        /// Đọc vùng thành RawCell (chỉ đọc). Số giữ nguyên giá trị kèm chữ hiển thị; ô Excel hiểu là ngày được
        /// đổi sang ngày ISO; ô lỗi (#N/A…) lấy chữ hiển thị.
        /// </summary>
        private static SheetRead ReadArea(dynamic sheet, int firstRow, int firstColumn, int rowCount, int columnCount, int maxRows, string label)
        {
            var rowsToRead = Math.Min(rowCount, maxRows);
            var table = new SourceTable { Label = label, FirstRowNumber = firstRow, FirstColumnIndex = firstColumn - 1 };
            if (rowsToRead > 0 && columnCount > 0)
            {
                dynamic range = sheet.Range[sheet.Cells[firstRow, firstColumn], sheet.Cells[firstRow + rowsToRead - 1, firstColumn + columnCount - 1]];
                var raw = AsArray(range.Value2, rowsToRead, columnCount);
                // Value (khác Value2) trả DateTime cho ô định dạng ngày.
                var typed = AsArray(range.Value, rowsToRead, columnCount);
                for (var r = 0; r < rowsToRead; r++)
                {
                    var row = new List<RawCell?>(columnCount);
                    for (var c = 0; c < columnCount; c++)
                    {
                        var value = raw[r, c];
                        switch (value)
                        {
                            case null:
                            case string s when s == "":
                                row.Add(new RawCell(null));
                                break;
                            case double d:
                                string text = range.Cells[r + 1, c + 1].Text;
                                row.Add(new RawCell(d, text, typed[r, c] is DateTime ? Cells.ExcelSerialToIso(d) : null));
                                break;
                            case int _:
                                // Value2 trả mã lỗi dạng số nguyên cho ô #N/A, #VALUE!…
                                row.Add(new RawCell((string)range.Cells[r + 1, c + 1].Text));
                                break;
                            default:
                                row.Add(new RawCell(value));
                                break;
                        }
                    }
                    table.Rows.Add(row);
                }
            }
            return new SheetRead { Table = table, TotalRows = rowCount };
        }

        /// <summary>Mảng 0-based từ giá trị COM (mảng 1-based, hoặc một giá trị khi vùng chỉ có một ô).</summary>
        internal static object?[,] AsArray(object? value, int rows, int columns)
        {
            var result = new object?[rows, columns];
            if (value is object[,] array)
            {
                int r0 = array.GetLowerBound(0), c0 = array.GetLowerBound(1);
                for (var r = 0; r < rows; r++)
                {
                    for (var c = 0; c < columns; c++)
                    {
                        result[r, c] = array[r0 + r, c0 + c];
                    }
                }
            }
            else
            {
                result[0, 0] = value;
            }
            return result;
        }
    }

    /// <summary>Chạy lệnh Excel trên luồng chính (Excel chỉ cho gọi mô hình đối tượng từ luồng đó).</summary>
    internal static class ExcelBridge
    {
        public static Task<T> Run<T>(Func<dynamic, T> work)
        {
            var done = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
            ExcelAsyncUtil.QueueAsMacro(() =>
            {
                try
                {
                    done.SetResult(work(ExcelDnaUtil.Application));
                }
                catch (Exception ex)
                {
                    done.SetException(ex);
                }
            });
            return done.Task;
        }
    }
}
