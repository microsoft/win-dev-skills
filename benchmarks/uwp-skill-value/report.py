"""Conservative, evidence-only benchmark accounting (Python standard library)."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path

from support import read_json, sha256, utc_now, write_json


METRICS = (
    "ai_credits", "input_tokens", "output_tokens",
    "cache_read_tokens", "cache_write_tokens",
)
CONTRASTS = (("F", "B"), ("T", "B"), ("L", "T"), ("F", "L"))
LIMITATIONS = [
    "Descriptive pilot only: contrasts are inconclusive; no statistical significance or causal claims.",
    "No calibrated real-app oracle: a pass means the mandatory benchmark assertions passed, not proven real-app migration success.",
    "Missing usage is unknown, not free. Known lower bounds are not complete spend totals.",
    "Token counts and read sizes do not measure context occupancy.",
]


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) and value >= 0 else None


def _object(value, label: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _identifier(value, label: str) -> str:
    if not isinstance(value, str) or not value or value in (".", ".."):
        raise ValueError(f"{label} must be a nonempty path-safe string")
    if any(character in value for character in '/\\:'):
        raise ValueError(f"{label} must be a nonempty path-safe string")
    return value


def _linked(path: Path) -> bool:
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()


def _source(path: Path, identifier: str, jsonl: bool, diagnostics: dict):
    if not path.exists():
        return None, []
    if _linked(path):
        diagnostics["warnings"].append(f"Skipped non-owned symlink: {identifier}")
        return None, []
    content = path.read_bytes()
    source = {
        "id": identifier, "path": str(path), "sha256": hashlib.sha256(content).hexdigest(),
        "bytes": len(content), "format": "jsonl" if jsonl else "json",
    }
    records = []
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        diagnostics["parse_errors"].append({"source": identifier, "error": str(error)})
        return source, records
    if not jsonl:
        try:
            source["raw"] = json.loads(text)
            records.append((None, source["raw"]))
        except ValueError as error:
            diagnostics["parse_errors"].append({"source": identifier, "error": str(error)})
        return source, records
    for line, value in enumerate(text.splitlines(), 1):
        if not value.strip():
            continue
        try:
            records.append((line, json.loads(value)))
        except ValueError as error:
            diagnostics["parse_errors"].append({"source": identifier, "line": line, "error": str(error)})
    source["parsed_records"] = len(records)
    return source, records


def _usage_view(raw: dict) -> dict:
    """Decode the keys observed in the CLI 1.0.83 usage-output artifact."""
    result = dict.fromkeys(METRICS)
    nano_aiu = _number(raw.get("totalNanoAiu"))
    result["total_nano_aiu"] = nano_aiu
    if nano_aiu is not None:
        result["ai_credits"] = nano_aiu / 1_000_000_000
    details = raw.get("tokenDetails")
    details = details if isinstance(details, dict) else {}
    for normalized, native in (
        ("input_tokens", "input"), ("output_tokens", "output"),
        ("cache_read_tokens", "cache_read"), ("cache_write_tokens", "cache_write"),
    ):
        entry = details.get(native)
        result[normalized] = _number(entry.get("tokenCount")) if isinstance(entry, dict) else None
    usage = raw.get("usage", raw)
    usage = usage if isinstance(usage, dict) else {}
    # inputTokens includes cached input; tokenDetails.input does not.
    result["input_tokens_including_cache"] = _number(usage.get("inputTokens"))
    result["reasoning_tokens"] = _number(usage.get("reasoningTokens"))
    for normalized, native in (
        ("output_tokens", "outputTokens"),
        ("cache_read_tokens", "cacheReadTokens"), ("cache_write_tokens", "cacheWriteTokens"),
    ):
        if result[normalized] is None:
            result[normalized] = _number(usage.get(native))
    return result


def _model_aggregates(raw: dict, source: str, scope: str) -> list[dict]:
    models = raw.get("modelMetrics")
    if not isinstance(models, dict):
        return []
    return [
        {
            "id": f"{scope}:model:{model}", "model": model, "source": source,
            "scope": scope, "raw": metrics, **_usage_view(metrics),
        }
        for model, metrics in sorted(models.items()) if isinstance(metrics, dict)
    ]


def collect_usage(evidence_dir: Path, home: Path) -> dict:
    """Read only the supplied run's artifacts; never inspect a global CLI home."""
    evidence_dir, home = Path(evidence_dir), Path(home)
    result = {
        **dict.fromkeys(METRICS),
        "observed_models": [],
        "current_model": None,
        "provider_aggregates": [],
        "model_aggregates": [],
        "agent_aggregates": [],
        "components": [],
        "sources": [],
        "diagnostics": {"warnings": [], "parse_errors": []},
        "aggregation_policy": "Top-level usage.json only; model, agent and call views are never added to it.",
        "token_semantics": {
            "input_tokens": "Uncached input from tokenDetails.input.tokenCount.",
            "input_tokens_including_cache": "Separate inclusive inputTokens view; never add cache to this value.",
            "reasoning_tokens": "Separate reasoning view; not added to output.",
        },
        "telemetry": {
            "schema_reference": "Keys observed in Copilot CLI 1.0.83 --usage-output-file diagnostic.",
            "usage_file_status": "missing",
            "component_coverage": "partial_or_unknown",
        },
        "total_source": None,
    }
    diagnostics = result["diagnostics"]
    components = {}
    observed = set()
    paths = [
        (evidence_dir / "usage.json", "evidence/usage.json", False),
        (evidence_dir / "agent" / "stdout.txt", "evidence/agent/stdout.txt", True),
    ]
    sessions = home / "session-state"
    if _linked(home) or _linked(sessions):
        diagnostics["warnings"].append("Skipped non-owned session-state symlink.")
    elif sessions.is_dir():
        for directory, folders, files in os.walk(sessions, followlinks=False):
            folders[:] = sorted(folder for folder in folders if not _linked(Path(directory) / folder))
            if "events.jsonl" in files:
                path = Path(directory) / "events.jsonl"
                paths.append((path, "home/" + path.relative_to(home).as_posix(), True))
    for path, identifier, jsonl in paths:
        if identifier.startswith("evidence/") and (
            _linked(evidence_dir) or _linked(path.parent)
        ):
            diagnostics["warnings"].append(f"Skipped non-owned evidence path: {identifier}")
            continue
        source, records = _source(path, identifier, jsonl, diagnostics)
        if source is not None:
            result["sources"].append(source)
        if not jsonl:
            if source is not None:
                result["telemetry"]["usage_file_status"] = "unsupported_or_malformed"
            for _, raw in records:
                aggregate = {
                    "id": "provider:" + identifier, "source": identifier,
                    "raw": raw, **(_usage_view(raw) if isinstance(raw, dict) else dict.fromkeys(METRICS)),
                }
                result["provider_aggregates"].append(aggregate)
                for metric in METRICS:
                    result[metric] = aggregate[metric]
                if any(result[metric] is not None for metric in METRICS):
                    result["telemetry"]["usage_file_status"] = "recognized"
                if result["ai_credits"] is not None:
                    result["total_source"] = identifier + "#totalNanoAiu"
                if not isinstance(raw, dict):
                    continue
                current = raw.get("currentModel")
                if isinstance(current, str) and current:
                    result["current_model"] = current
                result["model_aggregates"] = _model_aggregates(raw, identifier, "provider")
                observed.update(item["model"] for item in result["model_aggregates"])
                agents = raw.get("agentMetrics")
                if isinstance(agents, dict):
                    for agent, metrics in sorted(agents.items()):
                        if not isinstance(metrics, dict):
                            continue
                        agent_models = _model_aggregates(metrics, identifier, f"agent:{agent}")
                        result["agent_aggregates"].append({
                            "id": f"agent:{agent}", "agent": agent, "source": identifier,
                            "raw": metrics, "model_aggregates": agent_models, **_usage_view(metrics),
                        })
                        observed.update(item["model"] for item in agent_models)
            continue
        for line, event in records:
            if not isinstance(event, dict) or event.get("type") != "assistant.usage":
                continue
            data = event.get("data")
            if not isinstance(data, dict):
                continue
            native_id = event.get("id")
            component_id = (
                "event:" + native_id if isinstance(native_id, str) and native_id
                else f"source:{identifier}:{line}"
            )
            location = {"source": identifier, "line": line}
            if component_id in components:
                previous = components[component_id]
                if previous["raw"] != event:
                    diagnostics["warnings"].append(f"Conflicting duplicate usage event: {component_id}")
                    previous["conflicting_records"].append({"location": location, "raw": event})
                previous["locations"].append(location)
                continue
            model = data.get("model")
            if isinstance(model, str) and model:
                observed.add(model)
            component = {
                "id": component_id,
                "identity": "native event id" if native_id else "source and line; cross-source identity unknown",
                "locations": [location], "raw": event, "conflicting_records": [],
                "model": model if isinstance(model, str) and model else None,
                **_usage_view(data),
            }
            components[component_id] = component
    result["components"] = list(components.values())
    result["observed_models"] = sorted(observed)
    result["telemetry"]["missing_metrics"] = [metric for metric in METRICS if result[metric] is None]
    result["telemetry"]["usage_component_count"] = len(components)
    if result["ai_credits"] is None:
        diagnostics["warnings"].append("No authoritative totalNanoAiu; spend remains unknown.")
    if not components:
        diagnostics["warnings"].append("No recognized per-call usage events; component telemetry is unavailable.")
    return result


def _observed_models(usage: dict) -> list[str]:
    models = usage.get("observed_models", [])
    if not isinstance(models, list):
        return []
    return sorted({model for model in models if isinstance(model, str) and model})


def _evaluation_result(evaluation, expected: list[dict]) -> tuple[bool, str]:
    if evaluation is None:
        return False, "No evaluator evidence; process completion alone is unverified."
    assertions = evaluation.get("assertions")
    if not isinstance(assertions, list) or not assertions:
        return False, "No mandatory assertion results."
    if any(not isinstance(assertion, dict) for assertion in assertions):
        return False, "Malformed assertion results."
    identifiers = [assertion.get("id") for assertion in assertions]
    if any(not isinstance(identifier, str) or not identifier for identifier in identifiers):
        return False, "Missing assertion identifiers."
    if len(set(identifiers)) != len(identifiers):
        return False, "Duplicate assertion identifiers."
    expected_ids = {
        assertion["id"] for assertion in expected
        if assertion.get("mandatory", assertion.get("required", True)) is not False
    }
    if expected_ids - set(identifiers):
        return False, "Missing mandatory assertions from the frozen scenario."
    mandatory = [
        assertion for assertion in assertions
        if assertion.get("mandatory", assertion.get("required", True)) is not False
        or assertion["id"] in expected_ids
    ]
    if not mandatory:
        return False, "No mandatory assertion results."
    if evaluation.get("status") != "pass":
        return False, f"Evaluator status is {evaluation.get('status', 'unknown')}."
    if any(assertion.get("status") != "pass" for assertion in mandatory):
        return False, "At least one mandatory assertion did not pass."
    return True, "All mandatory benchmark assertions passed."


def _artifact_integrity(directory: Path, attempt) -> dict:
    frozen = directory / "frozen-output"
    result = {"status": "unverified", "reason": "No frozen-output hash evidence.", "path": str(frozen)}
    if attempt is None:
        return result
    expected = attempt.get("output_hashes")
    if not isinstance(expected, dict):
        return result
    declared = attempt.get("frozen_output")
    if declared is not None and (
        not isinstance(declared, str) or Path(declared).absolute() != frozen.absolute()
    ):
        return {**result, "status": "fail", "reason": "Frozen-output path does not match run-owned evidence."}
    if _linked(frozen) or not frozen.is_dir():
        return {**result, "status": "fail", "reason": "Frozen-output artifact is missing or is a link."}
    actual = {}

    def unreadable(error):
        raise error

    try:
        for parent, folders, files in os.walk(frozen, followlinks=False, onerror=unreadable):
            if any(_linked(Path(parent) / name) for name in [*folders, *files]):
                return {**result, "status": "fail", "reason": "Frozen output contains a link."}
            for name in files:
                path = Path(parent) / name
                actual[path.relative_to(frozen).as_posix()] = sha256(path)
    except OSError as error:
        return {**result, "status": "fail", "reason": f"Cannot verify frozen-output artifact: {error}"}
    if actual != expected:
        return {
            **result, "status": "fail", "reason": "Frozen-output hashes do not match the attempt record.",
            "missing": sorted(expected.keys() - actual.keys()),
            "unexpected": sorted(actual.keys() - expected.keys()),
            "modified": sorted(key for key in expected.keys() & actual.keys() if expected[key] != actual[key]),
        }
    return {**result, "status": "pass", "reason": "Frozen-output file set and hashes match."}


def _row(schedule: dict, attempt, evaluation, started: bool, expected: list[dict], integrity: dict) -> dict:
    row = dict(schedule)
    usage = _object(attempt.get("usage") or {}, "Attempt usage") if attempt else {}
    process = _object(attempt.get("process") or {}, "Attempt process") if attempt else {}
    evaluation_pass, evaluation_reason = _evaluation_result(evaluation, expected)
    process_success = (
        bool(attempt) and _number(process.get("exit_code")) == 0
        and not process.get("timed_out") and not process.get("error")
    )
    if attempt is None:
        status = "infra_error" if started else "not_run"
        reason = "Started evidence exists but the attempt record is missing." if started else "No attempt evidence."
    elif process.get("timed_out") or attempt.get("status") == "timeout":
        status, reason = "timeout", "The attempt timed out."
    elif attempt.get("status") == "invalid":
        status, reason = "invalid", attempt.get("reason") or "Agent output violated the frozen task protocol."
    elif (
        process.get("error") or process.get("exit_code") is None
        or attempt.get("status") in ("infra_error", "interrupted", "cancelled", "blocked")
    ):
        status, reason = "infra_error", attempt.get("reason") or process.get("error") or "Process completion is unknown."
    elif not process_success:
        status, reason = "fail", f"Native process exited with code {process.get('exit_code')}."
    elif attempt.get("status") in ("fail", "failed", "error"):
        status, reason = "fail", attempt.get("reason") or "Attempt recorded a failure."
    elif evaluation_pass:
        status, reason = "pass", evaluation_reason
    elif evaluation and (
        evaluation.get("status") == "fail"
        or any(
            isinstance(assertion, dict)
            and assertion.get("mandatory", assertion.get("required", True)) is not False
            and assertion.get("status") == "fail"
            for assertion in (evaluation.get("assertions") or [])
        )
    ):
        status, reason = "fail", evaluation_reason
    else:
        status, reason = "unverified", evaluation_reason
    observed = _observed_models(usage)
    requested = schedule.get("model")
    current = usage.get("current_model")
    if not isinstance(current, str) or not current:
        current = None
    reported = set(observed) | ({current} if current else set())
    mismatch = any(model != requested for model in reported) if reported and requested else None
    invalid_reasons = []
    if current and requested and current != requested:
        invalid_reasons.append(f"Reported current model {current} differs from requested model {requested}.")
    if integrity["status"] == "fail":
        invalid_reasons.append(integrity["reason"])
    if invalid_reasons and status not in ("fail", "timeout", "invalid"):
        status, reason = "infra_error", " ".join(invalid_reasons)
    elif status == "pass" and integrity["status"] != "pass":
        status, reason = "unverified", integrity["reason"]
    row.update({
        "status": status,
        "reason": reason,
        "attempted": attempt is not None or started,
        "attempt_record_present": attempt is not None,
        "attempt_status": attempt.get("status") if attempt else None,
        "process_success": bool(process_success),
        "evaluation_present": evaluation is not None,
        "evaluation_status": evaluation.get("status") if evaluation else None,
        "evaluation_pass": evaluation_pass,
        "strong_success": False,
        "requested_model": requested,
        "observed_models": observed,
        "current_model": current,
        "model_mismatch": mismatch,
        "invalid_reasons": invalid_reasons,
        "artifact_integrity": integrity,
        "usage": usage,
        "process": process,
        "evaluation": evaluation,
        "output_hashes": attempt.get("output_hashes", {}) if attempt else {},
    })
    for metric in METRICS:
        row[metric] = _number(usage.get(metric))
    return row


def _spend(rows: list[dict], metric: str = "ai_credits") -> dict:
    values = [row[metric] for row in rows]
    known = [value for value in values if value is not None]
    return {
        "total": sum(known) if values and len(known) == len(values) else None,
        "known_lower_bound": sum(known),
        "known_attempts": len(known),
        "unknown_attempts": len(values) - len(known),
        "scope": "attempted runs, including failed, timed-out and interrupted runs",
    }


def _summary(rows: list[dict]) -> dict:
    attempted = [row for row in rows if row["attempted"]]
    statuses = Counter(row["status"] for row in rows)
    successes = statuses["pass"]
    spend = _spend(attempted)
    return {
        "planned": len(rows),
        "attempted": len(attempted),
        "attempt_records": sum(row["attempt_record_present"] for row in rows),
        "status_counts": {status: statuses[status] for status in (
            "pass", "fail", "timeout", "invalid", "infra_error", "unverified", "not_run",
        )},
        "all_attempt_success_count": successes,
        "all_attempt_success_rate": successes / len(rows) if rows else None,
        "success_rate_denominator": "all scheduled runs",
        "evaluated_count": sum(row["evaluation_present"] for row in rows),
        "evaluation_pass_count": sum(row["evaluation_pass"] for row in rows),
        "evaluation_status_counts": dict(Counter(
            str(row["evaluation_status"]) for row in rows if row["evaluation_present"]
        )),
        "model_mismatch_count": sum(row["model_mismatch"] is True for row in rows),
        "unknown_observed_model_count": sum(not row["observed_models"] for row in attempted),
        "ai_credits": spend,
        "cost_per_success": spend["total"] / successes if successes and spend["total"] is not None else None,
        "cost_per_success_known_lower_bound": spend["known_lower_bound"] / successes if successes else None,
        "failed_or_timeout_ai_credits": _spend([
            row for row in attempted if row["status"] in ("fail", "timeout")
        ]),
        "protocol_invalid_ai_credits": _spend([row for row in attempted if row["status"] == "invalid"]),
        "spend_by_status": {
            status: _spend([row for row in attempted if row["status"] == status])
            for status in ("pass", "fail", "timeout", "invalid", "infra_error", "unverified")
        },
        "tokens": {metric: _spend(attempted, metric) for metric in METRICS if metric != "ai_credits"},
        "strong_success_count": 0,
    }


def _difference(left, right):
    return left - right if left is not None and right is not None else None


def _contrasts(by_arm: dict) -> list[dict]:
    contrasts = []
    for left, right in CONTRASTS:
        first, second = by_arm.get(left, {}), by_arm.get(right, {})
        contrasts.append({
            "id": f"{left}-{right}",
            "left_arm": left,
            "right_arm": right,
            "planned": {left: first.get("planned", 0), right: second.get("planned", 0)},
            "all_attempt_success_rate_difference": _difference(
                first.get("all_attempt_success_rate"), second.get("all_attempt_success_rate"),
            ),
            "cost_per_success_difference": _difference(
                first.get("cost_per_success"), second.get("cost_per_success"),
            ),
            "conclusion": "inconclusive",
            "interpretation": "Descriptive difference only; no statistical or causal inference.",
        })
    return contrasts


def build_report(root: Path) -> dict:
    """Reconcile evidence against the frozen schedule, never the surviving runs."""
    root = Path(root)
    experiment = _object(read_json(root / "experiment.json"), "Experiment")
    schedule = experiment.get("schedule")
    if not isinstance(schedule, list):
        raise ValueError("Experiment schedule must be a list")
    scheduled = {}
    for item in schedule:
        item = _object(item, "Schedule row")
        attempt_id = _identifier(item.get("id"), "Schedule id")
        if attempt_id in scheduled:
            raise ValueError(f"Duplicate scheduled id: {attempt_id}")
        if not isinstance(item.get("arm"), str) or not item["arm"]:
            raise ValueError(f"Missing arm for schedule id: {attempt_id}")
        scheduled[attempt_id] = item
    evidence = root / "e"
    attempts, evaluations, started = {}, {}, set()
    if evidence.exists():
        if _linked(evidence):
            raise ValueError("Evidence must be run-owned, not a symlink")
        for directory in sorted(evidence.iterdir()):
            if _linked(directory):
                raise ValueError(f"Evidence must be run-owned, not a symlink: {directory}")
            if not directory.is_dir():
                continue
            artifacts = [directory / name for name in ("attempt.json", "evaluation.json", "started.json")]
            if not any(path.exists() for path in artifacts):
                continue
            if directory.name not in scheduled:
                raise ValueError(f"Unknown attempt directory: {directory.name}")
            if any(_linked(path) for path in artifacts):
                raise ValueError(f"Evidence must be run-owned, not a symlink: {directory}")
            attempt_path, evaluation_path, started_path = artifacts
            if attempt_path.exists():
                attempt = _object(read_json(attempt_path), "Attempt")
                attempt_id = _identifier(attempt.get("id"), "Attempt id")
                if attempt_id in attempts:
                    raise ValueError(f"Duplicate attempt id: {attempt_id}")
                if attempt_id not in scheduled or attempt_id != directory.name:
                    raise ValueError(f"Unknown or mismatched attempt id: {attempt_id} in {directory.name}")
                for key in ("arm", "repeat", "scenario", "model"):
                    if key in attempt and attempt[key] != scheduled[attempt_id].get(key):
                        raise ValueError(f"Attempt {attempt_id} does not match frozen schedule field: {key}")
                attempts[attempt_id] = attempt
            if evaluation_path.exists():
                evaluations[directory.name] = _object(read_json(evaluation_path), "Evaluation")
            if started_path.exists():
                started.add(directory.name)
    scenario = experiment.get("scenario")
    expected = scenario.get("assertions", []) if isinstance(scenario, dict) else []
    if not isinstance(expected, list) or any(
        not isinstance(assertion, dict) or not isinstance(assertion.get("id"), str)
        for assertion in expected
    ):
        raise ValueError("Frozen scenario assertions must be objects with string ids")
    rows = [
        _row(
            item, attempts.get(attempt_id), evaluations.get(attempt_id), attempt_id in started, expected,
            _artifact_integrity(evidence / attempt_id, attempts.get(attempt_id)),
        )
        for attempt_id, item in scheduled.items()
    ]
    by_arm = {
        arm: _summary([row for row in rows if row["arm"] == arm])
        for arm in sorted({row["arm"] for row in rows})
    }
    return {
        "schema_version": 1,
        "generated_at": utc_now(),
        "experiment": {key: value for key, value in experiment.items() if key != "schedule"},
        "rows": rows,
        "summary": _summary(rows),
        "by_arm": by_arm,
        "contrasts": _contrasts(by_arm),
        "limitations": LIMITATIONS[:],
        "calibrated_real_app_oracle": False,
    }


def _display(value) -> str:
    if value is None:
        return "unknown"
    if isinstance(value, float):
        return f"{value:.6g}"
    return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def render_report(report: dict) -> str:
    """Render a compact human companion; the JSON retains the full evidence."""
    summary = report["summary"]
    spend = summary["ai_credits"]
    lines = [
        "# UWP skill-value pilot",
        "",
        f"Planned: {summary['planned']}; attempted: {summary['attempted']}; "
        f"benchmark passes: {summary['all_attempt_success_count']}/{summary['planned']}; "
        f"evaluated: {summary['evaluated_count']}.",
        f"AI credits: {_display(spend['total'])}; known lower bound: {_display(spend['known_lower_bound'])}; "
        f"attempts with unknown spend: {spend['unknown_attempts']}.",
        "Cost per benchmark pass: " + (
            _display(summary["cost_per_success"]) if summary["all_attempt_success_count"]
            else "undefined (no successful attempts)"
        ) + ".",
        "",
        "| Arm | Planned | Attempted | Pass | AI credits | Known lower bound |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for arm, value in report["by_arm"].items():
        lines.append(
            f"| {_display(arm)} | {value['planned']} | {value['attempted']} | "
            f"{value['all_attempt_success_count']} | {_display(value['ai_credits']['total'])} | "
            f"{_display(value['ai_credits']['known_lower_bound'])} |"
        )
    lines += ["", "| Attempt | Arm | Status | AI credits | Model mismatch |",
              "| --- | --- | --- | ---: | --- |"]
    for row in report["rows"]:
        lines.append(
            f"| {_display(row['id'])} | {_display(row['arm'])} | {row['status']} | "
            f"{_display(row['ai_credits'])} | {_display(row['model_mismatch'])} |"
        )
    lines += ["", "## Descriptive contrasts", ""]
    for contrast in report["contrasts"]:
        lines.append(
            f"- {contrast['id']}: pass-rate difference "
            f"{_display(contrast['all_attempt_success_rate_difference'])}; inconclusive."
        )
    lines += ["", "## Limitations", ""]
    lines += [f"- {limitation}" for limitation in report["limitations"]]
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Experiment directory containing experiment.json")
    parser.add_argument("--output", type=Path, help="New JSON path (must not already exist)")
    args = parser.parse_args(argv)
    report = build_report(args.root)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = args.output or args.root / "reports" / f"report-{stamp}.json"
    markdown = output.with_suffix(".md")
    if output == markdown or markdown.exists():
        raise FileExistsError(f"Report output already exists or collides: {markdown}")
    write_json(output, report)
    with markdown.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(render_report(report))
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
