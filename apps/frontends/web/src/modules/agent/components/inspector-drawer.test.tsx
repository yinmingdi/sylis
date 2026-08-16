import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AgentInspector } from './inspector';
import { AgentInspectionKind, type AgentInspection } from '../model/inspection';

vi.mock('./artifact-inspector', () => ({
  AgentArtifactInspector: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      关闭成果
    </button>
  ),
}));

vi.mock('./proposal-review', () => ({
  AgentProposalReview: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      关闭批准
    </button>
  ),
}));

function InspectorHarness() {
  const [inspection, setInspection] = useState<AgentInspection | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setInspection({
            kind: AgentInspectionKind.ARTIFACT,
            id: 'artifact-1',
          })
        }
      >
        打开成果
      </button>
      <AgentInspector
        inspection={inspection}
        onClose={() => setInspection(null)}
      />
    </>
  );
}

function AutoOpenInspectorHarness() {
  const [inspection, setInspection] = useState<AgentInspection | null>({
    kind: AgentInspectionKind.PROPOSAL,
    id: 'proposal-1',
  });
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setInspection({
            kind: AgentInspectionKind.PROPOSAL,
            id: 'proposal-1',
          })
        }
      >
        查看批准
      </button>
      <AgentInspector
        inspection={inspection}
        onClose={() => setInspection(null)}
      />
    </>
  );
}

describe('AgentInspector', () => {
  it('AGENT-LEARNER-003 is an overlay closed by its backdrop', async () => {
    const user = userEvent.setup();
    render(<InspectorHarness />);

    expect(screen.queryByRole('dialog', { name: '成果检查器' })).toBeNull();
    const opener = screen.getByRole('button', { name: '打开成果' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: '成果检查器' });
    expect(dialog).toBeVisible();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    await user.click(
      screen.getByRole('button', { name: '点击遮罩关闭成果检查器' }),
    );
    expect(screen.queryByRole('dialog', { name: '成果检查器' })).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('restores focus after an auto-opened inspection is closed and reopened', async () => {
    const user = userEvent.setup();
    render(<AutoOpenInspectorHarness />);

    const dialog = screen.getByRole('dialog', { name: '成果检查器' });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: '关闭批准' }));

    const opener = screen.getByRole('button', { name: '查看批准' });
    await user.click(opener);
    expect(dialog).toBeVisible();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '成果检查器' })).toBeNull();
    expect(opener).toHaveFocus();
  });
});
