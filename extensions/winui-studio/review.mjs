// WinUI Studio — Review / Scorecard engine.
//
// A fast, offline static analyzer that scans a WinUI 3 project's .xaml/.cs and
// flags high-signal issues grounded in the win-dev-skills checklists:
//   - winui-code-review/SKILL.md (Accessibility, Theming, Binding/MVVM, Perf, Security)
//   - winui-design/references/code-review-checklist.md (XAML-detectable patterns)
//
// Everything here is pure Node (fs + regex) so the canvas can "detect -> show"
// instantly with no build. The agent is only invoked to FIX (buildFixPrompt) or
// for a semantic "Deep review" pass (buildDeepReviewPrompt) that also runs the
// Roslyn analyzer via BuildAndRun.ps1.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, relative, basename, dirname, extname, sep } from "node:path";

// ---------------------------------------------------------------------------
// Categories (ordered for the scorecard)
// ---------------------------------------------------------------------------
export const CATEGORIES = [
    { id: "accessibility", name: "Accessibility", glyph: "\uE776" },
    { id: "theming", name: "Theming", glyph: "\uE790" },
    { id: "binding", name: "Binding & MVVM", glyph: "\uE71B" },
    { id: "typography", name: "Typography", glyph: "\uE8D2" },
    { id: "layout", name: "Layout", glyph: "\uE799" },
    { id: "performance", name: "Performance", glyph: "\uEC4A" },
    { id: "security", name: "Security", glyph: "\uE72E" },
];

const CATEGORY_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));

// Severity weights for the 0-100 score.
const WEIGHT = { error: 20, warning: 6, note: 2 };

// Interactive controls that should carry an AutomationId (accessibility).
const INTERACTIVE = new Set([
    "Button", "ToggleButton", "RepeatButton", "DropDownButton", "SplitButton",
    "HyperlinkButton", "AppBarButton", "AppBarToggleButton",
    "TextBox", "RichEditBox", "PasswordBox", "AutoSuggestBox", "NumberBox",
    "ComboBox", "CheckBox", "RadioButton", "ToggleSwitch", "Slider",
    "CalendarDatePicker", "DatePicker", "TimePicker",
    "ListView", "GridView", "TreeView", "NavigationViewItem",
    "MenuFlyoutItem", "ToggleMenuFlyoutItem", "PipsPager",
]);

// Icon-only container controls (accessibility name check).
const ICON_HOSTS = new Set(["Button", "HyperlinkButton", "AppBarButton", "ToggleButton", "DropDownButton"]);
const ICON_ELEMENTS = "(?:FontIcon|SymbolIcon|PathIcon|BitmapIcon|ImageIcon|AnimatedIcon)";

// Elements whose FontSize is legitimate (icon sizing) — excluded from raw-FontSize.
const FONTSIZE_OK = new Set(["FontIcon", "FontIconSource", "SymbolIcon", "PathIcon"]);

// Named XAML colors we treat as hardcoded when used on a brush property.
const NAMED_COLORS = "Red|Green|Blue|Black|White|Yellow|Orange|Purple|Gray|Grey|Cyan|Magenta|Pink|Brown|Gold|Silver|Lime|Navy|Teal|Maroon|Olive|Aqua|Fuchsia";
const BRUSH_PROPS = "Background|Foreground|BorderBrush|Fill|Stroke|PlaceholderForeground|SelectionHighlightColor";

// ---------------------------------------------------------------------------
// Rule catalog
// ---------------------------------------------------------------------------
// Each rule: { id, category, severity, title, ruleRef, why, fixHint, lang, test }
//   lang: "xaml" (test(tag) per opening tag) | "cs" (test(line) per source line)
//   test returns null (no finding) or a { snippet } object.
// ---------------------------------------------------------------------------

function attrHas(tag, re) { return re.test(tag.attrs); }

export const RULES = [
    // --- Accessibility ---------------------------------------------------
    {
        id: "a11y-automationid",
        category: "accessibility",
        severity: "warning",
        lang: "xaml",
        title: "Interactive control missing AutomationProperties.AutomationId",
        ruleRef: "winui-design › Accessibility",
        why: "Every interactive control needs a stable AutomationId so UI tests and assistive tech can find it.",
        fixHint: "Add AutomationProperties.AutomationId=\"...\" with a descriptive id.",
        test(tag) {
            if (!INTERACTIVE.has(tag.local)) return null;
            if (/\bAutomationProperties\.AutomationId\s*=/.test(tag.attrs)) return null;
            return { snippet: tag.snippet };
        },
    },
    {
        id: "a11y-icon-name",
        category: "accessibility",
        severity: "note",
        lang: "xaml",
        title: "Icon-only control missing AutomationProperties.Name",
        ruleRef: "winui-design › Accessibility",
        why: "An icon-only button has no text, so screen readers announce nothing without an explicit Name.",
        fixHint: "Add AutomationProperties.Name=\"...\" describing the action.",
        test(tag) {
            if (!ICON_HOSTS.has(tag.local)) return null;
            if (tag.selfClose) return null;                      // needs an icon child
            if (/\bAutomationProperties\.Name\s*=/.test(tag.attrs)) return null;
            if (/\bContent\s*=/.test(tag.attrs)) return null;    // has textual content
            // Icon element as the immediate child?
            const after = tag.rest || "";
            const child = new RegExp("^\\s*<" + ICON_ELEMENTS + "\\b");
            if (!child.test(after)) return null;
            return { snippet: tag.snippet };
        },
    },
    // --- Theming ---------------------------------------------------------
    {
        id: "theme-hardcoded-color",
        category: "theming",
        severity: "warning",
        lang: "xaml",
        title: "Hardcoded color literal instead of a theme brush",
        ruleRef: "winui-design › Theme Support",
        why: "A hex color won't adapt to Light/Dark/HighContrast — use a {ThemeResource} brush.",
        fixHint: "Replace the literal with a {ThemeResource ...Brush}, e.g. TextFillColorPrimaryBrush.",
        test(tag) {
            const re = new RegExp("\\b(?:" + BRUSH_PROPS + ")\\s*=\\s*\"#[0-9A-Fa-f]{3,8}\"");
            const m = tag.attrs.match(re);
            return m ? { snippet: m[0] } : null;
        },
    },
    {
        id: "theme-named-color",
        category: "theming",
        severity: "note",
        lang: "xaml",
        title: "Named color literal on a themed property",
        ruleRef: "winui-design › Theme Support",
        why: "Named colors (Red, Blue…) are as static as hex and skip theming; Transparent for hit-testing is fine.",
        fixHint: "Use a {ThemeResource} brush; keep Transparent only for light-dismiss hit targets.",
        test(tag) {
            const re = new RegExp("\\b(?:" + BRUSH_PROPS + ")\\s*=\\s*\"(?:" + NAMED_COLORS + ")\"");
            const m = tag.attrs.match(re);
            return m ? { snippet: m[0] } : null;
        },
    },
    {
        id: "theme-default-key",
        category: "theming",
        severity: "warning",
        lang: "xaml",
        title: "x:Key=\"Default\" in a theme dictionary",
        ruleRef: "winui-design › Theme Support",
        why: "\"Default\" hides missing Light/Dark/HighContrast variants — declare all three explicitly.",
        fixHint: "Replace x:Key=\"Default\" with explicit Light/Dark/HighContrast dictionary keys.",
        test(tag) {
            return /\bx:Key\s*=\s*"Default"/.test(tag.attrs) ? { snippet: 'x:Key="Default"' } : null;
        },
    },
    {
        id: "theme-inline-brush",
        category: "theming",
        severity: "note",
        lang: "xaml",
        title: "Inline SolidColorBrush resource instead of a StaticResource redirect",
        ruleRef: "winui-design › Theme Support",
        why: "A keyed inline SolidColorBrush allocates a new object; a StaticResource redirect is zero-alloc.",
        fixHint: "Replace with <StaticResource x:Key=\"...\" ResourceKey=\"...Brush\" /> inside the theme dictionary.",
        test(tag) {
            if (tag.local !== "SolidColorBrush") return null;
            return /\bx:Key\s*=/.test(tag.attrs) ? { snippet: tag.snippet } : null;
        },
    },
    // --- Binding & MVVM --------------------------------------------------
    {
        id: "bind-null-converter",
        category: "binding",
        severity: "error",
        lang: "xaml",
        title: "Converter={x:Null} crashes at runtime",
        ruleRef: "winui-design › Data Binding",
        why: "Binding to a null converter throws at runtime — it is never valid.",
        fixHint: "Remove Converter={x:Null}; use x:Bind with a function or a real converter.",
        test(tag) {
            return /Converter\s*=\s*\{x:Null\}/.test(tag.attrs) ? { snippet: "Converter={x:Null}" } : null;
        },
    },
    {
        id: "bind-datatemplate-datatype",
        category: "binding",
        severity: "warning",
        lang: "xaml",
        title: "DataTemplate without x:DataType",
        ruleRef: "winui-code-review › x:Bind",
        why: "Without x:DataType a DataTemplate can't use compiled {x:Bind} and loses compile-time checking.",
        fixHint: "Add x:DataType=\"local:YourItemType\" and switch item bindings to {x:Bind}.",
        test(tag) {
            if (tag.local !== "DataTemplate") return null;
            return /\bx:DataType\s*=/.test(tag.attrs) ? null : { snippet: tag.snippet };
        },
    },
    {
        id: "bind-xbind-mode",
        category: "binding",
        severity: "warning",
        lang: "xaml",
        title: "x:Bind on a changing value without an explicit Mode",
        ruleRef: "winui-code-review › x:Bind",
        why: "x:Bind defaults to OneTime; a value that updates needs Mode=OneWay (or TwoWay) or the UI goes stale.",
        fixHint: "Add Mode=OneWay (or TwoWay for input) to the x:Bind.",
        test(tag) {
            const re = /(?:Text|IsChecked|IsOn|Value|SelectedItem|SelectedIndex|SelectedValue|Visibility|IsEnabled|Content)\s*=\s*"\{x:Bind(?![^"]*\bMode\s*=)[^"]*\}"/;
            const m = tag.attrs.match(re);
            return m ? { snippet: m[0] } : null;
        },
    },
    {
        id: "bind-textbox-trigger",
        category: "binding",
        severity: "warning",
        lang: "xaml",
        title: "TwoWay TextBox bind without UpdateSourceTrigger=PropertyChanged",
        ruleRef: "winui-design › Data Binding",
        why: "Without UpdateSourceTrigger=PropertyChanged the ViewModel only updates on LostFocus, breaking UIA set-value.",
        fixHint: "Add UpdateSourceTrigger=PropertyChanged to the TwoWay x:Bind.",
        test(tag) {
            if (!/^(?:TextBox|RichEditBox|PasswordBox|AutoSuggestBox|NumberBox)$/.test(tag.local)) return null;
            const m = tag.attrs.match(/(?:Text|Value)\s*=\s*"\{x:Bind[^"]*Mode\s*=\s*TwoWay[^"]*\}"/);
            if (!m) return null;
            if (/UpdateSourceTrigger\s*=/.test(m[0])) return null;
            return { snippet: m[0] };
        },
    },
    {
        id: "bind-use-xbind",
        category: "binding",
        severity: "note",
        lang: "xaml",
        title: "{Binding} used instead of compiled {x:Bind}",
        ruleRef: "winui-design › Data Binding",
        why: "{x:Bind} is compiled, type-checked, and faster; prefer it over classic {Binding} where possible.",
        fixHint: "Switch to {x:Bind ViewModel.Prop, Mode=OneWay} and set x:DataType on templates.",
        test(tag) {
            const m = tag.attrs.match(/=\s*"\{Binding[\s}][^"]*"/);
            return m ? { snippet: m[0].slice(0, 100) } : null;
        },
    },
    // --- Typography ------------------------------------------------------
    {
        id: "type-raw-fontsize",
        category: "typography",
        severity: "warning",
        lang: "xaml",
        title: "Raw FontSize instead of a text style",
        ruleRef: "winui-design › Typography",
        why: "Hardcoded FontSize bypasses the type ramp and text scaling — use a TextBlock style.",
        fixHint: "Use Style=\"{StaticResource BodyTextBlockStyle}\" (or Caption/Subtitle/Title…) instead of FontSize.",
        test(tag) {
            if (FONTSIZE_OK.has(tag.local)) return null;           // icon sizing is fine
            const m = tag.attrs.match(/\bFontSize\s*=\s*"[^"]+"/);
            return m ? { snippet: m[0] } : null;
        },
    },
    {
        id: "type-bold",
        category: "typography",
        severity: "note",
        lang: "xaml",
        title: "FontWeight=\"Bold\" — use SemiBold",
        ruleRef: "winui-design › Typography",
        why: "Fluent typography uses SemiBold for emphasis; Bold is heavier than the design language calls for.",
        fixHint: "Change FontWeight=\"Bold\" to \"SemiBold\" (or a *StrongTextBlockStyle).",
        test(tag) {
            return /\bFontWeight\s*=\s*"Bold"/.test(tag.attrs) ? { snippet: 'FontWeight="Bold"' } : null;
        },
    },
    // --- Layout ----------------------------------------------------------
    {
        id: "layout-hardcoded-radius",
        category: "layout",
        severity: "note",
        lang: "xaml",
        title: "Hardcoded CornerRadius",
        ruleRef: "winui-design › Layout",
        why: "A literal CornerRadius won't track the system rounding — use ControlCornerRadius/OverlayCornerRadius.",
        fixHint: "Use CornerRadius=\"{ThemeResource ControlCornerRadius}\" (or OverlayCornerRadius).",
        test(tag) {
            const m = tag.attrs.match(/\bCornerRadius\s*=\s*"\s*\d[^"]*"/);
            return m ? { snippet: m[0] } : null;
        },
    },
    {
        id: "layout-negative-margin",
        category: "layout",
        severity: "warning",
        lang: "xaml",
        title: "Negative margin or padding",
        ruleRef: "winui-design › Layout",
        why: "Negative margins fight the layout system and break at other display scales.",
        fixHint: "Remove the negative value; use spacing, alignment, or Grid definitions instead.",
        test(tag) {
            const m = tag.attrs.match(/\b(?:Margin|Padding)\s*=\s*"[^"]*-\d[^"]*"/);
            return m ? { snippet: m[0] } : null;
        },
    },
    // --- Performance -----------------------------------------------------
    {
        id: "perf-blocking-call",
        category: "performance",
        severity: "warning",
        lang: "cs",
        title: "Blocking on async code (.Wait() / .GetAwaiter().GetResult())",
        ruleRef: "winui-code-review › Performance",
        why: "Synchronously blocking on a Task can deadlock the UI thread — await it instead.",
        fixHint: "Make the method async and await the call.",
        test(line) {
            const m = line.match(/\.(?:Wait\(\)|GetAwaiter\(\)\.GetResult\(\))/);
            return m ? { snippet: line.trim().slice(0, 120) } : null;
        },
    },
    // --- Security --------------------------------------------------------
    {
        id: "sec-hardcoded-secret",
        category: "security",
        severity: "warning",
        lang: "cs",
        title: "Possible hardcoded secret",
        ruleRef: "winui-code-review › Security",
        why: "Secrets in source get committed and leaked — load them from secure storage or config.",
        fixHint: "Move the value to app config / Windows Credential Locker and read it at runtime.",
        test(line) {
            const m = line.match(/\b(?:password|passwd|pwd|api[_]?key|secret|client[_]?secret|connectionstring|access[_]?token)\b\s*=\s*"([^"]{6,})"/i);
            if (!m) return null;
            const v = m[1];
            if (/^(?:<|\{|%|\$|your[_-]|placeholder|example|todo|xxx)/i.test(v)) return null;
            return { snippet: line.trim().slice(0, 120) };
        },
    },
    {
        id: "sec-process-start",
        category: "security",
        severity: "note",
        lang: "cs",
        title: "Process.Start with external input",
        ruleRef: "winui-code-review › Security",
        why: "Launching processes from untrusted input risks command injection — validate and constrain the target.",
        fixHint: "Validate the target, prefer a launcher API, and never pass unsanitized user input.",
        test(line) {
            return /\bProcess\.Start\s*\(/.test(line) ? { snippet: line.trim().slice(0, 120) } : null;
        },
    },
    {
        id: "mvvm-async-void",
        category: "binding",
        severity: "note",
        lang: "cs",
        title: "async void method (not an event handler)",
        ruleRef: "winui-code-review › MVVM",
        why: "async void can't be awaited and swallows exceptions; use async Task except for event handlers.",
        fixHint: "Change the return type to async Task, or expose it as an ICommand.",
        test(line) {
            const m = line.match(/\basync\s+void\s+\w+\s*\(([^)]*)\)/);
            if (!m) return null;
            if (/\bsender\b/.test(m[1]) || /EventArgs\b/.test(m[1])) return null; // event handler
            return { snippet: line.trim().slice(0, 120) };
        },
    },
];

const XAML_RULES = RULES.filter((r) => r.lang === "xaml");
const CS_RULES = RULES.filter((r) => r.lang === "cs");
const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------
const SKIP_DIRS = new Set([
    "bin", "obj", ".vs", ".git", "node_modules", "packages", "generated",
    "arm64", "x64", "x86", "debug", "release", "apppackages", ".vscode",
]);
const SKIP_FILE = /(\.g\.i?\.cs|\.designer\.cs|\.xaml\.g\.cs|globalusings\.g\.cs|assemblyinfo\.cs)$/i;
const MAX_FILES = 600;
const MAX_FINDINGS = 400;
const MAX_BYTES = 500 * 1024;

async function walk(dir, out) {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        if (out.length >= MAX_FILES) return;
        const full = join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
            await walk(full, out);
        } else if (e.isFile()) {
            const ext = extname(e.name).toLowerCase();
            if (ext !== ".xaml" && ext !== ".cs") continue;
            if (SKIP_FILE.test(e.name)) continue;
            out.push(full);
        }
    }
}

// ---------------------------------------------------------------------------
// WinUI project auto-detection
// ---------------------------------------------------------------------------
// Signals in a .csproj that mark it as a WinUI 3 / Windows App SDK app.
const WINUI_SIGNALS = [
    /Microsoft\.WindowsAppSDK/i,
    /Microsoft\.WinUI/i,
    /<UseWinUI>\s*true/i,
    /Microsoft\.UI\.Xaml/i,
    /<(?:ApplicationManifest|AppxManifest|WindowsPackageType)/i,
    /-windows10\.0\.\d+/i,
];

async function walkCsproj(dir, out, depth, maxDepth) {
    if (out.length >= 80 || depth > maxDepth) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        if (out.length >= 80) return;
        const full = join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
            await walkCsproj(full, out, depth + 1, maxDepth);
        } else if (e.isFile() && extname(e.name).toLowerCase() === ".csproj") {
            out.push(full);
        }
    }
}

// Find the WinUI 3 project under `root`. Returns { dir, csproj, name, root } or null.
// Prefers the strongest WinUI-signalled, shallowest project; an App.xaml /
// Package.appxmanifest sibling breaks ties. When `root` is itself a single WinUI
// app, this resolves to that app's folder.
export async function findWinuiProject(root) {
    if (!root || typeof root !== "string") return null;
    let base;
    try {
        base = resolve(root);
        const st = await stat(base);
        if (!st.isDirectory()) return null;
    } catch {
        return null;
    }

    const csprojs = [];
    await walkCsproj(base, csprojs, 0, 4);
    if (csprojs.length === 0) return null;

    let best = null;
    for (const csproj of csprojs) {
        let text = "";
        try { text = await readFile(csproj, "utf8"); } catch { continue; }
        let score = 0;
        for (const rx of WINUI_SIGNALS) if (rx.test(text)) score++;
        if (score === 0) continue; // not a WinUI project
        const dir = dirname(csproj);
        const depth = relative(base, csproj).split(sep).length;
        // App-ness: a runnable WinUI app, not a library/analyzer that merely
        // references the SDK. App.xaml / a packaging manifest / WinExe output.
        let isApp = /<OutputType>\s*(?:WinExe|Exe)/i.test(text) || /<WindowsPackageType/i.test(text);
        try {
            const low = (await readdir(dir)).map((s) => s.toLowerCase());
            if (low.includes("app.xaml")) isApp = true;
            if (low.includes("package.appxmanifest")) isApp = true;
        } catch {}
        const rank = (isApp ? 100 : 0) + score * 3 - depth;
        if (!best || rank > best.rank) {
            best = { dir, csproj, name: basename(csproj, ".csproj"), isApp, rank };
        }
    }
    if (!best) return null;
    return { dir: best.dir, csproj: best.csproj, name: best.name, isApp: best.isApp, root: base };
}

// ---------------------------------------------------------------------------
// XAML tokenizer — yields opening tags with attribute text + start line.
// Comments are blanked (line-preserving) first so `>` inside them is ignored.
// ---------------------------------------------------------------------------
function blankComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

function* iterateTags(text) {
    const src = blankComments(text);
    const re = /<([A-Za-z_][\w.\-:]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
    let m;
    let lineBase = 0;
    let lastIndex = 0;
    let line = 1;
    while ((m = re.exec(src)) !== null) {
        // advance line counter to match start
        for (let i = lastIndex; i < m.index; i++) if (src.charCodeAt(i) === 10) line++;
        lastIndex = m.index;
        const name = m[1];
        const attrs = m[2] || "";
        const selfClose = m[3] === "/";
        const raw = m[0];
        const rest = src.slice(m.index + raw.length, m.index + raw.length + 160);
        yield {
            name,
            local: name.includes(":") ? name.slice(name.indexOf(":") + 1) : name,
            attrs,
            selfClose,
            line,
            rest,
            snippet: raw.replace(/\s+/g, " ").trim().slice(0, 140),
        };
    }
    void lineBase;
}

// ---------------------------------------------------------------------------
// Scan a single file -> array of raw findings (no ids yet)
// ---------------------------------------------------------------------------
function scanXaml(text) {
    const found = [];
    for (const tag of iterateTags(text)) {
        for (const rule of XAML_RULES) {
            const hit = rule.test(tag);
            if (hit) found.push({ rule, line: tag.line, snippet: hit.snippet });
        }
    }
    return found;
}

function scanCs(text) {
    const found = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        for (const rule of CS_RULES) {
            const hit = rule.test(line);
            if (hit) found.push({ rule, line: i + 1, snippet: hit.snippet });
        }
    }
    return found;
}

// ---------------------------------------------------------------------------
// Public: scanProject(rootPath)
// ---------------------------------------------------------------------------
export async function scanProject(rootPath) {
    if (!rootPath || typeof rootPath !== "string") {
        return { ok: false, error: "No project folder provided." };
    }
    const target = resolve(rootPath);
    let st;
    try {
        st = await stat(target);
    } catch {
        return { ok: false, error: `Folder not found: ${target}` };
    }
    if (!st.isDirectory()) {
        return { ok: false, error: `Not a folder: ${target}` };
    }

    const files = [];
    await walk(target, files);
    if (files.length === 0) {
        return { ok: false, error: `No .xaml or .cs files under ${target}` };
    }

    const findings = [];
    let xamlCount = 0;
    let csCount = 0;
    let truncated = files.length >= MAX_FILES;

    for (const file of files) {
        let text;
        try {
            const fst = await stat(file);
            if (fst.size > MAX_BYTES) continue;
            text = await readFile(file, "utf8");
        } catch {
            continue;
        }
        const ext = extname(file).toLowerCase();
        const raw = ext === ".xaml" ? scanXaml(text) : scanCs(text);
        if (ext === ".xaml") xamlCount++; else csCount++;
        const rel = relative(target, file) || basename(file);
        for (const f of raw) {
            findings.push({
                id: `${rel}:${f.line}:${f.rule.id}`.replace(/[\\/]/g, "_"),
                ruleId: f.rule.id,
                category: f.rule.category,
                categoryName: CATEGORY_NAME[f.rule.category] || f.rule.category,
                severity: f.rule.severity,
                title: f.rule.title,
                ruleRef: f.rule.ruleRef,
                why: f.rule.why,
                fixHint: f.rule.fixHint,
                file: rel.split(sep).join("/"),
                absFile: file,
                line: f.line,
                snippet: f.snippet,
            });
            if (findings.length >= MAX_FINDINGS) { truncated = true; break; }
        }
        if (findings.length >= MAX_FINDINGS) break;
    }

    findings.sort((a, b) => {
        const s = sevRank(b.severity) - sevRank(a.severity);
        if (s) return s;
        if (a.file !== b.file) return a.file < b.file ? -1 : 1;
        return a.line - b.line;
    });

    // Per-category tallies
    const catMap = new Map(CATEGORIES.map((c) => [c.id, { ...c, error: 0, warning: 0, note: 0, total: 0 }]));
    const totals = { error: 0, warning: 0, note: 0, total: 0 };
    for (const f of findings) {
        const c = catMap.get(f.category);
        if (c) { c[f.severity]++; c.total++; }
        totals[f.severity]++;
        totals.total++;
    }
    const categories = CATEGORIES.map((c) => catMap.get(c.id));

    const penalty = totals.error * WEIGHT.error + totals.warning * WEIGHT.warning + totals.note * WEIGHT.note;
    const score = Math.max(0, Math.min(100, 100 - penalty));

    return {
        ok: true,
        target,
        targetName: basename(target),
        scannedAt: new Date().toISOString(),
        fileCount: xamlCount + csCount,
        xamlCount,
        csCount,
        score,
        grade: gradeFor(score),
        totals,
        categories,
        findings,
        truncated,
    };
}

function sevRank(s) { return s === "error" ? 3 : s === "warning" ? 2 : 1; }

function gradeFor(score) {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
}

// ---------------------------------------------------------------------------
// Agent hand-off prompts
// ---------------------------------------------------------------------------
export function buildFixPrompt(finding, target) {
    const loc = target ? `${target}` : "the current WinUI project";
    return [
        `Fix a ${finding.categoryName} issue that WinUI Studio's review flagged in ${loc}.`,
        ``,
        `File: ${finding.file}:${finding.line}`,
        `Rule: ${finding.title} (${finding.ruleRef})`,
        `Why it matters: ${finding.why}`,
        `Offending code: ${finding.snippet}`,
        ``,
        `Apply this fix: ${finding.fixHint}`,
        `Follow the winui-design and winui-code-review skills. Make the edit directly in the file,`,
        `keep the change surgical (don't touch unrelated code), then briefly confirm what you changed.`,
    ].join("\n");
}

export function buildFixCategoryPrompt(findings, categoryName, target) {
    const loc = target ? `${target}` : "the current WinUI project";
    const items = findings
        .map((f) => `  - ${f.file}:${f.line} — ${f.title}. Fix: ${f.fixHint}`)
        .join("\n");
    return [
        `Fix all ${findings.length} ${categoryName} issue(s) that WinUI Studio's review flagged in ${loc}.`,
        ``,
        items,
        ``,
        `Follow the winui-design and winui-code-review skills. Edit each file directly, keep changes`,
        `surgical, and when done give a short bullet summary of what you changed per file.`,
    ].join("\n");
}

export function buildDeepReviewPrompt(target, summary) {
    const loc = target ? `${target}` : "the current WinUI project";
    const stat = summary
        ? `Static scan scored it ${summary.score}/100 (${summary.grade}) with ${summary.totals.total} finding(s): ` +
          `${summary.totals.error} error, ${summary.totals.warning} warning, ${summary.totals.note} note.`
        : "";
    return [
        `Run a full WinUI code review on the project at ${loc}.`,
        stat,
        ``,
        `Load the winui-code-review skill. Build the app with BuildAndRun.ps1 so the`,
        `Microsoft.WindowsAppSDK.Analyzers Roslyn analyzer runs (WUI0xxx–WUI4xxx), then review`,
        `for MVVM compliance, x:Bind correctness, accessibility, theming, security, performance,`,
        `and globalization — the semantic issues a static scan can't catch.`,
        ``,
        `Report findings grouped by severity with file:line references, then offer to fix the top issues.`,
    ].join("\n");
}

export function ruleById(id) { return RULE_BY_ID[id] || null; }
