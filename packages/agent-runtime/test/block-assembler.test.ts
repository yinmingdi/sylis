import { AgentMessageBlockKind } from "@sylis/agent-contracts";
import { describe, expect, it } from "vitest";

import { BlockAssembler } from "../src/block-assembler";

describe("BlockAssembler streaming boundaries", () => {
  it("buffers an unfinished fenced-code opening line", () => {
    const assembler = new BlockAssembler();

    expect(assembler.assembleStreaming(0, "```")).toEqual([]);
    expect(assembler.assembleStreaming(0, "```ts")).toEqual([]);
    expect(
      assembler.assembleStreaming(0, "```ts\nconst value = 1;"),
    ).toMatchObject([
      {
        kind: AgentMessageBlockKind.CODE,
        modelPosition: 0,
        modelSubPosition: 0,
        language: "ts",
      },
    ]);
  });

  it("does not retroactively turn a streamed paragraph into a Setext heading", () => {
    const assembler = new BlockAssembler();

    expect(assembler.assemble(0, "Title\n---").map(({ kind }) => kind)).toEqual(
      [AgentMessageBlockKind.PARAGRAPH, AgentMessageBlockKind.DIVIDER],
    );
  });
});
