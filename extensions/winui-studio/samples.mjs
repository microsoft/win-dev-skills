// samples.mjs — the Samples tab's data layer.
//
// Source 1 (implemented here): the WinUI Gallery. ControlInfoData.json gives 120
// controls in 19 categories with rich metadata; each maps 1:1 to a self-contained
// `Samples/<UniqueId>/<UniqueId>Page.xaml` (+ .cs) we can read for a live preview.
//
// The index is built once and cached (refreshed if the JSON changes on disk). All
// filesystem reads are derived from an indexed record's own UniqueId — never from
// raw client input — so a bad `id` can't escape the gallery Samples folder.

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { getSdkIndex, lookupSdk, getSdkSample, buildSdkUsePrompt } from "./sdk-samples.mjs";

// Known local checkout on this machine. Optional: if absent, the Samples tab
// degrades gracefully (reports the source as unavailable).
const GALLERY_ROOT = "D:\\winui-gallery\\WinUIGallery";
const GALLERY_DATA = join(GALLERY_ROOT, "SampleSupport", "Data", "ControlInfoData.json");
const GALLERY_SAMPLES = join(GALLERY_ROOT, "Samples");

// module-level cache
let _cache = null;      // { items:[...], byId:Map, categories:[...] }
let _mtimeMs = 0;

function splitTags(tags) {
    return String(tags || "")
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

function firstSentence(text, max = 200) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

async function buildGalleryIndex() {
    if (!existsSync(GALLERY_DATA)) return { items: [], byId: new Map(), categories: [] };

    const raw = await readFile(GALLERY_DATA, "utf8");
    const data = JSON.parse(raw);
    const items = [];
    const byId = new Map();
    const categories = [];

    for (const group of data.Groups || []) {
        const category = group.Title || "Other";
        if (!categories.includes(category)) categories.push(category);
        for (const it of group.Items || []) {
            const unique = it.UniqueId;
            if (!unique) continue;
            const xaml = join(GALLERY_SAMPLES, unique, `${unique}Page.xaml`);
            const hasCode = existsSync(xaml);
            const rec = {
                id: `gallery:${unique}`,
                source: "gallery",
                unique,
                title: it.Title || unique,
                subtitle: firstSentence(it.Subtitle, 160),
                description: firstSentence(it.Description, 320),
                category,
                tags: splitTags(it.Tags),
                docs: String(it.Docs || "").trim(),
                isNew: !!it.IsNew,
                hasCode,
            };
            items.push(rec);
            byId.set(rec.id, rec);
        }
    }
    return { items, byId, categories };
}

async function ensureIndex() {
    try {
        if (existsSync(GALLERY_DATA)) {
            const st = await stat(GALLERY_DATA);
            if (_cache && st.mtimeMs === _mtimeMs) return _cache;
            _mtimeMs = st.mtimeMs;
        } else if (_cache) {
            return _cache;
        }
    } catch { /* fall through to rebuild */ }
    _cache = await buildGalleryIndex();
    return _cache;
}

// A public, code-free view of a record for the list.
function slim(r) {
    return {
        id: r.id,
        source: r.source,
        title: r.title,
        subtitle: r.subtitle,
        category: r.category,
        tags: r.tags,
        isNew: r.isNew,
        hasCode: r.hasCode,
    };
}

// Lightweight index for the list view (no code payloads). Merges both sources:
// the WinUI Gallery (local disk) and the WindowsAppSDK feature samples (git).
export async function getSamplesIndex() {
    const gal = await ensureIndex();
    const sdk = await getSdkIndex();

    const items = [...gal.items.map(slim), ...sdk.items.map(slim)];
    const categories = [];
    for (const c of [...gal.categories, ...sdk.categories]) {
        if (!categories.includes(c)) categories.push(c);
    }

    return {
        available: items.length > 0,
        sources: [
            { id: "gallery", name: "WinUI Gallery", count: gal.items.length },
            { id: "sdk", name: "Windows App SDK", count: sdk.count },
        ],
        categories,
        items,
    };
}

export async function lookupSample(id) {
    if (String(id).startsWith("sdk:")) return lookupSdk(id);
    const { byId } = await ensureIndex();
    return byId.get(id) || null;
}

function langOf(name) {
    if (/\.xaml$/i.test(name)) return "xml";
    if (/\.cs$/i.test(name)) return "csharp";
    return "text";
}

// Full record + code files for the preview pane. Paths come from the record's own
// UniqueId, so `id` can only ever resolve inside the gallery Samples folder.
export async function getSample(id) {
    if (String(id).startsWith("sdk:")) return getSdkSample(id);

    const rec = await lookupSample(id);
    if (!rec) return null;

    const files = [];
    const xamlName = `${rec.unique}Page.xaml`;
    const xamlPath = join(GALLERY_SAMPLES, rec.unique, xamlName);
    for (const name of [xamlName, `${xamlName}.cs`]) {
        const p = join(GALLERY_SAMPLES, rec.unique, name);
        if (isAbsolute(p) && existsSync(p)) {
            try {
                files.push({ name, lang: langOf(name), code: await readFile(p, "utf8") });
            } catch { /* skip unreadable file */ }
        }
    }

    return {
        id: rec.id,
        source: rec.source,
        title: rec.title,
        subtitle: rec.subtitle,
        description: rec.description,
        category: rec.category,
        tags: rec.tags,
        docs: rec.docs,
        referencePath: xamlPath,
        files,
    };
}

// The chat hand-off: tell the winui-dev agent to integrate this sample. Gallery
// controls point at the on-disk canonical file; SDK feature samples point at the
// branch paths (read via git show, since that branch isn't checked out).
export function buildUseSamplePrompt(rec, referencePath) {
    if (rec && rec.source === "sdk") return buildSdkUsePrompt(rec);

    const tags = rec.tags && rec.tags.length ? rec.tags.join(", ") : "—";
    const docsLine = rec.docs ? `- **Docs:** ${rec.docs}` : "";
    const refLine = referencePath
        ? `The canonical sample is \`${referencePath}\` (WinUI Gallery). Open it and mirror its markup + code-behind, adapting names to this app.`
        : `Use the WinUI Gallery **${rec.title}** sample as the reference.`;

    return `Add the **${rec.title}** control to the current WinUI 3 app, using the WinUI Gallery sample as the reference. Act as the \`winui-dev\` agent: load the **winui-design** skill first, then do the work yourself.

## Control
- **${rec.title}** — ${rec.subtitle || rec.description || ""}
- **Category:** ${rec.category}
- **Tags:** ${tags}
${docsLine}

## Reference
${refLine}

## Do
1. Ground the control's props/markup with \`winui-search.exe\` (winui-design skill) before writing XAML.
2. Add it to an appropriate existing page — or a new page wired into navigation if it warrants one.
3. Follow win-dev-skills conventions: \`x:Bind\` with \`Mode=OneWay\`, \`AutomationProperties.AutomationId\` on every interactive control, file-scoped namespaces, \`{ThemeResource}\` brushes, the 4px spacing grid.
4. Build & run with \`BuildAndRun.ps1\`, fix any errors, then summarize what changed.`;
}

// Compact one-liner for logs.
export function summarizeSample(rec) {
    return `${rec.title} (${rec.category})`;
}
