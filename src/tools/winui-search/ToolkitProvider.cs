// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/// <summary>
/// Windows Community Toolkit scenarios (<c>CommunityToolkit/Windows</c>). Parse
/// logic lives in <see cref="ToolkitFetcher"/>. Toolkit cleans its tag
/// dictionary on write, so it re-cleans on cache read too.
/// </summary>
internal sealed class ToolkitProvider : CachedProviderBase
{
    public override string Id => "toolkit";
    public override string DisplayName => "CommunityToolkit";

    protected override Dictionary<string, string[]> NormalizeTagsOnRead(
        Dictionary<string, string[]> tags) => global::StopWords.CleanTagDictionary(tags);

    protected override ProviderData LoadEmbedded()
    {
        var (scenarios, tags, keywords) = ToolkitFetcher.LoadEmbedded();
        return new ProviderData(scenarios, tags, keywords);
    }

    protected override async Task<ProviderData> FetchAsync()
    {
        var (scenarios, tags, keywords) = await ToolkitFetcher.FetchAsync();
        return scenarios.Length > 0
            ? new ProviderData(scenarios, tags, keywords)
            : ProviderData.Empty;
    }
}
