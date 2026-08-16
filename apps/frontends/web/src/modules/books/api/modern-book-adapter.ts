import { apiClient } from '@sylis/api-client/user';

import type {
  AddBookReqDto,
  BookDetailResDto,
  GetBooksResDto,
  GetCurrentBookResDto,
} from '@/legacy-dto';

type DataRecord = Record<string, unknown>;

const asRecord = (value: unknown): DataRecord =>
  value && typeof value === 'object' ? (value as DataRecord) : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const editionCount = (book: DataRecord) => {
  const edition = asRecord(asArray(book.editions)[0]);
  return number(asRecord(edition._count).items);
};

const toLegacyBook = (value: unknown): GetBooksResDto => {
  const book = asRecord(value);
  const edition = asRecord(asArray(book.editions)[0]);
  return {
    id: text(book.id),
    name: text(book.title),
    introduce: text(book.description) || null,
    coverUrl: null,
    tags: [text(book.languageTag), text(book.publisherKey)].filter(Boolean),
    originName: text(book.key) || null,
    version: text(edition.version) || null,
    wordNum: editionCount(book),
    reciteUserNum: null,
    offlinedata: null,
    size: null,
  };
};

export async function fetchLegacyBooks(): Promise<GetBooksResDto[]> {
  const envelope = await apiClient.books.list();
  return asArray(envelope.data).map(toLegacyBook);
}

export async function fetchLegacyCurrentBook(): Promise<GetCurrentBookResDto> {
  const [enrollmentsValue, envelope, todayValue] = await Promise.all([
    apiClient.books.enrollments(),
    apiClient.books.list(),
    apiClient.study.today(),
  ]);
  const enrollment = asArray(enrollmentsValue)
    .map(asRecord)
    .find((item) => item.active === true);
  if (!enrollment) {
    return {
      daysLeft: 0,
      book: null,
      progress: 0,
      newWords: 0,
      totalWords: 0,
    };
  }
  const sourceBook = asArray(envelope.data)
    .map(asRecord)
    .find((book) => book.id === enrollment.bookId);
  const book = toLegacyBook(sourceBook);
  const plan = asRecord(todayValue);
  const items = asArray(plan.items).map(asRecord);
  const completed = items.filter((item) => Boolean(item.completedAt)).length;
  const totalWords = book.wordNum ?? 0;
  const dailyNewWords = Math.max(number(enrollment.dailyNewLimit, 20), 1);
  const progress = totalWords
    ? Math.min(100, Math.round((completed / totalWords) * 100))
    : 0;
  return {
    daysLeft: Math.ceil(Math.max(totalWords - completed, 0) / dailyNewWords),
    book: {
      id: book.id,
      name: book.name,
      coverUrl: book.coverUrl,
      wordNum: book.wordNum,
    },
    progress,
    newWords: items.filter((item) => text(item.mode) === 'NEW').length,
    totalWords,
  };
}

export async function fetchLegacyBookDetail(
  bookId: string,
): Promise<BookDetailResDto> {
  const [envelope, enrollmentsValue] = await Promise.all([
    apiClient.books.list(),
    apiClient.books.enrollments(),
  ]);
  const sourceBook = asArray(envelope.data)
    .map(asRecord)
    .find((book) => book.id === bookId);
  if (!sourceBook) throw new Error('未找到该词书');
  const book = toLegacyBook(sourceBook);
  const enrollment = asArray(enrollmentsValue)
    .map(asRecord)
    .find((item) => item.bookId === bookId && item.active === true);
  return {
    id: book.id,
    name: book.name,
    coverUrl: book.coverUrl,
    introduce: book.introduce,
    wordNum: book.wordNum ?? 0,
    tags: book.tags,
    userBook: enrollment
      ? {
          dailyNewWords: number(enrollment.dailyNewLimit, 20),
          dailyReviewWords: 30,
        }
      : null,
  };
}

export async function enrollLegacyBook(input: AddBookReqDto): Promise<void> {
  const [envelope, enrollmentsValue] = await Promise.all([
    apiClient.books.list(),
    apiClient.books.enrollments(),
  ]);
  const book = asArray(envelope.data)
    .map(asRecord)
    .find((item) => item.id === input.bookId);
  const edition = asRecord(asArray(book?.editions)[0]);
  const editionId = text(edition.id);
  if (!editionId) throw new Error('词书没有可学习的发布版本');
  const active = asArray(enrollmentsValue)
    .map(asRecord)
    .find((item) => item.bookId === input.bookId && item.active === true);
  if (active) {
    await apiClient.books.updateEnrollment(text(active.id), {
      dailyNewLimit: input.dailyNewWords,
    });
    return;
  }
  await apiClient.books.enroll({
    bookId: input.bookId,
    editionId,
    dailyNewLimit: input.dailyNewWords,
  });
}
