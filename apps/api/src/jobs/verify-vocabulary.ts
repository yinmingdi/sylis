import { PrismaClient } from '@prisma/client';

const EXPECTED_BOOK_COUNT = 24;

interface CountRow {
  count: bigint;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient();

  try {
    const [
      words,
      metadata,
      books,
      duplicates,
      mismatchedBooks,
      cet4Progress,
      latestImport,
    ] = await Promise.all([
      prisma.word.count(),
      prisma.wordLexiconMetadata.count({ where: { source: 'ECDICT' } }),
      prisma.book.findMany({
        where: { source: 'ECDICT' },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          wordNum: true,
          _count: { select: { wordBooks: true } },
        },
      }),
      prisma.$queryRaw<CountRow[]>`
          SELECT count(*)::bigint AS count
          FROM (
            SELECT "bookId", "wordId"
            FROM "WordBook"
            GROUP BY "bookId", "wordId"
            HAVING count(*) > 1
          ) AS duplicates
        `,
      prisma.$queryRaw<CountRow[]>`
          SELECT count(*)::bigint AS count
          FROM "Book" AS book
          WHERE book."source" = 'ECDICT'::"ContentSource"
            AND book."wordNum" <> (
              SELECT count(*) FROM "WordBook" AS word_book
              WHERE word_book."bookId" = book."id"
            )
        `,
      prisma.userBook.count({ where: { bookId: 'ecdict-cet4' } }),
      prisma.dictionaryImportRun.findFirst({
        where: { source: 'ECDICT' },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          status: true,
          scope: true,
          selected: true,
          finishedAt: true,
        },
      }),
    ]);

    const duplicateAssociations = Number(duplicates[0]?.count ?? 0n);
    const bookCountMismatches = Number(mismatchedBooks[0]?.count ?? 0n);
    const report = {
      words,
      ecdictMetadata: metadata,
      ecdictBooks: books.length,
      duplicateAssociations,
      bookCountMismatches,
      cet4UserBooks: cet4Progress,
      latestImport,
      books,
    };

    if (books.length !== EXPECTED_BOOK_COUNT) {
      throw new Error(
        `Expected ${EXPECTED_BOOK_COUNT} ECDICT books, found ${books.length}`,
      );
    }
    if (!books.some((book) => book.id === 'ecdict-cet4')) {
      throw new Error('Stable ecdict-cet4 book is missing');
    }
    if (duplicateAssociations > 0 || bookCountMismatches > 0) {
      throw new Error('Vocabulary book integrity check failed');
    }
    if (
      !latestImport ||
      latestImport.status !== 'COMPLETED' ||
      latestImport.scope !== 'all'
    ) {
      throw new Error('Latest ECDICT import is not a completed all-scope run');
    }

    console.log(
      JSON.stringify(report, (_key, value) =>
        typeof value === 'bigint' ? Number(value) : value,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Vocabulary verification failed',
  );
  process.exitCode = 1;
});
