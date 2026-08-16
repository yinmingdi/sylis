import {
  AgentWaitKind,
  AgentWaitStatus,
  type AgentWaitConditionView,
} from '@sylis/api-client/agent';
import { Button, Clock, Send } from '@sylis/components';
import { useState, type FormEvent } from 'react';

export function AgentWaitCondition({
  wait,
  pending,
  onRespond,
}: {
  wait: AgentWaitConditionView;
  pending: boolean;
  onRespond: (response: string) => void;
}) {
  const [response, setResponse] = useState('');
  if (wait.status !== AgentWaitStatus.ACTIVE) return null;
  if (wait.kind !== AgentWaitKind.USER_INPUT) {
    return (
      <div className="agent-wait-condition">
        <Clock aria-hidden="true" size={16} />
        <span>
          {wait.kind === AgentWaitKind.APPROVAL ? '等待批准' : '等待后续步骤'}
        </span>
      </div>
    );
  }
  return (
    <form
      className="agent-wait-response"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (response.trim()) onRespond(response.trim());
      }}
    >
      <label htmlFor={`wait-${wait.id}`}>补充信息</label>
      <input
        id={`wait-${wait.id}`}
        className="sy-input"
        value={response}
        onChange={(event) => setResponse(event.target.value)}
      />
      <Button icon={Send} type="submit" disabled={pending || !response.trim()}>
        提交
      </Button>
    </form>
  );
}
