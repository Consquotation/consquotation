using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ConsQuotation.Core.Pricing;
using ConsQuotation.Core.Quotation;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Excel
{
    /// <summary>Làm tròn, bảng tổng hợp, điều khoản, trang in: chuyển từ excelPricingGateway.ts và excelLayoutGateway.ts.</summary>
    public sealed partial class ExcelQuoteGateway
    {
        private const int XlShiftDown = -4121;
        /// <summary>Chiều cao hàng tối đa của Excel (point); AutoFit dừng ở 409 và chữ dài hơn bị cắt khi hiển thị và in.</summary>
        private const double MaxRowHeight = 409;
        private const int XlValidateList = 3;
        private const int XlValidAlertStop = 1;
        private const int XlBetween = 1;
        private const int XlThousandsSeparator = 4;
        private const int XlDecimalSeparator = 3;
        private const int XlPortrait = 1;
        private const int XlLandscape = 2;
        private const int XlPaperA3 = 8;
        private const int XlPaperA4 = 9;
        private const int XlPaperLetter = 1;

        /// <summary>
        /// Ghi công thức từng ô trong bảng mà không để Excel tự điền cả cột: tự điền sẽ đè các ô người dùng đã sửa tay.
        /// Trả lại thiết lập của người dùng sau khi ghi.
        /// </summary>
        private static void NoAutoFill(object application, Action work)
        {
            dynamic app = application;
            bool saved = app.AutoCorrect.AutoFillFormulasInLists;
            app.AutoCorrect.AutoFillFormulasInLists = false;
            try
            {
                work();
            }
            finally
            {
                app.AutoCorrect.AutoFillFormulasInLists = saved;
            }
        }

        private static List<object?> ColumnCells(object?[,] cells)
        {
            var list = new List<object?>(cells.GetLength(0));
            for (var r = 0; r < cells.GetLength(0); r++)
            {
                list.Add(cells[r, 0]);
            }
            return list;
        }

        private sealed class RoundingTarget
        {
            public dynamic Table { get; set; } = null!;
            public string TableName { get; set; } = "";
            public string Header { get; set; } = "";
            public Func<RoundingRule, string> Build { get; set; } = _ => "";
            public RoundingRule Rule { get; set; } = Rounding.NoRounding;
        }

        public Task<RoundingApplyResult> ApplyRoundingAsync(RoundingConfig config) => ExcelBridge.Run<RoundingApplyResult>(app =>
        {
            dynamic book = Book(app);
            var targets = new List<RoundingTarget>();
            foreach (dynamic sheet in book.Worksheets)
            {
                foreach (dynamic table in sheet.ListObjects)
                {
                    string name = table.Name;
                    if (Naming.IsQuoteTableName(name))
                    {
                        targets.Add(new RoundingTarget { Table = table, TableName = name, Header = QuoteTemplate.HeaderOf(QuoteColumnKey.Amount), Build = r => QuoteTemplate.AmountFormula(r), Rule = config.Amount });
                    }
                    else if (name == Analysis.TableName)
                    {
                        targets.Add(new RoundingTarget { Table = table, TableName = name, Header = Analysis.HeaderOf(AnalysisColumnKey.UnitPrice), Build = r => Analysis.UnitPriceFormula(r), Rule = config.UnitPrice });
                    }
                    else if (Adjustments.IsSummaryTableName(name))
                    {
                        var quoteName = Adjustments.QuoteTableOfSummary(name);
                        targets.Add(new RoundingTarget { Table = table, TableName = name, Header = "Số tiền", Build = r => Adjustments.AmountFormula(quoteName, r), Rule = config.Adjustment });
                    }
                }
            }
            // Kiểm tra trước: không để Excel từ chối giữa chừng sau khi đã đổi công thức một phần.
            foreach (var target in targets)
            {
                dynamic sheet = target.Table.Parent;
                if ((bool)sheet.ProtectContents)
                {
                    throw new WorkbookException($"Sheet \"{(string)sheet.Name}\" đang được bảo vệ nên chưa đổi được công thức. Bỏ bảo vệ (Review › Unprotect Sheet) rồi thử lại.");
                }
            }
            string thousands = Convert.ToString(app.International(XlThousandsSeparator));
            string decimalSeparator = Convert.ToString(app.International(XlDecimalSeparator));
            return Quiet<RoundingApplyResult>((object)app, () =>
            {
                var result = new RoundingApplyResult();
                foreach (var target in targets)
                {
                    List<string> headers = Headers(target.Table);
                    if (!headers.Contains(target.Header) || (int)target.Table.ListRows.Count == 0)
                    {
                        continue;
                    }
                    dynamic body = target.Table.ListColumns[target.Header].DataBodyRange;
                    int rows = target.Table.ListRows.Count;
                    object?[,] formulas = ExcelWorkbookGateway.AsArray(body.Formula, rows, 1);
                    var plan = RoundingRewrite.Plan(ColumnCells(formulas), target.Build, target.Rule, target.TableName);
                    result.KeptCells += plan.Kept;
                    result.UpdatedCells += plan.Updates.Count;
                    if (plan.AllOurs && plan.Updates.Count > 0)
                    {
                        SetFormula(body, target.Build(target.Rule));
                    }
                    else if (plan.Updates.Count > 0)
                    {
                        NoAutoFill((object)app, () =>
                        {
                            foreach (var index in plan.Updates)
                            {
                                SetFormula(body.Cells[index + 1, 1], target.Build(target.Rule));
                            }
                        });
                    }
                    var money = RoundingRewrite.MoneyFormat(target.Rule);
                    foreach (var index in plan.Ours)
                    {
                        dynamic cell = body.Cells[index + 1, 1];
                        if (RoundingRewrite.IsMoneyFormat((string)cell.NumberFormat, thousands, decimalSeparator))
                        {
                            cell.NumberFormat = money;
                        }
                    }
                }
                JObject settings = ReadSettings(book);
                var serializer = JsonSerializer.Create(Core.Storage.Json.Settings);
                settings[WorkbookSettings.RoundingKey] = new JObject
                {
                    ["unitPrice"] = JToken.FromObject(config.UnitPrice, serializer),
                    ["amount"] = JToken.FromObject(config.Amount, serializer),
                    ["adjustment"] = JToken.FromObject(config.Adjustment, serializer),
                };
                SaveSettings(book, settings);
                return result;
            });
        });

        private static (Rect? Summary, Rect? Terms) OwnRects(dynamic book, string quoteTable)
        {
            Rect? summary = null;
            Rect? terms = null;
            dynamic? table = FindTable(book, Adjustments.SummaryTableName(quoteTable));
            if (table != null)
            {
                summary = (Rect)RectOf(table!.Range);
            }
            dynamic? range = TermsRange(book, quoteTable);
            if (range != null)
            {
                terms = (Rect)RectOf(range);
            }
            return (summary, terms);
        }

        /// <summary>Vùng của tên CQ_Terms_n; null nếu chưa có hoặc tên đang trỏ tới vùng đã xóa.</summary>
        private static dynamic? TermsRange(dynamic book, string quoteTable)
        {
            dynamic? name = TermsName(book, quoteTable);
            if (name == null)
            {
                return null;
            }
            try
            {
                return name!.RefersToRange;
            }
            catch (System.Runtime.InteropServices.COMException)
            {
                return null;
            }
        }

        private static dynamic? TermsName(dynamic book, string quoteTable)
        {
            var wanted = Naming.TermsNameFor(quoteTable);
            foreach (dynamic name in book.Names)
            {
                if (string.Equals((string)name.Name, wanted, StringComparison.OrdinalIgnoreCase))
                {
                    return name;
                }
            }
            return null;
        }

        public Task<SummaryState> ReadSummaryAsync(string tableName) => ExcelBridge.Run<SummaryState>(app =>
        {
            dynamic? table = FindTable(Book(app), Adjustments.SummaryTableName(tableName));
            if (table == null)
            {
                return new SummaryState();
            }
            int rows = table!.ListRows.Count;
            int columns = table.ListColumns.Count;
            var cells = new List<IReadOnlyList<object?>>();
            if (rows > 0)
            {
                object?[,] values = ExcelWorkbookGateway.AsArray(table.DataBodyRange.Value2, rows, columns);
                for (var r = 0; r < rows; r++)
                {
                    var row = new object?[columns];
                    for (var c = 0; c < columns; c++)
                    {
                        row[c] = Value(values[r, c]);
                    }
                    cells.Add(row);
                }
            }
            var parsed = Adjustments.Parse(cells);
            Rect rect = RectOf(table.Range);
            return new SummaryState { Exists = true, Adjustments = parsed.Adjustments, InvalidRows = parsed.InvalidRows.Count, Address = rect.Address };
        });

        private sealed class SummaryArea
        {
            public AreaCheck Check { get; set; } = new AreaCheck();
            public int Top { get; set; }
            public int Left { get; set; }
            public dynamic? Quote { get; set; }
            public dynamic? Existing { get; set; }
            /// <summary>Khu vực điều khoản nằm ngay dưới: chèn nguyên hàng để dời nó xuống trước khi ghi.</summary>
            public int ShiftRows { get; set; }
            public int TermsTop { get; set; }
        }

        private static SummaryArea InspectSummary(dynamic book, string quoteTableName, int adjustmentCount)
        {
            dynamic? quote = FindTable(book, quoteTableName);
            if (quote == null)
            {
                return new SummaryArea { Check = new AreaCheck { Block = AreaBlock.TableMissing } };
            }
            dynamic sheet = quote!.Parent;
            if (!QuoteTemplate.HasQuoteHeaders((List<string>)Headers(quote)))
            {
                return new SummaryArea { Check = new AreaCheck { Block = AreaBlock.HeadersChanged } };
            }
            if (!(bool)quote.ShowTotals)
            {
                return new SummaryArea { Check = new AreaCheck { Block = AreaBlock.NoTotals } };
            }
            if ((bool)sheet.ProtectContents)
            {
                return new SummaryArea { Check = new AreaCheck { Block = AreaBlock.Protected } };
            }
            dynamic? existing = FindTable(book, Adjustments.SummaryTableName(quoteTableName));
            Rect full = RectOf(quote.Range);
            Rect? own = existing == null ? (Rect?)null : (Rect)RectOf(existing!.Range);
            var width = Adjustments.Headers.Count;
            var needed = 1 + (1 + adjustmentCount) + 1;
            var top = own?.Row ?? full.Row + full.Rows + 1;
            var left = own?.Column ?? full.Column + Adjustments.FirstColumnOffset;
            var ownRows = own?.Rows ?? 0;
            // Khu vực điều khoản của add-in bên dưới không tính là "có dữ liệu"; nếu chồng lên vùng cần ghi (kể cả 1 hàng
            // trống ngăn cách) thì chèn nguyên hàng để dời nó xuống.
            (Rect? Summary, Rect? Terms) blocks = OwnRects(book, quoteTableName);
            var termsBelow = blocks.Terms != null && blocks.Terms.Value.Row >= top;
            var shiftRows = termsBelow ? Math.Max(0, top + needed + 1 - blocks.Terms!.Value.Row) : 0;
            object?[,] extra = new object?[0, 0];
            if (needed > ownRows)
            {
                var rect = new Rect { Row = top + ownRows, Column = left, Rows = needed - ownRows, Columns = width };
                extra = Formulas(sheet, rect);
                var occupied = FindOccupied(extra, rect.Row, rect.Column, termsBelow ? new[] { blocks.Terms!.Value } : null);
                if (occupied.Count > 0)
                {
                    return new SummaryArea { Check = new AreaCheck { Block = AreaBlock.Occupied, Address = Sheet.RangeAddress(top, left, needed, width), Sample = occupied.Sample } };
                }
            }
            object?[,] current = own == null ? new object?[0, 0] : (object?[,])Formulas(sheet, own.Value);
            return new SummaryArea
            {
                Check = new AreaCheck
                {
                    Address = Sheet.RangeAddress(top, left, needed, width),
                    Fingerprint = HashCells($"{full.Address}|{own?.Address}|{HashCells("", current)}", extra),
                },
                Top = top,
                Left = left,
                Quote = quote,
                Existing = existing,
                ShiftRows = shiftRows,
                TermsTop = termsBelow ? blocks.Terms!.Value.Row : 0,
            };
        }

        public Task<AreaCheck> InspectSummaryAsync(string tableName, int adjustmentCount) =>
            ExcelBridge.Run<AreaCheck>(app => ((SummaryArea)InspectSummary(Book(app), tableName, adjustmentCount)).Check);

        public Task WriteSummaryAsync(string tableName, IReadOnlyList<Adjustment> adjustments, string fingerprint) => ExcelBridge.Run<bool>(app =>
        {
            dynamic book = Book(app);
            SummaryArea area = InspectSummary(book, tableName, adjustments.Count);
            if (!area.Check.Ok || area.Check.Fingerprint != fingerprint)
            {
                throw new TargetChangedException();
            }
            RoundingConfig rounding = ReadRounding(book);
            return Quiet<bool>((object)app, () =>
            {
                dynamic sheet = area.Quote!.Parent;
                if (area.ShiftRows > 0)
                {
                    // Chèn nguyên hàng ngay trên khu vực điều khoản: mọi thứ bên dưới dời xuống đồng đều, không lệch cột nào.
                    dynamic rows = sheet.Range[sheet.Rows[area.TermsTop + 1], sheet.Rows[area.TermsTop + area.ShiftRows]];
                    rows.Insert(XlShiftDown);
                }
                var width = Adjustments.Headers.Count;
                var widths = new double[width];
                for (var c = 0; c < width; c++)
                {
                    widths[c] = sheet.Columns[area.Left + c + 1].ColumnWidth;
                }
                if (area.Existing != null)
                {
                    // Bảng tổng hợp là của add-in: xóa (kèm nội dung) rồi tạo lại đúng chỗ cũ.
                    area.Existing!.Delete();
                }
                var name = Adjustments.SummaryTableName(tableName);
                var data = Adjustments.Rows(tableName, adjustments, rounding.Adjustment);
                var header = new object[1, width];
                for (var c = 0; c < width; c++)
                {
                    header[0, c] = Adjustments.Headers[c];
                }
                Area(sheet, area.Top, area.Left, 1, width).Value2 = header;
                // Tạo Table trước rồi mới ghi: công thức [@[…]] chỉ hợp lệ bên trong Table.
                dynamic table = sheet.ListObjects.Add(XlSrcRange, Area(sheet, area.Top, area.Left, 1 + data.Count, width), Type.Missing, XlYes);
                table.Name = name;
                dynamic body = table.DataBodyRange;
                var money = RoundingRewrite.MoneyFormat(rounding.Adjustment);
                ((dynamic)table.ListColumns["Số tiền"]).DataBodyRange.NumberFormat = money;
                ((dynamic)table.ListColumns["Lũy kế"]).DataBodyRange.NumberFormat = money;
                for (var r = 0; r < data.Count; r++)
                {
                    for (var c = 0; c < width; c++)
                    {
                        Put(body.Cells[r + 1, c + 1], data[r][c]);
                    }
                }

                // Bật dòng tổng: Excel chèn một hàng và đẩy ô bên dưới (trong các cột của bảng) xuống; hàng bị đẩy là hàng
                // trống đã kiểm tra, xóa nó để dữ liệu bên dưới về đúng chỗ.
                table.ShowTotals = true;
                var totalRow = area.Top + 1 + data.Count;
                dynamic pushed = Area(sheet, totalRow + 1, area.Left, 1, width);
                if (FindOccupied(ExcelWorkbookGateway.AsArray(pushed.Formula, 1, width), 0, 0).Count > 0)
                {
                    throw new WorkbookException("Excel đã chèn dòng tổng nhưng hàng ngay bên dưới không trống như dự kiến; add-in dừng lại.");
                }
                pushed.Delete(XlShiftUp);
                dynamic totals = table.TotalsRowRange;
                var totalCells = new[] { Adjustments.TotalLabel, "", "", "", Adjustments.TotalFormula(name), "" };
                for (var c = 0; c < width; c++)
                {
                    dynamic cell = totals.Cells[1, c + 1];
                    SetFormula(cell, totalCells[c]);
                }
                totals.NumberFormat = "General";
                totals.Cells[1, 5].NumberFormat = money;
                totals.Font.Bold = true;

                // Danh sách chọn để người dùng sửa trực tiếp trên sheet không gõ sai.
                AddList(table, "Loại", new[] { Adjustments.BaseKindLabel, Adjustments.KindLabel(AdjustmentKind.Deduct), Adjustments.KindLabel(AdjustmentKind.Add) });
                AddList(table, "Cách tính", new[]
                {
                    Adjustments.BaseMethodLabel,
                    Adjustments.MethodLabel(AdjustmentMethod.PercentOfRunning),
                    Adjustments.MethodLabel(AdjustmentMethod.PercentOfBase),
                    Adjustments.MethodLabel(AdjustmentMethod.Fixed),
                });
                for (var c = 0; c < width; c++)
                {
                    sheet.Columns[area.Left + c + 1].ColumnWidth = widths[c];
                }
                // Tổng thật nằm ở bảng tổng hợp: đổi nhãn dòng tổng của báo giá thành "Cộng" (nếu chưa bị sửa).
                RelabelQuoteTotal(area.Quote!, Adjustments.TotalLabel, Adjustments.QuoteSubtotalLabel);
                return true;
            });
        });

        private static void AddList(dynamic table, string header, IReadOnlyList<string> options)
        {
            dynamic column = table.ListColumns[header].DataBodyRange;
            var joined = string.Join(",", options);
            column.Validation.Delete();
            column.Validation.Add(XlValidateList, XlValidAlertStop, XlBetween, joined);
            column.Validation.InCellDropdown = true;
            column.Validation.ErrorTitle = $"{header} không hợp lệ";
            column.Validation.ErrorMessage = $"Chọn một trong: {string.Join(", ", options)}.";
            column.Validation.ShowError = true;
        }

        /// <summary>Đổi nhãn ô "Nội dung công việc" ở dòng tổng của bảng báo giá, chỉ khi đang đúng nhãn cũ.</summary>
        private static void RelabelQuoteTotal(dynamic quote, string from, string to)
        {
            List<string> headers = Headers(quote);
            var column = headers.IndexOf(QuoteTemplate.HeaderOf(QuoteColumnKey.Description));
            dynamic cell = quote.TotalsRowRange.Cells[1, column + 1];
            if (column >= 0 && (object?)cell.Value2 is string text && text == from)
            {
                cell.Value2 = to;
            }
        }

        public Task RemoveSummaryAsync(string tableName) => ExcelBridge.Run<bool>(app =>
        {
            dynamic book = Book(app);
            dynamic? table = FindTable(book, Adjustments.SummaryTableName(tableName));
            dynamic? quote = FindTable(book, tableName);
            if (table != null)
            {
                table!.Delete();
            }
            if (quote != null && (bool)quote!.ShowTotals)
            {
                RelabelQuoteTotal(quote, Adjustments.QuoteSubtotalLabel, Adjustments.TotalLabel);
            }
            return true;
        });

        public Task<int> SetUnitPricesAsync(IReadOnlyList<UnitPriceFix> fixes)
        {
            if (fixes.Count == 0)
            {
                return Task.FromResult(0);
            }
            return ExcelBridge.Run<int>(app =>
            {
                dynamic book = Book(app);
                var cells = new List<(UnitPriceFix Fix, dynamic Cell)>();
                foreach (var fix in fixes)
                {
                    dynamic? sheet = FindSheet(book, fix.SheetName);
                    if (sheet == null)
                    {
                        throw new TargetChangedException();
                    }
                    dynamic cell = sheet!.Range[fix.Address];
                    if (!SameCell((object?)cell.Value2, fix.Expected))
                    {
                        throw new TargetChangedException();
                    }
                    cells.Add((fix, cell));
                }
                foreach (var (fix, cell) in cells)
                {
                    cell.Value2 = fix.Value;
                }
                return cells.Count;
            });
        }

        private sealed class Geometry
        {
            public dynamic Table { get; set; } = null!;
            public dynamic Sheet { get; set; } = null!;
            public string SheetName { get; set; } = "";
            public bool SheetProtected { get; set; }
            public int HeaderRow { get; set; }
            public int Left { get; set; }
            public int Width { get; set; }
            /// <summary>Hàng ngay sau dòng cuối của bảng báo giá (kể cả dòng tổng).</summary>
            public int TableBottom { get; set; }
            public int Top { get; set; }
            public Rect Quote { get; set; }
            public Rect? Summary { get; set; }
            public Rect? Terms { get; set; }
        }

        private static Geometry? GeometryOf(dynamic book, string quoteTable)
        {
            dynamic? table = FindTable(book, quoteTable);
            if (table == null)
            {
                return null;
            }
            dynamic sheet = table!.Parent;
            Rect full = RectOf(table.Range);
            var first = Math.Max(0, full.Row - QuoteInfo.ScanRows);
            int? titleRow = null;
            int? firstInfoRow = null;
            if (full.Row > first)
            {
                var count = full.Row - first;
                object?[,] above = ExcelWorkbookGateway.AsArray(Area(sheet, first, full.Column, count, 1).Value2, count, 1);
                for (var r = 0; r < count; r++)
                {
                    if (titleRow == null && above[r, 0] is string text && text == QuoteTemplate.Title)
                    {
                        titleRow = first + r;
                    }
                    if (firstInfoRow == null && QuoteTemplate.InfoLabels.Any(label => QuoteInfo.LabelMatches(above[r, 0], label)))
                    {
                        firstInfoRow = first + r;
                    }
                }
            }
            (Rect? Summary, Rect? Terms) own = OwnRects(book, quoteTable);
            return new Geometry
            {
                Table = table,
                Sheet = sheet,
                SheetName = sheet.Name,
                SheetProtected = sheet.ProtectContents,
                HeaderRow = full.Row,
                Left = full.Column,
                Width = full.Columns,
                TableBottom = full.Row + full.Rows,
                Top = PrintLayout.QuoteTopRow(full.Row, titleRow, firstInfoRow),
                Quote = full,
                Summary = own.Summary,
                Terms = own.Terms,
            };
        }

        public Task<TermsState> ReadTermsAsync(string tableName) => ExcelBridge.Run<TermsState>(app =>
        {
            Geometry? geo = GeometryOf(Book(app), tableName);
            if (geo?.Terms == null)
            {
                return new TermsState();
            }
            var terms = geo.Terms.Value;
            dynamic labels = Area(geo.Sheet, terms.Row, geo.Left, terms.Rows, 1);
            dynamic texts = Area(geo.Sheet, terms.Row, geo.Left + Terms.TextColumnOffset, terms.Rows, 1);
            object?[,] labelCells = ExcelWorkbookGateway.AsArray(labels.Value2, terms.Rows, 1);
            object?[,] textCells = ExcelWorkbookGateway.AsArray(texts.Value2, terms.Rows, 1);
            return new TermsState
            {
                Exists = true,
                Sections = Terms.Parse(ColumnCells(labelCells), ColumnCells(textCells)),
                Address = Sheet.RangeAddress(terms.Row, geo.Left, terms.Rows, geo.Width),
            };
        });

        private sealed class TermsArea
        {
            public AreaCheck Check { get; set; } = new AreaCheck();
            public Geometry? Geo { get; set; }
            public int Top { get; set; }
        }

        private static TermsArea InspectTerms(dynamic book, string tableName, int rowCount)
        {
            Geometry? geo = GeometryOf(book, tableName);
            if (geo == null)
            {
                return new TermsArea { Check = new AreaCheck { Block = AreaBlock.TableMissing } };
            }
            if (geo.SheetProtected)
            {
                return new TermsArea { Check = new AreaCheck { Block = AreaBlock.Protected }, Geo = geo };
            }
            var above = geo.Summary != null ? geo.Summary.Value.Row + geo.Summary.Value.Rows : geo.TableBottom;
            var top = geo.Terms?.Row ?? above + 1;
            var ownRows = geo.Terms?.Rows ?? 0;
            object?[,] existing = geo.Terms == null ? new object?[0, 0]
                : (object?[,])Formulas(geo.Sheet, new Rect { Row = geo.Terms.Value.Row, Column = geo.Left, Rows = geo.Terms.Value.Rows, Columns = geo.Width });
            object?[,] extra = new object?[0, 0];
            if (rowCount > ownRows)
            {
                var rect = new Rect { Row = top + ownRows, Column = geo.Left, Rows = rowCount - ownRows, Columns = geo.Width };
                extra = Formulas(geo.Sheet, rect);
                var occupied = FindOccupied(extra, rect.Row, rect.Column);
                if (occupied.Count > 0)
                {
                    return new TermsArea { Check = new AreaCheck { Block = AreaBlock.Occupied, Sample = occupied.Sample }, Geo = geo, Top = top };
                }
            }
            return new TermsArea
            {
                Check = new AreaCheck
                {
                    Address = Sheet.RangeAddress(top, geo.Left, rowCount, geo.Width),
                    Fingerprint = HashCells($"{top}|{geo.Left}|{geo.Width}|{HashCells("", existing)}", extra),
                },
                Geo = geo,
                Top = top,
            };
        }

        public Task<AreaCheck> InspectTermsAsync(string tableName, int rowCount) =>
            ExcelBridge.Run<AreaCheck>(app => ((TermsArea)InspectTerms(Book(app), tableName, rowCount)).Check);

        /// <summary>Xóa nội dung và định dạng add-in đã đặt cho khu vực điều khoản cũ.</summary>
        private static void ClearTermsBlock(dynamic sheet, Rect rect)
        {
            dynamic range = Area(sheet, rect.Row, rect.Column, rect.Rows, rect.Columns);
            range.ClearContents();
            range.WrapText = false;
            range.Font.Bold = false;
            range.Rows.AutoFit();
        }

        public Task<List<string>> WriteTermsAsync(string tableName, IReadOnlyList<TermsSection> sections, string fingerprint) => ExcelBridge.Run<List<string>>(app =>
        {
            dynamic book = Book(app);
            var rows = Terms.Rows(sections);
            TermsArea area = InspectTerms(book, tableName, rows.Count);
            if (!area.Check.Ok || area.Check.Fingerprint != fingerprint || area.Geo == null)
            {
                throw new TargetChangedException();
            }
            var geo = area.Geo;
            return Quiet<List<string>>((object)app, () =>
            {
                dynamic sheet = geo.Sheet;
                if (geo.Terms != null)
                {
                    ClearTermsBlock(sheet, new Rect { Row = geo.Terms.Value.Row, Column = geo.Left, Rows = geo.Terms.Value.Rows, Columns = geo.Width });
                }
                for (var r = 0; r < rows.Count; r++)
                {
                    dynamic label = At(sheet, area.Top + r, geo.Left);
                    label.Value2 = rows[r].Label;
                    label.Font.Bold = true;
                    label.VerticalAlignment = XlTop;
                    dynamic text = At(sheet, area.Top + r, geo.Left + Terms.TextColumnOffset);
                    if (rows[r].Text != "")
                    {
                        text.Value2 = rows[r].Text;
                    }
                    text.WrapText = true;
                    text.VerticalAlignment = XlTop;
                }
                dynamic block = Area(sheet, area.Top, geo.Left, rows.Count, geo.Width);
                dynamic? old = TermsName(book, tableName);
                if (old != null)
                {
                    old!.Delete();
                }
                dynamic added = book.Names.Add(Naming.TermsNameFor(tableName), block);
                added.Comment = "Khu vực ghi chú/điều khoản của ConsQuotation";
                block.Rows.AutoFit();
                var clipped = new List<string>();
                for (var r = 0; r < rows.Count; r++)
                {
                    if (Convert.ToDouble((object)sheet.Rows[area.Top + r + 1].RowHeight) >= MaxRowHeight)
                    {
                        clipped.Add(rows[r].Label.TrimEnd(':'));
                    }
                }
                return clipped;
            });
        });

        public Task RemoveTermsAsync(string tableName) => ExcelBridge.Run<bool>(app =>
        {
            dynamic book = Book(app);
            Geometry? geo = GeometryOf(book, tableName);
            if (geo?.Terms == null)
            {
                return true;
            }
            if (geo.SheetProtected)
            {
                throw new WorkbookException($"Sheet \"{geo.SheetName}\" đang được bảo vệ.");
            }
            ClearTermsBlock(geo.Sheet, new Rect { Row = geo.Terms.Value.Row, Column = geo.Left, Rows = geo.Terms.Value.Rows, Columns = geo.Width });
            dynamic? name = TermsName(book, tableName);
            name?.Delete();
            return true;
        });

        private static string QuoteArea(Geometry geo)
        {
            var rects = new List<CellRect>
            {
                new CellRect(geo.Top, geo.Left, 1, geo.Width),
                new CellRect(geo.Quote.Row, geo.Quote.Column, geo.Quote.Rows, geo.Quote.Columns),
            };
            if (geo.Summary != null)
            {
                rects.Add(new CellRect(geo.Summary.Value.Row, geo.Summary.Value.Column, geo.Summary.Value.Rows, geo.Summary.Value.Columns));
            }
            if (geo.Terms != null)
            {
                rects.Add(new CellRect(geo.Terms.Value.Row, geo.Terms.Value.Column, geo.Terms.Value.Rows, geo.Terms.Value.Columns));
            }
            var area = PrintLayout.Bounding(rects);
            return Sheet.RangeAddress(area.RowIndex, area.ColumnIndex, area.RowCount, area.ColumnCount);
        }

        private static int? IntOrNull(object? value) => value is int i ? i : value is double d ? (int)d : (int?)null;

        private static string StripDollars(object? value) => (value as string ?? "").Replace("$", "");

        public Task<PrintSetupState> ReadPrintSetupAsync(string tableName) => ExcelBridge.Run<PrintSetupState>(app =>
        {
            Geometry? geo = GeometryOf(Book(app), tableName);
            if (geo == null)
            {
                throw new WorkbookException("Không tìm thấy bảng báo giá (có thể vừa bị xóa hoặc đổi tên). Bấm Làm mới rồi chọn lại bảng.");
            }
            dynamic page = geo.Sheet.PageSetup;
            // COM trả các giá trị này dạng double hoặc int tùy thuộc tính.
            int orientation = Convert.ToInt32((object)page.Orientation);
            int paper = Convert.ToInt32((object)page.PaperSize);
            return new PrintSetupState
            {
                SheetName = geo.SheetName,
                QuoteArea = QuoteArea(geo),
                SheetProtected = geo.SheetProtected,
                Current = new PrintCurrent
                {
                    PrintArea = StripDollars((object?)page.PrintArea),
                    TitleRows = StripDollars((object?)page.PrintTitleRows),
                    Orientation = orientation == XlLandscape ? PageOrientationKind.Landscape : PageOrientationKind.Portrait,
                    Paper = paper == XlPaperA4 ? PaperKind.A4 : paper == XlPaperA3 ? PaperKind.A3 : paper == XlPaperLetter ? PaperKind.Letter : (PaperKind?)null,
                    PaperCode = paper,
                    FitWide = IntOrNull((object?)page.FitToPagesWide),
                    FitTall = IntOrNull((object?)page.FitToPagesTall),
                    Scale = IntOrNull((object?)page.Zoom),
                    Footer = page.CenterFooter,
                },
            };
        });

        public Task<string> ApplyPrintSetupAsync(string tableName, PrintOptions options) => ExcelBridge.Run<string>(app =>
        {
            Geometry? geo = GeometryOf(Book(app), tableName);
            if (geo == null)
            {
                throw new WorkbookException("Không tìm thấy bảng báo giá (có thể vừa bị xóa hoặc đổi tên). Bấm Làm mới rồi chọn lại bảng.");
            }
            // Kiểm tra trước: không để Excel từ chối giữa chừng sau khi đã ghi một phần thiết lập.
            if (geo.SheetProtected)
            {
                throw new WorkbookException($"Sheet \"{geo.SheetName}\" đang được bảo vệ. Bỏ bảo vệ (Review › Unprotect Sheet) rồi thử lại.");
            }
            var area = QuoteArea(geo);
            return Quiet<string>((object)app, () =>
            {
                dynamic page = geo.Sheet.PageSetup;
                page.PrintArea = area;
                if (options.RepeatHeader)
                {
                    var row = geo.HeaderRow + 1;
                    page.PrintTitleRows = $"${row}:${row}";
                }
                page.Orientation = options.Orientation == PageOrientationKind.Landscape ? XlLandscape : XlPortrait;
                page.PaperSize = options.Paper == PaperKind.A3 ? XlPaperA3 : options.Paper == PaperKind.Letter ? XlPaperLetter : XlPaperA4;
                if (options.Fit == FitKind.None)
                {
                    page.Zoom = 100;
                }
                else
                {
                    page.Zoom = false;
                    page.FitToPagesWide = 1;
                    // false: số trang dọc tự động.
                    page.FitToPagesTall = options.Fit == FitKind.Page ? (object)1 : false;
                }
                page.CenterHorizontally = options.CenterHorizontally;
                if (options.PageNumbers)
                {
                    page.CenterFooter = PrintLayout.PageNumberFooter;
                }
                else if ((string)page.CenterFooter == PrintLayout.PageNumberFooter)
                {
                    // Chỉ gỡ chân trang do add-in đặt; chân trang người dùng tự đặt được giữ nguyên.
                    page.CenterFooter = "";
                }
                if (options.WrapLongText)
                {
                    // Cột chữ dài: xuống dòng để khi in không bị cắt.
                    List<string> headers = Headers(geo.Table);
                    foreach (var key in new[] { QuoteColumnKey.Description, QuoteColumnKey.Notes })
                    {
                        var header = QuoteTemplate.HeaderOf(key);
                        if (headers.Contains(header) && (int)geo.Table.ListRows.Count > 0)
                        {
                            geo.Table.ListColumns[header].DataBodyRange.WrapText = true;
                        }
                    }
                    // Dòng tiêu đề cũng xuống dòng: cột người dùng tự thêm thường hẹp.
                    geo.Table.HeaderRowRange.WrapText = true;
                    geo.Table.HeaderRowRange.Rows.AutoFit();
                    if ((int)geo.Table.ListRows.Count > 0)
                    {
                        geo.Table.DataBodyRange.Rows.AutoFit();
                    }
                }
                return area;
            });
        });
    }
}
