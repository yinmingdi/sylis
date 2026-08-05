export interface SenseAlignmentCandidate {
  groups: Array<{
    localId: string;
    members: Array<{
      sourceRecordId: string;
      sourceSenseKey: string;
    }>;
    reasonCode: string;
  }>;
}

export const senseAlignmentCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["groups"],
  properties: {
    groups: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["localId", "members", "reasonCode"],
        properties: {
          localId: { type: "string", pattern: "^sense:[1-9][0-9]*$" },
          members: {
            type: "array",
            minItems: 1,
            maxItems: 40,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sourceRecordId", "sourceSenseKey"],
              properties: {
                sourceRecordId: {
                  type: "string",
                  minLength: 1,
                  maxLength: 160,
                },
                sourceSenseKey: {
                  type: "string",
                  minLength: 1,
                  maxLength: 240,
                },
              },
            },
          },
          reasonCode: { type: "string", minLength: 1, maxLength: 120 },
        },
      },
    },
  },
} as const;
