// Extension: winui-visual-tree
// A "Live Visual Tree" inspector for any running Windows app (WinUI 3, WPF,
// WinForms, Win32, Electron) rendered in a Copilot canvas panel.
//
// How it works:
//   canvas panel (webview)  <-- http/json -->  this extension's local server
//                                                   |  spawns
//                                                   v
//                                             winapp.exe ui ...  <-- UIA -->  target app
//
// The canvas `open()` handler boots a loopback HTTP server and hands its URL to
// the host. The server both serves the inspector web UI (public/) and exposes a
// small JSON API that shells out to `winapp ui inspect|get-property|screenshot`.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize, sep } from "node:path";
import { tmpdir } from "node:os";
import { createConnection } from "node:net";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "public", "inspect");
const ASSETS_DIR = join(HERE, "public", "assets");

// The host extension (extension.mjs) injects a logger so timeline lines stay
// consistently tagged. No-op until initInspect() wires it up.
let logFn = () => {};
export function initInspect({ log } = {}) {
    if (typeof log === "function") logFn = log;
}
function log(msg, opts) {
    try {
        logFn(`[inspect] ${msg}`, opts);
    } catch {
        /* logging must never throw */
    }
}

// ---------------------------------------------------------------------------
// winapp bridge
// ---------------------------------------------------------------------------

function execFileP(cmd, args, opts) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, opts, (err, stdout, stderr) => {
            if (err) {
                err.stderr = stderr;
                return reject(err);
            }
            resolve(stdout);
        });
    });
}

// Run winapp with an args array (never a shell string). All args we pass are
// safe tokens (numeric HWNDs, slug selectors, flags) — we never pass free-form
// window titles to the CLI, so the cmd.exe fallback stays injection-safe.
async function runWinapp(args) {
    const opts = { timeout: 20000, maxBuffer: 64 * 1024 * 1024, windowsHide: true };
    try {
        return await execFileP("winapp.exe", args, opts);
    } catch (e) {
        // Fallback for the WindowsApps app-execution-alias reparse point, which
        // some Node builds refuse to spawn directly.
        const comspec = process.env.ComSpec || "cmd.exe";
        return await execFileP(comspec, ["/d", "/s", "/c", "winapp", ...args], opts);
    }
}

// Strict, shell-free runner for MUTATIONS that carry free-form values (e.g.
// `set-value <text>`). It only ever uses execFile with an argv array, so the
// value is passed as one opaque token with zero shell interpretation — there is
// no cmd.exe fallback and therefore no command-injection surface. (We verified
// execFile spawns the WindowsApps alias directly on this platform.) Throws if
// the alias genuinely can't be found rather than degrading to a shell.
async function runWinappDirect(args) {
    const opts = { timeout: 20000, maxBuffer: 16 * 1024 * 1024, windowsHide: true };
    try {
        return await execFileP("winapp.exe", args, opts);
    } catch (e) {
        if (e && (e.code === "ENOENT" || e.errno === -4058)) {
            return await execFileP("winapp", args, opts); // resolve via PATHEXT, still shell-free
        }
        throw e;
    }
}

// Run a mutation verb and return parsed JSON, or a { ok, output } shape when the
// CLI emits a non-JSON confirmation line.
async function runVerbDirect(args) {
    const out = await runWinappDirect(args);
    try {
        return parseLooseJson(out);
    } catch {
        return { ok: true, output: String(out).trim().slice(0, 400) };
    }
}

function parseLooseJson(text) {
    const t = String(text).trim();
    try {
        return JSON.parse(t);
    } catch {
        /* fall through to slice heuristic */
    }
    const iObj = t.indexOf("{");
    const iArr = t.indexOf("[");
    let start;
    if (iObj === -1) start = iArr;
    else if (iArr === -1) start = iObj;
    else start = Math.min(iObj, iArr);
    if (start === -1) throw new Error("winapp returned no JSON: " + t.slice(0, 200));
    const close = t[start] === "{" ? "}" : "]";
    const end = t.lastIndexOf(close);
    return JSON.parse(t.slice(start, end + 1));
}

async function winappJson(args) {
    return parseLooseJson(await runWinapp(args));
}

const listWindows = () => winappJson(["ui", "list-windows", "--json"]);

async function inspectWindow(hwnd, depth = 5) {
    const d = Math.max(1, Math.min(12, Number(depth) || 5));
    const data = await winappJson(["ui", "inspect", "-w", String(hwnd), "--json", "-d", String(d)]);
    const win = Array.isArray(data.windows) ? data.windows[0] : data;
    const elements = win?.elements ?? [];
    const root = elements[0] ?? null;
    const origin = root ? { x: root.x ?? 0, y: root.y ?? 0 } : { x: 0, y: 0 };
    return { hwnd: win?.hwnd ?? hwnd, title: win?.title ?? "", origin, elements };
}

const getProperty = (hwnd, selector) =>
    winappJson(["ui", "get-property", String(selector), "-w", String(hwnd), "--json"]);

async function screenshot(hwnd, outPath) {
    return winappJson(["ui", "screenshot", "-w", String(hwnd), "-o", outPath, "--json"]);
}

// ---- UIA mutations (invoke / value / focus / click) ---------------------
// All go through runVerbDirect (shell-free) so free-form values are safe.

const invokeElement = (hwnd, selector) =>
    runVerbDirect(["ui", "invoke", String(selector), "-w", String(hwnd), "--json"]);

const focusElement = (hwnd, selector) =>
    runVerbDirect(["ui", "focus", String(selector), "-w", String(hwnd), "--json"]);

const clickElement = (hwnd, selector, { double, right } = {}) => {
    const a = ["ui", "click", String(selector), "-w", String(hwnd), "--json"];
    if (double) a.push("--double");
    if (right) a.push("--right");
    return runVerbDirect(a);
};

const getValue = (hwnd, selector) =>
    runVerbDirect(["ui", "get-value", String(selector), "-w", String(hwnd), "--json"]);

const setValue = (hwnd, selector, value) =>
    runVerbDirect(["ui", "set-value", String(selector), String(value), "-w", String(hwnd), "--json"]);

// ---------------------------------------------------------------------------
// In-app dev bridge (Phase B: live styling). UIA cannot set visual properties
// (Background/FontSize/Margin), so apps we build embed a DEBUG-only loopback
// listener (see VtDemo/DevBridge.cs) that advertises its port in a pid-keyed
// file. We resolve the target's pid, read that file, and stream one JSON tweak.
// ---------------------------------------------------------------------------

async function readBridgePort(pid) {
    if (pid == null) throw new Error("no target pid — set a target first");
    const file = join(tmpdir(), "winui-devbridge", `${pid}.json`);
    const info = JSON.parse(await readFile(file, "utf8"));
    if (!info.port) throw new Error("dev bridge port missing from advertisement file");
    return info.port;
}

async function bridgeRequest(pid, payload, timeoutMs = 4000) {
    const port = await readBridgePort(pid);
    return await new Promise((resolve, reject) => {
        const sock = createConnection({ host: "127.0.0.1", port }, () => {
            sock.write(JSON.stringify(payload) + "\n");
        });
        let buf = "";
        const finish = (fn, arg) => {
            try { sock.destroy(); } catch { /* already gone */ }
            fn(arg);
        };
        sock.setTimeout(timeoutMs, () => finish(reject, new Error("dev bridge timed out")));
        sock.on("data", (d) => {
            buf += d.toString("utf8");
            const nl = buf.indexOf("\n");
            if (nl >= 0) {
                let parsed;
                try { parsed = JSON.parse(buf.slice(0, nl)); }
                catch { parsed = { ok: false, error: "unparseable reply from app" }; }
                finish(resolve, parsed);
            }
        });
        sock.on("error", (e) => finish(reject, new Error(`dev bridge connect failed: ${e.message}`)));
    });
}

async function liveTweak(pid, { name, prop, value }) {
    return await bridgeRequest(pid, { name, prop, value: String(value) }, 2500);
}

// Ask the in-app dev bridge to reflect every readable property of an element.
async function dumpProps(pid, name) {
    return await bridgeRequest(pid, { op: "dump", name }, 6000);
}

// Resolve a { hwnd?, pid?, title? } request into a concrete window.
async function resolveTarget({ hwnd, pid, title, process } = {}) {
    const wins = await listWindows();
    const usable = wins.filter((w) => w.width > 0 && w.height > 0);
    if (hwnd != null) {
        const m = wins.find((w) => String(w.hwnd) === String(hwnd));
        if (m) return m;
        return { hwnd: Number(hwnd), title: title || "" };
    }
    const scored = (list) =>
        [...list].sort((a, b) => Number(b.isForeground) - Number(a.isForeground) || b.width * b.height - a.width * a.height)[0];
    if (pid != null) {
        const byPid = usable.filter((w) => String(w.processId) === String(pid) && w.label !== "popup");
        if (byPid.length) return scored(byPid);
    }
    if (process) {
        const needle = String(process).toLowerCase();
        const byProc = usable.filter((w) => (w.processName || "").toLowerCase().includes(needle) && w.label !== "popup");
        if (byProc.length) return scored(byProc);
    }
    if (title) {
        const needle = String(title).toLowerCase();
        const byTitle = usable.filter((w) => (w.title || "").toLowerCase().includes(needle));
        if (byTitle.length) return scored(byTitle);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Auto-latch watcher — keep re-targeting an app by process/title as it
// restarts (e.g. after a rebuild), so the panel "follows" the app you build.
// ---------------------------------------------------------------------------

function disarmWatch(entry) {
    if (entry?.watchTimer) {
        clearInterval(entry.watchTimer);
        entry.watchTimer = null;
    }
}

async function latchTick(entry) {
    const crit = entry.state.watch;
    if (!crit || entry._ticking) return;
    entry._ticking = true;
    try {
        const target = await resolveTarget(crit);
        if (target && target.hwnd != null && String(target.hwnd) !== String(entry.state.hwnd)) {
            entry.state.hwnd = target.hwnd;
            entry.state.title = target.title ?? "";
            entry.state.processName = target.processName ?? null;
            entry.state.pid = target.processId ?? null;
            entry.state.selectedSelector = null;
            entry.state.targetNonce++;
            log(`auto-latched -> hwnd ${target.hwnd} (${entry.state.title})`);
        }
    } catch {
        /* transient poll errors are ignored; we retry next tick */
    } finally {
        entry._ticking = false;
    }
}

function armWatch(entry, criteria) {
    entry.state.watch = criteria;
    disarmWatch(entry);
    latchTick(entry);
    entry.watchTimer = setInterval(() => latchTick(entry), 1500);
}

// ---------------------------------------------------------------------------
// Element -> XAML source bridge. UIA AutomationId mirrors XAML x:Name, and
// UIA Name mirrors Content/Text, so we can grep a project for the element.
// ---------------------------------------------------------------------------

const SKIP_DIRS = /^(bin|obj|\.git|\.vs|\.vscode|node_modules|packages|Generated Files)$/i;

async function findXaml(root, acc, max) {
    if (acc.length >= max) return;
    let ents;
    try {
        ents = await readdir(root, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of ents) {
        if (acc.length >= max) return;
        const full = join(root, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.test(e.name)) continue;
            await findXaml(full, acc, max);
        } else if (e.isFile() && e.name.toLowerCase().endsWith(".xaml")) {
            acc.push(full);
        }
    }
}

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function locateInSource(root, { automationId, name }) {
    const files = [];
    await findXaml(root, files, 3000);
    const pats = [];
    if (automationId) {
        pats.push({ via: "x:Name", re: new RegExp(`x:Name\\s*=\\s*"${escapeRe(automationId)}"`) });
        pats.push({ via: "AutomationId", re: new RegExp(`AutomationProperties\\.AutomationId\\s*=\\s*"${escapeRe(automationId)}"`) });
    }
    if (name) {
        pats.push({ via: "Content", re: new RegExp(`Content\\s*=\\s*"${escapeRe(name)}"`) });
        pats.push({ via: "Text", re: new RegExp(`Text\\s*=\\s*"${escapeRe(name)}"`) });
    }
    const primary = (via) => (via === "x:Name" || via === "AutomationId" ? 0 : 1);
    const out = [];
    for (const f of files) {
        let text;
        try {
            text = await readFile(f, "utf8");
        } catch {
            continue;
        }
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            for (const p of pats) {
                if (p.re.test(lines[i])) {
                    out.push({ file: f, line: i + 1, via: p.via, text: lines[i].trim().slice(0, 200) });
                }
            }
        }
    }
    out.sort((a, b) => primary(a.via) - primary(b.via));
    return out.slice(0, 50);
}

// ---------------------------------------------------------------------------
// Commit live style tweaks back into XAML source. We find the element's opening
// tag by its x:Name / AutomationId and upsert each `Prop="value"` attribute, so
// a live-styled element keeps its look across a clean rebuild.
// ---------------------------------------------------------------------------

// Opening-tag [start,end] (indices, end at the '>') enclosing position `idx`.
function tagSpanAround(text, idx) {
    let s = text.lastIndexOf("<", idx);
    while (s > 0 && (text[s + 1] === "/" || text[s + 1] === "!")) s = text.lastIndexOf("<", s - 1);
    if (s < 0) return null;
    let q = null;
    for (let i = s; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === q) q = null;
            continue;
        }
        if (c === '"' || c === "'") q = c;
        else if (c === ">") return { start: s, end: i };
    }
    return null;
}

function upsertXamlAttr(tag, prop, value) {
    const re = new RegExp(`(\\s${escapeRe(prop)}\\s*=\\s*")[^"]*(")`);
    if (re.test(tag)) return { tag: tag.replace(re, `$1${value}$2`), mode: "replaced" };
    const m = tag.match(/(\s*)(\/?)>\s*$/);
    const im = tag.match(/\n([ \t]+)[\w:.]+\s*=/);
    const indent = im ? im[1] : "    ";
    const lead = m && m[1] ? m[1] : " ";
    const slash = m && m[2] ? "/" : "";
    const body = m ? tag.slice(0, m.index) : tag.replace(/>\s*$/, "");
    return { tag: `${body}\n${indent}${prop}="${value}"${lead}${slash}>`, mode: "inserted" };
}

async function commitStyleToXaml(root, { automationId, name, tweaks }) {
    const matches = await locateInSource(root, { automationId, name });
    const best = matches.find((m) => m.via === "x:Name" || m.via === "AutomationId") || matches[0];
    if (!best) throw new Error("element not found in XAML source under " + root);
    const text = await readFile(best.file, "utf8");
    const idRe = automationId
        ? new RegExp(`(?:x:Name|AutomationProperties\\.AutomationId)\\s*=\\s*"${escapeRe(automationId)}"`)
        : new RegExp(`(?:Content|Text)\\s*=\\s*"${escapeRe(name)}"`);
    const idm = idRe.exec(text);
    if (!idm) throw new Error("identifier not found in " + best.file);
    const span = tagSpanAround(text, idm.index);
    if (!span) throw new Error("could not resolve element opening tag");
    let tag = text.slice(span.start, span.end + 1);
    const applied = [];
    for (const [prop, value] of Object.entries(tweaks)) {
        const r = upsertXamlAttr(tag, prop, value);
        tag = r.tag;
        applied.push({ prop, value, mode: r.mode });
    }
    const next = text.slice(0, span.start) + tag + text.slice(span.end + 1);
    await writeFile(best.file, next, "utf8");
    return { file: best.file, applied };
}

// ---------------------------------------------------------------------------
// HTTP server (per instance)
// ---------------------------------------------------------------------------

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif" };

function sendJson(res, obj, status = 200) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
}

// Read a small JSON request body (mutations POST here). Never rejects — an
// unparseable or oversized body resolves to {} so a handler can validate.
function readJsonBody(req) {
    return new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => {
            data += c;
            if (data.length > 1_000_000) req.destroy();
        });
        req.on("end", () => {
            if (!data) return resolve({});
            try {
                resolve(JSON.parse(data));
            } catch {
                resolve({});
            }
        });
        req.on("error", () => resolve({}));
    });
}

export async function serveInspectStatic(res, pathname) {
    // pathname arrives as "/inspect", "/inspect/", or "/inspect/<file>".
    let rel = pathname.replace(/^\/inspect\/?/, "");
    if (rel === "") rel = "index.html";
    const full = normalize(join(PUBLIC_DIR, rel));
    if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + sep)) {
        res.writeHead(403).end("forbidden");
        return;
    }
    try {
        const buf = await readFile(full);
        res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(buf);
    } catch {
        res.writeHead(404).end("not found");
    }
}

// Static asset server (public/assets/*, e.g. the Home hero image). Kept separate
// from serveInspectStatic so the inspector's public dir stays isolated.
export async function serveAsset(res, pathname) {
    let rel = pathname.replace(/^\/asset\/?/, "");
    if (rel === "") { res.writeHead(404).end("not found"); return; }
    const full = normalize(join(ASSETS_DIR, rel));
    if (full !== ASSETS_DIR && !full.startsWith(ASSETS_DIR + sep)) {
        res.writeHead(403).end("forbidden");
        return;
    }
    try {
        const buf = await readFile(full);
        res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
        res.end(buf);
    } catch {
        res.writeHead(404).end("not found");
    }
}

function makeState() {
    return { hwnd: null, title: null, processName: null, pid: null, selectedSelector: null, depth: 5, targetNonce: 0, selectNonce: 0, mutateNonce: 0, watch: null, tweaks: {}, sourceRoot: null };
}

// Per-canvas-instance inspector entry. The host stores one of these on its own
// per-instance record and hands it to handleInspectApi / armInspectWatch. Shape
// matches what the ported handleApi/watcher expect.
export function makeInspectEntry(instanceId) {
    return { instanceId, state: makeState(), watchTimer: null, _ticking: false };
}

// Point an existing inspect entry at a specific hwnd. Used by the floating
// toolbar's "Live Visual Tree" button: mirrors the /api/target handler so the
// panel's 1s /api/state poll sees the bumped targetNonce and reloads the tree.
export async function setInspectTarget(entry, hwnd) {
    const target = await resolveTarget({ hwnd });
    if (!target) return { ok: false, error: "no matching window" };
    const state = entry.state;
    disarmWatch(entry);
    state.watch = null;
    state.hwnd = target.hwnd;
    state.title = target.title ?? "";
    state.processName = target.processName ?? null;
    state.pid = target.processId ?? null;
    state.selectedSelector = null;
    state.targetNonce++;
    log(`toolbar -> inspect target hwnd ${state.hwnd} (${state.title})`);
    return { ok: true, hwnd: state.hwnd, title: state.title, targetNonce: state.targetNonce };
}

async function handleApi(entry, url, req, res) {
    const state = entry.state;
    const q = url.searchParams;
    const route = url.pathname;

    if (route === "/api/state") {
        return sendJson(res, {
            hwnd: state.hwnd,
            title: state.title,
            depth: state.depth,
            selectedSelector: state.selectedSelector,
            targetNonce: state.targetNonce,
            selectNonce: state.selectNonce,
            mutateNonce: state.mutateNonce,
            watching: state.watch,
        });
    }

    if (route === "/api/windows") {
        const wins = await listWindows();
        return sendJson(res, wins);
    }

    if (route === "/api/target") {
        const target = await resolveTarget({ hwnd: q.get("hwnd"), pid: q.get("pid"), title: q.get("title"), process: q.get("process") });
        if (!target) return sendJson(res, { ok: false, error: "no matching window" }, 404);
        disarmWatch(entry);
        state.watch = null;
        state.hwnd = target.hwnd;
        state.title = target.title ?? "";
        state.processName = target.processName ?? null;
        state.pid = target.processId ?? null;
        state.selectedSelector = null;
        state.targetNonce++;
        log(`target set -> hwnd ${state.hwnd} (${state.title})`);
        return sendJson(res, { ok: true, hwnd: state.hwnd, title: state.title, targetNonce: state.targetNonce });
    }

    if (route === "/api/inspect") {
        const hwnd = q.get("hwnd") || state.hwnd;
        if (hwnd == null) return sendJson(res, { error: "no target" }, 400);
        if (q.get("depth")) state.depth = Math.max(1, Math.min(12, Number(q.get("depth")) || 5));
        const tree = await inspectWindow(hwnd, state.depth);
        return sendJson(res, tree);
    }

    if (route === "/api/property") {
        const hwnd = q.get("hwnd") || state.hwnd;
        const selector = q.get("selector");
        if (hwnd == null || !selector) return sendJson(res, { error: "hwnd and selector required" }, 400);
        const prop = await getProperty(hwnd, selector);
        return sendJson(res, prop);
    }

    if (route === "/api/select") {
        state.selectedSelector = q.get("selector") || null;
        state.selectNonce++;
        return sendJson(res, { ok: true, selectNonce: state.selectNonce });
    }

    if (route === "/api/screenshot") {
        const hwnd = q.get("hwnd") || state.hwnd;
        if (hwnd == null) return sendJson(res, { error: "no target" }, 400);
        const outPath = join(tmpdir(), `winui-vt-${entry.instanceId}.png`);
        const meta = await screenshot(hwnd, outPath);
        try {
            const buf = await readFile(meta.filePath || outPath);
            res.writeHead(200, {
                "Content-Type": "image/png",
                "Cache-Control": "no-store",
                "X-Shot-Width": String(meta.width ?? ""),
                "X-Shot-Height": String(meta.height ?? ""),
            });
            return res.end(buf);
        } catch (e) {
            return sendJson(res, { error: "screenshot read failed: " + e.message }, 500);
        }
    }

    if (route === "/api/value") {
        const hwnd = q.get("hwnd") || state.hwnd;
        const selector = q.get("selector");
        if (hwnd == null || !selector) return sendJson(res, { ok: false, error: "hwnd and selector required" }, 400);
        try {
            const v = await getValue(hwnd, selector);
            return sendJson(res, { ok: true, ...v });
        } catch (e) {
            return sendJson(res, { ok: false, error: String(e.stderr || e.message || e) });
        }
    }

    // Mutations: invoke / focus / click / set-value. Accept a POST JSON body
    // (preferred) or query params. Always reply 200 with {ok,...} so the client
    // can surface logical failures without the fetch helper throwing.
    if (route === "/api/invoke" || route === "/api/focus" || route === "/api/click" || route === "/api/setvalue") {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        const selector = body.selector ?? q.get("selector");
        const hwnd = body.hwnd ?? q.get("hwnd") ?? state.hwnd;
        if (hwnd == null || !selector) return sendJson(res, { ok: false, error: "hwnd and selector required" });
        try {
            let result;
            if (route === "/api/invoke") result = await invokeElement(hwnd, selector);
            else if (route === "/api/focus") result = await focusElement(hwnd, selector);
            else if (route === "/api/click") result = await clickElement(hwnd, selector, { double: body.double, right: body.right });
            else result = await setValue(hwnd, selector, body.value ?? q.get("value") ?? "");
            state.mutateNonce++;
            return sendJson(res, { ok: true, result, mutateNonce: state.mutateNonce });
        } catch (e) {
            return sendJson(res, { ok: false, error: String(e.stderr || e.message || e) });
        }
    }

    if (route === "/api/livetweak") {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        const name = body.name ?? q.get("name");
        const prop = body.prop ?? q.get("prop");
        const value = body.value ?? q.get("value");
        if (!name || !prop) return sendJson(res, { ok: false, error: "name and prop required" });
        if (state.pid == null) return sendJson(res, { ok: false, error: "no target pid — set a target first" });
        try {
            const reply = await liveTweak(state.pid, { name, prop, value });
            if (reply?.ok !== false) state.tweaks[name] = { ...(state.tweaks[name] || {}), [prop]: value };
            state.mutateNonce++;
            return sendJson(res, { ...reply, mutateNonce: state.mutateNonce });
        } catch (e) {
            return sendJson(res, { ok: false, error: String(e.message || e) });
        }
    }

    if (route === "/api/props") {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        const name = body.name ?? q.get("name");
        if (!name) return sendJson(res, { ok: false, error: "name required" });
        if (state.pid == null) return sendJson(res, { ok: false, error: "no target pid — set a target first" });
        try {
            const reply = await dumpProps(state.pid, name);
            return sendJson(res, reply);
        } catch (e) {
            return sendJson(res, { ok: false, error: String(e.message || e) });
        }
    }

    if (route === "/api/commit-style") {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        const name = body.name ?? q.get("name");
        const root = body.root ?? q.get("root") ?? state.sourceRoot;
        if (!name) return sendJson(res, { ok: false, error: "name required" });
        if (!root) return sendJson(res, { ok: false, error: "no source root known — run locate_in_source first or pass root" });
        const tweaks = state.tweaks?.[name];
        if (!tweaks || !Object.keys(tweaks).length) return sendJson(res, { ok: false, error: "no live tweaks recorded for this element" });
        try {
            const r = await commitStyleToXaml(root, { automationId: name, name: null, tweaks });
            return sendJson(res, { ok: true, ...r });
        } catch (e) {
            return sendJson(res, { ok: false, error: String(e.message || e) });
        }
    }

    return sendJson(res, { error: "unknown route" }, 404);
}


// ---------------------------------------------------------------------------
// Exports — the host extension (extension.mjs) owns the HTTP server + canvas and
// consumes these. handleInspectApi / armInspectWatch / disarmInspectWatch keep
// the original "entry" shape: { instanceId, state, watchTimer, _ticking } — see
// makeInspectEntry(). API routes handled by handleInspectApi: GET/POST /api/*
// (state, windows, target, inspect, property, select, screenshot, value,
// invoke, focus, click, setvalue, livetweak, props, commit-style).
// ---------------------------------------------------------------------------

export {
    handleApi as handleInspectApi,
    armWatch as armInspectWatch,
    disarmWatch as disarmInspectWatch,
    makeState,
    listWindows,
    resolveTarget,
    inspectWindow,
    getProperty,
    getValue,
    setValue,
    invokeElement,
    focusElement,
    clickElement,
    liveTweak,
    dumpProps,
    locateInSource,
    commitStyleToXaml,
    screenshot,
};
