import {
  BookOpen,
  MessageSquareText,
  Search,
  WandSparkles,
} from '@sylis/components';
import { Link } from 'react-router-dom';

export function ExplorePage() {
  return (
    <div className="page explore-home">
      <div className="mobile-page-heading mobile-page-heading--centered">
        <h1>探索英语世界</h1>
        <p>在真实语境中沉浸式学习英语</p>
      </div>
      <div className="feature-index explore-index">
        <Link to="/lexicon/search">
          <Search />
          <strong>词典</strong>
          <span>查询词条、义项与常用搭配</span>
        </Link>
        <Link to="/explore/reddit">
          <MessageSquareText />
          <strong>Reddit</strong>
          <span>浏览全球热门话题，在真实英语社区中学习</span>
        </Link>
        <Link to="/agent?capability=reading.compose">
          <WandSparkles />
          <strong>AI 阅读</strong>
          <em>智能生成</em>
          <span>按你的词汇和难度生成专属阅读材料</span>
        </Link>
        <Link to="/reading/library">
          <BookOpen />
          <strong>我的文章</strong>
          <span>查看已保存和生成的阅读内容</span>
        </Link>
      </div>
    </div>
  );
}
