export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export interface UserActor {
  id: string;
  locale: string;
  timezone: string;
  createdAt: string;
}

export interface SessionView {
  actor: UserActor;
  session: {
    id: string;
    audience: "USER";
    authStrength: string;
    expiresAt: string;
  };
  roles: string[];
  csrfToken: string;
}

export interface JobView {
  id: string;
  kind: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  cancelRequestedAt?: string | null;
  errorCode?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface SearchResult {
  headwordId: string;
  displayText: string;
  normalizedText: string;
  entries: Array<{
    entryId: string;
    entryType: string;
    partOfSpeechCode: string;
    homographNo: number;
  }>;
}

export type ExerciseResponse =
  | { responseKind: "CHOICE"; choiceIds: string[] }
  | {
      responseKind: "SHORT_TEXT" | "EXTENDED_TEXT";
      text: string;
      consentRecordId: string;
    }
  | { responseKind: "NO_CAPTURE"; selfReported: boolean };

interface ExerciseExampleView {
  id: string;
  languageTag: string;
  text: string;
  translations: Array<{ id: string; languageTag: string; text: string }>;
}

interface ExerciseMediaView {
  id: string;
  mediaType: string;
  mimeType: string;
  contentUri: string;
  durationMs?: number | null;
}

interface ExerciseMaterialBlockView {
  id: string;
  position: number;
  blockKind: string;
  roleCode: string;
  languageTag?: string | null;
  text?: string | null;
  example?: ExerciseExampleView | null;
  media?: ExerciseMediaView | null;
}

interface ExerciseStimulusBlockView extends ExerciseMaterialBlockView {
  material?: {
    id: string;
    kind: string;
    learningLanguageTag: string;
    supportLanguageTag: string;
    blocks: ExerciseMaterialBlockView[];
  } | null;
}

export interface ExerciseView {
  id: string;
  status: string;
  presentedAt: string;
  exercise: {
    id: string;
    taskKind: string;
    responseKind: ExerciseResponse["responseKind"];
    responseCardinality: string;
    responsePlacement: string;
    prompt: { languageTag: string; text: string };
    instructions?: string;
    maxScore: number;
    responseConfig?: {
      minSelections?: number | null;
      maxSelections?: number | null;
      minCharacters?: number | null;
      maxCharacters?: number | null;
      minWords?: number | null;
      maxWords?: number | null;
    } | null;
    choices: Array<{ id: string; text: string; languageTag: string }>;
    stimuli: Array<{
      roleCode: string;
      stimulusRevision: {
        id: string;
        blocks: ExerciseStimulusBlockView[];
      };
    }>;
  };
}
