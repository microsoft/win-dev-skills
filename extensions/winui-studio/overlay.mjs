// Floating in-app toolbar ("the VS pill") — process manager.
//
// Spawns overlay.ps1 (a topmost WPF pill) over a target window and keeps one
// overlay per canvas instance. The overlay POSTs button commands back to the
// extension's loopback server at /overlay/action, authenticated with a
// per-overlay token minted here.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "overlay.ps1");

// instanceId -> { token, hwnd, child }
const overlays = new Map();

// Best-effort: don't leave pills floating if the extension host exits.
process.on("exit", () => {
    for (const o of overlays.values()) {
        try { o.child.kill(); } catch { /* already gone */ }
    }
});

export function overlayToken(instanceId) {
    const o = overlays.get(instanceId);
    return o ? o.token : null;
}

export function hasOverlay(instanceId) {
    return overlays.has(instanceId);
}

// Kill the overlay (if any) for an instance. Returns true if one was running.
export function stopOverlay(instanceId) {
    const o = overlays.get(instanceId);
    if (!o) return false;
    overlays.delete(instanceId);
    try { o.child.kill(); } catch { /* already gone */ }
    return true;
}

// Show a fresh overlay over `hwnd`. Any existing overlay for this instance is
// replaced (one pill per panel). Returns { token }.
export function startOverlay({ instanceId, hwnd, baseUrl, label, log }) {
    stopOverlay(instanceId);
    const token = randomBytes(16).toString("hex");
    const cleanLabel = String(label || "App").replace(/[\r\n\t]+/g, " ").slice(0, 80);
    const args = [
        "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass",
        "-File", SCRIPT,
        "-Hwnd", String(hwnd),
        "-Base", String(baseUrl),
        "-Token", token,
        "-Instance", String(instanceId),
        "-Label", cleanLabel,
    ];
    const child = spawn("powershell.exe", args, { windowsHide: true, stdio: "ignore" });
    const rec = { token, hwnd, child };
    overlays.set(instanceId, rec);

    child.on("exit", (code) => {
        if (overlays.get(instanceId) === rec) overlays.delete(instanceId);
        if (log) { try { log(`overlay closed (exit ${code})`); } catch { /* ignore */ } }
    });
    child.on("error", (e) => {
        if (overlays.get(instanceId) === rec) overlays.delete(instanceId);
        if (log) { try { log(`overlay spawn failed: ${e.message}`, { level: "error" }); } catch { /* ignore */ } }
    });

    return { token };
}
