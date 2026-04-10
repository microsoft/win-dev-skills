using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace WinUI3.Analyzer.Rules;

/// <summary>
/// WUI003: Detects 'using Windows.UI.Xaml' (UWP namespace, should be Microsoft.UI.Xaml).
/// WUI004: Detects Window.Current / Application.Current.Window (UWP-only).
/// WUI005: Detects CoreDispatcher usage (UWP-only, use DispatcherQueue).
/// WUI006: Detects GetForCurrentView() (UWP-only, use HWND-based interop).
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class UwpApiAnalyzer : DiagnosticAnalyzer
{
    private static readonly DiagnosticDescriptor UwpNamespaceRule = new(
        DiagnosticIds.UwpXamlNamespace,
        "UWP XAML namespace used",
        "Windows.UI.Xaml is the UWP namespace — use Microsoft.UI.Xaml for WinUI 3",
        "WinUI3.Compatibility",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        helpLinkUri: "https://learn.microsoft.com/windows/apps/winui/winui3/");

    private static readonly DiagnosticDescriptor WindowCurrentRule = new(
        DiagnosticIds.WindowCurrent,
        "Window.Current is UWP-only",
        "Window.Current does not exist in WinUI 3 desktop apps — store the Window reference in App.xaml.cs",
        "WinUI3.Compatibility",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor CoreDispatcherRule = new(
        DiagnosticIds.CoreDispatcher,
        "CoreDispatcher is UWP-only",
        "CoreDispatcher is UWP-only — use DispatcherQueue.TryEnqueue() in WinUI 3",
        "WinUI3.Compatibility",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor GetForCurrentViewRule = new(
        DiagnosticIds.GetForCurrentView,
        "GetForCurrentView is UWP-only",
        "{0}.GetForCurrentView() is UWP-only — use HWND-based COM interop in WinUI 3",
        "WinUI3.Compatibility",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        helpLinkUri: "https://learn.microsoft.com/windows/apps/desktop/modernize/winrt-com-interop-csharp");

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(UwpNamespaceRule, WindowCurrentRule, CoreDispatcherRule, GetForCurrentViewRule);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();

        context.RegisterSyntaxNodeAction(AnalyzeUsingDirective, SyntaxKind.UsingDirective);
        context.RegisterSyntaxNodeAction(AnalyzeMemberAccess, SyntaxKind.SimpleMemberAccessExpression);
        context.RegisterSyntaxNodeAction(AnalyzeIdentifier, SyntaxKind.IdentifierName);
    }

    private static void AnalyzeUsingDirective(SyntaxNodeAnalysisContext context)
    {
        var usingDirective = (UsingDirectiveSyntax)context.Node;
        var name = usingDirective.Name?.ToString();
        if (name != null && name.StartsWith("Windows.UI.Xaml"))
        {
            context.ReportDiagnostic(Diagnostic.Create(UwpNamespaceRule, usingDirective.GetLocation()));
        }
    }

    private static void AnalyzeMemberAccess(SyntaxNodeAnalysisContext context)
    {
        var memberAccess = (MemberAccessExpressionSyntax)context.Node;
        var memberName = memberAccess.Name.Identifier.Text;

        // Window.Current
        if (memberName == "Current")
        {
            var expr = memberAccess.Expression.ToString();
            if (expr == "Window" || expr == "Application.Current.Window")
            {
                // Verify it resolves to Windows.UI.Xaml.Window or similar
                var symbol = context.SemanticModel.GetSymbolInfo(memberAccess.Expression).Symbol;
                var typeStr = symbol?.ToDisplayString() ?? expr;
                if (typeStr.Contains("Window") || expr == "Window")
                {
                    context.ReportDiagnostic(Diagnostic.Create(WindowCurrentRule, memberAccess.GetLocation()));
                }
            }
        }

        // GetForCurrentView()
        if (memberName == "GetForCurrentView")
        {
            var callerSymbol = context.SemanticModel.GetSymbolInfo(memberAccess.Expression).Symbol;
            var callerType = callerSymbol?.ToDisplayString() ?? memberAccess.Expression.ToString();
            // ConnectedAnimationService.GetForCurrentView() still works in WinUI 3
            if (!callerType.Contains("ConnectedAnimationService"))
            {
                context.ReportDiagnostic(Diagnostic.Create(
                    GetForCurrentViewRule,
                    memberAccess.GetLocation(),
                    memberAccess.Expression.ToString()));
            }
        }
    }

    private static void AnalyzeIdentifier(SyntaxNodeAnalysisContext context)
    {
        var identifier = (IdentifierNameSyntax)context.Node;
        if (identifier.Identifier.Text != "CoreDispatcher") return;

        // Skip if inside a comment or string
        if (identifier.Parent is MemberAccessExpressionSyntax ma && ma.Expression == identifier) return;

        // Check if it resolves to Windows.UI.Core.CoreDispatcher
        var symbol = context.SemanticModel.GetSymbolInfo(identifier).Symbol;
        if (symbol != null)
        {
            var ns = symbol.ContainingNamespace?.ToDisplayString() ?? "";
            if (ns.StartsWith("Windows.UI.Core") || symbol.ToDisplayString().Contains("CoreDispatcher"))
            {
                context.ReportDiagnostic(Diagnostic.Create(CoreDispatcherRule, identifier.GetLocation()));
            }
        }
        else if (identifier.Parent is BaseTypeSyntax || identifier.Parent is TypeSyntax)
        {
            // Unresolved CoreDispatcher reference — likely UWP type
            context.ReportDiagnostic(Diagnostic.Create(CoreDispatcherRule, identifier.GetLocation()));
        }
    }
}
