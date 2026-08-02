import type { Prisma, PrismaClient } from "@prisma/client";

export type BookCriterion =
  | { tag: string }
  | { oxford: true }
  | { collins: number }
  | { bncMax: number }
  | { frequencyMax: number };

export interface EcdictBookDefinition {
  id: string;
  name: string;
  introduce: string;
  tags: string[];
  category: "EXAM" | "CORE" | "COLLINS" | "FREQUENCY";
  sortOrder: number;
  criterion: BookCriterion;
}

const examBooks: EcdictBookDefinition[] = [
  ["zk", "中考英语词汇", "中考"],
  ["gk", "高考英语词汇", "高考"],
  ["cet4", "大学英语四级词汇", "CET4"],
  ["cet6", "大学英语六级词汇", "CET6"],
  ["ky", "考研英语词汇", "考研"],
  ["toefl", "TOEFL 词汇", "TOEFL"],
  ["ielts", "IELTS 词汇", "雅思"],
  ["gre", "GRE 词汇", "GRE"],
].map(([tag, name, displayTag], index) => ({
  id: `ecdict-${tag}`,
  name,
  introduce: `依据 ECDICT 的 ${displayTag} 标签生成。`,
  tags: [displayTag, "ECDICT"],
  category: "EXAM",
  sortOrder: index + 1,
  criterion: { tag },
}));

const collinsBooks: EcdictBookDefinition[] = Array.from(
  { length: 5 },
  (_, index) => {
    const level = index + 1;
    return {
      id: `ecdict-collins-${level}`,
      name: `Collins ${level} 星词汇`,
      introduce: `依据 ECDICT Collins 星级 ${level} 精确筛选。`,
      tags: ["Collins", `${level} 星`, "ECDICT"],
      category: "COLLINS",
      sortOrder: 10 + level,
      criterion: { collins: level },
    };
  },
);

const frequencyThresholds = [1_000, 3_000, 5_000, 10_000, 30_000];

const bncBooks: EcdictBookDefinition[] = frequencyThresholds.map(
  (threshold, index) => ({
    id: `ecdict-bnc-${threshold}`,
    name: `BNC 高频 Top ${threshold}`,
    introduce: `依据 ECDICT BNC 排名累计筛选前 ${threshold} 名。`,
    tags: ["BNC", `Top ${threshold}`, "ECDICT"],
    category: "FREQUENCY",
    sortOrder: 20 + index,
    criterion: { bncMax: threshold },
  }),
);

const contemporaryBooks: EcdictBookDefinition[] = frequencyThresholds.map(
  (threshold, index) => ({
    id: `ecdict-frequency-${threshold}`,
    name: `当代英语高频 Top ${threshold}`,
    introduce: `依据 ECDICT 当代语料频率排名累计筛选前 ${threshold} 名。`,
    tags: ["当代词频", `Top ${threshold}`, "ECDICT"],
    category: "FREQUENCY",
    sortOrder: 30 + index,
    criterion: { frequencyMax: threshold },
  }),
);

export const ECDICT_BOOKS: EcdictBookDefinition[] = [
  ...examBooks,
  {
    id: "ecdict-oxford-core",
    name: "Oxford 核心词汇",
    introduce: "依据 ECDICT Oxford 核心词标记生成。",
    tags: ["Oxford", "核心", "ECDICT"],
    category: "CORE",
    sortOrder: 9,
    criterion: { oxford: true },
  },
  ...collinsBooks,
  ...bncBooks,
  ...contemporaryBooks,
];

export function criterionWhere(
  criterion: BookCriterion,
): Prisma.WordLexiconMetadataWhereInput {
  if ("tag" in criterion) return { tags: { has: criterion.tag } };
  if ("oxford" in criterion) return { oxford: true };
  if ("collins" in criterion) return { collins: criterion.collins };
  if ("bncMax" in criterion) return { bncRank: { lte: criterion.bncMax } };
  return { frequencyRank: { lte: criterion.frequencyMax } };
}

function rankOf(
  criterion: BookCriterion,
  word: { bncRank: number | null; frequencyRank: number | null },
) {
  if ("bncMax" in criterion) return word.bncRank ?? Number.MAX_SAFE_INTEGER;
  if ("frequencyMax" in criterion) {
    return word.frequencyRank ?? Number.MAX_SAFE_INTEGER;
  }
  return Math.min(
    word.frequencyRank ?? Number.MAX_SAFE_INTEGER,
    word.bncRank ?? Number.MAX_SAFE_INTEGER,
  );
}

export async function materializeEcdictBooks(prisma: PrismaClient) {
  const associationBatchSize = 5_000;

  for (const book of ECDICT_BOOKS) {
    const words = await prisma.wordLexiconMetadata.findMany({
      where: { source: "ECDICT", ...criterionWhere(book.criterion) },
      select: {
        wordId: true,
        bncRank: true,
        frequencyRank: true,
        word: { select: { headword: true } },
      },
    });
    words.sort((left, right) => {
      const rankDifference =
        rankOf(book.criterion, left) - rankOf(book.criterion, right);
      return (
        rankDifference || left.word.headword.localeCompare(right.word.headword)
      );
    });

    await prisma.$transaction(
      async (tx) => {
        await tx.book.upsert({
          where: { id: book.id },
          create: {
            id: book.id,
            name: book.name,
            introduce: book.introduce,
            coverUrl: null,
            tags: book.tags,
            originName: "ECDICT",
            version: "1",
            wordNum: words.length,
            reciteUserNum: 0,
            source: "ECDICT",
            category: book.category,
            sortOrder: book.sortOrder,
            criteria: book.criterion,
          },
          update: {
            name: book.name,
            introduce: book.introduce,
            coverUrl: null,
            tags: book.tags,
            originName: "ECDICT",
            version: "1",
            wordNum: words.length,
            source: "ECDICT",
            category: book.category,
            sortOrder: book.sortOrder,
            criteria: book.criterion,
          },
        });
        await tx.wordBook.deleteMany({ where: { bookId: book.id } });
        for (
          let start = 0;
          start < words.length;
          start += associationBatchSize
        ) {
          await tx.wordBook.createMany({
            data: words
              .slice(start, start + associationBatchSize)
              .map((word, index) => ({
                bookId: book.id,
                wordId: word.wordId,
                wordRank: start + index + 1,
              })),
            skipDuplicates: true,
          });
        }
      },
      { timeout: 600_000 },
    );
  }

  return ECDICT_BOOKS.length;
}
