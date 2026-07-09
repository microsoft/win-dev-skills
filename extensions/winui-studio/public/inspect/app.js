// WinUI Live Visual Tree — canvas web client.
// Talks to the extension's local server: /api/windows, /api/target, /api/inspect,
// /api/property, /api/select, /api/screenshot, /api/state.

const qs = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

const el = {
    picker: qs("#windowPicker"),
    depth: qs("#depth"),
    refresh: qs("#refreshBtn"),
    interactive: qs("#interactiveOnly"),
    status: qs("#status"),
    filter: qs("#filter"),
    tree: qs("#tree"),
    shot: qs("#shot"),
    shotWrap: qs("#shotWrap"),
    shotEmpty: qs("#shotEmpty"),
    shotMeta: qs("#shotMeta"),
    highlight: qs("#highlight"),
    props: qs("#props"),
    propSel: qs("#propSel"),
    actions: qs("#actions"),
};

const state = {
    hwnd: null,
    title: "",
    origin: { x: 0, y: 0 },
    selected: null, // selector string
    rowsBySelector: new Map(),
    selectedNode: null,
    lastTargetNonce: -1,
    lastSelectNonce: -1,
    lastMutateNonce: -1,
    busyTree: false,
    liveProps: { name: null, data: null, filter: "", showAll: false, loading: false },
};

async function api(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) {
        let msg = r.statusText;
        try {
            msg = (await r.json()).error || msg;
        } catch {}
        throw new Error(msg);
    }
    return r.json();
}

function setStatus(text, live = false) {
    el.status.textContent = text;
    el.status.classList.toggle("live", live);
}

// ---- Window picker -------------------------------------------------------

async function loadWindows() {
    try {
        const wins = await api("/api/windows");
        const usable = wins
            .filter((w) => w.width > 40 && w.height > 40 && w.title)
            .sort((a, b) => Number(b.isForeground) - Number(a.isForeground) || b.width * b.height - a.width * a.height);
        el.picker.innerHTML = '<option value="">— pick a window —</option>';
        for (const w of usable) {
            const o = document.createElement("option");
            o.value = String(w.hwnd);
            const proc = w.processName ? ` · ${w.processName}` : "";
            o.textContent = `${w.title}${proc}`;
            if (String(w.hwnd) === String(state.hwnd)) o.selected = true;
            el.picker.appendChild(o);
        }
    } catch (e) {
        setStatus("list-windows failed: " + e.message);
    }
}

async function setTarget(hwnd) {
    if (!hwnd) return;
    try {
        const r = await api(`/api/target?hwnd=${encodeURIComponent(hwnd)}`);
        state.hwnd = r.hwnd;
        state.title = r.title || "";
        state.lastTargetNonce = r.targetNonce;
        state.selected = null;
        state.selectedNode = null;
        await refreshAll();
    } catch (e) {
        setStatus("target failed: " + e.message);
    }
}

// ---- Tree ----------------------------------------------------------------

function elementLabel(node) {
    return node.name && node.name.trim() ? node.name : "";
}

function makeNode(node, depth) {
    const wrap = document.createElement("div");
    wrap.className = "node";

    const row = document.createElement("div");
    row.className = "node-row";
    row.style.paddingLeft = 6 + depth * 14 + "px";
    row.dataset.selector = node.selector || "";

    const kids = Array.isArray(node.children) ? node.children : [];
    const twisty = document.createElement("span");
    twisty.className = "twisty" + (kids.length ? "" : " leaf");
    twisty.textContent = kids.length ? "▾" : "•";
    row.appendChild(twisty);

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = node.type || "?";
    row.appendChild(badge);

    const name = elementLabel(node);
    if (name) {
        const n = document.createElement("span");
        n.className = "node-name";
        n.textContent = " " + name;
        row.appendChild(n);
    }
    if (node.automationId) {
        const id = document.createElement("span");
        id.className = "node-id";
        id.textContent = " " + node.automationId;
        row.appendChild(id);
    }

    // interactive-only + filter dimming hooks
    row._node = node;
    row._invokable = !!node.isInvokable;
    row._search = `${node.type || ""} ${name} ${node.automationId || ""}`.toLowerCase();

    if (node.selector) state.rowsBySelector.set(node.selector, row);

    row.addEventListener("click", (e) => {
        e.stopPropagation();
        selectNode(node, row);
    });

    wrap.appendChild(row);

    if (kids.length) {
        const childBox = document.createElement("div");
        childBox.className = "children";
        for (const c of kids) childBox.appendChild(makeNode(c, depth + 1));
        wrap.appendChild(childBox);
        twisty.addEventListener("click", (e) => {
            e.stopPropagation();
            const collapsed = childBox.classList.toggle("collapsed");
            twisty.textContent = collapsed ? "▸" : "▾";
        });
        // Auto-collapse deeper levels to keep the initial view scannable.
        if (depth >= 2) {
            childBox.classList.add("collapsed");
            twisty.textContent = "▸";
        }
    }
    return wrap;
}

async function refreshTree() {
    if (state.hwnd == null || state.busyTree) return;
    state.busyTree = true;
    try {
        const depth = Number(el.depth.value) || 5;
        const tree = await api(`/api/inspect?hwnd=${state.hwnd}&depth=${depth}`);
        state.origin = tree.origin || { x: 0, y: 0 };
        state.rowsBySelector = new Map();
        el.tree.innerHTML = "";
        const roots = tree.elements || [];
        if (!roots.length) {
            el.tree.innerHTML = '<div class="empty">No elements returned.</div>';
        } else {
            for (const r of roots) el.tree.appendChild(makeNode(r, 0));
        }
        applyFilters();
        // Re-apply any active selection after a rebuild.
        if (state.selected && state.rowsBySelector.has(state.selected)) {
            const row = state.rowsBySelector.get(state.selected);
            markSelectedRow(row);
            positionHighlight(row._node);
        }
    } catch (e) {
        el.tree.innerHTML = `<div class="empty">inspect failed: ${e.message}</div>`;
    } finally {
        state.busyTree = false;
    }
}

function applyFilters() {
    const term = el.filter.value.trim().toLowerCase();
    const interactiveOnly = el.interactive.checked;
    for (const row of el.tree.querySelectorAll(".node-row")) {
        const matchTerm = !term || row._search.includes(term);
        const matchInteractive = !interactiveOnly || row._invokable;
        row.classList.toggle("dim", !(matchTerm && matchInteractive));
    }
}

// ---- Selection -----------------------------------------------------------

function markSelectedRow(row) {
    for (const r of el.tree.querySelectorAll(".node-row.selected")) r.classList.remove("selected");
    if (row) {
        row.classList.add("selected");
        // expand ancestors so the row is visible
        let p = row.parentElement?.parentElement;
        while (p && p.classList) {
            if (p.classList.contains("children") && p.classList.contains("collapsed")) {
                p.classList.remove("collapsed");
                const tw = p.previousElementSibling?.querySelector?.(".twisty");
                if (tw) tw.textContent = "▾";
            }
            p = p.parentElement;
        }
        row.scrollIntoView({ block: "nearest" });
    }
}

async function selectNode(node, row, fromRemote = false) {
    state.selectedNode = node;
    state.selected = node.selector || null;
    markSelectedRow(row);
    positionHighlight(node);

    el.propSel.textContent = node.selector || node.automationId || node.type || "";

    renderActions(node);

    if (!fromRemote && node.selector) {
        fetch(`/api/select?selector=${encodeURIComponent(node.selector)}`, { cache: "no-store" }).catch(() => {});
    }

    if (node.selector) {
        try {
            const data = await api(`/api/property?hwnd=${state.hwnd}&selector=${encodeURIComponent(node.selector)}`);
            renderProps(data.properties || {});
        } catch (e) {
            el.props.innerHTML = `<div class="empty">get-property failed: ${e.message}</div>`;
        }
    } else {
        renderProps(synthProps(node));
    }
}

function synthProps(node) {
    return {
        ControlType: node.type,
        Name: node.name,
        AutomationId: node.automationId ?? null,
        ClassName: node.className ?? null,
        IsEnabled: String(node.isEnabled),
        IsOffscreen: String(node.isOffscreen),
        BoundingRectangle: `${node.x},${node.y},${node.width},${node.height}`,
    };
}

function renderProps(props) {
    el.props.innerHTML = "";
    const keys = Object.keys(props);
    if (!keys.length) {
        el.props.innerHTML = '<div class="empty">No properties.</div>';
        return;
    }
    for (const k of keys) {
        const row = document.createElement("div");
        row.className = "prop-row";
        const key = document.createElement("div");
        key.className = "prop-key";
        key.textContent = k;
        const val = document.createElement("div");
        val.className = "prop-val";
        const v = props[k];
        if (v === null || v === undefined || v === "") {
            val.textContent = "null";
            val.classList.add("null");
        } else {
            val.textContent = String(v);
            if (String(v) === "True") val.classList.add("bool-true");
            else if (String(v) === "False") val.classList.add("bool-false");
        }
        row.appendChild(key);
        row.appendChild(val);
        el.props.appendChild(row);
    }
}

// ---- Live actions (invoke / focus / set-value) --------------------------
// These push UIA mutations straight to the running app via the extension —
// no agent prompt in the loop.

const EDITABLE_TYPES = /(edit|combo|slider|spin|document|textbox)/i;

function canSetValue(node) {
    // ValuePattern-bearing controls only. A plain `Text` label (TextBlock) has
    // no settable value, so we don't offer an editor for it.
    return EDITABLE_TYPES.test(node.type || "") || EDITABLE_TYPES.test(node.className || "");
}

async function runMutation(path, body, btn) {
    if (btn) {
        btn.disabled = true;
        btn.classList.add("busy");
    }
    try {
        const r = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
        const data = await r.json().catch(() => ({}));
        if (!data.ok) {
            setStatus("✗ " + (data.error || r.statusText || "mutation failed"));
        } else {
            setStatus("✓ applied", true);
            await refreshAll();
            if (state.selectedNode) renderActions(state.selectedNode);
        }
    } catch (e) {
        setStatus("mutation error: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove("busy");
        }
    }
}

async function runLiveTweak(name, prop, value, ctl) {
    if (ctl) ctl.classList.add("busy");
    try {
        const r = await fetch("/api/livetweak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, prop, value }),
            cache: "no-store",
        });
        const data = await r.json().catch(() => ({}));
        if (data.ok === false) setStatus("✗ " + (data.error || "tweak failed"));
        else {
            setStatus(`✓ ${prop} = ${value}`, true);
            patchLivePropCache(name, prop, value);
        }
    } catch (e) {
        setStatus("tweak error: " + e.message);
    } finally {
        if (ctl) ctl.classList.remove("busy");
    }
}

// Keep the cached property grid in sync with an applied edit so mutate-driven
// rebuilds show the new value instead of refetching the whole element.
function patchLivePropCache(name, prop, value) {
    const lp = state.liveProps;
    if (lp.name !== name || !lp.data) return;
    const entry = lp.data.find((p) => p.name === prop);
    if (entry) entry.value = String(value);
}

const HEX6 = /^#([0-9a-fA-F]{6})$/;
const HEX8 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{6})$/;
const HEX3 = /^#([0-9a-fA-F]{3})$/;

function toHex6(v) {
    if (typeof v !== "string") return null;
    const s = v.trim();
    let m = HEX6.exec(s);
    if (m) return "#" + m[1];
    m = HEX8.exec(s);
    if (m) return "#" + m[2];
    m = HEX3.exec(s);
    if (m) { const h = m[1]; return "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    return null;
}

// Build the right-hand editor control for one property descriptor.
function makePropEditor(name, p) {
    const fire = (v, ctl) => runLiveTweak(name, p.name, v, ctl);

    if (!p.canWrite) {
        const span = document.createElement("span");
        span.className = "lp-ro";
        span.textContent = p.value === "" ? "—" : p.value;
        return span;
    }

    if (p.kind === "color") {
        const wrap = document.createElement("div");
        wrap.className = "lp-color";
        const sw = document.createElement("input");
        sw.type = "color";
        sw.className = "lp-swatch";
        const hex = toHex6(p.value);
        if (hex) sw.value = hex;
        const tx = document.createElement("input");
        tx.type = "text";
        tx.className = "lp-text lp-hex";
        tx.value = p.value;
        sw.addEventListener("change", () => { tx.value = sw.value; fire(sw.value, sw); });
        tx.addEventListener("change", () => { const h = toHex6(tx.value); if (h) sw.value = h; fire(tx.value, tx); });
        wrap.appendChild(sw);
        wrap.appendChild(tx);
        return wrap;
    }

    if (p.kind === "enum") {
        const sel = document.createElement("select");
        sel.className = "lp-select";
        for (const o of p.options || []) {
            const opt = document.createElement("option");
            opt.value = o;
            opt.textContent = o;
            if (o === p.value) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener("change", () => fire(sel.value, sel));
        return sel;
    }

    if (p.kind === "bool") {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "lp-check";
        cb.checked = p.value === "true";
        cb.addEventListener("change", () => fire(cb.checked ? "true" : "false", cb));
        return cb;
    }

    const inp = document.createElement("input");
    inp.className = "lp-text";
    if (p.kind === "number" && isFinite(Number(p.value))) {
        inp.type = "number";
        inp.step = "any";
    } else {
        inp.type = "text";
    }
    inp.value = p.value;
    if (p.kind === "thickness") inp.placeholder = "l,t,r,b";
    else if (p.kind === "corner") inp.placeholder = "tl,tr,br,bl";
    const commit = () => fire(inp.value, inp);
    inp.addEventListener("change", commit);
    inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
    });
    return inp;
}

function paintLivePropsGrid(grid, toggle) {
    const lp = state.liveProps;
    grid.innerHTML = "";
    if (lp.loading) {
        grid.innerHTML = '<div class="lp-empty">Loading live properties…</div>';
        toggle.hidden = true;
        return;
    }
    if (!lp.data) {
        grid.innerHTML = '<div class="lp-empty">Dev bridge unavailable — run the app in DEBUG.</div>';
        toggle.hidden = true;
        return;
    }
    const q = (lp.filter || "").toLowerCase();
    let rows = lp.data;
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    else if (!lp.showAll) rows = rows.filter((p) => p.common);

    if (!rows.length) {
        grid.innerHTML = '<div class="lp-empty">No matching properties.</div>';
    }
    for (const p of rows) {
        const row = document.createElement("div");
        row.className = "lp-row" + (p.canWrite ? "" : " ro");
        const key = document.createElement("div");
        key.className = "lp-key";
        key.textContent = p.name;
        key.title = `${p.name} : ${p.type}`;
        const val = document.createElement("div");
        val.className = "lp-val";
        val.appendChild(makePropEditor(state.liveProps.name, p));
        row.appendChild(key);
        row.appendChild(val);
        grid.appendChild(row);
    }
    toggle.hidden = !!q || !lp.data.length;
    toggle.textContent = lp.showAll ? "Show common" : `Show all (${lp.data.length})`;
}

async function ensureLiveProps(name, grid, toggle) {
    const lp = state.liveProps;
    if (lp.name === name && lp.data) { paintLivePropsGrid(grid, toggle); return; }
    // New element — reset the view and fetch fresh.
    lp.name = name;
    lp.data = null;
    lp.filter = "";
    lp.showAll = false;
    lp.loading = true;
    paintLivePropsGrid(grid, toggle);
    try {
        const r = await fetch("/api/props", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
            cache: "no-store",
        });
        const d = await r.json().catch(() => ({}));
        lp.loading = false;
        if (state.liveProps.name !== name) return; // selection moved on
        lp.data = d.ok ? d.props || [] : null;
        if (!d.ok && d.error) setStatus("props: " + d.error);
        paintLivePropsGrid(grid, toggle);
    } catch (e) {
        lp.loading = false;
        if (state.liveProps.name === name) { lp.data = null; paintLivePropsGrid(grid, toggle); }
        setStatus("props error: " + e.message);
    }
}

async function renderActions(node) {
    const box = el.actions;
    box.innerHTML = "";
    if (!node || !node.selector || state.hwnd == null) return;
    const sel = node.selector;

    if (node.isInvokable) {
        const b = document.createElement("button");
        b.className = "act-btn primary";
        b.textContent = "⚡ Invoke";
        b.title = "Activate this element in the live app (click / toggle / expand / select)";
        b.addEventListener("click", () => runMutation("/api/invoke", { selector: sel }, b));
        box.appendChild(b);
    }

    const f = document.createElement("button");
    f.className = "act-btn";
    f.textContent = "◎ Focus";
    f.title = "Move keyboard focus to this element";
    f.addEventListener("click", () => runMutation("/api/focus", { selector: sel }, f));
    box.appendChild(f);

    if (canSetValue(node)) {
        const wrap = document.createElement("div");
        wrap.className = "val-editor";
        const input = document.createElement("input");
        input.className = "val-input";
        input.placeholder = "new value…";
        const setb = document.createElement("button");
        setb.className = "act-btn primary";
        setb.textContent = "Set";
        const doSet = () => runMutation("/api/setvalue", { selector: sel, value: input.value }, setb);
        setb.addEventListener("click", doSet);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                doSet();
            }
        });
        wrap.appendChild(input);
        wrap.appendChild(setb);
        box.appendChild(wrap);
        // Prefill with the element's current value without stomping typing.
        api(`/api/value?hwnd=${state.hwnd}&selector=${encodeURIComponent(sel)}`)
            .then((v) => {
                if (v && v.ok && v.text != null && document.activeElement !== input) input.value = String(v.text);
            })
            .catch(() => {});
    }

    // Live properties (Phase B): the full reflected property set from the running
    // app via the in-app dev bridge — every readable prop, editable ones wired to
    // push instantly. Needs an x:Name (AutomationId) to resolve the element.
    const styleName = node.automationId || null;
    if (styleName) {
        const sec = document.createElement("div");
        sec.className = "style-editor";

        const head = document.createElement("div");
        head.className = "style-head";
        head.textContent = "Live properties";
        head.title = "Live values reflected from the running app (requires the app's DEBUG dev bridge). Edits apply instantly.";
        sec.appendChild(head);

        const toolbar = document.createElement("div");
        toolbar.className = "lp-toolbar";
        const filter = document.createElement("input");
        filter.type = "search";
        filter.className = "lp-filter";
        filter.placeholder = "Filter…";
        filter.value = state.liveProps.name === styleName ? state.liveProps.filter : "";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "lp-toggle";
        toolbar.appendChild(filter);
        toolbar.appendChild(toggle);
        sec.appendChild(toolbar);

        const grid = document.createElement("div");
        grid.className = "lp-grid";
        sec.appendChild(grid);

        filter.addEventListener("input", () => {
            state.liveProps.filter = filter.value;
            paintLivePropsGrid(grid, toggle);
        });
        toggle.addEventListener("click", () => {
            state.liveProps.showAll = !state.liveProps.showAll;
            paintLivePropsGrid(grid, toggle);
        });

        const commit = document.createElement("button");
        commit.className = "act-btn commit-btn";
        commit.textContent = "⤓ Commit to XAML";
        commit.title = "Write the applied live edits into the app's XAML source so they survive a rebuild";
        commit.addEventListener("click", async () => {
            commit.classList.add("busy");
            commit.disabled = true;
            try {
                const r = await fetch("/api/commit-style", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: styleName }),
                    cache: "no-store",
                });
                const d = await r.json().catch(() => ({}));
                if (d.ok) setStatus("✓ committed to " + (d.file ? d.file.split(/[\\/]/).pop() : "XAML"), true);
                else setStatus("✗ " + (d.error || "commit failed"));
            } catch (e) {
                setStatus("commit error: " + e.message);
            } finally {
                commit.classList.remove("busy");
                commit.disabled = false;
            }
        });
        sec.appendChild(commit);

        box.appendChild(sec);
        ensureLiveProps(styleName, grid, toggle);
    }
}

// ---- Screenshot + highlight ---------------------------------------------

async function refreshShot() {
    if (state.hwnd == null) return;
    el.shot.hidden = true;
    el.shotEmpty.hidden = false;
    el.shotEmpty.textContent = "Capturing…";
    el.shot.src = `/api/screenshot?hwnd=${state.hwnd}&t=${Date.now()}`;
}

el.shot.addEventListener("load", () => {
    el.shot.hidden = false;
    el.shotEmpty.hidden = true;
    el.shotMeta.textContent = `${el.shot.naturalWidth}×${el.shot.naturalHeight}`;
    if (state.selectedNode) positionHighlight(state.selectedNode);
});
el.shot.addEventListener("error", () => {
    el.shotEmpty.hidden = false;
    el.shotEmpty.textContent = "Screenshot failed.";
});

function positionHighlight(node) {
    const img = el.shot;
    if (img.hidden || !img.naturalWidth || !node) {
        el.highlight.hidden = true;
        return;
    }
    const scale = img.clientWidth / img.naturalWidth;
    const relX = (node.x - state.origin.x) * scale;
    const relY = (node.y - state.origin.y) * scale;
    const w = node.width * scale;
    const h = node.height * scale;
    // img is centered in a padded, scrollable wrap; offset by the img's box.
    const offX = img.offsetLeft;
    const offY = img.offsetTop;
    Object.assign(el.highlight.style, {
        left: offX + relX + "px",
        top: offY + relY + "px",
        width: Math.max(2, w) + "px",
        height: Math.max(2, h) + "px",
    });
    el.highlight.hidden = false;
}

// ---- Refresh + agent-driven state polling --------------------------------

async function refreshAll() {
    setStatus(state.title ? `hwnd ${state.hwnd} · ${state.title}` : `hwnd ${state.hwnd}`, true);
    await Promise.allSettled([refreshTree(), refreshShot()]);
}

async function pollState() {
    try {
        const s = await api("/api/state");
        // Agent changed the target?
        if (s.hwnd != null && s.targetNonce !== state.lastTargetNonce) {
            state.lastTargetNonce = s.targetNonce;
            state.hwnd = s.hwnd;
            state.title = s.title || "";
            for (const o of el.picker.options) o.selected = String(o.value) === String(s.hwnd);
            await refreshAll();
        }
        // Agent selected an element?
        if (s.selectNonce !== state.lastSelectNonce) {
            state.lastSelectNonce = s.selectNonce;
            if (s.selectedSelector && state.rowsBySelector.has(s.selectedSelector)) {
                const row = state.rowsBySelector.get(s.selectedSelector);
                selectNode(row._node, row, true);
            }
        }
        // Agent (or a panel button) mutated the app? Re-read to show the effect.
        if (state.lastMutateNonce === -1) {
            state.lastMutateNonce = s.mutateNonce ?? 0;
        } else if ((s.mutateNonce ?? 0) !== state.lastMutateNonce) {
            state.lastMutateNonce = s.mutateNonce;
            await refreshAll();
            if (state.selectedNode) renderActions(state.selectedNode);
        }
    } catch {
        /* transient */
    }
}

// ---- Wire up -------------------------------------------------------------

el.picker.addEventListener("change", (e) => setTarget(e.target.value));
el.refresh.addEventListener("click", refreshAll);
el.depth.addEventListener("change", refreshTree);
el.interactive.addEventListener("change", applyFilters);
el.filter.addEventListener("input", applyFilters);
window.addEventListener("resize", () => state.selectedNode && positionHighlight(state.selectedNode));

(async function init() {
    await loadWindows();
    // If the extension pre-targeted a window (open input), pick it up now.
    await pollState();
    setInterval(pollState, 1000);
})();
