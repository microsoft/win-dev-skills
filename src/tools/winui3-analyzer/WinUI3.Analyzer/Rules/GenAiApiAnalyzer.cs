using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace WinUI3.Analyzer.Rules;

/// <summary>
/// Detects usage of removed ONNX Runtime GenAI APIs.
/// These were removed in the "continuous decoding" change (v0.6.0+):
/// https://github.com/microsoft/onnxruntime-genai/issues/1142
///
/// WUI013: SetInputSequences → AppendTokenSequences
/// WUI014: ComputeLogits → remove (handled by GenerateNextToken)
/// WUI015: new TokenizerStream( → tokenizer.CreateStream()
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class GenAiApiAnalyzer : DiagnosticAnalyzer
{
    private static readonly DiagnosticDescriptor SetInputSequencesRule = new(
        "WUI013",
        "Removed GenAI API: SetInputSequences",
        "SetInputSequences was removed in OnnxRuntimeGenAI 0.6.0 — use generator.AppendTokenSequences(sequences) instead (input goes on Generator, not GeneratorParams)",
        "WinUI3.AI",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor ComputeLogitsRule = new(
        "WUI014",
        "Removed GenAI API: ComputeLogits",
        "ComputeLogits was removed in OnnxRuntimeGenAI 0.6.0 — remove this call, GenerateNextToken() handles logits internally",
        "WinUI3.AI",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor TokenizerStreamCtorRule = new(
        "WUI015",
        "Removed GenAI API: TokenizerStream constructor",
        "new TokenizerStream(tokenizer) was removed in OnnxRuntimeGenAI 0.6.0 — use tokenizer.CreateStream() instead",
        "WinUI3.AI",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(SetInputSequencesRule, ComputeLogitsRule, TokenizerStreamCtorRule);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeInvocation, SyntaxKind.InvocationExpression);
        context.RegisterSyntaxNodeAction(AnalyzeObjectCreation, SyntaxKind.ObjectCreationExpression);
    }

    private static void AnalyzeInvocation(SyntaxNodeAnalysisContext context)
    {
        var invocation = (InvocationExpressionSyntax)context.Node;
        var methodName = invocation.Expression switch
        {
            MemberAccessExpressionSyntax memberAccess => memberAccess.Name.Identifier.Text,
            IdentifierNameSyntax identifier => identifier.Identifier.Text,
            _ => null
        };

        if (methodName == null) return;

        if (methodName == "SetInputSequences")
        {
            context.ReportDiagnostic(Diagnostic.Create(
                SetInputSequencesRule, invocation.GetLocation()));
        }
        else if (methodName == "ComputeLogits")
        {
            context.ReportDiagnostic(Diagnostic.Create(
                ComputeLogitsRule, invocation.GetLocation()));
        }
    }

    private static void AnalyzeObjectCreation(SyntaxNodeAnalysisContext context)
    {
        var creation = (ObjectCreationExpressionSyntax)context.Node;
        var typeName = creation.Type.ToString();

        if (typeName == "TokenizerStream" || typeName.EndsWith(".TokenizerStream"))
        {
            context.ReportDiagnostic(Diagnostic.Create(
                TokenizerStreamCtorRule, creation.GetLocation()));
        }
    }
}
