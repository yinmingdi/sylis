# Figma

## When to Use Figma MCP

Use Figma MCP when the task includes a Figma URL, design implementation, UI restoration, component mapping, or design-system work.

## Figma File Expectations

Prefer Figma files that use:

- Well-named frames, layers, components, variants, and sections.
- Auto Layout for layout intent.
- Variables and styles for reusable design tokens.
- Published components or Code Connect when available.
- Dev resources or annotations for implementation notes.

If the Figma file is not structured this way, use the design as visual evidence and rely more heavily on code search and project design rules.

## Required Flow

1. Prefer a specific component, section, or node URL instead of a large page-level frame.
2. Read design context from Figma.
3. If token fidelity matters, explicitly request variables, styles, component names, and relevant values.
4. Capture or request a screenshot as the visual baseline.
5. Download assets only when they are necessary and semantically appropriate.
6. Retrieve similar code before implementing.
7. Map design tokens, icons, assets, and layout to project conventions.
8. Translate MCP output into the project's framework, component, and styling conventions.
9. Render the implementation.
10. Validate with browser/screenshot sensors.

## Prompting Rules

When asking an agent to implement from Figma, include:

- Target framework and styling system.
- Existing component/library preferences.
- Whether to modify existing files or create new files.
- The exact Figma node URL when possible.
- Required viewport or responsive states.
- Required validation evidence.

Do not ask the agent to "implement the whole page" from a very large frame unless the work is intentionally broad and the expected fidelity is limited.

## Tool Triggering

Agents may need to explicitly trigger:

- Design context for the selected node.
- Metadata first when the frame is large.
- Variables/styles when token mapping matters.
- Screenshot for visual comparison.
- Asset download only for real image assets, complex illustrations, or required media.

## Common Risks

- Large frames can produce slow, incomplete, or noisy MCP responses.
- Missing line-height or typography metadata can distort vertical alignment.
- SVGs copied into the wrong layer.
- Design components not matching code components.
- Visual similarity mistaken for semantic reuse.
- MCP-generated code may not match the project's framework, component system, or style rules.

## Large Frame Policy

Avoid using very large frames as the primary MCP target. Prefer:

- Component node.
- Section frame.
- Single panel or modal.
- Specific repeated item.
- Narrow layout region.

If only a large frame is available, first inspect metadata and ask for a smaller target before implementing.
