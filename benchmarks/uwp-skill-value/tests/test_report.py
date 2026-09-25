import contextlib
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import unittest
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import report
from support import write_json


def cli_1083_usage():
    """Usage keys and values from the real run-owned CLI 1.0.83 no-op diagnostic."""
    details = {
        "input": {"tokenCount": 16332}, "cache_read": {"tokenCount": 14848},
        "cache_write": {"tokenCount": 0}, "output": {"tokenCount": 286},
    }
    model = {
        "requests": {"count": 2, "cost": 1},
        "usage": {
            "inputTokens": 31180, "outputTokens": 286, "cacheReadTokens": 14848,
            "cacheWriteTokens": 0, "reasoningTokens": 153,
        },
        "totalNanoAiu": 4883200000, "tokenDetails": details,
    }
    return {
        "totalPremiumRequestCost": 1, "totalUserRequests": 1,
        "totalNanoAiu": 4883200000, "tokenDetails": details,
        "totalApiDurationMs": 4177, "modelMetrics": {"gpt-5.4": model},
        "agentMetrics": {"main": {
            "totalApiDurationMs": 4177, "totalNanoAiu": 4883200000,
            "modelMetrics": {"gpt-5.4": model},
        }},
        "currentModel": "gpt-5.4", "lastCallInputTokens": 15683, "lastCallOutputTokens": 84,
    }


class EvidenceTestCase(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parent / (".report-test-" + uuid.uuid4().hex)
        self.root.mkdir()
        self.addCleanup(shutil.rmtree, self.root)

    def schedule(self, arms=("B", "F", "T", "L")):
        rows = [
            {"id": f"trial-{index}", "arm": arm, "repeat": 0,
             "scenario": "fixture", "model": "requested-model"}
            for index, arm in enumerate(arms)
        ]
        write_json(self.root / "experiment.json", {"id": "unit-test", "schedule": rows})
        return rows

    def attempt(self, index, *, credits=None, status="unverified", code=0, timeout=False,
                evaluation=True, assertions=None, observed=None):
        evidence = self.root / "e" / f"trial-{index}"
        frozen = evidence / "frozen-output"
        frozen.mkdir(parents=True)
        content = b"class Target { }\n"
        (frozen / "target.cs").write_bytes(content)
        usage = {"ai_credits": credits}
        if observed is not None:
            usage["observed_models"] = observed
        value = {
            "id": f"trial-{index}", "status": status,
            "process": {"exit_code": code, "timed_out": timeout, "error": None},
            "usage": usage, "output_hashes": {"target.cs": hashlib.sha256(content).hexdigest()},
            "frozen_output": str(frozen),
        }
        write_json(evidence / "attempt.json", value)
        if evaluation:
            write_json(evidence / "evaluation.json", {
                "status": "pass",
                "assertions": assertions if assertions is not None else [
                    {"id": "check", "mandatory": True, "status": "pass", "reason": "fixture"},
                ],
            })
        return evidence


class ReportTests(EvidenceTestCase):
    def test_missing_usage_is_unknown_not_free(self):
        self.schedule(("B",))
        self.attempt(0)
        result = report.build_report(self.root)
        for metric in report.METRICS:
            self.assertIsNone(result["rows"][0][metric])
        self.assertIsNone(result["summary"]["ai_credits"]["total"])
        self.assertEqual(result["summary"]["ai_credits"]["known_lower_bound"], 0)
        self.assertIsNone(result["summary"]["cost_per_success"])

    def test_native_nonzero_overrides_passing_evaluator(self):
        self.schedule(("B",))
        self.attempt(0, credits=2, code=7, status="pass")
        result = report.build_report(self.root)
        self.assertEqual(result["rows"][0]["status"], "fail")
        self.assertEqual(result["summary"]["evaluation_pass_count"], 1)
        self.assertEqual(result["summary"]["all_attempt_success_count"], 0)
        self.assertIsNone(result["summary"]["cost_per_success"])
        self.assertEqual(result["summary"]["failed_or_timeout_ai_credits"]["total"], 2)

    def test_no_evaluation_is_unverified(self):
        self.schedule(("B",))
        self.attempt(0, status="pass", evaluation=False)
        result = report.build_report(self.root)
        self.assertEqual(result["rows"][0]["status"], "unverified")
        self.assertEqual(result["summary"]["evaluated_count"], 0)

    def test_all_mandatory_assertions_must_pass(self):
        self.schedule(("B", "F", "T", "L"))
        self.attempt(0, assertions=[])
        self.attempt(1, assertions=[{"id": "mandatory", "status": "blocked"}])
        self.attempt(2, assertions=[{"id": "mandatory", "status": "fail"}])
        self.attempt(3, assertions=[
            {"id": "mandatory", "status": "pass"},
            {"id": "optional", "mandatory": False, "status": "fail"},
        ])
        result = report.build_report(self.root)
        self.assertEqual([row["status"] for row in result["rows"]],
                         ["unverified", "unverified", "fail", "pass"])
        self.assertEqual(result["summary"]["all_attempt_success_count"], 1)
        self.assertEqual(result["summary"]["strong_success_count"], 0)
        self.assertFalse(result["calibrated_real_app_oracle"])

    def test_frozen_mandatory_assertion_cannot_be_omitted(self):
        self.schedule(("B",))
        path = self.root / "experiment.json"
        experiment = json.loads(path.read_text())
        experiment["scenario"] = {"assertions": [{"id": "check"}, {"id": "required-runtime"}]}
        path.write_text(json.dumps(experiment), encoding="utf-8")
        self.attempt(0)
        row = report.build_report(self.root)["rows"][0]
        self.assertEqual(row["status"], "unverified")
        self.assertIn("frozen scenario", row["reason"])

    def test_invalid_attempt_never_passes(self):
        self.schedule(("B",))
        self.attempt(0, status="invalid")
        row = report.build_report(self.root)["rows"][0]
        self.assertEqual(row["status"], "invalid")
        self.assertEqual(row["attempt_status"], "invalid")

    def test_deleted_output_invalid_keeps_spend_and_scheduled_denominator(self):
        self.schedule(("B", "F"))
        directory = self.attempt(0, status="invalid", credits=7.5)
        shutil.rmtree(directory / "frozen-output")
        result = report.build_report(self.root)
        self.assertEqual(result["rows"][0]["status"], "invalid")
        self.assertEqual(result["summary"]["planned"], 2)
        self.assertEqual(result["summary"]["status_counts"]["infra_error"], 0)
        self.assertEqual(result["summary"]["status_counts"]["invalid"], 1)
        self.assertEqual(result["summary"]["ai_credits"]["total"], 7.5)
        self.assertEqual(result["summary"]["protocol_invalid_ai_credits"]["total"], 7.5)
        self.assertEqual(result["summary"]["all_attempt_success_count"], 0)

    def test_changed_frozen_artifact_cannot_pass(self):
        self.schedule(("B",))
        evidence = self.attempt(0)
        (evidence / "frozen-output" / "target.cs").write_text("changed", encoding="utf-8")
        row = report.build_report(self.root)["rows"][0]
        self.assertEqual(row["status"], "infra_error")
        self.assertEqual(row["artifact_integrity"]["status"], "fail")
        self.assertEqual(row["artifact_integrity"]["modified"], ["target.cs"])
        self.assertTrue(row["evaluation_pass"])

    def test_missing_frozen_artifact_cannot_pass(self):
        self.schedule(("B",))
        evidence = self.attempt(0)
        shutil.rmtree(evidence / "frozen-output")
        row = report.build_report(self.root)["rows"][0]
        self.assertEqual(row["status"], "infra_error")
        self.assertIn("missing", row["reason"])

    def test_removed_and_added_frozen_files_are_detected(self):
        self.schedule(("B",))
        evidence = self.attempt(0)
        frozen = evidence / "frozen-output"
        (frozen / "target.cs").unlink()
        (frozen / "new.cs").write_text("new", encoding="utf-8")
        row = report.build_report(self.root)["rows"][0]
        self.assertEqual(row["status"], "infra_error")
        self.assertEqual(row["artifact_integrity"]["missing"], ["target.cs"])
        self.assertEqual(row["artifact_integrity"]["unexpected"], ["new.cs"])

    def test_missing_output_hashes_is_unverified(self):
        self.schedule(("B",))
        path = self.attempt(0) / "attempt.json"
        value = json.loads(path.read_text())
        del value["output_hashes"]
        path.write_text(json.dumps(value), encoding="utf-8")
        row = report.build_report(self.root)["rows"][0]
        self.assertEqual(row["status"], "unverified")
        self.assertEqual(row["artifact_integrity"]["status"], "unverified")

    def test_redirected_frozen_output_path_is_rejected_without_scanning_it(self):
        self.schedule(("B",))
        path = self.attempt(0) / "attempt.json"
        value = json.loads(path.read_text())
        value["frozen_output"] = str(self.root / "unrelated")
        path.write_text(json.dumps(value), encoding="utf-8")
        row = report.build_report(self.root)["rows"][0]
        self.assertEqual(row["status"], "infra_error")
        self.assertIn("run-owned", row["reason"])

    def test_explicit_current_model_mismatch_invalidates_passing_evaluation(self):
        self.schedule(("B",))
        path = self.attempt(0) / "attempt.json"
        value = json.loads(path.read_text())
        value["usage"]["current_model"] = "different-model"
        path.write_text(json.dumps(value), encoding="utf-8")
        row = report.build_report(self.root)["rows"][0]
        self.assertEqual(row["status"], "infra_error")
        self.assertTrue(row["model_mismatch"])
        self.assertTrue(row["process_success"])
        self.assertTrue(row["evaluation_pass"])
        self.assertIn("different-model", row["reason"])

    def test_full_schedule_and_failed_timeout_spend_are_retained(self):
        self.schedule(("B", "B", "B", "B", "B"))
        self.attempt(0, credits=1)
        self.attempt(1, credits=2, code=9)
        self.attempt(2, credits=3, timeout=True)
        write_json(self.root / "e" / "trial-3" / "started.json", {"id": "trial-3"})
        result = report.build_report(self.root)
        self.assertEqual([row["status"] for row in result["rows"]],
                         ["pass", "fail", "timeout", "infra_error", "not_run"])
        summary = result["summary"]
        self.assertEqual(summary["planned"], 5)
        self.assertEqual(summary["attempted"], 4)
        self.assertEqual(summary["all_attempt_success_rate"], .2)
        self.assertEqual(summary["failed_or_timeout_ai_credits"]["total"], 5)
        self.assertIsNone(summary["ai_credits"]["total"])
        self.assertEqual(summary["ai_credits"]["known_lower_bound"], 6)
        self.assertEqual(summary["ai_credits"]["unknown_attempts"], 1)
        self.assertIsNone(summary["cost_per_success"])

    def test_total_and_cost_per_success_include_failures(self):
        self.schedule(("B", "B"))
        self.attempt(0, credits=2)
        self.attempt(1, credits=3, code=1)
        summary = report.build_report(self.root)["summary"]
        self.assertEqual(summary["ai_credits"]["total"], 5)
        self.assertEqual(summary["cost_per_success"], 5)
        self.assertEqual(summary["all_attempt_success_rate"], .5)

    def test_duplicate_scheduled_ids_raise(self):
        rows = self.schedule(("B", "F"))
        rows[1]["id"] = rows[0]["id"]
        (self.root / "experiment.json").write_text(json.dumps({"schedule": rows}), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            report.build_report(self.root)

    def test_unknown_attempts_raise(self):
        self.schedule(("B",))
        self.attempt(9)
        with self.assertRaisesRegex(ValueError, "Unknown"):
            report.build_report(self.root)

    def test_duplicate_or_mismatched_attempt_ids_raise(self):
        self.schedule(("B", "F"))
        self.attempt(0)
        path = self.attempt(1) / "attempt.json"
        value = json.loads(path.read_text())
        value["id"] = "trial-0"
        path.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            report.build_report(self.root)

    def test_requested_model_is_never_used_as_observed(self):
        self.schedule(("B", "F", "T"))
        self.attempt(0)
        self.attempt(1, observed=["different-model"])
        self.attempt(2, observed=["requested-model"])
        rows = report.build_report(self.root)["rows"]
        self.assertEqual(rows[0]["observed_models"], [])
        self.assertIsNone(rows[0]["model_mismatch"])
        self.assertTrue(rows[1]["model_mismatch"])
        self.assertFalse(rows[2]["model_mismatch"])

    def test_unknown_or_negative_costs_do_not_become_zero(self):
        self.schedule(("B", "F", "T"))
        self.attempt(0, credits=-1)
        self.attempt(1, credits=True)
        self.attempt(2, credits=0)
        result = report.build_report(self.root)
        self.assertEqual([row["ai_credits"] for row in result["rows"]], [None, None, 0])
        self.assertIsNone(result["summary"]["ai_credits"]["total"])
        self.assertEqual(result["summary"]["ai_credits"]["unknown_attempts"], 2)

    def test_expected_contrasts_and_caveats(self):
        self.schedule()
        for index in range(4):
            self.attempt(index, credits=index + 1)
        result = report.build_report(self.root)
        self.assertEqual([item["id"] for item in result["contrasts"]], ["F-B", "T-B", "L-T", "F-L"])
        self.assertTrue(all(item["conclusion"] == "inconclusive" for item in result["contrasts"]))
        text = report.render_report(result)
        self.assertIn("No calibrated real-app oracle", text)
        self.assertIn("not measure context occupancy", text)
        self.assertIn("known lower bound", text)

    def test_cli_writes_new_reports_without_modifying_attempts(self):
        self.schedule(("B",))
        attempt = self.attempt(0) / "attempt.json"
        original = attempt.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            report.main([str(self.root)])
            report.main([str(self.root)])
        reports = list((self.root / "reports").glob("*.json"))
        self.assertEqual(len(reports), 2)
        self.assertEqual(len(list((self.root / "reports").glob("*.md"))), 2)
        with self.assertRaises(FileExistsError):
            report.main([str(self.root), "--output", str(reports[0])])
        self.assertEqual(attempt.read_bytes(), original)


class UsageTests(EvidenceTestCase):
    def setUp(self):
        super().setUp()
        self.evidence = self.root / "e" / "trial"
        self.home = self.root / "h" / "trial"
        self.evidence.mkdir(parents=True)
        self.home.mkdir(parents=True)

    def event_file(self, path, events):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(json.dumps(event) for event in events) + "\n", encoding="utf-8")

    def test_missing_all_usage_is_null(self):
        result = report.collect_usage(self.evidence, self.home)
        self.assertTrue(all(result[metric] is None for metric in report.METRICS))
        self.assertEqual(result["components"], [])
        self.assertEqual(result["observed_models"], [])
        self.assertIsNone(result["total_source"])
        self.assertEqual(result["telemetry"]["missing_metrics"], list(report.METRICS))

    def test_real_cli_1083_aggregate_views_are_not_added(self):
        raw = cli_1083_usage()
        write_json(self.evidence / "usage.json", raw)
        result = report.collect_usage(self.evidence, self.home)
        self.assertAlmostEqual(result["ai_credits"], 4.8832)
        self.assertEqual(result["input_tokens"], 16332)
        self.assertEqual(result["cache_read_tokens"], 14848)
        self.assertEqual(result["cache_write_tokens"], 0)
        self.assertEqual(result["output_tokens"], 286)
        self.assertEqual(result["observed_models"], ["gpt-5.4"])
        self.assertEqual(result["current_model"], "gpt-5.4")
        self.assertEqual(result["provider_aggregates"][0]["raw"], raw)
        model = result["model_aggregates"][0]
        self.assertEqual(model["input_tokens_including_cache"], 31180)
        self.assertEqual(model["reasoning_tokens"], 153)
        self.assertEqual(model["ai_credits"], result["ai_credits"])
        self.assertEqual(result["agent_aggregates"][0]["ai_credits"], result["ai_credits"])
        self.assertEqual(result["total_source"], "evidence/usage.json#totalNanoAiu")
        self.assertEqual(result["telemetry"]["missing_metrics"], [])
        self.assertEqual(result["telemetry"]["component_coverage"], "partial_or_unknown")

    def test_provider_aggregate_not_added_to_child_and_call_views(self):
        raw = cli_1083_usage()
        raw["agentMetrics"]["child"] = {
            "totalNanoAiu": 1000000000,
            "modelMetrics": {"child-model": {"totalNanoAiu": 1000000000}},
        }
        raw["totalNanoAiu"] += 1000000000
        write_json(self.evidence / "usage.json", raw)
        event = {"id": "child-call", "type": "assistant.usage", "data": {
            "model": "child-model", "totalNanoAiu": 1000000000,
        }}
        self.event_file(self.evidence / "agent" / "stdout.txt", [event])
        self.event_file(self.home / "session-state" / "child" / "events.jsonl", [event])
        result = report.collect_usage(self.evidence, self.home)
        self.assertAlmostEqual(result["ai_credits"], 5.8832)
        self.assertEqual(len(result["components"]), 1)
        self.assertEqual(result["components"][0]["ai_credits"], 1)
        self.assertEqual(len(result["components"][0]["locations"]), 2)
        self.assertEqual(result["observed_models"], ["child-model", "gpt-5.4"])

    def test_missing_top_credits_never_falls_back_to_other_views(self):
        raw = cli_1083_usage()
        del raw["totalNanoAiu"]
        write_json(self.evidence / "usage.json", raw)
        result = report.collect_usage(self.evidence, self.home)
        self.assertIsNone(result["ai_credits"])
        self.assertEqual(result["input_tokens"], 16332)
        self.assertEqual(result["telemetry"]["missing_metrics"], ["ai_credits"])
        self.assertIsNone(result["total_source"])

    def test_missing_token_details_never_uses_inclusive_or_last_call_input(self):
        raw = cli_1083_usage()
        del raw["tokenDetails"]
        write_json(self.evidence / "usage.json", raw)
        result = report.collect_usage(self.evidence, self.home)
        self.assertAlmostEqual(result["ai_credits"], 4.8832)
        self.assertIsNone(result["input_tokens"])
        self.assertIsNone(result["output_tokens"])
        self.assertIsNone(result["cache_read_tokens"])
        self.assertIsNone(result["cache_write_tokens"])

    def test_current_model_without_observed_usage_is_not_observed_model(self):
        write_json(self.evidence / "usage.json", {"currentModel": "requested-model"})
        result = report.collect_usage(self.evidence, self.home)
        self.assertEqual(result["observed_models"], [])
        self.assertEqual(result["current_model"], "requested-model")
        self.assertIsNone(result["ai_credits"])

    def test_explicit_zero_total_is_known_zero_not_missing(self):
        write_json(self.evidence / "usage.json", {"totalNanoAiu": 0})
        result = report.collect_usage(self.evidence, self.home)
        self.assertEqual(result["ai_credits"], 0)
        self.assertNotIn("ai_credits", result["telemetry"]["missing_metrics"])

    def test_unknown_schema_is_preserved_and_not_guessed_as_credits(self):
        raw = {"cost": 123, "premiumRequests": 4, "totalTokens": 999, "futureSchema": True}
        path = self.evidence / "usage.json"
        write_json(path, raw)
        original = path.read_bytes()
        result = report.collect_usage(self.evidence, self.home)
        self.assertIsNone(result["ai_credits"])
        self.assertIsNone(result["input_tokens"])
        self.assertEqual(result["provider_aggregates"][0]["raw"], raw)
        self.assertEqual(result["sources"][0]["sha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(path.read_bytes(), original)

    def test_run_owned_child_events_and_native_id_deduplication(self):
        parent = {"id": "parent-call", "type": "assistant.usage", "data": {
            "model": "parent-model", "inputTokens": 10, "outputTokens": 3,
        }}
        child = {"id": "child-call", "type": "assistant.usage", "data": {
            "model": "child-model", "inputTokens": 5, "outputTokens": 2, "cacheReadTokens": 0,
        }}
        self.event_file(self.evidence / "agent" / "stdout.txt", [parent])
        self.event_file(self.home / "session-state" / "parent" / "events.jsonl", [parent])
        self.event_file(self.home / "session-state" / "child" / "events.jsonl", [child])
        # A different run's home is deliberately outside the supplied tree.
        self.event_file(self.home.parent / "other" / "session-state" / "other" / "events.jsonl", [
            {"id": "unrelated", "type": "assistant.usage", "data": {"model": "unrelated-model"}},
        ])
        result = report.collect_usage(self.evidence, self.home)
        self.assertEqual(len(result["components"]), 2)
        self.assertEqual(result["components"][0]["id"], "event:parent-call")
        self.assertEqual(len(result["components"][0]["locations"]), 2)
        self.assertIsNone(result["components"][1]["input_tokens"])
        self.assertEqual(result["components"][1]["input_tokens_including_cache"], 5)
        self.assertEqual(result["components"][1]["cache_read_tokens"], 0)
        self.assertIsNone(result["components"][1]["cache_write_tokens"])
        self.assertEqual(result["observed_models"], ["child-model", "parent-model"])
        # Observing some component events does not establish complete billing coverage.
        self.assertIsNone(result["ai_credits"])
        self.assertIsNone(result["input_tokens"])
        again = report.collect_usage(self.evidence, self.home)
        self.assertEqual([item["id"] for item in result["components"]],
                         [item["id"] for item in again["components"]])

    def test_distinct_calls_with_equal_usage_are_not_deduplicated(self):
        event = {"type": "assistant.usage", "data": {"inputTokens": 10}}
        self.event_file(self.evidence / "agent" / "stdout.txt", [event, event])
        result = report.collect_usage(self.evidence, self.home)
        self.assertEqual(len(result["components"]), 2)
        self.assertNotEqual(result["components"][0]["id"], result["components"][1]["id"])

    def test_malformed_usage_and_non_json_stdout_preserve_unknowns(self):
        (self.evidence / "usage.json").write_text("{broken", encoding="utf-8")
        stdout = self.evidence / "agent" / "stdout.txt"
        stdout.parent.mkdir()
        stdout.write_text("native diagnostic\n{}\n", encoding="utf-8")
        result = report.collect_usage(self.evidence, self.home)
        self.assertEqual(len(result["diagnostics"]["parse_errors"]), 2)
        self.assertEqual(len(result["sources"]), 2)
        self.assertIsNone(result["ai_credits"])


if __name__ == "__main__":
    unittest.main()
