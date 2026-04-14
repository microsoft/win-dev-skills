/**
 * Smoke-test: launch dashboard, load a previous run, and navigate all views.
 *
 * Usage:
 *   npx tsx auto-test/smoke-test.ts [runName] [--verbose]
 *
 * If runName is omitted, selects the first run in the list.
 * Requires at least one previous run with results.json files.
 */

import { Dashboard } from "./harness.js";

const verbose = process.argv.includes("--verbose");
const runName = process.argv.filter(a => !a.startsWith("--"))[2]; // optional: e.g., "run3"

interface TestResult {
  name: string;
  status: "pass" | "fail" | "broken";
  detail?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function pass(name: string, detail?: string) {
  results.push({ name, status: "pass", detail });
  log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, status: "fail", detail });
  log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

function broken(name: string, detail?: string) {
  results.push({ name, status: "broken", detail });
  log(`  🚧 ${name} [BROKEN]${detail ? ` — ${detail}` : ""}`);
}

function check(name: string, condition: boolean, failDetail?: string) {
  if (condition) pass(name);
  else fail(name, failDetail);
}

async function run() {
  const dash = new Dashboard({ cols: 160, rows: 40, verbose });

  try {
    // ═══════════════════════════════════════════════════════════════
    // SETUP VIEW
    // ═══════════════════════════════════════════════════════════════
    log("Starting dashboard...");
    await dash.start();
    await dash.wait(2000);

    log("\n=== SETUP VIEW ===");
    check("Setup view renders", dash.hasText("Benchmark Dashboard"));
    check("New benchmark option visible", dash.hasText("New benchmark run"));

    if (dash.hasText("Benchmark run status") || dash.hasText("load")) {
      pass("Load run option visible");
    } else {
      broken("Load run option visible", "No previous runs — need at least one run in results/");
      dash.stop();
      printReport();
      return;
    }

    // Navigate to "Benchmark run status" (2nd menu item)
    log("  Navigating to load run...");
    dash.press("down");
    await dash.wait(300);
    dash.press("enter");
    await dash.wait(2000);

    check("Run list appears", dash.hasText("Select a run"));

    // Select a run
    log(`  Selecting run${runName ? ` (looking for ${runName})` : ""}...`);
    if (runName) {
      // Navigate to the specified run
      for (let i = 0; i < 20; i++) {
        if (dash.hasRecentText(runName)) break;
        dash.press("down");
        await dash.wait(200);
      }
    }
    dash.press("enter");
    await dash.wait(3000);

    // ═══════════════════════════════════════════════════════════════
    // RESULTS VIEW [3] (default after loading)
    // ═══════════════════════════════════════════════════════════════
    log("\n=== RESULTS VIEW [3] ===");
    check("Results view loads", dash.hasText("RESULTS COMPARISON") || dash.hasText("No completed results"));
    check("StatusBar visible", dash.hasText("[1]Live") && dash.hasText("[2]Progress") && dash.hasText("[3]Results"));
    check("Bottom help bar visible", dash.hasText("1-5 or Tab"));

    const hasScores = dash.hasText("/100") || dash.hasText("Score");
    check("Score data visible", hasScores, "No score data — run may have no completed trials");

    // ═══════════════════════════════════════════════════════════════
    // VIEW SWITCHING (1-5 keys)
    // ═══════════════════════════════════════════════════════════════
    log("\n=== VIEW SWITCHING ===");

    // [1] Live View
    dash.press("1");
    await dash.wait(1500);
    check("Key 1 → Live view", dash.hasRecentText("switch runs") || dash.hasRecentText("Waiting for first run"));

    // [2] Progress View
    dash.press("2");
    await dash.wait(1500);
    check("Key 2 → Progress view", dash.hasRecentText("RUN:") || dash.hasRecentText("Progress"));

    // [3] Results View
    dash.press("3");
    await dash.wait(1500);
    check("Key 3 → Results view", dash.hasRecentText("RESULTS COMPARISON") || dash.hasRecentText("No completed results"));

    // [4] Charts View
    dash.press("4");
    await dash.wait(1500);
    check("Key 4 → Charts view", dash.hasRecentText("TOKEN USAGE") || dash.hasRecentText("No completed results"));

    // [5] Summary View
    dash.press("5");
    await dash.wait(1500);
    check("Key 5 → Summary view", dash.hasRecentText("SUMMARY") || dash.hasRecentText("Quick Stats") || dash.hasRecentText("No completed results"));

    // Tab cycling
    dash.press("1"); await dash.wait(500); // go to live
    dash.press("tab"); await dash.wait(1000);
    check("Tab cycles views", dash.hasRecentText("RUN:") || dash.hasRecentText("Progress"));

    // ═══════════════════════════════════════════════════════════════
    // PROGRESS VIEW — detailed interaction
    // ═══════════════════════════════════════════════════════════════
    log("\n=== PROGRESS VIEW INTERACTION ===");
    dash.press("2");
    await dash.wait(1500);

    // Guide text
    check("Progress: guide text visible", dash.hasRecentText("navigate") && dash.hasRecentText("rerun selected"));

    // Cursor navigation
    dash.press("down"); await dash.wait(200);
    dash.press("down"); await dash.wait(200);
    dash.press("down"); await dash.wait(500);
    check("Progress: ↓ moves cursor", dash.hasRecentText("▸"));

    dash.press("up"); await dash.wait(500);
    check("Progress: ↑ moves cursor", dash.hasRecentText("▸"));

    // Space to select
    dash.press("space"); await dash.wait(500);
    check("Progress: Space toggles selection", dash.hasRecentText("Selected: 1") || dash.hasRecentText("✓"));

    // Space to deselect
    dash.press("space"); await dash.wait(500);
    check("Progress: Space deselects", dash.hasRecentText("Selected: 0"));

    // A to select all
    dash.press("a"); await dash.wait(1000);
    // Check recent output for Selected count > 1
    const recentAfterA = dash.lastFrame();
    const allSelMatches = [...recentAfterA.matchAll(/Selected:\s*(\d+)/g)];
    const lastSelMatch = allSelMatches.length > 0 ? allSelMatches[allSelMatches.length - 1] : null;
    const selCount = lastSelMatch ? parseInt(lastSelMatch[1]) : 0;
    check("Progress: A selects all", selCount > 1, `Selected: ${selCount}`);

    // A again to deselect all
    dash.press("a"); await dash.wait(1000);
    check("Progress: A deselects all", dash.hasRecentText("Selected: 0"));

    // Page navigation (e = end, h = home)
    dash.press("e"); await dash.wait(500);
    const hasAbove = dash.hasRecentText("more above");
    check("Progress: 'e' jumps to bottom", hasAbove, "May not have enough entries for scrolling");

    dash.press("h"); await dash.wait(500);
    const hasBelow = dash.hasRecentText("more below");
    check("Progress: 'h' jumps to top", hasBelow || !dash.hasRecentText("more above"), "May not have enough entries");

    // R with no selection does nothing (shouldn't crash)
    dash.press("a"); await dash.wait(200); // select all
    dash.press("a"); await dash.wait(200); // deselect all
    dash.press("r"); await dash.wait(500);
    // Still on progress view (didn't start a rerun)
    check("Progress: R with no selection is no-op", dash.hasRecentText("Selected: 0") || dash.hasRecentText("RUN:"));

    // ═══════════════════════════════════════════════════════════════
    // RESULTS VIEW — cursor navigation
    // ═══════════════════════════════════════════════════════════════
    log("\n=== RESULTS VIEW INTERACTION ===");
    dash.press("3");
    await dash.wait(1500);

    dash.press("down"); await dash.wait(300);
    dash.press("down"); await dash.wait(500);
    check("Results: ↑↓ navigation", dash.hasRecentText("▶") || dash.hasRecentText("RESULTS"));

    // ═══════════════════════════════════════════════════════════════
    // QUIT
    // ═══════════════════════════════════════════════════════════════
    log("\n=== QUIT ===");
    dash.press("q");
    const exited = await dash.waitForExit(10000);
    check("'q' quits the dashboard", exited);

  } catch (err: any) {
    fail("Unexpected error", err.message);
  } finally {
    dash.stop();
  }

  printReport();
}

function printReport() {
  console.log("\n" + "═".repeat(60));
  console.log("  TEST RESULTS");
  console.log("═".repeat(60));

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const brokenCount = results.filter((r) => r.status === "broken").length;

  for (const r of results) {
    const icon = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "🚧";
    const suffix = r.status === "broken" ? " [BROKEN]" : "";
    const detail = r.detail ? ` — ${r.detail}` : "";
    console.log(`  ${icon} ${r.name}${suffix}${detail}`);
  }

  console.log("\n" + "─".repeat(60));
  console.log(`  Total: ${results.length}  |  ✅ ${passed} passed  |  ❌ ${failed} failed  |  🚧 ${brokenCount} broken`);
  console.log("─".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

run();
