import { IconButton, Paperclip, X } from '@sylis/components';

import type { AgentComposerContextItem } from '../model/composer-state';

export function AgentContextSelection({
  items,
  onRemove,
}: {
  items: readonly AgentComposerContextItem[];
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="agent-context-selection" aria-label="本次上下文">
      {items.map((item) => (
        <div key={item.key} className="agent-context-chip">
          <Paperclip aria-hidden="true" size={14} />
          <span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
          <IconButton
            icon={X}
            label={`移除 ${item.label}`}
            onClick={() => onRemove(item.key)}
          />
        </div>
      ))}
    </div>
  );
}
