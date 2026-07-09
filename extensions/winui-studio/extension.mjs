// WinUI Template Studio — a Copilot canvas extension.
//
// The canvas renders a wizard (see renderer.mjs) that configures a WinUI 3 app.
// Clicking "Generate app" hands a fully-formed scaffold prompt to the chat via
// session.send(), so the winui-dev agent + win-dev-skills do the real work
// (dotnet new / winapp / build & run) inside the conversation.
//
// Wiring only — catalog, prompt building, durable state, and the renderer live
// in sibling modules.

import { createServer } from "node:http";
import { register } from "node:module";
// The SDK bundle (extension.js) is ESM-syntax but ships without a
// package.json "type":"module" on this CLI build, so Node would parse it as
// CommonJS and crash. Register a load hook that forces it to load as ESM,
// then import it dynamically (after the hook is registered).
register("./sdk-loader-hook.mjs", import.meta.url);
const { joinSession, createCanvas } = await import("@github/copilot-sdk/extension");

import { CATALOG, SPEC_SCHEMA, OPEN_SCHEMA, NAV_SCHEMA, sanitizeSpec, sanitizeNav } from "./catalog.mjs";
import { renderHtml } from "./renderer.mjs";
import { buildScaffoldPrompt, buildPlan, dotnetCommand, summarize, buildInspectEditPrompt } from "./prompt.mjs";
import { readDraft, writeDraft, readLast, recordGenerated, readReviewTarget, writeReviewTarget, readRunTarget, writeRunTarget } from "./store.mjs";
import { getSamplesIndex, getSample, buildUseSamplePrompt, lookupSample, summarizeSample } from "./samples.mjs";
import { getDesignData, getIcons, buildUseDesignPrompt, summarizeDesign } from "./design.mjs";
import { getNews } from "./news.mjs";
import { scanProject, buildFixPrompt, buildFixCategoryPrompt, buildDeepReviewPrompt, findWinuiProject } from "./review.mjs";
import { basename, join } from "node:path";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getRunState, startRun, stopRun, isBusy } from "./run.mjs";
import {
    initInspect,
    makeInspectEntry,
    serveInspectStatic,
    serveAsset,
    handleInspectApi,
    armInspectWatch,
    disarmInspectWatch,
    inspectWindow,
    setInspectTarget,
    screenshot,
    locateInSource,
} from "./inspect.mjs";
import { startOverlay, stopOverlay, overlayToken } from "./overlay.mjs";

// Assigned once joinSession resolves; canvas handlers close over it and only run
// afterwards, so it is always set by the time they fire.
let session;

const servers = new Map();       // instanceId -> { server, url }
const sseClients = new Set();    // all live SSE responses (tagged with _instanceId)
const initialNav = new Map();    // instanceId -> nav, consumed once by the first "/" paint

// This webview host does not keep an EventSource open, so navigate() also feeds a
// poll channel: broadcastNav bumps navSeq + stores lastNav, and panels poll /nav-poll.
let navSeq = 0;                  // bumped on every broadcastNav
let lastNav = null;              // most recent nav payload, for pollers that missed SSE
let lastPollAt = 0;              // last /nav-poll hit — proxy for "a panel is alive"

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sendJson(res, body, status = 200) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    return raw ? JSON.parse(raw) : {};
}

// Push a spec to every open panel via SSE. Used when the agent changes the draft
// (set_spec / generate) so open wizards update live.
function broadcastSpec(spec) {
    const frame = `event: spec\ndata: ${JSON.stringify(spec)}\n\n`;
    for (const res of sseClients) {
        try { res.write(frame); } catch { /* client gone; cleaned up on close */ }
    }
}

// Drive open panels to a tab (and optionally populate the Samples grid). Used by
// the `navigate` action and by open() when re-driving an already-live panel.
function broadcastNav(nav) {
    navSeq++;
    lastNav = nav;
    const frame = `event: nav\ndata: ${JSON.stringify(nav)}\n\n`;
    for (const res of sseClients) {
        try { res.write(frame); } catch { /* client gone; cleaned up on close */ }
    }
}

// A fresh panel has no SSE client yet, so its initial view is stashed here and
// baked into the first HTML paint (BOOT.view) instead of broadcast.
function setInitialNav(instanceId, nav) { initialNav.set(instanceId, nav); }
function consumeInitialNav(instanceId) {
    const nav = initialNav.get(instanceId) || null;
    if (nav) initialNav.delete(instanceId);
    return nav;
}

// The one place that hands a build off to the chat.
async function generateToChat(rawSpec) {
    const clean = await recordGenerated(rawSpec);
    await writeDraft(clean);
    broadcastSpec(clean);
    const prompt = buildScaffoldPrompt(clean);
    if (session) {
        try { await session.log(`WinUI Template Studio → scaffolding ${summarize(clean)}`, { level: "info" }); } catch {}
        await session.send(prompt);
    }
    return clean;
}

// Hand a chosen sample off to the chat so the winui-dev agent integrates it.
async function useSampleToChat(id) {
    const rec = await lookupSample(id);
    if (!rec) return null;
    const full = await getSample(id);
    const prompt = buildUseSamplePrompt(rec, full && full.referencePath);
    if (session) {
        try { await session.log(`WinUI Studio → inserting sample ${summarizeSample(rec)}`, { level: "info" }); } catch {}
        await session.send(prompt);
    }
    return rec;
}

// Hand a chosen design token (type style / theme brush / icon) to the chat so
// the winui-dev agent applies it on-system.
async function useDesignToChat(kind, id) {
    const prompt = await buildUseDesignPrompt(kind, id);
    if (!prompt) return null;
    const summary = await summarizeDesign(kind, id);
    if (session) {
        try { await session.log(`WinUI Studio → applying ${summary || kind}`, { level: "info" }); } catch {}
        await session.send(prompt);
    }
    return { title: summary || id };
}

// ---- Review tab -----------------------------------------------------------

// The session's workspace root (the repo/folder this Copilot session is running
// in). Used to auto-attach the scorecard to the project the user is working on.
async function getWorkspaceRoot() {
    try {
        const ws = await session.rpc.workspaces.getWorkspace();
        const w = ws && ws.workspace;
        if (!w) return null;
        return { cwd: w.cwd || null, gitRoot: w.git_root || null, name: w.name || w.repository || null };
    } catch {
        return null;
    }
}

// Resolve what the Review tab should attach to, in priority order:
//   1. a WinUI *app* detected in the current workspace (the "attached to the
//      running project" case),
//   2. the last folder the user explicitly scanned,
//   3. any WinUI-signalled project detected in the workspace (library/analyzer),
// Returns { auto, persisted, detected:{name,dir,isApp}, workspaceName, workspaceRoot }.
async function resolveReviewContext() {
    const persisted = await readReviewTarget();
    const ws = await getWorkspaceRoot();
    const workspaceRoot = ws && (ws.cwd || ws.gitRoot);
    let detected = null;
    if (workspaceRoot) {
        const hit = await findWinuiProject(workspaceRoot);
        if (hit) detected = { name: hit.name, dir: hit.dir, isApp: !!hit.isApp };
    }
    let auto = null;
    if (detected && detected.isApp) auto = detected.dir;   // a real app in this workspace wins
    else if (persisted) auto = persisted;                  // otherwise honour the last explicit scan
    else if (detected) auto = detected.dir;                // else any WinUI-ish project we found
    return { auto, persisted: persisted || null, detected, workspaceName: (ws && ws.name) || null, workspaceRoot: workspaceRoot || null };
}

// Scan a project folder and remember it as the last target. When no `path` is
// given, auto-attach to the current workspace's WinUI project (falling back to
// the last-scanned folder) so the scorecard "just works" on the running project.
async function reviewProject(path) {
    let target = path && String(path).trim();
    if (!target) {
        const ctx = await resolveReviewContext();
        target = ctx.auto;
    }
    if (!target) return { ok: false, error: "No WinUI project detected in this workspace. Enter a project folder to scan." };
    const result = await scanProject(target);
    if (result.ok) await writeReviewTarget(result.target);
    return result;
}

// Hand a single review finding to the chat so the winui-dev agent fixes it.
async function fixFindingToChat(finding, target) {
    if (!finding || !finding.title) return null;
    const prompt = buildFixPrompt(finding, target);
    if (session) {
        try { await session.log(`WinUI Studio → fix ${finding.ruleId} @ ${finding.file}:${finding.line}`, { level: "info" }); } catch {}
        await session.send(prompt);
    }
    return { title: finding.title };
}

// Hand every finding in a category to the chat as one batched fix request.
async function fixCategoryToChat(findings, categoryName, target) {
    const list = Array.isArray(findings) ? findings.filter((f) => f && f.title) : [];
    if (list.length === 0) return null;
    const prompt = buildFixCategoryPrompt(list, categoryName || "these", target);
    if (session) {
        try { await session.log(`WinUI Studio → fix all ${list.length} ${categoryName} issue(s)`, { level: "info" }); } catch {}
        await session.send(prompt);
    }
    return { title: `${list.length} ${categoryName} issue(s)`, count: list.length };
}

// Hand the whole project to the winui-code-review agent for a semantic + analyzer pass.
async function deepReviewToChat(target, summary) {
    const prompt = buildDeepReviewPrompt(target, summary);
    if (session) {
        try { await session.log(`WinUI Studio → deep review ${target || ""}`, { level: "info" }); } catch {}
        await session.send(prompt);
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------
// per-instance loopback server
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inspect tab — resolve which running app to latch onto (mirrors the Review
// tab's auto-attach: prefer a WinUI *app* in the workspace, else the last
// project the user reviewed). `name` from findWinuiProject is the assembly /
// process name, which is exactly what the winapp UIA watcher matches on.
// ---------------------------------------------------------------------------
async function resolveInspectTarget() {
    const ctx = await resolveReviewContext();
    if (ctx.detected && ctx.detected.isApp) {
        return { processName: ctx.detected.name, sourceRoot: ctx.detected.dir, label: ctx.detected.name, isApp: true, workspaceName: ctx.workspaceName };
    }
    if (ctx.persisted) {
        return { processName: basename(ctx.persisted), sourceRoot: ctx.persisted, label: basename(ctx.persisted), isApp: false, workspaceName: ctx.workspaceName };
    }
    if (ctx.detected) {
        return { processName: ctx.detected.name, sourceRoot: ctx.detected.dir, label: ctx.detected.name, isApp: false, workspaceName: ctx.workspaceName };
    }
    return { processName: null, sourceRoot: null, label: null, isApp: false, workspaceName: ctx.workspaceName };
}

// Arm the inspector's auto-latch watcher on the workspace app (by process name),
// so the panel follows it across rebuild/relaunch. Returns the resolved target.
async function latchWorkspaceApp(inspectEntry) {
    const st = inspectEntry.state;
    // Don't clobber a target already chosen (an explicit inspect_latch, a manual
    // window pick, or a still-running latch): report the current status instead.
    if (st.watch || st.hwnd != null) {
        return {
            processName: (st.watch && st.watch.process) || st.processName || null,
            sourceRoot: st.sourceRoot,
            label: st.title || (st.watch && st.watch.process) || st.processName || null,
            isApp: false,
            workspaceName: null,
            already: true,
        };
    }
    const t = await resolveInspectTarget();
    if (t.sourceRoot) st.sourceRoot = t.sourceRoot;
    if (t.processName) armInspectWatch(inspectEntry, { process: t.processName });
    return t;
}

// Show the floating in-app toolbar ("the VS pill") over the latched app. Ensures
// a target hwnd first (explicit criteria, else the workspace app), then spawns
// the overlay pointed at this instance's loopback server. The overlay POSTs its
// button commands back to /overlay/action, authenticated with the minted token.
async function showToolbar(instanceId, crit) {
    const srv = servers.get(instanceId);
    if (!srv || !srv.inspect) return { ok: false, error: "Open the Inspect panel first (open_canvas with view: \"inspect\")." };
    const hasCrit = crit && (crit.process || crit.title || crit.pid != null);
    if (hasCrit) {
        armInspectWatch(srv.inspect, crit);
        await new Promise((r) => setTimeout(r, 500));
    } else {
        await latchWorkspaceApp(srv.inspect);
        await new Promise((r) => setTimeout(r, 600));
    }
    const st = srv.inspect.state;
    if (st.hwnd == null) {
        return { ok: false, error: "No running app found. Build & run your WinUI app, then try again.", watching: st.watch || null };
    }
    const label = st.title || st.processName || "App";
    const { token } = startOverlay({
        instanceId,
        hwnd: st.hwnd,
        baseUrl: srv.url,
        label,
        log: (m, o) => { try { session.log(m, o); } catch {} },
    });
    try { await session.log(`WinUI Studio → floating toolbar on hwnd ${st.hwnd} (${label})`, { level: "info" }); } catch {}
    return { ok: true, hwnd: st.hwnd, title: st.title, label, shown: !!token };
}

// Hand a "change this element" request from the Inspect tab to the winui-dev
// agent: resolve where the element lives in XAML (best-effort), build a grounded
// prompt, and send it to the chat so the agent edits + rebuilds the app.
async function inspectEditToChat(instanceId, payload) {
    const srv = servers.get(instanceId);
    if (!srv || !srv.inspect) return { ok: false, error: "Inspect panel not open." };
    const st = srv.inspect.state;
    const instruction = String((payload && payload.instruction) || "").trim();
    if (!instruction) return { ok: false, error: "Type what you'd like the agent to change." };
    const element = (payload && payload.element) || {};
    const selector = (payload && payload.selector) || element.selector || null;
    const root = st.sourceRoot || null;
    let hits = [];
    if (root && (element.automationId || element.name)) {
        try { hits = await locateInSource(root, { automationId: element.automationId, name: element.name }); } catch {}
    }
    const prompt = buildInspectEditPrompt({ instruction, element, selector, root, hits, appTitle: st.title });
    if (session) {
        try { await session.log(`WinUI Studio → inspect edit: "${instruction.slice(0, 80)}" on ${selector || element.name || element.type || "element"}`, { level: "info" }); } catch {}
        await session.send(prompt);
    }
    return { ok: true, located: hits.length, files: hits.slice(0, 3).map((h) => ({ file: h.file, line: h.line })) };
}

// ---------------------------------------------------------------------------
// Run / Stop control — build, launch, and auto-latch the workspace's WinUI app
// from the canvas header. Shares one "current project" with Review + Inspect via
// the persisted run/review targets, so the whole studio points at one app.
// ---------------------------------------------------------------------------

// Find the .csproj inside a project folder (prefer one named after the folder).
async function findCsproj(dir) {
    let files;
    try { files = await readdir(dir); } catch { return null; }
    const cs = files.filter((f) => f.toLowerCase().endsWith(".csproj"));
    if (cs.length === 0) return null;
    const want = (basename(dir) + ".csproj").toLowerCase();
    const named = cs.find((f) => f.toLowerCase() === want);
    return join(dir, named || cs[0]);
}

// Trim a path to its last two segments for a compact chip subtitle.
function shortDir(dir) {
    if (!dir) return "";
    const parts = String(dir).replace(/[\\/]+$/, "").split(/[\\/]/);
    if (parts.length <= 2) return parts.join("\\");
    return "\u2026\\" + parts.slice(-2).join("\\");
}

// Resolve which project the Run button targets, in priority order:
//   1. an explicit pick (the project chip) — always wins,
//   2. a WinUI *app* detected in the current workspace,
//   3. the last folder reviewed/scanned.
async function resolveRunTarget() {
    const override = await readRunTarget();
    const ctx = await resolveReviewContext();
    let dir = null;
    let source = "none";
    let detectedApp = ctx.detected && ctx.detected.isApp ? ctx.detected.name : null;
    const detectedDir = ctx.detected ? ctx.detected.dir : null;
    if (override) { dir = override; source = "chosen"; }
    else if (ctx.detected && ctx.detected.isApp) { dir = ctx.detected.dir; source = "workspace"; }
    else if (ctx.persisted) { dir = ctx.persisted; source = "recent"; }
    else if (ctx.detected) { dir = ctx.detected.dir; source = "workspace"; }
    let hasProject = false;
    let name = null;
    if (dir) {
        const cs = await findCsproj(dir);
        hasProject = !!cs;
        if (cs) name = basename(cs).replace(/\.csproj$/i, "");
    }
    return {
        dir,
        name: name || (dir ? basename(dir) : null),
        dirShort: shortDir(dir),
        source,
        hasProject,
        detectedApp: detectedApp || null,
        detectedDir: detectedDir || null,
        workspaceName: ctx.workspaceName || null,
    };
}

// One transition hook for the run lifecycle: when the app comes up, drive open
// panels to the Inspect tab (the watch is already armed, so the tree is live).
let _lastRunStatus = "idle";
function onRunState(st) {
    if (st.status === "running" && _lastRunStatus !== "running") {
        broadcastNav({ view: "inspect" });
        try { session.log(`WinUI Studio → running ${st.appName || "app"} (PID ${st.pid}) — Inspect latched`, { level: "info" }); } catch {}
    } else if (st.status === "error" && _lastRunStatus !== "error") {
        try { session.log(`WinUI Studio → build/run failed: ${(st.error || "").slice(0, 200)}`, { level: "error" }); } catch {}
    }
    _lastRunStatus = st.status;
}

// Build + launch the current (or given) project and arm auto-latch on this panel.
async function runApp(instanceId, pathOverride) {
    if (isBusy()) return { ok: true, state: getRunState(), note: "already running" };
    let dir = pathOverride && String(pathOverride).trim();
    if (!dir) { const rt = await resolveRunTarget(); dir = rt.dir; }
    if (!dir) return { ok: false, error: "No project selected. Pick a WinUI app folder first." };
    const csproj = await findCsproj(dir);
    if (!csproj) return { ok: false, error: "No .csproj found in " + dir };
    const appName = basename(csproj).replace(/\.csproj$/i, "");
    await writeReviewTarget(dir);
    const srv = servers.get(instanceId);
    if (srv && srv.inspect) {
        try {
            disarmInspectWatch(srv.inspect);
            srv.inspect.state.hwnd = null;
            srv.inspect.state.sourceRoot = dir;
            armInspectWatch(srv.inspect, { process: appName });
        } catch { /* inspector optional */ }
    }
    _lastRunStatus = "idle";
    startRun({ projectDir: dir, csproj, appName }, onRunState);
    return { ok: true, state: getRunState() };
}

function makeRequestHandler(instanceId) {
    return async (req, res) => {
        try {
            const url = new URL(req.url, "http://127.0.0.1");

            if (req.method === "GET" && url.pathname === "/") {
                const spec = await readDraft();
                const nav = consumeInitialNav(instanceId);
                res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
                res.end(renderHtml({ instanceId, spec, view: nav && nav.view, nav, navSeq }));
                return;
            }

            if (req.method === "GET" && url.pathname === "/events") {
                res.writeHead(200, {
                    "content-type": "text/event-stream",
                    "cache-control": "no-cache",
                    connection: "keep-alive",
                });
                res.write(": connected\n\n");
                res._instanceId = instanceId;
                sseClients.add(res);
                req.on("close", () => sseClients.delete(res));
                return;
            }

            // Poll fallback for live navigation (this host drops EventSource).
            if (req.method === "GET" && url.pathname === "/nav-poll") {
                lastPollAt = Date.now();
                const clientSeq = Number(url.searchParams.get("seq") || 0);
                sendJson(res, { seq: navSeq, nav: clientSeq < navSeq ? lastNav : null });
                return;
            }

            if (req.method === "POST" && url.pathname === "/state") {
                // Persist the draft and return the authoritative command + plan.
                const clean = await writeDraft(await readJsonBody(req));
                sendJson(res, { spec: clean, command: dotnetCommand(clean), plan: buildPlan(clean) });
                return;
            }

            if (req.method === "POST" && url.pathname === "/generate") {
                const clean = await generateToChat(await readJsonBody(req));
                sendJson(res, { ok: true, appName: clean.appName, command: dotnetCommand(clean) });
                return;
            }

            // ---- Samples tab -------------------------------------------------
            if (req.method === "GET" && url.pathname === "/samples") {
                sendJson(res, await getSamplesIndex());
                return;
            }

            if (req.method === "GET" && url.pathname === "/sample") {
                const s = await getSample(url.searchParams.get("id") || "");
                if (!s) { sendJson(res, { error: "not found" }, 404); return; }
                sendJson(res, s);
                return;
            }

            if (req.method === "POST" && url.pathname === "/use-sample") {
                const body = await readJsonBody(req);
                const rec = await useSampleToChat(body && body.id);
                if (!rec) { sendJson(res, { ok: false, error: "unknown sample" }, 404); return; }
                sendJson(res, { ok: true, title: rec.title });
                return;
            }

            // ---- What's New (ifdef-windows blog) -----------------------------
            if (req.method === "GET" && url.pathname === "/news") {
                const force = url.searchParams.get("refresh") === "1";
                sendJson(res, await getNews({ force }));
                return;
            }

            // ---- Design tab --------------------------------------------------
            if (req.method === "GET" && url.pathname === "/design") {
                sendJson(res, getDesignData());
                return;
            }

            if (req.method === "GET" && url.pathname === "/icons") {
                const icons = await getIcons();
                sendJson(res, { available: icons.length > 0, items: icons });
                return;
            }

            if (req.method === "POST" && url.pathname === "/use-design") {
                const body = await readJsonBody(req);
                const rec = await useDesignToChat(body && body.kind, body && body.id);
                if (!rec) { sendJson(res, { ok: false, error: "unknown token" }, 404); return; }
                sendJson(res, { ok: true, title: rec.title });
                return;
            }

            // ---- Review tab --------------------------------------------------
            if (req.method === "GET" && url.pathname === "/review-target") {
                sendJson(res, await resolveReviewContext());
                return;
            }

            if (req.method === "GET" && url.pathname === "/review") {
                const result = await reviewProject(url.searchParams.get("path") || "");
                sendJson(res, result, result.ok ? 200 : 200);
                return;
            }

            if (req.method === "POST" && url.pathname === "/fix-finding") {
                const body = await readJsonBody(req);
                const rec = await fixFindingToChat(body && body.finding, body && body.target);
                if (!rec) { sendJson(res, { ok: false, error: "unknown finding" }, 404); return; }
                sendJson(res, { ok: true, title: rec.title });
                return;
            }

            if (req.method === "POST" && url.pathname === "/fix-category") {
                const body = await readJsonBody(req);
                const rec = await fixCategoryToChat(body && body.findings, body && body.category, body && body.target);
                if (!rec) { sendJson(res, { ok: false, error: "no findings" }, 404); return; }
                sendJson(res, { ok: true, title: rec.title, count: rec.count });
                return;
            }

            if (req.method === "POST" && url.pathname === "/deep-review") {
                const body = await readJsonBody(req);
                await deepReviewToChat(body && body.target, body && body.summary);
                sendJson(res, { ok: true });
                return;
            }

            // ---- Run / Stop control ------------------------------------------
            // Which project the Run button targets (drives the header chip).
            if (req.method === "GET" && url.pathname === "/run-target") {
                sendJson(res, await resolveRunTarget());
                return;
            }
            // Explicitly pick the project to run (the chip's folder picker).
            if (req.method === "POST" && url.pathname === "/run-target") {
                const body = await readJsonBody(req);
                const path = body && typeof body.path === "string" ? body.path.trim() : "";
                if (path) { await writeRunTarget(path); await writeReviewTarget(path); }
                else await writeRunTarget("");
                sendJson(res, await resolveRunTarget());
                return;
            }
            // Merge run lifecycle + latched inspect window into one status poll.
            if (req.method === "GET" && url.pathname === "/run-status") {
                const st = getRunState();
                const srv = servers.get(instanceId);
                const ins = srv && srv.inspect ? srv.inspect.state : null;
                sendJson(res, { ...st, hwnd: ins ? ins.hwnd : null, title: ins ? ins.title : null, busy: isBusy() });
                return;
            }
            if (req.method === "POST" && url.pathname === "/run") {
                const body = await readJsonBody(req);
                const result = await runApp(instanceId, body && body.path);
                sendJson(res, result, result.ok ? 200 : 200);
                return;
            }
            if (req.method === "POST" && url.pathname === "/run-stop") {
                const st = await stopRun();
                const srv = servers.get(instanceId);
                if (srv && srv.inspect) { try { disarmInspectWatch(srv.inspect); srv.inspect.state.hwnd = null; } catch {} }
                _lastRunStatus = "idle";
                sendJson(res, { ok: true, state: st });
                return;
            }

            // ---- Client-side error/telemetry beacon --------------------------
            if (req.method === "POST" && url.pathname === "/client-log") {
                const body = await readJsonBody(req);
                const msg = String((body && body.msg) || "").slice(0, 500);
                const level = (body && body.level) === "error" ? "error" : "info";
                if (session && msg) { try { await session.log("[canvas] " + msg, { level }); } catch {} }
                sendJson(res, { ok: true });
                return;
            }

            // ---- Inspect tab (Live Visual Tree) ------------------------------
            // Auto-latch the panel onto the workspace's running WinUI app.
            if (req.method === "POST" && url.pathname === "/inspect-latch") {
                const srv = servers.get(instanceId);
                if (!srv || !srv.inspect) { sendJson(res, { ok: false, error: "inspector not ready" }, 503); return; }
                const t = await latchWorkspaceApp(srv.inspect);
                sendJson(res, { ok: true, ...t, hwnd: srv.inspect.state.hwnd, title: srv.inspect.state.title });
                return;
            }
            // Panel button → show the floating toolbar (pill) over the app.
            if (req.method === "POST" && url.pathname === "/show-toolbar") {
                const body = await readJsonBody(req);
                const crit = {};
                if (body && body.process) crit.process = String(body.process);
                if (body && body.title) crit.title = String(body.title);
                if (body && body.pid != null) crit.pid = body.pid;
                const r = await showToolbar(instanceId, crit);
                sendJson(res, r);
                return;
            }
            // Floating toolbar → command callback (token-authenticated).
            if (req.method === "POST" && url.pathname === "/overlay/action") {
                const body = await readJsonBody(req);
                if (!body || body.token !== overlayToken(instanceId)) { sendJson(res, { ok: false, error: "bad token" }, 403); return; }
                const srv = servers.get(instanceId);
                const cmd = String(body.cmd || "");
                const hwnd = body.hwnd;
                if (cmd === "tree") {
                    if (srv && srv.inspect && hwnd != null) { try { await setInspectTarget(srv.inspect, hwnd); } catch {} }
                    broadcastNav({ view: "inspect" });
                    sendJson(res, { ok: true });
                    return;
                }
                if (cmd === "shot") {
                    let out = null;
                    try {
                        const file = join(tmpdir(), `winui-shot-${hwnd}-${Date.now()}.png`);
                        const shot = await screenshot(hwnd, file);
                        out = (shot && shot.filePath) || file;
                        try { await session.log(`WinUI Studio → screenshot saved: ${out}`, { level: "info" }); } catch {}
                    } catch (e) {
                        try { await session.log(`WinUI Studio → screenshot failed: ${(e && e.message) || e}`, { level: "error" }); } catch {}
                    }
                    sendJson(res, { ok: true, path: out });
                    return;
                }
                if (cmd === "close" || cmd === "gone") {
                    stopOverlay(instanceId);
                    sendJson(res, { ok: true });
                    return;
                }
                if (cmd === "pick") {
                    const selector = body.selector != null ? String(body.selector) : "";
                    if (srv && srv.inspect) {
                        const st = srv.inspect.state;
                        // Align the panel to the pill's window first (if different) so
                        // the selector resolves against the right tree, then select.
                        if (hwnd != null && String(st.hwnd) !== String(hwnd)) {
                            try { await setInspectTarget(srv.inspect, hwnd); } catch {}
                        }
                        if (selector) {
                            st.selectedSelector = selector;
                            st.selectNonce++;
                        }
                    }
                    broadcastNav({ view: "inspect" });
                    try { await session.log(`WinUI Studio → picked ${selector || "(none)"}`, { level: "info" }); } catch {}
                    sendJson(res, { ok: true, selector });
                    return;
                }
                // Inline on-app prompt box → hand the change to the winui-dev agent
                // (same path as the panel's "Ask the agent" composer, Feature A).
                if (cmd === "prompt") {
                    const selector = body.selector != null ? String(body.selector) : "";
                    const instruction = body.instruction != null ? String(body.instruction) : "";
                    if (hwnd != null && srv && srv.inspect && String(srv.inspect.state.hwnd) !== String(hwnd)) {
                        try { await setInspectTarget(srv.inspect, hwnd); } catch {}
                    }
                    if (srv && srv.inspect && selector) {
                        srv.inspect.state.selectedSelector = selector;
                        srv.inspect.state.selectNonce++;
                    }
                    const element = {
                        selector,
                        type: body.elType != null ? String(body.elType) : null,
                        name: body.elName != null ? String(body.elName) : null,
                        automationId: body.automationId != null ? String(body.automationId) : null,
                    };
                    const r = await inspectEditToChat(instanceId, { selector, instruction, element });
                    broadcastNav({ view: "inspect" });
                    sendJson(res, r);
                    return;
                }
                sendJson(res, { ok: false, error: "unknown cmd" }, 400);
                return;
            }
            // Inspect tab → hand a natural-language element change to the agent.
            if (req.method === "POST" && url.pathname === "/inspect-agent-prompt") {
                const body = await readJsonBody(req);
                const r = await inspectEditToChat(instanceId, body);
                sendJson(res, r);
                return;
            }
            // Static inspector client (index.html / app.js / styles.css).
            if (req.method === "GET" && (url.pathname === "/inspect" || url.pathname.startsWith("/inspect/"))) {
                await serveInspectStatic(res, url.pathname);
                return;
            }
            // Static assets (Home hero image, etc.).
            if (req.method === "GET" && url.pathname.startsWith("/asset/")) {
                await serveAsset(res, url.pathname);
                return;
            }
            // Inspector JSON/UIA API (the /api/* namespace is unused elsewhere).
            if (url.pathname.startsWith("/api/")) {
                const srv = servers.get(instanceId);
                if (srv && srv.inspect) {
                    await handleInspectApi(srv.inspect, url, req, res);
                } else {
                    sendJson(res, { error: "inspector not ready" }, 503);
                }
                return;
            }

            res.writeHead(404, { "content-type": "text/plain" });
            res.end("not found");
        } catch (err) {
            sendJson(res, { ok: false, error: String((err && err.message) || err) }, 500);
        }
    };
}

async function startServer(instanceId) {
    const server = createServer(makeRequestHandler(instanceId));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    return { server, url: `http://127.0.0.1:${port}/`, inspect: makeInspectEntry(instanceId) };
}

function closeInstance(instanceId) {
    const entry = servers.get(instanceId);
    if (!entry) return Promise.resolve();
    if (entry.inspect) { try { disarmInspectWatch(entry.inspect); } catch {} }
    try { stopOverlay(instanceId); } catch {}
    servers.delete(instanceId);
    initialNav.delete(instanceId);
    for (const res of [...sseClients]) {
        if (res._instanceId === instanceId) {
            sseClients.delete(res);
            try { res.end(); } catch {}
        }
    }
    try { entry.server.closeAllConnections?.(); } catch {}
    return new Promise((resolve) => entry.server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// canvas declaration
// ---------------------------------------------------------------------------

const canvas = createCanvas({
    id: "winui-template-studio",
    displayName: "WinUI Template Studio",
    description: "Visually configure a WinUI 3 app (project type, pages, features, packaging) and hand it to the winui-dev agent to scaffold, build & run.",
    inputSchema: OPEN_SCHEMA,
    actions: [
        {
            name: "get_state",
            description: "Return the current Template Studio draft: the spec, the resolved `dotnet new` command, the ordered scaffold plan, the last generated spec, and the full option catalog.",
            handler: async () => {
                const spec = await readDraft();
                return {
                    spec,
                    command: dotnetCommand(spec),
                    plan: buildPlan(spec),
                    catalog: CATALOG,
                    last: await readLast(),
                };
            },
        },
        {
            name: "set_spec",
            description: "Merge a partial spec into the studio draft, persist it, and push it live to any open Template Studio panel. Returns the resolved spec, command, and plan.",
            inputSchema: SPEC_SCHEMA,
            handler: async (ctx) => {
                const base = await readDraft();
                const clean = await writeDraft(sanitizeSpec({ ...base, ...(ctx.input || {}) }));
                broadcastSpec(clean);
                return { spec: clean, command: dotnetCommand(clean), plan: buildPlan(clean) };
            },
        },
        {
            name: "generate",
            description: "Finalize the spec (partial input merges into the draft) and return the exact scaffold command, ordered plan, and a ready-to-run hand-off prompt. Does NOT post to chat — proceed to scaffold using the returned plan.",
            inputSchema: SPEC_SCHEMA,
            handler: async (ctx) => {
                const base = await readDraft();
                const clean = await recordGenerated(sanitizeSpec({ ...base, ...(ctx.input || {}) }));
                await writeDraft(clean);
                broadcastSpec(clean);
                return {
                    spec: clean,
                    command: dotnetCommand(clean),
                    plan: buildPlan(clean),
                    prompt: buildScaffoldPrompt(clean),
                    summary: summarize(clean),
                };
            },
        },
        {
            name: "navigate",
            description: "Switch an open WinUI Studio panel to a tab and optionally populate it. `view` is one of scaffold | samples | design | review | inspect. For Samples, pass `search` and/or `category` to pre-filter the grid, or `sampleId` to open a specific sample's preview. For Design, pass `section` (type | color | icons) and/or `search`. For Review, pass `path` to point the scorecard at a WinUI project folder (it scans on arrival). If no panel is open, call open_canvas with the same `view` instead (or first).",
            inputSchema: NAV_SCHEMA,
            handler: async (ctx) => {
                const nav = sanitizeNav(ctx.input || {});
                if (!nav) return { ok: false, error: "a valid `view` is required (scaffold | samples | design | inspect)" };
                let sample;
                if (nav.sampleId) {
                    const rec = await lookupSample(nav.sampleId);
                    if (rec) sample = { id: rec.id, title: rec.title, category: rec.category };
                    else delete nav.sampleId; // don't deep-link to a sample that doesn't exist
                }
                broadcastNav(nav);
                const delivered = sseClients.size > 0 || (Date.now() - lastPollAt < 4000);
                return {
                    ok: true,
                    navigated: nav,
                    sample,
                    delivered,
                    note: delivered ? undefined : "No panel is open yet — call open_canvas with { view } to show it.",
                };
            },
        },
        {
            name: "list_samples",
            description: "List the browsable WinUI Gallery + Windows App SDK samples (id, title, category, source). Filter with `search` and/or `category`. Use this to find a `sampleId` (or category) to pass to `navigate` / open_canvas so the Samples tab opens straight to it.",
            inputSchema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    search: { type: "string", maxLength: 128 },
                    category: { type: "string", maxLength: 64 },
                    limit: { type: "integer", minimum: 1, maximum: 200 },
                },
            },
            handler: async (ctx) => {
                const idx = await getSamplesIndex();
                const input = ctx.input || {};
                const q = String(input.search || "").toLowerCase().trim();
                const cat = String(input.category || "");
                const limit = input.limit || 60;
                let items = idx.items || [];
                if (cat) items = items.filter((it) => it.category === cat);
                if (q) {
                    items = items.filter((it) =>
                        (it.title + " " + it.category + " " + (it.tags || []).join(" ")).toLowerCase().includes(q));
                }
                return {
                    available: idx.available,
                    total: items.length,
                    categories: idx.categories,
                    items: items.slice(0, limit).map((it) => ({
                        id: it.id, title: it.title, category: it.category, source: it.source,
                    })),
                };
            },
        },
        {
            name: "review",
            description: "Scan a WinUI 3 project for design/accessibility/theming/binding/perf/security issues and show the scorecard in the Review tab. With no `path`, it auto-detects the WinUI project in the current workspace (falling back to the last-scanned folder); pass `path` to override. Returns the score, grade, per-category tallies, and top findings so you can reason about them — and drives an open panel to the Review tab. Use after scaffolding to review what was built, then call again after fixes to re-score.",
            inputSchema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    path: { type: "string", maxLength: 400 },
                },
            },
            handler: async (ctx) => {
                const input = ctx.input || {};
                const result = await reviewProject(input.path || "");
                const nav = { view: "review" };
                if (result.ok) nav.path = result.target;
                else if (input.path) nav.path = String(input.path);
                broadcastNav(nav);
                const delivered = sseClients.size > 0 || (Date.now() - lastPollAt < 4000);
                if (!result.ok) {
                    return { ok: false, error: result.error, delivered };
                }
                return {
                    ok: true,
                    target: result.target,
                    score: result.score,
                    grade: result.grade,
                    fileCount: result.fileCount,
                    totals: result.totals,
                    categories: result.categories
                        .filter((c) => c.total > 0)
                        .map((c) => ({ name: c.name, total: c.total, error: c.error, warning: c.warning, note: c.note })),
                    top: result.findings.slice(0, 8).map((f) => ({
                        severity: f.severity, title: f.title, file: f.file, line: f.line, ruleRef: f.ruleRef,
                    })),
                    delivered,
                    note: delivered ? undefined : "No panel is open — call open_canvas with { view: \"review\", path } to show the scorecard.",
                };
            },
        },
        {
            name: "inspect_latch",
            description: "Latch the Inspect tab (Live Visual Tree) onto a running window and switch the panel to it. With no input it auto-latches to the WinUI app in the current workspace (following it across rebuilds). Pass process/title/pid to target a specific window instead. Requires an open canvas panel.",
            inputSchema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    process: { type: "string", maxLength: 128, description: "Process-name substring, e.g. 'MyWinUIApp'." },
                    title: { type: "string", maxLength: 200, description: "Window-title substring." },
                    pid: { type: "number", description: "Process id." },
                },
            },
            handler: async (ctx) => {
                const srv = servers.get(ctx.instanceId);
                if (!srv || !srv.inspect) return { ok: false, error: "Inspect panel not open — call open_canvas with { view: \"inspect\" } first." };
                const input = ctx.input || {};
                broadcastNav({ view: "inspect" });
                if (input.process || input.title || input.pid != null) {
                    const crit = {};
                    if (input.process) crit.process = input.process;
                    if (input.title) crit.title = input.title;
                    if (input.pid != null) crit.pid = input.pid;
                    armInspectWatch(srv.inspect, crit);
                    await new Promise((r) => setTimeout(r, 300));
                    return { ok: true, watching: crit, hwnd: srv.inspect.state.hwnd, title: srv.inspect.state.title };
                }
                const t = await latchWorkspaceApp(srv.inspect);
                await new Promise((r) => setTimeout(r, 300));
                return {
                    ok: true,
                    ...t,
                    hwnd: srv.inspect.state.hwnd,
                    title: srv.inspect.state.title,
                    note: srv.inspect.state.hwnd
                        ? undefined
                        : (t.processName ? `Watching for ${t.processName} — run the app to inspect it.` : "No WinUI app detected in this workspace; pick a window in the panel."),
                };
            },
        },
        {
            name: "inspect_snapshot",
            description: "Return the current Inspect target's UI-Automation element tree as JSON (x:Name/AutomationId, control type, bounds, children). Latch a target first with inspect_latch.",
            inputSchema: { type: "object", additionalProperties: false, properties: { depth: { type: "number", description: "Tree depth (1-12)." } } },
            handler: async (ctx) => {
                const srv = servers.get(ctx.instanceId);
                const st = srv && srv.inspect ? srv.inspect.state : null;
                if (!st || st.hwnd == null) return { ok: false, error: "No target latched — call inspect_latch first." };
                const tree = await inspectWindow(st.hwnd, (ctx.input && ctx.input.depth) || st.depth);
                return { ok: true, hwnd: st.hwnd, title: st.title, tree };
            },
        },
        {
            name: "inspect_select",
            description: "Select/highlight an element in the open Inspect panel by its selector slug (from inspect_snapshot). Drives the live panel's selection + property view.",
            inputSchema: { type: "object", additionalProperties: false, required: ["selector"], properties: { selector: { type: "string", maxLength: 200 } } },
            handler: async (ctx) => {
                const srv = servers.get(ctx.instanceId);
                if (!srv || !srv.inspect) return { ok: false, error: "Inspect panel not open." };
                srv.inspect.state.selectedSelector = (ctx.input && ctx.input.selector) || null;
                srv.inspect.state.selectNonce++;
                return { ok: true, selected: srv.inspect.state.selectedSelector };
            },
        },
        {
            name: "run_app",
            description: "Build and launch the current WinUI project (the header's project chip) and auto-latch the Inspect tab onto it. With no input it targets the workspace app or the last project reviewed; pass `path` to run a specific project folder. Same as clicking Run in the canvas.",
            inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string", maxLength: 400, description: "Project folder to build & run (contains the .csproj). Defaults to the current project." } } },
            handler: async (ctx) => {
                const result = await runApp(ctx.instanceId, ctx.input && ctx.input.path);
                if (result.ok) broadcastNav({ view: "inspect" });
                return result;
            },
        },
        {
            name: "stop_app",
            description: "Stop the WinUI app that Run launched (terminates the tracked process). Same as clicking Stop in the canvas.",
            inputSchema: { type: "object", additionalProperties: false, properties: {} },
            handler: async (ctx) => {
                const st = await stopRun();
                const srv = servers.get(ctx.instanceId);
                if (srv && srv.inspect) { try { disarmInspectWatch(srv.inspect); srv.inspect.state.hwnd = null; } catch {} }
                _lastRunStatus = "idle";
                return { ok: true, state: st };
            },
        },
        {
            name: "show_toolbar",
            description: "Show the floating in-app toolbar (a VS-style 'pill') docked over the running WinUI app. It tracks the window as it moves and its buttons drive the Inspect tab's Live Visual Tree and capture screenshots. With no input it targets the workspace app; pass process/title/pid to target a specific window. Requires an open canvas panel and a running app.",
            inputSchema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    process: { type: "string", maxLength: 128, description: "Process-name substring, e.g. 'MyWinUIApp'." },
                    title: { type: "string", maxLength: 200, description: "Window-title substring." },
                    pid: { type: "number", description: "Process id." },
                },
            },
            handler: async (ctx) => {
                const input = ctx.input || {};
                const crit = {};
                if (input.process) crit.process = input.process;
                if (input.title) crit.title = input.title;
                if (input.pid != null) crit.pid = input.pid;
                return showToolbar(ctx.instanceId, crit);
            },
        },
    ],
    open: async (ctx) => {
        const input = ctx.input || {};
        // Any spec field pre-populates the wizard (agent-driven prefill).
        const hasSpec = Object.keys(SPEC_SCHEMA.properties).some((k) => k in input);
        if (hasSpec) {
            const base = await readDraft();
            const clean = await writeDraft(sanitizeSpec({ ...base, ...input }));
            broadcastSpec(clean);
        }
        // A `view` (+ optional populate) deep-links the panel to a tab.
        const nav = sanitizeNav(input);
        const existing = servers.get(ctx.instanceId);
        if (nav) {
            if (existing) broadcastNav(nav);          // live panel: drive it over SSE
            else setInitialNav(ctx.instanceId, nav);  // fresh panel: bake into first paint
        }
        let entry = existing;
        if (!entry) {
            entry = await startServer(ctx.instanceId);
            servers.set(ctx.instanceId, entry);
        }
        return { title: "WinUI Template Studio", status: "Ready", url: entry.url };
    },
    onClose: async (ctx) => {
        await closeInstance(ctx.instanceId);
    },
});

session = await joinSession({ canvases: [canvas] });

// Wire the inspector module's logger to the session timeline.
initInspect({ log: (m, o) => { try { session.log(m, o); } catch {} } });
