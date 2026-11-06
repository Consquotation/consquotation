using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Storage;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ConsQuotation.Core.Quotation
{
    public enum QuotationStatus
    {
        Draft,
        Completed,
    }

    public enum QuotationPricingMethod
    {
        Manual,
        Library,
        Norm,
    }

    public enum CalculationStatus
    {
        Valid,
        ValidWithWarnings,
        Invalid,
    }

    public enum ItemIssueCode
    {
        MissingQuantity,
        InvalidQuantity,
        NegativeQuantity,
        MissingUnitPrice,
        InvalidUnitPrice,
        NegativeUnitPrice,
        AmountMismatch,
        AnalysisMissing,
        AnalysisIncomplete,
        AnalysisError,
        ComponentUnitMismatch,
        BreakdownMismatch,
        BreakdownEdited,
        Overflow,
        LibraryPriceChanged,
        LibraryMissing,
        NormVersionChanged,
        ResourceChanged,
        NoTrace,
        SheetCheck,
    }

    /// <summary>Thành phần hao phí của dòng phân tích định mức, chụp lại lúc chèn.</summary>
    public sealed class QuotationComponent
    {
        public ResourceType ResourceType { get; set; }
        public string? ResourceId { get; set; }
        public string ResourceCodeSnapshot { get; set; } = "";
        public string ResourceNameSnapshot { get; set; } = "";
        public string UnitSnapshot { get; set; } = "";
        public decimal BaseConsumption { get; set; }
        public decimal WasteRate { get; set; }
        public decimal AppliedConsumption { get; set; }
        public string? PriceId { get; set; }
        public decimal? UnitPriceSnapshot { get; set; }
        public string PriceUnitSnapshot { get; set; } = "";
        public string Currency { get; set; } = "";
        public string SourceReference { get; set; } = "";

        public QuotationComponent Shallow() => (QuotationComponent)MemberwiseClone();
    }

    public sealed class ItemSource
    {
        public string? WorkItemId { get; set; }
        public string? NormId { get; set; }
        public string NormCode { get; set; } = "";
        public string NormVersion { get; set; } = "";
    }

    public sealed class LibraryPriceSnapshot
    {
        public string WorkItemId { get; set; } = "";
        public decimal UnitPrice { get; set; }
        public string Currency { get; set; } = "";
    }

    public sealed class ItemIssue
    {
        public ItemIssueCode Code { get; set; }
        public IssueSeverity Severity { get; set; }
        public string Message { get; set; } = "";
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string? Hint { get; set; }
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string? ResourceCode { get; set; }
    }

    /// <summary>Kết quả tính của một dòng; null = không tính được (không bao giờ thay bằng 0).</summary>
    public sealed class QuotationPricingResult
    {
        public decimal? MaterialCost { get; set; }
        public decimal? LaborCost { get; set; }
        public decimal? MachineCost { get; set; }
        public decimal? OtherCost { get; set; }
        public decimal? UnitPrice { get; set; }
        public decimal? Quantity { get; set; }
        public decimal? Amount { get; set; }
        public string RoundingPolicy { get; set; } = "";
        public CalculationStatus Status { get; set; }
        public List<ItemIssue> Issues { get; set; } = new List<ItemIssue>();
        public string CalculatedAt { get; set; } = "";
        public string CalculationVersion { get; set; } = "";
    }

    /// <summary>Đơn giá theo loại tài nguyên; null = chưa có.</summary>
    public sealed class CostBreakdown
    {
        public decimal? Material { get; set; }
        public decimal? Labor { get; set; }
        public decimal? Machine { get; set; }
        public decimal? Other { get; set; }

        public decimal? this[ResourceType type]
        {
            get => type == ResourceType.Material ? Material : type == ResourceType.Labor ? Labor : type == ResourceType.Machine ? Machine : Other;
            set
            {
                if (type == ResourceType.Material)
                {
                    Material = value;
                }
                else if (type == ResourceType.Labor)
                {
                    Labor = value;
                }
                else if (type == ResourceType.Machine)
                {
                    Machine = value;
                }
                else
                {
                    Other = value;
                }
            }
        }

        public CostBreakdown Copy() => (CostBreakdown)MemberwiseClone();
    }

    public sealed class QuotationItemRecord
    {
        /// <summary>Trùng giá trị cột "Mã dòng" trên bảng báo giá.</summary>
        public string Id { get; set; } = "";
        public QuotationPricingMethod PricingMethod { get; set; }
        public string WorkCode { get; set; } = "";
        public string WorkName { get; set; } = "";
        public string Unit { get; set; } = "";
        public ItemSource? Source { get; set; }
        public LibraryPriceSnapshot? LibraryPrice { get; set; }
        public List<QuotationComponent> Components { get; set; } = new List<QuotationComponent>();
        public QuotationPricingResult? Result { get; set; }
        /// <summary>Đơn giá thành phần add-in đã ghi lên sheet; khác giá trị hiện tại → người dùng đã sửa tay.</summary>
        public CostBreakdown? WrittenBreakdown { get; set; }
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";

        public QuotationItemRecord Shallow() => (QuotationItemRecord)MemberwiseClone();
    }

    public sealed class QuotationRecord
    {
        public int SchemaVersion { get; set; }
        public string Id { get; set; } = "";
        public string TableName { get; set; } = "";
        public QuotationStatus Status { get; set; }
        public string? CompletedAt { get; set; }
        /// <summary>Vân tay nội dung bảng lúc hoàn tất; khác lúc kiểm tra → báo giá đã bị sửa sau khi hoàn tất.</summary>
        public string? CompletedFingerprint { get; set; }
        public string CreatedAt { get; set; } = "";
        public string UpdatedAt { get; set; } = "";
        public List<QuotationItemRecord> Items { get; set; } = new List<QuotationItemRecord>();

        public QuotationRecord Shallow() => (QuotationRecord)MemberwiseClone();
    }

    public enum RecordReadKind
    {
        None,
        Ok,
        Unreadable,
    }

    /// <summary>Hồ sơ đọc từ workbook. Unreadable: hỏng hoặc của phiên bản mới hơn, không được ghi đè.</summary>
    public sealed class RecordRead
    {
        public RecordReadKind Kind { get; set; }
        public QuotationRecord? Record { get; set; }
        public string Message { get; set; } = "";

        public static RecordRead None() => new RecordRead { Kind = RecordReadKind.None };
        public static RecordRead Ok(QuotationRecord record) => new RecordRead { Kind = RecordReadKind.Ok, Record = record };
        public static RecordRead Unreadable(string message) => new RecordRead { Kind = RecordReadKind.Unreadable, Message = message };
    }

    /// <summary>
    /// Hồ sơ báo giá (ADR-0014), chuyển từ src/domain/quotation/model.ts: phần dữ liệu ô Excel không chứa
    /// được, lưu trong workbook dưới dạng Custom XML Part. Nguồn sự thật của khối lượng, đơn giá, thành tiền
    /// vẫn là sheet. Định dạng XML giữ nguyên để hồ sơ của bản web đọc được và ngược lại.
    /// </summary>
    public static class QuotationXml
    {
        public const int SchemaVersion = 1;
        public const string Namespace = "urn:consquotation:quotation";
        public const string CalculationVersion = "quote-line-1";

        private static readonly Regex Root = new Regex(@"<(?:\w+:)?quotation\b[^>]*>");
        private static readonly Regex TableAttribute = new Regex("\\btable=\"([^\"]*)\"");
        private static readonly Regex DetachTarget = new Regex("(<(?:\\w+:)?quotation\\b[^>]*\\btable=\")([^\"]*)(\")");
        private static readonly Regex Data = new Regex(@"<(?:\w+:)?data(?:\s[^>]*)?>([\s\S]*?)</(?:\w+:)?data>");
        private static readonly Regex Entity = new Regex("&(#x[0-9a-fA-F]+|#\\d+|lt|gt|amp|quot|apos);");

        public static QuotationRecord NewRecord(string id, string tableName, string now) => new QuotationRecord
        {
            SchemaVersion = SchemaVersion,
            Id = id,
            TableName = tableName,
            Status = QuotationStatus.Draft,
            CreatedAt = now,
            UpdatedAt = now,
        };

        private static string EscapeXml(string text) => text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

        private static string UnescapeXml(string text) => Entity.Replace(text, m =>
        {
            var entity = m.Groups[1].Value;
            switch (entity)
            {
                case "lt":
                    return "<";
                case "gt":
                    return ">";
                case "amp":
                    return "&";
                case "quot":
                    return "\"";
                case "apos":
                    return "'";
            }
            var code = entity[1] == 'x'
                ? int.Parse(entity.Substring(2), NumberStyles.HexNumber, CultureInfo.InvariantCulture)
                : int.Parse(entity.Substring(1), CultureInfo.InvariantCulture);
            return char.ConvertFromUtf32(code);
        });

        /// <summary>XML của Custom XML Part: một phần tử gốc theo namespace, dữ liệu là JSON trong phần tử data.</summary>
        public static string Encode(QuotationRecord record)
        {
            var table = EscapeXml(record.TableName).Replace("\"", "&quot;");
            return $"<quotation xmlns=\"{Namespace}\" schemaVersion=\"{record.SchemaVersion}\" table=\"{table}\">" +
                   $"<data>{EscapeXml(Json.Serialize(record, indented: false))}</data></quotation>";
        }

        /// <summary>Tên bảng ở thuộc tính phần tử gốc: tìm được hồ sơ của bảng kể cả khi JSON hỏng hoặc của schema mới hơn.</summary>
        public static string? TableOf(string xml)
        {
            var root = Root.Match(xml);
            var table = root.Success ? TableAttribute.Match(root.Value) : Match.Empty;
            return table.Success ? UnescapeXml(table.Groups[1].Value) : null;
        }

        /// <summary>
        /// Tách hồ sơ khỏi tên bảng (giữ nguyên dữ liệu): dùng khi tạo bảng mới trùng tên với bảng đã xóa, để bảng
        /// mới không nhận nhầm id, trạng thái, mục của báo giá cũ.
        /// </summary>
        public static string Detach(string xml, string now) =>
            DetachTarget.Replace(xml, m => $"{m.Groups[1].Value}{m.Groups[2].Value}#tách {now}{m.Groups[3].Value}", 1);

        /// <summary>Đọc hồ sơ. Hồ sơ của phiên bản mới hơn hoặc sai cấu trúc bị từ chối, để không ghi đè dữ liệu không hiểu.</summary>
        public static RecordRead Decode(string xml)
        {
            var match = Data.Match(xml);
            if (!match.Success)
            {
                return RecordRead.Unreadable("Hồ sơ báo giá trong workbook không đúng cấu trúc.");
            }
            JObject raw;
            try
            {
                using (var reader = new JsonTextReader(new System.IO.StringReader(UnescapeXml(match.Groups[1].Value))) { FloatParseHandling = FloatParseHandling.Decimal, DateParseHandling = DateParseHandling.None })
                {
                    if (!(JToken.ReadFrom(reader) is JObject parsed))
                    {
                        return RecordRead.Unreadable("Hồ sơ báo giá thiếu phiên bản schema.");
                    }
                    raw = parsed;
                }
            }
            catch (JsonException)
            {
                return RecordRead.Unreadable("Hồ sơ báo giá trong workbook bị hỏng (không đọc được JSON).");
            }
            return Migrate(raw);
        }

        private static bool IsString(JToken? t) => t?.Type == JTokenType.String;
        private static bool IsNullToken(JToken? t) => t?.Type == JTokenType.Null;
        private static bool IsNumber(JToken? t) => t?.Type == JTokenType.Integer || t?.Type == JTokenType.Float;
        private static bool StringOrNull(JToken? t) => IsString(t) || IsNullToken(t);
        private static bool NumberOrNull(JToken? t) => IsNumber(t) || IsNullToken(t);
        private static bool ObjectOrNull(JToken? t) => t?.Type == JTokenType.Object || IsNullToken(t);

        private static bool ValidComponent(JToken c) =>
            c is JObject o &&
            IsString(o["resourceType"]) && new[] { "material", "labor", "machine", "other" }.Contains((string)o["resourceType"]!) &&
            StringOrNull(o["resourceId"]) && IsString(o["resourceCodeSnapshot"]) && IsString(o["resourceNameSnapshot"]) && IsString(o["unitSnapshot"]) &&
            IsNumber(o["baseConsumption"]) && IsNumber(o["wasteRate"]) && IsNumber(o["appliedConsumption"]) &&
            StringOrNull(o["priceId"]) && NumberOrNull(o["unitPriceSnapshot"]) && IsString(o["priceUnitSnapshot"]) &&
            IsString(o["currency"]) && IsString(o["sourceReference"]);

        private static bool ValidItem(JToken item) =>
            item is JObject o &&
            IsString(o["id"]) && (string)o["id"]! != "" &&
            IsString(o["pricingMethod"]) && new[] { "manual", "library", "norm" }.Contains((string)o["pricingMethod"]!) &&
            IsString(o["workCode"]) && IsString(o["workName"]) && IsString(o["unit"]) &&
            ObjectOrNull(o["source"]) && ObjectOrNull(o["libraryPrice"]) &&
            o["components"] is JArray components && components.All(ValidComponent) &&
            ObjectOrNull(o["result"]) && ObjectOrNull(o["writtenBreakdown"]) &&
            IsString(o["createdAt"]) && IsString(o["updatedAt"]);

        /// <summary>Kiểm tra cấu trúc và nâng cấp hồ sơ lên schema hiện tại. Hiện chỉ có schema 1.</summary>
        public static RecordRead Migrate(JObject raw)
        {
            if (!IsNumber(raw["schemaVersion"]))
            {
                return RecordRead.Unreadable("Hồ sơ báo giá thiếu phiên bản schema.");
            }
            var version = (decimal)raw["schemaVersion"]!;
            if (version > SchemaVersion)
            {
                return RecordRead.Unreadable($"Hồ sơ báo giá được tạo bởi phiên bản ConsQuotation mới hơn (schema {version.ToString(CultureInfo.InvariantCulture)}). Hãy cập nhật add-in; add-in không ghi đè hồ sơ này.");
            }
            var status = raw["status"]?.Type == JTokenType.String ? (string)raw["status"]! : "";
            var items = raw["items"] as JArray;
            var valid = version >= 1 &&
                        IsString(raw["id"]) && IsString(raw["tableName"]) &&
                        (status == "draft" || status == "completed") &&
                        StringOrNull(raw["completedAt"]) && StringOrNull(raw["completedFingerprint"]) &&
                        IsString(raw["createdAt"]) && IsString(raw["updatedAt"]) &&
                        items != null && items.All(ValidItem) &&
                        items.Select(i => (string)i["id"]!).Distinct().Count() == items.Count;
            if (!valid)
            {
                return RecordRead.Unreadable("Hồ sơ báo giá trong workbook sai cấu trúc.");
            }
            try
            {
                var record = raw.ToObject<QuotationRecord>(JsonSerializer.Create(Json.Settings));
                return record != null ? RecordRead.Ok(record) : RecordRead.Unreadable("Hồ sơ báo giá trong workbook sai cấu trúc.");
            }
            catch (Exception ex) when (ex is JsonException || ex is ArgumentException || ex is FormatException || ex is OverflowException)
            {
                return RecordRead.Unreadable("Hồ sơ báo giá trong workbook sai cấu trúc.");
            }
        }
    }
}
