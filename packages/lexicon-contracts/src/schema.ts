import schema from "../schema/sylis-lexicon-artifact-v1.schema.json" with { type: "json" };

export const ARTIFACT_SCHEMA_VERSION = "sylis.lexicon-artifact/1" as const;
export const ARTIFACT_FILENAME = "sylis-lexicon-v1.json.zst" as const;
export const sylisLexiconArtifactV1Schema = schema;
