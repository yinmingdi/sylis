import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

const Login = lazy(() => import('../pages/login'));
const Register = lazy(() => import('../pages/register'));
const Onboarding = lazy(() => import('../pages/onboarding'));
const Layout = lazy(() => import('../layout')); // 引导页
const VocabularyLearning = lazy(() => import('../pages/vocabulary-learning'));
const WordLearning = lazy(() => import('../pages/vocabulary-practice'));
const Ai = lazy(() => import('../pages/ai'));
const Reading = lazy(() => import('../pages/reading'));
const Me = lazy(() => import('../pages/me'));
const Profile = lazy(() => import('../pages/profile'));
const BookDetail = lazy(() => import('../pages/book-detail'));
const VocabularyBook = lazy(() => import('../pages/vocabulary-book'));
const Test = lazy(() => import('../pages/test'));
const Settings = lazy(() => import('../pages/settings/index'));
const Books = lazy(() => import('../pages/books'));
const Chat = lazy(() => import('../pages/chat'));
const StoryVocabulary = lazy(() => import('../pages/story-vocabulary'));
const ClozeTest = lazy(() => import('../pages/cloze-test'));
const AITest = lazy(() => import('../pages/ai-test'));
const GrammarAnalysis = lazy(() => import('../pages/grammar-analysis'));
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
        path: '/reading',
        element: <Reading />,
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
        path: '/test',
        element: <Test />,
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
        path: '/chat',
        element: <Chat />,
        meta: { requireAuth: true },
      },
      {
        path: '/story-vocabulary',
        element: <StoryVocabulary />,
        meta: { requireAuth: true },
      },
      {
        path: '/cloze-test',
        element: <ClozeTest />,
        meta: { requireAuth: true },
      },
      {
        path: '/ai-test',
        element: <AITest />,
        meta: { requireAuth: true },
      },
      {
        path: '/grammar-analysis',
        element: <GrammarAnalysis />,
        meta: { requireAuth: true },
      },
    ]
  },

]
