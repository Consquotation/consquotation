using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Storage;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Exchange
{
    public sealed class BackupMeta
    {
        public string ExportedAt { get; set; } = "";
        public string AppVersion { get; set; } = "";
        /// <summary>Tên thư viện người dùng đặt.</summary>
        public string LibraryName { get; set; } = "";
    }

    /// <summary>Nội dung file sao lưu .json (giống BackupFile của bản web).</summary>
    public sealed class BackupFile
    {
        public string Format { get; set; } = ExchangeSchema.Format;
        public int SchemaVersion { get; set; } = ExchangeSchema.Version;
        public string ExportedAt { get; set; } = "";
        public string AppVersion { get; set; } = "";
        public BackupLibrary Library { get; set; } = new BackupLibrary();
        public LibrarySnapshot Data { get; set; } = new LibrarySnapshot();
    }

    public sealed class BackupLibrary
    {
        public string Name { get; set; } = "";
    }

    public sealed class ParsedBackupMeta
    {
        public int SchemaVersion { get; set; }
        public string ExportedAt { get; set; } = "";
        public string AppVersion { get; set; } = "";
        public string LibraryName { get; set; } = "";
    }

    /// <summary>Kết quả đọc file sao lưu: các bộ dữ liệu nhập, hoặc thông báo lỗi.</summary>
    public sealed class ParsedBackup
    {
        public bool Ok => Message == null;
        public string? Message { get; set; }
        public ParsedBackupMeta Meta { get; set; } = new ParsedBackupMeta();
        public List<ImportDataset> Datasets { get; set; } = new List<ImportDataset>();
    }

    public sealed class ExportColumn
    {
        public ExportColumn(int width, bool text)
        {
            Width = width;
            Text = text;
        }

        public int Width { get; }
        /// <summary>Định dạng @ để Excel không tự đổi "007" thành 7.</summary>
        public bool Text { get; }
    }

    /// <summary>Một sheet của workbook xuất: ô là string, decimal, int hoặc null.</summary>
    public sealed class ExportSheet
    {
        public string Name { get; set; } = "";
        public List<ExportColumn> Columns { get; set; } = new List<ExportColumn>();
        public List<object?[]> Rows { get; set; } = new List<object?[]>();
        public int HeaderRows { get; set; }
    }

    public enum WorkbookBackupKind
    {
        NotBackup,
        Backup,
        Unsupported,
    }

    public sealed class WorkbookBackupCheck
    {
        public WorkbookBackupKind Kind { get; set; }
        public int SchemaVersion { get; set; }
        public string ExportedAt { get; set; } = "";
        public string LibraryName { get; set; } = "";
        public string Message { get; set; } = "";
    }

    /// <summary>
    /// Sao lưu và xuất thư viện theo schema (prompts/09, ADR-0004), chuyển từ backup.ts. JSON là bản đầy đủ
    /// nhất (giữ id, thời điểm tạo/sửa); workbook mỗi loại một sheet, tham chiếu bằng mã. Chỉ xuất dữ liệu
    /// thư viện, không xuất cài đặt nội bộ.
    /// </summary>
    public static class Backup
    {
        public static string ToBackupJson(LibrarySnapshot library, BackupMeta meta) => Json.Serialize(new BackupFile
        {
            ExportedAt = meta.ExportedAt,
            AppVersion = meta.AppVersion,
            Library = new BackupLibrary { Name = meta.LibraryName },
            Data = library,
        }, indented: true);

        /// <summary>"ConsQuotation-thu-vien-2026-10-21-0930.json" theo giờ máy.</summary>
        public static string BackupFileName(DateTime localNow, string extension) =>
            $"ConsQuotation-thu-vien-{localNow.ToString("yyyy-MM-dd-HHmm", CultureInfo.InvariantCulture)}.{extension}";

        private static RawCell Cell(JToken? value)
        {
            switch (value?.Type)
            {
                case null:
                case JTokenType.Null:
                case JTokenType.Undefined:
                    return new RawCell(null);
                case JTokenType.String:
                    return new RawCell((string)value!);
                case JTokenType.Integer:
                case JTokenType.Float:
                    try
                    {
                        return new RawCell((decimal)value!);
                    }
                    catch (OverflowException)
                    {
                        return new RawCell(value!.ToString(Formatting.None));
                    }
                case JTokenType.Boolean:
                    return new RawCell((bool)value!);
                default:
                    // Kiểu lạ (mảng, object): đưa về chữ để báo lỗi kiểu dữ liệu ở bước kiểm tra.
                    return new RawCell(value!.ToString(Formatting.None));
            }
        }

        private static string? Str(JToken? value) => value?.Type == JTokenType.String ? (string)value! : null;

        private static bool TryInteger(JToken? value, out int version)
        {
            version = 0;
            if (value == null || (value.Type != JTokenType.Integer && value.Type != JTokenType.Float))
            {
                return false;
            }
            var number = (decimal)value;
            if (number != decimal.Truncate(number) || number < int.MinValue || number > int.MaxValue)
            {
                return false;
            }
            version = (int)number;
            return true;
        }

        private static string? CheckVersion(string? format, bool isInteger, int version)
        {
            if (format != ExchangeSchema.Format)
            {
                return "Đây không phải file sao lưu thư viện ConsQuotation.";
            }
            if (!isInteger || version < 1)
            {
                return "File sao lưu thiếu hoặc sai schemaVersion.";
            }
            if (version > ExchangeSchema.Version)
            {
                return $"File được tạo bởi phiên bản ConsQuotation mới hơn (schema {version}). Hãy cập nhật add-in; không nhập để tránh mất dữ liệu.";
            }
            return null;
        }

        /// <summary>
        /// Sheet của workbook xuất ứng với loại dữ liệu nào. Bản xuất schema 1–2 có sheet "Định mức" chứa dòng
        /// định mức kiểu cũ (Mã công tác, Mã tài nguyên, Hao phí) → đọc như thành phần định mức.
        /// </summary>
        public static List<(DatasetKind Kind, string SheetName)> BackupSheetKinds(int schemaVersion)
        {
            if (schemaVersion >= 3)
            {
                return ExchangeSchema.Kinds.Select(kind => (kind, ExchangeSchema.Datasets[kind].SheetName)).ToList();
            }
            return ExchangeSchema.Kinds.Where(kind => kind != DatasetKind.NormComponents)
                .Select(kind => (kind == DatasetKind.Norms ? DatasetKind.NormComponents : kind, ExchangeSchema.Datasets[kind].SheetName))
                .ToList();
        }

        private static JToken ParseJson(string text)
        {
            using (var reader = new JsonTextReader(new StringReader(text))
            {
                FloatParseHandling = FloatParseHandling.Decimal,
                DateParseHandling = DateParseHandling.None,
            })
            {
                var token = JToken.ReadFrom(reader);
                if (reader.Read())
                {
                    throw new JsonReaderException("Có nội dung thừa sau JSON.");
                }
                return token;
            }
        }

        /// <summary>Đọc file sao lưu JSON thành các bộ dữ liệu nhập; tham chiếu id được đổi sang mã.</summary>
        public static ParsedBackup ParseBackupJson(string text)
        {
            JToken parsed;
            try
            {
                parsed = ParseJson(text.TrimStart('﻿'));
            }
            catch (JsonException)
            {
                return new ParsedBackup { Message = "File JSON không đọc được (sai cú pháp)." };
            }
            if (!(parsed is JObject root))
            {
                return new ParsedBackup { Message = "Đây không phải file sao lưu thư viện ConsQuotation." };
            }
            var isInteger = TryInteger(root["schemaVersion"], out var version);
            var versionProblem = CheckVersion(Str(root["format"]), isInteger, version);
            if (versionProblem != null)
            {
                return new ParsedBackup { Message = versionProblem };
            }
            var data = root["data"] as JObject ?? new JObject();
            List<JToken> List(DatasetKind kind) => data[kind.Key()] is JArray array ? array.ToList() : new List<JToken>();

            Dictionary<string, JToken?> ById(DatasetKind kind, string field)
            {
                var map = new Dictionary<string, JToken?>();
                foreach (var x in List(kind).OfType<JObject>())
                {
                    var id = Str(x["id"]);
                    if (id != null)
                    {
                        map[id] = x[field];
                    }
                }
                return map;
            }

            var resourceCodeById = ById(DatasetKind.Resources, "code");
            var workItemCodeById = ById(DatasetKind.WorkItems, "code");
            // v2: nhóm và nhà cung cấp tham chiếu bằng id trong file; đổi sang tên như dạng bảng.
            var categoryNameById = ById(DatasetKind.Categories, "name");
            var supplierNameById = ById(DatasetKind.Suppliers, "name");

            // v3: định mức có id; thành phần trỏ tới định mức bằng normId.
            var normById = new Dictionary<string, JObject>();
            foreach (var n in version >= 3 ? List(DatasetKind.Norms).OfType<JObject>() : Enumerable.Empty<JObject>())
            {
                var id = Str(n["id"]);
                if (id != null)
                {
                    normById[id] = n;
                }
            }
            // v1/v2: "norms" là dòng định mức kiểu cũ (công tác, tài nguyên, hao phí) → thành phần.
            List<JToken> RecordsFor(DatasetKind kind)
            {
                if (version >= 3)
                {
                    return List(kind);
                }
                if (kind == DatasetKind.Norms)
                {
                    return new List<JToken>();
                }
                return kind == DatasetKind.NormComponents ? List(DatasetKind.Norms) : List(kind);
            }

            var datasets = ExchangeSchema.Kinds.Select(kind =>
            {
                var fields = ExchangeSchema.Datasets[kind].Fields.Select(f => f.Key).ToList();
                var rows = RecordsFor(kind).Select((token, i) => ReadRecord(kind, version, token, i, fields,
                    resourceCodeById, workItemCodeById, categoryNameById, supplierNameById, normById)).ToList();
                return new ImportDataset
                {
                    Kind = kind,
                    SourceLabel = $"JSON: {ExchangeSchema.Datasets[kind].SheetName}",
                    MappedFields = fields,
                    ColumnLabels = fields.ToDictionary(key => key, key => $"trường \"{key}\""),
                    Rows = rows,
                };
            }).Where(d => d.Rows.Count > 0).ToList();

            var library = root["library"] as JObject;
            return new ParsedBackup
            {
                Meta = new ParsedBackupMeta
                {
                    SchemaVersion = version,
                    ExportedAt = Str(root["exportedAt"]) ?? "",
                    AppVersion = Str(root["appVersion"]) ?? "",
                    LibraryName = library == null ? "" : Str(library["name"]) ?? "",
                },
                Datasets = datasets,
            };
        }

        private static ImportRow ReadRecord(DatasetKind kind, int version, JToken token, int index, List<string> fields,
            Dictionary<string, JToken?> resourceCodeById, Dictionary<string, JToken?> workItemCodeById,
            Dictionary<string, JToken?> categoryNameById, Dictionary<string, JToken?> supplierNameById,
            Dictionary<string, JObject> normById)
        {
            var rowLabel = $"Bản ghi {index + 1}";
            if (!(token is JObject record))
            {
                return new ImportRow { RowLabel = rowLabel, PreErrors = new List<PreError> { new PreError(null, "Bản ghi không phải object.") } };
            }
            var cells = fields.ToDictionary(key => key, key => (RawCell?)Cell(record[key]));
            var preErrors = new List<PreError>();

            // Tham chiếu nhóm/nhà cung cấp: v1 ghi tên nhóm ở "group"; v2 ghi id ở "categoryId"/"supplierId".
            void ResolveRef(string idKey, string cellKey, Dictionary<string, JToken?> names, string what)
            {
                var id = record[idKey];
                if (id == null || id.Type == JTokenType.Null || (id.Type == JTokenType.String && (string)id! == ""))
                {
                    cells[cellKey] = Cell(null);
                }
                else if (id.Type == JTokenType.String && names.TryGetValue((string)id!, out var name))
                {
                    cells[cellKey] = Cell(name);
                }
                else
                {
                    cells[cellKey] = Cell(null);
                    var shown = id.Type == JTokenType.String ? (string)id! : id.ToString(Formatting.None);
                    preErrors.Add(new PreError(cellKey, $"Tham chiếu {what} id \"{shown}\" không có trong file."));
                }
            }

            if (kind == DatasetKind.WorkItems)
            {
                if (version < 2)
                {
                    cells["category"] = Cell(record["group"]);
                    cells["supplier"] = Cell(null);
                }
                else
                {
                    ResolveRef("categoryId", "category", categoryNameById, "nhóm");
                    ResolveRef("supplierId", "supplier", supplierNameById, "nhà cung cấp");
                }
            }
            if (kind == DatasetKind.Resources)
            {
                if (version < 2)
                {
                    cells["category"] = Cell(null);
                }
                else
                {
                    ResolveRef("categoryId", "category", categoryNameById, "nhóm");
                }
            }
            if (kind == DatasetKind.ResourcePrices)
            {
                if (version < 2)
                {
                    cells["supplier"] = Cell(null);
                }
                else
                {
                    ResolveRef("supplierId", "supplier", supplierNameById, "nhà cung cấp");
                }
            }
            SnapshotMeta? snapshot = null;
            if (kind == DatasetKind.Norms)
            {
                ResolveRef("categoryId", "category", categoryNameById, "nhóm");
                var workItemId = Str(record["workItemId"]) ?? "";
                if (workItemId != "" && !workItemCodeById.ContainsKey(workItemId))
                {
                    preErrors.Add(new PreError("workItemCode", $"Tham chiếu công tác id \"{workItemId}\" không có trong file."));
                }
                cells["workItemCode"] = Cell(workItemId != "" && workItemCodeById.TryGetValue(workItemId, out var code) ? code : null);
            }
            if (kind == DatasetKind.NormComponents)
            {
                if (version >= 3)
                {
                    normById.TryGetValue(Str(record["normId"]) ?? "", out var owner);
                    if (owner == null)
                    {
                        var shown = record["normId"] == null ? "undefined" : record["normId"]!.Type == JTokenType.String ? (string)record["normId"]! : record["normId"]!.ToString(Formatting.None);
                        preErrors.Add(new PreError("normCode", $"Tham chiếu định mức id \"{shown}\" không có trong file."));
                    }
                    cells["normCode"] = Cell(owner?["code"]);
                    cells["version"] = Cell(owner?["version"]);
                    var wasteRate = record["wasteRate"];
                    cells["wastePercent"] = wasteRate != null && (wasteRate.Type == JTokenType.Integer || wasteRate.Type == JTokenType.Float)
                        ? new RawCell(DecimalMath.Normalize((decimal)wasteRate * 100m))
                        : Cell(wasteRate);
                    var codeSnapshot = Str(record["resourceCodeSnapshot"]);
                    if (codeSnapshot != null)
                    {
                        snapshot = new SnapshotMeta
                        {
                            Code = codeSnapshot,
                            Name = Str(record["resourceNameSnapshot"]) ?? "",
                            Unit = Str(record["resourceUnitSnapshot"]) ?? "",
                            Type = ParseResourceTypeKey(Str(record["resourceTypeSnapshot"])),
                        };
                    }
                }
                else
                {
                    // Dòng kiểu cũ: mã định mức = mã công tác; phiên bản để trống (add-in tạo phiên bản "1").
                    var workItemId = Str(record["workItemId"]) ?? "";
                    if (!workItemCodeById.ContainsKey(workItemId))
                    {
                        preErrors.Add(new PreError("normCode", $"Tham chiếu công tác id \"{workItemId}\" không có trong file."));
                    }
                    cells["normCode"] = Cell(workItemCodeById.TryGetValue(workItemId, out var code) ? code : null);
                    cells["version"] = Cell(null);
                    cells["consumption"] = Cell(record["quantity"]);
                    cells["wastePercent"] = Cell(null);
                }
            }
            if (kind == DatasetKind.ResourcePrices || kind == DatasetKind.NormComponents)
            {
                var resourceId = Str(record["resourceId"]) ?? "";
                if (!resourceCodeById.ContainsKey(resourceId))
                {
                    preErrors.Add(new PreError("resourceCode", $"Tham chiếu tài nguyên id \"{resourceId}\" không có trong file."));
                }
                cells["resourceCode"] = Cell(resourceCodeById.TryGetValue(resourceId, out var code) ? code : null);
            }
            return new ImportRow
            {
                RowLabel = rowLabel,
                Cells = cells,
                Meta = new ImportMeta
                {
                    Snapshot = snapshot,
                    PriceId = kind == DatasetKind.NormComponents ? Str(record["priceId"]) : null,
                    Id = Str(record["id"]),
                    CreatedAt = Str(record["createdAt"]),
                    UpdatedAt = Str(record["updatedAt"]),
                },
                PreErrors = preErrors.Count > 0 ? preErrors : null,
            };
        }

        /// <summary>Khóa loại tài nguyên trong JSON ("material"…); lạ hoặc thiếu → Khác.</summary>
        private static ResourceType ParseResourceTypeKey(string? key)
        {
            foreach (ResourceType type in Enum.GetValues(typeof(ResourceType)))
            {
                var name = type.ToString();
                if (key == char.ToLowerInvariant(name[0]) + name.Substring(1))
                {
                    return type;
                }
            }
            return ResourceType.Other;
        }

        // ---------- Workbook ----------

        private static readonly Comparer<string> Codes = Comparer<string>.Create(Search.CompareCodes);

        private static ExportSheet DataSheet(DatasetKind kind, IEnumerable<object?[]> rows)
        {
            var def = ExchangeSchema.Datasets[kind];
            var sheet = new ExportSheet
            {
                Name = def.SheetName,
                // Cột chữ (mã, tên, ngày ISO…) định dạng @ để Excel không tự đổi "007" thành 7 khi gõ thêm.
                Columns = def.Fields.Select(field => new ExportColumn(field.Width, field.Type != FieldType.Number)).ToList(),
                HeaderRows = 1,
            };
            sheet.Rows.Add(def.Fields.Select(field => (object?)field.Header).ToArray());
            sheet.Rows.AddRange(rows);
            return sheet;
        }

        /// <summary>Các sheet của workbook xuất. Thư viện rỗng → file mẫu chỉ có tiêu đề.</summary>
        public static List<ExportSheet> ExportSheets(LibrarySnapshot library, BackupMeta meta)
        {
            var resourceCode = MapById(library.Resources, r => r.Id, r => r.Code);
            var workItemCode = MapById(library.WorkItems, w => w.Id, w => w.Code);
            var categoryName = MapById(library.Categories, c => c.Id, c => c.Name);
            var supplierName = MapById(library.Suppliers, s => s.Id, s => s.Name);
            string? Cat(string? id) => id != null && categoryName.TryGetValue(id, out var name) ? name : null;
            string? Sup(string? id) => id != null && supplierName.TryGetValue(id, out var name) ? name : null;
            var byName = Comparer<string>.Create(Search.CompareText);

            var categories = library.Categories.OrderBy(c => c.Name, byName).Select(c => new object?[] { c.Name, c.Notes });
            var suppliers = library.Suppliers.OrderBy(s => s.Name, byName).Select(s => new object?[] { s.Name, s.ContactInfo, s.Notes });
            var workItems = library.WorkItems.OrderBy(w => w.Code, Codes).Select(w => new object?[]
            {
                w.Code, w.Name, Cat(w.CategoryId), w.Unit, w.Description, w.UnitPrice, w.Currency, Sup(w.SupplierId), w.Source,
                w.EffectiveFrom, w.EffectiveTo, w.Notes,
            });
            var resources = library.Resources.OrderBy(r => r.Code, Codes).Select(r => new object?[]
            {
                r.Code, r.Name, ExchangeSchema.ResourceTypeLabels[r.Type], Cat(r.CategoryId), r.Unit, r.Notes,
            });
            var prices = library.ResourcePrices
                .Select(p => (p, code: resourceCode.TryGetValue(p.ResourceId, out var c) ? c : ""))
                .OrderBy(x => x.code, Codes).ThenBy(x => x.p.EffectiveFrom ?? "", StringComparer.Ordinal)
                .Select(x => new object?[]
                {
                    x.code, x.p.Price, x.p.Unit, x.p.Currency, x.p.EffectiveFrom, x.p.EffectiveTo, Sup(x.p.SupplierId), x.p.Source,
                    ExchangeSchema.PriceStatusLabels[x.p.Status], x.p.Notes,
                });
            string YesNo(bool v) => v ? ExchangeSchema.Yes : ExchangeSchema.No;
            var norms = library.Norms.OrderBy(n => n.Code, Codes).ThenBy(n => n.Version, Codes).Select(n => new object?[]
            {
                n.Code, n.Name, n.Unit, Cat(n.CategoryId), n.Version, n.EffectiveFrom, ExchangeSchema.NormSourceTypeLabels[n.SourceType],
                n.Source, YesNo(n.SourceVerified), ExchangeSchema.NormStatusLabels[n.Status], YesNo(n.WasteIncluded),
                n.WorkItemId != null && workItemCode.TryGetValue(n.WorkItemId, out var wc) ? wc : null, n.Notes,
            });
            var normById = MapById(library.Norms, n => n.Id, n => n);
            var components = library.NormComponents
                .Select(c => (c, n: normById.TryGetValue(c.NormId, out var norm) ? norm : null,
                    r: resourceCode.TryGetValue(c.ResourceId, out var rc) ? rc : c.ResourceCodeSnapshot))
                .OrderBy(x => x.n?.Code ?? "", Codes).ThenBy(x => x.n?.Version ?? "", Codes).ThenBy(x => x.c.SortOrder)
                .Select(x => new object?[]
                {
                    x.n?.Code ?? "", x.n?.Version ?? "", x.r, x.c.Consumption,
                    x.c.WasteRate == 0 ? (object?)null : DecimalMath.Normalize(x.c.WasteRate * 100m), x.c.SortOrder, x.c.Notes,
                });

            var metaSheet = new ExportSheet
            {
                Name = ExchangeSchema.MetaSheetName,
                Columns = new List<ExportColumn> { new ExportColumn(16, true), new ExportColumn(90, true) },
                Rows = new List<object?[]>
                {
                    new object?[] { "format", ExchangeSchema.Format },
                    new object?[] { "schemaVersion", ExchangeSchema.Version.ToString(CultureInfo.InvariantCulture) },
                    new object?[] { "exportedAt", meta.ExportedAt },
                    new object?[] { "appVersion", meta.AppVersion },
                    new object?[] { "libraryName", meta.LibraryName },
                    new object?[] { null, null },
                    new object?[] { "Hướng dẫn", "Thư viện ConsQuotation. Lưu workbook này bằng File › Save As vào nơi an toàn (OneDrive, ổ đĩa ngoài)." },
                    new object?[] { null, "Khôi phục: mở workbook này trong Excel, mở ConsQuotation › Thư viện › Nhập/Xuất › Đọc workbook đang mở." },
                    new object?[] { null, "Không đổi tên sheet hay tiêu đề cột. Ngày dạng yyyy-mm-dd hoặc dd/mm/yyyy. Giá và định mức tham chiếu bằng mã; nhóm và nhà cung cấp tham chiếu bằng tên." },
                },
                HeaderRows = 0,
            };

            return new List<ExportSheet>
            {
                metaSheet,
                DataSheet(DatasetKind.Categories, categories),
                DataSheet(DatasetKind.Suppliers, suppliers),
                DataSheet(DatasetKind.WorkItems, workItems),
                DataSheet(DatasetKind.Resources, resources),
                DataSheet(DatasetKind.ResourcePrices, prices),
                DataSheet(DatasetKind.Norms, norms),
                DataSheet(DatasetKind.NormComponents, components),
            };
        }

        /// <summary>Như new Map(items.map(...)) của JavaScript: id trùng thì bản ghi sau thắng.</summary>
        private static Dictionary<string, TValue> MapById<T, TValue>(IEnumerable<T> items, Func<T, string> id, Func<T, TValue> value)
        {
            var map = new Dictionary<string, TValue>();
            foreach (var item in items)
            {
                map[id(item)] = value(item);
            }
            return map;
        }

        /// <summary>Đọc sheet "Thông tin": workbook có phải bản xuất thư viện ConsQuotation không.</summary>
        public static WorkbookBackupCheck CheckBackupMeta(IEnumerable<IReadOnlyList<RawCell?>> metaRows)
        {
            var values = new Dictionary<string, string>();
            foreach (var row in metaRows)
            {
                var key = Cells.ParseText(row.Count > 0 ? row[0] : null);
                if (key != "")
                {
                    values[key] = Cells.ParseText(row.Count > 1 ? row[1] : null);
                }
            }
            if (!values.TryGetValue("format", out var format) || format != ExchangeSchema.Format)
            {
                return new WorkbookBackupCheck { Kind = WorkbookBackupKind.NotBackup };
            }
            // Như Number() của JavaScript: "3" và "3.0" đều là 3.
            var isInteger = decimal.TryParse(values.TryGetValue("schemaVersion", out var v) ? v : "", NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out var number) && number == decimal.Truncate(number) && number <= int.MaxValue;
            var version = isInteger ? (int)number : 0;
            var problem = CheckVersion(ExchangeSchema.Format, isInteger, version);
            if (problem != null)
            {
                return new WorkbookBackupCheck { Kind = WorkbookBackupKind.Unsupported, Message = problem };
            }
            return new WorkbookBackupCheck
            {
                Kind = WorkbookBackupKind.Backup,
                SchemaVersion = version,
                ExportedAt = values.TryGetValue("exportedAt", out var at) ? at : "",
                LibraryName = values.TryGetValue("libraryName", out var name) ? name : "",
            };
        }

        /// <summary>Sheet dữ liệu của workbook xuất: tiêu đề ở dòng đầu, map theo tên cột chuẩn.</summary>
        public static ImportDataset DatasetFromBackupSheet(DatasetKind kind, SourceTable table)
        {
            var headerIndex = table.Rows.Count > 0 ? 0 : -1;
            var headers = headerIndex < 0 ? new List<string>() : Source.HeaderTexts(table, headerIndex);
            return Source.DatasetFromTable(table, headerIndex, kind, Source.AutoMap(kind, headers));
        }
    }
}
