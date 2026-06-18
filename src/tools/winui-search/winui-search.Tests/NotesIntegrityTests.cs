// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Linq;
using System.Reflection;
using System.Text.Json;
using Xunit;

namespace WinUISearch.Tests;

/// <summary>
/// Guards <see cref="Notes"/>'s lookup tables against drift: every controlId
/// referenced in <c>KnownPitfalls</c> or <c>ControlToFamily</c> must resolve to
/// an actual scenario in the embedded gallery or toolkit index. Without this,
/// an upstream <c>Title</c>-style rename can silently drop pitfall coverage
/// for a control (the original symptom that prompted this refactor: the
/// <c>"AppNotification"</c> key never matched after upstream renamed the
/// Title to <c>"App notifications"</c>).
/// </summary>
public sealed class NotesIntegrityTests
{
    private static readonly HashSet<string> KnownIndexControlIds = LoadEmbeddedControlIds();

    private static HashSet<string> LoadEmbeddedControlIds()
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var resource in new[] { "gallery-scenarios.json", "toolkit-scenarios.json" })
        {
            using var stream = typeof(GalleryFetcher).Assembly.GetManifestResourceStream(resource);
            Assert.NotNull(stream);
            using var doc = JsonDocument.Parse(stream!);
            // Hierarchical format: dict keys are controlIds
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                ids.Add(prop.Name);
            }
        }
        return ids;
    }

    /// <summary>Every controlId referenced by Notes must exist in the embedded
    /// scenario index. Orphan keys = silent coverage gaps.</summary>
    [Fact]
    public void EveryNotesKeyResolvesToARealControlId()
    {
        var orphans = Notes.AllReferencedControlIds()
            .Where(k => !KnownIndexControlIds.Contains(k))
            .Distinct()
            .OrderBy(s => s)
            .ToArray();

        Assert.True(
            orphans.Length == 0,
            $"Notes.cs references {orphans.Length} controlId(s) that don't exist in the " +
            $"embedded scenario index — typically caused by an upstream Title or UniqueId " +
            $"rename. Either fix the key in Notes.cs to match the current controlId, or " +
            $"delete the entry if the control was retired:\n  " +
            string.Join("\n  ", orphans));
    }

    /// <summary>Cross-check: every controlId in ControlToFamily must point at a
    /// FamilyGuide family that actually exists. Catches typos at compile time
    /// rather than as silent "no family attached" output.</summary>
    [Fact]
    public void EveryFamilyKeyHasAFamilyGuide()
    {
        // Use reflection to enumerate the private fields rather than re-listing
        // them here — we want the test to break the next time someone adds a new
        // ControlToFamily entry pointing at a typo'd family.
        var notesType = typeof(Notes);
        var familyGuide = (Dictionary<string, string>)notesType
            .GetField("FamilyGuide", BindingFlags.NonPublic | BindingFlags.Static)!
            .GetValue(null)!;
        var controlToFamily = (Dictionary<string, string>)notesType
            .GetField("ControlToFamily", BindingFlags.NonPublic | BindingFlags.Static)!
            .GetValue(null)!;

        var bad = controlToFamily
            .Where(kv => !familyGuide.ContainsKey(kv.Value))
            .Select(kv => $"{kv.Key} -> {kv.Value}")
            .ToArray();

        Assert.True(bad.Length == 0,
            "ControlToFamily entries point at families not declared in FamilyGuide:\n  " +
            string.Join("\n  ", bad));
    }

    /// <summary>Targeted regression: <c>appnotification</c> must attach the
    /// Popups family guide. Upstream's <c>App notifications</c> Title rename
    /// silently dropped this coverage in v1 of the lookup; this test guards
    /// against future similar regressions for that specific control.</summary>
    [Fact]
    public void AppNotificationGetsPopupsFamily()
    {
        var payload = Notes.Get("appnotification");
        Assert.Equal("Popups", payload.FamilyName);
        Assert.NotNull(payload.FamilyGuide);
        Assert.Contains("AppNotification", payload.FamilyGuide!);
    }

    /// <summary>Targeted regression: <c>appwindow</c> got pitfall coverage in
    /// the v2 cleanup pass for WinUI 3 desktop titlebar customization. Guard
    /// that the entries don't get deleted by accident — at least one pitfall
    /// must mention <c>ExtendsContentIntoTitleBar</c> and at least one must
    /// mention <c>SetTitleBar</c>.</summary>
    [Fact]
    public void AppWindowHasTitlebarPitfalls()
    {
        var pitfalls = Notes.GetNotes("appwindow");
        Assert.NotEmpty(pitfalls);
        Assert.Contains(pitfalls, p => p.Contains("ExtendsContentIntoTitleBar"));
        Assert.Contains(pitfalls, p => p.Contains("SetTitleBar"));
    }

    /// <summary>Lookup by display name must NOT work — the refactor was the whole
    /// point. Catches the case where someone refactors back to using
    /// <c>ControlName</c> by accident.</summary>
    [Fact]
    public void LookupByDisplayNameReturnsEmpty()
    {
        // PascalCase display name should not resolve — only the lowercase controlId.
        var byDisplayName = Notes.Get("TabView");
        Assert.Empty(byDisplayName.Pitfalls);
        Assert.Null(byDisplayName.FamilyName);

        // Sanity: the lowercase form does resolve.
        var byControlId = Notes.Get("tabview");
        Assert.NotEmpty(byControlId.Pitfalls);
        Assert.Equal("Tabs", byControlId.FamilyName);
    }
}
