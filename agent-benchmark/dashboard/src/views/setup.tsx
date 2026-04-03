import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { join } from "path";
import { discoverScenarios, discoverAgentSetups, discoverRuns, AVAILABLE_MODELS, loadRunMatrix } from "../runner/config.js";

interface Props {
  onComplete: (config: SetupResult) => void;
}

export interface SetupResult {
  scenarios: Array<{ name: string; path: string }>;
  conditions: Array<{ name: string; pluginPath: string }>;
  models: string[];
  concurrency: number;
  iterations: number;
  loadRunPath?: string; // If set, load this run instead of starting a new one
}

type SetupStep = "mode" | "loadRun" | "rerun" | "loadFile" | "scenarios" | "agents" | "models" | "concurrency" | "iterations" | "confirm";

export function SetupView({ onComplete }: Props) {
  const [step, setStep] = useState<SetupStep>("mode");
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [concurrency, setConcurrency] = useState(3);
  const [iterations, setIterations] = useState(1);
  const [jsonPath, setJsonPath] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const scenarios = discoverScenarios();
  const agents = discoverAgentSetups();

  /** Apply a loaded matrix to pre-populate selections. Returns error message or null. */
  const applyMatrix = (filePath: string): string | null => {
    const matrix = loadRunMatrix(filePath);
    if (!matrix) return `Could not load matrix from: ${filePath}`;

    const availableScenarioNames = new Set(scenarios.map(s => s.name));
    const availableAgentNames = new Set(agents.map(a => a.name));
    const availableModelNames = new Set(AVAILABLE_MODELS);

    const validScenarios = matrix.scenarios.filter(s => availableScenarioNames.has(s));
    const validAgents = matrix.agents.filter(a => availableAgentNames.has(a));
    const validModels = matrix.models.filter(m => availableModelNames.has(m));

    const warnings: string[] = [];
    const missingScenarios = matrix.scenarios.filter(s => !availableScenarioNames.has(s));
    const missingAgents = matrix.agents.filter(a => !availableAgentNames.has(a));
    const missingModels = matrix.models.filter(m => !availableModelNames.has(m));
    if (missingScenarios.length) warnings.push(`Skipped scenarios (not found): ${missingScenarios.join(", ")}`);
    if (missingAgents.length) warnings.push(`Skipped agents (not found): ${missingAgents.join(", ")}`);
    if (missingModels.length) warnings.push(`Skipped models (not available): ${missingModels.join(", ")}`);

    if (validScenarios.length === 0 && validAgents.length === 0 && validModels.length === 0) {
      return `No valid selections found. ${warnings.join(". ")}`;
    }

    setSelectedScenarios(new Set(validScenarios));
    setSelectedAgents(new Set(validAgents));
    setSelectedModels(new Set(validModels));
    setConcurrency(Math.max(1, Math.min(5, matrix.concurrency)));
    setIterations(matrix.iterations);
    setLoadError(warnings.length > 0 ? warnings.join(". ") : null);
    return null;
  };

  // Use useInput for toggle behavior
  useInput((input, _key) => {
    if (input === "a") {
      // Toggle all in current step
      if (step === "scenarios") {
        const allSelected = selectedScenarios.size === scenarios.length;
        setSelectedScenarios(allSelected ? new Set() : new Set(scenarios.map(s => s.name)));
      } else if (step === "agents") {
        const allSelected = selectedAgents.size === agents.length;
        setSelectedAgents(allSelected ? new Set() : new Set(agents.map(c => c.name)));
      } else if (step === "models") {
        const allSelected = selectedModels.size === AVAILABLE_MODELS.length;
        setSelectedModels(allSelected ? new Set() : new Set(AVAILABLE_MODELS));
      }
    } else if (input === "d") {
      // Advance to next step (same as selecting "Done")
      if (step === "scenarios") setStep("agents");
      else if (step === "agents") setStep("models");
      else if (step === "models") setStep("concurrency");
    }
  });

  const renderMultiSelect = (
    items: Array<{ label: string; value: string }>,
    selected: Set<string>,
    onToggle: (value: string) => void,
    onDone: () => void
  ) => {
    return (
      <Box flexDirection="column">
        <Text color="gray">  Space/Enter to toggle, A to select all, D when done</Text>
        <SelectInput
          items={[...items.map(i => ({
            label: `${selected.has(i.value) ? "✓" : "○"} ${i.label}`,
            value: i.value
          })), { label: "── Done ──", value: "__done__" }]}
          onSelect={(item) => {
            if (item.value === "__done__") {
              onDone();
            } else {
              onToggle(item.value);
            }
          }}
        />
      </Box>
    );
  };

  if (step === "mode") {
    const runs = discoverRuns();
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">🏁 Benchmark Dashboard</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "▶ New benchmark run", value: "new" },
              ...(runs.length > 0 ? [
                { label: `📂 Benchmark run status (${runs.length} available)`, value: "load" },
                { label: `🔁 Rerun previous matrix`, value: "rerun" },
              ] : []),
            ]}
            onSelect={(item) => {
              if (item.value === "new") setStep("scenarios");
              else if (item.value === "load") setStep("loadRun");
              else if (item.value === "rerun") setStep("rerun");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === "loadRun") {
    const runs = discoverRuns();
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Select a run to load:</Text>
        <Box marginTop={1} flexDirection="column">
          <SelectInput
            items={[
              ...runs.slice(0, 20).map(r => ({
                label: `${r.name}  (${r.date.toLocaleDateString()} ${r.date.toLocaleTimeString()})`,
                value: r.path,
              })),
              { label: "← Back", value: "__back__" },
            ]}
            onSelect={(item) => {
              if (item.value === "__back__") {
                setStep("mode");
              } else {
                onComplete({
                  scenarios: [],
                  conditions: [],
                  models: [],
                  concurrency: 1,
                  iterations: 1,
                  loadRunPath: item.value,
                });
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === "rerun") {
    const runs = discoverRuns();
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Select a run to rerun:</Text>
        <Text color="gray">  The matrix will be loaded and you can modify it before starting.</Text>
        <Box marginTop={1} flexDirection="column">
          <SelectInput
            items={[
              ...runs.slice(0, 20).map(r => ({
                label: `${r.name}  (${r.date.toLocaleDateString()} ${r.date.toLocaleTimeString()})`,
                value: r.path,
              })),
              { label: "📄 Load from JSON file", value: "__file__" },
              { label: "← Back", value: "__back__" },
            ]}
            onSelect={(item) => {
              if (item.value === "__back__") {
                setStep("mode");
              } else if (item.value === "__file__") {
                setJsonPath(""); setLoadError(null); setStep("loadFile");
              } else {
                const metaPath = join(item.value, "run-meta.json");
                const err = applyMatrix(metaPath);
                if (err) {
                  setLoadError(err);
                  setStep("mode");
                } else {
                  setStep("confirm");
                }
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === "loadFile") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Enter path to matrix JSON file:</Text>
        <Text color="gray">  File should have: scenarios, agents, models, concurrency, iterations</Text>
        <Box marginTop={1}>
          <Text color="green">{'> '}</Text>
          <TextInput
            value={jsonPath}
            onChange={setJsonPath}
            onSubmit={(value) => {
              const trimmed = value.trim().replace(/^["']|["']$/g, "");
              const err = applyMatrix(trimmed);
              if (err) {
                setLoadError(err);
              } else {
                setStep("confirm");
              }
            }}
          />
        </Box>
        {loadError && (
          <Box marginTop={1}>
            <Text color="red">Error: {loadError}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="gray">  Press Enter to load, or Ctrl+C to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (step === "scenarios") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Select Scenarios:</Text>
        {renderMultiSelect(
          scenarios.map(s => ({
            label: s.config.description ? `${s.name}  ${"\x1b[90m"}${s.config.description}${"\x1b[39m"}` : s.name,
            value: s.name
          })),
          selectedScenarios,
          (v) => {
            const next = new Set(selectedScenarios);
            next.has(v) ? next.delete(v) : next.add(v);
            setSelectedScenarios(next);
          },
          () => setStep("agents")
        )}
      </Box>
    );
  }

  if (step === "agents") {
    if (agents.length === 0) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="red">No agents found.</Text>
          <Text color="gray">Add agent folders to src/agents/ with a config.json,</Text>
          <Text color="gray">or set agentsetups.root in common/config.json to point to an agent directory.</Text>
          <Text> </Text>
          <Text color="gray">Example: src/agents/my-agent/config.json</Text>
          <Text color="gray">{'{'} "description": "My agent", "preset_scripts": ["run-dotnetnew-winui"], ... {'}'}</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Select Agents to Benchmark:</Text>
        {renderMultiSelect(
          agents.map(c => {
            let label = c.name;
            if (c.config?.preset_scripts && c.config.preset_scripts.length > 0) {
              label += ` [${c.config.preset_scripts.length} script${c.config.preset_scripts.length > 1 ? 's' : ''}]`;
            }
            if (c.config?.description) {
              label += `  ${"\x1b[90m"}${c.config.description}${"\x1b[39m"}`;
            }
            return { label, value: c.name };
          }),
          selectedAgents,
          (v) => {
            const next = new Set(selectedAgents);
            next.has(v) ? next.delete(v) : next.add(v);
            setSelectedAgents(next);
          },
          () => setStep("models")
        )}
      </Box>
    );
  }

  if (step === "models") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Select Models:</Text>
        {renderMultiSelect(
          AVAILABLE_MODELS.map(m => ({ label: m, value: m })),
          selectedModels,
          (v) => {
            const next = new Set(selectedModels);
            next.has(v) ? next.delete(v) : next.add(v);
            setSelectedModels(next);
          },
          () => setStep("concurrency")
        )}
      </Box>
    );
  }

  if (step === "concurrency") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Parallel runs (default: 3):</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "1 (sequential)", value: "1" },
              { label: "2", value: "2" },
              { label: "3 (default)", value: "3" },
              { label: "4", value: "4" },
              { label: "5", value: "5" },
            ]}
            initialIndex={2}
            onSelect={(item) => {
              setConcurrency(parseInt(item.value));
              setStep("iterations");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === "iterations") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Iterations per run (results get averaged):</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "1 (no repeat)", value: "1" },
              { label: "2", value: "2" },
              { label: "3 (recommended for variance)", value: "3" },
              { label: "5", value: "5" },
            ]}
            onSelect={(item) => {
              setIterations(parseInt(item.value));
              setStep("confirm");
            }}
          />
        </Box>
      </Box>
    );
  }

  // Confirm step
  const selectedAgentItems = agents.filter(c => selectedAgents.has(c.name));
  const totalRuns = selectedScenarios.size * selectedAgents.size * selectedModels.size;
  const totalWithIter = totalRuns * iterations;
  
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Confirm Benchmark Matrix:</Text>
      {loadError && (
        <Box marginTop={1}>
          <Text color="yellow">⚠ {loadError}</Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        <Text>  Scenarios:   {[...selectedScenarios].join(", ")}</Text>
        <Text>  Agents:</Text>
        {selectedAgentItems.map(c => (
          <Text key={c.name} color="white">    • {c.name}{c.config?.description ? <Text color="gray">  {c.config.description}</Text> : null}</Text>
        ))}
        <Text>  Models:      {[...selectedModels].join(", ")}</Text>
        <Text>  Parallel:    {concurrency}</Text>
        <Text>  Iterations:  {iterations}{iterations > 1 ? " (results averaged)" : ""}</Text>
        <Text bold color="yellow">  Total: {totalWithIter} runs ({totalRuns} unique × {iterations} iter, ~{Math.round(totalWithIter * 30 / 60 / concurrency)}-{Math.round(totalWithIter * 45 / 60 / concurrency)}h with {concurrency} parallel)</Text>
      </Box>
      <Box marginTop={1}>
        <SelectInput
          items={[
            { label: "▶ Start benchmark", value: "start" },
            { label: "← Edit scenarios", value: "scenarios" },
            { label: "← Edit agents", value: "agents" },
            { label: "← Edit models", value: "models" },
            { label: "← Edit parallel/iterations", value: "concurrency" },
            { label: "← Back to start", value: "mode" },
          ]}
          onSelect={(item) => {
            if (item.value === "start") {
              onComplete({
                scenarios: scenarios.filter(s => selectedScenarios.has(s.name)).map(s => ({ name: s.name, path: s.path })),
                conditions: selectedAgentItems.map(c => ({ name: c.name, pluginPath: c.path })),
                models: [...selectedModels],
                concurrency,
                iterations
              });
            } else {
              setStep(item.value as SetupStep);
            }
          }}
        />
      </Box>
    </Box>
  );
}
