"""Independent, fail-closed evaluator for the single frozen deferral scenario.

No candidate validator is executed. Build and UI evaluation operate on a separate
copy; the agent's delivered workspace is hashed before and after, never repaired.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import struct
from pathlib import Path

from support import file_hashes, run_process, sha256, utc_now, write_json

HERE = Path(__file__).resolve().parent
SCENARIO_FILE = HERE / "scenarios" / "xaml-defer-load.json"
UI_SCRIPT = HERE / "evaluate-defer-load.ps1"
STATUSES = {"pass", "fail", "not_run", "blocked"}
UI_IDS = (
    "launch_exit", "launch_identity", "launch_survival", "startup_content",
    "basic_initial", "basic_realize", "basic_repeat", "adaptive_narrow",
    "adaptive_tablet", "adaptive_desktop", "adaptive_shrink", "adaptive_reexpand",
    "template_content", "basic_navigation_reset", "basic_navigation_realize",
    "template_repeat", "screenshots", "cleanup",
)
UI_STATES = {
    "startup_content": "startup", "basic_initial": "basic-initial",
    "basic_realize": "basic-realized", "basic_repeat": "basic-repeated",
    "adaptive_narrow": "adaptive-narrow", "adaptive_tablet": "adaptive-tablet",
    "adaptive_desktop": "adaptive-desktop", "adaptive_shrink": "adaptive-shrunk",
    "adaptive_reexpand": "adaptive-reexpanded", "template_content": "template",
    "basic_navigation_reset": "basic-navigation-reset",
    "basic_navigation_realize": "basic-navigation-realized", "template_repeat": "template-repeated",
}


def load_scenario() -> dict:
    return json.loads(SCENARIO_FILE.read_text(encoding="utf-8"))


def _path(root: Path, relative: str) -> Path:
    return root.joinpath(*relative.replace("\\", "/").split("/"))


def _native_ok(record: dict) -> bool:
    return (
        type(record.get("exit_code")) is int and record["exit_code"] == 0
        and record.get("timed_out") is False and not record.get("error")
        and all(Path(record.get(key, "")).is_file() for key in ("stdout", "stderr"))
    )


def _x64_executable(path: Path) -> bool:
    try:
        with path.open("rb") as stream:
            header = stream.read(64)
            if len(header) < 64 or header[:2] != b"MZ":
                return False
            stream.seek(struct.unpack_from("<I", header, 60)[0])
            return stream.read(6) == b"PE\0\0\x64\x86"
    except (OSError, struct.error):
        return False


def _git_blob(path: Path) -> str:
    content = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()


def _ui_proof(identifier: str, payload: dict, directory: Path, expected_project: Path | None = None) -> None:
    def require(condition, reason):
        if not condition:
            raise ValueError(reason)

    def read(relative):
        path = (directory / relative).resolve()
        require(path.is_relative_to(directory.resolve()) and path.is_file(), f"Missing UI proof: {relative}")
        return json.loads(path.read_text(encoding="utf-8-sig"))

    if identifier == "launch_exit":
        launches = []
        for path in directory.glob("*.command.json"):
            record = read(path.name)
            if record.get("argv", [])[:2] == ["winapp", "run"]:
                launches.append(record)
        require(len(launches) == 1, "Missing/ambiguous native project-launch evidence")
        launch = launches[0]
        require(launch.get("exit_code") == 0 and launch.get("timed_out") is False
                and not launch.get("error"), "Native launch failed")
        argv = launch["argv"]
        require(len(argv) > 3 and Path(argv[2]).suffix.lower() == ".csproj"
                and (expected_project is None or Path(argv[2]).resolve() == expected_project.resolve())
                and all(flag in argv for flag in ("Release", "x64", "Platform=x64", "--detach", "--json", "--no-build")),
                "Launch did not use the fixed project/configuration")
        data = read(launch["stdout"])
        require(type(data.get("ProcessId")) is int and data["ProcessId"] > 0 and not data.get("Error"),
                "Missing PID or swallowed native launch error")
        return
    owner = payload.get("owned_process")
    require(isinstance(owner, dict) and owner.get("ownership_verified") is True
            and type(owner.get("pid")) is int and owner["pid"] > 0
            and owner.get("creation_time") and owner.get("executable") and owner.get("sha256"),
            "Missing verified process ownership evidence")
    require(read("ownership.json") == owner, "Ownership record does not match UI result")
    if identifier == "launch_survival":
        survival = read("survival.json")
        require(survival.get("pid") == owner["pid"] and survival.get("hwnd", 0) > 0
                and survival.get("observation_seconds", 0) >= load_scenario()["observation_seconds"],
                "No surviving owned-window evidence")
    elif identifier == "cleanup":
        cleanup = read("cleanup.json")
        require(cleanup.get("pid") == owner["pid"] and cleanup.get("exited") is True
                and cleanup.get("creation_time") == owner["creation_time"], "Cleanup ownership mismatch")
    elif identifier in UI_STATES:
        name = UI_STATES[identifier]
        visual = read(f"{name}.visual.json")
        require(visual.get("pid") == owner["pid"] and visual.get("hwnd", 0) > 0,
                "UI state belongs to a different process")
        shot = (directory / visual.get("screenshot", "")).resolve()
        require(shot.is_relative_to(directory.resolve()) and shot.is_file(), "Missing state screenshot")
        header = shot.read_bytes()[:24]
        require(len(header) == 24 and header[:8] == b"\x89PNG\r\n\x1a\n"
                and header[12:16] == b"IHDR" and min(struct.unpack(">II", header[16:24])) > 200,
                "Invalid/empty screenshot evidence")
        tree = read(visual.get("uia", ""))
        windows = tree.get("windows", [])
        require(len(windows) == 1 and windows[0].get("hwnd") == visual["hwnd"]
                and windows[0].get("elementCount", 0) > 1, "Empty/wrong-window UIA tree")
        nodes = []

        def walk(items, visible=True):
            for node in items:
                shown = (visible and node.get("isOffscreen") is False
                         and node.get("width", 0) > 0 and node.get("height", 0) > 0)
                if shown:
                    nodes.append(node)
                walk(node.get("children", []), shown)

        walk(windows[0].get("elements", []))
        labels = [re.sub(r"\s+", " ", re.sub(r"^\s*\d+\)\s*", "", n.get("name", ""))).strip()
                  for n in nodes]
        oracle = load_scenario()["oracle"]

        def labels_present(values, present=True):
            for value in values:
                value = re.sub(r"\s+", " ", value).strip()
                require((value in labels) == present, f"Visible label '{value}' expected present={present}")

        if identifier == "startup_content":
            labels_present([oracle["feature_name"], *oracle["navigation"]])
        elif identifier.startswith("adaptive_"):
            page = oracle["pages"][1]
            labels_present([value for row in page["mail"] for value in row])
            labels_present(page["labels"], identifier not in ("adaptive_narrow", "adaptive_shrink"))
            labels_present(page["accounts"], identifier in ("adaptive_desktop", "adaptive_reexpand"))
            require(any(label.startswith(page["description_prefix"]) for label in labels),
                    "Missing adaptive page content")
        elif identifier.startswith("template_"):
            require(sum(n.get("type") == "Text" and n.get("name") == "Rainier" for n in nodes) == 1,
                    "Expected exactly one Rainier text header")
            photos = visual.get("photos", [])
            require(len(photos) == 2 and {p.get("asset") for p in photos} == {"rainier.jpg", "valley.jpg"},
                    "Missing photograph render evidence")
            require(all(type(p.get("mean_error")) in (int, float) and math.isfinite(p["mean_error"])
                        and 0 <= p["mean_error"] < 24 for p in photos), "Photograph render comparison failed")
            require(any(label.startswith(oracle["pages"][2]["description_prefix"]) for label in labels),
                    "Missing template page content")
        else:
            labels_present(["Realize Elements"])
            require(any(label.startswith(oracle["pages"][0]["description_prefix"]) for label in labels),
                    "Missing Basic page content")
            colors, scale = visual.get("colors"), visual.get("scale")
            require(isinstance(colors, list) and len(colors) == 4 and all(type(c) is int and c >= 0 for c in colors)
                    and type(scale) in (int, float) and math.isfinite(scale) and scale > 0,
                    "Missing rectangle pixel evidence")
            if identifier in ("basic_initial", "basic_navigation_reset"):
                require(all(c < 1200 * scale * scale for c in colors), "Grid not initially deferred")
            elif identifier in ("basic_realize", "basic_navigation_realize"):
                prior = "basic-initial" if identifier == "basic_realize" else "basic-navigation-reset"
                baseline = read(f"{prior}.visual.json")["colors"]
                require(all(c - b >= 2000 * scale * scale for c, b in zip(colors, baseline)),
                        "Realize Elements did not visibly realize all four rectangles")
            else:
                baseline = read("basic-realized.visual.json")["colors"]
                require(all(abs(c - b) <= max(60, b * .08) for c, b in zip(colors, baseline)),
                        "Repeated realization changed/duplicated rectangles")
    elif identifier == "screenshots":
        for state_id in UI_STATES:
            _ui_proof(state_id, payload, directory)


def validate_ui_results(payload: dict, directory: Path, expected_project: Path | None = None) -> dict[str, dict]:
    """Validate the transport, all verdicts and their on-disk evidence."""
    if payload.get("schema_version") != 1 or not isinstance(payload.get("assertions"), list):
        raise ValueError("Missing UI result schema/assertion array")
    found = {}
    for assertion in payload["assertions"]:
        identifier = assertion.get("id")
        if identifier not in UI_IDS or identifier in found:
            raise ValueError(f"Unknown or duplicate UI assertion: {identifier}")
        status = assertion.get("status")
        evidence = assertion.get("evidence")
        if status not in STATUSES or not assertion.get("reason") or not isinstance(evidence, list):
            raise ValueError(f"Malformed UI assertion: {identifier}")
        for relative in evidence:
            path = (directory / relative).resolve()
            if not path.is_relative_to(directory.resolve()) or not path.is_file() or not path.stat().st_size:
                raise ValueError(f"Missing/out-of-directory evidence for {identifier}: {relative}")
        if status == "pass" and not evidence:
            raise ValueError(f"Passing assertion has no evidence: {identifier}")
        found[identifier] = dict(assertion)
        if status == "pass":
            try:
                _ui_proof(identifier, payload, directory, expected_project)
            except (ValueError, OSError, TypeError, KeyError) as error:
                found[identifier].update(status="fail", reason=f"Independent UI evidence check: {error}")
    for identifier in UI_IDS:
        if identifier not in found:
            found[identifier] = {
                "id": identifier, "status": "fail",
                "reason": "Evaluator returned no evidence for this required assertion", "evidence": [],
            }
    return found


def evaluate_attempt(workspace: Path, evidence: Path, scenario: dict, process_runner=None) -> dict:
    """Evaluate the runner-selected frozen project; never use live target input.

    process_runner follows support.run_process(argv, *, cwd, evidence_dir,
    timeout_seconds, env=None). It supervises the entire UI script, including
    winapp launch and cleanup, so its process job cannot kill a detached app
    between launch and inspection. The caller persists the returned final result
    as evaluation.json; this module creates only its subordinate evidence files.
    """
    runner = process_runner or run_process
    workspace, evidence = Path(workspace).resolve(), Path(evidence).resolve()
    if evidence.is_relative_to(workspace) or workspace.is_relative_to(evidence):
        raise ValueError("Evidence and immutable workspace must be disjoint")
    evidence.mkdir(parents=True, exist_ok=True)
    if any((evidence / name).exists() for name in (
        "evaluation.json", "evaluation-workspace", "evaluator-manifest.json",
    )):
        raise FileExistsError("Evaluation evidence is append-only; use a new evidence directory")
    frozen = load_scenario()
    # The runner may select a scaffold basename and authorize desktop use, but
    # candidate-dependent oracle edits must never alter the denominator.
    if scenario.get("id") != frozen["id"]:
        raise ValueError("Only the frozen xaml-defer-load scenario is supported")
    target_basename = scenario.get("target_project", frozen["target_project"])
    result = {
        "schema_version": 1, "scenario_id": frozen["id"], "started_at": utc_now(),
        "target_project": target_basename,
        "oracle_status": frozen["source"]["oracle_status"],
        "assertions": [
            {**item, "mandatory": True, "status": "not_run",
             "reason": "A preceding required gate has not passed", "evidence": []}
            for item in frozen["assertions"]
        ],
        "processes": [], "owned_process": None,
    }
    assertions = {item["id"]: item for item in result["assertions"]}

    def verdict(identifier, status, reason, files=()):
        assertions[identifier].update(status=status, reason=reason, evidence=[str(x) for x in files])

    def command(name, argv, timeout):
        record = runner(
            [str(x) for x in argv], cwd=copied, evidence_dir=evidence / name,
            timeout_seconds=timeout,
        )
        result["processes"].append({"stage": name, **record})
        return record

    original_hashes = None
    frozen_hashes = None
    frozen_output = evidence / "frozen-output"
    copied = evidence / "evaluation-workspace"
    current = "target_project"
    try:
        if (not isinstance(target_basename, str) or any(c in target_basename for c in "/\\:\0")
                or Path(target_basename).suffix.lower() != ".csproj"):
            raise ValueError("target_project must be a single .csproj basename, not a path")
        write_json(evidence / "evaluator-manifest.json", {
            "schema_version": 1, "frozen_at": utc_now(),
            "files": {p.name: sha256(p) for p in (Path(__file__), UI_SCRIPT, SCENARIO_FILE)},
            "configuration": "Release", "architecture": "x64", "runtime": "win-x64",
            "target_project": target_basename,
            "source_commit": frozen["source"]["commit"], "oracle_status": result["oracle_status"],
        })
        write_json(evidence / "frozen-scenario.json", frozen)
        original_hashes = file_hashes(workspace)
        write_json(evidence / "agent-artifacts-before.json", original_hashes)
        frozen_hashes = file_hashes(frozen_output) if frozen_output.is_dir() else None
        write_json(evidence / "frozen-output-before.json", frozen_hashes)
        if not frozen_output.is_dir():
            raise ValueError("Missing evidence/frozen-output; refusing to evaluate the live target")
        for root in (workspace, frozen_output):
            for path in root.rglob("*"):
                if getattr(path, "is_junction", lambda: False)():
                    raise ValueError(f"Junction is not an immutable input: {path}")
        target = frozen_output
        project = target / target_basename
        projects = sorted(p for p in target.rglob("*.csproj") if not {"bin", "obj"} & set(p.parts))
        if projects != [project]:
            verdict(current, "fail", f"Require exactly frozen-output/{target_basename}; missing or ambiguous target",
                    ["evaluator-manifest.json"])
            return _finish(result, evidence)
        verdict(current, "pass", "Fixed sole target project found", ["evaluator-manifest.json"])
        current = "snapshot"
        def snapshot_ignore(directory, names):
            excluded = {".git", ".vs", "bin", "obj"}
            if Path(directory).resolve() == workspace:
                excluded.add("target")
            return set(names) & excluded

        shutil.copytree(workspace, copied, ignore=snapshot_ignore)
        shutil.copytree(frozen_output, copied / "target",
                        ignore=shutil.ignore_patterns(".git", ".vs", "bin", "obj"))
        write_json(evidence / "snapshot-source.json", file_hashes(copied))
        verdict(current, "pass", "Frozen deliverable and supporting original source copied; live target not used",
                ["agent-artifacts-before.json", "frozen-output-before.json", "snapshot-source.json"])
        project = copied / "target" / target_basename
        current = "independent_build"
        build = command("build", [
            "dotnet", "build", project, "-c", "Release", "-r", "win-x64",
            "-p:Platform=x64", "-t:Rebuild", "-v:minimal", f"-bl:{evidence / 'build.binlog'}",
        ], frozen["build_timeout_seconds"])
        if not _native_ok(build):
            verdict(current, "fail", "Independent build failed, timed out, or has no native logs", ["build"])
            return _finish(result, evidence)
        verdict(current, "pass", "Clean independent Release/x64 build exited zero", ["build"])
        current = "build_output"
        executables = sorted(p.resolve() for p in (copied / "target").rglob("*.exe")
                             if "bin" in p.parts and "Release" in p.parts and _x64_executable(p))
        if not executables:
            verdict(current, "fail", "Build exited zero but produced no native x64 executable", ["build"])
            return _finish(result, evidence)
        write_json(evidence / "build-artifacts.json", {
            "executables": {str(p): sha256(p) for p in executables},
            "allowed_staged_executables": {str(p.parent / "AppX" / p.name): sha256(p)
                                           for p in executables if p.parent.name != "AppX"},
        })
        verdict(current, "pass", "Fresh x64 executable artifacts found", ["build-artifacts.json"])
        current = "source_fidelity"
        missing = [p for p in frozen["oracle"]["required_migrated_files"]
                   if not _path(copied / "target", p).is_file()]
        mismatched = [
            p for p, expected in frozen["oracle"]["asset_git_blobs"].items()
            if not _path(copied / "target", p).is_file()
            or _git_blob(_path(copied / "target", p)) != expected
        ]
        write_json(evidence / "fidelity.json", {
            "missing_original_filenames_diagnostic_only": missing,
            "missing_or_changed_assets": mismatched,
            "filename_policy": "Page/helper renames are allowed; mandatory behavior assertions establish reachability.",
        })
        verdict(current, "fail" if mismatched else "pass",
                "Missing/changed original assets" if mismatched
                else "Original assets retained; original page/helper filenames are diagnostic only", ["fidelity.json"])
        # A fidelity failure does not suppress independent observable behavior.
        current = "desktop_consent"
        if scenario.get("allow_desktop") is not True:
            verdict(current, "blocked", "Explicit allow_desktop=True was not supplied by the runner")
            return _finish(result, evidence)
        verdict(current, "pass", "Runner explicitly authorized desktop use", ["evaluator-manifest.json"])
        current = "launch_exit"
        ui_dir = evidence / "ui"
        ui = command("ui-process", [
            "pwsh", "-NoLogo", "-NoProfile", "-NonInteractive", "-File", UI_SCRIPT,
            "-Project", project, "-OutputDirectory", ui_dir,
            "-ScenarioFile", evidence / "frozen-scenario.json",
            "-BuildArtifacts", evidence / "build-artifacts.json", "-AllowDesktop",
        ], frozen["ui_timeout_seconds"])
        ui_results = ui_dir / "results.json"
        if not ui_results.is_file():
            verdict(current, "fail", "UI evaluator produced no results (including startup crashes)", ["ui-process"])
            return _finish(result, evidence)
        payload = json.loads(ui_results.read_text(encoding="utf-8-sig"))
        for identifier, item in validate_ui_results(payload, ui_dir, project).items():
            verdict(identifier, item["status"], item["reason"],
                    [Path("ui") / p for p in item["evidence"]])
        result["owned_process"] = payload.get("owned_process")
        if assertions["launch_identity"]["status"] == "pass":
            owner = result["owned_process"]
            binary = Path(owner["executable"]).resolve()
            expected_binaries = {p: sha256(p) for p in executables}
            expected_binaries.update({p.parent / "AppX" / p.name: sha256(p) for p in executables
                                      if p.parent.name != "AppX"})
            if binary not in expected_binaries or sha256(binary) != expected_binaries[binary] or sha256(binary) != owner["sha256"]:
                verdict("launch_identity", "fail", "Returned process is not the independently built executable",
                        ["build-artifacts.json", "ui/ownership.json"])
        if not _native_ok(ui):
            # A nonzero/timeout supervisor can never be hidden by passing JSON.
            identifier = next((i for i in UI_IDS if assertions[i]["status"] != "pass"), "screenshots")
            prior = assertions[identifier]["reason"]
            verdict(identifier, "fail", f"{prior}; UI supervisor failed or timed out",
                    [*assertions[identifier]["evidence"], "ui-process", "ui/results.json"])
    except Exception as error:
        verdict(current, "fail", f"{type(error).__name__}: {error}")
    finally:
        if original_hashes is not None:
            try:
                after = file_hashes(workspace)
                write_json(evidence / "agent-artifacts-after.json", after)
                frozen_after = file_hashes(frozen_output) if frozen_output.is_dir() else None
                write_json(evidence / "frozen-output-after.json", frozen_after)
                unchanged = (original_hashes == after and frozen_hashes is not None
                             and frozen_hashes == frozen_after)
                verdict("artifact_immutability", "pass" if unchanged else "fail",
                        "Original workspace and frozen deliverable unchanged" if unchanged
                        else "Original workspace/frozen deliverable changed or was unavailable",
                        ["agent-artifacts-before.json", "agent-artifacts-after.json",
                         "frozen-output-before.json", "frozen-output-after.json"])
            except Exception as error:
                verdict("artifact_immutability", "fail", f"Unable to verify immutability: {error}")
        # Early gate returns still update the same result object in this finally.
        _finish(result, evidence)
    return result


def _finish(result: dict, evidence: Path) -> dict:
    assertions = result["assertions"]
    statuses = [a["status"] for a in assertions]
    result["complete_success"] = bool(statuses) and all(s == "pass" for s in statuses)
    result["status"] = (
        "pass" if result["complete_success"] else "fail" if "fail" in statuses
        else "blocked" if "blocked" in statuses else "not_run"
    )
    result["passed_assertions"] = statuses.count("pass")
    result["total_assertions"] = len(assertions)
    result["requirement_pass_fraction"] = statuses.count("pass") / len(assertions) if assertions else 0
    result["failure_stage"] = next((a["gate"] for a in assertions if a["status"] != "pass"), None)
    result["ended_at"] = utc_now()
    return result
