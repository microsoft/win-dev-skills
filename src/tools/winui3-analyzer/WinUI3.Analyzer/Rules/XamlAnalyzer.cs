using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Text;

namespace WinUI3.Analyzer.Rules;

/// <summary>
/// Analyzes XAML files (via AdditionalFiles) for common WinUI 3 pitfalls:
/// WUI007: Nested x:Bind without FallbackValue (crashes on null).
/// WUI010: Interactive controls missing AutomationProperties.AutomationId.
/// WUI011: x:Bind without Mode= (defaults to OneTime, UI never updates).
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class XamlAnalyzer : DiagnosticAnalyzer
{
    internal const string XBindCategory = "WinUI3.Binding";
    internal const string AccessibilityCategory = "WinUI3.Accessibility";

    private static readonly DiagnosticDescriptor NestedXBindRule = new(
        "WUI007",
        "Nested x:Bind without FallbackValue",
        "Nested x:Bind path '{0}' will crash if any segment is null at startup — add FallbackValue or use a flat ViewModel property",
        XBindCategory,
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor MissingAutomationIdRule = new(
        "WUI010",
        "Interactive control missing AutomationId",
        "<{0}> has no AutomationProperties.AutomationId — UI automation targeting will be unreliable",
        AccessibilityCategory,
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor NullConverterRule = new(
        "WUI016",
        "Converter={x:Null} crashes at runtime",
        "Converter={{x:Null}} is not a valid converter — it crashes with 'Resource Dictionary Key can only be String-typed'. Use an x:Bind function instead (e.g., local:MainPage.IsNotBusy(ViewModel.IsLoading))",
        XBindCategory,
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor XBindNoModeRule = new(
        "WUI011",
        "x:Bind without Mode",
        "x:Bind defaults to OneTime — UI will not update after initial load. Add Mode=OneWay or Mode=TwoWay",
        XBindCategory,
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(NestedXBindRule, MissingAutomationIdRule, XBindNoModeRule, NullConverterRule);

    // Interactive control types that should have AutomationId
    private static readonly HashSet<string> InteractiveControls = new(StringComparer.OrdinalIgnoreCase)
    {
        "Button", "RepeatButton", "ToggleButton", "HyperlinkButton", "DropDownButton", "SplitButton", "ToggleSplitButton",
        "TextBox", "RichEditBox", "PasswordBox", "NumberBox", "AutoSuggestBox",
        "ComboBox", "CheckBox", "RadioButton", "ToggleSwitch", "Slider", "RatingControl",
        "ListView", "GridView", "TreeView",
        "NavigationViewItem", "TabViewItem", "MenuBarItem", "MenuFlyoutItem",
        "CalendarDatePicker", "DatePicker", "TimePicker", "ColorPicker"
    };

    // Regex to find x:Bind expressions in attribute values
    private static readonly Regex XBindRegex = new(
        @"\{x:Bind\s+([^}]+)\}",
        RegexOptions.Compiled);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterCompilationStartAction(AnalyzeCompilation);
    }

    private static void AnalyzeCompilation(CompilationStartAnalysisContext context)
    {
        context.RegisterCompilationEndAction(endContext =>
        {
            foreach (var file in endContext.Options.AdditionalFiles)
            {
                if (!file.Path.EndsWith(".xaml", StringComparison.OrdinalIgnoreCase))
                    continue;

                // Skip resource dictionaries and app.xaml (usually no interactive controls)
                var fileName = Path.GetFileName(file.Path);
                if (fileName.Equals("App.xaml", StringComparison.OrdinalIgnoreCase))
                    continue;

                var text = file.GetText(endContext.CancellationToken);
                if (text == null) continue;

                var content = text.ToString();
                AnalyzeXamlFile(endContext, file, content, text);
            }
        });
    }

    private static void AnalyzeXamlFile(
        CompilationAnalysisContext context,
        AdditionalText file,
        string content,
        SourceText sourceText)
    {
        // Parse as XML for structural analysis
        XDocument? doc = null;
        try
        {
            doc = XDocument.Parse(content, LoadOptions.SetLineInfo);
        }
        catch
        {
            return; // Malformed XAML — skip
        }

        var allElements = doc.Descendants().ToList();

        foreach (var element in allElements)
        {
            var localName = element.Name.LocalName;

            // WUI010: Check interactive controls for AutomationId
            if (InteractiveControls.Contains(localName))
            {
                var hasAutomationId = element.Attributes().Any(a =>
                    a.Name.LocalName == "AutomationId" &&
                    a.Name.NamespaceName.Contains("AutomationProperties")) ||
                    element.Attributes().Any(a =>
                        a.ToString().Contains("AutomationProperties.AutomationId"));

                if (!hasAutomationId)
                {
                    var location = CreateLocation(file, sourceText, element);
                    context.ReportDiagnostic(Diagnostic.Create(
                        MissingAutomationIdRule, location, localName));
                }
            }

            // Check attributes for x:Bind expressions
            foreach (var attr in element.Attributes())
            {
                var value = attr.Value;

                // WUI016: Converter={x:Null} crashes at runtime
                if (value.Contains("Converter={x:Null}") || value.Contains("Converter=\"{x:Null}\""))
                {
                    var location = CreateLocation(file, sourceText, element);
                    context.ReportDiagnostic(Diagnostic.Create(NullConverterRule, location));
                }

                var matches = XBindRegex.Matches(value);

                foreach (Match match in matches)
                {
                    var bindExpr = match.Groups[1].Value.Trim();

                    // WUI011: x:Bind without Mode=
                    if (!bindExpr.Contains("Mode=") && !IsEventHandler(bindExpr))
                    {
                        // Skip bindings that are correctly OneTime:
                        // - Converter binds (static transforms)
                        // - Command bindings (commands don't change at runtime)
                        // - Single-property binds without dots (simple references)
                        var attrName = attr.Name.LocalName;
                        var isCommand = attrName == "Command" || attrName.EndsWith("Command");
                        if (!bindExpr.Contains("Converter") && !isCommand && bindExpr.Contains("."))
                        {
                            var location = CreateLocation(file, sourceText, element);
                            context.ReportDiagnostic(Diagnostic.Create(
                                XBindNoModeRule, location));
                        }
                    }

                    // WUI007: Nested x:Bind (3+ segments without FallbackValue)
                    // Skip function calls (contain parentheses) — those are safe
                    var bindPath = bindExpr.Split(',')[0].Trim();
                    if (!bindPath.Contains("("))
                    {
                        var segments = bindPath.Split('.');
                        if (segments.Length >= 3 && !bindExpr.Contains("FallbackValue"))
                        {
                            var location = CreateLocation(file, sourceText, element);
                            context.ReportDiagnostic(Diagnostic.Create(
                                NestedXBindRule, location, bindPath));
                        }
                    }
                }
            }
        }
    }

    private static bool IsEventHandler(string bindExpr)
    {
        // Event handler bindings are method references, not property bindings
        // They don't need Mode= and are typically single identifiers
        return !bindExpr.Contains(".") && !bindExpr.Contains(",");
    }

    private static Location CreateLocation(AdditionalText file, SourceText sourceText, XElement element)
    {
        var lineInfo = (System.Xml.IXmlLineInfo)element;
        if (lineInfo.HasLineInfo())
        {
            var line = lineInfo.LineNumber - 1; // 0-indexed
            var col = lineInfo.LinePosition - 1;
            if (line >= 0 && line < sourceText.Lines.Count)
            {
                var textLine = sourceText.Lines[line];
                var start = textLine.Start + Math.Min(col, textLine.Span.Length);
                var end = Math.Min(start + element.Name.LocalName.Length + 1, textLine.End);
                var span = TextSpan.FromBounds(start, end);
                return Location.Create(file.Path, span, sourceText.Lines.GetLinePositionSpan(span));
            }
        }
        return Location.Create(file.Path, TextSpan.FromBounds(0, 0),
            new LinePositionSpan(LinePosition.Zero, LinePosition.Zero));
    }
}
