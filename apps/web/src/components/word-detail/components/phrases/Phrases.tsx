import type { CommonListItem } from '../common-list';
import CommonList from '../common-list';

interface Phrase {
  id: string;
  phraseText: string;
  phraseCn: string;
  source?: 'ECDICT' | 'YOUDAO' | 'AI';
}

interface PhrasesProps {
  phrases: Phrase[];
}

const Phrases = ({ phrases }: PhrasesProps) => {
  const items: CommonListItem[] = phrases.map((phrase) => ({
    id: phrase.id,
    primary: phrase.phraseText,
    secondary: phrase.phraseCn,
    source: phrase.source,
  }));

  return <CommonList items={items} />;
};

export default Phrases;
