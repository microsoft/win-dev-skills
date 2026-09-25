"""Fail-closed cleanup of one trial's broker-launched Windows app.

Runner contract: call prepare BEFORE the agent; serialize trials/UI; stop and
join the agent's Job Object BEFORE taking approved hashes and calling cleanup.
Both public APIs return status 'pass' or 'blocked'. Use the same evidence
directory for both calls; cleanup requires its durable prepare.json linkage.
Timestamps must be actual,
timezone-aware trial boundaries, not the planned timeout. Approve the staged
AppX executable as well as build outputs (bin is intentionally NOT excluded).
The guard neither launches apps nor grants the agent permission to do so.
Do not start the next trial after a blocked result; ownership needs manual review.
Cleanup also checks current-user registrations under target. Unexpected package
names block registration removal, but independently verified app PIDs can stop.

Integration requires the benchmark's support.run_process on sys.path. It runs
PowerShell under a bounded Job Object; no execution-policy bypass is used.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path, PureWindowsPath
import re
import stat


VERSION = 1
TIMEOUT_SECONDS = 120
SCRIPT = Path(__file__).with_name("runtime-guard.ps1")
PACKAGE_PATTERN = re.compile(
    r"UwpSkillValue\.(?:[0-9a-f]{32}|"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)


class OwnershipError(ValueError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_new(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, sort_keys=True, allow_nan=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def _read(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise OwnershipError("Evidence must be a JSON object")
    return value


def _timestamp(value: str | datetime) -> datetime:
    result = value if isinstance(value, datetime) else datetime.fromisoformat(value)
    if result.tzinfo is None or result.utcoffset() is None:
        raise OwnershipError("Timezone-aware actual trial timestamps are required")
    return result.astimezone(timezone.utc)


def _unlinked(path: Path) -> None:
    for component in reversed((path, *path.parents)):
        info = component.lstat()
        if stat.S_ISLNK(info.st_mode) or (
            getattr(info, "st_file_attributes", 0)
            & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        ):
            raise OwnershipError(f"Linked/reparse path is not owned: {component}")


def _target(target: Path) -> Path:
    target = Path(os.path.abspath(target))
    if target == target.parent or str(target).startswith("\\\\"):
        raise OwnershipError("Target must be a non-root local directory")
    _unlinked(target)
    if not target.is_dir():
        raise OwnershipError("Target is not a directory")
    return target


def _under(path: Path, target: Path) -> bool:
    # Windows path semantics are case-insensitive, including in predicate tests.
    child, root = PureWindowsPath(str(path)), PureWindowsPath(str(target))
    return ".." not in child.parts and child != root and root in child.parents


def _relative_image(relative: str) -> PureWindowsPath:
    if not isinstance(relative, str) or not relative:
        raise OwnershipError("Empty approved image path")
    path = PureWindowsPath(relative)
    if path.anchor or ":" in relative or any(
        component in ("", ".", "..") or component.endswith((" ", "."))
        for component in re.split(r"[\\/]", relative)
    ):
        raise OwnershipError("Approved paths must be unambiguous relative paths")
    return path


def validate_approved_hashes(target: Path, hashes: dict[str, str]) -> dict[str, str]:
    if not isinstance(hashes, dict):
        raise OwnershipError("Approved hashes must be a relative-path SHA256 mapping")
    normalized = {}
    for relative, digest in hashes.items():
        relative_path = _relative_image(relative)
        key = str(relative_path).casefold()
        if key in normalized:
            raise OwnershipError("Case-ambiguous approved image path")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            raise OwnershipError("Invalid SHA256 in approved image manifest")
        image = target.joinpath(*relative_path.parts)
        _unlinked(image)
        if not image.is_file() or not _under(image, target):
            raise OwnershipError("Approved image is not a file strictly under target")
        normalized[key] = digest.lower()
    return normalized


def process_ownership(
    target: Path,
    image: Path,
    created_at: str | datetime,
    started_at: str | datetime,
    ended_at: str | datetime,
    image_sha256: str,
    approved_hashes: dict[str, str],
) -> dict:
    """Pure decision predicate; OS cleanup also rechecks everything on handles."""
    if not _under(image, target):
        return {"status": "unrelated"}
    try:
        _unlinked(target)
        _unlinked(image)
        start, end, created = map(_timestamp, (started_at, ended_at, created_at))
        if end < start or not start <= created <= end:
            raise OwnershipError("process_creation_outside_trial_interval")
        relative = str(PureWindowsPath(str(image)).relative_to(
            PureWindowsPath(str(target))
        )).casefold()
        approved = {str(_relative_image(k)).casefold(): v.lower()
                    for k, v in approved_hashes.items()}
        if image.suffix.casefold() != ".exe" or relative not in approved:
            raise OwnershipError("image_not_approved")
        if (not re.fullmatch(r"[0-9a-f]{64}", approved[relative])
                or approved[relative] != image_sha256.lower()):
            raise OwnershipError("image_hash_mismatch")
        return {"status": "owned", "relative_path": relative}
    except (OSError, ValueError, TypeError, AttributeError) as error:
        return {"status": "blocked", "reason": str(error), "manual_review": True}


def package_ownership(
    target: Path, package_name: str, before: list[dict], current: list[dict],
    expected_publisher: str | None = "CN=AppPublisher",
) -> dict:
    """Validate only the exact trial identity; never infer ownership by prefix."""
    try:
        if before:
            raise OwnershipError("preexisting_package_collision")
        if not current:
            return {"status": "absent"}
        if len(current) != 1:
            raise OwnershipError("ambiguous_package_identity")
        package = current[0]
        if package["Name"].casefold() != package_name.casefold():
            raise OwnershipError("package_name_mismatch")
        if not package["PackageFullName"].casefold().startswith(package_name.casefold() + "_"):
            raise OwnershipError("package_full_name_mismatch")
        if expected_publisher is not None and (
            package["Publisher"].casefold() != expected_publisher.casefold()
        ):
            raise OwnershipError("package_publisher_mismatch")
        if any(package.get(flag) is not False for flag in
               ("IsFramework", "IsResourcePackage", "IsBundle", "NonRemovable")):
            raise OwnershipError("package_is_not_a_removable_trial_app")
        location = Path(package["InstallLocation"])
        if not location.is_absolute() or not _under(location, target):
            raise OwnershipError("package_install_location_outside_target")
        _unlinked(target)
        _unlinked(location)
        if not location.is_dir():
            raise OwnershipError("package_install_location_not_directory")
        return {"status": "owned", "package_full_name": package["PackageFullName"]}
    except (OSError, ValueError, KeyError, AttributeError, TypeError) as error:
        return {"status": "blocked", "reason": str(error), "manual_review": True}


def _invoke(request: dict, evidence: Path, phase: str) -> dict:
    from support import run_process

    request_path = evidence / f"{phase}-request.json"
    result_path = evidence / f"{phase}-powershell.json"
    _write_new(request_path, request)
    windows = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    powershell = windows / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    execution = run_process(
        [str(powershell), "-NoLogo", "-NoProfile", "-NonInteractive", "-File",
         str(SCRIPT), "-RequestPath", str(request_path), "-ResultPath", str(result_path),
         "-JournalPath", str(evidence / f"{phase}-events.jsonl")],
        cwd=SCRIPT.parent,
        evidence_dir=evidence / f"{phase}-process",
        timeout_seconds=TIMEOUT_SECONDS,
    )
    if execution.get("error") or execution.get("timed_out") or execution.get("exit_code") != 0:
        raise OwnershipError(
            f"PowerShell guard failed; inspect {phase}-process and {phase}-events.jsonl"
        )
    result = _read(result_path)
    if (
        result.get("version") != VERSION
        or result.get("phase") != phase
        or result.get("target", "").casefold() != request["target"].casefold()
        or result.get("package_name", "").casefold() != request["package_name"].casefold()
        or result.get("status") not in ("ready", "cleaned", "blocked")
    ):
        raise OwnershipError("Invalid or mismatched PowerShell guard result")
    return result


def _blocked(error: Exception, phase: str) -> dict:
    return {
        "version": VERSION, "phase": phase, "status": "blocked",
        "manual_review": True, "reason": str(error), "recorded_at": utc_now(),
    }


def prepare_runtime(
    target: Path, package_name: str, evidence: Path,
    *, expected_publisher: str | None = "CN=AppPublisher",
) -> dict:
    """Return pass/blocked; create evidence once and reject any prior trial package."""
    evidence = Path(os.path.abspath(evidence))
    try:
        evidence.mkdir(parents=True, exist_ok=False)
    except OSError as error:
        return _blocked(error, "prepare")
    try:
        target = _target(target)
        _unlinked(evidence)
        if _under(evidence, target) or evidence == target:
            raise OwnershipError("Evidence must be outside the agent-owned target")
        if not isinstance(package_name, str) or not PACKAGE_PATTERN.fullmatch(package_name):
            raise OwnershipError("Expected a unique UwpSkillValue.<UUID> package name")
        if expected_publisher is not None and (
            not isinstance(expected_publisher, str) or not expected_publisher.strip()
        ):
            raise OwnershipError("Expected publisher must be nonempty or explicitly None")
        request = {
            "version": VERSION, "phase": "prepare", "target": str(target),
            "package_name": package_name, "expected_publisher": expected_publisher,
            "requested_at": utc_now(),
        }
        result = _invoke(request, evidence, "prepare")
        if result.get("status") != "ready" or result.get("packages") != []:
            result["status"], result["manual_review"] = "blocked", True
        else:
            result["status"] = "pass"
        result["expected_publisher"] = expected_publisher
        result["recorded_at"] = utc_now()
    except Exception as error:
        result = _blocked(error, "prepare")
    _write_new(evidence / "prepare.json", result)
    return result


def cleanup_runtime(
    target: Path, package_name: str, started_at: str | datetime,
    ended_at: str | datetime, approved_hashes: dict[str, str], evidence: Path,
) -> dict:
    """Return pass/blocked using prepare.json in the SAME evidence directory."""
    evidence = Path(os.path.abspath(evidence))
    try:
        _unlinked(evidence)
        # Create-exclusive prevents concurrent/repeated cleanup of this evidence.
        _write_new(evidence / "cleanup-claim.json", {"claimed_at": utc_now()})
    except Exception as error:
        return _blocked(error, "cleanup")
    try:
        target = _target(target)
        if _under(evidence, target) or evidence == target:
            raise OwnershipError("Evidence must be outside the agent-owned target")
        prepared = _read(evidence / "prepare.json")
        if (
            prepared.get("status") != "pass"
            or prepared.get("packages") != []
            or prepared.get("target", "").casefold() != str(target).casefold()
            or prepared.get("package_name", "").casefold() != package_name.casefold()
        ):
            raise OwnershipError("Missing, blocked, or mismatched pre-trial snapshot")
        start, end = _timestamp(started_at), _timestamp(ended_at)
        if not _timestamp(prepared["recorded_at"]) <= start <= end <= _timestamp(utc_now()):
            raise OwnershipError("Invalid actual trial interval or trial predates precheck")
        hashes = validate_approved_hashes(target, approved_hashes)
        request = {
            "version": VERSION, "phase": "cleanup", "target": str(target),
            "package_name": package_name,
            "expected_publisher": prepared.get("expected_publisher"),
            "pre_packages": prepared["packages"], "started_at": start.isoformat(),
            "ended_at": end.isoformat(), "approved_hashes": hashes,
            "requested_at": utc_now(),
        }
        result = _invoke(request, evidence, "cleanup")
        if (result.get("status") != "cleaned" or result.get("after_packages") != []
                or result.get("target_packages_after") != []):
            result["status"], result["manual_review"] = "blocked", True
        else:
            result["status"] = "pass"
        result["recorded_at"] = utc_now()
    except Exception as error:
        result = _blocked(error, "cleanup")
    _write_new(evidence / "cleanup.json", result)
    return result
