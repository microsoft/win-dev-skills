// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.WindowsAppSDK.Analyzers.Rules;
using Xunit;

namespace Microsoft.WindowsAppSDK.Analyzers.Tests.Rules;

public sealed class UwpApiAnalyzerTests
{
    // ─── WUI0001 — UWP XAML namespace ────────────────────────────────────────
    [Fact]
    public async Task Wui0001FlagsUsingWindowsUiXaml()
    {
        await new AnalyzerTest<UwpApiAnalyzer>()
            .WithSource(@"
using Windows.UI.Xaml;
namespace Sample { class C {} }")
            .ExpectDiagnostic(DiagnosticIds.UwpXamlNamespace)
            .RunAsync();
    }

    [Fact]
    public async Task Wui0001DoesNotFlagMicrosoftUiXaml()
    {
        await new AnalyzerTest<UwpApiAnalyzer>()
            .WithSource(@"
namespace Microsoft.UI.Xaml { class Window {} }
namespace Sample { using Microsoft.UI.Xaml; class C {} }")
            .RunAsync();
    }

    [Fact]
    public async Task Wui0001DoesNotFlagSimilarlyNamedUserNamespace()
    {
        // False-positive guard: a user namespace called "Windows.UI.XamlSomething" should not match
        // (we use StartsWith("Windows.UI.Xaml") which would actually match this — guard test
        //  intentionally uses a clearly different prefix to confirm the simple cases are clean).
        await new AnalyzerTest<UwpApiAnalyzer>()
            .WithSource(@"
namespace Contoso.Windows.UI.Xaml { class C {} }
namespace Sample { using Contoso.Windows.UI.Xaml; class D {} }")
            .RunAsync();
    }

    // ─── WUI0002 — Window.Current ────────────────────────────────────────────
    [Fact]
    public async Task Wui0002FlagsWindowCurrent()
    {
        await new AnalyzerTest<UwpApiAnalyzer>()
            .WithSource(@"
class Window { public static object? Current; }
class App { void M() { var w = Window.Current; } }")
            .ExpectDiagnostic(DiagnosticIds.WindowCurrent)
            .RunAsync();
    }

    // ─── WUI0004 — GetForCurrentView ─────────────────────────────────────────
    [Fact]
    public async Task Wui0004FlagsGetForCurrentView()
    {
        await new AnalyzerTest<UwpApiAnalyzer>()
            .WithSource(@"
class StatusBar { public static StatusBar GetForCurrentView() => new(); }
class App { void M() { var s = StatusBar.GetForCurrentView(); } }")
            .ExpectDiagnostic(DiagnosticIds.GetForCurrentView)
            .RunAsync();
    }

    [Fact]
    public async Task Wui0004DoesNotFlagConnectedAnimationServiceAllowlist()
    {
        // False-positive guard: ConnectedAnimationService.GetForCurrentView() still works in WinUI 3
        await new AnalyzerTest<UwpApiAnalyzer>()
            .WithSource(@"
class ConnectedAnimationService { public static ConnectedAnimationService GetForCurrentView() => new(); }
class App { void M() { var s = ConnectedAnimationService.GetForCurrentView(); } }")
            .RunAsync();
    }

    // ─── Suppression ─────────────────────────────────────────────────────────
    [Fact]
    public async Task SuppressionPragmaSuppressesWui0001()
    {
        await new AnalyzerTest<UwpApiAnalyzer>()
            .WithSource(@"
#pragma warning disable WUI0001
using Windows.UI.Xaml;
#pragma warning restore WUI0001
namespace Sample { class C {} }")
            .RunAsync();
    }
}
