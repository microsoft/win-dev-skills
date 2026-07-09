// ---------------------------------------------------------------------------
// design.mjs — the design-system vocabulary the Design tab exposes.
//
// Three grounded, copy-ready surfaces:
//   • Type ramp   — the seven canonical WinUI TextBlock styles (Caption→Display).
//   • Theme brushes — a curated, accurate slice of the Fluent theme resources,
//                     with real Light/Dark values so swatches read true.
//   • Icons        — the full Segoe Fluent set from the WinUI Gallery IconsData.json.
//
// The point isn't to re-skin the Gallery: it's to hand the agent an exact token
// name ("use TextFillColorSecondaryBrush here") so generated XAML stays on-system.
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import path from "node:path";

const GALLERY_ROOT = "D:\\winui-gallery\\WinUIGallery";
const ICONS_PATH = path.join(GALLERY_ROOT, "Samples", "Iconography", "IconsData.json");

// --- Type ramp -------------------------------------------------------------
// px + weight are the WinUI defaults; `sample` is the preview string.
export const TYPE_RAMP = [
    { id: "caption", name: "Caption", style: "CaptionTextBlockStyle", px: 12, weight: 400, sample: "Caption · labels & timestamps" },
    { id: "body", name: "Body", style: "BodyTextBlockStyle", px: 14, weight: 400, sample: "Body · the default text style" },
    { id: "body-strong", name: "Body Strong", style: "BodyStrongTextBlockStyle", px: 14, weight: 600, sample: "Body Strong · emphasized body" },
    { id: "subtitle", name: "Subtitle", style: "SubtitleTextBlockStyle", px: 20, weight: 600, sample: "Subtitle · section headers" },
    { id: "title", name: "Title", style: "TitleTextBlockStyle", px: 28, weight: 600, sample: "Title · page titles" },
    { id: "title-large", name: "Title Large", style: "TitleLargeTextBlockStyle", px: 40, weight: 600, sample: "Title Large" },
    { id: "display", name: "Display", style: "DisplayTextBlockStyle", px: 68, weight: 600, sample: "Display" },
];

// --- Theme brushes ---------------------------------------------------------
// The full approved Fluent theme-brush palette (see winui-design
// references/approved-brushes.md). Values are the real Fluent theme-resource
// colors: neutrals are white/black at the documented alpha; opaque brushes are
// hex. `kind` drives how the swatch is drawn: fill | text | stroke | transparent.
// Accent brushes follow the OS accent — the values here are the WinUI default
// (communication blue), flagged with `note`.
export const BRUSHES = [
    // Text
    { name: "TextFillColorPrimaryBrush", group: "Text", kind: "text", light: "rgba(0,0,0,.896)", dark: "rgba(255,255,255,1)", use: "Primary text — headings and body copy." },
    { name: "TextFillColorSecondaryBrush", group: "Text", kind: "text", light: "rgba(0,0,0,.606)", dark: "rgba(255,255,255,.786)", use: "Secondary / supporting text and subtitles." },
    { name: "TextFillColorTertiaryBrush", group: "Text", kind: "text", light: "rgba(0,0,0,.447)", dark: "rgba(255,255,255,.545)", use: "Tertiary text; pressed-state control labels." },
    { name: "TextFillColorDisabledBrush", group: "Text", kind: "text", light: "rgba(0,0,0,.361)", dark: "rgba(255,255,255,.365)", use: "Disabled text only." },
    { name: "TextFillColorInverseBrush", group: "Text", kind: "text", light: "rgba(255,255,255,1)", dark: "rgba(0,0,0,.896)", use: "Text on inverse (light-on-dark) surfaces like tooltips." },

    // Accent text (follows the OS accent color)
    { name: "AccentTextFillColorPrimaryBrush", group: "Accent text", kind: "text", light: "#003E92", dark: "#99EBFF", note: "OS accent", use: "Hyperlinks and primary accent text." },
    { name: "AccentTextFillColorSecondaryBrush", group: "Accent text", kind: "text", light: "#001A68", dark: "#99EBFF", note: "OS accent", use: "Accent text — hover / secondary emphasis." },
    { name: "AccentTextFillColorTertiaryBrush", group: "Accent text", kind: "text", light: "#005FB8", dark: "#60CDFF", note: "OS accent", use: "Accent text — pressed state." },
    { name: "AccentTextFillColorDisabledBrush", group: "Accent text", kind: "text", light: "rgba(0,0,0,.361)", dark: "rgba(255,255,255,.365)", use: "Disabled accent text / links." },

    // Text on accent
    { name: "TextOnAccentFillColorPrimaryBrush", group: "Text on accent", kind: "text", light: "#FFFFFF", dark: "#000000", use: "Text / glyphs on accent-filled surfaces (accent buttons)." },
    { name: "TextOnAccentFillColorSecondaryBrush", group: "Text on accent", kind: "text", light: "rgba(255,255,255,.7)", dark: "rgba(0,0,0,.5)", use: "Secondary text on accent fills." },
    { name: "TextOnAccentFillColorDisabledBrush", group: "Text on accent", kind: "text", light: "#FFFFFF", dark: "rgba(255,255,255,.5)", use: "Disabled text on accent fills." },
    { name: "TextOnAccentFillColorSelectedTextBrush", group: "Text on accent", kind: "text", light: "#FFFFFF", dark: "#FFFFFF", use: "Selected text sitting on the accent highlight." },

    // Control fill
    { name: "ControlFillColorDefaultBrush", group: "Control fill", kind: "fill", light: "rgba(255,255,255,.702)", dark: "rgba(255,255,255,.059)", use: "Control rest fill — buttons, combo boxes, text inputs." },
    { name: "ControlFillColorSecondaryBrush", group: "Control fill", kind: "fill", light: "rgba(249,249,249,.5)", dark: "rgba(255,255,255,.084)", use: "Control hover fill." },
    { name: "ControlFillColorTertiaryBrush", group: "Control fill", kind: "fill", light: "rgba(249,249,249,.298)", dark: "rgba(255,255,255,.031)", use: "Control pressed fill." },
    { name: "ControlFillColorQuarternaryBrush", group: "Control fill", kind: "fill", light: "rgba(243,243,243,.2)", dark: "rgba(255,255,255,.016)", use: "Deepest control fill; rarely used directly." },
    { name: "ControlFillColorDisabledBrush", group: "Control fill", kind: "fill", light: "rgba(249,249,249,.298)", dark: "rgba(255,255,255,.043)", use: "Disabled control fill." },
    { name: "ControlFillColorTransparentBrush", group: "Control fill", kind: "transparent", light: "transparent", dark: "transparent", use: "Transparent control rest (e.g. unchecked toggle)." },
    { name: "ControlFillColorInputActiveBrush", group: "Control fill", kind: "fill", light: "#FFFFFF", dark: "rgba(30,30,30,.7)", use: "Focused text-input field fill." },
    { name: "ControlStrongFillColorDefaultBrush", group: "Control fill", kind: "fill", light: "rgba(0,0,0,.447)", dark: "rgba(255,255,255,.545)", use: "Strong fill for high-contrast glyphs — slider thumb, checkmark." },
    { name: "ControlStrongFillColorDisabledBrush", group: "Control fill", kind: "fill", light: "rgba(0,0,0,.317)", dark: "rgba(255,255,255,.247)", use: "Disabled strong control fill." },
    { name: "ControlSolidFillColorDefaultBrush", group: "Control fill", kind: "fill", light: "#FFFFFF", dark: "#454545", use: "Opaque control fill where translucency isn't wanted." },

    // Subtle fill
    { name: "SubtleFillColorTransparentBrush", group: "Subtle fill", kind: "transparent", light: "transparent", dark: "transparent", use: "Subtle rest state — list / nav items (transparent)." },
    { name: "SubtleFillColorSecondaryBrush", group: "Subtle fill", kind: "fill", light: "rgba(0,0,0,.037)", dark: "rgba(255,255,255,.061)", use: "Subtle hover fill — list rows, nav items." },
    { name: "SubtleFillColorTertiaryBrush", group: "Subtle fill", kind: "fill", light: "rgba(0,0,0,.024)", dark: "rgba(255,255,255,.042)", use: "Subtle pressed fill." },
    { name: "SubtleFillColorDisabledBrush", group: "Subtle fill", kind: "transparent", light: "transparent", dark: "transparent", use: "Subtle disabled state (transparent)." },

    // Control alt fill
    { name: "ControlAltFillColorTransparentBrush", group: "Control alt fill", kind: "transparent", light: "transparent", dark: "transparent", use: "Alt control rest (transparent)." },
    { name: "ControlAltFillColorSecondaryBrush", group: "Control alt fill", kind: "fill", light: "rgba(0,0,0,.024)", dark: "rgba(0,0,0,.1)", use: "Alt control fill — NumberBox spin, scroll bar." },
    { name: "ControlAltFillColorTertiaryBrush", group: "Control alt fill", kind: "fill", light: "rgba(0,0,0,.043)", dark: "rgba(255,255,255,.043)", use: "Alt control hover fill." },
    { name: "ControlAltFillColorQuarternaryBrush", group: "Control alt fill", kind: "fill", light: "rgba(0,0,0,.061)", dark: "rgba(255,255,255,.07)", use: "Alt control pressed fill." },
    { name: "ControlAltFillColorDisabledBrush", group: "Control alt fill", kind: "transparent", light: "transparent", dark: "transparent", use: "Alt control disabled (transparent)." },

    // Control on image
    { name: "ControlOnImageFillColorDefaultBrush", group: "Control on image", kind: "fill", light: "rgba(255,255,255,.9)", dark: "rgba(28,28,28,.7)", use: "Control rest fill when placed over an image / media." },
    { name: "ControlOnImageFillColorSecondaryBrush", group: "Control on image", kind: "fill", light: "#F3F3F3", dark: "#1C1C1C", use: "Hover fill for controls over images." },
    { name: "ControlOnImageFillColorTertiaryBrush", group: "Control on image", kind: "fill", light: "#EBEBEB", dark: "#0F0F0F", use: "Pressed fill for controls over images." },
    { name: "ControlOnImageFillColorDisabledBrush", group: "Control on image", kind: "fill", light: "#FFFFFF", dark: "#1C1C1C", use: "Disabled control over images." },

    // Accent fill (follows the OS accent color)
    { name: "AccentFillColorDefaultBrush", group: "Accent fill", kind: "fill", light: "#005FB8", dark: "#60CDFF", note: "OS accent", use: "Primary-action button rest; accent-colored fills." },
    { name: "AccentFillColorSecondaryBrush", group: "Accent fill", kind: "fill", light: "rgba(0,95,184,.9)", dark: "rgba(96,205,255,.9)", note: "OS accent", use: "Primary button hover." },
    { name: "AccentFillColorTertiaryBrush", group: "Accent fill", kind: "fill", light: "rgba(0,95,184,.8)", dark: "rgba(96,205,255,.8)", note: "OS accent", use: "Primary button pressed." },
    { name: "AccentFillColorDisabledBrush", group: "Accent fill", kind: "fill", light: "rgba(0,0,0,.217)", dark: "rgba(255,255,255,.158)", use: "Disabled primary / accent button." },
    { name: "AccentFillColorSelectedTextBackgroundBrush", group: "Accent fill", kind: "fill", light: "#005FB8", dark: "#60CDFF", note: "OS accent", use: "Text-selection highlight background." },

    // Stroke
    { name: "ControlStrokeColorDefaultBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.059)", dark: "rgba(255,255,255,.07)", use: "Default control border." },
    { name: "ControlStrokeColorSecondaryBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.162)", dark: "rgba(255,255,255,.093)", use: "Control bottom-edge accent border (buttons, inputs)." },
    { name: "ControlStrokeColorOnAccentDefaultBrush", group: "Stroke", kind: "stroke", light: "rgba(255,255,255,.08)", dark: "rgba(255,255,255,.08)", note: "OS accent", use: "Border on accent-filled controls." },
    { name: "ControlStrokeColorOnAccentSecondaryBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.14)", dark: "rgba(0,0,0,.14)", note: "OS accent", use: "Bottom border on accent controls." },
    { name: "ControlStrokeColorOnAccentTertiaryBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.22)", dark: "rgba(0,0,0,.22)", note: "OS accent", use: "Pressed border on accent controls." },
    { name: "ControlStrokeColorOnAccentDisabledBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.06)", dark: "rgba(0,0,0,.2)", note: "OS accent", use: "Disabled border on accent controls." },
    { name: "ControlStrokeColorForStrongFillWhenOnImageBrush", group: "Stroke", kind: "stroke", light: "rgba(255,255,255,.35)", dark: "rgba(0,0,0,.42)", use: "Border for strong fills placed over images." },
    { name: "CardStrokeColorDefaultBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.059)", dark: "rgba(0,0,0,.1)", use: "Card border." },
    { name: "CardStrokeColorDefaultSolidBrush", group: "Stroke", kind: "stroke", light: "#EBEBEB", dark: "#202020", use: "Opaque card border (no translucency)." },
    { name: "ControlStrongStrokeColorDefaultBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.447)", dark: "rgba(255,255,255,.545)", use: "Strong control border — checkbox, radio outline." },
    { name: "ControlStrongStrokeColorDisabledBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.217)", dark: "rgba(255,255,255,.158)", use: "Disabled strong control border." },
    { name: "SurfaceStrokeColorDefaultBrush", group: "Stroke", kind: "stroke", light: "rgba(117,117,117,.4)", dark: "rgba(117,117,117,.4)", use: "Border for windows and layered surfaces." },
    { name: "SurfaceStrokeColorFlyoutBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.059)", dark: "rgba(0,0,0,.2)", use: "Border for flyouts and menus." },
    { name: "SurfaceStrokeColorInverseBrush", group: "Stroke", kind: "stroke", light: "rgba(255,255,255,.15)", dark: "rgba(0,0,0,.15)", use: "Border on inverse surfaces (tooltips)." },
    { name: "DividerStrokeColorDefaultBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.059)", dark: "rgba(255,255,255,.083)", use: "Separators and dividers." },
    { name: "FocusStrokeColorOuterBrush", group: "Stroke", kind: "stroke", light: "rgba(0,0,0,.896)", dark: "rgba(255,255,255,1)", use: "Outer keyboard-focus ring." },
    { name: "FocusStrokeColorInnerBrush", group: "Stroke", kind: "stroke", light: "rgba(255,255,255,.7)", dark: "rgba(0,0,0,.7)", use: "Inner keyboard-focus ring." },

    // Card & layer background
    { name: "CardBackgroundFillColorDefaultBrush", group: "Card & layer", kind: "fill", light: "rgba(255,255,255,.702)", dark: "rgba(255,255,255,.051)", use: "Card background." },
    { name: "CardBackgroundFillColorSecondaryBrush", group: "Card & layer", kind: "fill", light: "rgba(246,246,246,.5)", dark: "rgba(255,255,255,.021)", use: "Alternate card rows / nested cards." },
    { name: "CardBackgroundFillColorTertiaryBrush", group: "Card & layer", kind: "fill", light: "#FFFFFF", dark: "rgba(255,255,255,.07)", use: "Third-level card background." },
    { name: "SmokeFillColorDefaultBrush", group: "Card & layer", kind: "fill", light: "rgba(0,0,0,.3)", dark: "rgba(0,0,0,.3)", use: "Dimming overlay behind dialogs (smoke)." },
    { name: "LayerFillColorDefaultBrush", group: "Card & layer", kind: "fill", light: "rgba(255,255,255,.5)", dark: "rgba(58,58,58,.3)", use: "Layered surface over Mica — content panes." },
    { name: "LayerFillColorAltBrush", group: "Card & layer", kind: "fill", light: "rgba(255,255,255,1)", dark: "rgba(255,255,255,.043)", use: "Alternate opaque layer surface." },
    { name: "LayerOnAcrylicFillColorDefaultBrush", group: "Card & layer", kind: "fill", light: "rgba(255,255,255,.25)", dark: "rgba(255,255,255,.03)", use: "Layer placed on acrylic material." },
    { name: "LayerOnAccentAcrylicFillColorDefaultBrush", group: "Card & layer", kind: "fill", light: "rgba(255,255,255,.25)", dark: "rgba(255,255,255,.03)", note: "OS accent", use: "Layer on accent acrylic material." },
    { name: "LayerOnMicaBaseAltFillColorDefaultBrush", group: "Card & layer", kind: "fill", light: "rgba(255,255,255,.7)", dark: "rgba(58,58,58,.7)", use: "Layer over Mica Base Alt — NavigationView pane." },
    { name: "LayerOnMicaBaseAltFillColorSecondaryBrush", group: "Card & layer", kind: "fill", light: "rgba(0,0,0,.024)", dark: "rgba(255,255,255,.061)", use: "Secondary layer over Mica Base Alt." },
    { name: "LayerOnMicaBaseAltFillColorTertiaryBrush", group: "Card & layer", kind: "fill", light: "#F9F9F9", dark: "#2C2C2C", use: "Tertiary layer over Mica Base Alt." },
    { name: "LayerOnMicaBaseAltFillColorTransparentBrush", group: "Card & layer", kind: "transparent", light: "transparent", dark: "transparent", use: "Transparent layer over Mica Base Alt." },

    // Solid background (opaque surfaces)
    { name: "SolidBackgroundFillColorBaseBrush", group: "Solid background", kind: "fill", light: "#F3F3F3", dark: "#202020", use: "Opaque page / window background." },
    { name: "SolidBackgroundFillColorSecondaryBrush", group: "Solid background", kind: "fill", light: "#EEEEEE", dark: "#1C1C1C", use: "Slightly deeper opaque background." },
    { name: "SolidBackgroundFillColorTertiaryBrush", group: "Solid background", kind: "fill", light: "#F9F9F9", dark: "#282828", use: "Raised opaque surface — cards on base." },
    { name: "SolidBackgroundFillColorQuarternaryBrush", group: "Solid background", kind: "fill", light: "#FFFFFF", dark: "#2C2C2C", use: "Highest opaque surface layer." },
    { name: "SolidBackgroundFillColorQuinaryBrush", group: "Solid background", kind: "fill", light: "#FDFDFD", dark: "#363636", use: "Extra-elevated opaque surface." },
    { name: "SolidBackgroundFillColorSenaryBrush", group: "Solid background", kind: "fill", light: "#FFFFFF", dark: "#3A3A3A", use: "Top-most opaque surface layer." },
    { name: "SolidBackgroundFillColorTransparentBrush", group: "Solid background", kind: "transparent", light: "transparent", dark: "transparent", use: "Transparent variant of the solid base." },
    { name: "SolidBackgroundFillColorBaseAltBrush", group: "Solid background", kind: "fill", light: "#DADADA", dark: "#0A0A0A", use: "Deepest opaque background (behind base)." },

    // System (status)
    { name: "SystemFillColorSuccessBrush", group: "System", kind: "fill", light: "#0F7B0F", dark: "#6CCB5F", use: "Success text / icon (green)." },
    { name: "SystemFillColorCautionBrush", group: "System", kind: "fill", light: "#9D5D00", dark: "#FCE100", use: "Caution text / icon (yellow)." },
    { name: "SystemFillColorCriticalBrush", group: "System", kind: "fill", light: "#C42B1C", dark: "#FF99A4", use: "Error / critical text / icon (red)." },
    { name: "SystemFillColorNeutralBrush", group: "System", kind: "fill", light: "rgba(0,0,0,.447)", dark: "rgba(255,255,255,.545)", use: "Neutral / informational text / icon." },
    { name: "SystemFillColorSolidNeutralBrush", group: "System", kind: "fill", light: "#8A8A8A", dark: "#9D9D9D", use: "Opaque neutral fill." },
    { name: "SystemFillColorAttentionBackgroundBrush", group: "System", kind: "fill", light: "rgba(246,246,246,.5)", dark: "rgba(255,255,255,.037)", use: "Attention / info InfoBar background." },
    { name: "SystemFillColorSuccessBackgroundBrush", group: "System", kind: "fill", light: "#DFF6DD", dark: "#393D1B", use: "Success InfoBar background (green)." },
    { name: "SystemFillColorCautionBackgroundBrush", group: "System", kind: "fill", light: "#FFF4CE", dark: "#433519", use: "Caution InfoBar background (yellow)." },
    { name: "SystemFillColorCriticalBackgroundBrush", group: "System", kind: "fill", light: "#FDE7E9", dark: "#442726", use: "Error InfoBar background (red)." },
    { name: "SystemFillColorNeutralBackgroundBrush", group: "System", kind: "fill", light: "rgba(0,0,0,.024)", dark: "rgba(255,255,255,.031)", use: "Neutral InfoBar background." },
    { name: "SystemFillColorSolidAttentionBackgroundBrush", group: "System", kind: "fill", light: "#F7F7F7", dark: "#2E2E2E", use: "Opaque attention background." },
    { name: "SystemFillColorSolidNeutralBackgroundBrush", group: "System", kind: "fill", light: "#F3F3F3", dark: "#2E2E2E", use: "Opaque neutral background." },
];

export const BRUSH_GROUPS = ["Text", "Accent text", "Text on accent", "Control fill", "Subtle fill", "Control alt fill", "Control on image", "Accent fill", "Stroke", "Card & layer", "Solid background", "System"];

// --- Icons -----------------------------------------------------------------
let _iconsCache = null;

// Read the WinUI Gallery IconsData.json once. Each record: { code, name, tags }.
// `code` is the hex glyph (e.g. "E700"); the font is Segoe Fluent Icons.
export async function getIcons() {
    if (_iconsCache) return _iconsCache;
    try {
        const raw = await readFile(ICONS_PATH, "utf8");
        const arr = JSON.parse(raw);
        _iconsCache = arr
            .filter((it) => it && it.Code && it.Name)
            .map((it) => ({ code: String(it.Code).toUpperCase(), name: it.Name, tags: Array.isArray(it.Tags) ? it.Tags : [] }));
    } catch {
        _iconsCache = [];
    }
    return _iconsCache;
}

export async function getIconByCode(code) {
    const wanted = String(code || "").toUpperCase();
    const icons = await getIcons();
    return icons.find((i) => i.code === wanted) || null;
}

// --- Design data payload ---------------------------------------------------
export function getDesignData() {
    return { type: TYPE_RAMP, brushes: BRUSHES, brushGroups: BRUSH_GROUPS };
}

// --- Hand-off prompts ------------------------------------------------------
// A design token the human picked, turned into an instruction for the winui-dev
// agent. `kind` is type | brush | icon.

export function findTypeStyle(id) {
    return TYPE_RAMP.find((t) => t.id === id || t.style === id || t.name === id) || null;
}

export function findBrush(name) {
    return BRUSHES.find((b) => b.name === name) || null;
}

export async function summarizeDesign(kind, id) {
    if (kind === "type") { const t = findTypeStyle(id); return t ? `${t.name} type style` : null; }
    if (kind === "brush") { const b = findBrush(id); return b ? b.name : null; }
    if (kind === "icon") { const i = await getIconByCode(id); return i ? `${i.name} icon (${i.code})` : null; }
    return null;
}

export async function buildUseDesignPrompt(kind, id) {
    if (kind === "type") {
        const t = findTypeStyle(id);
        if (!t) return null;
        return [
            `From **WinUI Studio → Design**, apply the **${t.name}** type style to my app.`,
            "",
            `Use \`Style="{StaticResource ${t.style}}"\` on the relevant \`TextBlock\` — do not set \`FontSize\`/\`FontWeight\` by hand (${t.px}px, ${t.weight === 600 ? "Semibold" : "Regular"} come from the style).`,
            "Tell me which page/element you applied it to, or ask if it's ambiguous.",
        ].join("\n");
    }
    if (kind === "brush") {
        const b = findBrush(id);
        if (!b) return null;
        const usage = b.kind === "stroke" ? "BorderBrush" : b.kind === "text" ? "Foreground" : "Background";
        const guard = b.kind === "transparent"
            ? "This is an intentionally transparent brush (a rest/disabled state) — keep it transparent; don't swap in a solid color."
            : b.note === "OS accent"
                ? "Note: this is an accent brush — it follows the user's Windows accent color, so don't hardcode a hex value."
                : "Never substitute a hardcoded color for it.";
        const lines = [`From **WinUI Studio → Design**, use the **${b.name}** theme brush in my app.`];
        if (b.use) lines.push(`Purpose: ${b.use}`);
        lines.push(
            "",
            `Reference it as \`${usage}="{ThemeResource ${b.name}}"\` at the usage site so it updates on theme change.`,
            guard,
            "Tell me where you applied it.",
        );
        return lines.join("\n");
    }
    if (kind === "icon") {
        const i = await getIconByCode(id);
        if (!i) return null;
        return [
            `From **WinUI Studio → Design**, add the **${i.name}** icon (Segoe Fluent glyph \`${i.code}\`) to my app.`,
            "",
            `Use \`<FontIcon Glyph="&#x${i.code};" />\` (or \`<AnimatedIcon>\`/\`IconElement\` as fits the control). Set \`AutomationProperties.Name\` if it's an icon-only button.`,
            "Tell me which control you added it to, or ask if it's ambiguous.",
        ].join("\n");
    }
    return null;
}
