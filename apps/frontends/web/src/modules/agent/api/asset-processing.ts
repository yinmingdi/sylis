import { AssetStatus, type AgentAssetView } from '@sylis/api-client/agent';

const MAX_PROCESSING_TRANSITIONS = 16;
const MAX_STALE_PROJECTION_POLLS = 25;
const STALE_PROJECTION_POLL_MS = 200;

export async function waitForAssetProcessing(
  assetId: string,
  initialJobId: string,
  loadAsset: (assetId: string) => Promise<AgentAssetView>,
  waitForJob: (jobId: string) => Promise<void>,
  waitForProjection: () => Promise<void> = waitForAssetProjection,
): Promise<void> {
  let jobIds = [initialJobId];
  const observed = new Set<string>();
  let staleProjectionPolls = 0;

  for (let transition = 0; transition < MAX_PROCESSING_TRANSITIONS; ) {
    const nextJobIds = [...new Set(jobIds)].filter(
      (jobId) => !observed.has(jobId),
    );
    if (nextJobIds.length === 0) {
      if (staleProjectionPolls >= MAX_STALE_PROJECTION_POLLS) {
        throw new Error('文件处理任务链无进展');
      }
      staleProjectionPolls += 1;
      await waitForProjection();
    } else {
      staleProjectionPolls = 0;
      nextJobIds.forEach((jobId) => observed.add(jobId));
      await Promise.all(nextJobIds.map((jobId) => waitForJob(jobId)));
      transition += 1;
    }

    const asset = await loadAsset(assetId);
    if (asset.status === AssetStatus.READY) return;
    if (asset.status === AssetStatus.REJECTED) {
      throw new Error('文件未通过安全处理');
    }
    if (asset.status !== AssetStatus.PROCESSING) {
      throw new Error('文件处理状态无效');
    }
    jobIds = asset.processingJobs.map(({ id }) => id);
  }

  throw new Error('文件处理任务链过长');
}

function waitForAssetProjection(): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, STALE_PROJECTION_POLL_MS),
  );
}
