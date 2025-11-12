import { useNavigate } from 'react-router-dom';

import { AppBar } from '../../../components/app-bar';
import Books from '../../../components/books';
import { PageView } from '../../../components/view';

export default function Onboarding() {
  const navigate = useNavigate();

  const handleBookSelected = () => {
    // 选书完成后跳转到单词页面
    navigate('/vocabulary-learning');
  };

  return (
    <PageView
      appBar={
        <AppBar
          title="选择词书"
          onBack={() => navigate(-1)}
          automaticallyImplyLeading={true}
        />
      }
    >
      <Books
        onBookSelected={handleBookSelected}
        showHeader={false}
        title="选择你要学习的词书"
      />
    </PageView>
  );
}
