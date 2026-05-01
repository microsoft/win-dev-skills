// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Collections.Generic;

internal sealed class WinMdMemberInfo
{
	public required string Name { get; init; }

	public required MemberKind Kind { get; init; }

	public required string Signature { get; init; }

	public string? ReturnType { get; init; }

	public List<WinMdParameterInfo>? Parameters { get; init; }

	public string? Description { get; set; }

	public string? DeprecatedMessage { get; set; }
}
