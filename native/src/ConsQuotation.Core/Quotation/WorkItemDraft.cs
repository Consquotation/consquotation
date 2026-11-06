using System.Collections.Generic;
using System.Globalization;
using ConsQuotation.Core.Library;
using ConsQuotation.Core.Numbers;
using ConsQuotation.Core.Pricing;

namespace ConsQuotation.Core.Quotation
{
    public sealed class WorkItemDraftInput
    {
        public string Code { get; set; } = "";
        public string Group { get; set; } = "";
        public string Description { get; set; } = "";
        public string Unit { get; set; } = "";
        public string Quantity { get; set; } = "";
        public string UnitPrice { get; set; } = "";
        public string Notes { get; set; } = "";
    }

    public static class DraftFields
    {
        public const string Description = "description";
        public const string Quantity = "quantity";
        public const string UnitPrice = "unitPrice";
    }

    public sealed class DraftValidation
    {
        public bool Ok => Errors.Count == 0;
        public List<FieldError> Errors { get; } = new List<FieldError>();
        /// <summary>Một dòng giá trị theo thứ tự QuoteTemplate.Columns: string hoặc decimal. "" = để trống.</summary>
        public object[] Row { get; set; } = new object[0];
    }

    /// <summary>
    /// Công tác nhập trước khi ghi vào bảng, chuyển từ src/domain/workItemDraft.ts. Không tự suy diễn giá trị
    /// thiếu: ô trống được ghi là trống, không phải 0.
    /// </summary>
    public static class WorkItemDraft
    {
        /// <summary>
        /// Excel tự "hiểu" chữ ghi vào ô: "=…" thành công thức, "007" thành 7, "1/2" thành ngày. Tiền tố ' giữ
        /// đúng nguyên văn dưới dạng chữ; dấu nháy không hiện trong ô.
        /// </summary>
        public static string AsLiteralText(string text) => text == "" ? "" : "'" + text;

        public static DraftValidation Validate(WorkItemDraftInput input, string tableName, RoundingRule? amountRule = null)
        {
            var result = new DraftValidation();
            if (input.Description.Trim() == "")
            {
                result.Errors.Add(new FieldError(DraftFields.Description, "Nhập nội dung công việc."));
            }
            var quantity = Number(input.Quantity, DraftFields.Quantity, "Khối lượng không được âm.", result);
            var unitPrice = Number(input.UnitPrice, DraftFields.UnitPrice, "Đơn giá không được âm.", result);
            if (!result.Ok)
            {
                return result;
            }
            var rule = amountRule ?? Rounding.NoRounding;
            result.Row = new object[]
            {
                QuoteTemplate.SttFormula(tableName),
                AsLiteralText(input.Code.Trim()),
                AsLiteralText(input.Group.Trim()),
                AsLiteralText(input.Description.Trim()),
                AsLiteralText(input.Unit.Trim()),
                quantity ?? (object)"",
                unitPrice ?? (object)"",
                QuoteTemplate.AmountFormula(rule),
                AsLiteralText(input.Notes.Trim()),
            };
            return result;
        }

        private static decimal? Number(string text, string field, string negativeMessage, DraftValidation result)
        {
            var parsed = DecimalInput.Parse(text);
            if (!parsed.Ok)
            {
                result.Errors.Add(new FieldError(field, parsed.Message));
                return null;
            }
            if (parsed.Value < 0)
            {
                result.Errors.Add(new FieldError(field, negativeMessage));
                return null;
            }
            return parsed.Value;
        }
    }

    public enum InsertWarningKind
    {
        MissingPrice,
        Expired,
        NotYetEffective,
    }

    public sealed class InsertWarning
    {
        public InsertWarning(InsertWarningKind kind, string date = "")
        {
            Kind = kind;
            Date = date;
        }

        public InsertWarningKind Kind { get; }
        /// <summary>Ngày ISO liên quan (hết hiệu lực hoặc bắt đầu hiệu lực).</summary>
        public string Date { get; }
    }

    public sealed class LibraryDraft
    {
        public WorkItemDraftInput Draft { get; set; } = new WorkItemDraftInput();
        public List<InsertWarning> Warnings { get; set; } = new List<InsertWarning>();
    }

    /// <summary>
    /// Chép công tác từ thư viện sang dòng báo giá dưới dạng bản sao giá trị, chuyển từ
    /// src/domain/library/toQuote.ts: sửa thư viện sau đó không làm đổi báo giá cũ. Không tự thay giá thiếu
    /// bằng 0, không tự chọn giá khác.
    /// </summary>
    public static class ToQuote
    {
        /// <summary>Ghi chú truy vết nguồn giá đi kèm dòng báo giá.</summary>
        public static string TraceNote(WorkItem item, NameLookup? lookup = null)
        {
            var parts = new List<string> { $"Thư viện: {item.Code}" };
            var supplier = lookup?.SupplierName(item.SupplierId) ?? "";
            if (supplier != "")
            {
                parts.Add($"nhà cung cấp: {supplier}");
            }
            if (item.Source != "")
            {
                parts.Add($"nguồn giá: {item.Source}");
            }
            if (!string.IsNullOrEmpty(item.EffectiveFrom) || !string.IsNullOrEmpty(item.EffectiveTo))
            {
                var from = Dates.FormatIsoDate(item.EffectiveFrom);
                var to = Dates.FormatIsoDate(item.EffectiveTo);
                parts.Add($"hiệu lực {(from != "" ? from : "…")} – {(to != "" ? to : "…")}");
            }
            if (item.UnitPrice != null && item.Currency != "")
            {
                parts.Add($"tiền tệ: {item.Currency}");
            }
            return string.Join("; ", parts);
        }

        public static LibraryDraft DraftFromWorkItem(WorkItem item, string today, NameLookup? lookup = null)
        {
            var warnings = new List<InsertWarning>();
            if (item.UnitPrice == null)
            {
                warnings.Add(new InsertWarning(InsertWarningKind.MissingPrice));
            }
            else
            {
                var validity = Dates.ValidityOn(item.EffectiveFrom, item.EffectiveTo, today);
                if (validity == Validity.Expired && !string.IsNullOrEmpty(item.EffectiveTo))
                {
                    warnings.Add(new InsertWarning(InsertWarningKind.Expired, item.EffectiveTo!));
                }
                if (validity == Validity.NotYetEffective && !string.IsNullOrEmpty(item.EffectiveFrom))
                {
                    warnings.Add(new InsertWarning(InsertWarningKind.NotYetEffective, item.EffectiveFrom!));
                }
            }
            return new LibraryDraft
            {
                Draft = new WorkItemDraftInput
                {
                    Code = item.Code,
                    Group = lookup?.CategoryName(item.CategoryId) ?? "",
                    Description = item.Name,
                    Unit = item.Unit,
                    UnitPrice = item.UnitPrice == null ? "" : DecimalMath.Normalize(item.UnitPrice.Value).ToString(CultureInfo.InvariantCulture),
                    Notes = TraceNote(item, lookup),
                },
                Warnings = warnings,
            };
        }
    }
}
