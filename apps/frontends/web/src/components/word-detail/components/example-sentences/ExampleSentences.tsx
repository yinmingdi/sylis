import type { CommonListItem } from '../common-list';
import CommonList from '../common-list';

interface ExampleSentence {
  id: string;
  sentenceEn: string;
  sentenceCn: string;
  headword: string;
  source?: 'ECDICT' | 'YOUDAO' | 'AI';
}

interface ExampleSentencesProps {
  sentences: ExampleSentence[];
  onPlayAudio?: (sentence: ExampleSentence) => void;
}

const ExampleSentences = ({
  sentences,
  onPlayAudio,
}: ExampleSentencesProps) => {
  const items: CommonListItem[] = sentences.map((sentence) => ({
    id: sentence.id,
    primary: sentence.sentenceEn,
    secondary: sentence.sentenceCn,
    highlightWord: sentence.headword,
    source: sentence.source,
  }));

  const handlePlayAudio = (item: CommonListItem) => {
    const sentence = sentences.find((s) => s.id === item.id);
    if (sentence && onPlayAudio) {
      onPlayAudio(sentence);
    }
  };

  return (
    <CommonList
      items={items}
      showAudio
      onPlayAudio={handlePlayAudio}
      wordToPlay={sentences[0]?.headword}
    />
  );
};

export default ExampleSentences;
