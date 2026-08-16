import { Bot } from '@sylis/components';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { AgentArtifactInspector } from './artifact-inspector';
import { AgentProposalReview } from './proposal-review';
import type { AgentComposerContextItem } from '../model/composer-state';
import { AgentInspectionKind, type AgentInspection } from '../model/inspection';

export function AgentInspector({
  inspection,
  onClose,
  onUseArtifact,
}: {
  inspection: AgentInspection | null;
  onClose: () => void;
  onUseArtifact?: (item: AgentComposerContextItem) => void;
}) {
  const open = Boolean(inspection);
  const containerRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useLayoutEffect(() => {
    let focusFrame: number | undefined;
    if (open && !wasOpenRef.current) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        !containerRef.current?.contains(activeElement)
      ) {
        restoreFocusRef.current = activeElement;
      }
      const firstAction = containerRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      focusFrame = requestAnimationFrame(() => {
        (firstAction ?? containerRef.current)?.focus();
      });
    } else if (!open && wasOpenRef.current) {
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    }
    wasOpenRef.current = open;
    return () => {
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  return (
    <>
      <button
        type="button"
        className="agent-inspector-backdrop"
        data-open={open}
        aria-label="点击遮罩关闭成果检查器"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        ref={containerRef}
        className="agent-inspector"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="成果检查器"
        aria-hidden={!open}
        inert={!open}
        tabIndex={open ? -1 : undefined}
      >
        {inspection?.kind === AgentInspectionKind.ARTIFACT ? (
          <AgentArtifactInspector
            artifactId={inspection.id}
            onClose={onClose}
            onUseContext={onUseArtifact}
          />
        ) : inspection?.kind === AgentInspectionKind.PROPOSAL ? (
          <AgentProposalReview proposalId={inspection.id} onClose={onClose} />
        ) : (
          <div className="agent-inspector__empty">
            <Bot aria-hidden="true" size={22} />
            <strong>成果与批准</strong>
          </div>
        )}
      </aside>
    </>
  );
}
