import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { discoverScenarios, discoverCandidates, discoverRuns, AVAILABLE_MODELS } from "../runner/config.js";

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

type SetupStep = "mode" | "loadRun" | "scenarios" | "agents" | "models" | "concurrency" | "iterations" | "confirm";

export function SetupView({ onComplete }: Props) {
  const [step, setStep] = useState<SetupStep>("mode");
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [concurrency, setConcurrency] = useState(3);
  const [iterations, setIterations] = useState(1);
  
  const scenarios = discoverScenarios();
  const agents = discoverCandidates();

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
              ...(runs.length > 0 ? [{ label: `📂 Load previous run (${runs.length} available)`, value: "load" }] : []),
            ]}
            onSelect={(item) => {
              if (item.value === "new") setStep("scenarios");
              else setStep("loadRun");
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
            { label: "← Back to setup", value: "back" }
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
              setStep("scenarios");
            }
          }}
        />
      </Box>
    </Box>
  );
}
