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
					}
				}
			}
		}
		if (dictionary.Count == 0)
		{
			Console.WriteLine("No results found for: " + query);
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
			Console.WriteLine($"{winMdTypeInfo.Kind} {winMdTypeInfo.FullName}");
			if (winMdTypeInfo.BaseType != null)
			{
				Console.WriteLine("  Extends: " + winMdTypeInfo.BaseType);
			}
			Console.WriteLine();
			foreach (WinMdMemberInfo member in winMdTypeInfo.Members)
			{
				Console.WriteLine($"  [{member.Kind}] {member.Signature}");
			}
			return 0;
		}
		Console.Error.WriteLine("Type not found: " + fullName);
		return 1;
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
					int @int = jsonDocument.RootElement.GetProperty("TotalTypes").GetInt32();
					int int2 = jsonDocument.RootElement.GetProperty("TotalMembers").GetInt32();
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
				num += jsonDocument.RootElement.GetProperty("TotalTypes").GetInt32();
				num2 += jsonDocument.RootElement.GetProperty("TotalMembers").GetInt32();
				num3 += jsonDocument.RootElement.GetProperty("TotalNamespaces").GetInt32();
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
