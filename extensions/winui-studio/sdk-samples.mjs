// sdk-samples.mjs — the Samples tab's second source: the WindowsAppSDK-Samples
// feature samples (Notifications, Mica, Windowing, AppLifecycle, …).
//
// These live on the `niels9001/winui-samples` branch and are NOT checked out in
// the working tree, so we read them straight from the git object store with
// `git ls-tree` / `git show` — no worktree, no working-tree mutation. One record
// per top-level `Samples/<Feature>` folder, described by its README (YAML
// frontmatter when present, else the H1 + first paragraph) and previewed from the
// WinUI 3 C# variant (`cs-winui`) when the feature ships one.
//
// The index is cached by the branch commit SHA; a `git fetch` that moves the
// branch invalidates it on the next build. If the repo/branch is missing the
// source degrades gracefully (available:false) and the Gallery source still works.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

const SDK_ROOT = "D:\\WindowsAppSDK-Samples";
const SDK_BRANCH = "origin/niels9001/winui-samples";
const REMOTE_TREE =
    "https://github.com/microsoft/WindowsAppSDK-Samples/tree/niels9001/winui-samples";

const MAX_CODE = 60000; // per-file preview cap

// Curated feature → category grouping (fallback: "Windows App SDK").
const CATEGORY = {
    AppLifecycle: "App lifecycle", ApplicationData: "App lifecycle",
    ResourceManagement: "App lifecycle", Globalization: "App lifecycle",
    Personalization: "App lifecycle",
    DeploymentManager: "Deployment", Installer: "Deployment",
    SelfContainedDeployment: "Deployment", Unpackaged: "Deployment",
    Windowing: "Windowing & visuals", Mica: "Windowing & visuals",
    Islands: "Windowing & visuals", Composition: "Windowing & visuals",
    SceneGraph: "Windowing & visuals", Lighting: "Windowing & visuals",
    XamlFocusVisuals: "Windowing & visuals", CustomControls: "Windowing & visuals",
    Notifications: "Notifications & widgets", Widgets: "Notifications & widgets",
    BasicInput: "Input & text", Input: "Input & text", PenHaptics: "Input & text",
    TouchKeyboard: "Input & text", TouchKeyboardTextInput: "Input & text",
    TextRendering: "Input & text",
    AudioCategory: "Media", AudioCreation: "Media", BackgroundMediaPlayback: "Media",
    BasicMediaCasting: "Media", Camera: "Media", OCR: "Media", SimpleImaging: "Media",
    PhotoEditor: "Media", PlayReady: "Media",
    Bluetooth: "Devices & sensors", CustomHidDeviceAccess: "Devices & sensors",
    CustomSerialDeviceAccess: "Devices & sensors", CustomUsbDeviceAccess: "Devices & sensors",
    DeviceEnumerationAndPairing: "Devices & sensors", Sensors: "Devices & sensors",
    NfcProvisioner: "Devices & sensors", RadioManager: "Devices & sensors",
    MIDI: "Devices & sensors", PowerGrid: "Devices & sensors",
    DatagramSocket: "Networking", DataReaderWriter: "Networking",
    MobileNetworking: "Networking", NetworkConnectivity: "Networking", WiFiScan: "Networking",
    Geolocation: "Location", Geotag: "Location",
    WindowsAIFoundry: "AI & ML", WindowsML: "AI & ML",
    Insights: "Diagnostics",
    ContentIndexer: "Storage & data", Compression: "Storage & data",
    XamlDataVirtualization: "Storage & data", XamlDeferLoadStrategy: "Storage & data",
    SecureUI: "Security", SecurityIdentity: "Security",
    BackgroundTask: "Background tasks",
};

let _cache = null; // { sha, items, byId, categories }

// ---- git helpers ---------------------------------------------------------

function git(args, maxBuffer = 16 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        execFile("git", args, { cwd: SDK_ROOT, maxBuffer, windowsHide: true },
            (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
}

async function branchSha() {
    return (await git(["rev-parse", SDK_BRANCH])).trim();
}

async function listPaths(sha) {
    const out = await git(["ls-tree", "-r", "--name-only", sha, "Samples/"]);
    return out.split(/\r?\n/).filter(Boolean);
}

async function showFile(sha, path) {
    return git(["show", `${sha}:${path}`]);
}

// Bounded-concurrency map so index build doesn't spawn 60 git processes at once.
async function mapLimit(list, limit, fn) {
    const out = new Array(list.length);
    let i = 0;
    async function worker() {
        while (i < list.length) {
            const idx = i++;
            out[idx] = await fn(list[idx], idx);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
    return out;
}

// ---- text helpers --------------------------------------------------------

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function prettify(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
}

function stripMd(s) {
    return String(s || "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // [text](url) -> text
        .replace(/[`*_]/g, "")
        .replace(/&mdash;/g, "\u2014").replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

function firstSentence(text, max = 180) {
    const s = stripMd(text);
    if (!s) return "";
    return s.length > max ? s.slice(0, max - 1).trimEnd() + "\u2026" : s;
}

function baseName(p) { return p.slice(p.lastIndexOf("/") + 1); }

function cap(code) {
    const s = String(code || "");
    return s.length > MAX_CODE
        ? s.slice(0, MAX_CODE) + "\n\n… (truncated — open the file for the rest)"
        : s;
}

function langOf(name) {
    if (/\.xaml$/i.test(name)) return "xml";
    if (/\.cs$/i.test(name)) return "csharp";
    if (/\.md$/i.test(name)) return "markdown";
    return "text";
}

function featureTags(f) {
    return prettify(f).toLowerCase().split(/\s+/).filter((t) => t.length > 1);
}

function dedupe(arr) {
    const seen = new Set(); const out = [];
    for (const x of arr) { const k = String(x).toLowerCase(); if (x && !seen.has(k)) { seen.add(k); out.push(x); } }
    return out;
}

// Parse a sample README: prefer YAML frontmatter (name/description/languages);
// fall back to the first H1 and the first prose paragraph.
function parseReadme(md, folder) {
    let title = "", desc = "", langs = [];
    const fm = md.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) {
        const body = fm[1];
        const nameM = body.match(/^name:\s*["']?(.+?)["']?\s*$/m);
        const descM = body.match(/^description:\s*["']?(.+?)["']?\s*$/m);
        if (nameM) title = nameM[1].trim();
        if (descM) desc = descM[1].trim();
        const langBlock = body.match(/languages:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/);
        if (langBlock) {
            langs = langBlock[1].split(/\r?\n/)
                .map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
        }
        md = md.slice(fm[0].length);
    }
    if (!title || !desc) {
        let h1 = ""; const prose = [];
        for (const raw of md.split(/\r?\n/)) {
            const t = raw.trim();
            if (!t) { if (prose.length) break; continue; }
            if (/^#\s/.test(t)) { if (!h1) h1 = t.replace(/^#\s*/, "").trim(); continue; }
            if (/^#{2,}\s/.test(t)) { if (prose.length) break; continue; }
            if (/^!?\[/.test(t) || /^<!--/.test(t)) continue; // badges / images / comments
            prose.push(t);
        }
        if (!title) title = h1 || prettify(folder);
        if (!desc) desc = prose.join(" ");
    }
    title = title.replace(/\s+samples?$/i, "").replace(/\s+application$/i, "").trim() || prettify(folder);
    return { title, desc, langs };
}

// Prefer the feature's top-level README; else the shallowest nested one.
function pickReadme(feature, files) {
    const readmes = files.filter((p) => /\/readme\.md$/i.test(p));
    if (!readmes.length) return null;
    const top = readmes.find((p) =>
        new RegExp(`^Samples/${escapeRe(feature)}/readme\\.md$`, "i").test(p));
    if (top) return top;
    return readmes.slice().sort(
        (a, b) => a.split("/").length - b.split("/").length || a.length - b.length)[0];
}

// Ordered list of preview file paths, favouring the WinUI 3 C# variant and
// feature/scenario pages over App.xaml boilerplate and C++/Win32/WPF variants.
// XAML pages are emitted with their code-behind inline; if a feature ships no
// XAML (console / C++ samples) we fall back to representative standalone C#.
function pickCandidates(files) {
    const set = new Set(files);
    const skip = (p) =>
        /(\.designer\.cs|assemblyinfo\.cs|globalusings\.cs|\.g\.i?\.cs)$/i.test(p) ||
        /\/(themes|styles|properties|obj|bin)\//i.test(p);

    const score = (p) => {
        const low = p.toLowerCase();
        let s = p.split("/").length;
        if (low.includes("cs-winui")) s -= 120;            // WinUI 3 C# — ideal
        else if (low.includes("winui")) s -= 80;           // any WinUI variant
        if (/\/cs[a-z0-9-]*\//i.test(p)) s -= 30;          // C# project folder (cs, cs1, CsFoo)
        if (/cpp|win32|webview2|winforms|\/wpf/i.test(low)) s += 60; // de-prioritise non-WinUI-C#
        if (/\/app\.xaml$/i.test(p)) s += 60;
        else if (/mainwindow\.xaml$/i.test(p)) s += 4;
        if (/(scenario|page)\.xaml$/i.test(p)) s -= 12;
        if (/program\.cs$/i.test(p)) s -= 8;
        return s;
    };

    const out = [];

    const xamls = files.filter((p) => /\.xaml$/i.test(p) && !skip(p));
    xamls.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
    for (const x of xamls) {
        if (out.length >= 6) break;
        out.push(x);
        const cs = x + ".cs";
        if (set.has(cs) && !skip(cs)) out.push(cs);
    }

    if (!out.length) {
        const css = files.filter((p) => /\.cs$/i.test(p) && !/\.xaml\.cs$/i.test(p) && !skip(p));
        css.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
        for (const c of css) { if (out.length >= 3) break; out.push(c); }
    }

    return out; // array of repo-relative paths
}

// ---- index ---------------------------------------------------------------

async function buildIndex() {
    if (!existsSync(SDK_ROOT)) return { sha: "", items: [], byId: new Map(), categories: [] };

    let sha;
    try { sha = await branchSha(); } catch { return { sha: "", items: [], byId: new Map(), categories: [] }; }

    let paths;
    try { paths = await listPaths(sha); } catch { return { sha: "", items: [], byId: new Map(), categories: [] }; }

    const feats = new Map(); // feature -> paths[]
    for (const p of paths) {
        const m = p.match(/^Samples\/([^/]+)\/.+$/); // require nested file → skip loose Samples/* files
        if (!m) continue;
        const f = m[1];
        if (f === "localpackages") continue;
        if (!feats.has(f)) feats.set(f, []);
        feats.get(f).push(p);
    }

    const specs = [...feats.keys()].sort((a, b) => a.localeCompare(b)).map((f) => {
        const files = feats.get(f);
        return { f, files, readme: pickReadme(f, files), candidates: pickCandidates(files) };
    }).filter((s) => s.readme || s.candidates.length);

    const items = await mapLimit(specs, 8, async (s) => {
        let title = prettify(s.f), subtitle = "", langs = [];
        if (s.readme) {
            try {
                const parsed = parseReadme(await showFile(sha, s.readme), s.f);
                title = parsed.title;
                subtitle = firstSentence(parsed.desc, 180);
                langs = parsed.langs;
            } catch { /* keep prettified fallback */ }
        }
        return {
            id: `sdk:${s.f}`,
            source: "sdk",
            feature: s.f,
            title,
            subtitle,
            description: subtitle,
            category: CATEGORY[s.f] || "Windows App SDK",
            tags: dedupe([...langs, ...featureTags(s.f)]).slice(0, 8),
            docs: `${REMOTE_TREE}/Samples/${s.f}`,
            isNew: false,
            hasCode: s.candidates.length > 0,
            _sha: sha,
            _readme: s.readme,
            _candidates: s.candidates,
        };
    });

    items.sort((a, b) => a.title.localeCompare(b.title));
    const byId = new Map(items.map((r) => [r.id, r]));
    const categories = dedupe(items.map((r) => r.category)).sort((a, b) => a.localeCompare(b));
    return { sha, items, byId, categories };
}

async function ensureIndex() {
    try {
        if (!existsSync(SDK_ROOT)) return (_cache = { sha: "", items: [], byId: new Map(), categories: [] });
        const sha = await branchSha();
        if (_cache && _cache.sha === sha) return _cache;
        _cache = await buildIndex();
    } catch {
        if (_cache) return _cache;
        _cache = { sha: "", items: [], byId: new Map(), categories: [] };
    }
    return _cache;
}

// ---- public API ----------------------------------------------------------

export async function getSdkIndex() {
    const { items, categories } = await ensureIndex();
    return { available: items.length > 0, count: items.length, items, categories };
}

export async function lookupSdk(id) {
    const { byId } = await ensureIndex();
    return byId.get(id) || null;
}

export async function getSdkSample(id) {
    const rec = await lookupSdk(id);
    if (!rec) return null;
    const sha = rec._sha;
    const files = [];

    if (rec._readme) {
        try {
            files.push({ name: "README.md", lang: "markdown", code: cap(await showFile(sha, rec._readme)) });
        } catch { /* skip */ }
    }

    let n = 0;
    for (const path of rec._candidates) {
        if (n >= 4) break;
        try {
            files.push({ name: relName(path, rec.feature), lang: langOf(path), code: cap(await showFile(sha, path)) });
            n++;
        } catch { /* skip unreadable candidate */ }
    }

    return {
        id: rec.id,
        source: "sdk",
        title: rec.title,
        subtitle: rec.subtitle,
        description: rec.subtitle,
        category: rec.category,
        tags: rec.tags,
        docs: rec.docs,
        referencePath: null,
        branchRef: SDK_BRANCH,
        repoRoot: SDK_ROOT,
        readmePath: rec._readme || null,
        files,
    };
}

function relName(p, feature) {
    return p.replace(new RegExp(`^Samples/${escapeRe(feature)}/`, "i"), "") || baseName(p);
}

// Hand-off prompt for an SDK feature sample. It points the winui-dev agent at the
// exact branch paths and tells it to read them with `git show` (the branch isn't
// checked out), so it works from the canonical source rather than guessing.
export function buildSdkUsePrompt(rec) {
    const tags = rec.tags && rec.tags.length ? rec.tags.join(", ") : "\u2014";
    const cands = (rec._candidates || []).slice(0, 4);
    const readLines = [];
    if (rec._readme) readLines.push(`- \`git -C "${SDK_ROOT}" show ${SDK_BRANCH}:${rec._readme}\``);
    for (const path of cands) {
        readLines.push(`- \`git -C "${SDK_ROOT}" show ${SDK_BRANCH}:${path}\``);
    }
    const reads = readLines.join("\n");

    return `Integrate the **${rec.title}** capability from the Windows App SDK samples into the current WinUI 3 app. Act as the \`winui-dev\` agent: load the **winui-dev-workflow** and **winui-design** skills first, then do the work yourself.

## Capability
- **${rec.title}** — ${rec.subtitle || rec.description || ""}
- **Category:** ${rec.category}
- **Tags:** ${tags}
- **Source:** WindowsAppSDK-Samples \`Samples/${rec.feature}\` on branch \`${SDK_BRANCH}\`
- **Browse online:** ${rec.docs}

## Reference (branch is not checked out — read via git)
${reads}

## Do
1. Read the reference files above with \`git show\` and mirror the working approach — APIs, manifest entries, and package references — adapting names to this app.
2. If the sample needs a package or an \`Package.appxmanifest\` capability/extension, add it (\`dotnet add package <Name>\`, no \`--version\`).
3. Wire the feature into an appropriate existing page — or a new page added to navigation if it warrants one.
4. Follow win-dev-skills conventions: \`x:Bind\` with \`Mode=OneWay\`, \`AutomationProperties.AutomationId\` on every interactive control, file-scoped namespaces, \`{ThemeResource}\` brushes, the 4px spacing grid; never \`AnyCPU\`; use \`winapp run\` / \`BuildAndRun.ps1\`.
5. Build & run with \`BuildAndRun.ps1\`, fix any errors, then summarize what changed.`;
}
