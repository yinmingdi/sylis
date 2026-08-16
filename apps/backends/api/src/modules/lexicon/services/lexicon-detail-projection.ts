import type { PrismaTypes } from "@sylis/database";

const ENTRY_LABEL_INCLUDE = {
  headwordRevision: true,
} satisfies PrismaTypes.LexicalEntryRevisionInclude;

const SENSE_LABEL_INCLUDE = {
  definitions: { orderBy: { displayOrder: "asc" } },
  translations: { orderBy: { displayOrder: "asc" } },
  entryRevision: { include: ENTRY_LABEL_INCLUDE },
} satisfies PrismaTypes.LexicalSenseRevisionInclude;

const CONCEPT_DETAIL_INCLUDE = {
  definitions: { orderBy: { displayOrder: "asc" } },
  outgoingRelations: {
    orderBy: [{ typeCode: "asc" }, { id: "asc" }],
    include: {
      target: {
        include: { definitions: { orderBy: { displayOrder: "asc" } } },
      },
    },
  },
  incomingRelations: {
    orderBy: [{ typeCode: "asc" }, { id: "asc" }],
    include: {
      source: {
        include: { definitions: { orderBy: { displayOrder: "asc" } } },
      },
    },
  },
} satisfies PrismaTypes.LexicalConceptRevisionInclude;

const FORM_DETAIL_INCLUDE = {
  representations: {
    include: {
      analyses: {
        include: {
          segments: {
            orderBy: { position: "asc" },
            include: {
              morph: { include: { morpheme: true } },
              morpheme: true,
            },
          },
        },
      },
    },
  },
  features: { orderBy: { featureCode: "asc" } },
  media: {
    orderBy: { displayOrder: "asc" },
    include: { media: true },
  },
} satisfies PrismaTypes.LexicalFormInclude;

const SENSE_SUMMARY_INCLUDE = {
  definitions: { orderBy: { displayOrder: "asc" } },
  translations: { orderBy: { displayOrder: "asc" } },
  usages: { orderBy: { displayOrder: "asc" } },
  examples: {
    orderBy: { displayOrder: "asc" },
    include: {
      example: {
        include: {
          translations: true,
          citations: true,
        },
      },
    },
  },
  collocations: {
    orderBy: { displayOrder: "asc" },
    include: {
      collocation: {
        include: {
          components: { orderBy: { position: "asc" } },
          observations: true,
        },
      },
    },
  },
  memberships: {
    include: { conceptRevision: { include: CONCEPT_DETAIL_INCLUDE } },
  },
  outgoingRelations: {
    orderBy: [{ typeCode: "asc" }, { id: "asc" }],
    include: { target: { include: SENSE_LABEL_INCLUDE } },
  },
  incomingRelations: {
    orderBy: [{ typeCode: "asc" }, { id: "asc" }],
    include: { source: { include: SENSE_LABEL_INCLUDE } },
  },
  outgoingTranslations: {
    include: { target: { include: SENSE_LABEL_INCLUDE } },
  },
  incomingTranslations: {
    include: { source: { include: SENSE_LABEL_INCLUDE } },
  },
  frames: {
    include: {
      frame: {
        include: { arguments: { orderBy: { position: "asc" } } },
      },
      predicate: {
        include: { arguments: { orderBy: { position: "asc" } } },
      },
      mappings: {
        include: { syntacticArgument: true, semanticArgument: true },
      },
    },
  },
  predicates: {
    include: { arguments: { orderBy: { position: "asc" } } },
  },
} satisfies PrismaTypes.LexicalSenseRevisionInclude;

export const ENTRY_DETAIL_INCLUDE = {
  headwordRevision: true,
  forms: {
    orderBy: { displayOrder: "asc" },
    include: FORM_DETAIL_INCLUDE,
  },
  senses: {
    orderBy: { displayOrder: "asc" },
    include: SENSE_SUMMARY_INCLUDE,
  },
  frames: {
    include: {
      arguments: { orderBy: { position: "asc" } },
    },
  },
  headedCollocations: {
    include: {
      components: { orderBy: { position: "asc" } },
      observations: true,
    },
  },
  inflectionGenerations: {
    include: {
      baseForm: { include: { representations: true, features: true } },
      outputForm: { include: { representations: true, features: true } },
      rule: true,
    },
  },
  wordFormations: {
    include: {
      inputs: {
        orderBy: { position: "asc" },
        include: {
          inputEntry: { include: ENTRY_LABEL_INCLUDE },
          morpheme: true,
        },
      },
      applications: {
        orderBy: { stepOrder: "asc" },
        include: { rule: true },
      },
    },
  },
  wordFormationInputs: {
    include: {
      formation: {
        include: {
          targetEntry: { include: ENTRY_LABEL_INCLUDE },
          applications: {
            orderBy: { stepOrder: "asc" },
            include: { rule: true },
          },
        },
      },
      morpheme: true,
    },
  },
  etymologyHypotheses: {
    include: {
      links: {
        orderBy: { position: "asc" },
        include: {
          sourceEntries: {
            include: { entry: { include: ENTRY_LABEL_INCLUDE } },
          },
          sourceEtymons: { include: { etymon: true } },
          targetEntries: {
            include: { entry: { include: ENTRY_LABEL_INCLUDE } },
          },
          targetEtymons: { include: { etymon: true } },
        },
      },
    },
  },
  outgoingRelations: {
    orderBy: [{ typeCode: "asc" }, { id: "asc" }],
    include: { target: { include: ENTRY_LABEL_INCLUDE } },
  },
  incomingRelations: {
    orderBy: [{ typeCode: "asc" }, { id: "asc" }],
    include: { source: { include: ENTRY_LABEL_INCLUDE } },
  },
} satisfies PrismaTypes.LexicalEntryRevisionInclude;

export const SENSE_DETAIL_INCLUDE = {
  ...SENSE_SUMMARY_INCLUDE,
  entryRevision: { include: ENTRY_LABEL_INCLUDE },
  parent: { include: SENSE_LABEL_INCLUDE },
  children: {
    orderBy: { displayOrder: "asc" },
    include: SENSE_LABEL_INCLUDE,
  },
} satisfies PrismaTypes.LexicalSenseRevisionInclude;

export type LexiconEntryDetailRecord =
  PrismaTypes.LexicalEntryRevisionGetPayload<{
    include: typeof ENTRY_DETAIL_INCLUDE;
  }>;

export type LexiconSenseDetailRecord =
  PrismaTypes.LexicalSenseRevisionGetPayload<{
    include: typeof SENSE_DETAIL_INCLUDE;
  }>;

export function projectLexiconMedia<T extends { byteLength: bigint }>(
  media: T,
) {
  return { ...media, byteLength: media.byteLength.toString() };
}

export function projectLexiconEntry(entry: LexiconEntryDetailRecord) {
  return {
    ...entry,
    forms: entry.forms.map((form) => ({
      ...form,
      media: form.media.map((link) => ({
        ...link,
        media: projectLexiconMedia(link.media),
      })),
    })),
  };
}

export function projectLexiconSense(sense: LexiconSenseDetailRecord) {
  return sense;
}
