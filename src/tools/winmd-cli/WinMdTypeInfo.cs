// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Collections.Generic;

internal sealed class WinMdTypeInfo
{
	public required string Namespace { get; init; }

	public required string Name { get; init; }

	public required string FullName { get; init; }

	public required TypeKind Kind { get; init; }

	public string? BaseType { get; init; }

	public required List<WinMdMemberInfo> Members { get; init; }

	public List<string>? EnumValues { get; init; }

	public required string SourceFile { get; init; }

	public string? Description { get; set; }

	public string? DeprecatedMessage { get; set; }
}
