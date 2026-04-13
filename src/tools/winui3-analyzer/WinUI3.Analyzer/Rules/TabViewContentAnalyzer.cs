using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace WinUI3.Analyzer.Rules;

/// <summary>
/// WUI001: Detects raw control assignment as TabViewItem.Content.
/// TabView does not stretch child controls vertically — use Frame+Page per tab instead.
/// 
/// This is the #1 cause of build-fix-screenshot cycles in WinUI3 agent benchmarks (9/15 sessions).
/// The analyzer uses semantic analysis to verify the left-hand side is actually a TabViewItem.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class TabViewContentAnalyzer : DiagnosticAnalyzer
{
    private static readonly DiagnosticDescriptor Rule = new(
        DiagnosticIds.TabViewRawContent,
        "Raw control as TabView content",
        "TabView does not stretch child controls vertically — '{0}' will render at ~50px height. Use Frame.Navigate(typeof(Page)) per tab, or scaffold with 'dotnet new winui-tabview'",
        "WinUI3.Layout",
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        description: "TabViewItem.Content should use a Frame navigating to Page types, not raw controls like TextBox or Grid. " +
                     "TabView's internal ContentPresenter uses StackPanel-like sizing that doesn't propagate stretch alignment.");

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(Rule);

    // Control types that don't stretch properly in TabView content
    private static readonly string[] ProblematicControls = {
        "TextBox", "RichEditBox", "WebView2", "Grid", "StackPanel",
        "ScrollViewer", "ListView", "TreeView", "Border"
    };

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeAssignment, SyntaxKind.SimpleAssignmentExpression);
    }

    private static void AnalyzeAssignment(SyntaxNodeAnalysisContext context)
    {
        var assignment = (AssignmentExpressionSyntax)context.Node;

        // Check if left side is .Content
        if (assignment.Left is not MemberAccessExpressionSyntax memberAccess) return;
        if (memberAccess.Name.Identifier.Text != "Content") return;

        // Check if right side is `new SomeControl()`
        if (assignment.Right is not ObjectCreationExpressionSyntax creation) return;
        var createdTypeName = GetTypeName(creation.Type);
        if (createdTypeName == null) return;

        // Quick check: is the created type a problematic control?
        if (!ProblematicControls.Any(c => createdTypeName.Contains(c))) return;

        // Semantic check: is the left side actually a TabViewItem?
        var leftSymbol = context.SemanticModel.GetTypeInfo(memberAccess.Expression).Type;
        if (leftSymbol == null)
        {
            // Can't resolve type — fall back to name heuristic
            var varName = memberAccess.Expression.ToString().ToLowerInvariant();
            if (!varName.Contains("tab")) return;
        }
        else
        {
            if (!IsTabViewItemType(leftSymbol)) return;
        }

        context.ReportDiagnostic(Diagnostic.Create(
            Rule,
            assignment.GetLocation(),
            createdTypeName));
    }

    private static bool IsTabViewItemType(ITypeSymbol type)
    {
        var current = type;
        while (current != null)
        {
            var name = current.ToDisplayString();
            if (name.Contains("TabViewItem"))
                return true;
            current = current.BaseType;
        }
        return false;
    }

    private static string? GetTypeName(TypeSyntax type)
    {
        return type switch
        {
            IdentifierNameSyntax id => id.Identifier.Text,
            QualifiedNameSyntax qn => qn.Right.Identifier.Text,
            _ => type.ToString()
        };
    }
}
