import { apiClient } from '@sylis/api-client/user';

import type {
  CompleteTestReqDto,
  CompleteTestResDto,
  GetTestDetailResDto,
  GetTestHistoryReqDto,
  GetTestHistoryResDto,
  StartTestReqDto,
  StartTestResDto,
  TestAnswerDetailDto,
  TestHistoryItemDto,
  TestQuestionDto,
  WordDetailResDto,
} from '@/legacy-dto';

import { fetchLegacyWordDetail } from './modern-word-adapter';

type DataRecord = Record<string, unknown>;

interface StoredVocabularyTest {
  id: string;
  questions: TestQuestionDto[];
  startedAt: string;
  completedAt?: string;
  result?: Omit<CompleteTestResDto, 'completedAt'>;
  answerDetails?: TestAnswerDetailDto[];
}

const STORAGE_KEY = 'sylis-legacy-vocabulary-tests';
const response = <T>(data: T) => ({ data, message: 'ok', code: 0 });
const asRecord = (value: unknown): DataRecord =>
  value && typeof value === 'object' ? (value as DataRecord) : {};
const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const readTests = (): StoredVocabularyTest[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as StoredVocabularyTest[]) : [];
  } catch {
    return [];
  }
};

const writeTests = (tests: StoredVocabularyTest[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tests));
};

const scoreLevel = (ratio: number) => {
  if (ratio >= 0.9) return 'C1';
  if (ratio >= 0.75) return 'B2';
  if (ratio >= 0.6) return 'B1';
  if (ratio >= 0.4) return 'A2';
  return 'A1';
};

const meaning = (word: WordDetailResDto) =>
  word.meanings
    .slice(0, 2)
    .map((item) =>
      item.partOfSpeech
        ? `${item.partOfSpeech}. ${item.meaningCn}`
        : item.meaningCn,
    )
    .join('；') || '暂无释义';

const loadCandidateWords = async (minimum: number) => {
  const [enrollmentsValue, booksEnvelope] = await Promise.all([
    apiClient.books.enrollments(),
    apiClient.books.list(),
  ]);
  const enrollments = asArray(enrollmentsValue).map(asRecord);
  const books = asArray(booksEnvelope.data).map(asRecord);
  const enrollment =
    enrollments.find((item) => item.active === true) ?? enrollments[0];
  const book = books.find((item) => item.id === enrollment?.bookId) ?? books[0];
  const edition =
    asArray(book?.editions)
      .map(asRecord)
      .find((item) => item.id === enrollment?.editionId) ??
    asRecord(asArray(book?.editions)[0]);
  const bookId = text(book?.id);
  const editionId = text(edition.id);
  if (!bookId || !editionId) throw new Error('请先选择一本可学习的词书');

  const editionEnvelope = await apiClient.books.edition(
    bookId,
    editionId,
    -1,
    Math.min(Math.max(minimum * 4, 20), 100),
  );
  const items = asArray(asRecord(editionEnvelope.data).items).map(asRecord);
  const uniqueTargets = items.filter(
    (item, index, values) =>
      values.findIndex(
        (candidate) =>
          candidate.targetId === item.targetId &&
          candidate.displayText === item.displayText,
      ) === index,
  );
  const details = await Promise.all(
    uniqueTargets.map((item) =>
      fetchLegacyWordDetail(
        text(item.targetId) || text(item.displayText),
      ).catch(() => null),
    ),
  );
  return details.filter(
    (item): item is WordDetailResDto =>
      item !== null && Boolean(item.id) && item.meanings.length > 0,
  );
};

const buildQuestions = (
  words: WordDetailResDto[],
  requestedCount: number,
): TestQuestionDto[] => {
  if (words.length < 4) throw new Error('当前词书的完整词条不足，无法生成测试');
  const count = Math.min(requestedCount, words.length);
  const offset = readTests().length % words.length;
  const selected = Array.from(
    { length: count },
    (_, index) => words[(offset + index) % words.length]!,
  );
  return selected.map((word, questionIndex) => {
    const distractors = Array.from(
      { length: 3 },
      (_, index) => words[(offset + questionIndex + index + 1) % words.length]!,
    ).filter((candidate) => candidate.id !== word.id);
    const options = [word, ...distractors]
      .filter(
        (candidate, index, values) =>
          values.findIndex((item) => item.id === candidate.id) === index,
      )
      .slice(0, 4)
      .map((candidate) => ({
        id: candidate.id,
        wordId: candidate.id,
        headword: candidate.headword,
        meaningCn: meaning(candidate),
        partOfSpeech: candidate.meanings[0]?.partOfSpeech,
      }));
    const rotation = questionIndex % options.length;
    const rotatedOptions = [
      ...options.slice(rotation),
      ...options.slice(0, rotation),
    ];
    return {
      word: {
        id: word.id,
        headword: word.headword,
        ukPhonetic: word.ukPhonetic ?? undefined,
        usPhonetic: word.usPhonetic ?? undefined,
      },
      quizData: {
        id: crypto.randomUUID(),
        questionId: crypto.randomUUID(),
        wordId: word.id,
        answerWordId: word.id,
        options: rotatedOptions,
      },
      difficulty: word.meanings.length > 2 ? 'HARD' : 'MEDIUM',
    };
  });
};

export const startVocabularyTest = async (data?: StartTestReqDto) => {
  const questionCount = Math.min(Math.max(data?.questionCount ?? 10, 1), 50);
  const questions = buildQuestions(
    await loadCandidateWords(questionCount),
    questionCount,
  );
  const test: StoredVocabularyTest = {
    id: crypto.randomUUID(),
    questions,
    startedAt: new Date().toISOString(),
  };
  writeTests([test, ...readTests()]);
  return response<StartTestResDto>({
    testId: test.id,
    questions,
    totalCount: questions.length,
    timeLimit: questions.length * 30,
  });
};

export const completeVocabularyTest = async (
  testId: string,
  data: CompleteTestReqDto,
) => {
  const tests = readTests();
  const test = tests.find((candidate) => candidate.id === testId);
  if (!test) throw new Error('测试记录不存在');
  if (test.result && test.completedAt) {
    return response<CompleteTestResDto>({
      ...test.result,
      completedAt: new Date(test.completedAt),
    });
  }

  const correctCount = data.answers.filter(
    (answer) => answer.selectedWordId === answer.answerWordId,
  ).length;
  const totalCount = data.answers.length;
  const ratio = totalCount > 0 ? correctCount / totalCount : 0;
  const timeSpent = data.answers.reduce(
    (total, answer) => total + answer.timeSpent,
    0,
  );
  const completedAt = new Date();
  const result: Omit<CompleteTestResDto, 'completedAt'> = {
    testId,
    score: Math.round(ratio * 100),
    correctCount,
    totalCount,
    level: scoreLevel(ratio),
    estimatedVocabulary: Math.round(500 + ratio * 9_500),
    timeSpent,
  };
  test.completedAt = completedAt.toISOString();
  test.result = result;
  test.answerDetails = data.answers.map((answer) => {
    const question = test.questions.find(
      (candidate) => candidate.word.id === answer.wordId,
    );
    const options = question?.quizData.options ?? [];
    return {
      questionWord: answer.questionWord,
      options: options.map((option) => option.meaningCn),
      userAnswer: Math.max(
        0,
        options.findIndex((option) => option.wordId === answer.selectedWordId),
      ),
      correctAnswer: Math.max(
        0,
        options.findIndex((option) => option.wordId === answer.answerWordId),
      ),
      isCorrect: answer.selectedWordId === answer.answerWordId,
      difficulty: answer.difficulty,
      timeSpent: answer.timeSpent,
    };
  });
  writeTests(tests);
  return response<CompleteTestResDto>({ ...result, completedAt });
};

export const getTestHistory = async (params?: GetTestHistoryReqDto) => {
  const page = Math.max(params?.page ?? 1, 1);
  const limit = Math.max(params?.limit ?? 20, 1);
  const completed = readTests().filter(
    (
      test,
    ): test is StoredVocabularyTest & {
      completedAt: string;
      result: Omit<CompleteTestResDto, 'completedAt'>;
    } => Boolean(test.completedAt && test.result),
  );
  const tests: TestHistoryItemDto[] = completed
    .slice((page - 1) * limit, page * limit)
    .map((test) => ({
      id: test.id,
      score: test.result.score,
      correctCount: test.result.correctCount,
      totalCount: test.result.totalCount,
      level: test.result.level,
      estimatedVocabulary: test.result.estimatedVocabulary,
      timeSpent: test.result.timeSpent,
      completedAt: new Date(test.completedAt),
    }));
  return response<GetTestHistoryResDto>({
    tests,
    total: completed.length,
    page,
    limit,
  });
};

export const getTestDetail = async (testId: string) => {
  const test = readTests().find((candidate) => candidate.id === testId);
  if (!test?.result || !test.completedAt) throw new Error('测试记录不存在');
  return response<GetTestDetailResDto>({
    id: test.id,
    score: test.result.score,
    correctCount: test.result.correctCount,
    totalCount: test.result.totalCount,
    level: test.result.level,
    estimatedVocabulary: test.result.estimatedVocabulary,
    timeSpent: test.result.timeSpent,
    startedAt: new Date(test.startedAt),
    completedAt: new Date(test.completedAt),
    answers: test.answerDetails ?? [],
  });
};

export const deleteTest = async (testId: string) => {
  const tests = readTests();
  const next = tests.filter((candidate) => candidate.id !== testId);
  writeTests(next);
  return response({ success: next.length !== tests.length });
};
