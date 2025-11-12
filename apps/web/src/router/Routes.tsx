import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

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
const RedditPostDetail = lazy(() => import('../pages/explore/reddit/post-detail'));
const RedditSaved = lazy(() => import('../pages/explore/reddit/saved'));
const RedditHistory = lazy(() => import('../pages/explore/reddit/history'));
const Articles = lazy(() => import('../pages/common/articles'));
const ArticleDetail = lazy(() => import('../pages/common/articles/article-detail'));

interface RouteMeta {
  requireAuth?: boolean;
}

export interface RouteItem {
  path: string;
  element: React.ReactNode;
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
    ]
  },

]
