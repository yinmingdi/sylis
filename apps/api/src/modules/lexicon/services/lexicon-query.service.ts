import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";

import { ActiveReleaseService } from "./active-release.service";
import { DATABASE } from "../../../platform/database/database.module";

interface SenseLike {
  senseId: string;
  parentSenseId: string | null;
  displayOrder: number;
}

type SenseTree<T extends SenseLike> = T & { children: SenseTree<T>[] };

const buildSenseTree = <T extends SenseLike>(senses: T[]): SenseTree<T>[] => {
  const nodes = new Map<string, SenseTree<T>>();
  for (const sense of senses) {
    nodes.set(sense.senseId, { ...sense, children: [] } as SenseTree<T>);
  }
  const roots: SenseTree<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentSenseId
      ? nodes.get(node.parentSenseId)
      : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: SenseTree<T>[]): void => {
    items.sort((left, right) => left.displayOrder - right.displayOrder);
    for (const item of items) sort(item.children);
  };
  sort(roots);
  return roots;
};

@Injectable()
export class LexiconQueryService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly releases: ActiveReleaseService,
  ) {}

  async search(query: string, limit: number) {
    const release = await this.releases.resolve();
    const normalized = query.trim().normalize("NFC");
    const [headwords, collocations] = await Promise.all([
      this.database.headwordRevision.findMany({
        where: {
          releaseId: release.releaseId,
          OR: [
            { normalizedText: { startsWith: normalized, mode: "insensitive" } },
            { searchKey: { contains: normalized, mode: "insensitive" } },
          ],
        },
        include: {
          entries: {
            select: {
              entryId: true,
              entryType: true,
              partOfSpeechCode: true,
              homographNo: true,
            },
            orderBy: { displayOrder: "asc" },
          },
        },
        orderBy: { sortKey: "asc" },
        take: Math.min(Math.max(limit, 1), 50),
      }),
      this.database.collocation.findMany({
        where: {
          releaseId: release.releaseId,
          normalizedText: { contains: normalized, mode: "insensitive" },
        },
        orderBy: { normalizedText: "asc" },
        take: Math.min(Math.max(limit, 1), 50),
      }),
    ]);
    return { ...release, data: { headwords, collocations } };
  }

  async headword(headwordId: string) {
    const release = await this.releases.resolve();
    const headword = await this.database.headwordRevision.findUnique({
      where: {
        releaseId_headwordId: { releaseId: release.releaseId, headwordId },
      },
      include: {
        entries: {
          orderBy: { displayOrder: "asc" },
          include: {
            forms: {
              orderBy: { displayOrder: "asc" },
              include: { representations: true, features: true, media: true },
            },
            senses: {
              orderBy: { displayOrder: "asc" },
              include: { definitions: true, translations: true, usages: true },
            },
          },
        },
      },
    });
    if (!headword) throw new NotFoundException();
    return {
      ...release,
      data: {
        ...headword,
        entries: headword.entries.map((entry) => ({
          ...entry,
          senses: buildSenseTree(entry.senses),
        })),
      },
    };
  }

  async entry(entryId: string) {
    const release = await this.releases.resolve();
    const entry = await this.database.lexicalEntryRevision.findUnique({
      where: { releaseId_entryId: { releaseId: release.releaseId, entryId } },
      include: {
        forms: {
          orderBy: { displayOrder: "asc" },
          include: { representations: true, features: true, media: true },
        },
        senses: {
          orderBy: { displayOrder: "asc" },
          include: { definitions: true, translations: true, usages: true },
        },
        frames: { include: { arguments: true } },
        outgoingRelations: true,
        incomingRelations: true,
      },
    });
    if (!entry) throw new NotFoundException();
    return { ...release, data: entry };
  }

  async sense(senseId: string) {
    const release = await this.releases.resolve();
    const sense = await this.database.lexicalSenseRevision.findUnique({
      where: { releaseId_senseId: { releaseId: release.releaseId, senseId } },
      include: {
        children: { include: { definitions: true, translations: true } },
        definitions: true,
        translations: true,
        usages: true,
        examples: { include: { example: { include: { translations: true } } } },
        collocations: {
          include: { collocation: { include: { components: true } } },
        },
        memberships: {
          include: { conceptRevision: { include: { definitions: true } } },
        },
        outgoingRelations: true,
        incomingRelations: true,
      },
    });
    if (!sense) throw new NotFoundException();
    return { ...release, data: sense };
  }

  async materials(
    targetKind: "ENTRY" | "SENSE",
    targetId: string,
    kind?: string,
  ) {
    const release = await this.releases.resolve();
    const revisions = await this.database.pedagogicalMaterialRevision.findMany({
      where: {
        releaseId: release.releaseId,
        targets: { some: { targetKind, targetId } },
        kind,
        status: "PUBLISHED",
      },
      include: {
        targets: true,
        blocks: {
          orderBy: { position: "asc" },
          include: { mentions: true, citations: true },
        },
      },
      orderBy: { kind: "asc" },
    });
    const blocks = revisions.flatMap((revision) => revision.blocks);
    const exampleIds = blocks.flatMap((block) =>
      block.exampleId ? [block.exampleId] : [],
    );
    const mediaIds = blocks.flatMap((block) =>
      block.mediaAssetId ? [block.mediaAssetId] : [],
    );
    const [examples, media] = await Promise.all([
      this.database.exampleSentence.findMany({
        where: { releaseId: release.releaseId, id: { in: exampleIds } },
        select: {
          id: true,
          languageTag: true,
          text: true,
          translations: { select: { id: true, languageTag: true, text: true } },
        },
      }),
      this.database.mediaAsset.findMany({
        where: { releaseId: release.releaseId, id: { in: mediaIds } },
        select: {
          id: true,
          mediaType: true,
          mimeType: true,
          contentUri: true,
          durationMs: true,
        },
      }),
    ]);
    const examplesById = new Map(
      examples.map((example) => [example.id, example]),
    );
    const mediaById = new Map(media.map((asset) => [asset.id, asset]));
    return {
      ...release,
      data: revisions.map((revision) => ({
        ...revision,
        blocks: revision.blocks.map((block) => ({
          ...block,
          example: block.exampleId
            ? (examplesById.get(block.exampleId) ?? null)
            : null,
          media: block.mediaAssetId
            ? (mediaById.get(block.mediaAssetId) ?? null)
            : null,
        })),
      })),
    };
  }

  async translate(text: string) {
    const release = await this.releases.resolve();
    const normalized = text.trim().normalize("NFC");
    const headword = await this.database.headwordRevision.findFirst({
      where: {
        releaseId: release.releaseId,
        normalizedText: { equals: normalized, mode: "insensitive" },
      },
      include: {
        entries: {
          include: {
            senses: {
              include: { definitions: true, translations: true },
              orderBy: { displayOrder: "asc" },
            },
          },
        },
      },
    });
    return {
      ...release,
      data: headword
        ? { kind: "LEXICON", headword }
        : { kind: "NOT_FOUND", text },
    };
  }
}
