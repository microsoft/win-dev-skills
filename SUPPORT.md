# Support

> **The `winui` and `winappcli` plugins are authored in [microsoft/winappCli](https://github.com/microsoft/winappCli); file their issues and PRs there.**

## How to file issues and get help

This project uses GitHub Issues to track bugs and feature requests. Please search the existing issues before filing new issues to avoid duplicates.

### Filing Issues

We have specific issue templates to help you provide the right information:

- **[Bug Report](https://github.com/microsoft/win-dev-skills/issues/new?template=bug-report.yml)** - Report something that isn't working correctly
- **[Feature Request](https://github.com/microsoft/win-dev-skills/issues/new?template=feature_request.yml)** - Suggest a new feature, skill, or enhancement
- **[Documentation Issue](https://github.com/microsoft/win-dev-skills/issues/new?template=documentation.yml)** - Report a problem with a `SKILL.md`, README, or other docs
- **[General Issues](https://github.com/microsoft/win-dev-skills/issues)** - File any other type of issue or browse existing issues

Please ensure that you are not filing a duplicate issue by searching existing issues first.

For WinUI agent-run problems, file the issue in microsoft/winappCli and attach a `session-report.md` from the **`winui-session-report`** skill.

### Getting Help

For help and questions about using this project:

1. Read the [README](./README.md) for setup and quick-start instructions.
2. For skill guidance, see the `winui` and `winappcli` skills in [`microsoft/winappCli`](https://github.com/microsoft/winappCli/tree/main/plugins).
3. Browse existing [GitHub Issues](https://github.com/microsoft/win-dev-skills/issues) for similar questions.
4. File a new issue with the `question` label if you need additional help.

## Issue Triage

Our team actively monitors and manages issues in this repository.

- **Bug Reports and questions**: Critical bugs are prioritized and addressed as quickly as possible. Questions will be monitored.
- **Feature Requests**: Evaluated during regular planning cycles. Feature requests for new skills are tracked separately and may be picked up by the community.

### When a New Issue is Created

All new issues are automatically reviewed and tagged with appropriate labels:

- **Type**: `bug`, `enhancement`, `question`, `documentation`
- **Area**: per-skill labels (e.g., `skill: winui-dev-workflow`, `skill: winui-design`) or `area: agent`, `area: tools`, `area: plugin`
- **Priority**: `good first issue`, `help wanted` (for community contribution opportunities)

### Investigation

As we investigate and work on issues, additional labels are applied:

- **`known-issue`** - Applied to issues the team has identified and is tracking
- **`needs-author-response`** - Waiting on the issue author for clarification or additional information (used by the [stale-issues workflow](./.github/workflows/stale-issues.yml))
- **`needs:docs`** - Issues that require documentation updates or clarification
- **`dependencies`** - Issues related to external dependency updates

### Closing Issues

When closing issues, we apply final classification labels:

- **`duplicate`** - Issue already reported elsewhere (includes link to original)
- **`invalid`** - Issue doesn't seem right or cannot be reproduced
- **`wontfix`** - Issue will not be addressed (with explanation in comments)

## Contributing

Contributions are welcome. See the [README](./README.md) for an overview of the plugin layout and how skills are structured, and the [PR template](./.github/PULL_REQUEST_TEMPLATE.md) for the checklist your PR should satisfy.

## Microsoft Support Policy

Support for **win-dev-skills** is limited to the resources listed above. This is an open-source project maintained by Microsoft, and community contributions are welcome.
