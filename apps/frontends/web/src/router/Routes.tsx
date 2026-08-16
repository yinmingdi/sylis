import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

import { AppShell } from '../app/layout/app-shell';
import { SessionGuard } from '../app/router/guards';
import { AgentArticlesPage } from '../pages/agent/agent-articles-page';
import { AgentAssetsPage } from '../pages/agent/agent-assets-page';
import { AgentGrammarPage } from '../pages/agent/agent-grammar-page';
import { AgentPage } from '../pages/agent/agent-page';
import { AgentSessionPage } from '../pages/agent/agent-session-page';
import { RecoveryPage } from '../pages/auth/recovery-page';
import { RedditPage as ModernRedditPage } from '../pages/explore/reddit-page';
import { RedditPostPage as ModernRedditPostPage } from '../pages/explore/reddit-post-page';
import { EntryPage } from '../pages/lexicon/entry-page';
import { HeadwordPage } from '../pages/lexicon/headword-page';
import { LexiconSearchPage } from '../pages/lexicon/search-page';
import { SensePage } from '../pages/lexicon/sense-page';
import { AgentSettingsPage } from '../pages/me/agent-settings-page';
import { ConsentsPage } from '../pages/me/consents-page';
import { DataPage } from '../pages/me/data-page';
import { MePage as AccountPage } from '../pages/me/me-page';
import { SessionsPage } from '../pages/me/sessions-page';
import { SettingsPage as AccountSettingsPage } from '../pages/me/settings-page';
import { NotFoundPage } from '../pages/not-found-page';
import { NotebookDetailPage } from '../pages/notebooks/notebook-detail-page';
import { NotebookPage } from '../pages/notebooks/notebook-page';
import { ReadingLibraryPage } from '../pages/reading/library-page';
import { ReadingDocumentPage } from '../pages/reading/reading-document-page';
import { AssessmentPage } from '../pages/study/assessment-page';
import { AssessmentResultPage } from '../pages/study/assessment-result-page';
import { AssessmentSessionPage } from '../pages/study/assessment-session-page';
import { BookEditionPage } from '../pages/study/book-edition-page';
import { BooksPage as StudyBooksPage } from '../pages/study/books-page';
import { ObjectivePage } from '../pages/study/objective-page';
import { TodayPage } from '../pages/study/today-page';

const Login = lazy(() => import('../pages/auth/login'));
const Register = lazy(() => import('../pages/auth/register'));
const Onboarding = lazy(() => import('../pages/auth/onboarding'));
const Layout = lazy(() => import('../layout')); // 引导页
const VocabularyLearning = lazy(() => import('../pages/vocabulary/learning'));
const WordLearning = lazy(() => import('../pages/vocabulary/practice'));
const Ai = lazy(() => import('../pages/ai/index'));
const Explore = lazy(() => import('../pages/explore/index'));
const Me = lazy(() => import('../pages/me/index'));
const Profile = lazy(() => import('../pages/me/profile'));
const BookDetail = lazy(() => import('../pages/common/book-detail'));
const VocabularyBook = lazy(() => import('../pages/common/vocabulary-book'));
const VocabularyTest = lazy(() => import('../pages/me/test'));
const VocabularyTestExam = lazy(() => import('../pages/me/test-exam'));
const VocabularyTestHistory = lazy(() => import('../pages/me/test-history'));
const Settings = lazy(() => import('../pages/me/settings'));
const Books = lazy(() => import('../pages/common/books'));
const Chat = lazy(() => import('../pages/ai/chat'));
const ClozeReading = lazy(() => import('../pages/ai/cloze-reading'));
const GrammarAnalysis = lazy(() => import('../pages/ai/grammar-analysis'));
const WordDetail = lazy(() => import('../pages/common/word-detail'));
const Reddit = lazy(() => import('../pages/explore/reddit'));
const RedditSubreddit = lazy(() => import('../pages/explore/reddit/subreddit'));
const RedditPostDetail = lazy(
  () => import('../pages/explore/reddit/post-detail'),
);
const RedditSaved = lazy(() => import('../pages/explore/reddit/saved'));
const RedditHistory = lazy(() => import('../pages/explore/reddit/history'));
const Articles = lazy(() => import('../pages/common/articles'));
const ArticleDetail = lazy(
  () => import('../pages/common/articles/article-detail'),
);

interface RouteMeta {
  requireAuth?: boolean;
}

export interface RouteItem {
  path?: string;
  element?: React.ReactNode;
  meta?: RouteMeta;
  children?: RouteItem[];
}

export const routes: RouteItem[] = [
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/recover',
    element: <RecoveryPage />,
  },
  {
    path: '/onboarding',
    element: <Onboarding />,
    meta: { requireAuth: true },
  },
  {
    path: '/',
    element: <Layout />,
    meta: { requireAuth: true },
    children: [
      {
        path: '/',
        element: <Navigate to="/vocabulary-learning" replace />,
      },
      {
        path: '/vocabulary-learning',
        element: <VocabularyLearning />,
      },
      {
        path: '/vocabulary-practice',
        element: <WordLearning />,
      },
      {
        path: '/ai',
        element: <Ai />,
      },
      {
        path: '/explore',
        element: <Explore />,
      },
      {
        path: '/me',
        element: <Me />,
      },
      {
        path: '/profile',
        element: <Profile />,
        meta: { requireAuth: true },
      },
      {
        path: '/vocabulary-book',
        element: <VocabularyBook />,
        meta: { requireAuth: true },
      },
      {
        path: '/vocabulary-test',
        element: <VocabularyTest />,
        meta: { requireAuth: true },
      },
      {
        path: '/vocabulary-test-exam',
        element: <VocabularyTestExam />,
        meta: { requireAuth: true },
      },
      {
        path: '/vocabulary-test-history',
        element: <VocabularyTestHistory />,
        meta: { requireAuth: true },
      },
      {
        path: '/settings',
        element: <Settings />,
        meta: { requireAuth: true },
      },
      {
        path: '/books',
        element: <Books />,
        meta: { requireAuth: true },
      },
      {
        path: '/book-detail/:id',
        element: <BookDetail />,
        meta: { requireAuth: true },
      },
      {
        path: '/word-detail/:word',
        element: <WordDetail />,
        meta: { requireAuth: true },
      },
      {
        path: '/chat',
        element: <Chat />,
        meta: { requireAuth: true },
      },
      {
        path: '/cloze-reading/:articleId',
        element: <ClozeReading />,
        meta: { requireAuth: true },
      },
      {
        path: '/grammar-analysis',
        element: <GrammarAnalysis />,
        meta: { requireAuth: true },
      },
      {
        path: '/reddit',
        element: <Reddit />,
        meta: { requireAuth: true },
      },
      {
        path: '/reddit/subreddit/:name',
        element: <RedditSubreddit />,
        meta: { requireAuth: true },
      },
      {
        path: '/reddit/post/:id',
        element: <RedditPostDetail />,
        meta: { requireAuth: true },
      },
      {
        path: '/reddit/saved',
        element: <RedditSaved />,
        meta: { requireAuth: true },
      },
      {
        path: '/reddit/history',
        element: <RedditHistory />,
        meta: { requireAuth: true },
      },
      {
        path: '/articles',
        element: <Articles />,
        meta: { requireAuth: true },
      },
      {
        path: '/articles/:id',
        element: <ArticleDetail />,
        meta: { requireAuth: true },
      },
    ],
  },
  {
    element: <SessionGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/study', element: <TodayPage /> },
          { path: '/study/books', element: <StudyBooksPage /> },
          {
            path: '/study/books/:bookId/editions/:editionId',
            element: <BookEditionPage />,
          },
          {
            path: '/study/objectives/:objectiveId',
            element: <ObjectivePage />,
          },
          { path: '/study/assessments', element: <AssessmentPage /> },
          {
            path: '/study/assessments/:sessionId',
            element: <AssessmentSessionPage />,
          },
          {
            path: '/study/assessments/:sessionId/result',
            element: <AssessmentResultPage />,
          },
          { path: '/lexicon/search', element: <LexiconSearchPage /> },
          { path: '/lexicon/headwords/:id', element: <HeadwordPage /> },
          { path: '/lexicon/entries/:id', element: <EntryPage /> },
          { path: '/lexicon/senses/:id', element: <SensePage /> },
          { path: '/agent', element: <AgentPage /> },
          { path: '/agent/grammar', element: <AgentGrammarPage /> },
          { path: '/agent/articles', element: <AgentArticlesPage /> },
          { path: '/agent/assets', element: <AgentAssetsPage /> },
          {
            path: '/agent/sessions/:sessionId',
            element: <AgentSessionPage />,
          },
          { path: '/explore/reddit', element: <ModernRedditPage /> },
          {
            path: '/explore/reddit/:externalId',
            element: <ModernRedditPostPage />,
          },
          { path: '/reading/:documentId', element: <ReadingDocumentPage /> },
          { path: '/reading/library', element: <ReadingLibraryPage /> },
          { path: '/notebooks', element: <NotebookPage /> },
          {
            path: '/notebooks/:notebookId',
            element: <NotebookDetailPage />,
          },
          { path: '/account', element: <AccountPage /> },
          { path: '/me/settings', element: <AccountSettingsPage /> },
          { path: '/me/agent', element: <AgentSettingsPage /> },
          { path: '/me/sessions', element: <SessionsPage /> },
          { path: '/me/consents', element: <ConsentsPage /> },
          { path: '/me/data', element: <DataPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
