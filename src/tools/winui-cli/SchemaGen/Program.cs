// WinUi.SchemaEmit — reflects a winui-cli managed dll, walks every type tagged with
// [WinUiJsonSchemaAttribute], and emits one JSON Schema (Draft 2020-12) per type into
// the output directory. Run from build-tools.ps1 after the managed Release build,
// before AOT publish. The records in src/tools/winui-cli/Schemas/JsonPayloads.cs are
// the single source of truth: this tool consumes them, no handwritten schemas anywhere.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: winui-schema-emit <winui-cli.dll> <output-dir>");
    return 1;
}

var assemblyPath = Path.GetFullPath(args[0]);
var outDir = Path.GetFullPath(args[1]);
if (!File.Exists(assemblyPath))
{
    Console.Error.WriteLine($"assembly not found: {assemblyPath}");
    return 1;
}
Directory.CreateDirectory(outDir);

// MetadataLoadContext lets us reflect over an assembly without loading it for
// execution. The resolver needs the assembly's own folder + the runtime reference
// assemblies (so primitive types resolve). Dedupe by filename so we don't hand the
// resolver two copies of System.Private.CoreLib etc.
var runtimeDir = Path.GetDirectoryName(typeof(object).Assembly.Location)!;
var resolverByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
foreach (var dll in Directory.GetFiles(runtimeDir, "*.dll"))
    resolverByName[Path.GetFileName(dll)] = dll;
foreach (var dll in Directory.GetFiles(Path.GetDirectoryName(assemblyPath)!, "*.dll"))
    resolverByName.TryAdd(Path.GetFileName(dll), dll); // runtime wins on conflicts
resolverByName[Path.GetFileName(assemblyPath)] = assemblyPath;
using var mlc = new MetadataLoadContext(new PathAssemblyResolver(resolverByName.Values));
var asm = mlc.LoadFromAssemblyPath(assemblyPath);

var taggedTypes = asm.GetTypes()
    .Where(t => t.GetCustomAttributesData().Any(a => a.AttributeType.Name == "WinUiJsonSchemaAttribute"))
    .ToList();

if (taggedTypes.Count == 0)
{
    Console.Error.WriteLine("no [WinUiJsonSchema]-tagged types found");
    return 1;
}

int written = 0;
foreach (var type in taggedTypes.OrderBy(t => t.FullName))
{
    var schemaName = (string)type.GetCustomAttributesData()
        .First(a => a.AttributeType.Name == "WinUiJsonSchemaAttribute")
        .ConstructorArguments[0].Value!;

    var defs = new Dictionary<string, JsonElement>();
    var rootSchema = BuildObjectSchema(type, defs, asm);

    var doc = new Dictionary<string, object?>
    {
        ["$schema"] = "https://json-schema.org/draft/2020-12/schema",
        ["$id"] = $"https://aka.ms/win-dev-skills/schemas/{schemaName}.schema.json",
        ["title"] = schemaName,
        ["description"] = $"Auto-generated from {type.FullName} in winui-cli. Do not edit by hand.",
    };
    foreach (var (k, v) in rootSchema) doc[k] = v;
    if (defs.Count > 0)
    {
        doc["$defs"] = defs.ToDictionary(kv => kv.Key, kv => (object?)kv.Value);
    }

    var json = JsonSerializer.Serialize(doc, new JsonSerializerOptions
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    });
    var outPath = Path.Combine(outDir, schemaName + ".schema.json");
    File.WriteAllText(outPath, json + Environment.NewLine);
    Console.WriteLine($"  wrote {Path.GetFileName(outPath)}");
    written++;
}

// Manifest: list every schema name + sha-256 of its JSON. Lets consumers (and CI
// drift checks) pin a known-good shape without parsing each file.
var manifest = new Dictionary<string, object?>
{
    ["generated_from"] = Path.GetFileName(assemblyPath),
    ["schema_count"] = written,
    ["schemas"] = Directory.GetFiles(outDir, "*.schema.json")
        .OrderBy(f => f)
        .Select(f => new Dictionary<string, object?>
        {
            ["name"] = Path.GetFileNameWithoutExtension(f).Replace(".schema", ""),
            ["file"] = Path.GetFileName(f),
            ["sha256"] = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(f))).ToLowerInvariant(),
        })
        .ToArray(),
};
var manifestPath = Path.Combine(outDir, "manifest.json");
File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }) + Environment.NewLine);
Console.WriteLine($"  wrote manifest.json ({written} schemas)");

return 0;

// --- helpers ---

static Dictionary<string, object?> BuildObjectSchema(Type type, Dictionary<string, JsonElement> defs, Assembly asm)
{
    // Records expose their positional parameters as auto-properties. We walk the
    // declared instance properties to discover the shape. Properties without a
    // JsonPropertyName attribute fall back to their original name.
    var props = type.GetProperties(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);
    var jsonProps = new Dictionary<string, object?>();
    var required = new List<string>();

    foreach (var p in props)
    {
        // Skip compiler-synthesized record machinery (EqualityContract is protected
        // and never serialized by System.Text.Json; including it in the schema
        // would force consumers to emit a property that the exe will never write).
        if (p.Name == "EqualityContract") continue;
        // Also skip any non-public property without an explicit [JsonPropertyName] —
        // STJ source-gen won't serialize it, so the schema mustn't require it.
        var hasJsonName = p.GetCustomAttributesData().Any(a => a.AttributeType.Name == "JsonPropertyNameAttribute");
        var getter = p.GetMethod;
        if (!hasJsonName && (getter == null || !getter.IsPublic)) continue;

        var jsonName = GetJsonPropertyName(p) ?? CamelCase(p.Name);
        var (schema, isNullable) = SchemaForType(p.PropertyType, p, defs, asm);
        jsonProps[jsonName] = schema;
        if (!isNullable) required.Add(jsonName);
    }

    var result = new Dictionary<string, object?>
    {
        ["type"] = "object",
        ["properties"] = jsonProps,
        ["additionalProperties"] = false,
    };
    if (required.Count > 0) result["required"] = required.ToArray();
    return result;
}

static (Dictionary<string, object?> schema, bool nullable) SchemaForType(
    Type type, MemberInfo? owner, Dictionary<string, JsonElement> defs, Assembly asm)
{
    bool nullable = false;

    // Nullable<T> value types.
    var underlying = Nullable.GetUnderlyingType(type);
    if (underlying != null) { type = underlying; nullable = true; }

    // Nullable reference types — detected via the C# compiler's NullableAttribute byte.
    if (!nullable && owner != null && !type.IsValueType)
    {
        nullable = IsNullableReference(owner);
    }

    Dictionary<string, object?> schema;

    if (type.IsArray)
    {
        var elem = type.GetElementType()!;
        var (elemSchema, _) = SchemaForType(elem, null, defs, asm);
        schema = new() { ["type"] = nullable ? new object[] { "array", "null" } : "array", ["items"] = elemSchema };
    }
    else if (type.FullName == "System.String") schema = new() { ["type"] = nullable ? new object[] { "string", "null" } : "string" };
    else if (type.FullName == "System.Boolean") schema = new() { ["type"] = nullable ? new object[] { "boolean", "null" } : "boolean" };
    else if (type.FullName is "System.Int32" or "System.Int64" or "System.Int16" or "System.Byte" or "System.UInt32" or "System.UInt64" or "System.UInt16")
        schema = new() { ["type"] = nullable ? new object[] { "integer", "null" } : "integer" };
    else if (type.FullName is "System.Double" or "System.Single" or "System.Decimal")
        schema = new() { ["type"] = nullable ? new object[] { "number", "null" } : "number" };
    else if (type.IsEnum)
        schema = new() { ["type"] = nullable ? new object[] { "string", "null" } : "string", ["enum"] = type.GetEnumNames() };
    else if (type.Assembly == asm)
    {
        // Nested record — register in $defs and emit $ref.
        var defKey = type.Name;
        if (!defs.ContainsKey(defKey))
        {
            // placeholder to break cycles
            defs[defKey] = JsonDocument.Parse("{}").RootElement;
            var nested = BuildObjectSchema(type, defs, asm);
            defs[defKey] = JsonSerializer.SerializeToElement(nested);
        }
        schema = nullable
            ? new() { ["oneOf"] = new object[] { new Dictionary<string, object?> { ["$ref"] = "#/$defs/" + defKey }, new Dictionary<string, object?> { ["type"] = "null" } } }
            : new() { ["$ref"] = "#/$defs/" + defKey };
    }
    else
    {
        // Unknown external type — fall back to "any object" rather than failing the build.
        schema = new() { ["type"] = new[] { "object", "string", "number", "boolean", "array", "null" } };
    }

    return (schema, nullable);
}

static string? GetJsonPropertyName(PropertyInfo p)
{
    var attr = p.GetCustomAttributesData().FirstOrDefault(a => a.AttributeType.Name == "JsonPropertyNameAttribute");
    if (attr == null) return null;
    return attr.ConstructorArguments[0].Value as string;
}

static string CamelCase(string s) => string.IsNullOrEmpty(s) ? s : char.ToLowerInvariant(s[0]) + s.Substring(1);

static bool IsNullableReference(MemberInfo member)
{
    // C# compiler emits NullableAttribute(byte) where 1 = NotAnnotated, 2 = Annotated.
    // If absent on the member, look at NullableContextAttribute on the declaring type or its assembly.
    var nullableAttr = member.GetCustomAttributesData()
        .FirstOrDefault(a => a.AttributeType.FullName == "System.Runtime.CompilerServices.NullableAttribute");
    if (nullableAttr != null && nullableAttr.ConstructorArguments.Count > 0)
    {
        var arg = nullableAttr.ConstructorArguments[0];
        if (arg.ArgumentType.FullName == "System.Byte") return (byte)arg.Value! == 2;
        if (arg.Value is IReadOnlyCollection<CustomAttributeTypedArgument> col && col.Count > 0)
        {
            return (byte)col.First().Value! == 2;
        }
    }
    var declaring = (member as PropertyInfo)?.DeclaringType;
    if (declaring != null)
    {
        var ctx = declaring.GetCustomAttributesData()
            .FirstOrDefault(a => a.AttributeType.FullName == "System.Runtime.CompilerServices.NullableContextAttribute");
        if (ctx != null && ctx.ConstructorArguments.Count > 0)
            return (byte)ctx.ConstructorArguments[0].Value! == 2;
    }
    return false;
}
