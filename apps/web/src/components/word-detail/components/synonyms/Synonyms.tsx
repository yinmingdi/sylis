import type { CommonListItem } from '../common-list';
import CommonList from '../common-list';

interface Synonym {
  id: string;
  partOfSpeech: string;
  meaningCn: string;
  synonymText: string;
}

interface SynonymsProps {
  synonyms: Synonym[];
}

const Synonyms = ({ synonyms }: SynonymsProps) => {
  // 将近义词数据转换为 CommonList 格式
  const items: CommonListItem[] = synonyms.map((synonym) => ({
    id: synonym.id,
    primary: synonym.synonymText,
    secondary: `${synonym.partOfSpeech}. ${synonym.meaningCn}`,
  }));

  return <CommonList items={items} />;
};

export default Synonyms;

