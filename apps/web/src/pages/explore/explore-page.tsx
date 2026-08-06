import {
  BookOpen,
  MessageSquareText,
  PageHeader,
  Search,
  WandSparkles,
} from "@sylis/components";
import { Link } from "react-router-dom";

export function ExplorePage() {
  return (
    <div className="page">
      <PageHeader eyebrow="Explore" title="探索" />
      <div className="feature-index">
        <Link to="/lexicon/search">
          <Search />
          <strong>词典</strong>
          <span>词条、义项与搭配</span>
        </Link>
        <Link to="/explore/reddit">
          <MessageSquareText />
          <strong>Reddit</strong>
          <span>社区语境阅读</span>
        </Link>
        <Link to="/explore/ai-reading">
          <WandSparkles />
          <strong>AI 阅读</strong>
          <span>生成阅读材料</span>
        </Link>
        <Link to="/reading/saved">
          <BookOpen />
          <strong>收藏</strong>
          <span>已保存的阅读</span>
        </Link>
      </div>
    </div>
  );
}
