import {
  AgentArtifactKind,
  agentClient,
  type AgentArtifactDocument,
  type AgentArtifactSummary,
  type AgentArtifactView,
} from '@sylis/api-client/agent';

import type {
  CreateArticleReqDto,
  CreateArticleResDto,
  GetArticlesReqDto,
  GetArticlesResDto,
} from '@/legacy-dto';

import { loadLegacyArtifact } from '../../agent/api/legacy-artifact-adapter';

type LegacyArticle = CreateArticleResDto;

const articleDocument = (
  document: AgentArtifactDocument,
): Extract<
  AgentArtifactDocument,
  { artifactKind: AgentArtifactKind.ARTICLE }
> => {
  if (document.artifactKind !== AgentArtifactKind.ARTICLE) {
    throw new Error('Agent 产物不是阅读文章');
  }
  return document;
};

const articleContent = (
  document: Extract<
    AgentArtifactDocument,
    { artifactKind: AgentArtifactKind.ARTICLE }
  >,
) =>
  document.sections
    .flatMap((section) => [
      ...(section.heading ? [section.heading] : []),
      ...section.paragraphs,
    ])
    .join('\n\n');

const countWords = (content: string) =>
  content.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.length ?? 0;

const legacyDifficulty = (cefrLevel: string): LegacyArticle['difficulty'] => {
  if (cefrLevel === 'A1' || cefrLevel === 'A2') return 'EASY';
  if (cefrLevel === 'C1' || cefrLevel === 'C2') return 'HARD';
  return 'MEDIUM';
};

const legacyArticleType = (genre: string): LegacyArticle['articleType'] => {
  if (genre === 'NEWS') return 'NEWS';
  if (genre === 'DIALOGUE') return 'CONVERSATION';
  if (genre === 'NARRATIVE') return 'STORY';
  return 'ESSAY';
};

const legacyLength = (wordCount: number): LegacyArticle['length'] => {
  if (wordCount <= 300) return 'SHORT';
  if (wordCount <= 700) return 'MEDIUM';
  return 'LONG';
};

export const legacyArticle = (
  artifact: AgentArtifactSummary | AgentArtifactView,
  documentValue: AgentArtifactDocument,
): LegacyArticle => {
  const document = articleDocument(documentValue);
  const content = articleContent(document);
  const wordCount = countWords(content);
  const currentRevision =
    'revisions' in artifact
      ? (artifact.revisions.find(
          (revision) => revision.id === artifact.currentRevisionId,
        ) ?? artifact.revisions.at(-1))
      : artifact.currentRevision;
  const updatedAt = currentRevision?.createdAt ?? artifact.createdAt;
  return {
    id: artifact.id,
    title: artifact.title,
    content,
    wordCount,
    difficulty: legacyDifficulty(document.cefrLevel),
    articleType: legacyArticleType(document.genre),
    length: legacyLength(wordCount),
    usedWords: document.glossary.map((item) => item.term),
    createdAt: artifact.createdAt,
    updatedAt,
  };
};

/**
 * 创建文章
 */
export const createArticle = async (_params: CreateArticleReqDto) => {
  void _params;
  throw new Error('文章只能通过“生成文章”创建');
};

/**
 * 获取文章列表
 */
export const getArticles = async (params?: GetArticlesReqDto) => {
  const summaries = (await agentClient.artifacts.list()).filter(
    (artifact) => artifact.kind === AgentArtifactKind.ARTICLE,
  );
  const articles = await Promise.all(
    summaries.map(async (summary) => {
      const result = await loadLegacyArtifact(summary);
      return legacyArticle(result.artifact, result.document);
    }),
  );
  const filtered = articles.filter(
    (article) =>
      (!params?.difficulty || article.difficulty === params.difficulty) &&
      (!params?.articleType || article.articleType === params.articleType) &&
      (!params?.length || article.length === params.length) &&
      (!params?.theme || article.theme === params.theme),
  );
  return {
    data: {
      articles: filtered,
      total: filtered.length,
    } satisfies GetArticlesResDto,
    message: 'ok',
    code: 0,
  };
};

/**
 * 获取文章详情
 */
export const getArticleById = async (id: string) => {
  const result = await loadLegacyArtifact(id);
  return {
    data: legacyArticle(result.artifact, result.document),
    message: 'ok',
    code: 0,
  };
};

/**
 * 删除文章
 */
export const deleteArticle = async (_id: string) => {
  void _id;
  throw new Error('当前 Agent 产物不支持删除');
};
