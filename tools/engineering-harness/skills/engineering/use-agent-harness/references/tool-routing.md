# Tool Routing

Tools are capability sources. Use them according to the task.

## Design and Figma Tasks

Use:

- Figma MCP for design facts.
- Code search for existing components and patterns.
- Browser/DevTools for rendered validation.

Read:

- `docs/design/figma.md`
- `docs/design/design-system.md`
- `docs/quality/verification-gates.md`

Required routing:

1. Prefer a node-specific Figma URL over a full page or large frame.
2. If the target is large, inspect metadata first and narrow the target.
3. Get design context for the selected node.
4. Explicitly request variables/styles when token mapping matters.
5. Request a screenshot for visual baseline when fidelity matters.
6. Download assets only when necessary.
7. Search code for similar components, pages, icons, and layout patterns.
8. Implement using the project framework and style system, not raw MCP code style.
9. Validate rendered UI with browser/screenshot sensors.

Do not treat Figma MCP output as final code. Treat it as design evidence that must be translated into project conventions.

## Code Discovery

Use code memory, Sourcegraph, LSP, or text search to find:

- Similar implementations.
- Call chains.
- Impacted modules.
- Existing tests.

## Runtime Debugging

Use:

- DevTools/browser.
- Logs.
- Network/console output.
- Code search.
- Focused tests.

## External Knowledge

Use official docs or web search when facts may be current, external, or high-risk.
