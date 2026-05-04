// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

internal static class QueryEngine
{
	public static int Search(string query, int maxResults, string cacheDir, ProjectManifest? manifest)
	{
		if (string.IsNullOrWhiteSpace(query))
		{
			Console.Error.WriteLine("Error: search query is required.");
			return 1;
		}
		if (manifest == null)
		{
			Console.Error.WriteLine("Error: No project found. Run 'winmd update' first.");
			return 1;
		}
		List<string> packageCacheDirs = GetPackageCacheDirs(cacheDir, manifest);
		Dictionary<string, NsSearchResult> dictionary = new Dictionary<string, NsSearchResult>();

		// Track all type matches for disambiguation
		var typeMatches = new List<(string Name, string FullName, TypeKind Kind, int Score, string? Description, List<string>? EnumValues)>();

		foreach (string item in packageCacheDirs)
		{
			string path = Path.Combine(item, "namespaces.json");
			if (!File.Exists(path))
			{
				continue;
			}
			foreach (string item2 in JsonSerializer.Deserialize(File.ReadAllText(path), WinMdJsonContext.Default.ListString) ?? new List<string>())
			{
				string path2 = item2.Replace('.', '_') + ".json";
				string text = Path.Combine(item, "types", path2);
				if (!File.Exists(text))
				{
					continue;
				}
				List<WinMdTypeInfo> list = JsonSerializer.Deserialize(File.ReadAllText(text), WinMdJsonContext.Default.ListWinMdTypeInfo);
				if (list == null)
				{
					continue;
				}
				foreach (WinMdTypeInfo item3 in list)
				{
					int matchScore = Scoring.GetMatchScore(item3.Name, item3.FullName, query);
					int num = 0;
					string value = null;
					if (item3.Members != null)
					{
						foreach (WinMdMemberInfo member in item3.Members)
						{
							int matchScore2 = Scoring.GetMatchScore(member.Name, item3.FullName + "." + member.Name, query);
							if (matchScore2 > num)
							{
								num = matchScore2;
								value = member.Signature;
							}
						}
					}
					int num2 = Math.Max(matchScore, num);
					if (num2 > 0)
					{
						if (!dictionary.TryGetValue(item2, out var value2))
						{
							value2 = (dictionary[item2] = new NsSearchResult());
						}
						if (num2 > value2.BestScore)
						{
							value2.BestScore = num2;
						}
						if (!value2.FilePaths.Contains(text))
						{
							value2.FilePaths.Add(text);
						}
						if (matchScore >= num)
						{
							value2.Types.Add(new ScoredMatch($"{item3.Kind} {item3.FullName} [{matchScore}]", matchScore));
						}
						else
						{
							value2.Types.Add(new ScoredMatch($"{item3.Kind} {item3.FullName} -> {value} [{num}]", num));
						}

						// Track for disambiguation
						if (matchScore >= 60)
						{
							typeMatches.Add((item3.Name, item3.FullName, item3.Kind, matchScore, item3.Description, item3.EnumValues));
						}
					}
				}
			}
		}
		if (dictionary.Count == 0)
		{
			Console.WriteLine("No results found for: " + query);
			return 0;
		}

		// Check for namespace disambiguation
		var ambiguousGroups = typeMatches
			.GroupBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
			.Where(g => g.Select(t => t.FullName.Substring(0, t.FullName.Length - t.Name.Length - 1))
				.Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1)
			.ToList();

		if (ambiguousGroups.Count > 0)
		{
			foreach (var group in ambiguousGroups)
			{
				Console.WriteLine($"⚠️ AMBIGUOUS — '{group.Key}' found in multiple namespaces:");
				Console.WriteLine();
				foreach (var type in group.OrderByDescending(t => t.Score))
				{
					Console.Write($"  [{type.Score}] {type.FullName} ({type.Kind})");
					Console.WriteLine();
					if (type.Kind == TypeKind.Enum && type.EnumValues != null && type.EnumValues.Count > 0)
					{
						string enumPreview = string.Join(", ", type.EnumValues.Take(6));
						if (type.EnumValues.Count > 6) enumPreview += ", ...";
						Console.WriteLine($"        Values: {enumPreview}");
					}
					if (type.Description != null)
					{
						Console.WriteLine($"        {type.Description}");
					}
				}
				Console.WriteLine();
				Console.WriteLine("  Use fully-qualified name to avoid CS0104.");
				Console.WriteLine();
			}
			return 0;
		}

		foreach (KeyValuePair<string, NsSearchResult> item4 in dictionary.OrderByDescending((KeyValuePair<string, NsSearchResult> kv) => kv.Value.BestScore).Take(maxResults))
		{
			Console.WriteLine($"[{item4.Value.BestScore}] {item4.Key}");
			foreach (string filePath in item4.Value.FilePaths)
			{
				Console.WriteLine("    File: " + filePath);
			}
			foreach (ScoredMatch item5 in item4.Value.Types.OrderByDescending((ScoredMatch t) => t.Score).Take(5))
			{
				Console.WriteLine("    " + item5.Text);
			}
			Console.WriteLine();
		}
		return 0;
	}

	public static int Members(string fullName, string cacheDir, ProjectManifest? manifest)
	{
		if (string.IsNullOrWhiteSpace(fullName))
		{
			Console.Error.WriteLine("Error: type name is required.");
			return 1;
		}
		if (manifest == null)
		{
			Console.Error.WriteLine("Error: No project found. Run 'winmd update' first.");
			return 1;
		}
		int num = fullName.LastIndexOf('.');
		if (num < 0)
		{
			Console.Error.WriteLine("Error: type name must include a namespace (e.g. 'Namespace.TypeName'). Provided: " + fullName);
			return 1;
		}
		string path = fullName.Substring(0, num).Replace('.', '_') + ".json";
		List<string> packageCacheDirs = GetPackageCacheDirs(cacheDir, manifest);
		foreach (string packageCacheDir in packageCacheDirs)
		{
			string path2 = Path.Combine(packageCacheDir, "types", path);
			if (!File.Exists(path2))
			{
				continue;
			}
			WinMdTypeInfo winMdTypeInfo = JsonSerializer.Deserialize(File.ReadAllText(path2), WinMdJsonContext.Default.ListWinMdTypeInfo)?.FirstOrDefault((WinMdTypeInfo t) => t.FullName == fullName);
			if (winMdTypeInfo == null)
			{
				continue;
			}

			// Print type header with description
			string deprecatedPrefix = winMdTypeInfo.DeprecatedMessage != null ? "🚫 [Deprecated] " : "";
			Console.WriteLine($"{deprecatedPrefix}{winMdTypeInfo.Kind} {winMdTypeInfo.FullName}");
			if (winMdTypeInfo.DeprecatedMessage != null)
			{
				Console.WriteLine($"  {winMdTypeInfo.DeprecatedMessage}");
			}
			if (winMdTypeInfo.Description != null)
			{
				Console.WriteLine($"  {winMdTypeInfo.Description}");
			}
			if (winMdTypeInfo.BaseType != null)
			{
				Console.WriteLine("  Extends: " + winMdTypeInfo.BaseType);
			}
			Console.WriteLine();

			// Collect members including inherited ones
			var allTypes = LoadAllTypes(packageCacheDirs);
			var allMembers = CollectMembersWithInheritance(winMdTypeInfo, allTypes);

			// Group members by kind
			var properties = allMembers.Where(m => m.Member.Kind == MemberKind.Property).ToList();
			var events = allMembers.Where(m => m.Member.Kind == MemberKind.Event).ToList();
			var methods = allMembers.Where(m => m.Member.Kind == MemberKind.Method).ToList();

			if (properties.Count > 0)
			{
				Console.WriteLine("  Properties:");
				foreach (var (member, declaringType) in properties)
				{
					string inherited = declaringType != winMdTypeInfo.FullName ? $"  [from {declaringType}]" : "";
					PrintMember(member, "    ", inherited);
				}
				Console.WriteLine();
			}

			if (events.Count > 0)
			{
				Console.WriteLine("  Events:");
				foreach (var (member, declaringType) in events)
				{
					string inherited = declaringType != winMdTypeInfo.FullName ? $"  [from {declaringType}]" : "";
					PrintMember(member, "    ", inherited);
				}
				Console.WriteLine();
			}

			if (methods.Count > 0)
			{
				Console.WriteLine("  Methods:");
				foreach (var (member, declaringType) in methods)
				{
					string inherited = declaringType != winMdTypeInfo.FullName ? $"  [from {declaringType}]" : "";
					PrintMember(member, "    ", inherited);
				}
				Console.WriteLine();
			}

			// GetForCurrentView() warning
			bool hasGetForCurrentView = methods.Any(m =>
				m.Member.Name.Equals("GetForCurrentView", StringComparison.Ordinal));
			if (hasGetForCurrentView)
			{
				Console.WriteLine("  ⚠️ GetForCurrentView() requires a CoreWindow (UWP). Desktop WinUI 3 apps");
				Console.WriteLine("     may need COM interop (e.g., IInitializeWithWindow, IDataTransferManagerInterop).");
				Console.WriteLine();
			}

			return 0;
		}
		Console.Error.WriteLine("Type not found: " + fullName);
		return 1;
	}

	private static void PrintMember(WinMdMemberInfo member, string indent, string suffix = "")
	{
		string deprecatedPrefix = member.DeprecatedMessage != null ? "🚫 " : "";
		string desc = member.Description != null ? $" — {member.Description}" : "";

		if (member.Kind == MemberKind.Property)
		{
			Console.WriteLine($"{indent}{deprecatedPrefix}{member.Signature}{desc}{suffix}");
		}
		else if (member.Kind == MemberKind.Event)
		{
			Console.WriteLine($"{indent}{deprecatedPrefix}{member.Name}{desc}{suffix}");
		}
		else if (member.Kind == MemberKind.Method)
		{
			Console.WriteLine($"{indent}{deprecatedPrefix}{member.Signature}{desc}{suffix}");
		}
		else
		{
			Console.WriteLine($"{indent}{deprecatedPrefix}{member.Signature}{desc}{suffix}");
		}

		if (member.DeprecatedMessage != null)
		{
			Console.WriteLine($"{indent}  ↳ Deprecated: {member.DeprecatedMessage}");
		}
	}

	public static int Types(string ns, string cacheDir, ProjectManifest? manifest)
	{
		if (string.IsNullOrWhiteSpace(ns))
		{
			Console.Error.WriteLine("Error: namespace is required.");
			return 1;
		}
		if (manifest == null)
		{
			Console.Error.WriteLine("Error: No project found. Run 'winmd update' first.");
			return 1;
		}
		string path = ns.Replace('.', '_') + ".json";
		List<string> packageCacheDirs = GetPackageCacheDirs(cacheDir, manifest);
		bool flag = false;
		HashSet<string> hashSet = new HashSet<string>(StringComparer.Ordinal);
		foreach (string item in packageCacheDirs)
		{
			string path2 = Path.Combine(item, "types", path);
			if (!File.Exists(path2))
			{
				continue;
			}
			flag = true;
			List<WinMdTypeInfo> list = JsonSerializer.Deserialize(File.ReadAllText(path2), WinMdJsonContext.Default.ListWinMdTypeInfo);
			if (list == null)
			{
				continue;
			}
			foreach (WinMdTypeInfo item2 in list)
			{
				if (hashSet.Add(item2.FullName))
				{
					string value = ((item2.BaseType != null) ? (" : " + item2.BaseType) : "");
					Console.WriteLine($"{item2.Kind} {item2.FullName}{value}");
				}
			}
		}
		if (!flag)
		{
			Console.Error.WriteLine("Namespace not found: " + ns);
			return 1;
		}
		return 0;
	}

	public static int Enums(string fullName, string cacheDir, ProjectManifest? manifest)
	{
		if (string.IsNullOrWhiteSpace(fullName))
		{
			Console.Error.WriteLine("Error: type name is required.");
			return 1;
		}
		if (manifest == null)
		{
			Console.Error.WriteLine("Error: No project found. Run 'winmd update' first.");
			return 1;
		}
		int num = fullName.LastIndexOf('.');
		if (num < 1)
		{
			Console.Error.WriteLine("Error: type name must be fully-qualified (e.g. 'Namespace.TypeName'). Provided: " + fullName);
			return 1;
		}
		string path = fullName.Substring(0, num).Replace('.', '_') + ".json";
		foreach (string packageCacheDir in GetPackageCacheDirs(cacheDir, manifest))
		{
			string path2 = Path.Combine(packageCacheDir, "types", path);
			if (!File.Exists(path2))
			{
				continue;
			}
			WinMdTypeInfo winMdTypeInfo = JsonSerializer.Deserialize(File.ReadAllText(path2), WinMdJsonContext.Default.ListWinMdTypeInfo)?.FirstOrDefault((WinMdTypeInfo t) => t.FullName == fullName);
			if (winMdTypeInfo == null)
			{
				continue;
			}
			if (winMdTypeInfo.Kind != TypeKind.Enum)
			{
				Console.Error.WriteLine($"{fullName} is not an Enum (kind: {winMdTypeInfo.Kind})");
				return 1;
			}
			Console.WriteLine("Enum " + winMdTypeInfo.FullName);
			if (winMdTypeInfo.EnumValues != null)
			{
				foreach (string enumValue in winMdTypeInfo.EnumValues)
				{
					Console.WriteLine("  " + enumValue);
				}
			}
			else
			{
				Console.WriteLine("  (no values)");
			}
			return 0;
		}
		Console.Error.WriteLine("Type not found: " + fullName);
		return 1;
	}

	public static int Namespaces(string? filter, string cacheDir, ProjectManifest? manifest)
	{
		if (manifest == null)
		{
			Console.Error.WriteLine("Error: No project found. Run 'winmd update' first.");
			return 1;
		}
		List<string> packageCacheDirs = GetPackageCacheDirs(cacheDir, manifest);
		SortedSet<string> sortedSet = new SortedSet<string>(StringComparer.Ordinal);
		foreach (string item in packageCacheDirs)
		{
			string path = Path.Combine(item, "namespaces.json");
			if (!File.Exists(path))
			{
				continue;
			}
			List<string> list = JsonSerializer.Deserialize(File.ReadAllText(path), WinMdJsonContext.Default.ListString);
			if (list == null)
			{
				continue;
			}
			foreach (string item2 in list)
			{
				sortedSet.Add(item2);
			}
		}
		foreach (string item3 in sortedSet)
		{
			if (filter == null || item3.StartsWith(filter, StringComparison.OrdinalIgnoreCase))
			{
				Console.WriteLine(item3);
			}
		}
		return 0;
	}

	public static int Packages(string cacheDir, ProjectManifest? manifest)
	{
		if (manifest == null)
		{
			Console.Error.WriteLine("Error: No project found. Run 'winmd update' first.");
			return 1;
		}
		Console.WriteLine($"Packages for project '{manifest.ProjectName}' ({manifest.Packages.Count}):");
		foreach (ProjectPackageRef package in manifest.Packages)
		{
			string path = Path.Combine(cacheDir, "packages", package.Id, package.Version, "meta.json");
			if (File.Exists(path))
			{
				try
				{
					using JsonDocument jsonDocument = JsonDocument.Parse(File.ReadAllText(path));
					int @int = jsonDocument.RootElement.GetProperty("totalTypes").GetInt32();
					int int2 = jsonDocument.RootElement.GetProperty("totalMembers").GetInt32();
					Console.WriteLine($"  {package.Id}@{package.Version} -- {@int} types, {int2} members");
				}
				catch
				{
					Console.WriteLine($"  {package.Id}@{package.Version} -- (meta unreadable)");
				}
			}
			else
			{
				Console.WriteLine($"  {package.Id}@{package.Version} -- (cache missing)");
			}
		}
		return 0;
	}

	public static int Projects(string cacheDir)
	{
		string path = Path.Combine(cacheDir, "projects");
		if (!Directory.Exists(path))
		{
			Console.WriteLine("No projects cached.");
			return 0;
		}
		string[] files = Directory.GetFiles(path, "*.json");
		if (files.Length == 0)
		{
			Console.WriteLine("No projects cached.");
			return 0;
		}
		Console.WriteLine($"Cached projects ({files.Length}):");
		string[] array = files;
		foreach (string path2 in array)
		{
			string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(path2);
			int value = DeserializeManifestStatic(path2)?.Packages.Count ?? 0;
			Console.WriteLine($"  {fileNameWithoutExtension} ({value} package(s))");
		}
		return 0;
	}

	public static int Stats(string cacheDir, ProjectManifest? manifest)
	{
		if (manifest == null)
		{
			Console.Error.WriteLine("Error: No project found. Run 'winmd update' first.");
			return 1;
		}
		int num = 0;
		int num2 = 0;
		int num3 = 0;
		int num4 = 0;
		foreach (ProjectPackageRef package in manifest.Packages)
		{
			string path = Path.Combine(cacheDir, "packages", package.Id, package.Version, "meta.json");
			if (!File.Exists(path))
			{
				continue;
			}
			try
			{
				using JsonDocument jsonDocument = JsonDocument.Parse(File.ReadAllText(path));
				num += jsonDocument.RootElement.GetProperty("totalTypes").GetInt32();
				num2 += jsonDocument.RootElement.GetProperty("totalMembers").GetInt32();
				num3 += jsonDocument.RootElement.GetProperty("totalNamespaces").GetInt32();
				if (jsonDocument.RootElement.TryGetProperty("winMdFiles", out var value))
				{
					num4 += value.GetArrayLength();
				}
			}
			catch
			{
			}
		}
		Console.WriteLine("WinMD Index Statistics -- " + manifest.ProjectName);
		Console.WriteLine("======================================");
		Console.WriteLine($"  Packages:   {manifest.Packages.Count}");
		Console.WriteLine($"  Namespaces: {num3} (may overlap across packages)");
		Console.WriteLine($"  Types:      {num}");
		Console.WriteLine($"  Members:    {num2}");
		Console.WriteLine($"  WinMD files: {num4}");
		return 0;
	}

	public static int CheckProperty(string typeName, string propertyName, string cacheDir, ProjectManifest? manifest)
	{
		if (string.IsNullOrWhiteSpace(typeName) || string.IsNullOrWhiteSpace(propertyName))
		{
			Console.Error.WriteLine("Error: usage: check-property <TypeName> <PropertyName>");
			return 1;
		}
		if (manifest == null)
		{
			Console.Error.WriteLine("Error: No project found. Run 'winmd update' first.");
			return 1;
		}
		List<string> packageCacheDirs = GetPackageCacheDirs(cacheDir, manifest);

		// Load all types for cross-type search
		var allTypes = LoadAllTypes(packageCacheDirs);

		// Resolve the target type (support short or fully-qualified names)
		var targetType = ResolveType(typeName, allTypes);
		if (targetType == null)
		{
			Console.Error.WriteLine("Type not found: " + typeName);
			return 1;
		}

		// Collect members including inherited ones
		var allMembers = CollectMembersWithInheritance(targetType, allTypes);

		// 1. Check direct and inherited members
		var exactMatch = allMembers.FirstOrDefault(m =>
			m.Member.Name.Equals(propertyName, StringComparison.OrdinalIgnoreCase));
		if (exactMatch.Member != null)
		{
			string inherited = exactMatch.DeclaringType != null && exactMatch.DeclaringType != targetType.FullName
				? $"  [inherited from {exactMatch.DeclaringType}]" : "";
			string desc = exactMatch.Member.Description != null ? $"\n   {exactMatch.Member.Description}" : "";
			Console.WriteLine($"✅ {targetType.FullName}.{exactMatch.Member.Name}");
			Console.WriteLine($"   {exactMatch.Member.Signature}{inherited}{desc}");
			return 0;
		}

		// 2. Check attached property patterns (static GetXxx/SetXxx methods)
		var attachedMatch = DetectAttachedProperty(targetType, propertyName);
		if (attachedMatch != null)
		{
			Console.WriteLine($"✅ {targetType.FullName}.{propertyName} (attached)");
			Console.WriteLine($"   {attachedMatch}");
			return 0;
		}

		// 3. Not found — provide suggestions
		Console.WriteLine($"❌ {targetType.FullName} does not have property '{propertyName}'");
		Console.WriteLine();

		// Similar properties on this type
		var similarOnType = allMembers
			.Where(m => m.Member.Kind == MemberKind.Property)
			.Select(m => (Member: m.Member, Score: Scoring.GetMatchScore(m.Member.Name, m.Member.Name, propertyName)))
			.Where(x => x.Score >= 40)
			.OrderByDescending(x => x.Score)
			.Take(5)
			.ToList();

		if (similarOnType.Count > 0)
		{
			Console.WriteLine($"  Similar {targetType.Name} properties:");
			foreach (var (member, _) in similarOnType)
			{
				string desc = member.Description != null ? $" — {member.Description}" : "";
				Console.WriteLine($"    {member.Signature}{desc}");
			}
			Console.WriteLine();
		}

		// Types that have the exact property name
		var typesWithProperty = allTypes
			.Where(t => t.FullName != targetType.FullName)
			.SelectMany(t => t.Members
				.Where(m => m.Kind == MemberKind.Property && m.Name.Equals(propertyName, StringComparison.OrdinalIgnoreCase))
				.Select(m => (Type: t, Member: m)))
			.Take(5)
			.ToList();

		if (typesWithProperty.Count > 0)
		{
			Console.WriteLine($"  Types that have an '{propertyName}' property:");
			foreach (var (type, member) in typesWithProperty)
			{
				string desc = member.Description != null ? $" — {member.Description}" : "";
				Console.WriteLine($"    {type.Name}.{member.Signature}{desc}");
			}
			Console.WriteLine();
		}

		// Types with a similar property name
		var typesWithSimilar = allTypes
			.Where(t => t.FullName != targetType.FullName)
			.SelectMany(t => t.Members
				.Where(m => m.Kind == MemberKind.Property)
				.Select(m => (Type: t, Member: m, Score: Scoring.GetMatchScore(m.Name, m.Name, propertyName)))
				.Where(x => x.Score >= 60 && !x.Member.Name.Equals(propertyName, StringComparison.OrdinalIgnoreCase)))
			.OrderByDescending(x => x.Score)
			.Take(3)
			.ToList();

		if (typesWithSimilar.Count > 0)
		{
			Console.WriteLine("  Types with a similar property:");
			foreach (var (type, member, _) in typesWithSimilar)
			{
				string desc = member.Description != null ? $" — {member.Description}" : "";
				Console.WriteLine($"    {type.Name}.{member.Signature}{desc}");
			}
			Console.WriteLine();
		}

		return 1;
	}

	private static WinMdTypeInfo? ResolveType(string typeName, List<WinMdTypeInfo> allTypes)
	{
		// Try fully-qualified match first
		var exact = allTypes.FirstOrDefault(t => t.FullName.Equals(typeName, StringComparison.OrdinalIgnoreCase));
		if (exact != null) return exact;

		// Try short name match
		var shortMatches = allTypes.Where(t => t.Name.Equals(typeName, StringComparison.OrdinalIgnoreCase)).ToList();
		if (shortMatches.Count == 1) return shortMatches[0];

		// Prefer Microsoft.UI.Xaml.Controls types for common control names
		if (shortMatches.Count > 1)
		{
			var winuiMatch = shortMatches.FirstOrDefault(t =>
				t.Namespace.StartsWith("Microsoft.UI.Xaml", StringComparison.OrdinalIgnoreCase));
			return winuiMatch ?? shortMatches[0];
		}
		return null;
	}

	private static List<(WinMdMemberInfo Member, string? DeclaringType)> CollectMembersWithInheritance(
		WinMdTypeInfo type, List<WinMdTypeInfo> allTypes)
	{
		var result = new List<(WinMdMemberInfo Member, string? DeclaringType)>();

		// Direct members
		foreach (var m in type.Members)
		{
			result.Add((m, type.FullName));
		}

		// Walk inheritance chain
		string? baseTypeName = type.BaseType;
		var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { type.FullName };

		while (!string.IsNullOrEmpty(baseTypeName) && visited.Add(baseTypeName))
		{
			var baseType = allTypes.FirstOrDefault(t => t.FullName.Equals(baseTypeName, StringComparison.OrdinalIgnoreCase));
			if (baseType == null) break;

			foreach (var m in baseType.Members)
			{
				// Only add if not already present (overridden)
				if (!result.Any(r => r.Member.Name == m.Name && r.Member.Kind == m.Kind))
				{
					result.Add((m, baseType.FullName));
				}
			}
			baseTypeName = baseType.BaseType;
		}

		return result;
	}

	private static string? DetectAttachedProperty(WinMdTypeInfo type, string propertyName)
	{
		string getName = "Get" + propertyName;
		string setName = "Set" + propertyName;

		var getter = type.Members.FirstOrDefault(m =>
			m.Kind == MemberKind.Method && m.Name.Equals(getName, StringComparison.OrdinalIgnoreCase));
		var setter = type.Members.FirstOrDefault(m =>
			m.Kind == MemberKind.Method && m.Name.Equals(setName, StringComparison.OrdinalIgnoreCase));

		if (getter != null)
		{
			// Verify the getter takes a DependencyObject or UIElement parameter
			if (getter.Parameters != null && getter.Parameters.Count >= 1)
			{
				string paramType = getter.Parameters[0].Type;
				if (paramType.Contains("DependencyObject") || paramType.Contains("UIElement") || paramType.Contains("FrameworkElement"))
				{
					string returnType = getter.ReturnType ?? "unknown";
					string accessors = setter != null
						? $"via {type.Name}.{getName}() / {type.Name}.{setName}()"
						: $"via {type.Name}.{getName}() (read-only)";
					return $"{returnType} — {accessors}";
				}
			}
		}

		return null;
	}

	private static List<WinMdTypeInfo> LoadAllTypes(List<string> packageCacheDirs)
	{
		var allTypes = new List<WinMdTypeInfo>();
		var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		foreach (string dir in packageCacheDirs)
		{
			string nsPath = Path.Combine(dir, "namespaces.json");
			if (!File.Exists(nsPath)) continue;

			var namespaces = JsonSerializer.Deserialize(File.ReadAllText(nsPath), WinMdJsonContext.Default.ListString);
			if (namespaces == null) continue;

			foreach (string ns in namespaces)
			{
				string typesFile = Path.Combine(dir, "types", ns.Replace('.', '_') + ".json");
				if (!File.Exists(typesFile)) continue;

				var types = JsonSerializer.Deserialize(File.ReadAllText(typesFile), WinMdJsonContext.Default.ListWinMdTypeInfo);
				if (types == null) continue;

				foreach (var type in types)
				{
					if (seen.Add(type.FullName))
					{
						allTypes.Add(type);
					}
				}
			}
		}
		return allTypes;
	}

	private static List<string> GetPackageCacheDirs(string cacheDir, ProjectManifest manifest)
	{
		List<string> list = new List<string>();
		foreach (ProjectPackageRef package in manifest.Packages)
		{
			string text = Path.Combine(cacheDir, "packages", package.Id, package.Version);
			if (Directory.Exists(text))
			{
				list.Add(text);
			}
		}
		return list;
	}

	private static ProjectManifest? DeserializeManifestStatic(string path)
	{
		try
		{
			return JsonSerializer.Deserialize(File.ReadAllText(path), WinMdJsonContext.Default.ProjectManifest);
		}
		catch
		{
			return null;
		}
	}
}
