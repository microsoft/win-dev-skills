# Support

> **Preview project.** This repo ships **win-dev-skills** as a v0.x preview. Skill names, `SKILL.md` format, agent configuration, and the plugin layout may change before v1.0. We do not yet make backward-compatibility guarantees.

## How to file issues and get help

This project uses GitHub Issues to track bugs and feature requests. Please search the existing issues before filing new issues to avoid duplicates.

### Filing Issues

We have specific issue templates to help you provide the right information:

- **[Bug Report](https://github.com/microsoft/win-dev-skills/issues/new?template=bug-report.yml)** - Report something that isn't working correctly
- **[Feature Request](https://github.com/microsoft/win-dev-skills/issues/new?template=feature_request.yml)** - Suggest a new feature, skill, or enhancement
- **[Documentation Issue](https://github.com/microsoft/win-dev-skills/issues/new?template=documentation.yml)** - Report a problem with a `SKILL.md`, README, or other docs
- **[General Issues](https://github.com/microsoft/win-dev-skills/issues)** - File any other type of issue or browse existing issues

Please ensure that you are not filing a duplicate issue by searching existing issues first.

For bug reports involving an agent run, attaching a `session-report.md` produced by the **`winui-session-report`** skill is the single most useful piece of information you can include.

### Getting Help

For help and questions about using this project:

1. Read the [README](./README.md) for setup and quick-start instructions.
2. Check the relevant skill's `SKILL.md` under [`plugins/winui/skills/`](./plugins/winui/skills/) for skill-specific guidance.
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

Support for **win-dev-skills** is limited to the resources listed above. This is an open-source preview project maintained by Microsoft, and community contributions are welcome.
