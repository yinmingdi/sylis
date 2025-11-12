// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface SearchWordReqDto {
  keyword: string;
  limit?: number;
}

export interface SearchWordResDto {
  id: string;
  headword: string;
  partOfSpeech?: string;
  translation: string;
}

