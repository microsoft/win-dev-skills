// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Collections.Generic;

internal sealed class NsSearchResult
{
	public int BestScore { get; set; }

	public List<ScoredMatch> Types { get; } = new List<ScoredMatch>();

	public List<string> FilePaths { get; } = new List<string>();
}
