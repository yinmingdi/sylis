import {
  Activity,
  Bookmark,
  Bot,
  Clock,
  Download,
  History,
  KeyRound,
  NotebookPen,
  Settings,
  ShieldCheck,
  User,
} from '@sylis/components';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { sessionQuery, useCurrentUserId } from '../../modules/identity';
import { studyQueries } from '../../modules/study';
import { asRecord } from '../page-values';

export function MePage() {
  const userId = useCurrentUserId();
  const session = useQuery(sessionQuery);
  const statsQuery = useQuery(studyQueries.stats(userId));
  const stats = asRecord(statsQuery.data);
  const attempts = typeof stats.attempts === 'number' ? stats.attempts : 0;
  const reviews = typeof stats.reviews === 'number' ? stats.reviews : 0;
  const due = typeof stats.due === 'number' ? stats.due : 0;
  return (
    <div className="page me-home">
      <div className="mobile-page-heading mobile-page-heading--centered">
        <h1>个人中心</h1>
        <p>管理学习进度和个人设置</p>
      </div>
      <Link className="profile-summary" to="/me/settings">
        <span>
          <User aria-hidden="true" />
        </span>
        <div>
          <strong>Sylis 学习者</strong>
          <small>{session.data?.actor.locale ?? 'zh-CN'}</small>
        </div>
        <span aria-hidden="true">›</span>
      </Link>

      <section
        className="profile-statistics"
        aria-labelledby="profile-statistics-title"
      >
        <h2 id="profile-statistics-title">学习统计</h2>
        <div>
          <article>
            <Activity />
            <strong>{attempts}</strong>
            <span>完成练习</span>
          </article>
          <article>
            <History />
            <strong>{reviews}</strong>
            <span>复习次数</span>
          </article>
          <article>
            <Clock />
            <strong>{due}</strong>
            <span>待复习</span>
          </article>
          <article>
            <Bookmark />
            <strong>{attempts + reviews}</strong>
            <span>学习记录</span>
          </article>
        </div>
      </section>

      <h2 className="quick-links-title">快捷功能</h2>
      <div className="feature-index profile-links">
        <Link to="/me/agent">
          <Bot />
          <strong>Agent 数据</strong>
          <span>记忆与模型用量</span>
        </Link>
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
      </div>
    </div>
  );
}
