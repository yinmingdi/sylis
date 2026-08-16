export enum RelationResolutionDecision {
  RESOLVED = "RESOLVED",
  UNRESOLVED = "UNRESOLVED",
}

export interface RelationResolutionCandidate {
  decision: RelationResolutionDecision;
  target: {
    sourceRecordId: string;
    sourceSenseKey: string;
  } | null;
  reasonCode: string;
}

export const relationResolutionCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "target", "reasonCode"],
  properties: {
    decision: {
      type: "string",
      enum: Object.values(RelationResolutionDecision),
    },
    target: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["sourceRecordId", "sourceSenseKey"],
          properties: {
            sourceRecordId: { type: "string", minLength: 1, maxLength: 160 },
            sourceSenseKey: { type: "string", minLength: 1, maxLength: 240 },
          },
        },
        { type: "null" },
      ],
    },
    reasonCode: { type: "string", minLength: 1, maxLength: 120 },
  },
} as const;
