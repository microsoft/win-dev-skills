"""No apps, packages, agents, or registrations are launched/modified by these tests."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import types
import unittest
from unittest.mock import patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import runtime_guard as guard


NAME = "UwpSkillValue." + "1" * 32
SHA = hashlib.sha256(b"test executable, never executed").hexdigest()
HERE = Path(__file__).parent
POWERSHELL = Path(os.environ.get("SystemRoot", r"C:\Windows")) / (
    r"System32\WindowsPowerShell\v1.0\powershell.exe"
)


class RuntimeGuardTests(unittest.TestCase):
    def setUp(self):
        self.root = HERE / ("test-artifacts-" + uuid.uuid4().hex)
        self.root.mkdir()
        self.addCleanup(shutil.rmtree, self.root)
        self.target = self.root / "target"
        self.appx = self.target / "bin" / "x64" / "Release" / "tfm" / "win-x64" / "AppX"
        self.appx.mkdir(parents=True)
        self.exe = self.appx / "Example.exe"
        self.exe.write_bytes(b"test executable, never executed")
        self.relative = str(self.exe.relative_to(self.target))
        self.evidence = self.root / "evidence"
        self.start = datetime.now(timezone.utc) - timedelta(seconds=5)
        self.end = self.start + timedelta(seconds=2)
        self.created = self.start + timedelta(seconds=1)

    def package(self, **changes):
        result = {
            "Name": NAME, "PackageFullName": NAME + "_1.0.0.0_x64__publisher",
            "PackageFamilyName": NAME + "_publisher", "Publisher": "CN=AppPublisher",
            "InstallLocation": str(self.appx), "IsFramework": False,
            "IsResourcePackage": False, "IsBundle": False, "NonRemovable": False,
        }
        result.update(changes)
        return result

    def ownership(self, **changes):
        args = dict(
            target=self.target, image=self.exe, created_at=self.created,
            started_at=self.start, ended_at=self.end,
            image_sha256=SHA, approved_hashes={self.relative: SHA},
        )
        args.update(changes)
        return guard.process_ownership(**args)

    def fake_invoke(self, request, evidence, phase):
        return {
            **request, "status": "ready" if phase == "prepare" else "cleaned",
            "packages": [], "before_packages": [], "after_packages": [],
            "target_packages_before": [], "target_packages_after": [],
        }

    def prepare(self):
        with patch.object(guard, "_invoke", side_effect=self.fake_invoke) as invoke:
            result = guard.prepare_runtime(self.target, NAME, self.evidence)
        self.assertEqual(result["status"], "pass", result)
        return invoke

    def cleanup(self, **changes):
        now = datetime.now(timezone.utc)
        args = dict(target=self.target, package_name=NAME, started_at=now,
                    ended_at=now, approved_hashes={self.relative: SHA}, evidence=self.evidence)
        args.update(changes)
        return guard.cleanup_runtime(**args)

    def test_staged_appx_image_is_owned(self):
        self.assertEqual(self.ownership()["status"], "owned")

    def test_prefix_sibling_and_target_directory_are_not_owned(self):
        self.assertEqual(self.ownership(image=Path(str(self.target) + "-other") / "App.exe"),
                         {"status": "unrelated"})
        self.assertEqual(self.ownership(image=self.target), {"status": "unrelated"})

    def test_creation_must_be_inside_actual_interval(self):
        for created in (self.start - timedelta(microseconds=1), self.end + timedelta(microseconds=1)):
            with self.subTest(created=created):
                self.assertEqual(self.ownership(created_at=created)["status"], "blocked")
        for created in (self.start, self.end):
            self.assertEqual(self.ownership(created_at=created)["status"], "owned")

    def test_hash_mismatch_and_unapproved_binary_block(self):
        self.assertEqual(self.ownership(image_sha256="0" * 64)["status"], "blocked")
        self.assertEqual(self.ownership(approved_hashes={})["status"], "blocked")

    def test_missing_image_blocks(self):
        self.exe.unlink()
        self.assertEqual(self.ownership()["status"], "blocked")

    def test_timezone_and_inverted_interval_rejected(self):
        self.assertEqual(self.ownership(created_at="2026-01-01T12:00:00")["status"], "blocked")
        self.assertEqual(self.ownership(started_at=self.end, ended_at=self.start)["status"], "blocked")

    def test_approved_manifest_validates_and_normalizes_windows_paths(self):
        result = guard.validate_approved_hashes(self.target, {self.relative: SHA.upper()})
        self.assertEqual(result, {self.relative.casefold(): SHA})
        for path in ("..\\Example.exe", "C:\\App.exe", "\\App.exe", "bin\\..\\App.exe",
                     "bin\\App.exe:ads", "bin\\\\App.exe", "bin.\\App.exe", "bin/./App.exe"):
            with self.subTest(path=path), self.assertRaises(guard.OwnershipError):
                guard.validate_approved_hashes(self.target, {path: SHA})
        with self.assertRaises(guard.OwnershipError):
            guard.validate_approved_hashes(self.target, {self.relative: SHA, self.relative.upper(): SHA})
        with self.assertRaises(guard.OwnershipError):
            guard.validate_approved_hashes(self.target, {self.relative: "not-sha256"})

    def test_package_exact_identity_publisher_and_location(self):
        self.assertEqual(guard.package_ownership(self.target, NAME, [], [self.package()])["status"], "owned")
        for changes in (
            {"Name": NAME + "other"}, {"PackageFullName": "other_1_x64"},
            {"Publisher": "CN=other"}, {"InstallLocation": str(self.root)},
            {"InstallLocation": str(self.target)}, {"InstallLocation": str(self.target) + "-other"},
            {"InstallLocation": str(self.target / "..")},
            {"IsFramework": True}, {"IsResourcePackage": True},
            {"IsBundle": True}, {"NonRemovable": True}, {"IsFramework": None},
        ):
            with self.subTest(changes=changes):
                self.assertEqual(guard.package_ownership(self.target, NAME, [], [
                    self.package(**changes)
                ])["status"], "blocked")

    def test_package_preexisting_and_multiple_are_blocked(self):
        package = self.package()
        self.assertEqual(guard.package_ownership(self.target, NAME, [package], [package])["status"], "blocked")
        self.assertEqual(guard.package_ownership(self.target, NAME, [], [package, package])["status"], "blocked")
        self.assertEqual(guard.package_ownership(self.target, NAME, [], [])["status"], "absent")

    def test_optional_publisher_and_case_insensitive_identity(self):
        self.assertEqual(guard.package_ownership(
            self.target, NAME.upper(), [], [self.package(Publisher="CN=other")], None
        )["status"], "owned")

    def test_reparse_component_rejected_without_following(self):
        info = self.exe.lstat()
        fake = types.SimpleNamespace(st_mode=info.st_mode, st_file_attributes=0x400)
        original = Path.lstat
        with patch.object(Path, "lstat", lambda path: fake if path == self.appx else original(path)):
            self.assertEqual(self.ownership()["status"], "blocked")
            with self.assertRaises(guard.OwnershipError):
                guard.validate_approved_hashes(self.target, {self.relative: SHA})
            self.assertEqual(guard.package_ownership(self.target, NAME, [], [self.package()])["status"], "blocked")

    def test_prepare_collision_never_allows_cleanup(self):
        def collision(request, evidence, phase):
            result = self.fake_invoke(request, evidence, phase)
            result["packages"] = [self.package()]
            return result
        with patch.object(guard, "_invoke", side_effect=collision):
            result = guard.prepare_runtime(self.target, NAME, self.evidence)
        self.assertEqual(result["status"], "blocked")
        with patch.object(guard, "_invoke") as invoke:
            self.assertEqual(self.cleanup()["status"], "blocked")
            invoke.assert_not_called()

    def test_evidence_is_exclusive_and_preserves_errors(self):
        self.prepare()
        original = (self.evidence / "prepare.json").read_bytes()
        with patch.object(guard, "_invoke") as invoke:
            result = guard.prepare_runtime(self.target, NAME, self.evidence)
            self.assertEqual(result["status"], "blocked")
            invoke.assert_not_called()
        self.assertEqual((self.evidence / "prepare.json").read_bytes(), original)
        with patch.object(guard, "_invoke", side_effect=RuntimeError("injected failure")):
            self.assertEqual(self.cleanup()["status"], "blocked")
        failure = (self.evidence / "cleanup.json").read_bytes()
        self.assertIn(b"injected failure", failure)
        with patch.object(guard, "_invoke") as invoke:
            self.assertEqual(self.cleanup()["status"], "blocked")
            invoke.assert_not_called()
        self.assertEqual((self.evidence / "cleanup.json").read_bytes(), failure)

    def test_cleanup_success_and_manifest_passed_unchanged(self):
        self.prepare()
        with patch.object(guard, "_invoke", side_effect=self.fake_invoke) as invoke:
            result = self.cleanup()
        self.assertEqual(result["status"], "pass", result)
        request = invoke.call_args.args[0]
        self.assertEqual(request["approved_hashes"], {self.relative.casefold(): SHA})
        self.assertEqual(request["pre_packages"], [])

    def test_cleanup_without_precheck_or_with_wrong_trial_blocks(self):
        self.evidence.mkdir()
        with patch.object(guard, "_invoke") as invoke:
            self.assertEqual(self.cleanup()["status"], "blocked")
            invoke.assert_not_called()
        shutil.rmtree(self.evidence)
        self.prepare()
        with patch.object(guard, "_invoke") as invoke:
            self.assertEqual(self.cleanup(package_name="UwpSkillValue." + "2" * 32)["status"], "blocked")
            invoke.assert_not_called()

    def test_cleanup_interval_before_prepare_blocks(self):
        self.prepare()
        with patch.object(guard, "_invoke") as invoke:
            self.assertEqual(self.cleanup(started_at=self.start, ended_at=self.end)["status"], "blocked")
            invoke.assert_not_called()

    def test_prepare_bad_identity_and_evidence_inside_target_block(self):
        with patch.object(guard, "_invoke") as invoke:
            self.assertEqual(guard.prepare_runtime(self.target, "UwpSkillValue.*", self.evidence)["status"], "blocked")
            self.assertEqual(guard.prepare_runtime(self.target, NAME, self.target / "evidence")["status"], "blocked")
            invoke.assert_not_called()

    def test_run_process_integration_has_no_policy_bypass_and_finite_timeout(self):
        self.evidence.mkdir()
        request = {
            "version": 1, "phase": "prepare", "target": str(self.target),
            "package_name": NAME, "expected_publisher": "CN=AppPublisher",
        }
        def run(argv, **kwargs):
            self.assertNotIn("-ExecutionPolicy", argv)
            self.assertEqual(kwargs["timeout_seconds"], 120)
            self.assertFalse(kwargs["evidence_dir"].exists())
            result_path = Path(argv[argv.index("-ResultPath") + 1])
            guard._write_new(result_path, {**request, "status": "ready", "packages": []})
            return {"exit_code": 0, "timed_out": False, "error": None}
        with patch.dict(sys.modules, {"support": types.SimpleNamespace(run_process=run)}):
            self.assertEqual(guard._invoke(request, self.evidence, "prepare")["status"], "ready")

    def test_timeout_is_blocked_even_when_result_claims_success(self):
        def run(argv, **kwargs):
            return {"exit_code": 0, "timed_out": True, "error": None}
        with patch.dict(sys.modules, {"support": types.SimpleNamespace(run_process=run)}):
            result = guard.prepare_runtime(self.target, NAME, self.evidence)
        self.assertEqual(result["status"], "blocked")

    @unittest.skipUnless(POWERSHELL.exists(), "Windows PowerShell is required")
    def test_powershell_entrypoint_with_mocked_inventory(self):
        wrapper = self.root / "mock-entrypoint.ps1"
        wrapper.write_text(r"""
param([string]$Guard, [string]$Request, [string]$Result, [string]$Journal, [string]$Fixture)
$ErrorActionPreference = 'Stop'
$global:FixtureData = Get-Content -LiteralPath $Fixture -Raw | ConvertFrom-Json
function global:Get-AppxPackage {
    param($Name, $ErrorAction)
    if ($Name) {
        if ($Name -cne $global:FixtureData.package_name) { throw 'Non-exact package query' }
        return @($global:FixtureData.packages | Where-Object { $_.Name -ieq $Name })
    }
    return @($global:FixtureData.packages) + @($global:FixtureData.extra_packages)
}
function global:Get-CimInstance { param($ClassName, $Property, $ErrorAction) }
function global:Remove-AppxPackage { throw 'Unexpected package mutation in inventory-only test' }
& $Guard -RequestPath $Request -ResultPath $Result -JournalPath $Journal
""", encoding="utf-8")
        unexpected = self.package(Name="Unexpected.Trial", PackageFullName="Unexpected.Trial_1_x64__pub")
        unexpected_root = {**unexpected, "InstallLocation": str(self.target)}
        unrelated = self.package(Name="Unrelated.App", InstallLocation=str(self.root / "unrelated"))
        cases = (
            ("prepare", [], [], [], "ready"),
            ("prepare", [self.package()], [], [], "blocked"),
            ("cleanup", [], [], [unrelated], "cleaned"),
            ("cleanup", [], [self.package()], [], "blocked"),
            ("cleanup", [], [], [unexpected, unrelated], "blocked"),
            ("cleanup", [], [], [unexpected_root, unrelated], "blocked"),
            ("cleanup", [], [], [self.package()], "blocked"),
        )
        for number, (phase, packages, pre_packages, extras, expected_status) in enumerate(cases):
            with self.subTest(phase=phase, expected_status=expected_status, number=number):
                case = self.root / f"entrypoint-{number}"
                case.mkdir()
                request_path, result_path = case / "request.json", case / "result.json"
                journal_path, fixture_path = case / "events.jsonl", case / "fixture.json"
                guard._write_new(request_path, {
                    "version": 1, "phase": phase, "target": str(self.target),
                    "package_name": NAME, "expected_publisher": "CN=AppPublisher",
                    "pre_packages": pre_packages, "started_at": self.start.isoformat(),
                    "ended_at": self.end.isoformat(), "approved_hashes": {self.relative: SHA},
                })
                guard._write_new(fixture_path, {
                    "package_name": NAME, "packages": packages, "extra_packages": extras,
                })
                completed = subprocess.run(
                    [str(POWERSHELL), "-NoLogo", "-NoProfile", "-NonInteractive", "-File", str(wrapper),
                     "-Guard", str(guard.SCRIPT), "-Request", str(request_path), "-Result", str(result_path),
                     "-Journal", str(journal_path), "-Fixture", str(fixture_path)],
                    capture_output=True, text=True, timeout=60, cwd=HERE,
                )
                self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
                result = guard._read(result_path)
                self.assertEqual(result["status"], expected_status, result)
                self.assertEqual(result["before_packages"], packages)
                self.assertEqual(result["after_packages"], packages)
                events = [json.loads(line) for line in journal_path.read_text(encoding="utf-8-sig").splitlines()]
                self.assertEqual(events[0]["kind"], "package_snapshot_before")
                self.assertIn("package_snapshot_after", [event["kind"] for event in events])
                self.assertNotIn("Unrelated.App", result_path.read_text(encoding="utf-8-sig"))
                self.assertNotIn("Unrelated.App", journal_path.read_text(encoding="utf-8-sig"))
                if unexpected in extras:
                    self.assertEqual(result["target_packages_before"], [unexpected])
                    self.assertEqual(result["target_packages_after"], [unexpected])
                if unexpected_root in extras:
                    self.assertEqual(result["target_packages_before"], [unexpected_root])
                    self.assertEqual(result["target_packages_after"], [unexpected_root])

    @unittest.skipUnless(POWERSHELL.exists(), "Windows PowerShell is required")
    def test_powershell_mocked_lifecycle(self):
        # Dot-source definitions only: all process/package operations below are mocks.
        # Compiling the native helper validates Windows PowerShell 5.1 compatibility
        # but does not open any process handles or perform lifecycle operations.
        script = r"""
param([string]$Guard, [string]$Target, [string]$Image, [string]$PackageName, [string]$Hash)
. $Guard -DefinitionsOnly
Initialize-NativeGuard
$actualImage = Open-ImageLease $Image
try {
    if ($actualImage.Sha256 -cne $Hash -or $actualImage.FinalPath -ine $Image) {
        throw 'Native locked-file hashing/final-path verification failed'
    }
} finally { $actualImage.Dispose() }
Assert-Unlinked $Target
Assert-Unlinked $Image
function Write-Event($Kind, $Data) {}
function Check-Deadline {}
function Assert-Unlinked($Path) {}
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
$script:Target = $Target
$script:Request = [pscustomobject]@{ package_name=$PackageName; pre_packages=@(); expected_publisher='CN=AppPublisher' }
$script:Started = [DateTimeOffset]::UtcNow.AddSeconds(-10)
$script:Ended = [DateTimeOffset]::UtcNow
$script:Hashes = @{}
$script:Hashes[$Image.Substring($Target.Length+1).ToLowerInvariant()] = $Hash
$script:ImageNames = New-Object 'System.Collections.Generic.HashSet[string]'
$script:Package = [ordered]@{
    Name=$PackageName; PackageFullName=($PackageName+'_1.0.0.0_x64__publisher')
    PackageFamilyName=($PackageName+'_publisher'); Publisher='CN=AppPublisher'
    InstallLocation=([IO.Path]::GetDirectoryName($Image))
    IsFramework=$false; IsResourcePackage=$false; IsBundle=$false; NonRemovable=$false
}
function Reset-Mock {
    $script:Stops = 0; $script:Removals = 0; $script:Disposed = 0
    $script:TargetInventory = @()
    $script:Result = [ordered]@{
        status='checking'; manual_review=$false
        reasons=(New-Object 'System.Collections.Generic.List[string]')
        processes=(New-Object 'System.Collections.Generic.List[object]')
        before_packages=@($script:Package); removed_package_full_name=$null
    }
    $script:Leases = New-Object 'System.Collections.Generic.List[object]'
    $script:MockProcess = [pscustomobject]@{
        Exited=$false; ImagePath=$Image; CreatedUtc=$script:Started.AddSeconds(1).UtcDateTime
    }
    $script:MockProcess | Add-Member ScriptMethod Stop {
        param($Wait)
        $script:Stops++
        $this.Exited=$true
        return 'terminated'
    }
    $script:MockProcess | Add-Member ScriptMethod Dispose { $script:Disposed++ }
    $script:MockImage = [pscustomobject]@{ FinalPath=$Image; Sha256=$Hash }
    $script:MockImage | Add-Member ScriptMethod Dispose { $script:Disposed++ }
}
function Get-ProcessCandidates {
    if (-not $script:MockProcess.Exited) {
        [pscustomobject]@{ ProcessId=424242; ExecutablePath=$Image; CreationDate=$script:MockProcess.CreatedUtc }
    }
}
function Open-ProcessLease($ProcessId) { return $script:MockProcess }
function Open-ImageLease($Path) { return $script:MockImage }
function Get-TrialPackages { if ($script:Removals -eq 0) { $script:Package } }
function Get-TargetPackages { return $script:TargetInventory }
function Remove-AppxPackage($Package, $ErrorAction) {
    Assert ($script:Stops -eq 1) 'Package removed before process exit'
    Assert ($Package -ceq $script:Package.PackageFullName) 'Wrong package removal'
    $script:Removals++
}
Reset-Mock
Invoke-TrialCleanup
Assert ($script:Result.status -eq 'cleaned') 'Successful cleanup was not cleaned'
Assert ($script:Stops -eq 1 -and $script:Removals -eq 1) 'Wrong mutation counts'
Assert ($script:Leases.Count -eq 2 -and $script:Disposed -eq 0) 'Ownership handles not retained'

Reset-Mock
$script:Result.before_packages = @()
$script:TargetInventory = @([pscustomobject]@{
    Name='Unexpected.Trial'; PackageFullName='Unexpected.Trial_1_x64__pub'
    InstallLocation=([IO.Path]::GetDirectoryName($Image))
})
Invoke-TrialCleanup
Assert ($script:Result.status -eq 'blocked') 'Unexpected target package not blocked'
Assert ($script:Stops -eq 1 -and $script:Removals -eq 0) 'Unexpected package was removed or safe process was not stopped'

Reset-Mock
$script:Result.before_packages = @()
$script:TargetInventory = @([pscustomobject]@{
    Name='Unexpected.Trial'; PackageFullName='Unexpected.Trial_1_x64__pub'
    InstallLocation=$Target
})
Invoke-TrialCleanup
Assert ($script:Result.status -eq 'blocked') 'Unexpected package at target root not blocked'
Assert ($script:Stops -eq 1 -and $script:Removals -eq 0) 'Root package was removed or safe process was not stopped'

Reset-Mock
$script:MockProcess.CreatedUtc = $script:Started.AddTicks(-1).UtcDateTime
Invoke-TrialCleanup
Assert ($script:Result.status -eq 'blocked') 'Predating process not blocked'
Assert ($script:Stops -eq 0 -and $script:Removals -eq 0) 'Predating process mutated'

Reset-Mock
$script:MockImage.Sha256 = '0' * 64
Invoke-TrialCleanup
Assert ($script:Result.status -eq 'blocked') 'Hash mismatch not blocked'
Assert ($script:Stops -eq 0 -and $script:Removals -eq 0) 'Hash mismatch mutated'

Reset-Mock
$script:MockImage.FinalPath = $Target + '-other\Example.exe'
Invoke-TrialCleanup
Assert ($script:Result.status -eq 'blocked') 'Escaped final image path not blocked'
Assert ($script:Stops -eq 0 -and $script:Removals -eq 0) 'Escaped image mutated'

Reset-Mock
$script:MockProcess.ImagePath = $Target + '-other\Example.exe'
Invoke-TrialCleanup
Assert ($script:Result.status -eq 'blocked') 'PID replacement not blocked'
Assert ($script:Stops -eq 0 -and $script:Removals -eq 0) 'PID replacement mutated'

Reset-Mock
function Open-ImageLease($Path) {
    $script:MockProcess.Exited=$true
    $script:MockImage.Sha256='0' * 64
    return $script:MockImage
}
$claims = @(Get-OwnedProcesses)
Assert ($script:Result.status -eq 'blocked') 'Natural exit incorrectly hid hash mismatch'
Assert ($script:Stops -eq 0 -and $script:Removals -eq 0) 'Mismatch/exit mutated'

Reset-Mock
function Open-ImageLease($Path) { $script:MockProcess.Exited=$true; throw 'Exited during inspection' }
$claims = @(Get-OwnedProcesses)
Assert ($claims.Count -eq 0) 'Naturally exited process claimed'
Assert ($script:Result.processes[0].status -eq 'exited') 'Natural exit not recorded'
Assert ($script:Stops -eq 0 -and $script:Removals -eq 0) 'Natural exit mutated'

'mock lifecycle passed'
"""
        script_path = self.root / "mock-lifecycle.ps1"
        script_path.write_text(script, encoding="utf-8")
        completed = subprocess.run(
            [str(POWERSHELL), "-NoLogo", "-NoProfile", "-NonInteractive", "-File", str(script_path),
             "-Guard", str(guard.SCRIPT), "-Target", str(self.target), "-Image", str(self.exe),
             "-PackageName", NAME, "-Hash", SHA],
            capture_output=True, text=True, timeout=60, cwd=HERE,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("mock lifecycle passed", completed.stdout)


if __name__ == "__main__":
    unittest.main()
