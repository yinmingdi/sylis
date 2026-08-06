import {
  Bookmark,
  Download,
  History,
  KeyRound,
  NotebookPen,
  PageHeader,
  Settings,
  ShieldCheck,
  User,
} from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { sessionQuery } from "../../modules/identity";

export function MePage() {
  const session = useQuery(sessionQuery);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Account"
        title={session.data?.actor.locale ?? "我的"}
      />
      <div className="feature-index">
        <Link to="/me/settings">
          <Settings />
          <strong>账户设置</strong>
          <span>语言与时区</span>
        </Link>
        <Link to="/me/sessions">
          <KeyRound />
          <strong>登录设备</strong>
          <span>会话管理</span>
        </Link>
        <Link to="/me/consents">
          <ShieldCheck />
          <strong>隐私授权</strong>
          <span>处理目的与撤回</span>
        </Link>
        <Link to="/notebooks">
          <NotebookPen />
          <strong>生词本</strong>
          <span>收藏的词汇目标</span>
        </Link>
        <Link to="/reading/library">
          <Bookmark />
          <strong>阅读记录</strong>
          <span>收藏与历史</span>
        </Link>
        <Link to="/study/assessments">
          <History />
          <strong>测评记录</strong>
          <span>历史结果</span>
        </Link>
        <Link to="/me/data">
          <Download />
          <strong>我的数据</strong>
          <span>导出个人数据</span>
        </Link>
        <Link to="/me/settings">
          <User />
          <strong>个人资料</strong>
          <span>{session.data?.actor.timezone ?? ""}</span>
        </Link>
      </div>
    </div>
  );
}
