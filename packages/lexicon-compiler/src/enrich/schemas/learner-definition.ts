export interface LearnerDefinitionCandidate {
  definition: { languageTag: "en"; text: string } | null;
  translation: { languageTag: "zh-CN"; text: string } | null;
}

export const learnerDefinitionCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["definition", "translation"],
  properties: {
    definition: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["languageTag", "text"],
          properties: {
            languageTag: { type: "string", const: "en" },
            text: { type: "string", minLength: 1, maxLength: 300 },
          },
        },
        { type: "null" },
      ],
    },
    translation: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["languageTag", "text"],
          properties: {
            languageTag: { type: "string", const: "zh-CN" },
            text: { type: "string", minLength: 1, maxLength: 300 },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;
