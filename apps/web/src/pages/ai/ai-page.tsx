import {
  Bot,
  MessageSquareText,
  PageHeader,
  SquarePen,
  WandSparkles,
} from "@sylis/components";
import { Link } from "react-router-dom";

export function AiPage() {
  return (
    <div className="page">
      <PageHeader eyebrow="AI workspace" title="AI" />
      <div className="feature-index">
        <Link to="/ai/tutor">
          <Bot />
          <strong>导师</strong>
          <span>对话与语境问答</span>
        </Link>
        <Link to="/ai/grammar">
          <SquarePen />
          <strong>语法</strong>
          <span>诊断与修改建议</span>
        </Link>
        <Link to="/explore/ai-reading">
          <WandSparkles />
          <strong>AI 阅读</strong>
          <span>按难度生成阅读</span>
        </Link>
        <Link to="/ai/tutor">
          <MessageSquareText />
          <strong>历史会话</strong>
          <span>继续最近的讨论</span>
        </Link>
      </div>
    </div>
  );
}
