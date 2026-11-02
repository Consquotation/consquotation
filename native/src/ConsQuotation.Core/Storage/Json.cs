using System;
using System.Globalization;
using ConsQuotation.Core.Numbers;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace ConsQuotation.Core.Storage
{
    /// <summary>
    /// Cách ghi JSON dùng chung với bản web: tên trường camelCase, giá trị kiểu liệt kê là chữ camelCase
    /// ("material", "approved"), số thập phân ghi gọn (1500, không phải 1500.0), giữ trường null.
    /// </summary>
    public static class Json
    {
        public static readonly JsonSerializerSettings Settings = Build();

        private static JsonSerializerSettings Build()
        {
            var settings = new JsonSerializerSettings
            {
                ContractResolver = new CamelCasePropertyNamesContractResolver(),
                NullValueHandling = NullValueHandling.Include,
                FloatParseHandling = FloatParseHandling.Decimal,
                DateParseHandling = DateParseHandling.None,
                MissingMemberHandling = MissingMemberHandling.Ignore,
            };
            settings.Converters.Add(new StringEnumConverter(new CamelCaseNamingStrategy(), allowIntegerValues: false));
            settings.Converters.Add(new CompactDecimalConverter());
            return settings;
        }

        public static string Serialize(object value, bool indented) =>
            JsonConvert.SerializeObject(value, indented ? Formatting.Indented : Formatting.None, Settings);

        public static T? Deserialize<T>(string json) where T : class => JsonConvert.DeserializeObject<T>(json, Settings);

        /// <summary>Ghi decimal như JavaScript ghi số: không có ".0" thừa, không có số 0 thừa ở cuối.</summary>
        private sealed class CompactDecimalConverter : JsonConverter
        {
            public override bool CanConvert(Type objectType) => objectType == typeof(decimal) || objectType == typeof(decimal?);

            public override bool CanRead => false;

            public override object? ReadJson(JsonReader reader, Type objectType, object? existingValue, JsonSerializer serializer) =>
                throw new NotSupportedException();

            public override void WriteJson(JsonWriter writer, object? value, JsonSerializer serializer)
            {
                if (value == null)
                {
                    writer.WriteNull();
                    return;
                }
                writer.WriteRawValue(DecimalMath.Normalize((decimal)value).ToString(CultureInfo.InvariantCulture));
            }
        }
    }
}
