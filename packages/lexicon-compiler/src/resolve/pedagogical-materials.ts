import type { PedagogicalMaterialKindCode } from "@sylis/lexicon-contracts";

export type MaterialPlanningStatus =
  | "PRESENT"
  | "MISSING"
  | "NOT_APPLICABLE"
  | "REJECTED";

export interface MaterialPlanningInput {
  kind: PedagogicalMaterialKindCode;
  hasSenseEvidence?: boolean;
  hasMorphologyGraph?: boolean;
  hasSourceBackedCulturalEvidence?: boolean;
  generatedProvenance?: boolean;
  hasTypedBlocks?: boolean;
  hasTargetMention?: boolean;
  hasTranslation?: boolean;
  passedSafetyCheck?: boolean;
}

export interface MaterialPlanningDecision {
  kind: PedagogicalMaterialKindCode;
  status: MaterialPlanningStatus;
  reason: string;
}

export function planPedagogicalMaterial(
  input: MaterialPlanningInput,
): MaterialPlanningDecision {
  if (input.hasTypedBlocks === false) {
    return {
      kind: input.kind,
      status: "REJECTED",
      reason: "TYPED_BLOCKS_REQUIRED",
    };
  }
  switch (input.kind) {
    case "LEARNER_EXPLANATION":
      return input.hasSenseEvidence
        ? {
            kind: input.kind,
            status: "PRESENT",
            reason: "SENSE_EVIDENCE_PRESENT",
          }
        : {
            kind: input.kind,
            status: "MISSING",
            reason: "SENSE_EVIDENCE_MISSING",
          };
    case "MORPHOLOGY_WALKTHROUGH":
      return input.hasMorphologyGraph
        ? {
            kind: input.kind,
            status: "PRESENT",
            reason: "MORPHOLOGY_GRAPH_PRESENT",
          }
        : {
            kind: input.kind,
            status: "NOT_APPLICABLE",
            reason: "NO_VERIFIED_ANALYSIS",
          };
    case "CULTURAL_CONTEXT":
      return input.hasSourceBackedCulturalEvidence
        ? {
            kind: input.kind,
            status: "PRESENT",
            reason: "CITED_CULTURAL_EVIDENCE",
          }
        : {
            kind: input.kind,
            status: "NOT_APPLICABLE",
            reason: "NO_CULTURAL_EVIDENCE",
          };
    case "MNEMONIC":
      return input.generatedProvenance && input.passedSafetyCheck
        ? {
            kind: input.kind,
            status: "PRESENT",
            reason: "GENERATED_AND_VERIFIED",
          }
        : {
            kind: input.kind,
            status: input.generatedProvenance ? "REJECTED" : "MISSING",
            reason: input.generatedProvenance
              ? "SAFETY_CHECK_FAILED"
              : "GENERATION_REQUIRED",
          };
    case "MICRO_STORY":
      return input.generatedProvenance &&
        input.hasTargetMention &&
        input.hasTranslation &&
        input.passedSafetyCheck
        ? {
            kind: input.kind,
            status: "PRESENT",
            reason: "STORY_CONTRACT_SATISFIED",
          }
        : {
            kind: input.kind,
            status: input.generatedProvenance ? "REJECTED" : "MISSING",
            reason: input.generatedProvenance
              ? "STORY_CONTRACT_FAILED"
              : "GENERATION_REQUIRED",
          };
  }
}
