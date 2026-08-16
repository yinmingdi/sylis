import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  PedagogicalMaterialKind,
  RevisionStatus,
  type SylisDatabase,
} from "@sylis/database";

import { ActiveReleaseService } from "./active-release.service";
import {
  ENTRY_DETAIL_INCLUDE,
  SENSE_DETAIL_INCLUDE,
  projectLexiconEntry,
  projectLexiconSense,
} from "./lexicon-detail-projection";
import { DATABASE } from "../../../platform/database/database.module";
import {
  MATERIAL_BLOCK_INCLUDE,
  projectMaterialBlock,
} from "../../../platform/database/learning-content-projection";

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
          include: ENTRY_DETAIL_INCLUDE,
        },
      },
    });
    if (!headword) throw new NotFoundException();
    return {
      ...release,
      data: {
        ...headword,
        entries: headword.entries.map((entry) => {
          const projected = projectLexiconEntry(entry);
          return {
            ...projected,
            senses: buildSenseTree(projected.senses),
          };
        }),
      },
    };
  }

  async entry(entryId: string) {
    const release = await this.releases.resolve();
    const entry = await this.database.lexicalEntryRevision.findUnique({
      where: { releaseId_entryId: { releaseId: release.releaseId, entryId } },
      include: ENTRY_DETAIL_INCLUDE,
    });
    if (!entry) throw new NotFoundException();
    return { ...release, data: projectLexiconEntry(entry) };
  }

  async sense(senseId: string) {
    const release = await this.releases.resolve();
    const sense = await this.database.lexicalSenseRevision.findUnique({
      where: { releaseId_senseId: { releaseId: release.releaseId, senseId } },
      include: SENSE_DETAIL_INCLUDE,
    });
    if (!sense) throw new NotFoundException();
    return { ...release, data: projectLexiconSense(sense) };
  }

  async materials(
    targetKind: "ENTRY" | "SENSE",
    targetId: string,
    kind?: PedagogicalMaterialKind,
  ) {
    const release = await this.releases.resolve();
    const revisions = await this.database.pedagogicalMaterialRevision.findMany({
      where: {
        releaseId: release.releaseId,
        ...(targetKind === "ENTRY"
          ? { entryTargets: { some: { entryId: targetId } } }
          : { senseTargets: { some: { senseId: targetId } } }),
        kind,
        status: RevisionStatus.PUBLISHED,
      },
      include: {
        blocks: {
          orderBy: { position: "asc" },
          include: MATERIAL_BLOCK_INCLUDE,
        },
      },
      orderBy: { kind: "asc" },
    });
    return {
      ...release,
      data: revisions.map((revision) => ({
        ...revision,
        blocks: revision.blocks.map(projectMaterialBlock),
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
