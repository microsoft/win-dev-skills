using System.Collections.Generic;

internal sealed class CliArgs
{
	public string? ProjectDir { get; set; }

	public string? Project { get; set; }

	public string? Output { get; set; }

	public string? Filter { get; set; }

	public string? WinAppSdkRuntime { get; set; }

	public bool Scan { get; set; }

	public int Max { get; set; } = 30;

	public List<string> Positional { get; set; } = new List<string>();

	public static CliArgs Parse(string[] args)
	{
		CliArgs cliArgs = new CliArgs();
		for (int i = 0; i < args.Length; i++)
		{
			switch (args[i].ToLowerInvariant())
			{
			case "--project-dir":
				if (i + 1 < args.Length)
				{
					cliArgs.ProjectDir = args[++i];
					continue;
				}
				break;
			case "--project":
				if (i + 1 < args.Length)
				{
					cliArgs.Project = args[++i];
					continue;
				}
				break;
			case "--output":
				if (i + 1 < args.Length)
				{
					cliArgs.Output = args[++i];
					continue;
				}
				break;
			case "--filter":
				if (i + 1 < args.Length)
				{
					cliArgs.Filter = args[++i];
					continue;
				}
				break;
			case "--winappsdk-runtime":
				if (i + 1 < args.Length)
				{
					cliArgs.WinAppSdkRuntime = args[++i];
					continue;
				}
				break;
			case "--scan":
				cliArgs.Scan = true;
				continue;
			case "--max":
				if (i + 1 < args.Length)
				{
					if (int.TryParse(args[++i], out var result))
					{
						cliArgs.Max = result;
					}
					continue;
				}
				break;
			}
			if (!args[i].StartsWith('-'))
			{
				cliArgs.Positional.Add(args[i]);
			}
		}
		return cliArgs;
	}
}
