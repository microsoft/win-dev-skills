// Turns a sanitized spec into: the exact scaffold command, a human-readable plan
// (shown in the wizard's live preview), and the rich hand-off prompt injected
// into the chat so the winui-dev agent + win-dev-skills do the real work.

import { PROJECT_TYPES, LANGUAGES, FEATURES, PACKAGING, lookup } from "./catalog.mjs";

export function templateShortName(spec) {
    return lookup(PROJECT_TYPES, spec.projectType)?.template ?? "winui-mvvm";
}

export function dotnetCommand(spec) {
    return `dotnet new ${templateShortName(spec)} -n "${spec.appName}"`;
}

function names(list, ids) {
    return ids.map((id) => lookup(list, id)).filter(Boolean);
}

// Ordered, human-readable plan bullets. Reused by the UI preview and the prompt
// so what the user sees is exactly what the agent is told to do.
export function buildPlan(spec) {
    const type = lookup(PROJECT_TYPES, spec.projectType);
    const lang = lookup(LANGUAGES, spec.language);
    const pkg = lookup(PACKAGING, spec.packaging);
    const provided = new Set(type?.provides ?? []);
    const steps = [];

    steps.push(`Scaffold **${spec.appName}** with \`${dotnetCommand(spec)}\`, then \`cd "${spec.appName}"\` (do not mkdir first).`);

    if (spec.namespace && spec.namespace !== spec.appName) {
        steps.push(`Use root namespace \`${spec.namespace}\`.`);
    }

    if (lang && lang.id === "reactor") {
        steps.push(`Author the UI with **Microsoft.UI.Reactor** (C# markup, MVU) instead of XAML — add the \`Microsoft.UI.Reactor\` package and build the shell from Reactor components.`);
    }

    if (pkg && pkg.id === "packaged") {
        steps.push(`Package as **MSIX** — keep \`Package.appxmanifest\` and \`<WindowsPackageType>MSIX</WindowsPackageType>\` (use the **winui-packaging** skill).`);
    } else if (pkg && pkg.id === "unpackaged") {
        steps.push(`Configure an **unpackaged** app — \`<WindowsPackageType>None</WindowsPackageType>\` and initialize the Windows App SDK bootstrapper.`);
    } else if (pkg && pkg.id === "self-contained") {
        steps.push(`Make the app **self-contained** — set \`<WindowsAppSDKSelfContained>true</WindowsAppSDKSelfContained>\` so no separate runtime install is required.`);
    }

    const feats = names(FEATURES, spec.features);
    const toAdd = feats.filter((f) => !provided.has(f.id));
    const already = feats.filter((f) => provided.has(f.id));
    if (toAdd.length) {
        steps.push(`Implement features: ${toAdd.map((f) => `**${f.name}** (${f.blurb})`).join("; ")}.`);
    }
    if (already.length) {
        steps.push(`These are already provided by the ${type?.name} template — verify, don't duplicate: ${already.map((f) => f.name).join(", ")}.`);
    }

    steps.push(`Build & run with \`BuildAndRun.ps1\` (async), fix any errors, then summarize what was created.`);
    return steps;
}

function bulletList(items) {
    return items.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

export function buildScaffoldPrompt(spec) {
    const type = lookup(PROJECT_TYPES, spec.projectType);
    const lang = lookup(LANGUAGES, spec.language);
    const pkg = lookup(PACKAGING, spec.packaging);

    return `Scaffold a new **WinUI 3** app from this Template Studio spec. Act as the \`winui-dev\` agent: load the **winui-dev-workflow** and **winui-design** skills first, then do the work yourself.

## App
- **Name:** ${spec.appName}
- **Root namespace:** ${spec.namespace}
- **UI framework:** ${lang?.name ?? "WinUI"}${lang?.id === "reactor" ? " — Microsoft.UI.Reactor (C# markup)" : " — XAML"}
- **UI template:** ${type?.name ?? spec.projectType} — ${type?.blurb ?? ""}
- **Packaging:** ${pkg?.name ?? "Packaged (MSIX)"}
- **Location:** create it in the current working directory (the folder this Copilot session is running in) — \`dotnet new -n\` makes the subfolder, so do not \`mkdir\` first.

## Scaffold plan (follow in order)
${bulletList(buildPlan(spec))}

## Conventions (win-dev-skills)
- \`x:Bind\` with \`Mode=OneWay\` for anything that updates; set \`AutomationProperties.AutomationId\` on every interactive control.
- File-scoped namespaces, \`_camelCase\` private fields, \`Async\` suffix on async methods.
- Never run the packaged \`.exe\` directly — always \`winapp run\` / \`BuildAndRun.ps1\`. Never use \`AnyCPU\`; keep \`Package.appxmanifest\`.
- Add packages with \`dotnet add package <Name>\` (no \`--version\`).

Start now: scaffold, implement every feature above, build & run, then report the result.`;
}

// Compact one-line summary for logs / action results.
export function summarize(spec) {
    const type = lookup(PROJECT_TYPES, spec.projectType);
    const lang = lookup(LANGUAGES, spec.language);
    const pkg = lookup(PACKAGING, spec.packaging);
    const parts = [`${spec.appName} (${type?.name ?? spec.projectType})`];
    if (lang) parts.push(lang.name);
    if (pkg) parts.push(pkg.name);
    if (spec.features.length) parts.push(`${spec.features.length} feature(s)`);
    return parts.join(" · ");
}
