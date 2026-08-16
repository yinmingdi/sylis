import {
  apiClient,
  ExerciseResponseKind,
  StudyProgressEventKind,
  StudyRecognitionDecision,
  type ExerciseResponse,
  type StudyItemProgressView,
} from '@sylis/api-client/user';

import {
  FirstRoundChoice,
  WordLearningStatus,
  type DailyPlanWordDto,
  type GetDailyPlanResDto,
  type UpdateWordStatusReqDto,
} from '@/legacy-dto';

import { fetchLegacyWordDetail } from '../../vocabulary/api/modern-word-adapter';

type DataRecord = Record<string, unknown>;

const asRecord = (value: unknown): DataRecord =>
  value && typeof value === 'object' ? (value as DataRecord) : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export interface StoredProgress {
  firstRoundChoice: FirstRoundChoice;
  correctCount: number;
  requiredCorrectCount: number;
  isCompletedToday: boolean;
}

const todayLocalDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const normalizedAnswer = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('en');

const legacyRecognitionDecision = (value: unknown): FirstRoundChoice => {
  switch (value) {
    case StudyRecognitionDecision.RECOGNIZED:
      return FirstRoundChoice.RECOGNIZED;
    case StudyRecognitionDecision.NOT_RECOGNIZED:
      return FirstRoundChoice.NOT_RECOGNIZED;
    default:
      return FirstRoundChoice.NOT_STARTED;
  }
};

const studyRecognitionDecision = (
  value: FirstRoundChoice,
): StudyRecognitionDecision => {
  switch (value) {
    case FirstRoundChoice.RECOGNIZED:
      return StudyRecognitionDecision.RECOGNIZED;
    case FirstRoundChoice.NOT_RECOGNIZED:
      return StudyRecognitionDecision.NOT_RECOGNIZED;
    default:
      return StudyRecognitionDecision.NOT_STARTED;
  }
};

const legacyProgress = (value: StudyItemProgressView): StoredProgress => ({
  firstRoundChoice: legacyRecognitionDecision(value.recognitionDecision),
  correctCount: value.correctCount,
  requiredCorrectCount: value.requiredCorrectCount,
  isCompletedToday: value.isCompletedToday,
});

const submitCanonicalPracticeResponse = async (
  input: UpdateWordStatusReqDto,
): Promise<{ attemptId: string; isCorrect: boolean }> => {
  if (!input.planItemId) throw new Error('学习计划项缺失，请刷新后重试');

  const attempt = await apiClient.study.createAttempt(
    input.planItemId,
    crypto.randomUUID(),
  );
  const { exercise } = attempt;
  let response: ExerciseResponse;

  if (exercise.responseKind === ExerciseResponseKind.CHOICE) {
    const requestedAnswer = normalizedAnswer(
      input.answerText ?? input.wordHeadword ?? '',
    );
    const matchingChoice = exercise.choices.find(
      (choice) => normalizedAnswer(choice.text) === requestedAnswer,
    );
    const fallbackChoice = input.isCorrect
      ? undefined
      : exercise.choices.find(
          (choice) =>
            normalizedAnswer(choice.text) !==
            normalizedAnswer(input.wordHeadword ?? ''),
        );
    const selectedChoice = matchingChoice ?? fallbackChoice;
    if (!selectedChoice) {
      throw new Error('当前练习与旧版选择题不兼容，请刷新后重试');
    }
    response = {
      responseKind: ExerciseResponseKind.CHOICE,
      choiceIds: [selectedChoice.id],
    };
  } else {
    throw new Error('当前练习需要先揭示参考内容，请使用新版答题控件');
  }

  const submitted = (await apiClient.study.submitResponse(
    attempt.id,
    response,
    crypto.randomUUID(),
  )) as Record<string, unknown>;
  const serverCorrect = submitted.correct;
  return {
    attemptId: attempt.id,
    isCorrect:
      typeof serverCorrect === 'boolean'
        ? serverCorrect
        : input.isCorrect === true,
  };
};

export async function fetchLegacyDailyPlan(
  bookId: string,
): Promise<GetDailyPlanResDto> {
  const [enrollmentsValue, planValue] = await Promise.all([
    apiClient.books.enrollments(),
    apiClient.study.today(),
  ]);
  const enrollments = asArray(enrollmentsValue).map(asRecord);
  const enrollment =
    enrollments.find(
      (item) => item.bookId === bookId && item.active === true,
    ) ?? enrollments.find((item) => item.active === true);
  if (!enrollment) throw new Error('请先选择学习书籍');

  const editionId = text(enrollment.editionId);
  const dailyLimit = Math.max(number(enrollment.dailyNewLimit, 20), 1);
  const editionEnvelope = await apiClient.books.edition(
    text(enrollment.bookId, bookId),
    editionId,
    -1,
    Math.min(Math.max(dailyLimit, 20), 100),
  );
  const edition = asRecord(asRecord(editionEnvelope).data);
  const editionItems = asArray(edition.items)
    .map(asRecord)
    .sort((left, right) => number(left.position) - number(right.position));
  const plan = asRecord(planValue);
  const planItems = asArray(plan.items)
    .map(asRecord)
    .sort((left, right) => number(left.position) - number(right.position));
  const date = text(plan.localDate, todayLocalDate());

  const words = await Promise.all(
    planItems.map(async (planItem, index) => {
      const bookItem = editionItems[index];
      const targetId = text(bookItem?.targetId);
      if (!targetId) return null;
      const detail = await fetchLegacyWordDetail(targetId);
      const completed = Boolean(planItem.completedAt);
      const progress = {
        firstRoundChoice: completed
          ? FirstRoundChoice.RECOGNIZED
          : legacyRecognitionDecision(planItem.recognitionDecision),
        correctCount: completed ? 1 : number(planItem.correctStreak),
        requiredCorrectCount: number(planItem.requiredCorrectCount, 1),
        isCompletedToday: completed,
      };
      return {
        ...detail,
        planItemId: text(planItem.id),
        objectiveRevisionId: text(planItem.objectiveRevisionId),
        star: 0,
        status: completed
          ? WordLearningStatus.MASTERED
          : WordLearningStatus.NEW,
        easeFactor: 2.5,
        repetition: 0,
        dailyProgress: progress,
        isCollected: false,
      } as DailyPlanWordDto;
    }),
  );
  const availableWords = words.filter(
    (word): word is DailyPlanWordDto => word !== null,
  );
  const options = availableWords.map((word, index) => ({
    id: `${word.id}:${index}`,
    wordId: word.id,
    headword: word.headword,
    meaningCn: word.meanings[0]?.meaningCn ?? '',
    partOfSpeech: word.meanings[0]?.partOfSpeech,
  }));
  const enriched = availableWords.map((word, index) => {
    const distractors = options.filter((option) => option.wordId !== word.id);
    const selected = [options[index], ...distractors]
      .filter(Boolean)
      .slice(0, 4);
    return {
      ...word,
      quizChoice: {
        id: `choice:${word.id}`,
        questionId: `question:${word.id}`,
        wordId: word.id,
        answerWordId: word.id,
        options: selected,
      },
    } as DailyPlanWordDto;
  });

  const newWords = enriched.filter((_word, index) => {
    const item = planItems[index];
    return text(item?.mode, 'NEW') === 'NEW';
  });
  const reviewWords = enriched.filter((_word, index) => {
    const item = planItems[index];
    return text(item?.mode) === 'REVIEW';
  });

  return {
    newWords,
    reviewWords,
    plannedNewCount: newWords.length,
    plannedReviewCount: reviewWords.length,
    completedNewCount: newWords.filter(
      (word) => word.dailyProgress?.isCompletedToday,
    ).length,
    completedReviewCount: reviewWords.filter(
      (word) => word.dailyProgress?.isCompletedToday,
    ).length,
    date,
  };
}

export async function persistLegacyWordProgress(
  input: UpdateWordStatusReqDto,
): Promise<StoredProgress> {
  if (!input.planItemId) throw new Error('学习计划项缺失，请刷新后重试');

  if (input.firstRoundChoice !== undefined) {
    const progress = await apiClient.study.updateProgress(input.planItemId, {
      eventKind: StudyProgressEventKind.RECOGNITION,
      recognitionDecision: studyRecognitionDecision(input.firstRoundChoice),
    });
    return legacyProgress(progress);
  }

  if (input.isCorrect === undefined) {
    throw new Error('学习进度事件缺少答题结果');
  }
  const canonical = await submitCanonicalPracticeResponse(input);
  const progress = await apiClient.study.updateProgress(input.planItemId, {
    eventKind: StudyProgressEventKind.ANSWER,
    correct: canonical.isCorrect,
  });
  if (progress.readyForReview) {
    await apiClient.study.submitReview(
      canonical.attemptId,
      canonical.isCorrect ? 3 : 1,
      crypto.randomUUID(),
    );
  }
  return legacyProgress(progress);
}
