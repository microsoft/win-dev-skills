"""A bounded, headless, explicitly supervised UWP migration experiment."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import json
import math
import os
from pathlib import Path
import random
import shutil
import sys
import uuid
import xml.etree.ElementTree as ET

from support import append_jsonl, file_hashes, read_json, run_process, sha256, utc_now, write_json

HERE = Path(__file__).resolve().parent
ARMS = ("B", "T", "L", "F")
TOOLCHAIN = {"copilot": "1.0.83", "winapp": "0.6.1", "dotnet": "10.0.401"}
TASK = """Migrate the complete supplied C# UWP XamlDeferLoadStrategy sample to WinUI 3.
Original source is under source\\Samples\\XamlDeferLoadStrategy\\cs with its shared
dependencies preserved under source. The fixed empty target is target\\BenchmarkApp.csproj.
Preserve all three pages, source labels, navigation, assets, bindings, deferred loading,
Realize Elements/FindName behavior and responsive pane visibility. Do not add an unload
toggle or handlers absent from the source. Do not simplify, remove functionality or redesign it.
Use the supplied target scaffold; keep its pinned SDK/package versions, project path,
package identity and Release/x64 configuration. You may edit its code and add source
files. Include all linked source/resources needed for a complete working migration.
Do migration/bootstrap work now; it has not been done for you.

Read and use your assigned interface below, then implement and build the migration.
The common WinUI skills and tools are available in .treatment\\agent-plugin.
Do not launch/register/unregister any app or interact with the desktop; an independent
evaluator will do that after you stop. Do not edit original source or treatment files.
Do not read outside this workspace, inspect other attempts or access evaluator material.
Do not search GitHub for an existing migration or change GitHub/browser state. No
git push, gh mutation, telemetry upload, install/upgrade, elevation, reboot, or machine
configuration changes. Do not read or print credentials. Use inherited approved
authentication only. Keep any build output within this workspace. Stop when complete
or explain the exact blocker; never claim unobserved behavior passed.
"""
INTERFACES = {
    "B": "Use the common WinUI development interface; no migration-specific package is supplied.",
    "T": "Read and use .treatment\\agent-plugin\\skills\\winui-uwp-migration\\SKILL.md as your migration interface.",
    "L": "Read and use .treatment\\agent-plugin\\skills\\winui-uwp-migration\\SKILL.md as your migration interface.",
    "F": "Read and use .treatment\\agent-plugin\\skills\\winui-uwp-migration\\SKILL.md as your migration interface.",
}
LIMITATIONS = [
    "Supervised local pilot, not an access-controlled disposable VM or clean-image causal experiment.",
    "COPILOT_HOME and CLI permissions isolate normal context/state, not hostile shell filesystem access.",
    "OS authentication, machine policies, NuGet/build caches and server-side prompt caches are shared.",
    "The agent phase is build-only; deployment/UI are reserved for independent evaluation, not agent repair.",
    "UWP oracle is source-derived until a recorded original-app interaction calibration is supplied.",
    "One public sample family and tiny repeats cannot establish package superiority or noninferiority.",
]


def _external_root(root: Path) -> Path:
    root = root.resolve()
    if root == HERE or HERE in root.parents or any((p / ".git").exists() for p in (root, *root.parents)):
        raise ValueError("Experiment root must be outside every Git checkout to avoid context contamination")
    return root


def _snapshot_scaffold(source: Path, target: Path):
    excluded = {"bin", "obj", ".git", ".vs", ".copilot"}
    forbidden = {".env", "nuget.config"}
    projects = list(source.glob("*.csproj"))
    if len(projects) != 1:
        raise ValueError("Scaffold must contain exactly one root .csproj")
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if any(part in excluded for part in relative.parts):
            continue
        if path.is_symlink() or path.is_junction():
            raise ValueError(f"Scaffold symlink not allowed: {relative}")
        if path.name.lower() in forbidden or path.suffix.lower() in {".pfx", ".snk"}:
            raise ValueError(f"Do not copy config/credentials/signing keys into a scaffold: {relative}")
        if path.is_file():
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)
    project = ET.parse(target / projects[0].name)
    for package in project.getroot().iter("PackageReference"):
        version = package.get("Version") or package.findtext("Version")
        if not version or any(char in version for char in "*[](),$"):
            raise ValueError(f"PackageReference must have an explicit version: {package.attrib}")
    sdk = read_json(target / "global.json") if (target / "global.json").exists() else None
    if sdk is None:
        write_json(target / "global.json", {"sdk": {"version": TOOLCHAIN["dotnet"], "rollForward": "disable"}})
    elif sdk.get("sdk", {}).get("version") != TOOLCHAIN["dotnet"] or sdk["sdk"].get("rollForward") != "disable":
        raise ValueError("Scaffold global.json must freeze dotnet 10.0.401 with rollForward disable")
    return file_hashes(target)


def project_contract(path: Path) -> dict:
    document = ET.parse(path).getroot()
    return {
        "packages": sorted((element.get("Include") or element.get("Update"),
                            element.get("Version") or element.findtext("Version"))
                           for element in document.iter("PackageReference")),
        "target_framework": [element.text for element in document.iter("TargetFramework")],
    }


def prepare(root: Path, scaffold: Path, preflight_record: Path | None = None) -> dict:
    from materialize import materialize_experiment, validate_materialization
    root = _external_root(root)
    if root.exists() and any(root.iterdir()):
        raise ValueError("Preparation requires an empty experiment root")
    root.mkdir(parents=True, exist_ok=True)
    materialize_experiment(root)
    validate_materialization(root)
    scaffold_hashes = _snapshot_scaffold(scaffold.resolve(), root / "inputs" / "scaffold")
    project_name = next((root / "inputs" / "scaffold").glob("*.csproj")).name
    if preflight_record:
        write_json(root / "coordinator-preflight.json", read_json(preflight_record))
    record = {
        "schema_version": 1, "prepared_at": utc_now(), "toolchain": TOOLCHAIN,
        "scaffold_hashes": scaffold_hashes,
        "target_project": project_name,
        "project_contract": project_contract(root / "inputs" / "scaffold" / project_name),
        "coordinator_preflight_sha256": sha256(root / "coordinator-preflight.json") if preflight_record else None,
        "source_hashes": file_hashes(root / "inputs" / "source"),
        "treatment_hashes": {arm: file_hashes(root / "treatments" / arm / "agent-plugin") for arm in ARMS},
        "materialization_sha256": sha256(root / "materialization.json"),
        "source_unchanged": True, "limitations": LIMITATIONS,
    }
    write_json(root / "prepared.json", record)
    return record


def harness_hashes() -> dict:
    paths = [*HERE.glob("*.py"), *HERE.glob("*.ps1"), *HERE.glob("scenarios\\*.json")]
    return {p.relative_to(HERE).as_posix(): sha256(p) for p in sorted(paths)}


def plan(root: Path, *, model: str, effort: str, context: str, credits: float,
         seconds: int, repeats: int, seed: int) -> dict:
    root = _external_root(root)
    if model.lower() in {"auto", "latest", ""}:
        raise ValueError("An explicit model is required")
    if not math.isfinite(credits) or credits < 30 or seconds <= 0 or repeats < 1 or repeats > 3:
        raise ValueError("Require credits >=30, positive seconds, and 1-3 explicitly budgeted repeats")
    prepared = read_json(root / "prepared.json")
    validate_inputs(root, prepared)
    scenario = read_json(HERE / "scenarios" / "xaml-defer-load.json")
    rng = random.Random(seed)
    schedule = []
    experiment_id = str(uuid.uuid4())
    for repeat in range(1, repeats + 1):
        order = list(ARMS)
        rng.shuffle(order)
        for arm in order:
            attempt_id = f"r{repeat}-{arm}"
            schedule.append({
                "id": attempt_id, "arm": arm, "repeat": repeat,
                "scenario": "xaml-defer-load", "model": model,
                "package_identity": f"UwpSkillValue.{uuid.uuid5(uuid.UUID(experiment_id), attempt_id).hex}",
            })
    record = {
        "schema_version": 1, "id": experiment_id, "created_at": utc_now(),
        "lane": "forced-interface-supervised-local-plumbing", "seed": seed,
        "model": model, "effort": effort, "context": context, "credits": credits,
        "seconds": seconds, "repeats": repeats, "schedule": schedule,
        "toolchain": TOOLCHAIN, "prepared_sha256": sha256(root / "prepared.json"),
        "target_project": prepared["target_project"],
        "project_contract": prepared["project_contract"],
        "coordinator_preflight": read_json(root / "coordinator-preflight.json")
        if prepared.get("coordinator_preflight_sha256") else None,
        "harness_hashes": harness_hashes(), "scenario": scenario,
        "prompt_common": TASK.replace("BenchmarkApp.csproj", prepared["target_project"]),
        "prompt_interfaces": INTERFACES,
        "planned_max_agent_seconds": seconds * len(schedule),
        "planned_soft_credit_limits_sum": credits * len(schedule),
        "limitations": LIMITATIONS,
        "stopping_rule": "Run saved schedule once; no selective retries. Any replacement requires a new experiment.",
        "primary_contrasts": ["F-B", "T-B", "L-T", "F-L"],
        "claim": "Plumbing and descriptive pilot only; no inferential benefit claim.",
    }
    write_json(root / "experiment.json", record)
    for relative in record["harness_hashes"]:
        destination = root / "harness-snapshot" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HERE / relative, destination)
    return record


def validate_inputs(root: Path, prepared: dict) -> None:
    if sha256(root / "materialization.json") != prepared["materialization_sha256"]:
        raise ValueError("Materialization manifest changed")
    if (prepared.get("coordinator_preflight_sha256")
            and sha256(root / "coordinator-preflight.json") != prepared["coordinator_preflight_sha256"]):
        raise ValueError("Coordinator preflight record changed")
    for label, path, expected in (
        ("source", root / "inputs" / "source", prepared["source_hashes"]),
        ("scaffold", root / "inputs" / "scaffold", prepared["scaffold_hashes"]),
        *((arm, root / "treatments" / arm / "agent-plugin", prepared["treatment_hashes"][arm]) for arm in ARMS),
    ):
        if file_hashes(path) != expected:
            raise ValueError(f"Frozen {label} input changed")


def validate_plan(root: Path) -> dict:
    experiment = read_json(root / "experiment.json")
    if sha256(root / "prepared.json") != experiment["prepared_sha256"]:
        raise ValueError("Preparation changed after scheduling")
    if harness_hashes() != experiment["harness_hashes"]:
        raise ValueError("Harness changed after scheduling; create a new experiment, do not rewrite evidence")
    validate_inputs(root, read_json(root / "prepared.json"))
    return experiment


@contextmanager
def desktop_lock(root: Path):
    """An exclusive per-experiment lock; coordinator must also reserve the desktop."""
    lock = root / "active.lock"
    with lock.open("x", encoding="utf-8") as stream:
        json.dump({"pid": os.getpid(), "started_at": utc_now()}, stream)
    try:
        yield
    finally:
        lock.unlink()


def _identity(workspace: Path, name: str) -> dict:
    manifests = list((workspace / "target").rglob("Package.appxmanifest"))
    if len(manifests) != 1:
        raise ValueError("Exactly one package manifest is required for isolated app identity")
    path = manifests[0]
    original = sha256(path)
    text = path.read_text(encoding="utf-8-sig")
    import re
    modified, count = re.subn(r'(<Identity\b[^>]*\bName=")[^"]+(")', rf'\g<1>{name}\2', text, count=1)
    if count != 1:
        raise ValueError("Package Identity Name attribute missing")
    path.write_text(modified, encoding="utf-8", newline="")
    return {
        "path": path.relative_to(workspace).as_posix(), "name": name,
        "before_sha256": original, "after_sha256": sha256(path),
        "intentional_difference": "Only Package Identity Name is unique per scheduled trial; no shared app data.",
    }


def _environment(home: Path, workspace: Path) -> dict:
    env = dict(os.environ)
    for key in list(env):
        if key.startswith(("COPILOT_", "OTEL_")) and key not in {"COPILOT_GITHUB_TOKEN"}:
            del env[key]
    env.update({
        "COPILOT_HOME": str(home), "COPILOT_AUTO_UPDATE": "false",
        "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "POWERSHELL_TELEMETRY_OPTOUT": "1",
        "TEMP": str(workspace / ".tmp"), "TMP": str(workspace / ".tmp"),
    })
    return env


def copilot_command(experiment: dict, workspace: Path, evidence: Path, arm: str) -> list[str]:
    executable = shutil.which("copilot")
    if not executable:
        raise FileNotFoundError("copilot executable not found")
    return [
        executable, "--plugin-dir", str(workspace / ".treatment" / "agent-plugin"),
        "--agent", "winui:winui-dev", "--model", experiment["model"],
        "--reasoning-effort", experiment["effort"], "--context", experiment["context"],
        "--no-auto-update", "--no-custom-instructions", "--no-remote-export",
        "--disable-builtin-mcps", "--no-ask-user", "--allow-all-tools",
        "--disallow-temp-dir", "--no-bash-env",
        "--deny-tool=shell(gh:*)", "--deny-tool=shell(git push:*)",
        "--secret-env-vars=COPILOT_GITHUB_TOKEN,GH_TOKEN,GITHUB_TOKEN",
        "--max-ai-credits", str(experiment["credits"]), "--output-format", "json",
        "--usage-output-file", str(evidence / "usage.json"),
        "--log-dir", str(evidence / "logs"), "--share=" + str(evidence / "session.md"),
        "-p", experiment["prompt_common"] + "\nAssigned interface:\n" + experiment["prompt_interfaces"][arm],
    ]


def check_toolchain(evidence: Path, cwd: Path) -> dict:
    evidence.mkdir(parents=True, exist_ok=False)
    probes = {}
    for tool, version in TOOLCHAIN.items():
        executable = shutil.which(tool)
        if executable is None:
            probes[tool] = {"status": "blocked", "reason": "Executable missing"}
            continue
        result = run_process([executable, "--version"], cwd=cwd,
                             evidence_dir=evidence / tool, timeout_seconds=30)
        output = Path(result["stdout"]).read_text(encoding="utf-8-sig").strip()
        actual = output.removeprefix("GitHub Copilot CLI ").splitlines()[0].rstrip(".") if output else None
        probes[tool] = {
            "status": "pass" if result["exit_code"] == 0 and actual == version else "blocked",
            "expected": version, "actual": actual, "process": result,
        }
    record = {
        "created_at": utc_now(), "status": "pass" if all(p["status"] == "pass" for p in probes.values()) else "blocked",
        "versions": probes, "model_availability": "not_probed_no_model_call",
        "desktop": "requires explicit coordinator reservation", "limitations": LIMITATIONS,
    }
    write_json(evidence / "preflight.json", record)
    return record


def preflight(root: Path) -> dict:
    """Version probes only: no model invocation, package registration, or installation."""
    root = _external_root(root)
    return check_toolchain(root / ("preflight-" + uuid.uuid4().hex[:8]), root)


def _run_attempt_impl(root: Path, attempt_id: str, *, supervised_local: bool) -> dict:
    from report import collect_usage
    if not supervised_local:
        raise ValueError("This pilot requires explicit --supervised-local acknowledgment; not a sandbox")
    root = _external_root(root)
    experiment = validate_plan(root)
    rows = [row for row in experiment["schedule"] if row["id"] == attempt_id]
    if len(rows) != 1:
        raise ValueError("Attempt must occur exactly once in the saved schedule")
    row = rows[0]
    previous = experiment["schedule"][:experiment["schedule"].index(row)]
    if any(not (root / "e" / entry["id"] / "attempt.json").exists() for entry in previous):
        raise ValueError("Run the saved randomized order; a previous scheduled attempt is unfinished")
    with desktop_lock(root):
        evidence = root / "e" / attempt_id
        evidence.mkdir(parents=True, exist_ok=False)
        write_json(evidence / "started.json", {**row, "started_at": utc_now()})
        append_jsonl(root / "attempts.jsonl", {"event": "started", **row, "at": utc_now()})
        workspace = root / "w" / attempt_id
        home = root / "h" / attempt_id
        home.mkdir(parents=True, exist_ok=False)
        workspace.mkdir(parents=True, exist_ok=False)
        (workspace / ".tmp").mkdir()
        shutil.copytree(root / "inputs" / "source", workspace / "source")
        shutil.copytree(root / "inputs" / "scaffold", workspace / "target")
        shutil.copytree(root / "treatments" / row["arm"] / "agent-plugin", workspace / ".treatment" / "agent-plugin")
        identity = _identity(workspace, row["package_identity"])
        write_json(evidence / "identity.json", identity)
        write_json(evidence / "input-hashes.json", file_hashes(workspace))
        toolchain = check_toolchain(evidence / "toolchain", workspace / "target")
        if toolchain["status"] == "pass":
            process = run_process(
                copilot_command(experiment, workspace, evidence, row["arm"]), cwd=workspace,
                evidence_dir=evidence / "agent", timeout_seconds=experiment["seconds"],
                env=_environment(home, workspace),
            )
        else:
            process = {"exit_code": None, "timed_out": False, "error": "Pinned toolchain unavailable",
                       "elapsed_seconds": 0, "started_at": utc_now(), "ended_at": utc_now()}
        usage = collect_usage(evidence, home)
        status, reason = "unverified", "Awaiting independent evaluation"
        if process["error"]:
            status, reason = "infra_error", process["error"]
        elif process["timed_out"]:
            status, reason = "timeout", "Hard agent wall-clock budget exceeded"
        elif process["exit_code"] != 0:
            status, reason = "fail", f"Agent native exit {process['exit_code']}"
        if toolchain["status"] != "pass":
            status, reason = "blocked", "Pinned toolchain unavailable; model was not invoked"
        prepared = read_json(root / "prepared.json")
        if (file_hashes(workspace / "source") != prepared["source_hashes"]
                or file_hashes(workspace / ".treatment" / "agent-plugin") != prepared["treatment_hashes"][row["arm"]]):
            status, reason = "invalid", "Agent modified immutable source or treatment"
        try:
            current_contract = project_contract(workspace / "target" / experiment["target_project"])
            # JSON round-trip gives the same array representation as the persisted contract.
            if json.loads(json.dumps(current_contract)) != experiment["project_contract"]:
                status, reason = "invalid", "Agent changed frozen package versions or target framework"
            if sha256(workspace / "target" / "global.json") != prepared["scaffold_hashes"]["global.json"]:
                status, reason = "invalid", "Agent changed pinned SDK"
            package = ET.parse(workspace / identity["path"]).getroot()
            identity_node = package.find("{http://schemas.microsoft.com/appx/manifest/foundation/windows10}Identity")
            if identity_node is None or identity_node.get("Name") != identity["name"]:
                status, reason = "invalid", "Agent changed run-owned package identity"
        except (OSError, ET.ParseError) as error:
            status, reason = "invalid", f"Broken output project contract: {error}"
        # Store the deliverable separately; no evaluator ever repairs this directory.
        frozen = evidence / "frozen-output"
        output_hashes, capture_error = None, None
        try:
            for path in (workspace / "target").rglob("*"):
                if path.is_symlink() or path.is_junction():
                    raise ValueError(f"Output contains a linked path; refusing to copy: {path}")
            shutil.copytree(workspace / "target", frozen, ignore=shutil.ignore_patterns("bin", "obj", ".vs"))
            output_hashes = file_hashes(frozen)
        except (OSError, ValueError) as error:
            status, reason = "invalid", f"Could not freeze deliverable: {error}"
            capture_error = str(error)
        record = {
            **row, "schema_version": 1, "experiment_id": experiment["id"],
            "status": status, "reason": reason, "process": process, "usage": usage,
            "toolchain": toolchain,
            "identity": identity, "output_hashes": output_hashes, "capture_error": capture_error,
            "frozen_output": str(frozen) if output_hashes is not None else None, "ended_at": utc_now(),
            "experiment_sha256": sha256(root / "experiment.json"),
            "limitations": LIMITATIONS,
        }
        write_json(evidence / "attempt.json", record)
        append_jsonl(root / "attempts.jsonl", {"event": "finished", "id": attempt_id, "status": status, "at": utc_now()})
        return record


def run_attempt(root: Path, attempt_id: str, *, supervised_local: bool) -> dict:
    try:
        return _run_attempt_impl(root, attempt_id, supervised_local=supervised_local)
    except (Exception, KeyboardInterrupt) as error:
        evidence = root.resolve() / "e" / attempt_id
        started = evidence / "started.json"
        if not started.exists() or (evidence / "attempt.json").exists():
            raise
        from report import collect_usage
        process_file = evidence / "agent" / "process.json"
        try:
            usage = collect_usage(evidence, root.resolve() / "h" / attempt_id)
        except (OSError, ValueError, KeyError) as usage_error:
            usage = {"ai_credits": None, "error": str(usage_error)}
        record = {
            **read_json(started), "status": "infra_error",
            "reason": f"{type(error).__name__}: {error}",
            "cancelled": isinstance(error, KeyboardInterrupt),
            "process": read_json(process_file) if process_file.exists() else None,
            "usage": usage, "output_hashes": None, "frozen_output": None,
            "ended_at": utc_now(), "capture_error": "Attempt interrupted before output freeze",
        }
        write_json(evidence / "attempt.json", record)
        append_jsonl(root / "attempts.jsonl", {"event": "finished", "id": attempt_id,
                                           "status": "infra_error", "at": utc_now(), "reason": record["reason"]})
        if isinstance(error, KeyboardInterrupt):
            raise
        return record


def evaluate(root: Path, attempt_id: str, *, desktop_reserved: bool) -> dict:
    from evaluator import evaluate_attempt
    if not desktop_reserved:
        raise ValueError("Evaluation requires --desktop-reserved from the desktop coordinator")
    root = _external_root(root)
    experiment = validate_plan(root)
    evidence = root / "e" / attempt_id
    attempt = read_json(evidence / "attempt.json")
    frozen = evidence / "frozen-output"
    if attempt.get("output_hashes") is None:
        raise ValueError("No frozen deliverable exists; attempt remains invalid/unverified")
    if file_hashes(frozen) != attempt["output_hashes"]:
        raise ValueError("Frozen deliverable changed after agent termination")
    if (evidence / "evaluation.json").exists():
        raise ValueError("Evaluation evidence is immutable; do not retry selectively")
    with desktop_lock(root):
        result = evaluate_attempt(root / "w" / attempt_id, evidence,
                                  {**experiment["scenario"], "target_project": experiment["target_project"],
                                   "allow_desktop": True})
        if file_hashes(frozen) != attempt["output_hashes"]:
            raise ValueError("Evaluator modified frozen deliverable")
        write_json(evidence / "evaluation.json", result)
        append_jsonl(root / "attempts.jsonl", {"event": "evaluated", "id": attempt_id,
                                           "status": result["status"], "at": utc_now()})
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("prepare", "preflight", "plan", "run", "evaluate", "report"):
        command = commands.add_parser(name)
        command.add_argument("--root", required=True, type=Path)
        if name == "prepare":
            command.add_argument("--scaffold", required=True, type=Path)
            command.add_argument("--preflight-record", type=Path)
        elif name == "plan":
            command.add_argument("--model", required=True)
            command.add_argument("--effort", required=True, choices=("low", "medium", "high", "xhigh"))
            command.add_argument("--context", required=True, choices=("default", "long_context"))
            command.add_argument("--credits", required=True, type=float)
            command.add_argument("--seconds", required=True, type=int)
            command.add_argument("--repeats", required=True, type=int)
            command.add_argument("--seed", required=True, type=int)
        elif name in {"run", "evaluate"}:
            command.add_argument("--attempt", required=True)
            command.add_argument("--supervised-local" if name == "run" else "--desktop-reserved", action="store_true")
    args = parser.parse_args()
    if args.command == "prepare":
        result = prepare(args.root, args.scaffold, args.preflight_record)
    elif args.command == "preflight":
        result = preflight(args.root)
    elif args.command == "plan":
        result = plan(args.root, model=args.model, effort=args.effort, context=args.context,
                      credits=args.credits, seconds=args.seconds, repeats=args.repeats, seed=args.seed)
    elif args.command == "run":
        result = run_attempt(args.root, args.attempt, supervised_local=args.supervised_local)
    elif args.command == "evaluate":
        result = evaluate(args.root, args.attempt, desktop_reserved=args.desktop_reserved)
    else:
        from report import build_report, render_report
        result = build_report(args.root)
        destination = args.root / "reports" / uuid.uuid4().hex[:8]
        write_json(destination / "report.json", result)
        with (destination / "report.md").open("x", encoding="utf-8") as stream:
            stream.write(render_report(result))
        print(f"Report: {destination}")
    if args.command == "plan":
        summary = {key: result[key] for key in ("id", "schedule", "planned_max_agent_seconds",
                                               "planned_soft_credit_limits_sum")}
    elif args.command in {"run", "evaluate", "preflight"}:
        summary = {key: result[key] for key in ("id", "status", "reason") if key in result}
    elif args.command == "prepare":
        summary = {"root": str(args.root), "target_project": result["target_project"],
                   "source_files": len(result["source_hashes"]),
                   "scaffold_files": len(result["scaffold_hashes"])}
    else:
        summary = result
    print(json.dumps(summary, indent=2, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
