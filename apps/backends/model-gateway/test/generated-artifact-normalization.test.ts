import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentGrammarObservationCategory,
  AgentObservationSeverity,
  normalizeGeneratedAgentArtifactDocument,
  validateAgentArtifactDocumentSemantics,
  type AgentGrammarAnalysisDocument,
} from "@sylis/agent-contracts";
import { describe, expect, it } from "vitest";

function grammarDocument(
  sourceText = "She walks.",
): AgentGrammarAnalysisDocument {
  return {
    schemaVersion: AgentArtifactSchemaVersion.GRAMMAR_ANALYSIS_V1,
    artifactKind: AgentArtifactKind.GRAMMAR_ANALYSIS,
    source: { languageTag: "en", text: sourceText },
    summary: "Grammar analysis.",
    observations: [
      {
        localId: "observation:1",
        category: AgentGrammarObservationCategory.AGREEMENT,
        severity: AgentObservationSeverity.INFO,
        span: { start: 0, end: 5, text: "walks" },
        rule: "Third-person singular verbs take -s.",
        evidence: "The subject is she.",
        explanation: "Walk becomes walks.",
        suggestion: null,
      },
    ],
    revision: { text: sourceText, changes: [] },
  };
}

describe("generated artifact normalization", () => {
  it("recomputes a unique grammar span from its source text", () => {
    const normalized = normalizeGeneratedAgentArtifactDocument(
      grammarDocument(),
    ) as AgentGrammarAnalysisDocument;

    expect(normalized.observations[0]!.span).toEqual({
      start: 4,
      end: 9,
      text: "walks",
    });
    expect(validateAgentArtifactDocumentSemantics(normalized)).toEqual([]);
  });

  it("drops a grammar span when its source text is ambiguous", () => {
    const document = grammarDocument("had had");
    document.observations[0]!.span = { start: 1, end: 4, text: "had" };

    const normalized = normalizeGeneratedAgentArtifactDocument(
      document,
    ) as AgentGrammarAnalysisDocument;

    expect(normalized.observations[0]!.span).toBeNull();
    expect(validateAgentArtifactDocumentSemantics(normalized)).toEqual([]);
  });
});
