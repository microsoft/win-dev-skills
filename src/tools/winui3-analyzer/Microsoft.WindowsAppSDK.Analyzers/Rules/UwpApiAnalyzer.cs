// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Microsoft.WindowsAppSDK.Analyzers.Rules;

/// <summary>
/// UWP → WinUI 3 API compatibility rules:
/// <list type="bullet">
///   <item><see cref="DiagnosticIds.UwpXamlNamespace"/>  — <c>using Windows.UI.Xaml</c> (use <c>Microsoft.UI.Xaml</c>).</item>
///   <item><see cref="DiagnosticIds.WindowCurrent"/>     — <c>Window.Current</c> / <c>Application.Current.Window</c> (UWP-only).</item>
///   <item><see cref="DiagnosticIds.CoreDispatcher"/>    — <c>CoreDispatcher</c> (use <c>DispatcherQueue</c>).</item>
///   <item><see cref="DiagnosticIds.GetForCurrentView"/> — <c>GetForCurrentView()</c> (use HWND-based interop).</item>
/// </list>
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class UwpApiAnalyzer : DiagnosticAnalyzer
{
    private static readonly DiagnosticDescriptor UwpNamespaceRule = new(
        DiagnosticIds.UwpXamlNamespace,
        "UWP XAML namespace used",
        "Windows.UI.Xaml is the UWP namespace — use Microsoft.UI.Xaml for WinUI 3",
        DiagnosticCategories.Compatibility,
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        helpLinkUri: HelpLinks.For(DiagnosticIds.UwpXamlNamespace));

    private static readonly DiagnosticDescriptor WindowCurrentRule = new(
        DiagnosticIds.WindowCurrent,
        "Window.Current is UWP-only",
        "Window.Current does not exist in WinUI 3 desktop apps — store the Window reference in App.xaml.cs",
        DiagnosticCategories.Compatibility,
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        helpLinkUri: HelpLinks.For(DiagnosticIds.WindowCurrent));

    private static readonly DiagnosticDescriptor CoreDispatcherRule = new(
        DiagnosticIds.CoreDispatcher,
        "CoreDispatcher is UWP-only",
        "CoreDispatcher is UWP-only — use DispatcherQueue.TryEnqueue() in WinUI 3",
        DiagnosticCategories.Compatibility,
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        helpLinkUri: HelpLinks.For(DiagnosticIds.CoreDispatcher));

    private static readonly DiagnosticDescriptor GetForCurrentViewRule = new(
        DiagnosticIds.GetForCurrentView,
        "GetForCurrentView is UWP-only",
        "{0}.GetForCurrentView() is UWP-only — use HWND-based COM interop in WinUI 3",
        DiagnosticCategories.Compatibility,
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        helpLinkUri: HelpLinks.For(DiagnosticIds.GetForCurrentView));

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
                var symbol = context.SemanticModel.GetSymbolInfo(memberAccess.Expression).Symbol;
                var typeStr = symbol?.ToDisplayString() ?? expr;
                if (Allowlists.WindowCurrentSafeTypes.Contains(typeStr)) return;
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
            // Allowlist e.g. ConnectedAnimationService.GetForCurrentView() — still valid in WinUI 3.
            var simpleName = callerType.Contains(".") ? callerType.Substring(callerType.LastIndexOf('.') + 1) : callerType;
            if (Allowlists.GetForCurrentViewSafeTypes.Contains(simpleName) ||
                Allowlists.GetForCurrentViewSafeTypes.Contains(callerType))
            {
                return;
            }
            context.ReportDiagnostic(Diagnostic.Create(
                GetForCurrentViewRule,
                memberAccess.GetLocation(),
                memberAccess.Expression.ToString()));
        }
    }

    private static void AnalyzeIdentifier(SyntaxNodeAnalysisContext context)
    {
        var identifier = (IdentifierNameSyntax)context.Node;
        if (identifier.Identifier.Text != "CoreDispatcher") return;

        if (identifier.Parent is MemberAccessExpressionSyntax ma && ma.Expression == identifier) return;

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
            // Unresolved CoreDispatcher reference — likely UWP type.
            context.ReportDiagnostic(Diagnostic.Create(CoreDispatcherRule, identifier.GetLocation()));
        }
    }
}
