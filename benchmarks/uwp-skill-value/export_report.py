"""Export selected, path-free pilot facts; never publish raw sessions or configuration."""

import argparse
from collections import Counter
import json
from pathlib import Path

from report import build_report
from support import read_json, sha256, write_json


def export_report(generation_root: Path, evaluation_root: Path, label: str) -> dict:
    experiment = read_json(generation_root / "experiment.json")
    report = build_report(evaluation_root)
    if report["experiment"]["id"] != experiment["id"]:
        raise ValueError("Reanalysis must refer to the same generation experiment")
    prepared = read_json(generation_root / "prepared.json")
    manifest = read_json(generation_root / "materialization.json")
    rows = []
    for row in report["rows"]:
        identifier = row["id"]
        original = generation_root / "e" / identifier
        assessed = evaluation_root / "e" / identifier
        evaluation = row["evaluation"] or {}
        process = row["process"] or {}
        events = Counter()
        parse_errors = 0
        raw_log = original / "agent" / "stdout.txt"
        if raw_log.is_file():
            with raw_log.open(encoding="utf-8-sig") as stream:
                for line in stream:
                    try:
                        event = json.loads(line)
                    except ValueError:
                        parse_errors += 1
                        continue
                    if isinstance(event, dict) and isinstance(event.get("type"), str):
                        events[event["type"]] += 1
        artifacts = {}
        for scope, directory in (("generation", original), ("evaluation", assessed)):
            for relative in (
                "attempt.json", "usage.json", "agent/stdout.txt", "agent/stderr.txt",
                "agent/process.json", "evaluation.json", "evaluator-manifest.json",
                "build-artifacts.json", "ui/startup.png", "ui/startup.visual.json",
                "ui/results.json", "runtime-guard/prepare.json", "runtime-guard/cleanup.json",
            ):
                path = directory.joinpath(*relative.split("/"))
                if path.is_file():
                    artifacts[f"{scope}/{relative}"] = {"sha256": sha256(path), "bytes": path.stat().st_size}
        packages = {}
        assets = assessed / "evaluation-workspace" / "target" / "obj" / "project.assets.json"
        if assets.is_file():
            for name, library in read_json(assets).get("libraries", {}).items():
                if library.get("type") == "package":
                    packages[name] = {"sha512": library.get("sha512")}
        rows.append({
            "id": identifier, "arm": row["arm"], "repeat": row["repeat"],
            "status": row["status"], "attempt_status": row["attempt_status"],
            "attempted": row["attempted"], "native_agent_exit": process.get("exit_code"),
            "agent_timed_out": process.get("timed_out"), "agent_seconds": process.get("elapsed_seconds"),
            "agent_started_at": process.get("started_at"), "agent_ended_at": process.get("ended_at"),
            "ai_credits": row["ai_credits"], "input_tokens_uncached": row["input_tokens"],
            "cache_read_tokens": row["cache_read_tokens"], "cache_write_tokens": row["cache_write_tokens"],
            "output_tokens": row["output_tokens"], "observed_models": row["observed_models"],
            "model_mismatch": row["model_mismatch"], "evaluation_status": row["evaluation_status"],
            "assertions": [{key: value for key, value in assertion.items() if key in ("id", "gate", "status", "mandatory")}
                           for assertion in evaluation.get("assertions", [])],
            "failure_stage": evaluation.get("failure_stage"),
            "event_counts": {name: events[name] if raw_log.is_file() else None for name in (
                "model.call_start", "assistant.turn_start", "tool.execution_start",
                "assistant.usage", "session.usage_checkpoint",
            )},
            "jsonl_parse_errors": parse_errors,
            "peak_context_occupancy": None,
            "resolved_packages": packages,
            "evaluator_files": read_json(assessed / "evaluator-manifest.json").get("files")
            if (assessed / "evaluator-manifest.json").is_file() else None,
            "artifacts": artifacts,
        })
    return {
        "schema_version": 1, "label": label, "experiment_id": experiment["id"],
        "lane": experiment["lane"], "model": experiment["model"],
        "effort": experiment["effort"], "context": experiment["context"],
        "soft_credit_limit_per_attempt": experiment["credits"],
        "hard_seconds_per_attempt": experiment["seconds"], "seed": experiment["seed"],
        "order": [row["arm"] for row in rows], "toolchain": experiment["toolchain"],
        "candidate_commit": "196d076e92d7161031dba5eef50f4e23e04a4d8e",
        "source_commit": "4eb2fcb499c5bc549e918920cfd2b64396a650d9",
        "scenario": "Complete C# XamlDeferLoadStrategy (three pages and shared dependencies)",
        "generation_experiment_sha256": sha256(generation_root / "experiment.json"),
        "generation_harness_hashes": experiment["harness_hashes"],
        "materialization_sha256": sha256(generation_root / "materialization.json"),
        "scaffold_files": prepared["scaffold_hashes"],
        "treatment_files": prepared["treatment_hashes"],
        "treatment_differences": manifest["treatment_diffs"],
        "runtime_reanalysis": generation_root.resolve() != evaluation_root.resolve(),
        "rows": rows, "summary": report["summary"], "by_arm": report["by_arm"],
        "conclusion": "Inconclusive: one public task family, one attempt per arm per distinct lane; do not pool lanes.",
        "limitations": [
            "Supervised local Windows session, not OS-level isolation or a clean VM/cache experiment.",
            "Raw local artifacts are retained, not published; hashes identify them without exposing transcripts or configuration.",
            "Reanalysis does not create additional model attempts or additional agent spend.",
            "Missing telemetry is unknown, never zero; cumulative input is not peak context occupancy.",
            "The evaluator has source-runtime observations and mocked mutants, not full all-assertion real-app calibration.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generation-root", required=True, type=Path)
    parser.add_argument("--evaluation-root", required=True, type=Path)
    parser.add_argument("--label", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    write_json(args.output, export_report(args.generation_root, args.evaluation_root, args.label))
    print(args.output)


if __name__ == "__main__":
    main()
