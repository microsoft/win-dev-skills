"""Offline frozen-tree fixtures; no credentials, real downloads, or app launches."""

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import unittest
from unittest.mock import patch
import uuid


ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "benchmark_materialize", ROOT / "benchmarks" / "uwp-skill-value" / "materialize.py"
)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def git_tree(files):
    entries = {}
    children = {}
    for path, content in files.items():
        entries[path] = {
            "path": path, "mode": "100644", "type": "blob",
            "sha": m._git_hash("blob", content),
        }
        parent = path.rpartition("/")[0]
        children.setdefault(parent, []).append(path)
        while parent:
            grandparent = parent.rpartition("/")[0]
            if parent not in entries:
                entries[parent] = {"path": parent, "mode": "040000", "type": "tree"}
                children.setdefault(grandparent, []).append(parent)
            parent = grandparent
    for parent in sorted(children, key=lambda p: (p.count("/") + bool(p)), reverse=True):
        paths = sorted(children[parent], key=lambda p: (
            p.rsplit("/", 1)[-1] + ("/" if entries[p]["type"] == "tree" else "")
        ).encode())
        raw = b"".join(
            entries[p]["mode"].lstrip("0").encode() + b" " + p.rsplit("/", 1)[-1].encode()
            + b"\0" + bytes.fromhex(entries[p]["sha"]) for p in paths
        )
        sha = m._git_hash("tree", raw)
        if parent:
            entries[parent]["sha"] = sha
        else:
            root_sha = sha
    return {"sha": root_sha, "truncated": False, "tree": list(entries.values())}


def fixture():
    plugin = {
        m.AGENT: ("---\nname: winui-dev\n---\n" + m.UWP_ROUTING + "\nCommon agent.\n").encode(),
        "plugin.json": b'{"name":"winui","version":"0.6.1"}\n',
        "assets/logo.svg": b"<svg/>\n",
    }
    for skill in m.COMMON_SKILLS:
        plugin[f"skills/{skill}/SKILL.md"] = f"---\nname: {skill}\n---\nCommon.\n".encode()
    plugin["skills/winui-dev-workflow/BuildAndRun.ps1"] = b"param($Project)\n"
    plugin.update({
        m.MIGRATION + "SKILL.md": b"---\nname: winui-uwp-migration\n---\nFull workflow.\n[Patterns](./MIGRATION-PATTERNS.md)\n",
        m.CATALOG: b'<a id="threading"></a>\n## Threading\nFrozen pattern.\n',
        m.MIGRATION + "scripts/unsupported-api-inventory.json": b'{"adaptable":[{"anchor":"threading"}]}\n',
    })
    for script in ("Initialize-UwpMigration", "Validate-UwpMigration",
                   "Get-WinUIDefaultStyle", "Get-MigrationPattern"):
        plugin[m.MIGRATION + f"scripts/{script}.ps1"] = f"# Frozen {script}\n".encode()
    plugin[m.MIGRATION + "scripts/tests/golden.Tests.ps1"] = b"# Frozen tests\n"
    source = {
        "LICENSE": b"Source license and SharedContent discovery sentinel\n",
        m.SAMPLE_ROOT + "/README.md": b"Original complete sample\n",
        m.PROJECT: b"""<Project>
  <Import Project="$(MSBuildExtensionsPath)\\Microsoft.Common.props" />
  <Import Project="..\\shared.props" />
  <ItemGroup>
    <ApplicationDefinition Include="$(SharedContentDir)\\xaml\\App.xaml"><Link>App.xaml</Link></ApplicationDefinition>
    <Compile Include="$(SharedContentDir)\\cs\\App.xaml.cs"><Link>App.xaml.cs</Link></Compile>
    <Content Include="$(SharedContentDir)\\media\\logo.png"><Link>Assets\\logo.png</Link></Content>
    <Page Include="MainPage.xaml" />
  </ItemGroup>
</Project>""",
        m.SAMPLE_ROOT + "/shared.props": b'<Project><Import Project="..\\..\\SharedContent\\common.targets" /></Project>',
        "SharedContent/common.targets": b"<Project/>",
        "SharedContent/xaml/App.xaml": b"<Application/>",
        "SharedContent/cs/App.xaml.cs": b"// Original app\n",
        "SharedContent/media/logo.png": b"\x89PNG\r\nfixture\n",
        m.SAMPLE_ROOT + "/cs/MainPage.xaml": b'<Page><Image Source="Assets/logo.png"/></Page>',
        m.SAMPLE_ROOT + "/cs/Scenarios/BasicDeferral.xaml": b"<Page/>",
    }
    return {
        m.SKILLS_REPO: {m.PLUGIN_PREFIX + p: b for p, b in plugin.items()},
        m.SOURCE_REPO: source,
    }


class MaterializationTests(unittest.TestCase):
    def setUp(self):
        self.directory = ROOT / f".materialize-test-{uuid.uuid4().hex}"
        self.inputs = fixture()
        self.downloads = []

    def tearDown(self):
        shutil.rmtree(self.directory, ignore_errors=True)

    def materialize(self, transform=None):
        trees = {repo: git_tree(files) for repo, files in self.inputs.items()}
        pins = {repo: tree["sha"] for repo, tree in trees.items()}

        def download(url):
            self.downloads.append(url)
            for repo, ref in m.PINNED_REFS.items():
                if url == f"https://api.github.com/repos/{repo}/git/commits/{ref}":
                    data = json.dumps({"sha": ref, "tree": {"sha": pins[repo]}}).encode()
                elif url == f"https://api.github.com/repos/{repo}/git/trees/{pins[repo]}?recursive=1":
                    data = json.dumps(trees[repo]).encode()
                elif url.startswith(f"https://raw.githubusercontent.com/{repo}/{ref}/"):
                    data = self.inputs[repo][url.split(f"/{ref}/", 1)[1]]
                else:
                    continue
                return transform(url, data) if transform else data
            self.fail(f"Unexpected public download: {url}")

        self.pins = pins
        with patch.object(m, "PINNED_TREES", pins), patch.object(m, "_download", side_effect=download):
            return m.materialize_experiment(self.directory)

    def validate(self):
        with patch.object(m, "PINNED_TREES", self.pins), patch.object(
            m, "_download", side_effect=AssertionError("Validation must be offline")
        ):
            return m.validate_materialization(self.directory)

    def test_golden_treatments_and_original_shared_layout(self):
        manifest = self.materialize()
        self.assertEqual(manifest, self.validate())
        self.assertIn("SharedContent/cs/App.xaml.cs", manifest["source"]["files"])
        self.assertIn("SharedContent/common.targets", manifest["source"]["files"])
        self.assertIn("LICENSE", manifest["source"]["files"])
        self.assertEqual(1, len(manifest["source"]["external_toolchain_imports"]))
        self.assertEqual(8, len(m.COMMON_SKILLS))
        for arm in m.ARMS:
            for name, digest in manifest["common_files"].items():
                self.assertEqual(digest, manifest["treatments"][arm]["files"][name])
            hashes = manifest["treatments"][arm]["files"]
            self.assertEqual(hashes[m.AGENT], hashes[m.COMPATIBILITY_AGENT])
        self.assertEqual(
            m.COMPATIBILITY_AGENT, manifest["common_agent_transform"]["compatibility_copy"]
        )
        full = manifest["treatments"]["F"]["files"]
        for name in full:
            if name.startswith(m.MIGRATION + "scripts/"):
                self.assertEqual(full[name], manifest["treatments"]["T"]["files"][name])
                self.assertEqual(full[name], manifest["treatments"]["L"]["files"][name])
        self.assertNotIn(m.CATALOG, manifest["treatments"]["T"]["files"])
        self.assertEqual([m.LOOKUP], manifest["treatments"]["T"]["disabled_entrypoints"])
        self.assertEqual(
            full[m.CATALOG], manifest["treatments"]["L"]["files"][m.CATALOG]
        )
        original = self.inputs[m.SKILLS_REPO][m.PLUGIN_PREFIX + m.MIGRATION + "SKILL.md"]
        self.assertEqual(hashlib.sha256(original).hexdigest(), full[m.MIGRATION + "SKILL.md"])
        self.assertEqual(
            [m.MIGRATION + "SKILL.md"], manifest["treatment_diffs"]["L-F"]["changed"]
        )
        self.assertEqual(
            [m.CATALOG], manifest["treatment_diffs"]["T-L"]["added"]
        )
        for arm in ("T", "L", "F"):
            self.assertEqual(m.TREATMENT_PROMPT, manifest["treatments"][arm]["prompt"])
        baseline = manifest["treatments"]["B"]["files"]
        self.assertFalse(any("winui-uwp-migration" in p for p in baseline))
        self.assertFalse(any(".cache" in p for p in baseline))
        self.assertTrue(all(
            any(ref in url for ref in (*m.PINNED_REFS.values(), *self.pins.values()))
            for url in self.downloads
        ))

    def test_immutable_ref_allowlist(self):
        for repo, ref in ((m.SKILLS_REPO, "main"), (m.SKILLS_REPO, "196d076"),
                          ("someone/private", "a" * 40), (m.SOURCE_REPO, "b" * 40)):
            with self.subTest(repo=repo, ref=ref), self.assertRaises(ValueError):
                m._validate_ref(repo, ref)

    def test_wrong_commit_response_rejected(self):
        def wrong_commit(url, data):
            if "/git/commits/" in url:
                value = json.loads(data)
                value["sha"] = "b" * 40
                return json.dumps(value).encode()
            return data
        with self.assertRaisesRegex(ValueError, "commit/tree"):
            self.materialize(wrong_commit)

    def test_missing_tree_hash_rejected(self):
        def missing_hash(url, data):
            if "/git/trees/" in url:
                value = json.loads(data)
                value["tree"][0].pop("sha")
                return json.dumps(value).encode()
            return data
        with self.assertRaisesRegex(ValueError, "object hash"):
            self.materialize(missing_hash)

    def test_rewritten_tree_hash_and_truncated_tree_rejected(self):
        tree = git_tree(self.inputs[m.SOURCE_REPO])
        root_hash = tree["sha"]
        tree["tree"][0]["sha"] = "0" * 40
        with self.assertRaisesRegex(ValueError, "tree hash"):
            m._verify_tree(tree, root_hash)
        tree["truncated"] = True
        with self.assertRaisesRegex(ValueError, "truncated"):
            m._verify_tree(tree, root_hash)

    def test_incorrect_blob_rejected(self):
        with self.assertRaisesRegex(ValueError, "blob hash"):
            self.materialize(lambda url, data: data + b"corrupt" if "raw.githubusercontent" in url else data)

    def test_missing_source_link_rejected(self):
        del self.inputs[m.SOURCE_REPO]["SharedContent/cs/App.xaml.cs"]
        with self.assertRaisesRegex(ValueError, "Missing.*pinned input"):
            self.materialize()

    def test_missing_plugin_link_rejected(self):
        path = m.PLUGIN_PREFIX + "skills/winui-design/SKILL.md"
        self.inputs[m.SKILLS_REPO][path] += b"[Missing](./missing.md)\n"
        with self.assertRaisesRegex(ValueError, "Missing plugin link"):
            self.materialize()

    def test_missing_catalog_anchor_rejected(self):
        self.inputs[m.SKILLS_REPO][m.PLUGIN_PREFIX + m.CATALOG] = b"No expected anchor\n"
        with self.assertRaisesRegex(ValueError, "catalog anchor"):
            self.materialize()

    def test_upstream_lookup_alias_resolves_inventory_anchor(self):
        self.inputs[m.SKILLS_REPO][m.PLUGIN_PREFIX + m.LOOKUP] = (
            b"$aliasMap = @{\n    'dispatch' = 'threading'\n}\n"
        )
        self.inputs[m.SKILLS_REPO][
            m.PLUGIN_PREFIX + m.MIGRATION + "scripts/unsupported-api-inventory.json"
        ] = b'{"adaptable":[{"anchor":"dispatch"}]}'
        self.materialize()
        self.validate()

    def test_sensitive_classification_labels_are_not_catalog_links(self):
        self.inputs[m.SKILLS_REPO][
            m.PLUGIN_PREFIX + m.MIGRATION + "scripts/unsupported-api-inventory.json"
        ] = b'{"adaptable":[{"anchor":"threading"}],"sensitivePresence":[{"anchor":"speech"}]}'
        self.materialize()
        self.validate()

    def test_missing_hash_manifest_rejected(self):
        self.materialize()
        path = self.directory / "materialization.json"
        manifest = json.loads(path.read_bytes())
        manifest["source"]["files"].pop("LICENSE")
        path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Manifest differs"):
            self.validate()

    def test_baseline_contamination_even_with_updated_manifest_rejected(self):
        self.materialize()
        path = self.directory / "treatments" / "B" / "agent-plugin" / "hidden-inventory.json"
        path.write_bytes(b'{"migration":"leak"}')
        manifest_path = self.directory / "materialization.json"
        manifest = json.loads(manifest_path.read_bytes())
        manifest["treatments"]["B"]["files"][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Manifest differs"):
            self.validate()

    def test_missing_changed_and_extra_files_rejected(self):
        self.materialize()
        target = self.directory / "inputs" / "source" / "LICENSE"
        original = target.read_bytes()
        target.unlink()
        with self.assertRaisesRegex(ValueError, "Materialization mismatch"):
            self.validate()
        target.write_bytes(original + b"changed")
        with self.assertRaisesRegex(ValueError, "Materialization mismatch"):
            self.validate()
        target.write_bytes(original)
        extra = self.directory / "treatments" / "hidden-catalog.md"
        extra.write_bytes(b"not mounted")
        with self.assertRaisesRegex(ValueError, "Extra/missing treatment"):
            self.validate()

    def test_cached_provenance_corruption_rejected(self):
        self.materialize()
        blob = next((self.directory / ".cache").rglob("blobs/*"))
        blob.write_bytes(b"cache corruption")
        with self.assertRaisesRegex(ValueError, "blob hash"):
            self.validate()

    def test_reparse_point_rejected_before_enumerating_children(self):
        self.materialize()
        junction = self.directory / "inputs" / "source" / "injected-junction"
        junction.mkdir()
        real_iterdir = Path.iterdir
        visited = []

        def iterdir(path):
            visited.append(path)
            return real_iterdir(path)

        with patch.object(Path, "is_junction", lambda path: path == junction), patch.object(
            Path, "iterdir", iterdir
        ), self.assertRaisesRegex(ValueError, "Links/junctions"):
            self.validate()
        self.assertNotIn(junction, visited)

    def test_idempotent_offline_materialization(self):
        expected = self.materialize()
        with patch.object(m, "PINNED_TREES", self.pins), patch.object(
            m, "_download", side_effect=AssertionError("Existing frozen run must not download")
        ):
            self.assertEqual(expected, m.materialize_experiment(self.directory))

    def test_runner_owned_scaffold_does_not_invalidate_source_materialization(self):
        expected = self.materialize()
        scaffold = self.directory / "inputs" / "scaffold"
        scaffold.mkdir()
        (scaffold / "BenchmarkApp.csproj").write_bytes(b"<Project/>")
        self.assertEqual(expected, self.validate())


if __name__ == "__main__":
    unittest.main()
