---
name: orchestration
description: 'Multi-agent orchestration workflow for building WinUI 3 apps. Contains pipeline logic, quality gates, agent prompt templates, and artifact schemas. Used by the winui3-orchestrator agent.'
---

## Quick Reference

- **Pipeline**: Analyzer → Designer → Design Reviewer → Architect → Builder → Code Reviewer → Tester
- **Artifacts**: Saved to `<project>/.winui-orchestration/` as structured markdown
- **Quality gates**: Orchestrator validates each artifact before passing to next agent
- **Iteration limits**: Design review (2), Code review (2), Test→Build (3)
- **Workflow variants**: New app, Convert app, Add feature, Fix bug, Polish

---

## Workflow Routing

| User Intent | Pipeline | Skip |
|------------|---------|------|
| New app from description | Full pipeline | — |
| Convert from Electron/WPF/web | Full pipeline (Analyzer inspects source) | — |
| Add UI feature | Analyzer → Designer → Architect → Builder → Tester | Design Reviewer, Code Reviewer (optional) |
| Add non-UI feature | Analyzer → Architect → Builder → Tester | Designer, Design Reviewer |
| Fix bug | Builder → Tester | All analysis/design agents |
| Polish/iterate | Tester → Builder → Tester | All analysis/design agents |

## Quality Gate Criteria

### Post-Analyzer
- Features described as behavior, not appearance
- Integration points identified
- For convert-app: "What NOT to Copy" section present
- **Action**: Present to user for confirmation

### Post-Designer → Design Reviewer
- Spawn Design Reviewer agent (checklist-based validation)
- If NEEDS REVISION: return to Designer (max 2 cycles)

### Post-Architect
- Project structure specified
- NuGet packages listed with rationale
- MVVM design documented
- API usage patterns described

### Post-Builder
- App builds successfully (zero errors)
- App launches via `winapp run`
- If build fails: return to Builder with errors (max 2 cycles)

### Post-Code Reviewer
- If NEEDS FIXES: return to Builder (max 2 cycles)
- If APPROVED: proceed to Tester

### Post-Tester
- If FAIL with blockers: return to Builder with test-report (max 3 cycles)
- If PASS: report success to user

## Reference Docs

| File | Contents |
|------|----------|
| `references/artifact-schemas.md` | Markdown templates for all 6 artifact types |
| `references/designer-knowledge-bundle.md` | Complete design knowledge for the Designer agent |
| `references/architect-knowledge-bundle.md` | Complete architecture knowledge for the Architect agent |
| `references/builder-knowledge-bundle.md` | Build workflow, error recovery, template handling, winapp/dotnet usage |
| `references/code-reviewer-knowledge-bundle.md` | Quality/security/accessibility checklists |
| `references/tester-knowledge-bundle.md` | Visual and functional test methodology |
| `references/agent-prompts.md` | Prompt templates for all specialist agents |
