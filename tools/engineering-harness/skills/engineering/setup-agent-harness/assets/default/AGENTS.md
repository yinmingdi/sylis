# AGENTS.md

This file is the entry map for humans and coding agents working in {{PROJECT_NAME}}. Keep it concise; put detailed project knowledge in the linked documents.

## Start Here

- Architecture: `ARCHITECTURE.md`
- Product/domain language: `docs/product/domain.md`
- Harness protocol: `docs/agent-harness.md`
- Tool capabilities: `docs/generated/tool-capabilities.md`
- Commands: `docs/generated/command-registry.md`
- Verification gates: `docs/quality/verification-gates.md`

## Engineering Loop

Core loop:

```text
Orient -> Retrieve -> Plan -> Act -> Observe -> Evaluate -> Learn -> Govern
```

Before implementation, route the task, retrieve similar code, define validation evidence, and verify with available project sensors.

## Working Rules

- Preserve existing user changes and inspect the working tree before editing.
- Keep changes minimal and do not refactor unrelated code.
- Prefer repository-provided search and knowledge tools before broad file scans.
- Parallelize independent read-only work; serialize edits that touch the same files or code region.
- Do not treat a started command as a passing check. Wait for completion and report the result.
- Support important conclusions with file, symbol, command, diff, or test evidence.
- Update generated harness facts through the harness command instead of editing them by hand.

## Completion Gate

A task is complete only after its relevant verification commands finish successfully, the final diff is reviewed, and unresolved risks are stated explicitly.
