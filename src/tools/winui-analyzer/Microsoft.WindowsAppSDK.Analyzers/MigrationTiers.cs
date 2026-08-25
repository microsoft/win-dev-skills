// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Collections.Immutable;

namespace Microsoft.WindowsAppSDK.Analyzers;

/// <summary>
/// Migration-severity tiers carried on a diagnostic's <see cref="Microsoft.CodeAnalysis.Diagnostic.Properties"/>
/// bag. This is orthogonal to the Roslyn <c>DiagnosticSeverity</c> (all migration rules ship at
/// Warning): it lets the out-of-process analyze driver map a finding to the JSON contract's
/// <c>severity</c> field.
///
/// <para><b>startup-crash</b> marks APIs that THROW at runtime if left unaddressed (e.g. view-scoped
/// <c>GetForCurrentView</c> family, <c>DisplayRequest</c>) — these crash the page to a blank window
/// and must never be resolved with a keep-comment.</para>
/// </summary>
internal static class MigrationTiers
{
    /// <summary>Property key on <c>Diagnostic.Properties</c>.</summary>
    public const string PropertyKey = "MigrationTier";

    /// <summary>Runtime-crash tier value (maps to contract <c>severity: startup-crash</c>).</summary>
    public const string StartupCrash = "startup-crash";

    /// <summary>
    /// Sensitive-family tier value (maps to contract <c>severity: sensitive</c>). Drives the
    /// skill's SEQUENTIAL pacing. Carried on <c>WUI1010</c> feature hints for the sensitive
    /// families only (media-capture/speech/audio/sensors/…), NOT on ordinary namespace-rename
    /// hints — so a plain <c>Windows.UI.Xaml</c> hint does not force sequential processing.
    /// </summary>
    public const string Sensitive = "sensitive";

    /// <summary>
    /// Property key carrying the detected UWP API (qualified name / namespace prefix) verbatim, so
    /// the analyze driver reads it from <c>Diagnostic.Properties</c> instead of slicing the
    /// (localizable) diagnostic message.
    /// </summary>
    public const string DetectedApiKey = "DetectedApi";

    /// <summary>Property key carrying the migration feature area (WUI1010), for the same reason.</summary>
    public const string FeatureAreaKey = "FeatureArea";

    /// <summary>Ready-made properties bag for a startup-crash finding.</summary>
    public static readonly ImmutableDictionary<string, string?> StartupCrashProperties =
        ImmutableDictionary<string, string?>.Empty.Add(PropertyKey, StartupCrash);

    /// <summary>Ready-made properties bag for a sensitive-family finding.</summary>
    public static readonly ImmutableDictionary<string, string?> SensitiveProperties =
        ImmutableDictionary<string, string?>.Empty.Add(PropertyKey, Sensitive);

    /// <summary>
    /// Builds a <c>Diagnostic.Properties</c> bag merging an optional migration tier with the
    /// machine-readable finding data the analyze driver needs. Keeping this data on the property
    /// bag (rather than parsing it back out of the message string) makes the driver robust to
    /// message localization and wording changes.
    /// </summary>
    public static ImmutableDictionary<string, string?> Build(
        string? tier = null, string? detectedApi = null, string? featureArea = null)
    {
        var b = ImmutableDictionary<string, string?>.Empty;
        if (tier != null) b = b.Add(PropertyKey, tier);
        if (detectedApi != null) b = b.Add(DetectedApiKey, detectedApi);
        if (featureArea != null) b = b.Add(FeatureAreaKey, featureArea);
        return b;
    }
}
