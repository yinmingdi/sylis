import type { CommonListItem } from '../common-list';
import CommonList from '../common-list';

interface RealExamSentence {
    id: string;
    sentenceEn: string;
    sentenceCn?: string;
    paper: string;
    level: string;
    year: string;
    examType: string;
}

interface RealExamSentencesProps {
    sentences: RealExamSentence[];
    headword: string;
    onPlayAudio?: (sentence: RealExamSentence) => void;
}

const RealExamSentences = ({ sentences, headword, onPlayAudio }: RealExamSentencesProps) => {
    const items: CommonListItem[] = sentences.map((sentence) => ({
        id: sentence.id,
        primary: sentence.sentenceEn,
        secondary: sentence.sentenceCn,
        metadata: `◆来源: ${sentence.level} ${sentence.year} ${sentence.examType}`,
        highlightWord: headword,
    }));

    const handlePlayAudio = (item: CommonListItem) => {
        const sentence = sentences.find((s) => s.id === item.id);
        if (sentence && onPlayAudio) {
            onPlayAudio(sentence);
        }
    };

    return <CommonList items={items} showAudio onPlayAudio={handlePlayAudio} wordToPlay={headword} />;
};

export default RealExamSentences;

