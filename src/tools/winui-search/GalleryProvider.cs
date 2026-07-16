// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/// <summary>
/// WinUI 3 Gallery scenarios (<c>microsoft/WinUI-Gallery</c>). Parse logic lives
/// in <see cref="GalleryFetcher"/>; this type just wires it into the provider
/// model. Gallery contributes no author keywords.
/// </summary>
internal sealed class GalleryProvider : CachedProviderBase
{
    public override string Id => "gallery";
    public override string DisplayName => "Gallery (WinUI 3)";

    protected override ProviderData LoadEmbedded()
    {
        var (scenarios, tags) = GalleryFetcher.LoadEmbedded();
        return new ProviderData(scenarios, tags, new());
    }

    protected override async Task<ProviderData> FetchAsync()
    {
        var (scenarios, tags) = await GalleryFetcher.FetchAsync();
        return scenarios.Length > 0
            ? new ProviderData(scenarios, tags, new())
            : ProviderData.Empty;
    }
}
