import {
  LexicalAnnotationTargetKind,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { LexicalTargetPresentationService } from "./lexical-target-presentation.service";

describe("LexicalTargetPresentationService", () => {
  it("does not query models for absent target kinds", async () => {
    const database = {
      headwordRevision: {
        findMany: vi.fn(async () => [
          {
            releaseId: "release-1",
            headwordId: "headword-1",
            displayText: "run",
          },
        ]),
      },
      lexicalEntryRevision: { findMany: vi.fn() },
      lexicalSenseRevision: { findMany: vi.fn() },
      collocation: { findMany: vi.fn() },
      learningObjectiveRevision: { findMany: vi.fn() },
    } as unknown as SylisDatabase;
    const service = new LexicalTargetPresentationService(database);

    const result = await service.resolve([
      {
        releaseId: "release-1",
        targetKind: LexicalAnnotationTargetKind.HEADWORD,
        targetId: "headword-1",
      },
    ]);

    expect(result.get("release-1:HEADWORD:headword-1")).toEqual({
      displayText: "run",
      detail: null,
    });
    expect(database.lexicalEntryRevision.findMany).not.toHaveBeenCalled();
    expect(database.lexicalSenseRevision.findMany).not.toHaveBeenCalled();
    expect(database.collocation.findMany).not.toHaveBeenCalled();
    expect(database.learningObjectiveRevision.findMany).not.toHaveBeenCalled();
  });

  it("keeps the headword as the sense label and uses translation as detail", async () => {
    const database = {
      headwordRevision: { findMany: vi.fn() },
      lexicalEntryRevision: { findMany: vi.fn() },
      lexicalSenseRevision: {
        findMany: vi.fn(async () => [
          {
            releaseId: "release-1",
            senseId: "sense-1",
            entryRevision: { headwordRevision: { displayText: "run" } },
            definitions: [{ text: "move quickly on foot" }],
            translations: [{ text: "跑" }],
          },
        ]),
      },
      collocation: { findMany: vi.fn() },
      learningObjectiveRevision: { findMany: vi.fn() },
    } as unknown as SylisDatabase;
    const service = new LexicalTargetPresentationService(database);

    const result = await service.resolve([
      {
        releaseId: "release-1",
        targetKind: LexicalAnnotationTargetKind.SENSE,
        targetId: "sense-1",
      },
    ]);

    expect(result.get("release-1:SENSE:sense-1")).toEqual({
      displayText: "run",
      detail: "跑",
    });
  });
});
