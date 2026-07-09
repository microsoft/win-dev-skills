// The Template Studio "vocabulary": project types, frameworks, pages, features,
// and packaging options. This is the single source of truth — it is embedded
// into the renderer (so the wizard draws its options from here) and used by the
// prompt builder, so the UI and the generated scaffold plan can never drift.

export const PROJECT_TYPES = [
    {
        id: "blank",
        name: "Blank App",
        icon: "E8A5",
        template: "winui",
        blurb: "Minimal single-window app. Bring your own structure.",
        provides: [],
    },
    {
        id: "mvvm",
        name: "MVVM App",
        icon: "E8F1",
        template: "winui-mvvm",
        recommended: true,
        blurb: "CommunityToolkit.Mvvm, custom TitleBar, Mica backdrop, Frame navigation.",
        // Features this template already ships with — the prompt tells the agent
        // not to re-add these.
        provides: ["mica-titlebar"],
    },
    {
        id: "navview",
        name: "NavigationView",
        icon: "E700",
        template: "winui-navview",
        blurb: "NavigationView shell with a left nav pane and a content frame.",
        provides: [],
    },
    {
        id: "tabview",
        name: "TabView",
        icon: "E8F9",
        template: "winui-tabview",
        blurb: "TabView shell with dynamic, closeable tabs.",
        provides: [],
    },
];

export const LANGUAGES = [
    { id: "winui", name: "XAML/C#", note: "XAML markup + C# code-behind (standard WinUI)." },
    { id: "reactor", name: "C# (Reactor)", note: "Microsoft.UI.Reactor — C# markup, MVU (no XAML)." },
];

export const FRAMEWORKS = [
    { id: "default", name: "Template default", recommended: true, note: "keep the template's default target framework" },
    { id: "net10", name: ".NET 10", tfm: "net10.0-windows10.0.19041.0" },
    { id: "net9", name: ".NET 9", tfm: "net9.0-windows10.0.19041.0" },
    { id: "net8", name: ".NET 8", tfm: "net8.0-windows10.0.19041.0" },
];

export const PAGES = [
    { id: "home", name: "Home", icon: "E80F", blurb: "Landing / dashboard page." },
    { id: "settings", name: "Settings", icon: "E713", blurb: "Theme + about, backed by settings storage." },
    { id: "listdetails", name: "List / Details", icon: "E90C", blurb: "Master-detail split view." },
    { id: "datagrid", name: "Data Grid", icon: "F0E2", blurb: "Tabular data via CommunityToolkit DataGrid." },
    { id: "content-grid", name: "Content Grid", icon: "ECA5", blurb: "Adaptive gallery of cards." },
    { id: "webview", name: "Web View", icon: "E774", blurb: "Embedded WebView2 browser page." },
    { id: "chart", name: "Chart", icon: "EB05", blurb: "Data-visualization page." },
    { id: "login", name: "Login", icon: "E77B", blurb: "Sign-in page + auth scaffolding." },
];

export const FEATURES = [
    { id: "settings", name: "Settings + theme switch", icon: "E713", blurb: "Settings page with Light / Dark / Default theme switching, persisted." },
    { id: "protocol-activation", name: "Deep linking", icon: "E71B", blurb: "Protocol (URI) activation so links open your app." },
    { id: "file-associations", name: "File type associations", icon: "E7C3", blurb: "Register file extensions that launch your app." },
    { id: "widgets", name: "Widgets", icon: "E71D", blurb: "Windows Widgets board provider." },
    { id: "notifications", name: "Notifications", icon: "EA8F", blurb: "Toasts via AppNotificationManager." },
    { id: "windows-ai", name: "Windows AI Foundry", icon: "E99A", blurb: "On-device AI (Phi Silica, OCR, imaging) via the Windows AI APIs." },
    { id: "localization", name: "Localization", icon: "E909", blurb: "Resource-based multi-language (.resw)." },
];

export const PACKAGING = [
    { id: "packaged", name: "Packaged (MSIX)", note: "MSIX with Package.appxmanifest — clean install / uninstall." },
    { id: "unpackaged", name: "Unpackaged", note: "Plain .exe via the Windows App SDK bootstrapper." },
    { id: "self-contained", name: "Self-contained", note: "Bundle the Windows App SDK runtime — no separate install." },
];

export const CATALOG = { PROJECT_TYPES, LANGUAGES, FRAMEWORKS, PAGES, FEATURES, PACKAGING };

const PROJECT_IDS = new Set(PROJECT_TYPES.map((p) => p.id));
const LANGUAGE_IDS = new Set(LANGUAGES.map((l) => l.id));
const FRAMEWORK_IDS = new Set(FRAMEWORKS.map((f) => f.id));
const PAGE_IDS = new Set(PAGES.map((p) => p.id));
const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));
const PACKAGING_IDS = new Set(PACKAGING.map((p) => p.id));

export function lookup(list, id) {
    return list.find((x) => x.id === id);
}

export function defaultSpec() {
    return {
        appName: "MyWinUIApp",
        namespace: "MyWinUIApp",
        language: "winui",
        packaging: "packaged",
        projectType: "mvvm",
        features: ["settings"],
    };
}

// Turn arbitrary user text into a valid PascalCase .NET-ish identifier.
export function toIdentifier(raw, fallback = "MyWinUIApp") {
    const cleaned = String(raw ?? "")
        .replace(/[^A-Za-z0-9 _.-]/g, " ")
        .split(/[\s_.-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
    const safe = cleaned.replace(/^[^A-Za-z_]+/, "");
    return safe.length ? safe : fallback;
}

function keepKnown(value, allowed) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    for (const v of value) {
        if (allowed.has(v) && !seen.has(v)) {
            seen.add(v);
            out.push(v);
        }
    }
    return out;
}

// Coerce any partial/untrusted spec into a complete, valid spec. Unknown ids are
// dropped; invalid names are normalized. Never throws.
export function sanitizeSpec(partial, base = defaultSpec()) {
    const merged = { ...base, ...(partial && typeof partial === "object" ? partial : {}) };
    const appName = toIdentifier(merged.appName, base.appName || "MyWinUIApp");
    const namespace = merged.namespace && merged.namespace !== (base.namespace ?? "")
        ? toIdentifier(merged.namespace, appName)
        : appName;
    return {
        appName,
        namespace,
        language: LANGUAGE_IDS.has(merged.language) ? merged.language : "winui",
        packaging: PACKAGING_IDS.has(merged.packaging) ? merged.packaging : "packaged",
        projectType: PROJECT_IDS.has(merged.projectType) ? merged.projectType : "mvvm",
        features: keepKnown(merged.features, FEATURE_IDS),
    };
}

// JSON Schema shared by the canvas `open` input and the `set_spec` / `generate`
// actions. Strict enough that bad input trips `canvas_input_invalid` before a
// handler runs, but every field is optional so callers can send partial specs.
export const SPEC_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        appName: { type: "string", maxLength: 128 },
        namespace: { type: "string", maxLength: 128 },
        language: { type: "string", enum: LANGUAGES.map((l) => l.id) },
        packaging: { type: "string", enum: PACKAGING.map((p) => p.id) },
        projectType: { type: "string", enum: PROJECT_TYPES.map((p) => p.id) },
        features: { type: "array", items: { type: "string", enum: FEATURES.map((f) => f.id) } },
    },
};

// ---------------------------------------------------------------------------
// Agent-drivable navigation
//
// The shell has four tabs. The `navigate` action and the open input's `view`
// let the agent surface the right tab for the task at hand (and, for Samples,
// pre-filter the grid or open a specific sample) — the keystone that turns the
// canvas from a human-only surface into one the agent can drive.
// ---------------------------------------------------------------------------

export const VIEWS = ["home", "scaffold", "samples", "design", "review", "inspect"];

const VIEW_SET = new Set(VIEWS);

// Populate params the Samples + Design + Review tabs understand.
const NAV_PROPS = {
    view: { type: "string", enum: VIEWS },
    category: { type: "string", maxLength: 64 },
    search: { type: "string", maxLength: 128 },
    sampleId: { type: "string", maxLength: 128 },
    section: { type: "string", enum: ["type", "color", "icons"] },
    path: { type: "string", maxLength: 400 },
};

const SECTION_SET = new Set(["type", "color", "icons"]);

// Input for the `navigate` action: `view` is required; the rest is optional
// populate for the Samples grid.
export const NAV_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["view"],
    properties: NAV_PROPS,
};

// Input for the canvas `open`: everything set_spec accepts (prefill the wizard)
// PLUS an optional `view`/populate so a fresh panel opens straight to a tab.
export const OPEN_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: { ...SPEC_SCHEMA.properties, ...NAV_PROPS },
};

// Pull a clean navigation intent out of untrusted open/navigate input. Returns
// null when there is no valid `view` to act on. Never throws.
export function sanitizeNav(input) {
    if (!input || typeof input !== "object") return null;
    if (!VIEW_SET.has(input.view)) return null;
    const str = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
    const nav = { view: input.view };
    const category = str(input.category, 64);
    const search = str(input.search, 128);
    const sampleId = str(input.sampleId, 128);
    const path = str(input.path, 400);
    if (category !== undefined) nav.category = category;
    if (search !== undefined) nav.search = search;
    if (sampleId !== undefined) nav.sampleId = sampleId;
    if (SECTION_SET.has(input.section)) nav.section = input.section;
    if (path !== undefined) nav.path = path;
    return nav;
}
