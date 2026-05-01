// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;

[CompilerGenerated]
internal class Program
{
	private static int Main(string[] args)
	{
		if (args.Length == 0)
		{
			PrintUsage();
			return 1;
		}
		string subcommand = args[0].ToLowerInvariant();
		CliArgs cliArgs = CliArgs.Parse(args.Skip(1).ToArray());
		switch (subcommand)
		{
		case "update":
			return RunUpdate(cliArgs);
		case "search":
			return RunQuery(() => QueryEngine.Search(cliArgs.Positional.FirstOrDefault() ?? "", cliArgs.Max, ResolveCacheDir(cliArgs), ResolveProjectManifest(cliArgs)));
		case "members":
			return RunQuery(() => QueryEngine.Members(cliArgs.Positional.FirstOrDefault() ?? "", ResolveCacheDir(cliArgs), ResolveProjectManifest(cliArgs)));
		case "types":
			return RunQuery(() => QueryEngine.Types(cliArgs.Positional.FirstOrDefault() ?? "", ResolveCacheDir(cliArgs), ResolveProjectManifest(cliArgs)));
		case "enums":
			return RunQuery(() => QueryEngine.Enums(cliArgs.Positional.FirstOrDefault() ?? "", ResolveCacheDir(cliArgs), ResolveProjectManifest(cliArgs)));
		case "check-property":
		{
			string typeName = cliArgs.Positional.ElementAtOrDefault(0) ?? "";
			string propName = cliArgs.Positional.ElementAtOrDefault(1) ?? "";
			return RunQuery(() => QueryEngine.CheckProperty(typeName, propName, ResolveCacheDir(cliArgs), ResolveProjectManifest(cliArgs)));
		}
		case "namespaces":
			return RunQuery(() => QueryEngine.Namespaces(cliArgs.Filter, ResolveCacheDir(cliArgs), ResolveProjectManifest(cliArgs)));
		case "packages":
			return RunQuery(() => QueryEngine.Packages(ResolveCacheDir(cliArgs), ResolveProjectManifest(cliArgs)));
		case "projects":
			return RunQueryNoAutoUpdate(() => QueryEngine.Projects(ResolveCacheDir(cliArgs)));
		case "stats":
			return RunQuery(() => QueryEngine.Stats(ResolveCacheDir(cliArgs), ResolveProjectManifest(cliArgs)));
		case "--help":
		case "-h":
		case "help":
			return Do(delegate
			{
				PrintUsage();
			});
		default:
			return Do(delegate
			{
				Console.Error.WriteLine("Unknown command: " + subcommand);
				PrintUsage();
			}, 1);
		}
		static void AutoUpdateIfNeeded(CliArgs cli)
		{
			string text = cli.ProjectDir ?? Directory.GetCurrentDirectory();
			string path = ResolveCacheDir(cli);
			string text2 = NuGetResolver.FindProjectAssetsJson(text);
			if (text2 != null)
			{
				DateTime lastWriteTimeUtc = File.GetLastWriteTimeUtc(text2);
				string path2 = Path.Combine(path, "projects");
				bool needsUpdate = false;
				if (!Directory.Exists(path2))
				{
					needsUpdate = true;
				}
				else
				{
					string text3 = FindProjectNameInDir(text);
					if (text3 != null)
					{
						string[] files = Directory.GetFiles(path2, "*.json");
						bool found = false;
						foreach (string path3 in files)
						{
							string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(path3);
							if (fileNameWithoutExtension.Equals(text3, StringComparison.OrdinalIgnoreCase) || fileNameWithoutExtension.StartsWith(text3 + "_", StringComparison.OrdinalIgnoreCase))
							{
								found = true;
								DateTime lastWriteTimeUtc2 = File.GetLastWriteTimeUtc(path3);
								if (lastWriteTimeUtc > lastWriteTimeUtc2)
								{
									needsUpdate = true;
								}
								break;
							}
						}
						if (!found)
						{
							needsUpdate = true;
						}
					}
				}
				if (needsUpdate)
				{
					RunUpdateWithLock(cli, path);
				}
			}
		}
		static void RunUpdateWithLock(CliArgs cli, string cacheDir)
		{
			Directory.CreateDirectory(cacheDir);
			string lockPath = Path.Combine(cacheDir, ".lock");
			try
			{
				using var lockFile = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
				Console.Error.WriteLine("Indexing packages...");
				RunUpdate(cli);
			}
			catch (IOException)
			{
				// Another process is updating the cache — wait briefly then use whatever exists
				Console.Error.WriteLine("Cache is being updated by another process, waiting...");
				for (int i = 0; i < 30; i++)
				{
					Thread.Sleep(1000);
					try
					{
						using var lockFile = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
						// Lock acquired — the other process finished
						break;
					}
					catch (IOException)
					{
						// Still locked, keep waiting
					}
				}
			}
		}
		static ProjectManifest? DeserializeManifest(string path)
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
		static string? DetectWinAppSdkRuntime()
		{
			try
			{
				string text = RuntimeInformation.OSArchitecture.ToString();
				using Process process = Process.Start(new ProcessStartInfo
				{
					FileName = "powershell.exe",
					Arguments = "-NoProfile -Command \"Get-AppxPackage -Name 'Microsoft.WindowsAppRuntime.*' | Where-Object { $_.Name -notmatch 'CBS' -and $_.Architecture -eq '" + text + "' } | Sort-Object -Property Version -Descending | Select-Object -First 1 -ExpandProperty InstallLocation\"",
					RedirectStandardOutput = true,
					RedirectStandardError = true,
					UseShellExecute = false,
					CreateNoWindow = true
				});
				if (process == null)
				{
					return null;
				}
				string text2 = process.StandardOutput.ReadToEnd().Trim();
				process.WaitForExit(15000);
				if (process.ExitCode == 0 && !string.IsNullOrEmpty(text2) && Directory.Exists(text2))
				{
					Console.Error.WriteLine("Detected WinAppSDK runtime: " + Path.GetFileName(text2));
					return text2;
				}
			}
			catch
			{
			}
			return null;
		}
		static string? DetectWinAppSdkVersion(string repoRoot)
		{
			string text = Path.Combine(repoRoot, "Directory.Packages.props");
			if (File.Exists(text))
			{
				try
				{
					string text2 = XDocument.Load(text).Descendants("PackageVersion").FirstOrDefault((XElement e) => string.Equals(e.Attribute("Include")?.Value, "Microsoft.WindowsAppSDK", StringComparison.OrdinalIgnoreCase))?.Attribute("Version")?.Value;
					if (text2 != null)
					{
						Console.Error.WriteLine("Detected WinAppSDK version from Directory.Packages.props: " + text2);
						return text2;
					}
				}
				catch
				{
				}
			}
			string text3 = Path.Combine(repoRoot, "packages.config");
			if (File.Exists(text3))
			{
				try
				{
					string text4 = XDocument.Load(text3).Descendants("package").FirstOrDefault((XElement e) => string.Equals(e.Attribute("id")?.Value, "Microsoft.WindowsAppSDK", StringComparison.OrdinalIgnoreCase))?.Attribute("version")?.Value;
					if (text4 != null)
					{
						Console.Error.WriteLine("Detected WinAppSDK version from packages.config: " + text4);
						return text4;
					}
				}
				catch
				{
				}
			}
			return null;
		}
		static List<string> DiscoverProjectFiles(string inputPath, bool scanMode)
		{
			List<string> list = new List<string>();
			if (scanMode)
			{
				if (!Directory.Exists(inputPath))
				{
					Console.Error.WriteLine("Error: Root directory not found: " + inputPath);
					return list;
				}
				EnumerationOptions enumerationOptions = new EnumerationOptions
				{
					RecurseSubdirectories = true,
					IgnoreInaccessible = true,
					MatchType = MatchType.Simple
				};
				list.AddRange(Directory.EnumerateFiles(inputPath, "*.csproj", enumerationOptions));
				list.AddRange(Directory.EnumerateFiles(inputPath, "*.vcxproj", enumerationOptions));
				list = (from f in list
					where !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
					where !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
					where !f.Contains($"{Path.DirectorySeparatorChar}node_modules{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
					select f).ToList();
			}
			else if (File.Exists(inputPath) && (inputPath.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase) || inputPath.EndsWith(".vcxproj", StringComparison.OrdinalIgnoreCase)))
			{
				list.Add(inputPath);
			}
			else if (Directory.Exists(inputPath))
			{
				list.AddRange(Directory.GetFiles(inputPath, "*.csproj"));
				list.AddRange(Directory.GetFiles(inputPath, "*.vcxproj"));
			}
			return list;
		}
		static int Do(Action action, int exitCode = 0)
		{
			action();
			return exitCode;
		}
		static void ExportPackageCache(PackageWithWinMd pkg, string cacheDir, JsonSerializerOptions jsonOptions)
		{
			string text = Path.Combine(cacheDir, "types");
			Directory.CreateDirectory(text);
			List<WinMdTypeInfo> list = new List<WinMdTypeInfo>();
			foreach (string winMdFile in pkg.WinMdFiles)
			{
				list.AddRange(WinMdParser.ParseFile(winMdFile));
			}

			// Parse and merge XML documentation
			if (pkg.XmlDocFiles.Count > 0)
			{
				var allDocs = new Dictionary<string, string>(StringComparer.Ordinal);
				foreach (string xmlFile in pkg.XmlDocFiles)
				{
					foreach (var kvp in XmlDocParser.ParseFile(xmlFile))
					{
						allDocs.TryAdd(kvp.Key, kvp.Value);
					}
				}
				if (allDocs.Count > 0)
				{
					XmlDocParser.MergeDescriptions(list, allDocs);
					Console.Error.WriteLine($"    Merged {allDocs.Count} XML doc entries");
				}
			}

			Dictionary<string, List<WinMdTypeInfo>> dictionary = (from t in list
				group t by t.Namespace).ToDictionary((IGrouping<string, WinMdTypeInfo> g) => g.Key, (IGrouping<string, WinMdTypeInfo> g) => g.ToList());
			List<string> list2 = (from ns in dictionary.Keys
				where !string.IsNullOrEmpty(ns)
				orderby ns
				select ns).ToList();
			if (dictionary.ContainsKey(string.Empty) && dictionary[string.Empty].Count > 0)
			{
				list2.Insert(0, "_GlobalNamespace");
			}
			var value = new PackageMeta
			{
				PackageId = pkg.Id,
				Version = pkg.Version,
				WinMdFiles = pkg.WinMdFiles.Select(Path.GetFileName).Distinct<string>(StringComparer.OrdinalIgnoreCase).ToList(),
				TotalTypes = list.Count,
				TotalMembers = list.Sum((WinMdTypeInfo t) => t.Members.Count),
				TotalNamespaces = list2.Count,
				GeneratedAt = DateTime.UtcNow.ToString("o")
			};
			WriteFileAtomic(Path.Combine(cacheDir, "meta.json"), JsonSerializer.Serialize(value, WinMdJsonContext.Default.PackageMeta));
			WriteFileAtomic(Path.Combine(cacheDir, "namespaces.json"), JsonSerializer.Serialize(list2, WinMdJsonContext.Default.ListString));
			foreach (string item in list2)
			{
				string key = ((item == "_GlobalNamespace") ? string.Empty : item);
				List<WinMdTypeInfo> value2 = dictionary[key];
				string path = item.Replace('.', '_') + ".json";
				WriteFileAtomic(Path.Combine(text, path), JsonSerializer.Serialize(value2, WinMdJsonContext.Default.ListWinMdTypeInfo));
			}
		}
		/// <summary>
		/// Writes file content atomically by writing to a temp file then renaming.
		/// Prevents concurrent readers from seeing partial writes.
		/// </summary>
		static void WriteFileAtomic(string path, string content)
		{
			string dir = Path.GetDirectoryName(path)!;
			Directory.CreateDirectory(dir);
			string tempPath = path + ".tmp." + Environment.ProcessId;
			try
			{
				File.WriteAllText(tempPath, content);
				File.Move(tempPath, path, overwrite: true);
			}
			catch
			{
				try { File.Delete(tempPath); } catch { }
				// Fallback to direct write if atomic move fails
				File.WriteAllText(path, content);
			}
		}
		static string? FindProjectNameInDir(string dir)
		{
			if (!Directory.Exists(dir))
			{
				return null;
			}
			string[] array = Directory.GetFiles(dir, "*.csproj").Concat(Directory.GetFiles(dir, "*.vcxproj")).ToArray();
			if (array.Length == 0)
			{
				return null;
			}
			return Path.GetFileNameWithoutExtension(array[0]);
		}
		static string? FindRepoRoot(string startDir)
		{
			for (string text = startDir; text != null; text = Directory.GetParent(text)?.FullName)
			{
				if (Directory.Exists(Path.Combine(text, ".git")))
				{
					return text;
				}
			}
			return null;
		}
		static void PrintUsage()
		{
			Console.Error.WriteLine("winmd — WinMD API metadata cache & query tool");
			Console.Error.WriteLine();
			Console.Error.WriteLine("Commands:");
			Console.Error.WriteLine("  update                          Build/refresh the WinMD cache");
			Console.Error.WriteLine("  search <query>                  Search types and members by name");
			Console.Error.WriteLine("  members <TypeName>              List members of a type (with descriptions)");
			Console.Error.WriteLine("  check-property <Type> <Prop>    Validate a property exists on a type");
			Console.Error.WriteLine("  types <Namespace>               List types in a namespace");
			Console.Error.WriteLine("  enums <TypeName>                List enum values");
			Console.Error.WriteLine("  namespaces [--filter <prefix>]  List namespaces");
			Console.Error.WriteLine("  packages                        List packages for a project");
			Console.Error.WriteLine("  projects                        List cached projects");
			Console.Error.WriteLine("  stats                           Show aggregate statistics");
			Console.Error.WriteLine();
			Console.Error.WriteLine("Options:");
			Console.Error.WriteLine("  --project-dir <path>   Project directory (default: current directory)");
			Console.Error.WriteLine("  --project <name>       Project name (auto-selected if unambiguous)");
			Console.Error.WriteLine("  --output <path>        Cache directory (default: %LOCALAPPDATA%\\winmd-cache)");
			Console.Error.WriteLine("  --scan                 Recursively discover projects (update only)");
			Console.Error.WriteLine("  --max <n>              Max search results (default: 30)");
			Console.Error.WriteLine("  --filter <prefix>      Namespace prefix filter (namespaces only)");
			Console.Error.WriteLine("  --winappsdk-runtime <path>  WinAppSDK runtime path override");
		}
		static string ResolveCacheDir(CliArgs cli)
		{
			return cli.Output ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "winmd-cache");
		}
		static ProjectManifest? ResolveProjectManifest(CliArgs cli)
		{
			string path = Path.Combine(ResolveCacheDir(cli), "projects");
			if (!Directory.Exists(path))
			{
				return null;
			}
			string[] files = Directory.GetFiles(path, "*.json");
			if (files.Length == 0)
			{
				return null;
			}
			if (cli.Project != null)
			{
				string[] array = files;
				foreach (string path2 in array)
				{
					string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(path2);
					if (fileNameWithoutExtension.Equals(cli.Project, StringComparison.OrdinalIgnoreCase) || fileNameWithoutExtension.StartsWith(cli.Project + "_", StringComparison.OrdinalIgnoreCase))
					{
						return DeserializeManifest(path2);
					}
				}
				Console.Error.WriteLine("Project '" + cli.Project + "' not found in cache.");
				return null;
			}
			if (cli.ProjectDir != null)
			{
				string fullPath = Path.GetFullPath(cli.ProjectDir);
				string[] array = files;
				for (int i = 0; i < array.Length; i++)
				{
					ProjectManifest projectManifest = DeserializeManifest(array[i]);
					if (projectManifest != null && projectManifest.ProjectDir.Equals(fullPath, StringComparison.OrdinalIgnoreCase))
					{
						return projectManifest;
					}
				}
				string text = FindProjectNameInDir(fullPath);
				if (text != null)
				{
					array = files;
					foreach (string path3 in array)
					{
						string fileNameWithoutExtension2 = Path.GetFileNameWithoutExtension(path3);
						if (fileNameWithoutExtension2.Equals(text, StringComparison.OrdinalIgnoreCase) || fileNameWithoutExtension2.StartsWith(text + "_", StringComparison.OrdinalIgnoreCase))
						{
							return DeserializeManifest(path3);
						}
					}
				}
			}
			if (files.Length == 1)
			{
				return DeserializeManifest(files[0]);
			}
			string text2 = FindProjectNameInDir(cli.ProjectDir ?? Directory.GetCurrentDirectory());
			if (text2 != null)
			{
				string[] array = files;
				foreach (string path4 in array)
				{
					string fileNameWithoutExtension3 = Path.GetFileNameWithoutExtension(path4);
					if (fileNameWithoutExtension3.Equals(text2, StringComparison.OrdinalIgnoreCase) || fileNameWithoutExtension3.StartsWith(text2 + "_", StringComparison.OrdinalIgnoreCase))
					{
						return DeserializeManifest(path4);
					}
				}
			}
			string text3 = string.Join(", ", files.Select((string m) => Path.GetFileNameWithoutExtension(m)));
			Console.Error.WriteLine("Multiple projects cached — use --project to specify. Available: " + text3);
			return null;
		}
		int RunQuery(Func<int> queryFunc)
		{
			AutoUpdateIfNeeded(cliArgs);
			return queryFunc();
		}
		static int RunQueryNoAutoUpdate(Func<int> queryFunc)
		{
			return queryFunc();
		}
		static int RunUpdate(CliArgs cli)
		{
			string fullPath = Path.GetFullPath(cli.ProjectDir ?? Directory.GetCurrentDirectory());
			string text = ResolveCacheDir(cli);
			bool scan = cli.Scan;
			DetectWinAppSdkVersion(FindRepoRoot(fullPath) ?? fullPath);
			string winAppSdkRuntimePath = cli.WinAppSdkRuntime ?? DetectWinAppSdkRuntime();
			List<string> list = DiscoverProjectFiles(fullPath, scan);
			string selfCsproj = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "CacheGenerator.csproj");
			selfCsproj = Path.GetFullPath(selfCsproj);
			if (File.Exists(selfCsproj) && !list.Any((string f) => Path.GetFullPath(f).Equals(selfCsproj, StringComparison.OrdinalIgnoreCase)))
			{
				list.Add(selfCsproj);
			}
			if (list.Count == 0)
			{
				Console.Error.WriteLine("No .csproj or .vcxproj files found in: " + fullPath);
				return 1;
			}
			Console.Error.WriteLine("WinMD Cache Generator");
			Console.Error.WriteLine("  Output:   " + text);
			Console.Error.WriteLine($"  Projects: {list.Count}");
			JsonSerializerOptions writeOptions = JsonHelper.WriteOptions;
			int num = 0;
			int num2 = 0;
			int num3 = 0;
			foreach (string item2 in list)
			{
				string directoryName = Path.GetDirectoryName(item2);
				string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(item2);
				Console.Error.WriteLine($"\n--- {fileNameWithoutExtension} ({Path.GetFileName(item2)}) ---");
				List<PackageWithWinMd> list2 = NuGetResolver.FindPackagesWithWinMd(directoryName, item2, winAppSdkRuntimePath);
				if (list2.Count == 0)
				{
					Console.Error.WriteLine("  No packages with WinMD files (is the project restored?)");
				}
				else
				{
					Console.Error.WriteLine($"  {list2.Count} package(s) with WinMD files");
					num3++;
					List<ProjectPackageRef> list3 = new List<ProjectPackageRef>();
					foreach (PackageWithWinMd item3 in list2)
					{
						string text2 = Path.Combine(text, "packages", item3.Id, item3.Version);
						if (File.Exists(Path.Combine(text2, "meta.json")))
						{
							Console.Error.WriteLine("  [cached] " + item3.Id + "@" + item3.Version);
							num2++;
						}
						else
						{
							Console.Error.WriteLine($"  [parse]  {item3.Id}@{item3.Version} ({item3.WinMdFiles.Count} WinMD file(s))");
							ExportPackageCache(item3, text2, writeOptions);
							num++;
						}
						list3.Add(new ProjectPackageRef
						{
							Id = item3.Id,
							Version = item3.Version
						});
					}
					ProjectManifest value = new ProjectManifest
					{
						ProjectName = fileNameWithoutExtension,
						ProjectDir = directoryName,
						ProjectFile = Path.GetFileName(item2),
						Packages = list3,
						GeneratedAt = DateTime.UtcNow.ToString("o")
					};
					string text3 = Path.Combine(text, "projects");
					Directory.CreateDirectory(text3);
					string text4 = fileNameWithoutExtension;
					if (scan)
					{
						string text5 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(item2))).Substring(0, 8).ToLowerInvariant();
						text4 = fileNameWithoutExtension + "_" + text5;
					}
					WriteFileAtomic(Path.Combine(text3, text4 + ".json"), JsonSerializer.Serialize(value, WinMdJsonContext.Default.ProjectManifest));
				}
			}
			Console.Error.WriteLine($"\nDone: {num3} project(s) processed, {num} package(s) parsed, {num2} reused from cache");
			return 0;
		}
	}
}
