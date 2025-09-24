import { useNavigate } from 'react-router-dom';

import Books from '../../components/books';
import PageHeader from '../../components/page-header';

export default function Onboarding() {
  const navigate = useNavigate();

  const handleBookSelected = () => {
    // 选书完成后跳转到单词页面
    navigate('/vocabulary-learning');
  };

  return (
    <div>
      <PageHeader
        title="选择词书"
        onBack={() => navigate(-1)}
        showBack={true}
      />
      <Books
        onBookSelected={handleBookSelected}
        showHeader={false}
        title="选择你要学习的词书"
      />
    </div>
  );
}
