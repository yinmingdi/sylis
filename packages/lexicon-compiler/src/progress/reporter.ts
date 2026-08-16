export enum CompileStage {
  PREFLIGHT = "PREFLIGHT",
  SOURCE_RECORDS = "SOURCE_RECORDS",
  NORMALIZE = "NORMALIZE",
  HEADWORD_RESOLUTION = "HEADWORD_RESOLUTION",
  ENTRY_RESOLUTION = "ENTRY_RESOLUTION",
  FORM_PROJECTION = "FORM_PROJECTION",
  SENSE_ALIGNMENT = "SENSE_ALIGNMENT",
  CONCEPT_CLUSTERING = "CONCEPT_CLUSTERING",
  CONTENT_BINDING = "CONTENT_BINDING",
  RELATION_RESOLUTION = "RELATION_RESOLUTION",
  MORPH_SYNSEM_ETYMOLOGY = "MORPH_SYNSEM_ETYMOLOGY",
  FACT_GAP_FILL = "FACT_GAP_FILL",
  OBJECTIVE_PLANNING = "OBJECTIVE_PLANNING",
  PEDAGOGICAL_MATERIALS = "PEDAGOGICAL_MATERIALS",
  EXERCISES_BLUEPRINTS = "EXERCISES_BLUEPRINTS",
  GLOBAL_VALIDATION = "GLOBAL_VALIDATION",
  EXPORT = "EXPORT",
}

export interface CompileProgressEvent {
  stage: CompileStage;
  processed: number;
  total: number | null;
  message?: string;
  aiInputTokens?: number;
  aiOutputTokens?: number;
  aiCostMicros?: number;
}

export interface CompileProgressPort {
  report(event: CompileProgressEvent): void | Promise<void>;
}

export const silentProgress: CompileProgressPort = { report: () => undefined };

export function createConsoleProgress(): CompileProgressPort {
  return {
    report(event) {
      const total = event.total === null ? "?" : String(event.total);
      const details = event.message ? ` ${event.message}` : "";
      const ai =
        event.aiInputTokens === undefined
          ? ""
          : ` input=${event.aiInputTokens} output=${event.aiOutputTokens ?? 0} costMicros=${event.aiCostMicros ?? 0}`;
      process.stderr.write(
        `[lexicon-compiler] ${event.stage} ${event.processed}/${total}${details}${ai}\n`,
      );
    },
  };
}
