import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from export_report import export_report
from support import write_json


class ExportTests(unittest.TestCase):
    def test_raw_messages_paths_and_failure_reasons_are_not_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            experiment = {
                "id": "frozen-id", "lane": "build-only", "model": "gpt-5.4", "effort": "medium",
                "context": "default", "credits": 600, "seconds": 1800, "seed": 42,
                "toolchain": {}, "harness_hashes": {},
            }
            write_json(root / "experiment.json", experiment)
            write_json(root / "prepared.json", {"scaffold_hashes": {}, "treatment_hashes": {}})
            write_json(root / "materialization.json", {"treatment_diffs": {}})
            log = root / "e" / "r1-B" / "agent" / "stdout.txt"
            log.parent.mkdir(parents=True)
            log.write_text(json.dumps({"type": "tool.execution_start", "data": {"secret": "DO_NOT_PUBLISH"}}) + "\n")
            row = {
                "id": "r1-B", "arm": "B", "repeat": 1, "status": "fail",
                "attempt_status": "unverified", "attempted": True,
                "process": {"exit_code": 0, "cwd": "C:\\PRIVATE_USER\\secret", "elapsed_seconds": 1},
                "evaluation": {"assertions": [{"id": "startup", "status": "fail", "reason": "DO_NOT_PUBLISH"}]},
                "ai_credits": None, "input_tokens": None, "cache_read_tokens": None,
                "cache_write_tokens": None, "output_tokens": None, "observed_models": ["gpt-5.4"],
                "model_mismatch": False, "evaluation_status": "fail",
            }
            with patch("export_report.build_report", return_value={
                "experiment": experiment, "rows": [row], "summary": {}, "by_arm": {},
            }):
                result = export_report(root, root, "pilot")
            text = json.dumps(result)
            self.assertNotIn("DO_NOT_PUBLISH", text)
            self.assertNotIn("PRIVATE_USER", text)
            self.assertEqual(result["rows"][0]["event_counts"]["tool.execution_start"], 1)
            self.assertIsNone(result["rows"][0]["ai_credits"])
            self.assertIn("generation/agent/stdout.txt", result["rows"][0]["artifacts"])

    def test_reanalysis_of_different_experiment_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_json(root / "experiment.json", {"id": "original"})
            with patch("export_report.build_report", return_value={"experiment": {"id": "other"}}):
                with self.assertRaises(ValueError):
                    export_report(root, root, "pilot")


if __name__ == "__main__":
    unittest.main()
