using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace ConsQuotation.Core.Exchange
{
    /// <summary>Kết quả giải mã file chữ: nội dung, hoặc thông báo lỗi.</summary>
    public sealed class DecodeResult
    {
        private DecodeResult(string? text, string message)
        {
            Text = text;
            Message = message;
        }

        public bool Ok => Text != null;
        public string? Text { get; }
        public string Message { get; }

        public static DecodeResult Success(string text) => new DecodeResult(text, "");
        public static DecodeResult Failure(string message) => new DecodeResult(null, message);
    }

    /// <summary>
    /// Đọc file chữ do người dùng chọn (CSV, JSON), chuyển từ csv.ts. Chỉ nhận UTF-8 (có/không BOM) hoặc
    /// UTF-16 có BOM; không đoán bảng mã khác để tránh hỏng tiếng Việt (prompts/09).
    /// </summary>
    public static class Csv
    {
        private static readonly Regex SepLine = new Regex(@"^sep=(.)\r?\n", RegexOptions.IgnoreCase);
        private static readonly char[] Delimiters = { ',', ';', '\t' };

        public static DecodeResult DecodeTextFile(byte[] bytes)
        {
            if (bytes.Length >= 2 && bytes[0] == 0xff && bytes[1] == 0xfe)
            {
                return DecodeResult.Success(Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2));
            }
            if (bytes.Length >= 2 && bytes[0] == 0xfe && bytes[1] == 0xff)
            {
                return DecodeResult.Success(Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2));
            }
            var start = bytes.Length >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf ? 3 : 0;
            try
            {
                return DecodeResult.Success(new UTF8Encoding(false, throwOnInvalidBytes: true).GetString(bytes, start, bytes.Length - start));
            }
            catch (DecoderFallbackException)
            {
                return DecodeResult.Failure(
                    "File không phải UTF-8 nên tiếng Việt có thể bị hỏng. Trong Excel, hãy lưu lại bằng File › Save As › \"CSV UTF-8 (Comma delimited)\".");
            }
        }

        /// <summary>Chọn dấu phân cách xuất hiện nhiều nhất (ngoài dấu nháy) ở dòng đầu có dữ liệu.</summary>
        public static char DetectDelimiter(string text)
        {
            var sep = SepLine.Match(text);
            if (sep.Success)
            {
                return sep.Groups[1].Value[0];
            }
            var line = new StringBuilder();
            var inQuotes = false;
            foreach (var ch in text)
            {
                if (ch == '"')
                {
                    inQuotes = !inQuotes;
                }
                else if ((ch == '\n' || ch == '\r') && !inQuotes)
                {
                    if (line.ToString().Trim() != "")
                    {
                        break;
                    }
                    line.Clear();
                    continue;
                }
                if (!inQuotes)
                {
                    line.Append(ch);
                }
            }
            var first = line.ToString();
            var best = ',';
            var bestCount = 0;
            foreach (var d in Delimiters)
            {
                var count = first.Split(d).Length - 1;
                if (count > bestCount)
                {
                    best = d;
                    bestCount = count;
                }
            }
            return best;
        }

        /// <summary>Phân tích CSV theo RFC 4180 (dấu nháy kép, xuống dòng trong ô). Mọi ô trả về dạng chữ.</summary>
        public static List<List<string>> Parse(string text)
        {
            var delimiter = DetectDelimiter(text);
            var body = Regex.Replace(text, @"^sep=.\r?\n", "", RegexOptions.IgnoreCase);
            var rows = new List<List<string>>();
            var row = new List<string>();
            var cell = new StringBuilder();
            var inQuotes = false;
            for (var i = 0; i < body.Length; i++)
            {
                var ch = body[i];
                if (inQuotes)
                {
                    if (ch == '"')
                    {
                        if (i + 1 < body.Length && body[i + 1] == '"')
                        {
                            cell.Append('"');
                            i++;
                        }
                        else
                        {
                            inQuotes = false;
                        }
                    }
                    else
                    {
                        cell.Append(ch);
                    }
                }
                else if (ch == '"')
                {
                    inQuotes = true;
                }
                else if (ch == delimiter)
                {
                    row.Add(cell.ToString());
                    cell.Clear();
                }
                else if (ch == '\n' || ch == '\r')
                {
                    if (ch == '\r' && i + 1 < body.Length && body[i + 1] == '\n')
                    {
                        i++;
                    }
                    row.Add(cell.ToString());
                    rows.Add(row);
                    row = new List<string>();
                    cell.Clear();
                }
                else
                {
                    cell.Append(ch);
                }
            }
            if (cell.Length > 0 || row.Count > 0)
            {
                row.Add(cell.ToString());
                rows.Add(row);
            }
            return rows;
        }
    }
}
