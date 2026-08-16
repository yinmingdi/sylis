import {
  AssetPurpose,
  AssetStatus,
  type AgentAssetView,
} from '@sylis/api-client/agent';
import { JobKind, JobStatus } from '@sylis/job-contracts';
import { describe, expect, it, vi } from 'vitest';

import { waitForAssetProcessing } from './asset-processing';

describe('waitForAssetProcessing', () => {
  it('follows each SSE Job in the Asset pipeline until the Asset is ready', async () => {
    const loadAsset = vi
      .fn<(assetId: string) => Promise<AgentAssetView>>()
      .mockResolvedValueOnce(
        processingAsset('extract-job', JobKind.ASSET_EXTRACT),
      )
      .mockResolvedValueOnce(
        processingAsset('index-job', JobKind.ASSET_LEXICAL_INDEX),
      )
      .mockResolvedValueOnce(readyAsset());
    const waitForJob = vi.fn().mockResolvedValue(undefined);

    await waitForAssetProcessing('asset-id', 'scan-job', loadAsset, waitForJob);

    expect(waitForJob.mock.calls).toEqual([
      ['scan-job'],
      ['extract-job'],
      ['index-job'],
    ]);
    expect(loadAsset).toHaveBeenCalledTimes(3);
  });

  it('fails closed when a processing Asset has no new Job to observe', async () => {
    await expect(
      waitForAssetProcessing(
        'asset-id',
        'scan-job',
        vi
          .fn()
          .mockResolvedValue(processingAsset('scan-job', JobKind.ASSET_SCAN)),
        vi.fn().mockResolvedValue(undefined),
      ),
    ).rejects.toThrow('文件处理任务链无进展');
  });
});

function processingAsset(id: string, kind: JobKind): AgentAssetView {
  return {
    ...asset(AssetStatus.PROCESSING),
    processingJobs: [{ id, kind, status: JobStatus.RUNNING }],
  };
}

function readyAsset(): AgentAssetView {
  return asset(AssetStatus.READY);
}

function asset(status: AssetStatus): AgentAssetView {
  return {
    id: 'asset-id',
    purpose: AssetPurpose.AGENT_CONTEXT,
    status,
    currentRevisionId: 'revision-id',
    createdAt: '2026-08-14T00:00:00.000Z',
    revisions: [],
    processingJobs: [],
  };
}
