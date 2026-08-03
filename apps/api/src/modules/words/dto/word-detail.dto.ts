import { ApiProperty } from '@nestjs/swagger';

export class WordDetailResDto {
  @ApiProperty() id: string;
  @ApiProperty() headword: string;
  @ApiProperty({ required: false }) normalizedHeadword?: string;
  @ApiProperty({ required: false }) star?: number;
  @ApiProperty({ required: false }) usPhonetic?: string | null;
  @ApiProperty({ required: false }) ukPhonetic?: string | null;
  @ApiProperty({ required: false }) usAudio?: string | null;
  @ApiProperty({ required: false }) ukAudio?: string | null;

  @ApiProperty({ description: '按词性拆分的标准词元', type: [Object] })
  lexemes?: Array<{
    id: string;
    lexicalCategory: string;
    partOfSpeech: string;
    homographNo: number;
    forms: unknown[];
    senses: unknown[];
  }>;

  @ApiProperty({ description: '按词义拆分的标准释义', type: [Object] })
  senses?: unknown[];

  /** Stable UI projection retained while screens migrate to lexemes/senses. */
  @ApiProperty({ type: [Object] })
  meanings: Array<{
    id?: string;
    partOfSpeech: string;
    meaningCn: string;
    meaningEn?: string;
    source?: 'ECDICT' | 'YOUDAO' | 'AI';
    trust?: string;
    isExperimental?: boolean;
  }>;

  @ApiProperty({ type: [Object] })
  usageExamples?: unknown[];
  @ApiProperty({ type: [Object] }) exampleSentences: unknown[];
  @ApiProperty({ type: [String] }) examTags: string[];
  @ApiProperty({ type: [Object] }) realExamSentences?: unknown[];
  @ApiProperty({ type: [Object] }) collocations?: unknown[];
  @ApiProperty({ type: [Object] }) phrases?: unknown[];
  @ApiProperty({ type: [Object] }) semanticRelations?: unknown[];
  @ApiProperty({ type: [Object] }) synonyms?: unknown[];
  @ApiProperty({ type: [Object] }) wordRelations?: unknown[];
  @ApiProperty({ type: [Object] }) media?: unknown[];
  @ApiProperty({ type: [Object] }) practiceQuestions?: unknown[];
  @ApiProperty({ type: [Object] }) mnemonics?: unknown[];
  @ApiProperty({ required: false, type: Object }) completeness?: unknown;
}
