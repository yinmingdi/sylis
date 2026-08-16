import { FileUp, PageHeader } from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  AgentAssetProcessingStatus,
  AgentAssetUploader,
  agentContextHref,
  agentQueries,
  type AgentComposerContextItem,
} from '../../modules/agent';
import { agentCommands } from '../../modules/agent/api/commands';
import { useCurrentUserId } from '../../modules/identity';
import { RemoteState } from '../page-utils';

export function AgentAssetsPage() {
  const userId = useCurrentUserId();
  const query = useQuery(agentQueries.assets(userId));
  const cache = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: (assetId: string) => agentCommands.assets.remove(assetId),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: agentQueries.assets(userId).queryKey,
      }),
  });
  const useInAgent = (item: AgentComposerContextItem) => {
    navigate(
      agentContextHref({
        label: item.label,
        detail: item.detail,
        ref: item.ref,
      }),
    );
  };
  return (
    <div className="page agent-assets-page">
      <PageHeader eyebrow="Agent" title="文件" />
      <section className="agent-assets-upload-band">
        <FileUp aria-hidden="true" size={22} />
        <AgentAssetUploader
          onUploaded={() =>
            void cache.invalidateQueries({
              queryKey: agentQueries.assets(userId).queryKey,
            })
          }
        />
      </section>
      <RemoteState pending={query.isPending} error={query.error}>
        <AgentAssetProcessingStatus
          assets={query.data ?? []}
          deleting={remove.isPending}
          onSelect={useInAgent}
          onDelete={(assetId) => remove.mutate(assetId)}
        />
      </RemoteState>
      {remove.error ? (
        <p className="form-error">{remove.error.message}</p>
      ) : null}
    </div>
  );
}
