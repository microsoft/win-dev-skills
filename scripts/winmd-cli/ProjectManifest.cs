using System.Collections.Generic;

internal sealed class ProjectManifest
{
	public required string ProjectName { get; init; }

	public required string ProjectDir { get; init; }

	public required string ProjectFile { get; init; }

	public required List<ProjectPackageRef> Packages { get; init; }

	public required string GeneratedAt { get; init; }
}
