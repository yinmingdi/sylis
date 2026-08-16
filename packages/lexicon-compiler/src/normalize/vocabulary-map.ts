const POS_MAP: Record<string, string> = {
  n: "lexinfo:noun",
  noun: "lexinfo:noun",
  v: "lexinfo:verb",
  verb: "lexinfo:verb",
  vt: "lexinfo:transitiveVerb",
  vi: "lexinfo:intransitiveVerb",
  adj: "lexinfo:adjective",
  adjective: "lexinfo:adjective",
  adv: "lexinfo:adverb",
  adverb: "lexinfo:adverb",
  prep: "lexinfo:preposition",
  preposition: "lexinfo:preposition",
  pron: "lexinfo:pronoun",
  pronoun: "lexinfo:pronoun",
  conj: "lexinfo:conjunction",
  conjunction: "lexinfo:conjunction",
  det: "lexinfo:determiner",
  determiner: "lexinfo:determiner",
  num: "lexinfo:numeral",
  numeral: "lexinfo:numeral",
  int: "lexinfo:interjection",
  interjection: "lexinfo:interjection",
  phrase: "lexinfo:phraseologicalUnit",
  affix: "lexinfo:affix",
};

export function normalizePartOfSpeech(value: string | undefined): string {
  const key = (value ?? "").trim().toLowerCase().replace(/\.$/, "");
  return POS_MAP[key] ?? (key ? `source:${key}` : "source:unknown");
}

const EXCHANGE_FEATURES: Record<string, { feature: string; value: string }> = {
  p: { feature: "lexinfo:tense", value: "lexinfo:past" },
  d: { feature: "lexinfo:verbFormMood", value: "lexinfo:participle" },
  i: { feature: "lexinfo:verbFormMood", value: "lexinfo:presentParticiple" },
  "3": { feature: "lexinfo:person", value: "lexinfo:thirdPerson" },
  s: { feature: "lexinfo:number", value: "lexinfo:plural" },
  r: { feature: "lexinfo:degree", value: "lexinfo:comparative" },
  t: { feature: "lexinfo:degree", value: "lexinfo:superlative" },
};

export function mapExchangeFeature(
  key: string,
): { feature: string; value: string } | undefined {
  return EXCHANGE_FEATURES[key];
}

const WIKTEXTRACT_FEATURES: Record<string, { feature: string; value: string }> =
  {
    plural: { feature: "lexinfo:number", value: "lexinfo:plural" },
    singular: { feature: "lexinfo:number", value: "lexinfo:singular" },
    past: { feature: "lexinfo:tense", value: "lexinfo:past" },
    "past-participle": {
      feature: "lexinfo:verbFormMood",
      value: "lexinfo:participle",
    },
    "present-participle": {
      feature: "lexinfo:verbFormMood",
      value: "lexinfo:presentParticiple",
    },
    comparative: { feature: "lexinfo:degree", value: "lexinfo:comparative" },
    superlative: { feature: "lexinfo:degree", value: "lexinfo:superlative" },
  };

export function mapWiktextractFeatures(
  tags: string[],
): Array<{ feature: string; value: string }> {
  return tags.flatMap((tag) => {
    const mapped = WIKTEXTRACT_FEATURES[tag.toLowerCase()];
    return mapped ? [mapped] : [];
  });
}
