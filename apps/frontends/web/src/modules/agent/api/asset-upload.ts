import {
  agentClient,
  AssetMimeType,
  AssetPurpose,
} from '@sylis/api-client/agent';

import { waitForAssetProcessing } from './asset-processing';
import { subscribeToJob } from '../../jobs/client';

export enum AgentAssetUploadStage {
  HASHING = 'HASHING',
  UPLOADING = 'UPLOADING',
  FINALIZING = 'FINALIZING',
}

export interface AgentAssetUploadProgress {
  stage: AgentAssetUploadStage;
  processed: number;
  total: number;
}

export async function uploadAgentAsset(
  file: File,
  onProgress: (progress: AgentAssetUploadProgress) => void,
): Promise<{ assetId: string; revisionId: string }> {
  const mimeType = supportedMimeType(file);
  onProgress({
    stage: AgentAssetUploadStage.HASHING,
    processed: 0,
    total: file.size,
  });
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const contentHash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  onProgress({
    stage: AgentAssetUploadStage.HASHING,
    processed: file.size,
    total: file.size,
  });
  const intent = await agentClient.assets.createUploadIntent({
    filename: file.name,
    byteSize: file.size,
    contentHash,
    mimeType,
    purpose: AssetPurpose.AGENT_CONTEXT,
  });
  onProgress({
    stage: AgentAssetUploadStage.UPLOADING,
    processed: 0,
    total: file.size,
  });
  const upload = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: intent.requiredHeaders,
    body: bytes,
    credentials: 'omit',
  });
  if (!upload.ok) throw new Error(`文件上传失败（${upload.status}）`);
  onProgress({
    stage: AgentAssetUploadStage.UPLOADING,
    processed: file.size,
    total: file.size,
  });
  onProgress({
    stage: AgentAssetUploadStage.FINALIZING,
    processed: file.size,
    total: file.size,
  });
  const finalized = await agentClient.assets.finalize(
    intent.assetId,
    intent.intentId,
  );
  await waitForAssetProcessing(
    finalized.assetId,
    finalized.jobId,
    (assetId) => agentClient.assets.get(assetId),
    waitForAssetJob,
  );
  return { assetId: finalized.assetId, revisionId: finalized.revisionId };
}

function waitForAssetJob(jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('文件安全处理超时')),
      5 * 60_000,
    );
    unsubscribe = subscribeToJob(jobId, (event) => {
      let status: string | undefined;
      try {
        status = (JSON.parse(event.data) as { status?: string }).status;
      } catch {
        return;
      }
      if (event.type === 'job.completed' || status === 'SUCCEEDED') finish();
      else if (
        event.type === 'job.failed' ||
        event.type === 'job.cancelled' ||
        status === 'FAILED' ||
        status === 'CANCELLED'
      ) {
        finish(new Error('文件安全处理失败'));
      }
    });
    if (settled) unsubscribe();
  });
}

function supportedMimeType(file: File): AssetMimeType {
  const declared = file.type.toLocaleLowerCase();
  if (Object.values(AssetMimeType).includes(declared as AssetMimeType)) {
    return declared as AssetMimeType;
  }
  const extension = file.name.split('.').pop()?.toLocaleLowerCase();
  const byExtension: Readonly<Record<string, AssetMimeType>> = {
    txt: AssetMimeType.TEXT_PLAIN,
    md: AssetMimeType.TEXT_MARKDOWN,
    markdown: AssetMimeType.TEXT_MARKDOWN,
    json: AssetMimeType.APPLICATION_JSON,
    pdf: AssetMimeType.PDF,
    docx: AssetMimeType.DOCX,
    epub: AssetMimeType.EPUB,
    png: AssetMimeType.PNG,
    jpg: AssetMimeType.JPEG,
    jpeg: AssetMimeType.JPEG,
    webp: AssetMimeType.WEBP,
  };
  if (extension && byExtension[extension]) return byExtension[extension];
  throw new Error('不支持该文件类型');
}
