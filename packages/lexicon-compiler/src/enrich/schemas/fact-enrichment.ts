export interface ExampleGenerationCandidate {
  example: {
    text: string;
    translation: string;
  } | null;
}

export const exampleGenerationCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["example"],
  properties: {
    example: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["text", "translation"],
          properties: {
            text: { type: "string", minLength: 3, maxLength: 400 },
            translation: { type: "string", minLength: 1, maxLength: 400 },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;

export interface CollocationEnrichmentCandidate {
  collocations: Array<{
    text: string;
    relationType: "FREE" | "RESTRICTED" | "IDIOMATIC" | "UNKNOWN";
    components: Array<{
      surfaceText: string;
      role: "HEAD" | "PARTNER" | "FUNCTION";
      targetText: string | null;
    }>;
  }>;
}

export const collocationEnrichmentCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["collocations"],
  properties: {
    collocations: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "relationType", "components"],
        properties: {
          text: { type: "string", minLength: 3, maxLength: 160 },
          relationType: {
            type: "string",
            enum: ["FREE", "RESTRICTED", "IDIOMATIC", "UNKNOWN"],
          },
          components: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["surfaceText", "role", "targetText"],
              properties: {
                surfaceText: {
                  type: "string",
                  minLength: 1,
                  maxLength: 80,
                },
                role: {
                  type: "string",
                  enum: ["HEAD", "PARTNER", "FUNCTION"],
                },
                targetText: {
                  anyOf: [
                    { type: "string", minLength: 1, maxLength: 80 },
                    { type: "null" },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export interface SynsemFrameCandidate {
  frame: {
    frameKey: string;
    frameType: string;
    displayTemplate: string;
    predicate: string;
    arguments: Array<{
      syntacticFunction: string;
      phraseType: string;
      marker: string | null;
      optional: boolean;
      semanticRole: string | null;
    }>;
  } | null;
}

export const synsemFrameCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["frame"],
  properties: {
    frame: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "frameKey",
            "frameType",
            "displayTemplate",
            "predicate",
            "arguments",
          ],
          properties: {
            frameKey: { type: "string", minLength: 1, maxLength: 120 },
            frameType: { type: "string", minLength: 1, maxLength: 120 },
            displayTemplate: {
              type: "string",
              minLength: 3,
              maxLength: 240,
            },
            predicate: { type: "string", minLength: 1, maxLength: 120 },
            arguments: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "syntacticFunction",
                  "phraseType",
                  "marker",
                  "optional",
                  "semanticRole",
                ],
                properties: {
                  syntacticFunction: {
                    type: "string",
                    minLength: 1,
                    maxLength: 80,
                  },
                  phraseType: {
                    type: "string",
                    minLength: 1,
                    maxLength: 80,
                  },
                  marker: {
                    anyOf: [
                      { type: "string", minLength: 1, maxLength: 40 },
                      { type: "null" },
                    ],
                  },
                  optional: { type: "boolean" },
                  semanticRole: {
                    anyOf: [
                      { type: "string", minLength: 1, maxLength: 80 },
                      { type: "null" },
                    ],
                  },
                },
              },
            },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;

export interface StudyHintCandidate {
  hint: { languageTag: "zh-CN"; text: string } | null;
}

export const studyHintCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["hint"],
  properties: {
    hint: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["languageTag", "text"],
          properties: {
            languageTag: { type: "string", const: "zh-CN" },
            text: { type: "string", minLength: 1, maxLength: 120 },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;
