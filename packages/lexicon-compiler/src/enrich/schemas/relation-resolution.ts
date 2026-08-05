export interface RelationResolutionCandidate {
  decision: "RESOLVED" | "UNRESOLVED";
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
    decision: { type: "string", enum: ["RESOLVED", "UNRESOLVED"] },
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
