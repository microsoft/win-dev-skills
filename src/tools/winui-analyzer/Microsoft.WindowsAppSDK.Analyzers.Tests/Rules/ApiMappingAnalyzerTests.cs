// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Threading.Tasks;
using Microsoft.WindowsAppSDK.Analyzers.Rules;
using Xunit;

namespace Microsoft.WindowsAppSDK.Analyzers.Tests.Rules;

/// <summary>
/// Tests for the data-driven UWP→WinAppSDK mapping analyzer (WUI1001/WUI1002/WUI1010).
/// The analyzer is gated by <c>ProjectContext</c>: it only fires when the compilation
/// looks like a UWP-migration project. We trigger that by either (a) including
/// <c>using Windows.UI.Xaml;</c> in the source, or (b) adding a Package.appxmanifest
/// AdditionalFile with a UWP-style xmlns:uap.
/// </summary>
public sealed class ApiMappingAnalyzerTests
{
    private const string UwpManifest = @"<?xml version=""1.0"" encoding=""utf-8""?>
<Package xmlns=""http://schemas.microsoft.com/appx/manifest/foundation/windows10""
         xmlns:uap=""http://schemas.microsoft.com/appx/manifest/uap/windows10"">
  <Identity Name=""contoso"" Publisher=""CN=Contoso"" Version=""1.0.0.0"" />
</Package>";

    [Fact]
    public async Task Wui1001FlagsCompositionNamespaceUsingInMigratingProject()
    {
        // Windows.UI.Composition IS a mapping entry → WUI1001 fires; namespace prefix
        // also matches a feature mapping → WUI1010 fires alongside.
        await new AnalyzerTest<ApiMappingAnalyzer>()
            .WithSource("using Windows.UI.Composition; class C {}")
            .WithXaml("Package.appxmanifest", UwpManifest)
            .ExpectDiagnostic(DiagnosticIds.ApiMappingMatch)
            .ExpectDiagnostic(DiagnosticIds.FeatureMappingHint)
            .RunAsync();
    }

    [Fact]
    public async Task Wui1002FlagsPrintManagerNoEquivalent()
    {
        // PrintManager has no WinAppSDK equivalent — should produce WUI1002.
        // Trigger UWP-context detection via Package.appxmanifest.
        await new AnalyzerTest<ApiMappingAnalyzer>()
            .WithSource(@"
namespace Windows.Graphics.Printing { public class PrintManager { public static PrintManager GetForCurrentView() => new(); } }
namespace Sample { class C { void M() { var p = global::Windows.Graphics.Printing.PrintManager.GetForCurrentView(); } } }")
            .WithXaml("Package.appxmanifest", UwpManifest)
            .ExpectDiagnostic(DiagnosticIds.ApiMappingNoEquiv)
            .RunAsync();
    }

    [Fact]
    public async Task Wui1xxxDoesNotFireInGreenfieldProject()
    {
        // No Windows.UI.* using and no UWP manifest → context = greenfield → no diagnostics.
        await new AnalyzerTest<ApiMappingAnalyzer>()
            .WithSource(@"
using Microsoft.UI.Xaml;
namespace Microsoft.UI.Xaml { public class Window {} }
namespace Sample { class C {} }")
            .ExpectClean()
            .RunAsync();
    }

    [Fact]
    public async Task Wui1010FeatureHintFiresOnFeatureNamespace()
    {
        await new AnalyzerTest<ApiMappingAnalyzer>()
            .WithSource("using Windows.ApplicationModel.Background; class C {}")
            .WithXaml("Package.appxmanifest", UwpManifest)
            .ExpectDiagnostic(DiagnosticIds.FeatureMappingHint)
            .RunAsync();
    }
}
