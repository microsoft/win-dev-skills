using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace WinUI3.Analyzer.Rules;

/// <summary>
/// WUI012: Detects object initializer syntax for WinUI attached properties in code-behind.
/// Agents frequently write: new Button { AutomationProperties = { AutomationId = "..." } }
/// which doesn't compile. Must use static methods: AutomationProperties.SetAutomationId(btn, "...")
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class AttachedPropertyAnalyzer : DiagnosticAnalyzer
{
    internal const string DiagnosticId = "WUI012";

    private static readonly DiagnosticDescriptor Rule = new(
        DiagnosticId,
        "Attached property object initializer",
        "'{0}' is an attached property — cannot use object initializer syntax. Use {0}.Set{1}(element, value) instead",
        "WinUI3.Syntax",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "WinUI attached properties (AutomationProperties, Grid, Canvas, ToolTipService, etc.) " +
                     "must be set via static methods, not object initializer syntax.");

    // Attached property types that are commonly misused in object initializers
    private static readonly HashSet<string> AttachedPropertyTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "AutomationProperties",
        "ToolTipService",
        "ScrollViewer",
        "Canvas",
        "Grid",
        "RelativePanel",
        "VariableSizedWrapGrid"
    };

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(Rule);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeObjectInitializer, SyntaxKind.SimpleAssignmentExpression);
    }

    private static void AnalyzeObjectInitializer(SyntaxNodeAnalysisContext context)
    {
        var assignment = (AssignmentExpressionSyntax)context.Node;

        // Only look at assignments inside object initializers
        if (assignment.Parent is not InitializerExpressionSyntax)
            return;

        // Check if the left side is an attached property type name
        var leftName = assignment.Left.ToString();
        if (!AttachedPropertyTypes.Contains(leftName))
            return;

        // Check if the right side is another initializer (the nested { } pattern)
        if (assignment.Right is InitializerExpressionSyntax or
            ObjectCreationExpressionSyntax { Initializer: not null })
        {
            // Suggest the first property name from the nested initializer
            var suggestedProp = "AutomationId";
            if (assignment.Right is InitializerExpressionSyntax nested)
            {
                var firstAssign = nested.Expressions.OfType<AssignmentExpressionSyntax>().FirstOrDefault();
                if (firstAssign != null)
                    suggestedProp = firstAssign.Left.ToString();
            }

            context.ReportDiagnostic(Diagnostic.Create(
                Rule,
                assignment.GetLocation(),
                leftName,
                suggestedProp));
        }
    }
}
