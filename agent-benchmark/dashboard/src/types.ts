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
  pluginPath: string;
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
  tokenDisplay?: string; // Rich real-time display: "out: 37.8k (main: 35k, subs: 2.8k)"
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
  conditions?: {
    starter?: { template_command: string; prompt_addendum: string };
    agentsetup?: {
      template_command: string;
      prompt_addendum: string;
    };
  };
  agentsetups?: { root: string };
  build: { command: string; fallback_command?: string };
}

export type ScriptEntry = string | { name: string; timeout_minutes?: number };

export interface AgentSetupConfig {
  description?: string;
  skills?: { include?: string[]; exclude?: string[]; all?: boolean };
  mcp?: { include?: string[]; exclude?: string[]; all?: boolean };
  preset_scripts?: ScriptEntry[];
  /** Custom scaffold command (e.g., "duct.exe new {app_name}"). Replaces dotnet new winui. */
  scaffold_command?: string;
  /** Custom build command. Replaces MSBuild/dotnet build. */
  build_command?: string;
  /** Custom launch command (e.g., "npm start"). Replaces default winapp flow. */
  launch_command?: string;
  /** App name for window detection when using launch_command. */
  launch_detect?: string;
  /** Framework hint appended to prompt if not already present (e.g., "WinUI 3"). */
  framework_hint?: string;
  /** Launch mode: "packaged" (default) or "unpackaged" (direct exe launch). */
  launch_mode?: "packaged" | "unpackaged";
  /** Extra text appended to the prompt for this agent setup. */
  prompt_addendum?: string;
  /** Sections for slot-based agent assembly. */
  sections?: string[];
  /** Root directory for section .md files. */
  sections_root?: string;
  /** Whether to inline skill content into agent.md. */
  inline_skills?: boolean;
  /** When false, skip appending condition+iteration suffix to the app name (default: true). */
  unique_app_name?: boolean;
  /** Directory containing hook scripts to install (relative to agent setup root). */
  hooks?: string;
  /** v2: Path to a pre-built agent.md file (relative to repo root). Skips section composition. */
  agent?: string;
  /** v2: Skills to explicitly mention in the user prompt ("use the X skill"). */
  prompt_skills?: string[];
  /** v2: dotnet new template name for scaffolding (e.g., "winui-mvvm"). */
  scaffold?: string;
}

export interface AgentSetupInfo {
  name: string;
  path: string;  // path to the agent variant folder (src/agents/<name>/)
  config?: AgentSetupConfig;
}

export type ViewName = "setup" | "live" | "progress" | "results" | "charts" | "summary";
