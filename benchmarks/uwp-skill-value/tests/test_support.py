import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from support import file_hashes, run_process, write_json


class ProcessTests(unittest.TestCase):
    def test_native_failure_and_raw_streams(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = run_process(
                [sys.executable, "-c", "import sys; print('out'); print('err',file=sys.stderr); sys.exit(7)"],
                cwd=root, evidence_dir=root / "process", timeout_seconds=10,
            )
            self.assertEqual(result["exit_code"], 7)
            self.assertFalse(result["timed_out"])
            self.assertEqual(Path(result["stdout"]).read_text().strip(), "out")
            self.assertEqual(Path(result["stderr"]).read_text().strip(), "err")

    def test_timeout_and_owned_descendant_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = (
                "import subprocess,sys,time; "
                "subprocess.Popen([sys.executable,'-c',"
                "\"import time,pathlib; time.sleep(2); pathlib.Path('escaped').write_text('bad')\"]); "
                "time.sleep(30)"
            )
            result = run_process([sys.executable, "-c", script], cwd=root,
                                 evidence_dir=root / "process", timeout_seconds=.4)
            self.assertTrue(result["timed_out"])
            # Wait in a separately owned process; escaped descendant must not write.
            run_process([sys.executable, "-c", "import time; time.sleep(2.5)"], cwd=root,
                        evidence_dir=root / "wait", timeout_seconds=10)
            self.assertFalse((root / "escaped").exists())

    def test_missing_executable_not_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = run_process([str(root / "missing.exe")], cwd=root,
                                 evidence_dir=root / "process", timeout_seconds=1)
            self.assertIsNone(result["exit_code"])
            self.assertIsNotNone(result["error"])

    def test_cancellation_cleans_own_children_not_unrelated_process(self):
        import _thread
        import subprocess
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            unrelated = subprocess.Popen(
                [sys.executable, "-c",
                 "import time,pathlib; time.sleep(1); pathlib.Path('unrelated').write_text('alive')"],
                cwd=root,
            )
            timer = threading.Timer(.4, _thread.interrupt_main)
            timer.start()
            try:
                with self.assertRaises(KeyboardInterrupt):
                    run_process(
                        [sys.executable, "-c",
                         "import subprocess,sys,time; "
                         "subprocess.Popen([sys.executable,'-c',"
                         "\"import time,pathlib; time.sleep(1); pathlib.Path('escaped').write_text('bad')\"]); "
                         "time.sleep(30)"],
                        cwd=root, evidence_dir=root / "cancelled", timeout_seconds=30,
                    )
                unrelated.wait(timeout=10)
                self.assertTrue((root / "unrelated").exists())
                self.assertFalse((root / "escaped").exists())
            finally:
                timer.cancel()
                if unrelated.poll() is None:
                    unrelated.kill()
                    unrelated.wait()

    def test_evidence_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "result.json"
            write_json(path, {"status": "fail"})
            with self.assertRaises(FileExistsError):
                write_json(path, {"status": "pass"})
            self.assertEqual(json.loads(path.read_text())["status"], "fail")


if __name__ == "__main__":
    unittest.main()
