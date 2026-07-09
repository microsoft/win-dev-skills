// Module load hook: force the bundled Copilot SDK files to load as ES modules.
//
// On some CLI builds (seen on win32-arm64 @ 1.0.67) the SDK ships as `.js`
// files that contain ESM syntax (`import ... from`, `export { ... }`) but ship
// without a `package.json` "type":"module" marker beside them. Node then parses
// them as CommonJS and throws either:
//   - "Named export 'createCanvas' not found ... is a CommonJS module", or
//   - "Cannot use import statement outside a module".
//
// Forcing `format: "module"` in a load hook fixes it without modifying the app
// install, and stays correct if a future build already loads them as ESM.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SDK_FILE = /copilot-sdk[\\/](?:extension|index)\.js$/i;

export async function load(url, context, nextLoad) {
    if (url.startsWith("file:") && SDK_FILE.test(url)) {
        const source = await readFile(fileURLToPath(url), "utf8");
        return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
}
