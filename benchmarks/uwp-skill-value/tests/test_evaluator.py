"""Mocked evaluator goldens/mutants, not a claim of a validated migrated app."""

from __future__ import annotations

import json
import shutil
import struct
import subprocess
import sys
import unittest
import uuid
import zlib
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import evaluator


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 300, 300, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress((b"\0" + b"\xff" * 900) * 300)) + chunk(b"IEND", b""))


def golden_ui(directory, executable, project):
    """Synthetic winapp0.6.1-shaped native logs, UIA, and screenshot evidence."""
    directory.mkdir(parents=True)
    scenario = evaluator.load_scenario()
    owner = {"pid": 4242, "executable": str(executable), "creation_time": "2026-09-24T09:00:01Z",
             "sha256": evaluator.sha256(executable), "ownership_verified": True}
    write(directory / "ownership.json", owner)
    write(directory / "001-run.stdout.txt", {"ProcessId": 4242})
    write(directory / "001-run.command.json", {
        "argv": ["winapp", "run", str(project),
                 "-c", "Release", "--arch", "x64", "-p", "Platform=x64", "--detach", "--json", "--no-build"],
        "exit_code": 0, "timed_out": False, "error": None, "stdout": "001-run.stdout.txt",
    })
    write(directory / "survival.json", {"pid": 4242, "hwnd": 234, "observation_seconds": 3})
    write(directory / "cleanup.json", {**owner, "exited": True})
    for identifier, name in evaluator.UI_STATES.items():
        labels = []
        colors, photos = [0, 0, 0, 0], []
        if identifier == "startup_content":
            labels = [scenario["oracle"]["feature_name"], *scenario["oracle"]["navigation"]]
        elif identifier.startswith("basic_"):
            labels = ["Realize Elements", scenario["oracle"]["pages"][0]["description_prefix"]]
            if identifier not in ("basic_initial", "basic_navigation_reset"):
                colors = [10000] * 4
        elif identifier.startswith("adaptive_"):
            page = scenario["oracle"]["pages"][1]
            labels = [page["description_prefix"], *[v for row in page["mail"] for v in row]]
            if identifier not in ("adaptive_narrow", "adaptive_shrink"):
                labels += page["labels"]
            if identifier in ("adaptive_desktop", "adaptive_reexpand"):
                labels += page["accounts"]
        else:
            labels = ["Rainier", scenario["oracle"]["pages"][2]["description_prefix"]]
            photos = [{"asset": asset, "mean_error": 3.2, "x": 500, "y": 200 + n * 170}
                      for n, asset in enumerate(("rainier.jpg", "valley.jpg"))]
        elements = [{"name": label, "type": "Text", "isOffscreen": False, "width": 100, "height": 20}
                    for label in labels]
        write(directory / f"{name}.uia.json", {
            "windows": [{"hwnd": 234, "elementCount": len(elements), "elements": elements}],
        })
        (directory / f"{name}.png").write_bytes(png())
        write(directory / f"{name}.visual.json", {
            "pid": 4242, "hwnd": 234, "screenshot": f"{name}.png", "uia": f"{name}.uia.json",
            "colors": colors, "photos": photos, "scale": 1,
        })
    payload = {
        "schema_version": 1, "owned_process": owner,
        "assertions": [{"id": identifier, "status": "pass", "reason": "Mocked golden evidence",
                        "evidence": ["ownership.json"]} for identifier in evaluator.UI_IDS],
    }
    write(directory / "results.json", payload)
    return payload


class FakeRunner:
    def __init__(self, test, *, build_exit=0, output=True, ui_mutator=None, missing_ui=False,
                 ui_exit=0, mutate_workspace=False, missing_logs=False, executable_name=None):
        self.test, self.calls = test, []
        self.build_exit, self.output = build_exit, output
        self.ui_mutator, self.missing_ui, self.ui_exit = ui_mutator, missing_ui, ui_exit
        self.mutate_workspace, self.missing_logs = mutate_workspace, missing_logs
        self.executable_name = executable_name

    def __call__(self, argv, *, cwd, evidence_dir, timeout_seconds, env=None):
        self.calls.append((argv, cwd))
        evidence_dir.mkdir(parents=True)
        stdout, stderr = evidence_dir / "stdout.txt", evidence_dir / "stderr.txt"
        stdout.write_text("Native process fixture\n", encoding="utf-8")
        stderr.write_text("", encoding="utf-8")
        code = self.build_exit
        if argv[0] == "dotnet":
            self.test.assertNotIn(str(self.test.workspace), argv)
            self.test.assertFalse((cwd / "target" / "bin" / "stale.exe").exists())
            self.test.assertTrue((cwd / "source" / "SharedContent" / "support.txt").is_file())
            self.test.assertIn("Release", argv)
            self.test.assertIn("win-x64", argv)
            self.test.assertIn("-p:Platform=x64", argv)
            if self.output:
                executable_name = self.executable_name or (Path(argv[2]).stem + ".exe")
                path = cwd / "target" / "bin" / "x64" / "Release" / "win-x64" / executable_name
                path.parent.mkdir(parents=True)
                path.write_bytes(b"MZ" + b"\0" * 58 + struct.pack("<I", 64) + b"PE\0\0\x64\x86")
            if self.mutate_workspace:
                (self.test.workspace / "target" / "MainPage.xaml").write_text("mutated", encoding="utf-8")
        else:
            code = self.ui_exit
            self.test.assertEqual(argv[0], "pwsh")
            if not self.missing_ui:
                directory = Path(argv[argv.index("-OutputDirectory") + 1])
                executable = next((cwd / "target").rglob("*.exe"))
                project = Path(argv[argv.index("-Project") + 1])
                payload = golden_ui(directory, executable, project)
                if self.ui_mutator:
                    self.ui_mutator(payload, directory)
                    write(directory / "results.json", payload)
        if self.missing_logs:
            stdout.unlink()
        return {
            "exit_code": code, "timed_out": False, "started_at": "2026-09-24T09:00:00Z",
            "ended_at": "2026-09-24T09:00:02Z", "elapsed_seconds": 2, "pid": 12,
            "stdout": str(stdout), "stderr": str(stderr), "error": None,
        }


class EvaluatorTests(unittest.TestCase):
    def setUp(self):
        self.root = HERE / "tests" / "fixtures" / ("runtime-" + uuid.uuid4().hex)
        self.workspace, self.evidence = self.root / "workspace", self.root / "evidence"
        self.scenario = evaluator.load_scenario()
        self.scenario["allow_desktop"] = True
        target = self.workspace / "target"
        target.mkdir(parents=True)
        (target / "BenchmarkApp.csproj").write_text("<Project />", encoding="utf-8")
        for relative in self.scenario["oracle"]["required_migrated_files"]:
            path = evaluator._path(target, relative)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("Mock migrated source\n", encoding="utf-8")
        for relative in self.scenario["oracle"]["asset_git_blobs"]:
            path = evaluator._path(target, relative)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"Mock asset")
        (target / "bin").mkdir()
        (target / "bin" / "stale.exe").write_bytes(b"Do not build this cached output")
        support = self.workspace / "source" / "SharedContent" / "support.txt"
        support.parent.mkdir(parents=True)
        support.write_text("Shared dependency", encoding="utf-8")
        self.frozen = self.evidence / "frozen-output"
        shutil.copytree(target, self.frozen, ignore=shutil.ignore_patterns("bin", "obj"))

    def tearDown(self):
        shutil.rmtree(self.root)

    def run_evaluation(self, **options):
        runner = FakeRunner(self, **options)
        expected = self.scenario["oracle"]["asset_git_blobs"]
        def mock_blob(path):
            return expected[path.relative_to(self.evidence / "evaluation-workspace" / "target").as_posix()]
        with mock.patch.object(evaluator, "_git_blob", side_effect=mock_blob):
            result = evaluator.evaluate_attempt(self.workspace, self.evidence, self.scenario, runner)
        self.assertEqual(len(result["assertions"]), len(evaluator.load_scenario()["assertions"]))
        for item in result["assertions"]:
            self.assertIn(item["status"], evaluator.STATUSES)
            self.assertTrue(item["reason"])
            self.assertIsInstance(item["evidence"], list)
        self.assertFalse((self.evidence / "evaluation.json").exists(), "Caller owns final result persistence")
        return result, runner

    def reset_evidence(self):
        for path in self.evidence.iterdir():
            if path == self.frozen:
                continue
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()

    @staticmethod
    def verdict(result, identifier):
        return next(a for a in result["assertions"] if a["id"] == identifier)

    def test_golden_all_gates_and_immutable_copied_build(self):
        before = evaluator.file_hashes(self.workspace)
        result, runner = self.run_evaluation()
        self.assertTrue(result["complete_success"], result["assertions"])
        self.assertEqual(result["status"], "pass")
        self.assertEqual(len(runner.calls), 2)
        self.assertEqual(before, evaluator.file_hashes(self.workspace))
        self.assertEqual(result["requirement_pass_fraction"], 1)

    def test_only_frozen_target_is_evaluated(self):
        (self.workspace / "target" / "MainPage.xaml").write_text("Live target changed after freeze", encoding="utf-8")
        (self.workspace / "target" / "Extra.csproj").write_text("<Project />", encoding="utf-8")
        frozen_before = evaluator.file_hashes(self.frozen)
        result, _ = self.run_evaluation()
        self.assertTrue(result["complete_success"])
        self.assertEqual((self.evidence / "evaluation-workspace" / "target" / "MainPage.xaml").read_text(),
                         (self.frozen / "MainPage.xaml").read_text())
        self.assertEqual(frozen_before, evaluator.file_hashes(self.frozen))

    def test_runner_selected_scaffold_name_and_assembly_name(self):
        name = "UwpSkillBenchPreflightPinned.csproj"
        (self.frozen / "BenchmarkApp.csproj").rename(self.frozen / name)
        self.scenario["target_project"] = name
        result, runner = self.run_evaluation(executable_name="PreservedAssemblyName.exe")
        self.assertTrue(result["complete_success"], result["assertions"])
        self.assertEqual(Path(runner.calls[0][0][2]).name, name)
        manifest = json.loads((self.evidence / "evaluator-manifest.json").read_text())
        self.assertEqual(manifest["target_project"], name)
        self.assertTrue(result["owned_process"]["executable"].endswith("PreservedAssemblyName.exe"))

    def test_project_path_cannot_escape_frozen_target(self):
        self.scenario["target_project"] = "..\\unrelated.csproj"
        result, runner = self.run_evaluation()
        self.assertEqual(self.verdict(result, "target_project")["status"], "fail")
        self.assertFalse(runner.calls)

    def test_missing_frozen_output_never_falls_back_to_live_target(self):
        shutil.rmtree(self.frozen)
        result, runner = self.run_evaluation()
        self.assertEqual(self.verdict(result, "target_project")["status"], "fail")
        self.assertFalse(runner.calls)

    def test_build_failure_keeps_all_assertions(self):
        result, runner = self.run_evaluation(build_exit=1)
        self.assertEqual(len(runner.calls), 1)
        self.assertEqual(self.verdict(result, "independent_build")["status"], "fail")
        self.assertEqual(self.verdict(result, "basic_realize")["status"], "not_run")
        self.assertEqual(self.verdict(result, "artifact_immutability")["status"], "pass")

    def test_build_zero_without_output_is_failure(self):
        result, _ = self.run_evaluation(output=False)
        self.assertEqual(self.verdict(result, "build_output")["status"], "fail")
        self.assertFalse(result["complete_success"])

    def test_build_zero_without_logs_is_failure(self):
        result, _ = self.run_evaluation(missing_logs=True)
        self.assertEqual(self.verdict(result, "independent_build")["status"], "fail")

    def test_multiple_or_missing_project_rejected(self):
        extra = self.frozen / "Other.csproj"
        extra.write_text("<Project />", encoding="utf-8")
        result, runner = self.run_evaluation()
        self.assertEqual(self.verdict(result, "target_project")["status"], "fail")
        self.assertFalse(runner.calls)
        self.reset_evidence()
        extra.unlink()
        (self.frozen / "BenchmarkApp.csproj").unlink()
        result, runner = self.run_evaluation()
        self.assertEqual(self.verdict(result, "target_project")["status"], "fail")
        self.assertFalse(runner.calls)

    def test_desktop_requires_explicit_boolean_consent(self):
        self.scenario["allow_desktop"] = "true"
        result, runner = self.run_evaluation()
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(len(runner.calls), 1)
        self.assertEqual(self.verdict(result, "launch_exit")["status"], "not_run")

    def test_missing_page_or_linked_asset_fails_fidelity(self):
        (self.frozen / "Assets" / "valley.jpg").unlink()
        (self.frozen / "Scenarios" / "AdaptivePage.xaml").unlink()
        result, _ = self.run_evaluation()
        self.assertEqual(self.verdict(result, "source_fidelity")["status"], "fail")
        self.assertFalse(result["complete_success"])

    def test_page_rename_alone_does_not_fail_behavior(self):
        (self.frozen / "Scenarios" / "AdaptivePage.xaml").rename(self.frozen / "RenamedAdaptive.xaml")
        result, _ = self.run_evaluation()
        self.assertEqual(self.verdict(result, "source_fidelity")["status"], "pass")
        self.assertTrue(result["complete_success"])

    def test_launch_without_matching_platform_is_rejected(self):
        def mutate(_, directory):
            path = directory / "001-run.command.json"
            record = json.loads(path.read_text())
            record["argv"].remove("Platform=x64")
            write(path, record)
        result, _ = self.run_evaluation(ui_mutator=mutate)
        self.assertEqual(self.verdict(result, "launch_exit")["status"], "fail")

    def test_mutated_original_is_not_accepted(self):
        result, _ = self.run_evaluation(mutate_workspace=True)
        self.assertEqual(self.verdict(result, "artifact_immutability")["status"], "fail")

    def test_no_ui_result_cannot_pass_on_exit_zero(self):
        result, _ = self.run_evaluation(missing_ui=True)
        self.assertEqual(self.verdict(result, "launch_exit")["status"], "fail")
        self.assertEqual(self.verdict(result, "startup_content")["status"], "not_run")

    def test_ui_assertion_missing_from_payload_is_failure(self):
        def mutate(payload, _):
            payload["assertions"] = [a for a in payload["assertions"] if a["id"] != "adaptive_shrink"]
        result, _ = self.run_evaluation(ui_mutator=mutate)
        self.assertEqual(self.verdict(result, "adaptive_shrink")["status"], "fail")

    def test_claimed_pass_without_evidence_fails(self):
        def mutate(payload, _):
            payload["assertions"][0]["evidence"] = []
        result, _ = self.run_evaluation(ui_mutator=mutate)
        self.assertFalse(result["complete_success"])

    def test_nonzero_ui_exit_cannot_hide_behind_passed_results(self):
        result, _ = self.run_evaluation(ui_exit=9)
        self.assertEqual(self.verdict(result, "screenshots")["status"], "fail")

    def test_mutants_rejected_using_raw_observations_not_claimed_verdict(self):
        mutants = [
            ("startup_content", "startup.uia.json", lambda d: d.update(windows=[])),
            ("startup_content", "startup.uia.json",
             lambda d: d["windows"][0]["elements"].pop()),
            ("basic_realize", "basic-realized.visual.json", lambda d: d.update(colors=[0] * 4)),
            ("basic_repeat", "basic-repeated.visual.json", lambda d: d.update(colors=[20000] * 4)),
            ("adaptive_desktop", "adaptive-desktop.uia.json",
             lambda d: d["windows"][0].update(elements=d["windows"][0]["elements"][:-4])),
            ("template_content", "template.visual.json", lambda d: d.update(photos=[])),
            ("launch_exit", "001-run.stdout.txt", lambda d: d.update(Error="Startup exception")),
            ("startup_content", "startup.visual.json", lambda d: d.update(pid=9999)),
            ("launch_survival", "survival.json", lambda d: d.update(pid=9999)),
        ]
        for identifier, filename, operation in mutants:
            with self.subTest(identifier=identifier, filename=filename):
                if self.evidence.exists():
                    self.reset_evidence()
                def mutate(_, directory):
                    path = directory / filename
                    value = json.loads(path.read_text(encoding="utf-8"))
                    operation(value)
                    write(path, value)
                result, _ = self.run_evaluation(ui_mutator=mutate)
                self.assertEqual(self.verdict(result, identifier)["status"], "fail")
                self.assertFalse(result["complete_success"])

    def test_missing_screenshot_and_wrong_process_owner_fail_closed(self):
        def mutate(payload, directory):
            (directory / "template.png").unlink()
            payload["owned_process"]["ownership_verified"] = False
        result, _ = self.run_evaluation(ui_mutator=mutate)
        self.assertEqual(self.verdict(result, "launch_identity")["status"], "fail")
        self.assertEqual(self.verdict(result, "template_content")["status"], "fail")

    def test_wrong_binary_cannot_claim_ownership(self):
        def mutate(payload, directory):
            payload["owned_process"]["executable"] = str(self.workspace / "target" / "unrelated.exe")
            write(directory / "ownership.json", payload["owned_process"])
        result, _ = self.run_evaluation(ui_mutator=mutate)
        self.assertEqual(self.verdict(result, "launch_identity")["status"], "fail")

    def test_winapp_staged_binary_must_match_original_build_bytes(self):
        def mutate(payload, directory):
            original = Path(payload["owned_process"]["executable"])
            staged = original.parent / "AppX" / original.name
            staged.parent.mkdir()
            shutil.copyfile(original, staged)
            payload["owned_process"]["executable"] = str(staged)
            write(directory / "ownership.json", payload["owned_process"])
        result, _ = self.run_evaluation(ui_mutator=mutate)
        self.assertEqual(self.verdict(result, "launch_identity")["status"], "pass")

    def test_wrong_winapp_staged_bytes_are_rejected(self):
        def mutate(payload, directory):
            original = Path(payload["owned_process"]["executable"])
            staged = original.parent / "AppX" / original.name
            staged.parent.mkdir()
            staged.write_bytes(b"Not the independently built image")
            payload["owned_process"].update(executable=str(staged), sha256=evaluator.sha256(staged))
            write(directory / "ownership.json", payload["owned_process"])
        result, _ = self.run_evaluation(ui_mutator=mutate)
        self.assertEqual(self.verdict(result, "launch_identity")["status"], "fail")

    def test_launch_script_preserves_actual_cli_transport(self):
        source = evaluator.UI_SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("'--json', '--quiet'", source)
        self.assertIn("($launch.Data.ProcessId -is [long] -or $launch.Data.ProcessId -is [int])", source)
        self.assertIn("'Platform=x64'", source)

    def test_oracle_overrides_cannot_remove_requirements(self):
        self.scenario["assertions"] = []
        self.scenario["oracle"] = {}
        runner = FakeRunner(self, build_exit=1)
        result = evaluator.evaluate_attempt(self.workspace, self.evidence, self.scenario, runner)
        self.assertEqual(result["total_assertions"], len(evaluator.load_scenario()["assertions"]))

    def test_existing_evidence_is_never_overwritten(self):
        self.run_evaluation()
        with self.assertRaises(FileExistsError):
            evaluator.evaluate_attempt(self.workspace, self.evidence, self.scenario, FakeRunner(self))

    def test_evidence_inside_workspace_is_rejected(self):
        with self.assertRaises(ValueError):
            evaluator.evaluate_attempt(self.workspace, self.workspace / "evidence", self.scenario, FakeRunner(self))

    @unittest.skipUnless(shutil.which("pwsh") and sys.platform == "win32", "Windows PowerShell helper test")
    def test_powershell_pixel_and_uia_helpers_without_desktop(self):
        completed = subprocess.run(
            ["pwsh", "-NoProfile", "-NonInteractive", "-File",
             str(HERE / "tests" / "fixtures" / "check-ui-helpers.ps1"),
             "-EvaluatorScript", str(evaluator.UI_SCRIPT), "-FixtureDirectory", str(self.root / "ps-fixture")],
            capture_output=True, text=True, timeout=45, cwd=HERE,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("helper goldens and mutants passed", completed.stdout)


if __name__ == "__main__":
    unittest.main()
