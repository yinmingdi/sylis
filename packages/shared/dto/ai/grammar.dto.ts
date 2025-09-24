// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { GrammarTag } from "./types/grammar.types";

// Function call 返回的原始数据结构
export interface GrammarAnalysisFunctionCallResult {
  sentence: string;
  translation: string;
  aiExplanation: string;
  grammarAnalysis: Array<{
    component: string;
    text: string;
    explanation: string;
  }>;
  phraseAccumulation: string[];
}

export interface ParseGrammarReqDto {
  sentence: string;
  analysisLevel?: "basic" | "detailed" | "comprehensive";
  includePhrases?: boolean;
  includeClauses?: boolean;
  learnerLevel?: "beginner" | "intermediate" | "advanced";
}

export interface ParseMultipleGrammarReqDto {
  sentences: string[];
  analysisLevel?: "basic" | "detailed" | "comprehensive";
  includePhrases?: boolean;
  includeClauses?: boolean;
  learnerLevel?: "beginner" | "intermediate" | "advanced";
}

export interface WordGrammarAnalysisDto {
  word: string;
  position: number;
  startIndex: number;
  endIndex: number;
  partOfSpeech: GrammarTag;
  syntacticRole: GrammarTag;
  confidence: number;
  explanation: string;
  phraseGroup?: {
    type: GrammarTag;
    startPosition: number;
    endPosition: number;
    headPosition: number;
  };
}

export interface PhraseAnalysisDto {
  type: GrammarTag;
  text: string;
  startPosition: number;
  endPosition: number;
  head: string;
  modifiers: string[];
}

export interface ClauseAnalysisDto {
  type: GrammarTag;
  text: string;
  startPosition: number;
  endPosition: number;
  subject?: string;
  predicate?: string;
}

export interface SentenceGrammarAnalysisDto {
  sentence: string;
  sentenceType: "declarative" | "interrogative" | "imperative" | "exclamatory";
  sentenceStructure: "simple" | "compound" | "complex" | "compound-complex";
  words: WordGrammarAnalysisDto[];
  phrases: PhraseAnalysisDto[];
  clauses: ClauseAnalysisDto[];
  overallConfidence: number;
  summary: string;
}

export interface ParseGrammarResDto {
  analysis: SentenceGrammarAnalysisDto;
  processingTime: number;
  success: boolean;
  message: string;
  error?: string;
  // 新增字段用于前端显示
  translation?: string;
  aiExplanation?: string;
  grammarAnalysis?: Array<{
    component: string;
    text: string;
    explanation: string;
  }>;
  phraseAccumulation?: string[];
}

export interface ParseMultipleGrammarResDto {
  analyses: SentenceGrammarAnalysisDto[];
  totalProcessingTime: number;
  successCount: number;
  failureCount: number;
  success: boolean;
  message: string;
  errors?: string[];
}
