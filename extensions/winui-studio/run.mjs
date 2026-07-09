// run.mjs — build + launch + track a WinUI app for the Studio's Run / Stop control.
//
// Owns a single module-level run state (one app at a time). startRun() spawns the
// bundled run.ps1 (build -> winapp run --detach --json), parses the PID it prints,
// and flips status building -> running. Liveness is checked lazily against the PID
// so the button falls back to "Run" when the user closes the app themselves.
// stopRun() terminates exactly the process we launched.

import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_PS1 = join(HERE, "run.ps1");
const POWERSHELL = process.env.SystemRoot
    ? join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";

const state = {
    status: "idle",     // idle | building | running | error
    appName: null,
    projectDir: null,
    csproj: null,
    proc: null,         // process name used for auto-latch (assembly / exe base name)
    pid: null,
    output: null,
    error: null,
    stage: null,
    logTail: "",
    startedAt: 0,
};

let child = null;       // the run.ps1 process (alive during build+launch)
let onStateCb = null;

function pub() {
    return {
        status: state.status,
        appName: state.appName,
        projectDir: state.projectDir,
        proc: state.proc,
        pid: state.pid,
        output: state.output,
        error: state.error,
        stage: state.stage,
        startedAt: state.startedAt,
        logTail: state.logTail.slice(-1600),
    };
}

function emit() {
    if (typeof onStateCb === "function") {
        try { onStateCb(pub()); } catch { /* callback must never break the run */ }
    }
}

// signal-0 existence check: throws ESRCH when gone, EPERM when alive-but-owned.
function pidAlive(pid) {
    if (pid == null) return false;
    try { process.kill(pid, 0); return true; }
    catch (e) { return e && e.code === "EPERM"; }
}

export function isBusy() { return state.status === "building" || state.status === "running"; }

// Lazily reconcile liveness so a user-closed app flips the button back to Run.
export function getRunState() {
    if (state.status === "running" && !pidAlive(state.pid)) {
        state.status = "idle";
        state.pid = null;
        state.output = null;
        emit();
    }
    return pub();
}

export function startRun({ projectDir, csproj, appName }, onState) {
    onStateCb = onState || null;
    if (isBusy()) return pub();

    state.status = "building";
    state.appName = appName || null;
    state.projectDir = projectDir || null;
    state.csproj = csproj || null;
    state.proc = appName || null;
    state.pid = null;
    state.output = null;
    state.error = null;
    state.stage = null;
    state.logTail = "";
    state.startedAt = Date.now();
    emit();

    let out = "";
    try {
        child = spawn(POWERSHELL, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", RUN_PS1, "-Project", csproj], { windowsHide: true });
    } catch (e) {
        state.status = "error";
        state.stage = "spawn";
        state.error = "Could not start the build process: " + ((e && e.message) || e);
        child = null;
        emit();
        return pub();
    }

    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => {
        state.logTail = (state.logTail + d.toString()).slice(-6000);
        emit();
    });
    child.on("error", (e) => {
        state.status = "error";
        state.stage = "spawn";
        state.error = "Build process error: " + ((e && e.message) || e);
        child = null;
        emit();
    });
    child.on("close", () => {
        child = null;
        let res = null;
        const m = out.trim().match(/\{[\s\S]*\}\s*$/);
        if (m) { try { res = JSON.parse(m[0]); } catch { /* fall through to error */ } }
        if (res && res.ok && res.pid) {
            state.status = "running";
            state.pid = Number(res.pid);
            state.proc = res.proc || state.proc;
            state.output = res.output || null;
            state.error = null;
            state.stage = null;
        } else {
            state.status = "error";
            state.stage = (res && res.stage) || "build";
            const raw = (res && res.error) || "Build or launch failed. Check the log.";
            state.error = String(raw).replace(/[\r\n]+/g, " · ").slice(0, 400);
        }
        emit();
    });

    return pub();
}

export async function stopRun() {
    const wasPid = state.pid;
    if (child) { try { child.kill(); } catch { /* already gone */ } child = null; }
    if (wasPid != null) await killPid(wasPid);
    state.status = "idle";
    state.pid = null;
    state.output = null;
    state.error = null;
    state.stage = null;
    emit();
    return pub();
}

function killPid(pid) {
    return new Promise((resolve) => {
        execFile(
            POWERSHELL,
            ["-NoProfile", "-Command", "Stop-Process -Id " + Number(pid) + " -Force -ErrorAction SilentlyContinue"],
            { windowsHide: true, timeout: 8000 },
            () => resolve(),
        );
    });
}
