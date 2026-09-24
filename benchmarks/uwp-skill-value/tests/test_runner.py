import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import runner
from support import file_hashes, read_json, sha256, write_json


def fixture(root):
    source = root / "inputs" / "source"
    source.mkdir(parents=True)
    (source / "original.cs").write_text("original")
    scaffold = root / "inputs" / "scaffold"
    scaffold.mkdir()
    (scaffold / "Example.csproj").write_text(
        '<Project><PropertyGroup><TargetFramework>net10.0-windows10.0.26100.0</TargetFramework>'
        '</PropertyGroup><ItemGroup><PackageReference Include="Example" Version="1.2.3"/></ItemGroup></Project>'
    )
    (scaffold / "Package.appxmanifest").write_text(
        '<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">'
        '<Identity Name="Original" Publisher="CN=Example" Version="1.0.0.0"/></Package>'
    )
    write_json(scaffold / "global.json", {"sdk": {"version": "10.0.401", "rollForward": "disable"}})
    for arm in runner.ARMS:
        bundle = root / "treatments" / arm / "agent-plugin"
        bundle.mkdir(parents=True)
        (bundle / "common.txt").write_text("identical")
    write_json(root / "materialization.json", {"pinned": True})
    prepared = {
        "target_project": "Example.csproj", "scaffold_hashes": file_hashes(scaffold),
        "project_contract": runner.project_contract(scaffold / "Example.csproj"),
        "source_hashes": file_hashes(source),
        "treatment_hashes": {arm: file_hashes(root / "treatments" / arm / "agent-plugin") for arm in runner.ARMS},
        "materialization_sha256": sha256(root / "materialization.json"),
    }
    write_json(root / "prepared.json", prepared)


class RunnerTests(unittest.TestCase):
    def test_plan_is_offline_and_immutable(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(runner, "run_process") as process:
            root = Path(directory)
            fixture(root)
            result = runner.plan(root, model="gpt-5.4", effort="medium", context="default",
                                 credits=600, seconds=1800, repeats=1, seed=42)
            self.assertEqual(len(result["schedule"]), 4)
            self.assertEqual({row["arm"] for row in result["schedule"]}, set(runner.ARMS))
            self.assertEqual(len({row["package_identity"] for row in result["schedule"]}), 4)
            self.assertIn("target\\Example.csproj", result["prompt_common"])
            self.assertEqual(result["planned_max_agent_seconds"], 7200)
            process.assert_not_called()
            with self.assertRaises(FileExistsError):
                runner.plan(root, model="gpt-5.4", effort="medium", context="default",
                            credits=600, seconds=1800, repeats=1, seed=42)

    def test_changed_bundle_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            (root / "treatments" / "B" / "agent-plugin" / "leaked-UWP.md").write_text("leak")
            with self.assertRaisesRegex(ValueError, "Frozen B"):
                runner.validate_inputs(root, read_json(root / "prepared.json"))

    def test_identity_changes_only_manifest_name(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            workspace = root / "workspace"
            import shutil
            shutil.copytree(root / "inputs" / "scaffold", workspace / "target")
            before = file_hashes(workspace)
            result = runner._identity(workspace, "UwpSkillValue.unique")
            after = file_hashes(workspace)
            self.assertEqual([path for path in before if before[path] != after[path]],
                             ["target/Package.appxmanifest"])
            self.assertEqual(result["before_sha256"], before["target/Package.appxmanifest"])
            self.assertEqual(result["after_sha256"], after["target/Package.appxmanifest"])

    def test_auto_and_unbounded_schedules_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for model, repeats in (("auto", 1), ("gpt-5.4", 48)):
                with self.assertRaises(ValueError):
                    runner.plan(Path(directory), model=model, effort="medium", context="default",
                                credits=600, seconds=1800, repeats=repeats, seed=42)

    def test_native_failure_is_retained_not_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            experiment = runner.plan(root, model="gpt-5.4", effort="medium", context="default",
                                     credits=600, seconds=1800, repeats=1, seed=42)
            attempt_id = experiment["schedule"][0]["id"]
            result = {"exit_code": 9, "timed_out": False, "error": None}
            with patch.object(runner, "run_process", return_value=result), \
                    patch.object(runner, "copilot_command", return_value=["mock"]), \
                    patch.object(runner, "check_toolchain", return_value={"status": "pass"}), \
                    patch("report.collect_usage", return_value={"ai_credits": None}):
                attempt = runner.run_attempt(root, attempt_id, supervised_local=True)
            self.assertEqual(attempt["status"], "fail")
            self.assertIsNone(attempt["usage"]["ai_credits"])
            self.assertTrue((root / "e" / attempt_id / "attempt.json").exists())
            with self.assertRaises(FileExistsError):
                runner.run_attempt(root, attempt_id, supervised_local=True)

    def test_explicit_supervision_required(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "supervised-local"):
                runner.run_attempt(Path(directory), "r1-B", supervised_local=False)

    def test_cli_uses_plugin_namespaced_agent(self):
        experiment = {
            "model": "gpt-5.4", "effort": "medium", "context": "default", "credits": 600,
            "prompt_common": "Migrate", "prompt_interfaces": runner.INTERFACES,
        }
        with patch("shutil.which", return_value="copilot.exe"):
            argv = runner.copilot_command(experiment, Path("workspace"), Path("evidence"), "B")
        self.assertEqual(argv[argv.index("--agent") + 1], "winui:winui-dev")

    def test_deleted_target_is_terminal_and_next_attempt_can_run(self):
        import shutil
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            experiment = runner.plan(root, model="gpt-5.4", effort="medium", context="default",
                                     credits=600, seconds=1800, repeats=1, seed=42)
            first, second = [row["id"] for row in experiment["schedule"][:2]]

            def deleting_agent(*args, **kwargs):
                shutil.rmtree(kwargs["cwd"] / "target")
                return {"exit_code": 0, "timed_out": False, "error": None}

            with patch.object(runner, "run_process", side_effect=deleting_agent), \
                    patch.object(runner, "copilot_command", return_value=["mock"]), \
                    patch.object(runner, "check_toolchain", return_value={"status": "pass"}), \
                    patch("report.collect_usage", return_value={"ai_credits": 3.25}):
                result = runner.run_attempt(root, first, supervised_local=True)
                next_result = runner.run_attempt(root, second, supervised_local=True)
            self.assertEqual(result["status"], "invalid")
            self.assertIsNone(result["output_hashes"])
            self.assertIsNone(result["frozen_output"])
            self.assertEqual(result["usage"]["ai_credits"], 3.25)
            self.assertEqual(next_result["status"], "invalid")
            self.assertTrue((root / "e" / second / "attempt.json").exists())

    def test_interruption_retains_terminal_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            experiment = runner.plan(root, model="gpt-5.4", effort="medium", context="default",
                                     credits=600, seconds=1800, repeats=1, seed=42)
            attempt_id = experiment["schedule"][0]["id"]
            with patch.object(runner, "run_process", side_effect=KeyboardInterrupt), \
                    patch.object(runner, "copilot_command", return_value=["mock"]), \
                    patch.object(runner, "check_toolchain", return_value={"status": "pass"}), \
                    patch("report.collect_usage", return_value={"ai_credits": None}):
                with self.assertRaises(KeyboardInterrupt):
                    runner.run_attempt(root, attempt_id, supervised_local=True)
            result = read_json(root / "e" / attempt_id / "attempt.json")
            self.assertEqual(result["status"], "infra_error")
            self.assertTrue(result["cancelled"])
            self.assertFalse((root / "active.lock").exists())


if __name__ == "__main__":
    unittest.main()
