// Durable, user-scoped state for the studio, stored next to this extension under
// ./artifacts/. Per the canvas state model, user-global data (draft config,
// recently generated apps) lives with the extension, not keyed by instanceId and
// not written into any repo.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sanitizeSpec, defaultSpec } from "./catalog.mjs";

const ARTIFACTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "artifacts");
const DRAFT_PATH = join(ARTIFACTS_DIR, "draft.json");
const LAST_PATH = join(ARTIFACTS_DIR, "last-spec.json");
const RECENT_PATH = join(ARTIFACTS_DIR, "recent.json");
const REVIEW_PATH = join(ARTIFACTS_DIR, "review-target.json");
const RUN_PATH = join(ARTIFACTS_DIR, "run-target.json");
const RECENT_MAX = 20;

async function readJson(path, fallback) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    } catch {
        return fallback;
    }
}

async function writeJson(path, value) {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

export async function readDraft() {
    const raw = await readJson(DRAFT_PATH, null);
    return raw ? sanitizeSpec(raw) : defaultSpec();
}

export async function writeDraft(spec) {
    const clean = sanitizeSpec(spec);
    await writeJson(DRAFT_PATH, clean);
    return clean;
}

export async function readLast() {
    const raw = await readJson(LAST_PATH, null);
    return raw ? sanitizeSpec(raw) : null;
}

export async function recordGenerated(spec) {
    const clean = sanitizeSpec(spec);
    await writeJson(LAST_PATH, clean);
    const recent = await readJson(RECENT_PATH, []);
    const entry = { spec: clean, at: new Date().toISOString() };
    const next = [entry, ...(Array.isArray(recent) ? recent : [])].slice(0, RECENT_MAX);
    await writeJson(RECENT_PATH, next);
    return clean;
}

export async function readRecent() {
    const recent = await readJson(RECENT_PATH, []);
    return Array.isArray(recent) ? recent : [];
}

// The last folder the Review tab scanned, so re-opening remembers the target.
export async function readReviewTarget() {
    const raw = await readJson(REVIEW_PATH, null);
    return raw && typeof raw.target === "string" ? raw.target : "";
}

export async function writeReviewTarget(target) {
    const clean = typeof target === "string" ? target.trim() : "";
    if (clean) await writeJson(REVIEW_PATH, { target: clean, at: new Date().toISOString() });
    return clean;
}

// The project folder the user explicitly chose to Run (the "project chip"). An
// explicit pick wins over workspace auto-detection so Run targets what the user
// picked, even when the workspace also contains a WinUI app.
export async function readRunTarget() {
    const raw = await readJson(RUN_PATH, null);
    return raw && typeof raw.target === "string" ? raw.target : "";
}

export async function writeRunTarget(target) {
    const clean = typeof target === "string" ? target.trim() : "";
    if (clean) await writeJson(RUN_PATH, { target: clean, at: new Date().toISOString() });
    return clean;
}
