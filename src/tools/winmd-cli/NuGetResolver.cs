// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Xml.Linq;

internal static class NuGetResolver
{
	public static List<PackageWithWinMd> FindPackagesWithWinMd(string projectDir, string projectFile, string? winAppSdkRuntimePath)
	{
		List<PackageWithWinMd> list = new List<PackageWithWinMd>();
		string text = FindProjectAssetsJson(projectDir);
		if (text != null)
		{
			list.AddRange(FindPackagesFromAssets(text));
		}
		if (list.Count == 0)
		{
			string text2 = Path.Combine(projectDir, "packages.config");
			if (File.Exists(text2))
			{
				list.AddRange(FindPackagesFromConfig(text2, projectDir));
			}
		}
		list.AddRange(FindWinMdFromProjectReferences(projectFile));
		(List<string>, string) tuple = FindWindowsSdkWinMd();
		if (tuple.Item1.Count > 0)
		{
			list.Add(new PackageWithWinMd("WindowsSDK", tuple.Item2, tuple.Item1, new List<string>()));
		}
		(List<string>, string) tuple2 = FindWinAppSdkRuntimeWinMd(winAppSdkRuntimePath);
		if (tuple2.Item1.Count > 0)
		{
			list.Add(new PackageWithWinMd("WinAppSdkRuntime", tuple2.Item2, tuple2.Item1, new List<string>()));
		}
		// Discover XML docs from NuGet SDK ref packages
		DiscoverSdkXmlDocs(list, projectDir);
		return (from p in list
			group p by (p.Id.ToLowerInvariant(), p.Version.ToLowerInvariant())).Select(delegate(IGrouping<(string, string), PackageWithWinMd> g)
		{
			List<string> winMdFiles = g.SelectMany((PackageWithWinMd p) => p.WinMdFiles).Distinct<string>(StringComparer.OrdinalIgnoreCase).ToList();
			List<string> xmlDocFiles = g.SelectMany((PackageWithWinMd p) => p.XmlDocFiles).Distinct<string>(StringComparer.OrdinalIgnoreCase).ToList();
			PackageWithWinMd packageWithWinMd = g.First();
			return new PackageWithWinMd(packageWithWinMd.Id, packageWithWinMd.Version, winMdFiles, xmlDocFiles);
		}).ToList();
	}

	/// <summary>
	/// Finds XML documentation files in NuGet package folders that contain metadata
	/// directories (e.g., microsoft.windowsappsdk.winui/metadata/*.xml) or lib directories.
	/// </summary>
	internal static List<string> FindXmlDocsInPackageFolder(string packageFolder)
	{
		var xmlFiles = new List<string>();
		try
		{
			// Check metadata directory (WinUI pattern)
			string metadataDir = Path.Combine(packageFolder, "metadata");
			if (Directory.Exists(metadataDir))
			{
				xmlFiles.AddRange(Directory.GetFiles(metadataDir, "*.xml"));
			}

			// Check lib directories for XML docs alongside DLLs
			string libDir = Path.Combine(packageFolder, "lib");
			if (Directory.Exists(libDir))
			{
				foreach (var xml in Directory.GetFiles(libDir, "*.xml", SearchOption.AllDirectories))
				{
					// Only include XML docs > 1KB (skip trivial files)
					try
					{
						if (new FileInfo(xml).Length > 1024)
						{
							xmlFiles.Add(xml);
						}
					}
					catch { }
				}
			}
		}
		catch { }
		return xmlFiles;
	}

	/// <summary>
	/// Discovers XML documentation from well-known SDK NuGet packages
	/// (e.g., microsoft.windows.sdk.net.ref, microsoft.windowsappsdk.winui)
	/// that provide WinRT API docs.
	/// </summary>
	private static void DiscoverSdkXmlDocs(List<PackageWithWinMd> packages, string projectDir)
	{
		string? nugetPackagesDir = Environment.GetEnvironmentVariable("NUGET_PACKAGES");
		if (string.IsNullOrWhiteSpace(nugetPackagesDir))
		{
			nugetPackagesDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".nuget", "packages");
		}

		// Look for microsoft.windows.sdk.net.ref for WinRT XML docs
		string sdkRefDir = Path.Combine(nugetPackagesDir, "microsoft.windows.sdk.net.ref");
		if (Directory.Exists(sdkRefDir))
		{
			try
			{
				var latestVersion = Directory.GetDirectories(sdkRefDir)
					.OrderByDescending(d => Path.GetFileName(d))
					.FirstOrDefault();
				if (latestVersion != null)
				{
					var xmlDocs = FindXmlDocsInPackageFolder(latestVersion);
					if (xmlDocs.Count > 0)
					{
						// Find the WindowsSDK package and add XML docs to it
						var sdkPkg = packages.FirstOrDefault(p =>
							p.Id.Equals("WindowsSDK", StringComparison.OrdinalIgnoreCase));
						if (sdkPkg != null)
						{
							sdkPkg.XmlDocFiles.AddRange(xmlDocs);
						}
					}
				}
			}
			catch { }
		}

		// Look for microsoft.windowsappsdk.winui for WinUI XML docs
		string winuiDir = Path.Combine(nugetPackagesDir, "microsoft.windowsappsdk.winui");
		if (Directory.Exists(winuiDir))
		{
			try
			{
				var latestVersion = Directory.GetDirectories(winuiDir)
					.OrderByDescending(d => Path.GetFileName(d))
					.FirstOrDefault();
				if (latestVersion != null)
				{
					var xmlDocs = FindXmlDocsInPackageFolder(latestVersion);
					if (xmlDocs.Count > 0)
					{
						// Add to WinAppSdkRuntime or any WinUI-related package
						var runtimePkg = packages.FirstOrDefault(p =>
							p.Id.Equals("WinAppSdkRuntime", StringComparison.OrdinalIgnoreCase))
							?? packages.FirstOrDefault(p =>
								p.Id.Contains("WinUI", StringComparison.OrdinalIgnoreCase) ||
								p.Id.Contains("WindowsAppSDK", StringComparison.OrdinalIgnoreCase));
						if (runtimePkg != null)
						{
							runtimePkg.XmlDocFiles.AddRange(xmlDocs);
						}
					}
				}
			}
			catch { }
		}
	}

	internal static List<PackageWithWinMd> FindWinMdFromProjectReferences(string projectFile)
	{
		List<PackageWithWinMd> list = new List<PackageWithWinMd>();
		try
		{
			XDocument xDocument = XDocument.Load(projectFile);
			XNamespace xNamespace = xDocument.Root?.Name.Namespace ?? XNamespace.None;
			List<string> list2 = (from e in xDocument.Descendants(xNamespace + "ProjectReference")
				select e.Attribute("Include")?.Value into v
				where v != null
				select v).ToList();
			if (list2.Count == 0)
			{
				return list;
			}
			string directoryName = Path.GetDirectoryName(projectFile);
			foreach (string item in list2)
			{
				string fullPath = Path.GetFullPath(Path.Combine(directoryName, item));
				if (!File.Exists(fullPath))
				{
					continue;
				}
				string directoryName2 = Path.GetDirectoryName(fullPath);
				string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(fullPath);
				string path = Path.Combine(directoryName2, "bin");
				if (Directory.Exists(path))
				{
					List<string> source = (from f in Directory.GetFiles(path, "*.winmd", SearchOption.AllDirectories)
						where !Path.GetFileName(f).Equals("Windows.winmd", StringComparison.OrdinalIgnoreCase)
						select f).ToList();
					HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
					source = source.Where((string f) => seen.Add(Path.GetFileName(f))).ToList();
					if (source.Count > 0)
					{
						list.Add(new PackageWithWinMd("ProjectRef." + fileNameWithoutExtension, "local", source, new List<string>()));
					}
				}
			}
		}
		catch (Exception ex)
		{
			Console.Error.WriteLine("Warning: Failed to parse project references: " + ex.Message);
		}
		return list;
	}

	internal static string? FindProjectAssetsJson(string projectDir)
	{
		string text = Path.Combine(projectDir, "obj", "project.assets.json");
		if (File.Exists(text))
		{
			return text;
		}
		string path = Path.Combine(projectDir, "obj");
		if (Directory.Exists(path))
		{
			string[] files = Directory.GetFiles(path, "project.assets.json", SearchOption.AllDirectories);
			if (files.Length != 0)
			{
				string text2 = null;
				DateTime dateTime = DateTime.MinValue;
				string[] array = files;
				foreach (string text3 in array)
				{
					try
					{
						DateTime lastWriteTimeUtc = File.GetLastWriteTimeUtc(text3);
						if (lastWriteTimeUtc > dateTime)
						{
							dateTime = lastWriteTimeUtc;
							text2 = text3;
						}
					}
					catch
					{
					}
				}
				if (text2 != null)
				{
					return text2;
				}
			}
		}
		return null;
	}

	internal static List<PackageWithWinMd> FindPackagesFromAssets(string assetsPath)
	{
		List<PackageWithWinMd> list = new List<PackageWithWinMd>();
		try
		{
			using JsonDocument jsonDocument = JsonDocument.Parse(File.ReadAllText(assetsPath));
			JsonElement rootElement = jsonDocument.RootElement;
			List<string> list2 = new List<string>();
			if (rootElement.TryGetProperty("packageFolders", out var value))
			{
				foreach (JsonProperty item in value.EnumerateObject())
				{
					list2.Add(item.Name);
				}
			}
			if (!rootElement.TryGetProperty("libraries", out var value2))
			{
				return list;
			}
			Dictionary<string, List<string>> dictionary = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
			if (rootElement.TryGetProperty("targets", out var value3))
			{
				using JsonElement.ObjectEnumerator objectEnumerator = value3.EnumerateObject().GetEnumerator();
				if (objectEnumerator.MoveNext())
				{
					foreach (JsonProperty item2 in objectEnumerator.Current.Value.EnumerateObject())
					{
						if (!item2.Value.TryGetProperty("compile", out var value4))
						{
							continue;
						}
						List<string> list3 = new List<string>();
						foreach (JsonProperty item3 in value4.EnumerateObject())
						{
							string name = item3.Name;
							if (name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) && !name.EndsWith("/_._", StringComparison.Ordinal))
							{
								list3.Add(name);
							}
						}
						if (list3.Count > 0)
						{
							dictionary[item2.Name] = list3;
						}
					}
				}
			}
			foreach (JsonProperty item4 in value2.EnumerateObject())
			{
				if (!item4.Value.TryGetProperty("type", out var value5) || !string.Equals(value5.GetString(), "package", StringComparison.OrdinalIgnoreCase))
				{
					continue;
				}
				int num = item4.Name.IndexOf('/');
				if (num < 0)
				{
					continue;
				}
				string text = item4.Name.Substring(0, num);
				string name2 = item4.Name;
				int num2 = num + 1;
				string version = name2.Substring(num2, name2.Length - num2);
				if (IsFrameworkPackage(text) || !item4.Value.TryGetProperty("path", out var value6))
				{
					continue;
				}
				string text2 = value6.GetString();
				if (text2 == null)
				{
					continue;
				}
				List<string> list4 = new List<string>();
				foreach (string item5 in list2)
				{
					string text3 = Path.Combine(item5, text2);
					if (!Directory.Exists(text3))
					{
						continue;
					}
					list4.AddRange(Directory.GetFiles(text3, "*.winmd", SearchOption.AllDirectories));
					if (!dictionary.TryGetValue(item4.Name, out var value7))
					{
						continue;
					}
					foreach (string item6 in value7)
					{
						string text4 = Path.Combine(text3, item6.Replace('/', Path.DirectorySeparatorChar));
						if (File.Exists(text4))
						{
							list4.Add(text4);
						}
					}
				}
				HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
				list4 = list4.Where((string f) => seen.Add(Path.GetFileName(f))).ToList();
				if (list4.Count > 0)
				{
					// Discover XML docs in the package folder
					List<string> xmlDocs = new List<string>();
					foreach (string item5a in list2)
					{
						string pkgDir = Path.Combine(item5a, text2);
						if (Directory.Exists(pkgDir))
						{
							xmlDocs.AddRange(FindXmlDocsInPackageFolder(pkgDir));
						}
					}
					list.Add(new PackageWithWinMd(text, version, list4, xmlDocs));
				}
			}
		}
		catch (Exception ex)
		{
			Console.Error.WriteLine("Warning: Failed to parse project.assets.json: " + ex.Message);
		}
		return list;
	}

	internal static bool IsFrameworkPackage(string packageId)
	{
		if (packageId.Equals("NETStandard.Library", StringComparison.OrdinalIgnoreCase) || packageId.Equals("Microsoft.NETCore.App", StringComparison.OrdinalIgnoreCase))
		{
			return true;
		}
		string[] array = new string[7] { "System.", "Microsoft.NETCore.", "Microsoft.NET.", "runtime.", "Microsoft.Build.", "Microsoft.CodeAnalysis.", "Microsoft.DiaSymReader." };
		foreach (string value in array)
		{
			if (packageId.StartsWith(value, StringComparison.OrdinalIgnoreCase))
			{
				return true;
			}
		}
		return false;
	}

	internal static List<PackageWithWinMd> FindPackagesFromConfig(string configPath, string projectDir)
	{
		List<PackageWithWinMd> list = new List<PackageWithWinMd>();
		try
		{
			IEnumerable<XElement> enumerable = XDocument.Load(configPath).Root?.Elements("package");
			if (enumerable == null)
			{
				return list;
			}
			string text = FindSolutionPackagesFolder(projectDir);
			string text2 = Environment.GetEnvironmentVariable("NUGET_PACKAGES");
			if (string.IsNullOrWhiteSpace(text2))
			{
				text2 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".nuget", "packages");
			}
			foreach (XElement item in enumerable)
			{
				string text3 = item.Attribute("id")?.Value;
				string text4 = item.Attribute("version")?.Value;
				if (string.IsNullOrEmpty(text3) || string.IsNullOrEmpty(text4))
				{
					continue;
				}
				List<string> list2 = new List<string>();
				if (text != null)
				{
					string path = Path.Combine(text, text3 + "." + text4);
					if (Directory.Exists(path))
					{
						list2.AddRange(Directory.GetFiles(path, "*.winmd", SearchOption.AllDirectories));
					}
				}
				if (list2.Count == 0 && Directory.Exists(text2))
				{
					string path2 = Path.Combine(text2, text3.ToLowerInvariant(), text4);
					if (Directory.Exists(path2))
					{
						list2.AddRange(Directory.GetFiles(path2, "*.winmd", SearchOption.AllDirectories));
					}
				}
				HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
				list2 = list2.Where((string f) => seen.Add(Path.GetFileName(f))).ToList();
				if (list2.Count > 0)
				{
					list.Add(new PackageWithWinMd(text3, text4, list2, new List<string>()));
				}
			}
		}
		catch (Exception ex)
		{
			Console.Error.WriteLine("Warning: Failed to parse packages.config: " + ex.Message);
		}
		return list;
	}

	internal static string? FindSolutionPackagesFolder(string startDir)
	{
		string text = startDir;
		for (int i = 0; i < 5; i++)
		{
			string text2 = Path.Combine(text, "packages");
			if (Directory.Exists(text2))
			{
				return text2;
			}
			DirectoryInfo parent = Directory.GetParent(text);
			if (parent == null)
			{
				break;
			}
			text = parent.FullName;
		}
		return null;
	}

	internal static (List<string> Files, string Version) FindWindowsSdkWinMd()
	{
		string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Windows Kits", "10", "UnionMetadata");
		if (!Directory.Exists(path))
		{
			return (Files: new List<string>(), Version: "unknown");
		}
		Version result;
		foreach (string item in (from d in Directory.GetDirectories(path)
			select (Dir: d, Name: Path.GetFileName(d)) into x
			where !string.IsNullOrEmpty(x.Name) && char.IsDigit(x.Name[0])
			select (!Version.TryParse(x.Name, out result)) ? (Dir: null, Version: null) : (Dir: x.Dir, Version: result) into x
			where x.Dir != null && (object)x.Version != null
			orderby x.Version descending
			select x.Dir).ToList())
		{
			string text = Path.Combine(item, "Windows.winmd");
			if (File.Exists(text))
			{
				string fileName = Path.GetFileName(item);
				int num = 1;
				List<string> list = new List<string>(num);
				CollectionsMarshal.SetCount(list, num);
				Span<string> span = CollectionsMarshal.AsSpan(list);
				int index = 0;
				span[index] = text;
				return (Files: list, Version: fileName);
			}
		}
		return (Files: new List<string>(), Version: "unknown");
	}

	internal static (List<string> Files, string Version) FindWinAppSdkRuntimeWinMd(string? runtimePath)
	{
		if (string.IsNullOrEmpty(runtimePath) || !Directory.Exists(runtimePath))
		{
			return (Files: new List<string>(), Version: "unknown");
		}
		try
		{
			List<string> list = Directory.EnumerateFiles(runtimePath, "*.winmd", SearchOption.TopDirectoryOnly).ToList();
			if (list.Count > 0)
			{
				string fileName = Path.GetFileName(runtimePath);
				string text = fileName.Split('_')[0];
				string text2;
				if (text.Length <= "Microsoft.WindowsAppRuntime.".Length)
				{
					text2 = fileName;
				}
				else
				{
					string text3 = text;
					int length = "Microsoft.WindowsAppRuntime.".Length;
					text2 = text3.Substring(length, text3.Length - length);
				}
				string item = text2;
				return (Files: list, Version: item);
			}
		}
		catch
		{
		}
		return (Files: new List<string>(), Version: "unknown");
	}
}
