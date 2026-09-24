"""Frozen public inputs for the UWP benchmark (Python 3.12, standard library).

The destination is a run-owned artifact directory, not an agent workspace.
Copy only inputs/source and one treatments/<arm>/agent-plugin into a trial.
The cache, provenance, other arms, and benchmark implementation stay outside it.
Validation is offline, reconstructs the recipe from verified cached Git objects,
and rejects missing, changed, extra, or linked files in the materialized trees.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import posixpath
from pathlib import Path, PurePosixPath
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


SKILLS_REPO = "microsoft/win-dev-skills"
SOURCE_REPO = "microsoft/Windows-universal-samples"
PINNED_REFS = {
    SKILLS_REPO: "196d076e92d7161031dba5eef50f4e23e04a4d8e",
    SOURCE_REPO: "4eb2fcb499c5bc549e918920cfd2b64396a650d9",
}
PINNED_TREES = {
    SKILLS_REPO: "353629d4f133db1bf68e5ef44aa3d7f8dfac0c83",
    SOURCE_REPO: "65af2e665dc96bdb5055cd0496e64bcb42fee722",
}
ARMS = ("B", "T", "L", "F")
COMMON_SKILLS = (
    "winui-code-review", "winui-design", "winui-dev-workflow",
    "winui-packaging", "winui-session-report", "winui-setup",
    "winui-ui-testing", "winui-wpf-migration",
)
PLUGIN_PREFIX = "plugins/winui/agent-plugin/"
MIGRATION = "skills/winui-uwp-migration/"
SCENARIO = "XamlDeferLoadStrategy"
SAMPLE_ROOT = f"Samples/{SCENARIO}"
PROJECT = f"{SAMPLE_ROOT}/cs/xDeferLoadStrategy.csproj"
AGENT = "com.github.copilot/agents/winui-dev.agent.md"
COMPATIBILITY_AGENT = "agents/winui-dev.agent.md"
LOOKUP = MIGRATION + "scripts/Get-MigrationPattern.ps1"
CATALOG = MIGRATION + "MIGRATION-PATTERNS.md"
UWP_ROUTING = (
    "For C# UWP → WinUI 3 / Windows App SDK migrations, invoke the "
    "`winui-uwp-migration` skill immediately."
)
TREATMENT_PROMPT = (
    "Use the assigned operational material: invoke the installed "
    "winui-uwp-migration skill, or read "
    r".treatment\agent-plugin\skills\winui-uwp-migration\SKILL.md "
    "if the skill invocation interface is unavailable. Follow that material "
    "within the same task scope and budget."
)
TOOLS_ADAPTER = """---
name: winui-uwp-migration
description: "Operational interface for the assigned C# UWP migration tools."
---

# UWP migration tool interface

Use the supplied target scaffold; do not create a second target. Paths below
are relative to this skill directory. Run PowerShell scripts with `pwsh -File`.

- `scripts/Initialize-UwpMigration.ps1 -Source <original-cs-directory> -Target <target-directory>`
  inventories and copies the original source into the existing target. Run once
  before editing migrated files; inspect its generated mapping and diagnostics.
- `scripts/Get-WinUIDefaultStyle.ps1 -StyleKey <key> -ProjectPath <target.csproj>`
  returns a reference style from the project's resolved WinUI package.
  `-ListKeys -Filter <regex>` lists matching style keys.
- `scripts/Validate-UwpMigration.ps1 -Target <target-directory>` checks mapping,
  residue, packaging, analyzer-enabled build and runtime smoke launch.
  Read `.validator-diagnostics.txt` for failures. Exit 0 permits completion,
  1 means failed gates, and 2 means runtime blocked/unverified. A build alone
  does not waive a nonzero result. Limit repair/revalidation to two cycles.
- `scripts/unsupported-api-inventory.json` is the tools' classification input.

Preserve original startup behavior, pages, controls, helpers, bindings, assets,
and resource identities. Do not fabricate APIs, discard supported behavior, or
declare untested runtime behavior verified. Record unsupported features and
remaining failures explicitly; keep the generated mapping and deferred records
consistent. Build using the shared `winui-dev-workflow/BuildAndRun.ps1` interface.
"""
TOOLS_DISABLED = """
## Disabled catalog lookup

The reference catalog is deliberately not included in this treatment.
`scripts/Get-MigrationPattern.ps1` is DISABLED: do not invoke it, including
when generated TODOs mention an anchor. Its unchanged source is retained only
to keep the script payload identical across tool-bearing treatments.
Do not search for, download, or reconstruct the omitted package catalog.
Use the inventory and diagnostics without treating anchors as available links.
"""
LEAN_ROUTING = """
## On-demand migration patterns

For each unresolved API or generated TODO, read its inventory anchor and call
`scripts/Get-MigrationPattern.ps1 -Anchor <anchor>` to retrieve only the relevant
section of [MIGRATION-PATTERNS.md](./MIGRATION-PATTERNS.md). The catalog is the
unchanged full-treatment catalog. Do not load it wholesale. Lookup exit 0 means
success; exit 1 means no matching anchor (consult its available-anchor message).

Audit source startup wiring before bootstrap and preserve it in the supplied
target. Reconcile copied project items and links rather than replacing them
with an unrelated application. Resolve mapping rows file by file; follow
dependency order for sensitive inventory groups. Preserve template intent
while using the style helper only as reference. Run the shared analyzer build,
then the migration validator before declaring completion. Neither unsupported
labels nor a successful build substitute for verified behavior and fidelity.
"""


def _git_hash(kind: str, content: bytes) -> str:
    return hashlib.sha1(f"{kind} {len(content)}\0".encode() + content).hexdigest()


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()


def _relative(path: str) -> str:
    if not isinstance(path, str) or not path or "\\" in path or ":" in path:
        raise ValueError(f"Invalid relative path: {path!r}")
    parts = PurePosixPath(path).parts
    if path.startswith("/") or any(p in ("", ".", "..") for p in path.split("/")):
        raise ValueError(f"Unsafe relative path: {path!r}")
    if any(p.rstrip(" .") != p for p in parts):
        raise ValueError(f"Ambiguous Windows path: {path!r}")
    return path


def _local(root: Path, relative: str) -> Path:
    return root.joinpath(*PurePosixPath(_relative(relative)).parts)


def _no_links(path: Path) -> None:
    for item in (path, *path.parents):
        if item.is_symlink() or item.is_junction():
            raise ValueError(f"Links/junctions are not permitted: {item}")


def _validate_ref(repo: str, ref: str) -> None:
    if repo not in PINNED_REFS or ref != PINNED_REFS[repo]:
        raise ValueError(f"Only the pinned public immutable ref is allowed: {repo}@{ref}")
    if not re.fullmatch(r"[0-9a-f]{40}", ref):
        raise ValueError("Ref must be a complete lowercase Git commit SHA")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError(f"Unexpected download redirect: {newurl}")


def _download(url: str) -> bytes:
    # No gh credentials, local Git configuration, proxy configuration, or cookies.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    request = urllib.request.Request(url, headers={"User-Agent": "uwp-skill-value/1"})
    with opener.open(request, timeout=90) as response:
        content = response.read(64 * 1024 * 1024 + 1)
    if len(content) > 64 * 1024 * 1024:
        raise ValueError("Public input exceeds the download size limit")
    return content


def _verify_tree(tree: dict, expected: str) -> dict[str, dict]:
    if tree.get("sha") != expected or tree.get("truncated") is not False:
        raise ValueError("Missing, truncated, or mismatched immutable Git tree")
    entries: dict[str, dict] = {}
    groups: dict[str, list[dict]] = {"": []}
    folded: set[str] = set()
    for item in tree.get("tree", []):
        path = _relative(item["path"])
        if path.casefold() in folded:
            raise ValueError(f"Duplicate/case-colliding upstream path: {path}")
        folded.add(path.casefold())
        if not re.fullmatch(r"[0-9a-f]{40}", item.get("sha", "")):
            raise ValueError(f"Missing Git object hash: {path}")
        if (item.get("type"), item.get("mode")) not in {
            ("tree", "040000"), ("blob", "100644"), ("blob", "100755"),
            ("blob", "120000"), ("commit", "160000"),
        }:
            raise ValueError(f"Unsupported Git object: {path}")
        entries[path] = item
        groups.setdefault(posixpath.dirname(path), []).append(item)
        if item["type"] == "tree":
            groups.setdefault(path, [])
    for directory, children in groups.items():
        if directory and entries.get(directory, {}).get("type") != "tree":
            raise ValueError(f"Missing parent tree: {directory}")
        children.sort(key=lambda i: (
            posixpath.basename(i["path"]) + ("/" if i["type"] == "tree" else "")
        ).encode())
        raw = b"".join(
            i["mode"].lstrip("0").encode() + b" "
            + posixpath.basename(i["path"]).encode() + b"\0"
            + bytes.fromhex(i["sha"]) for i in children
        )
        wanted = entries[directory]["sha"] if directory else expected
        if _git_hash("tree", raw) != wanted:
            raise ValueError(f"Git tree hash mismatch: {directory or '/'}")
    return entries


class _Repository:
    def __init__(self, cache: Path, repo: str, *, offline: bool = False):
        self.repo = repo
        self.ref = PINNED_REFS[repo]
        _validate_ref(repo, self.ref)
        self.cache = cache / repo.split("/")[1] / self.ref
        self.offline = offline
        _no_links(self.cache)
        commit = self._metadata(
            "commit.json", f"https://api.github.com/repos/{repo}/git/commits/{self.ref}"
        )
        if (commit.get("sha") != self.ref
                or commit.get("tree", {}).get("sha") != PINNED_TREES[repo]):
            raise ValueError("Pinned commit/tree identity mismatch")
        tree = self._metadata(
            "tree.json",
            f"https://api.github.com/repos/{repo}/git/trees/{PINNED_TREES[repo]}?recursive=1",
        )
        self.entries = _verify_tree(tree, PINNED_TREES[repo])
        self.blobs = {p: v for p, v in self.entries.items() if v["type"] == "blob"}

    def _metadata(self, name: str, url: str) -> dict:
        path = self.cache / name
        _no_links(path)
        if path.exists():
            content = path.read_bytes()
        elif self.offline:
            raise ValueError(f"Missing frozen provenance: {path}")
        else:
            content = _download(url)
            value = json.loads(content)
            self.cache.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            return value
        return json.loads(content)

    def read(self, relative: str) -> bytes:
        relative = _relative(relative)
        item = self.blobs.get(relative)
        if not item or item["mode"] not in ("100644", "100755"):
            raise ValueError(f"Missing or non-regular pinned input: {relative}")
        path = self.cache / "blobs" / item["sha"]
        _no_links(path)
        if path.exists():
            content = path.read_bytes()
        elif self.offline:
            raise ValueError(f"Missing cached Git blob: {relative}")
        else:
            encoded = urllib.parse.quote(relative, safe="/")
            content = _download(
                f"https://raw.githubusercontent.com/{self.repo}/{self.ref}/{encoded}"
            )
            if _git_hash("blob", content) != item["sha"]:
                raise ValueError(f"Git blob hash mismatch: {relative}")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        if _git_hash("blob", content) != item["sha"]:
            raise ValueError(f"Git blob hash mismatch: {relative}")
        return content

    def read_many(self, paths) -> dict[str, bytes]:
        paths = sorted(set(paths))
        with ThreadPoolExecutor(max_workers=8) as executor:
            return dict(zip(paths, executor.map(self.read, paths)))


_PROJECT_EXTENSIONS = (".csproj", ".projitems", ".shproj", ".props", ".targets")
_ITEM_TAGS = {
    "Compile", "Content", "None", "Page", "ApplicationDefinition",
    "EmbeddedResource", "Resource", "AppxManifest", "PRIResource", "ProjectReference",
}
_EXTERNAL_IMPORTS = (
    "$(MSBuildExtensionsPath)", "$(MSBuildExtensionsPath32)", "$(MSBuildToolsPath)",
    "$(MSBuildBinPath)", "$(MSBuildSDKsPath)", "$(VCTargetsPath)",
)


def _project_references(path: str, content: bytes) -> tuple[list[dict], list[dict]]:
    try:
        document = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid source project XML: {path}") from exc
    references, external = [], []
    for node in document.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        include = node.get("Project") if tag == "Import" else node.get("Include")
        if not include or (tag != "Import" and tag not in _ITEM_TAGS):
            continue
        if tag == "Import" and include.startswith(_EXTERNAL_IMPORTS):
            external.append({"from": path, "include": include})
            continue
        for part in include.split(";"):
            relative = part.replace("\\", "/")
            if relative.startswith("$(SharedContentDir)/"):
                relative = relative.replace("$(SharedContentDir)/", "SharedContent/", 1)
            else:
                relative = relative.replace("$(MSBuildThisFileDirectory)", "")
                relative = relative.replace("$(MSBuildProjectDirectory)/", "")
                relative = posixpath.join(posixpath.dirname(path), relative)
            if "$(" in relative or "*" in relative or "?" in relative:
                raise ValueError(f"Unresolved project dependency: {path}: {include}")
            relative = _relative(posixpath.normpath(relative))
            link = next((n.text for n in node if n.tag.rsplit("}", 1)[-1] == "Link"), None)
            references.append({
                "from": path, "include": part, "path": relative,
                "link": link.replace("\\", "/") if link else None,
            })
    return references, external


def _source(repo: _Repository) -> tuple[dict[str, bytes], list[dict], list[dict]]:
    selected = {
        p for p in repo.blobs if p.startswith(SAMPLE_ROOT + "/")
    } | {"LICENSE"}
    if PROJECT not in selected:
        raise ValueError(f"Required C# scenario is absent: {PROJECT}")
    # LICENSE is also the upstream project's SharedContentDir discovery sentinel.
    for ancestor in ("", "Samples", SAMPLE_ROOT, SAMPLE_ROOT + "/cs"):
        for filename in ("Directory.Build.props", "Directory.Build.targets",
                         "Directory.Packages.props", "global.json", "NuGet.Config"):
            candidate = posixpath.join(ancestor, filename)
            if candidate in repo.blobs:
                selected.add(candidate)
    files = repo.read_many(selected)
    inspected: set[str] = set()
    references, external = [], []
    while pending := sorted(p for p in files if p.endswith(_PROJECT_EXTENSIONS) and p not in inspected):
        for path in pending:
            inspected.add(path)
            links, imports = _project_references(path, files[path])
            references.extend(links)
            external.extend(imports)
            files.update(repo.read_many(link["path"] for link in links if link["path"] not in files))
    _validate_source_links(files, references)
    return files, sorted(references, key=lambda r: (r["from"], r["path"])), external


def _validate_source_links(files: dict[str, bytes], references: list[dict]) -> None:
    virtual = {p.casefold(): p for p in files}
    for link in references:
        if link["path"] not in files:
            raise ValueError(f"Missing project link: {link['path']}")
        if link["link"]:
            alias = posixpath.join(posixpath.dirname(link["from"]), link["link"])
            virtual[alias.casefold()] = link["path"]
    project_root = posixpath.dirname(PROJECT)
    for path, content in files.items():
        if not path.endswith((".xaml", ".appxmanifest")):
            continue
        try:
            document = ET.fromstring(content)
        except ET.ParseError as exc:
            raise ValueError(f"Invalid source XML: {path}") from exc
        for node in document.iter():
            values = list(node.attrib.values())
            if node.tag.rsplit("}", 1)[-1] == "Logo" and node.text:
                values.append(node.text.strip())
            for value in values:
                value = value.replace("\\", "/")
                if not re.search(r"\.(png|jpe?g|gif|ico|xaml)$", value, re.I):
                    continue
                if value.startswith(("{", "http:", "https:", "ms-resource:", "ms-appx:///Microsoft.")):
                    continue
                if ":" in value and not value.startswith("ms-appx:"):
                    continue
                value = value.removeprefix("ms-appx:///").removeprefix("/")
                candidates = (posixpath.join(project_root, value),
                              posixpath.join(posixpath.dirname(path), value))
                if not any(posixpath.normpath(p).casefold() in virtual for p in candidates):
                    raise ValueError(f"Missing source asset/XAML link: {path}: {value}")


def _validate_plugin_links(files: dict[str, bytes], *, catalog_enabled: bool) -> None:
    for path, content in files.items():
        if not path.endswith(".md"):
            continue
        text = content.decode("utf-8-sig")
        for target in re.findall(r"\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)", text):
            if target.startswith(("#", "http:", "https:", "mailto:", "<")):
                continue
            target = target.split("#", 1)[0]
            # Only authored relative package links, not example application paths.
            if not target.startswith(("./", "../")):
                continue
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(path), target))
            if resolved not in files:
                raise ValueError(f"Missing plugin link: {path}: {target}")
    if catalog_enabled:
        catalog = files[CATALOG].decode("utf-8-sig")
        anchors = set(re.findall(r'<a\s+id="([^"]+)"', catalog))
        lookup = files[LOOKUP].decode("utf-8-sig")
        alias_block = re.search(r"(?ms)^\$aliasMap\s*=\s*@\{(.*?)^\}", lookup)
        aliases = dict(re.findall(
            r"(?m)^\s*'([^']+)'\s*=\s*'([^']+)'",
            alias_block.group(1) if alias_block else "",
        ))
        inventory = json.loads(files[MIGRATION + "scripts/unsupported-api-inventory.json"])
        # Only adaptable entries produce lookup TODOs. sensitivePresence uses
        # family labels (including speech/audio), not executable catalog links.
        for entry in inventory.get("adaptable", []):
            if isinstance(entry, dict) and entry.get("anchor") is not None:
                anchor = entry["anchor"]
                if aliases.get(anchor.lower(), anchor) not in anchors:
                    raise ValueError(f"Missing inventory catalog anchor: {anchor}")


def _treatments(repo: _Repository) -> tuple[dict[str, dict[str, bytes]], dict[str, str]]:
    upstream = repo.read_many(p for p in repo.blobs if p.startswith(PLUGIN_PREFIX))
    plugin = {p.removeprefix(PLUGIN_PREFIX): b for p, b in upstream.items()}
    skills = {p.split("/")[1] for p in plugin if p.startswith("skills/")}
    if skills != set(COMMON_SKILLS) | {"winui-uwp-migration"}:
        raise ValueError(f"Unexpected pinned skill set: {sorted(skills)}")
    common = {p: b for p, b in plugin.items() if not p.startswith(MIGRATION)}
    if AGENT not in common or "plugin.json" not in common:
        raise ValueError("Pinned common agent or plugin manifest is missing")
    routing = UWP_ROUTING.encode()
    if common[AGENT].count(routing) != 1:
        raise ValueError("Common agent UWP routing line no longer matches the frozen recipe")
    common[AGENT] = common[AGENT].replace(routing + b"\n", b"").replace(routing + b"\r\n", b"")
    if b"winui-uwp-migration" in common[AGENT]:
        raise ValueError("Common agent still routes to the UWP package")
    # Copilot 1.0.83's legacy plugin discovery uses the root agents directory.
    # Preserve the vendor layout too; either discovery path returns identical text.
    common[COMPATIBILITY_AGENT] = common[AGENT]
    required = {
        MIGRATION + "SKILL.md", CATALOG, LOOKUP,
        MIGRATION + "scripts/Initialize-UwpMigration.ps1",
        MIGRATION + "scripts/Validate-UwpMigration.ps1",
        MIGRATION + "scripts/Get-WinUIDefaultStyle.ps1",
        MIGRATION + "scripts/unsupported-api-inventory.json",
    }
    if not required <= plugin.keys():
        raise ValueError(f"Incomplete migration package: {sorted(required - plugin.keys())}")
    treatments = {"B": dict(common)}
    treatments["F"] = {**plugin, **common}
    treatments["L"] = {**treatments["F"], MIGRATION + "SKILL.md": (TOOLS_ADAPTER + LEAN_ROUTING).encode()}
    treatments["T"] = {
        **{p: b for p, b in treatments["F"].items() if p != CATALOG},
        MIGRATION + "SKILL.md": (TOOLS_ADAPTER + TOOLS_DISABLED).encode(),
    }
    for arm, files in treatments.items():
        _validate_plugin_links(files, catalog_enabled=arm in ("L", "F"))
    return treatments, {p: _sha256(b) for p, b in sorted(common.items())}


def _file_hashes(files: dict[str, bytes]) -> dict[str, str]:
    return {p: _sha256(b) for p, b in sorted(files.items())}


def _differences(left: dict[str, str], right: dict[str, str]) -> dict:
    return {
        "added": sorted(right.keys() - left.keys()),
        "removed": sorted(left.keys() - right.keys()),
        "changed": sorted(p for p in left.keys() & right.keys() if left[p] != right[p]),
    }


def _recipe(destination: Path, *, offline: bool) -> tuple[dict, dict[str, dict[str, bytes]]]:
    cache = destination / ".cache"
    source_repo = _Repository(cache, SOURCE_REPO, offline=offline)
    skills_repo = _Repository(cache, SKILLS_REPO, offline=offline)
    source_files, links, imports = _source(source_repo)
    treatments, common = _treatments(skills_repo)
    roots = {"inputs/source": source_files}
    source_hashes = _file_hashes(source_files)
    manifest = {
        "schema_version": 1,
        "scenario": SCENARIO,
        "upstream": {
            repo: {"commit": PINNED_REFS[repo], "tree": PINNED_TREES[repo]}
            for repo in (SOURCE_REPO, SKILLS_REPO)
        },
        "source": {
            "root": "inputs/source", "scenario": SCENARIO,
            "sample_directory": SAMPLE_ROOT, "project": PROJECT,
            "project_directory": posixpath.dirname(PROJECT),
            "files": source_hashes, "sha256": _sha256(_json_bytes(source_hashes)),
            "git_blobs": {p: source_repo.blobs[p]["sha"] for p in sorted(source_files)},
            "project_links": links, "external_toolchain_imports": imports,
        },
        "treatments": {},
        "common_files": common,
        "common_agent_transform": {
            "path": AGENT, "removed_line": UWP_ROUTING,
            "compatibility_copy": COMPATIBILITY_AGENT,
            "compatibility_target": "Copilot CLI 1.0.83 legacy agents-directory discovery",
            "discovered_name": "winui-dev",
        },
        "mount_contract": {
            "source": "Copy the entire inputs/source tree, retaining its original layout.",
            "plugin": r".treatment\agent-plugin",
            "exclude": [".cache", "materialization.json", "other treatments", "runner", "evaluator"],
        },
    }
    for arm in ARMS:
        root = f"treatments/{arm}/agent-plugin"
        roots[root] = treatments[arm]
        hashes = _file_hashes(treatments[arm])
        manifest["treatments"][arm] = {
            "root": root, "files": hashes, "sha256": _sha256(_json_bytes(hashes)),
            "skill_name": None if arm == "B" else "winui-uwp-migration",
            "prompt": (
                "Use the installed common winui-dev agent and assigned WinUI operational material."
                if arm == "B" else TREATMENT_PROMPT
            ),
            "catalog_lookup_enabled": arm in ("L", "F"),
            "disabled_entrypoints": [LOOKUP] if arm == "T" else [],
        }
    manifest["treatment_diffs"] = {
        f"{left}-{right}": _differences(
            manifest["treatments"][left]["files"], manifest["treatments"][right]["files"]
        ) for left, right in (("B", "T"), ("T", "L"), ("L", "F"), ("B", "F"))
    }
    manifest["candidate_git_blobs"] = {
        p.removeprefix(PLUGIN_PREFIX): i["sha"]
        for p, i in sorted(skills_repo.blobs.items()) if p.startswith(PLUGIN_PREFIX)
    }
    return manifest, roots


def _scan(root: Path) -> dict[str, str]:
    if not root.is_dir():
        raise ValueError(f"Missing materialized directory: {root}")
    _no_links(root)
    files = {}
    folded = set()
    pending = [root]
    while pending:
        for path in sorted(pending.pop().iterdir()):
            # Reject reparse points before enumerating any child directory.
            _no_links(path)
            if path.is_file():
                relative = path.relative_to(root).as_posix()
                _relative(relative)
                if relative.casefold() in folded:
                    raise ValueError(f"Case-colliding materialized path: {relative}")
                folded.add(relative.casefold())
                files[relative] = _sha256(path.read_bytes())
            elif path.is_dir():
                pending.append(path)
            else:
                raise ValueError(f"Non-regular materialized entry: {path}")
    return files


def _check_roots(destination: Path, roots: dict[str, dict[str, bytes]]) -> None:
    for root, files in roots.items():
        expected = _file_hashes(files)
        actual = _scan(_local(destination, root))
        if actual != expected:
            raise ValueError(f"Materialization mismatch in {root}: {_differences(expected, actual)}")
    expected_treatments = {
        f"{arm}/agent-plugin/{p}": _sha256(b)
        for arm in ARMS for p, b in roots[f"treatments/{arm}/agent-plugin"].items()
    }
    if _scan(destination / "treatments") != expected_treatments:
        raise ValueError("Extra/missing treatment files outside the allowed arm bundles")
    # inputs/scaffold belongs to the runner; only inputs/source is owned here.


def materialize_experiment(destination: Path) -> dict:
    """Fetch only the two immutable public inputs, create B/T/L/F, and verify.

    All manifest paths and hash-map keys are destination-relative POSIX paths.
    Each treatments[arm]['prompt'] is a string usable by the runner; T/L/F use
    exactly the same forced-use prompt and retain the same advertised skill name.
    Existing frozen materializations are validated, never silently overwritten.
    """
    destination = Path(destination).absolute()
    _no_links(destination)
    if (destination / "materialization.json").exists():
        return validate_materialization(destination)
    if any((destination / name).exists() for name in ("inputs", "treatments")):
        raise ValueError("Refusing to overwrite an incomplete materialization")
    destination.mkdir(parents=True, exist_ok=True)
    manifest, roots = _recipe(destination, offline=False)
    for root, files in roots.items():
        for relative, content in files.items():
            path = _local(_local(destination, root), relative)
            _no_links(path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    _check_roots(destination, roots)
    (destination / "materialization.json").write_bytes(_json_bytes(manifest))
    return validate_materialization(destination)


def validate_materialization(destination: Path) -> dict:
    """Offline verification; raise ValueError on missing, extra, or changed data."""
    destination = Path(destination).absolute()
    _no_links(destination)
    try:
        path = destination / "materialization.json"
        _no_links(path)
        manifest = json.loads(path.read_bytes())
        expected, roots = _recipe(destination, offline=True)
        if manifest != expected:
            raise ValueError("Manifest differs from the pinned materialization recipe")
        _check_roots(destination, roots)
        return manifest
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid frozen materialization: {exc}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--validate", action="store_true", help="Validate offline without downloading")
    args = parser.parse_args()
    manifest = (
        validate_materialization(args.destination) if args.validate
        else materialize_experiment(args.destination)
    )
    print(json.dumps({
        "scenario": manifest["scenario"],
        "source_files": len(manifest["source"]["files"]),
        "treatment_files": {arm: len(item["files"]) for arm, item in manifest["treatments"].items()},
        "manifest": str(args.destination / "materialization.json"),
    }, indent=2))


if __name__ == "__main__":
    main()
