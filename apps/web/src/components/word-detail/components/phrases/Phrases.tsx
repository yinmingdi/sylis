import type { CommonListItem } from '../common-list';
import CommonList from '../common-list';

interface Phrase {
  id: string;
  phraseText: string;
  phraseCn: string;
}

interface PhrasesProps {
  phrases: Phrase[];
}

const Phrases = ({ phrases }: PhrasesProps) => {
  const items: CommonListItem[] = phrases.map((phrase) => ({
    id: phrase.id,
    primary: phrase.phraseText,
    secondary: phrase.phraseCn,
  }));

  return <CommonList items={items} />;
};

export default Phrases;

