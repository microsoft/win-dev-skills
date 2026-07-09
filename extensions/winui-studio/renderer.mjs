// renderer.mjs — the WinUI Studio canvas UI.
//
// A Fluent-styled tabbed shell: a left NavigationView-style icon rail (Segoe
// Fluent Icons) + a content area with four tabs. "Scaffold" is the live
// Template Studio wizard (the only wired feature today); Samples / Design /
// Inspect are roadmap panels for the wider WinUI Studio vision.
//
// The server passes only { instanceId, spec }; the catalog + initial command /
// plan are pulled from the sibling modules so the UI and the scaffold plan can
// never drift.

import { CATALOG } from "./catalog.mjs";
import { dotnetCommand, buildPlan } from "./prompt.mjs";

// JSON that is safe to drop inside a <script> tag.
function embed(obj) {
    return JSON.stringify(obj)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

export function renderHtml({ instanceId, spec, view, nav, navSeq }) {
    const boot = {
        instanceId,
        spec,
        catalog: CATALOG,
        command: dotnetCommand(spec),
        plan: buildPlan(spec),
        view: view || null,
        nav: nav || null,
        navSeq: navSeq || 0,
    };

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WinUI Studio</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--background-color-default, #ffffff);
  color: var(--text-color-default, #1f2328);
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: 14px; line-height: 20px;
  -webkit-font-smoothing: antialiased;
}
.ic {
  font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets";
  font-weight: 400; font-style: normal; line-height: 1;
  display: inline-block;
}
.muted { color: var(--text-color-muted, #59636e); font-weight: 400; }
code, .cmd, .plan code { font-family: var(--font-mono, ui-monospace, "Cascadia Code", "Cascadia Mono", Consolas, monospace); }

/* ------------------------------------------------------------------ shell */
.studio { display: flex; height: 100vh; overflow: hidden; }

.rail {
  flex: 0 0 auto; width: 52px; transition: width .16s cubic-bezier(.2,0,0,1);
  display: flex; flex-direction: column; padding: 6px; gap: 2px;
  background: color-mix(in srgb, var(--text-color-default, #1f2328) 3%, var(--background-color-default, #fff));
  border-right: 1px solid var(--border-color-default, #d1d9e0);
}
.studio.expanded .rail { width: 212px; }
.railtab {
  position: relative; display: flex; align-items: center;
  height: 40px; border: none; border-radius: 6px;
  background: transparent; color: inherit; cursor: pointer; font: inherit;
  padding: 0; overflow: hidden; white-space: nowrap; text-align: left;
}
.railtab .ic { width: 40px; flex: 0 0 40px; text-align: center; font-size: 18px; }
.railtab .rlabel { opacity: 0; transition: opacity .12s; font-weight: 500; }
.studio.expanded .railtab .rlabel { opacity: 1; }
.railtab:hover { background: color-mix(in srgb, var(--text-color-default,#1f2328) 6%, transparent); }
.railtab.on { background: color-mix(in srgb, var(--text-color-default,#1f2328) 6%, transparent); }
.railtab.on::before {
  content: ""; position: absolute; left: 3px; top: 50%; transform: translateY(-50%);
  width: 3px; height: 16px; border-radius: 2px; background: var(--true-color-blue, #4493f8);
}
.railtab.expander .ic { font-size: 16px; }
.railtab.expander .rlabel { font-weight: 600; }
.rail .spacer { flex: 1 1 auto; }

/* ---------------------------------------------------------------- content */
.content { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.tabview { flex: 1 1 auto; min-height: 0; display: none; flex-direction: column; }
.tabview.active { display: flex; }
.page-head { padding: 18px 20px 12px; }
.page-head h1 {
  margin: 0; font-size: 24px; font-weight: 600; line-height: 30px; letter-spacing: -.01em;
}
.page-head p { margin: 4px 0 0; color: var(--text-color-muted, #59636e); }
.accent { color: var(--true-color-blue, #4493f8); }
.scroll { flex: 1 1 auto; overflow-y: auto; padding: 8px 20px 16px; }

/* ------------------------------------------------------------------- home */
.home { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.home-hero {
  position: relative; overflow: hidden; text-align: center;
  padding: 44px 24px 200px;
  background:
    radial-gradient(125% 92% at 50% -12%,
      color-mix(in srgb, var(--true-color-blue,#4493f8) 22%, transparent) 0%,
      color-mix(in srgb, #8a6cff 16%, transparent) 36%,
      color-mix(in srgb, #ff6cae 11%, transparent) 64%,
      transparent 86%),
    var(--background-color-default, #fff);
}
.home-hero::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 250px; pointer-events: none;
  background-image: url("/asset/header.png");
  background-size: cover; background-position: center 32%; background-repeat: no-repeat;
  mix-blend-mode: multiply; opacity: .9;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 36%, #000 74%, transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0%, #000 36%, #000 74%, transparent 100%);
}
.home-hero-in { position: relative; z-index: 1; max-width: 560px; margin: 0 auto; }
.home-logo { display: block; margin: 0 auto; width: 76px; height: 76px; filter: drop-shadow(0 6px 16px color-mix(in srgb, var(--true-color-blue,#4493f8) 32%, transparent)); }
.home-title {
  margin: 16px 0 0; font-size: 46px; line-height: 1.04; font-weight: 600; letter-spacing: -.025em;
  color: color-mix(in srgb, var(--text-color-default,#1f2328) 96%, #000);
}
.home-sub {
  margin: 9px auto 0; max-width: 420px; font-size: 14px; line-height: 20px;
  color: color-mix(in srgb, var(--text-color-default,#1f2328) 66%, transparent);
}
.home-body { padding: 6px 20px 24px; }
.home-h2 { margin: 14px 2px 12px; font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--text-color-muted,#59636e); }
.home-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.htile {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 13px;
  text-align: left; font: inherit; color: inherit; cursor: pointer;
  padding: 14px 15px; border-radius: 12px;
  border: 1px solid var(--border-color-default, #d1d9e0);
  background: var(--background-color-default, #fff);
  transition: border-color .13s, box-shadow .13s, transform .13s, background .13s;
}
.htile:hover {
  border-color: color-mix(in srgb, var(--true-color-blue,#4493f8) 55%, var(--border-color-default,#d1d9e0));
  box-shadow: 0 8px 20px -12px color-mix(in srgb, var(--true-color-blue,#4493f8) 70%, transparent);
  transform: translateY(-1px);
}
.htile:focus-visible { outline: 2px solid var(--true-color-blue,#4493f8); outline-offset: 2px; }
.htile-hero {
  grid-column: 1 / -1;
  background: linear-gradient(115deg, color-mix(in srgb, var(--true-color-blue,#4493f8) 9%, var(--background-color-default,#fff)), var(--background-color-default,#fff) 70%);
  border-color: color-mix(in srgb, var(--true-color-blue,#4493f8) 30%, var(--border-color-default,#d1d9e0));
}
.htile-ic {
  width: 42px; height: 42px; border-radius: 10px; flex: none; display: grid; place-items: center;
  color: var(--true-color-blue, #4493f8);
  background: color-mix(in srgb, var(--true-color-blue,#4493f8) 12%, transparent);
}
.htile-ic .ic { font-size: 20px; }
.htile-hero .htile-ic { width: 48px; height: 48px; }
.htile-hero .htile-ic .ic { font-size: 23px; }
.htile-tx { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.htile-nm { font-size: 14px; font-weight: 600; }
.htile-hero .htile-nm { font-size: 16px; }
.htile-bl { font-size: 12px; line-height: 16px; color: var(--text-color-muted, #59636e); }
.htile-go { color: var(--text-color-muted, #59636e); font-size: 14px; opacity: .45; transition: transform .13s, opacity .13s, color .13s; }
.htile:hover .htile-go { color: var(--true-color-blue,#4493f8); opacity: 1; transform: translateX(2px); }

/* ------------------------------------------------------------ empty states */
.empty { max-width: 480px; margin: 7vh auto 0; text-align: center; padding: 0 16px; }
.empty .big { font-size: 46px; color: var(--text-color-muted, #59636e); opacity: .85; }
.empty h2 { margin: 12px 0 2px; font-size: 20px; font-weight: 600; }
.empty > p { margin: 0 0 14px; color: var(--text-color-muted, #59636e); }
.soon {
  display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
  padding: 2px 10px; border-radius: 999px; margin-bottom: 12px;
  color: var(--true-color-blue, #4493f8);
  background: color-mix(in srgb, var(--true-color-blue, #4493f8) 14%, transparent);
}
.soon .ic { font-size: 12px; }
.roadmap { text-align: left; list-style: none; margin: 0; padding: 6px; }
.roadmap li {
  display: flex; align-items: baseline; gap: 8px; margin: 8px 0; padding: 10px 12px;
  border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px;
}
.roadmap .rk { font-weight: 600; }
.roadmap .src { color: var(--text-color-muted, #59636e); font-size: 12px; }
.inspect-host { flex: 1 1 auto; min-height: 0; display: flex; }
#inspectFrame { flex: 1 1 auto; width: 100%; height: 100%; border: 0; display: block; background: var(--card-bg, #fff); }

/* --------------------------------------------------------- wizard controls */
.grp { margin: 0 0 18px; }
.lbl { font-size: 12px; font-weight: 600; color: var(--text-color-muted, #59636e); margin: 0 0 8px; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field > span { font-size: 12px; font-weight: 600; color: var(--text-color-muted, #59636e); }
.field input {
  height: 32px; padding: 0 10px; border-radius: 6px; font: inherit; color: inherit;
  border: 1px solid var(--border-color-default, #d1d9e0);
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 3%, var(--background-color-default,#fff));
}
.field input:focus {
  outline: none; border-color: var(--true-color-blue, #4493f8);
  box-shadow: 0 1px 0 0 var(--true-color-blue, #4493f8);
}
.cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.ptype {
  position: relative;
  display: grid; gap: 7px; text-align: left; cursor: pointer; font: inherit; color: inherit;
  border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px;
  padding: 13px 14px; background: transparent;
  transition: border-color .12s, background .12s, box-shadow .12s;
}
.ptype:hover {
  border-color: color-mix(in srgb, var(--true-color-blue,#4493f8) 45%, var(--border-color-default,#d1d9e0));
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 3%, transparent);
}
.ptype.sel {
  border-color: var(--true-color-blue, #4493f8);
  background: color-mix(in srgb, var(--true-color-blue, #4493f8) 8%, transparent);
  box-shadow: inset 0 0 0 1px var(--true-color-blue, #4493f8);
}
.pt-ic {
  width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center;
  font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 18px; line-height: 1;
  color: var(--true-color-blue, #4493f8);
  background: color-mix(in srgb, var(--true-color-blue, #4493f8) 12%, transparent);
}
.pt-nm { font-weight: 600; display: flex; align-items: center; gap: 8px; }
.pt-bl { color: var(--text-color-muted, #59636e); font-size: 12px; line-height: 1.35; }
.badge {
  font-size: 10px; font-weight: 700; letter-spacing: .02em; color: var(--true-color-blue, #4493f8);
  border: 1px solid currentColor; border-radius: 999px; padding: 1px 6px;
}
.pt-tag {
  justify-self: start;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 11px; color: var(--text-color-muted, #59636e);
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 6%, transparent);
  padding: 2px 7px; border-radius: 5px;
}
.pt-ck {
  position: absolute; top: 11px; right: 12px;
  font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 15px; line-height: 1;
  color: var(--true-color-blue, #4493f8);
  opacity: 0; transform: scale(.8); transition: opacity .1s, transform .1s;
}
.ptype.sel .pt-ck { opacity: 1; transform: scale(1); }
.modes { display: flex; flex-wrap: wrap; gap: 8px; }
.mode {
  font: inherit; color: inherit; cursor: pointer;
  border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 8px;
  padding: 7px 14px; background: transparent;
  transition: border-color .12s, background .12s, box-shadow .12s;
}
.mode:hover {
  border-color: color-mix(in srgb, var(--true-color-blue,#4493f8) 45%, var(--border-color-default,#d1d9e0));
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 3%, transparent);
}
.mode.sel {
  border-color: var(--true-color-blue, #4493f8);
  background: color-mix(in srgb, var(--true-color-blue, #4493f8) 10%, transparent);
  box-shadow: inset 0 0 0 1px var(--true-color-blue, #4493f8);
  color: color-mix(in srgb, var(--true-color-blue,#4493f8) 85%, var(--text-color-default,#1f2328));
}
.seg { display: inline-flex; border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 8px; overflow: hidden; }
.seg button {
  border: none; background: transparent; color: inherit; font: inherit; cursor: pointer;
  padding: 6px 14px; border-right: 1px solid var(--border-color-default, #d1d9e0);
}
.seg button:last-child { border-right: none; }
.seg button:hover { background: color-mix(in srgb, var(--text-color-default,#1f2328) 5%, transparent); }
.seg button.sel { background: var(--true-color-blue, #4493f8); color: #fff; }
.optgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
.optrow {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 11px;
  text-align: left; font: inherit; color: inherit; cursor: pointer;
  border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 10px;
  padding: 9px 11px; background: transparent;
  transition: border-color .12s, background .12s;
}
.optrow:hover {
  border-color: color-mix(in srgb, var(--true-color-blue,#4493f8) 45%, var(--border-color-default,#d1d9e0));
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 3%, transparent);
}
.optrow.sel {
  border-color: var(--true-color-blue, #4493f8);
  background: color-mix(in srgb, var(--true-color-blue, #4493f8) 8%, transparent);
}
.opt-ic {
  width: 30px; height: 30px; border-radius: 7px; display: grid; place-items: center;
  font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 15px; line-height: 1;
  color: var(--text-color-muted, #59636e);
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 6%, transparent);
}
.optrow.sel .opt-ic {
  color: var(--true-color-blue, #4493f8);
  background: color-mix(in srgb, var(--true-color-blue, #4493f8) 14%, transparent);
}
.opt-tx { display: flex; flex-direction: column; min-width: 0; }
.opt-nm { font-weight: 600; font-size: 13px; }
.opt-bl { color: var(--text-color-muted, #59636e); font-size: 11.5px; line-height: 1.3; margin-top: 1px; }
.opt-ck {
  font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 15px; color: var(--true-color-blue, #4493f8);
  opacity: 0; transform: scale(.8); transition: opacity .1s, transform .1s;
}
.optrow.sel .opt-ck { opacity: 1; transform: scale(1); }
.lbl-count { color: var(--true-color-blue, #4493f8); font-weight: 600; }
.plan { margin: 0; padding-left: 20px; }
.plan li { margin: 5px 0; }
.plan code {
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 8%, transparent);
  padding: 1px 5px; border-radius: 4px; font-size: 12px;
}
.loc { color: var(--text-color-muted, #59636e); font-size: 12px; margin: 12px 0 0; }
.loc code { background: color-mix(in srgb, var(--text-color-default,#1f2328) 8%, transparent); padding: 1px 5px; border-radius: 4px; }

/* footer / hand-off bar */
footer.bar {
  display: flex; align-items: center; gap: 12px; padding: 10px 20px;
  border-top: 1px solid var(--border-color-default, #d1d9e0);
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 2%, var(--background-color-default,#fff));
}
.cmd { font-size: 12px; color: var(--text-color-muted, #59636e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 48%; }
.barspace { flex: 1 1 auto; }
.status { font-size: 12px; color: var(--text-color-muted, #59636e); }
button.primary {
  display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 16px;
  border-radius: 6px; border: 1px solid var(--true-color-blue, #4493f8);
  background: var(--true-color-blue, #4493f8); color: #fff; font: inherit; font-weight: 600; cursor: pointer;
}
button.primary:hover { filter: brightness(1.06); }
button.primary:disabled { opacity: .6; cursor: default; }
button.primary .ic { font-size: 15px; }

/* --------------------------------------------------------- samples browser */
.samples { flex: 1 1 auto; min-height: 0; display: flex; }
.slist {
  flex: 0 0 300px; display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--border-color-default, #d1d9e0);
}
.sfilter {
  padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
  border-bottom: 1px solid var(--border-color-default, #d1d9e0);
}
.sfilter input, .sfilter select {
  height: 32px; padding: 0 10px; border-radius: 6px; font: inherit; color: inherit;
  border: 1px solid var(--border-color-default, #d1d9e0);
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 3%, var(--background-color-default,#fff));
}
.sfilter input:focus, .sfilter select:focus { outline: none; border-color: var(--true-color-blue, #4493f8); }
.scount { color: var(--text-color-muted, #59636e); font-size: 11px; padding: 2px; }
.sitems { flex: 1 1 auto; overflow-y: auto; padding: 4px 10px 16px; }
.sgroup { margin-top: 12px; }
.sgroup:first-child { margin-top: 4px; }
.sgrouphead {
  position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px;
  padding: 7px 2px 9px; background: var(--background-color-default, #fff);
}
.sgrouphead .gi { font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 14px; line-height: 1; }
.sgrouphead .gt { font-weight: 600; font-size: 12px; letter-spacing: .01em; }
.sgrouphead .gc {
  color: var(--text-color-muted, #59636e); font-size: 10px; font-weight: 600;
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 8%, transparent);
  border-radius: 999px; padding: 1px 7px; margin-left: 2px;
}
.sgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 8px; }
.scard {
  display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-height: 84px;
  text-align: left; font: inherit; color: inherit; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--text-color-default,#1f2328) 9%, transparent);
  border-radius: 8px; padding: 12px 12px 13px;
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 2.5%, var(--background-color-default,#fff));
  transition: background .13s ease, border-color .13s ease, transform .13s ease, box-shadow .13s ease;
}
.scard:hover {
  background: color-mix(in srgb, var(--ci, #4493f8) 8%, var(--background-color-default,#fff));
  border-color: color-mix(in srgb, var(--ci,#4493f8) 45%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--text-color-default,#1f2328) 12%, transparent);
}
.scard.sel {
  border-color: var(--ci, #4493f8);
  background: color-mix(in srgb, var(--ci,#4493f8) 13%, var(--background-color-default,#fff));
}
.scard .sicon {
  width: 36px; height: 36px; border-radius: 9px; display: flex; align-items: center; justify-content: center;
  font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 18px; line-height: 1;
  color: var(--ci, #4493f8); background: color-mix(in srgb, var(--ci, #4493f8) 15%, transparent);
}
.scard .st {
  font-weight: 600; font-size: 13px; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.spreview { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.sphead { padding: 16px 20px 12px; border-bottom: 1px solid var(--border-color-default, #d1d9e0); }
.sphead h2 { margin: 0; font-size: 20px; font-weight: 600; }
.sphead p { margin: 4px 0 0; color: var(--text-color-muted, #59636e); }
.spmeta { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.chipcat { font-size: 11px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--border-color-default, #d1d9e0); color: var(--text-color-muted, #59636e); }
.dlink { color: var(--true-color-blue, #4493f8); text-decoration: none; font-size: 12px; }
.dlink:hover { text-decoration: underline; }
.ftabs { display: flex; gap: 4px; padding: 8px 12px 0; }
.ftab {
  border: none; background: transparent; color: var(--text-color-muted, #59636e); font: inherit; font-size: 12px;
  font-weight: 600; padding: 6px 10px; border-radius: 6px 6px 0 0; cursor: pointer;
}
.ftab.on { color: inherit; background: color-mix(in srgb, var(--text-color-default,#1f2328) 6%, transparent); }
.spbody { flex: 1 1 auto; min-height: 0; overflow: auto; }
pre.code {
  margin: 0; padding: 12px 16px; font-family: var(--font-mono, ui-monospace, "Cascadia Code", Consolas, monospace);
  font-size: 12px; line-height: 1.55; white-space: pre; tab-size: 2;
}
.spfoot {
  padding: 10px 16px; display: flex; align-items: center; gap: 10px;
  border-top: 1px solid var(--border-color-default, #d1d9e0);
}
.spempty { margin: auto; text-align: center; color: var(--text-color-muted, #59636e); padding: 40px 24px; }
.spback {
  display: none; align-items: center; gap: 6px; margin-bottom: 10px;
  border: none; background: transparent; color: var(--text-color-muted, #59636e);
  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 2px;
}
.spback:hover { color: inherit; }
.spback .ic { font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 13px; }

/* Narrow side panels: master/detail — show the list OR the preview, not both.
   The preview only appears once a sample is picked, freeing the full height. */
@media (max-width: 720px) {
  .samples { flex-direction: column; }
  .slist { flex: 1 1 auto; border-right: none; }
  .spreview { display: none; }
  .samples.has-selection .slist { display: none; }
  .samples.has-selection .spreview { display: flex; flex: 1 1 auto; }
  .spback { display: inline-flex; }
}

/* ------------------------------------------------------------ design system */
.design { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; position: relative; }
.dswitch { display: flex; align-items: center; gap: 0; padding: 4px 20px 10px; }
.dseg {
  border: none; background: transparent; color: var(--text-color-muted, #59636e);
  font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  padding: 6px 2px; margin-right: 18px; position: relative;
}
.dseg:hover { color: inherit; }
.dseg.on { color: inherit; }
.dseg.on::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 2px;
  border-radius: 2px; background: var(--true-color-blue, #4493f8);
}
.dtheme { display: inline-flex; margin-left: auto; border: 1px solid var(--border-color-default, #d1d9e0); border-radius: 8px; overflow: hidden; }
.dtheme[hidden], .dselbar[hidden] { display: none; }
.dtb { border: none; background: transparent; color: var(--text-color-muted, #59636e); font: inherit; font-size: 12px; font-weight: 600; padding: 5px 12px; cursor: pointer; }
.dtb + .dtb { border-left: 1px solid var(--border-color-default, #d1d9e0); }
.dtb.on { background: var(--true-color-blue, #4493f8); color: #fff; }
.dbody { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 20px 16px; }
.dpanel { display: none; }
.dpanel.on { display: block; }
.dhint { color: var(--text-color-muted, #59636e); font-size: 12px; margin: 0 0 12px; }

/* type ramp */
.dtrow {
  display: flex; align-items: center; gap: 16px; padding: 12px 8px; border-radius: 8px; cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--text-color-default,#1f2328) 8%, transparent);
}
.dtrow:hover { background: color-mix(in srgb, var(--true-color-blue,#4493f8) 6%, transparent); }
.dtrow.sel { background: color-mix(in srgb, var(--true-color-blue,#4493f8) 12%, transparent); }
.dtsample { flex: 1 1 auto; min-width: 0; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dtmeta { flex: 0 0 auto; text-align: right; }
.dtname { font-weight: 600; font-size: 13px; }
.dtsub { color: var(--text-color-muted, #59636e); font-size: 11px; font-family: var(--font-mono, ui-monospace, Consolas, monospace); margin-top: 2px; }

/* theme brushes */
.dcolorwrap { --dbase: #F3F3F3; }
.dcolorwrap[data-theme="dark"] { --dbase: #202020; }
.dgroup { margin-top: 18px; }
.dgroup:first-child { margin-top: 2px; }
.dgrouphead { font-weight: 600; font-size: 12px; letter-spacing: .01em; margin: 0 0 8px; color: var(--text-color-muted, #59636e); }
.dswlist { display: flex; flex-direction: column; gap: 6px; }
.dswatch {
  display: flex; flex-direction: row; align-items: center; gap: 12px; width: 100%; text-align: left; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--text-color-default,#1f2328) 9%, transparent);
  border-radius: 8px; padding: 8px 10px; font: inherit; color: inherit;
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 2.5%, var(--background-color-default,#fff));
  --dcol: var(--l);
}
.dcolorwrap[data-theme="dark"] .dswatch { --dcol: var(--d); }
.dswatch:hover { border-color: color-mix(in srgb, var(--true-color-blue,#4493f8) 45%, transparent); }
.dswatch.sel { border-color: var(--true-color-blue,#4493f8); background: color-mix(in srgb, var(--true-color-blue,#4493f8) 10%, var(--background-color-default,#fff)); }
.dchip {
  flex: none; width: 44px; height: 44px; border-radius: 6px; background-color: var(--dbase);
  background-image: linear-gradient(var(--dcol), var(--dcol));
  box-shadow: inset 0 0 0 1px rgba(128,128,128,.25);
}
.dchip.stroke { background-image: none; border: 2px solid var(--dcol); box-shadow: none; }
.dchip.transparent {
  background-image: repeating-linear-gradient(45deg, transparent 0, transparent 5px, color-mix(in srgb, var(--text-color-default,#1f2328) 20%, transparent) 5px, color-mix(in srgb, var(--text-color-default,#1f2328) 20%, transparent) 6px);
}
.dswtext { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.dswname { font-family: var(--font-mono, ui-monospace, Consolas, monospace); font-size: 12px; line-height: 1.3; word-break: break-word; color: var(--text-color-default,#1f2328); }
.dswuse { font-size: 11px; line-height: 1.35; color: var(--text-color-muted,#59636e); }
.dswtag { font-size: 10px; color: var(--text-color-muted,#59636e); font-style: italic; margin-top: 1px; }

/* icon picker */
.dsearchrow { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.dsearch {
  flex: 1 1 auto; height: 32px; padding: 0 10px; border-radius: 6px; font: inherit; color: inherit;
  border: 1px solid var(--border-color-default,#d1d9e0);
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 3%, var(--background-color-default,#fff));
}
.dsearch:focus { outline: none; border-color: var(--true-color-blue,#4493f8); }
.diconcount { color: var(--text-color-muted,#59636e); font-size: 11px; white-space: nowrap; }
.dicongrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; }
.dicon {
  display: flex; flex-direction: column; align-items: center; gap: 7px; cursor: pointer;
  border: 1px solid transparent; border-radius: 8px; padding: 10px 6px; font: inherit; color: inherit;
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 2.5%, var(--background-color-default,#fff));
}
.dicon:hover { border-color: color-mix(in srgb, var(--true-color-blue,#4493f8) 45%, transparent); }
.dicon.sel { border-color: var(--true-color-blue,#4493f8); background: color-mix(in srgb, var(--true-color-blue,#4493f8) 10%, var(--background-color-default,#fff)); }
.dicon .g { font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 24px; line-height: 1; }
.dicon .n { font-size: 10px; line-height: 1.2; width: 100%; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color-muted,#59636e); }

/* selection bar + toast */
.dselbar {
  flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 10px 20px;
  border-top: 1px solid var(--border-color-default,#d1d9e0);
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 2%, var(--background-color-default,#fff));
}
.dselprev {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets"; font-size: 18px;
  border: 1px solid color-mix(in srgb, var(--text-color-default,#1f2328) 12%, transparent);
}
.dseltext { flex: 1 1 auto; min-width: 0; }
.dseltitle { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dselcode { display: block; font-family: var(--font-mono, ui-monospace, Consolas, monospace); font-size: 11px; color: var(--text-color-muted,#59636e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button.ghost {
  border: 1px solid var(--border-color-default,#d1d9e0); background: transparent; color: inherit;
  font: inherit; font-weight: 600; font-size: 12px; height: 32px; padding: 0 12px; border-radius: 6px; cursor: pointer;
}
button.ghost:hover { background: color-mix(in srgb, var(--text-color-default,#1f2328) 5%, transparent); }
.dtoast {
  position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%) translateY(8px);
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 88%, var(--background-color-default,#fff));
  color: var(--background-color-default,#fff);
  padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
  opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; z-index: 20;
}
.dtoast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ---- Review / Scorecard tab ---- */
.review { display: flex; flex-direction: column; height: 100%; position: relative; }
.rvtarget { display: flex; gap: 8px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--border-color-default,#d1d9e0); }
.rvtarget > .ic { color: var(--text-color-muted,#59636e); font-size: 16px; }
.rvtarget input { flex: 1; height: 32px; padding: 0 10px; border: 1px solid var(--border-color-default,#d1d9e0); border-radius: 6px; background: var(--background-color-default,#fff); color: inherit; font: inherit; font-size: 13px; }
.rvbody { flex: 1; overflow: auto; padding: 16px 20px 24px; }
.rvhint { display: flex; align-items: center; gap: 7px; padding: 8px 20px; font-size: 12px; color: var(--text-color-muted,#59636e);
  border-bottom: 1px solid var(--border-color-muted,#e8ebef); background: color-mix(in srgb, var(--accent-color,#0969da) 5%, transparent); }
.rvhint[hidden] { display: none; }
.rvhint .ic { font-size: 13px; color: var(--accent-color,#0969da); }
.rvhint b { font-weight: 600; color: var(--text-color-default,#1f2328); }
.rvhint a { color: var(--accent-color,#0969da); cursor: pointer; text-decoration: none; margin-left: auto; white-space: nowrap; }
.rvhint a:hover { text-decoration: underline; }
.rvscore { display: flex; align-items: center; gap: 20px; padding: 6px 2px 18px; }
.rvring { --p: 0; --rvc: #4493f8; --track: color-mix(in srgb, var(--text-color-default,#1f2328) 12%, transparent);
  width: 92px; height: 92px; border-radius: 50%; flex: none;
  background: conic-gradient(var(--rvc) calc(var(--p) * 3.6deg), var(--track) 0); display: grid; place-items: center; }
.rvring i { width: 70px; height: 70px; border-radius: 50%; background: var(--background-color-default,#fff);
  display: flex; flex-direction: column; align-items: center; justify-content: center; font-style: normal; }
.rvring b { font-size: 25px; font-weight: 700; line-height: 1; }
.rvring s { text-decoration: none; font-size: 10px; color: var(--text-color-muted,#59636e); margin-top: 1px; }
.rvmeta { flex: 1; min-width: 0; }
.rvmeta h2 { margin: 0 0 3px; font-size: 17px; font-weight: 600; }
.rvmeta .sub { margin: 0; color: var(--text-color-muted,#59636e); font-size: 12px; }
.rvactions { display: flex; gap: 8px; margin-top: 11px; }
.rvcats { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
.rvcat { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border-color-default,#d1d9e0); border-radius: 999px; padding: 4px 11px 4px 9px; font-size: 12px; }
.rvcat .ic { font-size: 13px; color: var(--text-color-muted,#59636e); }
.rvcat b { font-weight: 600; }
.rvcat em { font-style: normal; color: var(--text-color-muted,#59636e); }
.rvcat.zero { opacity: .45; }
.rvgroup { margin-bottom: 18px; }
.rvghead { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
.rvghead .ic { font-size: 14px; color: var(--text-color-muted,#59636e); }
.rvghead h3 { margin: 0; font-size: 13px; font-weight: 600; }
.rvghead .cnt { color: var(--text-color-muted,#59636e); font-size: 12px; }
.rvghead .fixall { margin-left: auto; }
.rvfind { border: 1px solid var(--border-color-default,#d1d9e0); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.rvfind .top { display: flex; align-items: flex-start; gap: 9px; }
.rvdot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; }
.rvdot.error { background: var(--true-color-red,#cf222e); }
.rvdot.warning { background: var(--true-color-orange,#bc4c00); }
.rvdot.note { background: var(--true-color-blue,#4493f8); }
.rvft { flex: 1; min-width: 0; }
.rvftitle { font-weight: 600; font-size: 13px; }
.rvfloc { font-family: var(--font-mono,ui-monospace,Consolas,monospace); font-size: 11px; color: var(--text-color-muted,#59636e); margin-top: 1px; }
.rvfref { text-transform: uppercase; letter-spacing: .03em; font-size: 10px; }
.rvfwhy { margin: 5px 0 0; font-size: 12px; color: var(--text-color-muted,#59636e); }
.rvfsnip { display: block; margin-top: 6px; font-family: var(--font-mono,ui-monospace,Consolas,monospace); font-size: 11px;
  background: color-mix(in srgb, var(--text-color-default,#1f2328) 5%, transparent); padding: 5px 8px; border-radius: 5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rvfix { flex: none; align-self: flex-start; }
button.mini { border: 1px solid var(--border-color-default,#d1d9e0); background: transparent; color: inherit; font: inherit; font-weight: 600; font-size: 11px; height: 26px; padding: 0 11px; border-radius: 6px; cursor: pointer; }
button.mini:hover { background: color-mix(in srgb, var(--text-color-default,#1f2328) 6%, transparent); }
.rvclean { text-align: center; padding: 26px 16px 8px; }
.rvclean .big { font-size: 38px; color: var(--true-color-green,#1a7f37); }
.rvclean h3 { margin: 6px 0 2px; font-size: 15px; font-weight: 600; }
.rvclean p { margin: 0; color: var(--text-color-muted,#59636e); font-size: 12px; }
</style>
</head>
<body>
<div class="studio" id="studio">
  <nav class="rail" aria-label="WinUI Studio sections">
    <button class="railtab expander" id="expander" type="button" aria-label="Toggle navigation">
      <span class="ic">&#xE700;</span><span class="rlabel">WinUI Studio</span>
    </button>
    <div style="height:6px"></div>
    <button class="railtab on" data-tab="home" type="button" aria-label="Home"><span class="ic">&#xE80F;</span><span class="rlabel">Home</span></button>
    <button class="railtab" data-tab="inspect" type="button" aria-label="Inspect"><span class="ic">&#xEC7A;</span><span class="rlabel">Inspect</span></button>
    <button class="railtab" data-tab="review" type="button" aria-label="Review"><span class="ic">&#xE9D9;</span><span class="rlabel">Review</span></button>
    <div class="spacer"></div>
    <button class="railtab" data-tab="samples" type="button" aria-label="Samples"><span class="ic">&#xE8F1;</span><span class="rlabel">Samples</span></button>
    <button class="railtab" data-tab="design" type="button" aria-label="Design"><span class="ic">&#xEB3C;</span><span class="rlabel">Design</span></button>
  </nav>

  <div class="content">

    <!-- ========================================================= Home ==== -->
    <section class="tabview active" data-view="home">
      <div class="home">
        <div class="home-hero">
          <div class="home-hero-in">
            <img class="home-logo" src="/asset/winui-logo.svg" alt="WinUI logo" width="76" height="76">
            <h1 class="home-title">WinUI Studio</h1>
            <p class="home-sub">Your Fluent workbench for building Windows apps.</p>
          </div>
        </div>
        <div class="home-body">
          <h2 class="home-h2">Jump in</h2>
          <div class="home-tiles">
            <button class="htile htile-hero" type="button" data-tab="scaffold" aria-label="Scaffold a new app">
              <span class="htile-ic"><span class="ic">&#xE78B;</span></span>
              <span class="htile-tx">
                <span class="htile-nm">Scaffold a new app</span>
                <span class="htile-bl">Configure project type, pages &amp; features, then hand it to the agent to build &amp; run.</span>
              </span>
              <span class="htile-go ic">&#xE76C;</span>
            </button>
            <button class="htile" type="button" data-tab="samples" aria-label="Browse samples">
              <span class="htile-ic"><span class="ic">&#xE8F1;</span></span>
              <span class="htile-tx">
                <span class="htile-nm">Browse samples</span>
                <span class="htile-bl">WinUI Gallery &amp; Windows App SDK samples by topic — preview real XAML &amp; C#.</span>
              </span>
              <span class="htile-go ic">&#xE76C;</span>
            </button>
            <button class="htile" type="button" data-tab="design" aria-label="Design system">
              <span class="htile-ic"><span class="ic">&#xEB3C;</span></span>
              <span class="htile-tx">
                <span class="htile-nm">Design system</span>
                <span class="htile-bl">Fluent typography, colors &amp; icons — copy the token or use it in your app.</span>
              </span>
              <span class="htile-go ic">&#xE76C;</span>
            </button>
            <button class="htile" type="button" data-tab="review" aria-label="Review and score app">
              <span class="htile-ic"><span class="ic">&#xE9D9;</span></span>
              <span class="htile-tx">
                <span class="htile-nm">Review &amp; score</span>
                <span class="htile-bl">Grade your app against the WinUI design &amp; code-review skills, and fix in a click.</span>
              </span>
              <span class="htile-go ic">&#xE76C;</span>
            </button>
            <button class="htile" type="button" data-tab="inspect" aria-label="Live inspect app">
              <span class="htile-ic"><span class="ic">&#xEC7A;</span></span>
              <span class="htile-tx">
                <span class="htile-nm">Live inspect</span>
                <span class="htile-bl">Attach to your running app and walk its live visual tree.</span>
              </span>
              <span class="htile-go ic">&#xE76C;</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================================================== Scaffold ==== -->
    <section class="tabview" data-view="scaffold">
      <div class="page-head">
        <h1>New project</h1>
        <p>Pick a template, then hand it to the <b>winui-dev</b> agent to scaffold, build &amp; run.</p>
      </div>
      <div class="scroll">
        <div class="grp">
          <div class="row2">
            <label class="field"><span>App name</span>
              <input id="appName" type="text" autocomplete="off" spellcheck="false" aria-label="App name"></label>
            <label class="field"><span>Root namespace</span>
              <input id="namespace" type="text" autocomplete="off" spellcheck="false" aria-label="Root namespace"></label>
          </div>
        </div>
        <div class="grp">
          <h3 class="lbl">Language</h3>
          <div id="language" class="modes" role="radiogroup" aria-label="Language"></div>
        </div>
        <div class="grp">
          <h3 class="lbl">Packaging</h3>
          <div id="packaging" class="modes" role="radiogroup" aria-label="Packaging"></div>
        </div>
        <div class="grp">
          <h3 class="lbl">UI</h3>
          <div id="projectTypes" class="cards" role="radiogroup" aria-label="UI template"></div>
        </div>
        <div class="grp">
          <h3 class="lbl">Features <span id="featuresCount" class="lbl-count"></span></h3>
          <div id="features" class="optgrid" aria-label="Features"></div>
        </div>
        <div class="grp">
          <h3 class="lbl">Scaffold plan</h3>
          <ol id="planSteps" class="plan"></ol>
          <p id="loc" class="loc"></p>
        </div>
      </div>
      <footer class="bar">
        <code id="cmd" class="cmd"></code>
        <span class="barspace"></span>
        <span id="status" class="status"></span>
        <button id="generate" class="primary" type="button" aria-label="Generate app"><span class="ic">&#xE724;</span> Generate app</button>
      </footer>
    </section>

    <!-- ====================================================== Samples ==== -->
    <section class="tabview" data-view="samples">
      <div class="page-head"><h1>Samples</h1><p>Browse WinUI Gallery &amp; Windows App SDK samples by topic, preview the real XAML &amp; C#, then hand one to the winui-dev agent.</p></div>
      <div class="samples">
        <aside class="slist">
          <div class="sfilter">
            <input id="sampleSearch" type="text" autocomplete="off" spellcheck="false" placeholder="Search controls…" aria-label="Search samples">
            <select id="sampleCat" aria-label="Filter by category"><option value="">All categories</option></select>
            <div id="sampleCount" class="scount"></div>
          </div>
          <div id="sampleItems" class="sitems"><div class="spempty">Loading…</div></div>
        </aside>
        <div class="spreview" id="samplePreview">
          <div class="spempty">Select a control to preview its XAML &amp; C#.</div>
        </div>
      </div>
    </section>

    <!-- ======================================================= Design ==== -->
    <section class="tabview" data-view="design">
      <div class="page-head"><h1>Design</h1><p>Pick typography, colors and icons the Fluent way — copy the token or hand it to the agent.</p></div>
      <div class="design" id="design">
        <div class="dswitch">
          <button class="dseg on" type="button" data-section="type" aria-label="Typography">Type</button>
          <button class="dseg" type="button" data-section="color" aria-label="Colors">Color</button>
          <button class="dseg" type="button" data-section="icons" aria-label="Icons">Icons</button>
          <div class="dtheme" id="dtheme" hidden>
            <button class="dtb on" type="button" data-theme="light">Light</button>
            <button class="dtb" type="button" data-theme="dark">Dark</button>
          </div>
        </div>
        <div class="dbody" id="dbody">
          <div class="dpanel on" data-sec="type" id="dpanelType"><div class="spempty">Loading…</div></div>
          <div class="dpanel" data-sec="color" id="dpanelColor"></div>
          <div class="dpanel" data-sec="icons" id="dpanelIcons"></div>
        </div>
        <div class="dselbar" id="dselbar" hidden>
          <span class="dselprev" id="dselPrev"></span>
          <div class="dseltext">
            <div class="dseltitle" id="dselTitle"></div>
            <code class="dselcode" id="dselCode"></code>
          </div>
          <button class="ghost" type="button" id="dselCopy" aria-label="Copy token">Copy</button>
          <button class="primary" type="button" id="dselUse" aria-label="Use in app"><span class="ic">&#xE724;</span> Use in app</button>
        </div>
        <div class="dtoast" id="dtoast" role="status" aria-live="polite"></div>
      </div>
    </section>

    <!-- ====================================================== Review ===== -->
    <section class="tabview" data-view="review">
      <div class="page-head"><h1>Review</h1><p>A static scorecard grounded in the <b>winui-design</b> &amp; <b>winui-code-review</b> skills. Fix issues with one click, or hand the app to the agent for a deep review.</p></div>
      <div class="review" id="review">
        <div class="rvtarget">
          <span class="ic">&#xE8B7;</span>
          <input id="rvPath" type="text" autocomplete="off" spellcheck="false" placeholder="Path to your WinUI project folder…" aria-label="Project folder">
          <button id="rvScan" class="primary" type="button" aria-label="Scan project"><span class="ic">&#xE721;</span> Scan</button>
        </div>
        <div class="rvhint" id="rvHint" hidden></div>
        <div class="rvbody" id="rvBody">
          <div class="spempty">Enter your WinUI project folder and hit <b>Scan</b> — or ask Copilot to review the app it just built.</div>
        </div>
        <div class="dtoast" id="rvToast" role="status" aria-live="polite"></div>
      </div>
    </section>

    <!-- ====================================================== Inspect ==== -->
    <section class="tabview" data-view="inspect">
      <div class="page-head"><h1>Inspect</h1><p id="inFrameHint">Attach to your running WinUI app and walk its live visual tree.</p></div>
      <div class="inspect-host">
        <iframe id="inspectFrame" title="Live Visual Tree" src="about:blank"></iframe>
      </div>
    </section>

  </div>
</div>

<script>const BOOT = ${embed(boot)};</script>
<script>
/* Client-side error beacon: surface iframe JS errors in the extension log,
   since they are otherwise invisible to the agent. */
window.__clog = function (msg, level) {
  try {
    fetch("/client-log", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ msg: String(msg), level: level || "info" })
    });
  } catch (e) {}
};
window.addEventListener("error", function (e) {
  window.__clog("JS error: " + (e && e.message) + " @ " + (e && e.filename) + ":" + (e && e.lineno), "error");
});
window.addEventListener("unhandledrejection", function (e) {
  var r = e && e.reason; window.__clog("unhandledrejection: " + ((r && r.message) || r), "error");
});
</script>
<script>
/* shell navigation: rail tabs + collapse/expand */
(function () {
  var studio = document.getElementById("studio");
  var views = studio.querySelectorAll(".tabview");
  function activate(name) {
    var tabs = studio.querySelectorAll(".railtab[data-tab]");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("on", tabs[i].getAttribute("data-tab") === name);
    }
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle("active", views[j].getAttribute("data-view") === name);
    }
    if (name === "samples" && window.__samplesInit) window.__samplesInit();
    if (name === "design" && window.__designInit) window.__designInit();
    if (name === "review" && window.__reviewInit) window.__reviewInit();
    if (name === "inspect" && window.__inspectInit) window.__inspectInit();
  }
  // Agent-drivable navigation: switch tab, and (for Samples/Design/Review) apply opts.
  window.__nav = function (view, opts) {
    if (!view) return;
    activate(view);
    if (view === "samples" && window.__samplesApply) window.__samplesApply(opts || {});
    if (view === "design" && window.__designApply) window.__designApply(opts || {});
    if (view === "review" && window.__reviewApply) window.__reviewApply(opts || {});
    if (view === "inspect" && window.__inspectApply) window.__inspectApply(opts || {});
  };
  var tabs = studio.querySelectorAll(".railtab[data-tab]");
  for (var k = 0; k < tabs.length; k++) {
    (function (btn) {
      btn.addEventListener("click", function () { activate(btn.getAttribute("data-tab")); });
    })(tabs[k]);
  }
  var tiles = studio.querySelectorAll(".htile[data-tab]");
  for (var m = 0; m < tiles.length; m++) {
    (function (btn) {
      btn.addEventListener("click", function () { activate(btn.getAttribute("data-tab")); });
    })(tiles[m]);
  }
  document.getElementById("expander").addEventListener("click", function () {
    studio.classList.toggle("expanded");
  });
  // Deep-link the initial view once every tab IIFE below has registered its globals.
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof BOOT !== "undefined" && BOOT && BOOT.view) window.__nav(BOOT.view, BOOT.nav || {});
  });
  // Live navigation fallback: this host doesn't hold an EventSource open, so poll
  // for agent-driven navigate() calls with plain fetch (which works here). We start
  // caught-up to BOOT.navSeq so a fresh panel only reacts to *future* navigations.
  var navSeen = (typeof BOOT !== "undefined" && BOOT && BOOT.navSeq) || 0;
  setInterval(function () {
    fetch("/nav-poll?seq=" + navSeen)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || typeof d.seq !== "number" || d.seq <= navSeen) return;
        navSeen = d.seq;
        if (d.nav && d.nav.view) window.__nav(d.nav.view, d.nav);
      })
      .catch(function () {});
  }, 1200);
})();
</script>
<script>
/* Scaffold wizard */
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function mdInline(s) {
    return esc(s)
      .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
      .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
  }

  var cat = BOOT.catalog;
  var state = JSON.parse(JSON.stringify(BOOT.spec));
  state.features = state.features || [];
  state.language = state.language || "winui";
  state.packaging = state.packaging || "packaged";

  var lastSent = null;
  var appEl = $("appName"), nsEl = $("namespace");
  appEl.value = state.appName;
  nsEl.value = state.namespace;
  var syncNs = (state.namespace === state.appName);

  var debounce = null;
  function onChange() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(pushState, 250);
  }

  function glyph(hex) {
    try { return hex ? String.fromCodePoint(parseInt(hex, 16)) : ""; } catch (e) { return ""; }
  }

  function renderProjectTypes() {
    var host = $("projectTypes"); host.innerHTML = "";
    cat.PROJECT_TYPES.forEach(function (t) {
      var on = state.projectType === t.id;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ptype" + (on ? " sel" : "");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.setAttribute("aria-label", t.name);
      var ic = document.createElement("span"); ic.className = "pt-ic"; ic.setAttribute("aria-hidden", "true"); ic.textContent = glyph(t.icon);
      var nm = document.createElement("div"); nm.className = "pt-nm"; nm.textContent = t.name;
      if (t.recommended) {
        var bd = document.createElement("span"); bd.className = "badge"; bd.textContent = "Recommended";
        nm.appendChild(bd);
      }
      var bl = document.createElement("div"); bl.className = "pt-bl"; bl.textContent = t.blurb;
      var tag = document.createElement("code"); tag.className = "pt-tag"; tag.textContent = "dotnet new " + t.template;
      var ck = document.createElement("span"); ck.className = "pt-ck"; ck.setAttribute("aria-hidden", "true"); ck.textContent = glyph("E73E");
      b.appendChild(ic); b.appendChild(ck); b.appendChild(nm); b.appendChild(bl); b.appendChild(tag);
      b.addEventListener("click", function () { state.projectType = t.id; renderProjectTypes(); onChange(); });
      host.appendChild(b);
    });
  }

  function renderModes(hostId, list, field) {
    var host = $(hostId); if (!host) return; host.innerHTML = "";
    list.forEach(function (m) {
      var on = state[field] === m.id;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mode" + (on ? " sel" : "");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.setAttribute("aria-label", m.name);
      b.textContent = m.name;
      if (m.note) b.title = m.note;
      b.addEventListener("click", function () { state[field] = m.id; renderModes(hostId, list, field); onChange(); });
      host.appendChild(b);
    });
  }

  function renderRows(hostId, list, arrName, countId) {
    var host = $(hostId); host.innerHTML = "";
    list.forEach(function (it) {
      var on = state[arrName].indexOf(it.id) >= 0;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "optrow" + (on ? " sel" : "");
      b.setAttribute("role", "checkbox");
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.setAttribute("aria-label", it.name);
      var ic = document.createElement("span"); ic.className = "opt-ic"; ic.setAttribute("aria-hidden", "true"); ic.textContent = glyph(it.icon);
      var tx = document.createElement("span"); tx.className = "opt-tx";
      var nm = document.createElement("span"); nm.className = "opt-nm"; nm.textContent = it.name;
      var bl = document.createElement("span"); bl.className = "opt-bl"; bl.textContent = it.blurb || "";
      tx.appendChild(nm); tx.appendChild(bl);
      var ck = document.createElement("span"); ck.className = "opt-ck"; ck.setAttribute("aria-hidden", "true"); ck.textContent = glyph("E73E");
      b.appendChild(ic); b.appendChild(tx); b.appendChild(ck);
      b.addEventListener("click", function () {
        var arr = state[arrName]; var i = arr.indexOf(it.id);
        if (i >= 0) arr.splice(i, 1); else arr.push(it.id);
        renderRows(hostId, list, arrName, countId); onChange();
      });
      host.appendChild(b);
    });
    if (countId) { var c = $(countId); if (c) { var n = state[arrName].length; c.textContent = n ? n + " selected" : ""; } }
  }

  function renderCommand(cmd) { $("cmd").textContent = cmd || ""; }
  function renderPlan(steps) {
    $("planSteps").innerHTML = (steps || []).map(function (s) { return "<li>" + mdInline(s) + "</li>"; }).join("");
  }
  function renderLoc(appName) {
    $("loc").innerHTML = "<b>" + esc(appName) + "</b> is created in the folder this Copilot session is running in — as <code>" + esc(appName) + "/" + esc(appName) + ".csproj</code>.";
  }
  function setStatus(m) { $("status").textContent = m || ""; }

  function applyOptions(s) {
    state.language = s.language;
    state.packaging = s.packaging;
    state.projectType = s.projectType;
    state.features = (s.features || []).slice();
    renderProjectTypes();
    renderModes("language", cat.LANGUAGES, "language");
    renderModes("packaging", cat.PACKAGING, "packaging");
    renderRows("features", cat.FEATURES, "features", "featuresCount");
  }

  function pushState() {
    var body = JSON.stringify(state); lastSent = body;
    fetch("/state", { method: "POST", headers: { "content-type": "application/json" }, body: body })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.spec) return;
        applyOptions(d.spec);
        renderCommand(d.command);
        renderPlan(d.plan);
        renderLoc(d.spec.appName);
      })
      .catch(function () {});
  }

  appEl.addEventListener("input", function () {
    state.appName = appEl.value;
    if (syncNs) { state.namespace = appEl.value; nsEl.value = appEl.value; }
    onChange();
  });
  nsEl.addEventListener("input", function () {
    state.namespace = nsEl.value;
    syncNs = (nsEl.value === appEl.value);
    onChange();
  });

  $("generate").addEventListener("click", function () {
    var btn = $("generate"); btn.disabled = true;
    setStatus("Handing off to the winui-dev agent…");
    fetch("/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) setStatus("Sent " + (d.appName || "app") + " → check the chat.");
        else setStatus("Generate failed.");
      })
      .catch(function () { setStatus("Generate failed."); })
      .then(function () { btn.disabled = false; });
  });

  // Agent-driven spec changes (set_spec / generate) arrive over SSE.
  try {
    var es = new EventSource("/events");
    es.addEventListener("spec", function (ev) {
      var s; try { s = JSON.parse(ev.data); } catch (e) { return; }
      if (JSON.stringify(s) === lastSent) return;
      state = s;
      state.features = state.features || [];
      state.language = state.language || "winui";
      state.packaging = state.packaging || "packaged";
      appEl.value = s.appName; nsEl.value = s.namespace;
      syncNs = (s.namespace === s.appName);
      applyOptions(s);
      pushState();
    });
    es.addEventListener("nav", function (ev) {
      var n; try { n = JSON.parse(ev.data); } catch (e) { return; }
      if (n && n.view && window.__nav) window.__nav(n.view, n);
    });
  } catch (e) { /* no SSE; wizard still works */ }

  // initial paint
  renderProjectTypes();
  renderModes("language", cat.LANGUAGES, "language");
  renderModes("packaging", cat.PACKAGING, "packaging");
  renderRows("features", cat.FEATURES, "features", "featuresCount");
  renderCommand(BOOT.command); renderPlan(BOOT.plan); renderLoc(state.appName);
  pushState();
})();
</script>
<script>
/* Samples browser (WinUI Gallery) — lazy-loaded on first tab activation */
(function () {
  function $(id) { return document.getElementById(id); }
  var loaded = false, items = [], cats = [], curId = null, curFiles = [], curTab = 0, samplesEl = null, pendingApply = null;

  window.__samplesInit = function () {
    if (loaded) return; loaded = true;
    samplesEl = document.querySelector(".samples");
    $("sampleSearch").addEventListener("input", renderList);
    $("sampleCat").addEventListener("change", renderList);
    fetch("/samples").then(function (r) { return r.json(); }).then(function (d) {
      items = d.items || [];
      cats = d.categories || [];
      if (!d.available || !items.length) {
        $("sampleItems").innerHTML = "<div class='spempty'>WinUI Gallery was not found on disk.</div>";
        return;
      }
      var sel = $("sampleCat");
      (d.categories || []).forEach(function (c) {
        var o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o);
      });
      renderList();
      if (pendingApply) applyPending();
    }).catch(function () {
      $("sampleItems").innerHTML = "<div class='spempty'>Failed to load samples.</div>";
    });
  };

  // Agent populate hook: pre-filter the grid and/or open a specific sample.
  // Queues until the sample index has loaded, then applies.
  window.__samplesApply = function (opts) {
    pendingApply = opts || {};
    if (loaded && items.length) applyPending();
    else window.__samplesInit();
  };

  function applyPending() {
    var o = pendingApply; pendingApply = null;
    if (!o) return;
    if (typeof o.search === "string") { var sb = $("sampleSearch"); if (sb) sb.value = o.search; }
    if (typeof o.category === "string") {
      var sc = $("sampleCat");
      if (sc) {
        var ok = false;
        for (var i = 0; i < sc.options.length; i++) { if (sc.options[i].value === o.category) { ok = true; break; } }
        sc.value = ok ? o.category : "";
      }
    }
    renderList();
    if (o.sampleId) select(o.sampleId);
  }

  function filtered() {
    var q = ($("sampleSearch").value || "").toLowerCase().trim();
    var cat = $("sampleCat").value || "";
    return items.filter(function (it) {
      if (cat && it.category !== cat) return false;
      if (!q) return true;
      var hay = (it.title + " " + (it.subtitle || "") + " " + it.category + " " + (it.tags || []).join(" ")).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  // category -> [Segoe Fluent glyph code, hue]. Codes verified against the WinUI
  // Gallery IconsData.json; hue drives a per-topic accent tint.
  var CAT_ICON = {
    "Fundamentals": ["E80F", 212], "Design": ["E790", 330], "Accessibility": ["E776", 190],
    "Menus & toolbars": ["E712", 265], "Collections": ["E8A9", 28], "Date & time": ["E787", 145],
    "Basic input": ["E765", 210], "Status & info": ["E946", 200], "Dialogs & flyouts": ["E8BD", 285],
    "Scrolling": ["E7C3", 40], "Layout": ["ECA5", 18], "Navigation": ["E8F0", 158],
    "Media": ["E768", 350], "Styles": ["E8D3", 300], "Text": ["E8D2", 225],
    "Motion": ["E93E", 175], "Windowing": ["E78B", 205], "System": ["E713", 220], "Shell": ["E771", 260],
    "App lifecycle": ["E81C", 32], "Deployment": ["E896", 150], "Windowing & visuals": ["E78B", 205],
    "Notifications & widgets": ["EA8F", 45], "Input & text": ["E765", 210], "Devices & sensors": ["E772", 188],
    "Networking": ["E774", 200], "Location": ["E81D", 140], "AI & ML": ["E99A", 275],
    "Diagnostics": ["E9D9", 12], "Storage & data": ["E74E", 212], "Security": ["E72E", 155],
    "Background tasks": ["E916", 250], "Windows App SDK": ["E71D", 210]
  };
  function catInfo(cat) {
    var v = CAT_ICON[cat] || ["E71D", 210];
    return { ch: String.fromCharCode(parseInt(v[0], 16)), col: "hsl(" + v[1] + " 62% 52%)" };
  }

  function renderList() {
    var host = $("sampleItems"); var list = filtered();
    $("sampleCount").textContent = list.length + " of " + items.length + " controls";
    host.innerHTML = "";
    if (!list.length) { host.innerHTML = "<div class='spempty'>No controls match.</div>"; return; }

    var byCat = {};
    list.forEach(function (it) { (byCat[it.category] = byCat[it.category] || []).push(it); });
    var order = cats.filter(function (c) { return byCat[c]; });
    Object.keys(byCat).forEach(function (c) { if (order.indexOf(c) < 0) order.push(c); });

    order.forEach(function (cat) {
      var info = catInfo(cat);
      var grp = document.createElement("section"); grp.className = "sgroup";
      var head = document.createElement("div"); head.className = "sgrouphead";
      var gi = document.createElement("span"); gi.className = "gi"; gi.textContent = info.ch; gi.style.color = info.col;
      var gt = document.createElement("span"); gt.className = "gt"; gt.textContent = cat;
      var gc = document.createElement("span"); gc.className = "gc"; gc.textContent = String(byCat[cat].length);
      head.appendChild(gi); head.appendChild(gt); head.appendChild(gc); grp.appendChild(head);
      var grid = document.createElement("div"); grid.className = "sgrid";
      byCat[cat].forEach(function (it) { grid.appendChild(card(it, info)); });
      grp.appendChild(grid); host.appendChild(grp);
    });
  }

  function card(it, info) {
    var b = document.createElement("button"); b.type = "button";
    b.className = "scard" + (it.id === curId ? " sel" : "");
    b.setAttribute("aria-label", it.title + " \u2014 " + it.category);
    b.style.setProperty("--ci", info.col);
    var ic = document.createElement("div"); ic.className = "sicon"; ic.textContent = info.ch;
    var t = document.createElement("div"); t.className = "st"; t.textContent = it.title;
    b.appendChild(ic); b.appendChild(t);
    b.addEventListener("click", function () { select(it.id); });
    return b;
  }

  function select(id) {
    curId = id; renderList();
    if (samplesEl) samplesEl.classList.add("has-selection");
    var host = $("samplePreview");
    if (!host) { if (window.__clog) window.__clog("samplePreview element missing", "error"); return; }
    host.innerHTML = "<div class='spempty'>Loading…</div>";
    fetch("/sample?id=" + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (s) {
      if (!s || s.error) { if (window.__clog) window.__clog("sample load error id=" + id + (s && s.error ? " " + s.error : ""), "error"); host.innerHTML = "<div class='spempty'>Could not load this control.</div>"; return; }
      curFiles = s.files || []; curTab = 0; renderPreview(s);
    }).catch(function (e) { if (window.__clog) window.__clog("sample fetch failed id=" + id + ": " + e, "error"); host.innerHTML = "<div class='spempty'>Could not load this control.</div>"; });
  }

  function clearSelection() {
    curId = null; renderList();
    if (samplesEl) samplesEl.classList.remove("has-selection");
    var host = $("samplePreview");
    if (host) host.innerHTML = "<div class='spempty'>Select a control to preview its XAML &amp; C#.</div>";
  }

  function renderPreview(s) {
    var host = $("samplePreview"); host.innerHTML = "";

    var head = document.createElement("div"); head.className = "sphead";
    var back = document.createElement("button"); back.type = "button"; back.className = "spback";
    back.setAttribute("aria-label", "Back to samples");
    var bi = document.createElement("span"); bi.className = "ic"; bi.textContent = "\uE72B";
    back.appendChild(bi); back.appendChild(document.createTextNode("All samples"));
    back.addEventListener("click", clearSelection); head.appendChild(back);
    var h = document.createElement("h2"); h.textContent = s.title; head.appendChild(h);
    if (s.subtitle) { var p = document.createElement("p"); p.textContent = s.subtitle; head.appendChild(p); }
    var meta = document.createElement("div"); meta.className = "spmeta";
    var cc = document.createElement("span"); cc.className = "chipcat"; cc.textContent = s.category; meta.appendChild(cc);
    if (s.docs) {
      var a = document.createElement("a"); a.className = "dlink"; a.href = s.docs; a.target = "_blank"; a.rel = "noreferrer";
      a.textContent = "Docs \u2197"; meta.appendChild(a);
    }
    head.appendChild(meta); host.appendChild(head);

    var tabs = document.createElement("div"); tabs.className = "ftabs";
    curFiles.forEach(function (f, i) {
      var tb = document.createElement("button"); tb.type = "button"; tb.className = "ftab" + (i === curTab ? " on" : "");
      tb.textContent = f.name;
      tb.addEventListener("click", function () { curTab = i; renderPreview(s); });
      tabs.appendChild(tb);
    });
    host.appendChild(tabs);

    var body = document.createElement("div"); body.className = "spbody";
    var pre = document.createElement("pre"); pre.className = "code";
    pre.textContent = (curFiles[curTab] && curFiles[curTab].code) || "";
    body.appendChild(pre); host.appendChild(body);

    var foot = document.createElement("div"); foot.className = "spfoot";
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "primary"; btn.setAttribute("aria-label", "Use this control");
    btn.innerHTML = "<span class='ic'>&#xE724;</span> Use this";
    var st = document.createElement("span"); st.className = "status";
    btn.addEventListener("click", function () {
      btn.disabled = true; st.textContent = "Handing off to the winui-dev agent…";
      fetch("/use-sample", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { st.textContent = (d && d.ok) ? ("Sent " + (d.title || "control") + " \u2192 check the chat.") : "Failed."; })
        .catch(function () { st.textContent = "Failed."; })
        .then(function () { btn.disabled = false; });
    });
    foot.appendChild(btn); foot.appendChild(st); host.appendChild(foot);
  }
})();
</script>
<script>
/* Design tab: type ramp, theme brushes, icon picker */
(function () {
  function $(id) { return document.getElementById(id); }
  var loaded = false, iconsLoaded = false, iconsLoading = false;
  var data = null, icons = [], curSection = "type", curTheme = "light";
  var sel = null, pendingApply = null, toastTimer = null;

  function toast(msg) {
    var t = $("dtoast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1600);
  }
  function fallbackCopy(s) {
    try {
      var ta = document.createElement("textarea");
      ta.value = s; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    } catch (e) {}
  }
  function copyText(s) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s)["catch"](function () { fallbackCopy(s); });
      } else { fallbackCopy(s); }
    } catch (e) { fallbackCopy(s); }
  }
  function fontIconSnippet(code) { return '<FontIcon Glyph="&#x' + code + ';" />'; }
  function findBrush(name) { for (var i = 0; i < data.brushes.length; i++) { if (data.brushes[i].name === name) return data.brushes[i]; } return null; }

  // ---- selection bar --------------------------------------------------------
  function selectItem(o) {
    sel = o;
    var bar = $("dselbar"); if (!bar) return;
    bar.hidden = false;
    $("dselTitle").textContent = o.title;
    $("dselCode").textContent = o.copy;
    var p = $("dselPrev");
    p.className = "dselprev"; p.style.cssText = ""; p.textContent = "";
    if (o.prev === "type") { p.textContent = "Ag"; p.style.fontFamily = "inherit"; p.style.fontSize = "16px"; p.style.fontWeight = "600"; }
    else if (o.prev === "icon") { p.textContent = o.glyph; }
    else if (o.prev === "color") { p.style.background = o.color; }
  }
  function clearSel() { sel = null; var b = $("dselbar"); if (b) b.hidden = true; }
  function markSel(host, el, selector) {
    var prev = host.querySelectorAll(selector);
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove("sel");
    el.classList.add("sel");
  }

  // ---- type ramp ------------------------------------------------------------
  function renderType() {
    var host = $("dpanelType"); host.innerHTML = "";
    var hint = document.createElement("p"); hint.className = "dhint";
    hint.textContent = "The seven canonical WinUI TextBlock styles. Select one, then Copy or hand it to the agent.";
    host.appendChild(hint);
    data.type.forEach(function (t) {
      var row = document.createElement("div"); row.className = "dtrow";
      var s = document.createElement("div"); s.className = "dtsample";
      s.textContent = t.sample; s.style.fontSize = Math.min(t.px, 34) + "px"; s.style.fontWeight = String(t.weight);
      var m = document.createElement("div"); m.className = "dtmeta";
      var nm = document.createElement("div"); nm.className = "dtname"; nm.textContent = t.name;
      var sub = document.createElement("div"); sub.className = "dtsub"; sub.textContent = t.style + " · " + t.px + "px";
      m.appendChild(nm); m.appendChild(sub);
      row.appendChild(s); row.appendChild(m);
      row.addEventListener("click", function () {
        markSel(host, row, ".dtrow");
        selectItem({ kind: "type", id: t.id, title: t.name + " type style", copy: 'Style="{StaticResource ' + t.style + '}"', prev: "type" });
      });
      host.appendChild(row);
    });
  }

  // ---- theme brushes --------------------------------------------------------
  function renderColor() {
    var host = $("dpanelColor"); host.innerHTML = "";
    var wrap = document.createElement("div"); wrap.className = "dcolorwrap"; wrap.setAttribute("data-theme", curTheme);
    var hint = document.createElement("p"); hint.className = "dhint";
    hint.textContent = "Fluent theme brushes with real Light/Dark values and when to use each. Reference via {ThemeResource} so they follow the theme.";
    host.appendChild(hint);
    data.brushGroups.forEach(function (g) {
      var items = data.brushes.filter(function (b) { return b.group === g; });
      if (!items.length) return;
      var grp = document.createElement("div"); grp.className = "dgroup";
      var gh = document.createElement("div"); gh.className = "dgrouphead"; gh.textContent = g; grp.appendChild(gh);
      var grid = document.createElement("div"); grid.className = "dswlist";
      items.forEach(function (b) {
        var sw = document.createElement("button"); sw.type = "button"; sw.className = "dswatch";
        sw.style.setProperty("--l", b.light); sw.style.setProperty("--d", b.dark);
        var chip = document.createElement("span"); chip.className = "dchip" + (b.kind === "stroke" ? " stroke" : b.kind === "transparent" ? " transparent" : "");
        var txt = document.createElement("span"); txt.className = "dswtext";
        var nm = document.createElement("span"); nm.className = "dswname"; nm.textContent = b.name; txt.appendChild(nm);
        if (b.use) { var us = document.createElement("span"); us.className = "dswuse"; us.textContent = b.use; txt.appendChild(us); }
        if (b.note) { var tg = document.createElement("span"); tg.className = "dswtag"; tg.textContent = b.note; txt.appendChild(tg); }
        sw.appendChild(chip); sw.appendChild(txt);
        sw.addEventListener("click", function () {
          markSel(wrap, sw, ".dswatch");
          var col = (curTheme === "dark") ? b.dark : b.light;
          selectItem({ kind: "brush", id: b.name, title: b.name, copy: "{ThemeResource " + b.name + "}", prev: "color", color: col });
        });
        grid.appendChild(sw);
      });
      grp.appendChild(grid); wrap.appendChild(grp);
    });
    host.appendChild(wrap);
  }

  // ---- icon picker ----------------------------------------------------------
  function ensureIcons() {
    if (iconsLoaded) { renderIconsShell(); return; }
    if (iconsLoading) return;
    iconsLoading = true;
    var host = $("dpanelIcons"); host.innerHTML = "<div class='spempty'>Loading icons…</div>";
    fetch("/icons").then(function (r) { return r.json(); }).then(function (d) {
      icons = (d && d.items) || []; iconsLoaded = true; iconsLoading = false;
      if (!icons.length) { host.innerHTML = "<div class='spempty'>Icon set not found on disk.</div>"; return; }
      renderIconsShell();
    })["catch"](function () { iconsLoading = false; $("dpanelIcons").innerHTML = "<div class='spempty'>Couldn't load icons.</div>"; });
  }
  function renderIconsShell() {
    var host = $("dpanelIcons");
    if (!host.querySelector(".dsearchrow")) {
      host.innerHTML = "";
      var row = document.createElement("div"); row.className = "dsearchrow";
      var inp = document.createElement("input"); inp.className = "dsearch"; inp.type = "text"; inp.id = "iconSearch";
      inp.placeholder = "Search " + icons.length + " Segoe Fluent icons…"; inp.setAttribute("aria-label", "Search icons");
      var cnt = document.createElement("span"); cnt.className = "diconcount"; cnt.id = "iconCount";
      row.appendChild(inp); row.appendChild(cnt);
      var grid = document.createElement("div"); grid.className = "dicongrid"; grid.id = "iconGrid";
      host.appendChild(row); host.appendChild(grid);
      inp.addEventListener("input", function () { paintIcons(inp.value); });
    }
    paintIcons($("iconSearch") ? $("iconSearch").value : "");
  }
  function paintIcons(q) {
    var grid = $("iconGrid"), cnt = $("iconCount"); if (!grid) return;
    q = String(q || "").trim().toLowerCase();
    var list = icons;
    if (q) {
      list = icons.filter(function (i) {
        if (i.name.toLowerCase().indexOf(q) >= 0) return true;
        if (i.code.toLowerCase().indexOf(q) >= 0) return true;
        for (var k = 0; k < i.tags.length; k++) { if (String(i.tags[k]).toLowerCase().indexOf(q) >= 0) return true; }
        return false;
      });
    }
    var CAP = 400, shown = list.slice(0, CAP);
    cnt.textContent = list.length > CAP ? ("showing " + CAP + " of " + list.length + " — refine search") : (list.length + (list.length === 1 ? " icon" : " icons"));
    grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    shown.forEach(function (i) {
      var glyph = String.fromCharCode(parseInt(i.code, 16));
      var tile = document.createElement("button"); tile.type = "button"; tile.className = "dicon"; tile.title = i.name + " (" + i.code + ")";
      var g = document.createElement("span"); g.className = "g"; g.textContent = glyph;
      var n = document.createElement("span"); n.className = "n"; n.textContent = i.name;
      tile.appendChild(g); tile.appendChild(n);
      tile.addEventListener("click", function () {
        markSel(grid, tile, ".dicon");
        selectItem({ kind: "icon", id: i.code, title: i.name + " (" + i.code + ")", copy: fontIconSnippet(i.code), prev: "icon", glyph: glyph });
      });
      frag.appendChild(tile);
    });
    grid.appendChild(frag);
  }

  // ---- section switching + wiring ------------------------------------------
  function switchSection(name) {
    if (name !== "type" && name !== "color" && name !== "icons") return;
    curSection = name;
    var segs = document.querySelectorAll(".dseg");
    for (var i = 0; i < segs.length; i++) segs[i].classList.toggle("on", segs[i].getAttribute("data-section") === name);
    var panels = document.querySelectorAll("#dbody .dpanel");
    for (var j = 0; j < panels.length; j++) panels[j].classList.toggle("on", panels[j].getAttribute("data-sec") === name);
    var th = $("dtheme"); if (th) th.hidden = (name !== "color");
    clearSel();
    if (name === "icons") ensureIcons();
  }
  function bind() {
    var segs = document.querySelectorAll(".dseg");
    for (var i = 0; i < segs.length; i++) {
      (function (seg) { seg.addEventListener("click", function () { switchSection(seg.getAttribute("data-section")); }); })(segs[i]);
    }
    var tbs = document.querySelectorAll(".dtb");
    for (var j = 0; j < tbs.length; j++) {
      (function (tb) {
        tb.addEventListener("click", function () {
          curTheme = tb.getAttribute("data-theme");
          var all = document.querySelectorAll(".dtb");
          for (var k = 0; k < all.length; k++) all[k].classList.toggle("on", all[k].getAttribute("data-theme") === curTheme);
          var wrap = document.querySelector(".dcolorwrap"); if (wrap) wrap.setAttribute("data-theme", curTheme);
          if (sel && sel.kind === "brush") { var b = findBrush(sel.id); if (b) { sel.color = (curTheme === "dark") ? b.dark : b.light; var p = $("dselPrev"); if (p) p.style.background = sel.color; } }
        });
      })(tbs[j]);
    }
    var cp = $("dselCopy"); if (cp) cp.addEventListener("click", function () { if (sel) { copyText(sel.copy); toast("Copied " + sel.copy); } });
    var us = $("dselUse"); if (us) us.addEventListener("click", function () {
      if (!sel) return; us.disabled = true;
      fetch("/use-design", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: sel.kind, id: sel.id }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { toast((d && d.ok) ? ("Sent " + (d.title || "token") + " → check the chat") : "Failed"); })
        ["catch"](function () { toast("Failed"); })
        .then(function () { us.disabled = false; });
    });
  }

  // ---- public API -----------------------------------------------------------
  window.__designInit = function () {
    if (loaded) { if (pendingApply) { var q = pendingApply; pendingApply = null; window.__designApply(q); } return; }
    loaded = true;
    fetch("/design").then(function (r) { return r.json(); }).then(function (d) {
      data = d || { type: [], brushes: [], brushGroups: [] };
      renderType(); renderColor(); bind();
      if (pendingApply) { var q = pendingApply; pendingApply = null; window.__designApply(q); }
    })["catch"](function () {
      var host = $("dpanelType"); if (host) host.innerHTML = "<div class='spempty'>Couldn't load the design data.</div>";
    });
  };
  window.__designApply = function (opts) {
    opts = opts || {};
    if (!loaded || !data) { pendingApply = opts; if (!loaded) window.__designInit(); return; }
    var section = opts.section;
    if (!section && opts.search != null) section = "icons";
    if (section) switchSection(section);
    if (opts.search != null) {
      ensureIcons();
      var apply = function () {
        var inp = $("iconSearch");
        if (!inp) { setTimeout(apply, 120); return; }
        inp.value = opts.search; paintIcons(opts.search);
      };
      apply();
    }
  };
})();
</script>
<script>
/* Review / Scorecard tab */
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  var rvBody = $("rvBody");
  var toastEl = $("rvToast");
  var current = null, inited = false, pendingPath = null, toastT = null, ctx = null;

  function toast(m) {
    toastEl.textContent = m; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  function setHint(html) {
    var el = $("rvHint");
    if (!el) return;
    if (!html) { el.hidden = true; el.innerHTML = ""; return; }
    el.innerHTML = html; el.hidden = false;
  }

  function gradeColor(g) {
    if (g === "A" || g === "B") return "var(--true-color-green,#1a7f37)";
    if (g === "C") return "var(--true-color-blue,#4493f8)";
    if (g === "D") return "var(--true-color-orange,#bc4c00)";
    return "var(--true-color-red,#cf222e)";
  }

  function post(url, body, okMsg) {
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) { toast((d && d.ok) ? okMsg : ("Failed" + ((d && d.error) ? (": " + d.error) : ""))); })
      ["catch"](function () { toast("Failed"); });
  }

  function render(d) {
    var col = gradeColor(d.grade);
    var total = d.totals.total;
    var h = "";
    h += '<div class="rvscore">';
    h += '<div class="rvring" style="--p:' + d.score + ";--rvc:" + col + '"><i><b>' + d.score + "</b><s>/100</s></i></div>";
    h += '<div class="rvmeta"><h2>Grade <span style="color:' + col + '">' + esc(d.grade) + "</span> \u00b7 " + total + " issue" + (total === 1 ? "" : "s") + "</h2>";
    h += '<p class="sub">' + esc(d.targetName || d.target) + " \u00b7 " + d.fileCount + " files scanned" + (d.truncated ? " \u00b7 truncated" : "") + "</p>";
    h += '<div class="rvactions"><button class="mini" id="rvRescan" type="button">Rescan</button><button class="ghost" id="rvDeep" type="button">Deep review</button></div>';
    h += "</div></div>";

    h += '<div class="rvcats">';
    for (var ci = 0; ci < d.categories.length; ci++) {
      var c = d.categories[ci];
      h += '<span class="rvcat' + (c.total === 0 ? " zero" : "") + '"><span class="ic">' + (c.glyph || "") + "</span><b>" + esc(c.name) + "</b> <em>" + c.total + "</em></span>";
    }
    h += "</div>";

    if (!total) {
      h += '<div class="rvclean"><div class="big"><span class="ic">&#xE930;</span></div><h3>No static issues found</h3><p>Nothing flagged by the static rules. Run a deep review for semantic + analyzer checks.</p></div>';
    } else {
      for (var gi = 0; gi < d.categories.length; gi++) {
        var cat = d.categories[gi];
        var items = [];
        for (var fi = 0; fi < d.findings.length; fi++) { if (d.findings[fi].category === cat.id) items.push(d.findings[fi]); }
        if (!items.length) continue;
        h += '<div class="rvgroup"><div class="rvghead"><span class="ic">' + (cat.glyph || "") + "</span><h3>" + esc(cat.name) + '</h3><span class="cnt">' + items.length + '</span><button class="mini fixall" type="button" data-cat="' + esc(cat.id) + '">Fix all</button></div>';
        for (var ii = 0; ii < items.length; ii++) {
          var f = items[ii];
          h += '<div class="rvfind"><div class="top"><span class="rvdot ' + f.severity + '"></span><div class="rvft">';
          h += '<div class="rvftitle">' + esc(f.title) + "</div>";
          h += '<div class="rvfloc">' + esc(f.file) + ":" + f.line + ' \u00b7 <span class="rvfref">' + esc(f.ruleRef) + "</span></div>";
          h += '<p class="rvfwhy">' + esc(f.why) + "</p>";
          h += '<code class="rvfsnip">' + esc(f.snippet) + "</code>";
          h += '</div><button class="mini rvfix" type="button" data-fid="' + esc(f.id) + '">Fix</button></div></div>';
        }
        h += "</div>";
      }
    }
    rvBody.innerHTML = h;
    wire();
  }

  function wire() {
    var rs = $("rvRescan"); if (rs) rs.onclick = function () { if (current) scan(current.target); };
    var dp = $("rvDeep"); if (dp) dp.onclick = function () { deep(); };
    var fa = rvBody.querySelectorAll(".fixall");
    for (var i = 0; i < fa.length; i++) { (function (btn) { btn.onclick = function () { fixCat(btn.getAttribute("data-cat")); }; })(fa[i]); }
    var fx = rvBody.querySelectorAll(".rvfix");
    for (var j = 0; j < fx.length; j++) { (function (btn) { btn.onclick = function () { fixOne(btn.getAttribute("data-fid")); }; })(fx[j]); }
  }

  function scan(path) {
    var raw = (path != null) ? path : (($("rvPath").value) || "");
    var target = ("" + raw).trim();
    if (!target) { toast("Enter a project folder"); return; }
    $("rvPath").value = target;
    setHint("");
    rvBody.innerHTML = '<div class="spempty">Scanning ' + esc(target) + "\u2026</div>";
    fetch("/review?path=" + encodeURIComponent(target))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { current = null; rvBody.innerHTML = '<div class="spempty">' + esc((d && d.error) || "Scan failed.") + "</div>"; return; }
        current = d; render(d); updateHint(d.target);
      })
      ["catch"](function () { rvBody.innerHTML = '<div class="spempty">Scan failed.</div>'; });
  }

  function norm(p) {
    p = ("" + p).toLowerCase();
    var out = "";
    for (var i = 0; i < p.length; i++) { var c = p.charAt(i); out += (c === "/") ? "\\" : c; }
    while (out.length && out.charAt(out.length - 1) === "\\") out = out.slice(0, -1);
    return out;
  }
  function samePath(a, b) { return !!(a && b) && norm(a) === norm(b); }
  function baseName(p) {
    p = "" + p;
    while (p.length && (p.charAt(p.length - 1) === "\\" || p.charAt(p.length - 1) === "/")) p = p.slice(0, -1);
    var a = p.lastIndexOf("\\"), b = p.lastIndexOf("/");
    var i = a > b ? a : b;
    return i >= 0 ? p.slice(i + 1) : p;
  }
  function wireUseWs(app) {
    if (!app) return;
    var a = $("rvUseWs");
    if (a) a.onclick = function () { scan(app.dir); };
  }

  function updateHint(target) {
    if (!ctx) { setHint(""); return; }
    var det = ctx.detected;
    var appInWs = (det && det.isApp) ? det : null;
    var where = ctx.workspaceName ? (" in <b>" + esc(ctx.workspaceName) + "</b>") : " in this workspace";

    if (det && samePath(det.dir, target)) {
      if (det.isApp) {
        setHint('<span class="ic">&#xE71B;</span> Auto-attached to <b>' + esc(det.name) + "</b>" + where);
      } else {
        setHint('<span class="ic">&#xE71B;</span> Reviewing <b>' + esc(det.name) + "</b> (a WinUI library)" + where);
      }
      return;
    }

    if (ctx.persisted && samePath(ctx.persisted, target)) {
      var h = '<span class="ic">&#xE81C;</span> Reviewing your last project <b>' + esc(baseName(target)) + "</b>";
      if (appInWs) h += '<a id="rvUseWs">Switch to workspace app (' + esc(appInWs.name) + ")</a>";
      setHint(h);
      wireUseWs(appInWs);
      return;
    }

    var hint = '<span class="ic">&#xE8B7;</span> Reviewing a custom folder';
    if (appInWs) hint += '<a id="rvUseWs">Use workspace app (' + esc(appInWs.name) + ")</a>";
    setHint(hint);
    wireUseWs(appInWs);
  }

  function showEmpty(c) {
    var msg;
    if (c && c.workspaceRoot) {
      var w = c.workspaceName ? ("<b>" + esc(c.workspaceName) + "</b>") : "the current workspace";
      msg = "No WinUI app detected in " + w + ". Enter a project folder above and hit <b>Scan</b>, or ask Copilot to review the app it just built.";
    } else {
      msg = "Enter your WinUI project folder and hit <b>Scan</b> \u2014 or ask Copilot to review the app it just built.";
    }
    setHint("");
    rvBody.innerHTML = '<div class="spempty">' + msg + "</div>";
  }

  function deep() {
    if (!current) return;
    post("/deep-review", { target: current.target, summary: { score: current.score, grade: current.grade, totals: current.totals } }, "Deep review requested \u2192 check the chat");
  }

  function fixOne(id) {
    if (!current) return;
    var f = null;
    for (var i = 0; i < current.findings.length; i++) { if (current.findings[i].id === id) { f = current.findings[i]; break; } }
    if (!f) return;
    post("/fix-finding", { finding: f, target: current.target }, "Fix sent \u2192 check the chat");
  }

  function fixCat(catId) {
    if (!current) return;
    var name = catId, items = [];
    for (var i = 0; i < current.categories.length; i++) { if (current.categories[i].id === catId) { name = current.categories[i].name; break; } }
    for (var j = 0; j < current.findings.length; j++) { if (current.findings[j].category === catId) items.push(current.findings[j]); }
    if (!items.length) return;
    post("/fix-category", { category: name, findings: items, target: current.target }, "Fix-all sent (" + items.length + ") \u2192 check the chat");
  }

  window.__reviewInit = function () {
    if (inited) return; inited = true;
    $("rvScan").onclick = function () { scan(null); };
    $("rvPath").addEventListener("keydown", function (e) { if (e.key === "Enter") scan(null); });
    fetch("/review-target").then(function (r) { return r.json(); }).then(function (d) {
      ctx = d || {};
      if (pendingPath != null) { var p = pendingPath; pendingPath = null; scan(p); return; }
      if (ctx.auto) { scan(ctx.auto); return; }
      showEmpty(ctx);
    })["catch"](function () { showEmpty(null); });
  };
  window.__reviewApply = function (opts) {
    opts = opts || {};
    if (opts.path != null) {
      if (!inited) { pendingPath = opts.path; window.__reviewInit(); return; }
      scan(opts.path);
    }
  };
})();
</script>
<script>
/* Inspect tab: embed the Live Visual Tree client (iframe -> /inspect/) and
   auto-latch it onto the workspace's running WinUI app. The parent only fires
   the one-time workspace latch; the iframe client drives the tree/props/screenshot
   and its /api/state poll picks up the target the server armed. */
(function () {
  var inited = false, pendingApply = null;
  function $(id) { return document.getElementById(id); }
  function hint(txt) { var el = $("inFrameHint"); if (el && txt) el.textContent = txt; }
  function latch(body) {
    return fetch("/inspect-latch", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {})
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { hint("Inspector not ready \u2014 reopen the panel."); return d; }
        if (d.hwnd != null) hint("Attached to " + (d.title || d.label || "the running app") + ".");
        else if (d.processName) hint("Watching for " + d.processName + " \u2014 run the app to inspect it.");
        else hint("No WinUI app detected in this workspace \u2014 pick a window below.");
        return d;
      })["catch"](function () { hint("Could not reach the inspector."); });
  }
  function hostTheme() {
    try {
      var bg = getComputedStyle(document.body).backgroundColor || "";
      var open = bg.indexOf("(");
      if (open !== -1) {
        var inner = bg.slice(open + 1, bg.indexOf(")"));
        var p = inner.split(",");
        var r = parseInt(p[0], 10) || 0, g = parseInt(p[1], 10) || 0, b = parseInt(p[2], 10) || 0;
        var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return lum < 128 ? "dark" : "light";
      }
    } catch (e) {}
    return "light";
  }
  function syncFrameTheme(f) {
    try {
      var doc = f && f.contentDocument;
      if (doc && doc.documentElement) doc.documentElement.setAttribute("data-theme", hostTheme());
    } catch (e) {}
  }
  window.__inspectInit = function () {
    if (inited) return; inited = true;
    var f = $("inspectFrame");
    if (f) {
      f.addEventListener("load", function () { syncFrameTheme(f); });
      if (!f.getAttribute("src") || f.getAttribute("src") === "about:blank") f.setAttribute("src", "/inspect/");
      syncFrameTheme(f);
    }
    latch(pendingApply || {}); pendingApply = null;
  };
  window.__inspectApply = function (opts) {
    opts = opts || {};
    var body = {};
    if (opts.process) body.process = opts.process;
    if (opts.title) body.title = opts.title;
    if (opts.pid != null) body.pid = opts.pid;
    if (!inited) { pendingApply = body; window.__inspectInit(); return; }
    latch(body);
  };
})();
</script>
</body>
</html>`;
}
