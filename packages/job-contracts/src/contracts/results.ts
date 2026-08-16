export interface JobResultRef {
  resultType: string;
  resultId?: string;
  uri?: string;
  contentHash?: string;
  summary?: Readonly<Record<string, string | number | boolean | null>>;
}
