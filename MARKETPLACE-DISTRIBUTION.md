# Marketplace distribution specification

Last verified: 2026-08-26

This document defines how the WinUI plugin is distributed through the major
public agent-plugin catalogs and what is required to publish or update each
listing. Track execution and listing links in
[issue #158](https://github.com/microsoft/win-dev-skills/issues/158).

Marketplace behavior changes quickly. Recheck every linked vendor requirement
before submitting a release.

## Scope

This specification covers:

- GitHub Copilot, including the Copilot app **Customize** tab.
- Claude Code.
- Cursor.
- OpenAI Codex and ChatGPT.

OpenCode and OpenClaw remain supported through the installation paths in the
[README](README.md), but they are outside this specification until they
document a reviewed public listing program.

## Terms

These states are different and must not be presented as interchangeable:

| State | Meaning |
|---|---|
| Compatible | The client can load the package format. |
| Directly installable | A user can add this repository or its marketplace and install the plugin. |
| Publicly listed | The plugin passed a vendor-specific intake and appears in that vendor's public catalog. |
| Featured | The vendor selected the listing for promoted placement. Publication does not guarantee this. |

[Agent Plugins 1.0](https://agent-plugins.org/specification) standardizes a
portable package for Agent Skills and MCP servers. It is not a marketplace,
submission program, approval, or promise of discoverability.

## Canonical package and adapters

The repository intentionally has two package roots:

```text
plugins/winui/                         Compatibility package
  .claude-plugin/plugin.json           Claude Code adapter
  .codex-plugin/plugin.json            OpenAI/Codex adapter
  agents/                              Claude Code agent copy
  openclaw.plugin.json                 OpenClaw adapter
  package.json                         OpenClaw package metadata
  agent-plugin/                        Agent Plugins 1.0 package
    plugin.json                        Portable manifest
    skills/                            Canonical skill source
    assets/                            Shared marketplace artwork
    com.github.copilot/agents/         Copilot-specific agent
```

Use these sources for publication:

| Consumer | Package source |
|---|---|
| GitHub Copilot and Agent Plugins clients | `plugins/winui/agent-plugin` |
| Claude Code direct install | `plugins/winui` |
| Cursor minimum portable submission | `plugins/winui/agent-plugin` |
| Codex repository marketplace | `plugins/winui` |
| OpenAI public upload | Generated skills-only bundle; do not upload the repository root |

Do not move Claude's `.claude-plugin/` or OpenAI's `.codex-plugin/` directory
into the portable package. Agent Plugins requires client-specific top-level
content to use a reverse-domain namespace, while those clients require their
dot-directory at the root they install.

## Release gate shared by every submission

Do not submit from `staging` or from a mutable feature branch. Complete this
gate first:

1. Promote `staging` to the released `main` branch.
2. Wait for and verify that the `auto-tag` workflow created the immutable
   `vX.Y.Z` tag at `main` HEAD, then record its full 40-character commit SHA.
3. Complete the required `backmerge/X.Y.Z` PR from `main` to `staging`.
4. Keep every manifest that exposes a version on the same semantic version.
   At minimum, include:
   - `plugins/winui/agent-plugin/plugin.json`
   - `.github/plugin/marketplace.json`
   - `.claude-plugin/marketplace.json`
   - `plugins/winui/.claude-plugin/plugin.json`
   - `plugins/winui/.codex-plugin/plugin.json`
   - Any future Cursor manifest
5. Validate the portable manifest and every canonical `SKILL.md`.
6. Run the repository build, tests, and binary-provenance checks.
7. Test installation from the released public repository, not a local path.
8. Use only public listing text, URLs, screenshots, test data, and support
   information.
9. Record the submitted version, tag, SHA, submission URL, date, and status in
   issue #158.

The current release helper synchronizes the portable and marketplace versions
but does not yet update the Claude and Codex adapter manifest versions. Fix
that before the first external submission by updating
`scripts/open-release-pr.ps1`, both version jobs in
`.github/workflows/release-policy.yml`, `RELEASING.md`, and `CONTRIBUTING.md`.
The Codex repository marketplace is only a source locator and has no version
field of its own.

## Distribution matrix

| Surface | Public discovery target | Current state | Publication mechanism | Update behavior |
|---|---|---|---|---|
| GitHub Copilot app and CLI | Awesome Copilot marketplace, shown in **Customize > Plugins** | Listed, but catalog metadata and package path need updating after the next release | PR updating the existing Awesome Copilot entry | Submit a focused PR for each released update |
| Claude Code | Anthropic plugin directory | Direct install works; not yet vendor-listed | Anthropic submission form | Approved source updates are mirrored automatically; bump the manifest version |
| Cursor | Cursor Marketplace, shown in **Customize** | Not listed; current binary-bearing package is ineligible under the published policy | Cursor publisher application after producing an eligible package | Every initial listing and update is manually reviewed |
| Codex and ChatGPT | OpenAI universal Plugins Directory | Codex repository marketplace works; public listing requires product guidance and a review-safe bundle | OpenAI plugin portal, **Skills only** | Upload, scan, review, and publish every new version |

## GitHub Copilot and the Customize tab

### How discovery works

The GitHub Copilot app's
[Customize tab](https://github.blog/changelog/2026-08-25-github-copilot-app-customize-tab-is-generally-available/)
shows **Featured**, **MCP**, **Plugins**, **Skills**, **Canvas**, and
**Installed**. The Plugins section reads the marketplaces configured in the
app. GitHub configures two marketplaces by default:

- [`github/copilot-plugins`](https://github.com/github/copilot-plugins)
- [`github/awesome-copilot`](https://github.com/github/awesome-copilot)

See [Customizing the GitHub Copilot app](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app)
and [Finding and installing plugins](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing).

There is no separate "submit to Customize" form. A plugin in a configured
marketplace can appear under **Customize > Plugins**.

Custom agents supplied by a plugin are selected through the app's agent
picker; they are not a separate public Customize catalog. Standalone
instructions are configured through app or repository settings, not through
the Plugins listing.

### Current state

`winui` is already listed in Awesome Copilot, originally added by
[github/awesome-copilot#1686](https://github.com/github/awesome-copilot/pull/1686).
That makes the plugin available through a default marketplace and eligible to
appear in the Copilot app's Plugins view.

The external catalog record still describes the older package. After the next
release it must be updated to:

- The new semantic version.
- `source.path: plugins/winui/agent-plugin`.
- The immutable `vX.Y.Z` tag.
- The tag's full commit SHA.

### Submission and update procedure

For a new external plugin, Awesome Copilot uses its
[external-plugin submission form](https://github.com/github/awesome-copilot/issues/new?template=external-plugin.yml).
Because `winui` already has a record, use the
[existing-listing update process](https://github.com/github/awesome-copilot/blob/main/CONTRIBUTING.md#updating-an-existing-external-plugin):

1. Fork `github/awesome-copilot`.
2. Update only the existing `winui` object in `plugins/external.json`.
3. Pin the released version, tag, full SHA, and portable package path.
4. Run the repository's documented validation:

   ```bash
   npm ci
   npm run plugin:validate
   npm run build
   ```

5. Open a focused PR and address `vally lint`, install-smoke-test, and
   maintainer feedback.
6. After merge, verify the plugin in the Copilot app under
   **Customize > Plugins**, filtered to **Awesome Copilot**.

Ordinary plugins do not require catalog artwork. The committed logo can still
be used in documentation. Awesome Copilot requires a specific preview image
only for Canvas extensions.

The **Featured** section is curated. No public nomination form or guaranteed
placement criteria are documented, so Featured placement is not an acceptance
criterion.

## Claude Code

### How discovery works

The repository already provides a self-hosted marketplace:

```powershell
claude plugin marketplace add microsoft/win-dev-skills
claude plugin install winui@win-dev-skills
```

This proves direct-install support, but users must already know the repository.
Vendor discoverability requires Anthropic's directory review.

Anthropic documents two submission forms:

- [Claude Console](https://platform.claude.com/plugins/submit), available to
  individual authors with the required Console role.
- [Claude.ai organization directory](https://claude.ai/admin-settings/directory/submissions/plugins/new),
  requiring a Team or Enterprise organization and directory-management access.

See [Submitting your plugin](https://claude.com/docs/plugins/submit).
Do not open a PR directly against an Anthropic marketplace repository.

Anthropic's public documentation has used both `claude-plugins-official` and
`claude-community` terminology for reviewed third-party entries. Treat the
submission form and its resulting status page as authoritative, and record the
final listing URL plus the exact post-publication marketplace name and install
command verified in Claude Code and Cowork.

### Required work

1. Align `plugins/winui/.claude-plugin/plugin.json` with the release version
   and include it in release-policy validation.
2. Keep the submission source at `plugins/winui`; this preserves both the
   Claude agent and the canonical nested skills.
3. Validate and test locally:

   ```powershell
   claude plugin validate ./plugins/winui --strict
   claude --plugin-dir ./plugins/winui
   ```

4. Verify the `winui-dev` agent and representative skills in the test session.
5. Submit the public GitHub repository and plugin subdirectory through one of
   the official forms.
6. Record review status and the final directory URL in issue #158.

Claude's published manifest schema does not define a `logo` or `icon` field.
The authenticated submission form may request presentation assets, but artwork
is not part of the portable Claude plugin manifest.

After approval, Anthropic says accepted source updates are mirrored
automatically. Continue bumping the explicit plugin version; changing source
without changing that version may not produce a client update.

## Cursor

### Accepted formats

Cursor accepts both the
[Agent Plugin format and Cursor-native plugins](https://cursor.com/docs/reference/plugins#supported-plugin-formats).

The minimum submission can use `plugins/winui/agent-plugin`, which gives Cursor
the eight portable skills. Agent Plugins 1.0 cannot express the `winui-dev`
custom agent. Because the plugin is nested in a multi-purpose repository, even
this option requires a repository-root `.cursor-plugin/marketplace.json` that
points its `winui` entry to `./plugins/winui/agent-plugin`.

For full feature parity, add a Cursor-native adapter:

```text
.cursor-plugin/marketplace.json
plugins/winui/.cursor-plugin/plugin.json
```

The native manifest can point to the canonical skills and a Cursor-compatible
agent without changing the portable package. Do not duplicate the skill
payloads.

### Submission procedure

1. Decide whether the first listing is skills-only through the portable
   package or waits for a Cursor-native agent adapter.
2. Add `.cursor-plugin/marketplace.json` for either option:
   - Portable source: `./plugins/winui/agent-plugin`
   - Native source: `./plugins/winui`
3. If using a native adapter, include display name, description, version,
   author/publisher, repository, license, keywords, category, component paths,
   and a relative logo path.
4. Validate against Cursor's published schemas or adopt the validator from
   [`cursor/plugin-template`](https://github.com/cursor/plugin-template).
5. Test by linking or copying the package to:

   ```text
   ~/.cursor/plugins/local/winui
   ```

   Reload Cursor and verify the content in Cursor's **Customize** UI.
   Use `plugins/winui/agent-plugin` for the portable option and
   `plugins/winui` for the native option.
6. Submit the public repository through
   [Cursor's publisher application](https://cursor.com/marketplace/publish).
7. During onboarding, confirm the source branch/ref and the process for
   publishing later versions.

Cursor documents manual security, data-handling, and quality review for both
new listings and updates. Source changes are not automatically published.
See [Marketplace security](https://cursor.com/help/security-and-privacy/marketplace-security).

A logo is optional but recommended. Use the committed SVG through a
plugin-relative path.

### Current eligibility blocker

The canonical skills include a Windows executable and analyzer DLL. Cursor's
marketplace security guidance states that marketplace plugins do not ship
binaries. The current portable package is therefore not eligible under the
published policy.

Before applying, either:

- Produce and test a binary-free Cursor distribution.
- Replace the embedded payloads with signed tools installed from a trusted
  package registry.
- Obtain written guidance from Cursor that documents another accepted
  distribution model.

Record the resolution in issue #158; do not submit the current binary-bearing
package and assume an exception.

## OpenAI Codex and ChatGPT

### How discovery works

Codex already supports the repository marketplace under
`.agents/plugins/marketplace.json`. That is direct installation, not a public
OpenAI-reviewed listing.

OpenAI now uses one
[universal Plugins Directory](https://developers.openai.com/plugins/concepts/plugins)
for ChatGPT and Codex. There is no separate Codex-only public submission.
The current package is a **Skills only** candidate because it has skills but no
production remote MCP server.

Public submission uses the
[OpenAI plugin portal](https://platform.openai.com/plugins). Publication as
Microsoft requires a Microsoft-controlled OpenAI Platform organization,
Apps Management write access, and matching business verification. See
[Submit plugins](https://developers.openai.com/plugins/deploy/submission).

### Required publication bundle

Do not upload the repository or compatibility package directly. Generate a
clean ZIP containing one plugin root:

```text
winui/
  .codex-plugin/plugin.json
  skills/
  assets/
```

The bundle should copy the canonical skills and artwork at build time. It must
not duplicate the source of truth in the repository. The bundle generator must
also produce a submission-specific manifest with paths matching the flattened
archive:

```json
{
  "skills": "./skills/",
  "interface": {
    "logo": "./assets/logo-512.png",
    "composerIcon": "./assets/logo.svg"
  }
}
```

Before upload:

1. Align the Codex manifest version with the release.
2. Meet the current directory metadata limits, including:
   - Display name no longer than 30 characters.
   - Short description no longer than 30 characters.
   - At most three starter prompts.
   - Public website, support, privacy-policy, and terms URLs.
3. Point `interface.logo` and `interface.composerIcon` to square bundled
   artwork.
4. Validate the generated ZIP itself. Confirm it contains exactly one plugin
   root, all manifest-relative paths resolve, and no repository-only files are
   present.
5. Prepare positive and negative review test cases, release notes, availability,
   and policy attestations.
6. Upload through **Create plugin > Skills only**, resolve all scan findings,
   submit for review, and explicitly publish after approval.

See the [submission error reference](https://developers.openai.com/plugins/deploy/submission-errors)
for current archive, metadata, prompt, and image constraints.

### Eligibility and privacy risks

Several skills depend on local Windows execution, filesystem access, PowerShell,
UAC, desktop application control, or bundled binaries. OpenAI's
[Claude-plugin migration guide](https://developers.openai.com/plugins/guides/submit-claude-plugin)
directs authors to contact their OpenAI partner before submission when local
execution, arbitrary file access, hardware/application access, offline
operation, or inbound messages are central to the product.

Obtain written product guidance before preparing the final upload. Provide an
inventory of:

- Commands and executables each skill may run.
- Files and environment data each skill may access.
- UAC and registry behavior.
- Desktop UI automation behavior.
- Binary provenance and signing.

The directory is shared, but capabilities can still be product-specific.
Before submission, decide and test which skills support Codex, ChatGPT, or
both. Restrict local-execution skills to Codex through OpenAI's per-skill
product policy where supported, exclude them from the public bundle, or
redesign them to provide useful behavior on ChatGPT's non-Windows surfaces.
Test every claimed product and operating-system combination in a clean
environment.

`winui-session-report` is the highest privacy risk because it reads local
session transcripts and can include prompts, paths, and command output. For the
first public OpenAI bundle, either:

- Exclude it.
- Redesign it around an explicitly user-selected input with strict
  data-minimization guarantees.
- Or include it only after OpenAI explicitly approves the behavior.

OpenAI updates are not pulled from GitHub. Every new version requires a new
upload, security scan, review, approval, and publish action.

## Submission order

Use this order after the shared release gate:

1. **GitHub Copilot:** update the existing Awesome Copilot record. This is the
   fastest route and is also how the plugin appears in the Copilot app
   Customize tab.
2. **Claude Code:** validate and submit the already-supported compatibility
   package.
3. **Cursor:** obtain a binary-policy answer, choose portable versus native
   packaging, then apply.
4. **OpenAI:** obtain partner guidance, create a reduced review-safe bundle,
   and use the universal plugin portal.

## Completion criteria

Distribution work is complete when:

- A released `main` commit and immutable tag contain the submitted package.
- Every submitted manifest reports the same version.
- GitHub's Awesome Copilot entry points to the portable package and immutable
  release.
- Claude and Cursor submission statuses and listing URLs are recorded.
- OpenAI eligibility is resolved in writing and, if eligible, the reviewed
  public bundle is published.
- Installation instructions and listing URLs are reflected in the README and
  Microsoft Learn documentation.
- Every future release has an owner and documented update procedure for each
  published catalog.
