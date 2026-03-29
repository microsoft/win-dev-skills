import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  GlobalConfig,
  ScenarioConfig,
  CandidateInfo,
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const benchRoot = resolve(__dirname, "..", "..", "..");
export const repoRoot = resolve(benchRoot, "..");
export const resultsRoot = join(benchRoot, "results");
export const scenariosDir = join(benchRoot, "scenarios");

export function loadGlobalConfig(): GlobalConfig {
  const configPath = join(benchRoot, "common", "config.json");
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

export function discoverScenarios(): Array<{
  name: string;
  path: string;
  config: ScenarioConfig;
}> {
  if (!existsSync(scenariosDir)) return [];
  return readdirSync(scenariosDir)
    .filter((d) => {
      const p = join(scenariosDir, d, "scenario.json");
      return existsSync(p);
    })
    .map((d) => ({
      name: d,
      path: join(scenariosDir, d),
      config: JSON.parse(
        readFileSync(join(scenariosDir, d, "scenario.json"), "utf-8")
      ),
    }));
}

export function discoverCandidates(): CandidateInfo[] {
  const config = loadGlobalConfig();
  let candidatesRoot = config.candidates?.root || "../plugin-candidates";

  if (!candidatesRoot.startsWith("/") && !candidatesRoot.match(/^[A-Z]:/i)) {
    candidatesRoot = resolve(benchRoot, candidatesRoot);
  }

  // Fallback: try <repoRoot>/plugin-candidates
  if (!existsSync(candidatesRoot)) {
    candidatesRoot = join(repoRoot, "plugin-candidates");
  }

  if (!existsSync(candidatesRoot)) return [];

  return readdirSync(candidatesRoot)
    .filter((d) => {
      const full = join(candidatesRoot, d);
      return (
        statSync(full).isDirectory() &&
        (existsSync(join(full, "agents")) || existsSync(join(full, "skills")))
      );
    })
    .map((d) => ({
      name: d,
      path: join(candidatesRoot, d),
    }));
}

export function getNextRunName(): string {
  if (!existsSync(resultsRoot)) return "run1-" + formatTimestamp();

  const existing = readdirSync(resultsRoot)
    .filter((d) => d.match(/^run(\d+)/))
    .map((d) => parseInt(d.match(/^run(\d+)/)![1]));

  const nextNum =
    existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `run${nextNum}-${formatTimestamp()}`;
}

function formatTimestamp(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const HH = String(now.getHours()).padStart(2, "0");
  const MM = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");
  return `${mm}${dd}${yy}-${HH}${MM}${SS}`;
}

export function loadPrompt(scenarioPath: string): string {
  return readFileSync(join(scenarioPath, "prompt.md"), "utf-8");
}

export function loadValidationPrompt(): string {
  return readFileSync(
    join(benchRoot, "common", "validate.prompt.md"),
    "utf-8"
  );
}

export function loadRetrospectivePrompt(): string {
  return readFileSync(
    join(benchRoot, "common", "retrospective.prompt.md"),
    "utf-8"
  );
}

export function loadSummaryPrompt(): string {
  return readFileSync(
    join(benchRoot, "common", "summary.prompt.md"),
    "utf-8"
  );
}

export const AVAILABLE_MODELS = ["claude-opus-4.6", "claude-sonnet-4.5"];
