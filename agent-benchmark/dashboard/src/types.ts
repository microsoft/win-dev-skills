export type RunStatus =
  | "queued"
  | "setup"
  | "building"
  | "build_done"
  | "dotnet_build"
  | "launching"
  | "validating"
  | "retrospective"
  | "done"
  | "failed"
  | "timeout";

export interface RunEntry {
  id: string;
  scenario: string;
  scenarioPath: string;
  scenarioConfigName: string;
  condition: string;
  conditionType: "bare" | "starter" | "candidate" | "electron";
  pluginPath?: string;
  model: string;
  trialName: string;
  iteration?: number;
  totalIterations?: number;
  status: RunStatus;
  score?: number;
  qualityBreakdown?: string; // "quality:functionality" split e.g. "42:38"
  builds?: boolean;
  runs?: boolean;
  sessionTime?: string;
  apiTime?: string;
  codeChanges?: string;
  inputTokens?: string;
  outputTokens?: string;
  cachedTokens?: string;
  failReason?: string;
  currentOutput: string;
  startedAt?: Date;
  finishedAt?: Date;
  buildSessionId?: string;
  validationSessionId?: string;
}

export interface ScenarioConfig {
  name: string;
  description: string;
  type: "new" | "convert" | "improve";
  app_name?: string;
  requirements?: string[];
  test_notes?: string;
  test_assets?: Array<{
    name: string;
    path: string;
    description?: string;
    include_in_build?: boolean;
  }>;
  original_app?: {
    source_dir?: string;
    build_command?: string;
    run_command?: string;
    run_args?: string;
    app_name?: string;
  };
}

export interface GlobalConfig {
  conditions: {
    starter?: { template_command: string; prompt_addendum: string };
    plugin?: { install_path: string; prompt_addendum: string };
    candidate?: {
      template_command: string;
      clean_template_instructions: boolean;
      prompt_addendum: string;
    };
  };
  candidates?: { root: string };
  build: { command: string; fallback_command?: string; csproj_pattern: string };
  run: { command: string; run_args: string };
}

export interface CandidateConfig {
  description?: string;
  skills: { include?: string[]; exclude?: string[]; all?: boolean };
  mcp: { include?: string[]; exclude?: string[]; all?: boolean };
}

export interface CandidateInfo {
  name: string;
  path: string;  // path to the agent variant folder (src/agents/<name>/)
  config?: CandidateConfig;
}

export type ViewName = "setup" | "live" | "progress" | "results" | "charts" | "summary";
