using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Text;

namespace WinUI3.Analyzer.Rules;

/// <summary>
/// Cross-file analysis: correlates XAML declarations with C# code-behind.
/// WUI020: WebView2 in XAML but no EnsureCoreWebView2Async in code-behind.
/// WUI021: TabView in XAML with raw content assignment in code-behind.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class XamlCodeBehindAnalyzer : DiagnosticAnalyzer
{
    private static readonly DiagnosticDescriptor WebView2NoInitRule = new(
        "WUI020",
        "WebView2 in XAML without initialization in code-behind",
        "XAML declares <WebView2> but code-behind '{0}' has no EnsureCoreWebView2Async() call — NavigateToString will silently fail",
        "WinUI3.CrossFile",
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor TabViewRawContentRule = new(
        "WUI021",
        "TabView in XAML with raw content in code-behind",
        "XAML declares <TabView> but code-behind assigns raw control as tab content — TabView doesn't stretch child controls. Use Frame+Page per tab",
        "WinUI3.CrossFile",
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(WebView2NoInitRule, TabViewRawContentRule);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterCompilationStartAction(AnalyzeCompilation);
    }

    private static void AnalyzeCompilation(CompilationStartAnalysisContext context)
    {
        // Collect XAML data from AdditionalFiles
        var xamlData = new Dictionary<string, XamlInfo>(StringComparer.OrdinalIgnoreCase);

        foreach (var file in context.Options.AdditionalFiles)
        {
            if (!file.Path.EndsWith(".xaml", StringComparison.OrdinalIgnoreCase)) continue;

            var text = file.GetText(context.CancellationToken);
            if (text == null) continue;

            var content = text.ToString();
            XDocument? doc = null;
            try { doc = XDocument.Parse(content); } catch { continue; }

            var elements = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var e in doc.Descendants())
                elements.Add(e.Name.LocalName);

            // Map XAML file to its code-behind name (e.g., MainWindow.xaml → MainWindow)
            var fileName = Path.GetFileNameWithoutExtension(file.Path);
            xamlData[fileName] = new XamlInfo
            {
                HasWebView2 = elements.Contains("WebView2"),
                HasTabView = elements.Contains("TabView"),
                XamlPath = file.Path
            };
        }

        if (xamlData.Count == 0) return;

        // Now analyze C# classes against their XAML declarations
        context.RegisterCompilationEndAction(endContext =>
        {
            foreach (var tree in endContext.Compilation.SyntaxTrees)
            {
                var filePath = tree.FilePath;
                if (string.IsNullOrEmpty(filePath)) continue;
                if (!filePath.EndsWith(".xaml.cs", StringComparison.OrdinalIgnoreCase)) continue;

                // Extract the XAML name from the code-behind path (MainWindow.xaml.cs → MainWindow)
                var fileName = Path.GetFileName(filePath);
                var xamlName = fileName;
                if (xamlName.EndsWith(".xaml.cs", StringComparison.OrdinalIgnoreCase))
                    xamlName = xamlName.Substring(0, xamlName.Length - 8); // Remove ".xaml.cs"

                if (!xamlData.TryGetValue(xamlName, out var info)) continue;

                var root = tree.GetRoot(endContext.CancellationToken);
                var semanticModel = endContext.Compilation.GetSemanticModel(tree);

                // WUI020: WebView2 in XAML but no init in code-behind
                if (info.HasWebView2)
                {
                    var hasInit = root.DescendantNodes()
                        .OfType<InvocationExpressionSyntax>()
                        .Any(inv => inv.Expression.ToString().Contains("EnsureCoreWebView2Async"));

                    var hasInitEvent = root.DescendantNodes()
                        .OfType<MemberAccessExpressionSyntax>()
                        .Any(ma => ma.Name.Identifier.Text == "CoreWebView2Initialized");

                    if (!hasInit && !hasInitEvent)
                    {
                        // Report on the class declaration
                        var classDecl = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault();
                        if (classDecl != null)
                        {
                            endContext.ReportDiagnostic(Diagnostic.Create(
                                WebView2NoInitRule,
                                classDecl.Identifier.GetLocation(),
                                classDecl.Identifier.Text));
                        }
                    }
                }

                // WUI021: TabView in XAML + raw content assignment in code-behind
                if (info.HasTabView)
                {
                    var contentAssignments = root.DescendantNodes()
                        .OfType<AssignmentExpressionSyntax>()
                        .Where(a => a.Left is MemberAccessExpressionSyntax ma &&
                                    ma.Name.Identifier.Text == "Content" &&
                                    a.Right is ObjectCreationExpressionSyntax);

                    foreach (var assignment in contentAssignments)
                    {
                        var creation = (ObjectCreationExpressionSyntax)assignment.Right;
                        var typeName = creation.Type.ToString();

                        // Check if the created type is a raw control (not Frame)
                        if (typeName == "Frame") continue;

                        // Try semantic verification that left side is TabViewItem
                        var leftType = semanticModel.GetTypeInfo(
                            ((MemberAccessExpressionSyntax)assignment.Left).Expression).Type;

                        var isTabViewItem = false;
                        if (leftType != null)
                        {
                            var current = leftType;
                            while (current != null)
                            {
                                if (current.ToDisplayString().Contains("TabViewItem"))
                                {
                                    isTabViewItem = true;
                                    break;
                                }
                                current = current.BaseType;
                            }
                        }
                        else
                        {
                            // Can't resolve — use name heuristic
                            var varName = ((MemberAccessExpressionSyntax)assignment.Left)
                                .Expression.ToString().ToLowerInvariant();
                            isTabViewItem = varName.Contains("tab");
                        }

                        if (isTabViewItem)
                        {
                            endContext.ReportDiagnostic(Diagnostic.Create(
                                TabViewRawContentRule,
                                assignment.GetLocation()));
                        }
                    }
                }
            }
        });
    }

    private class XamlInfo
    {
        public bool HasWebView2 { get; set; }
        public bool HasTabView { get; set; }
        public string XamlPath { get; set; } = "";
    }
}
