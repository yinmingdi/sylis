// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface AddWordToNotebookReqDto {
  wordId: string;
  source?: CollectionSource;
  context?: string;
  note?: string;
  tags?: string[];
}

export interface AddWordToNotebookResDto {
  success: boolean;
  collectedWordId: string;
}

export enum CollectionSource {
  MANUAL = 'MANUAL',
  READING = 'READING',
  QUIZ = 'QUIZ',
  AI_CHAT = 'AI_CHAT',
  LISTENING = 'LISTENING',
  WRITING = 'WRITING',
}
