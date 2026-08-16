import type { PrismaTypes } from "@sylis/database";

export const MATERIAL_BLOCK_INCLUDE = {
  textBlocks: { include: { mentions: true } },
  exampleBlocks: {
    include: {
      senseExample: {
        include: {
          example: { include: { translations: true, citations: true } },
        },
      },
    },
  },
  mediaBlocks: { include: { media: true } },
  citations: true,
} as const;

export const STIMULUS_BLOCK_INCLUDE = {
  textBlocks: true,
  exampleBlocks: {
    include: {
      senseExample: {
        include: { example: { include: { translations: true } } },
      },
    },
  },
  mediaBlocks: { include: { media: true } },
  materialBlocks: true,
} as const;

type MaterialBlock = PrismaTypes.PedagogicalMaterialBlockGetPayload<{
  include: typeof MATERIAL_BLOCK_INCLUDE;
}>;
type StimulusBlock = PrismaTypes.AssessmentStimulusBlockGetPayload<{
  include: typeof STIMULUS_BLOCK_INCLUDE;
}>;

enum LearningContentBlockKind {
  TEXT = "TEXT",
  EXAMPLE = "EXAMPLE",
  MEDIA = "MEDIA",
  MATERIAL = "MATERIAL",
}

const requireSingleContent = (
  blockId: string,
  content: readonly unknown[],
): void => {
  if (content.filter(Boolean).length !== 1) {
    throw new Error(`LEARNING_CONTENT_BLOCK_INVALID:${blockId}`);
  }
};

const projectMediaAsset = <T extends { byteLength: bigint }>(media: T) => ({
  ...media,
  byteLength: media.byteLength.toString(),
});

export function projectMaterialBlock(block: MaterialBlock) {
  const text = block.textBlocks[0] ?? null;
  const example = block.exampleBlocks[0] ?? null;
  const media = block.mediaBlocks[0] ?? null;
  requireSingleContent(block.id, [text, example, media]);
  return {
    id: block.id,
    releaseId: block.releaseId,
    materialRevisionId: block.materialRevisionId,
    position: block.position,
    roleCode: block.roleCode,
    blockKind: text
      ? LearningContentBlockKind.TEXT
      : example
        ? LearningContentBlockKind.EXAMPLE
        : LearningContentBlockKind.MEDIA,
    languageTag: text?.languageTag ?? null,
    text: text?.text ?? null,
    example: example?.senseExample.example ?? null,
    media: media ? projectMediaAsset(media.media) : null,
    mentions: text?.mentions ?? [],
    citations: block.citations,
  };
}

export function projectStimulusBlock(block: StimulusBlock) {
  const text = block.textBlocks[0] ?? null;
  const example = block.exampleBlocks[0] ?? null;
  const media = block.mediaBlocks[0] ?? null;
  const material = block.materialBlocks[0] ?? null;
  requireSingleContent(block.id, [text, example, media, material]);
  return {
    id: block.id,
    releaseId: block.releaseId,
    stimulusRevisionId: block.stimulusRevisionId,
    position: block.position,
    blockKind: text
      ? LearningContentBlockKind.TEXT
      : example
        ? LearningContentBlockKind.EXAMPLE
        : media
          ? LearningContentBlockKind.MEDIA
          : LearningContentBlockKind.MATERIAL,
    languageTag: text?.languageTag ?? null,
    text: text?.text ?? null,
    example: example?.senseExample.example ?? null,
    media: media ? projectMediaAsset(media.media) : null,
    materialRevisionId: material?.materialRevisionId ?? null,
  };
}
