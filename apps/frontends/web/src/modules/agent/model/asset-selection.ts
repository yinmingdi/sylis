import {
  AgentResourceKind,
  AssetRevisionStatus,
  AssetStatus,
  type AgentAssetRevisionView,
  type AgentAssetView,
} from '@sylis/api-client/agent';

import { contextItem, type AgentComposerContextItem } from './composer-state';

export function assetContextSelection(
  asset: AgentAssetView,
): AgentComposerContextItem | null {
  if (asset.status !== AssetStatus.READY || !asset.currentRevisionId) {
    return null;
  }
  const revision = asset.revisions.find(
    (candidate) => candidate.id === asset.currentRevisionId,
  );
  if (!revision || revision.status !== AssetRevisionStatus.READY) return null;
  return contextItem(revision.filename, '已扫描文件', {
    kind: AgentResourceKind.CONTENT_ASSET_REVISION,
    id: asset.id,
    revisionId: revision.id,
    contentHash: normalizedContentHash(revision.contentHash),
  });
}

export function currentAssetRevision(
  asset: AgentAssetView,
): AgentAssetRevisionView | null {
  return (
    asset.revisions.find(
      (candidate) => candidate.id === asset.currentRevisionId,
    ) ??
    asset.revisions[0] ??
    null
  );
}

export function assetStatusLabel(status: AssetStatus): string {
  switch (status) {
    case AssetStatus.QUARANTINED:
      return '等待扫描';
    case AssetStatus.PROCESSING:
      return '处理中';
    case AssetStatus.READY:
      return '可使用';
    case AssetStatus.REJECTED:
      return '已拒绝';
    case AssetStatus.HIDDEN:
      return '已隐藏';
    case AssetStatus.DELETED:
      return '已删除';
  }
}

export function assetStatusTone(
  status: AssetStatus,
): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (status === AssetStatus.READY) return 'positive';
  if (status === AssetStatus.REJECTED) return 'danger';
  if (status === AssetStatus.PROCESSING) return 'warning';
  return 'neutral';
}

function normalizedContentHash(value: string): string {
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}
