import { AssetStatus, type AgentAssetView } from '@sylis/api-client/agent';

const MAX_PROCESSING_TRANSITIONS = 16;

export async function waitForAssetProcessing(
  assetId: string,
  initialJobId: string,
  loadAsset: (assetId: string) => Promise<AgentAssetView>,
  waitForJob: (jobId: string) => Promise<void>,
): Promise<void> {
  let jobIds = [initialJobId];
  const observed = new Set<string>();

  for (
    let transition = 0;
    transition < MAX_PROCESSING_TRANSITIONS;
    transition += 1
  ) {
    const nextJobIds = [...new Set(jobIds)].filter(
      (jobId) => !observed.has(jobId),
    );
    if (nextJobIds.length === 0) {
      throw new Error('文件处理任务链无进展');
    }
    nextJobIds.forEach((jobId) => observed.add(jobId));
    await Promise.all(nextJobIds.map((jobId) => waitForJob(jobId)));

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
