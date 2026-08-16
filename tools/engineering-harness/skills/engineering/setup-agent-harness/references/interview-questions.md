# Interview Questions

Ask only for facts that cannot be discovered from the repository.

## Required Questions

Ask required questions with `request_user_input` when available. If it is not available, ask the same choices with numbered options in normal chat and wait for the user's answer.

Do not write structure-affecting files before these questions are answered.

Ask one decision at a time. Before each question, include a short explainer:

- What this decision controls.
- Why the harness needs it.
- What changes if the user picks differently.
- The recommended default based on discovered repo facts.

- Existing docs or agent config were found. Which adoption strategy should setup use?
  - Reference only: do not create competing structure, only map existing docs.
  - Hybrid: create harness entry/index files that reference existing docs. Recommended default.
  - Migrate: rewrite entry maps and move/rename/delete legacy docs into the new structure. Requires explicit confirmation.
- Existing agent surfaces were found. Which surfaces should setup manage?
  - Codex only: manage `AGENTS.md`; preserve other agent files.
  - Existing surfaces: update all detected agent entry files that the user confirms.
  - Record only: record other agent surfaces in the migration map but do not modify them.
- Legacy `CONTEXT.md` was found. How should setup handle it?
  - Delete after migrating useful content into structured docs.
  - Replace with a deprecated redirect.
  - Keep in place and only map it from harness docs.
- If `Migrate` is selected, confirm entry-map rewrites.
  - Rewrite `AGENTS.md` into a short agent entry map.
  - Rewrite or create `ARCHITECTURE.md` as an architecture entry map.
  - Update old agent config references away from legacy context.
- Which project type is this: app, library, monorepo, design system, or mixed?
- Is Figma used as a source of design truth?
- Does the Figma workflow use variables, published components, Code Connect, or dev resources?
- What is the preferred code search capability: codebase-memory, Sourcegraph, IDE/LSP, or plain search?
- Are UI changes expected to include screenshot/browser verification?
- Which issue or planning system should long-running agent work use?

## Design & Figma Questions

Ask this section only when the project has UI, design-system, or Figma work.

- What is the design source of truth?
  - Figma.
  - Storybook or component docs.
  - Existing UI only.
  - No stable design source.
- How should Figma be treated?
  - Source of truth.
  - Strong reference.
  - Loose visual reference.
- Should agents avoid large top-level frames and ask for specific component/section nodes?
- Are Figma variables/styles expected to map to project tokens?
- Are Figma components expected to map to code components or Code Connect?
- How should icons, SVGs, and exported images be handled?
- What visual evidence is required after Figma-to-code work?

## Optional Questions

- Are there security, reliability, accessibility, or performance standards that already exist outside the repo?
- Should external references be copied locally or linked only?
- Should generated project facts be committed?
- If migration is selected, should old paths receive deprecation notes or compatibility indexes when they are not deleted?
