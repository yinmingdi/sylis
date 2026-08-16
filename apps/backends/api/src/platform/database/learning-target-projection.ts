import {
  ExerciseTargetKind,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";

export const OBJECTIVE_SUBJECT_INCLUDE = {
  senseSubjects: true,
  formSubjects: true,
  collocationSubjects: true,
  frameSubjects: true,
  exampleSubjects: true,
} as const satisfies PrismaTypes.LearningObjectiveRevisionInclude;

export const BOOK_ITEM_TARGET_INCLUDE = {
  headwordTarget: true,
  entryTarget: true,
} as const satisfies PrismaTypes.VocabularyBookItemInclude;

export type ObjectiveWithSubjects =
  PrismaTypes.LearningObjectiveRevisionGetPayload<{
    include: typeof OBJECTIVE_SUBJECT_INCLUDE;
  }>;

export interface LearningTargetRef {
  targetKind: ExerciseTargetKind;
  targetId: string;
}

export interface LexicalAnchor {
  targetKind:
    | typeof ExerciseTargetKind.HEADWORD
    | typeof ExerciseTargetKind.ENTRY;
  targetId: string;
}

export type BookItemWithTarget = PrismaTypes.VocabularyBookItemGetPayload<{
  include: typeof BOOK_ITEM_TARGET_INCLUDE;
}>;

export const learningTargetKey = (
  targetKind: ExerciseTargetKind,
  targetId: string,
): string => `${targetKind}:${targetId}`;

export function bookItemAnchor(item: BookItemWithTarget): LexicalAnchor {
  if (item.headwordTarget && !item.entryTarget) {
    return {
      targetKind: ExerciseTargetKind.HEADWORD,
      targetId: item.headwordTarget.headwordId,
    };
  }
  if (item.entryTarget && !item.headwordTarget) {
    return {
      targetKind: ExerciseTargetKind.ENTRY,
      targetId: item.entryTarget.entryId,
    };
  }
  throw new Error(`BOOK_ITEM_TARGET_COUNT_INVALID:${item.id}`);
}

export function objectiveSubjectTargets(
  objective: ObjectiveWithSubjects,
): LearningTargetRef[] {
  return [
    ...objective.senseSubjects.map((subject) => ({
      targetKind: ExerciseTargetKind.SENSE,
      targetId: subject.senseId,
    })),
    ...objective.formSubjects.map((subject) => ({
      targetKind: ExerciseTargetKind.FORM,
      targetId: subject.formId,
    })),
    ...objective.collocationSubjects.map((subject) => ({
      targetKind: ExerciseTargetKind.COLLOCATION,
      targetId: subject.collocationId,
    })),
    ...objective.frameSubjects.map((subject) => ({
      targetKind: ExerciseTargetKind.FRAME,
      targetId: subject.frameId,
    })),
    ...objective.exampleSubjects.map((subject) => ({
      targetKind: ExerciseTargetKind.SENSE_EXAMPLE,
      targetId: subject.senseExampleId,
    })),
  ];
}

export async function expandLexicalAnchors(
  database: SylisDatabase | SylisTransaction,
  releaseId: string,
  anchors: readonly LexicalAnchor[],
): Promise<Map<string, Set<string>>> {
  const targetsByAnchor = new Map(
    anchors.map((anchor) => [
      learningTargetKey(anchor.targetKind, anchor.targetId),
      new Set<string>(),
    ]),
  );
  if (anchors.length === 0) return targetsByAnchor;

  const headwordIds = anchors
    .filter((anchor) => anchor.targetKind === ExerciseTargetKind.HEADWORD)
    .map((anchor) => anchor.targetId);
  const entryIds = anchors
    .filter((anchor) => anchor.targetKind === ExerciseTargetKind.ENTRY)
    .map((anchor) => anchor.targetId);
  const entries = await database.lexicalEntryRevision.findMany({
    where: {
      releaseId,
      OR: [
        ...(headwordIds.length > 0
          ? [{ headwordId: { in: headwordIds } }]
          : []),
        ...(entryIds.length > 0 ? [{ entryId: { in: entryIds } }] : []),
      ],
    },
    select: {
      entryId: true,
      headwordId: true,
      forms: { select: { id: true } },
      frames: { select: { id: true } },
      headedCollocations: { select: { id: true } },
      senses: {
        select: {
          senseId: true,
          examples: { select: { id: true } },
          collocations: { select: { collocationId: true } },
        },
      },
    },
  });

  for (const entry of entries) {
    const targetKeys = new Set<string>();
    for (const form of entry.forms) {
      targetKeys.add(learningTargetKey(ExerciseTargetKind.FORM, form.id));
    }
    for (const frame of entry.frames) {
      targetKeys.add(learningTargetKey(ExerciseTargetKind.FRAME, frame.id));
    }
    for (const collocation of entry.headedCollocations) {
      targetKeys.add(
        learningTargetKey(ExerciseTargetKind.COLLOCATION, collocation.id),
      );
    }
    for (const sense of entry.senses) {
      targetKeys.add(
        learningTargetKey(ExerciseTargetKind.SENSE, sense.senseId),
      );
      for (const example of sense.examples) {
        targetKeys.add(
          learningTargetKey(ExerciseTargetKind.SENSE_EXAMPLE, example.id),
        );
      }
      for (const collocation of sense.collocations) {
        targetKeys.add(
          learningTargetKey(
            ExerciseTargetKind.COLLOCATION,
            collocation.collocationId,
          ),
        );
      }
    }
    const entryAnchor = targetsByAnchor.get(
      learningTargetKey(ExerciseTargetKind.ENTRY, entry.entryId),
    );
    for (const key of targetKeys) entryAnchor?.add(key);
    const headwordAnchor = targetsByAnchor.get(
      learningTargetKey(ExerciseTargetKind.HEADWORD, entry.headwordId),
    );
    for (const key of targetKeys) headwordAnchor?.add(key);
  }

  return targetsByAnchor;
}

export function objectiveTargetWhere(targetKeys: ReadonlySet<string>) {
  const ids = (kind: ExerciseTargetKind): string[] =>
    [...targetKeys]
      .filter((key) => key.startsWith(`${kind}:`))
      .map((key) => key.slice(kind.length + 1));
  const senseIds = ids(ExerciseTargetKind.SENSE);
  const formIds = ids(ExerciseTargetKind.FORM);
  const collocationIds = ids(ExerciseTargetKind.COLLOCATION);
  const frameIds = ids(ExerciseTargetKind.FRAME);
  const senseExampleIds = ids(ExerciseTargetKind.SENSE_EXAMPLE);
  return {
    OR: [
      ...(senseIds.length > 0
        ? [{ senseSubjects: { some: { senseId: { in: senseIds } } } }]
        : []),
      ...(formIds.length > 0
        ? [{ formSubjects: { some: { formId: { in: formIds } } } }]
        : []),
      ...(collocationIds.length > 0
        ? [
            {
              collocationSubjects: {
                some: { collocationId: { in: collocationIds } },
              },
            },
          ]
        : []),
      ...(frameIds.length > 0
        ? [{ frameSubjects: { some: { frameId: { in: frameIds } } } }]
        : []),
      ...(senseExampleIds.length > 0
        ? [
            {
              exampleSubjects: {
                some: { senseExampleId: { in: senseExampleIds } },
              },
            },
          ]
        : []),
    ],
  } satisfies PrismaTypes.LearningObjectiveRevisionWhereInput;
}
