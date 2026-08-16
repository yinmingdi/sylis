import type { PedagogicalMaterialKindCode } from "@sylis/lexicon-artifact";

export enum MaterialPlanningStatus {
  PRESENT = "PRESENT",
  MISSING = "MISSING",
  NOT_APPLICABLE = "NOT_APPLICABLE",
  REJECTED = "REJECTED",
}

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
      status: MaterialPlanningStatus.REJECTED,
      reason: "TYPED_BLOCKS_REQUIRED",
    };
  }
  switch (input.kind) {
    case "LEARNER_EXPLANATION":
      return input.hasSenseEvidence
        ? {
            kind: input.kind,
            status: MaterialPlanningStatus.PRESENT,
            reason: "SENSE_EVIDENCE_PRESENT",
          }
        : {
            kind: input.kind,
            status: MaterialPlanningStatus.MISSING,
            reason: "SENSE_EVIDENCE_MISSING",
          };
    case "MORPHOLOGY_WALKTHROUGH":
      return input.hasMorphologyGraph
        ? {
            kind: input.kind,
            status: MaterialPlanningStatus.PRESENT,
            reason: "MORPHOLOGY_GRAPH_PRESENT",
          }
        : {
            kind: input.kind,
            status: MaterialPlanningStatus.NOT_APPLICABLE,
            reason: "NO_VERIFIED_ANALYSIS",
          };
    case "CULTURAL_CONTEXT":
      return input.hasSourceBackedCulturalEvidence
        ? {
            kind: input.kind,
            status: MaterialPlanningStatus.PRESENT,
            reason: "CITED_CULTURAL_EVIDENCE",
          }
        : {
            kind: input.kind,
            status: MaterialPlanningStatus.NOT_APPLICABLE,
            reason: "NO_CULTURAL_EVIDENCE",
          };
    case "MNEMONIC":
      return input.generatedProvenance && input.passedSafetyCheck
        ? {
            kind: input.kind,
            status: MaterialPlanningStatus.PRESENT,
            reason: "GENERATED_AND_VERIFIED",
          }
        : {
            kind: input.kind,
            status: input.generatedProvenance
              ? MaterialPlanningStatus.REJECTED
              : MaterialPlanningStatus.MISSING,
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
            status: MaterialPlanningStatus.PRESENT,
            reason: "STORY_CONTRACT_SATISFIED",
          }
        : {
            kind: input.kind,
            status: input.generatedProvenance
              ? MaterialPlanningStatus.REJECTED
              : MaterialPlanningStatus.MISSING,
            reason: input.generatedProvenance
              ? "STORY_CONTRACT_FAILED"
              : "GENERATION_REQUIRED",
          };
  }
}
