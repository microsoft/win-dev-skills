/**
 * Debug: dump raw dashboard output to understand what Ink actually sends.
 */

import { Dashboard } from "./harness.js";

async function run() {
  const dash = new Dashboard({ cols: 160, rows: 40 });
  await dash.start();
  await dash.wait(3000);

  console.log("=== RAW OUTPUT (first 2000 chars) ===");
  console.log(JSON.stringify(dash.rawOutput().slice(0, 2000)));
  console.log("\n=== STRIPPED OUTPUT (first 2000 chars) ===");
  console.log(dash.lastFrame().slice(0, 2000));

  dash.stop();
}

run();
