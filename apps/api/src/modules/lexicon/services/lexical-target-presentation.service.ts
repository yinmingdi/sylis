import { Inject, Injectable } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";

import { DATABASE } from "../../../platform/database/database.module";

export interface LexicalTargetReference {
  releaseId: string;
  targetKind: string;
  targetId: string;
}

export interface LexicalTargetPresentation {
  displayText: string;
  detail: string | null;
}

export const lexicalTargetKey = (target: LexicalTargetReference): string =>
  `${target.releaseId}:${target.targetKind}:${target.targetId}`;

@Injectable()
export class LexicalTargetPresentationService {
  constructor(@Inject(DATABASE) private readonly database: SylisDatabase) {}

  async resolve(
    targets: LexicalTargetReference[],
  ): Promise<Map<string, LexicalTargetPresentation>> {
    const ofKind = (kind: string) =>
      targets.filter((target) => target.targetKind === kind);
    const headwordTargets = ofKind("HEADWORD");
    const entryTargets = ofKind("ENTRY");
    const senseTargets = ofKind("SENSE");
    const collocationTargets = ofKind("COLLOCATION");
    const [headwords, entries, senses, collocations] = await Promise.all([
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
    ]);
    const result = new Map<string, LexicalTargetPresentation>();
    for (const headword of headwords) {
      result.set(`${headword.releaseId}:HEADWORD:${headword.headwordId}`, {
        displayText: headword.displayText,
        detail: null,
      });
    }
    for (const entry of entries) {
      result.set(`${entry.releaseId}:ENTRY:${entry.entryId}`, {
        displayText: entry.headwordRevision.displayText,
        detail: entry.partOfSpeechCode,
      });
    }
    for (const sense of senses) {
      result.set(`${sense.releaseId}:SENSE:${sense.senseId}`, {
        displayText: sense.entryRevision.headwordRevision.displayText,
        detail:
          sense.translations[0]?.text ?? sense.definitions[0]?.text ?? "义项",
      });
    }
    for (const collocation of collocations) {
      result.set(`${collocation.releaseId}:COLLOCATION:${collocation.id}`, {
        displayText: collocation.canonicalText,
        detail: collocation.languageTag,
      });
    }
    return result;
  }
}
