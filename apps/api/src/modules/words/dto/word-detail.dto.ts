import { ApiProperty } from '@nestjs/swagger';

/**
 * 单词详情响应 DTO
 */
export class WordDetailResDto {
  @ApiProperty({ description: '单词ID' })
  id: string;

  @ApiProperty({ description: '单词' })
  headword: string;

  @ApiProperty({ description: '美式音标', required: false })
  usPhonetic?: string | null;

  @ApiProperty({ description: '英式音标', required: false })
  ukPhonetic?: string | null;

  @ApiProperty({ description: '词义列表', type: [Object] })
  meanings: {
    partOfSpeech: string;
    meaningCn: string;
    source?: 'LEGACY' | 'ECDICT' | 'DERIVED' | 'AI';
  }[];

  @ApiProperty({ description: '例句列表', type: [Object] })
  exampleSentences: {
    id: string;
    sentenceEn: string;
    sentenceCn: string;
    headword: string;
    source?: 'LEGACY' | 'ECDICT' | 'DERIVED' | 'AI';
  }[];

  @ApiProperty({ description: '考试标签', type: [String] })
  examTags: string[];

  @ApiProperty({
    description: '真题例句列表',
    type: [Object],
    required: false,
  })
  realExamSentences?: {
    id: string;
    sentenceEn: string;
    sentenceCn?: string;
    paper: string;
    level: string;
    year: string;
    examType: string;
    source?: 'LEGACY' | 'ECDICT' | 'DERIVED' | 'AI';
  }[];

  @ApiProperty({ description: '短语列表', type: [Object] })
  phrases: {
    id: string;
    phraseText: string;
    phraseCn: string;
    source?: 'LEGACY' | 'ECDICT' | 'DERIVED' | 'AI';
  }[];

  @ApiProperty({ description: '近义词列表', type: [Object] })
  synonyms: {
    id: string;
    partOfSpeech: string;
    meaningCn: string;
    synonymText: string;
    source?: 'LEGACY' | 'ECDICT' | 'DERIVED' | 'AI';
  }[];

  @ApiProperty({ description: '同根词列表', type: [Object] })
  wordRelations: {
    id: string;
    relatedWord: string;
    meaningCn: string;
    pos?: string;
    relationType?: string;
    source?: 'LEGACY' | 'ECDICT' | 'DERIVED' | 'AI';
  }[];
}
