import { ArrowLeft, Button, IconButton, SquarePen } from '@sylis/components';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  AgentLearningWorkflow,
  grammarAnalysisInstruction,
  useStartAgentWorkflow,
} from '../../modules/agent';

export function AgentGrammarPage() {
  const navigate = useNavigate();
  const start = useStartAgentWorkflow();
  const [text, setText] = useState('');
  const normalized = text.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalized || start.isPending) return;
    start.mutate({
      title: '语法解析',
      workflow: AgentLearningWorkflow.GRAMMAR_ANALYSIS,
      instruction: grammarAnalysisInstruction(normalized),
    });
  };

  return (
    <main className="page agent-task-page">
      <header className="agent-task-page__header">
        <IconButton
          icon={ArrowLeft}
          label="返回 AI 功能"
          onClick={() => navigate('/agent')}
        />
        <div>
          <h1>语法解析</h1>
          <p>分析句子结构、语法规则与修改建议</p>
        </div>
      </header>
      <form className="agent-grammar-form" onSubmit={submit}>
        <label htmlFor="grammar-analysis-source">英文文本</label>
        <textarea
          id="grammar-analysis-source"
          aria-label="英文文本"
          value={text}
          maxLength={10_000}
          autoFocus
          placeholder="输入要分析的英语句子或段落"
          onChange={(event) => setText(event.target.value)}
        />
        <div className="agent-grammar-form__footer">
          <span>{[...text].length} / 10000</span>
          <Button
            type="submit"
            icon={SquarePen}
            disabled={!normalized || start.isPending}
          >
            {start.isPending ? '正在创建' : '开始分析'}
          </Button>
        </div>
        {start.error ? (
          <p className="form-error" role="alert">
            {start.error.message}
          </p>
        ) : null}
      </form>
    </main>
  );
}
