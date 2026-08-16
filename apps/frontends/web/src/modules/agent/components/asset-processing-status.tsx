import { AssetStatus, type AgentAssetView } from '@sylis/api-client/agent';
import { Button, FileText, StatusBadge, Trash2 } from '@sylis/components';

import {
  assetContextSelection,
  assetStatusLabel,
  assetStatusTone,
  currentAssetRevision,
} from '../model/asset-selection';
import type { AgentComposerContextItem } from '../model/composer-state';

export function AgentAssetProcessingStatus({
  assets,
  compact = false,
  deleting,
  onSelect,
  onDelete,
}: {
  assets: readonly AgentAssetView[];
  compact?: boolean;
  deleting?: boolean;
  onSelect?: (item: AgentComposerContextItem) => void;
  onDelete?: (assetId: string) => void;
}) {
  if (assets.length === 0) return null;
  return (
    <div className="agent-assets" data-compact={compact}>
      {assets.map((asset) => {
        const revision = currentAssetRevision(asset);
        const selection = assetContextSelection(asset);
        return (
          <div className="agent-asset" key={asset.id}>
            <FileText aria-hidden="true" size={17} />
            <div>
              <strong>{revision?.filename ?? '等待上传'}</strong>
              <small>
                {revision ? formatBytes(revision.byteSize) : asset.purpose}
              </small>
            </div>
            <StatusBadge tone={assetStatusTone(asset.status)}>
              {assetStatusLabel(asset.status)}
            </StatusBadge>
            {selection && onSelect ? (
              <Button
                type="button"
                tone="quiet"
                onClick={() => onSelect(selection)}
              >
                加入
              </Button>
            ) : null}
            {onDelete && asset.status !== AssetStatus.DELETED ? (
              <Button
                icon={Trash2}
                type="button"
                tone="quiet"
                disabled={deleting}
                onClick={() => onDelete(asset.id)}
              >
                删除
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
