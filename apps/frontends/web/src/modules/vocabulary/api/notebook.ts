import { apiClient, LexicalTargetKind } from '@sylis/api-client/user';

import type {
  AddWordToNotebookReqDto,
  AddWordToNotebookResDto,
  CollectedWordItemDto,
  CreateNotebookReqDto,
  GetNotebookWordsReqDto,
  GetNotebookWordsResDto,
  GetNotebooksResDto,
  NotebookItemDto,
  UpdateCollectedWordReqDto,
} from '@/legacy-dto';

import { fetchLegacyWordDetail } from './modern-word-adapter';

type DataRecord = Record<string, unknown>;

const LEARNED_TAG = 'sylis:learned';
const response = <T>(data: T) => ({ data, message: 'ok', code: 0 });
const asRecord = (value: unknown): DataRecord =>
  value && typeof value === 'object' ? (value as DataRecord) : {};
const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const valueText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const valueNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const notebookView = (value: unknown): NotebookItemDto => {
  const notebook = asRecord(value);
  const count = asRecord(notebook._count);
  return {
    id: valueText(notebook.id),
    name: valueText(notebook.name),
    description: valueText(notebook.description) || undefined,
    isDefault: notebook.isDefault === true,
    wordCount: valueNumber(count.items),
    createdAt: new Date(valueText(notebook.createdAt)),
    updatedAt: new Date(valueText(notebook.updatedAt)),
  };
};

const listNotebooks = async (): Promise<NotebookItemDto[]> =>
  asArray(await apiClient.notebooks.list()).map(notebookView);

const defaultNotebook = async (): Promise<NotebookItemDto> => {
  const notebooks = await listNotebooks();
  const notebook = notebooks.find((item) => item.isDefault) ?? notebooks[0];
  if (!notebook) throw new Error('请先创建生词本');
  return notebook;
};

const notebookItems = async (id: string): Promise<DataRecord[]> =>
  asArray(await apiClient.notebooks.items(id)).map(asRecord);

const collectedWordView = async (
  item: DataRecord,
): Promise<CollectedWordItemDto> => {
  const targetId = valueText(item.targetId);
  const displayText = valueText(item.displayText);
  const tags = asArray(item.tags)
    .map((tag) => valueText(tag))
    .filter(Boolean);
  const detail = await fetchLegacyWordDetail(targetId || displayText).catch(
    () => null,
  );

  return {
    id: valueText(item.id),
    wordId: targetId,
    headword: detail?.headword ?? displayText,
    phonetic: detail?.usPhonetic ?? detail?.ukPhonetic ?? undefined,
    meanings: detail?.meanings ?? [],
    source: valueText(item.source) || undefined,
    context: valueText(item.context) || undefined,
    note: valueText(item.note) || undefined,
    tags: tags.filter((tag) => tag !== LEARNED_TAG),
    isMarkedAsLearned: tags.includes(LEARNED_TAG),
    reviewCount: 0,
    addedAt: new Date(valueText(item.addedAt)),
    lastReviewedAt: undefined,
    proficiencyScore: 0,
    proficiencyLevel: 'NEW',
    difficultyScore: 0,
    difficultyLevel: 'UNKNOWN',
    accuracyRate: 0,
    learningStatus: 'NEW',
  };
};

export const vocabularyNotebookApi = {
  async getNotebooks() {
    const notebooks = await listNotebooks();
    return response<GetNotebooksResDto>({ notebooks, total: notebooks.length });
  },

  async createNotebook(data: CreateNotebookReqDto) {
    return response(
      notebookView(
        await apiClient.notebooks.create({
          name: data.name,
          description: data.description,
        }),
      ),
    );
  },

  async getNotebookById(id: string) {
    return response(notebookView(await apiClient.notebooks.get(id)));
  },

  async updateNotebook(id: string, data: Partial<CreateNotebookReqDto>) {
    const current = notebookView(await apiClient.notebooks.get(id));
    await apiClient.notebooks.update(id, {
      name: data.name ?? current.name,
      description: data.description ?? current.description,
    });
    return response({ success: true });
  },

  async deleteNotebook(id: string) {
    await apiClient.notebooks.remove(id);
    return response({ success: true });
  },

  async getNotebookWords(id: string, params: GetNotebookWordsReqDto = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, params.limit ?? 20);
    let items = await notebookItems(id);
    if (params.isMarkedAsLearned !== undefined) {
      items = items.filter(
        (item) =>
          asArray(item.tags)
            .map((tag) => valueText(tag))
            .includes(LEARNED_TAG) === params.isMarkedAsLearned,
      );
    }
    if (params.source) {
      items = items.filter((item) => valueText(item.source) === params.source);
    }
    const total = items.length;
    const selected = items.slice((page - 1) * limit, page * limit);
    const words = await Promise.all(selected.map(collectedWordView));
    return response<GetNotebookWordsResDto>({ words, total, page, limit });
  },

  async addWordToNotebook(id: string, data: AddWordToNotebookReqDto) {
    const item = asRecord(
      await apiClient.notebooks.add(id, {
        target: { kind: LexicalTargetKind.HEADWORD, id: data.wordId },
        note: data.note ?? data.context,
        tags: data.tags,
      }),
    );
    return response<AddWordToNotebookResDto>({
      success: true,
      collectedWordId: valueText(item.id),
    });
  },

  async addWordToDefaultNotebook(data: AddWordToNotebookReqDto) {
    const notebook = await defaultNotebook();
    return this.addWordToNotebook(notebook.id, data);
  },

  async isWordInDefaultNotebook(wordId: string) {
    const notebook = await defaultNotebook();
    const items = await notebookItems(notebook.id);
    return items.some(
      (candidate) =>
        valueText(candidate.id) === wordId ||
        valueText(candidate.targetId) === wordId,
    );
  },

  async removeWordFromDefaultNotebook(wordId: string) {
    const notebook = await defaultNotebook();
    const items = await notebookItems(notebook.id);
    const item = items.find(
      (candidate) =>
        valueText(candidate.id) === wordId ||
        valueText(candidate.targetId) === wordId,
    );
    if (item)
      await apiClient.notebooks.removeItem(notebook.id, valueText(item.id));
    return response({ success: true });
  },

  async updateCollectedWord(
    notebookId: string,
    wordId: string,
    data: UpdateCollectedWordReqDto,
  ) {
    const items = await notebookItems(notebookId);
    const item = items.find(
      (candidate) =>
        valueText(candidate.id) === wordId ||
        valueText(candidate.targetId) === wordId,
    );
    if (!item) throw new Error('生词本中没有这个单词');
    const currentTags = asArray(item.tags)
      .map((tag) => valueText(tag))
      .filter(Boolean);
    const visibleTags =
      data.tags ?? currentTags.filter((tag) => tag !== LEARNED_TAG);
    const learned = data.isMarkedAsLearned ?? currentTags.includes(LEARNED_TAG);
    await apiClient.notebooks.updateItem(notebookId, valueText(item.id), {
      note: (data.note ?? data.context ?? valueText(item.note)) || undefined,
      tags: learned ? [...new Set([...visibleTags, LEARNED_TAG])] : visibleTags,
    });
    return response({ success: true });
  },

  async removeWordFromNotebook(notebookId: string, wordId: string) {
    const items = await notebookItems(notebookId);
    const item = items.find(
      (candidate) =>
        valueText(candidate.id) === wordId ||
        valueText(candidate.targetId) === wordId,
    );
    if (item)
      await apiClient.notebooks.removeItem(notebookId, valueText(item.id));
    return response({ success: true });
  },

  async getNotebookStats(id: string) {
    const items = await notebookItems(id);
    const learnedCount = items.filter((item) =>
      asArray(item.tags)
        .map((tag) => valueText(tag))
        .includes(LEARNED_TAG),
    ).length;
    return response({
      total: items.length,
      learnedCount,
      unlearnedCount: items.length - learnedCount,
      bySource: [],
    });
  },
};
