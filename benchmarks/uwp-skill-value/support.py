"""Run-owned evidence and native process supervision (Python standard library)."""

from __future__ import annotations

import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import time
from datetime import datetime, timezone


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_hashes(root: Path) -> dict[str, str]:
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or path.is_junction():
            raise ValueError(f"Linked path is not an immutable input: {path}")
        if path.is_file():
            result[path.relative_to(root).as_posix()] = sha256(path)
    return result


def write_json(path: Path, value: object) -> None:
    """Create, never overwrite, a durable evidence record."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, sort_keys=True, allow_nan=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def append_jsonl(path: Path, value: object) -> None:
    with path.open("a", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(value, sort_keys=True, allow_nan=False) + "\n")
        stream.flush()
        os.fsync(stream.fileno())


def _windows_process(argv, cwd, env, stdout, stderr, timeout_seconds):
    """Assign a suspended process to our job before it can spawn any children."""
    import msvcrt
    from ctypes import wintypes as w

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)

    class StartupInfo(ctypes.Structure):
        _fields_ = [
            ("cb", w.DWORD), ("lpReserved", w.LPWSTR), ("lpDesktop", w.LPWSTR),
            ("lpTitle", w.LPWSTR), ("dwX", w.DWORD), ("dwY", w.DWORD),
            ("dwXSize", w.DWORD), ("dwYSize", w.DWORD),
            ("dwXCountChars", w.DWORD), ("dwYCountChars", w.DWORD),
            ("dwFillAttribute", w.DWORD), ("dwFlags", w.DWORD),
            ("wShowWindow", w.WORD), ("cbReserved2", w.WORD),
            ("lpReserved2", ctypes.POINTER(ctypes.c_byte)),
            ("hStdInput", w.HANDLE), ("hStdOutput", w.HANDLE), ("hStdError", w.HANDLE),
        ]

    class ProcessInfo(ctypes.Structure):
        _fields_ = [
            ("hProcess", w.HANDLE), ("hThread", w.HANDLE),
            ("dwProcessId", w.DWORD), ("dwThreadId", w.DWORD),
        ]

    class BasicLimit(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_longlong),
            ("PerJobUserTimeLimit", ctypes.c_longlong), ("LimitFlags", w.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", w.DWORD),
            ("Affinity", ctypes.c_size_t), ("PriorityClass", w.DWORD),
            ("SchedulingClass", w.DWORD),
        ]

    class IoCounters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in (
            "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
            "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

    class ExtendedLimit(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", BasicLimit), ("IoInfo", IoCounters),
            ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
    kernel.CreateJobObjectW.restype = w.HANDLE
    kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
    kernel.SetInformationJobObject.restype = w.BOOL
    kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
    kernel.AssignProcessToJobObject.restype = w.BOOL
    kernel.CreateProcessW.argtypes = [
        w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, w.BOOL, w.DWORD,
        ctypes.c_void_p, w.LPCWSTR, ctypes.POINTER(StartupInfo), ctypes.POINTER(ProcessInfo),
    ]
    kernel.CreateProcessW.restype = w.BOOL
    kernel.ResumeThread.argtypes = [w.HANDLE]
    kernel.ResumeThread.restype = w.DWORD
    kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
    kernel.WaitForSingleObject.restype = w.DWORD
    kernel.GetExitCodeProcess.argtypes = [w.HANDLE, ctypes.POINTER(w.DWORD)]
    kernel.GetExitCodeProcess.restype = w.BOOL
    kernel.TerminateProcess.argtypes = [w.HANDLE, w.UINT]
    kernel.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
    kernel.TerminateJobObject.restype = w.BOOL
    kernel.CloseHandle.argtypes = [w.HANDLE]

    def checked(ok):
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())

    job = kernel.CreateJobObjectW(None, None)
    checked(job)
    info = ProcessInfo()
    assigned = False
    try:
        limit = ExtendedLimit()
        limit.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        checked(kernel.SetInformationJobObject(job, 9, ctypes.byref(limit), ctypes.sizeof(limit)))
        startup = StartupInfo()
        startup.cb = ctypes.sizeof(startup)
        startup.dwFlags = 0x100  # STARTF_USESTDHANDLES
        with open(os.devnull, "rb") as stdin:
            handles = [msvcrt.get_osfhandle(stream.fileno()) for stream in (stdin, stdout, stderr)]
            for handle in handles:
                os.set_handle_inheritable(handle, True)
            startup.hStdInput, startup.hStdOutput, startup.hStdError = handles
            command = ctypes.create_unicode_buffer(subprocess.list2cmdline([str(x) for x in argv]))
            environment = ctypes.create_unicode_buffer(
                "\0".join(f"{k}={v}" for k, v in sorted(env.items(), key=lambda x: x[0].upper())) + "\0"
            )
            try:
                checked(kernel.CreateProcessW(
                    None, command, None, None, True, 0x4 | 0x400,
                    environment, str(cwd), ctypes.byref(startup), ctypes.byref(info),
                ))
            finally:
                for handle in handles:
                    os.set_handle_inheritable(handle, False)
        checked(kernel.AssignProcessToJobObject(job, info.hProcess))
        assigned = True
        if kernel.ResumeThread(info.hThread) == 0xFFFFFFFF:
            raise ctypes.WinError(ctypes.get_last_error())
        deadline = time.monotonic() + timeout_seconds
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                timed_out = True
                break
            wait = kernel.WaitForSingleObject(info.hProcess, max(1, min(200, int(remaining * 1000))))
            if wait == 0:
                timed_out = False
                break
            if wait != 0x102:
                raise ctypes.WinError(ctypes.get_last_error())
        if timed_out:
            checked(kernel.TerminateJobObject(job, 124))
            kernel.WaitForSingleObject(info.hProcess, 10000)
        exit_code = w.DWORD()
        checked(kernel.GetExitCodeProcess(info.hProcess, ctypes.byref(exit_code)))
        return info.dwProcessId, exit_code.value, timed_out
    finally:
        # Handles, not names/PID guesses, identify exactly the processes we created.
        if info.hProcess and not assigned:
            kernel.TerminateProcess(info.hProcess, 125)
        kernel.CloseHandle(job)
        if info.hThread:
            kernel.CloseHandle(info.hThread)
        if info.hProcess:
            kernel.CloseHandle(info.hProcess)


def run_process(argv, *, cwd: Path, evidence_dir: Path, timeout_seconds: float, env=None) -> dict:
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise ValueError("A positive finite timeout is required")
    evidence_dir.mkdir(parents=True, exist_ok=False)
    stdout_path, stderr_path = evidence_dir / "stdout.txt", evidence_dir / "stderr.txt"
    started = utc_now()
    start = time.monotonic()
    command = [str(x) for x in argv]
    write_json(evidence_dir / "command.json", {"argv": command, "cwd": str(cwd), "started_at": started})
    environment = dict(os.environ if env is None else env)
    with stdout_path.open("xb") as stdout, stderr_path.open("xb") as stderr:
        try:
            if os.name == "nt":
                pid, exit_code, timed_out = _windows_process(
                    command, cwd, environment, stdout, stderr, timeout_seconds,
                )
            else:
                process = subprocess.Popen(
                    command, cwd=cwd, env=environment, stdin=subprocess.DEVNULL,
                    stdout=stdout, stderr=stderr, start_new_session=True,
                )
                pid = process.pid
                try:
                    exit_code = process.wait(timeout=timeout_seconds)
                    timed_out = False
                except subprocess.TimeoutExpired:
                    timed_out = True
                    os.killpg(pid, signal.SIGKILL)
                    exit_code = process.wait()
                finally:
                    # Descendants may outlive a successful root process.
                    try:
                        os.killpg(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            record = {"pid": pid, "exit_code": exit_code, "timed_out": timed_out, "error": None}
        except OSError as error:
            record = {"pid": None, "exit_code": None, "timed_out": False, "error": str(error)}
    record.update({
        "argv": command, "cwd": str(cwd), "started_at": started, "ended_at": utc_now(),
        "elapsed_seconds": time.monotonic() - start,
        "stdout": str(stdout_path), "stderr": str(stderr_path),
        "ownership": "suspended-process Windows Job Object" if os.name == "nt" else "new process group",
    })
    write_json(evidence_dir / "process.json", record)
    return record
