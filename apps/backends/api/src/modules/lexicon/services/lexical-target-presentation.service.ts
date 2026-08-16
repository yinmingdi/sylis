import { Inject, Injectable } from "@nestjs/common";
import {
  LexicalAnnotationTargetKind,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";

import { DATABASE } from "../../../platform/database/database.module";

export interface LexicalTargetReference {
  releaseId: string;
  targetKind: LexicalAnnotationTargetKind;
  targetId: string;
}

export const LEXICAL_ANNOTATION_TARGET_INCLUDE = {
  headwordTarget: true,
  entryTarget: true,
  senseTarget: true,
  collocationTarget: true,
  objectiveTarget: true,
} as const satisfies PrismaTypes.LexicalAnnotationInclude;

export type LexicalAnnotationWithTarget =
  PrismaTypes.LexicalAnnotationGetPayload<{
    include: typeof LEXICAL_ANNOTATION_TARGET_INCLUDE;
  }>;

export interface LexicalTargetPresentation {
  displayText: string;
  detail: string | null;
}

export const lexicalTargetKey = (target: LexicalTargetReference): string =>
  `${target.releaseId}:${target.targetKind}:${target.targetId}`;

export function lexicalAnnotationTarget(
  annotation: LexicalAnnotationWithTarget,
): LexicalTargetReference {
  const targets = [
    annotation.headwordTarget
      ? {
          targetKind: LexicalAnnotationTargetKind.HEADWORD,
          targetId: annotation.headwordTarget.headwordId,
        }
      : null,
    annotation.entryTarget
      ? {
          targetKind: LexicalAnnotationTargetKind.ENTRY,
          targetId: annotation.entryTarget.entryId,
        }
      : null,
    annotation.senseTarget
      ? {
          targetKind: LexicalAnnotationTargetKind.SENSE,
          targetId: annotation.senseTarget.senseId,
        }
      : null,
    annotation.collocationTarget
      ? {
          targetKind: LexicalAnnotationTargetKind.COLLOCATION,
          targetId: annotation.collocationTarget.collocationId,
        }
      : null,
    annotation.objectiveTarget
      ? {
          targetKind: LexicalAnnotationTargetKind.OBJECTIVE,
          targetId: annotation.objectiveTarget.objectiveRevisionId,
        }
      : null,
  ].filter((target): target is NonNullable<typeof target> => target !== null);
  if (
    targets.length !== 1 ||
    targets[0]!.targetKind !== annotation.targetKind
  ) {
    throw new Error(`LEXICAL_ANNOTATION_TARGET_INVALID:${annotation.id}`);
  }
  return { releaseId: annotation.releaseId, ...targets[0]! };
}

@Injectable()
export class LexicalTargetPresentationService {
  constructor(@Inject(DATABASE) private readonly database: SylisDatabase) {}

  async resolve(
    targets: LexicalTargetReference[],
  ): Promise<Map<string, LexicalTargetPresentation>> {
    const ofKind = (kind: LexicalAnnotationTargetKind) =>
      targets.filter((target) => target.targetKind === kind);
    const headwordTargets = ofKind(LexicalAnnotationTargetKind.HEADWORD);
    const entryTargets = ofKind(LexicalAnnotationTargetKind.ENTRY);
    const senseTargets = ofKind(LexicalAnnotationTargetKind.SENSE);
    const collocationTargets = ofKind(LexicalAnnotationTargetKind.COLLOCATION);
    const objectiveTargets = ofKind(LexicalAnnotationTargetKind.OBJECTIVE);
    const [headwords, entries, senses, collocations, objectives] =
      await Promise.all([
        headwordTargets.length === 0
          ? []
          : this.database.headwordRevision.findMany({
              where: {
                OR: headwordTargets.map((target) => ({
                  releaseId: target.releaseId,
                  headwordId: target.targetId,
                })),
              },
              select: { releaseId: true, headwordId: true, displayText: true },
            }),
        entryTargets.length === 0
          ? []
          : this.database.lexicalEntryRevision.findMany({
              where: {
                OR: entryTargets.map((target) => ({
                  releaseId: target.releaseId,
                  entryId: target.targetId,
                })),
              },
              select: {
                releaseId: true,
                entryId: true,
                partOfSpeechCode: true,
                headwordRevision: { select: { displayText: true } },
              },
            }),
        senseTargets.length === 0
          ? []
          : this.database.lexicalSenseRevision.findMany({
              where: {
                OR: senseTargets.map((target) => ({
                  releaseId: target.releaseId,
                  senseId: target.targetId,
                })),
              },
              select: {
                releaseId: true,
                senseId: true,
                entryRevision: {
                  select: {
                    headwordRevision: { select: { displayText: true } },
                  },
                },
                definitions: {
                  orderBy: { displayOrder: "asc" },
                  take: 1,
                  select: { text: true },
                },
                translations: {
                  orderBy: { displayOrder: "asc" },
                  take: 1,
                  select: { text: true },
                },
              },
            }),
        collocationTargets.length === 0
          ? []
          : this.database.collocation.findMany({
              where: {
                OR: collocationTargets.map((target) => ({
                  releaseId: target.releaseId,
                  id: target.targetId,
                })),
              },
              select: {
                releaseId: true,
                id: true,
                canonicalText: true,
                languageTag: true,
              },
            }),
        objectiveTargets.length === 0
          ? []
          : this.database.learningObjectiveRevision.findMany({
              where: {
                OR: objectiveTargets.map((target) => ({
                  releaseId: target.releaseId,
                  id: target.targetId,
                })),
              },
              select: {
                releaseId: true,
                id: true,
                knowledgeFacet: true,
                retrievalDirection: true,
              },
            }),
      ]);
    const result = new Map<string, LexicalTargetPresentation>();
    for (const headword of headwords) {
      result.set(
        lexicalTargetKey({
          releaseId: headword.releaseId,
          targetKind: LexicalAnnotationTargetKind.HEADWORD,
          targetId: headword.headwordId,
        }),
        { displayText: headword.displayText, detail: null },
      );
    }
    for (const entry of entries) {
      result.set(
        lexicalTargetKey({
          releaseId: entry.releaseId,
          targetKind: LexicalAnnotationTargetKind.ENTRY,
          targetId: entry.entryId,
        }),
        {
          displayText: entry.headwordRevision.displayText,
          detail: entry.partOfSpeechCode,
        },
      );
    }
    for (const sense of senses) {
      result.set(
        lexicalTargetKey({
          releaseId: sense.releaseId,
          targetKind: LexicalAnnotationTargetKind.SENSE,
          targetId: sense.senseId,
        }),
        {
          displayText: sense.entryRevision.headwordRevision.displayText,
          detail:
            sense.translations[0]?.text ?? sense.definitions[0]?.text ?? "义项",
        },
      );
    }
    for (const collocation of collocations) {
      result.set(
        lexicalTargetKey({
          releaseId: collocation.releaseId,
          targetKind: LexicalAnnotationTargetKind.COLLOCATION,
          targetId: collocation.id,
        }),
        {
          displayText: collocation.canonicalText,
          detail: collocation.languageTag,
        },
      );
    }
    for (const objective of objectives) {
      result.set(
        lexicalTargetKey({
          releaseId: objective.releaseId,
          targetKind: LexicalAnnotationTargetKind.OBJECTIVE,
          targetId: objective.id,
        }),
        {
          displayText: objective.knowledgeFacet,
          detail: objective.retrievalDirection,
        },
      );
    }
    return result;
  }
}
