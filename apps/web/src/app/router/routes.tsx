import { createBrowserRouter, Navigate } from "react-router-dom";

import { SessionGuard } from "./guards";
import { AiPage } from "../../pages/ai/ai-page";
import { GrammarPage } from "../../pages/ai/grammar-page";
import { TutorPage } from "../../pages/ai/tutor-page";
import { TutorSessionPage } from "../../pages/ai/tutor-session-page";
import { LoginPage } from "../../pages/auth/login-page";
import { RegisterPage } from "../../pages/auth/register-page";
import { AiReadingPage } from "../../pages/explore/ai-reading-page";
import { ExplorePage } from "../../pages/explore/explore-page";
import { RedditPage } from "../../pages/explore/reddit-page";
import { RedditPostPage } from "../../pages/explore/reddit-post-page";
import { EntryPage } from "../../pages/lexicon/entry-page";
import { HeadwordPage } from "../../pages/lexicon/headword-page";
import { LexiconSearchPage } from "../../pages/lexicon/search-page";
import { SensePage } from "../../pages/lexicon/sense-page";
import { ConsentsPage } from "../../pages/me/consents-page";
import { DataPage } from "../../pages/me/data-page";
import { MePage } from "../../pages/me/me-page";
import { SessionsPage } from "../../pages/me/sessions-page";
import { SettingsPage } from "../../pages/me/settings-page";
import { NotFoundPage } from "../../pages/not-found-page";
import { NotebookDetailPage } from "../../pages/notebooks/notebook-detail-page";
import { NotebookPage } from "../../pages/notebooks/notebook-page";
import { ReadingLibraryPage } from "../../pages/reading/library-page";
import { ReadingDocumentPage } from "../../pages/reading/reading-document-page";
import { AssessmentPage } from "../../pages/study/assessment-page";
import { AssessmentResultPage } from "../../pages/study/assessment-result-page";
import { AssessmentSessionPage } from "../../pages/study/assessment-session-page";
import { BookEditionPage } from "../../pages/study/book-edition-page";
import { BooksPage } from "../../pages/study/books-page";
import { ObjectivePage } from "../../pages/study/objective-page";
import { TodayPage } from "../../pages/study/today-page";
import { AppShell } from "../layout/app-shell";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <SessionGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/study" replace /> },
          { path: "/study", element: <TodayPage /> },
          { path: "/study/books", element: <BooksPage /> },
          {
            path: "/study/books/:bookId/editions/:editionId",
            element: <BookEditionPage />,
          },
          {
            path: "/study/objectives/:objectiveId",
            element: <ObjectivePage />,
          },
          { path: "/study/assessments", element: <AssessmentPage /> },
          {
            path: "/study/assessments/:sessionId",
            element: <AssessmentSessionPage />,
          },
          {
            path: "/study/assessments/:sessionId/result",
            element: <AssessmentResultPage />,
          },
          { path: "/lexicon/search", element: <LexiconSearchPage /> },
          { path: "/lexicon/headwords/:id", element: <HeadwordPage /> },
          { path: "/lexicon/entries/:id", element: <EntryPage /> },
          { path: "/lexicon/senses/:id", element: <SensePage /> },
          { path: "/ai", element: <AiPage /> },
          { path: "/ai/tutor", element: <TutorPage /> },
          { path: "/ai/tutor/:sessionId", element: <TutorSessionPage /> },
          { path: "/ai/grammar", element: <GrammarPage /> },
          { path: "/explore", element: <ExplorePage /> },
          { path: "/explore/reddit", element: <RedditPage /> },
          { path: "/explore/reddit/:externalId", element: <RedditPostPage /> },
          { path: "/explore/ai-reading", element: <AiReadingPage /> },
          { path: "/reading/:documentId", element: <ReadingDocumentPage /> },
          { path: "/reading/library", element: <ReadingLibraryPage /> },
          { path: "/notebooks", element: <NotebookPage /> },
          { path: "/notebooks/:notebookId", element: <NotebookDetailPage /> },
          { path: "/me", element: <MePage /> },
          { path: "/me/settings", element: <SettingsPage /> },
          { path: "/me/sessions", element: <SessionsPage /> },
          { path: "/me/consents", element: <ConsentsPage /> },
          { path: "/me/data", element: <DataPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
